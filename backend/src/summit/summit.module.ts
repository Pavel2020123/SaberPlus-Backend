import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SummitController } from './summit.controller';
import { SummitService } from './summit.service';

@Module({
  imports: [PrismaModule],
  controllers: [SummitController],
  providers: [SummitService],
})
export class SummitModule {}
