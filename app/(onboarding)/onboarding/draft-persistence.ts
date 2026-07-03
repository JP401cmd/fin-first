/**
 * Onboarding draft-persistence — pure, security-scoped serialisatie van het
 * onboarding-concept naar/uit localStorage.
 *
 * ACHTERGROND (security-fix jul 2026): het onboarding-concept werd volledig
 * client-side in localStorage bewaard, inclusief GEVOELIGE financiële data
 * (naam, geboortedatum, inkomens, budgetbedragen, bezittingen/schulden,
 * pensioenbedragen, spaardoel-bedrag). Op een gedeeld apparaat of via één
 * XSS-gaatje was dat alles leesbaar tot de onboarding voltooid/afgebroken was.
 *
 * AANPAK (optie A — persistentie minimaliseren): alleen NIET-GEVOELIGE velden
 * worden nog gepersisteerd — de stap-positie en de keuzes-zonder-bedrag. Alle
 * bedragen/vermogen/pensioen/identiteit blijven uitsluitend in de in-memory
 * React-state (useReducer) en verdwijnen bij refresh/nieuwe sessie. De
 * gebruiker vult die bij hervatting opnieuw in (acceptabel per de kaart).
 *
 * Deze module bevat pure functies (geen localStorage-toegang) zodat het
 * persist/restore-gedrag los testbaar is — de page-component doet de
 * daadwerkelijke read/write en roept deze helpers aan.
 */
import type { GoalSlug } from '@/lib/goals/types'
import { isGoalSlug } from '@/lib/goals/catalog'
import type { ModuleId } from '@/lib/module-registry'
import type { SpaardoelPresetKey } from '@/lib/onboarding-presets'
import type { HorizonData } from '@/components/onboarding/onboarding-horizon'
import type { RetirementExpenseState } from '@/components/onboarding/onboarding-uitgaven-pensioen'
import type { PensionDraft } from '@/components/onboarding/onboarding-pensioen'
import type { FireEndStrategy } from '@/lib/fire-strategy'

/** Velden die de gebruiker expliciet oversloeg via "Later invullen" (feature #830). */
export type DeferredFieldKey = 'income' | 'assets' | 'spaardoel'

// ── Niet-gevoelige keuze-subsets ─────────────────────────────
// Bewust alléén de keuze-zonder-bedrag/naam per substate; alle bedragen,
// namen en geparste pensioendata blijven uit het persisted object.

/** Spaardoel: alleen preset-keuze + skip-vlag (GEEN naam/streefbedrag/datum). */
export interface SpaardoelChoice {
  presetKey: SpaardoelPresetKey | null
  skipped: boolean
}

/** Pensioen: alleen het gekozen pad (GEEN brutobedrag/leeftijd/parseResult). */
export interface PensionChoice {
  mode: PensionDraft['mode']
}

/** Uitgaven-na-pensioen: alleen methode + skip-vlag (GEEN customAmount). */
export interface RetirementExpenseChoice {
  method: RetirementExpenseState['method']
  skipped: boolean
}

/** Horizon: alleen de strategiekeuzes (GEEN legacy-bedrag/custom-bedrag/life_events). */
export interface HorizonChoice {
  fire_end_strategy: FireEndStrategy
  fire_end_age: number
  temporal_balance: number
}

/**
 * Het complete, NIET-GEVOELIGE draft-object dat naar localStorage geschreven
 * wordt. Bevat bewust GEEN identity, budgetAmounts, quickAssets, quickDebts,
 * bedragen of geparste pensioendata.
 */
export interface NonSensitiveDraft {
  lastStep?: string
  selectedGoals: GoalSlug[]
  activeModules: ModuleId[]
  deferredFields: DeferredFieldKey[]
  spaardoel: SpaardoelChoice
  pension: PensionChoice
  retirementExpense: RetirementExpenseChoice
  horizon: HorizonChoice
}

