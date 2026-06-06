import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { sanitizeCashSettingsInput } from '@/lib/cashflow-settings'

// ── GET — Lees berekeningsparameters uit profiles ─────────────────────

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Try with marginaal_tarief column; fall back to base columns if column doesn't exist yet
  let data: Record<string, unknown> | null = null
  const { data: d1, error: e1 } = await supabase
    .from('profiles')
    .select('expected_return, inflation_rate, box3_method, marginaal_tarief, net_monthly_income, estimated_monthly_expenses, retirement_expense_method, retirement_expense_custom_amount, target_savings_rate, income_source, expenses_source')
    .eq('id', user.id)
    .single()

  if (!e1) {
    data = d1 as Record<string, unknown>
  } else {
    // Fallback: column may not exist yet (migration not applied)
    const { data: d2, error: e2 } = await supabase
      .from('profiles')
      .select('expected_return, inflation_rate, box3_method, net_monthly_income')
      .eq('id', user.id)
      .single()
    if (e2) {
      return NextResponse.json({ error: 'Fout bij laden parameters' }, { status: 500 })
    }
    data = d2 as Record<string, unknown>
  }

  return NextResponse.json({
    expected_return: data?.expected_return ?? 0.07,
    inflation_rate: data?.inflation_rate ?? 0.02,
    box3_method: data?.box3_method ?? 'forfaitair',
    marginaal_tarief: data?.marginaal_tarief ?? null,
    net_monthly_income: data?.net_monthly_income ?? null,
    estimated_monthly_expenses: Number(data?.estimated_monthly_expenses ?? 0),
    retirement_expense_method: data?.retirement_expense_method ?? 'essential_budgets',
    retirement_expense_custom_amount: Number(data?.retirement_expense_custom_amount ?? 0),
    target_savings_rate: data?.target_savings_rate ?? null,
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
  let expectedReturn: number | undefined
  if (body.expected_return !== undefined) {
    const n = Number(body.expected_return)
    if (isNaN(n) || n < 0.01 || n > 0.15) {
      return NextResponse.json({ error: 'Verwacht rendement moet tussen 1% en 15% liggen' }, { status: 400 })
    }
    expectedReturn = n
  }
  let inflationRate: number | undefined
  if (body.inflation_rate !== undefined) {
    const n = Number(body.inflation_rate)
    if (isNaN(n) || n < 0 || n > 0.08) {
      return NextResponse.json({ error: 'Inflatie moet tussen 0% en 8% liggen' }, { status: 400 })
    }
    inflationRate = n
  }

  // Validate box3_method if provided
  const box3Method = body.box3_method as string | undefined
  if (box3Method !== undefined && box3Method !== 'forfaitair' && box3Method !== 'werkelijk') {
    return NextResponse.json({ error: 'Box 3 methode moet "forfaitair" of "werkelijk" zijn' }, { status: 400 })
  }

  // Validate marginaal_tarief if provided — null means "automatic"
  const rawMT = body.marginaal_tarief
  let marginaalTarief: number | null | undefined
  if (rawMT === null) {
    marginaalTarief = null // explicitly set to automatic
  } else if (rawMT !== undefined) {
    const mt = Number(rawMT)
    if (mt !== 0.3697 && mt !== 0.4950) {
      return NextResponse.json({ error: 'Marginaal tarief moet 36,97% of 49,50% zijn' }, { status: 400 })
    }
    marginaalTarief = mt
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

  const cashSettings = sanitizeCashSettingsInput(body)
  Object.assign(updateData, cashSettings)

  let { error } = await supabase
    .from('profiles')
    .upsert(updateData)

  // If upsert fails (e.g. marginaal_tarief column doesn't exist yet), retry without it
  if (error && marginaalTarief !== undefined) {
    delete updateData.marginaal_tarief
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
    ...cashSettings,
  })
}
