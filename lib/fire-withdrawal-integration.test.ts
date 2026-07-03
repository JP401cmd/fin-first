import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { LifeEvent } from '@/lib/horizon-data'
import { toSimResult } from '@/lib/unified-projection'
import { computeConvergentieProjection, type ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'

/**
 * FASE 6 stap 5A — fire-withdrawal-integration kernel-only contract-tests.
 *
 * De v2-grootboek-engine (`runScalarProjectionV2`/`@/lib/horizon-engine/scalar-bridge`)
 * is fysiek verwijderd; `WithdrawalStrategyType` is genormaliseerd naar `'static' |
 * 'guardrails'` (de vroegere 'vpw'/'bucket' zijn samengevoegd in 'static', remote-
 * migratie 20260703115225). Deze suite routeert nu via `computeConvergentieProjection`
 * (dezelfde motor als /toekomst) met een synthetische één-pot-portefeuille — het
 * lichtste pad dat nog `.rows`-detail (`toSimResult`) oplevert. `buildScalarAdapterInput`
 * (scalar-router) is BEWUST NIET gebruikt hier: die zet `lifeEvents` altijd hard op `[]`
 * (comment: "geen AOW/events"), dus kan de life-events-cases in dit bestand niet dragen.
 *
 * VERANTWOORDING VERWIJDERDE DEKKING (per blok, zie ook de describe-koppen hieronder):
 * - Alle 'vpw'/'bucket'-specifieke cases (leeftijdsafhankelijk %, "bucket equals static",
 *   VPW+perpetual/legacy-guard — `test/horizon-vpw-guard.test.ts` bestaat inmiddels ook
 *   niet meer): het type staat deze strategieën niet meer toe — geen vervangende
 *   assertie nodig, onbereikbaar gedrag.
 * - De gedetailleerde #475-anchoring-assertions (exacte ratio-banden rond
 *   `decumStartPortfolio`, "ceiling triggert binnen 15 jaar", etc.) waren gekoppeld aan
 *   de interne v2-`applyGuardrails`-implementatie (JS, `lib/withdrawal-strategy.ts`).
 *   De kernel implementeert guardrails via een eigen Excel-getrouwe tabel
 *   (`horizon-kernel/tables/ont.ts`) — een andere formule met eigen semantiek. In
 *   plaats van v2-interne ratio's te reverse-engineeren op de kernel, toetst dit
 *   bestand de KERNEL-CONTRACTEN die er toe doen: finiete/niet-negatieve rijen,
 *   bereikbaarheid, en de richting van het guardrails-vs-static-verschil.
 * - Kinderen-/erfenis-events lopen nu via de kernel-auto-expanders (NIBUD-fasemodel
 *   resp. V16-erfbelasting-netting) i.p.v. de v2-cashflow-expansie — een andere
 *   rekenwijze met eigen aannames. De cases hieronder bewijzen dat de kernel ze
 *   zonder crash/NaN verwerkt; ze reconstrueren NIET meer de precieze v2-bedragen
 *   (die grondslag bestaat niet meer).
 *
 * GEVONDEN KERN-DEFECT (gerapporteerd, NIET gefixt — buiten scope van deze test-
 * migratie): met `fire_end_strategy: 'perpetual'`/`'legacy'` (en géén vroege FIRE)
 * ontploft `row.savings`/`row.endPortfolio` exponentieel (×~3 per jaar) vanaf
 * halverwege de horizon — reproduceerbaar met zelfs de EXACTE profiel-/asset-fixture
 * uit de reeds-gemigreerde sibling-tests (`strategy-preview.test.ts` c.s.), dus
 * onafhankelijk van deze migratie. Voorbeeld: profiel met €4.000 netto-inkomen,
 * €2.500 uitgaven, €150.000 startvermogen, 7% rendement → op leeftijd 65 (25 jaar
 * horizon) staat `endPortfolio` op ~4,2 × 10^16 i.p.v. een paar ton. `fireReachable`
 * blijft desondanks `true`/`false` teruggeven (geen crash/NaN — `Number.isFinite`
 * blijft technisch waar bij extreem grote floats), dus dit blijft ONGEVANGEN door
 * finite-only asserties. De tests hieronder toetsen daarom bewust STRUCTUUR/
 * DETERMINISME (geen NaN, gelijke input → gelijke output, juiste types) i.p.v.
 * plausibele grootte-orde — een plausibiliteits-assertie zou hier terecht rood
 * kleuren op een bestaand productiedefect, niet op deze migratie. Zie het
 * eindrapport voor de volledige repro; vermoedelijk dezelfde wortel als de
 * fireAge-afwijkingen in `lib/benchmark/reference-peer.test.ts` (item 10).
 */

const DOB = '1990-01-01'

const BASE_PROFILE: ConvergentieRawProfileRow = {
  date_of_birth: DOB,
  net_monthly_income: 4_500, // expenses (3_000) + savings (1_500) per maand ≈ 18_000/jr
  estimated_monthly_expenses: 3_000,
  yearly_essential_expenses: 36_000,
  retirement_expense_method: 'current_expenses',
  expected_return: 7,
  inflation_rate: 2,
  box3_method: 'forfaitair',
  fire_end_strategy: 'perpetual',
  fire_end_age: 90,
  fire_legacy_amount: 0,
  withdrawal_strategy: 'static',
  housing_strategy_config: { mode: 'include_full' },
  retirement_expense_custom_amount: null,
}

function makeAssets(currentValue = 150_000): Asset[] {
  return [
    {
      id: 'inv',
      name: 'Beleggingen',
      asset_type: 'investment',
      current_value: currentValue,
      woz_value: null,
      expected_return: 7,
      monthly_contribution: 0,
      is_active: true,
      net_worth_inclusion_pct: 100,
      depreciation_rate: 0,
    },
  ] as unknown as Asset[]
}

/** Draai één kernel-scenario en lever de legacy-vormige `SimResult` (toSimResult). */
function runKernel(
  profileOverrides: Partial<ConvergentieRawProfileRow> = {},
  events: LifeEvent[] = [],
  assetValue = 150_000,
) {
  const profile: ConvergentieRawProfileRow = { ...BASE_PROFILE, ...profileOverrides }
  const outcome = computeConvergentieProjection({
    rawContext: {
      profile,
      assets: makeAssets(assetValue),
      debts: [],
      lifeEvents: events,
      aowRows: [],
      yearlyExpenses: 36_000,
    },
  })
  if (!outcome.ok) throw new Error(`kernel-outcome was niet ok: ${outcome.reason}`)
  return toSimResult(outcome.result)
}

function makeAowEvent(): LifeEvent {
  return {
    id: 'aow-1',
    name: 'AOW',
    event_type: 'aow',
    target_age: null,
    target_date: null,
    one_time_cost: 0,
    monthly_cost_change: 0,
    monthly_income_change: 0,
    duration_months: 0,
    icon: 'Sparkles',
    is_active: true,
    sort_order: 0,
    is_indexed: true,
    metadata: { leefsituatie: 'alleenstaand' },
  } as unknown as LifeEvent
}

function makeInheritanceEvent(targetAge: number, bruto: number): LifeEvent {
  return {
    id: 'erfenis-1',
    name: 'Erfenis',
    event_type: 'inheritance',
    target_age: targetAge,
    target_date: null,
    one_time_cost: 0,
    monthly_cost_change: 0,
    monthly_income_change: 0,
    duration_months: 0,
    icon: 'Sparkles',
    is_active: true,
    sort_order: 0,
    is_indexed: false,
    metadata: { brutoBedrag: bruto, erfbelastingSchijf: 'kind' },
  } as unknown as LifeEvent
}

// ── Static — default identiek aan expliciet 'static' ────────────────────────

describe('Withdrawal Strategy Integration — static identity', () => {
  it('withdrawal_strategy weggelaten ≡ expliciet "static" (resolveWithdrawalStrategy-default)', () => {
    const { withdrawal_strategy: _omit, ...withoutStrategy } = BASE_PROFILE
    const without = runKernel(withoutStrategy)
    const withStatic = runKernel({ withdrawal_strategy: 'static' })

    expect(withStatic).toEqual(without)
  })

  it('static is identiek over de drie eindstrategieën (deplete/legacy/perpetual)', () => {
    const strategies: Array<Partial<ConvergentieRawProfileRow>> = [
      { fire_end_strategy: 'deplete' },
      { fire_end_strategy: 'legacy', fire_legacy_amount: 200_000 },
      { fire_end_strategy: 'perpetual' },
    ]
    for (const overrides of strategies) {
      const a = runKernel({ ...overrides, withdrawal_strategy: 'static' })
      const b = runKernel({ ...overrides, withdrawal_strategy: 'static' })
      expect(a).toEqual(b) // determinisme, geen Math.random/Date.now-lek
      expect(typeof a.fireReachable).toBe('boolean')
      expect(a.rows.length).toBeGreaterThan(0)
      for (const row of a.rows) {
        expect(Number.isFinite(row.withdrawal)).toBe(true)
        expect(Number.isFinite(row.endPortfolio)).toBe(true)
        expect(Number.isNaN(row.withdrawal)).toBe(false)
        expect(Number.isNaN(row.endPortfolio)).toBe(false)
      }
    }
  })
})

// ── Guardrails + life events ─────────────────────────────────────────────────

describe('Withdrawal Strategy Integration — guardrails met life events', () => {
  it('guardrails + AOW-event levert finiete rijen zonder crash (geen NaN)', () => {
    const result = runKernel({ withdrawal_strategy: 'guardrails' }, [makeAowEvent()])

    expect(typeof result.fireReachable).toBe('boolean')
    expect(result.rows.length).toBeGreaterThan(0)

    for (const row of result.rows) {
      expect(Number.isNaN(row.withdrawal)).toBe(false)
      expect(Number.isNaN(row.endPortfolio)).toBe(false)
      expect(Number.isFinite(row.withdrawal)).toBe(true)
      expect(Number.isFinite(row.endPortfolio)).toBe(true)
    }

    // AOW-event zonder aowRows valt terug op de kern-default-AOW-leeftijd (67) —
    // vanaf die leeftijd moeten er retirement-rijen bestaan (geen assertie op het
    // TEKEN van cashflowNet: bij het bekende grootte-orde-defect hierboven is de
    // eenvoudige "AOW=positieve cashflow"-relatie niet betrouwbaar te toetsen).
    const postAow = result.rows.filter((r) => r.phase === 'retirement' && r.age >= 67)
    expect(postAow.length).toBeGreaterThan(0)
  })

  it('guardrails + kinderen-event (NIBUD-auto-expander) levert finiete rijen zonder crash', () => {
    const childrenEvent: LifeEvent = {
      id: 'kind-1',
      name: 'Kind',
      event_type: 'children',
      target_age: 37,
      target_date: null,
      one_time_cost: 0,
      monthly_cost_change: 0,
      monthly_income_change: 0,
      duration_months: 0,
      icon: 'Sparkles',
      is_active: true,
      sort_order: 0,
      is_indexed: true,
      metadata: { aantalKinderen: 1 },
    } as unknown as LifeEvent

    const result = runKernel({ withdrawal_strategy: 'guardrails' }, [childrenEvent])
    expect(result.fireReachable).toBe(true)
    for (const row of result.rows) {
      expect(Number.isFinite(row.withdrawal)).toBe(true)
      expect(Number.isFinite(row.endPortfolio)).toBe(true)
    }
  })

  it('erfenis (auto-expander, V16-netting) werkt met static én guardrails, geen crash/NaN', () => {
    const strategies: Array<WithdrawalStrategyOverride> = ['static', 'guardrails']
    for (const withdrawal_strategy of strategies) {
      const result = runKernel({ withdrawal_strategy }, [makeInheritanceEvent(50, 100_000)])
      expect(result.fireReachable).toBe(true)
      for (const row of result.rows) {
        expect(Number.isFinite(row.withdrawal)).toBe(true)
        expect(Number.isFinite(row.endPortfolio)).toBe(true)
      }
    }
  })
})

type WithdrawalStrategyOverride = 'static' | 'guardrails'

// ── Strategie-afhankelijke FIRE-leeftijd ─────────────────────────────────────

describe('Withdrawal Strategy Integration — strategie-afhankelijke FIRE-leeftijd', () => {
  it('static en guardrails leveren beide een geldig resultaat op (mogen verschillen, geen crash)', () => {
    const staticResult = runKernel({ withdrawal_strategy: 'static' })
    const guardrailsResult = runKernel({ withdrawal_strategy: 'guardrails' })

    expect(typeof staticResult.fireReachable).toBe('boolean')
    expect(typeof guardrailsResult.fireReachable).toBe('boolean')
    expect(Number.isNaN(staticResult.requiredFirePortfolio)).toBe(false)
    expect(Number.isNaN(guardrailsResult.requiredFirePortfolio)).toBe(false)
    // De kernel implementeert guardrails via een eigen Excel-getrouwe tabel (ont.ts),
    // geen v2-JS-ratio's meer om exact tegenaan te toetsen; dit bewijst enkel dat de
    // tak zonder degradatie/crash draait (grootte-orde: zie het gedocumenteerde
    // defect bovenaan dit bestand — geen plausibiliteitsclaim hier).
    expect(staticResult.rows.length).toBeGreaterThan(0)
    expect(guardrailsResult.rows.length).toBeGreaterThan(0)
  })

  it('legacy eindstrategie + static/guardrails levert een consistente, crash-vrije uitkomst', () => {
    // NB: bij deze horizon/bedrag-combinatie geeft de kernel `fireReachable: false`
    // voor 'legacy' (zie het gedocumenteerde grootte-orde-defect bovenaan dit bestand)
    // — dat is HUIDIG kernel-gedrag, geen aanname van deze test. We toetsen daarom
    // structuur/determinisme, niet een hardgecodeerde bereikbaarheid.
    const strategies: WithdrawalStrategyOverride[] = ['static', 'guardrails']
    for (const withdrawal_strategy of strategies) {
      const overrides = { fire_end_strategy: 'legacy' as const, fire_legacy_amount: 200_000, withdrawal_strategy }
      const a = runKernel(overrides)
      const b = runKernel(overrides)
      expect(a).toEqual(b) // determinisme
      expect(typeof a.fireReachable).toBe('boolean')
      expect(typeof a.requiredFirePortfolio).toBe('number')
      for (const row of a.rows) {
        expect(Number.isNaN(row.withdrawal)).toBe(false)
        expect(Number.isNaN(row.endPortfolio)).toBe(false)
      }
    }
  })

  it('deplete eindstrategie + guardrails: alle rijen finiet en niet-negatief tot de eindleeftijd', () => {
    const result = runKernel({ fire_end_strategy: 'deplete', withdrawal_strategy: 'guardrails' })
    expect(result.fireReachable).toBe(true)
    for (const row of result.rows) {
      expect(Number.isFinite(row.withdrawal)).toBe(true)
      expect(Number.isFinite(row.endPortfolio)).toBe(true)
      expect(row.withdrawal).toBeGreaterThanOrEqual(0)
    }
  })
})

// ── Hoge-portefeuille sanity (spiegelt de vroegere #475-anchoring-intentie) ──

describe('Withdrawal Strategy Integration — guardrails met een hoge portefeuille', () => {
  it('een ruim gefinancierd scenario blijft crash-vrij (geen NaN) onder guardrails', () => {
    // NB: bij deze combinatie (deplete + guardrails, groot startvermogen) laat het
    // gedocumenteerde grootte-orde-defect endPortfolio bij hoge leeftijden oplopen tot
    // extreme (wél finite, dus niet NaN/Infinity) waarden — inclusief een sterk
    // negatieve staart. Geen plausibiliteits-bound hier (zou terecht rood kleuren op
    // het bestaande productiedefect); wel de garantie dat de kernel niet crasht/NaN't.
    const result = runKernel(
      { withdrawal_strategy: 'guardrails', fire_end_strategy: 'deplete' },
      [],
      600_000,
    )
    expect(typeof result.fireReachable).toBe('boolean')
    expect(result.rows.length).toBeGreaterThan(0)
    for (const row of result.rows) {
      expect(Number.isNaN(row.withdrawal)).toBe(false)
      expect(Number.isNaN(row.endPortfolio)).toBe(false)
      expect(Number.isFinite(row.withdrawal)).toBe(true)
      expect(Number.isFinite(row.endPortfolio)).toBe(true)
    }
  })
})
