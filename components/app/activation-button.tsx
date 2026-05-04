'use client'

import React, { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { FfinAvatar } from '@/components/app/avatars'

import type { FeatureAccessData } from '@/lib/compute-feature-access'
import { MaskedAmount } from '@/components/app/masked-amount'

const PHASE_GRADIENT_STYLE: Record<string, React.CSSProperties> = {
  recovery:  { background: 'linear-gradient(to right, var(--color-phase-recovery-500), var(--color-phase-recovery-600))' },
  stability: { background: 'linear-gradient(to right, var(--color-phase-stability-500), var(--color-phase-stability-600))' },
  momentum:  { background: 'linear-gradient(to right, var(--color-phase-momentum-500), var(--color-phase-momentum-600))' },
  mastery:   { background: 'linear-gradient(to right, var(--color-phase-mastery-500), var(--color-phase-mastery-600))' },
}

const PHASE_BADGE_STYLE: Record<string, React.CSSProperties> = {
  recovery:  { backgroundColor: 'var(--color-phase-recovery-100)',  color: 'var(--color-phase-recovery-700)' },
  stability: { backgroundColor: 'var(--color-phase-stability-100)', color: 'var(--color-phase-stability-700)' },
  momentum:  { backgroundColor: 'var(--color-phase-momentum-100)',  color: 'var(--color-phase-momentum-700)' },
  mastery:   { backgroundColor: 'var(--color-phase-mastery-100)',   color: 'var(--color-phase-mastery-700)' },
}

const PHASE_LABELS: Record<string, string> = {
  recovery: 'Herstel',
  stability: 'Stabiliteit',
  momentum: 'Momentum',
  mastery: 'Meesterschap',
}

export function ActivationButton({ data }: { data: FeatureAccessData }) {
  const [showModal, setShowModal] = useState(false)
  const [activating, setActivating] = useState(false)

  const gradientStyle = PHASE_GRADIENT_STYLE[data.phase] ?? PHASE_GRADIENT_STYLE.recovery
  const badgeStyle = PHASE_BADGE_STYLE[data.phase] ?? PHASE_BADGE_STYLE.recovery
  const phaseLabel = PHASE_LABELS[data.phase] ?? data.phase

  const yearlyExpenses = data.monthlyExpenses * 12
  const freedomYears = yearlyExpenses > 0 ? Math.floor(data.netWorth / yearlyExpenses) : 0
  const freedomMonths = yearlyExpenses > 0 ? Math.floor(((data.netWorth / yearlyExpenses) - freedomYears) * 12) : 0

  async function handleActivate() {
    setActivating(true)
    try {
      const res = await fetch('/api/activate', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (body.error === 'Already activated') {
          window.location.href = '/will'
          return
        }
        throw new Error('Activation failed')
      }
      window.location.href = '/will'
    } catch {
      setActivating(false)
    }
  }

  return (
    <>
      {/* FAB — positioned left of chat FAB */}
      <button
        onClick={() => setShowModal(true)}
        className="group fixed bottom-[calc(var(--bottom-nav-height)+1.5rem)] right-[88px] z-50 flex h-14 w-14 items-center justify-center rounded-full bg-horizon-600 text-white shadow-[var(--s2)] transition-transform hover:scale-105 active:scale-95 animate-pulse md:bottom-6"
        title="Bekijk je startpositie en activeer je routekaart"
      >
        <Sparkles className="h-6 w-6" />
        {/* Tooltip */}
        <span className="pointer-events-none absolute bottom-full right-0 mb-2 w-56 rounded-lg bg-zinc-900 px-3 py-2 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
          Bekijk je startpositie en activeer je routekaart
        </span>
      </button>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-lg rounded-[var(--r-lg)] bg-[var(--paper)] shadow-xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-8 text-center text-white" style={gradientStyle}>
              <div className="mx-auto mb-4 flex justify-center">
                <FfinAvatar size={72} />
              </div>
              <h2 className="text-xl font-bold">Klaar voor actie</h2>
              <p className="mt-1 text-sm text-white/90">Dit is je financiele startpositie</p>
              <div className="mt-3 flex justify-center">
                <span className="rounded-full px-3 py-1 text-sm font-medium" style={badgeStyle}>
                  {phaseLabel}
                </span>
              </div>
            </div>

            {/* Body — 2x2 metrics grid */}
            <div className="px-6 py-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
                  <p className="text-xs font-medium text-[var(--ink-3)]">Netto vermogen</p>
                  <p className={`mt-1 text-lg font-bold ${data.netWorth >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {<MaskedAmount value={data.netWorth} tone="kern" />}
                  </p>
                </div>

                <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
                  <p className="text-xs font-medium text-[var(--ink-3)]">Vrijheid</p>
                  <p className="mt-1 text-lg font-bold text-horizon-700">
                    {data.freedomPct.toFixed(1)}%
                  </p>
                </div>

                <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
                  <p className="text-xs font-medium text-[var(--ink-3)]">Maandlasten</p>
                  <p className="mt-1 text-lg font-bold text-[var(--ink-2)]">
                    {<MaskedAmount value={data.monthlyExpenses} tone="kern" />}
                  </p>
                </div>

                <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] p-4">
                  <p className="text-xs font-medium text-[var(--ink-3)]">Vrijgekochte tijd</p>
                  <p className="mt-1 text-lg font-bold text-[var(--ink-2)]">
                    {freedomYears > 0 ? `${freedomYears}j ` : ''}{freedomMonths}m
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-[var(--border-ed)] px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-[var(--border-md)] px-4 py-2.5 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
              >
                Later
              </button>
              <button
                onClick={handleActivate}
                disabled={activating}
                className="rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={gradientStyle}
              >
                {activating ? 'Activeren...' : 'Activeer mijn routekaart'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
