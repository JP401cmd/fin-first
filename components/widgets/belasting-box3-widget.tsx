import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency } from '@/lib/format'
import { Receipt } from 'lucide-react'
import type { DashboardData } from './widget-renderer'
import { NL_FICTIEF_BELEGGINGEN, BOX3_TARIEF } from '@/lib/constants'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

/** Heffingsvrij vermogen 2025 (single, without partner). */
const VRIJSTELLING = 57_684

export function BelastingBox3Widget({ size, data, href }: Props) {
  const { totalAssets, monthlyExpenses, box3Tax } = data

  // ── Box 3 breakdown calculation ──────────────────────────
  const belastbaarVermogen = Math.max(totalAssets - VRIJSTELLING, 0)
  const fictiefRendement = belastbaarVermogen * NL_FICTIEF_BELEGGINGEN
  const estimatedTax = box3Tax ?? fictiefRendement * BOX3_TARIEF
  const effectiefTarief = totalAssets > 0
    ? (estimatedTax / totalAssets) * 100
    : 0
  const dailyExp = monthlyExpenses / 30
  const vrijheidsdagen = dailyExp > 0
    ? Math.round(estimatedTax / dailyExp)
    : 0

  // ── Quarter-size ──────────────────────────────────────────
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Box 3 Belasting" href={href}>
        <div className="flex items-center gap-2">
          <Receipt className="h-3 w-3 text-kern-500 shrink-0" />
          <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
            {formatCurrency(estimatedTax)}
          </p>
        </div>
        <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
          Schatting vermogensbelasting
        </p>
      </WidgetShell>
    )
  }

  // ── Half-size ─────────────────────────────────────────────
  if (size === 'half') {
    return (
      <WidgetShell module="kern" size={size} kicker="Box 3 Belasting" href={href}>
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-kern-500 shrink-0" />
          <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
            {formatCurrency(estimatedTax)}
          </p>
        </div>
        <p className="mt-1 text-xs text-[var(--ink-3)]">
          Schatting vermogensbelasting
        </p>
        {vrijheidsdagen > 0 && (
          <p className="mt-1.5 font-serif italic text-[12px] text-[var(--ink-3)]">
            = {vrijheidsdagen} dagen vrijheid
          </p>
        )}
        <p className="mt-2 font-serif italic text-[12px] text-[var(--ink-3)]">
          Bekijk Box 3 berekening &rarr;
        </p>
      </WidgetShell>
    )
  }

  // ── Full-size: kassabon-stijl breakdown ───────────────────
  const breakdownRows: { label: string; value: string; accent?: boolean; bold?: boolean; separator?: boolean }[] = [
    { label: 'Totaal vermogen', value: formatCurrency(totalAssets) },
    { label: 'Vrijstelling', value: `-${formatCurrency(VRIJSTELLING)}` },
    { label: '', value: '', separator: true },
    { label: 'Belastbaar vermogen', value: formatCurrency(belastbaarVermogen), bold: true },
    { label: `Fictief rendement (${(NL_FICTIEF_BELEGGINGEN * 100).toFixed(2)}%)`, value: formatCurrency(fictiefRendement) },
    { label: `Tarief (${(BOX3_TARIEF * 100).toFixed(0)}%)`, value: `× ${(BOX3_TARIEF * 100).toFixed(0)}%` },
    { label: '', value: '', separator: true },
    { label: 'Netto belasting', value: formatCurrency(estimatedTax), bold: true, accent: true },
  ]

  return (
    <WidgetShell module="kern" size={size} kicker="Box 3 Belasting" href={href}>
      <div className="flex items-center gap-2">
        <Receipt className="h-4 w-4 text-kern-500 shrink-0" />
        <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
          {formatCurrency(estimatedTax)}
        </p>
      </div>

      {/* Kassabon breakdown */}
      <div className="mt-3 space-y-0">
        {breakdownRows.map((row, i) =>
          row.separator ? (
            <div key={i} className="border-b border-dashed border-[var(--border-ed)] my-1.5" />
          ) : (
            <div
              key={i}
              className={`flex justify-between py-0.5 text-[11px] ${
                row.bold ? 'font-medium' : ''
              } ${row.accent ? 'text-kern-700' : 'text-[var(--ink-2)]'}`}
            >
              <span>{row.label}</span>
              <span className="font-mono tabular-nums">{row.value}</span>
            </div>
          )
        )}
      </div>

      {/* Effectief tarief + vrijheidsdagen */}
      <div className="mt-3 space-y-1.5">
        <div className="flex justify-between text-[11px]">
          <span className="text-[var(--ink-3)]">Effectief tarief</span>
          <span className="font-mono tabular-nums font-medium text-[var(--ink)]">
            {effectiefTarief.toFixed(2)}%
          </span>
        </div>

        {vrijheidsdagen > 0 && (
          <p className="font-serif italic text-[12px] text-[var(--ink-3)]">
            Deze belasting kost je {vrijheidsdagen} {vrijheidsdagen === 1 ? 'dag' : 'dagen'} vrijheid per jaar
          </p>
        )}
      </div>

      <p className="mt-2 font-serif italic text-[12px] text-[var(--ink-3)]">
        Bekijk volledige Box 3 berekening &rarr;
      </p>
    </WidgetShell>
  )
}
