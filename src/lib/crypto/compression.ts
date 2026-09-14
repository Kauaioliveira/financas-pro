export type CompressionFormat = 'gzip';

function toBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function pipe(bytes: Uint8Array, transform: GenericTransformStream): Promise<Uint8Array> {
  const stream = new Blob([toBuffer(bytes)]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function compress(bytes: Uint8Array): Promise<Uint8Array> {
  return pipe(bytes, new CompressionStream('gzip'));
}

export async function decompress(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    return await pipe(bytes, new DecompressionStream('gzip'));
  } catch {
    throw new Error('Dados comprimidos corrompidos.');
  }
}
