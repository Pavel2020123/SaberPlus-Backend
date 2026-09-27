import { All, Controller, GoneException } from '@nestjs/common';

// Compatibility only: no service, database access or game processing.
@Controller('escudo-conocimiento')
export class RetiredGamesController {
  @All([
    'intentos',
    'intentos/activo',
    'intentos/:id',
    'intentos/:id/respuestas',
    'intentos/:id/abandonar',
  ])
  retired(): never {
    throw new GoneException({
      codigo: 'JUEGO_RETIRADO',
      mensaje: 'Escudo del conocimiento ya no forma parte de SaberPlus.',
    });
  }
}
