import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { serverError, unauthorized } from '@/lib/api/respond'
import { isFireEndStrategy, isStopAnchorKind, type StopAnchorKind } from '@/lib/fire-strategy'

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
 * ── Stop-anker (ADR 0129, fase F1) ─────────────────────────────────────────
 *
 * `fire_stop_anchor`/`fire_stop_age` leven in een APARTE lees- en schrijfstap,
 * precies zoals `monthly_savings_override` hieronder. Reden: de kolommen komen uit
 * migratie 20260903140000, en die is bewust nog niet uitgerold. Zou de hoofdquery
 * ze meenemen, dan geeft élke profielload een 42703 tot het moment van uitrol —
 * de volgordefout die het migratiebestand zelf als eerste waarschuwing draagt.
 *
 * Het VERSCHIL met `monthly_savings_override`: dat veld mag stil falen (een
 * ontbrekende kolom kost daar hooguit een spaar-override). Een stop-anker níet.
 * Wie "ik stop op mijn 58e" kiest en een geslaagde opslag ziet terwijl de waarde
 * nergens landt, ziet bij de volgende load zijn oude plan terug — exact de stille
 * verliesbug die het schaduwpad hierboven veroorzaakte en die in de ADR 0127-review
 * is dichtgezet. Daarom: bij een ontbrekende kolom een eerlijke 409, geen success.
 */
const STOP_ANCHOR_COLUMNS = 'fire_stop_anchor, fire_stop_age'

/** Postgres 42703 = undefined_column — de migratie is nog niet uitgerold. */
function isMissingColumn(err: { code?: string } | null): boolean {
  return err?.code === '42703'
}

interface StopAnchorInput {
  anchor: StopAnchorKind
  stopAge: number | null
}

/**
 * Valideer anker + stopleeftijd uit de request-body.
 *
 * Halve jaren (ADR 0129 B6): de stop-slider staat op `step={0.5}`. Een waarde
 * daartussenin wordt NIET stil afgerond — dat zou een keuze van de gebruiker
 * vervalsen — maar afgewezen, zodat de client zijn eigen resolutie corrigeert.
 * De consistentie-eis (`age` ⟺ leeftijd aanwezig) spiegelt de DB-CHECK, zodat een
 * ongeldige combinatie een leesbare 400 geeft in plaats van een 23514.
 */
