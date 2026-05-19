'use client'

import { useMemo } from 'react'
import { formatCurrency } from '@/lib/format'
import type { TransactionRow } from '@/components/app/transacties-feed'

/**
 * CashflowSankey — visualiseert geldstroom van inkomen naar uitgaven en
 * overschot. MVP-versie: horizontale Sankey-LITE met staked-bars i.p.v.
 * crossing-paths (vereist polygon-rendering of dedicated library).
 *
 * Plan-context: backlog "Cashflow Sankey-chart, forecast, kalender uit
 * cash-overview". Sluit het trio af.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │ INKOMEN  €4.200                                                  │
 *   └─────────────────────────────────────────────────────────────────┘
 *                                       ↓
 *   ┌──────────────┬────────┬──────┬──────┬────────────────────────┐
 *   │ Vaste lasten │ Boodsch │ Sport │ ...  │ Sparen / Overschot     │
 *   │ €1200        │ €600    │ €100  │      │ €1500                  │
 *   └──────────────┴────────┴──────┴──────┴────────────────────────┘
 *
 * Voor MVP groeperen we transactions per `category`. Geen sub-categorieën,
 * geen drill-down. Tegen Sankey-MVP-doel is dit "snel overzicht waar je
 * geld heen gaat", niet "diep categorie-onderzoek".
 */

type CategoryBucket = {
  category: string
  amount: number
  pct: number // % van totale uitgaven
}

const CATEGORY_COLORS: Record<string, string> = {
  // Common NL category-labels uit transactions, met semantische tint
  boodschappen: '#65a30d',
  abonnementen: '#7c3aed',
  vervoer: '#0284c7',
  wonen: '#0d9488',
  zorg: '#be123c',
  vrije_tijd: '#d97706',
  uit_eten: '#ea580c',
  energie: '#dc2626',
  verzekeringen: '#475569',
  belastingen: '#1e40af',
  vaste_lasten: '#9f1239',
  cadeaus: '#a21caf',
  overig: '#78716c',
}

function colorForCategory(cat: string): string {
  const key = cat.toLowerCase().replace(/\s+/g, '_')
  return CATEGORY_COLORS[key] ?? '#78716c'
}

function readableLabel(cat: string): string {
  // "vaste_lasten" → "Vaste lasten"
  return cat
    .split(/[_\s]+/)
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w.toLowerCase()))
    .join(' ')
}

