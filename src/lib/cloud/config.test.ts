import { describe, expect, it } from 'vitest';
import { cloudEnabled, isCloudEnabled } from './config';

const URL = 'https://abcd1234.supabase.co';
const KEY = 'sb_publishable_abc';

describe('isCloudEnabled', () => {
  it('is on only when both public variables are set', () => {
    expect(isCloudEnabled({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_PUBLISHABLE_KEY: KEY })).toBe(true);
  });

  it('is off when a variable is missing or blank', () => {
    expect(isCloudEnabled({})).toBe(false);
    expect(isCloudEnabled({ VITE_SUPABASE_URL: URL })).toBe(false);
    expect(isCloudEnabled({ VITE_SUPABASE_PUBLISHABLE_KEY: KEY })).toBe(false);
    expect(isCloudEnabled({ VITE_SUPABASE_URL: '  ', VITE_SUPABASE_PUBLISHABLE_KEY: KEY })).toBe(false);
  });

  it('can be forced off with VITE_APP_MODE=local', () => {
    expect(
      isCloudEnabled({ VITE_APP_MODE: ' LOCAL ', VITE_SUPABASE_URL: URL, VITE_SUPABASE_PUBLISHABLE_KEY: KEY }),
    ).toBe(false);
  });

  it('is off in the test environment, which has no .env', () => {
    expect(cloudEnabled).toBe(false);
  });
});
