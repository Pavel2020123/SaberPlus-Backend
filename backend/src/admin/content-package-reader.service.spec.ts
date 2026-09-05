import { BadRequestException } from '@nestjs/common';
import { ContentPackageReaderService } from './content-package-reader.service';

describe('ContentPackageReaderService', () => {
  const service = new ContentPackageReaderService();

  it('rechaza archivos vacíos', async () => {
    const file = {
      originalname: 'contenido.xlsx',
      buffer: Buffer.alloc(0),
    } as Express.Multer.File;

    await expect(service.read(file)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rechaza un archivo renombrado que no es un Excel válido', async () => {
    const file = {
      originalname: 'contenido.xlsx',
      buffer: Buffer.from('contenido no xlsx'),
    } as Express.Multer.File;

    await expect(service.read(file)).rejects.toThrow(
      'No se pudo leer el Excel',
    );
  });

  it('rechaza extensiones no admitidas incluso fuera de Multer', async () => {
    const file = {
      originalname: 'contenido.xls',
      buffer: Buffer.from('archivo'),
    } as Express.Multer.File;

    await expect(service.read(file)).rejects.toThrow(
      'El archivo debe ser .xlsx o .zip',
    );
  });
});
