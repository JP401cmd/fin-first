/**
 * De "stop nu"-runway (ADR 0126, PR B — motor-laag): *als ik vandaag stop met
 * werken, in welke maand raakt mijn liquide vermogen op?*
 *
 * Eén gedeelde motor, geen kop-specifieke som. De run is het geforceerde-stop-recept
 * op FIRE-maand 0 (`buildForcedStopSolve({ stopAge: 'nu', endStrategy: 'inherit' })`
 * + `bridgeForcedStop`, lib/horizon/scenario-presets.ts): salaris valt weg vanaf
 * maand 0 (CF!F), de onttrekking (Ont!D) rekent vanaf maand 0 met de geïndexeerde
 * `uitgaveNaPensioenPerJaar`, en de engine ankert de guardrails op de T0-liquide-
 * stand. De uitputtingsmaand is het BRIDGE-VELD `kernelDepletionMonth`
 * (`KernelUnifiedResult`, gelezen door `depletionMonth` in lib/horizon-kernel/runway.ts)
 * — doorgegeven, niet herrekend: de kop op /overzicht, de stop-nu-scenariokaart en de
 * eindstrategie lezen alle drie dat ene veld uit dezelfde run. Hier wordt het alleen
 * GEDUID tot een `RunwayResult`.
 *
 * ── Eigenaar-besluit D3: pensioen-uitgave, niet huidige consumptie ─────────────
 * De runway rekent met `kernelInput.inkomenUitgaven.uitgaveNaPensioenPerJaar` (de
 * uitgave ná stoppen), zodat de kop en de vrijheidsleeftijd op hetzelfde scherm één
 * model delen. `expenseBasis` wordt uit de kernel-INVOER geconsumeerd, nooit hier
 * herberekend. Geen geloofwaardige basis (`guardRetirementExpense` past de gedeelde
 * `credibleMonthlyBasis`-vloer toe) ⇒ `unavailable/geen-uitgavenbasis`.
 *
 * ── Consistentie-invariant D7 ────────────────────────────────────────────────────
 * Bij eindstrategie 'Vermogen opeten' (deplete) geldt: *runway reikt tot de eind-
 * leeftijd ⇒ solver-status `reached_now`* — J(0) ≥ 0 en J(eind) ≥ 0 = doelbedrag 0.
 * Voor 'Nalatenschap'/'Eeuwigdurend' is de runway-uitspraak zwakker (het doel is
 * niet "op nul uitkomen") en wordt die claim NIET gedaan. `solverStatus` reist mee
 * zodat een oppervlak (en de test) de invariant kan toetsen zonder tweede run.
 *
 * ADR 0093: de runway is een DUUR, geen euro — geen deflator, geen eigen `Math.pow`;
 * de indexatie zit in de kernel.
 */

import type { RetirementExpenseMethod } from '@/lib/budget-utils'
import type { ConvergentieRawContext } from '@/lib/horizon-kernel/convergentie-router'
import { eindMaandVan } from '@/lib/horizon-kernel/gap'
import type { SolveFireResult, SolverStatus } from '@/lib/horizon-kernel/solver'
import type { KernelInput } from '@/lib/horizon-kernel/types'
import { guardRetirementExpense } from '@/lib/horizon/outcome-guard'
import { bridgeForcedStop, buildForcedStopSolve } from '@/lib/horizon/scenario-presets'

/** De uitgavebasis van de run — geconsumeerd uit de kernel-invoer (D3). */
export interface RunwayExpenseBasis {
  /** `KernelInput.inkomenUitgaven.uitgaveNaPensioenPerJaar` (koopkracht-nu, jaarbasis). */
  readonly yearly: number
  /**
   * De GECONFIGUREERDE methode (`profiles.retirement_expense_method`, genormaliseerd;
   * onbekend/leeg → 'essential_budgets', de terugval die `computeRetirementExpenses`
   * zelf ook neemt). Het BEDRAG is altijd wat de kernel werkelijk gebruikt.
   */
  readonly method: RetirementExpenseMethod
}

/** Waarom er geen runway te noemen is. */
export type RunwayUnavailableReason =
  /** Geen geboortedatum ⇒ geen tijdas. */
  | 'geen-geboortedatum'
  /** Geen geloofwaardige uitgave-ná-stoppen (`guardRetirementExpense`). */
  | 'geen-uitgavenbasis'
  /** De adapter/kernel/bridge gooide. */
  | 'kern-fout'
  /** De gedeelde FIRE-run (`computeHorizonFireSim`) leverde geen rauwe context. */
  | 'geen-basisrun'

