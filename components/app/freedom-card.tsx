'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Download, Share2, Shield, Clock, Target, TrendingUp, AlertTriangle } from 'lucide-react'
import { ShareDialog, type ShareContent } from '@/components/app/share-dialog'

export interface FreedomCardData {
  privacyLevel: 'anonymous' | 'named' | 'full'
  freedomPercentage: number | null
  freedomDaysWon: number
  freedomDaysWonThisMonth?: number
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

/**
 * Render the Freedom Card to a Canvas element for reliable PNG download.
 * This draws the card programmatically instead of using unreliable SVG foreignObject.
 *
 * Exported so andere surfaces (zoals de wekelijkse briefing-header) dezelfde
 * deel-kaart kunnen genereren via ShareDialog's `renderCanvas`-prop. Importeer
 * dynamisch om de canvas-tekencode buiten hun initiële bundle te houden.
 */
export function renderFreedomCardToCanvas(data: FreedomCardData): HTMLCanvasElement {
  const W = 840   // 420px * 2x retina
  const H = 580   // card height
  const S = 2     // scale factor

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Colors
  const BG_DARK = '#18181b'    // zinc-900
  const BG_MID = '#27272a'     // zinc-800
  const TEXT_WHITE = '#ffffff'
  const TEXT_ZINC_300 = '#d4d4d8'
  const TEXT_ZINC_400 = '#a1a1aa'
  const TEXT_ZINC_500 = '#71717a'
  const AMBER_400 = '#fbbf24'
  const TEAL_400 = '#2dd4bf'
  const PURPLE_400 = '#c084fc'
  const PURPLE_500 = '#a855f7'
  const EMERALD_400 = '#34d399'
  const PROGRESS_BG = '#3f3f4680'

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, W, H)
  bgGrad.addColorStop(0, BG_DARK)
  bgGrad.addColorStop(0.5, BG_MID)
  bgGrad.addColorStop(1, BG_DARK)

  // Rounded rect helper
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

  // Main card background
  roundRect(0, 0, W, H, 0)
  ctx.fillStyle = bgGrad
  ctx.fill()

  // Background glow effects
  const glow1 = ctx.createRadialGradient(W - 60, 0, 0, W - 60, 0, 200)
  glow1.addColorStop(0, 'rgba(251, 191, 36, 0.15)')
  glow1.addColorStop(0.5, 'rgba(45, 212, 191, 0.08)')
  glow1.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow1
  ctx.fillRect(0, 0, W, H)

  const glow2 = ctx.createRadialGradient(60, H, 0, 60, H, 200)
  glow2.addColorStop(0, 'rgba(168, 85, 247, 0.12)')
  glow2.addColorStop(0.5, 'rgba(45, 212, 191, 0.06)')
  glow2.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow2
  ctx.fillRect(0, 0, W, H)

  const pad = 48
  let y = pad

  // ── Header ──
  ctx.font = 'bold 20px system-ui, -apple-system, sans-serif'
  ctx.letterSpacing = '3px'
  ctx.fillStyle = TEXT_ZINC_400
  ctx.textBaseline = 'top'
  ctx.fillText('MIJN VRIJHEIDSKAART', pad, y)
  ctx.letterSpacing = '0px'

  // Display name (named/full privacy)
  if (data.displayName) {
    ctx.font = '500 24px system-ui, -apple-system, sans-serif'
    ctx.fillStyle = TEXT_ZINC_300
    ctx.fillText(data.displayName, pad, y + 28)
  }

