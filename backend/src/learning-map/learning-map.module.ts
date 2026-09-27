import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LearningMapService } from './learning-map.service';
import {
  AdminLearningMapController,
  LearningMapController,
} from './learning-map.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AdminLearningMapController, LearningMapController],
  providers: [LearningMapService],
})
export class LearningMapModule {}
