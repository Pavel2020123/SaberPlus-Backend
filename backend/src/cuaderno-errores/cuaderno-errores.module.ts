import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CuadernoErroresController } from './cuaderno-errores.controller';
import { CuadernoErroresService } from './cuaderno-errores.service';

@Module({
  imports: [PrismaModule],
  controllers: [CuadernoErroresController],
  providers: [CuadernoErroresService],
})
export class CuadernoErroresModule {}
