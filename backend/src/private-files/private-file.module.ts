import { Module } from '@nestjs/common';
import { resolve } from 'node:path';
import { PrismaModule } from '../prisma/prisma.module';
import { PrivateFileRuntime } from './private-file-runtime';
import { privateFileProvider, PRIVATE_FILE_STORE } from './private-file.store';
import { ProfilePhotoService } from './profile-photo.service';
import { ProfilePhotoController } from './profile-photo.controller';
import { InstitutionEvidenceController } from './institution-evidence.controller';
import { InstitutionEvidenceService } from './institution-evidence.service';
import { PrivateFileCleanupService } from './private-file-cleanup.service';
import { PrivateBackupCleanupService } from './private-backup-cleanup.service';
import { PrivateFileRecoveryService } from './private-file-recovery.service';
import {
  LocalPrivateBackupVault,
  PRIVATE_BACKUP_VAULT,
} from './private-backup-vault';

@Module({
  imports: [PrismaModule],
  controllers: [ProfilePhotoController, InstitutionEvidenceController],
  providers: [
    PrivateFileRuntime,
    ProfilePhotoService,
    InstitutionEvidenceService,
    PrivateFileCleanupService,
    PrivateBackupCleanupService,
    PrivateFileRecoveryService,
    {
      provide: PRIVATE_BACKUP_VAULT,
      useFactory: () =>
        new LocalPrivateBackupVault(
          resolve(process.cwd(), '.tmp', 'private-backup-vault'),
        ),
    },
    { provide: PRIVATE_FILE_STORE, useFactory: () => privateFileProvider() },
  ],
})
export class PrivateFileModule {}
