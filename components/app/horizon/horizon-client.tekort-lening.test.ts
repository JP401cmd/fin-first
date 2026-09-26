/**
 * Bron-grendel op de tekort-lening-melding van /toekomst.
 *
 * WAAROM EEN BRON-TEST: de melding hangt aan een volledige kernel-run (unifiedRows +
 * displayEndAge). Een render-test zou een complete horizon-bundel moeten opstellen om één
 * blok te bewijzen, en zou juist NIET vangen wat hier fout kán gaan: de bedrading tussen
 * drie bestanden. Sinds fixronde C1 (`a191b4a9f`) is de melding verdeeld over het bestand
 * van elk concern ("één invariant, één bestand", `lib/test-utils/toekomst-bronnen.ts`):
 *
 *  - de meldingen-hook (`use-toekomst-meldingen.ts`) draait de ONgewijzigde detector en
 *    levert de NOMINALE copy-basis: alle plan-parameters uit dezelfde run;
 *  - de euro-render-grens (`useMeldingBedragenInView` in `use-euro-view-feeds.ts`) zet de
 *    piek exact één keer om met de kernelfactor van zijn leeftijd, en levert de
 *    vrijheidstijd via `freedomDaysAtAge` (real-verankerd);
 *  - de meldingen-host (`toekomst-katern-meldingen.tsx`) formatteert alleen en bouwt de
 *    copy via de pure sibling-module (`buildDeficitLoanCopy`).
 *
 * Wat deze test daarmee bewijst:
 *  1. de detector (`deficit-loan-display.ts`) wordt ongewijzigd geconsumeerd;
 *  2. de copy komt op precies één plek uit `buildDeficitLoanCopy` en wordt niet opnieuw
 *     inline uitgeschreven;
 *  3. de plan-parameters komen uit dezelfde run als de detector;
 *  4. het bedrag en de vrijheidstijd kruisen de euro-grens: de host leest de `view*`-piek
 *     en de vrijheidsdagen van de grens, en de grens gebruikt `deflate` + `factorAtAge` en
 *     `freedomDaysAtAge`. De oude vorm `formatWithFreedom(piek, dagtarief)` (een nominaal
 *     bedrag gedeeld door een dagtarief van vandaag, CLAUDE.md "consume, don't recompute")
 *     is nergens meer toegestaan. Dat is strenger dan de vroegere toets, die precies die
 *     vorm vereiste;
 *  5. de melding volgt de meldingen-conventie per katern (ADR 0179 D6).
 *
 * De GETALLEN (factor van de rij, dagen in real en nominal) bewijst de render-test
 * `components/toekomst/state/use-euro-view-feeds.test.tsx`; de TOON van de copy staat in
 * `lib/horizon/deficit-loan-copy.test.ts`.
 */

import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { leesToekomst, leesToekomstAlles } from '@/lib/test-utils/toekomst-bronnen'
import { readSourceLF } from '@/lib/test-utils/read-source'

/** Detector en nominale copy-basis: de meldingen-hook van de state-provider. */
function hook(): string {
  return leesToekomst('meldingen')
}

/** Formatteren en de copy bouwen: de meldingen-host per katern. */
function host(): string {
  return readSourceLF(join(process.cwd(), 'components/toekomst/meldingen/toekomst-katern-meldingen.tsx'))
}

/** Slice van `start` tot en met de eerste `eind` erna; faalt luid als een van beide ontbreekt. */
function blok(src: string, start: string, eind: string, naam: string): string {
  const s = src.indexOf(start)
  expect(s, `${naam} moet bestaan`).toBeGreaterThan(-1)
  const e = src.indexOf(eind, s)
  expect(e, `${naam}: het einde moet ná het begin staan`).toBeGreaterThan(s)
  return src.slice(s, e + eind.length)
}

/** Het memo met de nominale basis, van declaratie tot sluitende dependency-array. */
function basisMemo(): string {
  return blok(hook(), 'const deficitLoanCopyBasis = useMemo', 'homeExcludedFromProgress])', 'het basis-memo')
}

/** Het memo dat de copy bouwt, in de host. */
function copyMemo(): string {
  return blok(host(), 'const deficitLoanCopy = useMemo(', '[deficitLoanCopyBasis, bedragen, masked])', 'het copy-memo')
}

/** De euro-grens voor de meldingen-bedragen. */
function grens(): string {
  return blok(
    leesToekomst('euro'),
    'export function useMeldingBedragenInView(',
    '// ── EINDE EURO-WEERGAVE',
    'useMeldingBedragenInView',
  )
}

