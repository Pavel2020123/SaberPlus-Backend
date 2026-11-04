import { BadRequestException } from '@nestjs/common';
import { normalizarUsuarioInstitucional } from './identificador-institucional.policy';

export interface FilaEstudianteGestionado {
  fila: number;
  nombre: string;
  usuario: string;
}

/** Bounded preview input, never accepts or echoes passwords from a CSV. */
export function leerCsvEstudiantesGestionados(
  csv: string,
): FilaEstudianteGestionado[] {
  if (Buffer.byteLength(csv, 'utf8') > 1024 * 1024 || csv.includes('\0')) {
    throw new BadRequestException('CSV inválido o mayor de 1 MiB.');
  }
  const contenido = csv.replace(/^\uFEFF/, '');
  const registros: string[][] = [];
  let campos: string[] = [];
  let campo = '';
  let citado = false;
  let cerrado = false;
  function terminarCampo() {
    campos.push(campo.trim());
    if (campos.length > 2)
      throw new BadRequestException('Usa solo las columnas nombre y usuario.');
    campo = '';
    cerrado = false;
  }
  function terminarRegistro() {
    terminarCampo();
    if (campos.some((c) => c.length > 0)) registros.push(campos);
    campos = [];
    if (registros.length > 1001)
      throw new BadRequestException(
        'Previsualiza como máximo 1000 alumnos por archivo.',
      );
  }
  for (let i = 0; i < contenido.length; i++) {
    const c = contenido[i];
    if (citado) {
      if (c === '"') {
        if (contenido[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          citado = false;
          cerrado = true;
        }
      } else campo += c;
    } else if (c === ',') terminarCampo();
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && contenido[i + 1] === '\n') i++;
      terminarRegistro();
    } else if (c === '"') {
      if (campo.length || cerrado)
        throw new BadRequestException('Comillas inválidas en el CSV.');
      citado = true;
    } else {
      if (cerrado)
        throw new BadRequestException(
          'Hay texto después de cerrar comillas en el CSV.',
        );
      campo += c;
    }
  }
  if (citado)
    throw new BadRequestException('Hay comillas sin cerrar en el CSV.');
  if (campo.length || campos.length || cerrado) terminarRegistro();
  const encabezado = registros.shift()?.map((c) => c.toLowerCase());
  if (
    !encabezado ||
    encabezado.length !== 2 ||
    new Set(encabezado).size !== 2 ||
    !encabezado.includes('nombre') ||
    !encabezado.includes('usuario')
  ) {
    throw new BadRequestException(
      'El CSV debe contener únicamente nombre y usuario. No incluyas contraseñas.',
    );
  }
  if (!registros.length)
    throw new BadRequestException('El CSV no contiene alumnos.');
  const vistos = new Set<string>();
  return registros.map((registro, indice) => {
    const fila = indice + 2;
    const nombre = registro[encabezado.indexOf('nombre')] ?? '';
    if (
      registro.length !== 2 ||
      !nombre ||
      nombre.length > 120 ||
      [...nombre].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
    ) {
      throw new BadRequestException(
        `Revisa nombre y columnas del registro ${fila}.`,
      );
    }
    const usuario = normalizarUsuarioInstitucional(
      registro[encabezado.indexOf('usuario')] ?? '',
    );
    if (vistos.has(usuario))
      throw new BadRequestException(`Usuario repetido en el registro ${fila}.`);
    vistos.add(usuario);
    return { fila, nombre, usuario };
  });
}
