'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Download, Share2, AlertTriangle } from 'lucide-react'
import { ShareDialog, type ShareContent } from '@/components/app/share-dialog'
import { formatCurrency, formatFreedomTimeString } from '@/lib/format'

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

// ── Gedeelde afgeleide waarden (canvas + on-screen preview delen dezelfde bron) ──

/**
 * Narratieve vrijheidszin voor de Playfair-hoofdkop. Precies één accent-woord
 * (italic, module-accent). De zin wordt gekozen op basis van de aanwezige data
 * zodat de kop altijd de sterkste beschikbare vrijheidsuitkomst draagt.
 */
function buildFreedomNarrative(data: FreedomCardData): { pre: string; accent: string; post: string } {
  const fY = data.freedomTime?.years ?? 0
  const fM = data.freedomTime?.months ?? 0
  const pct = data.freedomPercentage
  const reached = data.fireCountdown?.label === 'Bereikt!'

  if (reached) return { pre: 'Ik bereikte ', accent: 'volledige vrijheid', post: '.' }
  if (fY > 0) return { pre: 'Ik kocht al ', accent: `${fY} jaar`, post: ' vrijheid.' }
  if (fM > 0) return { pre: 'Ik kocht al ', accent: `${fM} ${fM === 1 ? 'maand' : 'maanden'}`, post: ' vrijheid.' }
  if (pct != null && pct > 0) return { pre: 'Ik ben ', accent: `${pct}%`, post: ' onderweg naar vrijheid.' }
  return { pre: 'Mijn reis naar ', accent: 'vrijheid', post: ' begint hier.' }
}

/**
 * Alle getoonde kerncijfers als kant-en-klare strings. Eén bron voor de canvas-
 * renderer én de React-preview, zodat beide identiek zijn. Vrijheidstijd loopt
 * via de canonieke `formatFreedomTimeString` (lib/format) — nooit zelf omrekenen.
 */
function deriveCardStats(data: FreedomCardData) {
  const hasFreedomPct = data.freedomPercentage != null
  const pctText = hasFreedomPct ? `${data.freedomPercentage!.toFixed(1)}%` : 'N.t.b.'
  const pctFill = hasFreedomPct ? Math.max(0, Math.min(100, data.freedomPercentage!)) : 0

  const fY = data.freedomTime?.years ?? 0
  const fM = data.freedomTime?.months ?? 0
  // Bouw een breakdown uit de al berekende vrijheidsjaren/-maanden en laat de
  // canonieke helper de Nederlandse string maken (geen eigen dag/jaar-logica).
  const ftBreakdown = { years: fY, months: fM, days: 0, totalDays: 0, isDeficit: false, isInfinite: false }
  const freedomTimeLong = (fY > 0 || fM > 0)
    ? formatFreedomTimeString(ftBreakdown, 'long')
    : (hasFreedomPct ? '0 dagen' : null)
  const freedomTimeShort = (fY > 0 || fM > 0)
    ? formatFreedomTimeString(ftBreakdown, 'short')
    : (hasFreedomPct ? '0d' : 'N.t.b.')

  const daysWon = data.freedomDaysWonThisMonth ?? data.freedomDaysWon
  const daysWonText = daysWon > 0 ? `+${daysWon} ${daysWon === 1 ? 'dag' : 'dagen'}` : '0 dagen'

  const cl = data.fireCountdown?.label || ''
  const countdownText = cl === 'Bereikt!' ? 'Bereikt'
    : cl === 'Niet haalbaar' ? 'Niet haalbaar'
    : cl === 'Nog geen data' ? 'N.t.b.'
    : (data.fireCountdown?.years ?? 0) > 0 ? `${data.fireCountdown.years}j ${data.fireCountdown.months}m`
    : (data.fireCountdown?.months ?? 0) > 0 ? `${data.fireCountdown.months} mnd`
    : cl === '' ? 'N.t.b.' : '-'

  const savingsText = data.savingsRate != null ? `${data.savingsRate.toFixed(0)}%` : 'N.t.b.'

  return { hasFreedomPct, pctText, pctFill, freedomTimeLong, freedomTimeShort, daysWonText, countdownText, savingsText }
}