  // TriFinity branding (right side)
  const brandX = W - pad - 150
  const dotSize = 10
  const dotGap = 16
  ctx.fillStyle = AMBER_400
  ctx.beginPath(); ctx.arc(brandX, y + 10, dotSize / 2, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = TEAL_400
  ctx.beginPath(); ctx.arc(brandX + dotGap, y + 10, dotSize / 2, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = PURPLE_400
  ctx.beginPath(); ctx.arc(brandX + dotGap * 2, y + 10, dotSize / 2, 0, Math.PI * 2); ctx.fill()
  ctx.font = 'bold 20px system-ui, -apple-system, sans-serif'
  ctx.letterSpacing = '2px'
  ctx.fillStyle = TEXT_ZINC_400
  ctx.fillText('TriFinity', brandX + dotGap * 3 + 8, y)
  ctx.letterSpacing = '0px'

  y += data.displayName ? 80 : 56

  // ── Main metric: Freedom percentage ──
  const hasFreedomPct = data.freedomPercentage != null
  const pctValue = hasFreedomPct ? data.freedomPercentage! : 0
  ctx.font = 'bold 80px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = TEXT_WHITE
  const pctText = hasFreedomPct ? `${pctValue.toFixed(1)}%` : 'N/B'
  ctx.fillText(pctText, pad, y)
  const pctWidth = ctx.measureText(pctText).width
  ctx.font = '400 24px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = TEXT_ZINC_400
  ctx.fillText('financiele vrijheid', pad + pctWidth + 12, y + 52)
  y += 100

  // Progress bar
  const barW = W - pad * 2
  const barH = 16
  roundRect(pad, y, barW, barH, 0)
  ctx.fillStyle = PROGRESS_BG
  ctx.fill()

  if (hasFreedomPct && pctValue > 0) {
    const fillW = Math.max(16, barW * Math.min(pctValue, 100) / 100)
    const progGrad = ctx.createLinearGradient(pad, y, pad + fillW, y)
    progGrad.addColorStop(0, AMBER_400)
    progGrad.addColorStop(0.5, TEAL_400)
    progGrad.addColorStop(1, PURPLE_500)
    roundRect(pad, y, fillW, barH, 0)
    ctx.fillStyle = progGrad
    ctx.fill()
  }

  // EUR amounts for full privacy only
  if (data.privacyLevel === 'full' && data.netWorth != null && data.fireTarget != null && data.fireTarget > 0) {
    y += barH + 8
    ctx.font = '400 18px system-ui, -apple-system, sans-serif'
    ctx.fillStyle = TEXT_ZINC_500
    ctx.fillText(
      `€${Math.round(data.netWorth).toLocaleString('nl-NL')} / €${Math.round(data.fireTarget).toLocaleString('nl-NL')}`,
      pad, y
    )
    y += 28
  } else if (!hasFreedomPct) {
    y += barH + 8
    ctx.font = '400 18px system-ui, -apple-system, sans-serif'
    ctx.fillStyle = TEXT_ZINC_500
    ctx.fillText('Voeg transacties toe om je vrijheidspercentage te berekenen', pad, y)
    y += 28
  } else {
    y += barH + 24
  }

  y += 16

  // ── Stats grid (2x2) ──
  const cardW = (W - pad * 2 - 16) / 2
  const cardH = 80
  const statsY = y

  // Helper to draw stat card
  function drawStatCard(x: number, y: number, label: string, value: string, color: string) {
    roundRect(x, y, cardW, cardH, 0)
    ctx.fillStyle = 'rgba(39, 39, 42, 0.8)'
    ctx.fill()

    // Label
    ctx.font = 'bold 16px system-ui, -apple-system, sans-serif'
    ctx.letterSpacing = '0.5px'
    ctx.fillStyle = TEXT_ZINC_400
    ctx.textBaseline = 'top'
    ctx.fillText(label.toUpperCase(), x + 16, y + 14)
    ctx.letterSpacing = '0px'

    // Value
    ctx.font = 'bold 34px system-ui, -apple-system, sans-serif'
    ctx.fillStyle = color
    ctx.fillText(value, x + 16, y + 38)
  }

  // Compute display values
  const daysWon = data.freedomDaysWonThisMonth ?? data.freedomDaysWon
  const daysText = daysWon > 0 ? `+${daysWon}` : '0'

  const countdownLabel = data.fireCountdown?.label || ''
  const countdownText = countdownLabel === 'Bereikt!'
    ? 'Bereikt!'
    : countdownLabel === 'Niet haalbaar'
      ? 'Niet haalbaar'
      : countdownLabel === 'Nog geen data'
        ? 'N/B'
        : (data.fireCountdown?.years ?? 0) > 0
          ? `${data.fireCountdown.years}j ${data.fireCountdown.months}mnd`
          : (data.fireCountdown?.months ?? 0) > 0
            ? `${data.fireCountdown.months} mnd`
            : countdownLabel === '' ? 'N/B' : '-'

  const fY = data.freedomTime?.years ?? 0
  const fM = data.freedomTime?.months ?? 0
  const freedomTimeText = fY > 0
    ? `${fY}j ${fM}mnd`
    : fM > 0 ? `${fM} mnd` : (hasFreedomPct ? '0 mnd' : 'N/B')

  const savingsRateText = data.savingsRate != null
    ? (data.savingsRate > 0 ? `${data.savingsRate.toFixed(0)}%` : '0%')
    : 'N/B'

  // Draw 4 stat cards
  drawStatCard(pad, statsY, 'Dagen deze maand', daysText, TEAL_400)
  drawStatCard(pad + cardW + 16, statsY, 'FIRE countdown', countdownText, PURPLE_400)
  drawStatCard(pad, statsY + cardH + 12, 'Vrijheidstijd', freedomTimeText, AMBER_400)
  drawStatCard(pad + cardW + 16, statsY + cardH + 12, 'Spaarquote', savingsRateText, EMERALD_400)

  y = statsY + cardH * 2 + 12 + 32

  // ── Footer ──
  ctx.strokeStyle = 'rgba(63, 63, 70, 0.5)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(pad, y)
  ctx.lineTo(W - pad, y)
  ctx.stroke()
  y += 16

  ctx.font = '400 16px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = TEXT_ZINC_500
  ctx.fillText('Geld is opgeslagen tijd', pad, y)

  const dateText = new Date(data.generatedAt).toLocaleDateString('nl-NL', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
  const dateWidth = ctx.measureText(dateText).width
  ctx.fillText(dateText, W - pad - dateWidth, y)

  return canvas
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
  const { fireCountdown, freedomTime, freedomPercentage, freedomDaysWon, freedomDaysWonThisMonth, savingsRate, privacyLevel, displayName, netWorth, fireTarget } = data
  // Use this-month days if available, otherwise fall back to all-time
  const daysWonDisplay = freedomDaysWonThisMonth ?? freedomDaysWon

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
      className="relative mx-auto w-full max-w-[420px] overflow-hidden rounded-[var(--r-lg)] bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 p-6 text-white shadow-2xl"
      id="freedom-card"
    >
      {/* Background decorations */}
      <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-gradient-to-br from-kern-500/20 to-wil-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-gradient-to-br from-horizon-500/20 to-wil-500/20 blur-3xl" />

      {/* Header */}
      <div className="relative mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-[var(--ink-3)] uppercase">
            Mijn Vrijheidskaart
          </p>
          {displayName && (
            <p className="mt-0.5 text-sm font-medium text-[var(--ink-4)]">{displayName}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-kern-400" />
          <div className="h-2 w-2 rounded-full bg-wil-400" />
          <div className="h-2 w-2 rounded-full bg-horizon-400" />
          <span className="ml-1 text-xs font-bold tracking-wider text-[var(--ink-3)]">
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
          <span className="mb-1 text-sm text-[var(--ink-3)]">financiele vrijheid</span>
        </div>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-zinc-700/60">
          <div
            className="h-full rounded-full bg-gradient-to-r from-kern-400 via-wil-400 to-horizon-500 transition-all duration-1000"
            style={{ width: `${hasFreedomPct ? Math.min(freedomPctDisplay, 100) : 0}%` }}
          />
        </div>
        {privacyLevel === 'full' && netWorth != null && fireTarget != null && fireTarget > 0 && (
          <p className="mt-1.5 text-xs text-[var(--ink-3)]">
            {formatCurrencyNL(netWorth)} / {formatCurrencyNL(fireTarget)}
          </p>
        )}
        {!hasFreedomPct && (
          <p className="mt-1.5 text-xs text-[var(--ink-3)]">
            Voeg transacties toe om je vrijheidspercentage te berekenen
          </p>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Days won this month */}
        <div className="rounded-[var(--r-lg)] bg-zinc-800/80 p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-wil-400" />
            <span className="text-[10px] font-medium text-[var(--ink-3)] uppercase">Dagen deze maand</span>
          </div>
          <p className="text-xl font-bold text-wil-400">
            {daysWonDisplay > 0 ? `+${daysWonDisplay}` : '0'}
          </p>
        </div>

        {/* FIRE countdown */}
        <div className="rounded-[var(--r-lg)] bg-zinc-800/80 p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-horizon-400" />
            <span className="text-[10px] font-medium text-[var(--ink-3)] uppercase">FIRE countdown</span>
          </div>
          <p className="text-xl font-bold text-horizon-400">
            {countdownText}
          </p>
        </div>

        {/* Freedom time */}
        <div className="rounded-[var(--r-lg)] bg-zinc-800/80 p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-kern-400" />
            <span className="text-[10px] font-medium text-[var(--ink-3)] uppercase">Vrijheidstijd</span>
          </div>
          <p className="text-xl font-bold text-kern-400">
            {freedomTimeText}
          </p>
        </div>

        {/* Savings rate */}
        <div className="rounded-[var(--r-lg)] bg-zinc-800/80 p-3">
          <div className="mb-1 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-[10px] font-medium text-[var(--ink-3)] uppercase">Spaarquote</span>
          </div>
          <p className="text-xl font-bold text-emerald-400">
            {savingsRateDisplay}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-5 flex items-center justify-between border-t border-zinc-700/50 pt-3">
        <p className="text-[10px] text-[var(--ink-3)]">
          Geld is opgeslagen tijd
        </p>
        <p className="text-[10px] text-[var(--ink-3)]">
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

const PRIVACY_STORAGE_KEY = 'trifinity_privacy_level'

function getStoredPrivacyLevel(): PrivacyLevel {
  try {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(PRIVACY_STORAGE_KEY)
      if (stored === 'anonymous' || stored === 'named' || stored === 'full') {
        return stored
      }
    }
  } catch {
    // localStorage not available
  }
  return 'anonymous'
}

function storePrivacyLevel(level: PrivacyLevel): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(PRIVACY_STORAGE_KEY, level)
    }
  } catch {
    // localStorage not available
  }
}

export { PRIVACY_STORAGE_KEY }

export function FreedomCardGenerator() {
  const [privacyLevel, setPrivacyLevel] = useState<PrivacyLevel>('anonymous')
  const [cardData, setCardData] = useState<FreedomCardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFullOptIn, setShowFullOptIn] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  // Load stored privacy preference on mount
  useEffect(() => {
    const stored = getStoredPrivacyLevel()
    setPrivacyLevel(stored)
  }, [])

  // Handle privacy level change with Full mode opt-in confirmation
  const handlePrivacyChange = useCallback((newLevel: PrivacyLevel) => {
    if (newLevel === 'full') {
      // Show opt-in confirmation for Full mode
      setShowFullOptIn(true)
    } else {
      setPrivacyLevel(newLevel)
      storePrivacyLevel(newLevel)
      setCardData(null)
    }
  }, [])

  // Confirm Full mode opt-in
  const confirmFullOptIn = useCallback(() => {
    setPrivacyLevel('full')
    storePrivacyLevel('full')
    setShowFullOptIn(false)
    setCardData(null)
  }, [])

  // Cancel Full mode opt-in
  const cancelFullOptIn = useCallback(() => {
    setShowFullOptIn(false)
  }, [])

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
    if (!cardData) return

    try {
      const canvas = renderFreedomCardToCanvas(cardData)
      const link = document.createElement('a')
      link.download = `trifinity-vrijheidskaart-${new Date().toISOString().split('T')[0]}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch {
      // Silent fail for download
    }
  }, [cardData])

  // Build share content for the ShareDialog
  const getShareContent = useCallback((): ShareContent | null => {
    if (!cardData) return null

    const freedomPctText = cardData.freedomPercentage != null ? `${cardData.freedomPercentage}%` : 'N/B'
    const countdownLabelText = cardData.fireCountdown?.label || 'N/B'
    const daysWon = cardData.freedomDaysWonThisMonth ?? cardData.freedomDaysWon

    return {
      title: 'Mijn TriFinity Vrijheidskaart',
      text: `Mijn financiele vrijheid: ${freedomPctText} | ${daysWon} vrijheidsdagen gewonnen | FIRE countdown: ${countdownLabelText} #TriFinity`,
      url: typeof window !== 'undefined' ? window.location.origin : '',
      contentType: 'freedom_card',
      privacyLevel: cardData.privacyLevel,
    }
  }, [cardData])

