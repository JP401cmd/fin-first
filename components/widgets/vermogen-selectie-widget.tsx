'use client'

/**
 * VermogenSelectieWidget — het totaal van een ZELF GEKOZEN deelverzameling
 * bezittingen en schulden (ADR 0120).
 *
 * ── Contract ─────────────────────────────────────────────────────────────
 * Consumeert UITSLUITEND `data.wealthSelectionWidget` (gewogen totalen,
 * historie, tellingen, topItems — allemaal server-side gewogen met
 * `net_worth_inclusion_pct`) en `data.dailyExpenseRate` (canoniek 12-mnd
 * rolling dagtarief). Er wordt hier NIETS herberekend: geen eigen weging, geen
 * eigen dag/jaar-conversie. Consume-don't-recompute (CLAUDE.md).
 *
 * ── Perspectief ──────────────────────────────────────────────────────────
 * `balance_snapshots` kent geen huishoud-model (ADR 0120 punt 4): de selectie
 * is altijd de EIGEN selectie op EIGEN data. Staat er een ander perspectief
 * (huishouden/partner) aan, dan labelt de widget dat expliciet in plaats van
 * stilzwijgend iets anders te tonen dan de rest van de pagina.
 *
 * ── Bewerk-affordance ────────────────────────────────────────────────────
 * De eerste per-widget-config in de app: een potlood rechtsboven, ZICHTBAAR IN
 * NORMALE MODUS (niet alleen in de grid-edit-modus). Hij staat bewust BUITEN de
 * `<WidgetShell>` — die rendert bij een `href` een `<Link>` om de hele tegel, en
 * een knop dáárin zou een genest interactief element zijn. Als absolute sibling
 * ná de shell schildert hij eroverheen; hij krijgt bewust GEEN z-index, zodat de
 * grid-edit-controls (`z-10`, eerder in de DOM) er in edit-modus overheen komen
 * en de twee affordances elkaar niet dubbel aanbieden. De dnd-listeners zitten
 * alleen op de sleep-handle in de grid, dus een klik hier botst nooit met slepen.
 */

import { memo, useMemo, useState } from 'react'
import { Pencil, Wallet } from 'lucide-react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import { MaskedAmount } from '@/components/app/masked-amount'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import {
  formatMaskedCurrency,
  calculateFreedomTime,
  formatFreedomTimeString,
} from '@/lib/format'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { usePerspective } from '@/components/app/perspective-provider'
import { TapTarget } from '@/components/editorial/tap-target'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { VermogenSelectieSheet } from './vermogen-selectie-sheet'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

const KICKER = 'Eigen selectie'
const SVG_W = 200

/** Bouwt lijn- + vulpad voor een reeks waarden; `null` bij < 2 punten. */
function buildSpark(values: number[], height: number) {
  if (values.length < 2) return null
  const pad = { top: 8, bottom: 6 }
  const chartH = height - pad.top - pad.bottom
  const maxVal = Math.max(...values)
  const minVal = Math.min(...values, 0)
  const range = maxVal - minVal || 1
  const toX = (i: number) => (i / (values.length - 1)) * SVG_W
  const toY = (v: number) => pad.top + chartH - ((v - minVal) / range) * chartH
  const pts = values.map((v, i) => ({ x: toX(i), y: toY(v) }))
  const line = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ')
  const baseY = (pad.top + chartH).toFixed(2)
  const fill = `${line} L ${pts[pts.length - 1].x.toFixed(2)} ${baseY} L ${pts[0].x.toFixed(2)} ${baseY} Z`
  return { line, fill, last: pts[pts.length - 1], first: pts[0], firstValue: values[0] }
}

