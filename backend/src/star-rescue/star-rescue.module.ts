import { CompetitiveModule } from '../competitive/competitive.module';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StarRescueController } from './star-rescue.controller';
import { StarRescueService } from './star-rescue.service';

@Module({
  imports: [PrismaModule, CompetitiveModule],
  controllers: [StarRescueController],
  providers: [StarRescueService],
})
export class StarRescueModule {}
