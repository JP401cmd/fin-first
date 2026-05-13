import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const VALID_STRATEGIES = ['perpetual', 'legacy', 'deplete', 'pensioen'] as const
const VALID_RETIREMENT_METHODS = ['essential_budgets', 'custom_amount', 'current_income'] as const

// When the DB CHECK constraint doesn't include 'pensioen', we store the
// override in profiles.feature_preferences.fire_strategy_override.
// Once the migration is applied, the profiles.fire_end_strategy column
// value takes precedence and the override is ignored.
const FP_KEY = 'fire_strategy_override'

// ── GET — Read current FIRE settings ─────────────────────────────────

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const { data, error } = await supabase
    .from('profiles')
    .select('retirement_expense_method, retirement_expense_custom_amount, fire_end_strategy, fire_end_age, fire_legacy_amount, feature_preferences')
    .eq('id', user.id)
    .single()

  if (error) return NextResponse.json({ error: 'Fout bij laden' }, { status: 500 })

  let strategy = data?.fire_end_strategy ?? 'deplete'

  // If the DB column doesn't contain 'pensioen', check feature_preferences override
  if (strategy !== 'pensioen') {
    const fp = (data?.feature_preferences ?? {}) as Record<string, unknown>
    if (fp[FP_KEY] === 'pensioen') {
      strategy = 'pensioen'
    }
  }

  // monthly_savings_override — aparte maybeSingle() zodat ontbrekende kolom
  // op legacy DBs (migratie 20260513000001 nog niet gerund) graceful null
  // returnt ipv 500.
  let monthlySavingsOverride: number | null = null
  const { data: overrideData, error: overrideError } = await supabase
    .from('profiles')
    .select('monthly_savings_override')
    .eq('id', user.id)
    .maybeSingle()
  if (!overrideError && overrideData) {
    const raw = (overrideData as { monthly_savings_override?: number | string | null }).monthly_savings_override
    monthlySavingsOverride = raw == null ? null : Number(raw)
  }

  return NextResponse.json({
    retirement_expense_method: data?.retirement_expense_method ?? 'essential_budgets',
    retirement_expense_custom_amount: data?.retirement_expense_custom_amount ?? null,
    fire_end_strategy: strategy,
    fire_end_age: data?.fire_end_age ?? 90,
    fire_legacy_amount: data?.fire_legacy_amount ?? null,
    monthly_savings_override: monthlySavingsOverride,
  })
}

// ── PUT — Save FIRE settings with CHECK constraint fallback ──────────

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
  }

  // Validate
  const strategy = String(body.fire_end_strategy ?? 'deplete')
  if (!VALID_STRATEGIES.includes(strategy as typeof VALID_STRATEGIES[number])) {
    return NextResponse.json({ error: `Ongeldige strategie: ${strategy}` }, { status: 400 })
  }
  const endAge = Number(body.fire_end_age) || 90
  if (endAge < 50 || endAge > 120) {
    return NextResponse.json({ error: 'Eindleeftijd moet tussen 50 en 120 liggen' }, { status: 400 })
  }
  const legacyAmount = body.fire_legacy_amount != null ? Number(body.fire_legacy_amount) : null

  // Build update payload — only include retirement fields when explicitly provided
  const updatePayload: Record<string, unknown> = {
    fire_end_strategy: strategy,
    fire_end_age: endAge,
    fire_legacy_amount: legacyAmount,
    updated_at: new Date().toISOString(),
  }

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
    // Success — DB supports this value, clear any override
    if (strategy !== 'pensioen') {
      // Clear override if switching away from pensioen
      const { data: current } = await supabase.from('profiles').select('feature_preferences').eq('id', user.id).single()
      const fp = (current?.feature_preferences ?? {}) as Record<string, unknown>
      if (fp[FP_KEY]) {
        delete fp[FP_KEY]
        await supabase.from('profiles').update({ feature_preferences: fp }).eq('id', user.id)
      }
    } else {
      // DB now supports 'pensioen' — clear any stale override
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
    return NextResponse.json({ success: true, ...updatePayload, monthly_savings_override: overrideValue })
  }

  // If CHECK constraint violation (code 23514), use feature_preferences fallback
  if (error.code === '23514' && error.message?.includes('fire_end_strategy')) {
    console.log('[fire-settings] CHECK constraint violation — using feature_preferences fallback')

    // Save all OTHER fields to profiles with a safe strategy value ('deplete')
    const safePayload = { ...updatePayload, fire_end_strategy: 'deplete' }
    const { error: safeError } = await supabase.from('profiles').update(safePayload).eq('id', user.id)
    if (safeError) {
      return NextResponse.json({ error: 'Opslaan mislukt', details: safeError.message }, { status: 500 })
    }

    // Store the actual strategy in feature_preferences (user-writable JSON on profiles)
    const { data: current } = await supabase.from('profiles').select('feature_preferences').eq('id', user.id).single()
    const fp = (current?.feature_preferences ?? {}) as Record<string, unknown>
    fp[FP_KEY] = strategy
    const { error: fpError } = await supabase.from('profiles').update({ feature_preferences: fp }).eq('id', user.id)
    if (fpError) {
      console.error('[fire-settings] feature_preferences update failed:', fpError.message)
      return NextResponse.json({ error: 'Override opslaan mislukt', details: fpError.message }, { status: 500 })
    }

    console.log('[fire-settings] Saved pensioen via feature_preferences fallback')
    return NextResponse.json({ success: true, fallback: true, ...updatePayload })
  }

  // Other errors
  return NextResponse.json({ error: 'Opslaan mislukt', details: error.message }, { status: 500 })
}
