import { EstadoContenido, Prisma } from '@prisma/client';

export const ESTADO_PUBLICADO = EstadoContenido.PUBLICADO;

export function preguntaPublicadaWhere(
  where: Prisma.PreguntaWhereInput = {},
): Prisma.PreguntaWhereInput {
  return {
    AND: [
      { estadoContenido: ESTADO_PUBLICADO },
      {
        subtema: {
          estadoContenido: ESTADO_PUBLICADO,
          tema: { estadoContenido: ESTADO_PUBLICADO },
        },
      },
      {
        OR: [
          { casoId: null },
          { caso: { is: { estadoContenido: ESTADO_PUBLICADO } } },
        ],
      },
      where,
    ],
  };
}

export function temaPublicadoWhere(
  where: Prisma.TemaWhereInput = {},
): Prisma.TemaWhereInput {
  return { AND: [{ estadoContenido: ESTADO_PUBLICADO }, where] };
}

export function subtemaPublicadoWhere(
  where: Prisma.SubtemaWhereInput = {},
): Prisma.SubtemaWhereInput {
  return {
    AND: [
      { estadoContenido: ESTADO_PUBLICADO },
      { tema: { estadoContenido: ESTADO_PUBLICADO } },
      where,
    ],
  };
}
