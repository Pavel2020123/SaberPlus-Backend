import { BadRequestException } from '@nestjs/common';
import {
  construirAliasInstitucional,
  normalizarSufijoInstitucional,
  normalizarUsuarioInstitucional,
} from './identificador-institucional.policy';

describe('Identificador institucional sin suplantar correo', () => {
  it('canonicaliza mayúsculas y espacios exteriores', () => {
    expect(construirAliasInstitucional(' Juan.01 ', ' Ispecan.COM ')).toBe(
      'juan.01@ispecan.com',
    );
  });
  it('acepta límites explícitos sin truncamiento silencioso', () => {
    expect(normalizarUsuarioInstitucional('a'.repeat(64))).toHaveLength(64);
    expect(() => normalizarUsuarioInstitucional('a'.repeat(65))).toThrow(
      BadRequestException,
    );
  });
  it.each([
    '',
    'juan@colegio.com',
    'José',
    'a b',
    '.juan',
    'juan-',
    'a\nb',
    'аlumno',
  ])('rechaza usuario ambiguo %p', (valor) => {
    expect(() => normalizarUsuarioInstitucional(valor)).toThrow(
      BadRequestException,
    );
  });
  it.each([
    'colegio',
    '@colegio.com',
    'https://colegio.com',
    'a..com',
    '-a.com',
    'a-.com',
    'a.com/x',
    'á.com',
    'a.1',
    'a'.repeat(64) + '.com',
  ])('rechaza sufijo inválido %p', (valor) => {
    expect(() => normalizarSufijoInstitucional(valor)).toThrow(
      BadRequestException,
    );
  });
  it('validar sintaxis no acredita la aprobación del sufijo', () => {
    expect(normalizarSufijoInstitucional('colegio.example')).toBe(
      'colegio.example',
    );
  });
});
