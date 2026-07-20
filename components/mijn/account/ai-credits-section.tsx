'use client'

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

interface CreditsData {
  hasAi: boolean
  used: number
  budget: number
  remaining: number
  pct: number
  resetDate: string
  byFeature: { key: string; label: string; credits: number }[]
  dailyCumulative: { day: number; used: number }[]
  forecast: number
  daysInPeriod: number
  dayOfPeriod: number
}

const resetFmt = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', timeZone: 'Europe/Amsterdam' })
function fmtReset(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : resetFmt.format(d)
}

function UsageChart({ data }: { data: CreditsData }) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 1200 })
  const W = 320
  const H = 120
  const days = Math.max(2, data.daysInPeriod)
  const maxY = Math.max(data.budget, data.forecast, data.used, 1) * 1.08

  const xFor = (day: number) => ((day - 1) / (days - 1)) * W
  const yFor = (val: number) => H - (val / maxY) * H

  const actual = data.dailyCumulative.slice(0, Math.max(1, data.dayOfPeriod))
  const actualPoints = actual.map((p) => `${xFor(p.day).toFixed(1)},${yFor(p.used).toFixed(1)}`).join(' ')
  const lastActual = actual[actual.length - 1] ?? { day: 1, used: 0 }
  const forecastPoints = `${xFor(lastActual.day).toFixed(1)},${yFor(lastActual.used).toFixed(1)} ${xFor(days).toFixed(1)},${yFor(data.forecast).toFixed(1)}`
  const budgetY = yFor(data.budget)

  return (
    <div ref={ref} className="mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 120 }}>
        {/* Budget-referentielijn */}
        {data.budget <= maxY && (
          <line
            x1={0}
            y1={budgetY}
            x2={W}
            y2={budgetY}
            stroke="var(--ink-4)"
            strokeWidth={1}
            strokeDasharray="2 3"
            opacity={0.5}
          />
        )}
        {/* Prognose (gestippeld) */}
        <polyline
          points={forecastPoints}
          fill="none"
          stroke="var(--ink-4)"
          strokeWidth={1.5}
          strokeDasharray="3 3"
          opacity={hasEntered ? 0.7 : 0}
          style={{ transition: 'opacity 0.4s ease 0.8s' }}
        />
        {/* Werkelijk verbruik */}
        <polyline
          points={actualPoints}
          fill="none"
          stroke="rgb(109 40 217)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={hasEntered ? 0 : 1}
          style={{ transition: hasEntered ? 'stroke-dashoffset 1.1s ease' : 'none' }}
        />
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
        <span>begin periode</span>
        <span>reset {fmtReset(data.resetDate)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[var(--ink-3)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-px w-4 bg-violet-700" /> Huidig verbruik
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-px w-4 border-t border-dashed border-[var(--ink-4)]" /> Prognose ({data.forecast})
        </span>
      </div>
    </div>
  )
}

export function AiCreditsSection() {
  const [data, setData] = useState<CreditsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetch('/api/ai-credits')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active) {
          setData(d)
          setLoading(false)
        }
      })
      .catch(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  return (
    <section aria-labelledby="ai-credits-heading" className="space-y-4">
      <header>
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] font-semibold text-violet-700">
          <Sparkles className="h-3 w-3" />
          AI-credits
        </div>
        <h2 id="ai-credits-heading" className="font-serif text-xl sm:text-2xl text-[var(--ink)] mt-1">
          Je AI-verbruik
        </h2>
        <p className="mt-2 text-sm text-[var(--ink-2)] leading-relaxed">
          Elke AI-actie — Fin-chat, briefing, rapporten, extractie — kost credits. Je budget
          vernieuwt elke maand.
        </p>
      </header>

      {loading ? (
        <div className="h-32 animate-pulse bg-[var(--subtle)]" />
      ) : !data ? (
        <p className="text-sm italic text-[var(--ink-4)]">AI-verbruik kon niet geladen worden.</p>
      ) : (
        <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5">
          {/* Teller + balk */}
          <div className="flex items-baseline justify-between">
            <div>
              <span className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">{data.used}</span>
              <span className="font-mono text-sm tabular-nums text-[var(--ink-3)]"> / {data.budget}</span>
              <span className="ml-2 text-sm text-[var(--ink-3)]">credits</span>
            </div>
            <span className="text-xs text-[var(--ink-4)]">
              {data.remaining} over · reset {fmtReset(data.resetDate)}
            </span>
          </div>
          <div className="mt-2 h-2 w-full bg-[var(--subtle)]">
            <div
              className="h-full bg-violet-600 transition-[width] duration-700"
              style={{ width: `${data.pct}%` }}
            />
          </div>
          {!data.hasAi && (
            <p className="mt-2 text-xs text-[var(--ink-4)]">
              Je gebruikt het gratis proefbudget. Met het AI-abonnement krijg je elke maand een
              ruimer budget.
            </p>
          )}

          {/* Grafiek */}
          {data.used > 0 ? (
            <UsageChart data={data} />
          ) : (
            <p className="mt-4 text-sm italic text-[var(--ink-4)]">
              Nog geen AI-verbruik deze periode.
            </p>
          )}

          {/* Per feature */}
          {data.byFeature.length > 0 && (
            <div className="mt-5">
              <div className="flex items-center gap-4 pb-2">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
                  Per functie
                </span>
                <div className="h-px flex-1 bg-[var(--border-ed)]" />
              </div>
              <ul className="space-y-1.5">
                {data.byFeature.map((f) => (
                  <li key={f.key} className="flex items-center justify-between text-sm">
                    <span className="text-[var(--ink-2)]">{f.label}</span>
                    <span className="font-mono tabular-nums text-[var(--ink)]">{f.credits}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
