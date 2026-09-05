import { Module } from '@nestjs/common';
import { CalendarioIcfesService } from './calendario-icfes.service';
import { CalendarioIcfesController } from './calendario-icfes.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [CalendarioIcfesService],
  controllers: [CalendarioIcfesController],
  exports: [CalendarioIcfesService],
})
export class CalendarioIcfesModule {}
