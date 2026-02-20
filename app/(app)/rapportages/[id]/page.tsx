'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { ReportData } from '@/lib/report-data'
import { PrintToolbar } from './components/print-toolbar'
import { ReportMasthead } from './components/report-masthead'
import { LeadStory } from './components/lead-story'
import { KernColumn } from './components/kern-column'
import { WilColumn } from './components/wil-column'
import { HorizonColumn } from './components/horizon-column'
import { PullQuoteSection } from './components/pull-quote'
import { MonthlyTable } from './components/monthly-table'

export default function ReportViewerPage() {
  const searchParams = useSearchParams()
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchReport() {
      const periodType = searchParams.get('type') || 'month'
      const dateFrom = searchParams.get('from')
      const dateTo = searchParams.get('to')

      if (!dateFrom || !dateTo) {
        setError('Geen datumbereik opgegeven')
        setLoading(false)
        return
      }

      try {
        const res = await fetch(
          `/api/report?period_type=${periodType}&date_from=${dateFrom}&date_to=${dateTo}`
        )
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Rapport laden mislukt')
        }
        const reportData: ReportData = await res.json()
        setData(reportData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Rapport laden mislukt')
      } finally {
        setLoading(false)
      }
    }

    fetchReport()
  }, [searchParams])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
          <p className="font-inter text-sm text-[var(--ink-3)]">Rapport wordt gegenereerd...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="font-playfair text-xl text-[var(--ink)]">Rapport niet beschikbaar</p>
          <p className="mt-2 font-inter text-sm text-[var(--ink-3)]">{error || 'Geen data gevonden'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[900px] px-4 py-6 md:px-8">
      <PrintToolbar />

      <ReportMasthead data={data} />

      <LeadStory kern={data.kern} />

      {/* Three-column grid: Kern | Wil | Horizon */}
      <div className="grid gap-8 md:grid-cols-[2fr_1.5fr_1.5fr]">
        <KernColumn kern={data.kern} />
        <WilColumn wil={data.wil} />
        <HorizonColumn horizon={data.horizon} />
      </div>

      {/* AI Pullquotes */}
      <PullQuoteSection insights={data.aiInsights} />

      {/* Monthly overview table */}
      <MonthlyTable
        rows={data.kern.monthlyOverview}
        totalIncome={data.kern.totalIncome}
        totalExpenses={data.kern.totalExpenses}
        totalSaved={data.kern.totalSaved}
        savingsRate={data.kern.savingsRate}
      />

      {/* Report footer */}
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
