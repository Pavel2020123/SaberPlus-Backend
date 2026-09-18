import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AnunciosController } from './anuncios.controller';
import { AnunciosService } from './anuncios.service';
import { InstitutionOperationalGuard } from '../institucion/institution-operational.guard';

@Module({
  imports: [PrismaModule],
  controllers: [AnunciosController],
  providers: [AnunciosService, InstitutionOperationalGuard],
})
export class AnunciosModule {}
