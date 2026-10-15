import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CUESTIONARIO_V1 } from './ov1.catalog';
import { evaluar, OV1_RULES_VERSION, Respuesta, RespuestaOV } from './ov1.rules';

const detalle = { respuestas: { orderBy: { preguntaId: 'asc' as const } } };
type Intento = Prisma.IntentoVocacionalGetPayload<{ include: typeof detalle }>;

@Injectable()
export class OrientacionVocacionalService {
  constructor(private readonly prisma: PrismaService) {}

  // All operations serialize on the owner first, including start/delete/finalize.
  // The partial unique index is a second barrier, independent of this service.
  private operar<T>(usuarioId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.$transaction(async tx => {
      const usuarios = await tx.$queryRaw<{ rol: string | null }[]>`
        SELECT "rol" FROM "Usuario" WHERE id = ${usuarioId}::uuid FOR UPDATE`;
      if (usuarios[0]?.rol !== 'ESTUDIANTE') throw new ForbiddenException('Solo estudiantes.');
      return fn(tx);
    });
  }

  private async propio(tx: Prisma.TransactionClient, usuarioId: string, id: string) {
    await tx.$queryRaw`SELECT id FROM "IntentoVocacional" WHERE id = ${id}::uuid AND "usuarioId" = ${usuarioId}::uuid FOR UPDATE`;
    const intento = await tx.intentoVocacional.findFirst({ where: { id, usuarioId }, include: detalle });
    if (!intento) throw new NotFoundException('Intento no encontrado.');
    return intento;
  }

  private presentar(intento: Intento) {
    const respuestas = intento.respuestas.map(r => ({ preguntaId: r.preguntaId,
      valor: (r.valor === 'NO_SE' ? r.valor : Number(r.valor)) as RespuestaOV }));
    // Historical results are read from their stored snapshot, never recalculated.
    return { id: intento.id, rulesVersion: intento.rulesVersion, estado: intento.estado,
      iniciadoEn: intento.iniciadoEn, actualizadoEn: intento.actualizadoEn,
      completadoEn: intento.completadoEn, respuestas, resultado: intento.resultado };
  }

  cuestionario(usuarioId: string) {
    return this.operar(usuarioId, async () => ({ rulesVersion: OV1_RULES_VERSION,
      naturaleza: 'INTERESES_DECLARADOS', preguntas: CUESTIONARIO_V1,
      escala: [0, 1, 2, 3, 4, 'NO_SE'], contenidoPendienteRevision: true }));
  }

  actual(usuarioId: string) {
    return this.operar(usuarioId, async tx => {
      const intento = await tx.intentoVocacional.findFirst({ where: { usuarioId, estado: 'EN_PROGRESO' }, include: detalle });
      return { intento: intento ? this.presentar(intento) : null };
    });
  }

  iniciar(usuarioId: string) {
    return this.operar(usuarioId, async tx => {
      const existente = await tx.intentoVocacional.findFirst({ where: { usuarioId, estado: 'EN_PROGRESO' }, include: detalle });
      return this.presentar(existente ?? await tx.intentoVocacional.create({
        data: { usuarioId, rulesVersion: OV1_RULES_VERSION }, include: detalle }));
    });
  }

  obtener(usuarioId: string, id: string) {
    return this.operar(usuarioId, async tx => this.presentar(await this.propio(tx, usuarioId, id)));
  }

  historial(usuarioId: string, pagina = 1) {
    return this.operar(usuarioId, async tx => ({ pagina, porPagina: 20,
      total: await tx.intentoVocacional.count({ where: { usuarioId } }),
      intentos: (await tx.intentoVocacional.findMany({ where: { usuarioId },
        orderBy: [{ iniciadoEn: 'desc' }, { id: 'desc' }], skip: (pagina - 1) * 20, take: 20,
        include: detalle })).map(i => this.presentar(i)) }));
  }

  guardar(usuarioId: string, id: string, respuestas: Respuesta[]) {
    return this.operar(usuarioId, async tx => {
      const intento = await this.propio(tx, usuarioId, id);
      if (intento.estado !== 'EN_PROGRESO') throw new ConflictException('Intento completado e inmutable.');
      if (intento.rulesVersion !== OV1_RULES_VERSION) throw new ConflictException('Versión no soportada para edición.');
      try { evaluar(respuestas); } catch { throw new BadRequestException('Respuestas inválidas.'); }
      if (!respuestas.length || respuestas.length > 30) throw new BadRequestException('Respuestas inválidas.');
      for (const r of respuestas) await tx.respuestaVocacional.upsert({
        where: { intentoId_preguntaId: { intentoId: id, preguntaId: r.preguntaId } },
        create: { intentoId: id, preguntaId: r.preguntaId, valor: String(r.valor) },
        update: { valor: String(r.valor) } });
      await tx.$executeRaw`UPDATE "IntentoVocacional" SET "actualizadoEn" = clock_timestamp() WHERE id = ${id}::uuid`;
      return this.presentar(await this.propio(tx, usuarioId, id));
    });
  }

  finalizar(usuarioId: string, id: string) {
    return this.operar(usuarioId, async tx => {
      const intento = await this.propio(tx, usuarioId, id);
      if (intento.estado === 'COMPLETADO') return this.presentar(intento);
      if (intento.rulesVersion !== OV1_RULES_VERSION) throw new ConflictException('Versión no soportada para finalizar.');
      const respuestas = this.presentar(intento).respuestas;
      const evaluacion = evaluar(respuestas);
      if (!evaluacion.finalizable) throw new ConflictException({ codigo: 'COBERTURA_INSUFICIENTE',
        cantidadValidas: evaluacion.cantidadValidas, minimoTotal: 24, minimoPorFamilia: 3,
        familias: evaluacion.familias.map(f => ({ familia: f.familia, cantidadValidas: f.cantidadValidas, totalPreguntas: 5 })) });
      const [{ ahora }] = await tx.$queryRaw<{ ahora: Date }[]>`SELECT clock_timestamp()::timestamptz(3) AS ahora`;
      const resultado = { ...evaluacion, completadoEn: ahora.toISOString(),
        naturaleza: 'INTERESES_DECLARADOS', preguntas: CUESTIONARIO_V1, respuestas };
      return this.presentar(await tx.intentoVocacional.update({ where: { id }, data: {
        estado: 'COMPLETADO', completadoEn: ahora, actualizadoEn: ahora,
        resultado: resultado as unknown as Prisma.InputJsonValue }, include: detalle }));
    });
  }

  eliminar(usuarioId: string, id: string) {
    return this.operar(usuarioId, async tx => {
      await this.propio(tx, usuarioId, id);
      await tx.intentoVocacional.delete({ where: { id } });
    });
  }
}
