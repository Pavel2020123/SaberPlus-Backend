import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AreaIcfes, EstadoContenido } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  catalogNameKey,
  isGenericCatalogName,
  validateCatalogName,
} from './academic-classification';

export const ACADEMIC_AREAS: Record<AreaIcfes, string> = {
  LECTURA_CRITICA: 'Lectura crítica',
  MATEMATICAS: 'Matemáticas',
  SOCIALES_CIUDADANAS: 'Sociales y ciudadanas',
  CIENCIAS_NATURALES: 'Ciencias naturales',
  INGLES: 'Inglés',
};

@Injectable()
export class AcademicCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  areas() {
    return Object.entries(ACADEMIC_AREAS).map(([id, nombre]) => ({
      id,
      nombre,
    }));
  }

  async crearTema(value: string, area: AreaIcfes) {
    const nombre = validateCatalogName(value);
    if (!Object.prototype.hasOwnProperty.call(ACADEMIC_AREAS, area))
      throw new BadRequestException('El área no es válida.');
    return this.prisma.$transaction(async (tx) => {
      // All admin catalog creations in the same scope share this transaction lock.
      await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext(${`catalogo:area:${area}`}))`;
      const siblings = await tx.tema.findMany({
        where: { area },
        select: { nombre: true },
      });
      this.ensureUnique(nombre, siblings);
      return tx.tema.create({
        data: { nombre, area, estadoContenido: EstadoContenido.BORRADOR },
      });
    });
  }

  async crearSubtema(value: string, temaId: string) {
    const nombre = validateCatalogName(value);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext(${`catalogo:tema:${temaId}`}))`;
      // Prevent archival/deletion of the parent during this insertion.
      await tx.$queryRaw`SELECT id FROM "Tema" WHERE id = ${temaId} FOR UPDATE`;
      const tema = await tx.tema.findUnique({
        where: { id: temaId },
        select: { nombre: true, estadoContenido: true },
      });
      if (!tema) throw new NotFoundException('El tema no existe.');
      validateCatalogName(tema.nombre);
      if (tema.estadoContenido === EstadoContenido.ARCHIVADO)
        throw new BadRequestException(
          'No se pueden agregar subtemas a un tema archivado.',
        );
      const siblings = await tx.subtema.findMany({
        where: { temaId },
        select: { nombre: true },
      });
      this.ensureUnique(nombre, siblings);
      return tx.subtema.create({
        data: { nombre, temaId, estadoContenido: EstadoContenido.BORRADOR },
      });
    });
  }

  async temas(area: AreaIcfes, pagina: number, limite: number) {
    const rows = await this.prisma.tema.findMany({
      where: { area },
      skip: (pagina - 1) * limite,
      take: limite + 1,
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        nombre: true,
        area: true,
        estadoContenido: true,
        _count: { select: { subtemas: true } },
      },
    });
    return {
      pagina,
      limite,
      hayMas: rows.length > limite,
      items: rows.slice(0, limite).map((row) => ({
        ...row,
        requiereClasificacion: isGenericCatalogName(row.nombre),
      })),
    };
  }

  async subtemas(temaId: string, pagina: number, limite: number) {
    const tema = await this.prisma.tema.findUnique({
      where: { id: temaId },
      select: { id: true, nombre: true, area: true, estadoContenido: true },
    });
    if (!tema) throw new NotFoundException('El tema no existe.');
    const rows = await this.prisma.subtema.findMany({
      where: { temaId },
      skip: (pagina - 1) * limite,
      take: limite + 1,
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        nombre: true,
        temaId: true,
        estadoContenido: true,
        _count: { select: { preguntas: true } },
      },
    });
    return {
      tema,
      pagina,
      limite,
      hayMas: rows.length > limite,
      items: rows.slice(0, limite).map((row) => ({
        ...row,
        requiereClasificacion:
          isGenericCatalogName(row.nombre) || isGenericCatalogName(tema.nombre),
      })),
    };
  }

  private ensureUnique(nombre: string, siblings: { nombre: string }[]) {
    if (
      siblings.some(
        (row) => catalogNameKey(row.nombre) === catalogNameKey(nombre),
      )
    ) {
      throw new ConflictException(
        'Ese nombre ya existe en esta clasificación, incluso si está archivado. Revisa el registro existente.',
      );
    }
  }
}
