/**
 * TPR-07 vangrail — snapshots die naar de browser gaan dragen nooit het partnerblok.
 *
 * `RegelSimSnapshot` (dashboard-data-loader) en `VariantenSweepSnapshot`
 * (varianten-sweep-loader) worden als prop geserialiseerd in de RSC-payload. Het
 * partnerblok bevat inkomen en AOW-gegevens van de partner en hoort uitsluitend in de
 * server-side huishouden-run. Beide bouwers halen de context daarom door
 * `rawContextZonderPartner`; deze test pint de helper én dat beide bouwers 'm gebruiken.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  rawContextZonderPartner,
  type ConvergentieRawContext,
} from './convergentie-router'

const basis = {
  profile: {},
  assets: [],
  debts: [],
  lifeEvents: [],
  yearlyExpenses: 30_000,
} as unknown as ConvergentieRawContext

describe('rawContextZonderPartner', () => {
  it('haalt het partnerblok weg en laat de rest ongemoeid', () => {
    const metPartner = {
      ...basis,
      partner: { netMonthlyIncome: 3000 },
    } as unknown as ConvergentieRawContext
    const uit = rawContextZonderPartner(metPartner)
    expect('partner' in uit).toBe(false)
    expect(uit.yearlyExpenses).toBe(30_000)
    expect(JSON.stringify(uit)).not.toContain('partner')
  })

  it('geeft een solo-context als dezelfde referentie terug', () => {
    expect(rawContextZonderPartner(basis)).toBe(basis)
  })
})

describe('snapshot-bouwers gebruiken de vangrail', () => {
  const root = process.cwd()
  // TPR-15: de RegelSimSnapshot heeft één client-veilige bouwer; die roept de vangrail
  // aan, en elke plek die de snapshot naar de browser stuurt gaat via die bouwer.
  it.each([
    ['lib/future/regel-sim-snapshot.ts', 'rawContextZonderPartner('],
    ['lib/dashboard-data-loader.ts', 'buildClientRegelSimSnapshot('],
    ['app/api/plan-review/editor-context/route.ts', 'buildClientRegelSimSnapshot('],
    ['lib/tax-lifetime/varianten-sweep-loader.ts', 'rawContextZonderPartner('],
  ])('%s geeft geen rauwe rawContext door', (pad, vangrail) => {
    const bron = readFileSync(join(root, pad), 'utf8')
    expect(bron).toContain(vangrail)
    expect(bron).not.toMatch(/rawContext:\s*(shared|run)\.rawContext\b/)
  })
})
