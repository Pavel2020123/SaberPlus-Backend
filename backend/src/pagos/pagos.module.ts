import { Module } from '@nestjs/common';
import { PagosController } from './pagos.controller';

// Sin servicios de cobro, credenciales ni dependencias de base de datos.
@Module({ controllers: [PagosController] })
export class PagosModule {}
