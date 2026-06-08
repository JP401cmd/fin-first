'use client'
import { useMemo } from 'react'
import { Repeat, Link2, FileText, CreditCard, RefreshCw, Smartphone, ArrowLeftRight, ArrowDownLeft, Landmark } from 'lucide-react'
import {
  cleanMerchantName, deriveType, parseLocationTime, avgDailyExpense,
  freedomDays, detectRecurring, groupByDay, monogram, type TxKind,
} from '@/lib/transaction-display'
import { formatCurrencyDecimals } from '@/lib/format'
import type { AnalysisTransaction } from '@/lib/transaction-insights'

// Editorial iconen (Lucide, scherp, gedempt) — GEEN emoji. Type uit deriveType().kind.
const TYPE_ICON: Record<TxKind, typeof CreditCard | null> = {
  pin: CreditCard, incasso: RefreshCw, ideal: Smartphone, overboeking: ArrowLeftRight,
  bijschrijving: ArrowDownLeft, betaalverzoek: ArrowLeftRight, bankkosten: Landmark, onbekend: null,
}

type AccountOption = { id: string; name: string; bankName: string | null; ibanTail: string | null; connected: boolean }
interface Props {
  transactions: AnalysisTransaction[]
  windowDays: number
  accounts: AccountOption[]
  selectedAccountId: string | null
  onSelectAccount: (id: string | null) => void
  onSelect?: (tx: AnalysisTransaction) => void
}

const WD = ['ma','di','wo','do','vr','za','zo']
const MO = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']
function dayHeader(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7
  return `${WD[dow]} ${d} ${MO[m - 1]}`
}
function freedomLabel(days: number): string {
  if (days <= 0) return ''
  const v = days.toFixed(1).replace('.', ',')
  return `≈ ${v} vrijheidsdag${days >= 2 ? 'en' : ''}`
}

export function TransactieTijdlijn({ transactions, windowDays, accounts, selectedAccountId, onSelectAccount, onSelect }: Props) {
  const daily = useMemo(() => avgDailyExpense(transactions, windowDays), [transactions, windowDays])
  const recurring = useMemo(
    () => detectRecurring(transactions.map((t) => ({ id: t.id, counterparty_name: t.counterparty_name, counterparty_iban: t.counterparty_iban, creditor_id: t.creditor_id, amount: t.amount, date: t.date }))),
    [transactions],
  )
  const groups = useMemo(() => groupByDay(transactions), [transactions])

  return (
    <section className="border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
      {accounts.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1 text-xs" role="group" aria-label="Kies rekening">
          <AccountButton active={selectedAccountId === null} label="Alle rekeningen" onClick={() => onSelectAccount(null)} />
          {accounts.map((a) => (
            <AccountButton key={a.id} active={selectedAccountId === a.id} connected={a.connected}
              label={a.name} onClick={() => onSelectAccount(a.id)} />
          ))}
        </div>
      )}
      <div role="list" className="space-y-4">
        {groups.map((g) => (
          <div key={g.date}>
            <div className="flex items-baseline justify-between border-b border-[var(--ink)] pb-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-3)]">{dayHeader(g.date)}</span>
              <span className="font-mono text-[11px] text-[var(--ink-3)] tabular-nums">
                {g.incomeTotal - g.expenseTotal >= 0 ? '+' : '−'} {formatCurrencyDecimals(Math.abs(g.incomeTotal - g.expenseTotal))}
                {daily > 0 && <span className="text-[var(--color-kern-700)]"> · {freedomLabel(freedomDays(g.expenseTotal, daily))}</span>}
              </span>
            </div>
            <ul className="divide-y divide-dotted divide-[var(--border-ed)]">
              {g.rows.map((t) => <Row key={t.id} t={t} recurring={recurring.has(t.id)} onSelect={onSelect} />)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

function AccountButton({ active, label, onClick, connected }: { active: boolean; label: string; onClick: () => void; connected?: boolean }) {
  const SrcIcon = connected === undefined ? null : connected ? Link2 : FileText
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={['inline-flex items-center gap-1.5 min-h-[44px] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.06em] border',
        active ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]' : 'bg-[var(--paper)] text-[var(--ink-3)] border-[var(--border-ed)]'].join(' ')}>
      {SrcIcon && <SrcIcon className="h-3 w-3" aria-hidden />}
      {label}
    </button>
  )
}

function Row({ t, recurring, onSelect }: { t: AnalysisTransaction; recurring: boolean; onSelect?: (tx: AnalysisTransaction) => void }) {
  const name = cleanMerchantName(t.counterparty_name)
  const type = deriveType(t.transaction_type, t.counterparty_name, t.amount)
  const TypeIcon = TYPE_ICON[type.kind]
  const loc = parseLocationTime(t.description)
  const sub = loc.place ? `${loc.place}${loc.time ? ` · ${loc.time}` : ''}` : t.description
  const income = t.amount > 0
  const content = (
    <>
      <span className="flex-none w-[33px] h-[33px] bg-[var(--color-kern-50)] border border-[var(--border-ed)] flex items-center justify-center font-mono text-[11px] text-[var(--color-kern-700)]" aria-hidden>
        {monogram(name)}
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="font-serif font-semibold text-[14.5px] text-[var(--ink)] truncate">{name}</span>
          {TypeIcon && <TypeIcon className="h-3 w-3 flex-none text-[var(--ink-3)]" aria-label={type.label} />}
          {recurring && <Repeat className="h-3 w-3 flex-none text-[var(--color-kern-700)]" aria-label="terugkerend" />}
        </span>
        <span className="block text-[11px] italic text-[var(--ink-3)] truncate">{sub}</span>
      </span>
      <span className="flex-none text-right">
        <span className={['block font-mono text-[14px] tabular-nums', income ? 'text-[var(--positive)]' : 'text-[var(--ink)]'].join(' ')}>
          {income ? '+' : '−'} {formatCurrencyDecimals(Math.abs(t.amount))}
        </span>
        {t.running_balance != null && (
          <span className="block font-mono text-[10px] text-[var(--ink-4)] tabular-nums">saldo {formatCurrencyDecimals(t.running_balance)}</span>
        )}
        {t.fx_amount != null && t.fx_currency && (
          <span className="block font-mono text-[9px] text-[var(--ink-4)]">{t.fx_currency} {t.fx_amount}{t.fx_rate ? ` @ ${t.fx_rate}` : ''}</span>
        )}
      </span>
    </>
  )
  if (onSelect) {
    return (
      <li>
        <button type="button" onClick={() => onSelect(t)} className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-[var(--subtle)] focus:outline-2 focus:outline-[var(--ink)]">
          {content}
        </button>
      </li>
    )
  }
  return <li className="flex items-center gap-3 py-2.5">{content}</li>
}
