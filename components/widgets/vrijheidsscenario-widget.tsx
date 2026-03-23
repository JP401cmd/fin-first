import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export const VrijheidsScenarioWidget = memo(function VrijheidsScenarioWidget({ size, data, href }: Props) {
  const { fireRange } = data

  if (!fireRange) {
    return (
      <WidgetShell module="horizon" size={size} kicker="Vrijheidsscenario's" href={href}>
        <p className="text-xs text-[var(--ink-3)]">Voeg inkomen en vermogen toe om scenario&apos;s te zien</p>
      </WidgetShell>
    )
  }

  const scenarios = [
    { label: 'Pessimistisch', proj: fireRange.pessimistic, dotColor: 'bg-red-400' },
    { label: 'Verwacht', proj: fireRange.expected, dotColor: 'bg-horizon-500' },
    { label: 'Optimistisch', proj: fireRange.optimistic, dotColor: 'bg-emerald-500' },
  ]

  const expAge = fireRange.expected.fireAge
  const pesAge = fireRange.pessimistic.fireAge
  const optAge = fireRange.optimistic.fireAge
  const bandwidth = pesAge && optAge ? Math.abs(Math.round(pesAge - optAge)) : null

  // ── Mini-size: scenario range (e.g. '48-54j') ─────────────
  if (size === 'mini') {
    const hasRange = optAge != null && pesAge != null
    const miniLabel = hasRange
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
          {expAge != null ? Math.round(expAge) : '—'}
        </p>
        {bandwidth != null && (
          <p className="mt-0.5 text-xs text-[var(--ink-3)]">
            &plusmn;{bandwidth}j
          </p>
        )}
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
              {expAge != null ? Math.round(expAge) : '—'}
            </p>
            {bandwidth != null && (
              <p className="mt-1 text-[11px] text-[var(--ink-3)]">
                &plusmn;{bandwidth}j bandbreedte
              </p>
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <div className="grid grid-cols-3 gap-1">
              {scenarios.map(({ label, proj, dotColor }) => (
                <div key={label} className="text-center">
                  <div className={`mx-auto mb-0.5 h-1.5 w-1.5 rounded-full ${dotColor}`} />
                  {proj.fireAge != null ? (
                    <p className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                      {Math.round(proj.fireAge)}
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

  return (
    <WidgetShell module="horizon" size={size} kicker="Vrijheidsscenario's" href={href}>
      <div className="grid grid-cols-3 gap-2">
        {scenarios.map(({ label, proj, dotColor }) => (
          <div key={label} className="text-center">
            <p className="text-[9px] uppercase tracking-wider text-[var(--ink-4)] mb-0.5">{label}</p>
            {proj.fireAge != null ? (
              <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
                {Math.round(proj.fireAge)}
              </p>
            ) : (
              <p className="font-mono text-lg text-[var(--ink-3)]">—</p>
            )}
            <div className={`mx-auto mt-0.5 h-1.5 w-1.5 rounded-full ${dotColor}`} />
          </div>
        ))}
      </div>
      {bandwidth != null && (
        <p className="mt-3 text-center text-xs text-[var(--ink-3)]">
          Bandbreedte:{' '}
          <span className="font-mono font-semibold text-[var(--ink)]">{bandwidth} jaar</span>
        </p>
      )}
      {size === 'full' && (
        <>
          {/* Mini SVG age axis with 3 scenario markers */}
          {pesAge != null && expAge != null && optAge != null && (
            <ScenarioAxis pesAge={Math.round(pesAge)} expAge={Math.round(expAge)} optAge={Math.round(optAge)} />
          )}
          {/* Return scenario labels in compact grid */}
          <div className="mt-1.5 grid grid-cols-3 gap-1 text-center text-[10px]">
            <span className="text-red-500 font-mono">5%</span>
            <span className="text-horizon-600 font-mono font-semibold">7%</span>
            <span className="text-emerald-600 font-mono">9%</span>
          </div>
          <p className="mt-1 font-serif italic text-[11px] text-[var(--ink-3)] text-center">
            rendement per scenario
          </p>
        </>
      )}
    </WidgetShell>
  )
})

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
    { age: optAge, color: '#10b981', label: `${optAge}` },  // emerald-500
    { age: expAge, color: '#8b5cf6', label: `${expAge}` },  // purple-500 (horizon)
    { age: pesAge, color: '#f87171', label: `${pesAge}` },  // red-400
  ]

  return (
    <div className="mt-3 flex justify-center">
      <svg width={w} height={52} viewBox={`0 0 ${w} 52`} className="overflow-visible">
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
