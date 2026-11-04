import { BadRequestException } from '@nestjs/common';
import { leerCsvEstudiantesGestionados } from './managed-student-csv.policy';

describe('Previsualización CSV gestionado', () => {
  it('acepta BOM, CRLF, columnas en otro orden, coma citada y comillas escapadas', () => {
    expect(
      leerCsvEstudiantesGestionados(
        '\uFEFFusuario,nombre\r\nJUAN,"Juan, ""Pepe"""\r\n',
      ),
    ).toEqual([{ fila: 2, nombre: 'Juan, "Pepe"', usuario: 'juan' }]);
  });
  it.each([
    '',
    'nombre,usuario',
    'nombre,correo\nAna,a',
    'nombre,usuario,contrasena\nAna,a,Secreto1',
    'nombre,nombre\nAna,a',
    'nombre,usuario\nAna,a\nOtra,A',
    'nombre,usuario\n"Ana,a',
    'nombre,usuario\n"Ana"x,a',
    'nombre,usuario\nA"na,a',
    'nombre,usuario\nAna,a,extra',
    'nombre,usuario\n"Ana\nOtra",ana',
    'nombre,usuario\nAna,',
  ])('rechaza CSV inválido sin devolver secretos %p', (csv) => {
    expect(() => leerCsvEstudiantesGestionados(csv)).toThrow(
      BadRequestException,
    );
  });
  it('acota bytes y registros antes de confirmar altas', () => {
    expect(() =>
      leerCsvEstudiantesGestionados('x'.repeat(1024 * 1024 + 1)),
    ).toThrow(BadRequestException);
    expect(() =>
      leerCsvEstudiantesGestionados(
        'nombre,usuario\n' +
          Array.from({ length: 1001 }, (_, i) => `Ana,a${i}`).join('\n'),
      ),
    ).toThrow(BadRequestException);
  });
});
