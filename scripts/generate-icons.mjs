#!/usr/bin/env node
// Generate the PWA / TWA icon-pack for TriFinity.
//
// Why a custom script instead of `pwa-asset-generator`?
//   pwa-asset-generator depends on Puppeteer which is fragile to set up on
//   Windows (Chromium download, code-signing). We already pull `sharp` in
//   transitively via Next.js, so we use it directly and stay in pure-Node
//   territory. Run this once whenever the brand-source SVGs change.
//
// Inputs:
//   scripts/trifinity-mark.svg          — primary "any"-purpose icon source
//   scripts/trifinity-mark-maskable.svg — maskable variant with 80% safe-zone
//
// Outputs (in public/):
//   icon-192.png          (192×192, primary)
//   icon-512.png          (512×512, primary, also referenced by Play Store)
//   icon-512-maskable.png (512×512, maskable)
//   apple-touch-icon.png  (180×180, iOS home-screen)
//   favicon-16.png / favicon-32.png / favicon-48.png — multi-res favicon-ico inputs
//
// Note: we don't ship a fresh favicon.ico from this script — the existing
// `app/favicon.ico` is Next.js's app-router default and stays untouched in
// Phase A. If you want to refresh the .ico, feed favicon-{16,32,48}.png to
// any png→ico tool (e.g. `npx png-to-ico`).
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const publicDir = path.join(root, 'public');

const primarySvg = path.join(here, 'trifinity-mark.svg');
const maskableSvg = path.join(here, 'trifinity-mark-maskable.svg');

/** PNG-export jobs. Each renders the source SVG into `public/<file>` at the
 *  given pixel size. We always re-rasterise from SVG (never resize a smaller
 *  PNG) so every size remains vector-crisp. */
const jobs = [
  { src: primarySvg, file: 'icon-192.png', size: 192 },
  { src: primarySvg, file: 'icon-512.png', size: 512 },
  { src: maskableSvg, file: 'icon-512-maskable.png', size: 512 },
  { src: primarySvg, file: 'apple-touch-icon.png', size: 180 },
  { src: primarySvg, file: 'favicon-16.png', size: 16 },
  { src: primarySvg, file: 'favicon-32.png', size: 32 },
  { src: primarySvg, file: 'favicon-48.png', size: 48 },
];

async function main() {
  await fs.mkdir(publicDir, { recursive: true });

  for (const { src, file, size } of jobs) {
    const out = path.join(publicDir, file);
    const svg = await fs.readFile(src);

    await sharp(svg, { density: 384 })
      .resize(size, size, {
        fit: 'contain',
        kernel: sharp.kernel.lanczos3,
      })
      .png({ compressionLevel: 9, palette: false })
      .toFile(out);

    const stat = await fs.stat(out);
    console.log(
      `  ${file.padEnd(26)} ${size}×${size}`.padEnd(48) +
        `${(stat.size / 1024).toFixed(1)} KB`
    );
  }
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
