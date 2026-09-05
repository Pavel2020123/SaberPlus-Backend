import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TutorialController } from './tutorial.controller';
import { TutorialService } from './tutorial.service';

@Module({
  imports: [PrismaModule],
  controllers: [TutorialController],
  providers: [TutorialService],
})
export class TutorialModule {}
