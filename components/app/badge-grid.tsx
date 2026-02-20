'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Share2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BADGE_DEFINITIONS, type BadgeWithStatus, type BadgeCategory } from '@/lib/badges'
import { ShareDialog, type ShareContent } from '@/components/app/share-dialog'

// ── Color mapping for badge categories ──────────────────────────────

const colorMap: Record<string, {
  bg: string
  bgEarned: string
  border: string
  borderEarned: string
  text: string
  ring: string
}> = {
  amber: {
    bg: 'bg-kern-50',
    bgEarned: 'bg-kern-100',
    border: 'border-[var(--border-ed)]',
    borderEarned: 'border-kern-300',
    text: 'text-kern-700',
    ring: 'ring-kern-200',
  },
  teal: {
    bg: 'bg-wil-50',
    bgEarned: 'bg-wil-100',
    border: 'border-[var(--border-ed)]',
    borderEarned: 'border-wil-300',
    text: 'text-wil-700',
    ring: 'ring-wil-200',
  },
  purple: {
    bg: 'bg-horizon-50',
    bgEarned: 'bg-horizon-100',
    border: 'border-[var(--border-ed)]',
    borderEarned: 'border-horizon-300',
    text: 'text-horizon-700',
    ring: 'ring-horizon-200',
  },
  emerald: {
    bg: 'bg-emerald-50',
    bgEarned: 'bg-emerald-100',
    border: 'border-[var(--border-ed)]',
    borderEarned: 'border-emerald-300',
    text: 'text-emerald-700',
    ring: 'ring-emerald-200',
  },
  rose: {
    bg: 'bg-rose-50',
    bgEarned: 'bg-rose-100',
    border: 'border-[var(--border-ed)]',
    borderEarned: 'border-rose-300',
    text: 'text-rose-700',
    ring: 'ring-rose-200',
  },
  blue: {
    bg: 'bg-blue-50',
    bgEarned: 'bg-blue-100',
    border: 'border-[var(--border-ed)]',
    borderEarned: 'border-blue-300',
    text: 'text-blue-700',
    ring: 'ring-blue-200',
  },
  zinc: {
    bg: 'bg-[var(--subtle)]',
    bgEarned: 'bg-zinc-100',
    border: 'border-[var(--border-ed)]',
    borderEarned: 'border-zinc-400',
    text: 'text-[var(--ink-2)]',
    ring: 'ring-zinc-200',
  },
}

const categoryLabels: Record<BadgeCategory, string> = {
  onboarding: 'Onboarding',
  consistency: 'Consistentie',
  financial_health: 'Financiele Gezondheid',
  fire_milestones: 'FIRE Mijlpalen',
  actions: 'Acties',
  budget: 'Budget',
  exploration: 'Verkenning',
  sovereignty: 'Soevereiniteit',
}

// ── Canvas color hex values per badge color ─────────────────────────

const canvasColorHex: Record<string, { primary: string; bg: string; bgDark: string }> = {
  amber:   { primary: '#fbbf24', bg: '#fffbeb', bgDark: '#78350f' },
  teal:    { primary: '#2dd4bf', bg: '#f0fdfa', bgDark: '#134e4a' },
  purple:  { primary: '#a855f7', bg: '#faf5ff', bgDark: '#581c87' },
  emerald: { primary: '#34d399', bg: '#ecfdf5', bgDark: '#064e3b' },
  rose:    { primary: '#fb7185', bg: '#fff1f2', bgDark: '#881337' },
  blue:    { primary: '#60a5fa', bg: '#eff6ff', bgDark: '#1e3a5f' },
  zinc:    { primary: '#a1a1aa', bg: '#fafafa', bgDark: '#27272a' },
}

// ── Render badge card to canvas for sharing ─────────────────────────

