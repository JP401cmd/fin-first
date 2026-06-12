'use client'

import { useState } from 'react'

import {
  computeLifeEventImpact,
  type FinancialInput,
  type LifeEvent,
  type LifeEventImpact,
} from '@/lib/horizon-data'
import { Info, ChevronDown, ExternalLink, Download, Loader2, FileText } from 'lucide-react'
import { MaskedAmount } from '@/components/app/masked-amount'

// ── Shared types ─────────────────────────────────────────────

export type SnapshotForTrend = {
  snapshot_date: string
  resilience_score: number | null
  net_worth: number
  freedom_percentage: number | null
  fire_age: number | null
  /**
   * Scoreversie van de gezondheids-snapshot (ADR 0010). 1 = oude 7-pijler-
   * methode, 2 = nieuwe 4-pijler-methode. Optioneel: oudere selects leveren 'm
   * niet — dan blijft de "methode aangepast"-markering achterwege.
   */
  score_version?: number | null
}

export type PensionParseSummaryResult = {
  aowBedrag: number | null
  regelingen: Array<{ fondsNaam: string; brutoBedrag: number; ingangLeeftijd: number; isGeindexeerd: boolean; type: string }>
  nabestaandenpensioen: number | null
  samenvatting: string
}

// ── Constants ────────────────────────────────────────────────

export const PENSION_TYPE_LABELS: Record<string, string> = {
  ouderdomspensioen: 'Ouderdomspensioen',
  nabestaandenpensioen: 'Nabestaandenpensioen',
  arbeidsongeschiktheidspensioen: 'Arbeidsongeschiktheids\u00ADpensioen',
  overig: 'Overig',
}

// ── Pension parse summary card ───────────────────────────────

