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
 * Werkgeverspensioen-signaal (`hasWerkgeverspensioen`, lib/jaarruimte.ts): een
 * actief life_event met `event_type === 'pension'` én `metadata.pensioenType ===
 * 'bedrijf'` in de loader-bundel (`horizonData.events`), OF — sinds 3-9-2026 —
 * een EIGEN `assets`-rij met `asset_type 'retirement'` en subtype
 * uitkeringsregeling/premieregeling in `horizonData.assets` (lijfrente dempt
 * nooit; partner-rijen tellen niet — de assets-SELECT is huishoud-gedeeld).
 *
 * De DB-randen worden gemockt (`loadHorizonData`, `loadPerspectiveBox3`,
 * `resolveBox1GrossIncome`) plus `computeBox1Tax` als goedkope, monotone
 * tariefmotor. De hele kansen-KETEN blijft ECHT: `loadFiscaleKansen` →
 * `computeJaarruimte` → `jaarruimteBesparing` → `buildOpportunities` →
 * `toTaxOpportunities` → `taxOpportunitiesToAandachtspunten`, zodat het
 * demping-pad end-to-end wordt uitgeoefend op de echte kansen-producent.
 */

import type { LifeEvent } from './horizon-data'
import type { HorizonRawData } from './horizon-data-loader'
import type { Aandachtspunt } from './aandachtspunten'
import type { Asset } from './asset-data'
import { calculateBox3 } from './box3-data'

const loadHorizonRawMock = vi.fn()
const computeBox1TaxMock = vi.fn()
const loadPerspectiveBox3Mock = vi.fn()
const resolveBox1GrossIncomeMock = vi.fn()

vi.mock('./horizon-data-loader', () => ({
  loadHorizonRaw: (...args: unknown[]) => loadHorizonRawMock(...args),
}))
vi.mock('./box1-tax', () => ({
  computeBox1Tax: (...args: unknown[]) => computeBox1TaxMock(...args),
}))
vi.mock('./household-tax', () => ({
  loadPerspectiveBox3: (...args: unknown[]) => loadPerspectiveBox3Mock(...args),
}))
vi.mock('./box1-income', () => ({
  resolveBox1GrossIncome: (...args: unknown[]) => resolveBox1GrossIncomeMock(...args),
  // De eigen-woning-helft van de Box 1-invoer (C8). Deze suite draait geen
  // eigen woning, dus de inerte uitkomst volstaat — maar hij MOET bestaan:
  // `loadFiscaleKansen` roept 'm sinds C8 altijd aan, en een ontbrekende export
  // liet de hele kansen-keten stil falen (alle belasting-aandachtspunten weg).
  resolveEigenWoningBox1Input: async () => ({
    wozValue: undefined,
    hypotheekRente: undefined,
    hasEigenWoning: false,
  }),
  GEEN_EIGEN_WONING: {
    wozValue: undefined,
    hypotheekRente: undefined,
    hasEigenWoning: false,
  },
}))

/**
 * Minimaal Box 3-resultaat: leeg vermogen → `generateBox3Strategies` produceert
 * geen enkel scenario (te weinig beleggingen, geen heffing), zodat de
 * jaarruimte-kans als enige belasting-aandachtspunt overblijft en de asserties
 * hieronder ondubbelzinnig zijn.
 */
function emptyBox3() {
  return {
    dailyExpenses: 100,
    hasHousehold: false,
    // Echte engine-uitvoer i.p.v. een handgeschreven object: `Box3Result`
    // draagt o.a. `params` (tarief/forfaits) die de strategie-generator leest.
    personal: calculateBox3({
      assets: [],
      debts: [],
      hasPartner: false,
      dailyExpenses: 100,
      year: 2026,
    }),
  }
}

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
    // Er IS een gebruiker (de kansen-loader heeft er één nodig voor de
    // Box 1-bron); alle tabellen blijven leeg, dus de budget-/schuld-/asset-
    // producenten leveren nog steeds niets.
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }) },
    from: () => emptyQuery,
  } as never
}

/**
 * Fake-Supabase met een echte USER én een `actions`-tabel die de meegegeven
 * open-actie-rijen teruggeeft. Alle andere tabellen (profiles/budgets/
 * transactions/debts/assets) blijven leeg zodat alleen het belasting-
 * aandachtspunt in het resultaat overblijft — en de actie-kruising op dat punt
 * kan worden geasserteerd. De `actions`-chain ondersteunt de volledige leeskant
 * (`select/eq/in/not/limit`) en levert de meegegeven rijen (met `status` en
 * `completed_at`) zodat zowel de open- als de afgerond-binnen-venster-suppressie
 * wordt uitgeoefend.
 */
