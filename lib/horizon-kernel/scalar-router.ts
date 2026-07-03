/**
 * Scalar-router (FASE 5, stap 2e — gap-besluit V10, de laatste flip) — de dunne
 * motorschakelaar voor de **SWR-gebaseerde scalar-helpers** `computeFireProjection`
 * en `computeFireRange` (`lib/horizon-data.ts`) plus de mijlpalen-maandzoeker
 * (`lib/freedom-milestones.ts`). Kiest per aanroep tussen de **horizon-kernel**
 * (achter de per-gebruiker-vlag `horizon_kernel_scalar`) en de bestaande helpers.
 *
 * ## Byte-identiteit (harde eis)
 * Bij `kernelEnabled === false` (default) is de uitvoer LETTERLIJK de bestaande
 * helper-aanroep met exact dezelfde argumenten — inclusief de default-parameters
 * (een weggelaten `annualReturn`/`inflationOverride` laat de helper-defaults
 * `DEFAULT_RETURN`/`INFLATION` gelden, precies zoals vandaag).
 *
 * ## De semantische mapping (scalar → kernel)
 * De scalar-helpers beantwoorden "wanneer bereik ik doel = uitgaven/SWR" met één
 * portefeuille-getal + maandelijkse inleg + rendement. De kernel is
 * behoefte-gebaseerd met eindstrategieën. De eerlijke brug is een **synthetische
 * `KernelAdapterInput`**:
 *
 * - **Eén Beleggingen-pot** met startwaarde = `totalAssets − totalDebts` en
 *   pot-rendement = `annualReturn`. De scalar salde schulden immers direct in het
 *   beginvermogen en liet alles tegen één rendement groeien; een aparte
 *   schuld-pot zou een rentevoet vereisen die de scalar-parameters niet kennen.
 * - **Inleg** = inkomen − uitgaven per maand: het kernel-grootboek spaart in de
 *   CF-tabel exact het surplus `D − E` (= `net_monthly_income −
 *   estimated_monthly_expenses`), wat één-op-één de `monthlySavings` van de
 *   scalar-loop is. `FinancialInput.monthlyContributions` wordt door
 *   `computeFireProjection` zelf óók genegeerd en dus bewust niet gemapt.
 * - **Uitgaven-grondslag**: de scalar-doelbasis `yearlyMustExpenses > 0 ?
 *   yearlyMustExpenses : maanduitgaven × 12` (`computeEffectiveExpenses`) wordt
 *   via `retirement_expense_method = 'essential_budgets'` +
 *   `yearly_essential_expenses` in de kernel geïnjecteerd (zelfde truc als de
 *   household-router), zodat de pensioenuitgave dezelfde grondslag heeft.
 * - **SWR ↔ eindstrategie**: de `strategyOptions.strategy`-woordenschat is al
 *   identiek aan de kernel-eindstrategieën en mapt 1-op-1. Zonder
 *   `strategyOptions` (scalar-default: doel = uitgaven/SWR, een perpetuïteit)
 *   kiest de router **'perpetual'** ('Eeuwigdurend'): de SWR die de consumenten
 *   doorgeven is de effectieve (rendement − Box3-drag − inflatie), dus
 *   uitgaven/SWR ≈ "de portefeuille waarvan het reële na-belasting-rendement de
 *   uitgaven eeuwig draagt" — precies de kapitaal-instandhouding die de kernel
 *   bij 'Eeuwigdurend' endogeen oplost. 'legacy'-met-doelbedrag zou het
 *   SWR-quotiënt opnieuw voorschrijven en is daarmee de mindere spiegel; voor
 *   consumenten die wél legacy voeren, is `strategyOptions.legacyAmount`
 *   toegevoegd (additief; de bestaande helpers negeren het veld).
 *   LET OP: het adapter-default bij een ontbrekende strategie is 'deplete' —
 *   de router zet daarom altijd expliciet `fire_end_strategy`.
 * - **Box 3 AAN (forfaitair, kernel-default)** — bewuste keuze, beredeneerd: de
 *   scalar-loop zelf rekent geen Box 3 (geen `NL_FICTIEF_BELEGGINGEN`-gebruik),
 *   maar het SWR-dóel dat hij spiegelt is ná Box 3-drag (`computeEffectiveSwr =
 *   rendement − BOX3_DRAG − inflatie`; consumenten geven `effectiveSwr`/`NL_SWR`
 *   door). De kernel rekent diezelfde belasting endogeen op het grootboek;
 *   Box 3 uitzetten zou de kernel-tak juist láten afwijken van wat de
 *   SWR-doelsemantiek bedoelt — én van de convergentie-oppervlakken.
 * - **Geen AOW/events**: de scalar kent geen kasstromen; een lege
 *   `lifeEvents`-lijst geeft in de adapter automatisch `aowOpbouwjaren = 0`
 *   (AOW = €0) — dezelfde aanname, zonder speciale behandeling.
 * - **Reëel vs. nominaal**: de scalar rekent reëel (reëel rendement, doel in
 *   euro's van nu); de kernel nominaal met geïndexeerd doel — dezelfde
 *   vergelijking in andere kleding. `inflationOverride` → `inflation_rate`
 *   (weggelaten → zelfde `INFLATION`-default via `resolveFireParams`).
 * - **Resultaat-mapping**: alleen de TIJD-velden (`fireAge`, `fireDate`,
 *   `countdown*`) komen uit de kernel-solve; de statische ratio-/weergavevelden
 *   (`fireTarget`, `freedomPercentage`, `monthlyPassiveIncome`,
 *   `freedomYears/Months`, `savingsRate`, …) blijven de scalar-formules — hun
 *   canon leeft elders (`computeFreedomProgress`, `fire-target-shared`) en het
 *   kernel-doelbedrag is nominaal-op-eindleeftijd, een andere grootheid dan het
 *   `fireTarget`-in-euro's-van-nu dat de consumenten tonen.
 * - **Band (`computeFireRange`)**: drie synthetische offset-runs met exact de
 *   bestaande scalar-offsets (+0,02 geklemd op 0,20 / basis / −0,03 geklemd op
 *   0,01) op het pot-rendement. Bewust GEEN `runScenarioBand`: die levert alleen
 *   FIRE-leeftijd + twee vermogens (geen volledige `FireProjection` zoals het
 *   `FireRange`-contract eist) en hanteert ±0,02-shifts — de scalar-band-
 *   semantiek (+2pp/−3pp) blijft het contract tot F6. Mechanisch is het
 *   equivalent: de band-shift raakt óók alleen investeringspotten, en onze ene
 *   synthetische pot ís er één.
 *
 * ## Terugval-gates (geen stille engine-mix, geen crash achter de vlag)
 * Geen geboortedatum (kernel kan geen tijdas bouwen; de scalar kon zonder) of
 * negatief netto vermogen (geen zinnige negatieve kernel-pot) → schone
 * v2-terugval met reden. Elke kernel-fout → idem via het try/catch-vangnet.
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

/** Welke motor de aanroep daadwerkelijk berekende. */
export type ScalarEngine = 'kernel' | 'v2'

