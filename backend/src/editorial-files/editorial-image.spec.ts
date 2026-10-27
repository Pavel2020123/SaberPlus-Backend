import { BadRequestException } from '@nestjs/common';
import * as sharpModule from 'sharp';
import {
  EDITORIAL_INPUT_LIMIT,
  normalizeEditorialImage,
} from './editorial-image';

const sharp = sharpModule as unknown as typeof import('sharp').default;

describe('preparación de imágenes editoriales', () => {
  it.each(['png', 'jpeg', 'webp'] as const)(
    'decodifica %s, conserva proporción y elimina metadatos',
    async (format) => {
      const input = await sharp({
        create: { width: 160, height: 80, channels: 3, background: 'white' },
      })
        .withMetadata()
        .toFormat(format)
        .toBuffer();
      const result = await normalizeEditorialImage(input);
      const metadata = await sharp(result.content).metadata();
      expect(metadata).toMatchObject({
        format: 'webp',
        width: 160,
        height: 80,
      });
      expect(metadata.exif).toBeUndefined();
      expect(result.bytes).toBe(result.content.length);
      expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    },
  );

  it('aplica orientación EXIF y no recorta un gráfico rectangular', async () => {
    const input = await sharp({
      create: { width: 160, height: 80, channels: 3, background: 'blue' },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    expect(await normalizeEditorialImage(input)).toMatchObject({
      ancho: 80,
      alto: 160,
    });
  });

  it('reduce imágenes grandes sin ampliarlas ni cortar su contenido', async () => {
    const input = await sharp({
      create: { width: 4000, height: 1000, channels: 3, background: 'blue' },
    })
      .png()
      .toBuffer();
    expect(await normalizeEditorialImage(input)).toMatchObject({
      ancho: 2560,
      alto: 640,
    });
  });

  it.each([
    Buffer.alloc(0),
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    Buffer.from('GIF89a'),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.from([255, 216, 255, 217]),
    Buffer.alloc(EDITORIAL_INPUT_LIMIT + 1),
  ])('rechaza bytes falsos, incompletos o excesivos', async (input) => {
    await expect(normalizeEditorialImage(input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rechaza imágenes de más de 20 megapíxeles aunque el archivo comprimido sea pequeño', async () => {
    const input = await sharp({
      create: { width: 5000, height: 4100, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    expect(input.length).toBeLessThan(EDITORIAL_INPUT_LIMIT);
    await expect(normalizeEditorialImage(input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
