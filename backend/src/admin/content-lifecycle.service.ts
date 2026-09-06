import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoContenido } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { createQuestionFingerprint } from '../common/question-fingerprint';
import {
  validateAcademicClassification,
  validateCatalogName,
} from './academic-classification';

const TRANSICIONES: Record<EstadoContenido, EstadoContenido[]> = {
  [EstadoContenido.BORRADOR]: [
    EstadoContenido.EN_REVISION,
    EstadoContenido.ARCHIVADO,
  ],
  [EstadoContenido.EN_REVISION]: [
    EstadoContenido.BORRADOR,
    EstadoContenido.PUBLICADO,
    EstadoContenido.ARCHIVADO,
  ],
  [EstadoContenido.PUBLICADO]: [EstadoContenido.ARCHIVADO],
  [EstadoContenido.ARCHIVADO]: [EstadoContenido.BORRADOR],
};

@Injectable()
export class ContentLifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  async cambiarEstadoTema(id: string, destino: EstadoContenido) {
    const tema = await this.prisma.tema.findUnique({
      where: { id },
      select: { id: true, nombre: true, estadoContenido: true },
    });
    if (!tema) throw new NotFoundException('El tema no existe.');
    this.validarTransicion(tema.estadoContenido, destino, 'tema');
    if (destino === EstadoContenido.PUBLICADO) {
      validateCatalogName(tema.nombre);
    }
    return this.prisma.tema.update({
      where: { id },
      data: this.datosEstado(destino),
    });
  }

  async cambiarEstadoSubtema(id: string, destino: EstadoContenido) {
    const subtema = await this.prisma.subtema.findUnique({
      where: { id },
      select: {
        id: true,
        nombre: true,
        estadoContenido: true,
        tema: { select: { nombre: true, estadoContenido: true } },
      },
    });
    if (!subtema) throw new NotFoundException('El subtema no existe.');
    this.validarTransicion(subtema.estadoContenido, destino, 'subtema');
    if (destino === EstadoContenido.PUBLICADO) {
      validateAcademicClassification(subtema);
      if (subtema.tema.estadoContenido !== EstadoContenido.PUBLICADO) {
        throw new BadRequestException(
          'Publica primero el tema al que pertenece este subtema.',
        );
      }
    }
    return this.prisma.subtema.update({
      where: { id },
      data: this.datosEstado(destino),
    });
  }

  async cambiarEstadoCaso(id: string, destino: EstadoContenido) {
    const caso = await this.prisma.casoPregunta.findUnique({
      where: { id },
      select: { id: true, contexto: true, estadoContenido: true },
    });
    if (!caso) throw new NotFoundException('El caso no existe.');
    this.validarTransicion(caso.estadoContenido, destino, 'caso');
    if (destino === EstadoContenido.PUBLICADO && !caso.contexto.trim()) {
      throw new BadRequestException(
        'El caso necesita contexto antes de publicarse.',
      );
    }
    return this.prisma.casoPregunta.update({
      where: { id },
      data: this.datosEstado(destino),
    });
  }

  async cambiarEstadoPregunta(id: string, destino: EstadoContenido) {
    const pregunta = await this.prisma.pregunta.findUnique({
      where: { id },
      select: {
        id: true,
        enunciado: true,
        imagenUrl: true,
        huellaContenido: true,
        estadoContenido: true,
        respuestas: { select: { texto: true, esCorrecta: true } },
        subtema: {
          select: {
            nombre: true,
            estadoContenido: true,
            tema: {
              select: { nombre: true, estadoContenido: true, area: true },
            },
          },
        },
        caso: { select: { estadoContenido: true } },
      },
    });
    if (!pregunta) throw new NotFoundException('La pregunta no existe.');
    this.validarTransicion(pregunta.estadoContenido, destino, 'pregunta');
    let huellaContenido = pregunta.huellaContenido;
    if (destino === EstadoContenido.PUBLICADO) {
      this.validarPreguntaPublicable(pregunta);
      huellaContenido ??= createQuestionFingerprint({
        area: pregunta.subtema.tema.area,
        enunciado: pregunta.enunciado,
        imagen: pregunta.imagenUrl,
        opciones: pregunta.respuestas.map((respuesta) => ({
          texto: respuesta.texto,
        })),
      });
      const duplicada = await this.prisma.pregunta.findFirst({
        where: {
          id: { not: pregunta.id },
          huellaContenido,
          estadoContenido: EstadoContenido.PUBLICADO,
        },
        select: { id: true },
      });
      if (duplicada) {
        throw new BadRequestException(
          'Esta pregunta ya se encuentra publicada en el banco académico.',
        );
      }
    }
    return this.prisma.pregunta.update({
      where: { id },
      data: {
        ...this.datosEstado(destino),
        ...(destino === EstadoContenido.PUBLICADO ? { huellaContenido } : {}),
      },
    });
  }

  private validarPreguntaPublicable(pregunta: {
    enunciado: string;
    respuestas: { texto: string; esCorrecta: boolean }[];
    subtema: {
      nombre: string;
      estadoContenido: EstadoContenido;
      tema: { nombre: string; estadoContenido: EstadoContenido; area: string };
    };
    caso: { estadoContenido: EstadoContenido } | null;
  }) {
    if (!pregunta.enunciado.trim()) {
      throw new BadRequestException(
        'La pregunta necesita un enunciado antes de publicarse.',
      );
    }
    if (
      pregunta.respuestas.length < 2 ||
      pregunta.respuestas.some((respuesta) => !respuesta.texto.trim())
    ) {
      throw new BadRequestException(
        'La pregunta necesita al menos dos opciones con texto.',
      );
    }
    if (
      pregunta.respuestas.filter((respuesta) => respuesta.esCorrecta).length !==
      1
    ) {
      throw new BadRequestException(
        'La pregunta debe tener exactamente una respuesta correcta.',
      );
    }
    validateAcademicClassification(pregunta.subtema);
    if (
      pregunta.subtema.estadoContenido !== EstadoContenido.PUBLICADO ||
      pregunta.subtema.tema.estadoContenido !== EstadoContenido.PUBLICADO
    ) {
      throw new BadRequestException(
        'Publica primero el tema y el subtema de la pregunta.',
      );
    }
    if (
      pregunta.caso &&
      pregunta.caso.estadoContenido !== EstadoContenido.PUBLICADO
    ) {
      throw new BadRequestException(
        'Publica primero el caso asociado a la pregunta.',
      );
    }
  }

  private validarTransicion(
    actual: EstadoContenido,
    destino: EstadoContenido,
    entidad: string,
  ) {
    if (actual === destino) {
      throw new BadRequestException(
        `El ${entidad} ya se encuentra en estado ${destino}.`,
      );
    }
    if (!TRANSICIONES[actual].includes(destino)) {
      throw new BadRequestException(
        `No se puede cambiar el ${entidad} de ${actual} a ${destino}.`,
      );
    }
  }

  private datosEstado(destino: EstadoContenido) {
    return {
      estadoContenido: destino,
      ...(destino === EstadoContenido.PUBLICADO
        ? { fechaPublicacion: new Date() }
        : {}),
    };
  }
}
