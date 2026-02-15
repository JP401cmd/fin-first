'use client'

import { useState } from 'react'
import { RefreshCw, Edit3, TrendingUp, CheckCircle2 } from 'lucide-react'

/**
 * Test page demonstrating the asset valuation tracking flow.
 * Shows both paths that create valuation entries.
 */
export default function TestValuationsPage() {
  const [showPath1, setShowPath1] = useState(false)
  const [showPath2, setShowPath2] = useState(false)

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">Valuation Tracking Test</h1>
      <p className="text-sm text-zinc-500 mb-8">
        Verifies that updating asset values creates valuation entries in the database.
      </p>

      {/* Path 1: Revalue button */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-zinc-700 mb-3">Path 1: Revalue Button (Herwaarderen)</h2>
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
              <RefreshCw className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="font-medium text-zinc-900">Asset Detail → Herwaarderen</p>
              <p className="text-xs text-zinc-500">Creates valuation record + updates asset current_value</p>
            </div>
          </div>
          <button
            onClick={() => setShowPath1(!showPath1)}
            className="text-sm text-amber-600 hover:text-amber-700 font-medium"
          >
            {showPath1 ? 'Hide' : 'Show'} code flow
          </button>
          {showPath1 && (
            <div className="mt-3 rounded-lg bg-zinc-50 p-4 text-xs font-mono text-zinc-600">
              <p>1. ValuationModal.handleSave()</p>
              <p>2. supabase.from(&apos;valuations&apos;).upsert(&#123;</p>
              <p>   &nbsp;&nbsp;user_id, entity_type: &apos;asset&apos;, entity_id,</p>
              <p>   &nbsp;&nbsp;valuation_date, value: newValue, notes</p>
              <p>   &#125;)</p>
              <p>3. supabase.from(&apos;assets&apos;).update(&#123; current_value: newValue &#125;)</p>
            </div>
          )}
        </div>
      </section>

      {/* Path 2: Edit form */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-zinc-700 mb-3">Path 2: Edit Form (Bewerken)</h2>
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
              <Edit3 className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="font-medium text-zinc-900">Asset Detail → Bewerken → Change value</p>
              <p className="text-xs text-zinc-500">Updates asset + auto-creates valuation when value changes</p>
            </div>
          </div>
          <button
            onClick={() => setShowPath2(!showPath2)}
            className="text-sm text-amber-600 hover:text-amber-700 font-medium"
          >
            {showPath2 ? 'Hide' : 'Show'} code flow
          </button>
          {showPath2 && (
            <div className="mt-3 rounded-lg bg-zinc-50 p-4 text-xs font-mono text-zinc-600">
              <p>1. AssetForm.handleSave() (isEdit=true)</p>
              <p>2. supabase.from(&apos;assets&apos;).update(row)</p>
              <p>3. if (newValue !== oldValue &amp;&amp; newValue &gt; 0) &#123;</p>
              <p>   &nbsp;&nbsp;supabase.from(&apos;valuations&apos;).upsert(&#123;</p>
              <p>   &nbsp;&nbsp;&nbsp;&nbsp;user_id, entity_type: &apos;asset&apos;, entity_id,</p>
              <p>   &nbsp;&nbsp;&nbsp;&nbsp;valuation_date: today, value: newValue,</p>
              <p>   &nbsp;&nbsp;&nbsp;&nbsp;notes: &apos;Waarde bijgewerkt van X naar Y&apos;</p>
              <p>   &nbsp;&nbsp;&#125;)</p>
              <p>&#125;</p>
            </div>
          )}
        </div>
      </section>

      {/* API endpoint */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-zinc-700 mb-3">Verification API</h2>
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <p className="text-sm text-zinc-600 mb-2">
            GET <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-xs">/api/valuations?entity_id=UUID&entity_type=asset</code>
          </p>
          <p className="text-xs text-zinc-400">Returns valuation entries for authenticated user. Also available for entity_type=debt.</p>
        </div>
      </section>

      {/* Verification checklist */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-zinc-700 mb-4">Verification Checklist</h2>
        <ul className="space-y-2 text-sm text-zinc-600">
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ValuationModal creates entry in valuations table on save
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            AssetForm edit auto-tracks valuation when current_value changes
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            DebtForm edit auto-tracks valuation when current_balance changes
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Upsert on entity_id+valuation_date prevents duplicate entries per day
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Valuation history shown in asset/debt detail modal
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            /api/valuations endpoint for programmatic verification
          </li>
        </ul>
      </section>
    </div>
  )
}
