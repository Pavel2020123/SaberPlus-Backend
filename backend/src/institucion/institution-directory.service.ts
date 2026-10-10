import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InstitutionDirectoryQuery } from './institution-directory.dto';

// Lista explícita: nunca serializar la entidad, códigos o expedientes privados.
const publicIdentity = { id: true, nombre: true } as const;
const pageSize = 20;

@Injectable()
export class InstitutionDirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: InstitutionDirectoryQuery) {
    const where: Prisma.InstitucionWhereInput = {
      estadoVerificacion: 'APROBADA',
      ...(query.q
        ? { nombre: { contains: query.q, mode: 'insensitive' as const } }
        : {}),
    };
    const rows = await this.prisma.institucion.findMany({
      where,
      select: publicIdentity,
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
      skip: (query.pagina - 1) * pageSize,
      take: pageSize + 1,
    });
    return {
      instituciones: rows.slice(0, pageSize),
      pagina: query.pagina,
      hayMas: rows.length > pageSize,
    };
  }

  async detail(id: string) {
    // La misma restricción se aplica al acceso directo, incluso tras suspensión.
    const row = await this.prisma.institucion.findFirst({
      where: { id, estadoVerificacion: 'APROBADA' },
      select: publicIdentity,
    });
    if (!row) throw new NotFoundException('Institución no disponible.');
    return row;
  }
}
