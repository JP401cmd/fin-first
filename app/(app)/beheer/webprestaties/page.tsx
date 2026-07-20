import { Timer } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/admin'
import {
  WEB_VITAL_METRICS,
  formatVitalValue,
  ratingForValue,
  type WebVitalMetric,
  type WebVitalRating,
} from '@/lib/web-vitals/config'
import { leverageStatusTextClass, type LeverageStatus } from '@/lib/leverage-status'
import { WebVitalsTrend } from '@/components/app/beheer/web-vitals-trend'

export const dynamic = 'force-dynamic'

// Real User Monitoring (RUM): de p75 Core Web Vitals uit de eigen `web_vitals`-
// tabel, per route en device. Aanvullend op Vercel Speed Insights — dit zijn
// onze eigen metingen. Gelezen via de service-role (ADR 0006 — beheer leest
// cross-user nooit via RLS). De tabel/RPC's kunnen nog ontbreken op remote;
// elke .rpc() wordt daarom defensief afgevangen naar een nette empty-state.

interface SummaryRow {
  metric: string
  p75: number
  sample_count: number
}
interface DailyRow {
  day: string
  metric: string
  p75: number
  sample_count: number
}
interface RouteRow {
  route: string
  p75: number
  sample_count: number
}

const PERIODS = [7, 28, 90] as const
const DEFAULT_DAYS = 28
const DEFAULT_METRIC: WebVitalMetric = 'LCP'

// Menselijke duiding per metric, zonder module-accent te introduceren.
const METRIC_LABEL: Record<WebVitalMetric, string> = {
  LCP: 'Grootste inhoud',
  INP: 'Interactie',
  CLS: 'Layout-stabiliteit',
  FCP: 'Eerste inhoud',
  TTFB: 'Servertijd',
}

// Stoplicht-semantiek → gedeelde status-classes (emerald/amber/red). Bewust
// géén module-accent: dit is status, geen module-identiteit.
const RATING_TO_STATUS: Record<WebVitalRating, LeverageStatus> = {
  good: 'good',
  'needs-improvement': 'warn',
  poor: 'bad',
}
const RATING_TEKST: Record<WebVitalRating, string> = {
  good: 'Goed',
  'needs-improvement': 'Aandacht',
  poor: 'Slecht',
}

function ratingClass(metric: WebVitalMetric, value: number): string {
  return leverageStatusTextClass(RATING_TO_STATUS[ratingForValue(metric, value)])
}

const numFmt = new Intl.NumberFormat('nl-NL')
const dayFmt = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' })
function fmtDay(iso: string): string {
  // Midden-op-de-dag om TZ-randgevallen bij het formatteren te vermijden.
  return dayFmt.format(new Date(`${iso.slice(0, 10)}T12:00:00`))
}

function isMetric(value: string | undefined): value is WebVitalMetric {
  return (WEB_VITAL_METRICS as readonly string[]).includes(value ?? '')
}

// ── Lokale UI-helpers (spiegel van /beheer/ai-verbruik) ──────────

function Kpi({
  label,
  value,
  valueClass,
  sub,
}: {
  label: string
  value: string
  valueClass?: string
  sub?: string
}) {
  return (
    <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-4)]">{label}</div>
      <div className={`mt-1.5 font-mono text-2xl font-semibold tabular-nums ${valueClass ?? 'text-[var(--ink)]'}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-[var(--ink-3)]">{sub}</div>}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-4">
      <span className="font-inter text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
        {children}
      </span>
      <div className="h-px flex-1 bg-[var(--border-ed)]" />
    </div>
  )
}

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)] ${
        right ? 'pl-4 text-right' : 'pr-4 text-left'
      }`}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  right = false,
  strong = false,
  className = '',
}: {
  children: React.ReactNode
  right?: boolean
  strong?: boolean
  className?: string
}) {
  // Eén tekstkleur-class emitten: een doorgegeven className VERVANGT de default
  // i.p.v. ernaast te staan. Twee concurrerende text-*-utilities met gelijke
  // specificiteit "winnen" op Tailwind-scanvolgorde, niet op stringvolgorde —
  // anders zou de stoplichtkleur per route onbetrouwbaar renderen.
  const colorClass =
    className || (strong ? 'text-[var(--ink)]' : right ? 'text-[var(--ink-3)]' : 'text-[var(--ink-2)]')
  return (
    <td
      className={`py-2 ${right ? 'pl-4 text-right font-mono text-xs tabular-nums' : 'pr-4'} ${colorClass}`}
    >
      {children}
    </td>
  )
}

