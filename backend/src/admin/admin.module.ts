import { Module } from '@nestjs/common';
import { BankCoverageController } from './bank-coverage.controller';
import { BankCoverageService } from './bank-coverage.service';
import { SimpleContentController } from './simple-content.controller';
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
import { EditorialReviewService } from './editorial-review.service';
import { EditorialReviewController } from './editorial-review.controller';
import { LegacyEditorialWriteGuard } from './legacy-editorial-write.guard';
import { LegacyQuestionIndexController } from './legacy-question-index.controller';
import { LegacyQuestionIndexService } from './legacy-question-index.service';
import { QuestionReclassificationController } from './question-reclassification.controller';
import { QuestionReclassificationService } from './question-reclassification.service';

@Module({
  imports: [PrismaModule],

  controllers: [
    BankCoverageController,
    SimpleContentController,
    AdminController,
    AcademicCatalogController,
    LessonEditorController,
    QuestionEditorController,
    EditorialReviewController,
    LegacyQuestionIndexController,
    QuestionReclassificationController,
  ],

  providers: [
    BankCoverageService,
    AdminService,
    AcademicCatalogService,
    LessonEditorService,
    QuestionEditorService,
    EditorialReviewService,
    LegacyEditorialWriteGuard,
    LegacyQuestionIndexService,
    QuestionReclassificationService,
    ContentLifecycleService,
    ContentImportService,
    ContentPackageReaderService,
  ],
})
export class AdminModule {}
