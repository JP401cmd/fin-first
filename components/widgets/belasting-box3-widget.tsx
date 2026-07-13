import { memo, type ReactNode } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { MaskedAmount } from '@/components/app/masked-amount'
import { Receipt } from 'lucide-react'
import type { DashboardData } from './widget-renderer'
import { dailyExpenseRate } from '@/lib/format'
import { NL_FICTIEF_BELEGGINGEN, BOX3_TARIEF } from '@/lib/constants'
import { BOX3_PARAMS } from '@/lib/box3-data'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

// Heffingsvrij vermogen — single, zonder fiscaal partner. Single-sourced uit de
// canonieke BOX3_PARAMS, op hetzelfde belastingjaar (2025) als waarmee de bundel
// `box3Tax` wordt berekend (dashboard-data-loader gebruikt year: 2025).
const BOX3_YEAR = 2025 as const
const VRIJSTELLING = BOX3_PARAMS[BOX3_YEAR].heffingsvrijSingle

export const BelastingBox3Widget = memo(function BelastingBox3Widget({ size, data, href }: Props) {
  const { totalAssets, monthlyExpenses, box3Tax } = data

  // ── Box 3 breakdown calculation ──────────────────────────
  // De HEADLINE (`estimatedTax`) komt uit de bundel-`box3Tax` (dual-forfait
  // calculateBox3) wanneer beschikbaar — dat is het canonieke getal. De kassabon
  // hieronder is een INDICATIEVE enkel-forfait-benadering (alles als beleggingen,
  // geen spaargeld/schulden-splitsing); de Box 3-pagina toont de volledige
  // dual-forfait-berekening. Het fallback-getal gebruikt dezelfde benadering.
  const belastbaarVermogen = Math.max(totalAssets - VRIJSTELLING, 0)
  const fictiefRendement = belastbaarVermogen * NL_FICTIEF_BELEGGINGEN
  const estimatedTax = box3Tax ?? fictiefRendement * BOX3_TARIEF
  const effectiefTarief = totalAssets > 0
    ? (estimatedTax / totalAssets) * 100
    : 0
  // Canoniek 12-mnd rolling dagtarief uit de bundel (KRUIS-20); fallback voor mocks.
  const dailyExp = data.dailyExpenseRate ?? dailyExpenseRate(monthlyExpenses)
  const vrijheidsdagen = dailyExp > 0
    ? Math.round(estimatedTax / dailyExp)
    : 0

  // ── Mini-size ────────────────────────────────────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker="Box 3 Belasting" href={href}>
        <p className="text-[var(--ink)] leading-none truncate">
          <MaskedAmount value={estimatedTax} tone="kern" className="text-[15px] font-semibold" />
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter-size ──────────────────────────────────────────
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Box 3 Belasting" href={href}>
        <div className="flex items-center gap-2">
          <Receipt className="h-3 w-3 text-kern-500 shrink-0" />
          <p className="text-[var(--ink)]">
            <MaskedAmount value={estimatedTax} tone="kern" className="text-lg font-semibold" />
          </p>
        </div>
        <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
          Schatting vermogensbelasting
        </p>
      </WidgetShell>
    )
  }

  // ── Half-size: horizontal layout — left tax amount, right details ──
  if (size === 'half') {
    return (
      <WidgetShell module="kern" size={size} kicker="Box 3 Belasting" href={href}>
        <div className="flex gap-3 h-full">
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-kern-500 shrink-0" />
              <p className="text-[var(--ink)]">
                <MaskedAmount value={estimatedTax} tone="kern" className="text-xl font-semibold" />
              </p>
            </div>
            <p className="mt-1 text-[11px] text-[var(--ink-3)]">
              Vermogensbelasting
            </p>
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
            {effectiefTarief > 0 && (
              <p className="text-[11px] text-[var(--ink-2)]">
                Tarief: <span className="font-mono tabular-nums font-medium">{effectiefTarief.toFixed(2)}%</span>
              </p>
            )}
            {vrijheidsdagen > 0 && (
              <p className="font-serif italic text-[11px] text-[var(--ink-3)]">
                = {vrijheidsdagen} {vrijheidsdagen === 1 ? 'dag' : 'dagen'}/jaar
              </p>
            )}
          </div>
        </div>
      </WidgetShell>
    )
  }

  // ── Full-size: kassabon-stijl breakdown ───────────────────
  const breakdownRows: { label: string; value: ReactNode; accent?: boolean; bold?: boolean; separator?: boolean }[] = [
    { label: 'Totaal vermogen', value: <MaskedAmount value={totalAssets} tone="kern" /> },
    { label: 'Vrijstelling', value: <MaskedAmount value={VRIJSTELLING} signPrefix="-" tone="kern" /> },
    { label: '', value: '', separator: true },
    { label: 'Belastbaar vermogen', value: <MaskedAmount value={belastbaarVermogen} tone="kern" />, bold: true },
    { label: `Fictief rendement (${(NL_FICTIEF_BELEGGINGEN * 100).toFixed(2)}%)`, value: <MaskedAmount value={fictiefRendement} tone="kern" /> },
    { label: `Tarief (${(BOX3_TARIEF * 100).toFixed(0)}%)`, value: `× ${(BOX3_TARIEF * 100).toFixed(0)}%` },
    { label: '', value: '', separator: true },
    { label: 'Netto belasting', value: <MaskedAmount value={estimatedTax} tone="kern" />, bold: true, accent: true },
  ]

  return (
    <WidgetShell module="kern" size={size} kicker="Box 3 Belasting" href={href}>
      <div className="flex items-center gap-2">
        <Receipt className="h-4 w-4 text-kern-500 shrink-0" />
        <p className="text-[var(--ink)]">
          <MaskedAmount value={estimatedTax} tone="kern" className="text-2xl font-semibold" />
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

      <p className="mt-2 text-[10px] text-[var(--ink-4)]">
        Indicatieve benadering (enkel forfait). Bekijk de volledige Box 3-berekening voor de exacte heffing.
      </p>
      <p className="mt-1 font-serif italic text-[12px] text-[var(--ink-3)]">
        Bekijk volledige Box 3 berekening &rarr;
      </p>
    </WidgetShell>
  )
})

