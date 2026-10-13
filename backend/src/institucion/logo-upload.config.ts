import { memoryStorage } from 'multer';

// No persistir archivos sin validar ni confiar en su extensión o MIME declarado.
export const logoMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 1, parts: 2 },
};
