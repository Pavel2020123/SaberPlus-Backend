import { BadRequestException, Injectable } from '@nestjs/common';
import readExcelFile, { CellValue, SheetData } from 'read-excel-file/node';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { Entry, fromBufferPromise, ZipFile } from 'yauzl';

const MAX_ZIP_ENTRIES = 350;
const MAX_UNCOMPRESSED_BYTES = 60 * 1024 * 1024;
const MAX_ENTRY_BYTES = 15 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 100;
const ALLOWED_ASSET_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

export interface ContentPackageAsset {
  path: string;
  bytes: number;
  sha256: string;
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp';
}

export interface ReadContentPackageResult {
  packageType: 'XLSX' | 'ZIP';
  workbookName: string;
  sheets: Map<string, SheetData>;
  assets: Map<string, ContentPackageAsset>;
  packageEntries: number;
}

@Injectable()
export class ContentPackageReaderService {
  async read(file: Express.Multer.File): Promise<ReadContentPackageResult> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('El archivo de importación está vacío.');
    }

    const lowerName = file.originalname.toLowerCase();
    if (lowerName.endsWith('.xlsx')) {
      return {
        packageType: 'XLSX',
        workbookName: file.originalname,
        sheets: await this.readWorkbook(file.buffer),
        assets: new Map(),
        packageEntries: 1,
      };
    }
    if (!lowerName.endsWith('.zip')) {
      throw new BadRequestException('El archivo debe ser .xlsx o .zip.');
    }
    return this.readZip(file.buffer);
  }

  private async readZip(buffer: Buffer): Promise<ReadContentPackageResult> {
    let zip: ZipFile;
    try {
      zip = await fromBufferPromise(buffer, {
        lazyEntries: true,
        decodeStrings: true,
        validateEntrySizes: true,
        strictFileNames: true,
      });
    } catch {
      throw new BadRequestException('El paquete ZIP no es válido.');
    }

    if (zip.entryCount > MAX_ZIP_ENTRIES) {
      zip.close();
      throw new BadRequestException(
        `El ZIP supera el máximo de ${MAX_ZIP_ENTRIES} archivos.`,
      );
    }

    const files = new Map<string, { originalPath: string; buffer: Buffer }>();
    let totalUncompressed = 0;
    try {
      for await (const entry of zip.eachEntry()) {
        const path = this.validateEntryPath(entry);
        if (!path || this.isIgnoredMetadata(path)) continue;
        if (path.endsWith('/')) continue;

        const extension = extname(path).toLowerCase();
        if (extension !== '.xlsx' && !ALLOWED_ASSET_EXTENSIONS.has(extension)) {
          throw new BadRequestException(
            `El ZIP contiene un tipo de archivo no permitido: ${path}.`,
          );
        }
        if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
          throw new BadRequestException(
            `El archivo ${path} supera el límite individual de 15 MB.`,
          );
        }
        totalUncompressed += entry.uncompressedSize;
        if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
          throw new BadRequestException(
            'El contenido descomprimido del ZIP supera 60 MB.',
          );
        }
        if (
          entry.compressedSize > 0 &&
          entry.uncompressedSize / entry.compressedSize > MAX_COMPRESSION_RATIO
        ) {
          throw new BadRequestException(
            `El archivo ${path} tiene una relación de compresión insegura.`,
          );
        }

        const normalizedKey = path.toLocaleLowerCase('es-CO');
        if (files.has(normalizedKey)) {
          throw new BadRequestException(
            `El ZIP repite la ruta ${path}, incluso cambiando mayúsculas.`,
          );
        }
        files.set(normalizedKey, {
          originalPath: path,
          buffer: await this.readEntry(zip, entry),
        });
      }
    } finally {
      zip.close();
    }

    const workbooks = [...files.values()].filter(
      (item) => extname(item.originalPath).toLowerCase() === '.xlsx',
    );
    if (workbooks.length !== 1) {
      throw new BadRequestException(
        'El ZIP debe contener exactamente un archivo .xlsx.',
      );
    }

    const assets = new Map<string, ContentPackageAsset>();
    for (const [key, item] of files) {
      if (extname(item.originalPath).toLowerCase() === '.xlsx') continue;
      const mediaType = this.detectImageType(item.buffer, item.originalPath);
      assets.set(key, {
        path: item.originalPath,
        bytes: item.buffer.length,
        sha256: createHash('sha256').update(item.buffer).digest('hex'),
        mediaType,
      });
    }

    return {
      packageType: 'ZIP',
      workbookName: workbooks[0].originalPath,
      sheets: await this.readWorkbook(workbooks[0].buffer),
      assets,
      packageEntries: files.size,
    };
  }

  private validateEntryPath(entry: Entry): string {
    if ((entry.generalPurposeBitFlag & 0x1) !== 0) {
      throw new BadRequestException('No se aceptan archivos ZIP cifrados.');
    }
    const unixMode = (entry.externalFileAttributes >>> 16) & 0o170000;
    if (unixMode === 0o120000) {
      throw new BadRequestException(
        'No se aceptan enlaces simbólicos en el ZIP.',
      );
    }

    const path = entry.fileName.replaceAll('\\', '/');
    const segments = path.split('/');
    if (
      path.includes('\0') ||
      path.startsWith('/') ||
      /^[a-zA-Z]:/.test(path) ||
      segments.some((segment) => segment === '..' || segment === '.')
    ) {
      throw new BadRequestException(
        `El ZIP contiene una ruta insegura: ${entry.fileName}.`,
      );
    }
    return path;
  }

  private isIgnoredMetadata(path: string) {
    const lower = path.toLocaleLowerCase('es-CO');
    return (
      lower.startsWith('__macosx/') ||
      lower === '.ds_store' ||
      lower.endsWith('/.ds_store')
    );
  }

  private async readEntry(zip: ZipFile, entry: Entry) {
    const stream = await zip.openReadStreamPromise(entry);
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of stream) {
      const rawChunk: unknown = chunk;
      if (!Buffer.isBuffer(rawChunk) && typeof rawChunk !== 'string') {
        stream.destroy();
        throw new BadRequestException(
          `No se pudo leer correctamente el archivo ${entry.fileName}.`,
        );
      }
      const value = Buffer.from(rawChunk);
      bytes += value.length;
      if (bytes > MAX_ENTRY_BYTES) {
        stream.destroy();
        throw new BadRequestException(
          `El archivo ${entry.fileName} supera el límite permitido.`,
        );
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  }

  private async readWorkbook(buffer: Buffer) {
    try {
      const workbookSheets = await readExcelFile(buffer);
      if (workbookSheets.length === 0) {
        throw new Error('Workbook without sheets');
      }
      return new Map(
        workbookSheets.map((sheet) => [
          sheet.sheet.toLocaleLowerCase('es-CO'),
          sheet.data.map((row) => row.map((cell) => cell as CellValue)),
        ]),
      );
    } catch {
      throw new BadRequestException(
        'No se pudo leer el Excel. Verifica que sea un archivo .xlsx válido.',
      );
    }
  }

  private detectImageType(
    buffer: Buffer,
    path: string,
  ): ContentPackageAsset['mediaType'] {
    const extension = extname(path).toLowerCase();
    const isPng =
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
    const isJpeg =
      buffer.length >= 3 &&
      buffer.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
    const isWebp =
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP';

    if (extension === '.png' && isPng) return 'image/png';
    if ((extension === '.jpg' || extension === '.jpeg') && isJpeg) {
      return 'image/jpeg';
    }
    if (extension === '.webp' && isWebp) return 'image/webp';
    throw new BadRequestException(
      `La extensión o firma de la imagen ${path} no es válida.`,
    );
  }
}
