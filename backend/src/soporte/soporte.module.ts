import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SoporteController } from './soporte.controller';
import { SoporteService } from './soporte.service';

@Module({
  imports: [PrismaModule],
  controllers: [SoporteController],
  providers: [SoporteService],
})
export class SoporteModule {}
