import { RolImagenHistorial } from '@prisma/client';
import { publicAnswerOption } from '../common/public-answer-option';
import { editorialImagePath } from './editorial-image-reference';

type HistoricalImage = {
  rol: RolImagenHistorial;
  respuestaId: string;
  archivoId: string;
};

// Solo usar con capturas leídas del historial propio por el servidor. El enlace
// no concede acceso: el GET autenticado vuelve a verificar propiedad y revocación.
export function historicalAnswerOption(
  option: { id: string; texto: string; imagenUrl?: string | null },
  images: readonly HistoricalImage[] | undefined,
  role: RolImagenHistorial,
) {
  const original = images?.find(
    (image) => image.rol === role && image.respuestaId === option.id,
  );
  return publicAnswerOption({
    ...option,
    imagenUrl: original
      ? editorialImagePath(original.archivoId)
      : option.imagenUrl,
  });
}
