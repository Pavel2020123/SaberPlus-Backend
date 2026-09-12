import { Controller, Get, GoneException, Post } from '@nestjs/common';

// Solo informa el retiro; no procesa pagos ni consulta datos históricos.
@Controller('pagos')
export class PagosController {
  @Post('crear-orden')
  crearOrden(): never {
    return this.retirado();
  }

  @Post('confirmacion')
  confirmacion(): never {
    return this.retirado();
  }

  @Get('estado/:factura')
  estado(): never {
    return this.retirado();
  }

  private retirado(): never {
    throw new GoneException({
      statusCode: 410,
      code: 'LEGACY_PAYMENTS_RETIRED',
      message: 'La pasarela de pagos anterior fue retirada de SaberPlus.',
    });
  }
}
