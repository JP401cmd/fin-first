'use client'

/**
 * Horizon-kernel · beheer-transparantie — gedeelde presentatie-primitieven.
 * Krant/editorial-stijl, Horizon-accent, mono tabular-nums voor cijfers.
 */

import { useState, type ReactNode } from 'react'
import { formatCurrency } from '@/lib/format'
import type { CellValue, ColKind } from './types'

const NUM = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 })

/** Format één cel op basis van zijn soort. Lege ("") cel → dun streepje. */
export function fmtCell(v: CellValue, kind: ColKind): string {
  if (v === '' || v === null || v === undefined) return '·'
  if (typeof v === 'boolean') return v ? 'ja' : 'nee'
  if (typeof v === 'string') return v
  switch (kind) {
    case 'eur':
      return formatCurrency(Math.round(v))
    case 'pct':
      return `${(v * 100).toFixed(1).replace('.', ',')}%`
    case 'age':
      return v.toFixed(1).replace('.', ',')
    case 'flag':
      return v ? 'ja' : 'nee'
    case 'idx':
      return String(Math.round(v))
    default:
      return Math.abs(v) >= 100 ? NUM.format(Math.round(v)) : v.toFixed(2).replace('.', ',')
  }
}

/** Compacte €-notatie (€284k / €1,2M) voor KPI-waarden. */
export function eurShort(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e6) return `${sign}€${(abs / 1e6).toFixed(1).replace('.', ',')}M`
  if (abs >= 1000) return `${sign}€${Math.round(abs / 1000)}k`
  return `${sign}€${Math.round(abs)}`
}

export function Kicker({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-3.5 w-1 rounded-full bg-[var(--color-horizon-500)]" />
      {/* Kleine uppercase-labels niet in module-accent (contrast-fragiel op 11px);
          het accent zit in het streepje ernaast. */}
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-2)] font-mono">
        {children}
      </span>
    </div>
  )
}

export function SectionCard({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`border border-[var(--border-ed)] bg-[var(--paper)] p-5 ${className}`}>
      {children}
    </section>
  )
}

export function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)] font-mono">
        {label}
      </div>
      <div className="mt-1 text-lg font-bold font-mono tabular-nums leading-tight text-[var(--ink)]">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-[var(--ink-3)]">{sub}</div>}
    </div>
  )
}

/** Het uitleg-blok per rekenstap: wat / keuzes / doorstroom. */
export function StepExplainer({
  uitleg,
  keuzes,
  doorstroom,
}: {
  uitleg: string
  keuzes: readonly string[]
  doorstroom: string
}) {
  return (
    <div className="space-y-3 rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] p-4 text-sm">
      <p className="font-serif leading-relaxed text-[var(--ink-2)]">{uitleg}</p>
      {keuzes.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)] font-mono">
            Keuzes & aannames in deze stap
          </div>
          <ul className="space-y-1">
            {keuzes.map((k, i) => (
              <li key={i} className="flex gap-2 text-[var(--ink-2)]">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--color-horizon-500)]" />
                <span>{k}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="border-t border-[var(--border-ed)] pt-2.5 text-[var(--ink-3)]">
        <span className="font-semibold text-[var(--ink-2)]">Doorstroom → </span>
        {doorstroom}
      </p>
    </div>
  )
}

/** Kern/betekenis-tabel: label + waarde + bron. */
export function FieldTable({
  rows,
}: {
  rows: ReadonlyArray<{ label: string; waarde: string; bron: string }>
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-[var(--border-ed)] first:border-t-0">
              <td className="py-2 pr-4 text-[var(--ink-2)]">{r.label}</td>
              <td className="py-2 pr-4 text-right font-mono tabular-nums text-[var(--ink)]">{r.waarde}</td>
              <td className="py-2 text-right font-mono text-[10px] text-[var(--ink-4)]">{r.bron}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Generiek data-grid met sticky header en horizontale scroll. */
export function DataGrid({
  columns,
  rows,
  emptyRows = false,
  showScrollHint = false,
}: {
  columns: ReadonlyArray<{ letter: string; label: string; kind: ColKind }>
  rows: CellValue[][]
  /** Toon rijen waarvan alle datacellen leeg/0 zijn niet grijs (default false = wel dimmen). */
  emptyRows?: boolean
  /** Toon een "sleep →"-affordance rechtsboven zolang nog niet horizontaal gescrold is. */
  showScrollHint?: boolean
}) {
  const [scrolled, setScrolled] = useState(false)
  return (
    <div className="relative">
      <div
        className="max-h-[560px] overflow-auto rounded-xl border border-[var(--border-ed)]"
        onScroll={(e) => {
          if (showScrollHint && !scrolled && e.currentTarget.scrollLeft > 0) setScrolled(true)
        }}
      >
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-[var(--subtle)]">
            <tr>
              {columns.map((c, i) => (
                <th
                  key={i}
                  scope="col"
                  className={`whitespace-nowrap border-b border-[var(--border-ed)] px-2.5 py-2 text-right font-mono font-semibold text-[var(--ink-2)] ${
                    i === 0 ? 'sticky left-0 z-20 bg-[var(--subtle)] text-left' : ''
                  }`}
                  title={`Excel-kolom ${c.letter}`}
                >
                  <div className="text-[var(--ink)]">{c.label}</div>
                  <div className="text-[9px] font-normal text-[var(--ink-4)]">{c.letter}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="odd:bg-[color-mix(in_oklch,var(--subtle)_35%,transparent)]">
                {row.map((cell, ci) => {
                  const kind = columns[ci]?.kind ?? 'num'
                  const isEmpty = cell === '' || cell === null || cell === 0
                  return (
                    <td
                      key={ci}
                      className={`whitespace-nowrap px-2.5 py-1.5 text-right font-mono tabular-nums ${
                        ci === 0
                          ? 'sticky left-0 bg-[var(--paper)] text-left font-semibold text-[var(--ink)]'
                          : isEmpty && !emptyRows
                            ? 'text-[var(--ink-4)]'
                            : 'text-[var(--ink-2)]'
                      }`}
                    >
                      {fmtCell(cell, kind)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showScrollHint && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute right-3.5 top-3.5 z-20 border border-[var(--rule-soft)] bg-[var(--paper)] px-1.5 py-px font-mono text-[8.5px] uppercase tracking-[0.1em] text-[var(--ink-3)] transition-opacity duration-200 ${
            scrolled ? 'opacity-0' : 'opacity-100'
          }`}
        >
          sleep →
        </span>
      )}
    </div>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-8 text-sm text-[var(--ink-3)]">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-horizon-500)] border-t-transparent" />
      {label}
    </div>
  )
}

export function Notice({ tone, children }: { tone: 'info' | 'warn'; children: ReactNode }) {
  const color = tone === 'warn' ? 'var(--color-kern-600)' : 'var(--color-horizon-600)'
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-4 text-sm text-[var(--ink-2)]">
      <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <div>{children}</div>
    </div>
  )
}
