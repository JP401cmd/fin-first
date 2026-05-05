'use client'

/**
 * Fase 2.2 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §5.1 (pane) + §5.2 (sheet)
 * DreamTransitionContext (plan §8.1) blijft als per-module override actief.
 *
 * BacktestingModal = pane (eigen flow: upload + replay + scenarios).
 * PeriodKassabon (sub-overlay) = sheet (inspection van één historische
 * periode — gebruiker keert terug naar de pane-lijst).
 */

import { useState, useMemo } from 'react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { useModalAnimation } from '@/lib/hooks/use-modal-animation'
import { formatCurrency } from '@/components/app/budget-shared'
import {
  runBacktest,
  formatFireAge,
  type FinancialInput,
  type BacktestPath,
} from '@/lib/horizon-data'
import { NAMED_PERIODS } from '@/lib/msci-data'
import { MaskedAmount } from '@/components/app/masked-amount'

type Props = {
  input: FinancialInput
  swr: number   // user-selected SWR: 0.04 (classic) or NL_SWR (~0.02883)
  open: boolean
  onClose: () => void
  /** When set (e.g. 'huishouden'), indicates the simulation uses combined household data */
  perspectiveLabel?: string
}

export function BacktestingModal({ input, swr, open, onClose, perspectiveLabel }: Props) {
  const result = useMemo(() => {
    if (!open) return null
    return runBacktest(input, 30, swr)
  }, [input, swr, open])

  const [selectedPeriod, setSelectedPeriod] = useState<BacktestPath | null>(null)

  if (!open || !result) return null

  const medianFinalValue = result.medianPath.values[result.years] ?? 0
  const successPct = Math.round(result.successRate * 100)
  const swrPct = (swr * 100).toFixed(2).replace(/\.?0+$/, '') + '%'
  const fireTarget = input.yearlyMustExpenses > 0
    ? input.yearlyMustExpenses / swr
    : (input.monthlyExpenses * 12) / swr

  return (
    <>
      <ShellOverlay open={true} onClose={onClose} kind="pane" title={perspectiveLabel ? `Historische robuustheid — ${perspectiveLabel}` : 'Historische robuustheid'}>
        <div className="space-y-6 px-6 py-6">

          {/* Kicker */}
          <p className="label-editorial text-horizon-600">
            HISTORISCH BEWIJS — 1970 TOT 2024
            {perspectiveLabel && (
              <span className="ml-2 rounded-full bg-horizon-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-horizon-700">
                {perspectiveLabel}
              </span>
            )}
          </p>

          {/* Metric band */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 text-center">
              <p className="font-mono text-2xl font-bold text-[var(--ink)]">{successPct}%</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">periodes succesvol</p>
            </div>
            <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 text-center">
              <p className="font-mono text-2xl font-bold text-[var(--ink)]">{swrPct}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">jouw onttrekking</p>
            </div>
            <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 text-center">
              <p className="font-mono text-xl font-bold text-[var(--ink)]">
                {medianFinalValue >= 1000000
                  ? `${(medianFinalValue / 1000000).toFixed(1)}M`
                  : medianFinalValue >= 1000
                  ? `${(medianFinalValue / 1000).toFixed(0)}k`
                  : formatCurrency(medianFinalValue)}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">mediaan eindvermogen</p>
            </div>
          </div>

          {/* Chart */}
          <div className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4">
            <BacktestChart result={result} fireTarget={fireTarget} />
          </div>

          {/* Named Period Cards */}
          <section>
            <h2 className="mb-3 label-editorial text-[var(--ink-2)]">
              Historische startpunten
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {result.namedPaths.map((path) => {
                const period = NAMED_PERIODS.find(p => p.startYear === path.startYear)
                return (
                  <button
                    key={path.startYear}
                    type="button"
                    onClick={() => setSelectedPeriod(path)}
                    className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 text-left transition-all hover:border-horizon-300 hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[var(--ink)]">
                          {path.label ?? path.startYear}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                          {path.description ?? `Start ${path.startYear}`}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-[var(--r-sm)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${
                          path.success
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {path.success ? 'Haalbaar' : 'Leeggelopen'}
                      </span>
                    </div>
                    <div className="mt-3 space-y-1">
                      {path.fireAgeReached !== null ? (
                        <p className="text-xs text-[var(--ink-2)]">
                          Vrijheidsleeftijd:{' '}
                          <span className="font-semibold">{formatFireAge(path.fireAgeReached)}</span>
                        </p>
                      ) : (
                        <p className="text-xs text-[var(--ink-3)]">FIRE-doel niet bereikt in dit scenario</p>
                      )}
                      {path.depletionYear !== null && (
                        <p className="text-xs text-red-600">
                          Portfolio leeg in jaar {path.depletionYear}
                        </p>
                      )}
                      <p className="text-xs text-[var(--ink-3)]">
                        Eindvermogen:{' '}
                        <span className="tabular-nums font-medium text-[var(--ink-2)]">
                          {<MaskedAmount value={path.values[path.values.length - 1] ?? 0} tone="horizon" />}
                        </span>
                      </p>
                    </div>
                    <p className="mt-2 text-[10px] text-horizon-600 font-medium">
                      Klik voor detail →
                    </p>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Success framing */}
          <section className="rounded-[var(--r-lg)] border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/50 p-4 font-mono text-sm">
            <div className="mb-3 text-center">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">ROBUUSTHEIDSCONCLUSIE</p>
              <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">1970–2024 · {result.allPaths.length} historische periodes</p>
            </div>
            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              Historische robuustheid toont hoe {perspectiveLabel ? 'jullie gezamenlijke' : 'jouw'} strategie standhield in {result.allPaths.length} verschillende startpunten —
              inclusief echte crashes die een normaalverdeling onderschat.
              {perspectiveLabel && (
                <> Op basis van gecombineerd vermogen, inkomen en uitgaven van het huishouden.</>
              )}
            </div>
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Succesvolle periodes</span>
              <span className="tabular-nums text-[var(--ink)]">{result.allPaths.filter(p => p.success).length} / {result.allPaths.length}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Slechtste startjaar</span>
              <span className="tabular-nums text-[var(--ink)]">{result.worstCase.startYear}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">Beste startjaar</span>
              <span className="tabular-nums text-[var(--ink)]">{result.bestCase.startYear}</span>
            </div>
            <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
              <span className="text-[var(--ink)]">Robuustheid</span>
              <span className="tabular-nums text-[var(--ink)]">{successPct}% robuust</span>
            </div>
            <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
              Bron: MSCI World Index reële rendementen 1970–2024. Inclusief dividenden, gecorrigeerd voor EUR inflatie.
            </p>
          </section>

        </div>
      </ShellOverlay>

      {/* Named period kassabon sub-overlay — sheet (inspection, terugkeer naar pane-lijst) */}
      {selectedPeriod && (
        <PeriodKassabon
          path={selectedPeriod}
          onClose={() => setSelectedPeriod(null)}
        />
      )}
    </>
  )
}

// ── BacktestChart SVG ─────────────────────────────────────────

function BacktestChart({
  result,
  fireTarget,
}: {
  result: ReturnType<typeof runBacktest>
  fireTarget: number
}) {
  const { hasEntered: animated } = useModalAnimation({ delay: 100, duration: 1000 })

  const W = 600
  const H = 260
  const PAD_L = 55
  const PAD_R = 80
  const PAD_V = 36

  const years = result.years
  const maxVal = Math.max(...result.bandMax, fireTarget, 1)
  const minVal = 0

  function xp(i: number) {
    return PAD_L + (i / years) * (W - PAD_L - PAD_R)
  }

  function yp(val: number) {
    return H - PAD_V - ((val - minVal) / (maxVal - minVal || 1)) * (H - PAD_V * 2)
  }

  function areaPath(tops: number[], bottoms: number[]) {
    const top = tops.map((v, i) => `${i === 0 ? 'M' : 'L'}${xp(i).toFixed(1)},${yp(v).toFixed(1)}`).join(' ')
    const bottom = [...bottoms].reverse().map((v, i) => {
      const idx = bottoms.length - 1 - i
      return ` L${xp(idx).toFixed(1)},${yp(v).toFixed(1)}`
    }).join('')
    return top + bottom + ' Z'
  }

  function linePath(values: number[]) {
    return values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xp(i).toFixed(1)},${yp(v).toFixed(1)}`).join(' ')
  }

  const fireY = yp(fireTarget)
  const showFireLine = fireY > PAD_V && fireY < H - PAD_V

  const namedPeriods = NAMED_PERIODS
  const pathColors: Record<string, string> = {
    oilcrisis:   'var(--hor-t)',
    stagflation: '#c4a06b',
    dotcom:      '#8a6e42',
    crisis:      '#b8906a',
    bull:        '#d4b896',
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 280 }}>
      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map(pct => {
        const yPos = H - PAD_V - pct * (H - PAD_V * 2)
        const val = minVal + pct * maxVal
        return (
          <g key={pct}>
            <line x1={PAD_L} y1={yPos} x2={W - PAD_R} y2={yPos} stroke="#e2e0d8" strokeDasharray="4 2" />
            <text x={PAD_L - 6} y={yPos + 4} textAnchor="end" fill="#bbb8b0" fontSize={9}>
              {val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val.toFixed(0)}
            </text>
          </g>
        )
      })}

      {/* Min-max band (all paths) */}
      <path
        d={areaPath(result.bandMax, result.bandMin)}
        fill="#c4a06b"
        style={{
          opacity: animated ? 0.10 : 0,
          transition: animated ? 'opacity 400ms ease-out 200ms' : 'none',
        }}
      />

      {/* P25-P75 band */}
      <path
        d={areaPath(result.bandP75, result.bandP25)}
        fill="#c4a06b"
        style={{
          opacity: animated ? 0.18 : 0,
          transition: animated ? 'opacity 400ms ease-out 300ms' : 'none',
        }}
      />

      {/* Named period lines */}
      {result.namedPaths.map((path, idx) => {
        const period = namedPeriods.find(p => p.startYear === path.startYear)
        if (!period) return null
        const color = pathColors[period.id] ?? 'var(--hor-t)'
        const d = linePath(path.values)
        const delay = 400 + idx * 80

        return (
          <g key={path.startYear}>
            <path
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={path.success ? 1.8 : 1.4}
              strokeDasharray={path.success ? undefined : '5 3'}
              pathLength={1}
              strokeDashoffset={animated ? 0 : 1}
              style={{
                transition: animated
                  ? `stroke-dashoffset 700ms cubic-bezier(.22,1,.36,1) ${delay}ms`
                  : 'none',
              }}
            />
            {/* Label right of line */}
            <text
              x={W - PAD_R + 6}
              y={yp(path.values[path.values.length - 1] ?? 0) + 4}
              fill={color}
              fontSize={8}
              fontWeight={600}
              style={{ opacity: animated ? 1 : 0, transition: animated ? `opacity 300ms ease ${delay + 700}ms` : 'none' }}
            >
              {path.label ?? path.startYear}
            </text>
          </g>
        )
      })}

      {/* FIRE target line */}
      {showFireLine && (
        <>
          <line
            x1={PAD_L} y1={fireY} x2={W - PAD_R} y2={fireY}
            stroke="var(--hor-t)" strokeWidth={1.5} strokeDasharray="6 3"
            style={{ opacity: animated ? 0.7 : 0, transition: animated ? 'opacity 300ms ease 1200ms' : 'none' }}
          />
          <text x={W - PAD_R + 6} y={fireY + 4} fill="var(--hor-t)" fontSize={8} fontWeight={700}
            style={{ opacity: animated ? 1 : 0, transition: animated ? 'opacity 300ms ease 1400ms' : 'none' }}>
            FIRE
          </text>
        </>
      )}

      {/* X-axis labels */}
      {[0, 5, 10, 15, 20, 25, 30].filter(y => y <= years).map(y => (
        <text key={y} x={xp(y)} y={H - 6} textAnchor="middle" fill="#bbb8b0" fontSize={9}>
          {`${y}j`}
        </text>
      ))}

      {/* Legend */}
      <text x={PAD_L} y={12} fill="#888070" fontSize={9} fontWeight={600}>Alle periodes</text>
      <rect x={PAD_L + 72} y={5} width={14} height={7} fill="#c4a06b" opacity={0.2} rx={1} />
      <rect x={PAD_L + 90} y={5} width={14} height={7} fill="#c4a06b" opacity={0.35} rx={1} />
      <text x={PAD_L + 108} y={12} fill="#888070" fontSize={9}>IQR-band</text>
    </svg>
  )
}

// ── Period Kassabon sub-modal ─────────────────────────────────

function PeriodKassabon({ path, onClose }: { path: BacktestPath; onClose: () => void }) {
  const milestones = [0, 5, 10, 15, 20, 25, 30].filter(y => y < path.values.length)

  return (
    <ShellOverlay open={true} onClose={onClose} kind="sheet" size="lg" title={path.label ?? `Startjaar ${path.startYear}`}>
      <div className="px-6 py-6">
        <div className="rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 p-4 font-mono text-sm">
          {/* Header */}
          <div className="mb-3 text-center">
            <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
              VRIJHEIDSCHECK: {String(path.label ?? path.startYear).toUpperCase()}
            </p>
            <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
              Startjaar {path.startYear} · 30-jaar venster
            </p>
          </div>

          {/* Uitleg */}
          <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
            {path.description ?? `Historisch scenario gestart in ${path.startYear}.`}
            {path.success
              ? ' Portfolio bleef intact over de volledige 30-jaar periode.'
              : ` Portfolio raakte leeg in jaar ${path.depletionYear}.`}
          </div>

          {/* Milestone rows */}
          <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
            {milestones.map(y => {
              const val = path.values[y] ?? 0
              const prev = y > 0 ? (path.values[y - 5] ?? path.values[0] ?? 0) : null
              const pctChange = prev !== null && prev > 0 ? ((val - prev) / prev) * 100 : null
              return (
                <div key={y} className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">
                    Na {y === 0 ? 'start' : `${y} jaar`}
                  </span>
                  <span className="tabular-nums text-[var(--ink)]">
                    {<MaskedAmount value={val} tone="horizon" />}
                    {pctChange !== null && (
                      <span className={`ml-1 text-[10px] ${pctChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(0)}%
                      </span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Totaalregel */}
          <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
            <span className="text-[var(--ink)]">
              {path.success ? 'Vrijheid bewaard' : 'Portfolio leeggelopen'}
            </span>
            <span className={`tabular-nums ${path.success ? 'text-emerald-700' : 'text-red-700'}`}>
              {<MaskedAmount value={path.values[path.values.length - 1] ?? 0} tone="horizon" />}
            </span>
          </div>

          {/* FIRE age if reached */}
          {path.fireAgeReached !== null && (
            <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2">
              <div className="flex justify-between font-sans text-[11px] text-[var(--ink-3)]">
                <span>Vrijheidsleeftijd bereikt</span>
                <span className="font-semibold text-[var(--ink-2)]">{formatFireAge(path.fireAgeReached)}</span>
              </div>
            </div>
          )}

          <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
            Bron: MSCI World Index reële rendementen 1970–2024
          </p>
        </div>
      </div>
    </ShellOverlay>
  )
}
