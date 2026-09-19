/**
 * ÉÉN SPAARQUOTE, ÉÉN GRONDSLAG — app-breed (eigenaar-besluit, 31 aug 2026).
 *
 * NORM: de EFFECTIEVE spaarquote (`resolveSavingsSource(...).effectiveSavingsRatePct`,
 * waar de gebruikerskeuze budget/handmatig/transactie wint) is HET spaarquote-getal
 * dat elk oppervlak toont. Een quote die als MÉTING wordt getoond blijft bestaan,
 * maar alleen waar hij expliciet als meting gelabeld staat, mét venster in de tekst:
 * de transactie-kassabon in het instellingenblok, de check-in-gespreksstarters en de
 * geldstroom-gauge op /overzicht/transacties (periode-quote, ADR 0020-carve-out).
 * Zie ADR 0121.
 *
 * WAT ER MIS WAS (productie-account van de eigenaar, schermafdrukken 31-08-2026,
 * grondslag "uit je budgetten") — vier oppervlakken, drie percentages:
 *   · /overzicht/budget instellingen-blok  → 30 %  (effectief, correct)
 *   · /overzicht-kaart "Op koers met sparen" → 30 %  (effectief, correct)
 *   · forecast-kaart "SPAARQUOTE (6m)"       →  9,5 % (rauwe transactiequote)
 *     — op DEZELFDE pagina waar het maandelijks netto-overschot wél de effectieve
 *     grondslag toont, en daar neerkwam op ~30 % van het inkomen
 *   · spaarquote-widget                      →  9,5 % (rauwe quote, met het
 *     €-bedrag op diezelfde meting)
 *   · doel "Spaarquote naar 10 %"            →  5,8 % (een DERDE getal: een
 *     gespiegelde kopie van de loader-formule die op eigen aggregaten dreef)
 *
 * DEZE SUITE draait één fixture end-to-end door de ECHTE loaders (fake-supabase,
 * geen stubs op de rekenlaag) en eist dat alle vier de oppervlakken hetzelfde
 * getal opleveren. De fixture is zó gekozen dat de twee grondslagen aantoonbaar
 * uiteenlopen (30,0 % effectief tegen 9,5 % gemeten) — zou dat contrast wegvallen,
 * dan bewijst de gelijkheid niets meer, en daarom staat de divergentie zélf óók
 * als assertie in deze suite.
 *
 * TOLERANTIE: de vergelijkingen zijn EXACT (`toBe`), niet `toBeCloseTo`. Het gaat
 * om één en hetzelfde getal dat via verschillende assemblages bij de gebruiker
 * komt; een tolerantie zou precies de drift verbergen die deze suite bewaakt. De
 * bedragen in de fixture zijn daarom gehele euro's, zodat de float-sommen
 * exact zijn ongeacht de groepering.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { makeSupabase, FAKE_USER_ID, type FakeDb, type Row } from '@/test/helpers/fake-supabase'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { loadForecastSectionData } from '@/lib/cashflow-kpis'
import { injectParameterGoalCurrentValues } from '@/lib/goal-current-value'
import { SpaarquoteWidget } from '@/components/widgets/spaarquote-widget'
import { CashflowSection } from '@/components/fin/cashflow-section'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { GET as checkinStartersGET } from '@/app/api/checkin/gespreksstarters/route'
import { GET as checkinOverviewGET } from '@/app/api/checkin/overview/route'
import { loadHorizonRaw } from '@/lib/horizon/raw-data-loader'

// ── Render-randvoorwaarden ──────────────────────────────────────────────────
vi.mock('@/components/app/perspective-provider', () => ({
  usePerspective: () => ({ perspective: 'personal', partnerName: null }),
}))

/**
 * De check-in is een ROUTE, geen loader: hij haalt zijn client zelf op. Alleen
 * die twee auth-schakels worden vervangen — de rekenketen eronder draait
 * onvervalst op dezelfde nep-database als de loaders hierboven, zodat dit
 * oppervlak op exact dezelfde fixture wordt gemeten.
 */
