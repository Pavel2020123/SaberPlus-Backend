import { Module } from '@nestjs/common';
import { InstitutionApprovalService } from './institution-approval.service';
import {
  InstitutionApprovalController,
  InstitutionRegistrationController,
} from './institution-approval.controller';
import { InstitutionOperationalGuard } from './institution-operational.guard';
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
import { StudentEvidenceController } from './student-evidence.controller';
import { StudentEvidenceService } from './student-evidence.service';
import { LearningEvidenceService } from '../diagnostico/learning-evidence.service';
import { TeacherPrioritiesService } from './teacher-priorities.service';
import { StudyTimeService } from './study-time.service';
import {
  StudyTimeController,
  TeacherStudyTimeController,
} from './study-time.controller';
import {
  TeacherPrioritiesController,
  StudentPrioritiesController,
} from './teacher-priorities.controller';

@Module({
  imports: [PrismaModule],
  controllers: [
    InstitutionApprovalController,
    InstitutionRegistrationController,
    InstitucionController,
    StudentEvidenceController,
    TeacherPrioritiesController,
    StudentPrioritiesController,
    StudyTimeController,
    TeacherStudyTimeController,
  ],
  providers: [
    InstitutionApprovalService,
    InstitutionOperationalGuard,
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
    StudentEvidenceService,
    LearningEvidenceService,
    TeacherPrioritiesService,
    StudyTimeService,
  ],
})
export class InstitucionModule {}
