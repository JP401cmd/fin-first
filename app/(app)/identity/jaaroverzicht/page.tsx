'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  Target,
  Flame,
  ArrowUp,
  ArrowDown,
  Star,
  Download,
  Share2,
  ChevronLeft,
  Sparkles,
  Clock,
  PiggyBank,
  BarChart3,
} from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import Link from 'next/link'
import { ShareDialog, type ShareContent } from '@/components/app/share-dialog'

// ── Types ──────────────────────────────────────────────────────
interface MonthData {
  month: string
  label: string
  days: number
}

interface MonthlyOverview {
  month: string
  label: string
  income: number
  expenses: number
  savings: number
}

interface FirePoint {
  percentage: number
  netWorth: number
  fireTarget: number
}

interface YearInReviewData {
  year: number
  displayName: string | null

  freedomDaysWon: number
  freedomDaysByMonth: MonthData[]
  bestFreedomMonth: MonthData | null

  netWorthStart: number | null
  netWorthEnd: number | null
  netWorthGrowth: number | null
  netWorthGrowthPct: number | null
  netWorthByMonth: { month: string; value: number }[]

  bestMonth: MonthlyOverview | null
  worstMonth: MonthlyOverview | null
  monthlyOverview: MonthlyOverview[]

  fireStart: FirePoint | null
  fireEnd: FirePoint | null
  fireProgressDelta: number | null

  totalIncome: number
  totalExpenses: number
  totalSaved: number
  savingsRate: number | null
  actionsCompleted: number

  generatedAt: string
}

// ── Helpers ──────────────────────────────────────────────────────
function formatPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}


