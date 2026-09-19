'use client'

import { useState, useEffect, useReducer, useCallback, useMemo, useRef } from 'react'
import './onboarding.css'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  DEFAULT_MODULE_COLORS,
  generateModuleColorVars,
  randomModuleColors,
  type ModuleColorConfig,
  type ModuleName,
} from '@/lib/color-palette'
import { FinDots } from '@/components/app/fin-dots'
import type { IdentityData } from '@/components/onboarding/onboarding-identity'
import type { HorizonData } from '@/lib/onboarding/horizon-draft'
import type { AssetQuickInput, DebtQuickInput } from '@/lib/quick-add/types'

import { OnboardingIdentity } from '@/components/onboarding/onboarding-identity'
import { OnboardingInkomen, parseBedragInput } from '@/components/onboarding/onboarding-inkomen'
import { OnboardingBezittingen } from '@/components/onboarding/onboarding-bezittingen'
import { OnboardingSchulden } from '@/components/onboarding/onboarding-schulden'
import {
  healSchuldenPhases,
  initialSchuldenPhases,
  initialSectionPhases,
  type SectionPhase,
} from '@/components/onboarding/section-phase'
import {
  OnboardingPensioen,
  INITIAL_PENSION_DRAFT,
  type PensionDraft,
} from '@/components/onboarding/onboarding-pensioen'
import { OnboardingEindstrategie } from '@/components/onboarding/onboarding-eindstrategie'
import {
  OnboardingUitgavenPensioen,
  INITIAL_RETIREMENT_EXPENSE,
  type RetirementExpenseState,
} from '@/components/onboarding/onboarding-uitgaven-pensioen'
import { OnboardingKlaar } from '@/components/onboarding/onboarding-klaar'
import { applyPensionParseResult } from '@/lib/pension/apply-parse-result'
import { formatAowAge, lookupAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import type { PensionParseResult } from '@/app/api/pension/parse/route'
import { computeOnboardingCompleteness } from '@/lib/onboarding-completeness'
import { computeCurrentAge } from '@/lib/persoonlijk-plan-assembly'
import {
  computeFreedomTicker,
  computeMonthlyFreedomBuildup,
  freedomTickerBasis,
} from '@/lib/freedom-ticker'
import {
  HOUSING_CHOICE_FALLBACK,
  housingChoiceToConfig,
  type HousingChoice,
} from '@/lib/housing-choice'
import { OnboardingFreedomTickerProvider } from '@/components/onboarding/freedom-ticker'
import { INITIAL_HORIZON_DATA } from '@/lib/onboarding/horizon-draft'
import { OnboardingSuccess } from '@/components/onboarding/onboarding-success'
import { OnboardingBudget } from '@/components/onboarding/onboarding-budget'
import { OnboardingBank } from '@/components/onboarding/onboarding-bank'
import {
  readOpenAfronding,
  type AfrondingVoortgang,
  type BankUitkomst,
} from '@/lib/onboarding/afronding'
import { WelcomePopup } from '@/components/onboarding/welcome-popup'
import { type ModuleId, ALL_MODULES } from '@/lib/module-registry'
import type { GoalSlug } from '@/lib/goals/types'
import { isGoalSlug } from '@/lib/goals/catalog'
import {
  serializeDraft,
  hasResumableDraft,
  firstIncompleteRequiredStep,
  type OnboardingDraft,
  type DeferredFieldKey,
  type EstimatedFieldKey,
} from './draft-persistence'
import {
  fetchDraft,
  clearDraft,
  clearLegacyLocalDraft,
  takeLegacyLocalDraft,
  createDraftWriter,
} from './draft-transport'
import {
  DRAFT_RESTORED_NOTICE,
  resolveNoticeDisplay,
  type OnboardingNotice,
} from './draft-notice-copy'

/**
 * Wachttijd voordat een gewijzigd concept naar de server gaat. Lang genoeg dat
 * doortypen in een bedragveld niet elke toetsaanslag een PUT kost, kort genoeg
 * dat een reload vlak na "Toevoegen" de post al bewaard aantreft.
 */
const DRAFT_PERSIST_DEBOUNCE_MS = 600

// ── localStorage key voor de "is de welkomstpopup al gezien?"-flag.
// Bewust een aparte key buiten het draft-payload: de flag moet ook
// overleven nadat de draft gewist is (bij voltooiing, of bij een
// nieuwe sessie die op een andere stap verder gaat dan stap 1). Een
// nieuwe gebruiker ziet 'm één keer; daarna nooit meer.
const WELCOME_SEEN_STORAGE_KEY = 'trifinity_onboarding_welcome_seen'

// ── Saving progress messages ─────────────────────────────────
const SAVING_MESSAGES = [
  'Profiel wordt opgeslagen...',
  'Budgetten worden aangemaakt...',
  'Bezittingen en schulden verwerken...',
  'Dashboard wordt geconfigureerd...',
  'Bijna klaar...',
]

// ── Types ────────────────────────────────────────────────────

/**
 * Active step union — begeleide één-vraag-tegelijk flow (Boldin-stijl, jun 2026).
 *
 * De grove 5-staps-iteratie is vervangen door micro-stappen, gegroepeerd per
 * onderwerp:
 *   · Profiel    → `naam`, `geboortedatum`
 *   · Inkomen    → `inkomen`, `uitgaven`     (spaarquote-preview op `uitgaven`)
 *   · Bezittingen→ `bezittingen`             (begeleide ja/nee-enumeratie)
 *   · Schulden   → `schulden`                (begeleide ja/nee + altijd-uitgang)
 *   · Pensioen   → `pensioen`                (schatting / upload / overslaan)
 *   · Klaar      → `klaar`
 * Plus de twee terminal-stappen `saving`/`success`.
 *
 * De ja/nee-loops binnen `bezittingen`/`schulden`/`pensioen` zijn zelf-bevattende
 * sub-machines in hun eigen component; de orchestrator ziet ze als één stap.
 * De voortgang loopt PER GROEP (zie `STEP_GROUP_INDEX`), niet per micro-vraag.
 *
 * Legacy step-namen (`identity`, `intro`, `goal`, `doel`, `nieuws_only`,
 * `budgets`, `horizon`, `spaardoel`) leven nog in `CANONICAL_STEP_ORDER`/
 * `LEGACY_STEP_MAP` zodat self-healing restore werkt op oude drafts.
 */
type Step =
  | 'naam'
  | 'geboortedatum'
  | 'inkomen'
  | 'uitgaven'
  | 'uitgaven_pensioen'
  | 'bezittingen'
  | 'schulden'
  | 'pensioen'
  | 'eindstrategie'
  | 'saving'
  // Afrondingsstappen ná de opslag: budget inrichten → bank koppelen →
  // samenvatting (`klaar`) → welkom. Bewust NIET in `computeStepOrder`: ze zijn
  // alleen bereikbaar vanuit een geslaagde opslag (of een hervatting daarvan),
  // nooit via vooruit/terug — terug naar een invulstap zou een tweede opslag
  // uitlokken die budgetten en cash-rekeningen wist. De opslag start daarom al
  // na `eindstrategie`, zodat "Begin met TriFinity" op de samenvatting de laatste
  // knop is (eigenaarskeuze 17 sep, ADR 0156). Zie lib/onboarding/afronding.ts.
  | 'budget'
  | 'bank'
  | 'klaar'
  | 'success'

type Direction = 'forward' | 'back'

/**
 * Voortgang per GROEP (1-indexed) i.p.v. per micro-vraag. De ja/nee-loops maken
 * het aantal vragen variabel, dus een "3/27" zou misleidend zijn — we tonen de
 * groep-index ("BEZITTINGEN" = 3/7). Meerdere micro-stappen in dezelfde groep
 * delen hetzelfde nummer.
 */
const STEP_GROUP_INDEX: Record<Step, number> = {
  naam: 1,
  geboortedatum: 1,
  inkomen: 2,
  uitgaven: 2,
  // Zelfde groep (2) als inkomen/uitgaven — geen extra groep-nummer, de
  // voortgangsbalk blijft 7 groepen. De prefill is afgeleid van de net-
  // ingevoerde maanduitgaven, dus onderwerpelijk hoort 'm hier.
  uitgaven_pensioen: 2,
  bezittingen: 3,
  schulden: 4,
  pensioen: 5,
  // Eigen groep (6): de eindstrategie-keuze is een aparte, laatste inhoudelijke
  // vraag (FIRE vs. pensioen). De spaardoel-stap die hiertussen stond is op
  // 19 sep 2026 geschrapt (ADR 0162); doelen leven op /toekomst/doelen.
  eindstrategie: 6,
  // Groep 7 "Je budget": opslaan, budget inrichten, bank koppelen.
  saving: 7,
  budget: 7,
  bank: 7,
  // Groep 8: de samenvatting met "Begin met TriFinity", daarna het welkomscherm.
  klaar: 8,
  success: 8,
}
const TOTAL_GROUPS = 8

/**
 * Canonical order of every step that has ever existed in the flow, used as a
 * fallback anchor when a restored `lastStep` is no longer present in the
 * active step order. Bevat zowel de legacy step-namen als de nieuwe micro-
 * stappen — drafts uit een oudere flow blijven herstelbaar.
 */
const CANONICAL_STEP_ORDER: readonly string[] = [
  // legacy → nieuw vervangers
  'intro',         // → naam (legacy)
  'doel',          // → naam (verwijderd jun 2026)
  'identity',      // → naam (gesplitst jun 2026)
  'goal',          // → naam (legacy)
  'ai_keuze',      // sep 2026 AI-toestemming vóór de eerste vraag (ADR 0155); verwijderd door ADR 0157 → heelt naar `naam`
  'naam',
  'geboortedatum',
  'inkomen',
  'uitgaven',
  'uitgaven_pensioen', // toegevoegd jun 2026 — expliciete pensioenuitgave-prefill
  'bezittingen',
  'schulden',
  'pensioen',
  'spaardoel',     // mei 2026 – sep 2026 (ADR 0162) — laagdrempelige spaardoel-keuze; heelt naar eindstrategie
  'eindstrategie', // toegevoegd jul 2026 — FIRE vs. pensioen als laatste vraag
  'budgets',       // → eindstrategie (legacy)
  'horizon',       // → eindstrategie (legacy)
  'nieuws_only',   // → naam (verwijderd jun 2026, samen met de doel-stap)
  'saving',
  'budget',        // toegevoegd sep 2026 — afrondingsstap ná de opslag (niet herstelbaar uit een draft)
  'bank',          // idem
  'klaar',         // sinds 17 sep 2026 ná de opslag; een draft op 'klaar' heelt naar eindstrategie
  'success',
] as const

/**
 * Map a legacy lastStep name to the closest current equivalent. Wordt door
 * `_resolveRestoredStep` toegepast vóór de membership-check zodat een draft
 * die opgeslagen is met een verwijderde/hernoemde step-naam alsnog landt op
 * een bestaande stap zonder dat we 'm naar het begin terug hoeven te zetten.
 */
const LEGACY_STEP_MAP: Record<string, Step> = {
  // pre-mei 2026 step-namen
  modules: 'naam',
  persona: 'naam',
  intent: 'naam',
  extras: 'bezittingen',
  preferences: 'eindstrategie',
  // fase 3 (mei 2026): intro/goal/budgets/horizon zijn niet meer actief
  intro: 'naam',
  // sep 2026: de AI-keuze stond kort vóór `naam` (ADR 0155). Sinds ADR 0157
  // vraagt de app hem pas bij het eerste AI-gebruik; een concept dat nog op
  // deze stap stond landt gewoon op de eerste vraag.
  ai_keuze: 'naam',
  goal: 'naam',
  budgets: 'eindstrategie',
  horizon: 'eindstrategie',
  // sep 2026: de samenvatting staat ná de opslag. Een concept dat op 'klaar'
  // stond is nog niet opgeslagen → terug naar de laatste vraag vóór de opslag.
  klaar: 'eindstrategie',
  // 19 sep 2026 (ADR 0162): de spaardoel-stap is geschrapt. Een concept dat
  // daar stond gaat door naar de eerstvolgende vraag; de gekozen preset in het
  // concept wordt genegeerd (de stap schreef pas bij de eind-save).
  spaardoel: 'eindstrategie',
  // jun 2026: doel-stap ("Waar help ik je mee?") + news-only-pad verwijderd
  doel: 'naam',
  nieuws_only: 'naam',
  // jun 2026 (deze wijziging): identity gesplitst in naam + geboortedatum,
  // inkomen gesplitst in inkomen + uitgaven. Een draft op de oude
  // gecombineerde stappen heelt naar de eerste micro-stap ervan.
  identity: 'naam',
}

/**
 * Self-healing restore: given a previously saved `lastStep` and the currently
 * active step order, return a step the user can actually land on. When the
 * saved step is no longer present in the active order (e.g. the flow changed
 * while the user had a draft in localStorage), we anchor on the saved step's
 * position in the canonical union and walk forward to the first valid step
 * the user has not yet passed, skipping the terminal `saving` / `success`
 * placeholders. As a last resort we fall back to `'identity'` — never the
 * eerste stap, because the presence of saved data means the user is already
 * past the welcome screen.
 */
export function _resolveRestoredStep(lastStep: string | undefined, activeStepOrder: Step[]): {
  step: Step
  healed: boolean
} {
  const terminalSteps: Step[] = ['saving', 'budget', 'bank', 'klaar', 'success']
  const isSelectable = (s: Step): boolean => !terminalSteps.includes(s)

  // No saved step at all → start at naam (de eerste content-stap).
  if (!lastStep) {
    return { step: 'naam', healed: false }
  }

  // Map legacy step names to their current equivalents before checking
  // membership in the active order.
  let resolved = lastStep
  if (LEGACY_STEP_MAP[resolved]) resolved = LEGACY_STEP_MAP[resolved]

  // Happy path: saved step is still in the active order and not terminal.
  if (
    (activeStepOrder as string[]).includes(resolved) &&
    isSelectable(resolved as Step)
  ) {
    // Een mapping naar een andere step (bv. budgets → klaar) telt nog steeds
    // als healed — de user kreeg een andere step terug dan opgeslagen was.
    const healed = resolved !== lastStep
    return { step: resolved as Step, healed }
  }

  // Anchor on the saved step's position in the canonical union. If the name
  // is completely unknown the index is -1 and we fall through to identity.
  const canonicalIdx = CANONICAL_STEP_ORDER.indexOf(resolved)

  if (canonicalIdx >= 0) {
    // Walk forward through the active order and take the first selectable
    // step whose canonical position is >= the saved step's canonical
    // position. This lands us on the first step the user has not yet passed.
    for (const candidate of activeStepOrder) {
      if (!isSelectable(candidate)) continue
      const candidateIdx = CANONICAL_STEP_ORDER.indexOf(candidate)
      if (candidateIdx >= canonicalIdx) {
        return { step: candidate, healed: true }
      }
    }
  }

  // Last resort: `naam` (de eerste content-stap) if it's in the active order,
  // otherwise the first selectable step.
  const naamFallback = activeStepOrder.find((s) => s === 'naam')
  if (naamFallback) {
    return { step: 'naam', healed: true }
  }
  const firstSelectable = activeStepOrder.find(isSelectable)
  return { step: firstSelectable ?? 'naam', healed: true }
}

/**
 * Pick a safe navigation landing spot when the user's current step is not in
 * the active step order. Skips terminal `saving` / `success` placeholders.
 * Used by `goToNext` / `goToBack` as a self-healing fallback so the
 * navigation buttons never silently no-op.
 */
export function _firstNavigationRecoveryStep(activeStepOrder: Step[]): Step {
  const recovery = activeStepOrder.find(
    (s) => s !== 'saving' && s !== 'success'
  )
  return recovery ?? activeStepOrder[0] ?? 'naam'
}

/**
 * Compute the step order. Sinds jun 2026 statisch: de doel-stap en het
 * news-only-pad zijn verwijderd, alle 5 content-stappen zijn altijd actief.
 * Module-gating gebeurt buiten onboarding (abonnement + user-toggles op
 * /mijn) — alle modules staan na onboarding default aan.
 */
function computeStepOrder(): Step[] {
  return [
    'naam',
    'geboortedatum',
    'inkomen',
    'uitgaven',
    'uitgaven_pensioen',
    'bezittingen',
    'schulden',
    'pensioen',
    'eindstrategie',
    // Na de laatste vraag meteen opslaan: `goToNext` ziet 'saving' en start
    // `handleSaveOwnData`. Budget, bank en de samenvatting (`klaar`) volgen
    // daarna buiten deze volgorde — zie het `Step`-type.
    'saving',
    'success',
  ]
}

interface State {
  step: Step
  direction: Direction
  identity: IdentityData
  /**
   * Restant van de verwijderde doel-stap (jun 2026). Nieuwe gebruikers
   * kiezen geen doelen meer; het veld blijft bestaan zodat restored drafts
   * hun eerdere keuze behouden (server slaat 'm op als `selected_goal_slugs`).
   */
  selectedGoals: GoalSlug[]
  /** Sinds jun 2026 altijd `ALL_MODULES` — modules staan default aan. */
  activeModules: ModuleId[]
  horizon: HorizonData
  budgetAmounts: Record<string, number>
  quickAssets: AssetQuickInput[]
  quickDebts: DebtQuickInput[]
  /**
   * Gelifte interne fase-stack van de Bezittingen/Schulden-sub-machines. Leeft
   * in de orchestrator (naast quickAssets/quickDebts) zodat 'ie een remount van
   * de sectie overleeft — Terug uit een latere groep landt zo op het laatst
   * getoonde scherm (bv. het review-overzicht) i.p.v. op vraag 1. Bewust NIET
   * gepersisteerd naar localStorage: de fase hangt aan de (niet-herstelde)
   * gevoelige posten, dus na een draft-restore start 'ie weer op vraag 1.
   */
  bezittingenPhases: SectionPhase[]
  schuldenPhases: SectionPhase[]
  /**
   * Uitgaven-na-pensioen-keuze (groep 2, ná uitgaven). Maakt de impliciete
   * 80%-server-default expliciet. Skipped → niets meesturen, server-default wint.
   */
  retirementExpense: RetirementExpenseState
  /**
   * Pensioen-keuze (schatting / upload / overslaan). De daadwerkelijke
   * `life_events`-write gebeurt bij de eind-save via `applyPensionParseResult`,
   * los van het save-own-data POST-contract.
   */
  pension: PensionDraft
  /**
   * Velden die de gebruiker expliciet heeft overgeslagen via "Later invullen"
   * (feature #830). Na onboarding worden ze als suggesties aangeboden via de
   * coach-bubble of het next-step-mechanisme.
   */
  deferredFields: DeferredFieldKey[]
  /**
   * Velden waarvan de APP het bedrag heeft geraden via "Schat het voor me"
   * (UR3-05). Parallel aan `deferredFields`, maar de tegenovergestelde
   * uitkomst: daar staat een leeg veld, hier een gevuld veld met een
   * voorbehoud. Reist mee naar `save-own-data`, dat er
   * `income_source`/`expenses_source = 'estimate'` van maakt — een placeholder,
   * geen keuze (ADR 0131), dus echte data verdringt 'm vanzelf.
   */
  estimatedFields: EstimatedFieldKey[]
  /**
   * De woning-keuze uit stap iii-a (ADR 0133): telt de eigen woning mee voor de
   * vrijheid, of niet. `null` zolang de vraag niet gesteld is — en dat blijft zo
   * voor iedereen zonder eigen woning. De keuze reist mee in het concept en in
   * de save-body; de terugval bij afwezigheid staat in de save-route, niet hier.
   */
  housingChoice: HousingChoice | null
}

type Action =
  | { type: 'SET_STEP'; step: Step }
  | { type: 'SET_IDENTITY'; data: IdentityData }
  | { type: 'SET_HORIZON'; data: HorizonData }
  | { type: 'SET_BUDGET_AMOUNTS'; amounts: Record<string, number> }
  | { type: 'SET_QUICK_ASSETS'; items: AssetQuickInput[] }
  | { type: 'SET_QUICK_DEBTS'; items: DebtQuickInput[] }
  /** Vervang de gelifte fase-stack van de Bezittingen-sub-machine. */
  | { type: 'SET_BEZITTINGEN_PHASES'; phases: SectionPhase[] }
  /** Vervang de gelifte fase-stack van de Schulden-sub-machine. */
  | { type: 'SET_SCHULDEN_PHASES'; phases: SectionPhase[] }
  /** Vervang de complete uitgaven-na-pensioen-substate per dispatch. */
  | { type: 'SET_RETIREMENT_EXPENSE'; data: RetirementExpenseState }
  /** Vervang de complete pensioen-substate per dispatch (child levert de volledige shape). */
  | { type: 'SET_PENSION'; data: PensionDraft }
  /**
   * Track een overgeslagen veld via "Later invullen" (feature #830).
   * Idempotent: voegt de key alleen toe als hij er nog niet in zit.
   */
  | { type: 'DEFER_FIELD'; key: DeferredFieldKey }
  /**
   * Zet of haal de app-schatting-markering op één veld (UR3-05). `false` komt
   * van elke toetsaanslag in dat veld: typen is per definitie een eigen bedrag.
   */
  | { type: 'SET_FIELD_ESTIMATED'; key: EstimatedFieldKey; value: boolean }
  /**
   * Zet of wis de woning-keuze (ADR 0133). `null` = wissen — de bezittingen-
   * sectie stuurt dat zodra de laatste eigen woning uit de lijst verdwijnt.
   */
  | { type: 'SET_HOUSING_CHOICE'; choice: HousingChoice | null }
  | { type: 'RESTORE_STATE'; data: OnboardingDraft }

export const _initialState: State = {
  step: 'naam',
  direction: 'forward',
  selectedGoals: [],
  activeModules: [...ALL_MODULES],
  identity: {
    full_name: '',
    date_of_birth: '',
    household_type: 'solo',
    number_of_children: 0,
    net_monthly_income: '',
    estimated_yearly_income: '',
    estimated_monthly_expenses: '',
  },
  horizon: INITIAL_HORIZON_DATA,
  budgetAmounts: {},
  quickAssets: [],
  quickDebts: [],
  bezittingenPhases: initialSectionPhases(),
  // Raster-first (B-054): de schulden-sectie begint op het aanvinkraster.
  schuldenPhases: initialSchuldenPhases(),
  retirementExpense: INITIAL_RETIREMENT_EXPENSE,
  pension: INITIAL_PENSION_DRAFT,
  deferredFields: [],
  estimatedFields: [],
  housingChoice: null,
}

export function _reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_STEP': {
      const stepOrder = computeStepOrder()
      const oldIdx = stepOrder.indexOf(state.step)
      const newIdx = stepOrder.indexOf(action.step)
      const direction: Direction = newIdx >= oldIdx ? 'forward' : 'back'
      return { ...state, step: action.step, direction }
    }
    case 'SET_IDENTITY':
      return { ...state, identity: action.data }
    case 'SET_HORIZON':
      return { ...state, horizon: action.data }
    case 'SET_BUDGET_AMOUNTS':
      return { ...state, budgetAmounts: action.amounts }
    case 'SET_QUICK_ASSETS':
      return { ...state, quickAssets: action.items }
    case 'SET_QUICK_DEBTS':
      return { ...state, quickDebts: action.items }
    case 'SET_BEZITTINGEN_PHASES':
      return { ...state, bezittingenPhases: action.phases }
    case 'SET_SCHULDEN_PHASES':
      return { ...state, schuldenPhases: action.phases }
    case 'SET_RETIREMENT_EXPENSE':
      return { ...state, retirementExpense: action.data }
    case 'SET_PENSION':
      return { ...state, pension: action.data }
    case 'DEFER_FIELD': {
      // Idempotent: voeg alleen toe als de key er nog niet in zit.
      if (state.deferredFields.includes(action.key)) return state
      return { ...state, deferredFields: [...state.deferredFields, action.key] }
    }
    case 'SET_FIELD_ESTIMATED': {
      const has = state.estimatedFields.includes(action.key)
      if (action.value === has) return state
      return {
        ...state,
        estimatedFields: action.value
          ? [...state.estimatedFields, action.key]
          : state.estimatedFields.filter((k) => k !== action.key),
      }
    }
    case 'SET_HOUSING_CHOICE':
      if (state.housingChoice === action.choice) return state
      return { ...state, housingChoice: action.choice }
    case 'RESTORE_STATE': {
      const { step: restoredStep, healed } = _resolveRestoredStep(
        action.data.lastStep,
        computeStepOrder()
      )
      if (healed) {
        // Surface self-healing restores in logs so we can monitor how often
        // legacy drafts are encountered after flow changes.
        console.warn(
          `[onboarding] lastStep ${action.data.lastStep ?? '(none)'} not in active order, falling back to ${restoredStep}`
        )
      }
      // Het concept staat sinds aug 2026 server-side op de eigen profielrij
      // (kaart UR2-01), dus ALLE antwoorden komen terug — naam, bedragen,
      // bezittingen, schulden. Enige uitzondering: `pension.parseResult`, het
      // geparste pensioenoverzicht, dat per ADR 0115 het toestel niet verlaat
      // en dus opnieuw ingelezen wordt. De finish-guard
      // (`firstIncompleteRequiredStep`) blijft de eind-save bewaken voor
      // concepten waarin de naam alsnog ontbreekt (oud v1-concept, of "later
      // invullen").
      const restoredGoals = action.data.selectedGoals.filter(isGoalSlug)
      // Een lege fase-stack (oud v1-concept, of een sectie waar de gebruiker
      // nog niet was) zou de sub-machine zonder scherm laten — val dan terug
      // op de beginstack.
      const restoredBezittingenPhases =
        action.data.bezittingenPhases.length > 0
          ? action.data.bezittingenPhases
          : initialSectionPhases()
      // Een schulden-stack van vóór raster-first (op `ask`/`more`) heelt naar
      // het raster; leeg → beginstack (`healSchuldenPhases` doet beide).
      const restoredSchuldenPhases = healSchuldenPhases(action.data.schuldenPhases)
      return {
        ...state,
        step: restoredStep,
        direction: 'forward',
        identity: { ...action.data.identity },
        selectedGoals: restoredGoals,
        // Sinds jun 2026 kiest de gebruiker geen modules meer in onboarding —
        // alles staat default aan.
        activeModules: [...ALL_MODULES],
        horizon: { ...action.data.horizon },
        budgetAmounts: { ...action.data.budgetAmounts },
        quickAssets: action.data.quickAssets.map((a) => ({ ...a })),
        quickDebts: action.data.quickDebts.map((d) => ({ ...d })),
        bezittingenPhases: restoredBezittingenPhases,
        schuldenPhases: restoredSchuldenPhases,
        retirementExpense: { ...action.data.retirementExpense },
        // Het gekozen pad + de handmatige schatting terug; `parseResult` blijft
        // leeg (ADR 0115 — het overzicht blijft op het toestel).
        pension: {
          ..._initialState.pension,
          mode: action.data.pension.mode,
          grossMonthly: action.data.pension.grossMonthly,
          startAge: action.data.pension.startAge,
          isEstimate: action.data.pension.isEstimate === true,
        },
        deferredFields: [...action.data.deferredFields],
        // Zelf-helend voor oude concepten: zonder deze sleutel leest een
        // hersteld bedrag als een EIGEN bedrag. Dat is de veilige kant — een
        // ontbrekend voorbehoud op iets dat de gebruiker toch al zelf typte
        // weegt lichter dan een voorbehoud op een bedrag dat hij wél koos.
        estimatedFields: [...(action.data.estimatedFields ?? [])],
        // Woning-keuze (ADR 0133): een concept van vóór deze stap draagt de
        // sleutel niet en herstelt als `null` — "nog niet beantwoord". Nooit
        // 'exclude' afleiden uit afwezigheid; `sanitizeStoredDraft` bewaakt dat
        // aan de leeskant, dit is de spiegel ervan.
        housingChoice: action.data.housingChoice ?? null,
      }
    }
    default:
      return state
  }
}

