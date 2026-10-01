import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  COMPETITIVE_VERIFIERS,
  CompetitiveVerifierRegistry,
} from './competitive.contracts';
import { CompetitiveService } from './competitive.service';
import { createSoloVerifiers } from './competitive.solo';
import { CompetitiveReconciler } from './competitive.reconciler';

@Module({
  imports: [PrismaModule],
  providers: [
    CompetitiveService,
    CompetitiveVerifierRegistry,
    { provide: COMPETITIVE_VERIFIERS, useFactory: createSoloVerifiers },
    CompetitiveReconciler,
  ],
  exports: [CompetitiveService],
})
export class CompetitiveModule {}
