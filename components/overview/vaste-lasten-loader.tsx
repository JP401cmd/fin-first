'use client'

import { useEffect, useState } from 'react'
import {
  VasteKostenAnalyse,
  type RecurringItem,
} from '@/components/will/vaste-kosten-analyse'
type ApiResponse = {
  subscriptions?: RecurringItem[]
  vasteKosten?: RecurringItem[]
}

/**
 * Client-loader voor de Vaste-lasten view in CashflowViewSwitcher.
 * Fetcht /api/subscriptions (zelfde endpoint als WillLanding gebruikt)
 * en geeft door aan VasteKostenAnalyse — geen eigen logica, alleen
 * data-orchestratie zodat we de bestaande analyse-component kunnen
 * hergebruiken zonder hem te wijzigen.
 *
 * onCancellationOpen + onRefresh worden hier minimal afgehandeld:
 * - onCancellationOpen is een no-op want we hebben hier geen modal-host;
 *   user moet voor cancellation naar WillLanding
 * - onRefresh herrefresht alleen lokaal de fetch
 */
export function VasteLastenLoader({
  fullName,
}: {
  fullName?: string | null
}) {
  const [subscriptions, setSubscriptions] = useState<RecurringItem[]>([])
  const [vasteKosten, setVasteKosten] = useState<RecurringItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/subscriptions')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as ApiResponse
      setSubscriptions(data.subscriptions ?? [])
      setVasteKosten(data.vasteKosten ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Onbekende fout')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const totalMonthlySubscriptions = subscriptions.reduce(
    (s, i) => s + i.monthlyAmount,
    0,
  )
  const totalMonthlyVasteKosten = vasteKosten.reduce(
    (s, i) => s + i.monthlyAmount,
    0,
  )
  const totalMonthly = totalMonthlySubscriptions + totalMonthlyVasteKosten

  if (loading) {
    return (
      <section className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
        <p className="text-sm text-[var(--ink-3)]">Vaste lasten laden…</p>
      </section>
    )
  }
  if (error) {
    return (
      <section className="rounded-2xl border border-[var(--border-md)] bg-[var(--paper)] p-6">
        <p className="text-sm text-amber-700">
          Fout bij ophalen vaste lasten: {error}
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-2 text-xs font-semibold text-violet-700 underline-offset-2 hover:underline"
        >
          Opnieuw proberen
        </button>
      </section>
    )
  }
  if (subscriptions.length === 0 && vasteKosten.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-6 sm:p-8 text-center">
        <p className="text-sm text-[var(--ink-2)] mb-2">
          Geen vaste lasten herkend.
        </p>
        <p className="text-xs text-[var(--ink-3)]">
          Will herkent terugkerende uitgaven automatisch zodra je transacties
          importeert.
        </p>
      </section>
    )
  }

  // No-op cancellation handler — voor opzeg-flows verwijst de view de
  // gebruiker naar WillLanding op /overzicht (waar de cancellation-modal
  // gemount is). De prop signature heeft een metadata-arg maar we
  // negeren deze hier.
  const handleCancellation = () => {
    // intentional no-op
  }

  return (
    <VasteKostenAnalyse
      subscriptions={subscriptions}
      vasteKosten={vasteKosten}
      totalMonthlySubscriptions={totalMonthlySubscriptions}
      totalMonthlyVasteKosten={totalMonthlyVasteKosten}
      totalMonthly={totalMonthly}
      userProfile={fullName ? { full_name: fullName } : null}
      onCancellationOpen={handleCancellation}
      onRefresh={refresh}
      collapsible={false}
    />
  )
}