// ── Step transition wrapper ──────────────────────────────

function StepTransition({ direction, children }: {
  direction: Direction
  children: React.ReactNode
}) {
  return (
    <div className={direction === 'forward' ? 'step-enter-forward' : 'step-enter-back'}>
      {children}
    </div>
  )
}

// ── Concept: lezen bij binnenkomst ───────────────────────────

/**
 * Haal het te hervatten concept op. Eerst de server (`/api/onboarding/draft`);
 * is daar niets, dan éénmalig het achtergebleven localStorage-concept van vóór
 * aug 2026 — dat draagt alleen stap-positie en keuzes, maar zet iemand die
 * middenin zat wel op de juiste plek terug. De legacy-sleutel wordt daarbij
 * hoe dan ook gewist.
 */
async function loadResumableDraft(): Promise<OnboardingDraft | null> {
  const serverDraft = await fetchDraft()
  if (serverDraft) {
    clearLegacyLocalDraft()
    return serverDraft
  }
  return takeLegacyLocalDraft()
}

/**
 * Zet de pensioen-keuze van de pensioen-stap om naar een `PensionParseResult`
 * — exact het contract dat `applyPensionParseResult` (life_events) consumeert,
 * zodat schatting én upload via één deterministisch pad lopen.
 *
 * - `upload` → het reeds geparste resultaat (mijnpensioen JSON / AI-PDF).
 * - `estimate` → één synthetische ouderdomspensioen-regeling uit het bruto
 *   maandbedrag (+ optionele ingangsleeftijd; leeg = `fallbackAge` — de
 *   AOW-leeftijd van de gebruiker, default 67 — geklemd 50–75).
 * - Niets ingevuld / overgeslagen → `null` (geen write).
 */
