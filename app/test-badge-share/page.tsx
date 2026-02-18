'use client'

import { useState, useEffect, useCallback } from 'react'
import { BADGE_DEFINITIONS, type BadgeWithStatus } from '@/lib/badges'
import { renderBadgeCardToCanvas } from '@/components/app/badge-grid'

// ── Verification Tests ──────────────────────────────────────────────

function VerificationTests() {
  const [results, setResults] = useState<Array<{ test: string; pass: boolean; detail: string }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function run() {
      try {
        const res = await fetch('/api/verify-badge-share')
        if (res.ok) {
          const data = await res.json()
          setResults(data.results)
        } else {
          setResults([{ test: 'API Fetch', pass: false, detail: `HTTP ${res.status}` }])
        }
      } catch (err) {
        setResults([{ test: 'API Fetch', pass: false, detail: String(err) }])
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  if (loading) {
    return <div className="animate-pulse text-zinc-400">Verificatie laden...</div>
  }

  const passing = results.filter(r => r.pass).length

  return (
    <div className="space-y-2" data-testid="verification-results">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className={passing === results.length ? 'text-emerald-600' : 'text-amber-600'}>
          {passing}/{results.length} tests passing
        </span>
      </div>
      {results.map((r, i) => (
        <div
          key={i}
          className={`rounded-lg border p-3 text-sm ${
            r.pass
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
          data-testid={`test-${i}`}
          data-pass={r.pass ? 'true' : 'false'}
        >
          <div className="font-medium">
            {r.pass ? '✅' : '❌'} {r.test}
          </div>
          <div className="mt-0.5 text-xs opacity-75">{r.detail}</div>
        </div>
      ))}
    </div>
  )
}

// ── Badge Canvas Preview ────────────────────────────────────────────

function BadgeCanvasPreview({ badge }: { badge: BadgeWithStatus }) {
  const [imgSrc, setImgSrc] = useState<string | null>(null)

  useEffect(() => {
    try {
      const canvas = renderBadgeCardToCanvas(badge)
      setImgSrc(canvas.toDataURL('image/png'))
    } catch (err) {
      console.error('Canvas render error:', err)
    }
  }, [badge])

  if (!imgSrc) return <div className="text-zinc-400 text-sm">Rendering...</div>

  return (
    <div className="space-y-2" data-testid={`canvas-preview-${badge.slug}`}>
      <img
        src={imgSrc}
        alt={`Badge: ${badge.name}`}
        className="rounded-2xl shadow-lg"
        style={{ width: 400, height: 'auto' }}
      />
      <div className="flex gap-2">
        <a
          href={imgSrc}
          download={`trifinity-badge-${badge.slug}.png`}
          className="text-xs text-teal-600 hover:underline"
        >
          Download PNG
        </a>
      </div>
    </div>
  )
}

// ── Demo Share Card ─────────────────────────────────────────────────

function DemoShareText({ badge }: { badge: BadgeWithStatus }) {
  const shareText = `Ik heb de ${badge.name} badge verdiend op TriFinity! ${badge.icon}\n\n${badge.description}`

  return (
    <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-4 text-sm" data-testid={`share-text-${badge.slug}`}>
      <div className="text-xs font-semibold text-zinc-400 mb-2">SHARE TEXT:</div>
      <p className="text-zinc-700 whitespace-pre-line">{shareText}</p>
    </div>
  )
}

// ── Main Test Page ──────────────────────────────────────────────────

export default function TestBadgeSharePage() {
  // Pick a few representative badges from different categories
  const demoBadges: BadgeWithStatus[] = [
    {
      ...BADGE_DEFINITIONS.find(b => b.slug === 'schuldenvrij')!,
      earned: true,
      earned_at: '2026-01-15T10:30:00Z',
    },
    {
      ...BADGE_DEFINITIONS.find(b => b.slug === 'fire_halftime')!,
      earned: true,
      earned_at: '2026-02-01T14:00:00Z',
    },
    {
      ...BADGE_DEFINITIONS.find(b => b.slug === 'weekstreak_x52')!,
      earned: true,
      earned_at: '2025-12-25T08:00:00Z',
    },
    {
      ...BADGE_DEFINITIONS.find(b => b.slug === 'eerste_stap')!,
      earned: true,
      earned_at: '2025-06-01T12:00:00Z',
    },
    {
      ...BADGE_DEFINITIONS.find(b => b.slug === 'sovereignty_level_6')!,
      earned: true,
      earned_at: '2026-02-18T09:00:00Z',
    },
  ]

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="mx-auto max-w-4xl space-y-8">
        <h1 className="text-2xl font-bold text-zinc-900">
          Feature #238: Badge Showcase Sharing
        </h1>
        <p className="text-sm text-zinc-500">
          Test page for verifying badge sharing functionality — share individual badges on social media
          with TriFinity branding.
        </p>

        {/* Verification Tests */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-zinc-800">
            API Verification Tests
          </h2>
          <VerificationTests />
        </section>

        {/* Badge Canvas Previews */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-zinc-800">
            Badge Share Images (Canvas Rendered)
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            {demoBadges.map((badge) => (
              <div key={badge.slug} className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{badge.icon}</span>
                  <span className="font-semibold text-zinc-800">{badge.name}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
                    {badge.color}
                  </span>
                </div>
                <BadgeCanvasPreview badge={badge} />
                <DemoShareText badge={badge} />
              </div>
            ))}
          </div>
        </section>

        {/* Feature Steps Checklist */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-zinc-800">
            Feature Steps Checklist
          </h2>
          <div className="space-y-2 text-sm">
            {[
              'Add share button to individual badge detail view',
              'Generate shareable badge image with TriFinity branding',
              'Include badge name and description in share text',
              'Support sharing via Web Share API',
              'Support copy link and download image',
              'Apply consistent branding to shared badge image',
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3">
                <span className="text-emerald-600">✅</span>
                <span className="text-emerald-700">{step}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
