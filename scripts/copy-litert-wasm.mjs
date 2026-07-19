#!/usr/bin/env node
// ── Copy @litert-lm/core WASM-assets naar /public ─────────────────────────────
//
// Achtergrond (no-egress / privacy-origin, security-gate 19 jul 2026):
// De lokale categorisatie-runtime (lib/ai/local/litert-runtime.ts) draait
// @litert-lm/core in de privacy-origin. De runtime laadt zijn WASM-bundel
// (~99 MB, meerdere feature-varianten) via `getOrLoadGlobalLiteRtLm()`. Zonder
// pad-argument gebruikt de library `LiteRtLm.DEFAULT_WASM_PATH` =
// 'https://cdn.jsdelivr.net/npm/@litert-lm/core@0.14.0/wasm' — dat injecteert een
// third-party script (géén SRI) en haalt de .wasm van jsdelivr op, ín de origin
// die juist NIETS naar buiten mag sturen. Onaanvaardbaar.
//
// Oplossing: self-hosten. Dit script kopieert de meegeleverde WASM-assets uit
// node_modules naar `public/litert-wasm/`, zodat Next.js ze serveert vanaf
// `/litert-wasm/*` en de runtime met een EIGEN-ORIGIN-pad laadt. CSP blijft
// 'self' — geen CDN-verbreding. `public/litert-wasm/` is een build-artefact uit
// node_modules en wordt NIET gecommit (.gitignore).
//
// Draait als `predev` en `prebuild` hook. BEWUST fail-loud (exit 1) als de bron
// ontbreekt of leeg is: dat is een kapotte install, en stil doorgaan zou de
// runtime terugvallen op de jsdelivr-CDN (de leak die we juist dichten). Anders
// dan copy-pdfjs-worker.mjs (dat een gebruiker-zichtbaar degrade-pad heeft) mag
// hier NIETS stil falen. Idempotent: her-runnen overschrijft dezelfde bestanden.

import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Repo root = parent of /scripts. Runtime-resolved zodat het script mee kan
// verhuizen als de repo-layout verandert.
const REPO_ROOT = join(__dirname, '..')
const SOURCE_DIR = join(REPO_ROOT, 'node_modules', '@litert-lm', 'core', 'wasm')
const DEST_DIR = join(REPO_ROOT, 'public', 'litert-wasm')

function fail(message) {
  console.error(`[copy-litert-wasm] ${message}`)
  process.exit(1)
}

async function main() {
  if (!existsSync(SOURCE_DIR)) {
    fail(
      `WASM-bron niet gevonden: ${SOURCE_DIR}. ` +
        'De lokale AI-runtime kan zonder deze bestanden alleen via de jsdelivr-CDN ' +
        'laden (privacy-leak). Draai `npm install` opnieuw — @litert-lm/core hoort ' +
        'zijn wasm/-map mee te leveren.',
    )
  }

  const entries = await readdir(SOURCE_DIR)
  const files = entries.filter((name) => name.endsWith('.js') || name.endsWith('.wasm'))
  if (files.length === 0) {
    fail(`WASM-bron is leeg: ${SOURCE_DIR} bevat geen .js/.wasm-bestanden — kapotte install.`)
  }

  // Schone kopie: verwijder een oude map (bv. na een versie-bump met andere
  // varianten) en herbouw 'm, zodat er geen verweesde bestanden achterblijven.
  if (existsSync(DEST_DIR)) {
    await rm(DEST_DIR, { recursive: true, force: true })
  }
  await mkdir(DEST_DIR, { recursive: true })

  for (const name of files) {
    await copyFile(join(SOURCE_DIR, name), join(DEST_DIR, name))
  }

  console.info(`[copy-litert-wasm] ${files.length} WASM-asset(s) gekopieerd: ${SOURCE_DIR} -> ${DEST_DIR}`)
}

main().catch((err) => {
  fail(`Onverwachte fout: ${err instanceof Error ? err.stack || err.message : String(err)}`)
})