function makeSupabaseWithActions(
  actionRows: Array<{ metadata: unknown; status?: string; completed_at?: string }>,
) {
  const emptyQuery = {
    select: () => emptyQuery,
    eq: () => emptyQuery,
    gte: () => emptyQuery,
    lt: () => emptyQuery,
    order: () => emptyQuery,
    not: () => emptyQuery,
    limit: () => Promise.resolve({ data: [], error: null }),
    single: () => Promise.resolve({ data: null, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data: [], error: null }),
  }
  const actionsQuery = {
    select: () => actionsQuery,
    eq: () => actionsQuery,
    in: () => actionsQuery,
    not: () => actionsQuery,
    limit: () => Promise.resolve({ data: actionRows, error: null }),
    then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data: actionRows, error: null }),
  }
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }),
    },
    from: (table: string) => (table === 'actions' ? actionsQuery : emptyQuery),
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
 * Minimale actieve `assets.retirement`-rij zoals `getActiveAssets` 'm in de
 * horizon-bundel legt. `userId` default = de ingelogde testgebruiker ('u1', zie
 * `makeSupabase`); geef 'partner' mee voor de scoping-regressie.
 */
function retirementAsset(subtype: string | null, userId = 'u1', assetType = 'retirement'): Asset {
  return {
    id: `ra-${assetType}-${subtype}-${userId}`,
    user_id: userId,
    name: 'Pensioenpot',
    asset_type: assetType,
    subtype,
    current_value: 50_000,
    is_active: true,
    ownership: 'shared',
  } as unknown as Asset
}

/** Bruto-jaarinkomen dat de (gemockte) canonieke Box 1-bron teruggeeft. */
const GROSS_YEARLY = 120_000

/**
 * Bouw een HorizonRawData-mock met alleen de velden die de belasting-producent
 * en de kansen-loader lezen. Het bruto inkomen komt niet meer hiervandaan maar
 * uit `resolveBox1GrossIncome`; wat hier telt zijn de factor-A-flags die de
 * demping sturen.
 */
function makeHorizonData(opts: {
  pensioenFactorAKnown: boolean
  pensioenFactorA?: number
  events: LifeEvent[]
  /** Actieve assets in de bundel (huishoud-gedeeld, dus mét evt. partner-rijen). */
  assets?: Asset[]
}): HorizonRawData {
  return {
    effectiveInput: {
      monthlyIncome: 5000, // netto/maand → grossYearly ruim boven de franchise
      monthlyExpenses: 3000,
    },
    fireParams: { marginaalTarief: 0.495 },
    healthScoreInput: { taxData: { box3Tax: 0 } },
    // Canoniek 12-mnd rolling dagtarief + herkomst-object. `loadFiscaleKansen`
    // leest sinds 4441a214e (27-08-2026) `dailyExpenseRateDetail.source` voor
    // de kansen-bundel; zonder dit veld gooide de hele belasting-producent en
    // slikte `safe()` dat stil in (alle "WÉL aanwezig"-cases rood sinds die
    // commit — hersteld 3-9-2026 bij de assets.retirement-kaart).
    dailyExpenseRate: 100,
    dailyExpenseRateDetail: {
      dailyRate: 100,
      monthlyExpenses: 3000,
      dataMonths: 12,
      source: 'transactions',
    },
    pensioenFactorA: opts.pensioenFactorA ?? 0,
    pensioenFactorAKnown: opts.pensioenFactorAKnown,
    events: opts.events,
    assets: opts.assets ?? [],
  } as unknown as HorizonRawData
}

function jaarruimtePunt(result: Aandachtspunt[]) {
  return result.find((a) => a.id === 'tax:jaarruimte')
}

