import { Module } from '@nestjs/common';
import { CalendarioIcfesModule } from '../calendario-icfes/calendario-icfes.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PlanEstudioController } from './plan-estudio.controller';
import { PlanEstudioService } from './plan-estudio.service';

@Module({
  imports: [PrismaModule, CalendarioIcfesModule],
  controllers: [PlanEstudioController],
  providers: [PlanEstudioService],
})
export class PlanEstudioModule {}
