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

import { useEffect, useState, useCallback } from 'react'
import { Printer } from 'lucide-react'
import { formatMaskedCurrency, formatTimestamp } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import {
  FiguresStrip,
  ScenarioCallout,
  SectionLabel,
  OrnamentColophon,
} from '@/components/editorial'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import type {
  PersoonlijkPlanData,
  PersoonlijkPlanCashflow,
  PersoonlijkPlanDemografie,
  PersoonlijkPlanInkomen,
  PersoonlijkPlanUitgaven,
  PersoonlijkPlanFireParams,
  PersoonlijkPlanEindstrategie,
  PersoonlijkPlanOnttrekking,
} from '@/lib/persoonlijk-plan-data'

function useFc() {
  const { masked } = useMaskedAmounts()
  return useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])
}

/**
 * Render een definition-list-paartje. Lege waardes (null/undefined/'') krijgen
 * de "—" placeholder in `var(--ink-4)` zodat duidelijk is dat het veld nog
 * ingevuld kan worden in `/mijn/profiel`. Spec sectie 5.
 */
function DefinitionRow({
  label,
  value,
  sub,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
}) {
  const isEmpty = value == null || value === '' || value === '—'
  return (
    <div className="border-b border-dashed border-[var(--rule-soft)] py-2 last:border-b-0">
      <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-3)]">{label}</p>
      <p
        className={`mt-0.5 font-source-serif text-[14px] ${isEmpty ? 'text-[var(--ink-4)]' : 'text-[var(--ink)]'}`}
      >
        {isEmpty ? '—' : value}
      </p>
      {sub && (
        <p
          className="mt-0.5 text-[11px] italic text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          {sub}
        </p>
      )}
    </div>
  )
}

function DemografieBlock({ data, aowMonths }: { data: PersoonlijkPlanDemografie; aowMonths: number }) {
  const aowLabel = aowMonths === 0
    ? `${data.aowAgeYears} jaar`
    : `${data.aowAgeYears} jaar en ${aowMonths} maanden`

  return (
    <section className="report-section mb-6">
      <SectionLabel num="iii.">Demografie & levensloop</SectionLabel>
      <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
        <DefinitionRow
          label="Geboortedatum"
          value={data.dateOfBirth ? new Date(data.dateOfBirth).toLocaleDateString('nl-NL', { year: 'numeric', month: 'long', day: 'numeric' }) : null}
        />
        <DefinitionRow
          label="Huidige leeftijd"
          value={data.currentAge != null ? `${data.currentAge} jaar` : null}
        />
        <DefinitionRow
          label="Huishouden-type"
          value={data.householdTypeLabel}
        />
        <DefinitionRow
          label="Aantal kinderen"
          value={String(data.numberOfChildren)}
        />
        <DefinitionRow
          label="Geplande eindleeftijd"
          value={`${data.fireEndAge} jaar`}
          sub={<>uit FIRE-strategie · ook gebruikt als levensverwachting-proxy</>}
        />
        <DefinitionRow
          label="AOW-leeftijd"
          value={aowLabel}
          sub={'bron: aow_leeftijd-tabel'}
        />
      </div>
    </section>
  )
}

function InkomenBlock({ data }: { data: PersoonlijkPlanInkomen }) {
  const fc = useFc()
  return (
    <section className="report-section mb-6">
      <SectionLabel num="iv.">Inkomen</SectionLabel>
      <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
        <DefinitionRow
          label="Netto maandinkomen"
          value={data.netMonthlyIncome > 0 ? fc(data.netMonthlyIncome) : null}
        />
        <DefinitionRow
          label="Bruto jaarinkomen"
          value={data.estimatedGrossAnnualIncome != null ? fc(data.estimatedGrossAnnualIncome) : null}
          sub={data.estimatedGrossAnnualIncome != null ? 'ruwe schatting — vul aan in instellingen' : undefined}
        />
        <DefinitionRow
          label="Marginaal IB-tarief"
          value={`${(data.marginaalTarief * 100).toFixed(2)}%`}
          sub={data.marginaalTarief >= 0.4 ? 'hoogste schijf — €75.518+ bruto/jr' : 'eerste schijf — t/m €75.518 bruto/jr'}
        />
        <DefinitionRow
          label="Box 3 methode"
          value={data.box3Method === 'forfaitair' ? 'Forfaitair (vermogensmix)' : 'Werkelijk rendement'}
        />
      </div>
    </section>
  )
}

