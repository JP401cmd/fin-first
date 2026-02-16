'use client'

import { useState, useRef, useCallback } from 'react'
import { Download, Share2, Shield, Clock, Target, TrendingUp } from 'lucide-react'

export interface FreedomCardData {
  privacyLevel: 'anonymous' | 'named' | 'full'
  freedomPercentage: number | null
  freedomDaysWon: number
  fireCountdown: {
    years: number
    months: number
    days: number
    label: string
  }
  freedomTime: {
    years: number
    months: number
  }
  savingsRate: number | null
  generatedAt: string
  displayName?: string
  netWorth?: number | null
  fireTarget?: number | null
  dataAvailability?: {
    hasTransactions: boolean
    hasAssets: boolean
    hasDebts: boolean
    hasExpenses: boolean
    canCalculateFire: boolean
  }
}

function formatCurrencyNL(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function FreedomCardVisual({ data }: { data: FreedomCardData }) {
  const { fireCountdown, freedomTime, freedomPercentage, freedomDaysWon, savingsRate, privacyLevel, displayName, netWorth, fireTarget } = data

  // Handle null/missing freedomPercentage gracefully
  const hasFreedomPct = freedomPercentage != null
  const freedomPctDisplay = hasFreedomPct ? freedomPercentage : 0

  // Determine countdown text with graceful fallback for missing data
  const countdownLabel = fireCountdown?.label || ''
  const countdownText = countdownLabel === 'Bereikt!'
    ? 'Bereikt!'
    : countdownLabel === 'Niet haalbaar'
      ? 'Niet haalbaar'
      : countdownLabel === 'Nog geen data'
        ? 'N/B'
        : (fireCountdown?.years ?? 0) > 0
          ? `${fireCountdown.years}j ${fireCountdown.months}mnd`
          : (fireCountdown?.months ?? 0) > 0
            ? `${fireCountdown.months} maanden`
            : countdownLabel === ''
              ? 'N/B'
              : '-'

  // Freedom time with graceful fallback
  const fYears = freedomTime?.years ?? 0
  const fMonths = freedomTime?.months ?? 0
  const freedomTimeText = fYears > 0
    ? `${fYears}j ${fMonths}mnd`
    : fMonths > 0
      ? `${fMonths} maanden`
      : hasFreedomPct ? '0 maanden' : 'N/B'

  // Savings rate with null handling
  const hasSavingsRate = savingsRate != null
  const savingsRateDisplay = hasSavingsRate
    ? (savingsRate > 0 ? `${savingsRate.toFixed(0)}%` : '0%')
    : 'N/B'

  return (
    <div
      className="relative mx-auto w-full max-w-[420px] overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 p-6 text-white shadow-2xl"
      id="freedom-card"
    >
      {/* Background decorations */}
      <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-gradient-to-br from-amber-500/20 to-teal-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-gradient-to-br from-purple-500/20 to-teal-500/20 blur-3xl" />

      {/* Header */}
      <div className="relative mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-zinc-400 uppercase">
            Mijn Vrijheidskaart
          </p>
          {displayName && (
            <p className="mt-0.5 text-sm font-medium text-zinc-300">{displayName}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-amber-400" />
          <div className="h-2 w-2 rounded-full bg-teal-400" />
          <div className="h-2 w-2 rounded-full bg-purple-400" />
          <span className="ml-1 text-xs font-bold tracking-wider text-zinc-400">
            TriFinity
          </span>
        </div>
      </div>

      {/* Main metric: Freedom percentage */}
      <div className="relative mb-6">
        <div className="flex items-end gap-2">
          <span className="text-5xl font-bold tracking-tight">
            {hasFreedomPct ? `${freedomPctDisplay.toFixed(1)}%` : 'N/B'}
          </span>
          <span className="mb-1 text-sm text-zinc-400">financiele vrijheid</span>
        </div>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-zinc-700/60">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 via-teal-400 to-purple-500 transition-all duration-1000"
            style={{ width: `${hasFreedomPct ? Math.min(freedomPctDisplay, 100) : 0}%` }}
          />
        </div>
        {privacyLevel === 'full' && netWorth != null && fireTarget != null && fireTarget > 0 && (
          <p className="mt-1.5 text-xs text-zinc-500">
            {formatCurrencyNL(netWorth)} / {formatCurrencyNL(fireTarget)}
          </p>
        )}
        {!hasFreedomPct && (
          <p className="mt-1.5 text-xs text-zinc-500">
            Voeg transacties toe om je vrijheidspercentage te berekenen
          </p>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Days won */}
        <div className="rounded-xl bg-zinc-800/80 p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-teal-400" />
            <span className="text-[10px] font-medium text-zinc-400 uppercase">Dagen gewonnen</span>
          </div>
          <p className="text-xl font-bold text-teal-400">
            {freedomDaysWon > 0 ? `+${freedomDaysWon}` : '0'}
          </p>
        </div>

        {/* FIRE countdown */}
        <div className="rounded-xl bg-zinc-800/80 p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-purple-400" />
            <span className="text-[10px] font-medium text-zinc-400 uppercase">FIRE countdown</span>
          </div>
          <p className="text-xl font-bold text-purple-400">
            {countdownText}
          </p>
        </div>

        {/* Freedom time */}
        <div className="rounded-xl bg-zinc-800/80 p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[10px] font-medium text-zinc-400 uppercase">Vrijheidstijd</span>
          </div>
          <p className="text-xl font-bold text-amber-400">
            {freedomTimeText}
          </p>
        </div>

        {/* Savings rate */}
        <div className="rounded-xl bg-zinc-800/80 p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-[10px] font-medium text-zinc-400 uppercase">Spaarquote</span>
          </div>
          <p className="text-xl font-bold text-emerald-400">
            {savingsRateDisplay}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-5 flex items-center justify-between border-t border-zinc-700/50 pt-3">
        <p className="text-[10px] text-zinc-500">
          Geld is opgeslagen tijd
        </p>
        <p className="text-[10px] text-zinc-500">
          {new Date(data.generatedAt).toLocaleDateString('nl-NL', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </p>
      </div>
    </div>
  )
}

type PrivacyLevel = 'anonymous' | 'named' | 'full'

export function FreedomCardGenerator() {
  const [privacyLevel, setPrivacyLevel] = useState<PrivacyLevel>('anonymous')
  const [cardData, setCardData] = useState<FreedomCardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const generateCard = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/share/freedom-card?privacy=${privacyLevel}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Genereren mislukt' }))
        throw new Error(err.error || 'Genereren mislukt')
      }
      const data = await res.json()
      setCardData(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Genereren mislukt')
    } finally {
      setLoading(false)
    }
  }, [privacyLevel])

  const downloadCard = useCallback(async () => {
    if (!cardRef.current) return

    try {
      // Use html2canvas if available, otherwise fall back to canvas API
      const cardEl = cardRef.current.querySelector('#freedom-card') as HTMLElement
      if (!cardEl) return

      // Create a canvas rendering of the card
      const canvas = document.createElement('canvas')
      const scale = 2 // 2x for retina
      canvas.width = cardEl.offsetWidth * scale
      canvas.height = cardEl.offsetHeight * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Simple approach: use SVG foreignObject
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${cardEl.offsetWidth}" height="${cardEl.offsetHeight}">
          <foreignObject width="100%" height="100%">
            <div xmlns="http://www.w3.org/1999/xhtml">
              ${cardEl.outerHTML}
            </div>
          </foreignObject>
        </svg>
      `

      const img = new Image()
      img.onload = () => {
        ctx.scale(scale, scale)
        ctx.drawImage(img, 0, 0)
        const link = document.createElement('a')
        link.download = `trifinity-vrijheidskaart-${new Date().toISOString().split('T')[0]}.png`
        link.href = canvas.toDataURL('image/png')
        link.click()
      }
      img.onerror = () => {
        // Fallback: download as HTML
        const blob = new Blob([cardEl.outerHTML], { type: 'text/html' })
        const link = document.createElement('a')
        link.download = `trifinity-vrijheidskaart-${new Date().toISOString().split('T')[0]}.html`
        link.href = URL.createObjectURL(blob)
        link.click()
      }
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    } catch {
      // Silent fail for download
    }
  }, [])

  const shareCard = useCallback(async () => {
    if (!cardData) return

    const freedomPctText = cardData.freedomPercentage != null ? `${cardData.freedomPercentage}%` : 'N/B'
    const countdownLabelText = cardData.fireCountdown?.label || 'N/B'
    const shareText = `Mijn financiele vrijheid: ${freedomPctText} | ${cardData.freedomDaysWon} vrijheidsdagen gewonnen | FIRE countdown: ${countdownLabelText} #TriFinity`

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Mijn TriFinity Vrijheidskaart',
          text: shareText,
        })
      } catch {
        // User cancelled or not supported
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(shareText)
        alert('Gekopieerd naar klembord!')
      } catch {
        // Silent fail
      }
    }
  }, [cardData])

  const privacyOptions: { value: PrivacyLevel; label: string; description: string }[] = [
    {
      value: 'anonymous',
      label: 'Anoniem',
      description: 'Alleen percentages en tijdframes, geen naam',
    },
    {
      value: 'named',
      label: 'Met naam',
      description: 'Met je naam, geen bedragen',
    },
    {
      value: 'full',
      label: 'Volledig',
      description: 'Met naam en bedragen (opt-in)',
    },
  ]

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Privacy level selector */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-zinc-700">Privacy niveau</h3>
        <div className="grid grid-cols-3 gap-2">
          {privacyOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPrivacyLevel(opt.value)}
              className={`rounded-xl border p-3 text-left transition-all ${
                privacyLevel === opt.value
                  ? 'border-teal-500 bg-teal-50 ring-1 ring-teal-500'
                  : 'border-zinc-200 bg-white hover:border-zinc-300'
              }`}
            >
              <p className={`text-sm font-medium ${
                privacyLevel === opt.value ? 'text-teal-700' : 'text-zinc-700'
              }`}>
                {opt.label}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">{opt.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Generate button */}
      <button
        onClick={generateCard}
        disabled={loading}
        className="w-full rounded-xl bg-gradient-to-r from-amber-500 via-teal-500 to-purple-500 px-6 py-3 font-semibold text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-50"
      >
        {loading ? 'Genereren...' : 'Genereer vrijheidskaart'}
      </button>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Card preview */}
      {cardData && (
        <div className="space-y-4">
          <div ref={cardRef}>
            <FreedomCardVisual data={cardData} />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={downloadCard}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-all hover:bg-zinc-50"
            >
              <Download className="h-4 w-4" />
              Download
            </button>
            <button
              onClick={shareCard}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-all hover:bg-zinc-50"
            >
              <Share2 className="h-4 w-4" />
              Delen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export { FreedomCardVisual }