describe('collectTaxAandachtspunten — jaarruimte-demping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Variabele (niet-vlakke) mock: `jaarruimteBesparing` (ADR 0040/0041) roept
    // `computeBox1Tax` intern TWEE keer aan (bruto en bruto − inleg) en neemt het
    // verschil. Een vlakke `mockReturnValue` gaf voor beide calls hetzelfde getal
    // → delta 0 → savings 0 → de `netEffect > 0`-toelatingsregel van
    // `toTaxOpportunities` hield het jaarruimte-aandachtspunt overal buiten.
    // Deze mock is monotoon in het bruto-inkomen (net als de echte motor) zodat
    // een positieve besparing overblijft.
    computeBox1TaxMock.mockImplementation((input: { grossYearlyIncome: number }) => ({
      tax: Math.round(input.grossYearlyIncome * 0.3697),
    }))
    loadPerspectiveBox3Mock.mockResolvedValue(emptyBox3())
    resolveBox1GrossIncomeMock.mockResolvedValue({ grossYearly: GROSS_YEARLY })
  })

  it('(a) bedrijfspensioen + ONBEKENDE factor A → géén jaarruimte-aandachtspunt', async () => {
    loadHorizonRawMock.mockResolvedValue(
      makeHorizonData({
        pensioenFactorAKnown: false,
        events: [pensionEvent('bedrijf')],
      }),
    )
    const result = await collectAandachtspunten(makeSupabase())
    expect(jaarruimtePunt(result)).toBeUndefined()
  })

  it('(b) bekende factor A (ingevuld) → jaarruimte-aandachtspunt WÉL aanwezig', async () => {
    loadHorizonRawMock.mockResolvedValue(
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
    loadHorizonRawMock.mockResolvedValue(
      makeHorizonData({
        pensioenFactorAKnown: false,
        events: [], // geen pensioen-event
      }),
    )
    const result = await collectAandachtspunten(makeSupabase())
    expect(jaarruimtePunt(result)).toBeDefined()
  })

  it('lijfrente-pensioen (geen bedrijf) + ONBEKENDE factor A → niet gedempt', async () => {
    loadHorizonRawMock.mockResolvedValue(
      makeHorizonData({
        pensioenFactorAKnown: false,
        events: [pensionEvent('lijfrente_levenslang')],
      }),
    )
    const result = await collectAandachtspunten(makeSupabase())
    expect(jaarruimtePunt(result)).toBeDefined()
  })

  it('expliciete factor A 0 (zzp, bekend) + bedrijfspensioen-event → niet gedempt', async () => {
    loadHorizonRawMock.mockResolvedValue(
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

/**
 * Werkgeverspensioen via `assets.retirement` (Notion P3, eigenaarsbesluit
 * 2-9-2026): wie zijn pensioenpot als bezitting invoerde maar de pensioen-wizard
 * nooit doorliep (geen life_event), moet de bovengrens-tip óók gedempt zien —
 * maar alleen voor werkgevers-subtypes, en alleen voor EIGEN rijen.
 */
describe('collectTaxAandachtspunten — werkgeverspensioen via assets.retirement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    computeBox1TaxMock.mockImplementation((input: { grossYearlyIncome: number }) => ({
      tax: Math.round(input.grossYearlyIncome * 0.3697),
    }))
    loadPerspectiveBox3Mock.mockResolvedValue(emptyBox3())
    resolveBox1GrossIncomeMock.mockResolvedValue({ grossYearly: GROSS_YEARLY })
  })

  it('(1a) eigen retirement-asset subtype uitkeringsregeling + ONBEKENDE factor A, géén event → gedempt', async () => {
    loadHorizonRawMock.mockResolvedValue(
      makeHorizonData({
        pensioenFactorAKnown: false,
        events: [],
        assets: [retirementAsset('uitkeringsregeling')],
      }),
    )
    const result = await collectAandachtspunten(makeSupabase())
    expect(jaarruimtePunt(result)).toBeUndefined()
  })

  it('(1b) eigen retirement-asset subtype premieregeling + ONBEKENDE factor A → gedempt', async () => {
    loadHorizonRawMock.mockResolvedValue(
      makeHorizonData({
        pensioenFactorAKnown: false,
        events: [],
        assets: [retirementAsset('premieregeling')],
      }),
    )
    const result = await collectAandachtspunten(makeSupabase())
    expect(jaarruimtePunt(result)).toBeUndefined()
  })

  it('(2) eigen retirement-asset subtype lijfrente (privé-pendant) + ONBEKENDE factor A → NIET gedempt', async () => {
    loadHorizonRawMock.mockResolvedValue(
      makeHorizonData({
        pensioenFactorAKnown: false,
        events: [],
        assets: [retirementAsset('lijfrente')],
      }),
    )
    const result = await collectAandachtspunten(makeSupabase())
    expect(jaarruimtePunt(result)).toBeDefined()
  })

  it('(2b) retirement-asset zónder subtype (null) → NIET gedempt (fail-closed)', async () => {
    loadHorizonRawMock.mockResolvedValue(
      makeHorizonData({
        pensioenFactorAKnown: false,
        events: [],
        assets: [retirementAsset(null)],
      }),
    )
    const result = await collectAandachtspunten(makeSupabase())
    expect(jaarruimtePunt(result)).toBeDefined()
  })

  it('(3) PARTNER heeft een werkgeverspensioen-asset (huishoud-gedeelde rij), gebruiker zelf niet → NIET gedempt', async () => {
    loadHorizonRawMock.mockResolvedValue(
      makeHorizonData({
        pensioenFactorAKnown: false,
        events: [],
        assets: [retirementAsset('uitkeringsregeling', 'partner')],
      }),
    )
    const result = await collectAandachtspunten(makeSupabase())
    expect(jaarruimtePunt(result)).toBeDefined()
  })

  it('(3b) eigen werkgevers-asset náást een partner-rij → gedempt (eigen rij telt, partner-rij niet)', async () => {
    loadHorizonRawMock.mockResolvedValue(
      makeHorizonData({
        pensioenFactorAKnown: false,
        events: [],
        assets: [retirementAsset('lijfrente', 'partner'), retirementAsset('premieregeling')],
      }),
    )
    const result = await collectAandachtspunten(makeSupabase())
    expect(jaarruimtePunt(result)).toBeUndefined()
  })

  it('(4) eigen werkgevers-asset + BEKENDE factor A → NIET gedempt (bekende factor A wint)', async () => {
    loadHorizonRawMock.mockResolvedValue(
      makeHorizonData({
        pensioenFactorAKnown: true,
        pensioenFactorA: 1200,
        events: [],
        assets: [retirementAsset('uitkeringsregeling')],
      }),
    )
    const result = await collectAandachtspunten(makeSupabase())
    expect(jaarruimtePunt(result)).toBeDefined()
  })

  it('(5) niet-retirement asset met een werkgevers-subtype-string → NIET gedempt', async () => {
    loadHorizonRawMock.mockResolvedValue(
      makeHorizonData({
        pensioenFactorAKnown: false,
        events: [],
        assets: [retirementAsset('premieregeling', 'u1', 'investment')],
      }),
    )
    const result = await collectAandachtspunten(makeSupabase())
    expect(jaarruimtePunt(result)).toBeDefined()
  })

  it('(6) bestaand life_event-pad blijft werken naast een lege assets-bundel → gedempt', async () => {
    loadHorizonRawMock.mockResolvedValue(
      makeHorizonData({
        pensioenFactorAKnown: false,
        events: [pensionEvent('bedrijf')],
        assets: [],
      }),
    )
    const result = await collectAandachtspunten(makeSupabase())
    expect(jaarruimtePunt(result)).toBeUndefined()
  })
})

