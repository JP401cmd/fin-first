/**
 * Issue 2 — balk-grafiek (WealthCompositionChart) klif bij v2-downsize.
 *
 * Accepted semantics (architect): bij een v2-downsize moet de per-asset-groep-
 * samenstelling CONTINU zijn (in netto termen) door het verkoopjaar heen — geen
 * klif. De huiswaarde verlaat `vastgoed` en de netto-opbrengst verschijnt in de
 * liquide groepen (spaargeld/beleggingen) in HETZELFDE jaar; vóór de trigger is
 * er GEEN dubbeltelling van het huis.
 *
 * Waar de klif werkelijk leeft (build-input.ts → adapter): in v2 blijft het huis
 * een `eigen_huis`-asset in het grootboek, dus `unifiedRowsToStackedRows(rows)`
 * telt het al in `vastgoed`. De lib-level mapping is daardoor AL continu. De
 * dubbeltelling ontstaat in de `wealthCompositionRows`-useMemo in
 * `horizon-client.tsx`: die injecteert (v1-model) bovenop de engine-rijen het
 * geprojecteerde huis voor jaren vóór de trigger, ZONDER te checken of v2 het
 * huis al meelevert. Resultaat: pre-trigger `vastgoed ≈ 2× huis`, op de trigger
 * valt de injectie weg én het engine-huis is verkocht → `vastgoed` stort van
 * ~2× huis naar ~0 (de klif). De gate (regel 1559-1560) slaat injectie alléén
 * over voor `include_full`, niet voor v2-downsize.
 *
 * Deze test bestaat uit twee delen:
 *   A) BEWIJS dat de lib-level mapping continu is (zou GROEN zijn) — daarom moet
 *      de RED-test op het injectie-niveau zitten.
 *   B) De RED-test: repliceert de injectie-logica van de useMemo (geparametriseerd
 *      op isV2) en assert dat de injectie voor v2 NIET mag dubbeltellen. Vandaag
 *      injecteert de productie-useMemo onvoorwaardelijk (geen isV2-gate) → RED.
 */
import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { buildHorizonInput } from '@/lib/horizon-engine/build-input'
import { runSelectedProjection } from '@/lib/horizon-engine/select'
import { unifiedRowsToStackedRows, type StackedRow } from '@/lib/wealth-composition'
import { applyHousingToComposition } from '@/lib/horizon/wealth-composition-housing'
import {
  deriveHousingContext,
  type HousingStrategyConfig,
} from '@/lib/housing-strategy'
import { ageAtDate } from '@/lib/horizon-data'

// ── Fixture: v2-downsize op vaste leeftijd 67 (niet-terminaal → opbrengst
//    zichtbaar in liquide; de klif is dan goed meetbaar in vastgoed). DOB zo
//    gekozen dat de huidige leeftijd ruim vóór 67 ligt (pre-trigger-rijen bestaan). ──
const DOB = '1969-06-01' // ~57 in 2026 → rijen 57..95, trigger op 67
const ASSETS: Asset[] = (
  [
    ['huis', 'Woning', 'eigen_huis', 600000, 600000, 3.5, null],
    ['bel', 'Beleggen', 'investment', 350000, null, 6, null],
    ['cash', 'Spaar', 'cash', 60000, null, 0, null],
  ] as const
).map(([id, name, t, v, woz, r, dep]) => ({ id, name, asset_type: t, current_value: v, woz_value: woz, expected_return: r, is_active: true, net_worth_inclusion_pct: 100, depreciation_rate: dep }) as unknown as Asset)

const DEBTS: Debt[] = [
  { id: 'hyp', name: 'Hypotheek', debt_type: 'mortgage', current_balance: 250000, interest_rate: 2.9, monthly_payment: 1100, repayment_type: 'annuiteit', is_tax_deductible: true, linked_asset_id: 'huis', end_date: null, net_worth_inclusion_pct: 100, include_aflossing_in_savings: false, is_active: true } as unknown as Debt,
]

