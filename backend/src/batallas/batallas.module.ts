import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BatallasController } from './batallas.controller';
import { BatallasService } from './batallas.service';

@Module({
  imports: [PrismaModule],
  controllers: [BatallasController],
  providers: [BatallasService],
  exports: [BatallasService],
})
export class BatallasModule {}
