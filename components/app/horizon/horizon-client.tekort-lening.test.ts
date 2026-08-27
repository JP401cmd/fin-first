/**
 * Bron-grendel op de tekort-lening-melding in `horizon-client.tsx`.
 *
 * WAAROM EEN BRON-TEST: `horizon-client.tsx` is >9000 regels en de melding hangt
 * aan een volledige kernel-run (unifiedRows + displayEndAge). Een render-test zou
 * een complete horizon-bundel moeten opstellen om één blok te bewijzen — en zou
 * juist NIET vangen wat hier fout kán gaan:
 *  1. dat de copy uit de pure sibling-module komt (`buildDeficitLoanCopy`) en niet
 *    opnieuw inline wordt uitgeschreven — twee lezingen van hetzelfde verhaal is
 *    precies de drift die deze uitbreiding opruimt;
 *  2. dat de vrijheidstijd via de canonieke helper op de bundel-dagbasis loopt
 *    (`formatWithFreedom(..., canonicalDailyRate, ...)`), geen eigen dag/jaar-som;
 *  3. dat de detector (`deficit-loan-display.ts`) ONgewijzigd geconsumeerd wordt;
 *  4. dat de melding de meldingen-conventie volgt: gated op de gedeelde
 *    `useDeficitNotice`-toestand, met een altijd-gemounte aria-live-regio.
 * (Precedent: `horizon-client.wat-hoort-daarbij.test.ts` leest de bron óók letterlijk.)
 *
 * De TOON-grendel op de copy zelf staat in `lib/horizon/deficit-loan-copy.test.ts`:
 * die asserteert op de GEBOUWDE zinnen van alle plan-varianten en is daarmee
 * sterker dan een tekstscan op deze bron.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE_PATH = join(process.cwd(), 'components', 'app', 'horizon', 'horizon-client.tsx')

function source(): string {
  return readFileSync(SOURCE_PATH, 'utf8')
}

/** Het memo dat de copy bouwt, van declaratie tot sluitende dependency-array. */
function copyMemo(src: string): string {
  const start = src.indexOf('const deficitLoanCopy = useMemo(')
  expect(start, 'het deficitLoanCopy-memo moet bestaan').toBeGreaterThan(-1)
  const eind = src.indexOf('homeExcludedFromProgress])', start)
  expect(eind, 'de dependency-array van het memo moet ná de declaratie staan').toBeGreaterThan(start)
  return src.slice(start, eind)
}

describe('horizon-client — tekort-lening-melding consumeert één bron', () => {
  it('haalt de feiten uit de ongewijzigde detector', () => {
    const src = source()
    expect(src).toContain("import { detectDeficitLoanFromRows } from '@/lib/horizon/deficit-loan-display'")
    expect(src).toContain('detectDeficitLoanFromRows(unifiedRows, { endAge: simResult?.displayEndAge })')
  })

  it('haalt de copy uit de pure sibling-module', () => {
    const src = source()
    expect(src).toContain("import { buildDeficitLoanCopy } from '@/lib/horizon/deficit-loan-copy'")
    expect(copyMemo(src)).toContain('return buildDeficitLoanCopy({')
  })

  it('voedt de copy met plan-parameters uit DEZELFDE run', () => {
    const memo = copyMemo(source())
    expect(memo).toContain('firstAge: deficitLoanNotice.firstAge')
    expect(memo).toContain('aowAge: userAowAge.fractional')
    expect(memo).toContain('displayEndAge,')
    expect(memo).toContain('isPensioenMode,')
    expect(memo).toContain('homeExcludedFromFire: homeExcludedFromProgress')
  })

  it('zet de vrijheidstijd om via de canonieke helper op de bundel-dagbasis', () => {
    const memo = copyMemo(source())
    expect(memo).toContain('formatWithFreedom(deficitLoanNotice.peak, canonicalDailyRate')
    // Geen handgerolde dag/jaar-conversie naast de helper.
    expect(memo).not.toMatch(/peak\s*\/\s*/)
    expect(memo).not.toMatch(/\/\s*365/)
  })

  it('formatteert de piek masked-aware via de canonieke helper', () => {
    expect(copyMemo(source())).toContain('peakText: formatMaskedCurrency(deficitLoanNotice.peak, masked)')
  })

  it('schrijft de uitleg niet ook nog eens inline uit', () => {
    // De zinnen wonen in de copy-module; staan ze óók in de component, dan
    // bestaan er twee lezingen van hetzelfde verhaal naast elkaar.
    const src = source()
    for (const zin of [
      'De leenperiode loopt van leeftijd',
      'Op het diepste punt staat er',
      'beweegt mee met je woonstrategie',
    ]) {
      expect(src, `copy-zin hoort in deficit-loan-copy.ts, niet in de component: "${zin}"`).not.toContain(zin)
    }
  })
})

describe('horizon-client — tekort-lening-melding volgt de meldingen-conventie', () => {
  it('gebruikt de gedeelde minimaliseer-toestand (geen tweede, lokale state)', () => {
    const src = source()
    expect(src).toContain("import { useDeficitNotice } from '@/components/app/horizon/deficit-notice-provider'")
    expect(src).toContain('} = useDeficitNotice(deficitNoticeVisible ? deficitLoanNotice!.peak : null)')
  })

  it('gated de zichtbare melding op display === \'expanded\'', () => {
    expect(source()).toContain("deficitLoanNotice && deficitDisplay === 'expanded'")
  })

  it('houdt de aria-live-regio altijd gemount en kondigt minimaliseren sr-only aan', () => {
    const src = source()
    const start = src.indexOf('<section role="status" aria-live="polite">')
    expect(start, 'de aria-live-regio moet bestaan').toBeGreaterThan(-1)
    const regio = src.slice(start, src.indexOf('</section>', start))
    expect(regio).toContain("deficitDisplay === 'minimized'")
    expect(regio).toContain('className="sr-only"')
    expect(regio).toContain('stip naast de informatie-knop')
  })

  it('toont de minimaliseer-knop alleen waar de keuze onthouden wordt', () => {
    const src = source()
    expect(src).toContain('{canMinimizeDeficit && (')
    expect(src).toContain('onClick={minimizeDeficitNotice}')
    expect(src).toContain('aria-label="Minimaliseren"')
  })

  it('behoudt de partner-view-gating van de melding', () => {
    expect(source()).toContain('const deficitNoticeVisible = deficitLoanNotice != null && !usePartnerMainLine')
  })
})
