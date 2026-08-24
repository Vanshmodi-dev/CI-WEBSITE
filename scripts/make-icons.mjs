/**
 * Generate the browser icons from the master logo. ONE-OFF TOOL, NOT A BUILD STEP.
 *
 * WHY THIS EXISTS. Phase 9 measured a 404 on `/favicon.ico` on every page load:
 * the site had no icon at all, so browsers showed a blank tab and Google would
 * have had nothing to put beside the result in mobile search.
 *
 * WHY IT CROPS. The master artwork is the full lock-up — emblem, wordmark and
 * tagline. Downsized whole to 96px the wordmark is a smear and the tagline is
 * noise. Favicons are conventionally the mark alone, so this extracts the
 * emblem (arc, cap, quill, open book) from the master and nothing else.
 *
 * ⚠ THIS IS A CROP AND A RESIZE. NOTHING ELSE.
 * The white background is kept exactly as it is in the source. We do NOT key it
 * out to fake transparency — the master is a JPEG with no alpha channel, and
 * chroma-keying a mark with curves and fine serifs leaves haloed edges. That is
 * a standing instruction from the client, not an oversight. See
 * src/components/domain/logo.tsx and docs/design/BRAND-ASSETS-PENDING.md.
 *
 * ⚠ THE CLIENT SHOULD CONFIRM THIS CROP. It is our judgement about their mark,
 * and it is replaceable by dropping a new file at the same path.
 *
 * `sharp` is not a declared dependency of this project — it arrives with
 * Next.js for image optimisation. That is fine for a tool run by hand whose
 * output is committed; it would not be fine in the build.
 *
 *   node scripts/make-icons.mjs
 */

import { createRequire } from 'node:module';
import { exit } from 'node:process';
import { writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);

let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error(
    'sharp is not available. It normally ships with Next.js; run `npm install` first.\n' +
      'The generated icons are committed, so this script only needs to run when the artwork changes.',
  );
  exit(1);
}

const SOURCE = 'public/brand/commerce-insight-logo.jpg';

/** Emblem bounds within the 2560x2560 master, measured by eye and verified. */
const CROP = { left: 430, top: 300, width: 1700, height: 1700 };

const OUTPUTS = [
  // 96 is a multiple of 48, which is what Google asks for the search favicon,
  // and stays crisp on a 2x tab strip.
  { path: 'src/app/icon.png', size: 96 },
  { path: 'src/app/apple-icon.png', size: 180 },
];

for (const { path, size } of OUTPUTS) {
  const info = await sharp(SOURCE)
    .extract(CROP)
    .resize(size, size, { fit: 'contain', background: '#ffffff' })
    .png({ compressionLevel: 9 })
    .toFile(path);
  console.log(`  ${path.padEnd(26)} ${size}x${size}  ${info.size} bytes`);
}

/**
 * `public/favicon.ico` as well.
 *
 * Modern browsers read `<link rel="icon">`, which the file convention above
 * emits — but plenty of clients still probe `/favicon.ico` blindly, and every
 * one of those was getting a 404 logged to the console. sharp cannot write ICO,
 * so this wraps a PNG in an ICO container by hand. PNG-inside-ICO has been
 * valid since Windows Vista and is what every icon generator produces today.
 */
const png = await sharp(SOURCE)
  .extract(CROP)
  .resize(48, 48, { fit: 'contain', background: '#ffffff' })
  .png({ compressionLevel: 9 })
  .toBuffer();

const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: 1 = icon
header.writeUInt16LE(1, 4); // one image in this file
header.writeUInt8(48, 6); // width
header.writeUInt8(48, 7); // height
header.writeUInt8(0, 8); // palette size: 0 = truecolour
header.writeUInt8(0, 9); // reserved
header.writeUInt16LE(1, 10); // colour planes
header.writeUInt16LE(32, 12); // bits per pixel
header.writeUInt32LE(png.length, 14); // size of the image data
header.writeUInt32LE(22, 18); // offset: immediately after this header

const ico = Buffer.concat([header, png]);
await writeFile('public/favicon.ico', ico);
console.log(`  ${'public/favicon.ico'.padEnd(26)} 48x48  ${ico.length} bytes`);

console.log('');
console.log('Done. src/app/icon.png and src/app/apple-icon.png are picked up by');
console.log('file convention; public/favicon.ico is served as a static file.');
