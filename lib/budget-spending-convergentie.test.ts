import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { stripComments } from '@/test/helpers/page-source'

/**
 * CONVERGENTIE LAAG A — schrijfpaden op de canonieke bestedingssom.
 *
 * ## Waarom BRON-controle en niet (alleen) gedrag
 *
 * Het defect dat deze laag wegneemt is niet één verkeerd getal maar een VORM:
 * zes oppervlakken hadden elk hun eigen `Σ|amount|`-lus over dezelfde
 * transactierijen. Zolang zo'n kopie bestaat is elke gedragstest een
 * momentopname — hij bewijst dat de kopie vandaag hetzelfde antwoord geeft, niet
 * dat er één eigenaar is. De rekenregels zelf staan gepind in
 * lib/budget-spending.test.ts, lib/health-score-input.test.ts,
 * lib/cashflow-kpis.parity.test.ts en app/api/checkin/budgets/route.test.ts;
 * deze suite bewaakt het structurele deel dat die tests per definitie niet
 * kunnen zien.
 *
 * Twee dingen worden per omgezet pad afgedwongen:
 *  1. het pad IMPORTEERT de gedeelde functies (geen eigen som meer);
 *  2. de rijen die het ophaalt dragen de kolommen van het contract, en de
 *     split-regels worden meegegeven — een klem of filter hoort ín de functie,
 *     niet bij de aanroeper, maar de DATA moet de aanroeper wel aanleveren.
 *
 * Deze suite is rood op de code van vóór 30 aug 2026.
 */

const ROOT = path.resolve(__dirname, '..')
const readRaw = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
const read = (rel: string) => stripComments(readRaw(rel))