export function renderBadgeCardToCanvas(badge: BadgeWithStatus): HTMLCanvasElement {
  const W = 800
  const H = 480
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  const badgeColors = canvasColorHex[badge.color] ?? canvasColorHex.zinc
  const BG_DARK = '#18181b'
  const BG_MID = '#27272a'
  const TEXT_WHITE = '#ffffff'
  const TEXT_ZINC_300 = '#d4d4d8'
  const TEXT_ZINC_400 = '#a1a1aa'
  const TEXT_ZINC_500 = '#71717a'
  const AMBER_400 = '#fbbf24'
  const TEAL_400 = '#2dd4bf'
  const PURPLE_400 = '#c084fc'

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

  // ── Background ──
  const bgGrad = ctx.createLinearGradient(0, 0, W, H)
  bgGrad.addColorStop(0, BG_DARK)
  bgGrad.addColorStop(0.5, BG_MID)
  bgGrad.addColorStop(1, BG_DARK)
  roundRect(0, 0, W, H, 32)
  ctx.fillStyle = bgGrad
  ctx.fill()

  // Background glow using badge color
  const glow1 = ctx.createRadialGradient(W * 0.7, 0, 0, W * 0.7, 0, 300)
  glow1.addColorStop(0, badgeColors.primary + '30')
  glow1.addColorStop(0.5, badgeColors.primary + '10')
  glow1.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow1
  ctx.fillRect(0, 0, W, H)

  const glow2 = ctx.createRadialGradient(60, H, 0, 60, H, 200)
  glow2.addColorStop(0, PURPLE_400 + '18')
  glow2.addColorStop(0.5, TEAL_400 + '08')
  glow2.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow2
  ctx.fillRect(0, 0, W, H)

  const pad = 48
  let y = pad

  // ── TriFinity branding (top-right) ──
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
  ctx.textBaseline = 'top'
  ctx.fillStyle = TEXT_ZINC_400
  ctx.fillText('TriFinity', brandX + dotGap * 3 + 8, y)

  // ── Top label ──
  ctx.font = '600 16px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = TEXT_ZINC_500
  ctx.fillText('BADGE BEHAALD', pad, y + 4)
  y += 56

  // ── Badge icon circle ──
  const iconCenterX = W / 2
  const iconCenterY = y + 56
  const iconRadius = 56

  // Outer glow ring
  const ringGrad = ctx.createRadialGradient(iconCenterX, iconCenterY, iconRadius - 4, iconCenterX, iconCenterY, iconRadius + 16)
  ringGrad.addColorStop(0, badgeColors.primary + '40')
  ringGrad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = ringGrad
  ctx.beginPath()
  ctx.arc(iconCenterX, iconCenterY, iconRadius + 16, 0, Math.PI * 2)
  ctx.fill()

  // Circle background
  ctx.fillStyle = badgeColors.bgDark
  ctx.beginPath()
  ctx.arc(iconCenterX, iconCenterY, iconRadius, 0, Math.PI * 2)
  ctx.fill()

  // Circle border
  ctx.strokeStyle = badgeColors.primary
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(iconCenterX, iconCenterY, iconRadius, 0, Math.PI * 2)
  ctx.stroke()

  // Badge emoji icon
  ctx.font = '56px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = TEXT_WHITE
  ctx.fillText(badge.icon, iconCenterX, iconCenterY)

  y = iconCenterY + iconRadius + 28

  // ── Badge name ──
  ctx.font = 'bold 36px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = TEXT_WHITE
  ctx.fillText(badge.name, W / 2, y)
  y += 16

  // ── Category label ──
  ctx.font = '500 18px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = badgeColors.primary
  const catLabel = categoryLabels[badge.category] ?? badge.category
  ctx.fillText(catLabel, W / 2, y + 24)
  y += 52

  // ── Badge description ──
  ctx.font = '400 18px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = TEXT_ZINC_300
  // Word-wrap description
  const maxLineW = W - pad * 2
  const words = badge.description.split(' ')
  let line = ''
  const lines: string[] = []
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxLineW) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  for (const l of lines.slice(0, 3)) {
    ctx.fillText(l, W / 2, y)
    y += 26
  }

  // ── Earned date (bottom) ──
  if (badge.earned_at) {
    const dateStr = new Date(badge.earned_at).toLocaleDateString('nl-NL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    ctx.font = '400 15px system-ui, -apple-system, sans-serif'
    ctx.fillStyle = TEXT_ZINC_500
    ctx.fillText(`Verdiend op ${dateStr}`, W / 2, H - pad)
  }

  // Reset alignment
  ctx.textAlign = 'start'

  return canvas
}

// ── Badge detail modal ──────────────────────────────────────────────