function CashflowBlock({ cashflows }: { cashflows: PersoonlijkPlanCashflow[] }) {
  const fc = useFc()
  return (
    <section className="report-section mb-6">
      <SectionLabel num="v.">AOW & aanvullend pensioen</SectionLabel>
      {cashflows.length === 0 ? (
        <p
          className="font-source-serif italic text-[13px] text-[var(--ink-3)]"
        >
          Geen AOW- of pensioen-cashflows geregistreerd. Voeg ze toe in Toekomst onder levensgebeurtenissen.
        </p>
      ) : (
        <div className="space-y-2">
          {cashflows.map((cf) => (
            <div
              key={cf.id}
              className="border border-[var(--border-ed)] p-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-source-serif text-[14px] font-medium text-[var(--ink)]">
                  {cf.name}
                  <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    {cf.type === 'aow' ? 'AOW' : 'pensioen'}
                  </span>
                  {cf.isIndexed && (
                    <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--module-active-700)]">
                      geïndexeerd
                    </span>
                  )}
                </p>
                <p className="font-dm-mono text-[14px] font-medium tabular-nums text-[var(--ink)]">
                  {fc(cf.monthlyAmount)}/mnd
                </p>
              </div>
              <p className="mt-0.5 font-inter text-[11px] text-[var(--ink-3)]">
                {cf.startAge != null ? `Start op ${cf.startAge} jaar` : 'Geen startleeftijd ingesteld'}
              </p>
              {cf.linkedAsset && (
                <p
                  className="mt-1 text-[11px] italic text-[var(--ink-3)]"
                  style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                >
                  Pensioenpot: {cf.linkedAsset.name} · huidige waarde {fc(cf.linkedAsset.currentValue)} · rendement {cf.linkedAsset.expectedReturnPct}%
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function UitgavenBlock({ data }: { data: PersoonlijkPlanUitgaven }) {
  const fc = useFc()
  const methodLabels: Record<string, string> = {
    essential_budgets: 'Essentiële budgetten',
    custom_amount: 'Eigen bedrag',
    current_income: 'Huidig jaarinkomen',
  }
  const methodLabel = methodLabels[data.retirementExpenseMethod] ?? data.retirementExpenseMethod

  return (
    <section className="report-section mb-6">
      <SectionLabel num="vi.">Uitgaven nu vs. na pensioen</SectionLabel>
      <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
        <DefinitionRow
          label="Huidige uitgaven (jaar)"
          value={data.yearlyEssentialExpenses > 0 ? fc(data.yearlyEssentialExpenses) : null}
          sub="optelsom van essentiële budgetten — fallback op schatting bij gebrek aan budget-data"
        />
        <DefinitionRow
          label="Uitgaven na pensioen (jaar)"
          value={fc(data.yearlyRetirementExpenses)}
          sub={`methode: ${methodLabel}`}
        />
        <DefinitionRow
          label="Verschil"
          value={
            <span className={data.delta >= 0 ? 'text-[var(--negative)]' : 'text-[var(--positive)]'}>
              {data.delta >= 0 ? '+' : ''}{fc(data.delta)}
            </span>
          }
        />
        <DefinitionRow
          label="% van huidige uitgaven"
          value={data.pctOfCurrent != null ? `${data.pctOfCurrent}%` : null}
        />
      </div>

      {data.retirementExpenseCustomAmount != null && data.retirementExpenseMethod === 'custom_amount' && (
        <p
          className="mt-3 text-[12px] italic text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          Eigen bedrag ingesteld op {fc(data.retirementExpenseCustomAmount)} per jaar.
        </p>
      )}
    </section>
  )
}

function FireParamsBlock({ data }: { data: PersoonlijkPlanFireParams }) {
  return (
    <section className="report-section mb-6">
      <SectionLabel num="vii.">FIRE-rekenparameters</SectionLabel>
      <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
        <DefinitionRow
          label="Bruto rendement"
          value={`${(data.grossReturn * 100).toFixed(2)}%`}
        />
        <DefinitionRow
          label="Inflatie"
          value={`${(data.inflationRate * 100).toFixed(2)}%`}
        />
        <DefinitionRow
          label="Box 3 methode"
          value={data.box3Method === 'forfaitair' ? 'Forfaitair' : 'Werkelijk'}
        />
        <DefinitionRow
          label="Effectieve SWR"
          value={`${(data.effectiveSwr * 100).toFixed(2)}%`}
          sub={`= bruto rendement − Box 3 drag (${(data.box3Drag * 100).toFixed(2)}%) − inflatie`}
        />
      </div>
    </section>
  )
}

function EindstrategieBlock({ data }: { data: PersoonlijkPlanEindstrategie }) {
  const fc = useFc()
  return (
    <section className="report-section mb-6">
      <SectionLabel num="viii.">Eindstrategie</SectionLabel>
      <div className="border border-[var(--border-ed)] p-4">
        <p
          className="font-playfair text-2xl font-bold text-[var(--ink)]"
          style={{ letterSpacing: '-0.02em' }}
        >
          {data.strategyName}
        </p>
        <p
          className="mt-1 font-source-serif text-[14px] italic text-[var(--ink-2)]"
        >
          {data.strategySubtitle}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-x-6 md:grid-cols-2">
          <DefinitionRow label="Eindleeftijd" value={`${data.endAge} jaar`} />
          {data.strategy === 'legacy' && (
            <DefinitionRow
              label="Doelbedrag nalatenschap"
              value={fc(data.legacyAmount)}
              sub="in huidige euro's; wordt inflatiebestendig vastgehouden"
            />
          )}
        </div>
      </div>
    </section>
  )
}

function OnttrekkingBlock({ data }: { data: PersoonlijkPlanOnttrekking }) {
  return (
    <section className="report-section mb-6">
      <SectionLabel num="ix.">Onttrekkingsstrategie</SectionLabel>
      <div className="border border-[var(--border-ed)] p-4">
        <p
          className="font-playfair text-2xl font-bold text-[var(--ink)]"
          style={{ letterSpacing: '-0.02em' }}
        >
          {data.typeLabel}
        </p>
        <p
          className="mt-1 font-source-serif text-[14px] italic text-[var(--ink-2)]"
        >
          {data.typeSubtitle}
        </p>

        {data.type === 'guardrails' && (
          <div className="mt-4 grid grid-cols-1 gap-x-6 md:grid-cols-2">
            <DefinitionRow
              label="Floor (ondergrens)"
              value={`${(data.guardrailFloor * 100).toFixed(0)}% van basis`}
            />
            <DefinitionRow
              label="Ceiling (bovengrens)"
              value={`${(data.guardrailCeiling * 100).toFixed(0)}% van basis`}
            />
            <DefinitionRow
              label="Cut-step"
              value={`${(data.guardrailCutStep * 100).toFixed(0)}%`}
              sub="verlaging bij beurswind tegen"
            />
            <DefinitionRow
              label="Raise-step"
              value={`${(data.guardrailRaiseStep * 100).toFixed(0)}%`}
              sub="verhoging bij beurswind mee"
            />
          </div>
        )}

        {data.type === 'static' && (
          <p
            className="mt-3 text-[12px] italic text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            Default voor de meeste plannen. De klassieke 4%-regel is in NL door Box 3 effectief lager — de
            simulator gebruikt de geconfigureerde effectieve SWR (zie sectie vii).
          </p>
        )}
      </div>
    </section>
  )
}

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
      <div data-print-hide className="mb-6 flex items-center justify-end">
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
