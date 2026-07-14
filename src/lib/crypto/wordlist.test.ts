import { describe, expect, it } from 'vitest';
import { generateRecoveryPhrase, normalizePhrase } from './wordlist';

describe('generateRecoveryPhrase', () => {
  it('returns 12 lowercase words by default', () => {
    const phrase = generateRecoveryPhrase();
    const words = phrase.split(' ');
    expect(words).toHaveLength(12);
    for (const word of words) {
      expect(word).toMatch(/^[a-z]+$/);
    }
  });

  it('honors an explicit word count', () => {
    expect(generateRecoveryPhrase(6).split(' ')).toHaveLength(6);
    expect(generateRecoveryPhrase(1).split(' ')).toHaveLength(1);
  });

  it('produces different phrases across calls (extremely unlikely to collide)', () => {
    const a = generateRecoveryPhrase(12);
    const b = generateRecoveryPhrase(12);
    expect(a).not.toBe(b);
  });
});

describe('normalizePhrase', () => {
  it('lowercases the phrase', () => {
    expect(normalizePhrase('ABACATE ABRACO')).toBe('abacate abraco');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizePhrase('  abacate abraco  ')).toBe('abacate abraco');
  });

  it('collapses internal repeated whitespace to a single space', () => {
    expect(normalizePhrase('abacate    abraco\tacesso')).toBe('abacate abraco acesso');
  });

  it('combines all normalizations together', () => {
    expect(normalizePhrase('  ABACATE   Abraco  ACESSO ')).toBe('abacate abraco acesso');
  });
});
