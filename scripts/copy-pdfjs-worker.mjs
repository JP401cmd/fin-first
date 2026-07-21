#!/usr/bin/env node
// ── Copy pdfjs-dist worker to /public ─────────────────────────────────
//
// Achtergrond: `components/aangifte/upload-step.tsx` parst PDF's lokaal in
// de browser via pdfjs-dist. Pdfjs heeft een aparte worker-bundle nodig
// (`pdf.worker.min.mjs`) die NIET via Next.js' static-asset pipeline
// uit `node_modules` geserveerd kan worden. Vroeger werd deze geladen via
// `https://unpkg.com/pdfjs-dist@<version>/build/pdf.worker.min.mjs` — dat
// is verwijderd vanwege:
//   - CSP-incompatibiliteit (geen externe scripts toegestaan)
//   - Supply-chain risk (compromised package execute met PDF-toegang
//     vóór de BSN-strip)
//   - Privacy (user IP/UA leak naar unpkg.com — niet vermeld in privacy-
//     notice)
//
// Deze post-install hook kopieert `pdf.worker.min.mjs` van
// `node_modules/pdfjs-dist/legacy/build/` naar `public/pdf.worker.min.mjs`
// zodat Next.js het serveert vanaf `/pdf.worker.min.mjs`. LET OP: de bron is
// de LEGACY-build, omdat upload-step.tsx op pdfjs-dist v6 bewust de
// legacy-build importeert (bredere browser-compat). pdf.js gooit een harde
// runtime-fout bij een API/worker-versie- of build-mismatch, dus API-import
// en worker MOETEN uit dezelfde (legacy) build komen. Idempotent: re-runnen
// schrijft hetzelfde bestand opnieuw zonder side-effects. Failures worden
// gelogd maar gooien geen exit-code; de install blijft doorgaan zelfs als
// de worker (tijdelijk) niet beschikbaar is — de feature degrade-pad in
// upload-step.tsx vangt het op met een gebruiker-zichtbare fallback.

import { copyFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Repo root = parent of /scripts. Resolved at runtime so the script can
// be moved if the repo layout changes.
const REPO_ROOT = join(__dirname, '..')
const SOURCE = join(REPO_ROOT, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.mjs')
const DEST_DIR = join(REPO_ROOT, 'public')
const DEST = join(DEST_DIR, 'pdf.worker.min.mjs')

async function main() {
  if (!existsSync(SOURCE)) {
    // Niet fataal — pdfjs-dist is misschien (nog) niet geïnstalleerd. Bij een
    // fresh install draait dit script ná npm install zelf, dus dit pad
    // hoort niet aangeraakt te worden. Maar voor `npm install <pkg>` zonder
    // pdfjs als dep, of in CI met --no-optional, willen we niet falen.
    console.warn(
      `[copy-pdfjs-worker] Source niet gevonden: ${SOURCE} — overslaan. ` +
        'Dit is OK als pdfjs-dist niet (nog) is geïnstalleerd.',
    )
    return
  }

  if (!existsSync(DEST_DIR)) {
    await mkdir(DEST_DIR, { recursive: true })
  }

  await copyFile(SOURCE, DEST)
  console.info(`[copy-pdfjs-worker] Kopieerd: ${SOURCE} -> ${DEST}`)
}

main().catch((err) => {
  // Log maar exit nooit — een mislukte kopie mag een npm install niet breken.
  console.error('[copy-pdfjs-worker] Onverwachte fout:', err)
})