  const handleOpenShareDialog = useCallback(() => {
    if (!cardData) return
    setShowShareDialog(true)
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
      <div data-testid="privacy-level-selector">
        <h3 className="mb-3 text-sm font-semibold text-[var(--ink-2)]">Privacy niveau</h3>
        <div className="grid grid-cols-3 gap-2">
          {privacyOptions.map((opt) => (
            <button
              key={opt.value}
              data-testid={`privacy-option-${opt.value}`}
              onClick={() => handlePrivacyChange(opt.value)}
              className={`rounded-[var(--r-lg)] border p-3 text-left transition-all ${
                privacyLevel === opt.value
                  ? 'border-wil-500 bg-wil-50 ring-1 ring-wil-500'
                  : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)]'
              }`}
            >
              <p className={`text-sm font-medium ${
                privacyLevel === opt.value ? 'text-wil-700' : 'text-[var(--ink-2)]'
              }`}>
                {opt.label}
              </p>
              <p className="mt-0.5 text-xs text-[var(--ink-3)]">{opt.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Full mode opt-in confirmation dialog */}
      {showFullOptIn && (
        <div
          data-testid="full-optin-dialog"
          className="rounded-[var(--r-lg)] border border-amber-300 bg-amber-50 p-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900">
                Bedragen zichtbaar maken?
              </p>
              <p className="mt-1 text-xs text-amber-700">
                In de volledige modus worden je netto vermogen en FIRE-doelbedrag
                zichtbaar op de kaart. Weet je zeker dat je dit wilt delen?
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  data-testid="full-optin-confirm"
                  onClick={confirmFullOptIn}
                  className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
                >
                  Ja, bedragen tonen
                </button>
                <button
                  data-testid="full-optin-cancel"
                  onClick={cancelFullOptIn}
                  className="rounded-lg border border-amber-300 bg-[var(--paper)] px-4 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-50"
                >
                  Annuleren
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={generateCard}
        disabled={loading}
        className="w-full rounded-[var(--r-lg)] bg-gradient-to-r from-kern-500 via-wil-500 to-horizon-500 px-6 py-3 font-semibold text-white shadow-[var(--s2)] transition-all hover:shadow-xl disabled:opacity-50"
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
              className="flex flex-1 items-center justify-center gap-2 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-2.5 text-sm font-medium text-[var(--ink-2)] transition-all hover:bg-[var(--subtle)]"
              data-testid="freedom-card-download"
            >
              <Download className="h-4 w-4" />
              Download
            </button>
            <button
              onClick={handleOpenShareDialog}
              className="flex flex-1 items-center justify-center gap-2 rounded-[var(--r-lg)] bg-gradient-to-r from-wil-500 to-horizon-500 px-4 py-2.5 text-sm font-medium text-white transition-all hover:shadow-[var(--s2)]"
              data-testid="freedom-card-share"
            >
              <Share2 className="h-4 w-4" />
              Delen
            </button>
          </div>
        </div>
      )}

      {/* Share Dialog */}
      {cardData && (
        <ShareDialog
          open={showShareDialog}
          onClose={() => setShowShareDialog(false)}
          content={getShareContent()!}
          captureRef={cardRef}
        />
      )}
    </div>
  )
}

export { FreedomCardVisual }
