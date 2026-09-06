import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DiagnosticoController } from './diagnostico.controller';
import { DiagnosticoService } from './diagnostico.service';
import { LearningEvidenceController } from './learning-evidence.controller';
import { LearningEvidenceService } from './learning-evidence.service';

@Module({
  imports: [PrismaModule],
  controllers: [DiagnosticoController, LearningEvidenceController],
  providers: [DiagnosticoService, LearningEvidenceService],
  exports: [DiagnosticoService],
})
export class DiagnosticoModule {}
