import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AreaIcfes } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { subtemaPublicadoWhere } from '../common/contenido-publicado';
import { CertificadoHtmlService } from './certificado-html.service';

export const AREAS_CERTIFICADO = [
  { id: AreaIcfes.LECTURA_CRITICA, titulo: 'Lectura crítica' },
  { id: AreaIcfes.MATEMATICAS, titulo: 'Matemáticas' },
  { id: AreaIcfes.CIENCIAS_NATURALES, titulo: 'Ciencias naturales' },
  { id: AreaIcfes.SOCIALES_CIUDADANAS, titulo: 'Sociales y ciudadanas' },
  { id: AreaIcfes.INGLES, titulo: 'Inglés' },
] as const;

export function nombreCertificado(nombre: string, tipo: string): string {
  const segmento = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return `certificado-${tipo.toLowerCase()}-${segmento || 'estudiante'}.pdf`;
}

@Injectable()
export class CertificadosCursoService {
  constructor(private readonly prisma: PrismaService, private readonly html: CertificadoHtmlService) {}

  async listar(usuarioId: string) {
    // One catalog snapshot; drafts, archived content and unpublished parents never count.
    const lecciones = await this.prisma.subtema.findMany({
      where: subtemaPublicadoWhere(),
      select: {
        tema: { select: { area: true } },
        progresotemas: {
          where: { usuarioId, completado: true, porcentaje: { gte: 100 } },
          select: { id: true },
        },
      },
    });
    const areas = AREAS_CERTIFICADO.map(({ id, titulo }) => {
      const propias = lecciones.filter((leccion) => leccion.tema.area === id);
      const completadas = propias.filter((leccion) => leccion.progresotemas.length > 0).length;
      return {
        id, titulo, completadas, total: propias.length,
        disponible: propias.length > 0 && completadas === propias.length,
        unidad: 'lecciones',
      };
    });
    const completadas = areas.filter((area) => area.disponible).length;
    return [...areas, {
      id: 'CURSO_COMPLETO', titulo: 'Curso completo de SaberPlus',
      completadas, total: 5, disponible: completadas === 5, unidad: 'áreas',
    }];
  }

  async generar(usuarioId: string, tipo: string) {
    if (tipo !== 'CURSO_COMPLETO' && !AREAS_CERTIFICADO.some((area) => area.id === tipo)) {
      throw new NotFoundException('Solo existen certificados de las cinco áreas y del curso completo.');
    }
    const certificado = (await this.listar(usuarioId)).find((item) => item.id === tipo)!;
    if (!certificado.disponible) {
      throw new ForbiddenException('Completa todas las lecciones publicadas para descargar este certificado.');
    }
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId }, select: { nombre: true },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado.');
    if (!usuario.nombre?.trim()) throw new BadRequestException('Completa tu nombre en el perfil.');
    const archivo = await this.html.generar({
      nombre: usuario.nombre, area: certificado.titulo,
      cursoCompleto: tipo === 'CURSO_COMPLETO', fecha: new Date(),
    });
    return { archivo, nombre: nombreCertificado(usuario.nombre, tipo) };
  }
}
