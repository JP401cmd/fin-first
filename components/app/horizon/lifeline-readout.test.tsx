/**
 * Component-tests voor `LifelineReadout` — de cijferbar/fase-KPI-strip boven de
 * levenslijn op /toekomst.
 *
 * Kern: bedragmaskering (ADR 0091, laag 2 + laag 4).
 *   Given een gebruiker die op /toekomst "Bedragen verbergen" aanzet,
 *   When de cijferbar rendert,
 *   Then draagt geen enkele waarde-tegel nog een euroteken of cijferreeks —
 *        NETTO VERMOGEN en INLEG/RUIMTE zijn euro's (laag 2), en VRIJ
 *        BESTEEDBAAR is de vrijheidstijd die lineair is in datzelfde
 *        (gemaskeerde) vermogen (laag 4: bedrag ÷ dagtarief is terug te
 *        rekenen). De LEEFTIJD/JAAR- en FASE-tegel blijven ongemoeid: dat zijn
 *        geen bedragen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { LifelineReadout, type LifelineReadoutProps } from './lifeline-readout'
import { MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'

// Stuurbare privacy-mock — default zichtbaar; per test op masked te zetten
// (zelfde patroon als sim-chart.test.tsx / scenario-kaarten.test.tsx).
const mockPrivacy = { masked: false }
vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => mockPrivacy,
}))

beforeEach(() => {
  mockPrivacy.masked = false
})

const PROPS: LifelineReadoutProps = {
  age: 55,
  year: 2041,
  phaseLabel: 'Opbouw',
  phaseColor: '#8a6e42',
  netWorth: 1_166_139,
  freedomTime: '6 jr 5 mnd',
  monthlyLabel: 'Inleg / maand',
  monthlyAmount: 2_450,
}

/** De waarde-regel van één tegel: de tweede child naast het label-kopje. */
function cellValue(container: HTMLElement, label: string): string {
  const labelEl = Array.from(container.querySelectorAll('div')).find(
    d => d.textContent === label && d.className.includes('uppercase'),
  )
  if (!labelEl) throw new Error(`tegel "${label}" niet gevonden`)
  const value = labelEl.nextElementSibling
  if (!value) throw new Error(`tegel "${label}" heeft geen waarde-regel`)
  return value.textContent ?? ''
}

/** Alle tekst die een gebruiker of screenreader kan oppikken. */
function leesbareTeksten(container: HTMLElement): string[] {
  const uit: string[] = []
  container.querySelectorAll('[aria-label], [title]').forEach(el => {
    uit.push(el.getAttribute('aria-label') ?? '')
    uit.push(el.getAttribute('title') ?? '')
  })
  return uit.filter(Boolean)
}

const WAARDE_TEGELS = ['Netto vermogen', 'Vrij besteedbaar', 'Inleg / maand']

describe('LifelineReadout — bedragmaskering (ADR 0091)', () => {
  it('ongemaskeerd tonen de drie waarde-tegels hun bedrag/vrijheidstijd', () => {
    const { container } = render(<LifelineReadout {...PROPS} />)
    expect(cellValue(container, 'Netto vermogen')).toContain('€')
    expect(cellValue(container, 'Inleg / maand')).toContain('€')
    expect(cellValue(container, 'Vrij besteedbaar')).toBe('6 jr 5 mnd')
    // Het volle bedrag staat er letterlijk (nl-NL-groepering).
    expect(container.textContent).toContain('166.139')
  })

  it('gemaskeerd: geen euroteken en geen cijferreeks in enige waarde-tegel', () => {
    mockPrivacy.masked = true
    const { container } = render(<LifelineReadout {...PROPS} />)

    for (const label of WAARDE_TEGELS) {
      const waarde = cellValue(container, label)
      expect(waarde).not.toContain('€')
      expect(waarde).not.toMatch(/\d/)
      expect(waarde).toBe(MASKED_AMOUNT_PLACEHOLDER)
    }
  })

  it('gemaskeerd: het volle bedrag lekt nergens in de strip, ook niet in title/aria', () => {
    mockPrivacy.masked = true
    const { container } = render(<LifelineReadout {...PROPS} />)

    expect(container.textContent).not.toContain('€')
    expect(container.textContent).not.toContain('166.139')
    expect(container.textContent).not.toContain('2.450')
    expect(container.textContent).not.toContain('6 jr 5 mnd')
    for (const tekst of leesbareTeksten(container)) {
      expect(tekst).not.toContain('€')
      expect(tekst).not.toMatch(/\d/)
    }
  })

  it('gemaskeerd blijven leeftijd, jaar en fase staan (geen bedragen)', () => {
    mockPrivacy.masked = true
    const { container } = render(<LifelineReadout {...PROPS} />)
    expect(cellValue(container, 'Leeftijd')).toContain('55')
    expect(cellValue(container, 'Leeftijd')).toContain('2041')
    expect(container.textContent).toContain('Opbouw')
  })

  it('het propcontract blijft ongewijzigd: maskering komt uit de hook, niet uit een prop', () => {
    // @ts-expect-error — `masked` is GEEN prop van LifelineReadout: zou dit
    // compileren, dan was het propcontract stilzwijgend verbreed.
    const metMasked = <LifelineReadout {...PROPS} masked />
    expect(metMasked).toBeTruthy()
  })
})
