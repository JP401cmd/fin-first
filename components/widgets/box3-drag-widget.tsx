import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { MaskedAmount } from '@/components/app/masked-amount'
import { Receipt } from 'lucide-react'
import { dailyExpenseRate } from '@/lib/format'
import { BOX3_DRAG } from '@/lib/constants'
import { BOX3_PARAMS, CURRENT_TAX_YEAR } from '@/lib/box3-data'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

// Heffingsvrij vermogen — single, zonder fiscaal partner, uit de canonieke
// BOX3_PARAMS op het lopende belastingjaar (CURRENT_TAX_YEAR). Alleen fallback
// voor de lege staat wanneer de bundel geen box3Breakdown levert; met breakdown
// consumeren we het echte heffingsvrije vermogen uit calculateBox3.
const VRIJSTELLING = BOX3_PARAMS[CURRENT_TAX_YEAR].heffingsvrijSingle

export const Box3DragWidget = memo(function Box3DragWidget({ size, data, href }: Props) {
  const { totalAssets, monthlyExpenses, box3Tax, box3Breakdown } = data
  const bd = box3Breakdown ?? null

  // HEADLINE uit de canonieke bundel-`box3Tax` (dual-forfait calculateBox3),
  // identiek aan /overzicht/belasting/box3 en de zusterwidget `belasting_box3`.
  const annualDrag = box3Tax ?? bd?.tax ?? 0

  // Canoniek 12-mnd rolling dagtarief uit de bundel (KRUIS-20 / consume-don't-
  // recompute); fallback op de maand-conversie voor mock-/empty-bundels — exact
  // dezelfde noemer als `belasting_box3`, zodat dezelfde Box 3-heffing overal
  // hetzelfde aantal vrijheidsdagen oplevert.
  const dailyExp = data.dailyExpenseRate ?? dailyExpenseRate(monthlyExpenses)
  const freedomDaysLost = dailyExp > 0 && annualDrag > 0 ? Math.round(annualDrag / dailyExp) : null

  const pctOfAssets = totalAssets > 0 ? (annualDrag / totalAssets) * 100 : 0

  // Lege staat: geen drag omdat het vermogen onder de heffingsvrije drempel valt
  // (of er geen Box 3-bezittingen zijn) → `calculateBox3` levert tax 0/null.
  const hasDrag = annualDrag > 0
  const vrijstelling = bd?.heffingsvrij ?? VRIJSTELLING

  // ── Mini-size: effectief drag-tarief ─────────────────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker="Box 3 Drag" href={href}>
        {hasDrag ? (
          <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
            {pctOfAssets.toFixed(2)}%
          </p>
        ) : (
          <p className="text-[13px] font-medium text-[var(--ink-3)] leading-none truncate">Geen drag</p>
        )}
      </WidgetShell>
    )
  }

  // ── Lege staat (quarter/half/full) ───────────────────────────
  if (!hasDrag) {
    return (
      <WidgetShell module="kern" size={size} kicker="Box 3 Belastingdrag" href={href}>
        <div className="flex h-full flex-col items-center justify-center text-center gap-1.5 py-2">
          <Receipt className="h-5 w-5 text-[var(--ink-4)] shrink-0" />
          <p className="text-[13px] font-medium text-[var(--ink-2)]">Geen Box 3-drag</p>
          <p className="text-[11px] text-[var(--ink-3)] max-w-[22ch]">
            Je vermogen blijft onder de vrijstelling van{' '}
            <span className="font-mono tabular-nums">
              <MaskedAmount value={vrijstelling} tone="kern" />
            </span>
            .
          </p>
        </div>
      </WidgetShell>
    )
  }

  // ── Quarter-size: jaarlijks bedrag + vrijheidsdagen ──
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Box 3 Drag" href={href}>
        <p className="text-[var(--ink)]">
          <MaskedAmount value={annualDrag} tone="kern" className="text-lg font-semibold" />
        </p>
        <span className="text-[10px] text-[var(--ink-3)]">/jaar</span>
        {freedomDaysLost != null && (
          <p className="mt-1 font-serif italic text-[11px] text-[var(--ink-3)]">
            = {freedomDaysLost}d vrijheid
          </p>
        )}
      </WidgetShell>
    )
  }

  // ── Full-size: bedrag + tarief + vrijheidsdagen + 5-jaar projectie ──
  if (size === 'full') {
    // Schat de jaarlijkse vermogensgroei uit netWorthHistory (fallback 5%).
    // LET OP: dit is netto-vermogensgroei INCL. nieuwe inleg/sparen, dus géén
    // zuiver beleggingsrendement — daarom hieronder eerlijk gelabeld als
    // "vermogensgroei" en niet als rendement (geen tegenbewijs-frame).
    const history = data.netWorthHistory ?? []
    let annualGrowthRate = 0.05 // default 5%
    if (history.length >= 2) {
      const oldest = history[0].value
      const newest = history[history.length - 1].value
      const months = history.length - 1
      if (oldest > 0 && months > 0) {
        const totalGrowth = (newest - oldest) / oldest
        annualGrowthRate = Math.max(0, totalGrowth * (12 / months))
      }
    }

    // Effectief tarief afgeleid uit de canonieke box3Tax (annualDrag / totalAssets).
    // Fallback bij ontbrekend vermogen: de canonieke Box 3-drag (forfait × tarief
    // ≈ 2,16%) uit constants. Vlak tarief onderschat toekomstige heffing licht
    // (de heffingsvrije voet krimpt proportioneel) — acceptabel als schatting.
    const effectiveRate = totalAssets > 0 ? annualDrag / totalAssets : BOX3_DRAG

    // 5-jaar projectie
    const projections: { year: number; wealth: number; tax: number; days: number | null }[] = []
    let projWealth = totalAssets
    let totalTax5y = 0
    let totalDays5y = 0
    for (let y = 1; y <= 5; y++) {
      projWealth = projWealth * (1 + annualGrowthRate)
      const tax = projWealth * effectiveRate
      totalTax5y += tax
      const days = dailyExp > 0 ? Math.round(tax / dailyExp) : null
      if (days != null) totalDays5y += days
      projections.push({ year: y, wealth: projWealth, tax, days })
    }

    return (
      <WidgetShell module="kern" size={size} kicker="Box 3 Belastingdrag" href={href}>
        {/* Header: bedrag + tarief */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <p className="text-[var(--ink)]">
                <MaskedAmount value={annualDrag} tone="kern" className="text-2xl font-semibold" />
              </p>
              <span className="text-xs text-[var(--ink-3)]">/jaar</span>
            </div>
            <p className="mt-0.5 text-xs text-[var(--ink-3)]">
              {pctOfAssets.toFixed(2)}% effectief tarief
            </p>
          </div>
          {freedomDaysLost != null && (
            <div className="flex-shrink-0 text-right">
              <p className="font-mono text-xl font-semibold tabular-nums text-kern-700">{freedomDaysLost}d</p>
              <p className="text-[10px] text-[var(--ink-3)]">vrijheid/jaar</p>
            </div>
          )}
        </div>

        {/* 5-jaar projectie tabel */}
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wide text-[var(--ink-4)] mb-1.5">5-jaar projectie</p>
          <div className="space-y-1">
            {projections.map((p) => (
              <div key={p.year} className="flex items-center justify-between text-xs">
                <span className="text-[var(--ink-3)] w-12">Jaar {p.year}</span>
                <span className="text-[var(--ink-3)]">
                  <MaskedAmount value={p.wealth} tone="kern" />
                </span>
                <span className="text-[var(--ink)]">
                  <MaskedAmount value={p.tax} tone="kern" />
                </span>
                {p.days != null && (
                  <span className="font-mono tabular-nums text-kern-700 w-8 text-right">{p.days}d</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Totalen */}
        <div className="mt-3 pt-2 border-t border-[var(--border-ed)] flex justify-between text-xs">
          <span className="text-[var(--ink-3)]">Totaal 5 jaar</span>
          <div className="flex items-center gap-3">
            <span className="text-[var(--ink)]">
              <MaskedAmount value={totalTax5y} tone="kern" className="font-semibold" />
            </span>
            {totalDays5y > 0 && (
              <span className="font-mono font-semibold tabular-nums text-kern-700">{totalDays5y}d</span>
            )}
          </div>
        </div>

        {/* Fictief forfaitair inkomen vs geschatte vermogensgroei.
            Fictief rendement wordt geCONSUMEERD uit de canonieke dual-forfait
            breakdown (box3Income = grondslagSparen × effectiefForfait), niet
            lokaal herberekend, zodat het sluit op de getoonde Box 3-heffing.
            Alleen tonen als de breakdown beschikbaar is. */}
        {bd && (
          <div className="mt-2 space-y-0.5">
            <div className="flex justify-between text-[11px]">
              <span className="text-[var(--ink-3)]">Fictief rendement (Box 3)</span>
              <span className="text-[var(--ink-2)]">
                <MaskedAmount value={bd.box3Income} tone="kern" />
              </span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-[var(--ink-3)]">Vermogensgroei (geschat)</span>
              <span className="text-[var(--ink-2)]">
                <MaskedAmount value={totalAssets * annualGrowthRate} tone="kern" />
              </span>
            </div>
          </div>
        )}

        <p className="mt-1 font-serif italic text-[11px] text-[var(--ink-3)]">
          Geschat bij {(annualGrowthRate * 100).toFixed(1)}% jaarlijkse vermogensgroei
        </p>
      </WidgetShell>
    )
  }

  // ── Half-size ──
  return (
    <WidgetShell module="kern" size={size} kicker="Box 3 Belastingdrag" href={href}>
      <div className="mt-0.5">
        <div className="flex items-baseline gap-1.5">
          <p className="text-[var(--ink)]">
            <MaskedAmount value={annualDrag} tone="kern" className="text-xl font-semibold" />
          </p>
          <span className="text-[10px] text-[var(--ink-3)]">/jaar</span>
        </div>

        <p className="mt-0.5 text-xs text-[var(--ink-3)]">
          {pctOfAssets.toFixed(2)}% effectief tarief
        </p>

        {freedomDaysLost != null && (
          <p className="mt-2 text-xs font-medium text-kern-700">
            = <span className="font-mono font-semibold">{freedomDaysLost}</span> vrijheidsdagen per jaar
          </p>
        )}
      </div>
    </WidgetShell>
  )
})
