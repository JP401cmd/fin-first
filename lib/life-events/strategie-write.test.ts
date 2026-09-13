import { describe, it, expect } from 'vitest'
import { bouwStrategieRij, strategieInvoerFout } from './strategie-write'
import { potFromEvent } from '@/lib/pension/pot-draft'
import { computeAowMonthly, type LifeEvent } from '@/lib/horizon-data'

/**
 * TPR-15 stap 3 — het schrijfcontract dat route en formulier delen, plus de terugvallen
 * voor bestaande (import-)rijen. Gepind naar aanleiding van de eindreview (M3/M4): een
 * UPO-pot zonder `isGeindexeerd` blijft geïndexeerd, een ongeldige duur wordt kiesbaar, een
 * lange importnaam blijft opslaanbaar, en de fouttekst noemt het veld en de grens.
 */

const POT_EVENT: LifeEvent = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Pensioenfonds Zorg en Welzijn — ouderdomspensioen (deels indicatief)',
  event_type: 'pension',
  target_age: 68,
  target_date: null,
  one_time_cost: 0,
  monthly_cost_change: 0,
  monthly_income_change: 900,
  duration_months: 0,
  icon: 'Landmark',
  is_active: true,
  sort_order: 1001,
  is_indexed: true,
  metadata: { pensioenType: 'banksparen', brutoBedrag: 900, mijnpensioenBron: 'pfzw', tot_stopmoment: true },
}

describe('potFromEvent — terugvallen voor bestaande rijen', () => {
  it('zonder isGeindexeerd volgt de pot is_indexed (zoals de kern)', () => {
    expect(potFromEvent(POT_EVENT).isGeindexeerd).toBe(true)
  })

  it('een duur die niet bij het type past, wordt de eerste toegestane', () => {
    // legacy banksparen → lijfrente_bancair, dat alleen 20 jaar kent
    expect(potFromEvent(POT_EVENT)).toMatchObject({ pensioenType: 'lijfrente_bancair', uitkeringsduur: '20' })
  })

  it('een geïmporteerde pot is ongewijzigd opnieuw op te slaan (lange naam)', () => {
    const { id, ...pot } = potFromEvent(POT_EVENT)
    expect(strategieInvoerFout({ event_type: 'pension', id, pot })).toBeNull()
  })
})

describe('bouwStrategieRij', () => {
  it('pensioen: bewaart onbekende metadata, verwijdert tot_stopmoment, bedrag uit de pot', () => {
    const { id, ...pot } = potFromEvent(POT_EVENT)
    const rij = bouwStrategieRij({ event_type: 'pension', id: id!, pot }, POT_EVENT.metadata)
    expect(rij.metadata.mijnpensioenBron).toBe('pfzw')
    expect(rij.metadata).not.toHaveProperty('tot_stopmoment')
    expect(rij.duration_months).toBe(240)
    expect(rij.is_indexed).toBe(true)
  })

  it('AOW: het maandbedrag volgt leefsituatie en jaren buiten Nederland', () => {
    const tien = bouwStrategieRij({ event_type: 'aow', target_age: 67, leefsituatie: 'samenwonend', jarenBuitenNL: 10 })
    expect(tien.monthly_income_change).toBe(computeAowMonthly('samenwonend', 10))
    expect(tien.monthly_income_change).toBeLessThan(computeAowMonthly('samenwonend', 0))
  })
})

describe('strategieInvoerFout — Nederlands, met veld en grens', () => {
  it.each([
    [{ event_type: 'aow', target_age: 80, leefsituatie: 'alleenstaand', jarenBuitenNL: 0 }, '"AOW-ingangsleeftijd" mag hoogstens 75 zijn.'],
    [{ event_type: 'aow', target_age: 67, leefsituatie: 'alleenstaand', jarenBuitenNL: 60 }, '"Jaren buiten Nederland" mag hoogstens 50 zijn.'],
    [
      { event_type: 'werk', target_age: 40, metadata: { huidigNettoMaand: 1, reeleGroeiPct: 0.5, faseStappen: [], sprongen: [] } },
      '"Verwachte reële stijging" mag hoogstens 15% zijn.',
    ],
  ])('%j', (body, tekst) => {
    expect(strategieInvoerFout(body)).toBe(tekst)
  })
})