export function buildPensionParseResult(
  p: PensionDraft,
  fallbackAge: number = 67,
): PensionParseResult | null {
  if (p.mode === 'upload' && p.parseResult) return p.parseResult
  if (p.mode === 'estimate') {
    const gross = parseBedragInput(p.grossMonthly)
    if (!isFinite(gross) || gross <= 0) return null
    // Fallback zelf ook klemmen op 50–75 zodat een gekke aanroep nooit een
    // onmogelijke ingangsleeftijd in life_events schrijft.
    const safeFallback =
      isFinite(fallbackAge) && fallbackAge >= 50 && fallbackAge <= 75
        ? Math.round(fallbackAge)
        : 67
    const parsedAge = p.startAge ? parseInt(p.startAge, 10) : NaN
    const ingangLeeftijd =
      isFinite(parsedAge) && parsedAge >= 50 && parsedAge <= 75
        ? parsedAge
        : safeFallback
    return {
      aowBedrag: null,
      regelingen: [
        {
          fondsNaam: 'Geschat pensioen',
          brutoBedrag: Math.round(gross),
          ingangLeeftijd,
          isGeindexeerd: false,
          type: 'ouderdomspensioen',
        },
      ],
      nabestaandenpensioen: null,
      samenvatting: 'Handmatige schatting in onboarding',
    }
  }
  return null
}

// ── Module-tint wrapper-style ───────────────────────────────
// De stappen-componenten consumeren --module-active-* tokens voor de
// kicker-streep, de italic-em in de kop, de deck-rand en de voortgangsbalk.
// Tot 17 sep 2026 stond dat vast op `kern`; sindsdien krijgt elke stapgroep
// het accent van de hefboom waar de vraag OVER gaat (zie STEP_ACCENT). Eén
// wissel van deze elf vars kleurt daarmee het hele scherm mee — de kleur zegt
// dus iets ("dit gaat over je schulden"), hij is geen versiering.
const MODULE_ACTIVE_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const

function moduleActiveVars(module: ModuleName): React.CSSProperties {
  const vars: Record<string, string> = {}
  for (const shade of MODULE_ACTIVE_SHADES) {
    vars[`--module-active-${shade}`] = `var(--color-${module}-${shade})`
  }
  return vars as React.CSSProperties
}

/**
 * Welk accent hoort bij welke stapgroep. Bewust ONDERWERPELIJK toegewezen en
 * niet simpelweg roterend: de vier accenten zijn op /mijn/uiterlijk gelabeld
 * als Bezittingen · Schulden · Budget · Fin, dus een vraag over schulden hoort
 * in het schulden-accent te staan. Wie de onboarding doorloopt, leert de
 * kleurtaal van de app al doende.
 *
 * Groep 1 (naam/geboortedatum) en de eindstrategie krijgen Fins eigen accent —
 * dat zijn de momenten waarop de app zelf aan het woord is, niet een hefboom.
 */
const STEP_ACCENT: Record<Step, ModuleName> = {
  naam: 'fin',
  geboortedatum: 'fin',
  inkomen: 'horizon',
  uitgaven: 'horizon',
  uitgaven_pensioen: 'horizon',
  bezittingen: 'kern',
  schulden: 'wil',
  pensioen: 'kern',
  eindstrategie: 'fin',
  saving: 'horizon',
  budget: 'horizon',
  bank: 'kern',
  klaar: 'kern',
  success: 'kern',
}

