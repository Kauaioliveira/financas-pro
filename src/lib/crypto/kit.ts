import { RECOVERY_WORD_COUNT } from './constants';
import { fromBase64, subtle, toHex } from './utils';

export const KIT_CONFIRMATION_COUNT = 3;
const KIT_ID_HEX_CHARS = 6;
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

/** Short public id: first 6 hex chars of SHA-256 over the wrapped key bytes. */
export async function computeKitId(recoveryWrapBase64: string): Promise<string> {
  const bytes = fromBase64(recoveryWrapBase64);
  const digest = await subtle.digest('SHA-256', bytes.slice().buffer);
  return toHex(new Uint8Array(digest)).slice(0, KIT_ID_HEX_CHARS);
}

export function splitPhrase(phrase: string): string[] {
  return phrase.trim().split(/\s+/).filter(Boolean);
}

/** Lowercase, trimmed and without accents, so "Leão" matches "leao". */
export function normalizeKitWord(word: string): string {
  return word.normalize('NFD').replace(COMBINING_MARKS, '').trim().toLowerCase();
}

/** Distinct 1-based positions in ascending order, drawn with crypto randomness. */
export function pickConfirmationPositions(
  wordCount: number = RECOVERY_WORD_COUNT,
  count: number = KIT_CONFIRMATION_COUNT,
): number[] {
  if (count > wordCount) throw new Error('Mais posições pedidas do que palavras no kit.');
  const pool = Array.from({ length: wordCount }, (_, i) => i + 1);
  const random = crypto.getRandomValues(new Uint32Array(count));
  for (let i = 0; i < count; i++) {
    const j = i + (random[i] % (wordCount - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}

/** Returns the 1-based positions whose answer does not match the phrase. */
export function findWrongConfirmationWords(
  phrase: string,
  answers: Record<number, string>,
): number[] {
  const words = splitPhrase(phrase);
  return Object.keys(answers)
    .map(Number)
    .filter(position => {
      const expected = words[position - 1];
      return (
        expected === undefined ||
        normalizeKitWord(answers[position] ?? '') !== normalizeKitWord(expected)
      );
    })
    .sort((a, b) => a - b);
}
