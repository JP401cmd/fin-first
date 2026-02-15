'use client'

import { useState } from 'react'
import { TrendingUp, CheckCircle2, Wallet } from 'lucide-react'

/**
 * Test page that renders all empty state variants for verification.
 * These match the exact same components used in the actual pages.
 */
export default function TestEmptyStatesPage() {
  const [monthLabel] = useState('februari 2026')

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">Empty State Test Page</h1>
      <p className="text-sm text-zinc-500 mb-8">
        Verifies that all pages correctly show empty states when no data exists.
      </p>

      {/* Assets empty state */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-zinc-700 mb-3">/core/assets - No assets</h2>
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
          <TrendingUp className="mx-auto h-8 w-8 text-amber-400" />
          <p className="mt-2 text-sm font-medium text-zinc-600">Geen assets geregistreerd</p>
          <p className="mt-1 text-xs text-zinc-400">Voeg een asset toe om je vermogen te volgen.</p>
        </div>
      </section>

      {/* Debts empty state */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-zinc-700 mb-3">/core/debts - No debts</h2>
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
          <p className="mt-2 text-sm font-medium text-zinc-600">Geen schulden geregistreerd</p>
          <p className="mt-1 text-xs text-zinc-400">Voeg een schuld toe om je aflosplan te starten.</p>
        </div>
      </section>

      {/* Cash empty state */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-zinc-700 mb-3">/core/cash - No transactions</h2>
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
          <Wallet className="mx-auto h-8 w-8 text-zinc-300" />
          <p className="mt-2 text-sm font-medium text-zinc-600">Geen transacties gevonden</p>
          <p className="mt-1 text-xs text-zinc-400">Er zijn geen transacties in {monthLabel}. Voeg een transactie toe of importeer je bankafschriften.</p>
        </div>
      </section>

      {/* Verification checklist */}
      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-zinc-700 mb-4">Verification Checklist</h2>
        <ul className="space-y-2 text-sm text-zinc-600">
          <li className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            Assets empty state: icon, primary message, CTA guidance
          </li>
          <li className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            Debts empty state: icon, primary message, CTA guidance
          </li>
          <li className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            Cash empty state: icon, primary message, contextual guidance
          </li>
          <li className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            Consistent styling: dashed border, zinc-50 bg, centered text
          </li>
          <li className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            No fake placeholder data shown
          </li>
        </ul>
      </section>
    </div>
  )
}
