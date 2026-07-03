import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  WITHDRAWAL_DEFAULTS,
  WITHDRAWAL_PROFIELEN,
  type WithdrawalStrategyType,
} from '@/lib/withdrawal-strategy'

const VALID_STRATEGIES: WithdrawalStrategyType[] = ['static', 'guardrails']

// ── GET — Lees withdrawal strategy instellingen uit profiles ─────────

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('withdrawal_strategy, guardrail_floor, guardrail_ceiling, guardrail_cut_step, guardrail_raise_step, withdrawal_profile_config')
    .eq('id', user.id)
    .single()

  if (error) {
    return NextResponse.json({ error: 'Fout bij laden onttrekkingsstrategie' }, { status: 500 })
  }

  return NextResponse.json({
    withdrawal_strategy: data?.withdrawal_strategy ?? WITHDRAWAL_DEFAULTS.strategy,
    guardrail_floor: data?.guardrail_floor ?? WITHDRAWAL_DEFAULTS.guardrailFloor,
    guardrail_ceiling: data?.guardrail_ceiling ?? WITHDRAWAL_DEFAULTS.guardrailCeiling,
    guardrail_cut_step: data?.guardrail_cut_step ?? WITHDRAWAL_DEFAULTS.guardrailCutStep,
    guardrail_raise_step: data?.guardrail_raise_step ?? WITHDRAWAL_DEFAULTS.guardrailRaiseStep,
    // V4 — onttrekkingsprofiel-curve (JSONB). NULL = frontend/adapter gebruikt Excel-defaults.
    withdrawal_profile_config: data?.withdrawal_profile_config ?? null,
  })
}

/**
 * Valideer + normaliseer `withdrawal_profile_config` (V4). Accepteert:
 *  - `null` → wis de curve (adapter valt terug op Excel-defaults),
 *  - object met (optionele) snake_case-velden → per veld gevalideerd,
 * en retourneert de te bewaren waarde óf een foutmelding. Ontbrekende velden worden
 * weggelaten (adapter vult ze per veld met de Excel-default).
 */
function validateProfileConfig(
  raw: unknown,
): { value: Record<string, number | string> | null } | { error: string } {
  if (raw === null) return { value: null }
  if (typeof raw !== 'object') return { error: 'withdrawal_profile_config moet een object of null zijn' }
  const o = raw as Record<string, unknown>
  const out: Record<string, number | string> = {}
  // V4 — expliciet gekozen profiel (optioneel). Alleen de vier geldige waarden.
  if (o.profiel != null) {
    if (
      typeof o.profiel !== 'string' ||
      !(WITHDRAWAL_PROFIELEN as readonly string[]).includes(o.profiel)
    ) {
      return { error: `profiel moet een van ${WITHDRAWAL_PROFIELEN.join(', ')} zijn` }
    }
    out.profiel = o.profiel
  }
  const ageFields = ['gogo_tot_leeftijd', 'slowgo_tot_leeftijd'] as const
  const pctFields = ['gogo_pct', 'slowgo_pct', 'nogo_pct'] as const
  for (const f of ageFields) {
    if (o[f] == null) continue
    const n = Number(o[f])
    if (!Number.isFinite(n) || n < 40 || n > 120) {
      return { error: `${f} moet tussen 40 en 120 liggen` }
    }
    out[f] = n
  }
  for (const f of pctFields) {
    if (o[f] == null) continue
    const n = Number(o[f])
    if (!Number.isFinite(n) || n < 0 || n > 200) {
      return { error: `${f} moet tussen 0 en 200 liggen` }
    }
    out[f] = n
  }
  return { value: out }
}

