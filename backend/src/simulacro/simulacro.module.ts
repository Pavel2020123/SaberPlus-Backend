import { Module } from '@nestjs/common';
import { SimulacroService } from './simulacro.service';
import { SimulacroController } from './simulacro.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TemaPdfService } from './tema-pdf.service';
import { RepasoAdaptativoController } from './repaso-adaptativo.controller';
import { RepasoAdaptativoService } from './repaso-adaptativo.service';

@Module({
  imports: [PrismaModule],
  providers: [SimulacroService, TemaPdfService, RepasoAdaptativoService],
  controllers: [SimulacroController, RepasoAdaptativoController],
})
export class SimulacroModule {}
