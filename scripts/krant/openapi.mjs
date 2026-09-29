#!/usr/bin/env node
// Schrijft docs/api/krant-v1.json uit lib/krant/contract.ts (Krant 3A, ADR 0187).
//
//   npm run krant:openapi            schrijft het bestand
//   npm run krant:openapi -- --check exit 1 bij drift (zonder te schrijven)
//
// De bron is TypeScript; de repo heeft geen tsx. esbuild (devDependency) bundelt
// lib/krant/contract-openapi.ts — inclusief zod, zodat de bundel zelfstandig is —
// naar een tijdelijk ESM-bestand buiten de repo, dat we daarna importeren.
// De drifttest (lib/krant/contract-openapi.test.ts) roept dezelfde functie aan.

import { build } from 'esbuild'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const doel = join(root, 'docs', 'api', 'krant-v1.json')
const check = process.argv.includes('--check')

const tmp = mkdtempSync(join(tmpdir(), 'krant-openapi-'))
try {
  const uit = join(tmp, 'contract-openapi.mjs')
  await build({
    entryPoints: [join(root, 'lib', 'krant', 'contract-openapi.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: uit,
    logLevel: 'error',
  })
  const { krantOpenApiJson } = await import(pathToFileURL(uit).href)
  const json = krantOpenApiJson()

  if (check) {
    const huidig = existsSync(doel) ? readFileSync(doel, 'utf8').replace(/\r\n/g, '\n') : ''
    if (huidig !== json) {
      console.error('docs/api/krant-v1.json loopt achter op lib/krant/contract.ts — draai `npm run krant:openapi`.')
      process.exit(1)
    }
    console.log('docs/api/krant-v1.json is in sync.')
  } else {
    mkdirSync(dirname(doel), { recursive: true })
    writeFileSync(doel, json)
    console.log(`Geschreven: docs/api/krant-v1.json (${json.length} bytes)`)
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
