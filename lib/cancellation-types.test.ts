/**
 * Regressie voor kaart "Privacy-modus dekt álle bedragen" — cluster A9.
 *
 * De omschrijving van een opzeg-actie wordt als vrije tekst in de database
 * bewaard en later één-op-één getoond. Een bedrag dat daarin gebakken wordt,
 * ontsnapt per definitie aan de privacy-toggle: maskering is client-side en
 * per call-site. Deze suite bewaakt dat de builder géén bedrag meeneemt — het
 * maandbedrag hoort in `euro_impact_monthly` + `metadata.monthly_amount` en
 * wordt live gerenderd via <MaskedAmount>.
 */
import { describe, it, expect } from 'vitest'
import { buildCancellationActionDescription } from './cancellation-types'
import { formatCurrency } from './format'

describe('buildCancellationActionDescription', () => {
  it('noemt het abonnement', () => {
    expect(buildCancellationActionDescription('Netflix')).toContain('Netflix')
  })

  it('bevat geen euroteken', () => {
    expect(buildCancellationActionDescription('Netflix')).not.toContain('€')
  })

  it('bevat geen enkel cijfer — ook niet bij een abonnementsnaam zonder cijfers', () => {
    expect(buildCancellationActionDescription('Netflix')).not.toMatch(/\d/)
  })

  it('bakt het geformatteerde maandbedrag niet in', () => {
    const bedrag = formatCurrency(12.99)
    expect(buildCancellationActionDescription('Netflix')).not.toContain(bedrag)
  })
})
