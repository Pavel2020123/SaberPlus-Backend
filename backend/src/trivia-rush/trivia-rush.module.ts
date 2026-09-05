import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TriviaRushController } from './trivia-rush.controller';
import { TriviaRushService } from './trivia-rush.service';

@Module({
  imports: [PrismaModule],
  controllers: [TriviaRushController],
  providers: [TriviaRushService],
  exports: [TriviaRushService],
})
export class TriviaRushModule {}