export default async function BeheerWebprestatiesPage({
  searchParams,
}: {
  searchParams: Promise<{ dagen?: string; metric?: string }>
}) {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    redirect('/overzicht')
  }

  const params = await searchParams
  const requested = Number(params.dagen)
  const dagen = (PERIODS as readonly number[]).includes(requested) ? requested : DEFAULT_DAYS
  const metric: WebVitalMetric = isMetric(params.metric) ? params.metric : DEFAULT_METRIC

  const service = getServiceClient()

  // Resilient: de tabel/RPC's bestaan mogelijk nog niet op remote. Elke .rpc()
  // kan `error` teruggeven — dan behandelen we die bron als leeg i.p.v. te
  // crashen of een rauwe fout te tonen.
  const [summaryRes, dailyRes, routeRes] = await Promise.all([
    service.rpc('web_vitals_p75_summary', { p_days: dagen }),
    service.rpc('web_vitals_p75_daily', { p_days: dagen }),
    service.rpc('web_vitals_p75_by_route', { p_metric: metric, p_days: dagen, p_min_samples: 5 }),
  ])

  // Een echte storing (RPC/tabel ontbreekt, grant kwijt) mag op een
  // observability-pagina niet stilletjes als "leeg" ogen: log server-side
  // (grep-baar) en degradeer dán pas naar de empty-state.
  if (summaryRes.error) console.error('[beheer:webprestaties] p75_summary', summaryRes.error.message)
  if (dailyRes.error) console.error('[beheer:webprestaties] p75_daily', dailyRes.error.message)
  if (routeRes.error) console.error('[beheer:webprestaties] p75_by_route', routeRes.error.message)

  const summaryRows = (summaryRes.error ? [] : (summaryRes.data ?? [])) as SummaryRow[]
  const dailyRows = (dailyRes.error ? [] : (dailyRes.data ?? [])) as DailyRow[]
  const routeRows = (routeRes.error ? [] : (routeRes.data ?? [])) as RouteRow[]

  // Alle drie een fout = de bron is (nog) niet beschikbaar, i.p.v. leeg-maar-gezond.
  const sourceUnavailable = !!summaryRes.error && !!dailyRes.error && !!routeRes.error
  const hasAnyData = summaryRows.length > 0 || dailyRows.length > 0 || routeRows.length > 0

  const summaryByMetric = new Map<string, SummaryRow>()
  for (const row of summaryRows) summaryByMetric.set(row.metric, row)

  // Tijdreeks: alleen de gekozen metric, chronologisch, naar chart-punten.
  const trendPoints = dailyRows
    .filter((r) => r.metric === metric)
    .slice()
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((r) => ({ label: fmtDay(r.day), value: r.p75 }))

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Timer className="h-5 w-5 text-[var(--ink-3)]" />
          <h2 className="text-xl font-bold text-[var(--ink)]">Webprestaties</h2>
        </div>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Echte gebruikersmetingen (RUM): de Core Web Vitals op p75-niveau — de waarde die 75% van je
          bezoekers haalt of beter. Per route en device, uit onze eigen <code className="font-mono text-xs">web_vitals</code>-
          tabel. Aanvullend op Vercel Speed Insights, niet in plaats daarvan.
        </p>
      </div>

      {/* Periode-switcher (metric blijft behouden) */}
      <div className="mb-6 flex gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={`/beheer/webprestaties?dagen=${p}&metric=${metric}`}
            className={`min-h-[36px] border px-4 py-1.5 text-sm transition-colors ${
              p === dagen
                ? 'border-[var(--ink)] font-medium text-[var(--ink)]'
                : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:border-[var(--border-md)]'
            }`}
          >
            {p} dagen
          </Link>
        ))}
      </div>

      {!hasAnyData ? (
        <div className="border border-dashed border-[var(--border-ed)] bg-[var(--paper)] px-6 py-12 text-center">
          <p className="text-sm text-[var(--ink-2)]">
            {sourceUnavailable ? 'Webprestatie-bron nog niet beschikbaar' : 'Nog geen webprestatie-data'}
          </p>
          <p className="mx-auto mt-1.5 max-w-[46ch] text-sm text-[var(--ink-4)]">
            {sourceUnavailable
              ? 'De web_vitals-tabel en aggregatie-RPC’s bestaan nog niet op deze omgeving (migratie nog niet toegepast). Zodra die live zijn, verschijnen hier de metingen.'
              : 'De meting start zodra bezoekers metingen versturen; dan verschijnen hier de p75-waarden per metric, route en device.'}
          </p>
        </div>
      ) : (
        <>
          {/* KPI-overzicht: alle 5 metrics op p75 */}
          <section className="mb-8">
            <SectionLabel>Overzicht — p75 laatste {dagen} dagen</SectionLabel>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {WEB_VITAL_METRICS.map((m) => {
                const row = summaryByMetric.get(m)
                if (!row) {
                  return <Kpi key={m} label={`${m} · ${METRIC_LABEL[m]}`} value="—" sub="Geen metingen" />
                }
                const rating = ratingForValue(m, row.p75)
                return (
                  <Kpi
                    key={m}
                    label={`${m} · ${METRIC_LABEL[m]}`}
                    value={formatVitalValue(m, row.p75)}
                    valueClass={ratingClass(m, row.p75)}
                    sub={`${RATING_TEKST[rating]} · ${numFmt.format(row.sample_count)} metingen`}
                  />
                )
              })}
            </div>
          </section>

          {/* Metric-selector: stuurt tijdreeks + ranglijst */}
          <section className="mb-6">
            <SectionLabel>Kies een metric</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {WEB_VITAL_METRICS.map((m) => (
                <Link
                  key={m}
                  href={`/beheer/webprestaties?dagen=${dagen}&metric=${m}`}
                  title={METRIC_LABEL[m]}
                  className={`min-h-[36px] border px-4 py-1.5 text-sm transition-colors ${
                    m === metric
                      ? 'border-[var(--ink)] font-medium text-[var(--ink)]'
                      : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:border-[var(--border-md)]'
                  }`}
                >
                  {m}
                </Link>
              ))}
            </div>
          </section>

          {/* Tijdreeks van de gekozen metric */}
          <section className="mb-8">
            <SectionLabel>
              {metric} · {METRIC_LABEL[metric]} — verloop over {dagen} dagen
            </SectionLabel>
            <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-4">
              <WebVitalsTrend metric={metric} points={trendPoints} />
            </div>
          </section>

          {/* Ranglijst per route — slechtste eerst */}
          <section>
            <SectionLabel>{metric} per route — slechtste eerst</SectionLabel>
            {routeRows.length === 0 ? (
              <p className="py-4 text-sm italic text-[var(--ink-4)]">
                Nog geen route met minstens 5 metingen voor {metric} in deze periode.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[24rem] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-ed)]">
                      <Th>Route</Th>
                      <Th right>p75</Th>
                      <Th right>Metingen</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {routeRows.map((r) => (
                      <tr
                        key={r.route}
                        className="border-b border-dotted border-[var(--border-ed)] hover:bg-[var(--subtle)]"
                      >
                        <Td>
                          <span className="whitespace-nowrap font-mono text-xs text-[var(--ink-2)]">
                            {r.route}
                          </span>
                        </Td>
                        <Td right className={`font-semibold ${ratingClass(metric, r.p75)}`}>
                          {formatVitalValue(metric, r.p75)}
                        </Td>
                        <Td right>{numFmt.format(r.sample_count)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-[var(--ink-4)]">
              p75 = de waarde die 75% van de metingen haalt of beter. Routes met minder dan 5 metingen
              blijven weg om ruis te vermijden. Stoplicht-kleuren volgen de officiële Core Web
              Vitals-drempels.
            </p>
          </section>
        </>
      )}
    </div>
  )
}
