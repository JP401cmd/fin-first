/**
 * Unit-tests voor de toegankelijke naam van de rij-checkbox in de
 * import-duplicatenstap (M34). Pure helper, dus geen DOM/render nodig.
 */
import { describe, it, expect } from 'vitest'
import { rowCheckboxLabel, type LabelableRow } from './row-checkbox-label'

const row = (over: Partial<LabelableRow> = {}): LabelableRow => ({
  date: '2026-03-12',
  description: 'Albert Heijn',
  counterparty_name: null,
  amount: -12.34,
  ...over,
})

/**
 * `Intl.NumberFormat('nl-NL', { style: 'currency' })` zet een harde spatie
 * (U+00A0) tussen het euroteken en het getal. Normaliseren houdt de
 * verwachtingen leesbaar zonder de opmaak zelf te veranderen.
 */
const label = (r: LabelableRow, masked = false) =>
  rowCheckboxLabel(r, { masked }).replace(/ /g, ' ')

describe('rowCheckboxLabel', () => {
  it('benoemt datum, omschrijving en bedrag', () => {
    expect(label(row())).toBe('Importeren: 12 maart, Albert Heijn, € 12,34 af')
  })

  it('een bijschrijving heet "bij"', () => {
    expect(label(row({ amount: 250 }))).toBe(
      'Importeren: 12 maart, Albert Heijn, € 250,00 bij',
    )
  })

  it('voegt de tegenpartij toe wanneer die iets nieuws zegt', () => {
    expect(
      label(row({ description: 'SEPA overboeking', counterparty_name: 'J. Jansen' })),
    ).toContain('SEPA overboeking (J. Jansen)')
  })

  it('herhaalt de tegenpartij niet als hij gelijk is aan de omschrijving', () => {
    expect(label(row({ counterparty_name: 'Albert Heijn' }))).toBe(
      'Importeren: 12 maart, Albert Heijn, € 12,34 af',
    )
  })

  it('valt terug op "zonder omschrijving" bij een lege omschrijving', () => {
    expect(label(row({ description: '  ' }))).toContain('zonder omschrijving')
  })

  it('lekt het bedrag NIET wanneer bedragmaskering aanstaat', () => {
    const masked = label(row({ amount: -1234.56 }), true)
    expect(masked).toBe('Importeren: 12 maart, Albert Heijn, bedrag verborgen')
    expect(masked).not.toContain('1234')
    expect(masked).not.toContain('1.234')
  })

  it('houdt datum en omschrijving zichtbaar bij maskering (die staan ook op het scherm)', () => {
    const masked = label(row({ description: 'Huur maart' }), true)
    expect(masked).toContain('12 maart')
    expect(masked).toContain('Huur maart')
  })

  it('valt bij een onparseerbare datum terug op de rauwe waarde i.p.v. "Invalid Date"', () => {
    const raw = label(row({ date: 'onbekend' }))
    expect(raw).toContain('onbekend')
    expect(raw).not.toContain('Invalid')
  })

  it('geeft elke rij een onderscheidende naam (de kern van de bevinding)', () => {
    const labels = [
      label(row({ date: '2026-03-12', amount: -10 })),
      label(row({ date: '2026-03-13', amount: -10 })),
      label(row({ date: '2026-03-12', amount: -20 })),
    ]
    expect(new Set(labels).size).toBe(labels.length)
  })
})
