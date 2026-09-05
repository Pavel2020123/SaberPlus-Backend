import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AudienciaAnuncio,
  Prisma,
  RolUsuario,
  TipoAnuncio,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface DatosAnuncio {
  titulo: string;
  contenido: string;
  tipo: TipoAnuncio;
  audiencia: AudienciaAnuncio;
  fechaInicio: string;
  fechaFin?: string | null;
  activo: boolean;
  destacado: boolean;
}

export type ActualizarAnuncio = Partial<DatosAnuncio>;

@Injectable()
export class AnunciosService {
  constructor(private readonly prisma: PrismaService) {}

  async listarParaUsuario(
    usuarioId: string,
    rol: RolUsuario,
    institucionId?: string,
  ) {
    const anuncios = await this.prisma.anuncio.findMany({
      where: this.filtroVigentes(rol, institucionId),
      select: {
        id: true,
        titulo: true,
        contenido: true,
        tipo: true,
        audiencia: true,
        fechaInicio: true,
        fechaFin: true,
        destacado: true,
        institucionId: true,
        lecturas: {
          where: { usuarioId },
          select: { fechaLectura: true },
        },
      },
      orderBy: [{ destacado: 'desc' }, { fechaInicio: 'desc' }],
    });

    const items = anuncios.map(({ lecturas, institucionId, ...anuncio }) => ({
      ...anuncio,
      origen: institucionId ? 'INSTITUCION' : 'SABERPLUS',
      leido: lecturas.length > 0,
      fechaLectura: lecturas[0]?.fechaLectura ?? null,
    }));

    return {
      anuncios: items,
      pendientes: items.filter((anuncio) => !anuncio.leido).length,
    };
  }

  async marcarLeido(
    anuncioId: string,
    usuarioId: string,
    rol: RolUsuario,
    institucionId?: string,
  ) {
    const anuncio = await this.prisma.anuncio.findFirst({
      where: { id: anuncioId, ...this.filtroVigentes(rol, institucionId) },
      select: { id: true },
    });
    if (!anuncio) {
      throw new NotFoundException('El anuncio ya no está disponible.');
    }

    const lectura = await this.prisma.anuncioLectura.upsert({
      where: { anuncioId_usuarioId: { anuncioId, usuarioId } },
      create: { anuncioId, usuarioId },
      update: { fechaLectura: new Date() },
    });

    return { leido: true, fechaLectura: lectura.fechaLectura };
  }

  async marcarTodosLeidos(
    usuarioId: string,
    rol: RolUsuario,
    institucionId?: string,
  ) {
    const anuncios = await this.prisma.anuncio.findMany({
      where: this.filtroVigentes(rol, institucionId),
      select: { id: true },
    });
    await this.prisma.anuncioLectura.createMany({
      data: anuncios.map((anuncio) => ({ anuncioId: anuncio.id, usuarioId })),
      skipDuplicates: true,
    });

    return { marcados: anuncios.length };
  }

  listarAdmin() {
    return this.prisma.anuncio.findMany({
      where: { institucionId: null },
      include: { _count: { select: { lecturas: true } } },
      orderBy: [{ fechaCreacion: 'desc' }],
    });
  }

  crear(datos: DatosAnuncio, creadoPorId?: string) {
    const titulo = this.textoObligatorio(datos.titulo, 'título');
    const contenido = this.textoObligatorio(datos.contenido, 'contenido');
    const fechaInicio = this.fechaValida(datos.fechaInicio, 'inicio');
    const fechaFin = datos.fechaFin
      ? this.fechaValida(datos.fechaFin, 'finalización')
      : null;
    this.validarRango(fechaInicio, fechaFin);

    return this.prisma.anuncio.create({
      data: {
        titulo,
        contenido,
        tipo: datos.tipo,
        audiencia: datos.audiencia,
        fechaInicio,
        fechaFin,
        activo: datos.activo,
        destacado: datos.destacado,
        creadoPorId,
      },
    });
  }

  async actualizar(id: string, datos: ActualizarAnuncio) {
    const actual = await this.prisma.anuncio.findFirst({
      where: { id, institucionId: null },
    });
    if (!actual) throw new NotFoundException('Anuncio no encontrado.');

    const fechaInicio =
      datos.fechaInicio === undefined
        ? actual.fechaInicio
        : this.fechaValida(datos.fechaInicio, 'inicio');
    const fechaFin =
      datos.fechaFin === undefined
        ? actual.fechaFin
        : datos.fechaFin
          ? this.fechaValida(datos.fechaFin, 'finalización')
          : null;
    this.validarRango(fechaInicio, fechaFin);

    return this.prisma.anuncio.update({
      where: { id },
      data: {
        ...(datos.titulo !== undefined && {
          titulo: this.textoObligatorio(datos.titulo, 'título'),
        }),
        ...(datos.contenido !== undefined && {
          contenido: this.textoObligatorio(datos.contenido, 'contenido'),
        }),
        ...(datos.tipo !== undefined && { tipo: datos.tipo }),
        ...(datos.audiencia !== undefined && { audiencia: datos.audiencia }),
        ...(datos.fechaInicio !== undefined && { fechaInicio }),
        ...(datos.fechaFin !== undefined && { fechaFin }),
        ...(datos.activo !== undefined && { activo: datos.activo }),
        ...(datos.destacado !== undefined && { destacado: datos.destacado }),
      },
    });
  }