// ── PUT — Sla withdrawal strategy instellingen op in profiles ────────

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
  }

  // ── Validate strategy ──────────────────────────────────────────────
  const strategy = body.withdrawal_strategy as string | undefined
  if (strategy !== undefined && !VALID_STRATEGIES.includes(strategy as WithdrawalStrategyType)) {
    return NextResponse.json(
      { error: `Strategie moet een van ${VALID_STRATEGIES.join(', ')} zijn` },
      { status: 400 },
    )
  }

  // ── Validate guardrail parameters ─────────────────────────────────
  const floor = body.guardrail_floor !== undefined ? Number(body.guardrail_floor) : undefined
  const ceiling = body.guardrail_ceiling !== undefined ? Number(body.guardrail_ceiling) : undefined
  const cutStep = body.guardrail_cut_step !== undefined ? Number(body.guardrail_cut_step) : undefined
  const raiseStep = body.guardrail_raise_step !== undefined ? Number(body.guardrail_raise_step) : undefined

  if (floor !== undefined) {
    if (isNaN(floor) || floor < 0.50 || floor > 2.00) {
      return NextResponse.json({ error: 'Guardrail floor moet tussen 0.50 en 2.00 liggen' }, { status: 400 })
    }
  }

  if (ceiling !== undefined) {
    if (isNaN(ceiling) || ceiling < 0.50 || ceiling > 2.00) {
      return NextResponse.json({ error: 'Guardrail ceiling moet tussen 0.50 en 2.00 liggen' }, { status: 400 })
    }
  }

  // floor must be < ceiling (check with current values if only one is provided)
  if (floor !== undefined && ceiling !== undefined && floor >= ceiling) {
    return NextResponse.json({ error: 'Floor moet lager zijn dan ceiling' }, { status: 400 })
  }

  if (cutStep !== undefined) {
    if (isNaN(cutStep) || cutStep < 0.01 || cutStep > 0.50) {
      return NextResponse.json({ error: 'Cut step moet tussen 0.01 en 0.50 liggen' }, { status: 400 })
    }
  }

  if (raiseStep !== undefined) {
    if (isNaN(raiseStep) || raiseStep < 0.01 || raiseStep > 0.50) {
      return NextResponse.json({ error: 'Raise step moet tussen 0.01 en 0.50 liggen' }, { status: 400 })
    }
  }

  // ── Validate onttrekkingsprofiel-curve (V4, optioneel) ─────────────
  let profileConfig: Record<string, number | string> | null | undefined
  if ('withdrawal_profile_config' in body) {
    const validated = validateProfileConfig(body.withdrawal_profile_config)
    if ('error' in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }
    profileConfig = validated.value
  }

  // ── Build update object ───────────────────────────────────────────
  const updateData: Record<string, unknown> = {
    id: user.id,
    updated_at: new Date().toISOString(),
  }

  if (strategy !== undefined) updateData.withdrawal_strategy = strategy
  if (floor !== undefined) updateData.guardrail_floor = floor
  if (ceiling !== undefined) updateData.guardrail_ceiling = ceiling
  if (cutStep !== undefined) updateData.guardrail_cut_step = cutStep
  if (raiseStep !== undefined) updateData.guardrail_raise_step = raiseStep
  if (profileConfig !== undefined) updateData.withdrawal_profile_config = profileConfig

  const { error } = await supabase
    .from('profiles')
    .upsert(updateData)

  if (error) {
    return NextResponse.json({ error: 'Fout bij opslaan onttrekkingsstrategie' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    withdrawal_strategy: strategy ?? WITHDRAWAL_DEFAULTS.strategy,
    guardrail_floor: floor ?? WITHDRAWAL_DEFAULTS.guardrailFloor,
    guardrail_ceiling: ceiling ?? WITHDRAWAL_DEFAULTS.guardrailCeiling,
    guardrail_cut_step: cutStep ?? WITHDRAWAL_DEFAULTS.guardrailCutStep,
    guardrail_raise_step: raiseStep ?? WITHDRAWAL_DEFAULTS.guardrailRaiseStep,
    ...(profileConfig !== undefined ? { withdrawal_profile_config: profileConfig } : {}),
  })
}
