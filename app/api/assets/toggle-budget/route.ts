import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncBudgetingActive } from '@/lib/budgeting-active'
import { syncBankAccountCompanion } from '@/lib/bank-account-companion'

/**
 * POST `/api/assets/toggle-budget`
 *
 * Schakelt `has_budget_tracking` aan/uit voor een specifieke cash-asset.
 * Wordt uitsluitend aangeroepen vanuit de detail-sheet (`<AssetDetailSheet>`)
 * met een bevestigingsdialoog — bewust geen quick-toggle vanuit kaarten of
 * chips, omdat een wijziging door alle historische berekeningen heen werkt.
 *
 * Body: `{ id: string, enabled: boolean }`
 *
 * RLS via `eq('user_id', user.id)` als belt-and-braces — Supabase RLS-policies
 * zouden dit ook al moeten afdwingen, maar een expliciete clause maakt
 * misconfiguratie zichtbaar.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as
    | { id?: unknown; enabled?: unknown }
    | null
  if (!body || typeof body.id !== 'string' || typeof body.enabled !== 'boolean') {
    return NextResponse.json(
      { error: 'Ongeldige aanvraag — id en enabled zijn vereist' },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from('assets')
    .update({ has_budget_tracking: body.enabled })
    .eq('id', body.id)
    .eq('user_id', user.id)
    .select('id, has_budget_tracking, name, iban, institution, subtype, ownership, household_id, current_value')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Companion bank_accounts-rij + globale gate meesyncen via dezelfde gedeelde
  // helpers als de andere schrijfpaden (bewerkscherm, setupwizard), zodat de
  // rekening zichtbaar is op /core/cash/import en de twee vlaggen niet
  // uiteenlopen. Best-effort: de toggle zelf is al doorgevoerd.
  await syncBankAccountCompanion(supabase, user.id, data, body.enabled).catch(() => undefined)
  await syncBudgetingActive(supabase, user.id).catch(() => undefined)

  return NextResponse.json({ ok: true, asset: { id: data.id, has_budget_tracking: data.has_budget_tracking, name: data.name } })
}
