import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GamificacionController } from './gamificacion.controller';
import { GamificacionService } from './gamificacion.service';
import { CertificadoLogroService } from './certificado-logro.service';
import { CertificadoCursoService } from './certificado-curso.service';

@Module({
  imports: [PrismaModule],
  controllers: [GamificacionController],
  providers: [GamificacionService, CertificadoLogroService, CertificadoCursoService],
})
export class GamificacionModule {}
