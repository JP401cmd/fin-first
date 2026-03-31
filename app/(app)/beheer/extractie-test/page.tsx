'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FlaskConical, Loader2, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react'
import { formatCurrency } from '@/lib/format'

// ── Types matching the extraction schema ────────────────────────

interface ExtractedAsset {
  name: string
  asset_type: string
  estimated_value: number
}

interface ExtractedDebt {
  name: string
  debt_type: string
  estimated_balance: number
}

interface ExtractedLifeEvent {
  name: string
  event_type: string
  target_age: number | null
  description: string
}

interface ExtractionResult {
  assets: ExtractedAsset[]
  debts: ExtractedDebt[]
  life_events: ExtractedLifeEvent[]
  monthly_income_estimate: number | null
  monthly_expenses_estimate: number | null
  financial_context_remainder: string
}

// ── Asset / debt type labels ────────────────────────────────────

const ASSET_TYPE_LABELS: Record<string, string> = {
  cash: 'Contant',
  savings: 'Spaargeld',
  investment: 'Belegging',
  retirement: 'Pensioen',
  eigen_huis: 'Eigen huis',
  real_estate: 'Vastgoed',
  crypto: 'Crypto',
  vehicle: 'Voertuig',
  physical: 'Fysiek bezit',
  other: 'Overig',
}

const DEBT_TYPE_LABELS: Record<string, string> = {
  mortgage: 'Hypotheek',
  personal_loan: 'Persoonlijke lening',
  student_loan: 'Studieschuld',
  car_loan: 'Autolening',
  credit_card: 'Creditcard',
  revolving_credit: 'Doorlopend krediet',
  payment_plan: 'Betalingsregeling',
  belastingschuld: 'Belastingschuld',
  familielening: 'Familielening',
  other: 'Overig',
}

// ── Page Component ──────────────────────────────────────────────

