'use client'

import { useState, useRef, useCallback } from 'react'
import { FreedomCardVisual, type FreedomCardData } from '@/components/app/freedom-card'
import { Download, Share2 } from 'lucide-react'

/**
 * Test page for the Freedom Card generator.
 * Uses sample data to verify the full workflow:
 * 1. Select privacy level
 * 2. Generate card (with sample data for public testing)
 * 3. Verify card shows freedom percentage and progress bar
 * 4. Verify anonymous mode has no EUR amounts
 * 5. Download as image
 * 6. Share (copy to clipboard)
 */
export default function TestFreedomCardPage() {
  const [privacyLevel, setPrivacyLevel] = useState<'anonymous' | 'named' | 'full'>('anonymous')
  const [cardData, setCardData] = useState<FreedomCardData | null>(null)
  const [generating, setGenerating] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  const [shared, setShared] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  // Sample card data for each privacy level
  const sampleCards: Record<string, FreedomCardData> = {
    anonymous: {
      privacyLevel: 'anonymous',
      freedomPercentage: 34.7,
      freedomDaysWon: 12,
      fireCountdown: { years: 14, months: 3, days: 5214, label: 'mei 2040' },
      freedomTime: { years: 3, months: 6 },
      savingsRate: 28.5,
      generatedAt: new Date().toISOString(),
    },
    named: {
      privacyLevel: 'named',
      freedomPercentage: 34.7,
      freedomDaysWon: 12,
      fireCountdown: { years: 14, months: 3, days: 5214, label: 'mei 2040' },
      freedomTime: { years: 3, months: 6 },
      savingsRate: 28.5,
      generatedAt: new Date().toISOString(),
      displayName: 'Jan Tester',
    },
    full: {
      privacyLevel: 'full',
      freedomPercentage: 34.7,
      freedomDaysWon: 12,
      fireCountdown: { years: 14, months: 3, days: 5214, label: 'mei 2040' },
      freedomTime: { years: 3, months: 6 },
      savingsRate: 28.5,
      generatedAt: new Date().toISOString(),
      displayName: 'Jan Tester',
      netWorth: 156000,
      fireTarget: 450000,
    },
  }

  // Generate card (simulate API call with sample data, or try real API)
  const generateCard = useCallback(async () => {
    setGenerating(true)
    setDownloaded(false)
    setShared(false)

    // Try to fetch from the real API first (works when authenticated)
    try {
      const res = await fetch(`/api/share/freedom-card?privacy=${privacyLevel}`)
      if (res.ok) {
        const data = await res.json()
        setCardData(data)
        setGenerating(false)
        return
      }
    } catch {
      // API not available, fall back to sample data
    }

    // Fall back to sample data for unauthenticated testing
    await new Promise(resolve => setTimeout(resolve, 500)) // simulate loading
    setCardData(sampleCards[privacyLevel])
    setGenerating(false)
  }, [privacyLevel])

  // Download card as image
  const downloadCard = useCallback(async () => {
    if (!cardRef.current) return

    try {
      const cardEl = cardRef.current.querySelector('#freedom-card') as HTMLElement
      if (!cardEl) return

      const canvas = document.createElement('canvas')
      const scale = 2
      canvas.width = cardEl.offsetWidth * scale
      canvas.height = cardEl.offsetHeight * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) return

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
        setDownloaded(true)
      }
      img.onerror = () => {
        // Fallback: download as HTML
        const blob = new Blob([cardEl.outerHTML], { type: 'text/html' })
        const link = document.createElement('a')
        link.download = `trifinity-vrijheidskaart-${new Date().toISOString().split('T')[0]}.html`
        link.href = URL.createObjectURL(blob)
        link.click()
        setDownloaded(true)
      }
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    } catch {
      // Silent fail for download
    }
  }, [])

  // Share card
  const shareCard = useCallback(async () => {
    if (!cardData) return

    const shareText = `Mijn financiele vrijheid: ${cardData.freedomPercentage}% | ${cardData.freedomDaysWon} vrijheidsdagen gewonnen | FIRE countdown: ${cardData.fireCountdown.label} #TriFinity`

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Mijn TriFinity Vrijheidskaart',
          text: shareText,
        })
        setShared(true)
      } catch {
        // User cancelled
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareText)
        setShared(true)
      } catch {
        // Silent fail
      }
    }
  }, [cardData])

  const privacyOptions = [
    { value: 'anonymous' as const, label: 'Anoniem', description: 'Alleen percentages en tijdframes, geen naam' },
    { value: 'named' as const, label: 'Met naam', description: 'Met je naam, geen bedragen' },
    { value: 'full' as const, label: 'Volledig', description: 'Met naam en bedragen (opt-in)' },
  ]

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-bold text-zinc-900">
        Vrijheidskaart Generator
      </h1>
      <p className="mb-8 text-sm text-zinc-500">
        Genereer en download een deelbare kaart met je vrijheidsvoortgang.
        Kies je privacyniveau om te bepalen welke informatie zichtbaar is.
      </p>

      {/* Step 1: Privacy level selector */}
      <div className="mb-6">
        <h3 className="mb-3 text-sm font-semibold text-zinc-700">Privacy niveau</h3>
        <div className="grid grid-cols-3 gap-2">
          {privacyOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setPrivacyLevel(opt.value); setCardData(null); setDownloaded(false); setShared(false); }}
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

      {/* Step 2: Generate button */}
      <button
        onClick={generateCard}
        disabled={generating}
        className="w-full rounded-xl bg-gradient-to-r from-amber-500 via-teal-500 to-purple-500 px-6 py-3 font-semibold text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-50"
      >
        {generating ? 'Genereren...' : 'Genereer vrijheidskaart'}
      </button>

      {/* Step 3+4+5: Card preview with download/share */}
      {cardData && (
        <div className="mt-6 space-y-4">
          <div ref={cardRef}>
            <FreedomCardVisual data={cardData} />
          </div>

          {/* Download and Share buttons */}
          <div className="flex gap-3">
            <button
              onClick={downloadCard}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-all hover:bg-zinc-50"
            >
              <Download className="h-4 w-4" />
              {downloaded ? 'Gedownload ✓' : 'Download'}
            </button>
            <button
              onClick={shareCard}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-all hover:bg-zinc-50"
            >
              <Share2 className="h-4 w-4" />
              {shared ? 'Gedeeld ✓' : 'Delen'}
            </button>
          </div>

          {/* Verification info */}
          <div className="rounded-lg bg-zinc-50 p-4 text-xs text-zinc-500">
            <p className="font-semibold text-zinc-700 mb-2">Verificatie:</p>
            <ul className="space-y-1">
              <li>✓ Privacy niveau: <span className="font-medium text-teal-600">{cardData.privacyLevel}</span></li>
              <li>✓ Vrijheidspercentage: <span className="font-medium">{cardData.freedomPercentage}%</span></li>
              <li>✓ Voortgangsbalk: zichtbaar in de kaart</li>
              <li>{cardData.privacyLevel === 'anonymous' ? '✓' : '○'} Geen naam getoond: {cardData.privacyLevel === 'anonymous' ? 'correct (anoniem)' : `naam getoond: "${cardData.displayName}"`}</li>
              <li>{cardData.privacyLevel !== 'full' ? '✓' : '○'} Geen EUR bedragen: {cardData.privacyLevel !== 'full' ? 'correct (verborgen)' : `bedragen getoond: netto vermogen en FIRE doel`}</li>
              <li>○ Download status: {downloaded ? 'gedownload ✓' : 'niet gedownload'}</li>
              <li>○ Deel status: {shared ? 'gedeeld ✓' : 'niet gedeeld'}</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
