import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  COMPETITIVE_VERIFIERS,
  CompetitiveVerifierRegistry,
} from './competitive.contracts';
import { CompetitiveService } from './competitive.service';
import { createSoloVerifiers } from './competitive.solo';
import { CompetitiveReconciler } from './competitive.reconciler';
import { TriviaCompetitiveVerifier } from './competitive.trivia';
import { TriviaCompetitiveReconciler } from './competitive.trivia-reconciler';

export const createCompetitiveVerifiers = () => [
  ...createSoloVerifiers(),
  new TriviaCompetitiveVerifier(),
];

@Module({
  imports: [PrismaModule],
  providers: [
    CompetitiveService,
    CompetitiveVerifierRegistry,
    { provide: COMPETITIVE_VERIFIERS, useFactory: createCompetitiveVerifiers },
    CompetitiveReconciler,
    TriviaCompetitiveReconciler,
  ],
  exports: [CompetitiveService],
})
export class CompetitiveModule {}
