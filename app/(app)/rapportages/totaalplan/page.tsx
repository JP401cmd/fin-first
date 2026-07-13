'use client'

/**
 * Totaalplan — client page.
 *
 * Het gecomponeerde "plan-als-document" (roadmap K): de aannames-blokken van
 * het persoonlijk-plan-rapport (byte-identiek hergebruikt) PLUS een
 * vermogensprojectie, een plan-brede slagingskans en deterministische inzichten.
 * Deelbaar via `window.print()` → PDF. Alle cijfers single-source uit de
 * horizon-kernel (CONSUME DON'T RECOMPUTE).
 *
 * Patroon spiegelt `app/(app)/rapportages/persoonlijk-plan/page.tsx`.
 */

import { useEffect, useState } from 'react'
import { Printer } from 'lucide-react'
import { formatTimestamp } from '@/lib/format'
import {
  FiguresStrip,
  ScenarioCallout,
  OrnamentColophon,
  PageInfoButton,
} from '@/components/editorial'
import { PAGE_INFO } from '@/lib/page-info-content'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import {
  DemografieBlock,
  InkomenBlock,
  CashflowBlock,
  UitgavenBlock,
  FireParamsBlock,
  EindstrategieBlock,
  OnttrekkingBlock,
} from '@/components/rapportage/persoonlijk-plan-blocks'
import {
  ProjectieBlock,
  SlagingskansBlock,
  InzichtenBlock,
} from '@/components/rapportage/totaalplan-blocks'
import type { TotaalplanData } from '@/lib/totaalplan-data'

