'use client'

import { useEffect, useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'

/**
 * RateLimitBadge — toont de gebruiker hoeveel AI-rekenhulp-generaties
 * en/of -verfijningen er deze week nog over zijn. Wordt bovenaan de
 * build-modus van `<RekenhulpView>` getoond zodat de auteur niet pas
 * op de submit-knop merkt dat hij door zijn quotum heen is.
 *
 * Implementatie-keuze: client-component met initial `useEffect`-fetch
 * naar `/api/calculators/usage`. Reden om geen server-component te
 * kiezen: deze badge zit *in* een client-render (RekenhulpView), en
 * we willen 'm na een succesvolle generatie kunnen herladen zonder
 * volledige router.refresh — een refresh-knop of een externe
 * `key`-prop volstaat dan.
 *
 * Bij laden tonen we een neutrale spinner; bij een netwerkfout vallen
 * we stilzwijgend terug op niets-renderen — een visueel ruisende
 * fallback zou afleiden van de hoofdtaak.
 */

interface UsageResponse {
  generations: number
  refinements: number
  maxGenerations: number
  maxRefinements: number
}

export function RateLimitBadge({
  /**
   * Optionele refresh-key: verander hem (bv. via een Date.now() na een
   * succesvolle generate-call) om de badge opnieuw te laten fetchen
   * zonder de hele view te remounten.
   */
  refreshKey,
  /** Welk soort verbruik nadrukkelijk tonen. 'auto' kiest het type
   *  dat het kleinste resterend-aantal heeft (= meest urgent). */
  mode = 'auto',
}: {
  refreshKey?: number | string
  mode?: 'auto' | 'generations' | 'refinements'
} = {}) {
  const [usage, setUsage] = useState<UsageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let aborted = false
    setLoading(true)
    setFailed(false)
    ;(async () => {
      try {
        const res = await fetch('/api/calculators/usage', { cache: 'no-store' })
        if (!res.ok) {
          if (!aborted) {
            setFailed(true)
            setLoading(false)
          }
          return
        }
        const data = (await res.json()) as UsageResponse
        if (!aborted) {
          setUsage(data)
          setLoading(false)
        }
      } catch {
        if (!aborted) {
          setFailed(true)
          setLoading(false)
        }
      }
    })()
    return () => {
      aborted = true
    }
  }, [refreshKey])

  if (loading) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1 text-[11px] text-[var(--ink-3)]"
        aria-live="polite"
      >
        <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
        Verbruik laden…
      </span>
    )
  }

  // Stille fallback bij fail — geen prominent foutje boven een
  // build-formulier dat verder gewoon werkt.
  if (failed || !usage) return null

  const remainingGen = Math.max(0, usage.maxGenerations - usage.generations)
  const remainingRef = Math.max(0, usage.maxRefinements - usage.refinements)

  // In 'auto'-modus tonen we het type dat de gebruiker het snelst raakt
  // — i.p.v. twee badges naast elkaar — zodat het signaal compact blijft.
  const showRefinements =
    mode === 'refinements' ||
    (mode === 'auto' && remainingRef <= remainingGen)

  const remaining = showRefinements ? remainingRef : remainingGen
  const max = showRefinements ? usage.maxRefinements : usage.maxGenerations
  const labelNoun = showRefinements ? 'verfijningen' : 'generaties'

  // Visuele waarschuwingsgraad: 0 → rood, <=2 → amber, anders neutraal.
  const tone =
    remaining === 0
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : remaining <= 2
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)]'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone}`}
      aria-live="polite"
    >
      <Sparkles className="w-3 h-3" aria-hidden="true" />
      <span className="tabular-nums">
        Nog {remaining} van {max} {labelNoun} deze week
      </span>
    </span>
  )
}
