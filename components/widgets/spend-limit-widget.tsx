'use client'

/**
 * DE GRENZENPOT-TEGEL op het startscherm — vijf rendertakken over één projectie.
 *
 * ── WAT DEZE WIDGET WEL EN NIET DOET ────────────────────────────────────────
 * Alles komt uit `SpendLimitWidgetData`, de projectie die de dashboardbundel al
 * draagt: status, near-drempel, reeks, trendrichting. Er wordt hier NIETS
 * herrekend — geen eigen 80%-drempel, geen eigen trend-gemiddelde, geen eigen
 * €→tijd-conversie (consume, don't recompute). De widget doet ook nooit een
 * eigen fetch.
 *
 * ── MINI IS VERPLICHT ───────────────────────────────────────────────────────
 * `mini` staat niet in de maatkiezer, maar ontstaat op mobiel via
 * `downsizeForMobile(quarter → mini)`. Zonder die tak rendert de standaard
 * quarter-widget op telefoon kapot.
 *
 * ── ÉÉN HREF ────────────────────────────────────────────────────────────────
 * De deeplink staat op precies één plek (`href` hieronder) en gaat naar de
 * transactiepagina met `?limit=<id>`, die daar de prestatieweergave opent.
 *
 * ── MASKERING ───────────────────────────────────────────────────────────────
 * Elk euro-bedrag loopt door `<MaskedAmount tone="kern">`. Reeks-getallen zijn
 * AANTALLEN periodes, geen bedragen — die maskeren dus niet (NFR-B2-04).
 *
 * euro-view: exempt — dit zijn gerealiseerde historische bedragen, geen
 * geprojecteerde; de nominaal/reëel-deflator (ADR 0090) hoort er niet op.
 */

import { memo, type ReactNode } from 'react'
import { WidgetShell } from './widget-shell'
import { MaskedAmount } from '@/components/app/masked-amount'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { useSpendLimitCopy } from '@/lib/hooks/use-spend-limit-alias'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import type { SpendLimitWidgetData } from '@/lib/spend-limits/widget-data'
import type { SpendLimitTrendDirection } from '@/lib/spend-limits/engine'
import type { WidgetSize } from '@/lib/widget-catalog'

/** De drie toestanden die de tegel toont — alle drie uit de motor gelezen. */
type DisplayStatus = 'within' | 'near' | 'exceeded'

/** Stoplicht-semantiek: volgt de gekozen accentkleur NIET (CLAUDE.md kleurregel). */
const STATUS_COLOR: Record<DisplayStatus, string> = {
  within: 'var(--positive)',
  near: 'var(--warning)',
  exceeded: 'var(--negative)',
}

const STATUS_TEXT_CLASS: Record<DisplayStatus, string> = {
  within: 'text-positive',
  near: 'text-warning',
  exceeded: 'text-negative',
}

/** Observationeel, niet prescriptief: wat er is, niet wat je moet doen. */
const STATUS_LABEL: Record<DisplayStatus, string> = {
  within: 'binnen je grens',
  near: 'dicht bij je grens',
  exceeded: 'boven je grens',
}

/**
 * Richting uit `report.trend`. Let op de omgekeerde semantiek: MINDER uitgeven
 * heet `improving`. Nooit 'omhoog/omlaag' — dat leest bij een grens verkeerd.
 */
const TREND_LABEL: Record<SpendLimitTrendDirection, string> = {
  improving: 'je geeft minder uit dan daarvoor',
  stable: 'ongeveer gelijk gebleven',
  worsening: 'je geeft meer uit dan daarvoor',
  unknown: 'nog niet genoeg historie',
}

function resolveStatus(limit: SpendLimitWidgetData): DisplayStatus {
  if (limit.status === 'exceeded') return 'exceeded'
  return limit.isNearLimit ? 'near' : 'within'
}

function StatusDot({ status }: { status: DisplayStatus }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: STATUS_COLOR[status] }}
    />
  )
}

/** Reeks-getal — een AANTAL periodes, dus bewust niet gemaskeerd. */
function StreakCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide leading-none text-[var(--ink-3)]">{label}</span>
      <span className="font-mono text-[13px] font-semibold tabular-nums leading-none text-[var(--ink)]">{value}</span>
    </div>
  )
}

/**
 * De betrouwbaarheids-melding bij een mogelijk afgekapt aggregaat. Een stil te
 * laag getal is erger dan geen getal (AC-B4-07/AC-B1-15).
 */
