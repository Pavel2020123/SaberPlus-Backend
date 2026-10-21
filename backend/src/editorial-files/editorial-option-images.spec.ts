import { ServiceUnavailableException } from '@nestjs/common';
import {
  optionImagesEnabled,
  requireOptionImages,
} from './editorial-option-images';

describe('activación local de imágenes por opción', () => {
  const keys = [
    'NODE_ENV',
    'EDITORIAL_FILES_LOCAL_ENABLED',
    'EDITORIAL_OPTION_IMAGES_LOCAL_ENABLED',
  ] as const;
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  afterEach(() => {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
  it.each([
    ['test', 'true', 'true', true],
    ['development', 'true', 'true', true],
    ['production', 'true', 'true', false],
    ['staging', 'true', 'true', false],
    ['', 'true', 'true', false],
    ['test', 'false', 'true', false],
    ['test', 'true', 'false', false],
    ['test', 'true', '', false],
  ])(
    '%s / archivos=%s / opciones=%s',
    (environment, files, options, expected) => {
      process.env.NODE_ENV = String(environment);
      process.env.EDITORIAL_FILES_LOCAL_ENABLED = String(files);
      process.env.EDITORIAL_OPTION_IMAGES_LOCAL_ENABLED = String(options);
      expect(optionImagesEnabled()).toBe(expected);
      if (expected) expect(() => requireOptionImages()).not.toThrow();
      else
        expect(() => requireOptionImages()).toThrow(
          ServiceUnavailableException,
        );
    },
  );
});