const routeClient: { client: unknown } = { client: null }
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => routeClient.client,
  getAuthClaims: async () => ({ sub: 'user-parity' }),
}))

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

// ── Fixture ─────────────────────────────────────────────────────────────────

/** 15 juli 2026, 12:00 lokaal — meetvenster = jan t/m jun 2026 (zes VOLTOOIDE maanden). */
const NOW = new Date(2026, 6, 15, 12, 0, 0)

const B_INCOME = 'budget-income'
const B_EXPENSE = 'budget-expense'

const BUDGETS: Row[] = [
  { id: B_INCOME, parent_id: null, budget_type: 'income', default_limit: 60000, interval: 'yearly', name: 'Inkomen', icon: '', is_favorite: false, is_essential: false, alert_threshold: 80, sort_order: 1, is_archived: false, merged_into: null, created_at: '2025-01-01' },
  { id: B_EXPENSE, parent_id: null, budget_type: 'expense', default_limit: 3000, interval: 'monthly', name: 'Uitgaven', icon: '', is_favorite: false, is_essential: true, alert_threshold: 80, sort_order: 2, is_archived: false, merged_into: null, created_at: '2025-01-01' },
]

/**
 * Grondslag HANDMATIG aan beide kanten. Bewust niet 'budget': de budgetgrondslag
 * loopt via de realisatie-RPC en zou het VERWACHTE getal van de fixture laten
 * afhangen van hoe de nep-database die RPC beantwoordt. Handmatig isoleert
 * precies wat deze suite meet — de grondslag-keuze wint van de meting — en raakt
 * exact dezelfde tak in `resolveSavingsSource` (de uniforme (I − E) / I-formule
 * voor élke niet-transactie-combinatie).
 *
 * effectief = (6000 − 4200) / 6000 = 30,0 %
 */
const PROFILE: Row = {
  id: FAKE_USER_ID,
  full_name: 'Grondslag',
  date_of_birth: null,
  budgeting_active: true,
  income_source: 'manual',
  net_monthly_income: 6000,
  expenses_source: 'manual',
  estimated_monthly_expenses: 4200,
}

/**
 * Zes VOLTOOIDE maanden (jan t/m jun 2026) met een aantoonbaar ANDERE gemeten
 * quote: inkomen 6 × 6.000 = 36.000, uitgaven 6 × 5.430 = 32.580
 * ⇒ (36.000 − 32.580) / 36.000 = 9,5 %.
 *
 * Geen spaarbudget-stortingen, geen schulden ⇒ de correctietermen zijn nul en
 * de gemeten quote is niets anders dan de rauwe transactieverhouding.
 */
function transacties(): Row[] {
  const rows: Row[] = []
  for (const m of ['01', '02', '03', '04', '05', '06']) {
    // `is_income` staat er expliciet bij naast het teken van `amount`: de loaders
    // classificeren op het TEKEN (via `tx_month_aggregate`), maar de check-in-route
    // filtert op de KOLOM. Zonder deze vlag zou de check-in een lege zes maanden
    // meten en zou de suite de grondslag-vergelijking niet meer maken.
    rows.push({ amount: 6000, is_income: true, date: `2026-${m}-05`, budget_id: B_INCOME, transaction_type: null })
    rows.push({ amount: -5430, is_income: false, date: `2026-${m}-12`, budget_id: B_EXPENSE, transaction_type: null })
  }
  return rows
}

const DB: FakeDb = {
  profile: PROFILE,
  budgets: BUDGETS,
  transactions: transacties(),
  debts: [],
  assets: [],
  netWorthSnapshots: [
    // Historie op de EFFECTIEVE grondslag — dat is wat de snapshot-routes
    // wegschrijven (`savings_rate` = resolveSavingsSource(...).effectiveSavingsRatePct).
    { snapshot_date: '2026-05-01', net_worth: 100000, fire_age: null, savings_rate: 28 },
    { snapshot_date: '2026-06-01', net_worth: 102000, fire_age: null, savings_rate: 29 },
  ],
}

