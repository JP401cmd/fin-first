import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { unauthorized } from '@/lib/api/respond'
import { localMonthBounds } from '@/lib/month-range'
import { buildBudgetTypeMap } from '@/lib/budget-utils'
import { buildBudgetSpendingMap, spentForBudget } from '@/lib/budget-spending'
import { BUDGET_SPENDING_TX_COLUMNS } from '@/lib/budget-spending-fetch'

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
  const claims = await getAuthClaims(supabase)

  if (!claims) {
    return unauthorized()
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
        .eq('user_id', claims.sub)
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
      const { start: monthStart, end: monthEnd } = localMonthBounds(now)

      const [budgetsRes, txRes] = await Promise.all([
        supabase
          .from('budgets')
          // Zónder `.not('parent_id','is',null)`: die filter liet niet alleen de
          // parent-regels uit de export weg, hij maakte de parent-rollup
          // onmogelijk. De export toont nu dezelfde boom als het scherm.
          .select('id, name, slug, budget_type, default_limit, is_essential, parent_id')
          .eq('user_id', claims.sub)
          .order('sort_order'),
        supabase
          .from('transactions')
          // `id`/`transaction_type`/`is_split` horen bij de rijselectie van de
          // canonieke besteed-som: transfers dragen niet bij en de split-ouder
          // wordt overgeslagen (die bedragen leven op `transaction_splits`).
          .select(BUDGET_SPENDING_TX_COLUMNS)
          .eq('user_id', claims.sub)
          .gte('date', monthStart)
          .lt('date', monthEnd),
      ])

      const allBudgets = budgetsRes.data ?? []

      // Split-regels erbij, anders draagt een gesplitste transactie niets bij.
      const splitTxIds = (txRes.data ?? []).filter(t => t.is_split).map(t => t.id)
      let splitRows: Array<{ budget_id: string | null; amount: number }> = []
      if (splitTxIds.length > 0) {
        const { data: splitData } = await supabase
          .from('transaction_splits')
          .select('budget_id, amount')
          .in('transaction_id', splitTxIds)
        splitRows = (splitData ?? []) as Array<{ budget_id: string | null; amount: number }>
      }

      // Canonieke besteed-som + richting per budget (child erft parent-type).
      // Was: een kale `Math.abs`-som zonder transfer-filter, zonder richting en
      // zonder splits — de kolom "Besteed deze maand" droeg daardoor andere
      // bedragen dan /core/budgets voor dezelfde maand.
      const budgetTypes = buildBudgetTypeMap(
        allBudgets.map(b => ({
          id: b.id,
          parent_id: b.parent_id ?? null,
          // DB-default; NULL mag nooit inkomsten-semantiek geven.
          budget_type: b.budget_type ?? 'expense',
        })),
      )
      const spendingMap = buildBudgetSpendingMap(txRes.data ?? [], splitRows, budgetTypes)

      const childIdsByParent: Record<string, string[]> = {}
      for (const b of allBudgets) {
        if (b.parent_id) (childIdsByParent[b.parent_id] ??= []).push(b.id)
      }

      rows = allBudgets.map(b => [
        b.name,
        b.slug,
        b.budget_type,
        b.default_limit,
        // Parent-rollup zoals het scherm 'm toont: een parent met kinderen is de
        // som van zijn kinderen, een blad zijn eigen besteding.
        spentForBudget(b.id, childIdsByParent[b.id] ?? [], spendingMap),
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
        .eq('user_id', claims.sub)
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
        .eq('user_id', claims.sub)
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
        .eq('user_id', claims.sub)
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
        .eq('user_id', claims.sub)
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