export const VermogenSelectieWidget = memo(function VermogenSelectieWidget({
  size,
  data,
  href,
}: Props) {
  const { masked } = useMaskedAmounts()
  const { perspective } = usePerspective()
  const [sheetOpen, setSheetOpen] = useState(false)
  const selection = data.wealthSelectionWidget ?? null

  // Alleen bij een echt afwijkend perspectief labelen; de data is per ADR 0120
  // altijd persoonlijk, dus zonder label zou de tegel een huishoudgetal suggereren.
  const showPersonalTag = perspective !== 'personal'

  const svgH = size === 'full' ? 56 : 40
  const { ref, hasEntered } = useInViewAnimation({ duration: 1000 })

  // Historie + huidig totaal als sluitpunt ("nu"), zelfde opzet als de
  // netto-vermogen-widget: de kop toont het live totaal, dus de lijn moet daar
  // eindigen. Valt de laatste maandsnapshot samen met nu, dan is dat een vlak
  // eindsegment — nooit een verzonnen extrapolatie.
  const spark = useMemo(() => {
    if (!selection || selection.history.length < 2) return null
    return buildSpark([...selection.history.map(h => h.value), selection.total], svgH)
  }, [selection, svgH])

  const delta = useMemo(() => {
    if (!selection || selection.history.length === 0) return null
    const first = selection.history[0].value
    const diff = selection.total - first
    const pct = first !== 0 ? (diff / Math.abs(first)) * 100 : 0
    return { diff, pct }
  }, [selection])

  const freedomLabel = useMemo(() => {
    if (!selection) return null
    const dailyExp = data.dailyExpenseRate
    if (!dailyExp || dailyExp <= 0) return null
    const ft = calculateFreedomTime(selection.total, dailyExp)
    const str = formatFreedomTimeString(ft, 'short')
    if (!str) return null
    return ft.isDeficit ? `${str} vrijheid terug te kopen` : `${str} vrijheid`
  }, [selection, data.dailyExpenseRate])

  const countLabel = selection
    ? `${selection.count.assets} ${selection.count.assets === 1 ? 'bezitting' : 'bezittingen'} · ${selection.count.debts} ${selection.count.debts === 1 ? 'schuld' : 'schulden'}`
    : null

  const splitBar = useMemo(() => {
    if (!selection) return null
    const sum = selection.assetsTotal + selection.debtsTotal
    if (sum <= 0) return null
    return {
      assetPct: (selection.assetsTotal / sum) * 100,
      debtPct: (selection.debtsTotal / sum) * 100,
    }
  }, [selection])

  const sheet = (
    <VermogenSelectieSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
  )

  const personalTag = showPersonalTag ? (
    <span className="mb-1 inline-flex w-fit border border-[var(--border-ed)] px-1.5 py-px text-[9px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
      Persoonlijk
    </span>
  ) : null

  // ── Empty state (a): nog geen selectie ─────────────────────────────────
  if (!selection) {
    if (size === 'mini') {
      return (
        <>
          <WidgetShell module="kern" size="mini" kicker={KICKER} href={href}>
            <p className="truncate font-serif italic text-[11px] leading-none text-[var(--ink-3)]">
              Nog niets gekozen
            </p>
          </WidgetShell>
          {sheet}
        </>
      )
    }
    return (
      <>
        {/* Bewust GEEN href: de tegel draagt hier een eigen knop, en een knop in
            een link is een genest interactief element. */}
        <WidgetShell module="kern" size={size} kicker={KICKER}>
          {size === 'full' ? (
            <WidgetEmpty
              variant="first-use"
              icon={Wallet}
              description="Kies zelf welke bezittingen en schulden meetellen — bijvoorbeeld wél je beleggingen, niet je huis."
              action={{ label: 'Kies bezittingen', onClick: () => setSheetOpen(true) }}
            />
          ) : (
            // Compacte variant: op quarter/half is er ~90px content-hoogte, te
            // weinig voor de icoon + py-4 van WidgetEmpty. Zelfde belofte, zelfde
            // CTA — alleen zonder de illustratieve laag die hier niet past.
            <div className="flex h-full flex-col justify-center gap-1.5">
              <p className="font-serif italic text-[12px] leading-snug text-[var(--ink-3)]">
                Kies zelf welke bezittingen en schulden meetellen.
              </p>
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="inline-flex min-h-11 w-fit items-center border border-[var(--ink)] bg-[var(--ink)] px-3 text-[12px] font-medium text-[var(--paper)] transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              >
                Kies bezittingen
              </button>
            </div>
          )}
        </WidgetShell>
        {sheet}
      </>
    )
  }

  // De absolute positionering zit op een WRAPPER, niet op de TapTarget zelf:
  // TapTarget injecteert `relative` (voor zijn raakgebied-::after) en Tailwind
  // emit `.relative` ná `.absolute` — een `absolute` in de className verliest
  // dus stil de cascade en de knop valt uit de tegel (review 🔴1).
  const editButton = (
    <span className="absolute right-2 top-2">
      <TapTarget
        label="Selectie bewerken"
        hit="extend"
        onClick={() => setSheetOpen(true)}
        className="h-7 w-7 rounded-full border border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] shadow-[var(--s0)] transition-colors hover:text-[var(--ink)]"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
      </TapTarget>
    </span>
  )

  // ── Mini: kicker + totaal + kleine trendindicatie, geen bewerk-knop ────
  if (size === 'mini') {
    return (
      <>
        <WidgetShell module="kern" size="mini" kicker={KICKER} href={href}>
          <p className="flex items-baseline gap-1.5 truncate leading-none text-[var(--ink)]">
            <MaskedAmount value={selection.total} tone="kern" className="text-[15px] font-semibold" />
            {delta && (
              <span
                className={`font-mono text-[10px] tabular-nums ${delta.diff >= 0 ? 'text-positive' : 'text-negative'}`}
              >
                <span aria-hidden="true">{delta.diff >= 0 ? '▲' : '▼'}</span>
                {delta.diff >= 0 ? '+' : ''}
                {delta.pct.toFixed(0)}%
              </span>
            )}
          </p>
        </WidgetShell>
        {sheet}
      </>
    )
  }

  // Herbruikbaar: "nog geen verloop"-regel wanneer de historie te kort is.
  const noHistoryLine = (
    <p className="mt-1 font-serif italic text-[11px] leading-snug text-[var(--ink-3)]">
      Nog geen verloop — historie groeit vanaf je volgende maandsnapshot
    </p>
  )

  const sparkSvg = spark ? (
    <svg
      width="100%"
      viewBox={`0 0 ${SVG_W} ${svgH}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
      aria-hidden="true"
    >
      <path
        d={spark.fill}
        fill="var(--kern-t)"
        fillOpacity={hasEntered ? 0.08 : 0}
        style={{ transition: hasEntered ? 'fill-opacity 200ms ease-out 325ms' : 'none' }}
      />
      <path
        d={spark.line}
        fill="none"
        stroke="var(--kern-t)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={hasEntered ? undefined : 1}
        style={{ animation: hasEntered ? 'drawPath 500ms cubic-bezier(.22,1,.36,1) both' : 'none' }}
      />
      <circle
        cx={spark.last.x}
        cy={spark.last.y}
        r={3}
        fill="var(--kern-t)"
        opacity={hasEntered ? 1 : 0}
        style={{ transition: hasEntered ? 'opacity 80ms ease-out 500ms' : 'none' }}
      />
      {size === 'full' && (
        <text
          x={1}
          y={Math.max(spark.first.y - 3, 7)}
          fill="var(--ink-4)"
          fontSize="7"
          fontFamily="var(--font-mono), ui-monospace, monospace"
          opacity={hasEntered ? 1 : 0}
          style={{ transition: hasEntered ? 'opacity 200ms ease-out 550ms' : 'none' }}
        >
          {formatMaskedCurrency(spark.firstValue, masked)}
        </text>
      )}
    </svg>
  ) : null

  // De as zegt hoe lang de getoonde reeks écht is: de historie knipt bewust
  // af op de eerste echte meting (geen leading fill), dus "-12m" zou bij een
  // kortere reeks een driemaands groei als jaargroei laten lezen (review 🟡4).
  const axisLabels = (
    <div className="mt-0.5 flex justify-between">
      <span className="font-mono text-[9px] tabular-nums text-[var(--ink-4)]">
        -{selection.history.length}m
      </span>
      <span className="font-mono text-[9px] tabular-nums text-[var(--ink-4)]">nu</span>
    </div>
  )

  const splitRow = splitBar ? (
    <div className="space-y-1">
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
        <div className="h-full rounded-l-full bg-positive/80" style={{ width: `${splitBar.assetPct}%` }} />
        <div className="h-full rounded-r-full bg-negative/70" style={{ width: `${splitBar.debtPct}%` }} />
      </div>
      <div className="flex justify-between text-[11px]">
        <span className="text-positive">
          Bezittingen <MaskedAmount value={selection.assetsTotal} tone="kern" />
        </span>
        <span className="text-negative">
          Schulden <MaskedAmount value={selection.debtsTotal} tone="kern" />
        </span>
      </div>
    </div>
  ) : null

  // ── Quarter: totaal + sparkline ────────────────────────────────────────
  if (size === 'quarter') {
    return (
      <>
        <div className="relative">
          <WidgetShell module="kern" size={size} kicker={KICKER} href={href}>
            <div ref={ref} className="flex h-full flex-col">
              {personalTag}
              <p className="pr-7 text-[var(--ink)]">
                <MaskedAmount value={selection.total} tone="kern" className="text-lg font-semibold" />
              </p>
              {spark ? (
                <div className="mt-auto">{sparkSvg}</div>
              ) : (
                noHistoryLine
              )}
            </div>
          </WidgetShell>
          {editButton}
        </div>
        {sheet}
      </>
    )
  }

  // ── Half: totaal + sparkline + split + telling + vrijheidstijd ─────────
  if (size === 'half') {
    return (
      <>
        <div className="relative">
          <WidgetShell module="kern" size={size} kicker={KICKER} href={href}>
            <div ref={ref} className="flex h-full gap-3">
              <div className="flex min-w-0 flex-1 flex-col justify-center">
                {personalTag}
                <p className="pr-7 text-[var(--ink)]">
                  <MaskedAmount value={selection.total} tone="kern" className="text-xl font-bold" />
                </p>
                {freedomLabel && (
                  <p className="mt-0.5 font-serif italic text-[11px] text-[var(--ink-3)]">
                    ≈ {freedomLabel}
                  </p>
                )}
                {countLabel && (
                  <p className="mt-1 truncate text-[11px] text-[var(--ink-3)]">{countLabel}</p>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-center">
                {spark ? (
                  <div>
                    {sparkSvg}
                    {axisLabels}
                  </div>
                ) : (
                  noHistoryLine
                )}
                {splitBar && (
                  <div className="mt-1.5 flex h-1 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                    <div className="h-full rounded-l-full bg-positive/80" style={{ width: `${splitBar.assetPct}%` }} />
                    <div className="h-full rounded-r-full bg-negative/70" style={{ width: `${splitBar.debtPct}%` }} />
                  </div>
                )}
              </div>
            </div>
          </WidgetShell>
          {editButton}
        </div>
        {sheet}
      </>
    )
  }

  // ── Full: verloop + split + topItems + vrijheidstijd ───────────────────
  return (
    <>
      <div className="relative">
        <WidgetShell module="kern" size={size} kicker={KICKER} href={href}>
          <div ref={ref}>
            {personalTag}
            <div className="flex items-baseline gap-2 pr-7">
              <p className="text-[var(--ink)]">
                <MaskedAmount value={selection.total} tone="kern" className="text-2xl font-semibold" />
              </p>
              {delta && (
                <span className={delta.diff >= 0 ? 'text-positive' : 'text-negative'}>
                  <MaskedAmount
                    value={delta.diff}
                    signPrefix={delta.diff >= 0 ? '+' : ''}
                    tone="kern"
                    className="text-sm font-medium"
                  />
                  <span className="ml-1 font-mono text-[10px] tabular-nums text-[var(--ink-4)]">
                    {selection.history.length}m
                  </span>
                </span>
              )}
            </div>
            {freedomLabel && (
              <p className="mt-1 font-serif italic text-[12px] text-[var(--ink-3)]">
                ≈ {freedomLabel}
              </p>
            )}

            {spark ? (
              <div className="mt-3">
                {sparkSvg}
                {axisLabels}
              </div>
            ) : (
              noHistoryLine
            )}

            {splitRow && <div className="mt-3">{splitRow}</div>}

            {selection.topItems.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-[var(--border-ed)] pt-2">
                {selection.topItems.slice(0, 4).map((item, i) => (
                  <li key={`${item.kind}-${item.name}-${i}`} className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--ink-2)]">{item.name}</span>
                    <span className={item.kind === 'debt' ? 'text-negative' : 'text-[var(--ink-3)]'}>
                      <MaskedAmount
                        value={item.value}
                        signPrefix={item.kind === 'debt' ? '-' : ''}
                        tone="kern"
                        className="text-[11px]"
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {countLabel && (
              <p className="mt-2 text-xs text-[var(--ink-3)]">{countLabel}</p>
            )}
          </div>
        </WidgetShell>
        {editButton}
      </div>
      {sheet}
    </>
  )
})
