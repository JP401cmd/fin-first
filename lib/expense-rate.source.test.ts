/**
 * BRON-GRENDEL op de DATABRON van het canonieke dagtarief (bevinding L10).
 *
 * ── Waarom een bron-test en niet (alleen) een gedragstest ───────────────────
 * De FORMULE stond na KRUIS-20 al vast op één plek
 * (`recentDailyExpenseRateFromRows`) en `npm run check:freedom-basis` bewaakt dat
 * élk oppervlak die aanroept met de juiste grondslag. Maar die gate kijkt naar de
 * AANROEP, niet naar de RIJEN die erin gaan. Vier oppervlakken voedden de correcte
 * formule met een ongepagineerde `.from('transactions').select('amount, date')`-
 * fetch, en PostgREST kapt zo'n antwoord STIL af op `max_rows` (config.toml =
 * 1000) — óók zonder expliciete `.limit()`. Boven de 1000 negatieve transacties
 * in het venster kwam er een willekeurige deelverzameling terug: het totaal én de
 * vroegste maand schoven, en het dagtarief LOOG omhoog. Zichtbaar gevolg:
 * /rapportages/balans toonde €165/dag naast €106/dag op /overzicht/cashflow —
 * dat oppervlak liep al wél via het maandaggregaat.
 *
 * Een gedragstest vangt dit niet: met een fixture van 5 rijen geeft de rauwe route
 * exact hetzelfde antwoord als het aggregaat. De fout leeft uitsluitend in de
 * SCHAAL, en de enige duurzame grendel is dus "geen enkel dagtarief-oppervlak
 * fetcht nog zelf uitgaven-rijen". Het truncatie-mechanisme zélf staat al bewezen
 * in `lib/server-data/tx-aggregates.parity.test.ts` ("REGRESSIE: op >1000 rijen
 * liegt de afgekapte rij-route de quote omhoog").
 *
 * Faalt deze test: fetch de rijen via `fetchExpenseRowsForRate(supabase, ref)`
 * (lib/expense-rate.ts) of — heb je het 12-maands aggregaat én de budgetten al
 * — via `getTxAgg12m` → `consumptionExpenseRows(txAgg, buildBudgetTypeMap(…))`,
 * zoals lib/dashboard-data-loader.ts, lib/cashflow-kpis.ts en
 * lib/core-data-loader.ts doen. NIET via een eigen `aggToExpenseRows(…, opts)`:
 * dat is een tweede grondslag en wordt hieronder apart gegrendeld. Voeg NOOIT
 * een bestand aan de lijst hieronder toe om 'm groen te krijgen — de lijst mag
 * alleen groeien met nieuwe dagtarief-oppervlakken.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = join(__dirname, '..')

/** Elk oppervlak dat het canonieke dagtarief produceert of doorgeeft. */
const DAGTARIEF_BRONNEN = [
  'lib/expense-rate.ts',
  'app/api/report/balans/route.ts',
  'app/api/report/budget/route.ts',
  'app/api/daily-expense-rate/route.ts',
]

/**
 * De rij-vorm die de dagtarief-helper verwacht. Precies deze `select` is het
 * bugpatroon: een lijst transactie-rijen die op max_rows kan afkappen. Een
 * `head: true`-telling op dezelfde tabel is expliciet WEL toegestaan — die levert
 * geen rijen en kan dus niet afkappen (zie /api/daily-expense-rate).
 */
const RAUWE_RIJ_FETCH = /\.select\(\s*['"]amount,\s*date['"]/

/**
 * Verwijder commentaar vóór het matchen. Zonder dit slaat de grendel aan op de
 * toelichting die het bugpatroon juist CITEERT — en dan zou de enige manier om 'm
 * groen te krijgen zijn: de uitleg weghalen. Regel-commentaar en blok-commentaar
 * beide, want de docstrings hierboven en in lib/expense-rate.ts noemen de query
 * letterlijk.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('dagtarief-databron (L10)', () => {
  for (const relPath of DAGTARIEF_BRONNEN) {
    it(`${relPath} fetcht geen rauwe uitgaven-rijen voor het dagtarief`, () => {
      const src = stripComments(readFileSync(join(REPO_ROOT, relPath), 'utf8'))
      expect(src).not.toMatch(RAUWE_RIJ_FETCH)
    })
  }

  it('lib/expense-rate.ts haalt zijn rijen uit het maandaggregaat, gezuiverd tot consumptie', () => {
    const src = stripComments(readFileSync(join(REPO_ROOT, 'lib/expense-rate.ts'), 'utf8'))
    expect(src).toContain('aggToExpenseRows')
    // De consumptie-grondslag (ADR 0126 D2) woont in `consumptionExpenseRows`:
    // transfers eruit (`realOnly: true`) en archief-/inkomsten-/spaarbudgetten
    // eruit (`excludeBudgetIds` uit EXCLUDED_BUDGET_TYPES). De oude
    // "alles negatief"-grondslag (`realOnly: false`) mag hier niet terugkeren.
    expect(src).toContain('consumptionExpenseRows')
    expect(src).toContain('excludeBudgetIds')
    expect(src).toContain('EXCLUDED_BUDGET_TYPES')
    expect(src).not.toContain('realOnly: false')
  })

  /**
   * De vijf loaders die `recentDailyExpenseRateFromRows` vanuit het 12-maands
   * aggregaat voeden, doen dat via `consumptionExpenseRows` — en bouwen géén
   * eigen `aggToExpenseRows(…, { … })`. Een eigen optieset is een tweede
   * grondslag: hetzelfde bedrag krijgt dan op twee schermen twee vrijheidstijden.
   */
  const AGGREGAAT_CONSUMENTEN = [
    'lib/dashboard-data-loader.ts',
    'lib/core-data-loader.ts',
    'lib/cashflow-kpis.ts',
    'lib/horizon/raw-data-loader.ts',
    'lib/spend-limits/loader.ts',
  ]
  for (const relPath of AGGREGAAT_CONSUMENTEN) {
    it(`${relPath} voedt het dagtarief via consumptionExpenseRows, niet via een eigen aggToExpenseRows-optieset`, () => {
      const src = stripComments(readFileSync(join(REPO_ROOT, relPath), 'utf8'))
      expect(src).toContain('consumptionExpenseRows(')
      expect(src).not.toMatch(/aggToExpenseRows\s*\(/)
    })
  }

  it('de drie route-oppervlakken consumeren de gedeelde fetcher', () => {
    for (const relPath of DAGTARIEF_BRONNEN.filter((p) => p.startsWith('app/'))) {
      const src = readFileSync(join(REPO_ROOT, relPath), 'utf8')
      expect(src, relPath).toContain('fetchExpenseRowsForRate')
    }
  })
})
