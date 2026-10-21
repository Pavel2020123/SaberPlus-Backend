import { Module } from '@nestjs/common';
import { resolve } from 'node:path';
import { PrismaModule } from '../prisma/prisma.module';
import { EditorialFileController } from './editorial-file.controller';
import { EditorialResourceController } from './editorial-resource.controller';
import { EditorialFileRuntime } from './editorial-file-runtime';
import { EditorialFileService } from './editorial-file.service';
import {
  EDITORIAL_FILE_ROOT,
  EditorialFileStore,
  LocalEditorialFileStore,
} from './editorial-file.store';

@Module({
  imports: [PrismaModule],
  controllers: [EditorialFileController, EditorialResourceController],
  providers: [
    EditorialFileRuntime,
    EditorialFileService,
    {
      provide: EDITORIAL_FILE_ROOT,
      useFactory: () => resolve(process.cwd(), '.tmp', 'editorial-files'),
    },
    { provide: EditorialFileStore, useClass: LocalEditorialFileStore },
  ],
})
export class EditorialFileModule {}
