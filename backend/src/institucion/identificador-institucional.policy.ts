import { BadRequestException } from '@nestjs/common';

/** Canonical ASCII identifiers: reject ambiguity instead of transliterating names. */
export function normalizarUsuarioInstitucional(valor: string): string {
  const usuario = valor.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(usuario)) {
    throw new BadRequestException(
      'Usuario inválido: usa de 1 a 64 letras sin tildes, números, puntos, guiones o guiones bajos, comenzando y terminando en letra o número.',
    );
  }
  return usuario;
}

/** This only checks syntax, never grants approval or ownership of a mail domain. */
export function normalizarSufijoInstitucional(valor: string): string {
  const sufijo = valor.trim().toLowerCase();
  const etiquetas = sufijo.split('.');
  if (
    sufijo.length > 189 ||
    etiquetas.length < 2 ||
    !etiquetas.every((e) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(e)) ||
    !/^[a-z]{2,63}$/.test(etiquetas[etiquetas.length - 1])
  ) {
    throw new BadRequestException(
      'Sufijo institucional inválido. No incluyas @, enlaces ni espacios.',
    );
  }
  return sufijo;
}

export function construirAliasInstitucional(
  usuario: string,
  sufijo: string,
): string {
  return `${normalizarUsuarioInstitucional(usuario)}@${normalizarSufijoInstitucional(sufijo)}`;
}
