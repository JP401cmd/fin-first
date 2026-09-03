'use client'

import { memo, useMemo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { CheckCircle2, Circle, Flag, Users, UserCheck } from 'lucide-react'
import { usePerspective } from '@/components/app/perspective-provider'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { useEuroView } from '@/lib/hooks/use-euro-view'
import { buildFactorByAge, deflateRowsByAge } from '@/lib/euro-display'
import { widgetSimRowsToChartPoints } from '@/lib/horizon/sim-chart-geometry'

// Zuivere weergave-formattering van een door de motor geleverd aantal maanden
// (FreedomMilestone.monthsAway) → vrijheidstijd. Geen financiële herberekening:
// het aantal maanden komt 1:1 uit lib/freedom-milestones.ts.
function monthsToFreedomStr(months: number): string {
  const y = Math.floor(months / 12)
  const m = months % 12
  const parts: string[] = []
  if (y > 0) parts.push(`${y} jaar`)
  if (m > 0) parts.push(`${m} ${m === 1 ? 'maand' : 'maanden'}`)
  if (parts.length === 0) return 'binnenkort'
  return parts.length === 1 ? parts[0] : `${parts[0]} en ${parts[1]}`
}

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

const MILESTONES = [
  { pct: 25, label: 'Eerste kwartaal', desc: '1 dag op 4 gedekt' },
  { pct: 50, label: 'Halverwege', desc: 'Helft vrijheid bereikt' },
  { pct: 75, label: 'Finishstraight', desc: '3 van 4 dagen gedekt' },
  { pct: 100, label: 'Volledige vrijheid', desc: 'FIRE bereikt' },
]

export const VrijheidsMijlpalenWidget = memo(function VrijheidsMijlpalenWidget({ size, data, href }: Props) {
  // ── Perspective-aware milestones ───────────────────────────────
  // Milestones are fractions of the FIRE target — override netWorth +
  // fireTarget only when the persisted FIRE summary exists.
  const { perspective, partnerName } = usePerspective()
  // Sparkline-reveal (alleen XL) — canonieke in-view-animatie i.p.v. kale setTimeout.
  const { ref: sparkRef, hasEntered } = useInViewAnimation({ duration: 600 })
  const isHouseholdView = perspective === 'household' && data.householdOverrides?.fireTarget != null
  const isPartnerView = perspective === 'partner' && data.partnerOverrides?.fireTarget != null
  const ov = isHouseholdView ? data.householdOverrides! : isPartnerView ? data.partnerOverrides! : null
  const isShared = isHouseholdView || isPartnerView

  // ── EURO-WEERGAVE ─────────────────────────────────────────────────────────
  // Dit widget toont bewust GEEN mijlpaal-bedrag: mijlpalen zijn percentages
  // van het FIRE-doel (klasse R) en de markers hangen aan de TIJD-as, niet aan
  // een bedrag (zie de sparkline-noot hieronder). Het enige wat in euro's staat
  // is de vermogenspad-lijn zelf — klasse F, per punt de kernelfactor van zijn
  // eigen jaar, zodat deze lijn dezelfde vorm houdt als in het
  // Vermogenspad-widget. In 'nominal' komt dezelfde array-referentie terug.
  const { view: euroView } = useEuroView()
  const viewSimRows = useMemo(() => {
    const rows = data.simRows
    if (rows == null) return rows
    const factorByAge = buildFactorByAge(
      rows.map(r => ({ age: r.age, inflationFactor: r.inflationFactor ?? 1 })),
    )
    return deflateRowsByAge(rows, factorByAge, ['endPortfolio'], euroView)
  }, [data.simRows, euroView])

  const { freedomPct } = data
  // Vrijheids-% = canonieke grondslag (ADR 0009). Eigen perspectief:
  // data.freedomPct (FIRE-eligible vermogen ÷ benodigde portfolio, huis
  // gefilterd). Huishouden/partner: ov.freedomPct (eigen household-grondslag).
  // GEEN eigen som op vol netWorth meer.
  const effectivePct = ov?.freedomPct ?? freedomPct

  // Mijlpaal-datums komen uit de canonieke motor (lib/freedom-milestones.ts),
  // één keer berekend in de bundel (data.freedomMilestones) — geen eigen
  // datum-som meer in deze widget (consume-don't-recompute). De projectie is
  // per-user en wordt daarom in huishouden/partner-perspectief onderdrukt
  // (geen gedeelde spaarcadans).
  const milestoneDates = new Map<number, string>()
  if (!isShared && data.freedomMilestones) {
    for (const m of data.freedomMilestones.milestones) {
      if (!m.reached && m.projectedDate) milestoneDates.set(m.percent, m.projectedDate)
    }
  }
  const getMilestoneDate = (targetPct: number): string | null =>
    milestoneDates.get(targetPct) ?? null

  const baseKicker = 'Vrijheidsmijlpalen'
  const kicker = isHouseholdView
    ? `${baseKicker} — Huishouden`
    : isPartnerView
      ? `${baseKicker} — ${partnerName ?? 'Partner'}`
      : baseKicker

  const activeMilestoneIdx = MILESTONES.findIndex(m => effectivePct < m.pct)
  const nextMilestone = activeMilestoneIdx >= 0 ? MILESTONES[activeMilestoneIdx] : null
  const nextDate = nextMilestone ? getMilestoneDate(nextMilestone.pct) : null

  // ── Mini-size: next milestone label or 'Bereikt!' ──────────
  if (size === 'mini') {
    const miniLabel = nextMilestone ? nextMilestone.label : 'Bereikt!'
    return (
      <WidgetShell module="horizon" size="mini" kicker={kicker} href={href}>
        <p className="text-[13px] font-semibold text-[var(--ink)] leading-none truncate">
          {miniLabel}
        </p>
      </WidgetShell>
    )
  }

  if (size === 'quarter') {
    const fullyFree = effectivePct >= 100
    return (
      <WidgetShell module="horizon" size={size} kicker={kicker} href={href}>
        {isShared && (
          <div className="mb-0.5 flex items-center gap-1 text-[10px] text-horizon-600">
            {isPartnerView ? <UserCheck className="h-3 w-3" /> : <Users className="h-3 w-3" />}
            {isPartnerView ? (partnerName ?? 'Partner') : 'Huishouden'}
          </div>
        )}
        <div className="mt-1 flex items-center gap-2">
          <Flag className="h-3.5 w-3.5 text-horizon-500 shrink-0" />
          <span className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
            {Math.round(effectivePct)}% vrijheid
          </span>
        </div>
        {fullyFree ? (
          <p className="text-[10px] text-horizon-600 font-medium mt-0.5">Volledige vrijheid bereikt!</p>
        ) : nextMilestone ? (
          <p className="text-[10px] text-[var(--ink-3)] mt-0.5 truncate">
            Volgende: {nextMilestone.pct}%{nextDate ? ` — ${nextDate}` : ''}
          </p>
        ) : null}
      </WidgetShell>
    )
  }

  // ── XL (Double): mijlpaal-tijdlijn + vermogenspad-sparkline met projectie ──
  if (size === 'xl') {
    const fullyFree = effectivePct >= 100
    // Vrijheidstijd voor de volgende mijlpaal (filosofie: tijd i.p.v. kale datum).
    const nextMotor = !isShared && nextMilestone && data.freedomMilestones
      ? data.freedomMilestones.milestones.find(m => m.percent === nextMilestone.pct) ?? null
      : null
    const nextTime = nextMotor && nextMotor.monthsAway != null && nextMotor.monthsAway > 0
      ? monthsToFreedomStr(nextMotor.monthsAway)
      : null

    // ── Sparkline-projectie ──────────────────────────────────────
    // De markers worden op de TIJD-as geplaatst (monthsAway → leeftijd) en op het
    // bestaande vermogenspad (data.simRows.endPortfolio) neergezet. We plotten
    // NIET het scalar mijlpaal-doelbedrag op de vermogens-as: het netto-
    // vermogenspad en het scalar FIRE-doel hebben een verschillende grondslag —
    // die mag niet op één as/marker gemengd worden. De marker markeert louter
    // WANNEER de mijlpaal langs je vermogenspad valt. Per-user cadans → in
    // huishouden/partner-perspectief geen markers (net als de datums).
    const rows = viewSimRows
    const showSparkline = rows != null && rows.length > 1
    const W = 620
    const SPARK_H = 96
    const padX = 8
    const padTop = 16
    const padBottom = 8
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
    let sparkPathAcc = ''
    let sparkPathRet = ''
    let markers: { pct: number; x: number; y: number; state: 'reached' | 'upcoming' | 'unreachable' }[] = []
    let minAge = 0
    let endAgeLabel = 0

    if (rows && showSparkline) {
      // Tijdstip-conventie (lib/horizon/sim-chart-geometry.ts): rij `age` is het
      // leeftijdsJAAR; `endPortfolio` is de stand op `age + 1`. Eén gedeelde
      // puntreeks (seed op de startleeftijd + één punt per jaargrens) i.p.v. de
      // eigen `[r.age, r.endPortfolio]`-plot die de lijn een jaar naar links
      // zette en `interpAt` elke mijlpaal een jaar te vroeg liet lezen (D,
      // nazorg R2+R3). De fase-splitsing gebeurt op INDEX in diezelfde reeks:
      // de onttrekkingslijn begint op het (al gedeflateerde) eindpunt van de
      // opbouw — geen tweede, nominale seed, dus geen knik in 'huidige euro's'.
      const allPts = widgetSimRowsToChartPoints(rows)
      const maxVal = Math.max(...allPts.map(([, v]) => v), 1)
      minAge = allPts[0][0]
      const maxAge = allPts[allPts.length - 1][0]
      endAgeLabel = Math.round(data.displayEndAge ?? maxAge)
      const ageSpan = maxAge - minAge || 1
      const currentAge = rows[0].age
      const toX = (age: number) => padX + ((clamp(age, minAge, maxAge) - minAge) / ageSpan) * (W - padX * 2)
      const toY = (val: number) => (SPARK_H - padBottom) - (Math.max(val, 0) / maxVal) * (SPARK_H - padTop - padBottom)
      const interpAt = (age: number): number => {
        if (age <= allPts[0][0]) return allPts[0][1]
        if (age >= allPts[allPts.length - 1][0]) return allPts[allPts.length - 1][1]
        for (let i = 1; i < allPts.length; i++) {
          if (allPts[i][0] >= age) {
            const [a0, v0] = allPts[i - 1]
            const [a1, v1] = allPts[i]
            const t = (age - a0) / ((a1 - a0) || 1)
            return v0 + t * (v1 - v0)
          }
        }
        return allPts[allPts.length - 1][1]
      }
      const buildPath = (pts: [number, number][]) =>
        pts.length === 0
          ? ''
          : pts.map(([a, v], i) => `${i === 0 ? 'M' : 'L'}${toX(a).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')
      const nAcc = rows.filter(r => r.phase === 'accumulation').length
      sparkPathAcc = buildPath(allPts.slice(0, nAcc + 1))
      sparkPathRet = buildPath(allPts.slice(nAcc))
      if (!isShared && data.freedomMilestones) {
        markers = data.freedomMilestones.milestones.map(m => {
          const state: 'reached' | 'upcoming' | 'unreachable' =
            m.reached ? 'reached' : m.monthsAway != null ? 'upcoming' : 'unreachable'
          const markerAge = m.reached
            ? currentAge
            : m.monthsAway != null
              ? currentAge + m.monthsAway / 12
              : maxAge
          const clampedAge = clamp(markerAge, minAge, maxAge)
          return { pct: m.percent, x: toX(clampedAge), y: toY(interpAt(clampedAge)), state }
        })
      }
    }

    const markerColor = (state: 'reached' | 'upcoming' | 'unreachable') =>
      state === 'reached'
        ? 'var(--color-horizon-600)'
        : state === 'upcoming'
          ? 'var(--color-horizon-500)'
          : 'var(--ink-4)'

    return (
      <WidgetShell module="horizon" size={size} kicker={kicker} href={href}>
        <div className="flex h-full flex-col gap-2.5">
          {isShared && (
            <div className="flex items-center gap-1 text-[11px] text-horizon-600">
              {isPartnerView ? <UserCheck className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
              {isPartnerView ? (partnerName ?? 'Partner') : 'Gecombineerd huishouden'}
            </div>
          )}

          {/* Header: huidige vrijheid-% + volgende mijlpaal (vrijheidstijd) */}
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <Flag className="h-4 w-4 self-center shrink-0 text-horizon-500" />
              <span className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
                {Math.round(effectivePct)}%
              </span>
              <span className="text-sm text-[var(--ink-3)]">vrijheid</span>
            </div>
            {fullyFree ? (
              <span className="text-[11px] font-medium text-horizon-600">Volledige vrijheid bereikt</span>
            ) : nextMilestone ? (
              <p className="text-right font-serif text-[11px] italic text-[var(--ink-3)]">
                Volgende: {nextMilestone.label}
                {nextTime ? ` — over ${nextTime}` : nextDate ? ` — ${nextDate}` : ''}
              </p>
            ) : null}
          </div>

          {/* Horizontale mijlpaal-tijdlijn (proportioneel op de vrijheid-%-as) */}
          <div className="relative h-12 shrink-0 px-1.5">
            <div className="absolute left-1.5 right-1.5 top-[26px] h-[3px] rounded-full bg-[var(--subtle)]" />
            <div
              className="absolute left-1.5 top-[26px] h-[3px] rounded-full bg-gradient-to-r from-horizon-400 to-horizon-600 transition-all duration-500"
              style={{ width: `calc((100% - 12px) * ${Math.min(effectivePct, 100) / 100})` }}
            />
            {!fullyFree && (
              <div
                className="absolute top-0 -translate-x-1/2"
                style={{ left: `calc(6px + (100% - 12px) * ${Math.min(effectivePct, 100) / 100})` }}
              >
                <span className="whitespace-nowrap rounded-full bg-horizon-600 px-1.5 py-px text-[9px] font-semibold leading-none text-white">
                  jij
                </span>
              </div>
            )}
            {MILESTONES.map((m, i) => {
              const reached = effectivePct >= m.pct
              const isActive = i === activeMilestoneIdx
              return (
                <div
                  key={m.pct}
                  className="absolute top-[18px] flex -translate-x-1/2 flex-col items-center"
                  style={{ left: `calc(6px + (100% - 12px) * ${m.pct / 100})` }}
                >
                  {reached ? (
                    <CheckCircle2 className="h-4 w-4 rounded-full bg-[var(--paper)] text-horizon-600" />
                  ) : (
                    <Circle
                      className={`h-4 w-4 rounded-full bg-[var(--paper)] ${isActive ? 'text-horizon-500' : 'text-[var(--border-md)]'}`}
                    />
                  )}
                  <span
                    className={`mt-0.5 font-mono text-[9px] tabular-nums ${isActive ? 'font-semibold text-[var(--ink)]' : reached ? 'text-horizon-600' : 'text-[var(--ink-4)]'}`}
                  >
                    {m.pct}%
                  </span>
                </div>
              )
            })}
          </div>

          <div className="border-t border-dashed border-[var(--border-ed)]" />

          {/* Vermogenspad-sparkline met de vier mijlpalen in de tijd geprojecteerd */}
          <div ref={sparkRef} className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-baseline justify-between">
              <p className="label-editorial text-horizon-600">Vermogenspad</p>
              <p className="text-[9px] text-[var(--ink-4)]">mijlpalen geprojecteerd in de tijd</p>
            </div>
            {showSparkline ? (
              <>
                <svg
                  width="100%"
                  viewBox={`0 0 ${W} ${SPARK_H}`}
                  className="mt-1 overflow-visible"
                  data-testid="mijlpaal-sparkline"
                  aria-label="Vermogenspad naar vrijheid met de vier mijlpalen geprojecteerd in de tijd"
                >
                  {sparkPathAcc && (
                    <path
                      d={sparkPathAcc}
                      fill="none"
                      stroke="var(--color-horizon-500)"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      pathLength={1}
                      style={{
                        strokeDasharray: '1',
                        strokeDashoffset: hasEntered ? '0' : '1',
                        transition: hasEntered ? 'stroke-dashoffset 600ms cubic-bezier(.22,1,.36,1)' : 'none',
                      }}
                    />
                  )}
                  {sparkPathRet && (
                    <path
                      d={sparkPathRet}
                      fill="none"
                      stroke="var(--ink-4)"
                      strokeWidth="1.2"
                      strokeDasharray="3 2"
                      strokeLinecap="round"
                      style={{ opacity: hasEntered ? 1 : 0, transition: hasEntered ? 'opacity 300ms ease 500ms' : 'none' }}
                    />
                  )}
                  {markers.map((mk, i) => (
                    <g
                      key={mk.pct}
                      data-testid="mijlpaal-marker"
                      style={{
                        opacity: hasEntered ? 1 : 0,
                        transition: hasEntered ? `opacity 300ms ease ${600 + i * 90}ms` : 'none',
                      }}
                    >
                      <line
                        x1={mk.x}
                        y1={12}
                        x2={mk.x}
                        y2={mk.y}
                        stroke={markerColor(mk.state)}
                        strokeWidth="0.6"
                        strokeDasharray="2 2"
                        opacity={0.6}
                      />
                      <circle cx={mk.x} cy={mk.y} r="3" fill={markerColor(mk.state)} />
                      <text
                        x={mk.x}
                        y={8}
                        textAnchor="middle"
                        fontSize="7"
                        fontFamily="monospace"
                        fontWeight="600"
                        fill={markerColor(mk.state)}
                      >
                        {mk.pct}%
                      </text>
                    </g>
                  ))}
                </svg>
                <div className="mt-0.5 flex items-center justify-between">
                  <span className="font-mono text-[9px] text-[var(--ink-4)]">{minAge}j</span>
                  <span className="font-mono text-[9px] text-[var(--ink-4)]">{endAgeLabel}j</span>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-[11px] text-[var(--ink-3)]">Geen simulatie beschikbaar voor de sparkline</p>
              </div>
            )}
          </div>
        </div>
      </WidgetShell>
    )
  }

  return (
    <WidgetShell module="horizon" size={size} kicker={kicker} href={href}>
      {isShared && (
        <div className="mb-1 flex items-center gap-1 text-[11px] text-horizon-600">
          {isPartnerView ? <UserCheck className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
          {isPartnerView ? (partnerName ?? 'Partner') : 'Gecombineerd huishouden'}
        </div>
      )}
      <div className={`${size === 'half' ? 'space-y-1' : 'mt-1 space-y-1.5'}`}>
        {MILESTONES.map((m, i) => {
          const reached = effectivePct >= m.pct
          const isActive = i === activeMilestoneIdx
          const date = reached ? null : getMilestoneDate(m.pct)
          // Progress towards this milestone
          const milestonePct = Math.min((effectivePct / m.pct) * 100, 100)

          return (
            <div
              key={m.pct}
              className={`${isActive ? 'opacity-100' : reached ? 'opacity-60' : 'opacity-40'}`}
            >
              <div className="flex items-center gap-2">
                {/* Icon */}
                <div className="shrink-0">
                  {reached ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-horizon-600" />
                  ) : (
                    <Circle className={`h-3.5 w-3.5 ${isActive ? 'text-horizon-500' : 'text-[var(--border-md)]'}`} />
                  )}
                </div>

                {/* Label + date */}
                <div className="min-w-0 flex-1">
                  <p className={`text-[11px] font-medium leading-tight ${isActive ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]'}`}>
                    {m.label}
                  </p>
                  {size === 'full' && (
                    <p className="text-[10px] text-[var(--ink-4)] leading-tight">{m.desc}</p>
                  )}
                </div>

                {/* Right: percentage or date */}
                <div className="shrink-0 text-right">
                  {reached ? (
                    <span className="text-[10px] font-semibold text-horizon-600 uppercase tracking-wide">Bereikt</span>
                  ) : date ? (
                    <span className="font-mono text-[10px] text-[var(--ink-3)]">{date}</span>
                  ) : (
                    <span className="font-mono text-[10px] text-[var(--ink-4)]">{m.pct}%</span>
                  )}
                </div>
              </div>

              {/* Progress bar (full-size only) */}
              {size === 'full' && (
                <div className="ml-5.5 mt-0.5 h-[3px] w-[calc(100%-22px)] overflow-hidden rounded-full bg-[var(--subtle)]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-horizon-400 to-horizon-600 transition-all duration-500"
                    style={{ width: `${reached ? 100 : milestonePct}%` }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </WidgetShell>
  )
})
