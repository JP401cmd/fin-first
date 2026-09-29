#!/usr/bin/env node
/**
 * Poort: de tijdlijn gaat niet open zonder herbevestiging (security-run R1, 🟡-1)
 * ============================================================================
 * Dezelfde regel als lib/krant/tijdlijn-beta.gate.test.ts, maar als los
 * Node-script zonder TS-import, zodat hij draait waar vitest niet kan:
 *   - `npm run prebuild` (dus ook de Vercel-build: een deploy met de vlag open
 *     zonder geldige herbevestiging faalt vóór er iets live gaat);
 *   - de pre-push-hook (onder Git Bash faalt vitest altijd).
 *
 * Regel: staat `TIJDLIJN_BETA_OPEN = true` in lib/krant/tijdlijn-beta.ts, dan
 * moet lib/krant/sjablonen-attest.json een herbevestiging dragen van de
 * eigenaar, op de sha256 van lib/krant/sjablonen-catalogus.ts (LF-regeleinden),
 * met een link naar de juridische toets en een geldige datum. Anders exit 1.
 * Staat de vlag dicht, dan is er niets te toetsen (exit 0).
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const lees = (pad) => readFileSync(join(ROOT, pad), 'utf8')

export function vlagOpen(bron) {
  const m = bron.match(/export\s+const\s+TIJDLIJN_BETA_OPEN\s*=\s*(true|false)\b/)
  if (!m) throw new Error('TIJDLIJN_BETA_OPEN niet gevonden in lib/krant/tijdlijn-beta.ts')
  return m[1] === 'true'
}

export function catalogusSha(bron) {
  return createHash('sha256').update(bron.replace(/\r\n/g, '\n'), 'utf8').digest('hex')
}

/** Dezelfde eisen als herbevestigingGeldig in lib/krant/tijdlijn-beta.ts. */
export function herbevestigingFout(attest, sha) {
  const hb = attest?.herbevestiging
  if (!hb) return 'er is geen herbevestiging'
  if (hb.door !== 'eigenaar') return `herbevestigd door "${hb.door}", niet door de eigenaar`
  if (hb.catalogusSha256 !== sha) return 'de herbevestiging hoort bij een oudere catalogus'
  if (typeof hb.juridischeToets !== 'string' || !/^https:\/\/\S+$/.test(hb.juridischeToets)) return 'de link naar de juridische toets ontbreekt'
  if (typeof hb.at !== 'string' || !Number.isFinite(Date.parse(hb.at))) return 'de datum van de herbevestiging is ongeldig'
  return null
}

function main() {
  if (!vlagOpen(lees('lib/krant/tijdlijn-beta.ts'))) {
    console.log('✓ Tijdlijn-poort: TIJDLIJN_BETA_OPEN staat dicht, niets te toetsen.')
    return
  }
  const fout = herbevestigingFout(JSON.parse(lees('lib/krant/sjablonen-attest.json')), catalogusSha(lees('lib/krant/sjablonen-catalogus.ts')))
  if (fout) {
    console.error(`✗ Tijdlijn-poort: TIJDLIJN_BETA_OPEN staat open, maar ${fout}.`)
    console.error('  Laat de eigenaar `node scripts/krant/attest-sjablonen.mjs --herbevestig --toets <url>` draaien, of zet de vlag terug op false.')
    process.exit(1)
  }
  console.log('✓ Tijdlijn-poort: open, en door de eigenaar herbevestigd op de huidige catalogus.')
}

const direct = (process.argv[1] || '').replace(/\\/g, '/').endsWith('scripts/krant/check-tijdlijn-poort.mjs')
if (direct) main()
