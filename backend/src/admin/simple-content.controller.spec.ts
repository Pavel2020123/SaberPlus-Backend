import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminGuard } from '../auth/jwt.guard';
import { SimpleContentController } from './simple-content.controller';
import { requireDirectPublication, lessonUrl } from './direct-publication';

describe('Contenido simple', () => {
  it('todas las rutas requieren ADMIN', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, SimpleContentController),
    ).toEqual([AdminGuard]);
  });
  it('no permite publicar con la bandera apagada', () => {
    const previous = process.env.EDITORIAL_PUBLICATION_ENABLED;
    try {
      delete process.env.EDITORIAL_PUBLICATION_ENABLED;
      expect(() => requireDirectPublication()).toThrow(
        'No se guardó ningún cambio',
      );
      process.env.EDITORIAL_PUBLICATION_ENABLED = 'true';
      expect(() => requireDirectPublication()).not.toThrow();
    } finally {
      if (previous === undefined)
        delete process.env.EDITORIAL_PUBLICATION_ENABLED;
      else process.env.EDITORIAL_PUBLICATION_ENABLED = previous;
    }
  });
  it('valida referencias heredadas antes de publicar padres', () => {
    expect(lessonUrl('')).toBeNull();
    expect(lessonUrl('https://example.com/image.png')).toBe(
      'https://example.com/image.png',
    );
    expect(() => lessonUrl('javascript:alert(1)')).toThrow();
    expect(() => lessonUrl('https://user:secret@example.com')).toThrow();
  });
});
