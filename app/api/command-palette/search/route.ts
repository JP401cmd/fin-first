// Command-palette entity-search.
// Parallel queries op user-eigen tabellen (RLS via Supabase server-client).
// Returnt UI-klare CommandItem[] met label + sublabel + href — nooit bedragen,
// die hebben we hier niet nodig en zouden de palette-UX vertroebelen.

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import type { CommandItem, EntitySearchResponse } from '@/lib/command-palette/types'

const PER_TABLE_LIMIT = 5
const MIN_QUERY_LENGTH = 2

const ASSET_TYPE_LABELS: Record<string, string> = {
  cash: 'Cash',
  investment: 'Beleggingen',
  crypto: 'Crypto',
  real_estate: 'Vastgoed',
  eigen_huis: 'Eigen huis',
  vordering: 'Vordering',
}

const DEBT_TYPE_LABELS: Record<string, string> = {
  mortgage: 'Hypotheek',
  personal_loan: 'Persoonlijke lening',
  student_loan: 'Studieschuld',
  car_loan: 'Autolening',
  credit_card: 'Creditcard',
  revolving_credit: 'Revolverend krediet',
}

function escLike(input: string): string {
  // Supabase ilike: escape `%` en `_`. Geen SQL-injectie risico (PostgREST
  // bouwt parametized queries), maar deze tekens zijn wildcards die we als
  // letterlijk willen behandelen.
  return input.replace(/[%_]/g, (c) => `\\${c}`)
}

function assetHref(id: string, type: string | null | undefined): string {
  if (type === 'cash') return `/core/assets/cash/${id}`
  if (type === 'investment' || type === 'crypto') return `/core/assets/holdings/${id}`
  return `/core/assets/${type ?? 'cash'}?asset=${id}`
}

