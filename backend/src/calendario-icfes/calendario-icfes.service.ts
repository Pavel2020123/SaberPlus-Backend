import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarioTipo } from '@prisma/client';

@Injectable()
export class CalendarioIcfesService {
  constructor(private prisma: PrismaService) {}

  // ─── ADMIN: CRUD DE FECHAS OFICIALES ───────────────────────
  async crear(anio: number, calendario: CalendarioTipo, fechaExamen: Date) {
    const yaExiste = await this.prisma.calendarioIcfes.findUnique({
      where: { anio_calendario: { anio, calendario } },
    });
    if (yaExiste) {
      throw new BadRequestException(
        `Ya existe una fecha para el Calendario ${calendario} del año ${anio}. Edítala en vez de crear otra.`,
      );
    }

    const calendarioActivo = await this.prisma.calendarioIcfes.findFirst({
      where: { activo: true },
      select: { id: true },
    });

    return this.prisma.calendarioIcfes.create({
      data: { anio, calendario, fechaExamen, activo: !calendarioActivo },
    });
  }

  async listar() {
    return this.prisma.calendarioIcfes.findMany({
      orderBy: [
        { activo: 'desc' },
        { fechaExamen: 'desc' },
        { calendario: 'asc' },
      ],
    });
  }

  async actualizar(id: string, fechaExamen: Date) {
    const registro = await this.prisma.calendarioIcfes.findUnique({
      where: { id },
    });
    if (!registro)
      throw new NotFoundException('Fecha de calendario no encontrada.');
    if (
      registro.activo &&
      this.calcularFinDelExamen(fechaExamen).getTime() < Date.now()
    ) {
      throw new BadRequestException(
        'La convocatoria activa no puede tener una fecha vencida.',
      );
    }

    return this.prisma.calendarioIcfes.update({
      where: { id },
      data: { fechaExamen },
    });
  }

  async eliminar(id: string) {
    const registro = await this.prisma.calendarioIcfes.findUnique({
      where: { id },
    });
    if (!registro)
      throw new NotFoundException('Fecha de calendario no encontrada.');
    if (registro.activo) {
      throw new BadRequestException(
        'Activa otra convocatoria antes de eliminar la actual.',
      );
    }

    return this.prisma.calendarioIcfes.delete({ where: { id } });
  }

  async activar(id: string) {
    const registro = await this.prisma.calendarioIcfes.findUnique({
      where: { id },
    });
    if (!registro) {
      throw new NotFoundException('Fecha de calendario no encontrada.');
    }
    if (
      this.calcularFinDelExamen(registro.fechaExamen).getTime() < Date.now()
    ) {
      throw new BadRequestException(
        'No puedes activar una convocatoria cuya fecha ya pasó.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.calendarioIcfes.updateMany({
        where: { activo: true },
        data: { activo: false },
      });
      return tx.calendarioIcfes.update({
        where: { id },
        data: { activo: true },
      });
    });
  }

  obtenerCalendarioActivo() {
    return this.prisma.calendarioIcfes.findFirst({
      where: { activo: true },
    });
  }

  // ─── USO GENERAL: PRÓXIMA FECHA DE EXAMEN ──────────────────
  // Devuelve la próxima fecha de presentación (hoy o futura) para el
  // calendario dado. La usan: el countdown (punto 26/81) y el cálculo
  // de vigencia de planes (puntos 9, 12, 13).
  async obtenerProximaFecha(calendario: CalendarioTipo) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const proxima = await this.prisma.calendarioIcfes.findFirst({
      where: { calendario, fechaExamen: { gte: hoy } },
      orderBy: { fechaExamen: 'asc' },
    });

    return proxima;
  }

  // ─── CÁLCULO DE VIGENCIA DEL PLAN ──────────────────────────
  // Fecha en la que debe vencer un acceso individual o institucional:
  // al terminar el día del examen oficial.
  // Si no hay fecha oficial cargada todavía, devuelve null: quien
  // llama decide qué hacer (ej. no bloquear, o avisar al admin).
  async calcularVigencia(calendario: CalendarioTipo): Promise<Date | null> {
    const proximaFecha = await this.obtenerProximaFecha(calendario);
    if (!proximaFecha) return null;

    return this.calcularFinDelExamen(proximaFecha.fechaExamen);
  }

  calcularFinDelExamen(fechaExamen: Date): Date {
    const vigencia = new Date(fechaExamen);
    vigencia.setHours(23, 59, 59, 999);
    return vigencia;
  }
}
