import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { serverError, unauthorized } from '@/lib/api/respond'
import {
  END_AGE_MAX,
  END_AGE_MIN,
  FIRE_PLAN_COLUMNS,
  STOP_AGE_BEFORE_END_AGE_ERROR,
  isFireEndStrategy,
  parseFirePlan,
  stopAgeConflictsWithEndAge,
  validateStopAnchorInput,
  type StopAnchorKind,
} from '@/lib/fire-strategy'

/**
 * ── VOLGORDE-EIS (ADR 0127), afgehandeld ───────────────────────────────────
 * Deze route accepteerde een eigen, met de hand bijgehouden viertal omdat de
 * DB-CHECK op `profiles.fire_end_strategy` 'nu-stoppen' nog niet toestond:
 * accepteren wat de database weigert, laat een geldige gebruikersinvoer in een
 * constraint-violation eindigen. Migratie 20260902120000 is uitgerold en
 * geregistreerd op 2 sep 2026 (constraint geverifieerd op vijf waarden), dus de
 * validatie loopt nu via `isFireEndStrategy` — de canonieke allowlist, afgeleid
 * van `STRATEGY_LABELS`. Eén bron; een zesde strategie hoeft hier nooit meer
 * met de hand bij.
 *
 * Blijft gelden voor wie hierna een strategie toevoegt: eerst de migratie, dan
 * pas het nieuwe lid in `STRATEGY_LABELS` — want dát maakt hem app-breed
 * kiesbaar én hier geldig, in één keer.
 */
const VALID_RETIREMENT_METHODS = ['essential_budgets', 'custom_amount', 'current_income'] as const

/**
 * Legacy-schaduwpad (maart 2026): toen de DB-CHECK 'pensioen' nog niet kende, parkeerde
 * deze route bij een 23514-violation de kolom op 'deplete' en de échte keuze in
 * `profiles.feature_preferences.fire_strategy_override`. Dat pad bestaat ALLEEN nog
 * voor exact die situatie ('pensioen' op een database zonder de pensioen-migratie).
 *
 * WAAROM NIET VOOR ANDERE WAARDEN (ADR 0127-review): het schaduwpad antwoordde met
 * HTTP 200 `success: true` terwijl het GET-terugleespad hardcoded op 'pensioen' stond —
 * kies "Nu stoppen", zie een geslaagde opslag, herlaad en zie "Vermogen opeten". Stil
 * verlies van een bewuste keuze is slechter dan een luide fout. Voor elke andere
 * waarde die de database weigert geeft PUT daarom een eerlijke 409 en schrijft NIETS.
 */
const FP_KEY = 'fire_strategy_override'
const LEGACY_SHADOW_STRATEGY = 'pensioen'