/**
 * Top-level keys die als GEVOELIG gelden en NOOIT in het persisted draft mogen
 * belanden. Geëxporteerd zodat de test kan asserten dat het geserialiseerde
 * object ze niet bevat en de migratie ze uit een oud draft stript.
 */
export const SENSITIVE_DRAFT_KEYS = [
  'identity',
  'budgetAmounts',
  'quickAssets',
  'quickDebts',
] as const

const VALID_PRESET_KEYS: readonly SpaardoelPresetKey[] = [
  'noodfonds',
  'vakantie',
  'auto',
  'aanbetaling',
  'groei',
  'custom',
]

const VALID_FIRE_END_STRATEGIES: readonly FireEndStrategy[] = [
  'perpetual',
  'legacy',
  'deplete',
  'pensioen',
]

/**
 * Structurele subset van de onboarding-`State` die `serializeDraft` leest. De
 * volledige `State` (met alle gevoelige velden) is hier structureel aan
 * toewijsbaar — we lezen bewust alléén de niet-gevoelige velden eruit.
 */
export interface DraftStateSource {
  step: string
  selectedGoals: GoalSlug[]
  activeModules: ModuleId[]
  deferredFields: DeferredFieldKey[]
  spaardoel: { presetKey: SpaardoelPresetKey | null; skipped: boolean }
  pension: { mode: PensionDraft['mode'] }
  retirementExpense: { method: RetirementExpenseState['method']; skipped: boolean }
  horizon: { fire_end_strategy: FireEndStrategy; fire_end_age: number; temporal_balance: number }
}

/**
 * Bouw het NIET-GEVOELIGE draft-object uit de volledige onboarding-state.
 * Enige plek die bepaalt wát er gepersisteerd wordt — bedragen/identiteit
 * komen hier per definitie niet in terug.
 */
export function serializeDraft(state: DraftStateSource): NonSensitiveDraft {
  return {
    lastStep: state.step,
    selectedGoals: [...state.selectedGoals],
    activeModules: [...state.activeModules],
    deferredFields: [...state.deferredFields],
    spaardoel: {
      presetKey: state.spaardoel.presetKey,
      skipped: state.spaardoel.skipped,
    },
    pension: { mode: state.pension.mode },
    retirementExpense: {
      method: state.retirementExpense.method,
      skipped: state.retirementExpense.skipped,
    },
    horizon: {
      fire_end_strategy: state.horizon.fire_end_strategy,
      fire_end_age: state.horizon.fire_end_age,
      temporal_balance: state.horizon.temporal_balance,
    },
  }
}

/**
 * Parse een willekeurig opgeslagen draft-object (mogelijk een OUD, VOL draft
 * met gevoelige velden) en geef uitsluitend de niet-gevoelige velden terug.
 * Dit is tegelijk de migratie-strip: gevoelige keys uit een bestaand oud draft
 * verdwijnen doordat we ze simpelweg niet overnemen.
 *
 * Retourneert `null` wanneer de input geen bruikbaar object is.
 */
