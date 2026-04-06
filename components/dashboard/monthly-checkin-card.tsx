'use client'

import { useState, useEffect, useCallback } from 'react'
import { CalendarCheck, X, ArrowRight, Clock, AlertCircle } from 'lucide-react'
import Link from 'next/link'

const MONTH_NAMES = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

/** sessionStorage key to suppress card after dismiss within the same session */
const DISMISS_KEY = 'checkin_dismissed'
/** localStorage key to suppress the placeholder explanation */
const PLACEHOLDER_DISMISS_KEY = 'checkin_placeholder_dismissed'

function currentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function previousMonthKey() {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
}

function previousMonthLabel() {
  const now = new Date()
  const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1
  return MONTH_NAMES[prevMonth]
}

/** Is today within the first 7 days of the month? */
function isFirstWeekOfMonth() {
  return new Date().getDate() <= 7
}

type CardState = 'loading' | 'active-checkin' | 'placeholder' | 'hidden'

export function MonthlyCheckinCard() {
  const [cardState, setCardState] = useState<CardState>('loading')
  const [fadingOut, setFadingOut] = useState(false)
  const [monthLabel, setMonthLabel] = useState('')
  const [hasEverCheckedIn, setHasEverCheckedIn] = useState(false)
  const [previousCompleted, setPreviousCompleted] = useState(false)

  useEffect(() => {
    const now = new Date()
    setMonthLabel(MONTH_NAMES[now.getMonth()])

    // If user dismissed in this session, don't show the active banner
    const dismissed = sessionStorage.getItem(DISMISS_KEY)
    const sessionDismissed = dismissed === currentMonthKey()

    // Check if placeholder was dismissed
    const placeholderDismissed = localStorage.getItem(PLACEHOLDER_DISMISS_KEY) === currentMonthKey()

    fetch('/api/monthly-checkin')
      .then(r => r.json())
      .then(data => {
        const everCheckedIn = data.completedMonths && data.completedMonths.length > 0
        setHasEverCheckedIn(everCheckedIn)
        setPreviousCompleted(data.completedMonths?.includes(previousMonthKey()) ?? false)

        if (!data.enabled) {
          setCardState('hidden')
        } else if (!data.completed && isFirstWeekOfMonth() && !sessionDismissed) {
          // First week of the month + not yet completed → show active check-in
          setCardState('active-checkin')
        } else if (!everCheckedIn && !placeholderDismissed) {
          // User has never done a check-in → show placeholder
          setCardState('placeholder')
        } else {
          setCardState('hidden')
        }
      })
      .catch(() => {
        setCardState('hidden')
      })
  }, [])

  // Listen for check-in completion from the wizard
  useEffect(() => {
    const handleCheckinCompleted = () => {
      setFadingOut(true)
      setTimeout(() => setCardState('hidden'), 200)
    }
    window.addEventListener('checkin-completed', handleCheckinCompleted)
    return () => window.removeEventListener('checkin-completed', handleCheckinCompleted)
  }, [])

  // Re-check on window focus
  useEffect(() => {
    if (cardState !== 'active-checkin') return
    const handleFocus = () => {
      fetch('/api/monthly-checkin')
        .then(r => r.json())
        .then(data => {
          if (data.completed) {
            setFadingOut(true)
            setTimeout(() => setCardState('hidden'), 200)
          }
        })
        .catch(() => {})
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [cardState])

  const handleDismiss = useCallback(() => {
    sessionStorage.setItem(DISMISS_KEY, currentMonthKey())
    setFadingOut(true)
    setTimeout(() => setCardState('hidden'), 200)
  }, [])

  const handlePlaceholderDismiss = useCallback(() => {
    localStorage.setItem(PLACEHOLDER_DISMISS_KEY, currentMonthKey())
    setFadingOut(true)
    setTimeout(() => setCardState('hidden'), 200)
  }, [])

  if (cardState === 'loading' || cardState === 'hidden') return null

  // ── Placeholder: user has never checked in ──
  if (cardState === 'placeholder') {
    return (
      <div
        className={`card-editorial overflow-hidden transition-all duration-200 ${
          fadingOut ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
        }`}
        data-testid="monthly-checkin-placeholder"
      >
        <div className="flex items-start gap-4 p-4 sm:p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)] bg-zinc-100">
            <Clock className="h-5 w-5 text-[var(--ink-3)]" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="label-editorial text-[var(--ink-3)]">Maandelijkse check-in</span>
                <h3 className="mt-1 text-sm font-semibold text-[var(--ink)]">
                  Hier verschijnt de eerste week van elke maand een check-in
                </h3>
              </div>
              <button
                type="button"
                onClick={handlePlaceholderDismiss}
                className="shrink-0 rounded-[var(--r-sm)] p-1.5 text-[var(--ink-4)] hover:text-[var(--ink-3)] hover:bg-[var(--subtle)] transition-colors"
                aria-label="Verberg melding"
                style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-1.5 text-xs text-[var(--ink-3)] leading-relaxed">
              In de eerste week van de maand kun je een korte geldcheck-in doen: je bekijkt je vermogen, budgetten en doelen
              en houdt zo je financiële voortgang bij.
            </p>

            {!previousCompleted && (
              <div className="mt-3 rounded-[var(--r)] border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <div>
                    <p className="text-xs font-medium text-amber-800">
                      Check-in voor {previousMonthLabel()} beschikbaar
                    </p>
                    <p className="mt-0.5 text-[11px] text-amber-700 leading-relaxed">
                      Je kunt alsnog de check-in van afgelopen maand doen. Let op: sommige getallen zijn mogelijk minder nauwkeurig doordat we verder terugkijken dan de start van je gebruik.
                    </p>
                    <Link
                      href={`/core/checkin?month=${previousMonthKey()}`}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700"
                    >
                      Check-in {previousMonthLabel()}
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Active check-in banner (first week of the month) ──
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
