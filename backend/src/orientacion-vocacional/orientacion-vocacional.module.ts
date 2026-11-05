import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrientacionVocacionalController } from './orientacion-vocacional.controller';
import { OrientacionVocacionalService } from './orientacion-vocacional.service';

@Module({
  imports: [PrismaModule],
  controllers: [OrientacionVocacionalController],
  providers: [OrientacionVocacionalService],
})
export class OrientacionVocacionalModule {}
