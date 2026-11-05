import * as sharpModule from 'sharp';
import { BadRequestException } from '@nestjs/common';
import {
  prepareInstitutionEvidence,
  prepareProfilePhoto,
  PRIVATE_FILE_INPUT_LIMIT,
} from './private-file-content';
import { sha256 } from '../editorial-files/editorial-image';

const sharp = sharpModule as unknown as typeof import('sharp').default;

describe('C5 private file admission (not a malware scanner)', () => {
  const image = () =>
    sharp({
      create: {
        width: 800,
        height: 400,
        channels: 3,
        background: '#125689',
      },
    })
      .png()
      .toBuffer();

  it('prepares a bounded profile from pixels and removes source metadata', async () => {
    const input = await sharp(await image())
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const result = await prepareProfilePhoto(input);
    const metadata = await sharp(result.content).metadata();
    expect(result.mime).toBe('image/webp');
    expect(metadata.width).toBeLessThanOrEqual(512);
    expect(metadata.height).toBe(metadata.width);
    expect(metadata.exif).toBeUndefined();
    expect(result.bytes).toBeLessThanOrEqual(200 * 1024);
    expect(result.sha256).toBe(sha256(result.content));
  });

  it('preserves the aspect ratio of evidence images', async () => {
    const result = await prepareInstitutionEvidence(await image());
    const metadata = await sharp(result.content).metadata();
    expect(metadata.width).toBe(800);
    expect(metadata.height).toBe(400);
    expect(result.mime).toBe('image/webp');
  });

  it.each(['1.0', '1.7', '2.0'])(
    'admits PDF %s as untrusted bytes without executing it',
    async (version) => {
      // Envelope fixture, deliberately NOT a structurally validated PDF.
      const input = Buffer.from(`%PDF-${version}\n/private-content\n%%EOF\n`);
      const result = await prepareInstitutionEvidence(input);
      expect(result.mime).toBe('application/pdf');
      expect(result.content.equals(input)).toBe(true);
      input.fill(0);
      expect(result.sha256).toBe(sha256(result.content));
      expect(result.content[0]).toBe(37);
    },
  );

  it.each([
    '',
    '<svg xmlns="http://www.w3.org/2000/svg"/>',
    '<html>file</html>',
    '%PDF-1.8\n%%EOF',
    '%PDF-1.7 %%EOF',
    '%PDF-1.7\nno eof',
    '%PDF-1.7\n%%EOF\n<script>',
  ])('rejects unsupported evidence envelope %#', async (input) => {
    await expect(
      prepareInstitutionEvidence(Buffer.from(input)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not admit a PDF as a profile picture', async () => {
    await expect(
      prepareProfilePhoto(Buffer.from('%PDF-1.7\n%%EOF')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects oversized input before decoding', async () => {
    const input = Buffer.alloc(PRIVATE_FILE_INPUT_LIMIT + 1);
    await expect(prepareProfilePhoto(input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(prepareInstitutionEvidence(input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
