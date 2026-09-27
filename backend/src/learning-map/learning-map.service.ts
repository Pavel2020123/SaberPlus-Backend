import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AreaIcfes, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReplaceLearningBasesDto } from './learning-map.dto';
import {
  ancestorOrder,
  MAX_MAP_EDGES,
  orderedNodes,
} from './learning-map.graph';

const nodeSelect = {
  id: true,
  nombre: true,
  estadoContenido: true,
  tema: {
    select: { id: true, nombre: true, area: true, estadoContenido: true },
  },
} satisfies Prisma.SubtemaSelect;
type Node = Prisma.SubtemaGetPayload<{ select: typeof nodeSelect }>;
const published = (node: Node) =>
  node.estadoContenido === 'PUBLICADO' &&
  node.tema.estadoContenido === 'PUBLICADO';
const publicNode = (node: Node) => ({
  id: node.id,
  nombre: node.nombre,
  temaId: node.tema.id,
  tema: node.tema.nombre,
});

@Injectable()
export class LearningMapService {
  constructor(private readonly prisma: PrismaService) {}

  read(id: string, admin: boolean) {
    return this.prisma.$transaction((tx) => this.snapshot(tx, id, admin), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }

  private async edges(tx: Prisma.TransactionClient, area: AreaIcfes) {
    const edges = await tx.relacionAprendizaje.findMany({
      where: { area },
      take: MAX_MAP_EDGES + 1,
      orderBy: [{ previoId: 'asc' }, { destinoId: 'asc' }],
      select: { previoId: true, destinoId: true },
    });
    // Never return a truncated graph as though it were complete.
    orderedNodes(edges);
    return edges;
  }

  private async snapshot(
    tx: Prisma.TransactionClient,
    id: string,
    admin: boolean,
  ) {
    const target = await tx.subtema.findUnique({
      where: { id },
      select: nodeSelect,
    });
    if (!target || (!admin && !published(target))) {
      throw new NotFoundException('Subtema no disponible.');
    }
    const area = target.tema.area;
    const state = await tx.mapaAprendizaje.findUnique({
      where: { area },
      select: { revision: true },
    });
    const all = await this.edges(tx, area);
    const ids = [
      ...new Set(all.flatMap((edge) => [edge.previoId, edge.destinoId])),
    ];
    const nodes = ids.length
      ? await tx.subtema.findMany({
          where: { id: { in: ids }, tema: { area } },
          select: nodeSelect,
        })
      : [];
    const byId = new Map(
      nodes
        .filter((node) => admin || published(node))
        .map((node) => [node.id, node]),
    );
    // Hidden intermediate nodes break the path; do not invent shortcut edges.
    const visible = all.filter(
      (edge) => byId.has(edge.previoId) && byId.has(edge.destinoId),
    );
    const project = (nodeId: string) => {
      const node = byId.get(nodeId);
      return admin
        ? {
            ...publicNode(node),
            estado: node.estadoContenido,
            estadoTema: node.tema.estadoContenido,
            disponible: published(node),
          }
        : publicNode(node);
    };
    return {
      versionContrato: 1,
      area,
      revision: state?.revision ?? 0,
      orientativo: true,
      subtema: publicNode(target),
      previos: visible
        .filter((edge) => edge.destinoId === id)
        .map((edge) => project(edge.previoId)),
      recorrido: ancestorOrder(id, visible).map(project),
    };
  }

  async replace(id: string, input: ReplaceLearningBasesDto, actorId: string) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const initial = await tx.subtema.findUnique({
            where: { id },
            select: { tema: { select: { area: true } } },
          });
          if (!initial) throw new NotFoundException('Subtema no disponible.');
          const area = initial.tema.area;
          // Serialize every editor of one area, including opposite-edge requests.
          await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`saberplus-learning-map:${area}`}))`;
          const state = await tx.mapaAprendizaje.upsert({
            where: { area },
            create: { area },
            update: {},
          });
          if (state.revision !== input.revision) {
            throw new ConflictException(
              'El mapa cambió. Recarga antes de guardar.',
            );
          }
          const ids = [...new Set([id, ...input.previos])].sort();
          // Keep publication/area and existence stable through this transaction.
          await tx.$queryRaw(Prisma.sql`SELECT s.id FROM "Subtema" s JOIN "Tema" t ON t.id = s."temaId"
          WHERE s.id IN (${Prisma.join(ids)}) ORDER BY s.id FOR SHARE OF s,t`);
          const nodes = await tx.subtema.findMany({
            where: { id: { in: ids } },
            select: nodeSelect,
          });
          if (
            nodes.length !== ids.length ||
            nodes.some((node) => node.tema.area !== area)
          ) {
            throw new BadRequestException(
              'Las bases deben existir y pertenecer a la misma área.',
            );
          }
          // An archived target may be cleared, but cannot receive new bases.
          if (input.previos.length && nodes.some((node) => !published(node))) {
            throw new BadRequestException(
              'Publica el tema y los subtemas antes de relacionarlos.',
            );
          }
          const oldEdges = await this.edges(tx, area);
          const newEdges = input.previos.map((previoId) => ({
            previoId,
            destinoId: id,
          }));
          orderedNodes([
            ...oldEdges.filter((edge) => edge.destinoId !== id),
            ...newEdges,
          ]);
          const oldIds = oldEdges
            .filter((edge) => edge.destinoId === id)
            .map((edge) => edge.previoId)
            .sort();
          if (
            JSON.stringify(oldIds) !== JSON.stringify([...input.previos].sort())
          ) {
            await tx.relacionAprendizaje.deleteMany({
              where: { area, destinoId: id },
            });
            if (newEdges.length)
              await tx.relacionAprendizaje.createMany({
                data: newEdges.map((edge) => ({ ...edge, area })),
              });
            await tx.mapaAprendizaje.update({
              where: { area },
              data: { revision: { increment: 1 }, actualizadoPor: actorId },
            });
          }
          return this.snapshot(tx, id, true);
        },
        {
          timeout: 10000,
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2034', 'P2003', 'P2025'].includes(error.code)
      ) {
        throw new ConflictException(
          'El catálogo cambió. Recarga antes de guardar.',
        );
      }
      throw error;
    }
  }
}
