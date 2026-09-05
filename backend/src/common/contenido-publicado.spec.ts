import { EstadoContenido } from '@prisma/client';
import {
  preguntaPublicadaWhere,
  subtemaPublicadoWhere,
} from './contenido-publicado';

describe('filtros de contenido publicado', () => {
  it('exige pregunta, jerarquía y caso publicados', () => {
    expect(preguntaPublicadaWhere({ subtemaId: 'subtema-1' })).toEqual({
      AND: [
        { estadoContenido: EstadoContenido.PUBLICADO },
        {
          subtema: {
            estadoContenido: EstadoContenido.PUBLICADO,
            tema: { estadoContenido: EstadoContenido.PUBLICADO },
          },
        },
        {
          OR: [
            { casoId: null },
            {
              caso: {
                is: { estadoContenido: EstadoContenido.PUBLICADO },
              },
            },
          ],
        },
        { subtemaId: 'subtema-1' },
      ],
    });
  });

  it('exige que el subtema y su tema estén publicados', () => {
    expect(subtemaPublicadoWhere()).toEqual({
      AND: [
        { estadoContenido: EstadoContenido.PUBLICADO },
        { tema: { estadoContenido: EstadoContenido.PUBLICADO } },
        {},
      ],
    });
  });
});
