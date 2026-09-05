import { createHash } from 'node:crypto';

export interface QuestionFingerprintOption {
  texto?: string | null;
  imagen?: string | null;
}

export interface QuestionFingerprintInput {
  area: string;
  enunciado: string;
  imagen?: string | null;
  opciones: QuestionFingerprintOption[];
}

const QUESTION_FINGERPRINT_VERSION = 'saberplus-question-v1';

export function createQuestionFingerprint(
  input: QuestionFingerprintInput,
): string {
  const options = input.opciones
    .map((option) =>
      [normalize(option.texto ?? ''), normalize(option.imagen ?? '')].join(
        '\u001e',
      ),
    )
    .sort();

  const canonical = [
    QUESTION_FINGERPRINT_VERSION,
    normalize(input.area),
    normalize(input.enunciado),
    normalize(input.imagen ?? ''),
    ...options,
  ].join('\u001f');

  return createHash('sha256').update(canonical).digest('hex');
}

function normalize(value: string): string {
  return value
    .trim()
    .normalize('NFKC')
    .toLocaleLowerCase('es-CO')
    .replace(/\s+/g, ' ');
}
