'use client'

/**
 * VasteLastenList — lichtgewicht read-only lijst van recurring_transactions
 * voor cashflow view-switcher op /overzicht/cashflow?view=vaste-lasten.
 * Per regel: category-icoon + naam + frequentie-label + bedrag (rechts).
 * Niet-maandelijkse items tonen extra "€X/mnd"-equivalent. Sorteert op
 * maandelijks equivalent (groot → klein), met totaal-counter onderaan.
 *
 * Geen edit/opzeg-actions — voor bewerking: Will-coach op /overzicht.
 */

import { CreditCard, Home, Zap, Shield, Car, Building, HelpCircle } from 'lucide-react'

export type VasteLastenRow = {
  id: string
  name: string
  amount: number          // Originele bedrag (kan kwartaal/jaar zijn)
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  category?: string | null
}

const FREQ_LABELS: Record<string, string> = {
  weekly: 'per week',
  monthly: 'per maand',
  quarterly: 'per kwartaal',
  yearly: 'per jaar',
}

const CATEGORY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  subscription: CreditCard,
  rent: Home,
  mortgage: Building,
  utility: Zap,
  insurance: Shield,
  transport: Car,
}

function monthlyAmount(amount: number, frequency: string): number {
  switch (frequency) {
    case 'weekly':
      return amount * 4.345
    case 'quarterly':
      return amount / 3
    case 'yearly':
      return amount / 12
    case 'monthly':
    default:
      return amount
  }
}

function formatEUR(amount: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Lichtgewicht vaste-lasten lijst-view voor cashflow view-switcher.
 * Toont herkenbare terugkerende uitgaven gesorteerd op maandelijks
 * equivalent (groot → klein), met totaal-counter onderaan.
 *
 * Geen actie-flows (cancellation, edit) — pure read-only summary.
 * Voor volledige bewerking: Will-coach in WillLanding op /overzicht.
 */
export function VasteLastenList({ items }: { items: VasteLastenRow[] }) {
  const sorted = [...items].sort(
    (a, b) => monthlyAmount(b.amount, b.frequency) - monthlyAmount(a.amount, a.frequency),
  )
  const totalMonthly = sorted.reduce(
    (s, item) => s + monthlyAmount(item.amount, item.frequency),
    0,
  )

  if (sorted.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-6 sm:p-8 text-center">
        <p className="text-sm text-[var(--ink-2)] mb-2">
          Geen vaste lasten herkend.
        </p>
        <p className="text-xs text-[var(--ink-3)]">
          Will herkent terugkerende uitgaven automatisch zodra je transacties
          importeert.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-lg sm:text-xl font-semibold text-[var(--ink)]">
          Vaste lasten
        </h2>
        <span className="text-[10px] uppercase tracking-[0.12em] font-mono text-[var(--ink-3)]">
          {sorted.length} herkend
        </span>
      </header>

      <ul className="divide-y divide-[var(--border-ed)]">
        {sorted.map((item) => {
          const monthly = monthlyAmount(item.amount, item.frequency)
          const Icon = (item.category && CATEGORY_ICON[item.category]) || HelpCircle
          return (
            <li key={item.id} className="flex items-center gap-3 py-2.5">
              <span
                className="shrink-0 w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center"
                aria-hidden
              >
                <Icon className="w-4 h-4 text-violet-700" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[var(--ink)] truncate">
                  {item.name}
                </div>
                <div className="text-[11px] text-[var(--ink-3)]">
                  {FREQ_LABELS[item.frequency] ?? item.frequency}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono text-sm font-semibold text-[var(--ink)]">
                  {formatEUR(item.amount)}
                </div>
                {item.frequency !== 'monthly' && (
                  <div className="text-[10px] text-[var(--ink-3)]">
                    {formatEUR(monthly)}/mnd
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <footer className="mt-3 pt-3 border-t border-[var(--border-ed)] flex items-baseline justify-between">
        <span className="text-xs text-[var(--ink-3)]">Totaal per maand</span>
        <span className="font-mono text-base font-semibold text-[var(--ink)]">
          {formatEUR(totalMonthly)}
        </span>
      </footer>
    </section>
  )
}