function BadgeDetail({
  badge,
  onClose,
  onShare,
}: {
  badge: BadgeWithStatus
  onClose: () => void
  onShare?: (badge: BadgeWithStatus) => void
}) {
  const colors = colorMap[badge.color] ?? colorMap.zinc

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      data-testid="badge-detail-overlay"
    >
      <div
        className="mx-4 w-full max-w-sm rounded-[var(--r-lg)] bg-[var(--paper)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="badge-detail-modal"
        data-badge-slug={badge.slug}
      >
        <div className="flex items-start gap-4">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-[var(--r-lg)] text-3xl ${
              badge.earned ? colors.bgEarned : 'bg-zinc-100'
            } ${badge.earned ? colors.borderEarned : 'border-[var(--border-ed)]'} border-2`}
          >
            {badge.earned ? badge.icon : '?'}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-[var(--ink)]" data-testid="badge-detail-name">
              {badge.earned ? badge.name : '???'}
            </h3>
            <p className="mt-0.5 text-xs font-medium uppercase tracking-wider text-[var(--ink-3)]">
              {categoryLabels[badge.category]}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]"
            data-testid="badge-detail-close"
          >
            ✕
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-[var(--ink-2)]" data-testid="badge-detail-description">
          {badge.earned
            ? badge.description
            : 'Deze badge is nog vergrendeld. Blijf groeien om hem te verdienen!'}
        </p>

        {badge.earned && badge.earned_at && (
          <p className="mt-3 text-xs text-[var(--ink-3)]" data-testid="badge-detail-date">
            Verdiend op{' '}
            {new Date(badge.earned_at).toLocaleDateString('nl-NL', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        )}

        {!badge.earned && badge.progress !== null && badge.progress !== undefined && (
          <div className="mt-4" data-testid="badge-detail-progress">
            <div className="flex items-center justify-between text-xs text-[var(--ink-3)]">
              <span>Voortgang</span>
              <span className="font-semibold">{Math.round((badge.progress ?? 0) * 100)}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-100">
              <div
                className={`h-full rounded-full transition-all ${
                  badge.progress >= 0.75 ? 'bg-emerald-400' :
                  badge.progress >= 0.5 ? 'bg-amber-400' :
                  badge.progress > 0 ? 'bg-zinc-400' :
                  'bg-zinc-200'
                }`}
                style={{ width: `${Math.round((badge.progress ?? 0) * 100)}%` }}
              />
            </div>
            {badge.progress_label && (
              <p className="mt-1 text-[11px] text-[var(--ink-3)]">{badge.progress_label}</p>
            )}
          </div>
        )}

        {!badge.earned && (
          <div className="mt-4 rounded-lg bg-[var(--subtle)] p-3">
            <p className="text-xs font-medium text-[var(--ink-3)]">
              Tip: {badge.description}
            </p>
          </div>
        )}

        {/* Share button for earned badges */}
        {badge.earned && onShare && (
          <button
            onClick={() => onShare(badge)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-[var(--r-lg)] border border-wil-200 bg-wil-50 px-4 py-2.5 text-sm font-medium text-wil-700 transition-all hover:bg-wil-100 hover:border-wil-300 active:scale-[0.98]"
            data-testid="badge-share-button"
          >
            <Share2 className="h-4 w-4" />
            <span>Deel deze badge</span>
          </button>
        )}
      </div>
    </div>
  )
}

// ── Badge card ──────────────────────────────────────────────────────

function BadgeCard({
  badge,
  onClick,
  isNewlyEarned,
}: {
  badge: BadgeWithStatus
  onClick: () => void
  isNewlyEarned?: boolean
}) {
  const colors = colorMap[badge.color] ?? colorMap.zinc
  const hasProgress = !badge.earned && badge.progress !== null && badge.progress !== undefined && badge.progress > 0

  return (
    <button
      onClick={onClick}
      data-testid={`badge-${badge.slug}`}
      data-earned={badge.earned ? 'true' : 'false'}
      data-slug={badge.slug}
      data-progress={badge.progress ?? undefined}
      data-newly-earned={isNewlyEarned ? 'true' : undefined}
      className={`group relative flex flex-col items-center gap-2 rounded-[var(--r-lg)] border-2 p-4 transition-all hover:shadow-md ${
        badge.earned
          ? `${colors.bgEarned} ${colors.borderEarned}`
          : 'border-dashed border-[var(--border-ed)] bg-[var(--subtle)]'
      } ${isNewlyEarned ? 'animate-badge-unlock animate-badge-scale-in' : ''}`}
    >
      {/* Shimmer overlay for newly earned badges */}
      {isNewlyEarned && badge.earned && (
        <div
          className="absolute inset-0 rounded-[var(--r-lg)] overflow-hidden pointer-events-none animate-badge-shimmer"
          data-testid={`badge-shimmer-${badge.slug}`}
        />
      )}

      {/* Icon */}
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-[var(--r-lg)] text-2xl transition-transform group-hover:scale-110 ${
          badge.earned ? '' : 'grayscale opacity-30'
        }`}
      >
        {badge.earned ? badge.icon : '?'}
      </div>

      {/* Name */}
      <span
        className={`text-center text-xs font-semibold leading-tight ${
          badge.earned ? 'text-zinc-800' : 'text-[var(--ink-3)]'
        }`}
      >
        {badge.earned ? badge.name : '???'}
      </span>

      {/* Progress bar for locked badges with partial progress */}
      {hasProgress && (
        <div className="w-full px-1" data-testid={`badge-progress-${badge.slug}`}>
          <div className="h-1 overflow-hidden rounded-full bg-zinc-200">
            <div
              className={`h-full rounded-full animate-progress-fill ${
                badge.progress! >= 0.75 ? 'bg-emerald-400' :
                badge.progress! >= 0.5 ? 'bg-amber-400' :
                'bg-zinc-400'
              }`}
              style={{ width: `${Math.round((badge.progress ?? 0) * 100)}%` }}
            />
          </div>
          <span className="mt-0.5 block text-center text-[9px] text-[var(--ink-3)]">
            {Math.round((badge.progress ?? 0) * 100)}%
          </span>
        </div>
      )}

      {/* Locked overlay */}
      {!badge.earned && !hasProgress && (
        <div className="absolute inset-0 flex items-center justify-center rounded-[var(--r-lg)]">
          <div className="absolute inset-0 rounded-[var(--r-lg)] bg-zinc-100/40" />
        </div>
      )}
    </button>
  )
}