function debtHref(id: string, type: string | null | undefined): string {
  return `/core/debts/${type ?? 'mortgage'}?debt=${id}`
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  let body: { query?: string } = {}
  try {
    body = (await req.json()) as { query?: string }
  } catch {
    return NextResponse.json({ error: 'Ongeldige body' }, { status: 400 })
  }

  const rawQuery = (body.query ?? '').trim()
  if (rawQuery.length < MIN_QUERY_LENGTH) {
    return NextResponse.json<EntitySearchResponse>({ results: [] })
  }
  const pattern = `%${escLike(rawQuery)}%`

  // Holdings worden zowel op `name` als `ticker` gezocht. Twee aparte queries
  // i.p.v. `.or(...)` om Supabase or-filter-escapes (komma's/parentheses in de
  // user-input) volledig te ontwijken — we doen client-side dedupe op id.
  const [
    assetsRes,
    debtsRes,
    budgetsRes,
    goalsRes,
    lifeEventsRes,
    invByName,
    invByTicker,
    cryptoByName,
    cryptoByTicker,
  ] = await Promise.all([
    supabase.from('assets')
      .select('id, name, asset_type')
      .eq('is_active', true)
      .ilike('name', pattern)
      .limit(PER_TABLE_LIMIT),
    supabase.from('debts')
      .select('id, name, debt_type')
      .eq('is_active', true)
      .ilike('name', pattern)
      .limit(PER_TABLE_LIMIT),
    supabase.from('budgets')
      .select('id, name')
      .ilike('name', pattern)
      .limit(PER_TABLE_LIMIT),
    supabase.from('goals')
      .select('id, name')
      .ilike('name', pattern)
      .limit(PER_TABLE_LIMIT),
    supabase.from('life_events')
      .select('id, name, event_type')
      .eq('is_active', true)
      .ilike('name', pattern)
      .limit(PER_TABLE_LIMIT),
    supabase.from('investment_holdings')
      .select('id, name, ticker')
      .eq('is_active', true)
      .ilike('name', pattern)
      .limit(PER_TABLE_LIMIT),
    supabase.from('investment_holdings')
      .select('id, name, ticker')
      .eq('is_active', true)
      .ilike('ticker', pattern)
      .limit(PER_TABLE_LIMIT),
    supabase.from('crypto_holdings')
      .select('id, name, ticker')
      .eq('is_active', true)
      .ilike('name', pattern)
      .limit(PER_TABLE_LIMIT),
    supabase.from('crypto_holdings')
      .select('id, name, ticker')
      .eq('is_active', true)
      .ilike('ticker', pattern)
      .limit(PER_TABLE_LIMIT),
  ])

  const results: CommandItem[] = []

  type AssetRow = { id: string; name: string; asset_type: string | null }
  for (const a of (assetsRes.data ?? []) as AssetRow[]) {
    results.push({
      id: `asset:${a.id}`,
      kind: 'item',
      label: a.name,
      sublabel: `Bezitting · ${ASSET_TYPE_LABELS[a.asset_type ?? ''] ?? 'Onbekend'}`,
      module: 'kern',
      href: assetHref(a.id, a.asset_type),
    })
  }

  type DebtRow = { id: string; name: string; debt_type: string | null }
  for (const d of (debtsRes.data ?? []) as DebtRow[]) {
    results.push({
      id: `debt:${d.id}`,
      kind: 'item',
      label: d.name,
      sublabel: `Schuld · ${DEBT_TYPE_LABELS[d.debt_type ?? ''] ?? 'Onbekend'}`,
      module: 'kern',
      href: debtHref(d.id, d.debt_type),
    })
  }

  type BudgetRow = { id: string; name: string }
  for (const b of (budgetsRes.data ?? []) as BudgetRow[]) {
    results.push({
      id: `budget:${b.id}`,
      kind: 'item',
      label: b.name,
      sublabel: 'Budget',
      module: 'kern',
      href: `/core/budgets?budget=${b.id}`,
    })
  }

  type GoalRow = { id: string; name: string }
  for (const g of (goalsRes.data ?? []) as GoalRow[]) {
    results.push({
      id: `goal:${g.id}`,
      kind: 'item',
      label: g.name,
      sublabel: 'Doel',
      module: 'wil',
      href: `/will?goal=${g.id}`,
    })
  }

  type LifeEventRow = { id: string; name: string; event_type: string | null }
  for (const l of (lifeEventsRes.data ?? []) as LifeEventRow[]) {
    results.push({
      id: `life:${l.id}`,
      kind: 'item',
      label: l.name,
      sublabel: 'Levensgebeurtenis',
      module: 'horizon',
      href: `/horizon/doorrekening-test/gebeurtenissen?event=${l.id}`,
    })
  }

  type HoldingRow = { id: string; name: string; ticker: string | null }
  const seenInv = new Set<string>()
  const invRows = [...(invByName.data ?? []), ...(invByTicker.data ?? [])] as HoldingRow[]
  for (const h of invRows) {
    if (seenInv.has(h.id)) continue
    seenInv.add(h.id)
    if (seenInv.size > PER_TABLE_LIMIT) break
    results.push({
      id: `inv-holding:${h.id}`,
      kind: 'item',
      label: h.name,
      sublabel: `Belegging${h.ticker ? ` · ${h.ticker}` : ''}`,
      module: 'kern',
      href: `/core/assets/holdings/${h.id}`,
    })
  }
  const seenCrypto = new Set<string>()
  const cryptoRows = [...(cryptoByName.data ?? []), ...(cryptoByTicker.data ?? [])] as HoldingRow[]
  for (const h of cryptoRows) {
    if (seenCrypto.has(h.id)) continue
    seenCrypto.add(h.id)
    if (seenCrypto.size > PER_TABLE_LIMIT) break
    results.push({
      id: `crypto-holding:${h.id}`,
      kind: 'item',
      label: h.name,
      sublabel: `Crypto${h.ticker ? ` · ${h.ticker}` : ''}`,
      module: 'kern',
      href: `/core/assets/holdings/${h.id}`,
    })
  }

  return NextResponse.json<EntitySearchResponse>({ results })
}
