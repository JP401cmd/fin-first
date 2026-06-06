'use client'

import { useEffect, useState } from 'react'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { FlowSummary } from '@/lib/transaction-insights'

/**
 * GeldstroomGauge — de headline van de transactie-analysepagina.
 *
 * Een horizontale links→rechts verhoudingsmeter: bijschrijvingen (inkomsten,
 * links, income-kleur) tegenover afschrijvingen (uitgaven, rechts,
 * expense-kleur). Het splitspunt weerspiegelt income / (income + expense).
 * Daaronder een 4-up KPI-grid (Inkomen / Uitgaven / Saldo / Spaarquote)
 * in dezelfde editorial KPI-stijl als `transacties-geldstroom.tsx`.
 *
 * Presentational: enkel een `FlowSummary` in, geen data-fetching. Bij volledig
 * geen activiteit (income === 0 && expense === 0) rendert het niets.
 */

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

export function GeldstroomGauge({ summary }: { summary: FlowSummary }) {
  const { income, expense, net, savingsRate } = summary

  // Animeer de meter-split op mount: start in het midden (50/50) en zwel uit
  // naar de werkelijke verhouding via een CSS-width-transition.
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Verberg bij volledig geen transactie-activiteit.
  if (income === 0 && expense === 0) {
    return null
  }

  const total = income + expense
  // Aandeel inkomsten links; bij total 0 (onmogelijk hier, maar veilig) 50%.
  const incomeShare = total > 0 ? (income / total) * 100 : 50
  // Vóór de mount-animatie staat de split in het midden.
  const leftWidth = entered ? incomeShare : 50

  return (
    <div className="space-y-3">
      {/* Verhoudingsmeter */}
      <div>
        {/* Uiteinde-labels met bedragen */}
        <div className="mb-1.5 flex items-baseline justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--color-income-700)]">
              In
            </span>
            <MaskedAmount
              value={income}
              tone="inherit"
              className="text-xs font-semibold text-[var(--color-income-700)]"
            />
          </div>
          <div className="flex items-baseline gap-1.5">
            <MaskedAmount
              value={expense}
              tone="inherit"
              className="text-xs font-semibold text-[var(--color-expense-600)]"
            />
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--color-expense-600)]">
              Uit
            </span>
          </div>
        </div>

        {/* Bar: twee segmenten + dunne centrale marker op de split */}
        <div
          className="relative flex h-3.5 w-full overflow-hidden border border-[var(--border-ed)]"
          role="img"
          aria-label={`Inkomsten versus uitgaven: ${Math.round(incomeShare)}% inkomsten`}
        >
          <div
            className="h-full bg-[var(--color-income-500)]"
            style={{
              width: `${leftWidth}%`,
              transition: 'width 700ms cubic-bezier(.22,1,.36,1)',
            }}
          />
          <div
            className="h-full flex-1 bg-[var(--color-expense-400)]"
            style={{ transition: 'width 700ms cubic-bezier(.22,1,.36,1)' }}
          />
          {/* Centrale split-marker */}
          <span
            aria-hidden
            className="absolute top-0 h-full w-px bg-[var(--paper)]"
            style={{
              left: `${leftWidth}%`,
              transition: 'left 700ms cubic-bezier(.22,1,.36,1)',
            }}
          />
        </div>
      </div>

      {/* 4-up KPI-grid */}
      <div className="grid grid-cols-2 border-t border-b border-[var(--border-ed)] sm:grid-cols-4">
        <KpiCell label="Inkomen" sub="ontvangen" tone="positive">
          <MaskedAmount value={income} tone="inherit" monoWhenVisible={false} />
        </KpiCell>
        <KpiCell label="Uitgaven" sub="besteed" tone="negative">
          <MaskedAmount value={expense} tone="inherit" monoWhenVisible={false} />
        </KpiCell>
        <KpiCell label="Saldo" sub="netto" tone={net >= 0 ? 'positive' : 'negative'}>
          <MaskedAmount
            value={net}
            tone="inherit"
            monoWhenVisible={false}
            signPrefix={net > 0 ? '+' : ''}
          />
        </KpiCell>
        <KpiCell label="Spaarquote" sub={savingsRateLabel(savingsRate)} tone="neutral">
          {`${savingsRate}%`}
        </KpiCell>
      </div>
    </div>
  )
}

function savingsRateLabel(rate: number): string {
  if (rate >= 30) return 'sterk'
  if (rate >= 15) return 'gezond'
  return 'laag'
}

function KpiCell({
  label,
  sub,
  tone,
  children,
}: {
  label: string
  sub: string
  tone: 'positive' | 'negative' | 'neutral'
  children: React.ReactNode
}) {
  const valueColor =
    tone === 'positive'
      ? 'text-[var(--color-income-700)]'
      : tone === 'negative'
        ? 'text-[var(--color-expense-600)]'
        : 'text-[var(--ink)]'
  const labelColor =
    tone === 'positive'
      ? 'text-[var(--color-income-700)]'
      : tone === 'negative'
        ? 'text-[var(--color-expense-600)]'
        : 'text-[var(--ink-3)]'

  return (
    <div className="p-3 sm:p-4 border-r border-[var(--border-ed)] last:border-r-0 [&:nth-child(-n+2)]:border-b sm:[&:nth-child(-n+2)]:border-b-0">
      <div className={`mb-1.5 text-[10px] font-mono uppercase tracking-[0.18em] ${labelColor}`}>
        {label}
      </div>
      <div
        className={`text-[20px] sm:text-[24px] font-black leading-none tracking-[-0.02em] tabular-nums ${valueColor}`}
        style={{ fontFamily: PLAYFAIR }}
      >
        {children}
      </div>
      <div className="mt-1.5 text-[11px] italic text-[var(--ink-3)]" style={{ fontFamily: SOURCE_SERIF }}>
        {sub}
      </div>
    </div>
  )
}
