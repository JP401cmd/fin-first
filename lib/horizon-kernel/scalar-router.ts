/**
 * Scalar-router (FASE 6 stap 5A — kernel-onvoorwaardelijk) — de ingang voor de
 * **SWR-gebaseerde scalar-helpers** `computeFireProjection` en `computeFireRange`
 * (`lib/horizon-data.ts`) plus de mijlpalen-maandzoeker (`lib/freedom-milestones.ts`).
 * De TIJD-velden (FIRE-leeftijd/-datum/aftelling) komen uit de **horizon-kernel**; de
 * statische ratio-/weergavevelden blijven de scalar-formules.
 *
 * ## Belangrijk: "scalar-fallback" is GEEN grootboek-terugval
 * De terugval hier (`engine === 'scalar-fallback'`) is NIET de verwijderde v2-grootboek-
 * engine, maar de scalar-**weergaveformules** uit `lib/horizon-data.ts` (`computeFire-
 * Projection`/`computeFireRange`) zélf. Die blijven bestaan: ze leveren óók op de kernel-tak
 * de statische weergavevelden, én ze zijn de nette degradatie voor gevallen waarin de kernel
 * geen tijdas kan bouwen (geen geboortedatum / negatief netto vermogen) of een kern-fout
 * gooit — zodat onboarding/dob-loze gebruikers nooit breken.
 *
 * ## De semantische mapping (scalar → kernel)
 * De scalar-helpers beantwoorden "wanneer bereik ik doel = uitgaven/SWR" met één
 * portefeuille-getal + maandelijkse inleg + rendement. De kernel is behoefte-gebaseerd met
 * eindstrategieën. De eerlijke brug is een **synthetische `KernelAdapterInput`**:
 *
 * - **Eén Beleggingen-pot** met startwaarde = `totalAssets − totalDebts` en pot-rendement
 *   = `annualReturn` (de scalar salde schulden direct in het beginvermogen).
 * - **Inleg** = inkomen − uitgaven per maand: de kernel-CF-tabel spaart exact het surplus
 *   `D − E` — één-op-één de `monthlySavings` van de scalar-loop.
 * - **Uitgaven-grondslag**: de scalar-doelbasis `computeEffectiveExpenses` wordt via
 *   `retirement_expense_method = 'essential_budgets'` + `yearly_essential_expenses`
 *   geïnjecteerd (zelfde truc als de household-router).
 * - **SWR ↔ eindstrategie**: zonder `strategyOptions` kiest de router **'perpetual'**
 *   (uitgaven/SWR ≈ kapitaalinstandhouding). Het adapter-default is 'deplete' → altijd
 *   expliciet `fire_end_strategy` zetten.
 * - **Box 3 AAN (forfaitair)** — het SWR-doel dat de scalar spiegelt is ná Box 3-drag.
 * - **Geen AOW/events**; **reëel↔nominaal** via inflatie (weggelaten → helper-default).
 * - **Resultaat-mapping**: alleen de TIJD-velden komen uit de kernel-solve; de statische
 *   ratio-/weergavevelden blijven de scalar-formules (hun canon leeft elders).
 * - **Band (`computeFireRange`)**: drie synthetische offset-runs met exact de bestaande
 *   scalar-offsets (+0,02 geklemd op 0,20 / basis / −0,03 geklemd op 0,01) op het pot-rendement.
 *
 * ## Fallback-gates (nette degradatie, geen crash)
 * Geen geboortedatum (kernel kan geen tijdas bouwen; de scalar kon zonder) of negatief
 * netto vermogen (geen zinnige negatieve kernel-pot) → scalar-fallback met reden. Elke
 * kern-fout → idem via het try/catch-vangnet.
 *
 * Server- én client-bruikbaar (isomorf); deze module logt NOOIT (`console.*`).
 */

import {
  ageAtDate,
  computeFireProjection,
  computeFireRange,
  deriveCountdown,
  type FinancialInput,
  type FireProjection,
  type FireRange,
} from '@/lib/horizon-data'
import { DEFAULT_RETURN } from '@/lib/constants'
import { computeEffectiveExpenses } from '@/lib/core-metrics'
import {
  computeFreedomMilestones,
  presentFreedomMilestones,
  scalarMilestoneFireTarget,
  MILESTONE_PERCENTS,
  type FreedomMilestoneResult,
} from '@/lib/freedom-milestones'
import type { Asset } from '@/lib/asset-data'
import { buildKernelInputFromApp, type KernelAdapterInput, type KernelAdapterProfile } from '@/lib/horizon-kernel/adapter'
import { solveFire, type SolverStatus } from '@/lib/horizon-kernel/solver'
import { runKernelProjection } from '@/lib/horizon-kernel/engine'
import { prognoseI } from '@/lib/horizon-kernel/gap'

