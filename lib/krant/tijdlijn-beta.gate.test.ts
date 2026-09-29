// ── Poort: de tijdlijn-bèta gaat niet open zonder herbevestiging ──────────────
//
// TIJDLIJN_BETA_OPEN = true zonder dat de eigenaar het sjablonen-attest op de
// huidige catalogus heeft herbevestigd, maakt deze test rood. Zie het
// kopcommentaar van tijdlijn-beta.ts voor de volledige voorwaarden.

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readSourceLF } from '@/lib/test-utils/read-source'
import { TIJDLIJN_BETA_OPEN, betaToegang, herbevestigingGeldig, inTijdlijnBeta, type AttestHerbevestiging } from './tijdlijn-beta'

const sha256 = (tekst: string) => createHash('sha256').update(tekst, 'utf8').digest('hex')
const CATALOGUS_SHA = sha256(readSourceLF(join(process.cwd(), 'lib', 'krant', 'sjablonen-catalogus.ts')))
const attest = JSON.parse(readFileSync(join(process.cwd(), 'lib', 'krant', 'sjablonen-attest.json'), 'utf8')) as {
  herbevestiging?: AttestHerbevestiging | null
}

describe('tijdlijn-bèta — poort op de vlag', () => {
  it('staat de bèta open, dan heeft de eigenaar het attest op de huidige catalogus herbevestigd', () => {
    if (!TIJDLIJN_BETA_OPEN) return
    expect(
      herbevestigingGeldig(attest, CATALOGUS_SHA),
      'TIJDLIJN_BETA_OPEN staat op true, maar het sjablonen-attest heeft geen geldige herbevestiging door de eigenaar op de huidige catalogus. ' +
        'Laat de eigenaar `node scripts/krant/attest-sjablonen.mjs --herbevestig --toets <url>` draaien (na /privacy 2.4 live en security-GO), of zet de vlag terug op false.',
    ).toBe(true)
  })
})

describe('herbevestigingGeldig', () => {
  const geldig: AttestHerbevestiging = {
    door: 'eigenaar',
    rol: 'Grenswachter',
    at: '2026-09-28T10:00:00.000Z',
    catalogusSha256: 'a'.repeat(64),
    juridischeToets: 'https://www.notion.so/juridische-toets',
  }

  it('geldig: door de eigenaar, op dezelfde catalogus-hash', () => {
    expect(herbevestigingGeldig({ herbevestiging: geldig }, 'a'.repeat(64))).toBe(true)
  })

  it('vervallen: de catalogus is gewijzigd sinds de herbevestiging', () => {
    expect(herbevestigingGeldig({ herbevestiging: geldig }, 'b'.repeat(64))).toBe(false)
  })

  it('ongeldig: niet door de eigenaar', () => {
    expect(herbevestigingGeldig({ herbevestiging: { ...geldig, door: 'Claude Code' } }, 'a'.repeat(64))).toBe(false)
  })

  it('geen herbevestiging: null of ontbrekend veld', () => {
    expect(herbevestigingGeldig({ herbevestiging: null }, 'a'.repeat(64))).toBe(false)
    expect(herbevestigingGeldig({}, 'a'.repeat(64))).toBe(false)
  })
})

describe('inTijdlijnBeta — wie mag in de bèta', () => {
  it('dicht: alleen de superadmin; open: iedereen', () => {
    expect(betaToegang('superadmin', false)).toBe(true)
    expect(betaToegang('user', false)).toBe(false)
    expect(betaToegang(null, false)).toBe(false)
    expect(betaToegang(undefined, false)).toBe(false)
    expect(betaToegang('user', true)).toBe(true)
    expect(betaToegang(null, true)).toBe(true)
  })

  it('inTijdlijnBeta volgt de constante: vandaag (dicht) alleen de superadmin', () => {
    expect(inTijdlijnBeta('superadmin')).toBe(true)
    expect(inTijdlijnBeta('user')).toBe(TIJDLIJN_BETA_OPEN)
  })

  it('allowlist van importeurs (security G4): een nieuwe plek die de bèta-toets gebruikt, vraagt een bewuste review', () => {
    const TOEGESTAAN = new Set(['app/api/krant/tijdlijn/cron/route.ts'])
    const bronnen = ['app', 'lib', 'components']
      .flatMap((d) => (readdirSync(d, { recursive: true }) as string[]).map((p) => (d + '/' + p).split('\\').join('/')))
      .filter((p) => /\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p) && p !== 'lib/krant/tijdlijn-beta.ts')
    // Alleen IMPORTS tellen: de architectuurplaten noemen de helper in tekst.
    const importeert = (p: string) => /import\s*\{[^}]*\b(inTijdlijnBeta|betaToegang)\b[^}]*\}\s*from\s*['"][^'"]*tijdlijn-beta['"]/.test(readSourceLF(p))
    const gebruikers = bronnen.filter(importeert)
    expect(gebruikers.sort()).toEqual([...TOEGESTAAN].sort())
    // betaToegang (met expliciete vlag) hoort in geen enkel productiebestand.
    for (const p of gebruikers) expect(readSourceLF(p), p).not.toMatch(/\bbetaToegang\b/)
  })
})
