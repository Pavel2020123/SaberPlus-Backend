import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildLearningEvidence,
  evidenceWindow,
  MAX_EVIDENCE_RECORDS,
} from './learning-evidence.rules';

@Injectable()
export class LearningEvidenceService {
  constructor(private readonly prisma: PrismaService) {}

  async obtener(usuarioId: string) {
    const user = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { rol: true },
    });
    if (!user) throw new NotFoundException('El usuario no existe.');
    if (user.rol !== 'ESTUDIANTE')
      throw new ForbiddenException(
        'Este diagnóstico es personal del estudiante.',
      );
    const now = new Date();
    const rows = await this.prisma.historialRespuesta.findMany({
      where: {
        usuarioId,
        fechaRespuesta: { gte: evidenceWindow(now), lte: now },
      },
      orderBy: [{ fechaRespuesta: 'asc' }, { id: 'asc' }],
      take: MAX_EVIDENCE_RECORDS + 1,
      select: {
        id: true,
        preguntaId: true,
        sesionId: true,
        area: true,
        fechaRespuesta: true,
        esCorrecta: true,
        pregunta: {
          select: {
            estadoContenido: true,
            subtema: {
              select: {
                id: true,
                nombre: true,
                estadoContenido: true,
                tema: {
                  select: {
                    id: true,
                    nombre: true,
                    area: true,
                    estadoContenido: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    return buildLearningEvidence(
      rows.slice(0, MAX_EVIDENCE_RECORDS),
      now,
      rows.length > MAX_EVIDENCE_RECORDS,
    );
  }
}