/**
 * ── Het PLAN: stop-anker × eind-vorm (ADR 0129) ────────────────────────────
 *
 * De vijf plan-kolommen (`fire_end_strategy`, `fire_end_age`, `fire_legacy_amount`,
 * `fire_stop_anchor`, `fire_stop_age`) zijn ÉÉN blok en gaan in ÉÉN UPDATE
 * (contract-ronde R1). Tot 5 sep 2026 gingen eind-vorm en anker in twee statements,
 * met een 42703-vangnet omdat migratie 20260903140000 nog niet was uitgerold. Beide
 * migraties (kolommen + backfill 20260903141000) zijn live en geregistreerd, dus dat
 * pad is dood; wat overbleef was een schrijfvolgorde waarin een falend tweede
 * statement een half plan achterliet (statement 1 schrijft 'legacy' → het D2-anker
 * valt weg terwijl de kolom nog 'aow' draagt; statement 2 faalt → `aow × legacy`
 * waar `solved × legacy` gevraagd was).
 *
 * HET CONTRACT (R3 — symmetrisch, geen geladen defaults). Twee complete vormen:
 *  - VOLLEDIG (F3b-client): alle plan-velden — `fire_end_strategy` + `fire_end_age`
 *    (+ `fire_legacy_amount`, afwezig ⇒ null) + `fire_stop_anchor` (+ `fire_stop_age`
 *    uitsluitend bij anker `age`). Dit is de vorm die het anker mag raken.
 *  - EIND-VORM-ALLEEN (pre-F3b-client — strategie-modal, module-activatie,
 *    eindstrategie-body, uitgaven-na-pensioen): `fire_end_strategy` + `fire_end_age`
 *    zónder ankervelden. Het anker blijft dan ONAANGERAAKT (een oudere client mag een
 *    zelfgekozen stopmoment niet stil op 'solved' zetten), behalve wanneer de
 *    legacy-label zélf een anker draagt ('pensioen' → aow, 'nu-stoppen' → now): dan
 *    schrijft dezelfde UPDATE ook de ankerkolom, zodat geen rij zichzelf tegenspreekt
 *    (D2 blijft de leesregel, maar hoeft niets meer recht te zetten).
 *  - Elke andere combinatie is een DEEL-PLAN en krijgt een 400: alleen een anker,
 *    alleen een eindleeftijd, een strategie zonder eindleeftijd. Vóór deze ronde
 *    vulde de route `'deplete'`/`90` in voor wat ontbrak — sinds M1 is `fire_end_age
 *    = 100` voor de live pensioen-gebruikers dragend, dus een client die alleen
 *    `{fire_stop_anchor:'aow'}` stuurde zette stil `deplete × aow × 90`.
 *  - Géén plan-veld in de body ⇒ het plan wordt niet geraakt en alleen de losse
 *    velden (`deficit_loan_rate`, `retirement_*`, `monthly_savings_override`) gaan
 *    mee. Een lege body is een client-fout → 400.
 *
 * Waarom niet "alle vijf altijd verplicht" (de eerste optie uit de review): dat had
 * élke live client vandaag een 400 gegeven — geen daarvan kent het anker vóór F3b.
 * Waarom niet "geen enkel plan-veld raken als er één ontbreekt" (de tweede): dan
 * had diezelfde client zijn strategiewissel stil verloren zien gaan — precies de
 * verliesklasse die deze route hoort uit te sluiten. F4 laat de eind-vorm-alleen-vorm
 * vervallen zodra elke client het volledige plan stuurt.
 *
 * KRUISTOETS (R2): stuurt de client een expliciet anker, dan moet
 * `fire_end_strategy` een eind-vorm zijn (`deplete`/`legacy`/`perpetual`).
 * `pensioen`/`nu-stoppen` dragen zelf al een anker; `{pensioen, age 58}` gaf een
 * 200 met echo 58 terwijl lezen (D2, legacy wint) altijd `aow` gaf.
 *
 * B7 (R4): `fire_stop_age ≥ fire_end_age` → 400. De kernel klemt zo'n waarde stil op
 * `eind − 1/12`; "stil afronden vervalst een keuze" geldt hier onverkort. De
 * AOW-variant (`fire_end_age ≤ AOW` onder anker `aow`) toetst de route NIET: ze kent
 * de AOW-leeftijd van de gebruiker niet zonder extra query; F3b heeft die in de UI.
 */
const EINDVORM_KEYS = ['fire_end_strategy', 'fire_end_age', 'fire_legacy_amount'] as const
const ANCHOR_KEYS = ['fire_stop_anchor', 'fire_stop_age'] as const

interface StopAnchorInput {
  anchor: StopAnchorKind
  stopAge: number | null
}

/** Het gevalideerde plan-blok, klaar voor de ene UPDATE. */
interface PlanInput {
  strategy: string
  endAge: number
  legacyAmount: number | null
  /** `null` ⇒ de ankerkolommen worden niet geraakt (eind-vorm-alleen-vorm). */
  anchor: StopAnchorInput | null
}

/**
 * Valideer anker + stopleeftijd uit de request-body.
 *
 * De toets zelf woont in `validateStopAnchorInput` (lib/fire-strategy.ts) en wordt
 * sinds 5 sep 2026 gedeeld met `POST /api/onboarding/save-own-data` — de
 * onboarding-stap "Jouw plan" schrijft hetzelfde anker. Eén toets, twee routes;
 * gedrag en fouttexten hier zijn ongewijzigd (halve jaren, 18–100, `age` ⟺
 * leeftijd aanwezig). Zie de docstring dáár voor waarom lezen tolerant is en
 * schrijven streng.
 */
function parseStopAnchorInput(body: Record<string, unknown>): StopAnchorInput | { error: string } {
  return validateStopAnchorInput(body.fire_stop_anchor ?? 'solved', body.fire_stop_age)
}

/**
 * Het plan uit de body — `null` als de body geen enkel plan-veld draagt (dan raakt
 * de PUT het plan niet), anders het gevalideerde blok of een leesbare 400-tekst.
 */
