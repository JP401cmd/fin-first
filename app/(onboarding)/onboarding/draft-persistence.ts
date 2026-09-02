/**
 * Onboarding draft-persistence — pure serialisatie/validatie van het lopende
 * onboarding-concept van en naar de SERVER (`profiles.onboarding_draft`).
 *
 * ACHTERGROND — twee besluiten, in deze volgorde:
 *
 *  1. jul 2026 (security): het concept werd volledig client-side in
 *     localStorage bewaard, inclusief GEVOELIGE financiële data. Op een gedeeld
 *     apparaat of via één XSS-gaatje was dat alles leesbaar. Gekozen aanpak
 *     destijds: persistentie minimaliseren — alleen stap-positie en
 *     keuzes-zonder-bedrag bleven bewaard.
 *  2. aug 2026 (kaart UR2-01, P0): die keuze maakte élke page-reload
 *     destructief — naam, bedragen, bezittingen en schulden waren weg en alleen
 *     de stap-teller bleef staan. Voor een app die om gevoelige bedragen vraagt
 *     is dat een blokkerende frictiebron.
 *
 * De huidige aanpak houdt beide besluiten overeind: het concept wordt NIET in
 * localStorage bewaard, maar op de eigen, RLS-gescopede profielrij — dezelfde
 * plek waar dezelfde data na afronding tóch al landt. Transport loopt via
 * `/api/onboarding/draft` (GET/PUT/DELETE); het concept wordt gewist zodra de
 * onboarding is afgerond of afgebroken.
 *
 * ÉÉN VELD BLIJFT BEWUST BUITEN HET CONCEPT: `pension.parseResult` — het
 * geparste pensioenoverzicht. Dat blijft per ADR 0115 op het toestel. Zie
 * `UNRESTORED_DRAFT_KEYS` en de bijbehorende meldingscopy.
 *
 * ROLVERDELING VALIDATIE (bewust gescheiden, niet dubbel):
 *  - `OnboardingDraftSchema` (zod, gebruikt door de route) bewaakt de VORM en de
 *    omvang van wat er de database in gaat — bewust tolerant op halfaf ingevulde
 *    velden: een concept mag nooit geweigerd worden omdat het nog niet compleet
 *    is. Streng valideren gebeurt bij de eind-save (`/api/onboarding/save-own-data`).
 *  - `sanitizeStoredDraft` (client, bij het lezen) versmalt naar de echte
 *    unions van de app en migreert oude concepten. Dat is de typepoort.
 *
 * Deze module bevat pure functies (geen fetch, geen storage) zodat het
 * serialiseer-/herstelgedrag los testbaar is — de page-component doet de
 * daadwerkelijke round-trip en roept deze helpers aan.
 */
import { z } from 'zod'
import type { GoalSlug } from '@/lib/goals/types'
import { isGoalSlug } from '@/lib/goals/catalog'
import type { ModuleId } from '@/lib/module-registry'
import type { SpaardoelPresetKey } from '@/lib/onboarding-presets'
import type { HorizonData, LifeEventEntry } from '@/components/onboarding/onboarding-horizon'
import type { RetirementExpenseState } from '@/components/onboarding/onboarding-uitgaven-pensioen'
import type { PensionDraft } from '@/components/onboarding/onboarding-pensioen'
import type { SectionPhase } from '@/components/onboarding/section-phase'
import type { IdentityData } from '@/components/onboarding/onboarding-identity'
import type { AssetQuickInput, DebtQuickInput } from '@/lib/quick-add/types'
import type { AssetType } from '@/lib/asset-data'
import type { DebtType, RepaymentType } from '@/lib/debt-data'
import { FIRE_END_STRATEGIES, type FireEndStrategy } from '@/lib/fire-strategy'
import type { HouseholdType } from '@/lib/household-type'

/** Velden die de gebruiker expliciet oversloeg via "Later invullen" (feature #830). */
export type DeferredFieldKey = 'income' | 'assets' | 'spaardoel'

