import { memo, type ReactNode } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { MaskedAmount } from '@/components/app/masked-amount'
import { Receipt } from 'lucide-react'
import type { DashboardData } from './widget-renderer'
import { dailyExpenseRate } from '@/lib/format'
import { NL_FICTIEF_BELEGGINGEN, BOX3_TARIEF } from '@/lib/constants'
import { BOX3_PARAMS, CURRENT_TAX_YEAR } from '@/lib/box3-data'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

// Heffingsvrij vermogen — single, zonder fiscaal partner, uit de canonieke
// BOX3_PARAMS op het lopende belastingjaar (CURRENT_TAX_YEAR). Alleen gebruikt in
// de fallback-(enkel-forfait) kassabon; wanneer de bundel `box3Breakdown` levert
// consumeren we het echte heffingsvrije vermogen uit calculateBox3.
const VRIJSTELLING = BOX3_PARAMS[CURRENT_TAX_YEAR].heffingsvrijSingle

export const BelastingBox3Widget = memo(function BelastingBox3Widget({ size, data, href }: Props) {
  const { totalAssets, monthlyExpenses, box3Tax, box3Breakdown } = data

  // De HEADLINE komt uit de canonieke bundel-`box3Tax` (dual-forfait calculateBox3),
  // identiek aan wat /overzicht/belasting/box3 toont. De kassabon consumeert waar
  // mogelijk de dual-forfait breakdown (box3Breakdown) zodat de tussenrijen exact
  // sluiten op dit getal; zonder breakdown (mock/fallback) tonen we een expliciete
  // indicatie zonder misleidende ×-afleiding.
  const bd = box3Breakdown ?? null

  // Fallback enkel-forfait benadering (alleen als er geen breakdown beschikbaar is).
  const fbBelastbaar = Math.max(totalAssets - VRIJSTELLING, 0)
  const fbTax = fbBelastbaar * NL_FICTIEF_BELEGGINGEN * BOX3_TARIEF

  const estimatedTax = box3Tax ?? bd?.tax ?? fbTax
  const belastbaar = bd ? bd.grondslagSparen : fbBelastbaar
  const effectiefTarief = totalAssets > 0 ? (estimatedTax / totalAssets) * 100 : 0
  // Canoniek 12-mnd rolling dagtarief uit de bundel (KRUIS-20); fallback voor mocks.
  const dailyExp = data.dailyExpenseRate ?? dailyExpenseRate(monthlyExpenses)
  const vrijheidsdagen = dailyExp > 0 ? Math.round(estimatedTax / dailyExp) : 0

  // Lege staat: vermogen onder de vrijstelling (of geen vermogen) → geen Box 3.
  const hasBox3 = estimatedTax > 0 && belastbaar > 0

  // ── Mini-size ────────────────────────────────────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker="Box 3 Belasting" href={href}>
        <p className="text-[var(--ink)] leading-none truncate">
          {hasBox3 ? (
            <MaskedAmount value={estimatedTax} tone="kern" className="text-[15px] font-semibold" />
          ) : (
            <span className="text-[13px] font-medium text-[var(--ink-3)]">Geen Box 3</span>
          )}
        </p>
      </WidgetShell>
    )
  }

  // ── Empty state (quarter/half/full) ──────────────────────
  if (!hasBox3) {
    return (
      <WidgetShell module="kern" size={size} kicker="Box 3 Belasting" href={href}>
        <div className="flex h-full flex-col items-center justify-center text-center gap-1.5 py-2">
          <Receipt className="h-5 w-5 text-[var(--ink-4)] shrink-0" />
          <p className="text-[13px] font-medium text-[var(--ink-2)]">Geen Box 3-belasting</p>
          <p className="text-[11px] text-[var(--ink-3)] max-w-[22ch]">
            Je vermogen blijft onder de vrijstelling van{' '}
            <span className="font-mono tabular-nums">
              <MaskedAmount value={VRIJSTELLING} tone="kern" />
            </span>
            .
          </p>
        </div>
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
  // Consumeert de canonieke dual-forfait breakdown zodat de rijen exact sluiten op
  // de getoonde Box 3-belasting: grondslagSparen × effectiefForfait × tarief == tax.
  // Zonder breakdown (mock/fallback) tonen we een expliciete indicatie zonder de
  // misleidende ×forfait/×tarief-afleiding.
  const breakdownRows: { label: string; value: ReactNode; accent?: boolean; bold?: boolean; separator?: boolean }[] = bd
    ? [
        { label: 'Box 3-vermogen', value: <MaskedAmount value={bd.rendementsgrondslag} tone="kern" /> },
        { label: 'Vrijstelling', value: <MaskedAmount value={bd.heffingsvrij} signPrefix="-" tone="kern" /> },
        { label: '', value: '', separator: true },
        { label: 'Belastbaar vermogen', value: <MaskedAmount value={bd.grondslagSparen} tone="kern" />, bold: true },
        { label: `Fictief rendement (${(bd.effectiefForfait * 100).toFixed(2)}%)`, value: <MaskedAmount value={bd.box3Income} tone="kern" /> },
        { label: `Tarief (${(bd.tarief * 100).toFixed(0)}%)`, value: `× ${(bd.tarief * 100).toFixed(0)}%` },
        { label: '', value: '', separator: true },
        { label: 'Box 3 belasting', value: <MaskedAmount value={bd.tax} tone="kern" />, bold: true, accent: true },
      ]
    : [
        { label: 'Totaal vermogen', value: <MaskedAmount value={totalAssets} tone="kern" /> },
        { label: 'Vrijstelling', value: <MaskedAmount value={VRIJSTELLING} signPrefix="-" tone="kern" /> },
        { label: '', value: '', separator: true },
        { label: 'Belastbaar vermogen', value: <MaskedAmount value={fbBelastbaar} tone="kern" />, bold: true },
        { label: '', value: '', separator: true },
        { label: 'Box 3 belasting (indicatie)', value: <MaskedAmount value={estimatedTax} tone="kern" />, bold: true, accent: true },
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
        {bd
          ? 'Dual-forfait berekening (spaargeld/beleggingen/schulden). Bekijk de volledige Box 3-berekening voor de details.'
          : 'Indicatieve benadering. Bekijk de volledige Box 3-berekening voor de exacte heffing.'}
      </p>
      <p className="mt-1 font-serif italic text-[12px] text-[var(--ink-3)]">
        Bekijk volledige Box 3 berekening &rarr;
      </p>
    </WidgetShell>
  )
})