function parsePlanInput(body: Record<string, unknown>): PlanInput | null | { error: string } {
  const eindvormInBody = EINDVORM_KEYS.some((k) => k in body)
  const anchorInBody = ANCHOR_KEYS.some((k) => k in body)
  if (!eindvormInBody && !anchorInBody) return null

  // R3 — geen geladen defaults: wat ontbreekt wordt niet ingevuld maar afgewezen.
  if (!('fire_end_strategy' in body) || !('fire_end_age' in body)) {
    return {
      error: anchorInBody && !eindvormInBody
        ? 'Een stopmoment reist alleen mee met het volledige plan: stuur ook fire_end_strategy en fire_end_age.'
        : 'fire_end_strategy en fire_end_age horen samen in één verzoek.',
    }
  }

  const strategy = String(body.fire_end_strategy)
  if (!isFireEndStrategy(strategy)) {
    return { error: `Ongeldige strategie: ${strategy}` }
  }
  const endAge = Number(body.fire_end_age)
  // Zelfde grens als de DB-CHECK en de client-validatie — één bron (lib/fire-strategy).
  if (!Number.isFinite(endAge) || endAge < END_AGE_MIN || endAge > END_AGE_MAX) {
    return { error: `Eindleeftijd moet tussen ${END_AGE_MIN} en ${END_AGE_MAX} liggen` }
  }
  const legacyAmount = body.fire_legacy_amount != null ? Number(body.fire_legacy_amount) : null

  const legacyAnchor: StopAnchorKind | null =
    strategy === 'pensioen' ? 'aow' : strategy === 'nu-stoppen' ? 'now' : null

  if (!anchorInBody) {
    // Eind-vorm-alleen: het anker blijft staan, tenzij de legacy-label er zelf één draagt.
    return {
      strategy,
      endAge,
      legacyAmount,
      anchor: legacyAnchor === null ? null : { anchor: legacyAnchor, stopAge: null },
    }
  }

  // R2 — kruistoets: een expliciet anker vraagt om een eind-vorm, geen legacy-label.
  if (legacyAnchor !== null) {
    return {
      error: `Kies een eind-vorm (deplete, legacy of perpetual) wanneer je een stopmoment meestuurt; "${strategy}" draagt zelf al een anker.`,
    }
  }
  const parsed = parseStopAnchorInput(body)
  if ('error' in parsed) return parsed

  // R4 (B7) — een stopleeftijd op of voorbij de eindleeftijd laat geen plan over om te toetsen.
  if (stopAgeConflictsWithEndAge(parsed, endAge)) {
    return { error: STOP_AGE_BEFORE_END_AGE_ERROR }
  }

  return { strategy, endAge, legacyAmount, anchor: parsed }
}

/**
 * Terugleespad van de override — GENERIEK: elke waarde op de canonieke allowlist
 * telt, zodat een derde of vierde strategie nooit over dezelfde kabel struikelt als
 * 'nu-stoppen' deed. De kolom wint zodra ze iets anders draagt dan de
 * 'deplete'-parkeerwaarde van het schaduwpad (spiegel van
 * `resolveFireStrategyWithOverride` in lib/fire-strategy.ts).
 */
function resolveStoredStrategy(
  column: string | null | undefined,
  featurePreferences: unknown,
): string {
  const stored = column ?? 'deplete'
  if (stored !== 'deplete') return stored
  const fp = (featurePreferences ?? {}) as Record<string, unknown>
  const override = fp[FP_KEY]
  if (isFireEndStrategy(override) && override !== 'deplete') return override
  return stored
}

// ── GET — Read current FIRE settings ─────────────────────────────────

