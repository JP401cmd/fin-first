// ── Volgende Stap-motor ──────────────────────────────────────────────────────
//
// Eén bron van waarheid voor "wat is mijn volgende stap?". De motor is een
// PURE functie over reeds berekende bundelwaarden: hij rekent niets zelf uit
// (consume, don't recompute — spaarquote, noodfonds-dekking, vrijheidsdagen en
// de FIRE-countdown komen canoniek uit de loader/rekenmotoren) maar bepaalt
// welke stap er nú toe doet, in welke module hij thuishoort en welk gemeten
// kengetal erbij hoort.
//
// Twee soorten stappen:
//  • `fundament` — eenmalige inrichting; verdwijnt zodra het gedaan is.
//  • `groei`     — doorlopende waarde ná de inrichting, per module (Kern/Wil/Horizon).
//
// De `groei`-tak is de reden dat de widget ook voor een volledig ingerichte
// gebruiker betekenis houdt in plaats van permanent "Alles op orde" te tonen.

import type { NextStep, NextStepKind, NextStepModule } from '@/lib/types/dashboard'
import {
  VOLGENDE_STAP_SPAARQUOTE_MIN_PCT,
  VOLGENDE_STAP_VASTE_LASTEN_MAX_PCT,
} from '@/lib/constants'

/**
 * De canonieke sleutels die de motor kan uitgeven. Eén bron voor de widget én
 * voor de complete/dismiss-routes die een stap wegschrijven — zodat er niet
 * opnieuw twee lijstjes uit elkaar groeien.
 */
export const NEXT_STEP_KEYS = [
  // fundament
  'connect_bank_psd2',
  'import_transactions',
  'add_assets',
  'add_debts',
  'create_budgets',
  'set_goals',
  'set_dob',
  // groei
  'noodfonds_aanvullen',
  'spaarquote_verhogen',
  'budgetten_bijsturen',
  'vaste_lasten_verlagen',
  'review_actions',
  'plan_gebeurtenissen',
  'vrijheid_versnellen',
] as const

export type NextStepKey = (typeof NEXT_STEP_KEYS)[number]

export interface NextStepInput {
  // ── Fundament-signalen ──
  hasBankConnection: boolean
  transactionCount: number
  assetCount: number
  debtCount: number
  budgetCount: number
  goalCount: number
  hasDateOfBirth: boolean
  /** Netto vermogen uit de bundel — bepaalt of "schulden vastleggen" relevant is. */
  netWorth: number

  // ── Groei-signalen (alle waarden komen al berekend binnen) ──
  /** emergencyFund.monthsCovered uit de bundel. */
  emergencyMonthsCovered: number
  /** emergencyFund.targetMonths uit de bundel (gebruikersdoel of default). */
  emergencyTargetMonths: number
  /** savingsRate6m (%) uit de bundel. */
  savingsRate6mPct: number
  /** Effectief maandinkomen — noemer voor het vaste-lastenaandeel. */
  monthlyIncome: number
  /** totalRecurringAmount (vaste lasten per maand) uit de bundel. */
  monthlyRecurringAmount: number
  /** Aantal uitgavenbudgetten dat de maandlimiet overschrijdt (uit topBudgets). */
  budgetsOverLimit: number
  /** Aantal openstaande acties. */
  openActionCount: number
  /** totalFreedomDaysOpen — canonieke vrijheidsdagen-impact van open acties. */
  freedomDaysOpen: number
  /** Aantal geplande levensgebeurtenissen. */
  lifeEventCount: number
  /** simFireCountdown.countdownYears, of null als er geen FIRE-prognose is. */
  fireCountdownYears: number | null

  /** step_key → dismissed (uit next_step_completions). */
  completions: Map<string, boolean>
}

type StepDraft = Omit<NextStep, 'dismissed'>

function nl(value: number, maxFractionDigits = 1): string {
  return value.toLocaleString('nl-NL', { maximumFractionDigits: maxFractionDigits })
}

function meervoud(count: number, enkel: string, meer: string): string {
  return count === 1 ? enkel : meer
}

/**
 * Bepaalt de actuele volgende stappen. Volgorde = prioriteit: eerst het
 * fundament (zonder data klopt de rest niet), daarna de groei-stappen per
 * module in de volgorde Kern → Wil → Horizon.
 */