describe('collectAandachtspunten — actie-kruising (suppressie)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Zie toelichting in de eerste describe-block: monotone mock nodig zodat
    // jaarruimteBesparing() (twee interne computeBox1Tax-calls) een positieve
    // besparing oplevert i.p.v. een vlakke 0-delta.
    computeBox1TaxMock.mockImplementation((input: { grossYearlyIncome: number }) => ({
      tax: Math.round(input.grossYearlyIncome * 0.3697),
    }))
    loadPerspectiveBox3Mock.mockResolvedValue(emptyBox3())
    resolveBox1GrossIncomeMock.mockResolvedValue({ grossYearly: GROSS_YEARLY })
    // Gezond inkomen + bekende factor A → tax:jaarruimte verschijnt normaal.
    loadHorizonRawMock.mockResolvedValue(
      makeHorizonData({
        pensioenFactorAKnown: true,
        pensioenFactorA: 1200,
        events: [],
      }),
    )
  })

  it('onderdrukt een aandachtspunt dat al als OPEN actie op de lijst staat', async () => {
    const result = await collectAandachtspunten(
      makeSupabaseWithActions([
        { metadata: { aandachtspunt_id: 'tax:jaarruimte' }, status: 'open' },
      ]),
    )
    expect(jaarruimtePunt(result)).toBeUndefined()
  })

  it('laat het aandachtspunt staan als de open actie een ander id heeft', async () => {
    const result = await collectAandachtspunten(
      makeSupabaseWithActions([
        { metadata: { aandachtspunt_id: 'debt:andere-schuld' }, status: 'open' },
      ]),
    )
    expect(jaarruimtePunt(result)).toBeDefined()
  })

  it('laat het aandachtspunt staan als de open actie geen aandachtspunt_id heeft', async () => {
    const result = await collectAandachtspunten(
      makeSupabaseWithActions([{ metadata: {}, status: 'open' }]),
    )
    expect(jaarruimtePunt(result)).toBeDefined()
  })

  it('onderdrukt een aandachtspunt met een RECENT afgeronde actie (≤9 mnd)', async () => {
    // Gisteren afgerond → ruim binnen het 9-maandsvenster t.o.v. elke echte now.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const result = await collectAandachtspunten(
      makeSupabaseWithActions([
        { metadata: { aandachtspunt_id: 'tax:jaarruimte' }, status: 'completed', completed_at: yesterday },
      ]),
    )
    expect(jaarruimtePunt(result)).toBeUndefined()
  })

  it('laat het aandachtspunt staan als de afgeronde actie ouder dan 9 mnd is', async () => {
    // Vaste datum ruim > 9 maanden geleden → buiten het venster t.o.v. elke echte now.
    const result = await collectAandachtspunten(
      makeSupabaseWithActions([
        { metadata: { aandachtspunt_id: 'tax:jaarruimte' }, status: 'completed', completed_at: '2020-01-01T00:00:00.000Z' },
      ]),
    )
    expect(jaarruimtePunt(result)).toBeDefined()
  })
})
