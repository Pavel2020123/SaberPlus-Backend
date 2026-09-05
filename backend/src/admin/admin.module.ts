import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ContentLifecycleService } from './content-lifecycle.service';
import { ContentImportService } from './content-import.service';
import { ContentPackageReaderService } from './content-package-reader.service';

@Module({
  imports: [PrismaModule],

  controllers: [AdminController],

  providers: [
    AdminService,
    ContentLifecycleService,
    ContentImportService,
    ContentPackageReaderService,
  ],
})
export class AdminModule {}