export default function TotaalplanPage() {
  const [data, setData] = useState<TotaalplanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchPlan() {
      try {
        const res = await fetch('/api/report/totaalplan')
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Totaalplan laden mislukt')
        }
        setData(await res.json())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Totaalplan laden mislukt')
      } finally {
        setLoading(false)
      }
    }
    fetchPlan()
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[var(--module-active-500)] border-t-transparent" />
          <p className="font-inter text-sm text-[var(--ink-3)]">Totaalplan wordt opgesteld...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="font-playfair text-xl text-[var(--ink)]">Totaalplan niet beschikbaar</p>
          <p className="mt-2 font-inter text-sm text-[var(--ink-3)]">{error || 'Geen data gevonden'}</p>
        </div>
      </div>
    )
  }

  const generatedDate = formatTimestamp(data.generatedAt)
  const titlePerson = data.demografie.fullName
    ? `${data.demografie.fullName} — je volledige plan`
    : 'Je volledige plan'

  const subline = [
    data.demografie.householdTypeLabel,
    data.demografie.numberOfChildren > 0
      ? `${data.demografie.numberOfChildren} ${data.demografie.numberOfChildren === 1 ? 'kind' : 'kinderen'}`
      : null,
    `Gegenereerd ${new Date(data.generatedAt).toLocaleDateString('nl-NL', { year: 'numeric', month: 'long', day: 'numeric' })}`,
  ].filter(Boolean)

  return (
    <div
      className="report-pdf-root mx-auto max-w-[900px] px-4 py-6 md:px-8"
      data-report-module="horizon"
    >
      <NavStackMeta title="Totaalplan" bottomBar={{ kind: 'tabs' }} />

      {/* ── Toolbar ── */}
      <div data-print-hide className="mb-6 flex items-center justify-end gap-3">
        <PageInfoButton description={PAGE_INFO['/rapportages/totaalplan'] ?? ''} />
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-4 py-2 font-inter text-sm font-medium text-[var(--ink)] shadow-[var(--s0)] transition-all hover:shadow-[var(--s1)] hover:-translate-y-px"
        >
          <Printer className="h-4 w-4" />
          Afdrukken als PDF
        </button>
      </div>

      {/* ── Masthead ──
         `.report-section` voor `break-inside: avoid` in print. */}
      <div
        className="report-section pb-4 mb-8"
        style={{ borderBottom: '4px double var(--ink)' }}
      >
        <div className="inline-flex items-center justify-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)] mb-1 w-full">
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: 'var(--module-active-500)' }}
          />
          Totaalplan
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: 'var(--module-active-500)' }}
          />
        </div>
        <h1
          className="text-center text-2xl font-bold tracking-tight text-[var(--ink)] md:text-[36px] md:leading-[1.15]"
          style={{ fontFamily: 'var(--font-playfair, serif)', letterSpacing: '-0.03em' }}
        >
          {titlePerson}
        </h1>
        <p className="mt-2 text-center font-source-serif text-[15px] italic text-[var(--ink-2)]">
          Je volledige plan — aannames, projectie en slagingskans op één plek.
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px] font-source-serif italic text-[var(--ink-3)]">
          {subline.map((part, idx) => (
            <span key={idx}>
              {idx > 0 && <span className="mr-2">&middot;</span>}
              {part}
            </span>
          ))}
        </div>
      </div>

      {/* ── Mini-hero — FiguresStrip ── */}
      <FiguresStrip
        cols={4}
        figures={[
          {
            kicker: 'Huidige leeftijd',
            amount: data.hero.currentAge != null ? `${data.hero.currentAge}` : '—',
            sub: 'jaar',
            variant: 'neutral',
          },
          {
            kicker: 'AOW-leeftijd',
            amount: `${data.hero.aowAgeYears}${data.hero.aowAgeMonths > 0 ? `+${data.hero.aowAgeMonths}m` : ''}`,
            sub: data.hero.aowDefinitive ? 'wettelijk vast' : 'CBS-prognose',
            variant: 'neutral',
          },
          {
            kicker: 'Vrijheidsleeftijd',
            amount: data.projectie.ok && data.projectie.fireReachable && data.projectie.fireAge != null
              ? `${Math.floor(data.projectie.fireAgeFractional ?? data.projectie.fireAge)}`
              : '—',
            sub: data.projectie.ok && data.projectie.fireReachable && data.projectie.fireCalendarYear != null
              ? `in ${data.projectie.fireCalendarYear}`
              : 'FIRE',
            variant: 'winner',
          },
          {
            kicker: 'Slagingskans',
            amount: data.slagingskans.ok && data.slagingskans.successProbability != null
              ? `${Math.round(data.slagingskans.successProbability * 100)}%`
              : '—',
            sub: 'plan houdt stand',
            variant: 'neutral',
          },
        ]}
      />

      {/* ── Methodologie-callout ── */}
      <section className="report-section">
        <ScenarioCallout title="Wat staat hier in?">
          Dit rapport bundelt je hele plan: eerst de <em>aannames</em> waarmee TriFinity rekent
          (demografie, inkomen, AOW, uitgaven, rendement, eindstrategie), daarna de <em>projectie</em> van
          je vermogen naar volledige vrijheid, de <em>slagingskans</em> onder marktschommelingen en concrete{' '}
          <em>inzichten</em>. Alle cijfers komen uit dezelfde rekenmotor als Toekomst en Overzicht — niets
          wordt hier apart berekend. Deelbaar als PDF met je partner of adviseur.
        </ScenarioCallout>
      </section>

      {/* Aannames — secties iii. t/m ix. (hergebruikt uit persoonlijk-plan). */}
      <DemografieBlock data={data.demografie} aowMonths={data.hero.aowAgeMonths} />
      <InkomenBlock data={data.inkomen} />
      <CashflowBlock cashflows={data.cashflows} />
      <UitgavenBlock data={data.uitgaven} />
      <FireParamsBlock data={data.fireParams} />
      <EindstrategieBlock data={data.eindstrategie} />
      <OnttrekkingBlock data={data.onttrekking} />

      {/* Projectie, slagingskans en inzichten — secties x. t/m xii. */}
      <ProjectieBlock projectie={data.projectie} dailyExpenseRate={data.dailyExpenseRate} num="x." />
      <SlagingskansBlock slagingskans={data.slagingskans} num="xi." />
      <InzichtenBlock inzichten={data.inzichten} num="xii." />

      {/* Colophon */}
      <section className="report-section">
        <div className="mt-10 border-t-4 border-double border-[var(--ink)]" />
        <div className="text-center pt-4">
          <p className="font-playfair text-lg font-bold text-[var(--ink)]">
            <span>t</span><span style={{ color: 'var(--module-active-700)' }}>f.</span>
          </p>
          <p className="mt-1 font-source-serif text-[13px] italic text-[var(--ink-3)]">
            &ldquo;Geld is opgeslagen tijd&rdquo;
          </p>
        </div>
        <OrnamentColophon module="Totaalplan" text={generatedDate} />
      </section>
    </div>
  )
}