function TruncationNote({ compact = false }: { compact?: boolean }) {
  return (
    <p className={`font-serif italic text-[var(--ink-3)] ${compact ? 'text-[10px] leading-tight' : 'text-[11px]'}`}>
      Dit bedrag kan onvolledig zijn.
    </p>
  )
}

/** Voortgangsbalk: basis in kern-accent, het stuk boven de grens in het negative-token. */
function LimitBar({
  matched,
  limitAmount,
  hasEntered,
  height = 'h-1.5',
}: {
  matched: number
  limitAmount: number
  hasEntered: boolean
  height?: string
}) {
  const pct = limitAmount > 0 ? Math.min(matched / limitAmount, 1) : 0
  // Het deel boven de grens, uitgedrukt op dezelfde schaal (max. 40% extra
  // zodat een forse overschrijding de balk niet onleesbaar uitrekt).
  const overPct =
    limitAmount > 0 && matched > limitAmount
      ? Math.min((matched - limitAmount) / limitAmount, 0.4)
      : 0
  return (
    <div className={`relative w-full overflow-hidden rounded-full ${height}`} style={{ background: 'var(--subtle)' }}>
      <div
        className="absolute inset-y-0 left-0 rounded-l-full"
        style={{
          width: hasEntered ? `${pct * 100}%` : '0%',
          background: 'var(--color-kern-500)',
          transition: hasEntered ? 'width 700ms cubic-bezier(.22,1,.36,1)' : 'none',
        }}
      />
      {overPct > 0 && (
        <div
          className="absolute inset-y-0 rounded-r-full"
          style={{
            left: `${pct * 100}%`,
            width: hasEntered ? `${overPct * 100}%` : '0%',
            background: 'var(--negative)',
            transition: hasEntered ? 'width 700ms cubic-bezier(.22,1,.36,1) 80ms' : 'none',
          }}
        />
      )}
    </div>
  )
}

/**
 * Sparkline over de AFGESLOTEN periodes (oud → nieuw). Pure geometrie: geen
 * as-ticks, geen bedrag-labels — onder maskering blijft dit dus zichtbaar
 * zonder dat er een bedrag uit te lezen valt.
 */
