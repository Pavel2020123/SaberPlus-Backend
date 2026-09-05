import { Module } from '@nestjs/common';
import { InstitucionController } from './institucion.controller';
import { InstitucionService } from './institucion.service';
import { InstitucionAccesoService } from './institucion-acceso.service';
import { GrupoService } from './grupo.service';
import { EstudianteService } from './estudiante.service';
import { EstudianteImportService } from './estudiante-import.service';
import { ArchivoAlmacenamientoService } from './archivo-almacenamiento.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AlertasRiesgoService } from './alertas-riesgo.service';
import { VinculoInstitucionService } from './vinculo-institucion.service';
import { AdministracionInstitucionService } from './administracion-institucion.service';
import { VinculacionGrupoService } from './vinculacion-grupo.service';
import { AnaliticaBasicaService } from './analitica-basica.service';
import { AnaliticaDetalladaService } from './analitica-detallada.service';
import { ReporteInstitucionalService } from './reporte-institucional.service';

@Module({
  imports: [PrismaModule],
  controllers: [InstitucionController],
  providers: [
    InstitucionService,
    InstitucionAccesoService,
    GrupoService,
    EstudianteService,
    EstudianteImportService,
    ArchivoAlmacenamientoService,
    AlertasRiesgoService,
    VinculoInstitucionService,
    AdministracionInstitucionService,
    VinculacionGrupoService,
    AnaliticaBasicaService,
    AnaliticaDetalladaService,
    ReporteInstitucionalService,
  ],
})
export class InstitucionModule {}