/** Huidige conceptversie. Verhoog bij een breaking shape-wijziging. */
export const ONBOARDING_DRAFT_VERSION = 2

/**
 * Spaardoel-substate zoals de orchestrator 'm draagt. Lokaal gedefinieerd
 * (de page exporteert 'm niet) maar structureel identiek.
 */
export interface SpaardoelDraft {
  presetKey: SpaardoelPresetKey | null
  name: string
  target_value: string
  /** 'YYYY-MM' of '' wanneer leeg. */
  target_date: string
  skipped: boolean
}

/**
 * Pensioen in het concept: het gekozen pad plus de handmatige schatting.
 * BEWUST ZONDER `parseResult` — zie ADR 0115.
 */
export interface PensionDraftPersisted {
  mode: PensionDraft['mode']
  grossMonthly: string
  startAge: string
}

/**
 * Het complete concept dat naar de server geschreven wordt. Bevat alle
 * antwoorden die de gebruiker tot dusver gaf, zodat een reload niets wist.
 */
export interface OnboardingDraft {
  version: number
  lastStep?: string
  identity: IdentityData
  selectedGoals: GoalSlug[]
  activeModules: ModuleId[]
  deferredFields: DeferredFieldKey[]
  budgetAmounts: Record<string, number>
  quickAssets: AssetQuickInput[]
  quickDebts: DebtQuickInput[]
  bezittingenPhases: SectionPhase[]
  schuldenPhases: SectionPhase[]
  spaardoel: SpaardoelDraft
  pension: PensionDraftPersisted
  retirementExpense: RetirementExpenseState
  horizon: HorizonData
}

/**
 * De velden die ook mét server-concept NIET terugkomen na een reload.
 * Geëxporteerd zodat de herstelmelding er via een `Record<...>` op vastzit:
 * komt er een veld bij, dan is de copy compile-time verplicht om het te noemen.
 */
export const UNRESTORED_DRAFT_KEYS = ['pensionParseResult'] as const

const VALID_PRESET_KEYS: readonly SpaardoelPresetKey[] = [
  'noodfonds',
  'vakantie',
  'auto',
  'aanbetaling',
  'groei',
  'custom',
]

// De canonieke allowlist (ADR 0127 D9). De onboarding BIEDT 'nu-stoppen' niet aan
// (een nieuwe gebruiker zonder plan hoort daar niet mee te beginnen), maar een
// opgeslagen concept mag de waarde niet stil naar 'deplete' vouwen.
const VALID_FIRE_END_STRATEGIES: readonly FireEndStrategy[] = FIRE_END_STRATEGIES

const VALID_HOUSEHOLD_TYPES: readonly HouseholdType[] = ['solo', 'samen', 'gezin']

// ── Transport-schema (server) ────────────────────────────────
// Bewust tolerant: dit bewaakt de VORM en de omvang van het concept, niet de
// volledigheid ervan. Een half ingevulde post mag het opslaan van het concept
// nooit blokkeren — dan zou de gebruiker juist tijdens het invullen ongemerkt
// zonder vangnet zitten. De narrowing naar de echte unions gebeurt bij het
// lezen, in `sanitizeStoredDraft`.

/** Bovengrens op vrije tekst in het concept — houdt de jsonb-rij begrensd. */
const DRAFT_TEXT_MAX = 200

const draftText = z.string().max(DRAFT_TEXT_MAX)

/** Field3 is polymorf — de betekenis hangt van het asset-/schuldtype af. */
const Field3Schema = z.union([draftText, z.number().finite(), z.null()]).optional()

/** Bovengrens op het aantal budgetposten in een concept (zie `budgetAmounts`). */
const MAX_BUDGET_KEYS = 200

const AssetDraftSchema = z.object({
  asset_type: draftText,
  name: draftText,
  current_value: z.number().finite(),
  field3: Field3Schema,
  expected_return: z.number().finite().nullable().optional(),
  client_ref: z.string().max(64).optional(),
})

