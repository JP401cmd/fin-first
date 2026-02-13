'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { FfinAvatar } from '@/components/app/avatars'
import { formatCurrency } from '@/lib/format'
import type { FeatureAccessData } from '@/lib/compute-feature-access'

const PHASE_COLORS: Record<string, { gradient: string; badge: string }> = {
  recovery:  { gradient: 'from-rose-500 to-rose-600',  badge: 'bg-rose-100 text-rose-700' },
  stability: { gradient: 'from-blue-500 to-blue-600',  badge: 'bg-blue-100 text-blue-700' },
  momentum:  { gradient: 'from-teal-500 to-teal-600',  badge: 'bg-teal-100 text-teal-700' },
  mastery:   { gradient: 'from-amber-500 to-amber-600', badge: 'bg-amber-100 text-amber-700' },
}

const PHASE_LABELS: Record<string, string> = {
  recovery: 'Herstel',
  stability: 'Stabiliteit',
  momentum: 'Momentum',
  mastery: 'Meesterschap',
}

export function ActivationButton({ data }: { data: FeatureAccessData }) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [activating, setActivating] = useState(false)

  const colors = PHASE_COLORS[data.phase] ?? PHASE_COLORS.recovery
  const phaseLabel = PHASE_LABELS[data.phase] ?? data.phase

  const yearlyExpenses = data.monthlyExpenses * 12
  const freedomYears = yearlyExpenses > 0 ? Math.floor(data.netWorth / yearlyExpenses) : 0
  const freedomMonths = yearlyExpenses > 0 ? Math.floor(((data.netWorth / yearlyExpenses) - freedomYears) * 12) : 0

  async function handleActivate() {
    setActivating(true)
    try {
      const res = await fetch('/api/activate', { method: 'POST' })
      if (!res.ok) throw new Error('Activation failed')
      router.refresh()
    } catch {
      setActivating(false)
    }
  }

  return (
    <>
      {/* FAB — positioned left of chat FAB */}
      <button
        onClick={() => setShowModal(true)}
        className="group fixed bottom-6 right-[88px] z-50 flex h-14 w-14 items-center justify-center rounded-full bg-purple-600 text-white shadow-lg transition-transform hover:scale-105 active:scale-95 animate-pulse"
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
          <div className="mx-4 w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden">
            {/* Header */}
            <div className={`bg-gradient-to-r ${colors.gradient} px-6 py-8 text-center text-white`}>
              <div className="mx-auto mb-4 flex justify-center">
                <FfinAvatar size={72} />
              </div>
              <h2 className="text-xl font-bold">Klaar voor actie</h2>
              <p className="mt-1 text-sm text-white/90">Dit is je financiele startpositie</p>
              <div className="mt-3 flex justify-center">
                <span className={`rounded-full px-3 py-1 text-sm font-medium ${colors.badge}`}>
                  {phaseLabel}
                </span>
              </div>
            </div>

            {/* Body — 2x2 metrics grid */}
            <div className="px-6 py-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-xs font-medium text-zinc-500">Netto vermogen</p>
                  <p className={`mt-1 text-lg font-bold ${data.netWorth >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {formatCurrency(data.netWorth)}
                  </p>
                </div>

                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-xs font-medium text-zinc-500">Vrijheid</p>
                  <p className="mt-1 text-lg font-bold text-purple-700">
                    {data.freedomPct.toFixed(1)}%
                  </p>
                </div>

                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-xs font-medium text-zinc-500">Maandlasten</p>
                  <p className="mt-1 text-lg font-bold text-zinc-700">
                    {formatCurrency(data.monthlyExpenses)}
                  </p>
                </div>

                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-xs font-medium text-zinc-500">Vrijgekochte tijd</p>
                  <p className="mt-1 text-lg font-bold text-zinc-700">
                    {freedomYears > 0 ? `${freedomYears}j ` : ''}{freedomMonths}m
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-zinc-100 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                Later
              </button>
              <button
                onClick={handleActivate}
                disabled={activating}
                className={`rounded-lg bg-gradient-to-r ${colors.gradient} px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50`}
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
