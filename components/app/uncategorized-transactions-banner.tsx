import { MoveRight } from 'lucide-react'

interface UncategorizedTransactionsBannerProps {
  count: number
  totalAmount: number
  onClick: () => void
  formatCurrency: (n: number) => string
}

export function UncategorizedTransactionsBanner({
  count,
  totalAmount,
  onClick,
  formatCurrency,
}: UncategorizedTransactionsBannerProps) {
  if (count === 0) return null

  const label =
    count === 1
      ? '1 transactie zonder categorie'
      : `${count} transacties zonder categorie`

  return (
    <button
      type="button"
      onClick={onClick}
      className="group mt-3 flex w-full items-center gap-3 rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--paper)] px-4 py-3 text-left transition-all hover:border-kern-300 hover:bg-[var(--subtle)] hover:shadow-[var(--s1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kern-500 focus-visible:ring-offset-2"
    >
      {/* 3px kern-kleur verticale rule */}
      <div className="h-8 w-[3px] shrink-0 rounded-full bg-[var(--kern)]" />

      {/* Kicker + italic label */}
      <div className="min-w-0 flex-1">
        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
          Aandacht vereist
        </p>
        <p className="mt-0.5 font-serif text-sm italic text-[var(--ink-2)]">{label}</p>
      </div>

      {/* Bedrag + tag + pijl */}
      <div className="flex shrink-0 items-center gap-2.5">
        <div className="text-right">
          <p className="font-mono text-sm font-medium tabular-nums text-[var(--ink)]">
            {formatCurrency(totalAmount)}
          </p>
          <span
            className="mt-0.5 inline-block rounded-[var(--r-sm)] border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.05em]"
            style={{ background: '#fff0ef', color: '#b33a2e', borderColor: '#f5c5c0' }}
          >
            Niet verdeeld
          </span>
        </div>
        <div
          className="text-[var(--ink-4)] transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        >
          <MoveRight className="h-4 w-4" />
        </div>
      </div>
    </button>
  )
}