const DebtDraftSchema = z.object({
  debt_type: draftText,
  name: draftText,
  current_balance: z.number().finite(),
  field3: Field3Schema,
  repayment_type: draftText.nullable().optional(),
  start_date: draftText.nullable().optional(),
  linked_asset_id: draftText.nullable().optional(),
  linked_client_ref: z.string().max(64).nullable().optional(),
  monthly_payment: z.number().finite().nullable().optional(),
  term_years: z.number().finite().nullable().optional(),
})

const SectionPhaseSchema = z.object({
  kind: draftText,
  qIndex: z.number().finite().optional(),
})

const LifeEventSchema = z.object({
  name: draftText,
  event_type: draftText,
  target_age: z.number().finite(),
  monthly_income_change: z.number().finite().optional(),
  monthly_cost_change: z.number().finite().optional(),
  one_time_cost: z.number().finite().optional(),
  duration_months: z.number().finite().optional(),
  is_active: z.boolean(),
})

/**
 * Het concept zoals de PUT-route het accepteert. `strict()` op het topniveau:
 * onbekende sleutels worden geweigerd i.p.v. stilzwijgend in de profielrij
 * bewaard — dat is de eigenschap die voorkomt dat er ooit ongemerkt een veld
 * meelift dat niet bewaard mág worden (bv. het pensioenoverzicht, ADR 0115).
 */
export const OnboardingDraftSchema = z
  .object({
    version: z.number().int().finite(),
    lastStep: draftText.optional(),
    identity: z
      .object({
        full_name: draftText,
        date_of_birth: draftText,
        household_type: draftText,
        number_of_children: z.number().finite(),
        net_monthly_income: draftText,
        estimated_yearly_income: draftText,
        estimated_monthly_expenses: draftText,
      })
      .strict(),
    selectedGoals: z.array(draftText).max(20),
    activeModules: z.array(draftText).max(20),
    deferredFields: z.array(draftText).max(10),
    // `z.record` kent geen `.max()`, dus de sleuteltelling gaat via een refine.
    // Zonder die cap was dit de ENIGE onbegrensde collectie in het schema —
    // alle zusters hebben er een — en daarmee het pad waarlangs een ingelogde
    // gebruiker de zod-walk over miljoenen sleutels kon laten lopen vóórdat de
    // totaalgrens verderop toesloeg. De app kent enkele tientallen
    // budgetcategorieën; 200 is ruime bovengrens.
    budgetAmounts: z
      .record(z.string().max(64), z.number().finite())
      .refine((v) => Object.keys(v).length <= MAX_BUDGET_KEYS, {
        message: `Hoogstens ${MAX_BUDGET_KEYS} budgetposten in een concept`,
      }),
    quickAssets: z.array(AssetDraftSchema).max(100),
    quickDebts: z.array(DebtDraftSchema).max(100),
    bezittingenPhases: z.array(SectionPhaseSchema).max(50),
    schuldenPhases: z.array(SectionPhaseSchema).max(50),
    spaardoel: z
      .object({
        presetKey: draftText.nullable(),
        name: draftText,
        target_value: draftText,
        target_date: draftText,
        skipped: z.boolean(),
      })
      .strict(),
    pension: z
      .object({
        mode: draftText.nullable(),
        grossMonthly: draftText,
        startAge: draftText,
      })
      .strict(),
    retirementExpense: z
      .object({
        method: draftText,
        customAmount: draftText,
        skipped: z.boolean(),
      })
      .strict(),
    horizon: z
      .object({
        fire_end_strategy: draftText,
        fire_end_age: z.number().finite(),
        fire_legacy_amount: draftText,
        retirement_expense_method: draftText,
        retirement_custom_amount: draftText,
        temporal_balance: z.number().finite(),
        life_events: z.array(LifeEventSchema).max(50),
      })
      .strict(),
  })
  .strict()

/** Body-schema van `PUT /api/onboarding/draft`. */
export const OnboardingDraftBodySchema = z.object({ draft: OnboardingDraftSchema })

/**
 * Structurele subset van de onboarding-`State` die `serializeDraft` leest. De
 * volledige `State` is hier structureel aan toewijsbaar.
 */
