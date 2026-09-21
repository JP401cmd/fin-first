#!/usr/bin/env node
/**
 * TriFinity — attest van de Krant-sjablooncatalogus
 * ============================================================================
 * Zero-dependency Node ESM script (Node ≥ 23.6: type-stripping voor de .ts-import).
 *
 *   node scripts/krant/attest-sjablonen.mjs --check
 *       De poort: elke tekst in lib/krant/sjablonen-catalogus.ts heeft een
 *       sha256 in lib/krant/sjablonen-attest.json (exit 1 bij drift).
 *
 *   node scripts/krant/attest-sjablonen.mjs --attest \
 *       --door "<wie>" --compliance goedgekeurd --motivering "<waarom>"
 *       Herattesteren: schrijft het attest opnieuw, mét de uitkomst van de
 *       compliance-check en de attestatiedatum van het merkstem-manifest.
 *
 * WAT DIT IS: dezelfde attestatie-gedachte als het merkstem-manifest (ADR 0112),
 * maar per SJABLOON. De catalogus is copy die de app namens ons uitspreekt; het
 * attest bewijst dat iemand elke formulering naast de Wft-grens
 * (compliance-check) en de merkstem heeft gelegd. Wijzigt een tekst, dan is
 * de hash weg en is lib/krant/sjablonen-attest.test.ts rood tot iemand
 * opnieuw attesteert — bewust, want een sjabloon raakt élke lezer tegelijk.
 *
 * WAT DIT NIET BEWIJST: dat de tekst goed is. Dat is de toets zelf.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SJABLONEN, SJABLOON_VERSIE } from '../../lib/krant/sjablonen-catalogus.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const ATTEST_FILE = join(ROOT, 'lib', 'krant', 'sjablonen-attest.json')
const MANIFEST_FILE = join(ROOT, 'lib', 'merkstem', 'merkstem-manifest.json')

const sha256 = (tekst) => createHash('sha256').update(tekst, 'utf8').digest('hex')

function hashes() {
  const out = {}
  for (const id of Object.keys(SJABLONEN).sort()) out[id] = SJABLONEN[id].map(sha256)
  return out
}

function arg(naam) {
  const i = process.argv.indexOf(naam)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function lees(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
}

const mode = process.argv.includes('--attest') ? 'attest' : 'check'

if (mode === 'check') {
  const attest = lees(ATTEST_FILE)
  if (!attest) {
    console.error('sjablonen-attest.json ontbreekt — draai --attest na merkstem en compliance-check')
    process.exit(1)
  }
  const live = hashes()
  const fouten = []
  if (attest.sjabloonVersie !== SJABLOON_VERSIE) fouten.push(`sjabloonVersie ${attest.sjabloonVersie} ≠ ${SJABLOON_VERSIE}`)
  for (const [id, lijst] of Object.entries(live)) {
    const bekend = attest.sjablonen?.[id] ?? []
    lijst.forEach((h, v) => {
      if (bekend[v] !== h) fouten.push(`${id}[${v}] niet geattesteerd`)
    })
    if (bekend.length !== lijst.length) fouten.push(`${id}: ${bekend.length} geattesteerd, ${lijst.length} in de catalogus`)
  }
  for (const id of Object.keys(attest.sjablonen ?? {})) if (!(id in live)) fouten.push(`${id} staat in het attest maar niet in de catalogus`)
  if (fouten.length) {
    console.error(`sjablonen-attest: ${fouten.length} afwijking(en)\n  ${fouten.join('\n  ')}`)
    process.exit(1)
  }
  console.log(`sjablonen-attest: ${Object.keys(live).length} sjablonen geattesteerd (versie ${SJABLOON_VERSIE}, ${attest.attestedAt})`)
} else {
  const door = arg('--door')
  const verdict = arg('--compliance')
  const motivering = arg('--motivering')
  if (!door || !verdict || !motivering) {
    console.error('gebruik: --attest --door "<wie>" --compliance <goedgekeurd|aanpassen|afgewezen> --motivering "<waarom>"')
    process.exit(2)
  }
  const manifest = lees(MANIFEST_FILE)
  const oppervlak = manifest?.surfaces?.find((s) => s.id === 'krant-sjablonen')
  const at = new Date().toISOString()
  const attest = {
    note: 'Attest van de Krant-sjablooncatalogus (ADR 0172). Per sjabloon-id een sha256 per formulering. Bijwerken = de catalogus is opnieuw door merkstem en compliance-check gegaan: node scripts/krant/attest-sjablonen.mjs --attest …',
    attestedAt: at,
    attestedBy: door,
    sjabloonVersie: SJABLOON_VERSIE,
    merkstem: {
      manifestAttestedAt: manifest?.attestedAt ?? null,
      oppervlak: oppervlak ? { id: oppervlak.id, files: oppervlak.files.map((f) => ({ file: f.file, sha256: f.sha256 })) } : null,
    },
    compliance: { verdict, at, motivering },
    sjablonen: hashes(),
  }
  writeFileSync(ATTEST_FILE, JSON.stringify(attest, null, 2) + '\n', 'utf8')
  console.log(`sjablonen-attest geschreven: ${Object.keys(attest.sjablonen).length} sjablonen, compliance ${verdict}`)
}
