import { createClient } from '@/lib/supabase/server'

type ExportType = 'transactions' | 'budgets' | 'net_worth' | 'assets' | 'debts' | 'goals'

function escapeCSV(value: string | number | null | undefined): string {
  if (value == null) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function toCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(escapeCSV).join(',')]
  for (const row of rows) {
    lines.push(row.map(escapeCSV).join(','))
  }
  return lines.join('\n')
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const url = new URL(req.url)
  const type = url.searchParams.get('type') as ExportType | null
  const format = (url.searchParams.get('format') ?? 'csv') as 'csv' | 'json'

  if (!type || !['transactions', 'budgets', 'net_worth', 'assets', 'debts', 'goals'].includes(type)) {
    return Response.json({ error: 'Ongeldig type. Gebruik: transactions, budgets, net_worth, assets, debts, goals' }, { status: 400 })
  }

  let headers: string[] = []
  let rows: (string | number | null | undefined)[][] = []
  let filenameBase: string

  switch (type) {
    case 'transactions': {
      const { data } = await supabase
        .from('transactions')
        .select('date, amount, description, counterparty_name, counterparty_iban, is_income, reference, budget:budgets(name)')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(10000)

      rows = (data ?? []).map(t => [
        t.date,
        t.amount,
        t.description,
        t.counterparty_name,
        t.counterparty_iban,
        t.is_income ? 'Ja' : 'Nee',
        t.reference,
        (t.budget as { name?: string } | null)?.name ?? '',
      ])

      headers = ['Datum', 'Bedrag', 'Beschrijving', 'Tegenpartij', 'IBAN', 'Inkomen', 'Referentie', 'Budget']
      filenameBase = `transacties-${new Date().toISOString().split('T')[0]}`
      break
    }

    case 'budgets': {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]

      const [budgetsRes, txRes] = await Promise.all([
        supabase
          .from('budgets')
          .select('id, name, slug, budget_type, default_limit, is_essential, parent_id')
          .eq('user_id', user.id)
          .not('parent_id', 'is', null)
          .order('sort_order'),
        supabase
          .from('transactions')
          .select('budget_id, amount')
          .eq('user_id', user.id)
          .gte('date', monthStart)
          .lt('date', monthEnd),
      ])

      const spendingMap: Record<string, number> = {}
      for (const t of txRes.data ?? []) {
        if (t.budget_id) {
          spendingMap[t.budget_id] = (spendingMap[t.budget_id] ?? 0) + Math.abs(Number(t.amount))
        }
      }

      rows = (budgetsRes.data ?? []).map(b => [
        b.name,
        b.slug,
        b.budget_type,
        b.default_limit,
        spendingMap[b.id] ?? 0,
        b.is_essential ? 'Ja' : 'Nee',
      ])

      headers = ['Naam', 'Slug', 'Type', 'Limiet', 'Besteed deze maand', 'Essentieel']
      filenameBase = `budgetten-${new Date().toISOString().split('T')[0]}`
      break
    }

    case 'net_worth': {
      const { data } = await supabase
        .from('net_worth_snapshots')
        .select('snapshot_date, total_assets, total_debts, net_worth')
        .eq('user_id', user.id)
        .order('snapshot_date', { ascending: true })

      rows = (data ?? []).map(s => [
        s.snapshot_date,
        s.total_assets,
        s.total_debts,
        s.net_worth,
      ])

      headers = ['Datum', 'Vermogen', 'Schulden', 'Netto Vermogen']
      filenameBase = `netto-vermogen-${new Date().toISOString().split('T')[0]}`
      break
    }

    case 'assets': {
      const { data } = await supabase
        .from('assets')
        .select('name, asset_type, current_value, purchase_value, expected_return, monthly_contribution, institution, is_active, notes')
        .eq('user_id', user.id)
        .order('sort_order')

      rows = (data ?? []).map(a => [
        a.name,
        a.asset_type,
        a.current_value,
        a.purchase_value,
        a.expected_return,
        a.monthly_contribution,
        a.institution,
        a.is_active ? 'Ja' : 'Nee',
        a.notes,
      ])

      headers = ['Naam', 'Type', 'Huidige waarde', 'Aankoopwaarde', 'Verwacht rendement %', 'Maandelijkse inleg', 'Instelling', 'Actief', 'Notities']
      filenameBase = `assets-${new Date().toISOString().split('T')[0]}`
      break
    }

    case 'debts': {
      const { data } = await supabase
        .from('debts')
        .select('name, debt_type, original_amount, current_balance, interest_rate, monthly_payment, creditor, start_date, end_date, is_active, notes')
        .eq('user_id', user.id)
        .order('sort_order')

      rows = (data ?? []).map(d => [
        d.name,
        d.debt_type,
        d.original_amount,
        d.current_balance,
        d.interest_rate,
        d.monthly_payment,
        d.creditor,
        d.start_date,
        d.end_date,
        d.is_active ? 'Ja' : 'Nee',
        d.notes,
      ])

      headers = ['Naam', 'Type', 'Oorspronkelijk bedrag', 'Huidig saldo', 'Rente %', 'Maandelijkse betaling', 'Kredietverstrekker', 'Startdatum', 'Einddatum', 'Actief', 'Notities']
      filenameBase = `schulden-${new Date().toISOString().split('T')[0]}`
      break
    }

    case 'goals': {
      const { data } = await supabase
        .from('goals')
        .select('name, goal_type, target_value, current_value, target_date, is_completed')
        .eq('user_id', user.id)
        .order('sort_order')

      rows = (data ?? []).map(g => [
        g.name,
        g.goal_type,
        g.target_value,
        g.current_value,
        g.target_date,
        g.is_completed ? 'Ja' : 'Nee',
      ])

      headers = ['Naam', 'Type', 'Doelbedrag', 'Huidig bedrag', 'Doeldatum', 'Voltooid']
      filenameBase = `doelen-${new Date().toISOString().split('T')[0]}`
      break
    }
  }

  if (format === 'json') {
    const objects = rows.map(row => {
      const obj: Record<string, string | number | null | undefined> = {}
      headers.forEach((header, i) => {
        obj[header] = row[i]
      })
      return obj
    })

    return Response.json(objects, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filenameBase}.json"`,
      },
    })
  }

  const csv = toCSV(headers, rows)

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filenameBase}.csv"`,
    },
  })
}
