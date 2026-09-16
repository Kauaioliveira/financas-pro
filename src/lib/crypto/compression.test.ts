import { describe, expect, it } from 'vitest';
import { compress, decompress } from './compression';
import { fromBase64 } from './utils';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe('compress / decompress (gzip)', () => {
  it('round-trips UTF-8 text', async () => {
    const text = JSON.stringify({ descrição: 'Padaria São João', valor: -12.5 });
    const packed = await compress(encoder.encode(text));
    expect(decoder.decode(await decompress(packed))).toBe(text);
  });

  it('emits standard gzip (magic bytes 1f 8b) and shrinks repetitive data', async () => {
    const text = JSON.stringify(
      Array.from({ length: 500 }, (_, i) => ({ id: `t${i}`, description: 'Mercado', amount: -10 })),
    );
    const packed = await compress(encoder.encode(text));
    expect(packed[0]).toBe(0x1f);
    expect(packed[1]).toBe(0x8b);
    expect(packed.length).toBeLessThan(text.length / 5);
  });

  it('reads gzip produced by another implementation (node:zlib fixed vector)', async () => {
    const fromZlib = fromBase64('H4sIAAAAAAAACnPLzEvMO7w8sTigKF/hUcMUheT8tKJUhZRUhZLU4pJUAH6wgOsfAAAA');
    expect(decoder.decode(await decompress(fromZlib))).toBe('FinançasPro — cofre de teste');
  });

  it('round-trips an empty input', async () => {
    const packed = await compress(new Uint8Array());
    expect((await decompress(packed)).length).toBe(0);
  });

  it('rejects data that is not gzip', async () => {
    await expect(decompress(encoder.encode('isto não é gzip'))).rejects.toThrow(
      'Dados comprimidos corrompidos.',
    );
  });
});