function parseStopAnchorInput(body: Record<string, unknown>): StopAnchorInput | { error: string } {
  const rawAnchor = body.fire_stop_anchor ?? 'solved'
  if (!isStopAnchorKind(rawAnchor)) {
    return { error: `Ongeldig stop-anker: ${String(rawAnchor)}` }
  }

  const rawAge = body.fire_stop_age
  if (rawAnchor !== 'age') {
    if (rawAge != null) {
      return { error: 'Een stopleeftijd hoort alleen bij het anker "age".' }
    }
    return { anchor: rawAnchor, stopAge: null }
  }

  const age = Number(rawAge)
  if (!Number.isFinite(age)) {
    return { error: 'Kies een stopleeftijd bij het anker "age".' }
  }
  if (age * 2 !== Math.floor(age * 2)) {
    return { error: 'Een stopleeftijd loopt in stappen van een half jaar.' }
  }
  if (age < 18 || age > 100) {
    return { error: 'Stopleeftijd moet tussen 18 en 100 liggen.' }
  }
  return { anchor: rawAnchor, stopAge: age }
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

  const { data, error } = await supabase
    .from('profiles')
    .select('retirement_expense_method, retirement_expense_custom_amount, fire_end_strategy, fire_end_age, fire_legacy_amount, feature_preferences, deficit_loan_rate')
    .eq('id', claims.sub)
    .single()

  if (error) return NextResponse.json({ error: 'Fout bij laden' }, { status: 500 })

  const strategy = resolveStoredStrategy(data?.fire_end_strategy, data?.feature_preferences)

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

  // Stop-anker — aparte query zolang migratie 20260903140000 niet is uitgerold
  // (zie STOP_ANCHOR_COLUMNS hierboven). Ontbreekt de kolom, dan LEIDT het anker
  // zich af uit de legacy-strategie, exact zoals `parseFirePlan` dat doet: dan
  // geven route en loader hetzelfde plan terug en spreekt geen rij zichzelf tegen.
  let stopAnchor: string = strategy === 'pensioen' ? 'aow' : strategy === 'nu-stoppen' ? 'now' : 'solved'
  let stopAge: number | null = null
  const { data: anchorData, error: anchorError } = await supabase
    .from('profiles')
    .select(STOP_ANCHOR_COLUMNS)
    .eq('id', claims.sub)
    .maybeSingle()
  if (!anchorError && anchorData) {
    const row = anchorData as { fire_stop_anchor?: string | null; fire_stop_age?: number | string | null }
    // De legacy-strategie WINT voor het anker (ADR 0129 D2) — een half-gebackfillde
    // rij mag niet halverwege van plan wisselen.
    if (strategy !== 'pensioen' && strategy !== 'nu-stoppen' && isStopAnchorKind(row.fire_stop_anchor)) {
      stopAnchor = row.fire_stop_anchor
      stopAge = row.fire_stop_age == null ? null : Number(row.fire_stop_age)
    }
  } else if (anchorError && !isMissingColumn(anchorError)) {
    console.warn('[fire-settings] stop-anker lezen mislukt:', anchorError.message)
  }

  return NextResponse.json({
    fire_stop_anchor: stopAnchor,
    fire_stop_age: stopAge,
    retirement_expense_method: data?.retirement_expense_method ?? 'essential_budgets',
    retirement_expense_custom_amount: data?.retirement_expense_custom_amount ?? null,
    fire_end_strategy: strategy,
    fire_end_age: data?.fire_end_age ?? 90,
    fire_legacy_amount: data?.fire_legacy_amount ?? null,
    monthly_savings_override: monthlySavingsOverride,
    // V7 — tekort-lening-jaarrente (0..1). NULL = adapter gebruikt Excel-default 0,05.
    deficit_loan_rate: data?.deficit_loan_rate ?? null,
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

  // Validate
  const strategy = String(body.fire_end_strategy ?? 'deplete')
  if (!isFireEndStrategy(strategy)) {
    return NextResponse.json({ error: `Ongeldige strategie: ${strategy}` }, { status: 400 })
  }
  const endAge = Number(body.fire_end_age) || 90
  if (endAge < 50 || endAge > 120) {
    return NextResponse.json({ error: 'Eindleeftijd moet tussen 50 en 120 liggen' }, { status: 400 })
  }
  const legacyAmount = body.fire_legacy_amount != null ? Number(body.fire_legacy_amount) : null

  // Stop-anker — alleen meenemen als de client het expliciet stuurt, zodat een
  // oudere client (die het veld niet kent) het anker niet stil op 'solved' zet.
  const anchorInBody = 'fire_stop_anchor' in body || 'fire_stop_age' in body
  let stopAnchorInput: StopAnchorInput | null = null
  if (anchorInBody) {
    const parsed = parseStopAnchorInput(body)
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    stopAnchorInput = parsed
  }

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

  // Build update payload — only include retirement fields when explicitly provided
  const updatePayload: Record<string, unknown> = {
    fire_end_strategy: strategy,
    fire_end_age: endAge,
    fire_legacy_amount: legacyAmount,
    updated_at: new Date().toISOString(),
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
  // zonder migratie 20260513000001) niet de hele save laat falen.
  const overrideInBody = 'monthly_savings_override' in body
  const overrideValue = overrideInBody
    ? (body.monthly_savings_override == null ? null : Number(body.monthly_savings_override))
    : undefined

  // First attempt — try saving directly to profiles
  const { error } = await supabase.from('profiles').update(updatePayload).eq('id', user.id)

  if (!error) {
    // Success — de kolom draagt de keuze zelf; een eventuele (stale) override weg.
    const { data: current } = await supabase.from('profiles').select('feature_preferences').eq('id', user.id).single()
    const fp = (current?.feature_preferences ?? {}) as Record<string, unknown>
    if (fp[FP_KEY]) {
      delete fp[FP_KEY]
      await supabase.from('profiles').update({ feature_preferences: fp }).eq('id', user.id)
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
    // Stop-anker — aparte update, maar met een HARDE fout bij een ontbrekende
    // kolom. Anders zou de gebruiker "opgeslagen" zien terwijl zijn stopmoment
    // nergens landt en de volgende load zijn oude plan toont: precies de stille
    // verliesbug die het schaduwpad hieronder ooit veroorzaakte. Liever een 409
    // die zegt dat de database nog niet zover is.
    if (stopAnchorInput) {
      const { error: anchorError } = await supabase
        .from('profiles')
        .update({
          fire_stop_anchor: stopAnchorInput.anchor,
          fire_stop_age: stopAnchorInput.stopAge,
        })
        .eq('id', user.id)
      if (anchorError) {
        if (isMissingColumn(anchorError)) {
          console.error('[fire-settings] stop-anker: kolom ontbreekt — migratie 20260903140000 nog niet uitgerold')
          return NextResponse.json(
            {
              error: 'Je stopmoment kan nog niet worden opgeslagen; de database is nog niet bijgewerkt. Je overige instellingen zijn wél bewaard.',
              code: 'stop_anchor_not_supported',
            },
            { status: 409 },
          )
        }
        return serverError(anchorError, 'fire-settings:PUT:stop-anker', 'Stopmoment opslaan mislukt')
      }
    }
    return NextResponse.json({
      success: true,
      ...updatePayload,
      monthly_savings_override: overrideValue,
      ...(stopAnchorInput
        ? { fire_stop_anchor: stopAnchorInput.anchor, fire_stop_age: stopAnchorInput.stopAge }
        : {}),
    })
  }

  // CHECK-constraint-violation (23514) op de strategiekolom: de database kent deze
  // waarde (nog) niet.
  if (error.code === '23514' && error.message?.includes('fire_end_strategy')) {
    if (strategy !== LEGACY_SHADOW_STRATEGY) {
      // EERLIJKE FOUT, GEEN SCHIJN-OPSLAG (ADR 0127-review): niets schrijven — geen
      // 'deplete'-parkeerwaarde, geen override — zodat een GET erna precies teruggeeft
      // wat er wél is opgeslagen (de vorige keuze) en de gebruiker ziet dat het niet lukte.
      console.error('[fire-settings] CHECK-violation op fire_end_strategy — waarde nog niet ondersteund door de database:', strategy)
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
    fp[FP_KEY] = strategy
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
