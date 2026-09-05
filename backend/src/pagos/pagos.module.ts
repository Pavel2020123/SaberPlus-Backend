import { Module } from '@nestjs/common';
import { PagosController } from './pagos.controller';
import { PagosService } from './pagos.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CalendarioIcfesModule } from '../calendario-icfes/calendario-icfes.module';
import { CuponesModule } from '../cupones/cupones.module';
import { ReferidosModule } from '../referidos/referidos.module';

@Module({
  imports: [
    PrismaModule,
    CalendarioIcfesModule,
    CuponesModule,
    ReferidosModule,
  ],
  controllers: [PagosController],
  providers: [PagosService],
})
export class PagosModule {}
