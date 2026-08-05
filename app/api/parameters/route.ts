import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { sanitizeCashSettingsInput } from '@/lib/cashflow-settings'
import { loadParameterSavingsRateTarget } from '@/lib/cashflow-settings-data'
import { bandError, isWithinBand } from '@/lib/parameters-band'

// ── GET — Lees berekeningsparameters uit profiles ─────────────────────

export async function GET() {
  const supabase = await createClient()
  // Read-auth via getClaims() — lokale JWKS-verificatie, geen getUser-roundtrip (ADR 0052).
  const claims = await getAuthClaims(supabase)

  if (!claims) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Try with marginaal_tarief column; fall back to base columns if column doesn't exist yet
  let data: Record<string, unknown> | null = null
  const { data: d1, error: e1 } = await supabase
    .from('profiles')
    .select('expected_return, inflation_rate, box3_method, marginaal_tarief, pension_factor_a, pension_factor_a_source, net_monthly_income, estimated_monthly_expenses, retirement_expense_method, retirement_expense_custom_amount, target_savings_rate, income_source, expenses_source')
    .eq('id', claims.sub)
    .single()

  if (!e1) {
    data = d1 as Record<string, unknown>
  } else {
    // Fallback: column may not exist yet (migration not applied)
    const { data: d2, error: e2 } = await supabase
      .from('profiles')
      .select('expected_return, inflation_rate, box3_method, net_monthly_income')
      .eq('id', claims.sub)
      .single()
    if (e2) {
      return NextResponse.json({ error: 'Fout bij laden parameters' }, { status: 500 })
    }
    data = d2 as Record<string, unknown>
  }

  // Spaarquote-doel leest voortaan uit de goals-bron (ronde 4, besluit 3): het
  // door het /toekomst-lab gegenereerde parameter-doel wint; de (DEPRECATED)
  // profielkolom `target_savings_rate` is enkel nog fallback.
  const goalTargetSavingsRate = await loadParameterSavingsRateTarget(supabase, claims.sub)

  return NextResponse.json({
    expected_return: data?.expected_return ?? 0.07,
    inflation_rate: data?.inflation_rate ?? 0.02,
    box3_method: data?.box3_method ?? 'forfaitair',
    marginaal_tarief: data?.marginaal_tarief ?? null,
    pension_factor_a: data?.pension_factor_a ?? null,
    pension_factor_a_source: data?.pension_factor_a_source ?? null,
    net_monthly_income: data?.net_monthly_income ?? null,
    estimated_monthly_expenses: Number(data?.estimated_monthly_expenses ?? 0),
    retirement_expense_method: data?.retirement_expense_method ?? 'essential_budgets',
    retirement_expense_custom_amount: Number(data?.retirement_expense_custom_amount ?? 0),
    target_savings_rate: goalTargetSavingsRate ?? data?.target_savings_rate ?? null,
    income_source: data?.income_source ?? 'auto',
    expenses_source: data?.expenses_source ?? 'auto',
  })
}

