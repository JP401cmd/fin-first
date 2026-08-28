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

/**
 * Hoe lang we op een uitsluitsel over de uitvoerbestemming wachten voordat we
 * het rapport zónder inleiding ophalen. Ruim genoeg voor een trage verbinding,
 * kort genoeg om geen eindeloze spinner te zijn.
 */
const RESOLVE_TIMEOUT_MS = 8000

export default function ReportViewerPage() {
  const searchParams = useSearchParams()
  const { id } = useParams<{ id: string }>()
  const configId = id !== 'new' ? id : null

  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [introNotice, setIntroNotice] = useState<string | null>(null)

  // Waar hoort de rapport-inleiding te draaien? Dit bepaalt of we het rapport
  // met `use_ai=true` mogen opvragen. FAIL-CLOSED: zolang de bestemming
  // 'resolving' is, halen we niets op — anders zou één trage voorkeur-lezing
  // alsnog een cloud-inleiding uitlokken bij iemand die privé-modus aan heeft.
  const execution = useExecutionMode('rapporten')

  // ── Uitgang uit 'resolving' ───────────────────────────────────────────────
  // `useExecutionMode` blijft PERMANENT op 'resolving' zodra de voorkeur-lezing
  // niets bruikbaars oplevert (netwerkfout, half antwoord): het effect zet dan
  // bewust geen state en er is geen retry. Fail-closed is daar terecht — er mag
  // niets stilletjes naar de cloud — maar de UI had geen uitgang, dus bleef
  // "Pagina's worden opgesteld..." eeuwig staan zonder foutmelding (S9).
  //
  // Deze timer geeft die uitgang zónder de belofte te breken: hij zet géén
  // cloud-pad open, hij markeert alleen dat de bestemming onbekend blijft. De
  // fetch hieronder gaat dan verder met `use_ai=false` — het rapport is
  // deterministisch, dus de cijfers komen gewoon; alleen de inleiding vervalt.
  const [resolveTimedOut, setResolveTimedOut] = useState(false)
  useEffect(() => {
    if (execution.status !== 'resolving') {
      setResolveTimedOut(false)
      return
    }
    const timer = setTimeout(() => setResolveTimedOut(true), RESOLVE_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [execution.status])

  useEffect(() => {
    if (execution.status === 'resolving' && !resolveTimedOut) return

    async function fetchReport() {
      const periodType = searchParams.get('type') || 'month'
      const dateFrom = searchParams.get('from')
      const dateTo = searchParams.get('to')
      // De gebruiker kan de inleiding uitzetten (?ai=false); de privé-modus kan
      // 'm alleen naar het eigen toestel verplaatsen, nooit naar de cloud.
      // Liep de bestemmings-lezing vast (zie de timer hierboven), dan gaan we
      // door zónder inleiding — nooit mét.
      const useAi =
        searchParams.get('ai') !== 'false' && execution.canUseCloud && !resolveTimedOut

      if (!dateFrom || !dateTo) {
        setError('Geen datumbereik opgegeven')
        setLoading(false)
        return
      }

      const buildUrl = (ai: boolean) => {
        let url = `/api/report?period_type=${periodType}&date_from=${dateFrom}&date_to=${dateTo}&use_ai=${ai}`
        if (configId) url += `&config_id=${configId}`
        return url
      }

      try {
        let res = await fetch(buildUrl(useAi))

        // ── Betaalmuur op de INLEIDING, niet op het rapport ──────────────────
        // Een editie die ooit mét AI-inleiding is opgeslagen wordt met `ai=true`
        // geopend. Is de AI-add-on er (nog) niet, dan gaf dat een kale 403 op de
        // hele pagina: "Rapport niet beschikbaar" voor cijfers die volledig
        // deterministisch zijn en waar geen model aan te pas komt. We halen 'm
        // dan opnieuw op zónder inleiding en zeggen erbij wat er ontbreekt —
        // dezelfde redenering als de privé-modus-degradatie in de route zelf.
        if (res.status === 403 && useAi) {
          const gate = await res.json().catch(() => null)
          const retry = await fetch(buildUrl(false))
          if (retry.ok) {
            setData((await retry.json()) as ReportData)
            setIntroNotice(
              (gate as { error?: string } | null)?.error ??
                'De AI-inleiding is niet beschikbaar; je rapport staat er verder volledig.',
            )
            return
          }
          res = retry
        }

        if (!res.ok) {
          const err = await res.json().catch(() => null)
          throw new Error((err as { error?: string } | null)?.error || 'Rapport laden mislukt')
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
  }, [searchParams, configId, execution.status, execution.canUseCloud, resolveTimedOut])

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

      {/* Duiding in plaats van een dichte deur: het rapport is er wél, alleen
          de inleiding niet. Bewust géén print-onderdeel — het is een melding
          over dit scherm, niet over het document. */}
      {introNotice && (
        <p
          role="status"
          className="mt-4 border-l-2 border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2 font-inter text-[13px] leading-snug text-[var(--ink-2)] print:hidden"
        >
          {introNotice}
        </p>
      )}

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
