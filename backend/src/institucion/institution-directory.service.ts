import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InstitutionDirectoryQuery } from './institution-directory.dto';
import { InstitutionTerritoryService } from './institution-territory.service';

// Nunca serializar códigos de ingreso, contactos o expedientes privados.
const publicIdentity = {
  id: true,
  nombre: true,
  departamentoCodigo: true,
  municipioCodigo: true,
} as const;
const pageSize = 20;

@Injectable()
export class InstitutionDirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly territory: InstitutionTerritoryService = new InstitutionTerritoryService(),
  ) {}

  private publicRow(row: {
    id: string;
    nombre: string;
    departamentoCodigo?: string | null;
    municipioCodigo?: string | null;
  }) {
    let ubicacion: object | null = null;
    if (row.departamentoCodigo && row.municipioCodigo) {
      try {
        const location = this.territory.resolveLocation(
          row.departamentoCodigo,
          row.municipioCodigo,
        );
        ubicacion = {
          departamentoCodigo: location.departamento.codigo,
          departamentoNombre: location.departamento.nombre,
          municipioCodigo: location.municipio.codigo,
          municipioNombre: location.municipio.nombre,
          tipo: location.municipio.tipo,
        };
      } catch (error) {
        if (
          !(
            error instanceof BadRequestException ||
            error instanceof NotFoundException
          )
        )
          throw error;
      }
    }
    return { id: row.id, nombre: row.nombre, ubicacion };
  }

  async list(query: InstitutionDirectoryQuery) {
    if (query.municipioCodigo && !query.departamentoCodigo)
      throw new BadRequestException('Selecciona primero un departamento.');
    if (query.departamentoCodigo) {
      try {
        if (query.municipioCodigo)
          this.territory.resolveLocation(
            query.departamentoCodigo,
            query.municipioCodigo,
          );
        else this.territory.municipalities(query.departamentoCodigo);
      } catch (error) {
        if (error instanceof NotFoundException)
          throw new BadRequestException('Departamento no válido.');
        throw error;
      }
    }
    const where: Prisma.InstitucionWhereInput = {
      estadoVerificacion: 'APROBADA',
      ...(query.departamentoCodigo
        ? { departamentoCodigo: query.departamentoCodigo }
        : {}),
      ...(query.municipioCodigo
        ? { municipioCodigo: query.municipioCodigo }
        : {}),
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
      instituciones: rows.slice(0, pageSize).map((row) => this.publicRow(row)),
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
    return this.publicRow(row);
  }
}