export interface DraftStateSource {
  step: string
  identity: IdentityData
  selectedGoals: GoalSlug[]
  activeModules: ModuleId[]
  deferredFields: DeferredFieldKey[]
  budgetAmounts: Record<string, number>
  quickAssets: AssetQuickInput[]
  quickDebts: DebtQuickInput[]
  bezittingenPhases: SectionPhase[]
  schuldenPhases: SectionPhase[]
  spaardoel: SpaardoelDraft
  pension: PensionDraft
  retirementExpense: RetirementExpenseState
  horizon: HorizonData
}

/**
 * Bouw het concept uit de volledige onboarding-state. Enige plek die bepaalt
 * wát er gepersisteerd wordt — `pension.parseResult` komt hier per definitie
 * niet in terug (ADR 0115).
 */
export function serializeDraft(state: DraftStateSource): OnboardingDraft {
  return {
    version: ONBOARDING_DRAFT_VERSION,
    lastStep: state.step,
    identity: { ...state.identity },
    selectedGoals: [...state.selectedGoals],
    activeModules: [...state.activeModules],
    deferredFields: [...state.deferredFields],
    budgetAmounts: { ...state.budgetAmounts },
    quickAssets: state.quickAssets.map((a) => ({ ...a })),
    quickDebts: state.quickDebts.map((d) => ({ ...d })),
    bezittingenPhases: state.bezittingenPhases.map((p) => ({ ...p })),
    schuldenPhases: state.schuldenPhases.map((p) => ({ ...p })),
    spaardoel: { ...state.spaardoel },
    pension: {
      mode: state.pension.mode,
      grossMonthly: state.pension.grossMonthly,
      startAge: state.pension.startAge,
    },
    retirementExpense: { ...state.retirementExpense },
    horizon: { ...state.horizon, life_events: state.horizon.life_events.map((e) => ({ ...e })) },
  }
}

// ── Lees-kant: narrowing + migratie ──────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any -- defensieve migratie van onbekende oude shapes */

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function obj(v: unknown): Record<string, any> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {}
}

function sanitizeIdentity(raw: unknown): IdentityData {
  const p = obj(raw)
  const householdType = str(p.household_type)
  return {
    full_name: str(p.full_name),
    date_of_birth: str(p.date_of_birth),
    household_type: (VALID_HOUSEHOLD_TYPES as readonly string[]).includes(householdType)
      ? (householdType as HouseholdType)
      : 'solo',
    number_of_children: num(p.number_of_children, 0),
    net_monthly_income: str(p.net_monthly_income),
    estimated_yearly_income: str(p.estimated_yearly_income),
    estimated_monthly_expenses: str(p.estimated_monthly_expenses),
  }
}

function sanitizeAssets(raw: unknown): AssetQuickInput[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item) => obj(item).asset_type)
    .map((item) => {
      const p = obj(item)
      const out: AssetQuickInput = {
        asset_type: str(p.asset_type) as AssetType,
        name: str(p.name),
        current_value: num(p.current_value, 0),
      }
      if (p.field3 !== undefined) out.field3 = p.field3 as AssetQuickInput['field3']
      if (typeof p.expected_return === 'number') out.expected_return = p.expected_return
      if (typeof p.client_ref === 'string') out.client_ref = p.client_ref
      return out
    })
}

function sanitizeDebts(raw: unknown): DebtQuickInput[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item) => obj(item).debt_type)
    .map((item) => {
      const p = obj(item)
      const out: DebtQuickInput = {
        debt_type: str(p.debt_type) as DebtType,
        name: str(p.name),
        current_balance: num(p.current_balance, 0),
      }
      if (p.field3 !== undefined) out.field3 = p.field3 as DebtQuickInput['field3']
      if (typeof p.repayment_type === 'string') {
        out.repayment_type = p.repayment_type as RepaymentType
      }
      if (typeof p.start_date === 'string') out.start_date = p.start_date
      if (typeof p.linked_asset_id === 'string') out.linked_asset_id = p.linked_asset_id
      if (typeof p.linked_client_ref === 'string') out.linked_client_ref = p.linked_client_ref
      if (typeof p.monthly_payment === 'number') out.monthly_payment = p.monthly_payment
      if (typeof p.term_years === 'number') out.term_years = p.term_years
      return out
    })
}

