'use client'

/**
 * Benchmark-rapportage — `/rapportages/benchmark`.
 *
 * Een redactionele "spiegel"-spread (zelfde idioom als TriFinity-krant) die jouw
 * canonieke cijfers (gezondheidsscore, vrijheidsleeftijd, spaarquote, netto
 * vermogen, inkomen) afzet tegen een vergelijkbare doelgroep (CBS/Nibud/DNB,
 * cohort = leeftijd × huishoudtype) plus een wereld-reality-check en een speelse
 * "jij tegenover Musk"-relativering.
 *
 * Pure consument: alle cijfers komen uit `GET /api/report/benchmark`. Niets wordt
 * hier herberekend — de visualisaties positioneren/illustreren alleen.
 *
 * De data-viz gebruikt een VASTE redactionele palette (`viz-palette.ts`),
 * bewust niet de per-gebruiker module-accentkleur (zoals de krant).
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Printer, Globe } from 'lucide-react'
import { formatMaskedCurrency, formatTimestamp } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { formatFireAge } from '@/lib/horizon-data'
import { ScenarioCallout, SectionLabel, OrnamentColophon } from '@/components/editorial'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import type {
  BenchmarkReportData,
  BenchmarkMetric,
  BenchmarkSource,
  GlobalRank,
} from '@/lib/benchmark-report-data'
import { BodyFigure } from './components/body-figure'
import { DistributionCurve } from './components/distribution-curve'
import { MetricDetailSheet } from './components/metric-detail-sheet'
import { WorldDotMap } from './components/world-dot-map'
import { VIZ } from './components/viz-palette'

/**
 * Masked-aware currency formatter hook. Levert óf de gemaskeerde placeholder óf
 * een geformatteerde EUR-string op basis van de globale privacy-toggle.
 */
function useFc() {
  const { masked } = useMaskedAmounts()
  return useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Bron-regel onder de methodologie-callout / in de bronnenlijst. */
function SourceLine({ source }: { source: BenchmarkSource }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 border-b border-dotted border-[var(--border-ed)] py-1.5 last:border-b-0">
      <span className="font-inter text-[13px] font-medium text-[var(--ink-2)]">{source.label}</span>
      <span className="font-dm-mono text-[11px] tabular-nums" style={{ color: VIZ.gold }}>
        {source.year}
      </span>
      {source.note && (
        <span className="font-source-serif text-[12px] italic text-[var(--ink-4)]">— {source.note}</span>
      )}
    </li>
  )
}

