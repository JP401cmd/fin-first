import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import type { FireProjection } from '@/lib/horizon-data'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

// ── Verankerde scenario-projectie ─────────────────────────────────────────────
// De VERWACHT-leeftijd/aftelling komt canoniek uit de unified-sim (`simFireCountdown`
// / `fireAgeFractional`) — exact dezelfde bron als W3 (FIRE Prognose) en /toekomst.
// De scalar-band (`fireRange`) is FALLBACK-ONLY (dashboard-data-loader.ts:970) en kan
// bij een downsize-woonstrategie onterecht 'Bereikt' zeggen terwijl freedomPct << 100;
// we consumeren daaruit dus ALLEEN de relatieve rendement-spreiding (optimistisch /
// pessimistisch t.o.v. verwacht) en verankeren die op het canonieke midden. Zo spreekt
// W36 nooit meer de canonieke aftelling/voortgang tegen (consume-don't-recompute).
interface ResolvedScenarios {
  expAge: number | null
  optAge: number | null
  pesAge: number | null
  expYears: number | null
  optYears: number | null
  pesYears: number | null
  currentAge: number | null
  isReached: boolean
  isNotFeasible: boolean
  optReturn: number
  expReturn: number
  pesReturn: number
}

function resolveScenarios(data: DashboardData): ResolvedScenarios | null {
  const { fireRange } = data
  if (!fireRange) return null

  const currentAge = fireRange.expected.currentAge
  const bandYears = (p: FireProjection): number | null =>
    p.fireAge != null && p.currentAge != null ? Math.max(0, p.fireAge - p.currentAge) : null

  // Relatieve rendement-spreiding uit de band (jaren t.o.v. het VERWACHT-scenario).
  const sExp = bandYears(fireRange.expected)
  const sOpt = bandYears(fireRange.optimistic)
  const sPes = bandYears(fireRange.pessimistic)
  const deltaOpt = sExp != null && sOpt != null ? sOpt - sExp : 0
  const deltaPes = sExp != null && sPes != null ? sPes - sExp : 0

  const optReturn = fireRange.optimistic.annualReturn
  const expReturn = fireRange.expected.annualReturn
  const pesReturn = fireRange.pessimistic.annualReturn

  const simCd = data.simFireCountdown
  const useCanonical = simCd != null || data.fireAgeFractional != null

  if (useCanonical) {
    const isReached = simCd?.fireDate === 'Bereikt!' || (data.freedomPct != null && data.freedomPct >= 100)
    const isNotFeasible = !isReached && simCd?.fireDate === 'Niet haalbaar'

    let expYears: number | null
    if (isReached) expYears = 0
    else if (isNotFeasible) expYears = null
    else if (simCd != null) expYears = Math.max(0, simCd.countdownYears + simCd.countdownMonths / 12)
    else if (data.fireAgeFractional != null && currentAge != null) expYears = Math.max(0, data.fireAgeFractional - currentAge)
    else expYears = null

    const expAge =
      data.fireAgeFractional ?? (currentAge != null && expYears != null ? currentAge + expYears : null)
    const optYears = expYears != null ? Math.max(0, expYears + deltaOpt) : null
    const pesYears = expYears != null ? Math.max(0, expYears + deltaPes) : null
    const optAge = expAge != null ? expAge + deltaOpt : null
    const pesAge = expAge != null ? expAge + deltaPes : null

    return {
      expAge, optAge, pesAge, expYears, optYears, pesYears, currentAge,
      isReached, isNotFeasible, optReturn, expReturn, pesReturn,
    }
  }

  // Fallback (geen canonieke sim — bv. dob-loze onboarding of sim-error): gebruik de
  // scalar-band direct, zoals voorheen. Nette degradatie, geen crash.
  const isReached = fireRange.expected.fireDate === 'Bereikt!'
  const isNotFeasible = !isReached && fireRange.expected.fireDate === 'Niet haalbaar'
  return {
    expAge: fireRange.expected.fireAge,
    optAge: fireRange.optimistic.fireAge,
    pesAge: fireRange.pessimistic.fireAge,
    expYears: sExp,
    optYears: sOpt,
    pesYears: sPes,
    currentAge,
    isReached,
    isNotFeasible,
    optReturn,
    expReturn,
    pesReturn,
  }
}