const VALID_PHASE_KINDS = [
  'ask',
  'more',
  'other-ask',
  'pick-many',
  'other-pick',
  'other-more',
  'review',
] as const

function sanitizePhases(raw: unknown): SectionPhase[] {
  if (!Array.isArray(raw)) return []
  const out: SectionPhase[] = []
  for (const item of raw) {
    const p = obj(item)
    const kind = str(p.kind)
    if (!(VALID_PHASE_KINDS as readonly string[]).includes(kind)) continue
    if (kind === 'ask' || kind === 'more') {
      out.push({ kind, qIndex: num(p.qIndex, 0) })
    } else {
      out.push({ kind } as SectionPhase)
    }
  }
  return out
}

function sanitizeBudgetAmounts(raw: unknown): Record<string, number> {
  const p = obj(raw)
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(p)) {
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
  }
  return out
}

function sanitizeLifeEvents(raw: unknown): LifeEventEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item) => typeof obj(item).name === 'string')
    .map((item) => {
      const p = obj(item)
      const out: LifeEventEntry = {
        name: str(p.name),
        event_type: str(p.event_type),
        target_age: num(p.target_age, 0),
        is_active: p.is_active !== false,
      }
      if (typeof p.monthly_income_change === 'number') {
        out.monthly_income_change = p.monthly_income_change
      }
      if (typeof p.monthly_cost_change === 'number') out.monthly_cost_change = p.monthly_cost_change
      if (typeof p.one_time_cost === 'number') out.one_time_cost = p.one_time_cost
      if (typeof p.duration_months === 'number') out.duration_months = p.duration_months
      return out
    })
}

/**
 * Parse een opgeslagen concept (mogelijk een OUD v1-concept dat alleen
 * stap-positie en keuzes-zonder-bedrag bevat) naar de huidige shape. Ontbrekende
 * velden krijgen hun lege beginwaarde — een v1-concept hervat dus nog steeds op
 * de juiste stap, alleen zonder bedragen die er destijds niet in stonden.
 *
 * Retourneert `null` wanneer de input geen bruikbaar object is.
 */
