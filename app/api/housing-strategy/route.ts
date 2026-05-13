import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  parseHousingStrategy,
  deriveHousingContext,
  DEFAULT_HOUSING_STRATEGY,
  type HousingStrategyConfig,
} from '@/lib/housing-strategy'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'

// ── GET — Lees housing strategy uit profiles ─────────────────────────

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Parallel: profile-config + assets + debts (voor context-aware UI hints).
  const [{ data: profileData, error: profileErr }, assetsRes, debtsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('housing_strategy_config, housing_strategy_dismissed_at')
      .eq('id', user.id)
      .single(),
    supabase.from('assets').select('*').eq('is_active', true),
    supabase.from('debts').select('*').eq('is_active', true),
  ])

  let config: HousingStrategyConfig = DEFAULT_HOUSING_STRATEGY
  let dismissedAt: string | null = null
  if (!profileErr && profileData) {
    config = parseHousingStrategy(
      (profileData as Record<string, unknown>).housing_strategy_config,
    )
    dismissedAt =
      ((profileData as Record<string, unknown>).housing_strategy_dismissed_at as string | null) ??
      null
  }

  const context = deriveHousingContext(
    (assetsRes.data ?? []) as Asset[],
    (debtsRes.data ?? []) as Debt[],
  )
  const estimatedEquity = Math.max(0, context.eigenHuisValue - context.mortgageBalance)

  return NextResponse.json({
    config,
    dismissed_at: dismissedAt,
    context: {
      has_eigen_huis: context.hasEigenHuis,
      eigen_huis_value: context.eigenHuisValue,
      woz_value: context.wozValue,
      mortgage_balance: context.mortgageBalance,
      mortgage_monthly_payment: context.mortgageMonthlyPayment,
      estimated_equity: estimatedEquity,
    },
  })
}

// ── PUT — Sla housing strategy op in profiles ────────────────────────

/**
 * Validate en normaliseer ingaande config. Wijst onbekende velden af door
 * via parseHousingStrategy te lopen — dat retourneert altijd een geldige
 * config of de default. Onbekende modes vallen daardoor terug op include_full.
 */
function validateConfig(raw: unknown): HousingStrategyConfig | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'config moet een object zijn' }
  const obj = raw as Record<string, unknown>
  if (typeof obj.mode !== 'string') return { error: 'config.mode is verplicht' }

  // Range-checks voordat we parseren — voorkomt dat onzin-waardes silently
  // gefixed worden naar defaults zonder dat de gebruiker het weet.
  if (obj.mode === 'downsize' || obj.mode === 'reverse_mortgage') {
    if (obj.trigger !== 'fixed_age' && obj.trigger !== 'on_depletion') {
      return { error: 'trigger moet "fixed_age" of "on_depletion" zijn' }
    }
    const triggerAge = Number(obj.triggerAge)
    if (!Number.isFinite(triggerAge) || triggerAge < 18 || triggerAge > 110) {
      return { error: 'triggerAge moet tussen 18 en 110 liggen' }
    }
    const dt = Number(obj.depletionThresholdYears)
    if (!Number.isFinite(dt) || dt < 0 || dt > 20) {
      return { error: 'depletionThresholdYears moet tussen 0 en 20 liggen' }
    }
  }

  if (obj.mode === 'downsize') {
    const sp = Number(obj.salePricePct)
    if (!Number.isFinite(sp) || sp < 0.5 || sp > 1.5) {
      return { error: 'salePricePct moet tussen 0.5 en 1.5 liggen' }
    }
    const sc = Number(obj.salesCostsPct)
    if (!Number.isFinite(sc) || sc < 0 || sc > 0.2) {
      return { error: 'salesCostsPct moet tussen 0 en 0.2 liggen' }
    }
    if (obj.newMonthlyHousingCost != null) {
      const nmh = Number(obj.newMonthlyHousingCost)
      if (!Number.isFinite(nmh) || nmh < 0 || nmh > 20_000) {
        return { error: 'newMonthlyHousingCost moet tussen 0 en 20.000 liggen' }
      }
    }
  }

  if (obj.mode === 'reverse_mortgage') {
    const ml = Number(obj.maxLoanPct)
    if (!Number.isFinite(ml) || ml < 0.1 || ml > 0.8) {
      return { error: 'maxLoanPct moet tussen 0.10 en 0.80 liggen' }
    }
    const ir = Number(obj.interestRate)
    if (!Number.isFinite(ir) || ir < 0 || ir > 0.15) {
      return { error: 'interestRate moet tussen 0 en 0.15 liggen' }
    }
    if (obj.monthlyPayout != null) {
      const mp = Number(obj.monthlyPayout)
      if (!Number.isFinite(mp) || mp < 0 || mp > 20_000) {
        return { error: 'monthlyPayout moet tussen 0 en 20.000 liggen' }
      }
    }
  }

  return parseHousingStrategy(raw)
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  let body: { config?: unknown; mark_dismissed?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {
    id: user.id,
    updated_at: new Date().toISOString(),
  }

  if (body.config !== undefined) {
    const validated = validateConfig(body.config)
    if ('error' in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }
    updateData.housing_strategy_config = validated
  }

  if (body.mark_dismissed === true) {
    updateData.housing_strategy_dismissed_at = new Date().toISOString()
  }

  if (Object.keys(updateData).length <= 2) {
    return NextResponse.json({ error: 'Niets om op te slaan' }, { status: 400 })
  }

  const { error } = await supabase.from('profiles').upsert(updateData)
  if (error) {
    return NextResponse.json({ error: 'Fout bij opslaan' }, { status: 500 })
  }

  return NextResponse.json({ success: true, ...updateData })
}