const TRIGGER_AGE = 67
const DOWNSIZE_FIXED: HousingStrategyConfig = {
  mode: 'downsize',
  trigger: 'fixed_age',
  triggerAge: TRIGGER_AGE,
  salePricePct: 1,
  salesCostsPct: 0.04,
  newMonthlyHousingCost: null,
  depletionThresholdYears: 0,
} as unknown as HousingStrategyConfig

function buildV2() {
  return buildHorizonInput({
    horizonInput: { monthlyContributions: 0, yearlyMustExpenses: 30000, dateOfBirth: DOB, monthlyIncome: 3000 } as never,
    lifeEvents: [],
    fireStrategy: { strategy: 'deplete', endAge: 95, legacyAmount: 0 },
    grossReturn: 0.05,
    inflation: 0.02,
    assets: ASSETS,
    debts: DEBTS,
    box3Method: 'forfaitair',
    hasPartner: false,
    housingStrategy: DOWNSIZE_FIXED,
    horizonEngineV2: true,
  })!
}

describe('Issue 2A — lib-level mapping is al continu (daarom geen RED hier)', () => {
  it('unifiedRowsToStackedRows(v2) is continu rond de verkoop — vastgoed >0 → ~0, geen 2× dubbeltelling', () => {
    const built = buildV2()
    const result = runSelectedProjection(built.input, true)
    const stacked = unifiedRowsToStackedRows(result.rows)
    const at = (age: number) => stacked.find((r) => r.age === age)!

    const pre = at(TRIGGER_AGE - 1)
    const sale = at(TRIGGER_AGE)
    // Engine houdt het huis als één eigen_huis-asset → vastgoed is NIET dubbel.
    // Pre-sale vastgoed ≈ huiswaarde gegroeid (één keer), ruim boven de startwaarde.
    expect(pre.vastgoed).toBeGreaterThan(600_000)
    // In het verkoopjaar verlaat het huis vastgoed (→ ~0) en stroomt de
    // netto-opbrengst naar liquide (spaargeld/beleggingen stijgen).
    expect(sale.vastgoed).toBeLessThan(1_000)
    const preLiquid = pre.spaargeld + pre.beleggingen
    const saleLiquid = sale.spaargeld + sale.beleggingen
    expect(saleLiquid).toBeGreaterThan(preLiquid)
  })
})

// ── Issue 2B test nu tegen de ECHTE geëxporteerde helper
//    (`applyHousingToComposition`), niet langer tegen een inline-replica.
//    `wealthCompositionRows` in horizon-client.tsx roept exact deze helper aan;
//    door 'm hier rechtstreeks te asserten pint de test het werkelijke pad. ──

const FIRE_END_AGE = 95

