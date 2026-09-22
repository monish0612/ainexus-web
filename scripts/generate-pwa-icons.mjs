// Rasterises the brand mark in public/favicon.svg into the PNG sizes the
// install prompt and iOS require. Re-run with `node scripts/generate-pwa-icons.mjs`
// after changing the mark.
//
// The "any" icons keep the rounded rect. The maskable icon is deliberately
// full-bleed square: the launcher applies its own mask, and a pre-rounded
// source would get double-rounded. The mark occupies only the middle ~37% of
// the canvas, which already sits inside the 80% maskable safe circle.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public');

const GRADIENT = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0D59F2"/>
      <stop offset="1" stop-color="#7C3AED"/>
    </linearGradient>
  </defs>`;

const MARK =
  '<path d="M20 44V20l24 24V20" fill="none" stroke="#fff" stroke-width="5" ' +
  'stroke-linecap="round" stroke-linejoin="round"/>';

const svg = (radius) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${GRADIENT}` +
  `<rect width="64" height="64" rx="${radius}" fill="url(#g)"/>${MARK}</svg>`;

// radius 0 = maskable (launcher masks it), 16 = rounded, 12 = iOS (which
// applies a squircle of its own but rejects transparency).
const targets = [
  { file: 'pwa-192.png', size: 192, radius: 16 },
  { file: 'pwa-512.png', size: 512, radius: 16 },
  { file: 'pwa-maskable-512.png', size: 512, radius: 0 },
  { file: 'apple-touch-icon.png', size: 180, radius: 0 },
];

await mkdir(out, { recursive: true });
for (const { file, size, radius } of targets) {
  const png = await sharp(Buffer.from(svg(radius)))
    .resize(size, size)
    .png()
    .toBuffer();
  await writeFile(join(out, file), png);
  console.log(`${file}  ${size}x${size}  ${png.length} bytes`);
}
