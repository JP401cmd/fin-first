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

  it('ongeldig: zonder link naar de juridische toets of met een kapotte datum (security-run R1)', () => {
    expect(herbevestigingGeldig({ herbevestiging: { ...geldig, juridischeToets: '' } }, 'a'.repeat(64))).toBe(false)
    expect(herbevestigingGeldig({ herbevestiging: { ...geldig, juridischeToets: 'geen-url' } }, 'a'.repeat(64))).toBe(false)
    expect(herbevestigingGeldig({ herbevestiging: { ...geldig, at: 'gisteren' } }, 'a'.repeat(64))).toBe(false)
  })
})

describe('scripts/krant/check-tijdlijn-poort.mjs — dezelfde poort buiten vitest (prebuild + pre-push)', () => {
  it('leest de vlag, rekent dezelfde catalogus-hash en stelt dezelfde eisen', async () => {
    const poort = await import('../../scripts/krant/check-tijdlijn-poort.mjs')
    expect(poort.vlagOpen(readSourceLF(join(process.cwd(), 'lib', 'krant', 'tijdlijn-beta.ts')))).toBe(TIJDLIJN_BETA_OPEN)
    expect(poort.catalogusSha(readFileSync(join(process.cwd(), 'lib', 'krant', 'sjablonen-catalogus.ts'), 'utf8'))).toBe(CATALOGUS_SHA)
    expect(poort.catalogusSha('a\r\nb')).toBe(poort.catalogusSha('a\nb'))
    const geldig = { door: 'eigenaar', rol: 'Grenswachter', at: '2026-09-29T10:00:00.000Z', catalogusSha256: 'x', juridischeToets: 'https://app.notion.com/p/1' }
    expect(poort.herbevestigingFout({ herbevestiging: geldig }, 'x')).toBeNull()
    expect(poort.herbevestigingFout({ herbevestiging: null }, 'x')).toMatch(/geen herbevestiging/)
    expect(poort.herbevestigingFout({ herbevestiging: geldig }, 'y')).toMatch(/oudere catalogus/)
    expect(poort.herbevestigingFout({ herbevestiging: { ...geldig, juridischeToets: '' } }, 'x')).toMatch(/juridische toets/)
    // De twee implementaties zeggen hetzelfde over het huidige attest.
    expect(poort.herbevestigingFout(attest, CATALOGUS_SHA) === null).toBe(herbevestigingGeldig(attest, CATALOGUS_SHA))
  })

  // Het script leest tekst. Zonder deze eisen meldt het "dicht" bij een open vlag
  // zodra er een tweede regel boven staat (security-run R1-delta 🟡-B).
  it('precies één declaratie van de vlag: een tweede regel, ook in commentaar, is een fout', async () => {
    const poort = await import('../../scripts/krant/check-tijdlijn-poort.mjs')
    const open = 'export const TIJDLIJN_BETA_OPEN = true\n'
    expect(poort.vlagOpen(open)).toBe(true)
    expect(poort.vlagOpen('export const TIJDLIJN_BETA_OPEN = false\n')).toBe(false)
    expect(() => poort.vlagOpen('// was: export const TIJDLIJN_BETA_OPEN = false\n' + open)).toThrow(/2×/)
    expect(() => poort.vlagOpen('const s = "export const TIJDLIJN_BETA_OPEN = false"\n' + open)).toThrow(/2×/)
    expect(() => poort.vlagOpen('export const IETS_ANDERS = true\n')).toThrow(/0×/)
    // Geen letterlijke waarde: de poort kan er niets over zeggen en faalt dus.
    expect(() => poort.vlagOpen('export const TIJDLIJN_BETA_OPEN = process.env.X === "1"\n')).toThrow(/letterlijke/)
    expect(() => poort.vlagOpen('export const TIJDLIJN_BETA_OPEN: boolean = true\n')).toThrow(/letterlijke/)
  })

  it('de vorm van tijdlijn-beta.ts: de echte bron is goed, een omweg langs de vlag niet', async () => {
    const poort = await import('../../scripts/krant/check-tijdlijn-poort.mjs')
    const bron = readSourceLF(join(process.cwd(), 'lib', 'krant', 'tijdlijn-beta.ts'))
    expect(poort.vormFout(bron)).toBeNull()
    // Dezelfde bron met Windows-regeleinden en andere inspringing blijft goed.
    expect(poort.vormFout(bron.replace(/\n/g, '\r\n').replace(/ {2}/g, '\t'))).toBeNull()
    // Een schakelaar die CI niet zet.
    expect(poort.vormFout(bron.replace('betaToegang(rol, TIJDLIJN_BETA_OPEN)', 'betaToegang(rol, TIJDLIJN_BETA_OPEN || process.env.X === "1")'))).toMatch(/omgevingsvariabele/)
    // De vlag wordt niet meer doorgegeven.
    expect(poort.vormFout(bron.replace('betaToegang(rol, TIJDLIJN_BETA_OPEN)', 'betaToegang(rol, true)'))).toMatch(/inTijdlijnBeta/)
    // De pure toets laat iedereen door.
    expect(poort.vormFout(bron.replace('return open || rol === SUPERADMIN_ROLE', 'return true'))).toMatch(/betaToegang/)
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
    const TOEGESTAAN = new Set([
      'app/api/krant/tijdlijn/cron/route.ts',
      // Fase 2: de bronkeuze van /nieuws + de API (B40) en de vernieuwknop.
      'lib/krant/tijdlijn-bron.ts',
      'lib/krant/tijdlijn-vernieuwen.ts',
      // Bezwaar/variant: wist de banden alleen als /nieuws geen tijdlijn is (security Y2).
      'lib/krant/tijdlijn-keuzes.ts',
      // De nieuwsstip: slaat de tijdlijn-peek over zolang de tijdlijn voor deze
      // lezer dicht is. Een besparing, geen poort — de route toetst zelf.
      'components/app/shell/sidebar.tsx',
      // Krant 2C (ADR 0192): aanmelden en onboarding achter dezelfde poort — de
      // auth-callback zet de Krant-preset alleen binnen de bèta, en de omleidingen
      // + /onboarding/krant + de klaar-route toetsen hier wie de Krant-onboarding
      // krijgt. Eén importeur voor al die plekken; de pure beslissingen nemen de
      // bèta-stand als argument (tests voor beide vlagstanden in aanmelden.test.ts).
      'lib/krant/aanmelden.ts',
    ])
    const bronnen = ['app', 'lib', 'components']
      .flatMap((d) => (readdirSync(d, { recursive: true }) as string[]).map((p) => (d + '/' + p).split('\\').join('/')))
      .filter((p) => /\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p) && p !== 'lib/krant/tijdlijn-beta.ts')
    // Alleen IMPORTS tellen: de architectuurplaten noemen de helper in tekst.
    // Elke import van de module telt, ongeacht wat er gehaald wordt: een
    // `import * as`, een directe import van de vlag of een dynamische import
    // ontsnapte aan de oude toets op alleen de twee functienamen (R1-delta 🟢-E).
    const importeert = (p: string) => /(?:\bfrom|\bimport)\s*\(?\s*['"][^'"]*\/tijdlijn-beta['"]/.test(readSourceLF(p))
    const gebruikers = bronnen.filter(importeert)
    expect(gebruikers.sort()).toEqual([...TOEGESTAAN].sort())
    // betaToegang (met expliciete vlag) hoort in geen enkel productiebestand.
    for (const p of gebruikers) expect(readSourceLF(p), p).not.toMatch(/\bbetaToegang\b/)
  })
})