export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  // Eén select voor het hele plan (FIRE_PLAN_COLUMNS, L1) — de ankerkolommen zijn
  // live (migratie 20260903140000 + backfill 20260903141000), dus geen aparte query
  // en geen 42703-vangnet meer.
  const { data, error } = await supabase
    .from('profiles')
    .select(`retirement_expense_method, retirement_expense_custom_amount, ${FIRE_PLAN_COLUMNS}, feature_preferences, deficit_loan_rate`)
    .eq('id', claims.sub)
    .single()

  if (error) return NextResponse.json({ error: 'Fout bij laden' }, { status: 500 })

  const row = (data ?? {}) as {
    retirement_expense_method?: string | null
    retirement_expense_custom_amount?: number | null
    fire_end_strategy?: string | null
    fire_end_age?: number | null
    fire_legacy_amount?: number | string | null
    fire_stop_anchor?: string | null
    fire_stop_age?: number | string | null
    feature_preferences?: unknown
    deficit_loan_rate?: number | null
  }
  const strategy = resolveStoredStrategy(row.fire_end_strategy, row.feature_preferences)

  // Het anker via de ENE parser (D2: een legacy-label in de oude kolom wint), met de
  // override al opgelost — spiegel van `resolveFirePlan` in de kernel-adapter, zodat
  // route en kernel nooit twee lezingen van dezelfde rij hebben.
  const plan = parseFirePlan({ ...row, fire_end_strategy: strategy })

  // monthly_savings_override — aparte maybeSingle() zodat ontbrekende kolom
  // op legacy DBs (migratie 20260513000001 nog niet gerund) graceful null
  // returnt ipv 500.
  let monthlySavingsOverride: number | null = null
  const { data: overrideData, error: overrideError } = await supabase
    .from('profiles')
    .select('monthly_savings_override')
    .eq('id', claims.sub)
    .maybeSingle()
  if (!overrideError && overrideData) {
    const raw = (overrideData as { monthly_savings_override?: number | string | null }).monthly_savings_override
    monthlySavingsOverride = raw == null ? null : Number(raw)
  }

  return NextResponse.json({
    fire_stop_anchor: plan.anchor.kind,
    fire_stop_age: plan.anchor.kind === 'age' ? plan.anchor.age : null,
    retirement_expense_method: row.retirement_expense_method ?? 'essential_budgets',
    retirement_expense_custom_amount: row.retirement_expense_custom_amount ?? null,
    fire_end_strategy: strategy,
    fire_end_age: row.fire_end_age ?? 90,
    fire_legacy_amount: row.fire_legacy_amount ?? null,
    monthly_savings_override: monthlySavingsOverride,
    // V7 — tekort-lening-jaarrente (0..1). NULL = adapter gebruikt Excel-default 0,05.
    deficit_loan_rate: row.deficit_loan_rate ?? null,
  })
}