function ClosedSparkline({
  amounts,
  limitAmount,
  hasEntered,
}: {
  amounts: number[]
  limitAmount: number
  hasEntered: boolean
}) {
  if (amounts.length < 2) return null
  const w = 100
  const h = 28
  const max = Math.max(limitAmount, ...amounts, 1)
  const toX = (i: number) => (i / (amounts.length - 1)) * w
  const toY = (v: number) => h - (Math.max(v, 0) / max) * h
  const d = amounts.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(2)},${toY(v).toFixed(2)}`).join(' ')
  const limitY = toY(limitAmount)
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="h-7 w-full"
      role="img"
      aria-label={`Verloop over de laatste ${amounts.length} afgesloten periodes`}
    >
      <line
        x1={0}
        x2={w}
        y1={limitY}
        y2={limitY}
        stroke="var(--ink-4)"
        strokeWidth={0.75}
        strokeDasharray="3 3"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={d}
        fill="none"
        stroke="var(--color-kern-500)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        pathLength={1}
        strokeDasharray="1"
        strokeDashoffset={hasEntered ? 0 : 1}
        style={{ transition: hasEntered ? 'stroke-dashoffset 700ms cubic-bezier(.22,1,.36,1)' : 'none' }}
      />
    </svg>
  )
}

export const SpendLimitWidget = memo(function SpendLimitWidget({
  size,
  limit,
  dailyExp,
}: {
  size: WidgetSize
  limit: SpendLimitWidgetData
  /** Canoniek dagtarief (€/dag) uit de bundel — voedt de vrijheidstijd-regel. */
  dailyExp?: number
}) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 800 })
  const copy = useSpendLimitCopy()

  const status = resolveStatus(limit)
  const isOver = status === 'exceeded'

  // ── Vrijheidstijd ("Geld is opgeslagen tijd") ──
  // Dagtarief komt uit de bundel; nooit lokaal /30 rekenen.
  const hasRate = !!dailyExp && dailyExp > 0
  const freedomAmount = isOver ? limit.currentOverAmount : limit.currentHeadroom
  const freedomLabel =
    hasRate && freedomAmount > 0
      ? formatFreedomTimeString(calculateFreedomTime(freedomAmount, dailyExp as number), 'short')
      : null

  // ÉÉN plek voor de deeplink — nooit per rendertak herhaald.
  const href = `/overzicht/cashflow/transacties?limit=${limit.id}`

  const statusRow = (
    <span className={`inline-flex items-center gap-1.5 ${STATUS_TEXT_CLASS[status]}`}>
      <StatusDot status={status} />
      {STATUS_LABEL[status]}
    </span>
  )

  const amountRow = (
    <p className="text-[var(--ink)]">
      <MaskedAmount value={limit.currentMatchedAmount} tone="kern" className="text-lg font-semibold" />
      <span className="text-[var(--ink-4)]">
        {' '}van <MaskedAmount value={limit.limitAmount} tone="kern" className="text-sm" />
      </span>
    </p>
  )

  const metaRow = (
    <p className="truncate font-serif italic text-[11px] text-[var(--ink-3)]">
      {copy.singularLower} · {limit.currentPeriodLabel}
      {!limit.isActive && <span className="text-[var(--ink-4)]"> · gepauzeerd</span>}
    </p>
  )

  const streakRow = (
    <p className="text-[11px] text-[var(--ink-3)]">
      reeks <span className="font-mono tabular-nums text-[var(--ink)]">{limit.currentStreak}</span>
      {limit.currentStreak === 1 ? ' periode' : ' periodes'} binnen je grens
    </p>
  )

  // ── Mini: naam (kicker) + statuspunt + huidige reeks ──
  // Ontstaat op mobiel via downsizeForMobile(quarter → mini); staat bewust niet
  // in de maatkiezer. Zonder deze tak rendert quarter op telefoon kapot.
  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker={limit.name} href={href}>
        <p className="flex items-center gap-1.5 truncate text-[12px] leading-none">
          <StatusDot status={status} />
          <span className={STATUS_TEXT_CLASS[status]}>{STATUS_LABEL[status]}</span>
          <span className="text-[var(--ink-4)]">·</span>
          <span className="font-mono tabular-nums text-[var(--ink)]">{limit.currentStreak}</span>
          <span className="text-[var(--ink-3)]">op rij</span>
        </p>
      </WidgetShell>
    )
  }

  // ── XL (Double): brede kaart — status + bedragen links, reeks-strip rechts ──
  if (size === 'xl') {
    return (
      <WidgetShell module="kern" size={size} kicker={limit.name} href={href}>
        <div
          ref={ref}
          className="flex h-full items-stretch gap-6"
          style={{
            opacity: hasEntered ? 1 : 0,
            transform: hasEntered ? 'translateY(0)' : 'translateY(6px)',
            transition: 'opacity 400ms ease-out, transform 400ms ease-out',
          }}
        >
          <div className="flex min-w-0 flex-1 flex-col justify-between border-r border-dashed border-[var(--border-ed)] pr-6">
            <div>
              {metaRow}
              <div className="mt-1 text-[13px]">{statusRow}</div>
              <div className="mt-1">{amountRow}</div>
              <div className="mt-2">
                <LimitBar matched={limit.currentMatchedAmount} limitAmount={limit.limitAmount} hasEntered={hasEntered} height="h-2" />
              </div>
              {freedomLabel && (
                <p className="mt-1.5 font-serif italic text-[12px] text-[var(--ink-3)]">
                  {isOver ? `${freedomLabel} vrijheid eroverheen` : `nog ${freedomLabel} vrijheid over`}
                </p>
              )}
              {limit.aggregateTruncationSuspected && (
                <div className="mt-1">
                  <TruncationNote />
                </div>
              )}
            </div>
            <div>
              <ClosedSparkline
                amounts={limit.sparkClosedMatchedAmounts}
                limitAmount={limit.limitAmount}
                hasEntered={hasEntered}
              />
              <p className="mt-1 text-[11px] text-[var(--ink-3)]">{TREND_LABEL[limit.trendDirection]}</p>
            </div>
          </div>

          <div className="flex w-[34%] shrink-0 flex-col justify-center gap-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <StreakCell label="Huidige reeks" value={limit.currentStreak} />
              <StreakCell label="Langste reeks" value={limit.longestStreak} />
              <StreakCell label="Afgesloten" value={limit.closedPeriodCount} />
              <StreakCell label="Eroverheen" value={limit.exceededPeriodCount} />
            </div>
            <p className="text-[11px] text-[var(--ink-3)]">
              Binnen je grens{' '}
              <span className="font-mono tabular-nums text-[var(--ink)]">
                {limit.withinPeriodCount}/{limit.closedPeriodCount}
              </span>{' '}
              {limit.closedPeriodCount === 1 ? 'periode' : 'periodes'}
            </p>
          </div>
        </div>
      </WidgetShell>
    )
  }

  // ── Full: alles van half + sparkline over de afgesloten periodes + trend ──
  if (size === 'full') {
    return (
      <WidgetShell module="kern" size={size} kicker={limit.name} href={href} kickerPosition="left">
        <div ref={ref} className="flex flex-col gap-2">
          {metaRow}
          <div className="text-[13px]">{statusRow}</div>
          {amountRow}
          <LimitBar matched={limit.currentMatchedAmount} limitAmount={limit.limitAmount} hasEntered={hasEntered} />
          <p className={`text-xs ${isOver ? 'text-negative' : 'text-positive'}`}>
            {isOver ? (
              <>
                <MaskedAmount value={limit.currentOverAmount} tone="kern" className="text-xs" /> eroverheen
              </>
            ) : (
              <>
                <MaskedAmount value={limit.currentHeadroom} tone="kern" className="text-xs" /> ruimte over
              </>
            )}
          </p>
          {freedomLabel && (
            <p className="font-serif italic text-[11px] text-[var(--ink-3)]">
              {isOver ? `≈ ${freedomLabel} vrijheid eroverheen` : `≈ ${freedomLabel} vrijheid over`}
            </p>
          )}
          {limit.aggregateTruncationSuspected && <TruncationNote />}
          <div className="border-t border-[var(--border-ed)] pt-2">
            <ClosedSparkline
              amounts={limit.sparkClosedMatchedAmounts}
              limitAmount={limit.limitAmount}
              hasEntered={hasEntered}
            />
            <p className="mt-1 text-[11px] text-[var(--ink-3)]">{TREND_LABEL[limit.trendDirection]}</p>
          </div>
          {streakRow}
        </div>
      </WidgetShell>
    )
  }

  // ── Half: quarter + de ruimte/overschrijding in vrijheidstijd ──
  if (size === 'half') {
    return (
      <WidgetShell module="kern" size={size} kicker={limit.name} href={href} kickerPosition="left">
        <div ref={ref} className="flex h-full flex-col justify-center gap-1.5">
          {metaRow}
          <div className="text-[12px]">{statusRow}</div>
          {amountRow}
          <LimitBar matched={limit.currentMatchedAmount} limitAmount={limit.limitAmount} hasEntered={hasEntered} />
          <p className={`truncate text-xs ${isOver ? 'text-negative' : 'text-positive'}`}>
            {isOver ? (
              <>
                <MaskedAmount value={limit.currentOverAmount} tone="kern" className="text-xs" /> eroverheen
              </>
            ) : (
              <>
                <MaskedAmount value={limit.currentHeadroom} tone="kern" className="text-xs" /> ruimte over
              </>
            )}
            <span className="text-[var(--ink-4)]"> · </span>
            {/* Reeks = een AANTAL periodes, geen bedrag → maskeert niet. */}
            <span className="font-mono tabular-nums text-[var(--ink)]">{limit.currentStreak}</span>
            <span className="text-[var(--ink-3)]"> op rij</span>
          </p>
          {freedomLabel && (
            <p className="truncate font-serif italic text-[10px] leading-none text-[var(--ink-3)]">
              {isOver ? `≈ ${freedomLabel} vrijheid eroverheen` : `≈ ${freedomLabel} vrijheid over`}
            </p>
          )}
          {limit.aggregateTruncationSuspected && <TruncationNote compact />}
        </div>
      </WidgetShell>
    )
  }

  // ── Quarter (default): status + lopend bedrag vs. grens + reeks ──
  return (
    <WidgetShell module="kern" size={size} kicker={limit.name} href={href} kickerPosition="left">
      <div ref={ref} className="flex h-full flex-col justify-center gap-1">
        {metaRow}
        <div className="text-[12px]">{statusRow}</div>
        {amountRow}
        <LimitBar matched={limit.currentMatchedAmount} limitAmount={limit.limitAmount} hasEntered={hasEntered} />
        <p className="truncate text-[10px] text-[var(--ink-3)]">
          <span className="font-mono tabular-nums text-[var(--ink)]">{limit.currentStreak}</span> op rij binnen je grens
        </p>
        {limit.aggregateTruncationSuspected && <TruncationNote compact />}
      </div>
    </WidgetShell>
  )
})