/** De teken-blinde lus die op elk van deze paden stond. */
const EIGEN_ABS_SOM = /\+\s*Math\.abs\(\s*Number\(\s*(t|tx)\b/

describe('laag A — geen enkel schrijfpad houdt nog een eigen bestedingssom', () => {
  it.each([
    ['lib/health-score-input.ts', 'buildBudgetSpendingMap'],
    ['lib/cashflow-kpis.ts', 'buildBudgetSpendingMap'],
    ['app/api/checkin/budgets/route.ts', 'buildBudgetSpendingMap'],
    ['lib/aandachtspunten-loader.ts', 'buildBudgetSpendingMap'],
  ])('%s consumeert %s en draagt geen eigen Math.abs-lus meer', (rel, fn) => {
    const src = read(rel)
    expect(src).toContain(fn)
    // Alias- én relatief importpad: lib/-modules onderling importeren met './'.
    expect(src).toMatch(/from '(@\/lib|\.)\/budget-spending'/)
    expect(src.match(EIGEN_ABS_SOM)).toBeNull()
  })

  it('de richting komt overal uit buildBudgetTypeMap, nergens uit een eigen type-afleiding', () => {
    for (const rel of [
      'lib/health-score-input.ts',
      'lib/cashflow-kpis.ts',
      'app/api/checkin/budgets/route.ts',
      'lib/aandachtspunten-loader.ts',
    ]) {
      expect(read(rel)).toContain('buildBudgetTypeMap')
    }
  })

  it('de parent-rollup van de check-in loopt via spentForBudget (was: dubbeltelling)', () => {
    const src = read('app/api/checkin/budgets/route.ts')
    expect(src).toContain('spentForBudget')
    // De dubbeltellende rollup: parent-som += kind-som.
    expect(src).not.toMatch(/spentByBudget\[child\.parent_id\]\s*=/)
  })
})

describe('laag A — de aanroepers leveren de kolommen én de splits van het contract', () => {
  /**
   * ALLE routes die de canonieke besteed-som voeden. De vier snapshot-/check-in-
   * routes kwamen uit laag A; de zeven eronder schreven de kolomlijst met de
   * hand en zijn in de eindreview omgezet. Een handgeschreven lijst is geen
   * stijlkwestie: hij kán een kolom missen, en dan valt de som stil terug op
   * teken-blind tellen zonder dat iets rood wordt.
   */
  const SPENDING_ROUTES = [
    'app/api/snapshots/route.ts',
    'app/api/snapshots/auto/route.ts',
    'app/api/snapshots/cron/route.ts',
    'app/api/checkin/budgets/route.ts',
    'app/api/export/route.ts',
    'app/api/report/route.ts',
    'app/api/report/budget/route.ts',
    'app/api/notifications/route.ts',
    'app/api/budget-trends/route.ts',
    'app/api/budget-variance/route.ts',
    'app/api/next-steps/route.ts',
  ]

  it.each(SPENDING_ROUTES)(
    '%s selecteert BUDGET_SPENDING_TX_COLUMNS i.p.v. een eigen kolomstring',
    (rel) => {
      const src = read(rel)
      expect(src).toContain('BUDGET_SPENDING_TX_COLUMNS')
      // Geen handgeschreven variant van de kolomlijst meer.
      expect(src).not.toMatch(/select\('id, budget_id, amount,[^']*is_split/)
      // De smalle select die richting- en split-regels onmogelijk maakt mag
      // alleen blijven staan waar hij EXPLICIET als bruto-grondslag gemarkeerd
      // is (spaarquote-familie). Zonder die markering is hij een overtreding —
      // en de markering dwingt de auteur de uitzondering te benoemen i.p.v.
      // hem te laten voor wat hij is.
      // RAUWE bron: de markering is een commentaarregel, en `read` strikt die weg.
      const raw = readRaw(rel)
      const smalleSelects = raw.split("select('amount, budget_id')").length - 1
      const brutoMarkeringen =
        raw.split('budget-spending: bruto-grondslag').length - 1
      expect(smalleSelects).toBeLessThanOrEqual(brutoMarkeringen)
    },
  )

  it.each([
    'app/api/budget-variance/route.ts',
    'app/api/notifications/route.ts',
    'app/api/next-steps/route.ts',
  ])('%s leest met BUDGET_OR_SPLIT_FILTER, niet filter-loos', (rel) => {
    const src = read(rel)
    // Filter-loos over een venster zonder `.limit()` = stille max_rows-afkap;
    // een kale `.not('budget_id','is',null)` snijdt juist de split-ouders weg.
    expect(src).toContain('BUDGET_OR_SPLIT_FILTER')
    expect(src).not.toContain(".not('budget_id', 'is', null)")
  })

  it('BUDGET_OR_SPLIT_FILTER woont bij het contract, niet in de AI-contextlaag', () => {
    expect(read('lib/budget-spending-fetch.ts')).toContain(
      "export const BUDGET_OR_SPLIT_FILTER = 'budget_id.not.is.null,is_split.is.true'",
    )
    // De oude woonplaats her-exporteert alleen nog — geen tweede definitie.
    const aiSrc = read('lib/ai/context/budget-spending-source.ts')
    expect(aiSrc).toContain("export { BUDGET_OR_SPLIT_FILTER }")
    expect(aiSrc).not.toContain("= 'budget_id.not.is.null,is_split.is.true'")
    // En geen enkele API-route importeert uit lib/ai/context/.
    for (const rel of SPENDING_ROUTES) {
      expect(read(rel)).not.toContain("from '@/lib/ai/context/")
    }
  })

  it.each([
    'app/api/snapshots/route.ts',
    'app/api/snapshots/auto/route.ts',
    'app/api/snapshots/cron/route.ts',
  ])('%s geeft de split-regels mee aan buildHealthScoreInput', (rel) => {
    const src = read(rel)
    expect(src).toContain('fetchSpendingSplits')
    expect(src).toMatch(/splits:\s*monthSplits/)
  })

  it('de gedeelde maand-fetcher draagt id/is_income/is_split', () => {
    const src = read('lib/server-data/base.ts')
    // Zonder deze drie kolommen valt de canonieke som stil terug op een
    // teken-blinde som bij élke consument van de basisdata-laag.
    expect(src).toMatch(/select\('id, amount, date, budget_id, transaction_type, is_income, is_split'\)/)
  })

  it('de kolomlijst van het contract heeft precies één huis', () => {
    const fetchSrc = read('lib/budget-spending-fetch.ts')
    expect(fetchSrc).toContain("'id, amount, budget_id, transaction_type, is_income, is_split'")
    // Geen tweede letterlijke kopie van die lijst in de omgezette schrijfpaden.
    for (const rel of [
      'app/api/snapshots/route.ts',
      'app/api/snapshots/auto/route.ts',
      'app/api/snapshots/cron/route.ts',
      'app/api/checkin/budgets/route.ts',
    ]) {
      expect(read(rel)).not.toContain("'id, amount, budget_id, transaction_type, is_income, is_split'")
    }
  })
})

describe('eindreview — weergave-klemmen en gedeelde afleidingen', () => {
  it('de Budget-kaart klemt "nog te besteden" op de limiet', () => {
    const src = read('lib/cashflow-cards.ts')
    // Kale aftrek toonde bij een negatieve (netto-inkomst) som MEER ruimte dan
    // de limiet zelf; de klem hoort bij de weergave-klemfamilie.
    expect(src).toContain('budgetBeschikbaar(budgetLimit, budgetSpent)')
    expect(src).not.toMatch(/const budgetRemaining = budgetLimit - budgetSpent/)
  })

  it('budgetBeschikbaar woont bij de andere weergave-klemmen', () => {
    const spend = read('lib/budget-spending.ts')
    expect(spend).toContain('export function budgetBeschikbaar')
    // Niet langer een tweede huis in de dashboard-loader.
    expect(read('lib/dashboard-data-loader.ts')).not.toContain('export function budgetBeschikbaar')
  })

  it('het patroon-dagtarief heeft één afleiding voor beide oppervlakken', () => {
    const shared = read('lib/spending-patterns.ts')
    expect(shared).toContain('export function derivePatternExpenseBasis')
    for (const rel of [
      'lib/ai/context/spending-patterns-context.ts',
      'app/api/spending-patterns/route.ts',
    ]) {
      const src = read(rel)
      expect(src).toContain('derivePatternExpenseBasis')
      // De oude, teken-blinde afleiding: inkomsten uitsluiten i.p.v. aftrekken.
      expect(src).not.toMatch(/filter\(\s*t\s*=>\s*!t\.is_income\s*\)/)
    }
  })

  it('buildCategorySpending krijgt zijn transfer-kolom van élke aanroeper', () => {
    // /api/report haalde `transaction_type` wél op maar liet 'm in de
    // object-literal vallen — de kolom kwam nooit bij de som aan.
    expect(read('app/api/report/route.ts')).toContain('transaction_type: tx.transaction_type')
    expect(read('app/api/spending-patterns/route.ts')).toContain('transaction_type')
  })

  it('de splits-parameter draagt overal de compiler-vangrail (geen default)', () => {
    expect(read('lib/ai/context/budget-summary.ts')).not.toMatch(/splits: BudgetSplitRow\[\] = \[\]/)
    expect(read('lib/health-score-input.ts')).not.toMatch(/splits\?: ReadonlyArray<SpendingSplitRow>/)
  })

  it('het bruto 6-maands venster houdt zijn uitzondering zichtbaar in de query', () => {
    const src = read('lib/core-data-loader.ts')
    // Spaarquote-grondslag: bewust absoluut, leest de contract-kolommen niet.
    expect(src).toContain("select('budget_id, amount').gte('date', sixMonthsAgoForBudgets)")
  })
})