// ── Main BadgeGrid export ───────────────────────────────────────────

export function BadgeGrid() {
  const [badges, setBadges] = useState<BadgeWithStatus[]>([])
  const [earnedCount, setEarnedCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [dataSource, setDataSource] = useState<string>('loading')
  const [selectedBadge, setSelectedBadge] = useState<BadgeWithStatus | null>(null)
  const [newlyEarnedSlugs, setNewlyEarnedSlugs] = useState<Set<string>>(new Set())

  // Share dialog state
  const [shareOpen, setShareOpen] = useState(false)
  const [shareContent, setShareContent] = useState<ShareContent | null>(null)
  const [shareBadge, setShareBadge] = useState<BadgeWithStatus | null>(null)
  const badgeCardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function fetchBadges() {
      try {
        const res = await fetch('/api/badges')
        if (res.ok) {
          const data = await res.json()
          setBadges(data.badges)
          setEarnedCount(data.earned_count)
          setTotalCount(data.total_count)
          setDataSource(data.source ?? 'api')

          // Detect newly earned badges (earned within last 5 minutes)
          const fiveMinAgo = Date.now() - 5 * 60 * 1000
          const newSlugs = new Set<string>()
          for (const b of data.badges) {
            if (b.earned && b.earned_at) {
              const earnedTime = new Date(b.earned_at).getTime()
              if (earnedTime > fiveMinAgo) {
                newSlugs.add(b.slug)
              }
            }
          }
          setNewlyEarnedSlugs(newSlugs)

          // Clear newly-earned status after animations complete (3 seconds)
          if (newSlugs.size > 0) {
            setTimeout(() => setNewlyEarnedSlugs(new Set()), 3000)
          }
        } else {
          // Use client-side definitions as fallback
          const fallback: BadgeWithStatus[] = BADGE_DEFINITIONS.map((b) => ({
            ...b,
            earned: false,
            earned_at: null,
          }))
          setBadges(fallback)
          setTotalCount(fallback.length)
          setDataSource('client_fallback')
        }
      } catch {
        // Fallback
        const fallback: BadgeWithStatus[] = BADGE_DEFINITIONS.map((b) => ({
          ...b,
          earned: false,
          earned_at: null,
        }))
        setBadges(fallback)
        setTotalCount(fallback.length)
        setDataSource('client_fallback')
      } finally {
        setLoading(false)
      }
    }
    fetchBadges()
  }, [])

  // Handle badge share from detail modal
  const handleBadgeShare = useCallback((badge: BadgeWithStatus) => {
    setShareBadge(badge)
    setShareContent({
      title: `${badge.icon} ${badge.name} — TriFinity Badge`,
      text: `Ik heb de ${badge.name} badge verdiend op TriFinity! ${badge.icon}\n\n${badge.description}`,
      url: typeof window !== 'undefined' ? window.location.origin : '',
      contentType: 'badge',
    })
    setShareOpen(true)
    // Close the detail modal to avoid z-index conflicts
    setSelectedBadge(null)
  }, [])

  // Canvas render function for badge image download
  const renderBadgeCanvas = useCallback(() => {
    if (!shareBadge) throw new Error('No badge selected for sharing')
    return renderBadgeCardToCanvas(shareBadge)
  }, [shareBadge])

  const handleShareClose = useCallback(() => {
    setShareOpen(false)
    setTimeout(() => {
      setShareContent(null)
      setShareBadge(null)
    }, 300)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-md)] border-t-zinc-900" />
      </div>
    )
  }

  // Group badges by category
  const categories = Array.from(new Set(badges.map((b) => b.category)))

  return (
    <div data-testid="badge-grid" data-source={dataSource} data-earned={earnedCount} data-total={totalCount}>
      {/* Progress summary */}
      <div className="mb-6 flex items-center gap-4" data-testid="badge-progress-summary">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-[var(--ink)]" data-testid="badge-earned-count">{earnedCount}</span>
          <span className="text-sm text-[var(--ink-3)]" data-testid="badge-total-label">van {totalCount} verdiend</span>
        </div>
        <div className="flex-1">
          <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-kern-400 animate-progress-fill"
              data-testid="badge-overall-progress-bar"
              style={{
                width: `${totalCount > 0 ? (earnedCount / totalCount) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Badge grid grouped by category */}
      <div className="space-y-6">
        {categories.map((category) => {
          const categoryBadges = badges.filter((b) => b.category === category)
          const categoryEarned = categoryBadges.filter((b) => b.earned).length

          return (
            <div key={category}>
              <div className="mb-3 flex items-center gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                  {categoryLabels[category as BadgeCategory] ?? category}
                </h3>
                <span className="text-[10px] text-[var(--ink-4)]">
                  {categoryEarned}/{categoryBadges.length}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {categoryBadges.map((badge) => (
                  <BadgeCard
                    key={badge.slug}
                    badge={badge}
                    onClick={() => setSelectedBadge(badge)}
                    isNewlyEarned={newlyEarnedSlugs.has(badge.slug)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Badge detail modal */}
      {selectedBadge && (
        <BadgeDetail
          badge={selectedBadge}
          onClose={() => setSelectedBadge(null)}
          onShare={handleBadgeShare}
        />
      )}

      {/* Hidden badge card for image capture */}
      {shareBadge && (
        <div
          ref={badgeCardRef}
          className="fixed -left-[9999px] -top-[9999px]"
          aria-hidden="true"
          data-testid="badge-share-capture"
        >
          <BadgeShareCard badge={shareBadge} />
        </div>
      )}

      {/* Share dialog */}
      {shareContent && (
        <ShareDialog
          open={shareOpen}
          onClose={handleShareClose}
          content={shareContent}
          renderCanvas={shareBadge ? renderBadgeCanvas : undefined}
          captureRef={badgeCardRef}
        />
      )}
    </div>
  )
}

// ── Badge share card (for image capture via ShareDialog) ────────────

function BadgeShareCard({ badge }: { badge: BadgeWithStatus }) {
  const badgeColors = canvasColorHex[badge.color] ?? canvasColorHex.zinc
  const catLabel = categoryLabels[badge.category] ?? badge.category

  return (
    <div
      id="badge-share-card"
      style={{
        width: 400,
        height: 240,
        background: `linear-gradient(135deg, #18181b, #27272a, #18181b)`,
        borderRadius: 16,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Badge icon */}
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: badgeColors.bgDark,
          border: `2px solid ${badgeColors.primary}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 32,
        }}
      >
        {badge.icon}
      </div>

      {/* Badge name */}
      <div style={{ marginTop: 12, fontSize: 22, fontWeight: 'bold', color: '#fff', textAlign: 'center' }}>
        {badge.name}
      </div>

      {/* Category */}
      <div style={{ marginTop: 4, fontSize: 13, color: badgeColors.primary, textAlign: 'center' }}>
        {catLabel}
      </div>

      {/* TriFinity branding */}
      <div style={{
        position: 'absolute',
        bottom: 12,
        right: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        color: '#71717a',
      }}>
        <span style={{ color: '#fbbf24' }}>●</span>
        <span style={{ color: '#2dd4bf' }}>●</span>
        <span style={{ color: '#a855f7' }}>●</span>
        <span style={{ fontWeight: 600, letterSpacing: 1 }}>TriFinity</span>
      </div>
    </div>
  )
}