/**
 * Render the Freedom Card to a Canvas element for reliable PNG download.
 *
 * Ontwerp: "vol papier" — warm-cream (`--paper`), ondoorzichtig, scherpe hoeken,
 * krant-typografie (Playfair-kop, DM Mono-cijfers, Source Serif-meta) en de door
 * de gebruiker gekozen HORIZON-accentkleur. Geen gradients/glow.
 *
 * ASYNC: web-fonts worden vóór het tekenen geladen (`document.fonts.ready` +
 * gerichte `document.fonts.load`), anders valt canvas terug op een systeem-serif.
 * De aanroepers (share-dialog `renderCanvas`, briefing-panel) awaiten het canvas.
 *
 * Accentkleur-route: de echte kleuren worden op rendermoment uit de al door
 * `ModuleColorProvider` gezette CSS-vars op `document.documentElement` gelezen
 * (`--color-horizon-500/600/700/200`, plus `--paper`/`--ink*`/`--subtle`/
 * `--border-ed`). Canvas kan geen CSS-var lezen én de vars staan in OKLCH, dus
 * elke waarde wordt via een korte probe-`<span>` (`getComputedStyle(...).color`)
 * genormaliseerd naar een `rgb(...)`-string die canvas altijd begrijpt. Zo hoeft
 * de hex niet via `FreedomCardData` doorgegeven te worden en volgt de kaart de
 * `/mijn/uiterlijk`-keuze automatisch. Ontbreekt de accent-var, dan valt de
 * accent terug op de neutrale ink-kleur.
 *
 * Exported zodat andere surfaces (zoals de wekelijkse briefing) dezelfde
 * deel-kaart kunnen genereren via ShareDialog's `renderCanvas`-prop. Importeer
 * dynamisch om de canvas-tekencode buiten hun initiële bundle te houden.
 */
