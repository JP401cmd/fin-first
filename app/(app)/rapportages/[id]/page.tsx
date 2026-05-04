'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useParams } from 'next/navigation'
import type { ReportData } from '@/lib/report-data'
import {
  formatTimestamp,
  formatCurrency,
  formatFreedomTimeString,
  calculateFreedomTime,
} from '@/lib/format'
import {
  FiguresStrip,
  ScenarioCallout,
  OrnamentColophon,
} from '@/components/editorial'
import { SectionDivider } from '@/components/app/section-divider'
import { PrintToolbar } from './components/print-toolbar'
import { ReportMasthead } from './components/report-masthead'
import { LeadStory } from './components/lead-story'
import { KernColumn } from './components/kern-column'
import { WilColumn } from './components/wil-column'
import { HorizonColumn } from './components/horizon-column'
import { PullQuoteSection } from './components/pull-quote'
import { MonthlyTable } from './components/monthly-table'
import { HistoricalComparison } from './components/historical-comparison'

export default function ReportViewerPage() {
  const searchParams = useSearchParams()
  const { id } = useParams<{ id: string }>()
  const configId = id !== 'new' ? id : null

  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchReport() {
      const periodType = searchParams.get('type') || 'month'
      const dateFrom = searchParams.get('from')
      const dateTo = searchParams.get('to')
      const useAi = searchParams.get('ai') !== 'false'

      if (!dateFrom || !dateTo) {
        setError('Geen datumbereik opgegeven')
        setLoading(false)
        return
      }

      try {
        let url = `/api/report?period_type=${periodType}&date_from=${dateFrom}&date_to=${dateTo}&use_ai=${useAi}`
        if (configId) {
          url += `&config_id=${configId}`
        }

        const res = await fetch(url)
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
  }, [searchParams, configId])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[var(--module-active-500)] border-t-transparent" />
          <p className="font-inter text-sm text-[var(--ink-3)]">Pagina&apos;s worden opgesteld...</p>
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

  // ── Hero figures ─────────────────────────────────────────────────
  // Pre-compute the four headline numbers shown in the editorial figures-strip
  // directly under the masthead. These are scan-anchors — the four metrics a
  // reader expects to find without effort: hoeveel groeide het vermogen, hoe
  // sober is gespaard, hoe ver naar FIRE, en hoeveel tijd zit er nu in de pot.
  const growth = data.kern.netWorthGrowth ?? 0
  const growthSign = growth >= 0 ? '+' : ''
  const savingsRate = data.kern.savingsRate ?? 0
  const firePercentage = data.horizon.fireEnd?.percentage ?? 0
  const fireDelta = data.horizon.fireProgressDelta
  const netWorthEnd = data.kern.netWorthEnd ?? 0
  // Freedom time falls back to '—' when we cannot translate the eindstand into
  // days — either because there's no balance to project or no expense-rate to
  // divide by. The hero must never invent time the reader cannot verify.
  const canShowFreedomTime =
    netWorthEnd >= 100 && data.dailyExpenseRate > 0
  const freedomTimeShort = canShowFreedomTime
    ? formatFreedomTimeString(
        calculateFreedomTime(netWorthEnd, data.dailyExpenseRate),
        'short',
      )
    : '—'

  return (
    <div className="mx-auto max-w-[900px] px-4 py-6 md:px-8">
      <PrintToolbar />

      <ReportMasthead data={data} />

      <FiguresStrip
        cols={4}
        figures={[
          {
            kicker: 'Vermogensgroei',
            amount: `${growthSign}${formatCurrency(growth)}`,
            sub:
              data.kern.netWorthStart != null
                ? `vs. ${formatCurrency(data.kern.netWorthStart)}`
                : undefined,
            variant: growth >= 0 ? 'positive' : 'negative',
          },
          {
            kicker: 'Spaarquote',
            amount: `${savingsRate}%`,
            sub:
              data.kern.totalSaved != null
                ? `${formatCurrency(data.kern.totalSaved)} gespaard`
                : undefined,
            variant: 'neutral',
          },
          {
            kicker: 'FIRE-voortgang',
            amount: `${firePercentage}%`,
            sub:
              fireDelta != null
                ? `${fireDelta >= 0 ? '+' : ''}${fireDelta}% deze periode`
                : undefined,
            variant: 'neutral',
          },
          {
            kicker: 'Vrijheidstijd',
            amount: freedomTimeShort,
            sub: 'opgespaarde tijd',
            variant: 'winner',
          },
        ]}
      />

      <LeadStory kern={data.kern} />

      {data.aiIntroduction && (
        <ScenarioCallout title="Will — redactie">
          {data.aiIntroduction}
        </ScenarioCallout>
      )}

      {/* Historical Comparison */}
      <HistoricalComparison
        historicalPeriods={data.historicalPeriods ?? []}
        currentPeriodLabel={data.reportName}
        currentNetWorthEnd={data.kern.netWorthEnd}
        currentTotalIncome={data.kern.totalIncome}
        currentTotalExpenses={data.kern.totalExpenses}
        currentTotalSaved={data.kern.totalSaved}
        currentSavingsRate={data.kern.savingsRate}
        currentFirePercentage={data.kern.firePercentage}
      />

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
      <SectionDivider variant="double-rule" />
      <div className="text-center pt-2">
        <p className="font-playfair text-lg font-bold">
          <span>t</span>
          <span style={{ color: 'var(--module-active-700)' }}>f.</span>
        </p>
        <p className="mt-1 font-source-serif text-[13px] italic text-[var(--ink-3)]">
          &ldquo;Geld is opgeslagen tijd&rdquo;
        </p>
      </div>
      <OrnamentColophon
        module="Rapportages"
        text={formatTimestamp(data.generatedAt)}
      />
    </div>
  )
}