/**
 * Welke motor de aanroep daadwerkelijk berekende. `'scalar-fallback'` = de statische
 * scalar-weergaveformules (GEEN grootboek-engine — die is verwijderd), gebruikt als nette
 * degradatie bij een gate/kern-fout.
 */
export type ScalarEngine = 'kernel' | 'scalar-fallback'

/** Eindstrategie-opties van de scalar-helpers + het additieve `legacyAmount`. */
export interface ScalarStrategyOptions {
  strategy?: 'perpetual' | 'legacy' | 'deplete' | 'pensioen'
  endAge?: number
  /**
   * Nalatenschap-doelbedrag (euro's van nu) voor de kernel-tak bij 'legacy'. De bestaande
   * scalar-helpers negeren dit veld (zij rekenen legacy als uitgaven/SWR); weggelaten → 0.
   */
  legacyAmount?: number
}

/** De scalar-parameters — exact de argumentenlijst van `computeFireProjection`. */
export interface ScalarFireParams {
  readonly input: FinancialInput
  /** Weggelaten → helper-default `DEFAULT_RETURN` (en kernel-pot-rendement idem). */
  readonly annualReturn?: number
  readonly swrOverride?: number
  /** Weggelaten → helper-default `INFLATION` (en kernel-inflatie idem). */
  readonly inflationOverride?: number
  readonly strategyOptions?: ScalarStrategyOptions
}

/** Uitkomst van één scalar-projectie: resultaat + motor (+ solver-status op de kernel-tak). */
export interface ScalarFireProjectionOutcome {
  readonly result: FireProjection
  readonly engine: ScalarEngine
  /** Alleen gezet bij een scalar-fallback (gate of kern-fout). */
  readonly fallbackReason?: string
  /** P!B93/B100 — alleen aanwezig op de kernel-tak. */
  readonly kernelStatus?: SolverStatus
}

/** Uitkomst van één scalar-band (drie projecties). */
export interface ScalarFireRangeOutcome {
  readonly result: FireRange
  readonly engine: ScalarEngine
  readonly fallbackReason?: string
}

/** Parameters voor de mijlpalen-variant (spiegelt `computeFreedomMilestones`). */
export interface ScalarMilestoneParams {
  readonly netWorth: number
  readonly monthlyExpenses: number
  readonly monthlySavings: number
  readonly annualReturn?: number
  readonly inflationRate?: number
  readonly swrRate?: number
  readonly yearlyMustExpenses?: number
  /** Nodig voor de kernel-tijdas; de scalar-loop kon zonder. Weggelaten → scalar-fallback. */
  readonly dateOfBirth?: string | null
}

/** Uitkomst van de mijlpalen-router. */
export interface ScalarMilestonesOutcome {
  readonly result: FreedomMilestoneResult
  readonly engine: ScalarEngine
  readonly fallbackReason?: string
}

// ── Synthetische kernel-invoer ───────────────────────────────────────────────

/** Neutrale waarden voor de niet-gebruikte kolommen van de synthetische pot. */
function syntheticAsset(netWorth: number, returnDecimal: number): Asset {
  return {
    id: 'scalar-router-synthetische-pot',
    user_id: 'scalar-router',
    name: 'Scalar-portefeuille',
    asset_type: 'investment', // → categorie 'Beleggingen', investering: true, Box 3 'beleggingen'
    current_value: netWorth,
    purchase_value: 0,
    purchase_date: null,
    expected_return: returnDecimal * 100, // Asset.expected_return is een jaar-%
    monthly_contribution: 0, // inleg loopt via inkomen − uitgaven (CF-tabel), niet per pot
    institution: null,
    account_number: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '',
    updated_at: '',
    subtype: null,
    risk_profile: null,
    tax_benefit: null,
    is_liquid: true,
    lock_end_date: null,
    ticker_symbol: null,
    rental_income: null,
    woz_value: null,
    retirement_provider_type: null,
    depreciation_rate: null,
    address_postcode: null,
    address_house_number: null,
    expiry_date: null,
    beneficiary: null,
    kvk_number: null,
    ownership_percentage: null,
    annual_dividend: null,
    linked_asset_id: null,
    ownership: 'personal',
    household_id: null,
    net_worth_inclusion_pct: 100,
    has_budget_tracking: false,
    has_woonbalans_tracking: false,
    has_rental_tracking: false,
    monthly_maintenance_cost: 0,
    vva_fee: 0,
  } as Asset
}

