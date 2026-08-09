'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useParams } from 'next/navigation'
import type { ReportData } from '@/lib/report-data'
import { useExecutionMode } from '@/lib/ai/local/use-execution-mode'
import { useLocalReportIntro } from '@/lib/ai/local/use-local-report-intro'
import { reportIntroFiguresFromData } from '@/lib/ai/local/local-report-prompt'
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
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'

export default function ReportViewerPage() {
  const searchParams = useSearchParams()
  const { id } = useParams<{ id: string }>()
  const configId = id !== 'new' ? id : null

  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Waar hoort de rapport-inleiding te draaien? Dit bepaalt of we het rapport
  // met `use_ai=true` mogen opvragen. FAIL-CLOSED: zolang de bestemming
  // 'resolving' is, halen we niets op — anders zou één trage voorkeur-lezing
  // alsnog een cloud-inleiding uitlokken bij iemand die privé-modus aan heeft.
  const execution = useExecutionMode('rapporten')

  useEffect(() => {
    if (execution.status === 'resolving') return

    async function fetchReport() {
      const periodType = searchParams.get('type') || 'month'
      const dateFrom = searchParams.get('from')
      const dateTo = searchParams.get('to')
      // De gebruiker kan de inleiding uitzetten (?ai=false); de privé-modus kan
      // 'm alleen naar het eigen toestel verplaatsen, nooit naar de cloud.
      const useAi = searchParams.get('ai') !== 'false' && execution.canUseCloud

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
  }, [searchParams, configId, execution.status, execution.canUseCloud])

  // ── Lokale inleiding (progressive enhancement) ────────────────────────────
  // Draait 'rapporten' lokaal, dan levert de route geen inleiding en schrijft de
  // browser 'm zelf, ná het volledige rapport. De cijfers komen uit de bundel
  // die deze pagina tóch al binnenkreeg — geen extra endpoint.
  const localFigures = useMemo(
    () => (data && execution.status === 'lokaal' ? reportIntroFiguresFromData(data) : null),
    [data, execution.status],
  )
  const localIntro = useLocalReportIntro(localFigures)

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
      <NavStackMeta title="Rapport" />
      {/* Print-race: de PDF wordt gemaakt van de DOM zoals die nú is. Drukt
          iemand af terwijl de lokale inleiding nog draait, dan staat er een lege
          (of skeleton-)callout in het document. Daarom wacht de knop tot de
          inleiding klaar is of definitief mislukt. */}
      <PrintToolbar pending={localIntro.pending} />

      <ReportMasthead data={data} />

      {/* APP-7-opt-out: een rapportage is een gegenereerd (print)document —
          het mag nooit cijfers verliezen door de weergavemodus van het scherm. */}
      <FiguresStrip
        alwaysFull
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

      {/* Fin's redactie — cloud-inleiding uit de bundel, of de on-device
          geschreven variant. In lokale modus negeren we `data.aiIntroduction`
          bewust: dat kan een eerder gecachte cloud-tekst zijn, en die hoort niet
          als "op dit apparaat geschreven" te verschijnen. */}
      {execution.status === 'lokaal' ? (
        <>
          {localIntro.status === 'klaar' && localIntro.intro && (
            <ScenarioCallout title="Fin — redactie">{localIntro.intro}</ScenarioCallout>
          )}
          {(localIntro.status === 'wachten' || localIntro.status === 'bezig') && (
            <ScenarioCallout title="Fin — redactie">
              <span className="flex items-start gap-2">
                <span
                  aria-hidden
                  className="mt-1 h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-[var(--module-active-500)] border-t-transparent"
                />
                <span className="text-[var(--ink-3)]">
                  De inleiding wordt op dit apparaat geschreven — je rapport hieronder is al
                  volledig. Eerste keer? Het model start hier op; dat duurt doorgaans tientallen
                  seconden. Je data blijft lokaal.
                </span>
              </span>
            </ScenarioCallout>
          )}
        </>
      ) : (
        data.aiIntroduction && (
          <ScenarioCallout title="Fin — redactie">{data.aiIntroduction}</ScenarioCallout>
        )
      )}

      {/* Privé-modus aan, maar dit toestel kan het model niet draaien. Eerlijk
          benoemen (het rapport zelf is compleet), maar niet meeprinten. */}
      {execution.status === 'blocked' && execution.message && (
        <p data-print-hide className="mb-5 font-inter text-xs text-[var(--ink-3)]">
          De inleiding wordt in privé-modus op je eigen apparaat geschreven. {execution.message}
        </p>
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