export function computeNextSteps(input: NextStepInput): NextStep[] {
  const drafts: StepDraft[] = []
  const add = (
    key: NextStepKey,
    module: NextStepModule,
    kind: NextStepKind,
    label: string,
    title: string,
    description: string,
    href: string,
    extra?: { impact?: number | null; metric?: string | null },
  ) => {
    drafts.push({
      key,
      label,
      title,
      description,
      impact: extra?.impact ?? null,
      metric: extra?.metric ?? null,
      module,
      kind,
      href,
    })
  }

  // ── Fundament ──────────────────────────────────────────────────────────
  if (!input.hasBankConnection) {
    add(
      'connect_bank_psd2', 'kern', 'fundament',
      'Bank koppelen',
      'Koppel je bank voor automatisch inzicht',
      'Verbind je rekening via PSD2 — je transacties komen dan vanzelf binnen.',
      '/core/cash/connect',
    )
  }
  if (input.transactionCount === 0) {
    add(
      'import_transactions', 'kern', 'fundament',
      'Transacties importeren',
      'Importeer je transacties',
      'Zonder transacties blijft je cashflow — en dus je vrijheidstempo — een schatting.',
      '/core/cash/import',
    )
  }
  if (input.assetCount === 0) {
    add(
      'add_assets', 'kern', 'fundament',
      'Bezittingen toevoegen',
      'Leg je bezittingen vast',
      'Spaargeld, beleggingen en bezit samen bepalen hoeveel vrijheid je al hebt opgebouwd.',
      '/overzicht/bezittingen',
    )
  }
  if (input.debtCount === 0 && input.netWorth < 0) {
    add(
      'add_debts', 'kern', 'fundament',
      'Schulden vastleggen',
      'Leg je schulden vast',
      'Schulden zijn vrijheid die je terugkoopt — pas compleet als ze erin staan.',
      '/overzicht/schulden',
    )
  }
  if (input.budgetCount === 0) {
    add(
      'create_budgets', 'kern', 'fundament',
      'Budgetten aanmaken',
      'Maak je budgetten aan',
      'Budgetten maken zichtbaar hoeveel levenstijd elke categorie kost.',
      '/overzicht/cashflow/budget',
    )
  }
  if (input.goalCount === 0) {
    add(
      'set_goals', 'wil', 'fundament',
      'Doelen stellen',
      'Stel je doelen',
      'Een doel maakt van sparen "vrijheid opbouwen" met een datum erbij.',
      '/toekomst/doelen',
    )
  }
  if (!input.hasDateOfBirth) {
    add(
      'set_dob', 'horizon', 'fundament',
      'Geboortedatum invullen',
      'Vul je geboortedatum in',
      'Nodig om je vrijheidsdatum en tijdlijn te kunnen berekenen.',
      '/mijn/profiel',
    )
  }

  // ── Groei · Kern ───────────────────────────────────────────────────────
  if (
    input.transactionCount > 0 &&
    input.emergencyTargetMonths > 0 &&
    input.emergencyMonthsCovered < input.emergencyTargetMonths
  ) {
    add(
      'noodfonds_aanvullen', 'kern', 'groei',
      'Noodfonds aanvullen',
      'Vul je noodfonds aan',
      'Een gevulde buffer is vrijheid die je vandaag al bezit.',
      '/overzicht/cashflow/budget',
      {
        metric: `${nl(input.emergencyMonthsCovered)} van ${nl(input.emergencyTargetMonths)} ${meervoud(input.emergencyTargetMonths, 'maand', 'maanden')} gedekt`,
      },
    )
  }
  if (
    input.transactionCount > 0 &&
    input.monthlyIncome > 0 &&
    input.savingsRate6mPct < VOLGENDE_STAP_SPAARQUOTE_MIN_PCT
  ) {
    add(
      'spaarquote_verhogen', 'kern', 'groei',
      'Spaarquote verhogen',
      'Bouw sneller vrijheid op',
      'Elk procent spaarquote erbij haalt je vrijheidsdatum naar voren.',
      '/overzicht/cashflow/budget',
      { metric: `spaarquote ${nl(input.savingsRate6mPct)}%` },
    )
  }
  if (input.budgetsOverLimit > 0) {
    add(
      'budgetten_bijsturen', 'kern', 'groei',
      'Budgetten bijsturen',
      'Stuur je budgetten bij',
      'Overschrijdingen kosten stilletjes vrijheidstijd.',
      '/overzicht/cashflow/budget',
      {
        metric: `${input.budgetsOverLimit} ${meervoud(input.budgetsOverLimit, 'budget', 'budgetten')} over de limiet`,
      },
    )
  }
  if (
    input.monthlyIncome > 0 &&
    (input.monthlyRecurringAmount / input.monthlyIncome) * 100 > VOLGENDE_STAP_VASTE_LASTEN_MAX_PCT
  ) {
    const pct = (input.monthlyRecurringAmount / input.monthlyIncome) * 100
    add(
      'vaste_lasten_verlagen', 'kern', 'groei',
      'Vaste lasten verlagen',
      'Maak je vaste lasten lichter',
      'Hoe minder vastligt, hoe meer keuzevrijheid je elke maand houdt.',
      '/overzicht/cashflow/vaste-lasten',
      { metric: `${nl(pct, 0)}% van je inkomen ligt vast` },
    )
  }

  // ── Groei · Wil ────────────────────────────────────────────────────────
  if (input.openActionCount > 0) {
    add(
      'review_actions', 'wil', 'groei',
      'Acties oppakken',
      'Pak je openstaande acties op',
      'Deze acties liggen klaar om vrijheidstijd terug te winnen.',
      '/overzicht/tips',
      {
        impact: input.freedomDaysOpen > 0 ? Math.round(input.freedomDaysOpen) : null,
        metric: `${input.openActionCount} ${meervoud(input.openActionCount, 'actie', 'acties')} open`,
      },
    )
  }

  // ── Groei · Horizon ────────────────────────────────────────────────────
  if (input.hasDateOfBirth && input.lifeEventCount === 0) {
    add(
      'plan_gebeurtenissen', 'horizon', 'groei',
      'Gebeurtenissen plannen',
      'Zet je plannen op de tijdlijn',
      'Verhuizing, studie of sabbatical veranderen je vrijheidsdatum — reken ze mee.',
      '/toekomst/gebeurtenissen',
    )
  }
  if (input.fireCountdownYears != null && input.fireCountdownYears > 0) {
    add(
      'vrijheid_versnellen', 'horizon', 'groei',
      'Vrijheid versnellen',
      'Onderzoek wat je vrijheid versnelt',
      'Speel met wat-als-scenario’s en zie direct wat het je aan tijd scheelt.',
      '/toekomst/whatif',
      {
        metric: `nog ${nl(input.fireCountdownYears, 0)} ${meervoud(input.fireCountdownYears, 'jaar', 'jaar')} tot volledige vrijheid`,
      },
    )
  }

  // Afgeronde/weggeklikte stappen verdwijnen; stappen zonder registratie blijven.
  return drafts
    .map(step => ({ ...step, dismissed: input.completions.get(step.key) === true }))
    .filter(step => !step.dismissed)
}