/**
 * Scalar-parameters → synthetische `KernelAdapterInput` (zie de module-doc voor de
 * volledige mapping-redenering). Geëxporteerd voor de mapping-unit-tests. Vereist een
 * niet-lege geboortedatum en niet-negatief netto vermogen — de aanroeper (router) bewaakt
 * die gates vóór deze functie.
 */
export function buildScalarAdapterInput(params: ScalarFireParams): KernelAdapterInput {
  const { input, strategyOptions } = params
  const netWorth = input.totalAssets - input.totalDebts
  const annualReturn = params.annualReturn ?? undefined
  // Zelfde grondslag-keuze als de scalar-helper: must-uitgaven vóór maanduitgaven × 12.
  const effectiveYearlyExpenses = computeEffectiveExpenses(
    input.yearlyMustExpenses,
    input.monthlyExpenses * 12,
  )
  const profile: KernelAdapterProfile = {
    date_of_birth: input.dateOfBirth,
    net_monthly_income: input.monthlyIncome,
    estimated_monthly_expenses: input.monthlyExpenses,
    // Injectie-truc (zelfde als household-router): de scalar-doelbasis wordt de
    // kernel-pensioenuitgave, ongeacht eventuele andere profiel-methoden.
    yearly_essential_expenses: effectiveYearlyExpenses,
    retirement_expense_method: 'essential_budgets',
    // Alleen relevant voor resolveFireParams-doorvoer; het pot-rendement zelf staat op de
    // synthetische pot. null → DEFAULT_RETURN (zelfde default).
    expected_return: annualReturn ?? null,
    // null → INFLATION via resolveFireParams — exact de helper-default.
    inflation_rate: params.inflationOverride ?? null,
    box3_method: null, // → forfaitair (kernel-default); zie module-doc "Box 3 AAN"
    // Adapter-default zou 'deplete' zijn — de scalar-default is de perpetuïteit
    // uitgaven/SWR → altijd expliciet zetten (zie module-doc "SWR ↔ eindstrategie").
    fire_end_strategy: strategyOptions?.strategy ?? 'perpetual',
    fire_end_age: strategyOptions?.endAge ?? null,
    fire_legacy_amount: strategyOptions?.legacyAmount ?? 0,
    feature_preferences: null,
  }
  return {
    profile,
    assets: [syntheticAsset(netWorth, resolveScalarReturn(annualReturn))],
    debts: [], // schulden zijn al gesaldeerd in de pot-startwaarde (scalar-semantiek)
    lifeEvents: [], // geen AOW/kasstromen — lege lijst ⇒ aowOpbouwjaren 0 ⇒ AOW €0
    aowRows: [], // alleen relevant voor 'pensioen' → fallback-AOW-leeftijd 67
  }
}

/** Zelfde default als de helper-signatuur (`annualReturn: number = DEFAULT_RETURN`). */
function resolveScalarReturn(annualReturn: number | undefined): number {
  return annualReturn ?? DEFAULT_RETURN
}

// ── Kern: één scalar-projectie ───────────────────────────────────────────────

/** De statische scalar-weergaveformule (levert óók de kernel-tak-weergavevelden + de fallback). */
function runScalarFallback(params: ScalarFireParams): FireProjection {
  return computeFireProjection(
    params.input,
    params.annualReturn, // undefined → helper-default DEFAULT_RETURN
    params.swrOverride,
    params.inflationOverride,
    params.strategyOptions,
  )
}

/** Fallback-gate vóór de kernel-tak; `null` = geen bezwaar. */
function scalarKernelGate(input: FinancialInput): string | null {
  if (!input.dateOfBirth) {
    return 'geen geboortedatum — kernel kan geen tijdas bouwen'
  }
  if (input.totalAssets - input.totalDebts < 0) {
    return 'negatief netto vermogen — geen kernel-pot-equivalent'
  }
  return null
}

