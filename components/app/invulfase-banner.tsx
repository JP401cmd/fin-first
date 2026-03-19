'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { X, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface NextStep {
  key: string
  title: string
  description: string
  href: string
  icon: string
  completed: boolean
}

interface NextStepsResponse {
  next_step: NextStep | null
  pending_steps: NextStep[]
  completed_count: number
  total_steps: number
}

export function InvulfaseBanner({ initialActive }: { initialActive: boolean }) {
  const [active, setActive] = useState(initialActive)
  const [nextSteps, setNextSteps] = useState<NextStepsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [dismissing, setDismissing] = useState(false)

  // Fetch next steps
  useEffect(() => {
    if (!active) return
    fetch('/api/next-steps')
      .then(r => r.json())
      .then(data => setNextSteps(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [active])

  const handleDismiss = useCallback(async () => {
    setDismissing(true)
    try {
      // Mark invulfase as inactive
      await fetch('/api/invulfase', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false }),
      })
      setActive(false)
    } catch {
      // Still dismiss visually even if API fails
      setActive(false)
    } finally {
      setDismissing(false)
    }
  }, [])

  if (!active) return null

  // While loading, show a minimal banner
  if (loading) {
    return (
      <div className="border-b border-kern-200 bg-kern-50/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-2.5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-kern-500" />
            <span className="text-sm font-medium text-kern-700">
              Invulfase laden...
            </span>
          </div>
        </div>
      </div>
    )
  }

  // If all steps are completed, auto-dismiss
  if (nextSteps && nextSteps.pending_steps.length === 0) {
    return null
  }

  var completedCount = nextSteps?.completed_count ?? 0
  var totalSteps = nextSteps?.total_steps ?? 0
  var progressPct = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0
  var currentStep = nextSteps?.next_step

  return (
    <div className="border-b border-kern-200 bg-gradient-to-r from-kern-50 to-kern-50/60">
      <div className="mx-auto max-w-6xl px-6 py-3">
        {/* Main banner row */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-kern-100">
              <Sparkles className="h-3.5 w-3.5 text-kern-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-kern-800">
                  Invulfase
                </span>
                <span className="rounded-full bg-kern-100 px-2 py-0.5 text-[10px] font-medium tabular-nums text-kern-600">
                  {completedCount}/{totalSteps}
                </span>
              </div>
              {currentStep && (
                <p className="mt-0.5 truncate text-xs text-kern-600">
                  Volgende stap: {currentStep.title}
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* Progress bar (compact) */}
            <div className="hidden w-20 sm:block">
              <div className="h-1.5 overflow-hidden rounded-full bg-kern-200">
                <div
                  className="h-full rounded-full bg-kern-500 transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Next step link */}
            {currentStep && (
              <Link
                href={currentStep.href}
                className="inline-flex items-center gap-1 rounded-lg bg-kern-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-kern-700"
              >
                <span className="hidden sm:inline">Volgende stap</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}

            {/* Dismiss button */}
            <button
              onClick={handleDismiss}
              disabled={dismissing}
              className="rounded-md p-1 text-kern-400 transition-colors hover:bg-kern-100 hover:text-kern-600 disabled:opacity-50"
              aria-label="Invulfase afronden"
              title="Invulfase afronden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Welcome card shown on /core after onboarding.
 * Displays next-steps suggestions in a card layout.
 */
export function InvulfaseWelcomeCard() {
  const [nextSteps, setNextSteps] = useState<NextStepsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  const [invulfaseActive, setInvulfaseActive] = useState(false)

  useEffect(() => {
    // Check if invulfase is active
    fetch('/api/invulfase')
      .then(r => r.json())
      .then(data => {
        setInvulfaseActive(data.active)
        if (data.active) {
          // Only fetch next steps if invulfase is active
          return fetch('/api/next-steps')
            .then(r => r.json())
            .then(steps => setNextSteps(steps))
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (!invulfaseActive || dismissed || loading) return null
  if (!nextSteps || nextSteps.pending_steps.length === 0) return null

  // Show max 3 pending steps
  var visibleSteps = nextSteps.pending_steps.slice(0, 3)

  return (
    <div className="card-editorial mb-6 overflow-hidden border-l-3 border-kern-400">
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-kern-100">
              <Sparkles className="h-4.5 w-4.5 text-kern-600" />
            </div>
            <div>
              <h3 className="font-display text-sm font-semibold text-[var(--ink)]">
                Welkom bij TriFinity!
              </h3>
              <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                Vul je gegevens verder aan om het meeste uit de app te halen.
              </p>
            </div>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="rounded-md p-1 text-[var(--ink-4)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-3)]"
            aria-label="Sluiten"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Steps list */}
        <div className="mt-4 space-y-2">
          {visibleSteps.map(function(step) {
            return (
              <Link
                key={step.key}
                href={step.href}
                className="group flex items-center gap-3 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2.5 transition-colors hover:border-kern-300 hover:bg-kern-50/50"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--ink-4)] group-hover:text-kern-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--ink-2)] group-hover:text-[var(--ink)]">
                    {step.title}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-[var(--ink-4)]">
                    {step.description}
                  </p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--ink-4)] transition-transform group-hover:translate-x-0.5 group-hover:text-kern-500" />
              </Link>
            )
          })}
        </div>

        {/* Progress indicator */}
        <div className="mt-4 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--subtle)]">
            <div
              className="h-full rounded-full bg-kern-500 transition-all duration-500"
              style={{ width: `${nextSteps.total_steps > 0 ? Math.round((nextSteps.completed_count / nextSteps.total_steps) * 100) : 0}%` }}
            />
          </div>
          <span className="text-[11px] font-medium tabular-nums text-[var(--ink-4)]">
            {nextSteps.completed_count}/{nextSteps.total_steps} stappen
          </span>
        </div>
      </div>
    </div>
  )
}