export function PensionParseSummaryCard({
  result,
  selectedIndex,
  onSelectRegeling,
  onReupload,
}: {
  result: PensionParseSummaryResult
  selectedIndex: number
  onSelectRegeling: (idx: number) => void
  onReupload: () => void
}) {
  const hasMultiple = result.regelingen.length > 1

  return (
    <div className="rounded-[var(--r)] border border-horizon-200 bg-horizon-50/40 p-4 space-y-3">
      {/* Samenvatting */}
      <p className="text-base text-[var(--ink-2)] leading-relaxed">{result.samenvatting}</p>

      {/* AOW bedrag */}
      {result.aowBedrag != null && (
        <div className="flex items-center justify-between rounded-lg bg-white/60 px-3 py-2 border border-horizon-100">
          <span className="text-xs font-medium text-[var(--ink-3)]">AOW (verwacht)</span>
          <span className="font-mono tabular-nums text-sm font-semibold text-[var(--ink)]">{<MaskedAmount value={result.aowBedrag} tone="horizon" />}/mnd</span>
        </div>
      )}

      {/* Regelingen */}
      {result.regelingen.length > 0 && (
        <div className="space-y-2">
          {hasMultiple && (
            <p className="text-xs font-medium text-horizon-700">
              We hebben {result.regelingen.length} pensioenregelingen gevonden. Selecteer welke je wilt invullen, of maak voor elke regeling een aparte levensgebeurtenis aan.
            </p>
          )}
          {result.regelingen.map((regeling, idx) => {
            const isSelected = idx === selectedIndex
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onSelectRegeling(idx)}
                className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                  isSelected
                    ? 'border-horizon-400 bg-white ring-1 ring-horizon-200'
                    : 'border-horizon-100 bg-white/60 hover:border-horizon-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--ink)] truncate">{regeling.fondsNaam}</p>
                    <p className="text-xs text-[var(--ink-3)]">
                      {PENSION_TYPE_LABELS[regeling.type] || regeling.type}
                      {' \u00B7 '}vanaf {regeling.ingangLeeftijd} jaar
                      {regeling.isGeindexeerd && ' \u00B7 ge\u00EFndexeerd'}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono tabular-nums text-sm font-semibold text-[var(--ink)]">
                    {<MaskedAmount value={regeling.brutoBedrag} tone="horizon" />}/mnd
                  </span>
                </div>
                {isSelected && hasMultiple && (
                  <p className="mt-1 text-[10px] font-medium text-horizon-600 uppercase tracking-wide">Geselecteerd</p>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Nabestaandenpensioen */}
      {result.nabestaandenpensioen != null && (
        <div className="flex items-center justify-between rounded-lg bg-white/60 px-3 py-2 border border-horizon-100">
          <span className="text-xs font-medium text-[var(--ink-3)]">Nabestaandenpensioen</span>
          <span className="font-mono tabular-nums text-sm font-semibold text-[var(--ink)]">{<MaskedAmount value={result.nabestaandenpensioen} tone="horizon" />}/mnd</span>
        </div>
      )}

      {/* Opnieuw uploaden */}
      <button
        type="button"
        onClick={onReupload}
        className="w-full text-center text-xs text-[var(--ink-3)] hover:text-horizon-600 transition-colors underline underline-offset-2"
      >
        Opnieuw uploaden
      </button>
    </div>
  )
}

// ── Pension PDF download link ────────────────────────────────

export function PensionPdfDownloadLink({ lifeEventId }: { lifeEventId: string }) {
  const [downloading, setDownloading] = useState(false)

  async function handleDownload() {
    setDownloading(true)
    try {
      const res = await fetch(`/api/pension/storage?lifeEventId=${lifeEventId}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.url) window.open(data.url, '_blank', 'noopener')
    } catch (err) {
      console.error('[pension] Download error:', err)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="rounded-[var(--r)] border border-horizon-200 bg-horizon-50/30 p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-horizon-100">
          <FileText className="h-4 w-4 text-horizon-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--ink)]">Pensioenoverzicht (PDF)</p>
          <p className="text-xs text-[var(--ink-3)]">Origineel document</p>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-horizon-700 hover:bg-horizon-100 transition-colors disabled:opacity-50"
        >
          {downloading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Download
        </button>
      </div>
    </div>
  )
}

// ── Pension instruction panel ────────────────────────────────

export function PensionInstructionPanel() {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)]">
      {/* Subtitle */}
      <p className="px-3 pt-3 text-xs font-medium text-[var(--ink-2)]">
        Wij hebben van u nodig: <span className="font-semibold text-[var(--ink)]">Samenvatting Mijnpensioenoverzicht.nl</span>
      </p>
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2 px-3 pb-3 pt-2 text-left text-sm font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
      >
        <Info className="h-3.5 w-3.5 shrink-0" />
        <span>Hoe werkt het?</span>
        <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {/* Collapsible content */}
      <div
        className={`overflow-hidden transition-all duration-200 ${open ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="space-y-3 border-t border-[var(--border-ed)] px-3 pb-3 pt-3">
          <ol className="list-none space-y-2.5 text-[13px] leading-relaxed text-[var(--ink-3)]">
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-horizon-100 text-[11px] font-bold text-horizon-700">1</span>
              <span>Log in met <strong className="font-medium text-[var(--ink-2)]">DigiD</strong> op mijnpensioenoverzicht.nl</span>
            </li>
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-horizon-100 text-[11px] font-bold text-horizon-700">2</span>
              <span>Vink je levenssituatie aan → klik <strong className="font-medium text-[var(--ink-2)]">&apos;Bekijk mijn pensioenoverzicht&apos;</strong></span>
            </li>
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-horizon-100 text-[11px] font-bold text-horizon-700">3</span>
              <span>Twee keer <strong className="font-medium text-[var(--ink-2)]">&apos;Volgende&apos;</strong> → klik <strong className="font-medium text-[var(--ink-2)]">&apos;Bekijk mijn te bereiken pensioen&apos;</strong></span>
            </li>
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-horizon-100 text-[11px] font-bold text-horizon-700">4</span>
              <span>Rechtsboven: klik <strong className="font-medium text-[var(--ink-2)]">&apos;Download gegevens of samenvatting&apos;</strong> → sla op als PDF</span>
            </li>
          </ol>
          <a
            href="https://www.mijnpensioenoverzicht.nl"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-horizon-50 px-3 py-1.5 text-[13px] font-medium text-horizon-700 hover:bg-horizon-100 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ga naar mijnpensioenoverzicht.nl
          </a>
        </div>
      </div>
    </div>
  )
}

// ── Helper components ────────────────────────────────────────

export function KpiTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onBlur={() => setOpen(false)}
        className="touch-target"
      >
        <Info className={`h-4 w-4 cursor-help transition-colors ${open ? 'text-horizon-500' : 'text-[var(--ink-4)]'} group-hover:text-horizon-500`} />
      </button>
      <div className={`absolute right-0 z-10 mt-1 w-56 rounded-lg border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-[var(--ink-2)] shadow-lg transition-opacity ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'}`}>
        {text}
      </div>
    </div>
  )
}

export function ExploreCard({
  onClick, icon, title, value, subtitle,
}: {
  onClick: () => void; icon: React.ReactNode; title: string; value: string; subtitle: string
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-[var(--paper)] p-4 text-left transition-colors hover:border-horizon-200 hover:bg-horizon-50/30"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--subtle)] group-hover:bg-horizon-50">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-[var(--ink-3)]">{title}</p>
        <p className="text-lg font-bold text-[var(--ink)]">{value}</p>
        <p className="text-xs text-[var(--ink-4)]">{subtitle}</p>
      </div>
    </button>
  )
}

// ── Resilience score helper ─────────────────────────────────

export function getResilienceLabel(score: number): string {
  if (score >= 80) return 'Uitstekend'
  if (score >= 60) return 'Sterk'
  if (score >= 40) return 'Redelijk'
  if (score >= 20) return 'Kwetsbaar'
  return 'Kritiek'
}

export function ResilienceContextMessage({ snapshots }: { snapshots: SnapshotForTrend[] }) {
  const withScore = snapshots.filter(s => s.resilience_score !== null && s.resilience_score !== undefined)
  if (withScore.length < 2) return null

  const first = withScore[0]
  const last = withScore[withScore.length - 1]
  const firstScore = first.resilience_score as number
  const lastScore = last.resilience_score as number
  const diff = lastScore - firstScore

  // Calculate month span between first and last snapshot
  const firstDate = new Date(first.snapshot_date)
  const lastDate = new Date(last.snapshot_date)
  const monthSpan = (lastDate.getFullYear() - firstDate.getFullYear()) * 12 + (lastDate.getMonth() - firstDate.getMonth())
  const monthLabel = monthSpan === 1 ? '1 maand' : `${monthSpan} maanden`

  return (
    <div className="mb-4 rounded-[var(--r)] border border-horizon-100 bg-horizon-50 px-4 py-3" data-testid="health-context-message">
      <p className="text-sm text-horizon-800">
        {diff > 0 ? (
          <>
            <span className="font-semibold text-emerald-700">
              Je gezondheidsscore is gestegen van {firstScore} naar {lastScore} in {monthLabel}
            </span>
            {' — '}
            goed bezig! Je financiële gezondheid wordt sterker.
          </>
        ) : diff < 0 ? (
          <>
            <span className="font-semibold text-amber-700">
              Je gezondheidsscore is gedaald van {firstScore} naar {lastScore} in {monthLabel}
            </span>
            {' — '}
            bekijk je uitgaven en buffer om je score te herstellen.
          </>
        ) : (
          <>
            Je gezondheidsscore is stabiel gebleven op{' '}
            <span className="font-bold">{lastScore}</span>
            {monthSpan > 0 && <> over {monthLabel}</>}
            {' — '}
            <span className="font-medium">{getResilienceLabel(lastScore)}</span>.
          </>
        )}
      </p>
    </div>
  )
}

export function FireAgeContextMessage({ snapshots }: { snapshots: SnapshotForTrend[] }) {
  const withAge = snapshots.filter(s => s.fire_age !== null && s.fire_age !== undefined)
  if (withAge.length < 2) return null

  const first = withAge[0]
  const last = withAge[withAge.length - 1]
  const firstAge = first.fire_age as number
  const lastAge = last.fire_age as number
  // Positive diff = age dropped = improved (eerder vrij)
  const diff = Math.round((firstAge - lastAge) * 10) / 10

  const firstDate = new Date(first.snapshot_date)
  const lastDate = new Date(last.snapshot_date)
  const monthSpan = (lastDate.getFullYear() - firstDate.getFullYear()) * 12 + (lastDate.getMonth() - firstDate.getMonth())
  const monthLabel = monthSpan === 1 ? '1 maand' : `${monthSpan} maanden`

  const absDiff = Math.abs(diff)
  const diffLabel = absDiff >= 1
    ? `${Math.round(absDiff)} ${Math.round(absDiff) === 1 ? 'jaar' : 'jaar'}`
    : `${Math.round(absDiff * 12)} ${Math.round(absDiff * 12) === 1 ? 'maand' : 'maanden'}`

  return (
    <div className="mb-4 rounded-[var(--r)] border border-horizon-100 bg-horizon-50 px-4 py-3" data-testid="fire-age-context-message">
      <p className="text-sm text-horizon-800">
        {diff > 0 ? (
          <>
            <span className="font-semibold text-emerald-700">
              Je FIRE-leeftijd is gedaald van {Math.round(firstAge)} naar {Math.round(lastAge)} in {monthLabel}
            </span>
            {' — '}
            je ligt {diffLabel} voor!
          </>
        ) : diff < 0 ? (
          <>
            <span className="font-semibold text-amber-700">
              Je FIRE-leeftijd is gestegen van {Math.round(firstAge)} naar {Math.round(lastAge)} in {monthLabel}
            </span>
            {' — '}
            {diffLabel} verschoven; bekijk je spaarquote en uitgaven.
          </>
        ) : (
          <>
            Je FIRE-leeftijd is stabiel gebleven op{' '}
            <span className="font-bold">{Math.round(lastAge)} jaar</span>
            {monthSpan > 0 && <> over {monthLabel}</>}.
          </>
        )}
      </p>
    </div>
  )
}

export function ResilienceTrendChart({ snapshots }: { snapshots: SnapshotForTrend[] }) {
  const withScore = snapshots.filter(s => s.resilience_score !== null && s.resilience_score !== undefined)
  if (withScore.length < 2) return null

  const W = 600
  const H = 200
  const PAD = 45

  const maxVal = 100
  const minVal = 0

  function x(i: number) { return PAD + (i / (withScore.length - 1)) * (W - PAD * 2) }
  function y(val: number) { return H - PAD - ((val - minVal) / (maxVal - minVal)) * (H - PAD * 2) }

  const linePath = withScore.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(s.resilience_score as number).toFixed(1)}`).join(' ')
  const areaPath = linePath + ` L${x(withScore.length - 1).toFixed(1)},${(H - PAD).toFixed(1)} L${PAD},${(H - PAD).toFixed(1)} Z`

  // Methode-wissel-markering: alleen tonen wanneer de reeks zowel v1- als v2-
  // punten bevat (ADR 0010). We markeren het eerste v2-punt subtiel met een
  // gestreepte verticale scheiding + klein label "methode aangepast".
  const firstV2Index = withScore.findIndex(s => s.score_version === 2)
  const hasV1 = withScore.some(s => s.score_version != null && s.score_version < 2)
  const showMethodMarker = firstV2Index > 0 && hasV1
  const markerX = showMethodMarker ? x(firstV2Index) : 0

  // Color zones: Kritiek (0-20), Kwetsbaar (20-40), Redelijk (40-60), Sterk (60-80), Uitstekend (80-100)
  const zones = [
    { min: 0, max: 20, color: '#fecaca', label: 'Kritiek' },
    { min: 20, max: 40, color: '#fed7aa', label: 'Kwetsbaar' },
    { min: 40, max: 60, color: '#fef08a', label: 'Redelijk' },
    { min: 60, max: 80, color: '#bbf7d0', label: 'Sterk' },
    { min: 80, max: 100, color: '#a5f3fc', label: 'Uitstekend' },
  ]

  // Format date label
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
    return `${months[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 220 }} data-testid="resilience-trend-chart">
      {/* Background color zones */}
      {zones.map(zone => (
        <rect
          key={zone.label}
          x={PAD}
          y={y(zone.max)}
          width={W - PAD * 2}
          height={y(zone.min) - y(zone.max)}
          fill={zone.color}
          opacity="0.15"
        />
      ))}

      {/* Grid lines at zone boundaries */}
      {[20, 40, 60, 80].map(val => (
        <g key={val}>
          <line x1={PAD} y1={y(val)} x2={W - PAD} y2={y(val)} stroke="#e4e4e7" strokeDasharray="4" />
          <text x={PAD - 4} y={y(val) + 3} textAnchor="end" className="fill-zinc-400" style={{ fontSize: 9 }}>
            {val}
          </text>
        </g>
      ))}

      {/* Y-axis labels */}
      <text x={PAD - 4} y={y(0) + 3} textAnchor="end" className="fill-zinc-400" style={{ fontSize: 9 }}>0</text>
      <text x={PAD - 4} y={y(100) + 3} textAnchor="end" className="fill-zinc-400" style={{ fontSize: 9 }}>100</text>

      {/* Area fill */}
      <defs>
        <linearGradient id="resilienceGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-horizon-500, #c4a06b)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--color-horizon-500, #c4a06b)" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#resilienceGrad)" />

      {/* Line — horizon module-identiteit (volgt instelbare accent) */}
      <path d={linePath} fill="none" stroke="var(--color-horizon-500, #c4a06b)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Methode-wissel-markering (alleen bij mix v1+v2) */}
      {showMethodMarker && (
        <g data-testid="method-change-marker" aria-hidden="true">
          <line
            x1={markerX}
            y1={PAD - 18}
            x2={markerX}
            y2={H - PAD}
            stroke="#a1a1aa"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <text
            x={markerX}
            y={PAD - 20}
            textAnchor="middle"
            aria-hidden="true"
            className="fill-zinc-500"
            style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.04em' }}
          >
            methode aangepast
          </text>
        </g>
      )}

      {/* Data points */}
      {withScore.map((s, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(s.resilience_score as number)}
          r="4"
          fill="var(--color-horizon-500, #c4a06b)"
          stroke="white"
          strokeWidth="2"
        />
      ))}

      {/* X-axis date labels */}
      {withScore.map((s, i) => {
        // Show every label if few points, otherwise skip some
        const showEvery = withScore.length <= 6 ? 1 : Math.ceil(withScore.length / 6)
        if (i % showEvery !== 0 && i !== withScore.length - 1) return null
        return (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-zinc-400" style={{ fontSize: 9 }}>
            {formatDate(s.snapshot_date)}
          </text>
        )
      })}

      {/* Score value labels on data points */}
      {withScore.map((s, i) => {
        const score = s.resilience_score as number
        const showEvery = withScore.length <= 8 ? 1 : Math.ceil(withScore.length / 8)
        if (i % showEvery !== 0 && i !== withScore.length - 1) return null
        return (
          <text
            key={`val-${i}`}
            x={x(i)}
            y={y(score) - 10}
            textAnchor="middle"
            className="fill-horizon-700"
            style={{ fontSize: 10, fontWeight: 600 }}
          >
            {score}
          </text>
        )
      })}
    </svg>
  )
}

// ── FIRE Age Trend Chart ────────────────────────

export function FireAgeTrendChart({ snapshots }: { snapshots: SnapshotForTrend[] }) {
  const withAge = snapshots.filter(s => s.fire_age !== null && s.fire_age !== undefined)
  if (withAge.length < 2) {
    return (
      <div className="py-8 text-center text-sm text-[var(--ink-3)]" data-testid="fire-age-no-data">
        Nog niet genoeg snapshots om een trend te tonen. Na je volgende maandelijkse snapshot verschijnt hier je FIRE-leeftijd verloop.
      </div>
    )
  }

  const W = 600
  const H = 220
  const PAD = 50

  const ages = withAge.map(s => s.fire_age as number)
  const minAge = Math.floor(Math.min(...ages) - 2)
  const maxAge = Math.ceil(Math.max(...ages) + 2)
  const range = maxAge - minAge || 1

  function x(i: number) { return PAD + (i / (withAge.length - 1)) * (W - PAD * 2) }
  function y(val: number) { return PAD + ((val - minAge) / range) * (H - PAD * 2) }

  // For FIRE age: higher y = older age (top = old = bad, bottom = young = good)
  // So we DON'T invert — lower fire age should be at the bottom (good)
  // Actually, for intuition: lower FIRE age = better, so let's invert: lower age at bottom
  // Re-think: "lager is beter" means we want to show improvement going DOWN
  // Standard: y-axis top = high value. For FIRE age, high = bad, so let's keep it natural
  // The chart shows the fire age value on y-axis, naturally high values at top

  const linePath = withAge.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(s.fire_age as number).toFixed(1)}`).join(' ')
  const areaPath = linePath + ` L${x(withAge.length - 1).toFixed(1)},${(H - PAD).toFixed(1)} L${PAD},${(H - PAD).toFixed(1)} Z`

  // Determine trend: is FIRE age decreasing (good) or increasing (bad)?
  const firstAge = ages[0]
  const lastAge = ages[ages.length - 1]
  const improving = lastAge < firstAge
  const lineColor = improving ? '#059669' : '#dc2626' // green if improving, red if worsening
  const gradientId = 'fireAgeGrad'

  // Y-axis ticks: evenly spaced ages
  const tickCount = 5
  const tickStep = range / (tickCount - 1)
  const ticks = Array.from({ length: tickCount }, (_, i) => Math.round(minAge + i * tickStep))

  // Format date label
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
    return `${months[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 240 }} data-testid="fire-age-trend-chart">
      {/* Grid lines */}
      {ticks.map(val => (
        <g key={val}>
          <line x1={PAD} y1={y(val)} x2={W - PAD} y2={y(val)} stroke="#e4e4e7" strokeDasharray="4" />
          <text x={PAD - 6} y={y(val) + 3} textAnchor="end" className="fill-zinc-400" style={{ fontSize: 9 }}>
            {val}j
          </text>
        </g>
      ))}

      {/* Y-axis title */}
      <text
        x={12}
        y={H / 2}
        textAnchor="middle"
        className="fill-zinc-400"
        style={{ fontSize: 8 }}
        transform={`rotate(-90, 12, ${H / 2})`}
      >
        FIRE-leeftijd
      </text>

      {/* Area fill */}
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />

      {/* Line */}
      <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Data points */}
      {withAge.map((s, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(s.fire_age as number)}
          r="4"
          fill={lineColor}
          stroke="white"
          strokeWidth="2"
        />
      ))}

      {/* X-axis date labels */}
      {withAge.map((s, i) => {
        const showEvery = withAge.length <= 6 ? 1 : Math.ceil(withAge.length / 6)
        if (i % showEvery !== 0 && i !== withAge.length - 1) return null
        return (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-zinc-400" style={{ fontSize: 9 }}>
            {formatDate(s.snapshot_date)}
          </text>
        )
      })}

      {/* Age value labels on data points */}
      {withAge.map((s, i) => {
        const age = s.fire_age as number
        const showEvery = withAge.length <= 8 ? 1 : Math.ceil(withAge.length / 8)
        if (i % showEvery !== 0 && i !== withAge.length - 1) return null
        return (
          <text
            key={`val-${i}`}
            x={x(i)}
            y={y(age) - 10}
            textAnchor="middle"
            className={improving ? 'fill-emerald-700' : 'fill-red-700'}
            style={{ fontSize: 10, fontWeight: 600 }}
          >
            {Math.round(age * 10) / 10}
          </text>
        )
      })}

      {/* Trend arrow indicator */}
      {withAge.length >= 2 && (
        <g>
          <text
            x={W - PAD + 5}
            y={y(lastAge) + 4}
            className={improving ? 'fill-emerald-600' : 'fill-red-600'}
            style={{ fontSize: 14, fontWeight: 700 }}
          >
            {improving ? '\u2193' : '\u2191'}
          </text>
        </g>
      )}
    </svg>
  )
}

// ── Cumulative FIRE impact calculation ────────────────────────

export function computeCumulativeImpacts(
  baseInput: FinancialInput,
  events: LifeEvent[],
): LifeEventImpact[] {
  const sorted = [...events].sort((a, b) => (a.target_age ?? 999) - (b.target_age ?? 999))
  const results: LifeEventImpact[] = []
  let runningInput = { ...baseInput }

  for (const ev of sorted) {
    const impact = computeLifeEventImpact(runningInput, ev)
    results.push(impact)
    runningInput = {
      ...runningInput,
      totalAssets: runningInput.totalAssets - Number(ev.one_time_cost),
      monthlyExpenses: runningInput.monthlyExpenses + Number(ev.monthly_cost_change),
      monthlyIncome: runningInput.monthlyIncome + Number(ev.monthly_income_change),
    }
  }

  return events.map(ev => {
    const idx = sorted.findIndex(s => s.id === ev.id)
    return results[idx]
  })
}
