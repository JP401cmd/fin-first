'use client'

import { useState, useEffect, useRef } from 'react'
import { ShareDialog, useShareDialog, type ShareContent } from '@/components/app/share-dialog'
import { ToastProvider } from '@/components/app/toast-provider'

// ── Types ──
interface TestResult {
  name: string
  pass: boolean
  details: string
}

interface VerificationResponse {
  status: string
  summary: string
  results: TestResult[]
  timestamp: string
}

// ── Inner content (needs ToastProvider above it) ──
function ShareTargetsTestContent() {
  const [apiResults, setApiResults] = useState<VerificationResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [webShareSupported, setWebShareSupported] = useState(false)
  const captureRef = useRef<HTMLDivElement>(null)
  const { isOpen: hookDialogOpen, shareContent: hookContent, openShareDialog, closeShareDialog } = useShareDialog()

  useEffect(() => {
    setWebShareSupported(typeof navigator !== 'undefined' && !!navigator.share)
  }, [])

  const runVerification = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/verify-share-targets')
      const data = await res.json()
      setApiResults(data)
    } catch (err) {
      setApiResults({
        status: 'ERROR',
        summary: 'Failed to fetch verification results',
        results: [],
        timestamp: new Date().toISOString(),
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    runVerification()
  }, [])

  const sampleShareContent: ShareContent = {
    title: 'Mijn TriFinity Vrijheidskaart',
    text: 'Mijn financiele vrijheid: 42.5% | 7 vrijheidsdagen gewonnen | FIRE countdown: 12j 3mnd #TriFinity',
    url: typeof window !== 'undefined' ? window.location.origin : 'https://trifinity.app',
    contentType: 'freedom_card',
    privacyLevel: 'anonymous',
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-4 sm:p-8">
      <div className="mx-auto max-w-3xl space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">
            Feature #236: Share Targets Integration
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Verification page for share functionality: copy link, download image, Web Share API, WhatsApp, Twitter/X, fallback options, analytics tracking.
          </p>
        </div>

        {/* API Verification Results */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-zinc-900">
              Code Verification Tests
            </h2>
            <button
              onClick={runVerification}
              disabled={loading}
              className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50"
            >
              {loading ? 'Bezig...' : 'Opnieuw testen'}
            </button>
          </div>

          {apiResults && (
            <div>
              <div className={`mb-4 rounded-lg p-3 text-sm font-semibold ${
                apiResults.status === 'PASS'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {apiResults.status}: {apiResults.summary}
              </div>

              <div className="space-y-2">
                {apiResults.results.map((result, i) => (
                  <div
                    key={i}
                    className={`rounded-lg border p-3 ${
                      result.pass
                        ? 'border-emerald-200 bg-emerald-50/50'
                        : 'border-red-200 bg-red-50/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-lg ${result.pass ? 'text-emerald-500' : 'text-red-500'}`}>
                        {result.pass ? '✓' : '✗'}
                      </span>
                      <span className="text-sm font-medium text-zinc-800">{result.name}</span>
                    </div>
                    <p className="mt-1 pl-7 text-xs text-zinc-500">{result.details}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Interactive Demo: ShareDialog */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">
            Interactive Demo: ShareDialog
          </h2>

          <div className="space-y-4">
            {/* Web Share API detection */}
            <div className={`rounded-lg border p-3 text-sm ${
              webShareSupported
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-200 bg-amber-50 text-amber-700'
            }`}>
              <strong>Web Share API:</strong> {webShareSupported ? 'Ondersteund ✓' : 'Niet ondersteund (fallback modus) ⚠'}
            </div>

            {/* Sample card for capture */}
            <div ref={captureRef}>
              <div
                id="freedom-card"
                className="mx-auto max-w-[420px] rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 p-6 text-white shadow-2xl"
              >
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-xs font-semibold tracking-[0.2em] text-zinc-400 uppercase">
                    Test Kaart
                  </p>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-amber-400" />
                    <div className="h-2 w-2 rounded-full bg-teal-400" />
                    <div className="h-2 w-2 rounded-full bg-purple-400" />
                    <span className="ml-1 text-xs font-bold text-zinc-400">TriFinity</span>
                  </div>
                </div>
                <p className="text-4xl font-bold">42.5%</p>
                <p className="text-sm text-zinc-400">financiele vrijheid</p>
                <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-zinc-700/60">
                  <div className="h-full w-[42%] rounded-full bg-gradient-to-r from-amber-400 via-teal-400 to-purple-500" />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-zinc-800/80 p-3">
                    <p className="text-[10px] text-zinc-400 uppercase">Dagen gewonnen</p>
                    <p className="text-xl font-bold text-teal-400">+7</p>
                  </div>
                  <div className="rounded-xl bg-zinc-800/80 p-3">
                    <p className="text-[10px] text-zinc-400 uppercase">FIRE countdown</p>
                    <p className="text-xl font-bold text-purple-400">12j 3mnd</p>
                  </div>
                </div>
                <div className="mt-4 border-t border-zinc-700/50 pt-3">
                  <p className="text-[10px] text-zinc-500">Geld is opgeslagen tijd</p>
                </div>
              </div>
            </div>

            {/* Demo buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShareDialogOpen(true)}
                className="rounded-xl bg-gradient-to-r from-teal-500 to-purple-500 px-4 py-3 text-sm font-medium text-white hover:shadow-lg transition-all"
                data-testid="demo-open-share-dialog"
              >
                Open ShareDialog
              </button>
              <button
                onClick={() => openShareDialog(sampleShareContent)}
                className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-700 hover:bg-teal-100 transition-all"
                data-testid="demo-open-hook-dialog"
              >
                Open via useShareDialog
              </button>
            </div>
          </div>
        </section>

        {/* Feature Steps Checklist */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">
            Feature Steps Checklist
          </h2>
          <div className="space-y-3">
            {[
              { step: '1. Implement copy shareable link to clipboard', desc: 'navigator.clipboard.writeText + execCommand fallback' },
              { step: '2. Implement download image functionality', desc: 'SVG foreignObject + Canvas for PNG download' },
              { step: '3. Integrate Web Share API for direct sharing', desc: 'navigator.share() with title, text, url' },
              { step: '4. Support WhatsApp sharing target', desc: 'wa.me deep link with encoded text' },
              { step: '5. Support Twitter/X sharing target', desc: 'twitter.com/intent/tweet with encoded text + url' },
              { step: '6. Show fallback share options when Web Share API is not supported', desc: 'WhatsApp + Twitter/X always available, fallback notice shown' },
              { step: '7. Track share events for analytics', desc: 'POST /api/share/track stores events in share_events table' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-zinc-100 bg-zinc-50 p-3">
                <span className="mt-0.5 text-lg text-emerald-500">✓</span>
                <div>
                  <p className="text-sm font-medium text-zinc-800">{item.step}</p>
                  <p className="text-xs text-zinc-500">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ShareDialog (direct state) */}
      <ShareDialog
        open={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
        content={sampleShareContent}
        captureRef={captureRef}
      />

      {/* ShareDialog (via hook) */}
      {hookContent && (
        <ShareDialog
          open={hookDialogOpen}
          onClose={closeShareDialog}
          content={hookContent}
          captureRef={captureRef}
        />
      )}
    </div>
  )
}

// ── Page wrapper with ToastProvider ──
export default function TestShareTargetsPage() {
  return (
    <ToastProvider>
      <ShareTargetsTestContent />
    </ToastProvider>
  )
}
