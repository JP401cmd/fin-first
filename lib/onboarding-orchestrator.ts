/**
 * Onboarding-orchestrator — state-machine die bepaalt welke contextuele
 * coach-nudge de gebruiker op een gegeven moment ziet.
 *
 * Plan §6.7: "Geen aparte routes, wel onzichtbare regie. De orchestrator
 * beslist welke stap volgt op basis van wat de gebruiker aanlevert en
 * wanneer. Skip-mogelijkheid op elke stap."
 *
 * Vier stappen, oplopend qua diepte:
 *   1. DOB invullen           — direct zichtbaar bij missing
 *   2. Eerste rekening        — zichtbaar zodra DOB gezet is
 *   3. Eerste doel formuleren — zichtbaar zodra registratie compleet is
 *   4. Open briefing          — pas na ≥7 dagen account-leeftijd, en
 *                                alleen als step 1-3 voltooid zijn
 *
 * Pure functie — geen UI-koppelingen, geen localStorage-reads. De caller
 * (OnboardingNudges) levert `dismissedKeys` aan vanuit localStorage en
 * rendert het resultaat. Tests valideren elke transitie zonder mocks.
 */

export type JourneyStage = 'registreren' | 'inzicht' | 'tips' | 'toekomst' | 'complete'

export type OrchestratorStepKey = 'dob' | 'first-asset' | 'first-goal' | 'open-briefing'

export interface OrchestratorInput {
  hasDob: boolean
  hasAssets: boolean
  hasGoals: boolean
  /** Dagen sinds account-aanmaak. 0 = vandaag. */
  accountAgeDays: number
  /** Stable keys van stappen die expliciet zijn gedismissed. */
  dismissedKeys: ReadonlySet<OrchestratorStepKey>
}

export interface OrchestratorStep {
  key: OrchestratorStepKey
  stage: JourneyStage
  /** Korte titel voor in de checklist. */
  label: string
  /** Eén zin uitleg waarom dit ertoe doet. */
  description: string
  ctaHref: string
  ctaLabel: string
  /** Voldoet aan completion-criteria — gebruiker hoeft niets meer te doen. */
  completed: boolean
  /** Stap is op dit moment relevant voor de gebruiker. False = wachten op
   *  een eerdere stap, of pre-7-dagen voor de briefing-nudge. */
  unlocked: boolean
  /** Door gebruiker geskipped (zichtbaar maar terzijde geschoven). */
  dismissed: boolean
}

export interface OrchestratorState {
  currentStage: JourneyStage
  /** De eerstvolgende stap die de gebruiker zou moeten zien — of `null`
   *  wanneer alles klaar of gedismissed is. */
  nextNudge: OrchestratorStep | null
  /** Alle stappen incl. completed/unlocked/dismissed status. Caller kan
   *  beslissen om een volledige checklist te tonen of alleen `nextNudge`. */
  steps: OrchestratorStep[]
  /** Aantal voltooide stappen — voor "X/4 voltooid"-display. */
  completedCount: number
}

/** Minimaal aantal dagen account-leeftijd vóór de briefing-nudge verschijnt. */
const BRIEFING_NUDGE_MIN_DAYS = 7

export function computeOrchestratorState(input: OrchestratorInput): OrchestratorState {
  const steps = buildSteps(input)
  const completedCount = steps.filter((s) => s.completed).length
  const currentStage = deriveStage(input, completedCount)
  // Volgende nudge: eerste stap die unlocked is, niet completed, niet gedismissed.
  const nextNudge =
    steps.find((s) => s.unlocked && !s.completed && !s.dismissed) ?? null

  return { currentStage, nextNudge, steps, completedCount }
}

function buildSteps(input: OrchestratorInput): OrchestratorStep[] {
  const { hasDob, hasAssets, hasGoals, accountAgeDays, dismissedKeys } = input

  // Step 1: DOB — altijd direct unlocked.
  const dob: OrchestratorStep = {
    key: 'dob',
    stage: 'registreren',
    label: 'Geboortejaar invullen',
    description: 'Nodig voor leeftijds-projectie en vrijheidsmoment.',
    ctaHref: '/mijn/profiel',
    ctaLabel: 'Profiel openen',
    completed: hasDob,
    unlocked: true,
    dismissed: dismissedKeys.has('dob'),
  }

  // Step 2: eerste rekening — unlocked zodra DOB gezet is.
  const asset: OrchestratorStep = {
    key: 'first-asset',
    stage: 'registreren',
    label: 'Eerste rekening toevoegen',
    description: 'Basis voor netto-vermogen en de vier hefbomen.',
    ctaHref: '/overzicht/bezittingen',
    ctaLabel: 'Bezittingen openen',
    completed: hasAssets,
    unlocked: hasDob,
    dismissed: dismissedKeys.has('first-asset'),
  }

  // Step 3: eerste doel — unlocked zodra registratie (DOB + asset) compleet.
  const goal: OrchestratorStep = {
    key: 'first-goal',
    stage: 'toekomst',
    label: 'Eerste doel formuleren',
    description: 'Geeft je planning concrete richting en mijlpalen.',
    ctaHref: '/toekomst?tab=doelen',
    ctaLabel: 'Doelen openen',
    completed: hasGoals,
    unlocked: hasDob && hasAssets,
    dismissed: dismissedKeys.has('first-goal'),
  }

  // Step 4: briefing openen — pas zichtbaar na ≥ 7 dagen en wanneer
  //         step 1-3 voltooid zijn. Wordt nooit "completed" in de
  //         data-zin (we tracken niet of /will geopend is); volledig
  //         dismiss-afhankelijk.
  const briefing: OrchestratorStep = {
    key: 'open-briefing',
    stage: 'tips',
    label: 'Open je weekly briefing',
    description:
      'Op dag 7+ heeft Will genoeg data voor een eerste samenvatting met aandachtspunten.',
    ctaHref: '/will#briefing',
    ctaLabel: 'Briefing openen',
    completed: false,
    unlocked:
      hasDob &&
      hasAssets &&
      hasGoals &&
      accountAgeDays >= BRIEFING_NUDGE_MIN_DAYS,
    dismissed: dismissedKeys.has('open-briefing'),
  }

  return [dob, asset, goal, briefing]
}

function deriveStage(
  input: OrchestratorInput,
  completedCount: number,
): JourneyStage {
  if (!input.hasDob || !input.hasAssets) return 'registreren'
  if (!input.hasGoals) return 'toekomst'
  if (input.accountAgeDays < BRIEFING_NUDGE_MIN_DAYS) return 'inzicht'
  // Briefing-stap kan niet "completed" worden in de data-zin; dismissal
  // telt als "afgerond" voor de stage-derivering zodat de complete-state
  // bereikbaar is.
  const briefingResolved = input.dismissedKeys.has('open-briefing')
  if (completedCount >= 3 && briefingResolved) return 'complete'
  return 'tips'
}
