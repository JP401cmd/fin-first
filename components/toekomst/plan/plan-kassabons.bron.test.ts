/**
 * Bron-grendels op de kassabons W–Z na de verhuizing naar `plan-kassabons.tsx`
 * (fase 1, ADR 0179, kaart §5.1 en besluit Q9):
 * - Q9 / ADR 0039: de bonnen lopen via `<ShellOverlay kind="sheet">`, niet via een
 *   directe `BottomSheet` (`check:overlays`)
 * - kpi-gegevensmelding: de bon onderbouwt nooit een bedrag dat de tegel als
 *   "we missen gegevens" toont; de uitleg staat er precies één keer per guard
 * - prognose-precisie (kassabon-deel): rendement én inflatie als aanname
 * - nu-stoppen: geen "Benodigd"-totaalregel onder een vast anker
 * - hero-fire-age: de bon toont de resolver-tekst
 */
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

const source = readSourceLF(join(process.cwd(), 'components', 'toekomst', 'plan', 'plan-kassabons.tsx'))

describe('plan-kassabons — één overlay-systeem (Q9, ADR 0039)', () => {
  it('importeert geen BottomSheet en opent elke bon als ShellOverlay-sheet', () => {
    expect(source).not.toMatch(/from '@\/components\/app\/bottom-sheet'/)
    const code = source
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n')
    expect(code).not.toContain('<BottomSheet')
    expect(source.match(/<ShellOverlay kind="sheet" /g) ?? []).toHaveLength(4)
    expect(source.match(/<\/ShellOverlay>/g) ?? []).toHaveLength(4)
  })
})

describe('plan-kassabons — gegevensmelding in de bon', () => {
  it('toont de uitleg van elke guard precies één keer, onder de gedeelde kop', () => {
    expect(source.match(/\bfireAgeNoticeGuard\.hint\b/g) ?? []).toHaveLength(1)
    expect(source.match(/\bfireTargetGuard\.hint\b/g) ?? []).toHaveLength(1)
    expect(source.match(/\bretirementExpenseGuard\.hint\b/g) ?? []).toHaveLength(0)
    expect(source).toContain('HORIZON_MISSENDE_GEGEVENS_LABEL')
    expect(source).not.toMatch(/['"`]We missen gegevens/)
  })
})

describe('plan-kassabons — de bon draagt de aannames (prognose-precisie)', () => {
  it('noemt rendement én inflatie uit fireParams, in beide bonnen', () => {
    expect(source).toContain('Verwacht rendement')
    expect(source).toContain('fireParams.inflationRate')
    let diepte = 0
    const inBon = source.split('\n').filter((l) => {
      diepte += (l.match(/<KassabonShell\b/g) ?? []).length
      const binnen = diepte > 0
      diepte -= (l.match(/<\/KassabonShell>/g) ?? []).length
      return binnen && l.includes('Verwachte inflatie')
    })
    expect(inBon.length).toBeGreaterThanOrEqual(2)
  })
})

describe('plan-kassabons — vast anker en kernantwoord', () => {
  it('de doelbedrag-bon heeft onder een vast anker geen "Benodigd"-totaalregel', () => {
    expect(source).toContain("isFixedAnchorMode ? 'Vermogen op je stopmoment (geprojecteerd)' : 'Benodigd'")
  })

  it('de leeftijd-bon toont de resolver-tekst', () => {
    expect(source).toContain('{heroFireAgeReceiptText}')
  })

  it('de gezondheid-bon laadt HealthScoreReceipt lazy (V3: dynamic verhuist mee)', () => {
    expect(source).toMatch(/const HealthScoreReceipt = dynamic\(/)
  })
})

describe('plan-kassabons — opnamerate: twee grootheden, twee namen, nl-NL (C3 punt 5)', () => {
  it('geen toFixed voor percentages: formatDecimal geeft de komma ("3,40%", niet "3.40%")', () => {
    expect(source).not.toMatch(/\.toFixed\(/)
    expect(source).toMatch(/import \{[^}]*\bformatDecimal\b[^}]*\} from '@\/lib\/format'/)
  })

  it('de ingestelde SWR (fireSwr) heet nooit kaal "Opnamerate": die naam draagt de KPI voor het impliciete percentage', () => {
    // KPI 3 toont `implicitWithdrawalRate` (uitgave bij FIRE ÷ benodigd vermogen) met
    // onderschrift "impliciet"; de bonnen van KPI 1 en 2 toonden `fireSwr` (rendement −
    // Box 3 − inflatie) onder dezelfde naam. Twee grootheden, dus twee namen.
    expect(source).not.toMatch(/>Opnamerate<\/GlossaryTerm>/)
    expect(source).not.toContain('>Opnamerate (SWR)<')
    expect(source.match(/Opnamerate \(ingesteld\)/g) ?? []).toHaveLength(2)
  })
})
