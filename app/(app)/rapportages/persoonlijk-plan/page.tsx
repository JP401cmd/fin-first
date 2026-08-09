'use client'

/**
 * Persoonlijk plan — client page.
 *
 * Editorial-rapport rond `GET /api/report/persoonlijk-plan`. Patroon spiegelt
 * `app/(app)/rapportages/balans/page.tsx`. Toont alleen de input-zijde van de
 * FIRE/horizon-berekeningen: demografie, inkomen, AOW/pensioen, uitgaven,
 * FIRE-rekenparameters, eindstrategie, onttrekkingsstrategie.
 *
 * Geen prognose-cijfers — die staan in andere rapporten. Doel hier:
 * "klopt dit nog?" voor de gebruiker zelf, partner, of adviseur.
 *
 * Spec: docs/superpowers/specs/2026-05-11-kern-rapport-en-instellingen-rapport-design.md
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
import type { PersoonlijkPlanData } from '@/lib/persoonlijk-plan-data'

// ── Main page ───────────────────────────────────────────────────────

export default function PersoonlijkPlanPage() {
  const [data, setData] = useState<PersoonlijkPlanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchPlan() {
      try {
        const res = await fetch('/api/report/persoonlijk-plan')
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Persoonlijk plan laden mislukt')
        }
        setData(await res.json())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Persoonlijk plan laden mislukt')
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
          <p className="font-inter text-sm text-[var(--ink-3)]">Persoonlijk plan wordt opgesteld...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="font-playfair text-xl text-[var(--ink)]">Persoonlijk plan niet beschikbaar</p>
          <p className="mt-2 font-inter text-sm text-[var(--ink-3)]">{error || 'Geen data gevonden'}</p>
        </div>
      </div>
    )
  }

  const generatedDate = formatTimestamp(data.generatedAt)
  const titlePerson = data.demografie.fullName
    ? `${data.demografie.fullName} — uitgangspunten en strategie`
    : 'Uitgangspunten en strategie'

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
      <NavStackMeta title="Persoonlijk plan" bottomBar={{ kind: 'tabs' }} />

      {/* ── Toolbar ── */}
      <div data-print-hide className="mb-6 flex items-center justify-end gap-3">
        <PageInfoButton description={PAGE_INFO['/rapportages/persoonlijk-plan'] ?? ''} />
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
          Persoonlijk plan
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
      {/* APP-7-opt-out: een rapportage is een gegenereerd (print)document —
          het mag nooit cijfers verliezen door de weergavemodus van het scherm. */}
      <FiguresStrip
        alwaysFull
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
            kicker: 'Eindleeftijd',
            amount: String(data.hero.fireEndAge),
            sub: 'uit strategie',
            variant: 'winner',
          },
          {
            kicker: 'Levensverwachting',
            amount: String(data.hero.lifeExpectancyProxy),
            sub: 'proxy via eindleeftijd',
            variant: 'neutral',
          },
        ]}
      />

      {/* ── Methodologie-callout ── */}
      <section className="report-section">
        <ScenarioCallout title="Wat staat hier in?">
          Dit rapport toont de aannames waarmee TriFinity je FIRE-, horizon- en pensioenberekeningen
          opstelt — geen prognoses, alleen de input-zijde. Lees het door om te controleren of de
          parameters nog kloppen met je situatie. Wijzig waardes in <em>Identiteit → Instellingen</em>.
        </ScenarioCallout>
      </section>

      {/* Secties iii. t/m ix. — elke block-component zet z'n eigen
         `.report-section` op de outer `<section>` voor page-break-control. */}
      <DemografieBlock data={data.demografie} aowMonths={data.hero.aowAgeMonths} />
      <InkomenBlock data={data.inkomen} />
      <CashflowBlock cashflows={data.cashflows} />
      <UitgavenBlock data={data.uitgaven} />
      <FireParamsBlock data={data.fireParams} />
      <EindstrategieBlock data={data.eindstrategie} />
      <OnttrekkingBlock data={data.onttrekking} />

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
        <OrnamentColophon module="Persoonlijk plan" text={generatedDate} />
      </section>
    </div>
  )
}
