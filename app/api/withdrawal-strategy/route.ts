import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { WITHDRAWAL_DEFAULTS, type WithdrawalStrategyType } from '@/lib/withdrawal-strategy'

const VALID_STRATEGIES: WithdrawalStrategyType[] = ['static', 'guardrails', 'vpw', 'bucket']

// ── GET — Lees withdrawal strategy instellingen uit profiles ─────────

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('withdrawal_strategy, guardrail_floor, guardrail_ceiling, guardrail_cut_step, guardrail_raise_step')
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
  })
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
  })
}