/**
 * Bereken één scalar-FIRE-projectie. De statische ratio-/weergavevelden komen altijd uit
 * de scalar-formule; de TIJD-velden uit de kernel-solve — tenzij een gate/kern-fout naar de
 * scalar-fallback degradeert. Zie de module-doc voor mapping en garanties.
 */
export function computeScalarFireProjection(
  params: ScalarFireParams,
): ScalarFireProjectionOutcome {
  const gateReason = scalarKernelGate(params.input)
  if (gateReason) {
    return { result: runScalarFallback(params), engine: 'scalar-fallback', fallbackReason: gateReason }
  }

  try {
    // De statische ratio-/weergavevelden blijven de scalar-formules (goedkoop, puur,
    // deterministisch); alleen de tijd-velden komen uit de kernel-solve.
    const base = runScalarFallback(params)
    const solve = solveFire(buildKernelInputFromApp(buildScalarAdapterInput(params)))

    if (solve.status === 'unreachable_within_horizon') {
      return {
        result: {
          ...base,
          fireAge: null,
          fireDate: 'Niet haalbaar',
          countdownDays: 0,
          countdownYears: 0,
          countdownMonths: 0,
        },
        engine: 'kernel',
        kernelStatus: solve.status,
      }
    }

    // reached_now → deriveCountdown geeft 'Bereikt!' (fireAge ≤ currentAge);
    // reached_at/pension_shortfall → aftellen naar de gevonden/pensioen-leeftijd.
    const currentAge = params.input.dateOfBirth ? ageAtDate(params.input.dateOfBirth) : null
    const fireAge = solve.status === 'reached_now' ? currentAge : solve.fireAge
    const countdown = deriveCountdown(fireAge, currentAge)
    return {
      result: {
        ...base,
        fireAge,
        fireDate: countdown.fireDate,
        countdownDays: countdown.countdownDays,
        countdownYears: countdown.countdownYears,
        countdownMonths: countdown.countdownMonths,
      },
      engine: 'kernel',
      kernelStatus: solve.status,
    }
  } catch (err) {
    // Defensief: een kern-fout mag het oppervlak nooit laten crashen → nette degradatie op
    // de scalar-weergaveformule met reden.
    const message = err instanceof Error ? err.message : 'onbekende kernel-fout'
    return {
      result: runScalarFallback(params),
      engine: 'scalar-fallback',
      fallbackReason: `kernel-fout, teruggevallen op scalar-formule: ${message}`,
    }
  }
}

// ── Band: optimistisch / verwacht / pessimistisch ────────────────────────────

/**
 * Bereken de scalar-band via drie kernel-runs met exact de bestaande offsets op het
 * pot-rendement (synthetische offset-runs — zie de module-doc). Valt één scenario terug op
 * de scalar-formule, dan valt de HELE band terug (geen stille motor-mix binnen één band).
 */
export function computeScalarFireRange(
  params: ScalarFireParams,
): ScalarFireRangeOutcome {
  const baseReturn = resolveScalarReturn(params.annualReturn)
  // Exact de offsets + klemmen van computeFireRange.
  const scenarios = {
    optimistic: Math.min(0.2, baseReturn + 0.02),
    expected: baseReturn,
    pessimistic: Math.max(0.01, baseReturn - 0.03),
  }

  const run = (annualReturn: number) => computeScalarFireProjection({ ...params, annualReturn })

  const optimistic = run(scenarios.optimistic)
  const expected = run(scenarios.expected)
  const pessimistic = run(scenarios.pessimistic)

  // De fallback-gates (dob/negatief vermogen) zijn rendement-onafhankelijk, dus in de
  // praktijk vallen de drie samen terug; deze toets bewaakt het ook bij een scenario-
  // specifieke kern-fout.
  const fallback = [optimistic, expected, pessimistic].find((o) => o.engine === 'scalar-fallback')
  if (fallback) {
    return {
      result: computeFireRange(
        params.input,
        params.swrOverride,
        params.inflationOverride,
        params.annualReturn, // undefined → helper-default DEFAULT_RETURN
        params.strategyOptions,
      ),
      engine: 'scalar-fallback',
      fallbackReason: fallback.fallbackReason ?? 'kernel-terugval in een band-scenario',
    }
  }

  return {
    result: {
      optimistic: optimistic.result,
      expected: expected.result,
      pessimistic: pessimistic.result,
    },
    engine: 'kernel',
  }
}

// ── Mijlpalen: 25/50/75/100% vrijheid ────────────────────────────────────────