// ── PUT — Save FIRE settings (legacy CHECK-constraint fallback alleen voor 'pensioen') ──

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
  }

  // ── Het plan: één gevalideerd blok of niets ────────────────────────────────
  const planParsed = parsePlanInput(body)
  if (planParsed !== null && 'error' in planParsed) {
    return NextResponse.json({ error: planParsed.error }, { status: 400 })
  }
  const plan: PlanInput | null = planParsed

  // V7 — tekort-lening-jaarrente (optioneel). null = wis (adapter → Excel-default 0,05).
  // Alleen meenemen wanneer expliciet in de body; gevalideerd op 0..1 (= DB-CHECK).
  let deficitLoanRate: number | null | undefined
  if ('deficit_loan_rate' in body) {
    if (body.deficit_loan_rate == null) {
      deficitLoanRate = null
    } else {
      const dlr = Number(body.deficit_loan_rate)
      if (!Number.isFinite(dlr) || dlr < 0 || dlr > 1) {
        return NextResponse.json({ error: 'deficit_loan_rate moet tussen 0 en 1 liggen' }, { status: 400 })
      }
      deficitLoanRate = dlr
    }
  }

  // Build update payload — het plan als één blok (R1), losse velden alleen wanneer
  // expliciet aanwezig.
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (plan) {
    updatePayload.fire_end_strategy = plan.strategy
    updatePayload.fire_end_age = plan.endAge
    updatePayload.fire_legacy_amount = plan.legacyAmount
    if (plan.anchor) {
      updatePayload.fire_stop_anchor = plan.anchor.anchor
      updatePayload.fire_stop_age = plan.anchor.stopAge
    }
  }
  if (deficitLoanRate !== undefined) updatePayload.deficit_loan_rate = deficitLoanRate

  if ('retirement_expense_method' in body) {
    const retirementMethod = String(body.retirement_expense_method ?? 'essential_budgets')
    if (!VALID_RETIREMENT_METHODS.includes(retirementMethod as typeof VALID_RETIREMENT_METHODS[number])) {
      return NextResponse.json({ error: `Ongeldige retirement methode: ${retirementMethod}` }, { status: 400 })
    }
    updatePayload.retirement_expense_method = retirementMethod
    updatePayload.retirement_expense_custom_amount = body.retirement_expense_custom_amount != null ? Number(body.retirement_expense_custom_amount) : null
  }

  // monthly_savings_override — alleen meenemen als expliciet aanwezig in body.
  // Apart bijgewerkt na de hoofd-update zodat een ontbrekende kolom (legacy DBs
  // zonder migratie 20260513000001) niet de hele save laat falen. Dit is de ENIGE
  // kolom die nog een eigen statement heeft — die is écht optioneel op legacy-DB's.
  const overrideInBody = 'monthly_savings_override' in body
  const overrideValue = overrideInBody
    ? (body.monthly_savings_override == null ? null : Number(body.monthly_savings_override))
    : undefined

  // Niets te schrijven (alleen updated_at) en geen override → client-fout, geen stille no-op.
  if (Object.keys(updatePayload).length === 1 && !overrideInBody) {
    return NextResponse.json({ error: 'Geen instellingen om op te slaan' }, { status: 400 })
  }

  // De ene UPDATE — plan + losse velden atomair.
  const { error } = await supabase.from('profiles').update(updatePayload).eq('id', user.id)

  if (!error) {
    // Success — de kolom draagt de keuze zelf; een eventuele (stale) override weg.
    if (plan) {
      const { data: current } = await supabase.from('profiles').select('feature_preferences').eq('id', user.id).single()
      const fp = (current?.feature_preferences ?? {}) as Record<string, unknown>
      if (fp[FP_KEY]) {
        delete fp[FP_KEY]
        await supabase.from('profiles').update({ feature_preferences: fp }).eq('id', user.id)
      }
    }
    // monthly_savings_override — defensieve aparte update zodat een ontbrekende
    // kolom op legacy DBs niet de hele save laat falen. Bij missing-column-error
    // loggen we maar retourneren we nog steeds success voor de andere velden.
    if (overrideInBody) {
      const { error: overrideError } = await supabase
        .from('profiles')
        .update({ monthly_savings_override: overrideValue })
        .eq('id', user.id)
      if (overrideError) {
        console.warn('[fire-settings] monthly_savings_override update failed (column may be missing):', overrideError.message)
      }
    }
    return NextResponse.json({
      success: true,
      ...updatePayload,
      monthly_savings_override: overrideValue,
    })
  }

  // CHECK-constraint-violation (23514) op de strategiekolom: de database kent deze
  // waarde (nog) niet.
  if (plan && error.code === '23514' && error.message?.includes('fire_end_strategy')) {
    if (plan.strategy !== LEGACY_SHADOW_STRATEGY) {
      // EERLIJKE FOUT, GEEN SCHIJN-OPSLAG (ADR 0127-review): niets schrijven — geen
      // 'deplete'-parkeerwaarde, geen override — zodat een GET erna precies teruggeeft
      // wat er wél is opgeslagen (de vorige keuze) en de gebruiker ziet dat het niet lukte.
      console.error('[fire-settings] CHECK-violation op fire_end_strategy — waarde nog niet ondersteund door de database:', plan.strategy)
      return NextResponse.json(
        {
          error: 'Deze eindstrategie wordt door de database nog niet ondersteund. Je vorige instelling is ongewijzigd.',
          code: 'strategy_not_supported',
        },
        { status: 409 },
      )
    }

    // Legacy 'pensioen'-schaduwpad (ongewijzigd gedrag voor precies deze situatie).
    console.log('[fire-settings] CHECK constraint violation — using feature_preferences fallback')

    // Save all OTHER fields to profiles with a safe strategy value ('deplete')
    const safePayload = { ...updatePayload, fire_end_strategy: 'deplete' }
    const { error: safeError } = await supabase.from('profiles').update(safePayload).eq('id', user.id)
    if (safeError) {
      return serverError(safeError, 'fire-settings:PUT:shadow', 'Opslaan mislukt')
    }

    // Store the actual strategy in feature_preferences (user-writable JSON on profiles)
    const { data: current } = await supabase.from('profiles').select('feature_preferences').eq('id', user.id).single()
    const fp = (current?.feature_preferences ?? {}) as Record<string, unknown>
    fp[FP_KEY] = plan.strategy
    const { error: fpError } = await supabase.from('profiles').update({ feature_preferences: fp }).eq('id', user.id)
    if (fpError) {
      return serverError(fpError, 'fire-settings:PUT:override', 'Override opslaan mislukt')
    }

    console.log('[fire-settings] Saved pensioen via feature_preferences fallback')
    return NextResponse.json({ success: true, fallback: true, ...updatePayload })
  }

  // Overige DB-fouten: server-side gelogd onder tag, generieke tekst naar de
  // client (ADR 0044) — het vroegere `details: error.message` lekte de
  // Postgres-melding (relatie-/constraint-/pooler-namen) aan ingelogden.
  return serverError(error, 'fire-settings:PUT', 'Opslaan mislukt')
}
