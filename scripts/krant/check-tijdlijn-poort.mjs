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
 *
 * Het script toetst TEKST, geen gedrag. Daarom stelt het ook eisen aan de vorm
 * van lib/krant/tijdlijn-beta.ts zelf (security-run R1-delta 🟡-B), en die
 * gelden óók als de vlag dicht staat:
 *   - precies één declaratie van de vlag (een tweede regel, ook in commentaar,
 *     zou de eerste treffer kunnen zijn en "dicht" melden bij een open vlag);
 *   - de twee functies die de vlag lezen staan er letterlijk;
 *   - geen omgevingsvariabele in dat bestand (een schakelaar die CI niet zet,
 *     komt anders door alle lagen heen).
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const lees = (pad) => readFileSync(join(ROOT, pad), 'utf8')

const VLAG_DECLARATIE = /export\s+const\s+TIJDLIJN_BETA_OPEN\b/g
const VLAG_WAARDE = /export\s+const\s+TIJDLIJN_BETA_OPEN\s*=\s*(true|false)\b/

export function vlagOpen(bron) {
  const declaraties = bron.match(VLAG_DECLARATIE) ?? []
  if (declaraties.length !== 1) {
    throw new Error(`TIJDLIJN_BETA_OPEN staat ${declaraties.length}× in lib/krant/tijdlijn-beta.ts; het moet precies 1× zijn (ook in commentaar telt een tweede regel mee)`)
  }
  const m = bron.match(VLAG_WAARDE)
  if (!m) throw new Error('TIJDLIJN_BETA_OPEN is geen letterlijke true of false in lib/krant/tijdlijn-beta.ts')
  return m[1] === 'true'
}

/**
 * De vorm van tijdlijn-beta.ts: wie de vlag leest en hoe. Geeft de reden terug
 * waarom de vorm afwijkt, of null. Witruimte telt niet mee.
 */
export function vormFout(bron) {
  const plat = bron.replace(/\s+/g, ' ')
  if (/process\s*\.\s*env/.test(bron)) return 'lib/krant/tijdlijn-beta.ts leest een omgevingsvariabele'
  if (!plat.includes('return betaToegang(rol, TIJDLIJN_BETA_OPEN)')) return 'inTijdlijnBeta geeft niet meer letterlijk betaToegang(rol, TIJDLIJN_BETA_OPEN) terug'
  if (!plat.includes('return open || rol === SUPERADMIN_ROLE')) return 'betaToegang is niet meer letterlijk "open || rol === SUPERADMIN_ROLE"'
  return null
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
  const bron = lees('lib/krant/tijdlijn-beta.ts')
  const vorm = vormFout(bron)
  if (vorm) {
    console.error(`✗ Tijdlijn-poort: ${vorm}.`)
    console.error('  De poort toetst de tekst van dat bestand; een andere vorm vraagt eerst een aangepaste poort.')
    process.exit(1)
  }
  let open
  try {
    open = vlagOpen(bron)
  } catch (e) {
    console.error(`✗ Tijdlijn-poort: ${e instanceof Error ? e.message : String(e)}.`)
    process.exit(1)
  }
  if (!open) {
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
