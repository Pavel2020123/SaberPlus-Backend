import { memoryStorage, FileFilterCallback } from 'multer';

// A diferencia del logo, el CSV no se guarda en disco: solo se lee su
// contenido en memoria para crear los estudiantes y luego se descarta.
const TAMANO_MAXIMO_BYTES = 2 * 1024 * 1024; // 2MB (varios miles de filas)

const TIPOS_MIME_PERMITIDOS = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/csv',
  'text/plain',
];

export const csvMulterOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: TAMANO_MAXIMO_BYTES,
  },
  fileFilter: (
    _req: Express.Request,
    archivo: Express.Multer.File,
    callback: FileFilterCallback,
  ) => {
    const nombreValido = archivo.originalname.toLowerCase().endsWith('.csv');
    const tipoValido = TIPOS_MIME_PERMITIDOS.includes(archivo.mimetype);

    if (!nombreValido || !tipoValido) {
      callback(
        new Error(
          'El archivo debe ser un CSV (.csv) con las columnas nombre, correo, contrasena.',
        ),
      );
      return;
    }

    callback(null, true);
  },
};
