'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Printer } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/format'
import { ASSET_TYPE_LABELS } from '@/lib/asset-data'
import { DEBT_TYPE_LABELS } from '@/lib/debt-data'
import type { BalansData } from '@/app/api/report/balans/route'
import { eurToFreedomTime } from '@/components/app/freedom-time-label'

type AssetType = keyof typeof ASSET_TYPE_LABELS
type DebtType = keyof typeof DEBT_TYPE_LABELS

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {}
  for (const item of items) {
    const key = keyFn(item)
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  }
  return groups
}

export default function BalansPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0]

  const [data, setData] = useState<BalansData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchBalans() {
      try {
        const res = await fetch(`/api/report/balans?date=${date}`)
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Balans laden mislukt')
        }
        const balansData: BalansData = await res.json()
        setData(balansData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Balans laden mislukt')
      } finally {
        setLoading(false)
      }
    }
    fetchBalans()
  }, [date])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
          <p className="font-inter text-sm text-[var(--ink-3)]">Balans wordt opgesteld...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="font-playfair text-xl text-[var(--ink)]">Balans niet beschikbaar</p>
          <p className="mt-2 font-inter text-sm text-[var(--ink-3)]">{error || 'Geen data gevonden'}</p>
        </div>
      </div>
    )
  }

  const displayDate = new Date(data.date).toLocaleDateString('nl-NL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const generatedDate = new Date(data.generatedAt).toLocaleDateString('nl-NL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  // Group assets by type
  const assetsByType = groupBy(data.assets, a => a.assetType)
  const assetTypeOrder = Object.keys(ASSET_TYPE_LABELS) as AssetType[]
  const sortedAssetTypes = assetTypeOrder.filter(t => assetsByType[t]?.length)

  // Group debts by type
  const debtsByType = groupBy(data.debts, d => d.debtType)
  const debtTypeOrder = Object.keys(DEBT_TYPE_LABELS) as DebtType[]
  const sortedDebtTypes = debtTypeOrder.filter(t => debtsByType[t]?.length)

  // Freedom time for net worth
  const freedom = data.dailyExpenseRate > 0 && data.netWorth >= 100
    ? eurToFreedomTime(data.netWorth, data.dailyExpenseRate)
    : null

  return (
    <div className="mx-auto max-w-[720px] px-4 py-6 md:px-8">
      {/* Toolbar */}
      <div data-print-hide className="mb-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push('/rapportages')}
          className="flex items-center gap-2 font-inter text-sm text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Terug naar rapportages
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-4 py-2 font-inter text-sm font-medium text-[var(--ink)] shadow-[var(--s0)] transition-all hover:shadow-[var(--s1)] hover:-translate-y-px"
        >
          <Printer className="h-4 w-4" />
          Afdrukken als PDF
        </button>
      </div>

      {/* Masthead */}
      <div className="border-b-2 border-[var(--ink)] pb-4 mb-8">
        <p className="text-center font-inter text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)] mb-2">
          Persoonlijke Balans
        </p>
        <h1 className="text-center font-playfair text-4xl font-bold tracking-tight text-[var(--ink)] md:text-5xl" style={{ letterSpacing: '-0.03em' }}>
          {displayDate}
        </h1>
        <div className="mt-3 flex items-center justify-center gap-2 text-[13px] font-source-serif italic text-[var(--ink-3)]">
          {data.displayName && <span>{data.displayName}</span>}
          {data.displayName && <span>&middot;</span>}
          <span>Gegenereerd {generatedDate}</span>
        </div>
      </div>

      {/* Balance Sheet — Kassabon style */}
      <div className="rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 p-4 font-mono text-sm">
        {/* Header */}
        <div className="mb-3 text-center">
          <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
            VERMOGENSBALANS
          </p>
          <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
            Peildatum {new Date(data.date).toLocaleDateString('nl-NL')}
          </p>
        </div>

        {/* Uitleg */}
        <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
          Je persoonlijke balans toont een momentopname van al je bezittingen en schulden.
          Het netto vermogen is het verschil — de vrijheid die je tot nu toe hebt opgebouwd.
        </div>

        {/* ── ACTIVA ── */}
        <div className="mb-2 mt-3">
          <p className="font-sans text-[10px] font-bold uppercase tracking-[0.08em] text-kern-600 mb-2">
            Activa (bezittingen)
          </p>

          {sortedAssetTypes.map(type => {
            const items = assetsByType[type]!
            const subtotal = items.reduce((sum, a) => sum + a.weightedValue, 0)
            return (
              <div key={type} className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2">
                <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-3)]">
                  {ASSET_TYPE_LABELS[type] || type}
                </p>
                {items.map(a => (
                  <div key={a.id} className="flex justify-between py-0.5">
                    <span className="font-sans text-sm text-[var(--ink-2)]">
                      {a.name}
                      {a.inclusionPct < 100 && (
                        <span className="ml-1 text-[10px] text-[var(--ink-4)]">({a.inclusionPct}%)</span>
                      )}
                    </span>
                    <span className="tabular-nums text-[var(--ink)]">{formatCurrency(a.weightedValue)}</span>
                  </div>
                ))}
                {items.length > 1 && (
                  <div className="flex justify-between pt-0.5 text-[var(--ink-2)]">
                    <span className="font-sans text-xs italic">Subtotaal</span>
                    <span className="tabular-nums text-xs">{formatCurrency(subtotal)}</span>
                  </div>
                )}
              </div>
            )
          })}

          {/* Total Assets */}
          <div className="flex justify-between border-t border-[var(--ink-3)] pt-1 font-bold">
            <span className="font-sans text-sm text-[var(--ink)]">Totaal activa</span>
            <span className="tabular-nums text-[var(--ink)]">{formatCurrency(data.totalAssets)}</span>
          </div>
        </div>

        {/* ── PASSIVA ── */}
        {data.debts.length > 0 && (
          <div className="mb-2 mt-4">
            <p className="font-sans text-[10px] font-bold uppercase tracking-[0.08em] text-red-600 mb-2">
              Passiva (schulden)
            </p>

            {sortedDebtTypes.map(type => {
              const items = debtsByType[type]!
              const subtotal = items.reduce((sum, d) => sum + d.weightedBalance, 0)
              return (
                <div key={type} className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2">
                  <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-3)]">
                    {DEBT_TYPE_LABELS[type] || type}
                  </p>
                  {items.map(d => (
                    <div key={d.id} className="flex justify-between py-0.5">
                      <span className="font-sans text-sm text-[var(--ink-2)]">
                        {d.name}
                        {d.interestRate > 0 && (
                          <span className="ml-1 text-[10px] text-[var(--ink-4)]">{d.interestRate}%</span>
                        )}
                        {d.inclusionPct < 100 && (
                          <span className="ml-1 text-[10px] text-[var(--ink-4)]">({d.inclusionPct}%)</span>
                        )}
                      </span>
                      <span className="tabular-nums text-red-600">-{formatCurrency(d.weightedBalance)}</span>
                    </div>
                  ))}
                  {items.length > 1 && (
                    <div className="flex justify-between pt-0.5 text-red-500">
                      <span className="font-sans text-xs italic">Subtotaal</span>
                      <span className="tabular-nums text-xs">-{formatCurrency(subtotal)}</span>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Total Debts */}
            <div className="flex justify-between border-t border-[var(--ink-3)] pt-1 font-bold">
              <span className="font-sans text-sm text-red-600">Totaal passiva</span>
              <span className="tabular-nums text-red-600">-{formatCurrency(data.totalDebts)}</span>
            </div>
          </div>
        )}

        {/* ── NETTO VERMOGEN ── */}
        <div className="mt-3 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
          <span className="text-[var(--ink)]">Netto vermogen</span>
          <span className="tabular-nums text-[var(--ink)]">{formatCurrency(data.netWorth)}</span>
        </div>

        {/* Freedom Time Badge */}
        {freedom && (
          <div className="mt-4 flex justify-center">
            <div className="rounded-[var(--r)] border border-[var(--hor-m)] bg-[var(--hor-l)] px-3 py-2 text-center">
              <p className="font-playfair text-xl font-bold text-[var(--hor-t)]">
                {freedom.formatted}
              </p>
              <p className="font-sans text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--hor-t)]">
                vrijheid
              </p>
            </div>
          </div>
        )}

        {/* Formule */}
        <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
          <p><strong className="font-semibold text-[var(--ink-3)]">Formule:</strong> Netto vermogen = Totaal activa − Totaal passiva</p>
          {data.dailyExpenseRate > 0 && (
            <p className="mt-1"><strong className="font-semibold text-[var(--ink-3)]">Vrijheidstijd:</strong> Netto vermogen ÷ dagelijkse uitgaven ({formatCurrency(Math.round(data.dailyExpenseRate))}/dag)</p>
          )}
        </div>

        {/* Footer */}
        <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
          Actuele waarden uit TriFinity · Peildatum {new Date(data.date).toLocaleDateString('nl-NL')}
        </p>
      </div>

      {/* Summary cards */}
      <div className="mt-8 grid grid-cols-3 gap-3">
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 text-center shadow-[var(--s0)]">
          <p className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">Activa</p>
          <p className="mt-1 font-dm-mono text-lg tabular-nums text-[var(--ink)]">{formatCurrency(data.totalAssets)}</p>
          <p className="mt-0.5 font-inter text-[10px] text-[var(--ink-4)]">{data.assets.length} posten</p>
        </div>
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 text-center shadow-[var(--s0)]">
          <p className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">Passiva</p>
          <p className="mt-1 font-dm-mono text-lg tabular-nums text-red-600">{data.debts.length > 0 ? `-${formatCurrency(data.totalDebts)}` : formatCurrency(0)}</p>
          <p className="mt-0.5 font-inter text-[10px] text-[var(--ink-4)]">{data.debts.length} posten</p>
        </div>
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 text-center shadow-[var(--s0)]">
          <p className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">Netto</p>
          <p className={`mt-1 font-dm-mono text-lg tabular-nums ${data.netWorth >= 0 ? 'text-kern-600' : 'text-red-600'}`}>{formatCurrency(data.netWorth)}</p>
          {freedom && <p className="mt-0.5 font-inter text-[10px] text-[var(--hor-t)]">{freedom.formatted} vrijheid</p>}
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-10 border-t-2 border-[var(--ink)] pt-4 text-center">
        <p className="font-playfair text-lg font-bold text-[var(--ink)]">
          <span>t</span><span className="text-kern-600">f.</span>
        </p>
        <p className="mt-1 font-source-serif text-[13px] italic text-[var(--ink-3)]">
          &ldquo;Geld is opgeslagen tijd&rdquo;
        </p>
        <p className="mt-2 font-inter text-[10px] text-[var(--ink-4)]">
          Gegenereerd door TriFinity &middot; {new Date(data.generatedAt).toLocaleDateString('nl-NL')}
        </p>
      </footer>
    </div>
  )
}
