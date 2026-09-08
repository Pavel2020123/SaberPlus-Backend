import { BadRequestException } from '@nestjs/common';

export type ClozeActivity = {
  textoConEspacios: string;
  espacios: { opciones: string[]; correctaIndex: number }[];
};

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    !keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  )
    throw new BadRequestException(
      'CLOZE: estructura incompleta o campos desconocidos.',
    );
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number, label: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    /[\p{Cc}\p{Cf}]/u.test(value.replace(/[\t\r\n]/g, ''))
  )
    throw new BadRequestException(
      `CLOZE: ${label} debe ser texto visible de hasta ${max} caracteres.`,
    );
  return value.trim();
}

/** Shared by draft writes and publication review, including legacy JSON. */
export function validateClozeActivity(value: unknown): ClozeActivity {
  const data = object(value, ['textoConEspacios', 'espacios']);
  const textoConEspacios = text(data.textoConEspacios, 12000, 'el enunciado');
  if (
    !Array.isArray(data.espacios) ||
    data.espacios.length < 1 ||
    data.espacios.length > 20
  )
    throw new BadRequestException('CLOZE: incluye entre 1 y 20 espacios.');
  const markers = textoConEspacios.match(/_{3,}/g) ?? [];
  if (
    markers.length !== data.espacios.length ||
    markers.some((marker) => marker !== '___')
  )
    throw new BadRequestException(
      'CLOZE: usa exactamente un marcador ___ por espacio, en orden de lectura.',
    );
  const espacios = data.espacios.map((value, i) => {
    const blank = object(value, ['opciones', 'correctaIndex']);
    if (
      !Array.isArray(blank.opciones) ||
      blank.opciones.length < 2 ||
      blank.opciones.length > 6
    )
      throw new BadRequestException(
        `CLOZE: el espacio ${i + 1} necesita entre 2 y 6 opciones.`,
      );
    const opciones = blank.opciones.map((option) =>
      text(option, 500, 'cada opción'),
    );
    const keys = opciones.map((option) =>
      option.normalize('NFKC').toLocaleLowerCase('es-CO').replace(/\s+/g, ' '),
    );
    if (new Set(keys).size !== keys.length)
      throw new BadRequestException(
        `CLOZE: hay opciones repetidas en el espacio ${i + 1}.`,
      );
    const correctaIndex = blank.correctaIndex;
    if (
      typeof correctaIndex !== 'number' ||
      !Number.isInteger(correctaIndex) ||
      correctaIndex < 0 ||
      correctaIndex >= opciones.length
    )
      throw new BadRequestException(
        `CLOZE: selecciona una respuesta correcta válida para el espacio ${i + 1}.`,
      );
    return { opciones, correctaIndex };
  });
  return { textoConEspacios, espacios };
}
