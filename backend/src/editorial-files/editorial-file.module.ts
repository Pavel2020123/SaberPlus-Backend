import { Module } from '@nestjs/common';
import { resolve } from 'node:path';
import { PrismaModule } from '../prisma/prisma.module';
import { EditorialFileController } from './editorial-file.controller';
import { EditorialResourceController } from './editorial-resource.controller';
import { EditorialFileRuntime } from './editorial-file-runtime';
import { EditorialFileService } from './editorial-file.service';
import { PrivateOfflineLessonService } from './private-offline-lesson.service';
import { PrivateOfflineLessonController } from './private-offline-lesson.controller';
import {
  EDITORIAL_FILE_ROOT,
  EditorialFileStore,
} from './editorial-file.store';
import { editorialFileProvider } from './editorial-file-provider';
import { EditorialFileRecoveryService } from './editorial-file-recovery.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    EditorialFileController,
    EditorialResourceController,
    PrivateOfflineLessonController,
  ],
  providers: [
    EditorialFileRuntime,
    EditorialFileService,
    EditorialFileRecoveryService,
    PrivateOfflineLessonService,
    {
      provide: EDITORIAL_FILE_ROOT,
      useFactory: () => resolve(process.cwd(), '.tmp', 'editorial-files'),
    },
    {
      provide: EditorialFileStore,
      inject: [EDITORIAL_FILE_ROOT],
      useFactory: (root: string) => editorialFileProvider(root),
    },
  ],
  exports: [EditorialFileService],
})
export class EditorialFileModule {}
