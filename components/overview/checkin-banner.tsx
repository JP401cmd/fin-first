'use client'

import { useState, useEffect } from 'react'
import { CalendarCheck, ArrowRight, X } from 'lucide-react'
import Link from 'next/link'

/**
 * CheckinBanner — compacte banner bovenaan /overzicht die de maandelijkse
 * check-in aankondigt, maar alléén wanneer die "aan staat en relevant is":
 *   - enabled (gebruiker heeft check-in niet uitgezet)
 *   - nog niet voltooid deze maand
 *   - we zitten in de eerste week van de maand
 *
 * Buiten die voorwaarden rendert de banner niets (geen ruis). Per sessie
 * dismissbaar. De volledige check-in-flow blijft op /core/checkin.
 *
 * Bewust los van de uitgebreidere MonthlyCheckinCard (die ook een
 * placeholder/uitleg-staat heeft); dit is puur de top-of-page nudge.
 */

const DISMISS_KEY = 'checkin_banner_dismissed'

function currentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function isFirstWeekOfMonth() {
  return new Date().getDate() <= 7
}

const MONTH_NAMES = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

export function CheckinBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Niet in de eerste week → nooit relevant.
    if (!isFirstWeekOfMonth()) return
    // Deze maand al weggeklikt?
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === currentMonthKey()) return
    } catch {
      /* sessionStorage onbeschikbaar — ga door */
    }
    let cancelled = false
    fetch('/api/monthly-checkin')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data?.enabled && !data?.completed) setVisible(true)
      })
      .catch(() => {
        /* stil falen — geen banner */
      })
    return () => {
      cancelled = true
    }
  }, [])

  function dismiss() {
    setVisible(false)
    try {
      sessionStorage.setItem(DISMISS_KEY, currentMonthKey())
    } catch {
      /* no-op */
    }
  }

  if (!visible) return null

  const monthLabel = MONTH_NAMES[new Date().getMonth()]

  return (
    <section
      aria-label="Maandelijkse check-in"
      className="mx-auto max-w-6xl px-4 pt-4 sm:px-6"
    >
      <div className="flex items-center gap-3 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-stone-50 p-3 sm:p-4">
        <span className="inline-flex w-9 h-9 rounded-lg bg-violet-100 text-violet-700 items-center justify-center shrink-0">
          <CalendarCheck className="w-4 h-4" aria-hidden="true" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-violet-700">
            Check-in {monthLabel}
          </div>
          <p className="text-sm text-[var(--ink-2)] leading-snug">
            Doe je korte maand-check-in: vermogen, budgetten en doelen in 2
            minuten langs.
          </p>
        </div>
        <Link
          href="/core/checkin"
          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--ink)] text-[var(--paper)] px-3 py-2 text-sm font-semibold hover:bg-[var(--ink-2)] transition-colors shrink-0"
        >
          Start
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Check-in-banner verbergen"
          className="inline-flex items-center justify-center w-8 h-8 rounded-full text-[var(--ink-3)] hover:bg-[var(--subtle)] transition-colors shrink-0"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}
