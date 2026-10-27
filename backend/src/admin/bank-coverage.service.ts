import { Injectable } from '@nestjs/common';
import { AreaIcfes, Dificultad, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Counts = {
  subtemaId: string;
  total: number;
  publicadas: number;
  sinExplicacion: number;
  BASICO: number;
  MEDIO: number;
  AVANZADO: number;
};

@Injectable()
export class BankCoverageService {
  constructor(private readonly prisma: PrismaService) {}
  async page(
    area: AreaIcfes,
    pagina: number,
    limite: number,
    withReports = false,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const where = { tema: { area } };
        const totalSubtemas = await tx.subtema.count({ where });
        const rows = await tx.subtema.findMany({
          where,
          skip: (pagina - 1) * limite,
          take: limite,
          orderBy: [
            { tema: { nombre: 'asc' } },
            { nombre: 'asc' },
            { id: 'asc' },
          ],
          select: {
            id: true,
            nombre: true,
            estadoContenido: true,
            tema: { select: { id: true, nombre: true, estadoContenido: true } },
          },
        });
        // Match preguntaPublicadaWhere: question, parents and optional case must
        // all be published. Aggregate only the selected page, never download bank text.
        const counts = rows.length
          ? await tx.$queryRaw<Counts[]>(Prisma.sql`
        WITH scoped AS (
          SELECT p."subtemaId", p."dificultad", p."explicacion",
            (p."estadoContenido" = 'PUBLICADO' AND s."estadoContenido" = 'PUBLICADO'
              AND t."estadoContenido" = 'PUBLICADO'
              AND (p."casoId" IS NULL OR c."estadoContenido" = 'PUBLICADO')) AS visible
          FROM "Pregunta" p JOIN "Subtema" s ON s.id = p."subtemaId"
          JOIN "Tema" t ON t.id = s."temaId"
          LEFT JOIN "CasoPregunta" c ON c.id = p."casoId"
          WHERE p."subtemaId" IN (${Prisma.join(rows.map((r) => r.id))})
        )
        SELECT "subtemaId", count(*)::int AS total,
          count(*) FILTER (WHERE visible)::int AS publicadas,
          count(*) FILTER (WHERE visible AND (explicacion IS NULL OR explicacion !~ '[^[:space:]]'))::int AS "sinExplicacion",
          count(*) FILTER (WHERE visible AND dificultad = 'BASICO')::int AS "BASICO",
          count(*) FILTER (WHERE visible AND dificultad = 'MEDIO')::int AS "MEDIO",
          count(*) FILTER (WHERE visible AND dificultad = 'AVANZADO')::int AS "AVANZADO"
        FROM scoped GROUP BY "subtemaId"
      `)
          : [];
        const byId = new Map(counts.map((r) => [r.subtemaId, r]));
        const reportCounts =
          withReports && rows.length
            ? await tx.reportePregunta.groupBy({
                by: ['subtemaIdCapturado', 'preguntaId'],
                where: {
                  subtemaIdCapturado: { in: rows.map((r) => r.id) },
                  estado: { in: ['PENDIENTE', 'EN_REVISION'] },
                },
                _count: { _all: true },
              })
            : [];
        const reportsBySubtopic = new Map<
          string,
          { reportes: number; preguntasConReportes: number }
        >();
        for (const group of reportCounts) {
          const value = reportsBySubtopic.get(group.subtemaIdCapturado) ?? {
            reportes: 0,
            preguntasConReportes: 0,
          };
          value.reportes += group._count._all;
          value.preguntasConReportes++;
          reportsBySubtopic.set(group.subtemaIdCapturado, value);
        }
        return {
          area,
          pagina,
          limite,
          totalSubtemas,
          hayMas: pagina * limite < totalSubtemas,
          reportesDisponibles: withReports,
          ...(withReports ? { reportesVersion: 1 } : {}),
          items: rows.map((row) => {
            const c = byId.get(row.id);
            const dificultades = {
              BASICO: c?.BASICO ?? 0,
              MEDIO: c?.MEDIO ?? 0,
              AVANZADO: c?.AVANZADO ?? 0,
            };
            return {
              ...row,
              total: c?.total ?? 0,
              publicadas: c?.publicadas ?? 0,
              noDisponibles: (c?.total ?? 0) - (c?.publicadas ?? 0),
              sinExplicacion: c?.sinExplicacion ?? 0,
              dificultades,
              dificultadesFaltantes: Object.values(Dificultad).filter(
                (d) => dificultades[d] === 0,
              ),
              reportes: withReports
                ? (reportsBySubtopic.get(row.id)?.reportes ?? 0)
                : null,
              ...(withReports
                ? {
                    preguntasConReportes:
                      reportsBySubtopic.get(row.id)?.preguntasConReportes ?? 0,
                  }
                : {}),
            };
          }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
