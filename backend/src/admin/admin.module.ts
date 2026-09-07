import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ContentLifecycleService } from './content-lifecycle.service';
import { ContentImportService } from './content-import.service';
import { ContentPackageReaderService } from './content-package-reader.service';
import { AcademicCatalogController } from './academic-catalog.controller';
import { AcademicCatalogService } from './academic-catalog.service';
import { LessonEditorService } from './lesson-editor.service';
import { LessonEditorController } from './lesson-editor.controller';
import { QuestionEditorService } from './question-editor.service';
import { QuestionEditorController } from './question-editor.controller';

@Module({
  imports: [PrismaModule],

  controllers: [
    AdminController,
    AcademicCatalogController,
    LessonEditorController,
    QuestionEditorController,
  ],

  providers: [
    AdminService,
    AcademicCatalogService,
    LessonEditorService,
    QuestionEditorService,
    ContentLifecycleService,
    ContentImportService,
    ContentPackageReaderService,
  ],
})
export class AdminModule {}
