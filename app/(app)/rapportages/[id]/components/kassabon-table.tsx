'use client'

import { useCallback } from 'react'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { ReceiptRow } from '@/components/app/horizon/phase-analysis/receipt-row'

interface KassabonRow {
  label: string
  value: number
  sublabel?: string
  highlight?: boolean
}

/**
 * H-05: kassabon-blok voor rapportage-breakdowns. Voorheen een handkopie van
 * het kassabon-patroon (eigen `.kassabon-block rounded-lg`-container + rij-markup);
 * nu gecomponeerd uit de canonieke primitives `KassabonShell` (container) en
 * `ReceiptRow` (regels). De publieke API (title/rows/total/footer) blijft gelijk,
 * dus de consumers (kern-column, rapportages/budget) veranderen niet.
 *
 * Twee bewuste API-bruggen omdat ReceiptRow leaner is dan de oude KassabonRow:
 *  - `sublabel` (bv. "/ € begroot") wordt aan het label gevoegd; ReceiptRow
 *    neemt geen aparte gedimde sublabel-node. Info blijft, de aparte ink-4-tint
 *    vervalt.
 *  - `highlight` (bv. > budget) wordt via een `font-medium`-wrapper hersteld:
 *    ReceiptRow zet zelf géén font-weight, dus de wrapper dringt door tot label
 *    én bedrag — dezelfde nadruk als de oude highlight-rij.
 */
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
  const { masked } = useMaskedAmounts()
  const fc = useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])
  return (
    <KassabonShell className="kassabon-block">
      {title && (
        <p className="mb-3 text-center font-inter text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
          {title}
        </p>
      )}

      <div className="space-y-1.5">
        {rows.map((row, i) => {
          const label = row.sublabel ? `${row.label} ${row.sublabel}` : row.label
          const receipt = <ReceiptRow label={label} value={fc(row.value)} />
          // highlight = nadruk-rij (bv. > budget): font-medium dringt door tot
          // ReceiptRow's label + bedrag (die zetten zelf geen weight).
          return row.highlight ? (
            <div key={i} className="font-medium text-[var(--ink)]">
              {receipt}
            </div>
          ) : (
            <div key={i}>{receipt}</div>
          )
        })}
      </div>

      {total && (
        <>
          {/* Kassabon-totaal: sluitstreep BOVEN het totaal (border-t-2). */}
          <div className="my-2 border-t-2 border-[var(--ink)]" />
          <div className="flex items-baseline justify-between font-bold text-[var(--ink)]">
            <span className="font-inter text-xs">{total.label || totalLabel}</span>
            <span className="font-dm-mono text-sm tabular-nums">{fc(total.value)}</span>
          </div>
        </>
      )}

      {footer && (
        <p className="mt-3 text-center font-inter text-[10px] text-[var(--ink-4)]">
          {footer}
        </p>
      )}
    </KassabonShell>
  )
}
