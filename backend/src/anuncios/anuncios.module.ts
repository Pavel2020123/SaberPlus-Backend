import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AnunciosController } from './anuncios.controller';
import { AnunciosService } from './anuncios.service';

@Module({
  imports: [PrismaModule],
  controllers: [AnunciosController],
  providers: [AnunciosService],
})
export class AnunciosModule {}