// ── Main Component ───────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [state, dispatch] = useReducer(_reducer, _initialState)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const idempotencyKeyRef = useRef<string | null>(null)
  // User-id wordt in het check-effect gezet (na getUser) en bij de eind-save
  // gebruikt voor de auth.uid()-gescopede pensioen-write (life_events).
  const userIdRef = useRef<string | null>(null)
  const [saveProgress, setSaveProgress] = useState(0)
  const [saveMessageIdx, setSaveMessageIdx] = useState(0)
  /**
   * De melding bovenaan de onboarding. Draagt zijn OORZAAK mee: een ontbrekend
   * verplicht antwoord is iets anders dan een mislukte opslag, en verdient
   * andere copy (geen "ververs de pagina niet", geen "Opnieuw proberen").
   * Zolang dit één losse string was, kreeg het validatiepad de opslag-copy en
   * bleef zijn eigen, specifieke boodschap onzichtbaar.
   */
  const [saveError, setSaveError] = useState<OnboardingNotice | null>(null)
  const [restoredNotice, setRestoredNotice] = useState(false)
  // Poort voor het persisteer-effect. Het check-effect hieronder leest het
  // localStorage-draft pas ná een `await` (getUser + profielquery); zonder
  // deze poort zou het persisteer-effect al in dezelfde mount-commit het
  // verse, lege begin-draft over het bestaande draft heen schrijven — de
  // hervat-voortgang was daarmee weg vóórdat de restore-poging 'm kon lezen
  // (WF-START-23). Blijft dus `false` tot de restore-poging is afgerond.
  const [restoreChecked, setRestoreChecked] = useState(false)
  // Schrijver van het concept — één instantie per mount, zodat de interne
  // wachtrij de PUT's in volgorde houdt (zie createDraftWriter). Lazy init in
  // een ref: `useMemo` geeft geen identiteitsgarantie, en een tweede schrijver
  // zou precies de volgorde-garantie opheffen waar hij voor bestaat.
  const draftWriterRef = useRef<ReturnType<typeof createDraftWriter> | null>(null)
  if (draftWriterRef.current === null) draftWriterRef.current = createDraftWriter()
  const draftWriter = draftWriterRef.current

  // PSD2 bank connect return state — detected via query params from callback redirect.
  // Uses useState instead of useSearchParams to avoid Suspense boundary requirement.
  const [bankConnected, setBankConnected] = useState(false)
  const [bankError, setBankError] = useState(false)
  /** Netto maandinkomen voor de budgetstap: uit de opslag, of uit het profiel bij hervatten. */
  const [afrondingIncome, setAfrondingIncome] = useState(0)
  /** Zijn de antwoorden van deze sessie nog in state (dus is de samenvatting zinvol)? */
  const recapAvailableRef = useRef(false)
  // Welkomstpopup: alleen tonen bij eerste binnenkomst, niet bij restored-draft
  // (de gebruiker is dan al terug-bezig en de begroeting voelt op dat moment
  // als ruis). De show-beslissing wordt in de check-effect onderaan genomen
  // — initial false zodat SSR en eerste paint geen popup tonen.
  const [showWelcomePopup, setShowWelcomePopup] = useState(false)

  /**
   * De vier accentkleuren van deze gebruiker. Een nieuwe gebruiker krijgt ze
   * WILLEKEURIG toebedeeld bij binnenkomst (`randomModuleColors`) in plaats van
   * voor iedereen dezelfde standaardset: de app is van jou, en dat is vanaf het
   * eerste scherm te zien. Ze worden meteen via `PUT /api/appearance` op de
   * eigen profielrij gezet, zodat de rest van de app dezelfde vier tinten
   * gebruikt — en op /mijn/uiterlijk blijft alles vrij te wijzigen.
   *
   * Tot de profielquery terug is staat hier de standaardset: het onboarding-
   * scherm mag niet eerst in de defaults verschijnen en dan zichtbaar
   * omklappen, dus we renderen pas ná `loading`.
   */
  const [moduleColors, setModuleColors] = useState<ModuleColorConfig>(DEFAULT_MODULE_COLORS)

  // AOW-leeftijd-referentierijen voor de pensioenstap (inschat-hulp: verwachte
  // ingangsleeftijd = AOW-leeftijd). Zelfde bron als save-own-data server-side
  // (`aow_leeftijd`); publieke referentietabel, geen gebruikersdata — dit
  // bestand staat als geheel op de datapad-allowlist. Leeg = fallback
  // NL_AOW_AGE in de component.
  const [aowRows, setAowRows] = useState<AowLeeftijdRow[]>([])

  const activeStepOrder = useMemo(() => computeStepOrder(), [])

  // Voortgang PER GROEP (niet per micro-vraag): de ja/nee-loops in
  // bezittingen/schulden/pensioen maken het aantal vragen variabel, dus we
  // tonen de groep-index ("BEZITTINGEN" = 3/7) i.p.v. een misleidende "3/27".
  const totalContentSteps = TOTAL_GROUPS
  const currentContentStep = useMemo(
    () => STEP_GROUP_INDEX[state.step] ?? 1,
    [state.step],
  )

  const goToBack = useCallback(() => {
    const idx = activeStepOrder.indexOf(state.step)
    if (idx === -1) {
      // Same self-heal path as goToNext — keep the user moving instead of
      // silently dead-ending on an orphaned step.
      const fallback = _firstNavigationRecoveryStep(activeStepOrder)
      console.warn(
        `[onboarding] goToBack: step ${state.step} not in active order, falling back to ${fallback}`
      )
      dispatch({ type: 'SET_STEP', step: fallback })
      return
    }
    if (idx > 0) {
      dispatch({ type: 'SET_STEP', step: activeStepOrder[idx - 1] })
    }
  }, [activeStepOrder, state.step])

  // Check if already onboarded + restore from localStorage
  useEffect(() => {
    async function check() {
      // NB: de twee vroege returns hieronder laten `restoreChecked` bewust op
      // `false` staan. Beide navigeren wég van deze pagina, en in beide
      // gevallen zou het openzetten van de poort schadelijk zijn: bij
      // `!user` persisteren we onboarding-voortgang voor een niet-ingelogde
      // bezoeker, en bij `onboarding_completed` zou het persisteer-effect het
      // draft dat we net met `clearLocalStorage()` wisten meteen opnieuw
      // aanmaken. De poort dicht laten is daar de correcte eindtoestand.
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/login'
        return
      }
      userIdRef.current = user.id

      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed, module_guide_state, net_monthly_income, module_colors')
        .eq('id', user.id)
        .single()

      // ── Accentkleuren: hergebruiken wat er staat, anders vier trekken ──
      // Eigen-rij preference, dus toegestaan als client-direct read (CLAUDE.md,
      // datapad-conventie); het schrijven loopt via de bestaande
      // /api/appearance-route, niet via een eigen insert.
      const opgeslagenKleuren = profile?.module_colors as Partial<ModuleColorConfig> | null
      // Bewust "staat er ÉÉN kleur?" en niet "staan alle vier?": bij een
      // onvolledige rij (technisch schrijfbaar via een directe PUT) zou een
      // alles-of-niets-check de bestaande keuzes overschrijven met een verse
      // trekking. Een ontbrekende sleutel valt hieronder terug op de default —
      // hetzelfde per-sleutel-patroon dat app/(app)/layout.tsx al gebruikt.
      const heeftKleuren = Boolean(
        opgeslagenKleuren?.kern ||
          opgeslagenKleuren?.wil ||
          opgeslagenKleuren?.horizon ||
          opgeslagenKleuren?.fin,
      )
      if (heeftKleuren) {
        setModuleColors({ ...DEFAULT_MODULE_COLORS, ...opgeslagenKleuren })
      } else if (!profile?.onboarding_completed) {
        // Alleen voor wie de onboarding nog niet af heeft: een bestaande
        // gebruiker die hier langskomt (openstaande afrondingsstap, of een
        // redirect) mag niet ineens een andere app-kleur krijgen.
        const getrokken = randomModuleColors()
        setModuleColors(getrokken)
        // Best-effort: mislukt de opslag (offline, 500), dan blijft de
        // onboarding gewoon in deze kleuren staan en valt de rest van de app
        // terug op de standaardset. Geen melding — de gebruiker heeft hier
        // niets om op te lossen, en een kleurkeuze is geen kritiek pad.
        void fetch('/api/appearance', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ module_colors: getrokken }),
        }).catch(() => {})
      }

      if (profile?.onboarding_completed) {
        clearLegacyLocalDraft()
        // Wissen vóór de redirect: een concept van een al voltooide onboarding
        // is dode, gevoelige data op de profielrij.
        await clearDraft()

        // Opgeslagen, maar de afrondingsstappen (budget → bank) staan nog open:
        // hervatten i.p.v. naar home. Dekt zowel de terugkeer van de bank in
        // hetzelfde tabblad (?bank_connected / ?bank_error) als iemand die de app
        // halverwege sloot. `restoreChecked` blijft dicht: na de opslag wordt er
        // geen concept meer bewaard.
        const openStap = readOpenAfronding(profile.module_guide_state)
        if (openStap) {
          const params = new URLSearchParams(window.location.search)
          const bankTerug = params.get('bank_connected') === '1' || params.get('bank_error') === '1'
          setAfrondingIncome(Number(profile.net_monthly_income) || 0)
          if (bankTerug) {
            setBankConnected(params.get('bank_connected') === '1')
            setBankError(params.get('bank_error') === '1')
          }
          // Staat er al een plan terwijl de markering nog op `budget` staat (het
          // doorschuiven na opslaan mislukte), dan laat de server hem door naar
          // `bank` — een tweede opslag zou op de unieke slug-index botsen.
          let hervatStap = openStap
          if (!bankTerug && openStap === 'budget') {
            try {
              const res = await fetch('/api/onboarding/afronding', { cache: 'no-store' })
              const body = res.ok ? ((await res.json()) as { stap?: string | null }) : null
              if (body?.stap === 'bank') hervatStap = 'bank'
            } catch {
              // Best-effort: zonder antwoord hervatten we gewoon op de budgetstap.
            }
          }
          dispatch({ type: 'SET_STEP', step: bankTerug ? 'bank' : hervatStap })
          // Wel de laadspinner weghalen — anders blijft de hervatting hangen.
          setLoading(false)
          return
        }

        // /dashboard = "ga naar home": de middleware vertaalt naar het gekozen
        // homescherm (profiles.home_screen).
        router.replace('/dashboard')
        return
      }

      // AOW-leeftijd-referentie voor de pensioenstap — best-effort: bij een
      // fout of lege tabel valt de component terug op NL_AOW_AGE (67).
      // NB de Supabase-client throwt niet bij een query-fout; expliciet
      // loggen, anders wordt een tabel-/RLS-regressie hier stil geslikt
      // (het bug-mechanisme waar aow-surface-consistency.test.ts voor waakt).
      try {
        const { data: rows, error: aowErr } = await supabase
          .from('aow_leeftijd')
          .select('id, birth_date_from, birth_date_through, aow_years, aow_months, is_definitive, source')
          .order('birth_date_from', { ascending: true })
        if (aowErr) {
          console.warn('[onboarding] aow_leeftijd read faalde:', aowErr.code, aowErr.message)
        } else if (rows && rows.length > 0) {
          setAowRows(rows as AowLeeftijdRow[])
        }
      } catch {
        // netwerkfout — fallback op NL_AOW_AGE
      }

      // Haal het lopende concept op. Sinds aug 2026 (kaart UR2-01) staat dat
      // server-side op de eigen profielrij en bevat het ALLE antwoorden, dus
      // een reload wist niets meer. `hasResumableDraft` bepaalt of er iets
      // zinvols te hervatten valt.
      const saved = await loadResumableDraft()
      const hasRestoredDraft = hasResumableDraft(saved)
      if (hasRestoredDraft && saved) {
        dispatch({ type: 'RESTORE_STATE', data: saved })
        setRestoredNotice(true)
        // Auto-dismiss. De melding bevestigt dat de antwoorden terug zijn en
        // noemt het ene veld dat dat niet is (het pensioenoverzicht) — één
        // zin meer dan een vinkje, dus langer dan de oude 4s laten staan.
        setTimeout(() => setRestoredNotice(false), 9000)
      }

      // PSD2 bank connect return: force step to bezittingen so the user sees
      // the success/error message inline. The bank_connected/bank_error params
      // come from the callback redirect after OAuth completion.
      const urlParams = new URLSearchParams(window.location.search)
      const isBankConnected = urlParams.get('bank_connected') === '1'
      const isBankError = urlParams.get('bank_error') === '1'
      if (isBankConnected || isBankError) {
        setBankConnected(isBankConnected)
        setBankError(isBankError)
        dispatch({ type: 'SET_STEP', step: 'bezittingen' })
      }

      // Welkomstpopup-beslissing: alleen tonen voor een nieuwe gebruiker die
      // (a) de popup nog niet eerder gezien heeft EN (b) geen draft heeft die
      // gerestored is. Een restored-draft betekent dat de gebruiker al midden
      // in onboarding zit — een begroetende popup zou daar verwarrend zijn.
      let welcomeSeen = false
      try {
        welcomeSeen = localStorage.getItem(WELCOME_SEEN_STORAGE_KEY) === 'true'
      } catch {
        // localStorage onbereikbaar (privacy-modus) — toon de popup dan maar
        // gewoon; bij volgende sessie verschijnt 'm opnieuw, geen kwaad.
      }
      if (!welcomeSeen && !hasRestoredDraft) {
        setShowWelcomePopup(true)
      }

      // Restore-poging is afgerond (met of zonder herstelde draft) — vanaf nu
      // mag het persisteer-effect schrijven. Staat in dezelfde React-batch als
      // de eventuele RESTORE_STATE-dispatch hierboven, dus het effect ziet
      // meteen de herstelde staat en niet de lege beginstaat.
      setRestoreChecked(true)
      setLoading(false)
    }
    check()
  }, [supabase, router])

  // Welkomstpopup wegklikken: zet de flag in localStorage zodat hij niet
  // terugkomt bij een refresh tijdens dezelfde onboarding-sessie. Het is
  // geen kritiek pad — bij localStorage-fail loggen we niets en valt de
  // popup gewoon nog een keer in beeld bij volgende sessie.
  const dismissWelcomePopup = useCallback(() => {
    try {
      localStorage.setItem(WELCOME_SEEN_STORAGE_KEY, 'true')
    } catch {
      // ignore — popup verschijnt eventueel opnieuw, acceptabel
    }
    setShowWelcomePopup(false)
  }, [])

  // AOW-leeftijd van deze gebruiker voor de pensioenstap. Twee vormen, bewust
  // gescheiden (display-drift-lock, zie pensioen-aow-widget): `userAowAge` is
  // de FUNCTIONELE hele-jaren-waarde (Math.ceil, zelfde conventie als
  // aow_target_age in save-own-data) voor ingangsleeftijd/placeholder;
  // `userAowAgeLabel` is de exacte weergave ("67 jaar en 3 maanden",
  // formatAowAge) voor alle lopende tekst. Zonder geboortedatum of rijen:
  // NL_AOW_AGE-fallback via lookupAowAge.
  const { userAowAge, userAowAgeLabel } = useMemo(() => {
    const aow = lookupAowAge(aowRows, state.identity.date_of_birth || null)
    return {
      userAowAge: Math.ceil(aow.fractional),
      userAowAgeLabel: formatAowAge(aow),
    }
  }, [aowRows, state.identity.date_of_birth])

  // Huidige leeftijd (hele jaren) uit de geboortedatum — alleen voor de
  // standaard-stopleeftijd wanneer de gebruiker in "Jouw plan" een eigen
  // leeftijd kiest (`defaultStopAge`). Zonder geboortedatum valt die helper
  // zelf terug; hier geen eigen aanname.
  const currentAgeForPlan = useMemo(
    () => computeCurrentAge(state.identity.date_of_birth || null),
    [state.identity.date_of_birth],
  )

  // Bewaar het concept server-side bij elke wijziging (behalve op de
  // terminal-stappen saving/success). Twee poorten:
  //  · `restoreChecked` — schrijven vóórdat de restore-poging klaar is zou het
  //    bestaande concept met de lege beginstaat overschrijven (zie de
  //    poort-toelichting bij de state-declaratie).
  //  · de debounce — doortypen in een bedragveld verandert de state per
  //    toetsaanslag; zonder wachttijd zou dat evenzoveel PUT's kosten.
  useEffect(() => {
    if (!restoreChecked) return
    if (['saving', 'budget', 'bank', 'klaar', 'success'].includes(state.step)) return
    const draft = serializeDraft(state)
    // Nog niets te hervatten (net binnengekomen, niets ingevuld) → geen rij
    // beschrijven. Zodra er één antwoord staat, slaat dit om en blijft het om.
    if (!hasResumableDraft(draft)) return
    const timer = setTimeout(() => {
      void draftWriter.write(draft)
    }, DRAFT_PERSIST_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [state, restoreChecked, draftWriter])

  // ── Handlers ─────────────────────────────────────────────────

  const handleLogout = useCallback(async () => {
    // Afbreken = concept wissen. Zonder deze clear bleef het (nu volledige)
    // concept achter op de profielrij na uitloggen — acceptatiecriterium
    // "gewist bij afbreken". Via de schrijver, niet via `clearDraft` los: die
    // verzegelt 'm, zodat een nog lopende schrijf het concept niet meteen ná
    // de wis opnieuw aanmaakt.
    await draftWriter.clear()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }, [supabase, draftWriter])

  // Animate progress bar and rotating messages during save
  useEffect(() => {
    if (state.step !== 'saving') return
    // Progress bar animation: ramp from 0 to 90% over ~3s
    const progressTimer = setInterval(() => {
      setSaveProgress((prev) => {
        if (prev >= 90) { clearInterval(progressTimer); return 90 }
        return prev + 3
      })
    }, 100)
    // Rotate messages every 800ms
    const messageTimer = setInterval(() => {
      setSaveMessageIdx((prev) => (prev + 1) % SAVING_MESSAGES.length)
    }, 800)
    return () => { clearInterval(progressTimer); clearInterval(messageTimer) }
  }, [state.step])

  const handleSaveOwnData = useCallback(async () => {
    // Prevent double-submit: if already saving, ignore subsequent calls
    if (saving) return
    // Restore-guard (optie A): identiteit wordt niet meer hersteld, dus na een
    // draft-restore is de naam/geboortedatum leeg terwijl de gebruiker op een
    // latere stap kan landen. Zonder deze guard zou de eind-save een payload
    // met lege verplichte velden insturen. Zak in dat geval terug naar de
    // eerste onvolledige verplichte stap i.p.v. te saven.
    const incompleteStep = firstIncompleteRequiredStep(state.identity, activeStepOrder)
    if (incompleteStep) {
      setSaveError({
        kind: 'validation',
        message:
          'Vul eerst je naam en geboortedatum in — die hebben we nodig om je profiel af te ronden.',
      })
      dispatch({ type: 'SET_STEP', step: incompleteStep })
      return
    }
    setSaving(true)
    setSaveProgress(0)
    setSaveMessageIdx(0)
    setSaveError(null)
    dispatch({ type: 'SET_STEP', step: 'saving' })

    try {
      const { identity, budgetAmounts, quickAssets, quickDebts } = state

      // Stable idempotency key: reuse across retries so the server can
      // detect duplicate submissions.  Only generate once per session.
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = crypto.randomUUID()
      }
      const idempotencyKey = idempotencyKeyRef.current

      // Maandinkomen (stap 3) is sinds jun 2026 het uitgevraagde veld
      // (`net_monthly_income`). We sturen het maandbedrag naar
      // profiles.net_monthly_income (de server zet dit, mits > 0, als
      // handmatige bron 'eigen bedrag' in het blok "Instellingen & toekomst"
      // op /overzicht/budget → drijft de spaarquote/FIRE-prognose via
      // resolveSavingsSource, ook zonder transacties). Valt terug op een
      // eventueel reeds gevuld canoniek jaarveld (÷12) voor herstelde oude
      // drafts die alleen dat nog hadden.
      const rawMonthly = identity.net_monthly_income
        ? parseBedragInput(identity.net_monthly_income)
        : NaN
      const monthlyIncome = isFinite(rawMonthly) && rawMonthly > 0
        ? Math.round(rawMonthly)
        : (() => {
            const yearly = identity.estimated_yearly_income
              ? parseBedragInput(identity.estimated_yearly_income)
              : NaN
            return isFinite(yearly) && yearly > 0 ? Math.round(yearly / 12) : 0
          })()
      // Canonieke jaarwaarde (maand × 12) — historisch de "opgeslagen" client-
      // grootheid waar downstream-afleidingen omheen geschreven zijn. De
      // server-body consumeert het maandbedrag direct; we houden de jaarwaarde
      // hier expliciet zodat de maand→jaar-relatie op één plek verankerd is.
      const estimatedYearlyIncome = monthlyIncome > 0 ? monthlyIncome * 12 : 0
      void estimatedYearlyIncome
      const monthlyExpenses = identity.estimated_monthly_expenses
        ? parseBedragInput(identity.estimated_monthly_expenses)
        : NaN

      const body: Record<string, unknown> = {
        identity: {
          full_name: identity.full_name,
          date_of_birth: identity.date_of_birth,
          household_type: identity.household_type,
          number_of_children: identity.number_of_children,
          net_monthly_income: monthlyIncome,
          estimated_monthly_expenses: isFinite(monthlyExpenses) && monthlyExpenses > 0
            ? Math.round(monthlyExpenses)
            : undefined,
        },
        budgetAmounts,
        idempotencyKey,
        activeModules: state.activeModules.length > 0 ? state.activeModules : undefined,
      }

      // Add horizon data if toekomstplannen is active.
      // (`toekomstplannen` zit in ALL_MODULES en RESTORE_STATE forceert
      // activeModules=ALL_MODULES, dus dit blok draait altijd — horizonData
      // valt nooit gated weg.)
      if (state.activeModules.includes('toekomstplannen')) {
        // Uitgaven-na-pensioen-keuze (nieuwe onboarding-stap) bepaalt de
        // retirement-velden. Consume-only: we leggen alleen de keuze vast — de
        // horizon-kernel + computeRetirementExpenses blijven de rekenbron.
        //
        // Bij SKIP sturen we de retirement-velden bewust NIET mee (undefined):
        // dan vult de server via resolveRetirementExpenseDefaults de impliciete
        // 80%-default in (op basis van de ingevoerde maanduitgaven). Zo is "later
        // bepalen" geen current_income-keuze maar een zachte, realistische default.
        const re = state.retirementExpense
        let retirementMethod:
          | 'essential_budgets'
          | 'custom_amount'
          | 'current_income'
          | undefined = undefined
        let retirementCustom: number | undefined = undefined
        if (!re.skipped) {
          retirementMethod = re.method
          if (re.method === 'custom_amount') {
            const parsed = re.customAmount ? parseBedragInput(re.customAmount) : NaN
            // Leeg/ongeldig bedrag bij custom_amount → laat het expliciete
            // bedrag weg; de server-default vult dan 80% in. Geen 0 wegschrijven.
            retirementCustom = isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined
          }
          // 'current_income' ("zelfde als nu") → methode meesturen, geen bedrag.
        }

        // Het plan (ADR 0129) uit de stap "Jouw plan": eind-vorm + anker. De
        // stopleeftijd reist alleen mee onder anker `age`; het bedrag dat over
        // moet blijven alleen onder eind-vorm `legacy` — anders zou een eerder
        // ingetypt bedrag stil meegaan met een plan dat er niets mee doet.
        const legacyAmountParsed = parseBedragInput(state.horizon.fire_legacy_amount)
        body.horizonData = {
          fire_end_strategy: state.horizon.fire_end_strategy,
          fire_end_age: state.horizon.fire_end_age,
          fire_legacy_amount:
            state.horizon.fire_end_strategy === 'legacy' && isFinite(legacyAmountParsed) && legacyAmountParsed > 0
              ? Math.round(legacyAmountParsed)
              : undefined,
          fire_stop_anchor: state.horizon.fire_stop_anchor,
          fire_stop_age: state.horizon.fire_stop_anchor === 'age' ? state.horizon.fire_stop_age : null,
          retirement_expense_method: retirementMethod,
          retirement_custom_amount: retirementCustom,
          temporal_balance: state.horizon.temporal_balance,
          life_events: state.horizon.life_events,
        }
      }

      // Add chosen goals — primary signal voor de doel-stappen-flow.
      // Server accepteert array (`selectedGoalSlugs`) sinds fase 3. We sturen
      // ook `selectedGoalSlug` (eerste van de array) voor backward-compat
      // met oudere server-deploys die nog niet het array-veld kennen.
      if (state.selectedGoals.length > 0) {
        body.selectedGoalSlugs = state.selectedGoals
        body.selectedGoalSlug = state.selectedGoals[0]
      }

      // Add deferred fields for post-onboarding suggestions (feature #830)
      if (state.deferredFields.length > 0) {
        body.deferredFields = state.deferredFields
      }

      // App-schattingen (UR3-05): de server maakt hier `income_source` /
      // `expenses_source = 'estimate'` van i.p.v. 'manual'. Alleen melden voor
      // een veld dat óók daadwerkelijk een bedrag draagt — een schatting op een
      // leeg veld bestaat niet, en zou 'estimate' op een lege profielrij zetten.
      const estimatedFields = state.estimatedFields.filter((key) =>
        key === 'income' ? monthlyIncome > 0 : isFinite(monthlyExpenses) && monthlyExpenses > 0,
      )
      if (estimatedFields.length > 0) {
        body.estimatedFields = estimatedFields
      }

      // Woning-keuze (ADR 0133) — alleen meesturen wanneer de gebruiker 'm
      // daadwerkelijk maakte. Ontbreekt hij, dan kiest de server bewust de
      // terugval (`HOUSING_CHOICE_FALLBACK`); dat hier alvast invullen zou een
      // niet-gemaakte keuze als een keuze laten lezen.
      if (state.housingChoice !== null) {
        body.housingChoice = state.housingChoice
      }

      // Derive budgettering mode from modules
      const budgetteringMode = state.activeModules.includes('budgetteren') ? 'manual' : 'none'
      body.budgetteringMode = budgetteringMode

      // QuickAddInput-shape: 3 velden per item. De server roept
      // buildAssetDraft / buildDebtDraft aan om volledige rijen te bouwen —
      // dezelfde logica als de Server Action op /core.
      if (quickAssets.length > 0) {
        body.quickAssets = quickAssets
      }
      if (quickDebts.length > 0) {
        body.quickDebts = quickDebts
      }

      // Timeout after 30 seconds (allows time for batched DB operations including retry cleanup)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const res = await fetch('/api/onboarding/save-own-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!res.ok) {
        const data = await res.json()
        console.error(`[onboarding-save] server rejected payload (status ${res.status}): ${JSON.stringify(data)}`)
        // Build a human-readable summary of Zod field errors when present
        let detail = ''
        if (data?.details?.fieldErrors && typeof data.details.fieldErrors === 'object') {
          const fields = Object.entries(data.details.fieldErrors as Record<string, string[]>)
            .filter(([, msgs]) => Array.isArray(msgs) && msgs.length > 0)
            .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
          if (fields.length > 0) detail = ` — ${fields.join('; ')}`
        }
        throw new Error(`${data.error || 'Opslaan mislukt'}${detail}`)
      }

      // ── Pensioen-write (los van het save-own-data POST-contract) ──────────
      // De pensioen-keuze (schatting of upload) rijdt op het bestaande
      // `applyPensionParseResult`-pad → `life_events`, met de anon RLS-client
      // .eq('user_id', auth.uid())-gescoped (geen service-role, geen nieuwe
      // exposure). Best-effort: een mislukte pensioen-write mag de geslaagde
      // onboarding-save niet terugdraaien — we loggen en gaan door.
      try {
        const pensionResult = buildPensionParseResult(state.pension, userAowAge)
        if (pensionResult && userIdRef.current) {
          const outcome = await applyPensionParseResult({
            supabase,
            userId: userIdRef.current,
            parseResult: pensionResult,
            existingPensionCount: 0,
          })
          if (outcome.error) {
            console.warn(`[onboarding] pensioen opslaan mislukt: ${outcome.error}`)
          }
        }
      } catch (pensionErr) {
        console.warn('[onboarding] pensioen opslaan mislukt', pensionErr)
      }

      // NB: geen AI pre-generatie meer hier. Dat endpoint
      // (/api/ai/recommendations/initial) zit achter de 'ai'-subscriptie, die
      // een net-geonboarde gebruiker (active_subscriptions = []) per definitie
      // niet heeft — de call gaf dus gegarandeerd 403 en een console-error.
      // AI-aanbevelingen worden on-demand gegenereerd waar de gebruiker écht
      // AI-toegang heeft (bv. de roadmap-modal), niet blind bij onboarding.

      // Complete the progress bar
      setSaveProgress(100)
      await new Promise((r) => setTimeout(r, 400))

      // Concept wissen — de onboarding is afgerond, de gegevens staan nu op hun
      // echte plek. `draftWriter.clear()` verzegelt de schrijver, zodat een nog
      // lopende gedebouncede schrijf het concept niet meteen ná de wis opnieuw
      // aanmaakt. Best-effort: een mislukte wis mag de geslaagde save niet
      // terugdraaien (de volgende paginabezoek-check wist 'm alsnog).
      await draftWriter.clear()

      // Door naar de afrondingsstappen (budget → bank). Die draaien pas nu,
      // omdat deze opslag budgetten en cash-rekeningen wist; de server heeft de
      // afrondingsmarkering in dezelfde update geopend.
      setAfrondingIncome(monthlyIncome)
      // De samenvatting na de bankstap leest de antwoorden uit deze sessie; na
      // een herlaad (bank-omweg in de browser) zijn die weg en slaan we hem over.
      recapAvailableRef.current = true
      dispatch({ type: 'SET_STEP', step: 'budget' })
    } catch (err) {
      let message: string
      if (err instanceof DOMException && err.name === 'AbortError') {
        message = 'De server reageert niet. Controleer je internetverbinding en probeer het opnieuw.'
      } else if (err instanceof TypeError && err.message.startsWith('Failed to fetch')) {
        message = 'Geen internetverbinding. Controleer je netwerk en probeer het opnieuw.'
      } else {
        message = err instanceof Error ? err.message : 'Onbekende fout bij opslaan'
      }
      // ── OPSLAG-FOUT: GEEN NAVIGATIE ─────────────────────────────────────
      // Besluit C3 (aug 2026): een mislukte eindopslag mag NOOIT navigeren of
      // herladen. Sinds UR2-01 staat het concept server-side, dus een reload
      // is niet meer fataal — maar hij is nog steeds fout: hij gooit de
      // gebruiker uit de flow, kost de niet-bewaarde pensioen-parse (ADR 0115)
      // en verbergt de fout die hij net moest lezen. Alleen state-updates in
      // dit blok — bewaakt door `save-failure-no-reload.test.ts`.
      // De technische tekst is diagnostiek, geen bannercopy: naar de console,
      // niet naar de state (zie `OnboardingNotice`).
      console.error('[onboarding] eindopslag mislukt', message, err)
      setSaveError({ kind: 'save' })
      // Go back to last content step before saving — all data is preserved in useReducer state
      const contentSteps = activeStepOrder.filter(s => !['saving', 'success'].includes(s))
      dispatch({ type: 'SET_STEP', step: contentSteps[contentSteps.length - 1] })
      // ── EINDE OPSLAG-FOUT ───────────────────────────────────────────────
    } finally {
      setSaving(false)
    }
  }, [saving, state, activeStepOrder, userAowAge])

  // ── Afrondingsstappen (budget → bank) ─────────────────────────
  // De markering op de server schuift mee, zodat een hervatting of de terugkeer
  // van de bank op de juiste stap landt. Best-effort: een mislukte schrijf mag
  // de gebruiker niet vastzetten (de markering verloopt vanzelf), maar we
  // wachten er wél op vóór we verder gaan, zodat de volgende paginaload hem ziet.
  const advanceAfronding = useCallback(async (body: AfrondingVoortgang) => {
    try {
      const res = await fetch('/api/onboarding/afronding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) console.warn('[onboarding] afrondingsmarkering niet bijgewerkt', res.status)
    } catch (err) {
      console.warn('[onboarding] afrondingsmarkering niet bijgewerkt', err)
    }
  }, [])

  const finishBudgetStep = useCallback(async (budget: 'opgeslagen' | 'overgeslagen') => {
    // Eerst door naar de bank, dan de markering: zo is de budgetstap meteen weg
    // (geen tweede opslagklik in het wachtvenster). De markering hoeft niet af te
    // zijn vóór de bankstap — de callback keert ook bij `stap: 'budget'` terug.
    dispatch({ type: 'SET_STEP', step: 'bank' })
    await advanceAfronding({ stap: 'bank', budget })
  }, [advanceAfronding])

  const finishBankStep = useCallback(async (bank: BankUitkomst) => {
    await advanceAfronding({ stap: 'klaar', bank })
    // Samenvatting met "Begin met TriFinity" als laatste knop — alleen als de
    // antwoorden uit deze sessie er nog zijn (anders zou hij leeg ogen).
    dispatch({ type: 'SET_STEP', step: recapAvailableRef.current ? 'klaar' : 'success' })
  }, [advanceAfronding])

  // Defined after handleSaveOwnData so the safety-net branch below can call it
  // without tripping the no-use-before-define rule. goToNext is wired into
  // every step's <OnboardingX onNext={goToNext} /> prop, so the user-click
  // handlers see the latest closure on every render.
  const goToNext = useCallback(() => {
    const idx = activeStepOrder.indexOf(state.step)
    if (idx === -1) {
      // Self-heal: current step is no longer in the active order (e.g. the
      // user had a draft pointing at a step that was removed). Dispatch to
      // the first valid step instead of silently no-op'ing.
      const fallback = _firstNavigationRecoveryStep(activeStepOrder)
      console.warn(
        `[onboarding] goToNext: step ${state.step} not in active order, falling back to ${fallback}`
      )
      dispatch({ type: 'SET_STEP', step: fallback })
      return
    }
    const next = activeStepOrder[idx + 1]
    // Safety net: if the next step is 'saving', invoke the actual save handler
    // instead of just dispatching to the saving screen. Without this, any
    // module combination would dead-end at 90% on the progress bar (the
    // saving step never triggers the POST itself).
    if (next === 'saving') {
      handleSaveOwnData()
      return
    }
    if (idx < activeStepOrder.length - 1) {
      dispatch({ type: 'SET_STEP', step: next })
    }
  }, [activeStepOrder, state.step, handleSaveOwnData])

  const dismissError = useCallback(() => setSaveError(null), [])

  // Kop, tekst en herkansings-knop van de meldingsbanner — één beslissing,
  // getest in `draft-notice-copy.test.ts` zonder deze component te mounten.
  const noticeDisplay = resolveNoticeDisplay(saveError)

  // Helper voor stap 4 → handlers de orchestrator nodig heeft.
  const handleAssetsChange = useCallback(
    (items: AssetQuickInput[]) => dispatch({ type: 'SET_QUICK_ASSETS', items }),
    [],
  )
  const handleDebtsChange = useCallback(
    (items: DebtQuickInput[]) => dispatch({ type: 'SET_QUICK_DEBTS', items }),
    [],
  )

  // Voor stap 5 → recap: cumulatief netto vermogen. `null` als de gebruiker
  // bezittingen + schulden bewust heeft overgeslagen (recap toont dan "—").
  const netWorthForKlaar = useMemo(() => {
    const hasAny = state.quickAssets.length + state.quickDebts.length > 0
    if (!hasAny) return null
    const totalAssets = state.quickAssets.reduce((s, a) => s + (Number(a.current_value) || 0), 0)
    const totalDebts = state.quickDebts.reduce((s, d) => s + (Number(d.current_balance) || 0), 0)
    return totalAssets - totalDebts
  }, [state.quickAssets, state.quickDebts])

  // Maandinkomen voor de recap: sinds jun 2026 wordt het
  // inkomen per MAAND uitgevraagd, dus `net_monthly_income` is de primaire
  // bron. Valt terug op het canonieke jaarinkomen (÷12) voor herstelde oude
  // drafts waarin alleen dat gevuld was.
  const netMonthlyIncomeForKlaar = useMemo(() => {
    const monthly = state.identity.net_monthly_income
      ? parseBedragInput(state.identity.net_monthly_income)
      : NaN
    if (isFinite(monthly) && monthly > 0) return Math.round(monthly)
    const yearly = state.identity.estimated_yearly_income
      ? parseBedragInput(state.identity.estimated_yearly_income)
      : NaN
    return isFinite(yearly) && yearly > 0 ? Math.round(yearly / 12) : 0
  }, [state.identity.net_monthly_income, state.identity.estimated_yearly_income])

  // Maanduitgaven (stap 3) — zelfde NL-parse als de save-payload.
  const monthlyExpensesParsed = useMemo(() => {
    const n = state.identity.estimated_monthly_expenses
      ? parseBedragInput(state.identity.estimated_monthly_expenses)
      : NaN
    return isFinite(n) && n > 0 ? Math.round(n) : 0
  }, [state.identity.estimated_monthly_expenses])

  /**
   * Meelopende vrijheidstijd-teller (bevinding H12). Verschijnt zodra inkomen,
   * uitgaven én de eerste bezitting bekend zijn; alle guards zitten in
   * `computeFreedomTicker`.
   *
   * De grondslag volgt de woonstrategie, en die vraagt de onboarding sinds ADR
   * 0131 zélf uit — dus komt de mode uit de KEUZE (via `housingChoiceToConfig`,
   * dezelfde vertaling die de save-route naar `housing_strategy_config`
   * schrijft) in plaats van uit een gespiegelde constante. Het GETAL blijft
   * gelijk: `freedomTickerBasis` geeft bij zowel `downsize` (ja, ik verkoop
   * hem ooit) als `exclude_from_fire` (nee, hij telt niet mee) dezelfde
   * `fire_pot_excl_home`-grondslag, dus de teller kan nog steeds niet dalen.
   */
  const freedomTicker = useMemo(
    () =>
      computeFreedomTicker({
        monthlyIncome: netMonthlyIncomeForKlaar,
        monthlyExpenses: monthlyExpensesParsed,
        assets: state.quickAssets.map((a) => ({
          value: Number(a.current_value) || 0,
          isHome: a.asset_type === 'eigen_huis',
        })),
        debts: state.quickDebts.reduce((s, d) => s + (Number(d.current_balance) || 0), 0),
        basis: freedomTickerBasis(
          housingChoiceToConfig(state.housingChoice ?? HOUSING_CHOICE_FALLBACK).mode,
        ),
      }),
    [
      netMonthlyIncomeForKlaar,
      monthlyExpensesParsed,
      state.quickAssets,
      state.quickDebts,
      state.housingChoice,
    ],
  )

  /**
   * Vrijheid-per-maand voor het eindscherm (UR3-05, criterium 4). De teller
   * hierboven deelt een VERMOGEN en geeft `null` zodra de gebruiker geen
   * bezittingen invulde — precies de gebruiker die anders zónder één tijdgetal
   * de onboarding verlaat. Deze uitspraak leunt alleen op inkomen en uitgaven,
   * en die zijn er (desnoods als schatting). Guards zitten in de helper.
   */
  const monthlyFreedomBuildup = useMemo(
    () => computeMonthlyFreedomBuildup(netMonthlyIncomeForKlaar, monthlyExpensesParsed),
    [netMonthlyIncomeForKlaar, monthlyExpensesParsed],
  )

  /**
   * Echte profiel-compleetheid voor het eindscherm ("6 van 7"). Vervangt de
   * hardgecodeerde "100%" uit bevinding M11. De definitie per onderdeel staat
   * in `lib/onboarding-completeness.ts`; hier leveren we alleen de al afgeleide
   * waarden aan.
   */
  const onboardingCompleteness = useMemo(
    () =>
      computeOnboardingCompleteness({
        fullName: state.identity.full_name,
        dateOfBirth: state.identity.date_of_birth,
        netMonthlyIncome: netMonthlyIncomeForKlaar,
        monthlyExpenses: monthlyExpensesParsed,
        assetCount: state.quickAssets.length,
        debtCount: state.quickDebts.length,
        // Zelfde bron als de life_events-write bij de eind-save: alleen een
        // upload of een schatting met bedrag levert een resultaat op.
        pensioenResultaat: buildPensionParseResult(state.pension),
        // De eindstrategie-stap kent geen overslaan-knop en ligt vóór `klaar`
        // in de stap-volgorde: wie dit scherm ziet, heeft de keuze bevestigd.
        // Komt er ooit een skip, dan verandert alleen deze regel.
        eindstrategieBeantwoord: true,
      }),
    [
      state.identity.full_name,
      state.identity.date_of_birth,
      netMonthlyIncomeForKlaar,
      monthlyExpensesParsed,
      state.quickAssets.length,
      state.quickDebts.length,
      state.pension,
    ],
  )

  // ── Render ───────────────────────────────────────────────────

  // De vier getrokken accenten als CSS-vars (44 stuks), plus de --module-active-*
  // laag die het accent van DEZE stap doorgeeft aan de shell en de stap-
  // componenten. De popup portalt naar document.body en staat dus buiten deze
  // wrapper: die krijgt dezelfde vars apart mee.
  //
  // `useMemo` is hier geen bijgeloof: generateModuleColorVars rekent 4 modules ×
  // 11 shades uit, en elke shade draait een binaire zoektocht naar de
  // sRGB-gamutgrens (~1.760 OKLCH→RGB-conversies). Deze render vuurt bij élke
  // toetsaanslag in de formuliervelden, en op het opslaan-scherm bovendien op
  // twee lopende intervallen. De kleuren veranderen alleen bij de trekking.
  //
  // Staat bewust BOVEN de `loading`-return: hooks mogen niet achter een
  // conditionele return liggen.
  const accentVars = useMemo(() => generateModuleColorVars(moduleColors), [moduleColors])
  const stepTintStyle = useMemo(
    () => ({ ...accentVars, ...moduleActiveVars(STEP_ACCENT[state.step]) }) as React.CSSProperties,
    [accentVars, state.step],
  )
  const welcomeTintStyle = useMemo(
    () => ({ ...accentVars, ...moduleActiveVars('fin') }) as React.CSSProperties,
    [accentVars],
  )

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-ed)] border-t-[var(--ink)]" />
      </div>
    )
  }

  // De shell draagt de voortgangsrij (onder de vraag) en de back-affordance;
  // de masthead-strip blijft daarboven actief voor alle content-stappen.
  // Verbergen alleen op `saving`/`success` — daar is het visuele eindpunt
  // genoeg, en de uitloggen-knop hoort niet bij een eindscherm.
  const showHeader = !['saving', 'success'].includes(state.step)

  return (
    <div
      className="flex min-h-screen flex-col items-center px-4 py-8 sm:justify-center sm:px-6 sm:py-12"
      style={stepTintStyle}
    >
      {/* ── Welkomstpopup ─────────────────────────────────────────
          Eén keer per nieuwe gebruiker, vóór stap 1. Niet voor restored
          drafts (zie check-effect). Sluit alleen via primary CTA of ESC. */}
      {showWelcomePopup && (
        <WelcomePopup onDismiss={dismissWelcomePopup} colorVars={welcomeTintStyle} />
      )}

      {/* ── Sticky meldingsbanner ────────────────────────────────
          Twee oorzaken, twee teksten: `resolveNoticeDisplay` beslist welke
          copy hoort bij een ontbrekend verplicht antwoord (geen opslagpoging
          geweest → geen "Opnieuw proberen", geen ververs-waarschuwing) en
          welke bij een echte opslagfout. */}
      {noticeDisplay && (
        <div
          className="fixed inset-x-0 top-0 z-50 border-b-2 border-[var(--negative)] bg-[var(--paper)] px-4 py-3 shadow-sm"
          role="alert"
          aria-live="assertive"
        >
          <div className="mx-auto flex max-w-[640px] flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-negative">
                {noticeDisplay.label}
              </p>
              <p className="mt-0.5 text-sm text-[var(--ink-2)]">{noticeDisplay.body}</p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-4">
              {noticeDisplay.showRetry && (
                <button
                  onClick={handleSaveOwnData}
                  disabled={saving}
                  className="inline-flex min-h-11 items-center justify-center bg-[var(--ink)] px-5 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:opacity-50"
                >
                  {saving ? 'Bezig …' : 'Opnieuw proberen'}
                </button>
              )}
              <button
                onClick={dismissError}
                className="text-sm text-[var(--ink-3)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
              >
                Sluiten
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Restored data notice ──────────────────────────────────── */}
      {restoredNotice && !saveError && (
        <div
          className="fixed inset-x-0 top-0 z-40 border-b border-[var(--border-ed)] bg-[var(--paper)] px-4 py-2.5 shadow-sm"
          role="status"
        >
          <div className="mx-auto flex max-w-[640px] items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--ink-3)]">
                {DRAFT_RESTORED_NOTICE.label}
              </p>
              <p className="mt-0.5 text-sm text-[var(--ink-2)]">{DRAFT_RESTORED_NOTICE.body}</p>
            </div>
            <button
              onClick={() => setRestoredNotice(false)}
              className="-mr-1 flex h-[44px] w-[44px] flex-shrink-0 items-center justify-center rounded-lg text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink)] sm:mr-0 sm:h-auto sm:w-auto sm:p-1"
              aria-label="Sluiten"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Clearance onder de vaste banners. Beide meldingen dragen sinds C3 een
          label + een tweeregelige toelichting; op smal scherm wikkelt die tot
          ~4 regels, dus mobiel ruimer dan de oude vaste mt-16. */}
      <div className={`w-full max-w-[480px] sm:max-w-[640px] lg:max-w-none ${saveError || restoredNotice ? 'mt-32 sm:mt-20' : ''}`}>
        {/* Masthead — bewust klein en links: tijdens het invullen is de vraag
            de hoofdzaak, niet de merknaam. Tot 17 sep 2026 stond hier een
            gecentreerde 4xl-titel die het eerste halve scherm opat en de vraag
            onder de vouw duwde. Eén rij van 44px hoog, met de uitlog-knop
            ernaast; de punt draagt het accent van deze stap en kleurt dus mee. */}
        {showHeader && (
          <div className="mb-6 flex h-11 items-center justify-between sm:mb-8">
            <p className="font-display text-base font-bold tracking-tight text-[var(--ink)] sm:text-lg">
              <span className="lowercase">t</span>ri<span className="lowercase">f</span>inity
              <span style={{ color: 'var(--module-active-700)' }}>.</span>
            </p>
            <button
              onClick={handleLogout}
              className="-mr-1 flex h-11 items-center px-1 text-xs text-[var(--ink-4)] transition-colors hover:text-[var(--ink-2)]"
            >
              Uitloggen
            </button>
          </div>
        )}

        {/* De teller staat in de sticky kop van élke stap-shell. Op `klaar`
            bewust NIET: daar staat dezelfde vrijheidstijd al groot in de
            vermogens-cel van de recap — twee keer hetzelfde getal op één
            scherm leest als twee cijfers. */}
        <OnboardingFreedomTickerProvider
          label={state.step === 'klaar' ? null : (freedomTicker?.label ?? null)}
        >
        <StepTransition key={state.step} direction={state.direction}>
          {/* ── Profiel-groep: naam + geboortedatum (één veld per scherm) ──
              (De AI-keuze stond hier tot ADR 0157 als eerste stap; de
              onboarding gebruikt zelf geen AI, dus de vraag komt nu pas bij
              het eerste AI-gebruik — met de popup uit BetaAddonDialog.) */}
          {state.step === 'naam' && (
            <OnboardingIdentity
              data={state.identity}
              onChange={(data) => dispatch({ type: 'SET_IDENTITY', data })}
              onNext={goToNext}
              field="naam"
              currentStep={currentContentStep}
              totalSteps={totalContentSteps}
            />
          )}

          {state.step === 'geboortedatum' && (
            <OnboardingIdentity
              data={state.identity}
              onChange={(data) => dispatch({ type: 'SET_IDENTITY', data })}
              onNext={goToNext}
              onBack={goToBack}
              field="dob"
              currentStep={currentContentStep}
              totalSteps={totalContentSteps}
            />
          )}

          {/* ── Inkomen-groep: maandinkomen + uitgaven (preview op uitgaven) ── */}
          {(state.step === 'inkomen' || state.step === 'uitgaven') && (
            <OnboardingInkomen
              data={{
                net_monthly_income: state.identity.net_monthly_income,
                estimated_monthly_expenses: state.identity.estimated_monthly_expenses,
              }}
              onChange={(income) =>
                dispatch({
                  type: 'SET_IDENTITY',
                  data: { ...state.identity, ...income },
                })
              }
              onNext={goToNext}
              onBack={goToBack}
              field={state.step === 'inkomen' ? 'inkomen' : 'uitgaven'}
              // "Schat het voor me" (UR3-05): de leeftijd staat twee schermen
              // eerder en is de enige as waarop de app mag raden (eigenaarbesluit
              // O1 — huishouden wordt in de onboarding niet gevraagd).
              age={currentAgeForPlan}
              estimated={{
                net_monthly_income: state.estimatedFields.includes('income'),
                estimated_monthly_expenses: state.estimatedFields.includes('expenses'),
              }}
              onEstimateChange={(f, value) =>
                dispatch({
                  type: 'SET_FIELD_ESTIMATED',
                  key: f === 'net_monthly_income' ? 'income' : 'expenses',
                  value,
                })
              }
              onSkipIncome={
                state.step === 'inkomen'
                  ? () => {
                      // "Later invullen" defer-pad (feature #829): wis beide
                      // velden en sla de hele inkomen-groep over (naar
                      // bezittingen). De gebruiker vult dit later aan via
                      // /overzicht/budget.
                      dispatch({
                        type: 'SET_IDENTITY',
                        data: {
                          ...state.identity,
                          net_monthly_income: '',
                          estimated_yearly_income: '',
                          estimated_monthly_expenses: '',
                        },
                      })
                      // Leeg veld = geen schatting. Zonder deze twee zou een
                      // eerder geraden bedrag als 'estimate'-bron meereizen
                      // naar een profiel waar niets meer staat — en dat is
                      // 'unknown', niet 'geschat' (ADR 0131).
                      dispatch({ type: 'SET_FIELD_ESTIMATED', key: 'income', value: false })
                      dispatch({ type: 'SET_FIELD_ESTIMATED', key: 'expenses', value: false })
                      dispatch({ type: 'DEFER_FIELD', key: 'income' })
                      dispatch({ type: 'SET_STEP', step: 'bezittingen' })
                    }
                  : undefined
              }
              currentStep={currentContentStep}
              totalSteps={totalContentSteps}
            />
          )}

          {/* ── Uitgaven na pensioen — expliciete 80%-prefill (optioneel) ── */}
          {state.step === 'uitgaven_pensioen' && (
            <OnboardingUitgavenPensioen
              data={state.retirementExpense}
              onChange={(data) => dispatch({ type: 'SET_RETIREMENT_EXPENSE', data })}
              monthlyExpenses={monthlyExpensesParsed}
              monthlyIncome={netMonthlyIncomeForKlaar}
              onNext={goToNext}
              onBack={goToBack}
              onSkip={() => {
                // "Kan altijd later nog" — markeer skipped en wis een eventueel
                // bewerkt bedrag, zodat de save niets expliciets meestuurt en de
                // impliciete 80%-server-default het overneemt.
                dispatch({
                  type: 'SET_RETIREMENT_EXPENSE',
                  data: { method: 'custom_amount', customAmount: '', skipped: true },
                })
                goToNext()
              }}
              currentStep={currentContentStep}
              totalSteps={totalContentSteps}
            />
          )}

          {/* ── Bezittingen — begeleide ja/nee-enumeratie ── */}
          {state.step === 'bezittingen' && (
            <OnboardingBezittingen
              quickAssets={state.quickAssets}
              quickDebts={state.quickDebts}
              onAssetsChange={handleAssetsChange}
              onDebtsChange={handleDebtsChange}
              onNext={() => {
                // Track deferral when the user finishes the bezittingen section
                // without having added any asset (feature #830).
                if (state.quickAssets.length === 0) {
                  dispatch({ type: 'DEFER_FIELD', key: 'assets' })
                }
                goToNext()
              }}
              onBack={goToBack}
              currentStep={currentContentStep}
              totalSteps={totalContentSteps}
              bankConnected={bankConnected}
              bankError={bankError}
              phases={state.bezittingenPhases}
              onPhasesChange={(phases) =>
                dispatch({ type: 'SET_BEZITTINGEN_PHASES', phases })
              }
              housingChoice={state.housingChoice}
              onHousingChoiceChange={(choice) =>
                dispatch({ type: 'SET_HOUSING_CHOICE', choice })
              }
            />
          )}

          {/* ── Schulden — begeleide ja/nee met altijd-uitgang ── */}
          {state.step === 'schulden' && (
            <OnboardingSchulden
              quickDebts={state.quickDebts}
              onDebtsChange={handleDebtsChange}
              onNext={goToNext}
              onBack={goToBack}
              currentStep={currentContentStep}
              totalSteps={totalContentSteps}
              phases={state.schuldenPhases}
              onPhasesChange={(phases) =>
                dispatch({ type: 'SET_SCHULDEN_PHASES', phases })
              }
            />
          )}

          {/* ── Pensioen — schatting / upload / overslaan (optioneel) ── */}
          {state.step === 'pensioen' && (
            <OnboardingPensioen
              data={state.pension}
              onChange={(data) => dispatch({ type: 'SET_PENSION', data })}
              samenwonend={state.identity.household_type !== 'solo'}
              aowAge={userAowAge}
              aowAgeLabel={userAowAgeLabel}
              // "Schat het voor me" (B-055): leeftijd + het eerder ingevulde of
              // geschatte netto maandinkomen; zonder een van beide geen knop.
              age={currentAgeForPlan}
              netMonthlyIncome={netMonthlyIncomeForKlaar}
              incomeIsEstimate={state.estimatedFields.includes('income')}
              onNext={goToNext}
              onBack={goToBack}
              onSkip={() => {
                // "Kan altijd later nog" — wis de keuze en ga door (deferred).
                dispatch({ type: 'SET_PENSION', data: INITIAL_PENSION_DRAFT })
                goToNext()
              }}
              currentStep={currentContentStep}
              totalSteps={totalContentSteps}
            />
          )}

          {/* ── Jouw plan — stop-anker × eind-vorm (laatste inhoudelijke vraag, ADR 0129) ── */}
          {state.step === 'eindstrategie' && (
            <OnboardingEindstrategie
              value={state.horizon}
              onChange={(patch) =>
                dispatch({
                  type: 'SET_HORIZON',
                  data: { ...state.horizon, ...patch },
                })
              }
              currentAge={currentAgeForPlan}
              onNext={goToNext}
              onBack={goToBack}
              currentStep={currentContentStep}
              totalSteps={totalContentSteps}
            />
          )}

          {state.step === 'klaar' && (
            <OnboardingKlaar
              netMonthlyIncome={netMonthlyIncomeForKlaar}
              netWorth={netWorthForKlaar}
              freedomLabel={freedomTicker?.label ?? null}
              // Niemand verlaat de onboarding zonder tijdgetal (UR3-05): de
              // teller hierboven vraagt VERMOGEN, de opbouw hieronder alleen
              // inkomen en uitgaven — en die zijn er, desnoods geschat.
              monthlyBuildup={monthlyFreedomBuildup}
              // Grondslag-zin onder de vrijheidstijd volgt de woning-keuze
              // (ADR 0133); `null` = geen woning/geen keuze → de route-terugval.
              housingChoice={state.housingChoice}
              incomeIsEstimate={state.estimatedFields.includes('income')}
              assets={state.quickAssets}
              debts={state.quickDebts}
              completeness={onboardingCompleteness}
              // Geen terug-/aanvul-acties: de samenvatting staat ná de opslag en
              // ná budget + bank; terugspringen zou een wissende tweede opslag
              // uitlokken (ADR 0156, aanvulling 17 sep).
              onFinish={() => dispatch({ type: 'SET_STEP', step: 'success' })}
              currentStep={currentContentStep}
              totalSteps={totalContentSteps}
            />
          )}

          {state.step === 'saving' && (
            <div className="flex min-h-[60vh] flex-col items-center justify-center sm:min-h-0">
              <div className="w-full max-w-sm rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] shadow-sm p-8 text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center">
                  <div className="animate-pulse">
                    <FinDots size={64} />
                  </div>
                </div>
                <p className="mb-4 text-sm font-medium text-[var(--ink-2)] transition-opacity duration-300">
                  {SAVING_MESSAGES[saveMessageIdx]}
                </p>
                {/* Progress bar */}
                <div className="mx-auto h-2 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                  <div
                    className="h-full rounded-full bg-[var(--ink)] transition-all duration-300 ease-out"
                    style={{ width: `${saveProgress}%` }}
                  />
                </div>
                <p className="mt-2 font-mono text-xs tabular-nums text-[var(--ink-4)]">{saveProgress}%</p>
              </div>
            </div>
          )}

          {state.step === 'budget' && (
            <OnboardingBudget
              netIncome={afrondingIncome}
              onSaved={() => void finishBudgetStep('opgeslagen')}
              onSkipped={() => void finishBudgetStep('overgeslagen')}
              currentStep={currentContentStep}
              totalSteps={totalContentSteps}
            />
          )}

          {state.step === 'bank' && (
            <OnboardingBank
              result={bankConnected ? 'connected' : bankError ? 'error' : null}
              onDone={() => void finishBankStep('gekoppeld')}
              onSkipped={(reden) => void finishBankStep({ overgeslagen: reden })}
              currentStep={currentContentStep}
              totalSteps={totalContentSteps}
            />
          )}

          {state.step === 'success' && (
            <OnboardingSuccess
              onDashboard={() => {
                // Vangnet: het concept is bij een geslaagde save al gewist.
                // Faalde die wis (netwerk), dan is dit de tweede kans — de
                // gebruiker verlaat de onboarding hier definitief.
                void draftWriter.clear()
                // Hard navigation: voorkomt stale-read redirect-loop in (app)/layout.tsx
                // direct na het wegschrijven van `onboarding_completed = true`. Bij een
                // soft-navigation kan de server-layout de nét-geschreven row missen en
                // redirecten naar /onboarding, wat de Suspense-fallback laat knipperen
                // tot een browser-refresh de sessie opnieuw aligneert.
                //
                // Bestemming is /dashboard, niet een concrete pagina (ADR 0130): de
                // middleware (lib/supabase/proxy.ts) vertaalt /dashboard naar het
                // gekozen homescherm (`profiles.home_screen`, standaard /overzicht).
                // Zo landt iedereen na de onboarding op zijn eigen hoofdscherm — dáár
                // start ook de rondleiding.
                window.location.assign('/dashboard')
              }}
            />
          )}
        </StepTransition>
        </OnboardingFreedomTickerProvider>
      </div>
    </div>
  )
}