/** Eindstrategie-opties van de scalar-helpers + het additieve `legacyAmount` (V10). */
export interface ScalarStrategyOptions {
  strategy?: 'perpetual' | 'legacy' | 'deplete' | 'pensioen'
  endAge?: number
  /**
   * Nalatenschap-doelbedrag (euro's van nu) voor de kernel-tak bij 'legacy'.
   * De bestaande scalar-helpers negeren dit veld (zij rekenen legacy als
   * uitgaven/SWR); weggelaten → 0.
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

/** Router-opties: is de per-gebruiker-vlag `horizon_kernel_scalar` aan? */
export interface ScalarRouterOptions {
  readonly kernelEnabled: boolean
}

/** Uitkomst van één scalar-projectie: resultaat + motor (+ solver-status op de kernel-tak). */
export interface ScalarFireProjectionOutcome {
  readonly result: FireProjection
  readonly engine: ScalarEngine
  /** Alleen gezet bij een terugval op v2 terwijl de vlag aan stond. */
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
  /** Nodig voor de kernel-tijdas; de scalar-loop kon zonder. Weggelaten → v2. */
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
 * Scalar-parameters → synthetische `KernelAdapterInput` (zie de module-doc voor
 * de volledige mapping-redenering). Geëxporteerd voor de mapping-unit-tests.
 * Vereist een niet-lege geboortedatum en niet-negatief netto vermogen — de
 * aanroeper (router) bewaakt die gates vóór deze functie.
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
    // Alleen relevant voor resolveFireParams-doorvoer; het pot-rendement zelf
    // staat op de synthetische pot. null → DEFAULT_RETURN (zelfde default).
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

/** De letterlijke bestaande helper-aanroep (v2-tak + terugval). */
function runScalarV2(params: ScalarFireParams): FireProjection {
  return computeFireProjection(
    params.input,
    params.annualReturn, // undefined → helper-default DEFAULT_RETURN
    params.swrOverride,
    params.inflationOverride,
    params.strategyOptions,
  )
}

/** Terugval-gate vóór de kernel-tak; `null` = geen bezwaar. */
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
 * Bereken één scalar-FIRE-projectie via de kernel (vlag aan) of via de bestaande
 * helper (vlag uit / terugval). Zie de module-doc voor mapping en garanties.
 */
export function computeScalarFireProjection(
  params: ScalarFireParams,
  opts: ScalarRouterOptions,
): ScalarFireProjectionOutcome {
  // Vlag uit → byte-identiek aan vandaag.
  if (!opts.kernelEnabled) {
    return { result: runScalarV2(params), engine: 'v2' }
  }

  const gateReason = scalarKernelGate(params.input)
  if (gateReason) {
    return { result: runScalarV2(params), engine: 'v2', fallbackReason: gateReason }
  }

  try {
    // De statische ratio-/weergavevelden blijven de scalar-formules (goedkoop,
    // puur, deterministisch); alleen de tijd-velden komen uit de kernel-solve.
    const base = runScalarV2(params)
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
    // Defensief: een kernel-fout mag het oppervlak nooit laten crashen achter
    // de vlag → schone terugval op de bestaande helper met reden.
    const message = err instanceof Error ? err.message : 'onbekende kernel-fout'
    return {
      result: runScalarV2(params),
      engine: 'v2',
      fallbackReason: `kernel-fout, teruggevallen op v2: ${message}`,
    }
  }
}

// ── Band: optimistisch / verwacht / pessimistisch ────────────────────────────

/**
 * Bereken de scalar-band. Vlag uit → letterlijk `computeFireRange` (byte-identiek,
 * incl. de bestaande offsets en klemmen). Vlag aan → drie kernel-runs met exact
 * diezelfde offsets op het pot-rendement (synthetische offset-runs — zie de
 * module-doc voor waarom niet `runScenarioBand`). Valt één scenario terug op v2,
 * dan valt de HELE band terug (geen stille engine-mix binnen één band).
 */
export function computeScalarFireRange(
  params: ScalarFireParams,
  opts: ScalarRouterOptions,
): ScalarFireRangeOutcome {
  if (!opts.kernelEnabled) {
    return {
      result: computeFireRange(
        params.input,
        params.swrOverride,
        params.inflationOverride,
        params.annualReturn, // undefined → helper-default DEFAULT_RETURN
        params.strategyOptions,
      ),
      engine: 'v2',
    }
  }

  const baseReturn = resolveScalarReturn(params.annualReturn)
  // Exact de offsets + klemmen van computeFireRange (het contract tot F6).
  const scenarios = {
    optimistic: Math.min(0.2, baseReturn + 0.02),
    expected: baseReturn,
    pessimistic: Math.max(0.01, baseReturn - 0.03),
  }

  const run = (annualReturn: number) =>
    computeScalarFireProjection({ ...params, annualReturn }, opts)

  const optimistic = run(scenarios.optimistic)
  const expected = run(scenarios.expected)
  const pessimistic = run(scenarios.pessimistic)

  // De terugval-gates (dob/negatief vermogen) zijn rendement-onafhankelijk, dus
  // in de praktijk vallen de drie samen terug; deze toets bewaakt het ook bij
  // een scenario-specifieke kernel-fout.
  const fallback = [optimistic, expected, pessimistic].find((o) => o.engine === 'v2')
  if (fallback) {
    return {
      result: computeFireRange(
        params.input,
        params.swrOverride,
        params.inflationOverride,
        params.annualReturn,
        params.strategyOptions,
      ),
      engine: 'v2',
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

/** Scalar-horizon van de mijlpalen-loop (maanden) — zelfde kap als de v2-loop. */
const MILESTONE_HORIZON_MONTHS = 600

/**
 * Bereken de vrijheidsmijlpalen. Vlag uit → letterlijk `computeFreedomMilestones`.
 * Vlag aan → één kernel-accumulatierun (FIRE geparkeerd op de horizon zodat de
 * inleg nooit stopt) en de kruisingsmaanden op het GEDEFLEERDE netto vermogen
 * (Prognose!I ÷ (1+inflatie)^(m/12)) tegen de scalar-doelen in euro's van nu.
 * De doel-/weergavesemantiek (fireTarget = uitgaven/SWR, labels, teksten) blijft
 * de scalar-presenter — alleen de maandzoeker wisselt van motor.
 */
export function computeScalarFreedomMilestones(
  params: ScalarMilestoneParams,
  opts: ScalarRouterOptions,
): ScalarMilestonesOutcome {
  const runV2 = (): FreedomMilestoneResult =>
    computeFreedomMilestones(
      params.netWorth,
      params.monthlyExpenses,
      params.monthlySavings,
      params.annualReturn, // undefined → helper-defaults
      params.inflationRate,
      params.swrRate,
      params.yearlyMustExpenses,
    )

  if (!opts.kernelEnabled) {
    return { result: runV2(), engine: 'v2' }
  }
  if (!params.dateOfBirth) {
    return { result: runV2(), engine: 'v2', fallbackReason: 'geen geboortedatum — kernel kan geen tijdas bouwen' }
  }
  if (params.netWorth < 0) {
    return { result: runV2(), engine: 'v2', fallbackReason: 'negatief netto vermogen — geen kernel-pot-equivalent' }
  }

  try {
    const fireTarget = scalarMilestoneFireTarget(
      params.monthlyExpenses,
      params.swrRate,
      params.yearlyMustExpenses ?? 0,
    )

    // Synthetische invoer via dezelfde mapping als de projectie-router; de
    // mijlpalen-signatuur kent alleen sparen + uitgaven → inkomen := uitgaven + sparen.
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

    // Accumulatierun: FIRE geparkeerd op leeftijd 100 → de CF-tabel blijft elke
    // in-horizon-maand het surplus sparen (er is geen onttrekkingsfase).
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
      result: runV2(),
      engine: 'v2',
      fallbackReason: `kernel-fout, teruggevallen op v2: ${message}`,
    }
  }
}
