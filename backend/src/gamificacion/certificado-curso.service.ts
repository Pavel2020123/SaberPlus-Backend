import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { subtemaPublicadoWhere } from '../common/contenido-publicado';
import { PrismaService } from '../prisma/prisma.service';
import {
  AreaCertificado,
  DatosCertificado,
  DatosCertificadoInvalidosError,
  TipoCertificado,
  generarCertificadoPdf,
  nombreArchivoCertificado,
} from './certificado-html-generator';

export const AREAS_CERTIFICADO: AreaCertificado[] = [
  'LECTURA_CRITICA',
  'MATEMATICAS',
  'CIENCIAS_NATURALES',
  'SOCIALES_CIUDADANAS',
  'INGLES',
];
const TIPOS_CERTIFICADO: TipoCertificado[] = [
  ...AREAS_CERTIFICADO,
  'CURSO_COMPLETO',
];

export interface CertificadoEstado {
  tipo: TipoCertificado;
  disponible: boolean;
  completados: number;
  total: number;
}

function hoyEnBogota(): Date {
  const dia = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
  }).format(new Date());
  return new Date(dia);
}

@Injectable()
export class CertificadoCursoService {
  constructor(private readonly prisma: PrismaService) {}

  private async progresoPorArea(usuarioId: string) {
    const subtemas = await this.prisma.subtema.findMany({
      where: subtemaPublicadoWhere(),
      select: {
        tema: { select: { area: true } },
        progresotemas: {
          where: { usuarioId, completado: true },
          select: { id: true },
        },
      },
    });

    const porArea = new Map<string, { completados: number; total: number }>();
    for (const subtema of subtemas) {
      const actual = porArea.get(subtema.tema.area) ?? {
        completados: 0,
        total: 0,
      };
      actual.total += 1;
      if (subtema.progresotemas.length > 0) actual.completados += 1;
      porArea.set(subtema.tema.area, actual);
    }
    return porArea;
  }

  async listar(usuarioId: string): Promise<{ certificados: CertificadoEstado[] }> {
    const porArea = await this.progresoPorArea(usuarioId);
    const areas: CertificadoEstado[] = AREAS_CERTIFICADO.map((tipo) => {
      const { completados, total } = porArea.get(tipo) ?? {
        completados: 0,
        total: 0,
      };
      return {
        tipo,
        disponible: total > 0 && completados === total,
        completados,
        total,
      };
    });
    const areasListas = areas.filter((a) => a.disponible).length;
    return {
      certificados: [
        ...areas,
        {
          tipo: 'CURSO_COMPLETO',
          disponible: areasListas === AREAS_CERTIFICADO.length,
          completados: areasListas,
          total: AREAS_CERTIFICADO.length,
        },
      ],
    };
  }

  async generarPdf(usuarioId: string, tipoSolicitado: string) {
    if (!TIPOS_CERTIFICADO.includes(tipoSolicitado as TipoCertificado)) {
      throw new BadRequestException('Tipo de certificado no reconocido.');
    }
    const tipo = tipoSolicitado as TipoCertificado;

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { nombre: true },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado.');

    const { certificados } = await this.listar(usuarioId);
    if (!certificados.find((c) => c.tipo === tipo)?.disponible) {
      throw new ForbiddenException(
        tipo === 'CURSO_COMPLETO'
          ? 'Debes completar las cinco áreas para obtener este certificado.'
          : 'Aún no has completado esta área.',
      );
    }

    const datos: DatosCertificado = {
      nombreEstudiante: usuario.nombre,
      tipo,
      fecha: hoyEnBogota(),
      demo: false,
    };
    try {
      const archivo = await generarCertificadoPdf(datos);
      return { archivo, nombre: nombreArchivoCertificado(datos) };
    } catch (error) {
      if (error instanceof DatosCertificadoInvalidosError) {
        throw new UnprocessableEntityException(error.message);
      }
      throw error;
    }
  }
}