export function sanitizeStoredDraft(raw: unknown): NonSensitiveDraft | null {
  if (!raw || typeof raw !== 'object') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- flexibele migratie van onbekende oude shapes
  const p = raw as Record<string, any>

  // selectedGoals — niet-gevoelig; migreer een legacy single-`goal`-draft mee.
  let selectedGoals: GoalSlug[] = []
  if (Array.isArray(p.selectedGoals)) {
    selectedGoals = p.selectedGoals.filter(isGoalSlug)
  } else if (typeof p.goal === 'string' && isGoalSlug(p.goal)) {
    selectedGoals = [p.goal]
  }

  const activeModules: ModuleId[] = Array.isArray(p.activeModules)
    ? p.activeModules
    : Array.isArray(p.selectedModules)
      ? p.selectedModules
      : []

  const deferredFields: DeferredFieldKey[] = Array.isArray(p.deferredFields)
    ? p.deferredFields.filter(
        (k: unknown): k is DeferredFieldKey =>
          k === 'income' || k === 'assets' || k === 'spaardoel',
      )
    : []

  const rawSp =
    p.spaardoel && typeof p.spaardoel === 'object' ? (p.spaardoel as Record<string, unknown>) : {}
  const spaardoel: SpaardoelChoice = {
    presetKey:
      typeof rawSp.presetKey === 'string' &&
      (VALID_PRESET_KEYS as readonly string[]).includes(rawSp.presetKey)
        ? (rawSp.presetKey as SpaardoelPresetKey)
        : null,
    skipped: rawSp.skipped === true,
  }

  const rawPen =
    p.pension && typeof p.pension === 'object' ? (p.pension as Record<string, unknown>) : {}
  const pension: PensionChoice = {
    mode: rawPen.mode === 'estimate' || rawPen.mode === 'upload' ? rawPen.mode : null,
  }

  const rawRet =
    p.retirementExpense && typeof p.retirementExpense === 'object'
      ? (p.retirementExpense as Record<string, unknown>)
      : {}
  const retirementExpense: RetirementExpenseChoice = {
    method: rawRet.method === 'current_income' ? 'current_income' : 'custom_amount',
    skipped: rawRet.skipped === true,
  }

  const rawHor =
    p.horizon && typeof p.horizon === 'object' ? (p.horizon as Record<string, unknown>) : {}
  const horizon: HorizonChoice = {
    fire_end_strategy:
      typeof rawHor.fire_end_strategy === 'string' &&
      (VALID_FIRE_END_STRATEGIES as readonly string[]).includes(rawHor.fire_end_strategy)
        ? (rawHor.fire_end_strategy as FireEndStrategy)
        : 'deplete',
    fire_end_age: typeof rawHor.fire_end_age === 'number' ? rawHor.fire_end_age : 90,
    temporal_balance: typeof rawHor.temporal_balance === 'number' ? rawHor.temporal_balance : 3,
  }

  return {
    lastStep: typeof p.lastStep === 'string' ? p.lastStep : undefined,
    selectedGoals,
    activeModules,
    deferredFields,
    spaardoel,
    pension,
    retirementExpense,
    horizon,
  }
}

/**
 * Niet-gevoelig signaal of er iets zinvols te hervatten valt — vervangt het
 * oude `full_name || date_of_birth`-signaal (die velden persisteren niet meer).
 * True wanneer de gebruiker voorbij de naam-stap was OF een keuze heeft gemaakt.
 */
export function hasResumableDraft(draft: NonSensitiveDraft | null): boolean {
  if (!draft) return false
  const progressedPastNaam = Boolean(draft.lastStep) && draft.lastStep !== 'naam'
  const hasChoices =
    draft.selectedGoals.length > 0 ||
    draft.deferredFields.length > 0 ||
    draft.spaardoel.presetKey !== null ||
    draft.spaardoel.skipped ||
    draft.pension.mode !== null ||
    draft.retirementExpense.skipped
  return progressedPastNaam || hasChoices
}

/** De verplichte identiteitsvelden die de eind-save nodig heeft. */
interface RequiredIdentityFields {
  full_name?: string
  date_of_birth?: string
}

/**
 * Restore-guard: geef de eerste verplichte-maar-lege onboarding-stap terug, of
 * `null` wanneer alle verplichte identiteitsvelden aanwezig zijn.
 *
 * Onder optie A wordt identiteit NOOIT hersteld, dus na een restore is deze
 * altijd leeg → de eind-save wordt bij een lege verplichte staat teruggezet
 * naar de naam-/geboortedatum-stap i.p.v. een payload met lege verplichte
 * velden in te sturen.
 */
export function firstIncompleteRequiredStep(
  identity: RequiredIdentityFields,
  activeStepOrder: readonly string[],
): 'naam' | 'geboortedatum' | null {
  if (!identity.full_name?.trim() && activeStepOrder.includes('naam')) return 'naam'
  if (!identity.date_of_birth?.trim() && activeStepOrder.includes('geboortedatum')) {
    return 'geboortedatum'
  }
  return null
}