describe('Issue 2B — applyHousingToComposition mag het v2-huis NIET dubbeltellen', () => {
  it('v2-downsize: geen klif — netto vermogen continu door de verkoop (op −verkoopkosten na)', () => {
    const built = buildV2()
    const result = runSelectedProjection(built.input, true)
    const baseRows = unifiedRowsToStackedRows(result.rows)
    const ctx = deriveHousingContext(ASSETS, DEBTS)
    const currentAgeFloor = Math.floor(ageAtDate(DOB))
    // displayEvents zoals de client ze ziet: het v2-rent-event (verkoop_eigen_woning).
    const displayEvents = built.effectiveLifeEvents

    // De ECHTE helper met de v2-gate aan (zoals productie hem aanroept voor v2).
    const rows = applyHousingToComposition(baseRows, {
      housingCfg: DOWNSIZE_FIXED,
      ctx,
      displayEvents,
      currentAgeFloor,
      fireEndAge: FIRE_END_AGE,
      isV2: true,
    })
    const at = (age: number) => rows.find((r) => r.age === age)!

    // Netto vermogen = Σ asset-groepen + schulden (schulden is negatief).
    // De accepted semantics (architect) is continuïteit IN NETTO TERMEN: de
    // bruto asset-stack stapt bij de verkoop legitiem omlaag met het afgeloste
    // hypotheeksaldo (huis verlaat `vastgoed`, hypotheek verlaat `schulden`,
    // alleen de netto-overwaarde stroomt naar liquide) — netto blijft vlak.
    const NET = (r: StackedRow) =>
      r.spaargeld + r.beleggingen + r.pensioen + r.vastgoed + r.overig + r.schulden
    const pre = at(TRIGGER_AGE - 1)
    const sale = at(TRIGGER_AGE)

    // 1) v2 telt het huis NIET dubbel: de helper geeft baseRows ongewijzigd
    //    terug, dus vastgoed = engine-vastgoed (één keer het huis).
    const baseVastgoedPre = baseRows.find((r) => r.age === TRIGGER_AGE - 1)!.vastgoed
    expect(pre.vastgoed).toBe(baseVastgoedPre)
    expect(pre.vastgoed).toBeLessThan(baseVastgoedPre * 1.05)

    // 2) Het huis verlaat `vastgoed` in het verkoopjaar (→ ~0) en de
    //    netto-opbrengst stroomt naar liquide — geen 2× dubbeltelling.
    expect(pre.vastgoed).toBeGreaterThan(600_000)
    expect(sale.vastgoed).toBeLessThan(1_000)

    // 3) Netto vermogen is continu door het verkoopjaar: de sprong is hooguit
    //    ~de verkoopkosten + één jaar uitgaven (paar % van de pre-waarde),
    //    NIET de klif die ontstaat bij dubbeltelling.
    const sprong = Math.abs(NET(sale) - NET(pre))
    expect(sprong).toBeLessThan(NET(pre) * 0.1)
  })

  it('v1-downsize: injectie blijft van toepassing — huis vóór trigger zichtbaar in vastgoed', () => {
    const built = buildV2()
    const result = runSelectedProjection(built.input, true)
    const baseRows = unifiedRowsToStackedRows(result.rows)
    const ctx = deriveHousingContext(ASSETS, DEBTS)
    const currentAgeFloor = Math.floor(ageAtDate(DOB))
    const displayEvents = built.effectiveLifeEvents

    // v1: GEEN skip → injectie voegt geprojecteerde huiswaarde toe in `vastgoed`
    //     en trekt het hypotheeksaldo van `schulden` af, vóór de trigger.
    const rows = applyHousingToComposition(baseRows, {
      housingCfg: DOWNSIZE_FIXED,
      ctx,
      displayEvents,
      currentAgeFloor,
      fireEndAge: FIRE_END_AGE,
      isV2: false,
    })
    const at = (age: number) => rows.find((r) => r.age === age)!

    const pre = at(TRIGGER_AGE - 1)
    const baseVastgoedPre = baseRows.find((r) => r.age === TRIGGER_AGE - 1)!.vastgoed
    // In dit (v2-gebouwde) fixture zit het huis al in baseRows; de v1-injectie
    // telt het er BOVENOP → pre-vastgoed is strikt groter dan de engine-waarde.
    expect(pre.vastgoed).toBeGreaterThan(baseVastgoedPre)
  })

  it('v2 laat baseRows referentieel ongewijzigd (geen recompute van het huis)', () => {
    const built = buildV2()
    const result = runSelectedProjection(built.input, true)
    const baseRows = unifiedRowsToStackedRows(result.rows)
    const ctx = deriveHousingContext(ASSETS, DEBTS)
    const currentAgeFloor = Math.floor(ageAtDate(DOB))

    const rows = applyHousingToComposition(baseRows, {
      housingCfg: DOWNSIZE_FIXED,
      ctx,
      displayEvents: built.effectiveLifeEvents,
      currentAgeFloor,
      fireEndAge: FIRE_END_AGE,
      isV2: true,
    })
    // v2-downsize-skip → exact dezelfde array-referentie (consume, don't recompute).
    expect(rows).toBe(baseRows)
  })
})