export default function ExtractieTestPage() {
  const [text, setText] = useState('')
  const [age, setAge] = useState<string>('')
  const [householdType, setHouseholdType] = useState<string>('')
  const [monthlyIncome, setMonthlyIncome] = useState<string>('')
  const [monthlyExpenses, setMonthlyExpenses] = useState<string>('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ExtractionResult | null>(null)
  const [showRawJson, setShowRawJson] = useState(false)

  async function handleExtract() {
    if (!text.trim()) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const body: Record<string, unknown> = { text: text.trim() }
      if (age) body.age = parseInt(age, 10)
      if (householdType) body.householdType = householdType
      if (monthlyIncome) body.monthlyIncome = parseInt(monthlyIncome, 10)
      if (monthlyExpenses) body.monthlyExpenses = parseInt(monthlyExpenses, 10)

      const res = await fetch('/api/admin/extraction-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Extractie mislukt')
      }

      const data: ExtractionResult = await res.json()
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Onbekende fout bij extractie')
    } finally {
      setLoading(false)
    }
  }

  const hasAssets = result && result.assets.length > 0
  const hasDebts = result && result.debts.length > 0
  const hasLifeEvents = result && result.life_events.length > 0
  const hasRemainder = result && result.financial_context_remainder.length > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-[var(--ink-3)]" />
            <h2 className="text-xl font-bold text-[var(--ink)]">Extractie Test</h2>
          </div>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            Test de AI-extractie van vrije tekst zonder iets op te slaan in de database.
          </p>
        </div>
        <Link
          href="/beheer/prompts"
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
        >
          Prompt bewerken
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Input section */}
      <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--ink-2)]">
            Vrije tekst
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Beschrijf een financiele situatie... bijv. 'Ik heb een koophuis van 350k, hypotheek van 280k, 15k spaargeld'"
            rows={4}
            className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)] resize-y"
          />
        </div>

        {/* Optional context fields */}
        <div>
          <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-[var(--ink-3)]">
            Optionele profielcontext
          </label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs text-[var(--ink-3)]">Leeftijd</label>
              <input
                type="number"
                min={18}
                max={100}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="bijv. 32"
                className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--ink-3)]">Huishoudtype</label>
              <select
                value={householdType}
                onChange={(e) => setHouseholdType(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)]"
              >
                <option value="">-- kies --</option>
                <option value="solo">Solo</option>
                <option value="samen">Samen</option>
                <option value="gezin">Gezin</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--ink-3)]">Maandinkomen</label>
              <input
                type="number"
                min={0}
                value={monthlyIncome}
                onChange={(e) => setMonthlyIncome(e.target.value)}
                placeholder="netto"
                className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--ink-3)]">Maanduitgaven</label>
              <input
                type="number"
                min={0}
                value={monthlyExpenses}
                onChange={(e) => setMonthlyExpenses(e.target.value)}
                placeholder="totaal"
                className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)]"
              />
            </div>
          </div>
        </div>

        {/* Extract button */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleExtract}
            disabled={loading || !text.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Extraheren...
              </>
            ) : (
              <>
                <FlaskConical className="h-3.5 w-3.5" />
                Extraheer
              </>
            )}
          </button>
          {loading && (
            <span className="text-xs text-[var(--ink-3)]">
              Dit kan enkele seconden duren...
            </span>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Assets table */}
          <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
            <div className="border-b border-[var(--border-ed)] px-4 py-3">
              <h3 className="text-sm font-semibold text-[var(--ink)]">
                Bezittingen
                <span className="ml-2 text-xs font-normal text-[var(--ink-3)]">
                  ({result.assets.length})
                </span>
              </h3>
            </div>
            {hasAssets ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--subtle)] text-left text-xs font-medium uppercase tracking-wider text-[var(--ink-3)]">
                    <th className="px-4 py-2">Naam</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2 text-right">Geschatte waarde</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-ed)]">
                  {result.assets.map((a, i) => (
                    <tr key={i} className="hover:bg-[var(--subtle)] transition-colors">
                      <td className="px-4 py-2 text-[var(--ink)]">{a.name}</td>
                      <td className="px-4 py-2 text-[var(--ink-3)]">
                        {ASSET_TYPE_LABELS[a.asset_type] ?? a.asset_type}
                      </td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-[var(--ink)]">
                        {formatCurrency(a.estimated_value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-4 py-3 text-sm text-[var(--ink-3)]">Geen bezittingen gedetecteerd</p>
            )}
          </div>

          {/* Debts table */}
          <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
            <div className="border-b border-[var(--border-ed)] px-4 py-3">
              <h3 className="text-sm font-semibold text-[var(--ink)]">
                Schulden
                <span className="ml-2 text-xs font-normal text-[var(--ink-3)]">
                  ({result.debts.length})
                </span>
              </h3>
            </div>
            {hasDebts ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--subtle)] text-left text-xs font-medium uppercase tracking-wider text-[var(--ink-3)]">
                    <th className="px-4 py-2">Naam</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2 text-right">Geschat saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-ed)]">
                  {result.debts.map((d, i) => (
                    <tr key={i} className="hover:bg-[var(--subtle)] transition-colors">
                      <td className="px-4 py-2 text-[var(--ink)]">{d.name}</td>
                      <td className="px-4 py-2 text-[var(--ink-3)]">
                        {DEBT_TYPE_LABELS[d.debt_type] ?? d.debt_type}
                      </td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-[var(--ink)]">
                        {formatCurrency(d.estimated_balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-4 py-3 text-sm text-[var(--ink-3)]">Geen schulden gedetecteerd</p>
            )}
          </div>

          {/* Life events table */}
          <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
            <div className="border-b border-[var(--border-ed)] px-4 py-3">
              <h3 className="text-sm font-semibold text-[var(--ink)]">
                Levensgebeurtenissen
                <span className="ml-2 text-xs font-normal text-[var(--ink-3)]">
                  ({result.life_events.length})
                </span>
              </h3>
            </div>
            {hasLifeEvents ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--subtle)] text-left text-xs font-medium uppercase tracking-wider text-[var(--ink-3)]">
                    <th className="px-4 py-2">Naam</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2">Leeftijd</th>
                    <th className="px-4 py-2">Beschrijving</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-ed)]">
                  {result.life_events.map((le, i) => (
                    <tr key={i} className="hover:bg-[var(--subtle)] transition-colors">
                      <td className="px-4 py-2 text-[var(--ink)]">{le.name}</td>
                      <td className="px-4 py-2 text-[var(--ink-3)]">{le.event_type}</td>
                      <td className="px-4 py-2 font-mono tabular-nums text-[var(--ink)]">
                        {le.target_age != null ? le.target_age : '--'}
                      </td>
                      <td className="px-4 py-2 text-[var(--ink-3)]">{le.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-4 py-3 text-sm text-[var(--ink-3)]">Geen levensgebeurtenissen gedetecteerd</p>
            )}
          </div>

          {/* Profile enrichment */}
          <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
            <h3 className="text-sm font-semibold text-[var(--ink)] mb-3">Profielverrijking</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-[var(--ink-3)]">Inkomen schatting</div>
                <div className="mt-0.5 text-sm font-mono tabular-nums text-[var(--ink)]">
                  {result.monthly_income_estimate != null
                    ? formatCurrency(result.monthly_income_estimate) + ' /mnd'
                    : 'Niet afgeleid'}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--ink-3)]">Uitgaven schatting</div>
                <div className="mt-0.5 text-sm font-mono tabular-nums text-[var(--ink)]">
                  {result.monthly_expenses_estimate != null
                    ? formatCurrency(result.monthly_expenses_estimate) + ' /mnd'
                    : 'Niet afgeleid'}
                </div>
              </div>
            </div>
          </div>

          {/* Remainder text */}
          {hasRemainder && (
            <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
              <h3 className="text-sm font-semibold text-[var(--ink)] mb-2">Resttext</h3>
              <div className="rounded-lg bg-[var(--subtle)] px-4 py-3 text-sm text-[var(--ink-2)]">
                {result.financial_context_remainder}
              </div>
            </div>
          )}

          {/* Raw JSON collapsible */}
          <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
            <button
              type="button"
              onClick={() => setShowRawJson(!showRawJson)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
            >
              <span>Raw JSON</span>
              {showRawJson ? (
                <ChevronUp className="h-4 w-4 text-[var(--ink-3)]" />
              ) : (
                <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" />
              )}
            </button>
            {showRawJson && (
              <div className="border-t border-[var(--border-ed)] px-4 py-3">
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--subtle)] p-4 text-xs text-[var(--ink-2)] font-mono leading-relaxed">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