export type RunwayResult =
  | {
      readonly kind: 'months'
      /** Eerste aanhoudende uitputtingsmaand (maand 0 = nu) — `kernelDepletionMonth`. */
      readonly months: number
      /** `startLeeftijd + months / 12` (fractioneel). */
      readonly depletionAge: number
      /** P!B35 — eindleeftijd van de EIGEN eindstrategie. */
      readonly endAge: number
      readonly expenseBasis: RunwayExpenseBasis
      readonly solverStatus: SolverStatus
    }
  /** J > 0 (op bruggetjes na) t/m de eindmaand van de eigen eindstrategie. */
  | {
      readonly kind: 'reaches-end-age'
      readonly endAge: number
      readonly expenseBasis: RunwayExpenseBasis
      readonly solverStatus: SolverStatus
    }
  /** J > 0 (op bruggetjes na) t/m de laatste in-horizon maand (HORIZON_PLAFOND_LEEFTIJD). */
  | {
      readonly kind: 'beyond-horizon'
      readonly expenseBasis: RunwayExpenseBasis
      readonly solverStatus: SolverStatus
    }
  /** Vandaag al zonder liquide vermogen: aanhoudende uitputting vanaf maand 0. */
  | {
      readonly kind: 'deficit'
      readonly expenseBasis: RunwayExpenseBasis
      readonly solverStatus: SolverStatus
    }
  | { readonly kind: 'unavailable'; readonly reason: RunwayUnavailableReason }

const RETIREMENT_EXPENSE_METHODS: readonly RetirementExpenseMethod[] = [
  'essential_budgets',
  'custom_amount',
  'current_income',
]

/** Normaliseer de profielkolom tot de methode-union; onbekend ⇒ 'essential_budgets'. */
export function resolveRetirementExpenseMethod(
  raw: string | null | undefined,
): RetirementExpenseMethod {
  return (RETIREMENT_EXPENSE_METHODS as readonly string[]).includes(raw ?? '')
    ? (raw as RetirementExpenseMethod)
    : 'essential_budgets'
}

/**
 * Duid een voltooide "stop nu"-run. Pure functie op kernel-invoer + statusblok + het
 * doorgegeven bridge-veld `kernelDepletionMonth`; `computeRunwayFromRawContext`
 * levert die drie, tests kunnen ze zelf aanreiken.
 *
 * Volgorde van de gevallen: uitgavenbasis-guard → maand 0 (`deficit`) → nooit
 * (`beyond-horizon`) → ná de eigen eindmaand (`reaches-end-age`) → anders `months`.
 */
export function computeRunwayFromSolve(
  kernelInput: KernelInput,
  solve: SolveFireResult,
  kernelDepletionMonth: number | null,
  method: RetirementExpenseMethod,
): RunwayResult {
  const yearly = kernelInput.inkomenUitgaven.uitgaveNaPensioenPerJaar
  if (!guardRetirementExpense(yearly).ok) {
    return { kind: 'unavailable', reason: 'geen-uitgavenbasis' }
  }
  const expenseBasis: RunwayExpenseBasis = { yearly, method }
  const solverStatus = solve.status
  const endAge = solve.eindleeftijd

  const m = kernelDepletionMonth
  if (m === 0) return { kind: 'deficit', expenseBasis, solverStatus }
  if (m === null) return { kind: 'beyond-horizon', expenseBasis, solverStatus }

  // Eindmaand van de EIGEN eindstrategie op dezelfde maandas als de solver (P!B35).
  const eindMaand = eindMaandVan(endAge, kernelInput.startLeeftijd)
  if (m > eindMaand) return { kind: 'reaches-end-age', endAge, expenseBasis, solverStatus }

  return {
    kind: 'months',
    months: m,
    depletionAge: kernelInput.startLeeftijd + m / 12,
    endAge,
    expenseBasis,
    solverStatus,
  }
}

/**
 * De runway op een rauwe kernel-context — dezelfde `ConvergentieRawContext` die de
 * hoofdprojectie voedt (perspectief-correct via `computeHorizonFireSim(...).rawContext`).
 * Eindstrategie `'inherit'`: de gebruiker houdt z'n eigen eindstrategie en eindleeftijd,
 * zodat `endAge` en de D7-invariant over het eigen plan gaan. Eén engine-run
 * (`buildForcedStopSolve`) + de gedeelde bridge (`bridgeForcedStop`) — het
 * uitputtingsveld komt uit die bridge, niet uit een eigen lezing.
 */
export function computeRunwayFromRawContext(rawContext: ConvergentieRawContext): RunwayResult {
  if (!rawContext.profile.date_of_birth) {
    return { kind: 'unavailable', reason: 'geen-geboortedatum' }
  }
  let run: ReturnType<typeof buildForcedStopSolve>
  let bridged: ReturnType<typeof bridgeForcedStop>
  try {
    run = buildForcedStopSolve({
      profile: rawContext.profile,
      assets: rawContext.assets,
      debts: rawContext.debts,
      lifeEvents: rawContext.lifeEvents,
      aowRows: rawContext.aowRows,
      yearlyExpenses: rawContext.yearlyExpenses,
      stopAge: 'nu',
      endStrategy: 'inherit',
    })
    bridged = bridgeForcedStop(run, rawContext)
  } catch {
    return { kind: 'unavailable', reason: 'kern-fout' }
  }
  return computeRunwayFromSolve(
    run.kernelInput,
    run.solve,
    bridged.depletionMonth,
    resolveRetirementExpenseMethod(rawContext.profile.retirement_expense_method),
  )
}