/** Eén wereld-percentiel-blok (pct-block uit het bron-ontwerp). */
function PctBlock({ rank, kicker }: { rank: GlobalRank | null; kicker: string }) {
  if (!rank) return null
  return (
    <div>
      <p className="font-dm-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-4)]">{kicker}</p>
      <p
        className="mt-0.5 mb-1 font-playfair text-[42px] font-black leading-[1.05] text-[var(--ink)]"
        style={{ fontFamily: 'var(--font-playfair, serif)' }}
      >
        {rank.topPercent != null ? (
          <>
            top <span style={{ color: VIZ.accent }}>{rank.topPercent}%</span>
          </>
        ) : (
          '—'
        )}
      </p>
      <p className="font-source-serif text-[15px] italic text-[var(--ink-2)]">{rank.caption}</p>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function BenchmarkPage() {
  const fc = useFc()
  const { masked } = useMaskedAmounts()

  const [data, setData] = useState<BenchmarkReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Gedeelde detail-sheet: actieve metric + open-state.
  const [activeMetric, setActiveMetric] = useState<BenchmarkMetric | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const openMetric = useCallback((metric: BenchmarkMetric) => {
    setActiveMetric(metric)
    setSheetOpen(true)
  }, [])

  /** Unit-aware formatter; EUR maskeerbaar via de privacy-toggle. */
  const formatValue = useCallback(
    (value: number | null, unit: BenchmarkMetric['unit']): string => {
      if (value === null) return '—'
      switch (unit) {
        case 'score':
          return `${Math.round(value)}`
        case 'age':
          return formatFireAge(value)
        case 'pct':
          return `${Math.round(value)}%`
        case 'eur':
          return fc(value)
      }
    },
    [fc],
  )

  useEffect(() => {
    async function fetchBenchmark() {
      try {
        const res = await fetch('/api/report/benchmark')
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Benchmark laden mislukt')
        }
        setData(await res.json())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Benchmark laden mislukt')
      } finally {
        setLoading(false)
      }
    }
    fetchBenchmark()
  }, [])

  const curveMetrics = useMemo(
    () => (data?.metrics ?? []).filter(m => m.curve),
    [data],
  )

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[var(--module-active-500)] border-t-transparent" />
          <p className="font-inter text-sm text-[var(--ink-3)]">De spiegel wordt opgesteld...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="font-playfair text-xl text-[var(--ink)]">Benchmark niet beschikbaar</p>
          <p className="mt-2 font-inter text-sm text-[var(--ink-3)]">{error || 'Geen data gevonden'}</p>
        </div>
      </div>
    )
  }

  const generatedDate = formatTimestamp(data.generatedAt)
  const generatedTime = new Date(data.generatedAt).toLocaleTimeString('nl-NL', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const cohortIncomplete = data.cohort.complete === false || data.metrics.length === 0
  const hasWorld = Boolean(data.global.income || data.global.wealth)
  const musk = data.musk

  return (
    <div className="mx-auto max-w-[1000px] px-4 pb-20 pt-6 md:px-8">
      <NavStackMeta title="Benchmark" bottomBar={{ kind: 'tabs' }} />

      {/* ── Toolbar — page-eigen print-actie ── */}
      <div data-print-hide className="mb-4 flex items-center justify-end">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-4 py-2 font-inter text-sm font-medium text-[var(--ink)] shadow-[var(--s0)] transition-all hover:-translate-y-px hover:shadow-[var(--s1)]"
        >
          <Printer className="h-4 w-4" />
          Afdrukken als PDF
        </button>
      </div>

      {/* ── Masthead ── */}
      <header className="pt-4 text-center">
        <div className="mb-3.5 inline-flex w-full items-center justify-center gap-4 font-dm-mono text-[11px] uppercase tracking-[0.34em] text-[var(--ink-4)]">
          <span aria-hidden className="inline-block h-px w-[42px] shrink-0" style={{ background: VIZ.line }} />
          Spiegel — hoe je ervoor staat
          <span aria-hidden className="inline-block h-px w-[42px] shrink-0" style={{ background: VIZ.line }} />
        </div>
        <h1
          className="text-[var(--ink)]"
          style={{
            fontFamily: 'var(--font-playfair, serif)',
            fontWeight: 900,
            fontSize: 'clamp(38px,7vw,76px)',
            lineHeight: 1.02,
            letterSpacing: '-0.01em',
          }}
        >
          Naast vergelijkbare{' '}
          <em className="font-normal italic" style={{ color: VIZ.accent }}>
            Nederlanders
          </em>
        </h1>
        <p className="mt-2.5 font-source-serif text-[17px] italic text-[var(--ink-2)]">
          {data.displayName && (
            <>
              {data.displayName}
              <span className="mx-2 not-italic" style={{ color: VIZ.gold }}>
                ◆
              </span>
            </>
          )}
          {data.cohort.ageBandLabel || 'Doelgroep nog niet bepaald'}
          {data.cohort.householdLabel && (
            <>
              <span className="mx-2 not-italic" style={{ color: VIZ.gold }}>
                ◆
              </span>
              {data.cohort.householdLabel}
            </>
          )}
        </p>
        {/* dubbele regel (3px + 1px) */}
        <div className="mt-6" style={{ borderTop: '3px solid var(--ink)' }}>
          <div className="mt-[3px]" style={{ borderTop: '1px solid var(--ink)' }} />
        </div>
      </header>

      {/* ── Methodologie-callout ── */}
      <div className="mt-9">
        <ScenarioCallout title="Hoe deze vergelijking tot stand komt">
          De doelgroep is afgeleid uit officiële Nederlandse statistiek (CBS, Nibud, DNB) voor mensen
          zoals jij — jouw leeftijdsgroep en huishoudtype. Twee cijfers,{' '}
          <strong className="font-bold not-italic text-[var(--ink)]">gezondheidsscore</strong> en{' '}
          <strong className="font-bold not-italic text-[var(--ink)]">vrijheidsleeftijd</strong>, zijn
          geen gemeten gemiddelde maar een <em>gemodelleerde</em> &ldquo;typische&rdquo; peer: TriFinity
          draait er dezelfde rekenmotoren op als bij jouw eigen cijfers. Die herken je aan de tag{' '}
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--module-active-700)]">
            gemodelleerd
          </span>
          .
        </ScenarioCallout>
      </div>

      {/* ── Sectie I — Jij in beeld ── */}
      <div className="mt-12">
        <SectionLabel num="i.">Jij — in beeld</SectionLabel>
        <p className="-mt-2 mb-2 font-source-serif text-[15px] italic text-[var(--ink-4)]">
          Je financiële gezondheid zit in de kern; daaromheen wat die gezondheid voedt.
        </p>
      </div>

      {cohortIncomplete ? (
        // Empty-state — cohort niet te bepalen (wereld + Musk renderen er onder wél)
        <div className="mx-auto max-w-md px-4 py-10 text-center">
          <p className="mb-2 text-xl text-[var(--ink)]" style={{ fontFamily: 'var(--font-playfair, serif)' }}>
            We kunnen je doelgroep nog niet bepalen.
          </p>
          <p className="font-source-serif text-[15px] italic leading-relaxed text-[var(--ink-2)]">
            Vul je geboortedatum en huishoudtype aan om je doelgroep te bepalen.
          </p>
          {data.cohort.missing.length > 0 && (
            <p className="mt-3 font-inter text-[12px] text-[var(--ink-3)]">
              Nog nodig: {data.cohort.missing.join(', ')}
            </p>
          )}
          <Link
            href="/mijn/profiel"
            className="mt-5 inline-flex items-center justify-center gap-2 bg-[var(--ink)] px-4 py-2.5 font-inter text-sm font-medium text-[var(--paper)] transition-all hover:bg-[var(--ink-2)]"
          >
            Profiel aanvullen
          </Link>
        </div>
      ) : (
        <>
          {/* Lichaam met kern-ring + satellieten */}
          <BodyFigure metrics={data.metrics} formatValue={formatValue} onMetricClick={openMetric} />

          {/* Verdelingscurves (vermogen + inkomen) — naast elkaar op desktop */}
          {curveMetrics.length > 0 && (
            <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
              {curveMetrics.map((metric, idx) => (
                <article
                  key={metric.key}
                  className="border bg-[var(--paper)] p-6"
                  style={{ borderColor: VIZ.line, background: VIZ.card }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3
                      className="text-[19px] font-bold text-[var(--ink)]"
                      style={{ fontFamily: 'var(--font-playfair, serif)' }}
                    >
                      {metric.label} — waar je staat in de{' '}
                      <em className="font-normal italic" style={{ color: VIZ.accent }}>
                        verdeling
                      </em>
                    </h3>
                    <span
                      className="shrink-0 border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.06em]"
                      style={{ borderColor: VIZ.brown, color: VIZ.brown }}
                    >
                      {metric.tier === 'measured' ? 'CBS-cijfer' : 'gemodelleerd'}
                    </span>
                  </div>

                  {/* Grote, klikbare waarde */}
                  <button
                    type="button"
                    onClick={() => openMetric(metric)}
                    aria-label={`Toelichting bij ${metric.label}`}
                    className="-ml-1 mt-2.5 block rounded px-1 text-left transition-colors hover:bg-[var(--subtle)]/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-active-500)]"
                  >
                    <span
                      className="font-dm-mono font-black tabular-nums leading-none text-[var(--ink)]"
                      style={{ fontFamily: 'var(--font-playfair, serif)', fontSize: 'clamp(34px,5vw,46px)' }}
                    >
                      {formatValue(metric.userValue, metric.unit)}
                    </span>
                  </button>

                  {/* Delta-regel */}
                  <p className="mt-1.5 font-source-serif text-[15px] italic" style={{ color: VIZ.purple }}>
                    {metric.caption}
                  </p>

                  {/* Curve */}
                  {metric.curve && (
                    <div className="mt-4">
                      <DistributionCurve
                        curve={metric.curve}
                        you={metric.userValue}
                        peer={metric.referenceValue}
                        avg={metric.referenceMean ?? null}
                        gradientId={`bench-curve-${metric.key}-${idx}`}
                        masked={masked}
                      />
                    </div>
                  )}

                  {/* Legenda — formatValue maskeert eur al via de privacy-toggle */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-dm-mono text-[11.5px] text-[var(--ink-4)]">
                    <span className="font-semibold text-[var(--ink)]">
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: VIZ.ink }} />
                      jij {formatValue(metric.userValue, metric.unit)}
                    </span>
                    <span style={{ color: VIZ.line }}>|</span>
                    <span>
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: VIZ.purpleSoft }} />
                      mediaan {formatValue(metric.referenceValue, metric.unit)}
                    </span>
                    {metric.referenceMean != null && (
                      <>
                        <span style={{ color: VIZ.line }}>|</span>
                        <span>
                          <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: VIZ.gold }} />
                          NL-gemiddeld {formatValue(metric.referenceMean, metric.unit)}
                        </span>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Sectie II — De wereld als spiegel ── */}
      {hasWorld && (
        <div className="mt-14">
          <SectionLabel num="ii.">De wereld als spiegel</SectionLabel>
          <p className="-mt-2 mb-3.5 font-source-serif text-[15px] italic text-[var(--ink-4)]">
            Wat hier gemiddeld voelt, is wereldwijd uitzonderlijk.
          </p>

          <div className="border p-7" style={{ borderColor: VIZ.line, background: VIZ.card }}>
            <h3
              className="flex items-center gap-3 border-b pb-4 text-[24px] font-bold text-[var(--ink)]"
              style={{ fontFamily: 'var(--font-playfair, serif)', borderColor: 'var(--ink)' }}
            >
              <Globe className="h-6 w-6" style={{ color: VIZ.accent }} aria-hidden />
              Eén{' '}
              <em className="font-normal italic" style={{ color: VIZ.accent }}>
                punt
              </em>{' '}
              op de kaart
            </h3>

            {/* stippen-wereldkaart, gekleurd naar welvaartsklasse */}
            <WorldDotMap />

            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
              <PctBlock rank={data.global.income} kicker="Inkomen wereldwijd" />
              <PctBlock rank={data.global.wealth} kicker="Vermogen wereldwijd" />
            </div>

            <p className="mt-5 font-dm-mono text-[10.5px] text-[var(--ink-4)]">
              Bron: {data.global.source.label} ({data.global.source.year})
              {data.global.source.note ? ` — ${data.global.source.note}` : ''}
            </p>
          </div>
        </div>
      )}

      {/* ── Sectie III — Musk-meter (compact) ── */}
      {musk && (
        <div className="mt-12">
          <SectionLabel num="iii.">Musk-meter</SectionLabel>
          <p className="-mt-2 mb-3 font-source-serif text-[14px] italic text-[var(--ink-4)]">
            Een schaal die het voorstellingsvermogen tart.
          </p>

          <div className="border p-5" style={{ borderColor: VIZ.line, background: VIZ.card }}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p
                className="text-[var(--ink)]"
                style={{ fontFamily: 'var(--font-playfair, serif)', fontWeight: 900, fontSize: 'clamp(18px,2.4vw,24px)', lineHeight: 1.12 }}
              >
                {musk.caption}
              </p>
              {musk.ratio != null && (
                <p
                  className="shrink-0"
                  style={{ fontFamily: 'var(--font-playfair, serif)', fontWeight: 900, fontSize: 'clamp(26px,4vw,42px)', lineHeight: 1, color: VIZ.accent }}
                >
                  ×{Math.round(musk.ratio).toLocaleString('nl-NL')}
                </p>
              )}
            </div>

            {/* compacte meter: bijna-onzichtbare sliver "jij" naast volle balk Musk */}
            <div className="mt-4 space-y-2" aria-hidden>
              <div className="flex items-center gap-3">
                <span className="w-12 shrink-0 font-dm-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
                  Jij
                </span>
                <div className="h-2.5 flex-1 overflow-hidden border" style={{ borderColor: VIZ.line, background: 'var(--paper)' }}>
                  <div className="h-full" style={{ width: '0.35%', minWidth: '2px', background: VIZ.ink }} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-12 shrink-0 font-dm-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
                  Musk
                </span>
                <div className="h-2.5 flex-1 overflow-hidden border" style={{ borderColor: VIZ.line, background: 'var(--paper)' }}>
                  <div className="h-full w-full" style={{ background: VIZ.accent }} />
                </div>
              </div>
            </div>

            {musk.freedomFraming && (
              <p className="mt-3 font-source-serif text-[13.5px] italic text-[var(--ink-2)]">
                {musk.freedomFraming}
              </p>
            )}

            <p className="mt-4 border-t border-dashed pt-2.5 font-dm-mono text-[10px] text-[var(--ink-4)]" style={{ borderColor: VIZ.line }}>
              Bron: {musk.source.label} ({musk.source.year})
              {musk.source.note ? ` — ${musk.source.note}` : ''}
            </p>
          </div>
        </div>
      )}

      {/* ── Bronnen ── */}
      {data.sources.length > 0 && (
        <div className="mt-10">
          <p className="mb-3 font-dm-mono text-[11px] uppercase tracking-[0.24em] text-[var(--ink-4)]">Bronnen</p>
          <ul>
            {data.sources.map((s, idx) => (
              <SourceLine key={`${s.label}-${idx}`} source={s} />
            ))}
          </ul>
        </div>
      )}

      {/* ── Footer ── */}
      <footer className="mt-16 pt-6 text-center" style={{ borderTop: '3px double var(--ink)' }}>
        <p className="font-playfair text-[30px] font-black text-[var(--ink)]" style={{ fontFamily: 'var(--font-playfair, serif)' }}>
          tf<span style={{ color: VIZ.accent }}>.</span>
        </p>
        <p className="mt-1 font-source-serif text-[14px] italic text-[var(--ink-2)]">
          &ldquo;Geld is opgeslagen tijd&rdquo;
        </p>
        <div className="mt-3.5 flex items-center justify-center gap-3.5 font-dm-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-4)]">
          <span>TriFinity</span>
          <span style={{ color: VIZ.gold }}>◆</span>
          <span>{generatedTime}</span>
          <span style={{ color: VIZ.gold }}>◆</span>
          <span>Benchmark</span>
        </div>
      </footer>
      <OrnamentColophon module="Benchmark" text={generatedDate} />

      {/* Gedeelde detail-sheet voor klikbare cijfers */}
      <MetricDetailSheet
        metric={activeMetric}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        formatValue={formatValue}
      />
    </div>
  )
}
