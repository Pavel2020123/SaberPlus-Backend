import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GamificacionController } from './gamificacion.controller';
import { GamificacionService } from './gamificacion.service';
import { CertificadosCursoService } from './certificados-curso.service';
import { CertificadoHtmlService } from './certificado-html.service';

@Module({
  imports: [PrismaModule],
  controllers: [GamificacionController],
  providers: [GamificacionService, CertificadosCursoService, CertificadoHtmlService],
})
export class GamificacionModule {}