/** De effectieve quote: (6000 − 4200) / 6000 × 100. */
const EFFECTIEF_PCT = 30.0
/** De gemeten 6-maands transactiequote: (36000 − 32580) / 36000 × 100. */
const GEMETEN_PCT = 9.5
/** Het maandspaarbedrag dat bij de EFFECTIEVE quote hoort: 6.000 × 30 %. */
const EFFECTIEF_EUR_PER_MAAND = 1800

function bevriesDeKlok() {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('spaarquote — de fixture laat de twee grondslagen aantoonbaar uiteenlopen', () => {
  bevriesDeKlok()

  it('gemeten 6m-transactiequote (9,5 %) ≠ effectieve quote (30,0 %)', async () => {
    const { dashboardData } = await loadDashboardData(makeSupabase(DB).client)
    expect(dashboardData.savingsRate6m).toBe(GEMETEN_PCT)
    expect(dashboardData.effectiveSavingsRatePct).toBe(EFFECTIEF_PCT)
    expect(dashboardData.effectiveSavingsRatePct).not.toBe(dashboardData.savingsRate6m)
  })
})

describe('spaarquote — élk oppervlak toont de EFFECTIEVE quote', () => {
  bevriesDeKlok()

  it('bundel: de dashboardbundel draagt de effectieve quote én het bijbehorende €-bedrag', async () => {
    const { dashboardData } = await loadDashboardData(makeSupabase(DB).client)
    expect(dashboardData.effectiveSavingsRatePct).toBe(EFFECTIEF_PCT)
    // Bedrag / inkomen == quote: één grondslag voor beide getallen op de kaart.
    expect(dashboardData.effectiveMonthlySavings).toBe(EFFECTIEF_EUR_PER_MAAND)
  })

  it('widget: toont 30,0 % en € 1.800 — niet de gemeten 9,5 % / € 570', async () => {
    const { dashboardData } = await loadDashboardData(makeSupabase(DB).client)
    const { container } = render(<SpaarquoteWidget size="full" data={dashboardData} />)
    expect(container.textContent).toContain('30.0%')
    expect(container.textContent).not.toContain('9.5%')
    expect(container.textContent).toContain('1.800')
    expect(container.textContent).not.toContain('570')
  })

  it('forecast-laag: `loadForecastSectionData` levert dezelfde effectieve quote als de bundel', async () => {
    const { dashboardData } = await loadDashboardData(makeSupabase(DB).client)
    const slank = await loadForecastSectionData(makeSupabase(DB).client)
    expect(slank.effectiveSavingsRatePct).toBe(dashboardData.effectiveSavingsRatePct)
    expect(slank.effectiveSavingsRatePct).toBe(EFFECTIEF_PCT)
  })

  it('forecast-kaart: rendert de effectieve quote, en het venster-label "(6m)" is weg', async () => {
    const slank = await loadForecastSectionData(makeSupabase(DB).client)
    const { container } = render(
      <DisplayModeProvider initialMode="full">
        <CashflowSection data={slank} />
      </DisplayModeProvider>,
    )
    expect(container.textContent).toContain('30.0%')
    expect(container.textContent).not.toContain('9.5%')
    // Het getal is geen 6-maands gemiddelde meer, dus mag het venster-label niet
    // blijven staan — dat zou het cijfer verkeerd duiden.
    expect(container.textContent).not.toContain('(6m)')
  })

  it('doel: het spaarquote-parameterdoel krijgt de effectieve quote (30,0 %), niet 9,5 % of een derde getal', async () => {
    const doelen = [{ goal_type: 'savings_rate' as const, current_value: 0 }]
    await injectParameterGoalCurrentValues(makeSupabase(DB).client, doelen, FAKE_USER_ID)
    expect(doelen[0].current_value).toBe(EFFECTIEF_PCT)
  })

  /**
   * CHECK-IN (R2, eigenaarsbesluit 5 — 7 sep 2026). De gespreksstarters draaiden
   * op `computeSavingsRate6m`: de rauwe 6-maandsmeting, mét spaarbudget-correctie
   * en extrapolatie maar ZÓNDER grondslagresolutie. Onder een handmatige
   * grondslag toonde de check-in daardoor een ánder percentage dan /overzicht,
   * onder een identiek label ("6-maands spaarquote").
   *
   * Deze fixture maakt het gevolg categorisch in plaats van cosmetisch: op de
   * gemeten 9,5 % vuurt de LAGE-spaarquote-starter (`< 10 %`, "welke kleine stap
   * zou die kunnen verhogen?"), op de effectieve 30,0 % de STERKE (`>= 25 %`,
   * "wat maakt dat mogelijk?"). Het verkeerde getal stelde dus letterlijk de
   * verkeerde vraag.
   */
  it('check-in: de gespreksstarters draaien op de EFFECTIEVE quote (30,0 %), niet op de gemeten 9,5 %', async () => {
    routeClient.client = makeSupabase(DB).client
    const res = await checkinStartersGET()
    const { starters } = (await res.json()) as { starters: { id: string }[] }
    const ids = starters.map((s) => s.id)

    expect(ids).toContain('spaarquote-sterk')
    expect(ids).not.toContain('spaarquote-laag')

    // `(9.5).toFixed(0)` is "10", `(30.0).toFixed(0)` is "30" — de teksten zijn
    // dus onderscheidend zonder op een variant-rotatie te leunen.
    const tekst = JSON.stringify(starters)
    expect(tekst).toContain('30%')
    expect(tekst).not.toContain('10%')
  })

  /**
   * ADR 0121 kende de check-in als uitzondering waar de MÉTING mocht staan, mits
   * elke zin "6-maands"/"over zes maanden" droeg. Die uitzondering vervalt met
   * eigenaarsbesluit 5: het getal is nu de effectieve quote, dus een venster-
   * label zou het cijfer verkeerd duiden. In plaats daarvan benoemt de check-in
   * zijn eigen grondslag (`savingsRateBasisPhrase`).
   */
  it('check-in: de spaarquote-tekst leent geen venster meer, maar noemt de grondslag', async () => {
    routeClient.client = makeSupabase(DB).client
    const res = await checkinStartersGET()
    const { starters } = (await res.json()) as { starters: { id: string }[] }
    const tekst = JSON.stringify(starters)

    expect(tekst).not.toContain('6-maands')
    expect(tekst).not.toContain('over 6 maanden')
    expect(tekst).not.toContain('over zes maanden')
    // De fixture staat handmatig aan beide kanten ⇒ BASIS_PHRASE.manual.
    expect(tekst).toContain('volgens je eigen invoer')
  })

  /**
   * TEGENPROEF — de grondslagresolutie mag op het ZUIVERE transactiepad niets
   * verschuiven: daar geeft `resolveSavingsSource` per definitie de meting terug.
   * Zonder deze case zou de suite niet kunnen onderscheiden tussen "de check-in
   * volgt nu de grondslag" en "de check-in toont voortaan altijd iets anders".
   */
  it('check-in: op een zuivere transactiegrondslag blijft het de gemeten 9,5 % — alleen het label verandert mee', async () => {
    routeClient.client = makeSupabase({
      ...DB,
      profile: { ...PROFILE, income_source: 'transaction', expenses_source: 'transaction' },
    }).client
    const res = await checkinStartersGET()
    const { starters } = (await res.json()) as { starters: { id: string }[] }
    const ids = starters.map((s) => s.id)

    expect(ids).toContain('spaarquote-laag')
    expect(ids).not.toContain('spaarquote-sterk')
    const tekst = JSON.stringify(starters)
    expect(tekst).toContain('10%')      // (9.5).toFixed(0)
    expect(tekst).toContain('volgens je transacties')
  })
})

/**
 * CHECK-IN ↔ BUNDEL: DEZELFDE INVOER (kaart "restdivergentie na R2", 19 sep 2026,
 * optie A). Na R2 deelden de check-in en /overzicht de FORMULE
 * (`resolveSavingsSource`), maar niet de INVOER: de route assembleerde zijn
 * 6-maands sommen uit rauwe `transactions`-rijen (kolom `is_income`, geen
 * `.limit()`, dus stil afgekapt op PostgREST's max_rows = 1000), telde de
 * datamaanden vanaf de vroegste datum BINNEN het venster, ankerde het
 * jaarinkomen op `income6mAvg × 12` en kende de profiel-/delta-terugvallen
 * niet. De bundel leest het maandaggregaat, telt vanaf de all-time vroegste
 * inkomstendatum, ankert op `transactionAnnualIncome(realized)` (ADR 0138) en
 * valt terug via `resolveSavingsRate6m`.
 *
 * Drie fixtures, gemeten vóór de fix (ONDERZOEK 17 sep 2026):
 *   A · leeg 6m-venster, boekingen alleen in de lopende maand → 30 % op beide
 *       (regressie-anker: hier was géén divergentie, en die mag er niet komen);
 *   C · inkomsten+uitgaven alleen aug–dec 2025, niets in jan–jun 2026 →
 *       /overzicht −54 % (12-maands anker ziet nog 'transaction', gemengd met
 *       profiel-uitgaven), check-in +30 % "volgens je profiel" — ECHTE
 *       divergentie, in omgekeerde richting;
 *   D · 1.086 uitgavenrijen in het venster → bundel 9,5 % (`spaarquote-laag`
 *       hoort te vuren), check-in zwijgt — de rauwe som kapte af op 1.000 rijen.
 *
 * De verwachting is steeds DE BUNDEL: de check-in vuurt precies de starter die
 * bij `dashboardData.effectiveSavingsRatePct` hoort, met datzelfde getal in de
 * tekst. Vergelijking EXACT via starter-id en de `toFixed(0)`-tekst (de route
 * exporteert geen test-only helpers); geen relatieve marge, want het is één
 * getal via twee assemblages.
 */
describe('spaarquote — check-in en bundel bouwen de meting uit dezelfde invoer', () => {
  bevriesDeKlok()

  /** Spiegel van de drempels in lib/checkin/gespreksstarters.ts (spaarquote-detector). */
  const verwachteStarterId = (pct: number): 'spaarquote-sterk' | 'spaarquote-laag' | null =>
    pct >= 25 ? 'spaarquote-sterk' : pct > 0 && pct < 10 ? 'spaarquote-laag' : null

  async function meetBeide(db: FakeDb) {
    const { dashboardData } = await loadDashboardData(makeSupabase(db).client)
    routeClient.client = makeSupabase(db).client
    const res = await checkinStartersGET()
    const { starters } = (await res.json()) as { starters: { id: string }[] }
    return { pct: dashboardData.effectiveSavingsRatePct, ids: starters.map((s) => s.id), tekst: JSON.stringify(starters) }
  }

  function eisPariteit(m: { pct: number; ids: string[]; tekst: string }) {
    const verwacht = verwachteStarterId(m.pct)
    for (const id of ['spaarquote-sterk', 'spaarquote-laag'] as const) {
      if (id === verwacht) expect(m.ids).toContain(id)
      else expect(m.ids).not.toContain(id)
    }
    if (verwacht) expect(m.tekst).toContain(`${m.pct.toFixed(0)}%`)
  }

  it('A · leeg 6m-venster (alleen boekingen in de lopende maand): beide 30 % — geen divergentie, ook niet na de fix', async () => {
    const m = await meetBeide({
      ...DB,
      transactions: [
        { amount: 6000, is_income: true, date: '2026-07-05', budget_id: B_INCOME, transaction_type: null },
        { amount: -5430, is_income: false, date: '2026-07-12', budget_id: B_EXPENSE, transaction_type: null },
      ],
    })
    expect(m.pct).toBe(EFFECTIEF_PCT)
    eisPariteit(m)
    expect(m.tekst).toContain('volgens je eigen invoer')
  })

  it('C · inkomsten alleen 7–12 maanden terug: de check-in volgt het 12-maands anker van de bundel (negatief, gemengd), niet "+30 % volgens je profiel"', async () => {
    const rows: Row[] = []
    for (const m of ['08', '09', '10', '11', '12']) {
      rows.push({ amount: 6000, is_income: true, date: `2025-${m}-05`, budget_id: B_INCOME, transaction_type: null })
      rows.push({ amount: -5430, is_income: false, date: `2025-${m}-12`, budget_id: B_EXPENSE, transaction_type: null })
    }
    const m = await meetBeide({
      ...DB,
      profile: { ...PROFILE, income_source: 'transaction', expenses_source: 'transaction' },
      transactions: rows,
    })
    // De bundel: transactie-jaarinkomen 30.000 / 11 × 12 ≈ € 2.727/mnd op de
    // historiebasis (basis 'transaction'), uitgaven uit het lege 6m-venster →
    // profiel € 4.200 (basis 'profile') ⇒ gemengde formule, negatief.
    expect(m.pct).toBeLessThan(0)
    eisPariteit(m)
    // De oude check-in-lezing — profiel aan beide kanten, +30 % — mag niet terugkomen.
    expect(m.tekst).not.toContain('30%')
    expect(m.tekst).not.toContain('volgens je profiel')
  })

  it('D · 1.086 uitgavenrijen in het venster: de check-in vuurt `spaarquote-laag` op 9,5 %, zoals de bundel — geen stille max_rows-afkap meer', async () => {
    const rows: Row[] = []
    for (const m of ['01', '02', '03', '04', '05', '06']) {
      rows.push({ amount: 6000, is_income: true, date: `2026-${m}-05`, budget_id: B_INCOME, transaction_type: null })
      // 181 × € 30 = € 5.430 per maand — dezelfde maandsom als de basisfixture,
      // maar in 1.086 rijen: ruim boven de rij-cap van 1.000.
      for (let i = 0; i < 181; i++) {
        rows.push({ amount: -30, is_income: false, date: `2026-${m}-12`, budget_id: B_EXPENSE, transaction_type: null })
      }
    }
    expect(rows.filter((r) => r.is_income === false)).toHaveLength(1086)
    const m = await meetBeide({
      ...DB,
      profile: { ...PROFILE, income_source: 'transaction', expenses_source: 'transaction' },
      transactions: rows,
    })
    expect(m.pct).toBe(GEMETEN_PCT)
    eisPariteit(m)
    expect(m.ids).toContain('spaarquote-laag')
    expect(m.tekst).toContain('10%')      // (9.5).toFixed(0)
  })
})

/**
 * HORIZON ↔ BUNDEL ↔ FORECAST ↔ CHECK-IN: HETZELFDE JAARINKOMEN-ANKER (kaart
 * "what-if-slider start op een andere spaarquote-grondslag", 19 sep 2026, optie A).
 *
 * De horizon-loader (`loadHorizonRaw` → `healthScoreInputBase.effectiveSavingsRatePct`,
 * de bron van de tegel op /overzicht, de Rondkomen-pijler én de slider-start van
 * het lab) ankerde het transactie-jaarinkomen transfer-INCLUSIEF — bedoeld voor
 * de FIRE-projectiesom — en voerde dat óók aan `resolveSavingsSource`. Op de
 * GEMENGDE grondslag (inkomen 'transaction', uitgaven handmatig/budget) rekent
 * die de uniforme formule (I − E)/I op dat anker: gemeten 47,5 % waar dashboard,
 * forecast en check-in 30 % gaven. Op tx/tx wint het rauwe `savingsRate6m`
 * (transfer-exclusief, al vergrendeld in horizon-data-loader.spaarquote-parity)
 * en op handmatig/handmatig het profiel — daar telde het anker niet mee, en
 * precies dáár draaiden de bestaande suites.
 *
 * Het FIRE-anker blijft bewust inclusief (`baseAnnualSavingsFromCashflow`); die
 * keuze staat hieronder als assertie, zodat het onderscheid rate-exclusief /
 * FIRE-spaarbron-inclusief niet stil kan verdwijnen. Tolerantie: exact (`toBe`),
 * gehele euro's — één getal via vier assemblages.
 */
describe('spaarquote — gemengde grondslag mét transfers: één jaarinkomen-anker op alle oppervlakken', () => {
  bevriesDeKlok()

  /** +€2.000/mnd eigen-rekening-overboeking náást het echte inkomen. */
  const TRANSFER_PER_MAAND = 2000

  function transactiesMetTransfers(): Row[] {
    const rows = transacties()
    for (const m of ['01', '02', '03', '04', '05', '06']) {
      rows.push({ amount: TRANSFER_PER_MAAND, is_income: true, date: `2026-${m}-20`, budget_id: null, transaction_type: 'transfer' })
      rows.push({ amount: -TRANSFER_PER_MAAND, is_income: false, date: `2026-${m}-20`, budget_id: null, transaction_type: 'transfer' })
    }
    return rows
  }

  /** Inkomen uit transacties, uitgaven handmatig → de gemengde tak van `resolveSavingsSource`. */
  const DB_GEMENGD: FakeDb = {
    ...DB,
    profile: { ...PROFILE, income_source: 'transaction', expenses_source: 'manual' },
    transactions: transactiesMetTransfers(),
  }

  it('B · horizon == dashboard == forecast == check-in op 30 % — niet 47,5 % op het transfer-inclusieve anker', async () => {
    const { dashboardData } = await loadDashboardData(makeSupabase(DB_GEMENGD).client)
    const slank = await loadForecastSectionData(makeSupabase(DB_GEMENGD).client)
    const raw = await loadHorizonRaw(makeSupabase(DB_GEMENGD).client)
    routeClient.client = makeSupabase(DB_GEMENGD).client
    const { starters } = (await (await checkinStartersGET()).json()) as { starters: { id: string }[] }

    // Transfer-exclusief: 36.000 over 6 historiemaanden → € 6.000/mnd; handmatige
    // uitgaven € 4.200 ⇒ (6.000 − 4.200) / 6.000 = 30 %.
    expect(dashboardData.effectiveSavingsRatePct).toBe(EFFECTIEF_PCT)
    expect(slank.effectiveSavingsRatePct).toBe(EFFECTIEF_PCT)
    expect(raw.healthScoreInputBase.effectiveSavingsRatePct).toBe(EFFECTIEF_PCT)
    expect(starters.map((s) => s.id)).toContain('spaarquote-sterk')
    expect(JSON.stringify(starters)).toContain('30%')
  })

  it('B · de fixture is aantoonbaar transfer-gevoelig: de FIRE-spaarbron van de horizon blijft op het inclusieve anker (bewust)', async () => {
    const raw = await loadHorizonRaw(makeSupabase(DB_GEMENGD).client)
    // Inclusief: (36.000 + 12.000) over 6 maanden → € 8.000/mnd; (8.000 − 4.200) / 8.000
    // = 47,5 % × € 96.000 = € 45.600/jaar. Exclusief zou het € 21.600 zijn (30 % × 72.000).
    // Dit is het gedocumenteerde besluit "FIRE-projectie-inputs zien alle kasstromen";
    // verandert dit, dan verschuift de FIRE-leeftijd en hoort daar een eigen besluit bij.
    expect(raw.baseAnnualSavingsFromCashflow).toBe(45600)
    expect(raw.baseAnnualSavingsFromCashflow).not.toBe(EFFECTIEF_EUR_PER_MAAND * 12)
  })
})

/**
 * CHECK-IN — vermogenstrend uit de gedeelde snapshotreeks (kaart "check-in leest
 * een niet-bestaande kolom", 19-09-2026). Beide check-in-routes lazen
 * `net_worth_snapshots.value` — een kolom die de tabel nooit heeft gehad. Op
 * productie: PostgREST 42703 → `null → []` → `netWorthTrend 0`, dus
 * `vermogen-groei`/`-daling` vuurden nooit en `netWorthChange` stond structureel
 * op 0 %. De fake-DB projecteert kolommen niet en gaf `undefined → NaN`, dus het
 * defect was test-onzichtbaar; daarom hier een negatieve `NaN`-assertie over de
 * hele JSON. Sinds de fix voedt `getNetWorthSnapshots12m` (kolom `net_worth`,
 * oplopend) zowel de spaarquote-delta als de trend — één reeks, geen tweede lezer.
 */
describe('check-in — vermogenstrend uit de gedeelde snapshotreeks (kolom net_worth)', () => {
  bevriesDeKlok()

  async function starters(db: FakeDb) {
    routeClient.client = makeSupabase(db).client
    const res = await checkinStartersGET()
    const { starters } = (await res.json()) as { starters: { id: string; vraag: string }[] }
    return { starters, ids: starters.map((s) => s.id), tekst: JSON.stringify(starters) }
  }

  it('stijgend (100.000 → 102.000): vermogen-groei vuurt met € 2.000, zonder NaN en zonder "Je je"', async () => {
    const m = await starters(DB)
    expect(m.ids).toContain('vermogen-groei')
    expect(m.ids).not.toContain('vermogen-daling')
    expect(m.tekst).toMatch(/2\.000/)
    expect(m.tekst).not.toContain('NaN')
    // Alleen de vermogensstarter zelf: het "${subjCap} ${poss}"-patroon staat
    // óók nog in vijf starters buiten deze kaart (o.a. spaarquote-sterk, die in
    // deze fixture meevuurt) — dat is de aparte merkstem-kaart, niet deze.
    const groei = m.starters.find((s) => s.id === 'vermogen-groei')!
    expect(groei.vraag).not.toMatch(/\bJe je\b|\bJullie jullie\b/)
    expect(groei.vraag).toMatch(/^(Je vermogen|Jullie vermogen|€)/)
  })

  it('dalend (102.000 → 100.000): vermogen-daling vuurt met € 2.000, zonder NaN', async () => {
    const m = await starters({
      ...DB,
      netWorthSnapshots: [
        { snapshot_date: '2026-05-01', net_worth: 102000, fire_age: null, savings_rate: 29 },
        { snapshot_date: '2026-06-01', net_worth: 100000, fire_age: null, savings_rate: 28 },
      ],
    })
    expect(m.ids).toContain('vermogen-daling')
    expect(m.ids).not.toContain('vermogen-groei')
    expect(m.tekst).toMatch(/2\.000/)
    expect(m.tekst).not.toContain('NaN')
  })

  it('zonder snapshots: geen vermogensstarter en geen NaN-tekst', async () => {
    const m = await starters({ ...DB, netWorthSnapshots: [] })
    expect(m.ids).not.toContain('vermogen-groei')
    expect(m.ids).not.toContain('vermogen-daling')
    expect(m.tekst).not.toContain('NaN')
  })

  it('overzicht: netWorthChange is +2 % op dezelfde reeks — niet structureel 0', async () => {
    routeClient.client = makeSupabase(DB).client
    const res = await checkinOverviewGET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { netWorthChange: number }
    expect(body.netWorthChange).toBeCloseTo(2, 6)
  })
})