export function CashflowSankey({
  transactions,
  monthLabel,
}: {
  /** Transactions uit afgelopen maand (deze maand of vorige). */
  transactions: TransactionRow[]
  /** Bv. "mei 2026" — getoond in header. */
  monthLabel?: string
}) {
  const { totalIncome, totalExpense, surplus, buckets } = useMemo(() => {
    let income = 0
    let expense = 0
    const cats = new Map<string, number>()
    for (const tx of transactions) {
      const amt = Number(tx.amount)
      if (amt > 0) {
        income += amt
      } else {
        expense += Math.abs(amt)
        const cat = (tx.category ?? 'overig').toLowerCase()
        cats.set(cat, (cats.get(cat) ?? 0) + Math.abs(amt))
      }
    }
    const bucketsArr: CategoryBucket[] = Array.from(cats.entries())
      .map(([category, amount]) => ({
        category,
        amount,
        pct: expense > 0 ? (amount / expense) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
    return {
      totalIncome: Math.round(income),
      totalExpense: Math.round(expense),
      surplus: Math.round(income - expense),
      buckets: bucketsArr,
    }
  }, [transactions])

  if (totalIncome === 0 && totalExpense === 0) {
    return (
      <div className="space-y-4">
        <header>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Cashflow — Sankey
          </div>
          <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
            Geldstroom-visualisatie
          </h2>
        </header>
        <div className="rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-6 text-center">
          <p className="text-sm text-[var(--ink-3)] italic leading-relaxed">
            Nog geen transacties deze maand om visueel te maken. Importeer
            via{' '}
            <span className="font-medium">/core/cash/import</span> of voeg
            handmatig transacties toe.
          </p>
        </div>
      </div>
    )
  }

  // Surplus-bucket toevoegen rechts als laatste segment wanneer income > expense.
  const expenseBuckets = [...buckets]
  if (surplus > 0 && totalIncome > 0) {
    expenseBuckets.push({
      category: '__surplus',
      amount: surplus,
      pct: (surplus / totalIncome) * 100,
    })
  }

  // Renormaliseer: alle outflow-segments samen moeten 100% van income vullen.
  const totalOutflow = totalExpense + Math.max(0, surplus)
  const renorm = (amt: number) => (totalOutflow > 0 ? (amt / totalOutflow) * 100 : 0)

  return (
    <div className="space-y-5">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Cashflow — Sankey {monthLabel ? `· ${monthLabel}` : ''}
          </div>
          <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
            Waar gaat je geld heen?
          </h2>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Inkomen
            </div>
            <div className="font-serif font-semibold text-emerald-700 tabular-nums">
              {formatCurrency(totalIncome)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Uitgaven
            </div>
            <div className="font-serif font-semibold text-red-700 tabular-nums">
              {formatCurrency(totalExpense)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
              {surplus >= 0 ? 'Overschot' : 'Tekort'}
            </div>
            <div
              className={`font-serif font-semibold tabular-nums ${
                surplus >= 0 ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {formatCurrency(Math.abs(surplus))}
            </div>
          </div>
        </div>
      </header>

      {/* Income-bar (één lange staaf met inkomen-totaal). Toont visueel
          de "bron" waarvan alles uitstroomt. */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)] mb-1.5">
          Inkomen
        </div>
        <div
          className="h-10 rounded-xl bg-emerald-600 flex items-center px-3"
          role="img"
          aria-label={`Inkomen totaal ${formatCurrency(totalIncome)}`}
        >
          <span className="text-sm font-semibold text-white tabular-nums">
            {formatCurrency(totalIncome)}
          </span>
        </div>
      </div>

      {/* Connector — visueel arrow tussen income en expenses. */}
      <div className="flex justify-center" aria-hidden="true">
        <div className="w-px h-6 bg-[var(--border-md)]" />
      </div>

      {/* Outflow-bar — gestapelde segmenten per categorie + surplus. */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)] mb-1.5">
          Uitstroom
        </div>
        <div
          className="flex h-10 rounded-xl overflow-hidden"
          role="img"
          aria-label="Uitstroom per categorie"
        >
          {expenseBuckets.map((b) => {
            const isSurplus = b.category === '__surplus'
            const width = renorm(b.amount)
            const color = isSurplus ? '#10b981' : colorForCategory(b.category)
            const label = isSurplus
              ? `Overschot ${formatCurrency(b.amount)}`
              : `${readableLabel(b.category)} ${formatCurrency(b.amount)}`
            return (
              <div
                key={b.category}
                style={{ width: `${width}%`, background: color, opacity: isSurplus ? 0.85 : 0.9 }}
                title={label}
                className="flex items-center justify-center text-[10px] font-semibold text-white truncate px-1"
              >
                {width >= 8 && (
                  <span className="truncate">
                    {isSurplus ? 'Overschot' : readableLabel(b.category)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legenda met cijfers — voor categorieën die te smal waren om in de
          bar te tonen, plus context-bedragen voor alle items. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 text-xs">
        {expenseBuckets.map((b) => {
          const isSurplus = b.category === '__surplus'
          const color = isSurplus ? '#10b981' : colorForCategory(b.category)
          const label = isSurplus ? 'Overschot' : readableLabel(b.category)
          return (
            <div
              key={b.category}
              className="flex items-center justify-between gap-2 py-0.5"
            >
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2 h-2 rounded-sm shrink-0"
                  style={{ background: color }}
                  aria-hidden="true"
                />
                <span className="text-[var(--ink-2)] truncate">{label}</span>
              </span>
              <span className="text-[var(--ink-3)] tabular-nums shrink-0">
                {formatCurrency(b.amount)} · {Math.round(renorm(b.amount))}%
              </span>
            </div>
          )
        })}
      </div>

      <p className="text-[11px] italic text-[var(--ink-3)]">
        Categorisering uit transactions. Voor categorie-beheer zie{' '}
        <span className="font-medium">/overzicht/cashflow → Transacties</span>.
      </p>
    </div>
  )
}
