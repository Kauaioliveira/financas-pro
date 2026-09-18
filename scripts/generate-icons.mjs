#!/usr/bin/env node
// Builds the PWA icons from public/favicon.png. Run again only when the logo changes:
//
//   node scripts/generate-icons.mjs
//
// The generated files are committed (public/icons/*.png), so a normal build and CI
// never depend on this script. Everything here uses Node's zlib only: the project
// does not carry an image library just to resize one logo three times.
import { deflateSync, inflateSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'public', 'favicon.png');
const OUT_DIR = join(ROOT, 'public', 'icons');

/** Background of the logo's rounded square (sampled from favicon.png); also the maskable plate. */
const PLATE = [0, 33, 54];
/** A pixel darker than this on every channel counts as the corner around the logo. */
const CORNER_MAX = 24;
/** Share of the maskable icon taken by the logo; the rest is safe-zone padding. */
const MASKABLE_SCALE = 0.78;

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Decodes an 8-bit, non-interlaced RGB or RGBA PNG into { width, height, rgb }.
 * Enough for our own logo; it refuses anything else instead of guessing.
 */
function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error(SOURCE + ' nao e um PNG.');
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (!header) throw new Error('PNG sem IHDR.');
  if (header.bitDepth !== 8 || header.interlace !== 0 || (header.colorType !== 2 && header.colorType !== 6)) {
    throw new Error(
      'PNG nao suportado (bitDepth ' + header.bitDepth + ', colorType ' + header.colorType + ', interlace ' +
        header.interlace + '). Forneca o logo como PNG RGB ou RGBA de 8 bits, sem entrelacamento.',
    );
  }

  const channels = header.colorType === 6 ? 4 : 3;
  const { width, height } = header;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let value = line[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) value += paeth(a, b, c);
      else if (filter !== 0) throw new Error('Filtro PNG desconhecido: ' + filter);
      out[i] = value & 0xff;
    }
  }

  if (channels === 3) return { width, height, rgb: pixels };
  // Flatten RGBA over the plate colour so the resizer only deals with RGB.
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0, j = 0; i < pixels.length; i += 4, j += 3) {
    const alpha = pixels[i + 3] / 255;
    for (let ch = 0; ch < 3; ch++) rgb[j + ch] = Math.round(pixels[i + ch] * alpha + PLATE[ch] * (1 - alpha));
  }
  return { width, height, rgb };
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng({ width, height, rgb }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Box-filter downscale: averages every source pixel that falls in the target pixel. */
function resize(image, size) {
  const rgb = Buffer.alloc(size * size * 3);
  const scaleX = image.width / size;
  const scaleY = image.height / size;
  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * scaleY);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * scaleY));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * scaleX);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * scaleX));
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let sy = y0; sy < y1 && sy < image.height; sy++) {
        for (let sx = x0; sx < x1 && sx < image.width; sx++) {
          const i = (sy * image.width + sx) * 3;
          r += image.rgb[i];
          g += image.rgb[i + 1];
          b += image.rgb[i + 2];
          count++;
        }
      }
      const out = (y * size + x) * 3;
      rgb[out] = Math.round(r / count);
      rgb[out + 1] = Math.round(g / count);
      rgb[out + 2] = Math.round(b / count);
    }
  }
  return { width: size, height: size, rgb };
}

/**
 * Repaints the black area around the logo's rounded square with the plate colour, so the
 * maskable icon has no dark square inside the circle Android crops it to. The flood fill
 * starts at the four corners, so dark pixels inside the logo itself are kept.
 */
function fillCornersWithPlate(image) {
  const { width, height } = image;
  const rgb = Buffer.from(image.rgb);
  const seen = new Uint8Array(width * height);
  const queue = [0, width - 1, (height - 1) * width, height * width - 1];
  for (const start of queue) seen[start] = 1;

  while (queue.length > 0) {
    const index = queue.pop();
    const i = index * 3;
    if (rgb[i] > CORNER_MAX || rgb[i + 1] > CORNER_MAX || rgb[i + 2] > CORNER_MAX) continue;
    rgb[i] = PLATE[0];
    rgb[i + 1] = PLATE[1];
    rgb[i + 2] = PLATE[2];
    const x = index % width;
    const y = (index - x) / width;
    const neighbours = [];
    if (x > 0) neighbours.push(index - 1);
    if (x < width - 1) neighbours.push(index + 1);
    if (y > 0) neighbours.push(index - width);
    if (y < height - 1) neighbours.push(index + width);
    for (const neighbour of neighbours) {
      if (seen[neighbour]) continue;
      seen[neighbour] = 1;
      queue.push(neighbour);
    }
  }
  return { width, height, rgb };
}

/** Logo centred on a full-bleed plate, small enough to survive the maskable safe zone. */
function maskable(image, size) {
  const inner = resize(fillCornersWithPlate(image), Math.round(size * MASKABLE_SCALE));
  const rgb = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    rgb[i * 3] = PLATE[0];
    rgb[i * 3 + 1] = PLATE[1];
    rgb[i * 3 + 2] = PLATE[2];
  }
  const offset = Math.round((size - inner.width) / 2);
  for (let y = 0; y < inner.height; y++) {
    inner.rgb.copy(rgb, ((y + offset) * size + offset) * 3, y * inner.width * 3, (y + 1) * inner.width * 3);
  }
  return { width: size, height: size, rgb };
}

const source = decodePng(await readFile(SOURCE));
await mkdir(OUT_DIR, { recursive: true });

const outputs = [
  ['icon-192.png', resize(source, 192)],
  ['icon-512.png', resize(source, 512)],
  ['icon-maskable-512.png', maskable(source, 512)],
  ['apple-touch-icon-180.png', resize(source, 180)],
];

for (const [name, image] of outputs) {
  const png = encodePng(image);
  await writeFile(join(OUT_DIR, name), png);
  console.log(name + ': ' + image.width + 'x' + image.height + ', ' + (png.length / 1024).toFixed(1) + ' kB');
}
