import { describe, expect, it } from 'vitest';
import { toBase64, fromBase64, toHex, fromHex, concatBytes, getRandomBytes } from './utils';

describe('toBase64 / fromBase64', () => {
  it('round-trips an empty array', () => {
    const bytes = new Uint8Array([]);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it('round-trips boundary byte values 0x00 and 0xFF', () => {
    const bytes = new Uint8Array([0x00, 0xff, 0x00, 0xff, 0x7f, 0x80]);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it('round-trips arbitrary bytes', () => {
    const bytes = getRandomBytes(64);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });
});

describe('toHex / fromHex', () => {
  it('round-trips an empty array', () => {
    const bytes = new Uint8Array([]);
    expect(fromHex(toHex(bytes))).toEqual(bytes);
    expect(toHex(bytes)).toBe('');
  });

  it('round-trips boundary byte values 0x00 and 0xFF', () => {
    const bytes = new Uint8Array([0x00, 0xff, 0x00, 0xff]);
    expect(toHex(bytes)).toBe('00ff00ff');
    expect(fromHex(toHex(bytes))).toEqual(bytes);
  });

  it('pads single-digit hex values with a leading zero', () => {
    const bytes = new Uint8Array([0x01, 0x0a, 0x0f]);
    expect(toHex(bytes)).toBe('010a0f');
  });
});

describe('concatBytes', () => {
  it('concatenates multiple arrays in order', () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3]);
    const c = new Uint8Array([4, 5, 6]);
    expect(concatBytes(a, b, c)).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
  });

  it('handles empty input', () => {
    expect(concatBytes()).toEqual(new Uint8Array([]));
  });

  it('handles a single array', () => {
    const a = new Uint8Array([9, 8, 7]);
    expect(concatBytes(a)).toEqual(a);
  });
});

describe('getRandomBytes', () => {
  it('returns an array of the requested length', () => {
    expect(getRandomBytes(0)).toHaveLength(0);
    expect(getRandomBytes(16)).toHaveLength(16);
    expect(getRandomBytes(32)).toHaveLength(32);
  });

  it('returns different values across calls (extremely unlikely to collide)', () => {
    const a = getRandomBytes(32);
    const b = getRandomBytes(32);
    expect(a).not.toEqual(b);
  });
});