/** Scalar-horizon van de mijlpalen-loop (maanden) — zelfde kap als de scalar-loop. */
const MILESTONE_HORIZON_MONTHS = 600

/**
 * Bereken de vrijheidsmijlpalen via één kernel-accumulatierun (FIRE geparkeerd op de
 * horizon zodat de inleg nooit stopt) en de kruisingsmaanden op het GEDEFLEERDE netto
 * vermogen (Prognose!I ÷ (1+inflatie)^(m/12)) tegen de scalar-doelen in euro's van nu. De
 * doel-/weergavesemantiek blijft de scalar-presenter. Gate/kern-fout → scalar-fallback
 * (`computeFreedomMilestones`).
 */
export function computeScalarFreedomMilestones(
  params: ScalarMilestoneParams,
): ScalarMilestonesOutcome {
  const runFallback = (): FreedomMilestoneResult =>
    computeFreedomMilestones(
      params.netWorth,
      params.monthlyExpenses,
      params.monthlySavings,
      params.annualReturn, // undefined → helper-defaults
      params.inflationRate,
      params.swrRate,
      params.yearlyMustExpenses,
    )

  if (!params.dateOfBirth) {
    return { result: runFallback(), engine: 'scalar-fallback', fallbackReason: 'geen geboortedatum — kernel kan geen tijdas bouwen' }
  }
  if (params.netWorth < 0) {
    return { result: runFallback(), engine: 'scalar-fallback', fallbackReason: 'negatief netto vermogen — geen kernel-pot-equivalent' }
  }

  try {
    const fireTarget = scalarMilestoneFireTarget(
      params.monthlyExpenses,
      params.swrRate,
      params.yearlyMustExpenses ?? 0,
    )

    // Synthetische invoer via dezelfde mapping als de projectie-router; de mijlpalen-
    // signatuur kent alleen sparen + uitgaven → inkomen := uitgaven + sparen.
    const kernelInput = buildKernelInputFromApp(
      buildScalarAdapterInput({
        input: {
          totalAssets: params.netWorth,
          totalDebts: 0,
          monthlyIncome: params.monthlyExpenses + params.monthlySavings,
          monthlyExpenses: params.monthlyExpenses,
          monthlyContributions: 0,
          yearlyMustExpenses: params.yearlyMustExpenses ?? 0,
          dateOfBirth: params.dateOfBirth,
        },
        annualReturn: params.annualReturn,
        inflationOverride: params.inflationRate,
        strategyOptions: { strategy: 'perpetual' }, // inert: we solven niet, we accumuleren
      }),
    )

    // Accumulatierun: FIRE geparkeerd op leeftijd 100 → de CF-tabel blijft elke in-horizon-
    // maand het surplus sparen (er is geen onttrekkingsfase).
    const proj = runKernelProjection(kernelInput, { fireAge: 100 })

    const milestoneMonths = new Map<number, number>()
    if (fireTarget > 0) {
      // Maand 0 = al bereikt (zelfde toets als de scalar-loop).
      for (const pct of MILESTONE_PERCENTS) {
        if (params.netWorth >= fireTarget * (pct / 100)) milestoneMonths.set(pct, 0)
      }
      const inflatie = kernelInput.inflatie
      const horizon = Math.min(MILESTONE_HORIZON_MONTHS, proj.prognose.length - 1)
      const pending = MILESTONE_PERCENTS.filter((pct) => !milestoneMonths.has(pct))
        .map((pct) => ({ pct, target: fireTarget * (pct / 100) }))
        .sort((a, b) => a.target - b.target)
      let nextIdx = 0
      for (let m = 1; m <= horizon && nextIdx < pending.length; m++) {
        const nominaal = prognoseI(proj, m)
        if (nominaal === null) break
        const reeel = nominaal / Math.pow(1 + inflatie, m / 12)
        while (nextIdx < pending.length && reeel >= pending[nextIdx].target) {
          milestoneMonths.set(pending[nextIdx].pct, m)
          nextIdx++
        }
      }
    }

    return {
      result: presentFreedomMilestones({
        fireTarget,
        netWorth: params.netWorth,
        monthlySavings: params.monthlySavings,
        milestoneMonths,
      }),
      engine: 'kernel',
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'onbekende kernel-fout'
    return {
      result: runFallback(),
      engine: 'scalar-fallback',
      fallbackReason: `kernel-fout, teruggevallen op scalar-formule: ${message}`,
    }
  }
}
