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
 * ── HOOGTEBUDGET OP DE COMPACTE TAKKEN (B-033) ──────────────────────────────
 * `half` en `quarter` staan in een tegel met een VASTE hoogte (140px mobiel /
 * 160px desktop). Wat daarvan overblijft voor de inhoud is ~93px (half: de
 * hover-pijlrij kost er nog 18) resp. ~113px (quarter, geen pijlrij). Het
 * aantal regels is daar dus geen smaakkwestie maar een budget — zie de
 * commentaren bij die twee takken.
 *
 * Elke regel in die stapels draagt `shrink-0`, en dat is geen opmaak maar een
 * vangrail. Zonder `shrink-0` krimpt de flex-stapel de regels zélf in: een
 * regel met `truncate` heeft `overflow: hidden` en daarmee een automatische
 * minimumhoogte van 0, dus flexbox perst 'm samen tot een paar pixels en de
 * tegel snijdt dwars door de letterhoogte. Dat was B-033 ("schaamtepotten
 * vallen van het scherm"): niet één regel die onderaan wegviel, maar élke
 * getruncate regel — boven én onder — tot een sliver geknepen. Met `shrink-0`
 * is een regel óf heel, óf hij staat er niet.
 *
 * euro-view: exempt — dit zijn gerealiseerde historische bedragen, en sinds
 * ADR 0119 één geprojecteerd bedrag (het tempo van de lopende periode). Beide
 * blijven nominaal: het prognosebedrag ligt binnen dezelfde kalenderperiode als
 * het gerealiseerde bedrag ernaast, dus de nominaal/reëel-deflator (ADR 0090)
 * hoort er niet op.
 */

import { memo, type ReactNode } from 'react'
import { WidgetShell } from './widget-shell'
import { MaskedAmount } from '@/components/app/masked-amount'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { useSpendLimitCopy } from '@/lib/hooks/use-spend-limit-alias'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import type { SpendLimitWidgetData } from '@/lib/spend-limits/widget-data'
import type { SpendLimitTrendDirection } from '@/lib/spend-limits/engine'
import {
  describeSpendLimitPace,
  resolveSpendLimitDisplayStatus,
  SPEND_LIMIT_HEADROOM_EPSILON,
  SPEND_LIMIT_SCORE_TEXT_CLASS,
  SPEND_LIMIT_STATUS_COLOR_VAR,
  SPEND_LIMIT_STATUS_LABEL_INLINE,
  SPEND_LIMIT_STATUS_TEXT_CLASS,
  type SpendLimitDisplayStatus,
} from '@/lib/spend-limits/status-display'
import type { WidgetSize } from '@/lib/widget-catalog'

/**
 * De vier toestanden die de tegel toont. Stand, kleuren en labels komen uit
 * lib/spend-limits/status-display.ts — dezelfde bron als de pane en de kaart,
 * zodat de tegel niet opnieuw amber kan waarschuwen waar een ander oppervlak
 * groen geruststelt.
 */
type DisplayStatus = SpendLimitDisplayStatus

const STATUS_COLOR = SPEND_LIMIT_STATUS_COLOR_VAR
const STATUS_TEXT_CLASS = SPEND_LIMIT_STATUS_TEXT_CLASS
const STATUS_LABEL = SPEND_LIMIT_STATUS_LABEL_INLINE

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

/**
 * De projectie noemt de ruimte `currentHeadroom`; de gedeelde lezing kent één
 * veldnaam (`periodHeadroom`). Die vertaling staat hier, zodat de motorvorm en
 * de widgetvorm niet naar elkaar toe hoeven groeien.
 */
function resolveStatus(limit: SpendLimitWidgetData): DisplayStatus {
  return resolveSpendLimitDisplayStatus({
    status: limit.status,
    isNearLimit: limit.isNearLimit,
    limitAmount: limit.limitAmount,
    periodHeadroom: limit.currentHeadroom,
  })
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

/**
 * De reeks-score, compact. Rendert NIETS zonder meetellende historie: een 0 of
 * een streepje zou een oordeel suggereren over een pot die nog niets heeft
 * kunnen bewijzen. Het cijfer komt kant-en-klaar uit de motor (`report.score`),
 * inclusief het label — hier wordt geen drempel toegepast.
 */
function ScoreLine({
  limit,
  className = '',
}: {
  limit: SpendLimitWidgetData
  className?: string
}) {
  if (limit.score === null || limit.scoreLabel === null) return null
  return (
    <span className={`inline-flex items-baseline gap-1 ${className}`}>
      <span className="text-[var(--ink-3)]">score</span>
      <span
        className={`font-mono font-semibold tabular-nums ${SPEND_LIMIT_SCORE_TEXT_CLASS[limit.scoreLabel]}`}
      >
        {limit.score}
      </span>
    </span>
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
    <p className={`shrink-0 font-serif italic text-[var(--ink-3)] ${compact ? 'text-[10px] leading-tight' : 'text-[11px]'}`}>
      Dit bedrag kan onvolledig zijn.
    </p>
  )
}

/**
 * Voortgangsbalk: basis in kern-accent, het stuk boven de grens in het
 * negative-token, plus — sinds ADR 0119 — de TEMPO-MARKERING: een streepje op de
 * verstreken fractie van de periode.
 *
 * Het streepje is bewust neutrale inkt en géén stoplicht- of accentkleur: het is
 * een referentiepunt op de tijd-as, geen oordeel. Het oordeel staat al in de
 * kleur van de balk zelf.
 */
function LimitBar({
  matched,
  limitAmount,
  hasEntered,
  height = 'h-1.5',
  paceFraction = null,
}: {
  matched: number
  limitAmount: number
  hasEntered: boolean
  height?: string
  /** `pace.elapsedFraction` uit de motor — nooit hier uit datums afgeleid. */
  paceFraction?: number | null
}) {
  const pct = limitAmount > 0 ? Math.min(matched / limitAmount, 1) : 0
  // Het deel boven de grens, uitgedrukt op dezelfde schaal (max. 40% extra
  // zodat een forse overschrijding de balk niet onleesbaar uitrekt).
  const overPct =
    limitAmount > 0 && matched > limitAmount
      ? Math.min((matched - limitAmount) / limitAmount, 0.4)
      : 0
  return (
    <div
      className={`relative w-full shrink-0 overflow-hidden rounded-full ${height}`}
      style={{ background: 'var(--subtle)' }}
    >
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
      {paceFraction !== null && paceFraction !== undefined && (
        <div
          aria-hidden
          className="absolute inset-y-0 w-[2px] rounded-full"
          style={{
            // `calc(… - 1px)` centreert het streepje op de fractie in plaats van
            // het eraan te laten hángen; op 100% zou het anders half buiten de
            // balk vallen.
            left: `calc(${Math.min(Math.max(paceFraction, 0), 1) * 100}% - 1px)`,
            background: 'var(--ink-2)',
            opacity: 0.7,
          }}
        />
      )}
    </div>
  )
}

/**
 * De tempo-regel: hoe ver de periode zelf is, en — zodra de pot genoeg eigen
 * historie heeft — waar je in dit tempo uitkomt.
 *
 * De zin komt uit `describeSpendLimitPace` (één home, drie oppervlakken); hier
 * wordt niets afgerond of gerekend. Het BEDRAG maskeert mee (ADR 0091), de
 * percentages niet — die zijn geen bedrag.
 */
function PaceLine({ limit, compact = false }: { limit: SpendLimitWidgetData; compact?: boolean }) {
  const pace = limit.pace
  if (!pace) return null
  const showAmount = !compact && pace.projectedAmount !== null
  return (
    <p
      className={`shrink-0 truncate text-[var(--ink-3)] ${compact ? 'text-[10px] leading-tight' : 'text-[11px]'}`}
    >
      {describeSpendLimitPace(pace, limit.currentPeriodLabel)}
      {showAmount && (
        <>
          <span className="text-[var(--ink-4)]"> · </span>
          <span className={pace.projectedExceeds ? 'text-negative' : undefined}>
            op weg naar{' '}
            <MaskedAmount
              value={pace.projectedAmount as number}
              tone={pace.projectedExceeds ? 'inherit' : 'kern'}
              className="text-[11px]"
            />
          </span>
        </>
      )}
    </p>
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
  /** Precies op de grens: binnen, maar zonder ruimte (ADR 0136). */
  const isReached = status === 'reached'

  // ── Vrijheidstijd ("Geld levert tijd op") ──
  // Dagtarief komt uit de bundel; nooit lokaal /30 rekenen.
  // Bij `reached` verdwijnt de regel: "≈ 0 dagen vrijheid over" is geen
  // informatie, de statusregel zegt het al. De drempel is DEZELFDE halve cent
  // waarop `reached` zelf aanslaat (SPEND_LIMIT_HEADROOM_EPSILON, ADR 0136) —
  // met een kale `> 0` bleef bij een restruimte van bv. 0,004 de vrijheidsregel
  // staan náást "geen ruimte meer".
  const hasRate = !!dailyExp && dailyExp > 0
  const freedomAmount = isOver ? limit.currentOverAmount : limit.currentHeadroom
  const freedomLabel =
    hasRate && freedomAmount >= SPEND_LIMIT_HEADROOM_EPSILON
      ? formatFreedomTimeString(calculateFreedomTime(freedomAmount, dailyExp as number), 'short')
      : null

  // ÉÉN plek voor de deeplink — nooit per rendertak herhaald.
  const href = `/overzicht/budget/transacties?limit=${limit.id}`

  const statusRow = (
    <span className={`inline-flex items-center gap-1.5 ${STATUS_TEXT_CLASS[status]}`}>
      <StatusDot status={status} />
      {STATUS_LABEL[status]}
    </span>
  )

  const amountRow = (
    <p className="shrink-0 text-[var(--ink)]">
      <MaskedAmount value={limit.currentMatchedAmount} tone="kern" className="text-lg font-semibold" />
      <span className="text-[var(--ink-4)]">
        {' '}van <MaskedAmount value={limit.limitAmount} tone="kern" className="text-sm" />
      </span>
    </p>
  )

  // Quarter kan op mobiel in een halve-breedte cel (~136px content) landen;
  // daar wrapte de standaardregel ("€ 55 van / € 100") naar twee regels en
  // overschreed de inhoud de vaste kaarthoogte. Compacter corps + hard op
  // één regel geklemd — truncate vangt extreem lange bedragen.
  const amountRowCompact = (
    <p className="shrink-0 truncate whitespace-nowrap text-[var(--ink)]">
      <MaskedAmount value={limit.currentMatchedAmount} tone="kern" className="text-base font-semibold" />
      <span className="text-[var(--ink-4)]">
        {' '}van <MaskedAmount value={limit.limitAmount} tone="kern" className="text-xs" />
      </span>
    </p>
  )

  /**
   * De ruimte-regel, in één vorm voor full én half.
   *
   * Drie takken, want twee logen: bij `reached` stond hier "€ 0 ruimte over" in
   * het positive-token — een groene belofte van ruimte die er niet is (ADR
   * 0136). Nu zegt hij het in woorden, in de warning-kleur van de stand.
   */
  const roomToneClass = isOver ? 'text-negative' : isReached ? 'text-warning' : 'text-positive'
  const roomContent = isOver ? (
    <>
      <MaskedAmount value={limit.currentOverAmount} tone="kern" className="text-xs" /> eroverheen
    </>
  ) : isReached ? (
    <>geen ruimte meer</>
  ) : (
    <>
      <MaskedAmount value={limit.currentHeadroom} tone="kern" className="text-xs" /> ruimte over
    </>
  )

  // `leading-tight` is hier geen smaak maar rekenwerk: zonder expliciete
  // regelhoogte hangt deze regel aan de metrics van het geladen font, en op de
  // compacte takken is de tegelhoogte tot op de pixel begroot.
  const metaRow = (
    <p className="shrink-0 truncate font-serif italic text-[11px] leading-tight text-[var(--ink-3)]">
      {copy.singularLower} · {limit.currentPeriodLabel}
      {!limit.isActive && <span className="text-[var(--ink-4)]"> · gepauzeerd</span>}
    </p>
  )

  /**
   * Stand én periode op ÉÉN regel — de aanhef van de compacte takken.
   *
   * Op `half` past de losse `metaRow` er niet meer bij (zie het hoogtebudget in
   * de bestandskop): een aparte regel kost daar ~14 van de ~93 beschikbare
   * pixels. De periode en het gepauzeerd-merk zijn te belangrijk om te laten
   * vallen — "binnen je grens" over een gepauzeerde pot is misleidend — dus
   * schuiven ze achter de stand aan, waar ze geen extra regelhoogte kosten.
   * Wat wél wegvalt is het aliaswoord ("schaamtepot"): de kicker draagt de
   * potnaam al, en `mini` laat het alias om dezelfde reden weg.
   */
  const statusMetaRow = (
    <p className="flex min-w-0 shrink-0 items-center gap-1.5 text-[12px] leading-tight">
      <StatusDot status={status} />
      <span className={`shrink-0 ${STATUS_TEXT_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
      <span className="shrink-0 text-[var(--ink-4)]">·</span>
      <span className="truncate text-[11px] text-[var(--ink-3)]">
        {limit.currentPeriodLabel}
        {!limit.isActive && <span className="text-[var(--ink-4)]"> · gepauzeerd</span>}
      </span>
    </p>
  )

  const streakRow = (
    <p className="shrink-0 text-[11px] text-[var(--ink-3)]">
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
                <LimitBar
                  matched={limit.currentMatchedAmount}
                  limitAmount={limit.limitAmount}
                  hasEntered={hasEntered}
                  height="h-2"
                  paceFraction={limit.pace?.elapsedFraction ?? null}
                />
              </div>
              <PaceLine limit={limit} />
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
              {/* Geen ScoreLine hier: xl toont de score al als eigen cel rechts. */}
              <p className="mt-1 text-[11px] text-[var(--ink-3)]">{TREND_LABEL[limit.trendDirection]}</p>
            </div>
          </div>

          <div className="flex w-[34%] shrink-0 flex-col justify-center gap-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <StreakCell label="Huidige reeks" value={limit.currentStreak} />
              <StreakCell label="Langste reeks" value={limit.longestStreak} />
              <StreakCell label="Afgesloten" value={limit.closedPeriodCount} />
              <StreakCell label="Eroverheen" value={limit.exceededPeriodCount} />
              {limit.score !== null && limit.scoreLabel !== null && (
                <StreakCell
                  label="Score"
                  value={
                    <span className={SPEND_LIMIT_SCORE_TEXT_CLASS[limit.scoreLabel]}>{limit.score}</span>
                  }
                />
              )}
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
          <LimitBar
            matched={limit.currentMatchedAmount}
            limitAmount={limit.limitAmount}
            hasEntered={hasEntered}
            paceFraction={limit.pace?.elapsedFraction ?? null}
          />
          <p className={`text-xs ${roomToneClass}`}>{roomContent}</p>
          {freedomLabel && (
            <p className="font-serif italic text-[11px] text-[var(--ink-3)]">
              {isOver ? `≈ ${freedomLabel} vrijheid eroverheen` : `≈ ${freedomLabel} vrijheid over`}
            </p>
          )}
          <PaceLine limit={limit} />
          {limit.aggregateTruncationSuspected && <TruncationNote />}
          <div className="border-t border-[var(--border-ed)] pt-2">
            <ClosedSparkline
              amounts={limit.sparkClosedMatchedAmounts}
              limitAmount={limit.limitAmount}
              hasEntered={hasEntered}
            />
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[11px] text-[var(--ink-3)]">
              <span>{TREND_LABEL[limit.trendDirection]}</span>
              <ScoreLine limit={limit} />
            </p>
          </div>
          {streakRow}
        </div>
      </WidgetShell>
    )
  }

  // ── Half: stand + bedrag + balk + ruimte/reeks/score + vrijheidstijd ──
  if (size === 'half') {
    return (
      <WidgetShell module="kern" size={size} kicker={limit.name} href={href} kickerPosition="left">
        {/* HOOGTEBUDGET — vijf regels, geteld (B-033).
            Op mobiel zakt een opgeslagen `full` naar deze tak in een tegel van
            140px; na de rand (2), de accentbalk (3), de p-3 (24) en de
            hover-pijlrij (18) blijft 93px over — in Chrome nagemeten op een
            384px-viewport. Deze stapel kost: stand+periode 14 · bedrag 24 ·
            balk 6 · ruimte-regel 16 · vrijheidsregel 10, plus vier
            tussenruimtes van 4px = ~86px. Er kan hier dus GEEN regel bij zonder
            er één weg te halen — de tempo-ZIN is precies daarom weg (de
            tempo-MARKERING op de balk blijft, dat is de informatie die telt).
            Op desktop (160px ⇒ ~115px) centreert `my-auto` dezelfde stapel.

            Elke regel draagt `shrink-0`; zie de bestandskop waaróm dat de
            eigenlijke fix van B-033 is. */}
        <div ref={ref} className="flex h-full flex-col">
          <div className="my-auto flex min-h-0 flex-col gap-1">
            {statusMetaRow}
            {amountRowCompact}
            <LimitBar
              matched={limit.currentMatchedAmount}
              limitAmount={limit.limitAmount}
              hasEntered={hasEntered}
              paceFraction={limit.pace?.elapsedFraction ?? null}
            />
            <p className={`shrink-0 truncate text-xs ${roomToneClass}`}>
              {roomContent}
              <span className="text-[var(--ink-4)]"> · </span>
              {/* Reeks = een AANTAL periodes, geen bedrag → maskeert niet. */}
              <span className="font-mono tabular-nums text-[var(--ink)]">{limit.currentStreak}</span>
              <span className="text-[var(--ink-3)]"> op rij</span>
              {/* Beide velden guarden, gelijk aan de xl-tak: guardt hier alleen
                  `score`, dan rendert een verweesde scheider zodra die twee ooit
                  uiteenlopen. */}
              {limit.score !== null && limit.scoreLabel !== null && (
                <>
                  <span className="text-[var(--ink-4)]"> · </span>
                  <ScoreLine limit={limit} />
                </>
              )}
            </p>
            {/* De vijfde regel is óf de vrijheidstijd, óf de
                betrouwbaarheidsmelding — nooit allebei. Dat is geen
                ruimtetruc: een vrijheidstijd op een mogelijk afgekapt bedrag
                geeft een preciezer antwoord dan de gegevens dragen. */}
            {limit.aggregateTruncationSuspected ? (
              <TruncationNote compact />
            ) : freedomLabel ? (
              <p className="shrink-0 truncate font-serif italic text-[10px] leading-none text-[var(--ink-3)]">
                {isOver ? `≈ ${freedomLabel} vrijheid eroverheen` : `≈ ${freedomLabel} vrijheid over`}
              </p>
            ) : null}
          </div>
        </div>
      </WidgetShell>
    )
  }

  // ── Quarter (default): status + lopend bedrag vs. grens + reeks ──
  return (
    <WidgetShell module="kern" size={size} kicker={limit.name} href={href} kickerPosition="left">
      {/* HOOGTEBUDGET — zes regels, geteld (B-033).
          Deze tak draait op mobiel in één kolom (~133px inhoudsbreedte) en op
          desktop in één van vier. Beschikbaar: 140 − 2 (rand) − 3 (accentbalk)
          − 24 (p-3) = 111px; geen hover-pijlrij op quarter. Deze stapel kost:
          periode 14 · stand 15 · bedrag 24 · balk 6 · reeks 13 · tempo/melding
          13, plus vijf tussenruimtes van 4px = ~105px.

          Anders dan `half` houdt quarter periode en stand op twee regels: de
          tegel is hier te smal om ze te ketenen zonder de periode weg te
          truncaten. `shrink-0` per regel — zie de bestandskop. */}
      <div ref={ref} className="flex h-full flex-col">
        <div className="my-auto flex min-h-0 flex-col gap-1">
          {metaRow}
          <div className="shrink-0 text-[12px] leading-tight">{statusRow}</div>
          {amountRowCompact}
          <LimitBar matched={limit.currentMatchedAmount} limitAmount={limit.limitAmount} hasEntered={hasEntered} />
          <p className="shrink-0 truncate text-[10px] leading-tight text-[var(--ink-3)]">
            <span className="font-mono tabular-nums text-[var(--ink)]">{limit.currentStreak}</span> op rij binnen je grens
          </p>
          {/* De zesde regel is óf het tempo, óf de betrouwbaarheidsmelding —
              nooit allebei (zelfde afweging als op half). Op de kleinste tegel
              toont het tempo alleen de markering, géén prognosebedrag: de regel
              moet op 384px binnen één lijn passen. */}
          {limit.aggregateTruncationSuspected ? (
            <TruncationNote compact />
          ) : (
            <PaceLine limit={limit} compact />
          )}
        </div>
      </div>
    </WidgetShell>
  )
})