// ── Canvas Renderer for PNG export ──
function renderYearInReviewToCanvas(data: YearInReviewData): HTMLCanvasElement {
  const W = 840
  const H = 1200
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Colors
  const BG = '#09090b'
  const BG2 = '#18181b'
  const WHITE = '#ffffff'
  const ZINC300 = '#d4d4d8'
  const ZINC400 = '#a1a1aa'
  const ZINC500 = '#71717a'
  const AMBER = '#fbbf24'
  const TEAL = '#2dd4bf'
  const PURPLE = '#c084fc'
  const EMERALD = '#34d399'

  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
  }

  // Background
  roundRect(0, 0, W, H, 32)
  ctx.fillStyle = BG
  ctx.fill()

  // Gradient glow
  const g1 = ctx.createRadialGradient(W - 60, 0, 0, W - 60, 0, 250)
  g1.addColorStop(0, 'rgba(251, 191, 36, 0.12)')
  g1.addColorStop(0.5, 'rgba(45, 212, 191, 0.06)')
  g1.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g1
  ctx.fillRect(0, 0, W, H)

  const g2 = ctx.createRadialGradient(60, H, 0, 60, H, 250)
  g2.addColorStop(0, 'rgba(168, 85, 247, 0.10)')
  g2.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g2
  ctx.fillRect(0, 0, W, H)

  const pad = 48
  let y = pad

  // TriFinity branding
  ctx.fillStyle = AMBER
  ctx.beginPath(); ctx.arc(W - pad - 120, y + 10, 5, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = TEAL
  ctx.beginPath(); ctx.arc(W - pad - 104, y + 10, 5, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = PURPLE
  ctx.beginPath(); ctx.arc(W - pad - 88, y + 10, 5, 0, Math.PI * 2); ctx.fill()
  ctx.font = 'bold 18px system-ui, sans-serif'
  ctx.fillStyle = ZINC400
  ctx.textBaseline = 'top'
  ctx.fillText('TriFinity', W - pad - 78, y)

  // Title
  ctx.font = 'bold 16px system-ui, sans-serif'
  ctx.letterSpacing = '3px'
  ctx.fillStyle = ZINC400
  ctx.fillText('JAAROVERZICHT', pad, y)
  ctx.letterSpacing = '0px'

  y += 32
  ctx.font = 'bold 60px system-ui, sans-serif'
  ctx.fillStyle = WHITE
  ctx.fillText(String(data.year), pad, y)
  if (data.displayName) {
    ctx.font = '500 22px system-ui, sans-serif'
    ctx.fillStyle = ZINC300
    const nameWidth = ctx.measureText(data.displayName).width
    ctx.fillText(data.displayName, W - pad - nameWidth, y + 36)
  }

  y += 90

  // Stat cards
  const cw = (W - pad * 2 - 16) / 2
  const ch = 80

  function drawStat(x: number, yy: number, label: string, value: string, color: string) {
    roundRect(x, yy, cw, ch, 16)
    ctx.fillStyle = BG2
    ctx.fill()
    ctx.font = 'bold 14px system-ui, sans-serif'
    ctx.fillStyle = ZINC400
    ctx.fillText(label.toUpperCase(), x + 16, yy + 16)
    ctx.font = 'bold 30px system-ui, sans-serif'
    ctx.fillStyle = color
    ctx.fillText(value, x + 16, yy + 42)
  }

  drawStat(pad, y, 'Vrijheidsdagen gewonnen', `+${data.freedomDaysWon}`, TEAL)
  drawStat(pad + cw + 16, y, 'Acties voltooid', String(data.actionsCompleted), AMBER)
  y += ch + 12

  const nwText = data.netWorthGrowth != null ? formatCurrency(data.netWorthGrowth) : 'N/B'
  drawStat(pad, y, 'Vermogensgroei', nwText, data.netWorthGrowth && data.netWorthGrowth >= 0 ? EMERALD : '#f87171')
  drawStat(pad + cw + 16, y, 'Spaarquote', data.savingsRate != null ? `${data.savingsRate}%` : 'N/B', PURPLE)
  y += ch + 12

  const fireText = data.fireProgressDelta != null ? formatPct(data.fireProgressDelta) : 'N/B'
  drawStat(pad, y, 'FIRE voortgang', fireText, PURPLE)
  y += ch + 32

  // Monthly bar chart for net worth
  if (data.netWorthByMonth.length > 0) {
    ctx.font = 'bold 18px system-ui, sans-serif'
    ctx.fillStyle = WHITE
    ctx.fillText('Vermogensverloop', pad, y)
    y += 28

    const chartW = W - pad * 2
    const chartH = 120
    roundRect(pad, y, chartW, chartH, 12)
    ctx.fillStyle = BG2
    ctx.fill()

    const values = data.netWorthByMonth.map(s => s.value)
    const minVal = Math.min(...values)
    const maxVal = Math.max(...values)
    const range = maxVal - minVal || 1

    ctx.beginPath()
    ctx.strokeStyle = TEAL
    ctx.lineWidth = 3
    for (let i = 0; i < values.length; i++) {
      const x = pad + 16 + (i / (values.length - 1 || 1)) * (chartW - 32)
      const yy = y + chartH - 16 - ((values[i] - minVal) / range) * (chartH - 32)
      if (i === 0) ctx.moveTo(x, yy)
      else ctx.lineTo(x, yy)
    }
    ctx.stroke()

    y += chartH + 24
  }

  // Best/worst months
  if (data.bestMonth || data.worstMonth) {
    ctx.font = 'bold 18px system-ui, sans-serif'
    ctx.fillStyle = WHITE
    ctx.fillText('Beste & slechtste maand', pad, y)
    y += 28

    if (data.bestMonth) {
      roundRect(pad, y, cw, 56, 12)
      ctx.fillStyle = BG2
      ctx.fill()
      ctx.font = '500 14px system-ui, sans-serif'
      ctx.fillStyle = EMERALD
      ctx.fillText(`🏆 ${data.bestMonth.label}`, pad + 16, y + 14)
      ctx.font = 'bold 22px system-ui, sans-serif'
      ctx.fillText(formatCurrency(data.bestMonth.savings), pad + 16, y + 34)
    }

    if (data.worstMonth) {
      roundRect(pad + cw + 16, y, cw, 56, 12)
      ctx.fillStyle = BG2
      ctx.fill()
      ctx.font = '500 14px system-ui, sans-serif'
      ctx.fillStyle = '#f87171'
      ctx.fillText(`📉 ${data.worstMonth.label}`, pad + cw + 32, y + 14)
      ctx.font = 'bold 22px system-ui, sans-serif'
      ctx.fillText(formatCurrency(data.worstMonth.savings), pad + cw + 32, y + 34)
    }

    y += 72
  }

  // Footer
  ctx.strokeStyle = 'rgba(63, 63, 70, 0.5)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(pad, H - 48)
  ctx.lineTo(W - pad, H - 48)
  ctx.stroke()

  ctx.font = '400 14px system-ui, sans-serif'
  ctx.fillStyle = ZINC500
  ctx.fillText('Geld is opgeslagen tijd', pad, H - 28)
  const dateText = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
  const dateW = ctx.measureText(dateText).width
  ctx.fillText(dateText, W - pad - dateW, H - 28)

  return canvas
}

// ── Main Page Component ──────────────────────────────────────────
export default function JaaroverzichtPage() {
  const [data, setData] = useState<YearInReviewData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedYear, setSelectedYear] = useState(() => {
    const now = new Date()
    return now.getMonth() >= 11 ? now.getFullYear() : now.getFullYear() - 1
  })
  const [showShareDialog, setShowShareDialog] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  const generateReport = useCallback(async (year: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/year-in-review?year=${year}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Laden mislukt' }))
        throw new Error(err.error || 'Laden mislukt')
      }
      const result = await res.json()
      setData(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Laden mislukt')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    generateReport(selectedYear)
  }, [selectedYear, generateReport])

  const downloadReport = useCallback(() => {
    if (!data) return
    try {
      const canvas = renderYearInReviewToCanvas(data)
      const link = document.createElement('a')
      link.download = `trifinity-jaaroverzicht-${data.year}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch {
      // Silent fail
    }
  }, [data])

  const getShareContent = useCallback((): ShareContent | null => {
    if (!data) return null
    return {
      title: `Mijn TriFinity Jaaroverzicht ${data.year}`,
      text: `Mijn ${data.year} in cijfers: ${data.freedomDaysWon} vrijheidsdagen gewonnen${data.netWorthGrowthPct != null ? `, vermogen ${formatPct(data.netWorthGrowthPct)}` : ''} #TriFinity`,
      url: typeof window !== 'undefined' ? window.location.origin : '',
      contentType: 'milestone',
      privacyLevel: 'anonymous',
    }
  }, [data])

  const now = new Date()
  const currentYear = now.getFullYear()
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i)

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-white">
      {/* Header */}
      <div className="mx-auto max-w-2xl px-4 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <Link
            href="/identity"
            className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Terug
          </Link>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-kern-400" />
            <div className="h-2 w-2 rounded-full bg-wil-400" />
            <div className="h-2 w-2 rounded-full bg-horizon-400" />
            <span className="ml-1 text-xs font-bold tracking-wider text-zinc-500">TriFinity</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 pb-16" ref={reportRef}>
        {/* Year selector */}
        <div className="mb-8 text-center">
          <p className="mb-2 text-xs font-semibold tracking-[0.2em] text-zinc-500 uppercase">
            Jaaroverzicht
          </p>
          <div className="flex items-center justify-center gap-3">
            {yearOptions.map(y => (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                className={`rounded-xl px-4 py-2 text-lg font-bold transition-all ${
                  selectedYear === y
                    ? 'bg-gradient-to-r from-kern-500/20 via-wil-500/20 to-horizon-500/20 text-white ring-1 ring-wil-500/40'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                }`}
                data-testid={`year-btn-${y}`}
              >
                {y}
              </button>
            ))}
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-wil-400/30 border-t-wil-400" />
            <p className="text-sm text-zinc-400">Jaaroverzicht genereren...</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="mx-auto max-w-md rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
            <p className="text-sm text-red-300">{error}</p>
            <button
              onClick={() => generateReport(selectedYear)}
              className="mt-4 rounded-lg bg-red-500/20 px-4 py-2 text-sm text-red-200 hover:bg-red-500/30 transition-colors"
            >
              Opnieuw proberen
            </button>
          </div>
        )}

        {/* Report content */}
        {data && !loading && (
          <div className="space-y-8" data-testid="year-in-review-report">
            {/* Hero: Year + Name */}
            <div className="text-center">
              <h1 className="mb-1 text-6xl font-bold tracking-tight" data-testid="review-year">
                {data.year}
              </h1>
              {data.displayName && (
                <p className="text-lg text-zinc-400">{data.displayName}</p>
              )}
            </div>

            {/* ═══ Section 1: Freedom Days Won ═══ */}
            <section className="rounded-2xl bg-gradient-to-br from-wil-500/10 to-wil-500/5 p-6 ring-1 ring-wil-500/20" data-testid="section-freedom-days">
              <div className="mb-4 flex items-center gap-2">
                <Target className="h-5 w-5 text-wil-400" />
                <h2 className="text-lg font-bold text-wil-400">Vrijheidsdagen gewonnen</h2>
              </div>

              <div className="mb-4 text-center">
                <p className="text-5xl font-bold text-wil-400" data-testid="freedom-days-total">
                  +{data.freedomDaysWon}
                </p>
                <p className="mt-1 text-sm text-zinc-400">dagen financiele vrijheid verdiend</p>
              </div>

              {/* Monthly bar chart */}
              <div className="flex items-end gap-1.5 h-24">
                {data.freedomDaysByMonth.map((m) => {
                  const maxDays = Math.max(...data.freedomDaysByMonth.map(x => x.days), 1)
                  const height = m.days > 0 ? Math.max(8, (m.days / maxDays) * 100) : 4
                  return (
                    <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className={`w-full rounded-t-md transition-all ${
                          m.days > 0 ? 'bg-wil-400/70' : 'bg-zinc-700/30'
                        }`}
                        style={{ height: `${height}%` }}
                        title={`${m.label}: ${m.days} dagen`}
                      />
                      <span className="text-[9px] text-zinc-500">{m.label}</span>
                    </div>
                  )
                })}
              </div>

              {data.bestFreedomMonth && (
                <p className="mt-3 text-xs text-zinc-400">
                  <Star className="mr-1 inline h-3 w-3 text-kern-400" />
                  Beste maand: <span className="font-semibold text-wil-300">{data.bestFreedomMonth.label}</span> met {data.bestFreedomMonth.days} dagen
                </p>
              )}
            </section>

            {/* ═══ Section 2: Net Worth Growth ═══ */}
            <section className="rounded-2xl bg-gradient-to-br from-kern-500/10 to-kern-500/5 p-6 ring-1 ring-kern-500/20" data-testid="section-net-worth">
              <div className="mb-4 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-kern-400" />
                <h2 className="text-lg font-bold text-kern-400">Vermogensgroei</h2>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-zinc-800/50 p-4">
                  <p className="text-xs text-zinc-500 uppercase">Begin {data.year}</p>
                  <p className="mt-1 text-xl font-bold" data-testid="nw-start">
                    {data.netWorthStart != null ? formatCurrency(data.netWorthStart) : 'N/B'}
                  </p>
                </div>
                <div className="rounded-xl bg-zinc-800/50 p-4">
                  <p className="text-xs text-zinc-500 uppercase">Eind {data.year}</p>
                  <p className="mt-1 text-xl font-bold" data-testid="nw-end">
                    {data.netWorthEnd != null ? formatCurrency(data.netWorthEnd) : 'N/B'}
                  </p>
                </div>
              </div>

              {data.netWorthGrowth != null && (
                <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-zinc-800/30 p-3">
                  {data.netWorthGrowth >= 0 ? (
                    <ArrowUp className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <ArrowDown className="h-5 w-5 text-red-400" />
                  )}
                  <span className={`text-2xl font-bold ${data.netWorthGrowth >= 0 ? 'text-emerald-400' : 'text-red-400'}`} data-testid="nw-growth">
                    {formatCurrency(data.netWorthGrowth)}
                  </span>
                  {data.netWorthGrowthPct != null && (
                    <span className={`text-sm ${data.netWorthGrowthPct >= 0 ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                      ({formatPct(data.netWorthGrowthPct)})
                    </span>
                  )}
                </div>
              )}

              {/* Mini sparkline of net worth by month */}
              {data.netWorthByMonth.length > 1 && (
                <div className="mt-4 h-20">
                  <svg viewBox="0 0 300 60" className="w-full h-full" preserveAspectRatio="none">
                    {(() => {
                      const values = data.netWorthByMonth.map(s => s.value)
                      const min = Math.min(...values)
                      const max = Math.max(...values)
                      const range = max - min || 1
                      const points = values.map((v, i) => {
                        const x = (i / (values.length - 1 || 1)) * 296 + 2
                        const y = 58 - ((v - min) / range) * 54
                        return `${x},${y}`
                      }).join(' ')
                      return (
                        <>
                          <defs>
                            <linearGradient id="nw-grad" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="#fbbf24" />
                              <stop offset="50%" stopColor="#2dd4bf" />
                              <stop offset="100%" stopColor="#c084fc" />
                            </linearGradient>
                          </defs>
                          <polyline
                            points={points}
                            fill="none"
                            stroke="url(#nw-grad)"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </>
                      )
                    })()}
                  </svg>
                </div>
              )}
            </section>

            {/* ═══ Section 4: Best & Worst Months ═══ */}
            <section className="rounded-2xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-6 ring-1 ring-emerald-500/20" data-testid="section-months">
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-emerald-400" />
                <h2 className="text-lg font-bold text-emerald-400">Beste & slechtste maanden</h2>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Best month */}
                <div className="rounded-xl bg-emerald-500/10 p-4 ring-1 ring-emerald-500/20">
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-semibold text-emerald-400">BESTE</span>
                  </div>
                  {data.bestMonth ? (
                    <>
                      <p className="text-sm font-medium text-zinc-200" data-testid="best-month-name">{data.bestMonth.label}</p>
                      <p className="text-xl font-bold text-emerald-400" data-testid="best-month-value">{formatCurrency(data.bestMonth.savings)}</p>
                      <p className="text-[10px] text-zinc-500">gespaard</p>
                    </>
                  ) : (
                    <p className="text-sm text-zinc-500">Geen data</p>
                  )}
                </div>

                {/* Worst month */}
                <div className="rounded-xl bg-red-500/10 p-4 ring-1 ring-red-500/20">
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingDown className="h-4 w-4 text-red-400" />
                    <span className="text-xs font-semibold text-red-400">SLECHTSTE</span>
                  </div>
                  {data.worstMonth ? (
                    <>
                      <p className="text-sm font-medium text-zinc-200" data-testid="worst-month-name">{data.worstMonth.label}</p>
                      <p className="text-xl font-bold text-red-400" data-testid="worst-month-value">{formatCurrency(data.worstMonth.savings)}</p>
                      <p className="text-[10px] text-zinc-500">gespaard</p>
                    </>
                  ) : (
                    <p className="text-sm text-zinc-500">Geen data</p>
                  )}
                </div>
              </div>

              {/* Monthly savings bars */}
              <div className="mt-4">
                <div className="flex items-end gap-1.5 h-20">
                  {data.monthlyOverview.map((m) => {
                    const maxSavings = Math.max(...data.monthlyOverview.map(x => Math.abs(x.savings)), 1)
                    const absHeight = Math.abs(m.savings) / maxSavings * 100
                    const h = m.income === 0 && m.expenses === 0 ? 4 : Math.max(8, absHeight)
                    return (
                      <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                        <div
                          className={`w-full rounded-t-md ${
                            m.savings >= 0 ? 'bg-emerald-400/60' : 'bg-red-400/60'
                          } ${m.income === 0 && m.expenses === 0 ? 'bg-zinc-700/30' : ''}`}
                          style={{ height: `${h}%` }}
                          title={`${m.label}: ${formatCurrency(m.savings)}`}
                        />
                        <span className="text-[9px] text-zinc-500">
                          {m.label.substring(0, 3).toLowerCase()}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Summary row */}
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-zinc-800/40 p-2">
                  <p className="text-[10px] text-zinc-500 uppercase">Inkomen</p>
                  <p className="text-sm font-semibold text-zinc-200" data-testid="total-income">{formatCurrency(data.totalIncome)}</p>
                </div>
                <div className="rounded-lg bg-zinc-800/40 p-2">
                  <p className="text-[10px] text-zinc-500 uppercase">Uitgaven</p>
                  <p className="text-sm font-semibold text-zinc-200" data-testid="total-expenses">{formatCurrency(data.totalExpenses)}</p>
                </div>
                <div className="rounded-lg bg-zinc-800/40 p-2">
                  <p className="text-[10px] text-zinc-500 uppercase">Gespaard</p>
                  <p className={`text-sm font-semibold ${data.totalSaved >= 0 ? 'text-emerald-400' : 'text-red-400'}`} data-testid="total-saved">
                    {formatCurrency(data.totalSaved)}
                  </p>
                </div>
              </div>
            </section>

            {/* ═══ Section 5: FIRE Progress ═══ */}
            <section className="rounded-2xl bg-gradient-to-br from-horizon-500/10 to-horizon-500/5 p-6 ring-1 ring-horizon-500/20" data-testid="section-fire">
              <div className="mb-4 flex items-center gap-2">
                <Flame className="h-5 w-5 text-horizon-400" />
                <h2 className="text-lg font-bold text-horizon-400">FIRE voortgang</h2>
              </div>

              {data.fireStart && data.fireEnd ? (
                <>
                  {/* Progress bars: start vs end */}
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-xs text-zinc-400 mb-1">
                        <span>Begin {data.year}</span>
                        <span className="font-semibold" data-testid="fire-start-pct">{data.fireStart.percentage}%</span>
                      </div>
                      <div className="h-4 w-full overflow-hidden rounded-full bg-zinc-700/50">
                        <div
                          className="h-full rounded-full bg-horizon-500/50 transition-all"
                          style={{ width: `${Math.min(data.fireStart.percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-zinc-400 mb-1">
                        <span>Eind {data.year}</span>
                        <span className="font-semibold" data-testid="fire-end-pct">{data.fireEnd.percentage}%</span>
                      </div>
                      <div className="h-4 w-full overflow-hidden rounded-full bg-zinc-700/50">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-horizon-500 to-wil-400 transition-all"
                          style={{ width: `${Math.min(data.fireEnd.percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {data.fireProgressDelta != null && (
                    <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-horizon-500/10 p-3">
                      <Flame className="h-5 w-5 text-horizon-400" />
                      <span className="text-xl font-bold text-horizon-400" data-testid="fire-delta">
                        {formatPct(data.fireProgressDelta)}
                      </span>
                      <span className="text-sm text-zinc-400">FIRE voortgang</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-6 text-center">
                  <Flame className="mx-auto h-8 w-8 text-zinc-600" />
                  <p className="mt-2 text-sm text-zinc-500">
                    Niet genoeg data voor FIRE berekening
                  </p>
                  <p className="text-xs text-zinc-600">
                    Voeg maandelijkse snapshots toe voor volgend jaar
                  </p>
                </div>
              )}
            </section>

            {/* ═══ Summary Stats ═══ */}
            <section className="rounded-2xl bg-gradient-to-br from-zinc-800/50 to-zinc-800/30 p-6 ring-1 ring-zinc-700/50" data-testid="section-summary">
              <div className="mb-4 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-zinc-300" />
                <h2 className="text-lg font-bold text-zinc-300">Samenvatting</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-3 rounded-xl bg-zinc-800/50 p-3">
                  <Clock className="h-5 w-5 text-wil-400 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase">Vrijheidsdagen</p>
                    <p className="text-lg font-bold text-wil-400">+{data.freedomDaysWon}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-zinc-800/50 p-3">
                  <Target className="h-5 w-5 text-kern-400 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase">Acties</p>
                    <p className="text-lg font-bold text-kern-400">{data.actionsCompleted}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-zinc-800/50 p-3">
                  <PiggyBank className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase">Spaarquote</p>
                    <p className="text-lg font-bold text-emerald-400">
                      {data.savingsRate != null ? `${data.savingsRate}%` : 'N/B'}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* ═══ Share / Download Actions ═══ */}
            <div className="flex gap-3" data-testid="share-actions">
              <button
                onClick={downloadReport}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:border-zinc-600"
                data-testid="download-btn"
              >
                <Download className="h-4 w-4" />
                Download afbeelding
              </button>
              <button
                onClick={() => setShowShareDialog(true)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-wil-500 to-horizon-500 px-4 py-3 text-sm font-medium text-white transition-all hover:shadow-lg hover:shadow-wil-500/20"
                data-testid="share-btn"
              >
                <Share2 className="h-4 w-4" />
                Delen
              </button>
            </div>

            {/* ═══ Footer ═══ */}
            <div className="border-t border-zinc-800 pt-4 text-center">
              <p className="text-xs text-zinc-600">
                Geld is opgeslagen tijd — TriFinity Jaaroverzicht {data.year}
              </p>
              <p className="mt-1 text-[10px] text-zinc-700">
                Gegenereerd op {new Date(data.generatedAt).toLocaleDateString('nl-NL', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              </p>
            </div>

            {/* Share Dialog */}
            {showShareDialog && (
              <ShareDialog
                open={showShareDialog}
                onClose={() => setShowShareDialog(false)}
                content={getShareContent()!}
                captureRef={reportRef}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
