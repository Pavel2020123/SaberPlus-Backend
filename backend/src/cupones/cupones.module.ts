import { Module } from '@nestjs/common';
import { CuponesService } from './cupones.service';
import { CuponesController } from './cupones.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [CuponesService],
  controllers: [CuponesController],
  exports: [CuponesService],
})
export class CuponesModule {}
