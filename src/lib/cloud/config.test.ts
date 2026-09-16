import { describe, expect, it } from 'vitest';
import { cloudEnabled, connectSrcFor, isCloudEnabled, isSecretSupabaseKey, readCloudConfig } from './config';

const URL = 'https://abcd1234.supabase.co';
const KEY = 'sb_publishable_abc';

function jwt(payload: object): string {
  const b64 = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.signature`;
}

describe('isCloudEnabled', () => {
  it('is on only when both public variables are set', () => {
    expect(isCloudEnabled({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_ANON_KEY: KEY })).toBe(true);
    expect(isCloudEnabled({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_PUBLISHABLE_KEY: KEY })).toBe(true);
  });

  it('is off when a variable is missing or blank', () => {
    expect(isCloudEnabled({})).toBe(false);
    expect(isCloudEnabled({ VITE_SUPABASE_URL: URL })).toBe(false);
    expect(isCloudEnabled({ VITE_SUPABASE_ANON_KEY: KEY })).toBe(false);
    expect(isCloudEnabled({ VITE_SUPABASE_URL: '  ', VITE_SUPABASE_ANON_KEY: KEY })).toBe(false);
  });

  it('can be forced off with VITE_FORCE_LOCAL or VITE_APP_MODE=local', () => {
    const env = { VITE_SUPABASE_URL: URL, VITE_SUPABASE_ANON_KEY: KEY };
    expect(isCloudEnabled({ ...env, VITE_FORCE_LOCAL: 'true' })).toBe(false);
    expect(isCloudEnabled({ ...env, VITE_FORCE_LOCAL: ' 1 ' })).toBe(false);
    expect(isCloudEnabled({ ...env, VITE_FORCE_LOCAL: 'false' })).toBe(true);
    expect(isCloudEnabled({ ...env, VITE_APP_MODE: ' LOCAL ' })).toBe(false);
  });

  it('is off in the test environment, which has no .env', () => {
    expect(cloudEnabled).toBe(false);
  });
});

describe('readCloudConfig', () => {
  it('returns the origin and the key', () => {
    expect(readCloudConfig({ VITE_SUPABASE_URL: `${URL}/`, VITE_SUPABASE_ANON_KEY: ` ${KEY} ` })).toEqual({
      url: URL,
      anonKey: KEY,
    });
  });

  it('refuses secret keys (edge: legacy service_role JWT)', () => {
    expect(() => readCloudConfig({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_ANON_KEY: 'sb_secret_xyz' })).toThrow(
      /chave secreta/,
    );
    expect(isSecretSupabaseKey(jwt({ role: 'service_role' }))).toBe(true);
    expect(isSecretSupabaseKey(jwt({ role: 'anon' }))).toBe(false);
    expect(isCloudEnabled({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_ANON_KEY: 'sb_secret_xyz' })).toBe(true);
  });

  it('refuses a non-https or malformed URL', () => {
    expect(() =>
      readCloudConfig({ VITE_SUPABASE_URL: 'http://abcd.supabase.co', VITE_SUPABASE_ANON_KEY: KEY }),
    ).toThrow(/https/);
    expect(() => readCloudConfig({ VITE_SUPABASE_URL: 'nota url', VITE_SUPABASE_ANON_KEY: KEY })).toThrow(/URL/);
    expect(
      readCloudConfig({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: KEY })?.url,
    ).toBe('http://127.0.0.1:54321');
  });
});

describe('connectSrcFor', () => {
  it("stays 'self' in local builds and adds only the project origin in cloud builds", () => {
    expect(connectSrcFor(null)).toBe("'self'");
    const config = readCloudConfig({ VITE_SUPABASE_URL: `${URL}/rest/v1`, VITE_SUPABASE_ANON_KEY: KEY });
    expect(connectSrcFor(config)).toBe(`'self' ${URL}`);
  });
});
