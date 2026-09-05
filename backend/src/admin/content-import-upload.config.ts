import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

export const CONTENT_IMPORT_MAX_FILE_BYTES = 25 * 1024 * 1024;

export const contentImportMulterOptions: MulterOptions = {
  storage: memoryStorage(),
  limits: {
    files: 1,
    fileSize: CONTENT_IMPORT_MAX_FILE_BYTES,
  },
  fileFilter: (_request, file, callback) => {
    const nombre = file.originalname.toLowerCase();
    if (!nombre.endsWith('.xlsx') && !nombre.endsWith('.zip')) {
      callback(
        new BadRequestException(
          'Carga un archivo .xlsx o un paquete .zip con un único Excel.',
        ),
        false,
      );
      return;
    }
    callback(null, true);
  },
};
