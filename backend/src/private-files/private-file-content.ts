import { BadRequestException } from '@nestjs/common';
import * as sharpModule from 'sharp';
import {
  normalizeEditorialImage,
  sha256,
} from '../editorial-files/editorial-image';

const sharp = sharpModule as unknown as typeof import('sharp').default;
export const PRIVATE_FILE_INPUT_LIMIT = 5 * 1024 * 1024;
export const PROFILE_PHOTO_OUTPUT_LIMIT = 200 * 1024;

export type PreparedPrivateContent = Readonly<{
  content: Buffer;
  sha256: string;
  bytes: number;
  mime: 'image/webp' | 'application/pdf';
}>;

const prepared = (
  content: Buffer,
  mime: PreparedPrivateContent['mime'],
): PreparedPrivateContent => ({
  content,
  mime,
  bytes: content.length,
  sha256: sha256(content),
});

/** Re-encodes decoded pixels, never trusts a filename, MIME claim or URL. */
export async function prepareProfilePhoto(input: Buffer) {
  const image = await normalizeEditorialImage(input);
  const side = Math.min(512, image.ancho, image.alto);
  const content = await sharp(image.content)
    .resize(side, side, { fit: 'cover' })
    .webp({ quality: 85 })
    .toBuffer();
  if (content.length > PROFILE_PHOTO_OUTPUT_LIMIT)
    throw new BadRequestException(
      'La foto preparada debe ocupar hasta 200 KiB.',
    );
  return prepared(content, 'image/webp');
}

/**
 * PDF admission is a bounded envelope check, NOT malware scanning or sanitizing.
 * Accepted PDF bytes must only be served as private attachment with nosniff;
 * they must never be executed, rendered server-side or embedded as trusted HTML.
 */
export async function prepareInstitutionEvidence(input: Buffer) {
  if (!input?.length || input.length > PRIVATE_FILE_INPUT_LIMIT)
    throw new BadRequestException('Selecciona un archivo de hasta 5 MiB.');
  if (input.subarray(0, 5).toString('ascii') === '%PDF-') {
    const header = input.subarray(0, 9).toString('latin1');
    const tail = input
      .subarray(Math.max(0, input.length - 1024))
      .toString('latin1');
    const eof = tail.lastIndexOf('%%EOF');
    const trailingWhitespace =
      eof >= 0 &&
      [...tail.slice(eof + 5)].every((character) =>
        [9, 10, 12, 13, 32].includes(character.charCodeAt(0)),
      );
    if (!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(header) || !trailingWhitespace)
      throw new BadRequestException(
        'El adjunto no tiene una envoltura PDF admitida.',
      );
    return prepared(Buffer.from(input), 'application/pdf');
  }
  const image = await normalizeEditorialImage(input);
  return prepared(image.content, 'image/webp');
}
