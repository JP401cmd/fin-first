import { formatCurrency } from '@/lib/format'

interface KassabonRow {
  label: string
  value: number
  sublabel?: string
  highlight?: boolean
}

export function KassabonTable({
  title,
  rows,
  total,
  totalLabel = 'Totaal',
  footer,
}: {
  title?: string
  rows: KassabonRow[]
  total?: { label: string; value: number }
  totalLabel?: string
  footer?: string
}) {
  return (
    <div className="kassabon-block rounded-lg border border-dashed border-[var(--border-ed)] bg-[var(--subtle)] p-4 font-mono text-sm">
      {title && (
        <p className="mb-3 text-center font-inter text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
          {title}
        </p>
      )}

      <div className="space-y-1.5">
        {rows.map((row, i) => (
          <div key={i} className={`flex items-baseline justify-between gap-2 ${row.highlight ? 'font-medium text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}>
            <span className="truncate font-inter text-xs">
              {row.label}
              {row.sublabel && (
                <span className="ml-1 text-[var(--ink-4)]">{row.sublabel}</span>
              )}
            </span>
            <span className="shrink-0 tabular-nums font-dm-mono text-xs">
              {formatCurrency(row.value)}
            </span>
          </div>
        ))}
      </div>

      {total && (
        <>
          <div className="my-2 border-t-2 border-[var(--ink)]" />
          <div className="flex items-baseline justify-between font-bold text-[var(--ink)]">
            <span className="font-inter text-xs">{total.label || totalLabel}</span>
            <span className="font-dm-mono text-sm tabular-nums">{formatCurrency(total.value)}</span>
          </div>
        </>
      )}

      {footer && (
        <p className="mt-3 text-center font-inter text-[10px] text-[var(--ink-4)]">
          {footer}
        </p>
      )}
    </div>
  )
}
