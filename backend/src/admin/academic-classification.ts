import { BadRequestException } from '@nestjs/common';
import { EstadoContenido } from '@prisma/client';

export function catalogNameKey(nombre: string): string {
  return nombre
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('es-CO')
    .replace(
      /[áéíóúü]/g,
      (letter) => ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' })[letter],
    );
}

export function isGenericCatalogName(nombre: string): boolean {
  return catalogNameKey(nombre) === 'banco general';
}

export function validateCatalogName(value: string): string {
  if (typeof value !== 'string')
    throw new BadRequestException('El nombre es obligatorio.');
  const nombre = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!nombre || nombre.length > 120 || /[\p{Cc}\p{Cf}]/u.test(nombre)) {
    throw new BadRequestException(
      'Usa un nombre de 1 a 120 caracteres, sin caracteres invisibles.',
    );
  }
  if (isGenericCatalogName(nombre)) {
    throw new BadRequestException(
      'Banco General no identifica un tema académico. Elige un nombre específico.',
    );
  }
  return nombre;
}

export function validateAcademicClassification(subtema: {
  nombre: string;
  estadoContenido: EstadoContenido;
  tema: { nombre: string; estadoContenido: EstadoContenido };
}) {
  validateCatalogName(subtema.nombre);
  validateCatalogName(subtema.tema.nombre);
  if (
    subtema.estadoContenido === EstadoContenido.ARCHIVADO ||
    subtema.tema.estadoContenido === EstadoContenido.ARCHIVADO
  ) {
    throw new BadRequestException(
      'Elige un tema y subtema que no estén archivados.',
    );
  }
}
