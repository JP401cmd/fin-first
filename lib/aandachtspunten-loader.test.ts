import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor de jaarruimte-demping in `collectTaxAandachtspunten`
 * (aandachtspunten-loader.ts).
 *
 * Achtergrond: bij een ONBEKENDE factor A rekent de loader met 0 → de jaarruimte
 * komt op de bovengrens (te hoog). Voor een werknemer mét bedrijfspensioen is die
 * bovengrens onbetrouwbaar en de "benut je jaarruimte"-tip dus misleidend. We
 * dempen 'm dan: het jaarruimte-aandachtspunt wordt NIET gepushed.
 *
 * Bedrijfspensioen-signaal: een actief life_event met `event_type === 'pension'`
 * én `metadata.pensioenType === 'bedrijf'` in de loader-bundel (`horizonData.events`).
 *
 * `loadHorizonData`, `computeBox1Tax` en `loadPerspectiveBox3` worden gemockt
 * (DB/zware afhankelijkheden); `buildTaxOverview`, `computeJaarruimte` en
 * `taxOpportunitiesToAandachtspunten` blijven ECHT zodat het demping-pad
 * end-to-end wordt uitgeoefend.
 */

import type { LifeEvent } from './horizon-data'
import type { HorizonPageData } from './horizon-data-loader'
import type { Aandachtspunt } from './aandachtspunten'

const loadHorizonDataMock = vi.fn()
const computeBox1TaxMock = vi.fn()
const loadPerspectiveBox3Mock = vi.fn()

vi.mock('./horizon-data-loader', () => ({
  loadHorizonData: (...args: unknown[]) => loadHorizonDataMock(...args),
}))
vi.mock('./box1-tax', () => ({
  computeBox1Tax: (...args: unknown[]) => computeBox1TaxMock(...args),
}))
vi.mock('./household-tax', () => ({
  loadPerspectiveBox3: (...args: unknown[]) => loadPerspectiveBox3Mock(...args),
}))

import { collectAandachtspunten } from './aandachtspunten-loader'

// Minimale fake-Supabase-client. De budget-/schuld-/asset-producenten falen
// zacht (geen user / lege queries → []), zodat alleen het belasting-aandachtspunt
// overblijft om op te asserteren.
function makeSupabase() {
  const emptyQuery = {
    select: () => emptyQuery,
    eq: () => emptyQuery,
    gte: () => emptyQuery,
    lt: () => emptyQuery,
    order: () => emptyQuery,
    limit: () => Promise.resolve({ data: [], error: null }),
    single: () => Promise.resolve({ data: null, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data: [], error: null }),
  }
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
    from: () => emptyQuery,
  } as never
}

function pensionEvent(pensioenType: string): LifeEvent {
  return {
    id: `pe-${pensioenType}`,
    name: 'Aanvullend pensioen',
    event_type: 'pension',
    target_age: 67,
    target_date: null,
    one_time_cost: 0,
    monthly_cost_change: 0,
    monthly_income_change: 1100,
    duration_months: 0,
    icon: 'Landmark',
    is_active: true,
    sort_order: 1,
    is_indexed: true,
    metadata: { pensioenType },
  } as LifeEvent
}

/**
 * Bouw een HorizonPageData-mock met alleen de velden die collectTaxAandachtspunten
 * leest. Gezond inkomen → jaarruimte > 0 zodat het aandachtspunt zónder demping
 * verschijnt; de demping-flags sturen de uitkomst.
 */
function makeHorizonData(opts: {
  pensioenFactorAKnown: boolean
  pensioenFactorA?: number
  events: LifeEvent[]
}): HorizonPageData {
  return {
    effectiveInput: {
      monthlyIncome: 5000, // netto/maand → grossYearly ruim boven de franchise
      monthlyExpenses: 3000,
    },
    fireParams: { marginaalTarief: 0.495 },
    healthScoreInput: { taxData: { box3Tax: 0 } },
    pensioenFactorA: opts.pensioenFactorA ?? 0,
    pensioenFactorAKnown: opts.pensioenFactorAKnown,
    events: opts.events,
  } as unknown as HorizonPageData
}

function jaarruimtePunt(result: Aandachtspunt[]) {
  return result.find((a) => a.id === 'tax:jaarruimte')
}

describe('collectTaxAandachtspunten — jaarruimte-demping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    computeBox1TaxMock.mockReturnValue({ tax: 12345 })
    loadPerspectiveBox3Mock.mockResolvedValue({ personal: { tax: 0 } })
  })

  it('(a) bedrijfspensioen + ONBEKENDE factor A → géén jaarruimte-aandachtspunt', async () => {
    loadHorizonDataMock.mockResolvedValue(
      makeHorizonData({
        pensioenFactorAKnown: false,
        events: [pensionEvent('bedrijf')],
      }),
    )
    const result = await collectAandachtspunten(makeSupabase())
    expect(jaarruimtePunt(result)).toBeUndefined()
  })

  it('(b) bekende factor A (ingevuld) → jaarruimte-aandachtspunt WÉL aanwezig', async () => {
    loadHorizonDataMock.mockResolvedValue(
      makeHorizonData({
        pensioenFactorAKnown: true,
        pensioenFactorA: 1200,
        events: [pensionEvent('bedrijf')],
      }),
    )
    const result = await collectAandachtspunten(makeSupabase())
    const punt = jaarruimtePunt(result)
    expect(punt).toBeDefined()
    // Deeplink-anchor naar het uitlegblok (TAAK 1).
    expect(punt?.href).toBe('/overzicht/belasting/box1#jaarruimte-uitleg')
  })

  it('(c) geen bedrijfspensioen + ONBEKENDE factor A (zzp-pad) → jaarruimte WÉL aanwezig', async () => {
    loadHorizonDataMock.mockResolvedValue(
      makeHorizonData({
        pensioenFactorAKnown: false,
        events: [], // geen pensioen-event
      }),
    )
    const result = await collectAandachtspunten(makeSupabase())
    expect(jaarruimtePunt(result)).toBeDefined()
  })

  it('lijfrente-pensioen (geen bedrijf) + ONBEKENDE factor A → niet gedempt', async () => {
    loadHorizonDataMock.mockResolvedValue(
      makeHorizonData({
        pensioenFactorAKnown: false,
        events: [pensionEvent('lijfrente_levenslang')],
      }),
    )
    const result = await collectAandachtspunten(makeSupabase())
    expect(jaarruimtePunt(result)).toBeDefined()
  })

  it('expliciete factor A 0 (zzp, bekend) + bedrijfspensioen-event → niet gedempt', async () => {
    loadHorizonDataMock.mockResolvedValue(
      makeHorizonData({
        pensioenFactorAKnown: true,
        pensioenFactorA: 0,
        events: [pensionEvent('bedrijf')],
      }),
    )
    const result = await collectAandachtspunten(makeSupabase())
    expect(jaarruimtePunt(result)).toBeDefined()
  })
})