export const VrijheidsScenarioWidget = memo(function VrijheidsScenarioWidget({ size, data, href }: Props) {
  const resolved = resolveScenarios(data)

  if (!resolved) {
    return (
      <WidgetShell module="horizon" size={size} kicker="Vrijheidsscenario's" href={href}>
        <p className="text-xs text-[var(--ink-3)]">Voeg inkomen en vermogen toe om scenario&apos;s te zien</p>
      </WidgetShell>
    )
  }

  const {
    expAge, optAge, pesAge, expYears, optYears, pesYears, currentAge,
    isReached, isNotFeasible, optReturn, expReturn, pesReturn,
  } = resolved

  // Scenario-rendement wordt canoniek geconsumeerd uit de bundel — elk scenario
  // draagt zijn eigen offset-rendement (base+0.02 / base / base−0.03), dat mee
  // beweegt met het door de gebruiker ingestelde verwacht rendement. NOOIT hier
  // hardcoden (consume-don't-recompute).
  const scenarios = [
    { label: 'Pessimistisch', age: pesAge, ret: pesReturn, dotColor: 'bg-negative' },
    { label: 'Verwacht', age: expAge, ret: expReturn, dotColor: 'bg-horizon-500' },
    { label: 'Optimistisch', age: optAge, ret: optReturn, dotColor: 'bg-positive' },
  ]

  const bandwidth =
    pesAge != null && optAge != null ? Math.abs(Math.round(pesAge - optAge)) : null

  // ── Reached / niet-haalbaar: nette expliciete staten i.p.v. een degenererende as ──
  if (isReached) {
    return (
      <WidgetShell module="horizon" size={size} kicker="Vrijheidsscenario's" href={href}>
        <ReachedState size={size} freedomPct={data.freedomPct} />
      </WidgetShell>
    )
  }

  // ── Mini-size: scenario range (e.g. '48-54j') ─────────────
  if (size === 'mini') {
    const hasRange = optAge != null && pesAge != null
    const miniLabel = isNotFeasible
      ? '—'
      : hasRange
        ? `${Math.round(optAge)}-${Math.round(pesAge)}j`
        : expAge != null
          ? `${Math.round(expAge)}j`
          : '—'
    return (
      <WidgetShell module="horizon" size="mini" kicker="Scenario's" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {miniLabel}
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter-size: expected FIRE age + bandwidth ──
  if (size === 'quarter') {
    return (
      <WidgetShell module="horizon" size={size} kicker="Scenario's" href={href}>
        <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
          {isNotFeasible ? '—' : expAge != null ? Math.round(expAge) : '—'}
        </p>
        {isNotFeasible ? (
          <p className="mt-0.5 text-xs text-[var(--ink-3)]">nog niet in zicht</p>
        ) : bandwidth != null && bandwidth > 0 ? (
          <p className="mt-0.5 text-xs text-[var(--ink-3)]">&plusmn;{bandwidth}j</p>
        ) : null}
        <p className="mt-1 text-[10px] text-[var(--ink-4)]">verwacht</p>
      </WidgetShell>
    )
  }

  // ── Half-size: horizontal layout — left expected age, right scenario grid ──
  if (size === 'half') {
    return (
      <WidgetShell module="horizon" size={size} kicker="Vrijheidsscenario's" href={href}>
        <div className="flex gap-3 h-full">
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)] mb-0.5">Verwacht</p>
            <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
              {isNotFeasible ? '—' : expAge != null ? Math.round(expAge) : '—'}
            </p>
            {isNotFeasible ? (
              <p className="mt-1 text-[11px] text-[var(--ink-3)]">nog niet in zicht</p>
            ) : bandwidth != null && bandwidth > 0 ? (
              <p className="mt-1 text-[11px] text-[var(--ink-3)]">&plusmn;{bandwidth}j bandbreedte</p>
            ) : null}
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <div className="grid grid-cols-3 gap-1">
              {scenarios.map(({ label, age, dotColor }) => (
                <div key={label} className="text-center">
                  <div className={`mx-auto mb-0.5 h-1.5 w-1.5 rounded-full ${dotColor}`} />
                  {!isNotFeasible && age != null ? (
                    <p className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                      {Math.round(age)}
                    </p>
                  ) : (
                    <p className="font-mono text-sm text-[var(--ink-3)]">—</p>
                  )}
                  <p className="text-[8px] uppercase tracking-wider text-[var(--ink-4)]">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </WidgetShell>
    )
  }

  // ── XL-size (Double): echte vrijheidstijd-as (jaren vanaf nu) + markers ──
  if (size === 'xl') {
    if (isNotFeasible) {
      return (
        <WidgetShell module="horizon" size={size} kicker="Vrijheidsscenario's" href={href}>
          <NotFeasibleState />
        </WidgetShell>
      )
    }

    const axisMarkers = [
      { label: 'Optimistisch', years: optYears, age: optAge, color: 'var(--positive)', ret: optReturn },
      { label: 'Verwacht', years: expYears, age: expAge, color: 'var(--color-horizon-500)', ret: expReturn },
      { label: 'Pessimistisch', years: pesYears, age: pesAge, color: 'var(--negative)', ret: pesReturn },
    ]
    const hasAxis = axisMarkers.some((m) => m.years != null)
    const showBand = optYears != null && pesYears != null && Math.abs(Math.round(pesYears - optYears)) > 0

    return (
      <WidgetShell module="horizon" size={size} kicker="Vrijheidsscenario's" href={href}>
        <div className="flex h-full flex-col gap-3">
          {/* Filosofie-aanhef in vrijheidstijd-taal */}
          <div className="shrink-0">
            {expYears != null ? (
              <p className="font-serif text-lg leading-snug text-[var(--ink)]">
                Volledig vrij over{' '}
                <em className="not-italic font-semibold text-horizon-600">
                  {Math.round(expYears)} jaar
                </em>
                {expAge != null && (
                  <span className="text-[var(--ink-3)]"> — op je {Math.round(expAge)}e</span>
                )}
              </p>
            ) : (
              <p className="font-serif text-lg leading-snug text-[var(--ink)]">Jouw weg naar volledige vrijheid</p>
            )}
            {showBand && (
              <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
                Bandbreedte{' '}
                <span className="font-mono tabular-nums text-[var(--ink)]">
                  {Math.round(optYears!)}–{Math.round(pesYears!)}
                </span>{' '}
                jaar, afhankelijk van je rendement
              </p>
            )}
          </div>

          {/* Vrijheidstijd-as (jaren vanaf nu) met de scenario-markers */}
          {hasAxis ? (
            <FreedomTimeAxis markers={axisMarkers} />
          ) : (
            <div className="flex flex-1 items-center justify-center text-center">
              <p className="font-serif italic text-[11px] text-[var(--ink-3)]">
                Vul je geboortedatum aan om je vrijheidstijd-as te zien
              </p>
            </div>
          )}

          {/* Legenda — dynamisch scenario-rendement, geconsumeerd uit de bundel */}
          <div className="shrink-0 grid grid-cols-3 gap-2 border-t border-dashed border-[var(--border-ed)] pt-2">
            {axisMarkers.map(({ label, years, ret }) => (
              <div key={label} className="flex flex-col items-center text-center">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      label === 'Optimistisch' ? 'bg-positive' : label === 'Verwacht' ? 'bg-horizon-500' : 'bg-negative'
                    }`}
                  />
                  <span className="text-[9px] uppercase tracking-wider text-[var(--ink-4)]">{label}</span>
                </div>
                <span className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                  {years != null ? `${Math.round(years)}j` : '—'}
                </span>
                <span
                  className={`font-mono text-[10px] tabular-nums ${
                    label === 'Optimistisch' ? 'text-positive' : label === 'Verwacht' ? 'text-horizon-600' : 'text-negative'
                  }`}
                >
                  {formatReturnPct(ret)}
                </span>
              </div>
            ))}
          </div>
          {currentAge == null && (
            <p className="sr-only">Leeftijd onbekend; leeftijdslabels niet beschikbaar.</p>
          )}
        </div>
      </WidgetShell>
    )
  }

  return (
    <WidgetShell module="horizon" size={size} kicker="Vrijheidsscenario's" href={href}>
      <div className="grid grid-cols-3 gap-2">
        {scenarios.map(({ label, age, dotColor }) => (
          <div key={label} className="text-center">
            <p className="text-[9px] uppercase tracking-wider text-[var(--ink-4)] mb-0.5">{label}</p>
            {!isNotFeasible && age != null ? (
              <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
                {Math.round(age)}
              </p>
            ) : (
              <p className="font-mono text-lg text-[var(--ink-3)]">—</p>
            )}
            <div className={`mx-auto mt-0.5 h-1.5 w-1.5 rounded-full ${dotColor}`} />
          </div>
        ))}
      </div>
      {isNotFeasible ? (
        <p className="mt-3 text-center text-xs text-[var(--ink-3)]">
          Nog niet in zicht — verhoog je spaarcapaciteit om vrijheid dichterbij te brengen
        </p>
      ) : bandwidth != null && bandwidth > 0 ? (
        <p className="mt-3 text-center text-xs text-[var(--ink-3)]">
          Bandbreedte:{' '}
          <span className="font-mono font-semibold text-[var(--ink)]">{bandwidth} jaar</span>
        </p>
      ) : null}
      {size === 'full' && !isNotFeasible && (
        <>
          {/* Mini SVG age axis with scenario markers */}
          {pesAge != null && expAge != null && optAge != null && (
            <ScenarioAxis pesAge={Math.round(pesAge)} expAge={Math.round(expAge)} optAge={Math.round(optAge)} />
          )}
          {/* Rendement per scenario — dynamisch geconsumeerd uit de bundel
              (elk scenario draagt zijn eigen offset-rendement, volgt het door de
              gebruiker ingestelde verwacht rendement). NOOIT hardcoden. */}
          <div className="mt-1.5 grid grid-cols-3 gap-1 text-center text-[10px]">
            <span className="text-negative font-mono">{formatReturnPct(pesReturn)}</span>
            <span className="text-horizon-600 font-mono font-semibold">{formatReturnPct(expReturn)}</span>
            <span className="text-positive font-mono">{formatReturnPct(optReturn)}</span>
          </div>
          <p className="mt-1 font-serif italic text-[11px] text-[var(--ink-3)] text-center">
            rendement per scenario
          </p>
        </>
      )}
    </WidgetShell>
  )
})

// ── Reached-staat: canoniek 'je bent al volledig vrij' ────────────────────────
function ReachedState({ size, freedomPct }: { size: WidgetSize; freedomPct?: number }) {
  if (size === 'mini') {
    return (
      <p className="font-mono text-[15px] font-semibold tabular-nums text-horizon-600 leading-none truncate">
        Vrij
      </p>
    )
  }
  if (size === 'quarter') {
    return (
      <div>
        <p className="font-serif text-lg font-semibold text-horizon-600 leading-none">Bereikt</p>
        <p className="mt-1 text-[10px] text-[var(--ink-4)]">volledig vrij</p>
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col items-center justify-center text-center gap-1.5">
      <p className="font-serif text-3xl leading-none text-horizon-600">&infin;</p>
      <p className="font-serif text-base leading-snug text-[var(--ink)]">
        Je bent <em className="not-italic font-semibold text-horizon-600">volledig vrij</em>
      </p>
      <p className="text-[11px] text-[var(--ink-3)] max-w-[220px]">
        Je vermogen dekt je uitgaven blijvend — elk scenario blijft binnen bereik.
      </p>
      {freedomPct != null && (
        <p className="font-mono text-xs tabular-nums text-[var(--ink-4)]">
          {Math.round(freedomPct)}% van je FIRE-doel
        </p>
      )}
    </div>
  )
}

// ── Niet-haalbaar-staat (XL) ──────────────────────────────────────────────────
function NotFeasibleState() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center gap-1.5">
      <p className="font-serif text-lg leading-snug text-[var(--ink)]">Nog niet in zicht</p>
      <p className="text-[11px] text-[var(--ink-3)] max-w-[240px]">
        Met je huidige spaarcapaciteit is volledige vrijheid nog niet in beeld. Elke euro
        die je opzij zet, brengt je eerste vrije dagen dichterbij.
      </p>
    </div>
  )
}

// ── Mini SVG: 3 markers on an age axis ──────────────────────────
function ScenarioAxis({ pesAge, expAge, optAge }: { pesAge: number; expAge: number; optAge: number }) {
  const minAge = Math.min(optAge, expAge, pesAge) - 2
  const maxAge = Math.max(optAge, expAge, pesAge) + 2
  const range = maxAge - minAge || 1

  const pad = 24 // horizontal padding for labels
  const w = 260
  const innerW = w - pad * 2

  const toX = (age: number) => pad + ((age - minAge) / range) * innerW

  const markers = [
    { age: optAge, color: 'var(--positive)', label: `${optAge}` },  // emerald-500
    { age: expAge, color: 'var(--color-horizon-500)', label: `${expAge}` },  // purple-500 (horizon)
    { age: pesAge, color: 'var(--negative)', label: `${pesAge}` },  // red-400
  ]

  return (
    <div className="mt-3 flex justify-center">
      <svg width={w} height={52} viewBox={`0 0 ${w} 52`} className="overflow-visible" aria-hidden="true">
        {/* Connecting line */}
        <line
          x1={toX(optAge)}
          y1={20}
          x2={toX(pesAge)}
          y2={20}
          stroke="var(--border-md)"
          strokeWidth={2}
          strokeLinecap="round"
        />
        {/* Markers */}
        {markers.map(({ age, color, label }) => {
          const cx = toX(age)
          return (
            <g key={age + color}>
              <circle cx={cx} cy={20} r={5} fill={color} />
              <text
                x={cx}
                y={42}
                textAnchor="middle"
                className="fill-[var(--ink-3)]"
                style={{ fontSize: '10px', fontFamily: 'var(--font-mono, monospace)' }}
              >
                {label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── Rendement-label: consumeert het echte scenario-rendement (bv. 0.07 → "7%") ──
// Toont alleen decimalen wanneer nodig (nl-NL komma) zodat een eigen gebruikers-
// rendement als 6,5% netjes verschijnt. NOOIT een hardcoded percentage.
function formatReturnPct(annualReturn: number): string {
  const pct = annualReturn * 100
  return `${pct.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}%`
}

// ── XL vrijheidstijd-as: jaren-vanaf-nu met de scenario-markers ───────────────
interface AxisMarker {
  label: string
  years: number | null
  age: number | null
  color: string
  ret: number
}

function FreedomTimeAxis({ markers }: { markers: AxisMarker[] }) {
  const withYears = markers.filter((m): m is AxisMarker & { years: number } => m.years != null)
  // Bij verwaarloosbare spreiding (bv. de fallback-band viel terug op één punt) tonen
  // we ÉÉN 'Verwacht'-marker i.p.v. drie botsende labels op dezelfde positie — precies
  // de degeneratie die W36 leeg/kapot deed ogen.
  const spread = withYears.length
    ? Math.max(...withYears.map((m) => m.years)) - Math.min(...withYears.map((m) => m.years))
    : 0
  const shown =
    spread < 1 && withYears.length
      ? [withYears.find((m) => m.label === 'Verwacht') ?? withYears[Math.floor(withYears.length / 2)]]
      : withYears

  const maxYears = shown.reduce((m, s) => Math.max(m, s.years), 0)
  const axisMax = Math.max(1, Math.ceil(maxYears * 1.1))

  const w = 400
  const h = 130
  const padX = 34
  const innerW = w - padX * 2
  const axisY = 96
  const toX = (years: number) => padX + (years / axisMax) * innerW

  const step = axisMax <= 10 ? 2 : axisMax <= 25 ? 5 : 10
  const ticks: number[] = []
  for (let t = 0; t <= axisMax; t += step) ticks.push(t)

  // Alternerende labelhoogte zodat dicht bij elkaar liggende markers niet botsen.
  const labelY = [24, 52, 24]

  const describe = shown
    .map((m) => `${m.label.toLowerCase()} over ${Math.round(m.years)} jaar`)
    .join(', ')

  return (
    <div className="flex flex-1 min-h-0 items-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full overflow-visible"
        role="img"
        aria-label={`Vrijheidstijd-as, jaren vanaf nu: ${describe}.`}
      >
        {/* Basislijn */}
        <line x1={toX(0)} y1={axisY} x2={toX(axisMax)} y2={axisY} stroke="var(--border-md)" strokeWidth={2} strokeLinecap="round" />
        {/* Ticks + jaar-labels */}
        {ticks.map((t) => (
          <g key={`t${t}`}>
            <line x1={toX(t)} y1={axisY - 3} x2={toX(t)} y2={axisY + 3} stroke="var(--border-md)" strokeWidth={1} />
            <text
              x={toX(t)}
              y={axisY + 16}
              textAnchor="middle"
              className="fill-[var(--ink-4)]"
              style={{ fontSize: '9px', fontFamily: 'var(--font-mono, monospace)' }}
            >
              {t === 0 ? 'nu' : t}
            </text>
          </g>
        ))}
        {/* As-onderschrift */}
        <text
          x={toX(axisMax)}
          y={axisY + 28}
          textAnchor="end"
          className="fill-[var(--ink-4)]"
          style={{ fontSize: '9px', fontStyle: 'italic', fontFamily: 'var(--font-serif, serif)' }}
        >
          jaren vanaf nu
        </text>
        {/* Markers */}
        {shown.map((m, i) => {
          const cx = toX(m.years)
          const ly = labelY[i] ?? 24
          return (
            <g key={m.label}>
              <line x1={cx} y1={axisY} x2={cx} y2={ly + 12} stroke={m.color} strokeWidth={1} strokeDasharray="2 2" opacity={0.5} />
              <circle cx={cx} cy={axisY} r={5} fill={m.color} />
              <text x={cx} y={ly} textAnchor="middle" fill={m.color} style={{ fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-mono, monospace)' }}>
                {m.age != null ? Math.round(m.age) : Math.round(m.years)}
              </text>
              <text
                x={cx}
                y={ly + 11}
                textAnchor="middle"
                className="fill-[var(--ink-3)]"
                style={{ fontSize: '9px', fontFamily: 'var(--font-mono, monospace)' }}
              >
                over {Math.round(m.years)}j
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