  async eliminar(id: string) {
    const existe = await this.prisma.anuncio.findFirst({
      where: { id, institucionId: null },
      select: { id: true },
    });
    if (!existe) throw new NotFoundException('Anuncio no encontrado.');
    await this.prisma.anuncio.delete({ where: { id } });
    return { eliminado: true };
  }

  async listarInstitucion(institucionId: string) {
    return this.prisma.anuncio.findMany({
      where: { institucionId },
      include: {
        creadoPor: { select: { nombre: true } },
        _count: { select: { lecturas: true } },
      },
      orderBy: [{ fechaCreacion: 'desc' }],
    });
  }

  crearInstitucion(
    institucionId: string,
    creadoPorId: string,
    datos: DatosAnuncio,
  ) {
    const fechaInicio = this.fechaValida(datos.fechaInicio, 'inicio');
    const fechaFin = datos.fechaFin
      ? this.fechaValida(datos.fechaFin, 'finalización')
      : null;
    this.validarRango(fechaInicio, fechaFin);
    return this.prisma.anuncio.create({
      data: {
        titulo: this.textoObligatorio(datos.titulo, 'título'),
        contenido: this.textoObligatorio(datos.contenido, 'contenido'),
        tipo: datos.tipo,
        audiencia: AudienciaAnuncio.ESTUDIANTES,
        fechaInicio,
        fechaFin,
        activo: datos.activo,
        destacado: datos.destacado,
        institucionId,
        creadoPorId,
      },
    });
  }

  async actualizarInstitucion(
    id: string,
    institucionId: string,
    datos: ActualizarAnuncio,
  ) {
    const actual = await this.prisma.anuncio.findFirst({
      where: { id, institucionId },
    });
    if (!actual) throw new NotFoundException('Anuncio no encontrado.');
    const fechaInicio = datos.fechaInicio
      ? this.fechaValida(datos.fechaInicio, 'inicio')
      : actual.fechaInicio;
    const fechaFin =
      datos.fechaFin === undefined
        ? actual.fechaFin
        : datos.fechaFin
          ? this.fechaValida(datos.fechaFin, 'finalización')
          : null;
    this.validarRango(fechaInicio, fechaFin);
    return this.prisma.anuncio.update({
      where: { id },
      data: {
        ...(datos.titulo !== undefined && {
          titulo: this.textoObligatorio(datos.titulo, 'título'),
        }),
        ...(datos.contenido !== undefined && {
          contenido: this.textoObligatorio(datos.contenido, 'contenido'),
        }),
        ...(datos.tipo !== undefined && { tipo: datos.tipo }),
        ...(datos.fechaInicio !== undefined && { fechaInicio }),
        ...(datos.fechaFin !== undefined && { fechaFin }),
        ...(datos.activo !== undefined && { activo: datos.activo }),
        ...(datos.destacado !== undefined && { destacado: datos.destacado }),
      },
    });
  }

  async eliminarInstitucion(id: string, institucionId: string) {
    const existe = await this.prisma.anuncio.findFirst({
      where: { id, institucionId },
      select: { id: true },
    });
    if (!existe) throw new NotFoundException('Anuncio no encontrado.');
    await this.prisma.anuncio.delete({ where: { id } });
    return { eliminado: true };
  }

  private filtroVigentes(
    rol: RolUsuario,
    institucionId?: string,
  ): Prisma.AnuncioWhereInput {
    const ahora = new Date();
    const audiencias: AudienciaAnuncio[] = [AudienciaAnuncio.TODOS];
    if (rol === RolUsuario.ESTUDIANTE) {
      audiencias.push(AudienciaAnuncio.ESTUDIANTES);
    } else if (rol === RolUsuario.PROFESOR) {
      audiencias.push(AudienciaAnuncio.PROFESORES);
    }

    return {
      activo: true,
      audiencia: { in: audiencias },
      fechaInicio: { lte: ahora },
      AND: [
        { OR: [{ fechaFin: null }, { fechaFin: { gte: ahora } }] },
        rol === RolUsuario.ESTUDIANTE && institucionId
          ? { OR: [{ institucionId: null }, { institucionId }] }
          : { institucionId: null },
      ],
    };
  }

  private textoObligatorio(texto: string, campo: string) {
    const limpio = texto.trim();
    if (!limpio) {
      throw new BadRequestException(`El ${campo} no puede estar vacío.`);
    }
    return limpio;
  }

  private fechaValida(valor: string, campo: string) {
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) {
      throw new BadRequestException(`La fecha de ${campo} no es válida.`);
    }
    return fecha;
  }

  private validarRango(fechaInicio: Date, fechaFin: Date | null) {
    if (fechaFin && fechaFin <= fechaInicio) {
      throw new BadRequestException(
        'La fecha de finalización debe ser posterior a la fecha de inicio.',
      );
    }
  }
}
