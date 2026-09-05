import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReferidosController } from './referidos.controller';
import { ReferidosService } from './referidos.service';

@Module({
  imports: [PrismaModule],
  controllers: [ReferidosController],
  providers: [ReferidosService],
  exports: [ReferidosService],
})
export class ReferidosModule {}
