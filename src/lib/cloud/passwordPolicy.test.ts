import { describe, expect, it } from 'vitest';
import { CLOUD_PASSWORD_MIN_LENGTH, checkCloudPassword } from './passwordPolicy';

describe('checkCloudPassword', () => {
  it('accepts a long, unusual passphrase', () => {
    expect(checkCloudPassword('girafa azul come pastel')).toBeNull();
    expect(checkCloudPassword('Vento-Norte-Caju-17')).toBeNull();
  });

  it('requires 12 characters, counted as characters and not bytes (edge)', () => {
    expect(CLOUD_PASSWORD_MIN_LENGTH).toBe(12);
    expect(checkCloudPassword('curta123')).toMatch(/pelo menos 12/);
    expect(checkCloudPassword('çãéíõúàêôâüñ')).toBeNull();
    expect(checkCloudPassword('çãéíõúàêôâü')).toMatch(/pelo menos 12/);
  });

  it('rejects common passwords, repetitions and sequences', () => {
    for (const password of [
      '123456789012',
      'Password1234',
      'senha1234567',
      'FLAMENGO2024!!',
      'senhasenhasenha',
      'aaaaaaaaaaaaaa',
      'abcdefghijklm',
      '987654321098',
      '1212121212121',
      'Palmeiras@2026',
    ]) {
      expect(checkCloudPassword(password), password).toMatch(/muito comum/);
    }
  });

  it('rejects the e-mail inside the password', () => {
    expect(checkCloudPassword('kauaioliver95-2026!', 'KauaiOliver95@gmail.com')).toMatch(/e-mail/);
    expect(checkCloudPassword('girafa azul come pastel', 'ana@x.com')).toBeNull();
  });
});
