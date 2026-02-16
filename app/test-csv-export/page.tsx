'use client'

import { useEffect, useState } from 'react'

/**
 * Test page for Feature #74: CSV export contains real user data.
 *
 * Verifies that:
 * 1. Export API queries real data from Supabase
 * 2. CSV row counts match database record counts
 * 3. No phantom or mock data rows appear
 * 4. All export types (transactions, debts, assets) use real user data
 */

interface VerificationResult {
  status: string
  verification: {
    all_data_from_database: boolean
    no_mock_data: boolean
    csv_row_counts_match_db: Record<string, boolean>
    export_uses_supabase_queries: boolean
    user_scoped_queries: boolean
  }
  counts: Record<string, number>
  errors: Record<string, string | null>
  details: Record<string, {
    count: number
    error: string | null
    csv_line_count: number
    sample_rows: Record<string, unknown>[]
    csv_preview: string
  }>
}

export default function TestCSVExportPage() {
  const [data, setData] = useState<VerificationResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/verify-csv-export')
      .then(res => res.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-xl font-bold">Test: CSV Export Verificatie</h1>
        <p className="mt-2 text-sm text-zinc-500">Laden...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-xl font-bold text-red-700">Test: CSV Export Verificatie</h1>
        <p className="mt-2 text-sm text-red-600">Fout: {error}</p>
      </div>
    )
  }

  if (!data) return null

  const allChecksPass = data.verification &&
    data.verification.all_data_from_database &&
    data.verification.no_mock_data &&
    data.verification.export_uses_supabase_queries &&
    data.verification.user_scoped_queries &&
    Object.values(data.verification.csv_row_counts_match_db).every(v => v)

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-bold text-zinc-900">Test: CSV Export Verificatie</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Feature #74 — CSV export contains real user data
      </p>

      {/* Overall status */}
      <div className={`mt-4 rounded-xl border p-4 ${allChecksPass ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
        <p className={`text-sm font-bold ${allChecksPass ? 'text-emerald-700' : 'text-red-700'}`}>
          {allChecksPass ? '✓ Alle verificaties geslaagd' : '✗ Verificaties gefaald'}
        </p>
        <p className="mt-1 text-xs text-zinc-600">
          API status: {data.status}
        </p>
      </div>

      {/* Verification checks */}
      <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-700">Verificatie checks</h2>
        <ul className="mt-3 space-y-2">
          <li className="flex items-center gap-2 text-sm">
            <span className={data.verification.all_data_from_database ? 'text-emerald-600' : 'text-red-600'}>
              {data.verification.all_data_from_database ? '✓' : '✗'}
            </span>
            Alle data komt uit de database
          </li>
          <li className="flex items-center gap-2 text-sm">
            <span className={data.verification.no_mock_data ? 'text-emerald-600' : 'text-red-600'}>
              {data.verification.no_mock_data ? '✓' : '✗'}
            </span>
            Geen mock/placeholder data
          </li>
          <li className="flex items-center gap-2 text-sm">
            <span className={data.verification.export_uses_supabase_queries ? 'text-emerald-600' : 'text-red-600'}>
              {data.verification.export_uses_supabase_queries ? '✓' : '✗'}
            </span>
            Export gebruikt Supabase queries
          </li>
          <li className="flex items-center gap-2 text-sm">
            <span className={data.verification.user_scoped_queries ? 'text-emerald-600' : 'text-red-600'}>
              {data.verification.user_scoped_queries ? '✓' : '✗'}
            </span>
            Queries zijn user-scoped (user_id filter)
          </li>
          {Object.entries(data.verification.csv_row_counts_match_db).map(([key, val]) => (
            <li key={key} className="flex items-center gap-2 text-sm">
              <span className={val ? 'text-emerald-600' : 'text-red-600'}>
                {val ? '✓' : '✗'}
              </span>
              CSV rij-telling klopt: {key} ({data.counts[key]} records → {data.details[key]?.csv_line_count} CSV regels)
            </li>
          ))}
        </ul>
      </section>

      {/* Data counts */}
      <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-700">Database records per type</h2>
        <div className="mt-3 grid grid-cols-3 gap-4">
          {Object.entries(data.counts).map(([type, count]) => (
            <div key={type} className="rounded-lg bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">{type}</p>
              <p className="mt-1 text-lg font-bold text-zinc-900">{count}</p>
              {data.errors[type] && (
                <p className="mt-1 text-xs text-red-500">{data.errors[type]}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* CSV Previews per type */}
      {Object.entries(data.details).map(([type, detail]) => (
        <section key={type} className="mt-4 rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-700">
            {type.charAt(0).toUpperCase() + type.slice(1)} — CSV Preview
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            {detail.count} records → {detail.csv_line_count} CSV regels (1 header + {detail.count} data)
          </p>

          {/* Sample DB rows */}
          {detail.sample_rows.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-zinc-500">Database records (sample):</p>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700">
                {JSON.stringify(detail.sample_rows, null, 2)}
              </pre>
            </div>
          )}

          {/* CSV preview */}
          {detail.csv_preview && (
            <div className="mt-3">
              <p className="text-xs font-medium text-zinc-500">CSV output (eerste regels):</p>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-amber-50 p-3 text-xs text-zinc-700 font-mono">
                {detail.csv_preview}
              </pre>
            </div>
          )}
        </section>
      ))}

      {/* Export API code verification */}
      <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-700">Export API Verificatie</h2>
        <ul className="mt-3 space-y-1.5 text-xs text-zinc-600">
          <li>• <code>/api/export?type=transactions</code> — queries <code>supabase.from(&apos;transactions&apos;).select(...).eq(&apos;user_id&apos;, user.id)</code></li>
          <li>• <code>/api/export?type=debts</code> — queries <code>supabase.from(&apos;debts&apos;).select(...).eq(&apos;user_id&apos;, user.id)</code></li>
          <li>• <code>/api/export?type=assets</code> — queries <code>supabase.from(&apos;assets&apos;).select(...).eq(&apos;user_id&apos;, user.id)</code></li>
          <li>• <code>/api/export?type=budgets</code> — queries <code>supabase.from(&apos;budgets&apos;).select(...).eq(&apos;user_id&apos;, user.id)</code></li>
          <li>• <code>/api/export?type=net_worth</code> — queries <code>supabase.from(&apos;net_worth_snapshots&apos;).select(...).eq(&apos;user_id&apos;, user.id)</code></li>
          <li>• <code>/api/export?type=goals</code> — queries <code>supabase.from(&apos;goals&apos;).select(...).eq(&apos;user_id&apos;, user.id)</code></li>
        </ul>
        <p className="mt-3 text-xs text-zinc-500">
          Alle export queries zijn user-scoped en bevatten geen mock data. De CSV wordt direct gegenereerd
          uit de database query resultaten met <code>escapeCSV()</code> en <code>toCSV()</code> helper functies.
        </p>
      </section>
    </div>
  )
}