export function sanitizeStoredDraft(raw: unknown): OnboardingDraft | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const p = raw as Record<string, any>

  // selectedGoals — migreer een legacy single-`goal`-concept mee.
  let selectedGoals: GoalSlug[] = []
  if (Array.isArray(p.selectedGoals)) {
    selectedGoals = p.selectedGoals.filter(isGoalSlug)
  } else if (typeof p.goal === 'string' && isGoalSlug(p.goal)) {
    selectedGoals = [p.goal]
  }

  const activeModules: ModuleId[] = Array.isArray(p.activeModules)
    ? p.activeModules.filter((m: unknown): m is ModuleId => typeof m === 'string')
    : Array.isArray(p.selectedModules)
      ? p.selectedModules.filter((m: unknown): m is ModuleId => typeof m === 'string')
      : []

  const deferredFields: DeferredFieldKey[] = Array.isArray(p.deferredFields)
    ? p.deferredFields.filter(
        (k: unknown): k is DeferredFieldKey =>
          k === 'income' || k === 'assets' || k === 'spaardoel',
      )
    : []

  const rawSp = obj(p.spaardoel)
  const spaardoel: SpaardoelDraft = {
    presetKey:
      typeof rawSp.presetKey === 'string' &&
      (VALID_PRESET_KEYS as readonly string[]).includes(rawSp.presetKey)
        ? (rawSp.presetKey as SpaardoelPresetKey)
        : null,
    name: str(rawSp.name),
    target_value: str(rawSp.target_value),
    target_date: str(rawSp.target_date),
    skipped: rawSp.skipped === true,
  }

  const rawPen = obj(p.pension)
  const pension: PensionDraftPersisted = {
    mode: rawPen.mode === 'estimate' || rawPen.mode === 'upload' ? rawPen.mode : null,
    grossMonthly: str(rawPen.grossMonthly),
    startAge: str(rawPen.startAge),
  }

  const rawRet = obj(p.retirementExpense)
  const retirementExpense: RetirementExpenseState = {
    method: rawRet.method === 'current_income' ? 'current_income' : 'custom_amount',
    customAmount: str(rawRet.customAmount),
    skipped: rawRet.skipped === true,
  }

  const rawHor = obj(p.horizon)
  const horizon: HorizonData = {
    fire_end_strategy:
      typeof rawHor.fire_end_strategy === 'string' &&
      (VALID_FIRE_END_STRATEGIES as readonly string[]).includes(rawHor.fire_end_strategy)
        ? (rawHor.fire_end_strategy as FireEndStrategy)
        : 'deplete',
    fire_end_age: num(rawHor.fire_end_age, 90),
    fire_legacy_amount: str(rawHor.fire_legacy_amount),
    retirement_expense_method:
      rawHor.retirement_expense_method === 'essential_budgets' ||
      rawHor.retirement_expense_method === 'custom_amount'
        ? rawHor.retirement_expense_method
        : 'current_income',
    retirement_custom_amount: str(rawHor.retirement_custom_amount),
    temporal_balance: num(rawHor.temporal_balance, 3),
    life_events: sanitizeLifeEvents(rawHor.life_events),
  }

  return {
    version: num(p.version, 1),
    lastStep: typeof p.lastStep === 'string' ? p.lastStep : undefined,
    identity: sanitizeIdentity(p.identity),
    selectedGoals,
    activeModules,
    deferredFields,
    budgetAmounts: sanitizeBudgetAmounts(p.budgetAmounts),
    quickAssets: sanitizeAssets(p.quickAssets),
    quickDebts: sanitizeDebts(p.quickDebts),
    bezittingenPhases: sanitizePhases(p.bezittingenPhases),
    schuldenPhases: sanitizePhases(p.schuldenPhases),
    spaardoel,
    pension,
    retirementExpense,
    horizon,
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Is er iets zinvols te hervatten? True zodra de gebruiker voorbij de naam-stap
 * was, een keuze maakte, óf daadwerkelijk iets invulde (naam, bedragen, posten).
 */
export function hasResumableDraft(draft: OnboardingDraft | null): boolean {
  if (!draft) return false
  const progressedPastNaam = Boolean(draft.lastStep) && draft.lastStep !== 'naam'
  const hasChoices =
    draft.selectedGoals.length > 0 ||
    draft.deferredFields.length > 0 ||
    draft.spaardoel.presetKey !== null ||
    draft.spaardoel.skipped ||
    draft.pension.mode !== null ||
    draft.retirementExpense.skipped
  const hasAnswers =
    draft.identity.full_name.trim() !== '' ||
    draft.identity.date_of_birth.trim() !== '' ||
    draft.identity.estimated_yearly_income.trim() !== '' ||
    draft.identity.estimated_monthly_expenses.trim() !== '' ||
    draft.quickAssets.length > 0 ||
    draft.quickDebts.length > 0 ||
    Object.keys(draft.budgetAmounts).length > 0
  return progressedPastNaam || hasChoices || hasAnswers
}

/** De verplichte identiteitsvelden die de eind-save nodig heeft. */
interface RequiredIdentityFields {
  full_name?: string
  date_of_birth?: string
}

/**
 * Finish-guard: geef de eerste verplichte-maar-lege onboarding-stap terug, of
 * `null` wanneer alle verplichte identiteitsvelden aanwezig zijn.
 *
 * Blijft ook mét volledig herstel nodig: een gebruiker kan via "Later invullen"
 * of een oud (v1-)concept op een latere stap staan met een lege naam. Zonder
 * deze guard zou de eind-save een payload met lege verplichte velden insturen.
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