// ── PUT — Sla berekeningsparameters op in profiles ────────────────────

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

  // Valideer return/inflatie alleen wanneer ze in de body zitten — zo kan de
  // cashflow-pagina deelpatches sturen (bv. alleen net_monthly_income) zonder
  // dat de parameters-validatie afketst op ontbrekende velden. De parameters-
  // instellingenpagina stuurt beide altijd mee, dus die blijft identiek werken.
  // Banden uit de GEDEELDE bron (lib/parameters-band.ts) — dezelfde module die
  // de bewerk-sheet gebruikt voor zijn client-side feedback, zodat de twee niet
  // uit elkaar kunnen lopen.
  let expectedReturn: number | undefined
  if (body.expected_return !== undefined) {
    const n = Number(body.expected_return)
    if (!isWithinBand('expected_return', n)) {
      return NextResponse.json({ error: bandError('expected_return') }, { status: 400 })
    }
    expectedReturn = n
  }
  let inflationRate: number | undefined
  if (body.inflation_rate !== undefined) {
    const n = Number(body.inflation_rate)
    if (!isWithinBand('inflation_rate', n)) {
      return NextResponse.json({ error: bandError('inflation_rate') }, { status: 400 })
    }
    inflationRate = n
  }

  // Validate box3_method if provided
  const box3Method = body.box3_method as string | undefined
  if (box3Method !== undefined && box3Method !== 'forfaitair' && box3Method !== 'werkelijk') {
    return NextResponse.json({ error: 'Box 3 methode moet "forfaitair" of "werkelijk" zijn' }, { status: 400 })
  }

  // Validate marginaal_tarief if provided — null means "automatic".
  // Range-validatie i.p.v. een exacte whitelist: het marginale tarief wordt per
  // belastingjaar uit BOX1_PARAMS afgeleid (schijf-1 t/m topschijf), dus elke
  // fractie binnen [0,30; 0,60] is een geldige expliciete override. null = auto
  // (blijft jaar-afgeleid). Een vaste whitelist weigerde eerder elk niet-2024-
  // tarief, waardoor 2026-tarieven (35,75%) niet opslaanbaar waren.
  const rawMT = body.marginaal_tarief
  let marginaalTarief: number | null | undefined
  if (rawMT === null) {
    marginaalTarief = null // explicitly set to automatic
  } else if (rawMT !== undefined) {
    const mt = Number(rawMT)
    if (isNaN(mt) || mt < 0.30 || mt > 0.60) {
      return NextResponse.json({ error: 'Marginaal tarief moet tussen 30% en 60% liggen' }, { status: 400 })
    }
    marginaalTarief = mt
  }

  // Validate pension_factor_a if provided — null means "wissen / niet ingevuld".
  // NULL ≠ 0: een lege waarde betekent "onbekend", een expliciete 0 betekent
  // "geen pensioenaangroei". Beide zijn geldige opslagwaarden.
  const rawFactorA = body.pension_factor_a
  let pensionFactorA: number | null | undefined
  if (rawFactorA === null) {
    pensionFactorA = null // expliciet wissen
  } else if (rawFactorA !== undefined) {
    const n = Number(rawFactorA)
    if (isNaN(n) || n < 0) {
      return NextResponse.json({ error: 'Factor A moet 0 of hoger zijn' }, { status: 400 })
    }
    pensionFactorA = n
  }

  // Validate pension_factor_a_source if provided — null = onbekend/wissen.
  const rawFactorASource = body.pension_factor_a_source
  let pensionFactorASource: string | null | undefined
  if (rawFactorASource === null) {
    pensionFactorASource = null
  } else if (rawFactorASource !== undefined) {
    if (rawFactorASource !== 'upo' && rawFactorASource !== 'estimated') {
      return NextResponse.json({ error: 'Factor A bron moet "upo" of "estimated" zijn' }, { status: 400 })
    }
    pensionFactorASource = rawFactorASource
  }

  const updateData: Record<string, unknown> = {
    id: user.id,
    updated_at: new Date().toISOString(),
  }
  if (expectedReturn !== undefined) {
    updateData.expected_return = expectedReturn
  }
  if (inflationRate !== undefined) {
    updateData.inflation_rate = inflationRate
  }
  if (box3Method !== undefined) {
    updateData.box3_method = box3Method
  }
  if (marginaalTarief !== undefined) {
    updateData.marginaal_tarief = marginaalTarief
  }
  if (pensionFactorA !== undefined) {
    updateData.pension_factor_a = pensionFactorA
  }
  if (pensionFactorASource !== undefined) {
    updateData.pension_factor_a_source = pensionFactorASource
  }

  const cashSettings = sanitizeCashSettingsInput(body)
  Object.assign(updateData, cashSettings)

  let { error } = await supabase
    .from('profiles')
    .upsert(updateData)

  // If upsert fails (e.g. a newer column doesn't exist yet on a legacy DB),
  // retry once without the optional columns (marginaal_tarief + the factor-A pair).
  if (
    error &&
    (marginaalTarief !== undefined ||
      pensionFactorA !== undefined ||
      pensionFactorASource !== undefined)
  ) {
    delete updateData.marginaal_tarief
    delete updateData.pension_factor_a
    delete updateData.pension_factor_a_source
    const retry = await supabase.from('profiles').upsert(updateData)
    error = retry.error
  }

  if (error) {
    return NextResponse.json({ error: 'Fout bij opslaan parameters' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    expected_return: expectedReturn ?? null,
    inflation_rate: inflationRate ?? null,
    box3_method: box3Method ?? 'forfaitair',
    marginaal_tarief: marginaalTarief !== undefined ? marginaalTarief : null,
    pension_factor_a: pensionFactorA !== undefined ? pensionFactorA : null,
    pension_factor_a_source: pensionFactorASource !== undefined ? pensionFactorASource : null,
    ...cashSettings,
  })
}
