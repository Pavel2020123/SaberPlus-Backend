import { Prisma } from '@prisma/client';
import { subtemaPublicadoWhere } from '../common/contenido-publicado';

// El avance usa el catálogo visible actual; la actividad conserva el historial
// completo, incluso si después se archiva una lección. No se reescriben datos.
export const progresoPublicadoCount = {
  select: {
    progresotemas: {
      where: { completado: true, subtema: subtemaPublicadoWhere() },
    },
  },
} satisfies Prisma.UsuarioCountOutputTypeDefaultArgs;