describe('tekort-lening-melding — consumeert één bron', () => {
  it('haalt de feiten uit de ongewijzigde detector', () => {
    const src = hook()
    expect(src).toContain("import { detectDeficitLoanFromRows } from '@/lib/horizon/deficit-loan-display'")
    expect(src).toContain('detectDeficitLoanFromRows(unifiedRows, { endAge: simResult?.displayEndAge })')
  })

  it('bouwt de copy op één plek, uit de pure sibling-module', () => {
    expect(host()).toContain("import { buildDeficitLoanCopy } from '@/lib/horizon/deficit-loan-copy'")
    expect(copyMemo()).toContain('return buildDeficitLoanCopy({')
    // De hook levert alleen de basis; hij importeert het type, niet de bouwer.
    expect(hook()).toContain("import type { DeficitLoanCopyInput } from '@/lib/horizon/deficit-loan-copy'")
    expect(hook()).not.toContain('buildDeficitLoanCopy(')
  })

  it('voedt de copy met plan-parameters uit DEZELFDE run', () => {
    const memo = basisMemo()
    expect(memo).toContain('firstAge: deficitLoanNotice.firstAge')
    expect(memo).toContain('aowAge: userAowAge.fractional')
    expect(memo).toContain('displayEndAge,')
    expect(memo).toContain('isPensioenMode,')
    expect(memo).toContain('homeExcludedFromFire: homeExcludedFromProgress')
    // En de host geeft die basis ongewijzigd door.
    expect(copyMemo()).toContain('...deficitLoanCopyBasis,')
  })
})

describe('tekort-lening-melding — de piek kruist de euro-grens exact één keer', () => {
  it('geeft de nominale piek op zijn leeftijd aan de grens', () => {
    expect(host()).toContain(
      '? { bedrag: deficitLoanNotice.peak, age: deficitLoanPiekLeeftijd ?? deficitLoanNotice.firstAge }',
    )
  })

  it('deflateert aan de grens met de kernelfactor van de leeftijd en rekent vrijheidstijd via freedomDaysAtAge', () => {
    const g = grens()
    expect(g).toContain('view: deflate(bedrag, factorAtAge(rows, age), euroView)')
    expect(g).toContain('dagen: freedomDaysAtAge({')
    expect(g).toContain('viewTekortPiek: p.view')
    expect(g).toContain('tekortPiekVrijheidsdagen: p.dagen')
  })

  it('formatteert in de host alleen wat de grens levert, masked-aware', () => {
    const memo = copyMemo()
    expect(memo).toContain('peakText: formatMaskedCurrency(bedragen.viewTekortPiek, masked)')
    expect(memo).toContain('freedomText: vrijheidTekst(bedragen.tekortPiekVrijheidsdagen, masked)')
    // Geen handgerolde dag/jaar-conversie en geen tweede deflatie naast de grens.
    expect(memo).not.toMatch(/peak\s*\/\s*/)
    expect(memo).not.toMatch(/\/\s*365/)
    expect(memo).not.toContain('deflate(')
  })

  it('zet het nominale bedrag nergens meer met een dagtarief van vandaag om', () => {
    // Commentaar mag de oude vorm noemen (als waarschuwing); code niet.
    const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    for (const [naam, src] of [
      ['meldingen-hook', code(hook())],
      ['meldingen-host', code(host())],
    ] as const) {
      expect(src, `${naam}: formatWithFreedom op een kernelbedrag is verboden`).not.toContain('formatWithFreedom(')
      expect(src, `${naam}: de piek hoort niet ruw geformatteerd`).not.toContain(
        'formatMaskedCurrency(deficitLoanNotice.peak',
      )
    }
  })

  it('schrijft de uitleg niet ook nog eens inline uit', () => {
    // De zinnen wonen in de copy-module; staan ze óók in een component, dan
    // bestaan er twee lezingen van hetzelfde verhaal naast elkaar.
    const src = `${leesToekomstAlles()}\n${host()}`
    for (const zin of [
      'De leenperiode loopt van leeftijd',
      'Op het diepste punt staat er',
      'beweegt mee met je woonstrategie',
    ]) {
      expect(src, `copy-zin hoort in deficit-loan-copy.ts, niet in de component: "${zin}"`).not.toContain(zin)
    }
  })
})

describe('tekort-lening-melding — volgt de meldingen-conventie', () => {
  it('minimaliseren gaat per katern, niet per melding (ADR 0179 D6, fase 2)', () => {
    // De losse DeficitNoticeProvider is weg: de melding woont in katern Plan en wordt
    // geminimaliseerd onder de katern-route (`useKaternMeldingMinimize` in de
    // meldingen-host). De meldingen-hook levert alleen het signaal en de basis.
    const src = hook()
    expect(src).not.toContain('useDeficitNotice')
    expect(src).not.toContain('deficit-notice-provider')
    expect(host()).toContain('useKaternMeldingMinimize')
  })

  it('behoudt de partner-view-gating van de melding', () => {
    expect(hook()).toContain('const deficitNoticeVisible = deficitLoanNotice != null && !usePartnerMainLine')
    expect(basisMemo()).toContain('if (!deficitLoanNotice || !deficitNoticeVisible) return null')
  })
})
