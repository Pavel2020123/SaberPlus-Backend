import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RankingController } from './ranking.controller';
import { RankingService } from './ranking.service';
import {
  CompetitiveRankingController,
  CompetitiveRankingStudentGuard,
} from './competitive-ranking.controller';
import { CompetitiveRankingReader } from './competitive-ranking.reader';

@Module({
  imports: [PrismaModule],
  controllers: [RankingController, CompetitiveRankingController],
  providers: [
    RankingService,
    CompetitiveRankingReader,
    CompetitiveRankingStudentGuard,
  ],
})
export class RankingModule {}
