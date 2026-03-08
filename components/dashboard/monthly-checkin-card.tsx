'use client'

import { useState, useEffect, useCallback } from 'react'
import { CalendarCheck, X, ArrowRight } from 'lucide-react'
import Link from 'next/link'

const MONTH_NAMES = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

/** sessionStorage key to suppress card after dismiss within the same session */
const DISMISS_KEY = 'checkin_dismissed'

function currentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function MonthlyCheckinCard() {
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)
  const [monthLabel, setMonthLabel] = useState('')

  useEffect(() => {
    const now = new Date()
    setMonthLabel(MONTH_NAMES[now.getMonth()])

    // If user dismissed in this session, don't show
    const dismissed = sessionStorage.getItem(DISMISS_KEY)
    if (dismissed === currentMonthKey()) {
      setLoading(false)
      return
    }

    fetch('/api/monthly-checkin')
      .then(r => r.json())
      .then(data => {
        // Show card only if enabled and not yet completed this month
        if (data.enabled && !data.completed) {
          setVisible(true)
        }
      })
      .catch(() => {
        // Silently fail — don't show card on error
      })
      .finally(() => setLoading(false))
  }, [])

  // Listen for check-in completion from the wizard (via custom event or refetch)
  useEffect(() => {
    const handleCheckinCompleted = () => {
      setFadingOut(true)
      setTimeout(() => setVisible(false), 200)
    }
    window.addEventListener('checkin-completed', handleCheckinCompleted)
    return () => window.removeEventListener('checkin-completed', handleCheckinCompleted)
  }, [])

  // Also re-check on window focus (user completes wizard in same tab, then returns)
  useEffect(() => {
    if (!visible) return
    const handleFocus = () => {
      fetch('/api/monthly-checkin')
        .then(r => r.json())
        .then(data => {
          if (data.completed) {
            setFadingOut(true)
            setTimeout(() => setVisible(false), 200)
          }
        })
        .catch(() => {})
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [visible])

  const handleDismiss = useCallback(() => {
    // Persist dismiss for this session so card doesn't reappear on page refresh
    sessionStorage.setItem(DISMISS_KEY, currentMonthKey())
    setFadingOut(true)
    setTimeout(() => setVisible(false), 200)
  }, [])

  if (loading || !visible) return null

  return (
    <div
      className={`card-editorial overflow-hidden transition-all duration-200 ${
        fadingOut ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
      }`}
      data-testid="monthly-checkin-card"
    >
      <div className="flex items-start gap-4 p-4 sm:p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)] bg-wil-50">
          <CalendarCheck className="h-5 w-5 text-wil-600" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="label-editorial text-wil-600">Maandelijkse geldcheck-in</span>
              <h3 className="mt-1 text-sm font-semibold text-[var(--ink)]">
                Hoe staat het met je financi&euml;n deze {monthLabel}?
              </h3>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              className="shrink-0 rounded-[var(--r-sm)] p-1.5 text-[var(--ink-4)] hover:text-[var(--ink-3)] hover:bg-[var(--subtle)] transition-colors"
              aria-label="Verberg check-in herinnering"
              style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-1.5 text-xs text-[var(--ink-3)] leading-relaxed">
            Neem een moment om je vermogen, budgetten en doelen te bekijken. Een korte check-in helpt je op koers te blijven.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href="/core/checkin"
              className="inline-flex items-center gap-1.5 rounded-lg bg-wil-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-wil-700"
            >
              Start check-in
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <span className="text-[10px] text-[var(--ink-4)] font-serif italic">
              Uitschakelbaar in Instellingen
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
