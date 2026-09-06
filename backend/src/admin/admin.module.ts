import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ContentLifecycleService } from './content-lifecycle.service';
import { ContentImportService } from './content-import.service';
import { ContentPackageReaderService } from './content-package-reader.service';
import { AcademicCatalogController } from './academic-catalog.controller';
import { AcademicCatalogService } from './academic-catalog.service';

@Module({
  imports: [PrismaModule],

  controllers: [AdminController, AcademicCatalogController],

  providers: [
    AdminService,
    AcademicCatalogService,
    ContentLifecycleService,
    ContentImportService,
    ContentPackageReaderService,
  ],
})
export class AdminModule {}
