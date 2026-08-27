/**
 * Synthetic placeholder images for the demo dataset — DEVELOPMENT ONLY.
 *
 * Named `zzshow-` rather than `zztest-` for the reason given at the top of
 * scripts/seed-demo.mjs: `ZZTEST` is already owned by three verification
 * suites that delete by that prefix.
 *
 * =============================================================================
 * WHY PNG AND NOT SVG
 * =============================================================================
 * `isSafePhotoPath` in src/lib/validation.ts accepts `.jpg .jpeg .png .webp
 * .avif` and nothing else. An SVG path is refused before it reaches the
 * database, so an SVG fixture could never be attached to a record. PNG it is.
 *
 * =============================================================================
 * WHY THERE IS A PNG ENCODER IN HERE
 * =============================================================================
 * Writing one is about forty lines against `node:zlib`, which ships with Node.
 * Adding an image library to draw coloured rectangles would put a dependency in
 * the tree of a project that has eight, for a development fixture that never
 * reaches production. Not worth it.
 *
 * =============================================================================
 * THESE MUST NOT LOOK LIKE PEOPLE
 * =============================================================================
 * Every tile is flat diagonal stripes in the brand colours with a hard border
 * and a corner block. No face, no silhouette, no photograph. At a glance it is
 * obviously a placeholder, which is the point: if one of these ever appeared on
 * a real page it would be unmistakable rather than plausible.
 *
 * The file paths carry `zzshow` too, so the synthetic origin is visible in the
 * DOM, in the database and in any export.
 *
 *   node scripts/make-demo-media.mjs
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const OUT = path.join('public', 'zzshow-media');
const SIZE = 320;

/* ----------------------------------------------------------- PNG encoding -- */

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

/** `pixels` is a width*height*3 RGB buffer. */
function encodePng(width, height, pixels) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour RGB
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with its filter byte (0 = none).
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------- the tiles -- */

const NAVY = [0x00, 0x2d, 0x66];
const ORANGE = [0xea, 0x85, 0x3f];
const PALE = [0xcc, 0xe2, 0xff];
const WHITE = [0xff, 0xff, 0xff];

/**
 * Flat diagonal stripes, a hard border and a solid corner block.
 *
 * `variant` shifts the stripe phase and swaps the two stripe colours so the
 * tiles are visibly different from one another - otherwise every card on the
 * results page carries an identical image and the grid stops being useful for
 * judging layout.
 */
function tile(variant, width = SIZE, height = SIZE) {
  const px = Buffer.alloc(width * height * 3);
  const [a, b] = variant % 2 === 0 ? [NAVY, PALE] : [ORANGE, WHITE];
  const phase = (variant * 37) % 64;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      const border = x < 10 || y < 10 || x >= width - 10 || y >= height - 10;
      const cornerBlock = x >= width - 96 && y >= height - 40 && !border;
      const stripe = Math.floor((x + y + phase) / 32) % 2 === 0;

      const colour = border ? NAVY : cornerBlock ? ORANGE : stripe ? a : b;
      px[i] = colour[0];
      px[i + 1] = colour[1];
      px[i + 2] = colour[2];
    }
  }
  return encodePng(width, height, px);
}

/* ------------------------------------------------------------------ main -- */

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const written = [];
for (let n = 1; n <= 8; n += 1) {
  const name = `zzshow-student-photo-${String(n).padStart(2, '0')}.png`;
  const file = path.join(OUT, name);
  const bytes = tile(n);
  writeFileSync(file, bytes);
  written.push(`${file.split(path.sep).join('/')}  ${(bytes.length / 1024).toFixed(1)} KB`);
}

/*
  Gallery tiles are LANDSCAPE, because the gallery grid is.

  A 4:3 box with `object-cover` crops a square fixture to a strip and the demo
  then tells you nothing about how a real landscape photograph sits in the grid.
  These are 480x360, which is the same 4:3 the tiles render at.

  Twelve of them, so the demo gallery fills more than one row at every
  breakpoint and the category filter has something to filter.
*/
const GALLERY_W = 480;
const GALLERY_H = 360;
for (let n = 1; n <= 12; n += 1) {
  const name = `zzshow-gallery-${String(n).padStart(2, '0')}.png`;
  const file = path.join(OUT, name);
  const bytes = tile(n + 3, GALLERY_W, GALLERY_H);
  writeFileSync(file, bytes);
  written.push(`${file.split(path.sep).join('/')}  ${(bytes.length / 1024).toFixed(1)} KB`);
}

console.log('Synthetic placeholder images written:');
for (const line of written) console.log(`  ${line}`);
console.log(
  `\n  ${SIZE}x${SIZE} and ${GALLERY_W}x${GALLERY_H} flat-colour tiles.` +
    ' No faces, no photographs, no people.',
);
console.log('  Referenced as /zzshow-media/... so the synthetic origin shows in the DOM.');
