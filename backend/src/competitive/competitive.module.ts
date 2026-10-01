import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  COMPETITIVE_VERIFIERS,
  CompetitiveVerifierRegistry,
} from './competitive.contracts';
import { CompetitiveService } from './competitive.service';

@Module({
  imports: [PrismaModule],
  providers: [
    CompetitiveService,
    CompetitiveVerifierRegistry,
    { provide: COMPETITIVE_VERIFIERS, useValue: [] },
  ],
  exports: [CompetitiveService],
})
export class CompetitiveModule {}
