'use client'

import { useState, useTransition } from 'react'
import { Heart } from 'lucide-react'

/**
 * LikeButton — toggle-knop voor een like op een gepubliceerde rekenhulp.
 *
 * Optimistic UI: lokale state flipt direct, POST naar
 * `/api/calculators/[id]/like` (toggle, beheerd door Agent A). Bij een
 * non-2xx response of netwerkfout rollback'en we naar de oorspronkelijke
 * waarde zodat de UI nooit liegt over de daadwerkelijke DB-staat.
 *
 * Visueel: Lucide `Heart` (outline of filled) + count erachter. Bij
 * toggle een korte scale-up zodat de interactie tactiel voelt. Houd het
 * subtiel — dit is geen primary CTA.
 */
export function LikeButton({
  calculatorId,
  initiallyLiked,
  initialCount,
}: {
  calculatorId: string
  initiallyLiked: boolean
  initialCount: number
}) {
  const [liked, setLiked] = useState(initiallyLiked)
  const [count, setCount] = useState(initialCount)
  // Korte "bumpt"-state stuurt de scale-animatie aan. We resetten 'm op
  // animationEnd zodat herhaaldelijk klikken telkens een nieuwe bump
  // triggert (niet één keer per mount).
  const [bumping, setBumping] = useState(false)
  const [, startTransition] = useTransition()

  function toggle() {
    const previousLiked = liked
    const previousCount = count
    const nextLiked = !previousLiked
    const nextCount = Math.max(0, previousCount + (nextLiked ? 1 : -1))

    // Optimistic update — vóór de fetch zodat de UI direct reageert.
    setLiked(nextLiked)
    setCount(nextCount)
    setBumping(true)

    startTransition(async () => {
      try {
        const res = await fetch(`/api/calculators/${encodeURIComponent(calculatorId)}/like`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        if (!res.ok) {
          // Rollback: server weigerde, laat UI niet liegen.
          setLiked(previousLiked)
          setCount(previousCount)
        }
      } catch {
        // Netwerkfout — zelfde rollback-pad.
        setLiked(previousLiked)
        setCount(previousCount)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={liked}
      aria-label={liked ? 'Verwijder like' : 'Like deze rekenhulp'}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
        liked
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-[var(--ink-3)] hover:text-[var(--ink-2)]'
      }`}
    >
      <Heart
        className={`w-3.5 h-3.5 transition-transform duration-200 ${bumping ? 'scale-125' : 'scale-100'} ${
          liked ? 'fill-rose-600 text-rose-600' : ''
        }`}
        aria-hidden="true"
        onTransitionEnd={() => setBumping(false)}
      />
      <span className="tabular-nums">{count}</span>
    </button>
  )
}