export async function renderFreedomCardToCanvas(data: FreedomCardData): Promise<HTMLCanvasElement> {
  const W = 1080  // social portret 4:5
  const H = 1350
  const P = 88    // editorial marge

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const root = document.documentElement

  // ── Kleuren uit CSS-vars → genormaliseerd naar rgb() via probe-span ──
  const probe = document.createElement('span')
  probe.style.cssText = 'position:absolute;left:-9999px;top:-9999px'
  document.body.appendChild(probe)
  const readColor = (varName: string, fallback: string): string => {
    const raw = getComputedStyle(root).getPropertyValue(varName).trim()
    if (!raw) return fallback
    probe.style.color = 'rgb(0,0,0)'
    probe.style.color = raw
    const resolved = getComputedStyle(probe).color
    return resolved || fallback
  }

  const PAPER = readColor('--paper', '#fbf7ec')
  const INK = readColor('--ink', '#1a1916')
  const INK2 = readColor('--ink-2', '#4a4840')
  const INK3 = readColor('--ink-3', '#888070')
  const INK4 = readColor('--ink-4', '#bbb8b0')
  const SUBTLE = readColor('--subtle', '#f3ead9')
  const BORDER = readColor('--border-ed', '#e3dac8')
  // Accent = HORIZON (vrijheid). Fallback: neutrale ink-accent als de var ontbreekt.
  const hasAccent = getComputedStyle(root).getPropertyValue('--color-horizon-500').trim() !== ''
  const ACCENT = hasAccent ? readColor('--color-horizon-600', INK) : INK
  const ACCENT_BAR = hasAccent ? readColor('--color-horizon-500', INK2) : INK2

  // ── Font-families uit CSS-vars (next/font gehashte namen) + laden ──
  // De next/font-`variable`s staan op <body> (niet op <html>): CSS-vars erven
  // omláág, dus lees ze van document.body, anders krijgen we alleen de fallback-
  // stack en mist canvas de daadwerkelijk geladen (gehashte) font-family.
  const bodyStyle = getComputedStyle(document.body)
  const PLAYFAIR = bodyStyle.getPropertyValue('--font-playfair').trim() || '"Playfair Display", Georgia, serif'
  const MONO = bodyStyle.getPropertyValue('--font-dm-mono').trim() || '"DM Mono", ui-monospace, monospace'
  const SERIF = bodyStyle.getPropertyValue('--font-source-serif').trim() || '"Source Serif 4", Georgia, serif'
  if (typeof document !== 'undefined' && document.fonts) {
    try {
      await document.fonts.ready
      await Promise.allSettled([
        document.fonts.load(`700 64px ${PLAYFAIR}`),
        document.fonts.load(`italic 400 64px ${PLAYFAIR}`),
        document.fonts.load(`500 120px ${MONO}`),
        document.fonts.load(`400 40px ${MONO}`),
        document.fonts.load(`italic 400 30px ${SERIF}`),
      ])
    } catch {
      // Font-load faalt zacht — canvas valt terug op de meegegeven serif/mono-stack.
    }
  }

  ctx.textBaseline = 'top'

  // ── Achtergrond: vol cream papier + subtiele hairline-rand ──
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = BORDER
  ctx.lineWidth = 3
  ctx.strokeRect(1.5, 1.5, W - 3, H - 3)

  const contentW = W - P * 2
  let y = P

  // ── Kicker: module-streep + mono-uppercase ──
  ctx.fillStyle = ACCENT_BAR
  ctx.fillRect(P, y + 9, 56, 5)
  ctx.font = `500 26px ${MONO}`
  ctx.letterSpacing = '4.5px'
  ctx.fillStyle = INK3
  ctx.fillText('MIJN VRIJHEIDSKAART', P + 76, y)
  ctx.letterSpacing = '0px'
  y += 46

  // Naam (named/full)
  if (data.displayName) {
    ctx.font = `italic 400 32px ${SERIF}`
    ctx.fillStyle = INK2
    ctx.fillText(data.displayName, P, y)
    y += 50
  }
  y += 22

  const stats = deriveCardStats(data)

  // ── Hoofdkop: narratieve Playfair-zin met één italic accent-woord ──
  const narrative = buildFreedomNarrative(data)
  type Seg = { text: string; italic: boolean; color: string }
  const words: Seg[] = []
  const pushWords = (text: string, italic: boolean, color: string) => {
    for (const w of text.split(/\s+/).filter(Boolean)) words.push({ text: w, italic, color })
  }
  pushWords(narrative.pre.trim(), false, INK)
  pushWords(narrative.accent.trim(), true, ACCENT)
  const post = narrative.post.trim()
  if (/^[.!?…,]+$/.test(post) && words.length > 0) {
    // Lone leesteken hoort tegen het laatste (accent-)woord aan, niet los erachter.
    words[words.length - 1] = { ...words[words.length - 1], text: words[words.length - 1].text + post }
  } else {
    pushWords(post, false, INK)
  }
  const headSize = 64
  const headLine = 78
  const fontFor = (s: Seg) => `${s.italic ? 'italic ' : ''}${s.italic ? '400' : '700'} ${headSize}px ${PLAYFAIR}`
  {
    let line: Seg[] = []
    const flush = () => {
      let cx = P
      for (const s of line) {
        ctx.font = fontFor(s)
        ctx.fillStyle = s.color
        ctx.fillText(s.text, cx, y)
        cx += ctx.measureText(s.text).width
        ctx.font = fontFor(s)
        cx += ctx.measureText(' ').width
      }
      y += headLine
      line = []
    }
    for (const s of words) {
      const test = [...line, s]
      let width = 0
      for (const t of test) {
        ctx.font = fontFor(t)
        width += ctx.measureText(t.text + ' ').width
      }
      if (width > contentW && line.length > 0) flush()
      line.push(s)
    }
    if (line.length) flush()
  }
  y += 26

  // ── Hoofdcijfer: vrijheids-% (DM Mono, tabular) + voortgangsbalk ──
  ctx.font = `500 118px ${MONO}`
  ctx.fillStyle = INK
  ctx.fillText(stats.pctText, P, y)
  y += 132
  ctx.font = `500 24px ${MONO}`
  ctx.letterSpacing = '2.5px'
  ctx.fillStyle = INK3
  ctx.fillText('VAN JE VOLLEDIGE VRIJHEID', P, y)
  ctx.letterSpacing = '0px'
  y += 44
  // balk: lichte track + accent-vulling (highlight-marker-gevoel)
  const barH = 18
  ctx.fillStyle = SUBTLE
  ctx.fillRect(P, y, contentW, barH)
  if (stats.pctFill > 0) {
    ctx.fillStyle = ACCENT_BAR
    ctx.fillRect(P, y, Math.max(barH, (contentW * stats.pctFill) / 100), barH)
  }
  y += barH + 52

  // ── Netto vermogen (alleen volledige privacy) ──
  if (data.privacyLevel === 'full' && data.netWorth != null) {
    ctx.strokeStyle = BORDER
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(P, y); ctx.lineTo(W - P, y); ctx.stroke()
    y += 28
    ctx.font = `500 24px ${MONO}`
    ctx.letterSpacing = '3px'
    ctx.fillStyle = INK3
    ctx.fillText('NETTO VERMOGEN', P, y)
    ctx.letterSpacing = '0px'
    y += 40
    ctx.font = `500 56px ${MONO}`
    ctx.fillStyle = INK
    ctx.fillText(formatCurrency(data.netWorth), P, y)
    y += 66
    if (stats.freedomTimeLong) {
      ctx.font = `italic 400 30px ${SERIF}`
      ctx.fillStyle = INK3
      ctx.fillText(`${stats.freedomTimeLong} vrijheid`, P, y)
      y += 44
    }
    y += 20
  }

  // ── Kerncijfers: 2×2 figures-strip met hairlines ──
  const cellCells: { kicker: string; value: string }[] = [
    { kicker: 'VRIJHEIDSTIJD', value: stats.freedomTimeShort },
    { kicker: 'DEZE MAAND', value: stats.daysWonText },
    { kicker: 'VOLLEDIGE VRIJHEID', value: stats.countdownText },
    { kicker: 'SPAARQUOTE', value: stats.savingsText },
  ]
  const colW = contentW / 2
  const rowH = 132
  ctx.strokeStyle = BORDER
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(P, y); ctx.lineTo(W - P, y); ctx.stroke()
  const gridTop = y
  // middenscheiding verticaal + horizontaal
  ctx.beginPath(); ctx.moveTo(P + colW, gridTop); ctx.lineTo(P + colW, gridTop + rowH * 2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(P, gridTop + rowH); ctx.lineTo(W - P, gridTop + rowH); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(P, gridTop + rowH * 2); ctx.lineTo(W - P, gridTop + rowH * 2); ctx.stroke()
  cellCells.forEach((cell, i) => {
    const cx = P + (i % 2) * colW + 28
    const cy = gridTop + Math.floor(i / 2) * rowH + 26
    ctx.font = `500 22px ${MONO}`
    ctx.letterSpacing = '2.5px'
    ctx.fillStyle = INK3
    ctx.fillText(cell.kicker, cx, cy)
    ctx.letterSpacing = '0px'
    ctx.font = `500 42px ${MONO}`
    ctx.fillStyle = INK
    ctx.fillText(cell.value, cx, cy + 40)
  })
  y = gridTop + rowH * 2

  // ── Colofon onderaan ──
  const footY = H - P - 30
  ctx.strokeStyle = BORDER
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(P, footY - 22); ctx.lineTo(W - P, footY - 22); ctx.stroke()
  // links: Trifinity ✦ vrijheid (ornament in serif zodat het glyph zeker rendert)
  ctx.font = `500 22px ${MONO}`
  ctx.letterSpacing = '1.5px'
  ctx.fillStyle = INK4
  ctx.fillText('Trifinity', P, footY)
  const tW = ctx.measureText('Trifinity').width
  ctx.letterSpacing = '0px'
  ctx.font = `400 22px ${SERIF}`
  ctx.fillStyle = ACCENT_BAR
  ctx.fillText('  ✦  ', P + tW, footY)
  const oW = ctx.measureText('  ✦  ').width
  ctx.font = `500 22px ${MONO}`
  ctx.letterSpacing = '1.5px'
  ctx.fillStyle = INK4
  ctx.fillText('vrijheid', P + tW + oW, footY)
  ctx.letterSpacing = '0px'
  // rechts: datum
  const dateText = new Date(data.generatedAt).toLocaleDateString('nl-NL', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
  ctx.font = `400 22px ${MONO}`
  ctx.fillStyle = INK4
  const dW = ctx.measureText(dateText).width
  ctx.fillText(dateText, W - P - dW, footY)

  document.body.removeChild(probe)
  return canvas
}

function FreedomCardVisual({ data }: { data: FreedomCardData }) {
  const { privacyLevel, displayName, netWorth } = data
  const stats = deriveCardStats(data)
  const narrative = buildFreedomNarrative(data)

  const cells: { kicker: string; value: string }[] = [
    { kicker: 'Vrijheidstijd', value: stats.freedomTimeShort },
    { kicker: 'Deze maand', value: stats.daysWonText },
    { kicker: 'Volledige vrijheid', value: stats.countdownText },
    { kicker: 'Spaarquote', value: stats.savingsText },
  ]

  const dateText = new Date(data.generatedAt).toLocaleDateString('nl-NL', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <div
      className="relative mx-auto w-full max-w-[440px] overflow-hidden border border-[var(--border-ed)] bg-[var(--paper)] p-8 text-[var(--ink)]"
      id="freedom-card"
    >
      {/* Kicker */}
      <div className="flex items-center gap-3">
        <span aria-hidden className="inline-block h-[2px] w-7 shrink-0 bg-horizon-500" />
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
          Mijn vrijheidskaart
        </span>
      </div>
      {displayName && (
        <p className="mt-2 font-serif text-lg italic text-[var(--ink-2)]">{displayName}</p>
      )}

      {/* Narratieve Playfair-hoofdkop met één italic accent-woord */}
      <h2 className="mt-5 font-display text-[30px] font-bold leading-tight tracking-[-0.02em] text-[var(--ink)]">
        {narrative.pre}
        <em className="font-normal italic text-horizon-700">{narrative.accent}</em>
        {narrative.post}
      </h2>

      {/* Hoofdcijfer: vrijheids-% + voortgangsbalk */}
      <div className="mt-7">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[52px] font-medium leading-none tabular-nums text-[var(--ink)]">
            {stats.pctText}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
            van je volledige vrijheid
          </span>
        </div>
        <div className="mt-4 h-[10px] w-full bg-[var(--subtle)]">
          <div
            className="h-full bg-horizon-500 transition-all duration-700"
            style={{ width: `${stats.pctFill}%` }}
          />
        </div>
        {!stats.hasFreedomPct && (
          <p className="mt-2 font-serif text-[13px] italic text-[var(--ink-3)]">
            Voeg transacties toe om je vrijheidspercentage te berekenen.
          </p>
        )}
      </div>

      {/* Netto vermogen (alleen volledige privacy) */}
      {privacyLevel === 'full' && netWorth != null && (
        <div className="mt-6 border-t border-[var(--border-ed)] pt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-3)]">
            Netto vermogen
          </p>
          <p className="mt-1 font-mono text-2xl font-medium tabular-nums text-[var(--ink)]">
            {formatCurrency(netWorth)}
          </p>
          {stats.freedomTimeLong && (
            <p className="mt-0.5 font-serif text-sm italic text-[var(--ink-3)]">
              {stats.freedomTimeLong} vrijheid
            </p>
          )}
        </div>
      )}

      {/* Kerncijfers: 2×2 figures-strip met hairlines */}
      <div className="mt-6 grid grid-cols-2 border-t border-[var(--border-ed)]">
        {cells.map((cell, i) => (
          <div
            key={cell.kicker}
            className={`py-4 ${i % 2 === 0 ? 'border-r border-[var(--border-ed)] pr-4' : 'pl-4'} ${i < 2 ? 'border-b border-[var(--border-ed)]' : ''}`}
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-3)]">
              {cell.kicker}
            </p>
            <p className="mt-1.5 font-mono text-xl font-medium tabular-nums text-[var(--ink)]">
              {cell.value}
            </p>
          </div>
        ))}
      </div>

      {/* Colofon */}
      <div className="mt-6 flex items-center justify-between border-t border-[var(--border-ed)] pt-3">
        <p className="font-mono text-[10px] tracking-[0.1em] text-[var(--ink-4)]">
          Trifinity <span className="font-serif not-italic text-horizon-500">✦</span> vrijheid
        </p>
        <p className="font-mono text-[10px] tracking-[0.1em] tabular-nums text-[var(--ink-4)]">
          {dateText}
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
      const canvas = await renderFreedomCardToCanvas(cardData)
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
          renderCanvas={() => renderFreedomCardToCanvas(cardData)}
        />
      )}
    </div>
  )
}

export { FreedomCardVisual }
