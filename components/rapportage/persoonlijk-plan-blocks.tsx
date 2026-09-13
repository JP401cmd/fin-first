'use client'

/**
 * Persoonlijk plan — herbruikbare rapport-blokken.
 *
 * Geëxtraheerd (gedragsneutraal) uit `app/(app)/rapportages/persoonlijk-plan/page.tsx`
 * zodat zowel dat rapport als het gecomponeerde `/rapportages/totaalplan`-rapport
 * exact dezelfde aannames-blokken tonen. Pure presentatie — geen state/side-effects
 * behalve de privacy-masking-hook.
 *
 * Elk blok zet z'n eigen `.report-section` op de outer `<section>` voor
 * page-break-control in print. De romeinse nummering (iii. t/m ix.) staat bewust
 * hardcoded per blok — beide rapporten hergebruiken dezelfde volgorde.
 */

import { useCallback } from 'react'
import { formatDecimal, formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { SectionLabel } from '@/components/editorial'
import { BOX3_METHOD_LABELS } from '@/lib/box3-method'
import type {
  PersoonlijkPlanCashflow,
  PersoonlijkPlanDemografie,
  PersoonlijkPlanInkomen,
  PersoonlijkPlanUitgaven,
  PersoonlijkPlanFireParams,
  PersoonlijkPlanEindstrategie,
  PersoonlijkPlanOnttrekking,
} from '@/lib/persoonlijk-plan-data'

export function useFc() {
  const { masked } = useMaskedAmounts()
  return useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])
}

/**
 * Render een definition-list-paartje. Lege waardes (null/undefined/'') krijgen
 * de "—" placeholder in `var(--ink-4)` zodat duidelijk is dat het veld nog
 * ingevuld kan worden in `/mijn/profiel`. Spec sectie 5.
 */
export function DefinitionRow({
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

export function DemografieBlock({ data, aowMonths }: { data: PersoonlijkPlanDemografie; aowMonths: number }) {
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
          sub={'volgens de wettelijke AOW-tabel voor jouw geboortejaar'}
        />
      </div>
    </section>
  )
}

export function InkomenBlock({ data }: { data: PersoonlijkPlanInkomen }) {
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
          sub={data.estimatedGrossAnnualIncome != null ? 'ruwe schatting — vul aan bij Mijn → Profiel' : undefined}
        />
        <DefinitionRow
          label="Marginaal IB-tarief"
          value={`${formatDecimal(data.marginaalTarief * 100, 2)}%`}
          sub={data.marginaalTarief >= 0.4 ? 'hoogste schijf — €75.518+ bruto/jr' : 'eerste schijf — t/m €75.518 bruto/jr'}
        />
        <DefinitionRow
          label="Box 3 methode"
          value={BOX3_METHOD_LABELS[data.box3Method]}
        />
      </div>
    </section>
  )
}

export function CashflowBlock({ cashflows }: { cashflows: PersoonlijkPlanCashflow[] }) {
  const fc = useFc()
  return (
    <section className="report-section mb-6">
      <SectionLabel num="v.">AOW & aanvullend pensioen</SectionLabel>
      {cashflows.length === 0 ? (
        <p
          className="font-source-serif italic text-[13px] text-[var(--ink-3)]"
        >
          Nog geen AOW of aanvullend pensioen vastgelegd. Je voegt ze toe bij Toekomst →
          Gebeurtenissen.
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

export function UitgavenBlock({ data }: { data: PersoonlijkPlanUitgaven }) {
  const fc = useFc()
  const methodLabels: Record<string, string> = {
    essential_budgets: 'Essentiële budgetten',
    custom_amount: 'Eigen bedrag',
    current_income: 'Huidig jaarinkomen',
  }
  // Terugval bewust NIET de rauwe sleutel (`essential_budgets`): een onbekende
  // methode zou anders een snake_case-veldnaam op het scherm zetten.
  const methodLabel = methodLabels[data.retirementExpenseMethod] ?? 'eigen keuze'

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

export function FireParamsBlock({ data }: { data: PersoonlijkPlanFireParams }) {
  return (
    <section className="report-section mb-6">
      <SectionLabel num="vii.">FIRE-rekenparameters</SectionLabel>
      <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
        <DefinitionRow
          label="Bruto rendement"
          value={`${formatDecimal(data.grossReturn * 100, 2)}%`}
        />
        <DefinitionRow
          label="Inflatie"
          value={`${formatDecimal(data.inflationRate * 100, 2)}%`}
        />
        <DefinitionRow
          label="Box 3 methode"
          value={BOX3_METHOD_LABELS[data.box3Method]}
        />
        <DefinitionRow
          label="Effectieve SWR"
          value={`${formatDecimal(data.effectiveSwr * 100, 2)}%`}
          sub={`= bruto rendement − Box 3 drag (${formatDecimal(data.box3Drag * 100, 2)}%) − inflatie`}
        />
      </div>
    </section>
  )
}

export function EindstrategieBlock({ data }: { data: PersoonlijkPlanEindstrategie }) {
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

export function OnttrekkingBlock({ data }: { data: PersoonlijkPlanOnttrekking }) {
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
              value={`${formatDecimal(data.guardrailFloor * 100, 0)}% van basis`}
            />
            <DefinitionRow
              label="Ceiling (bovengrens)"
              value={`${formatDecimal(data.guardrailCeiling * 100, 0)}% van basis`}
            />
            <DefinitionRow
              label="Aanpassingsstap"
              value={`${formatDecimal(data.guardrailCutStep * 100, 0)}%`}
              sub="omlaag bij beurswind tegen, omhoog bij beurswind mee"
            />
          </div>
        )}

        {/* De SWR-/4%-duiding hoort ALLEEN bij het vaste profiel: afnemend/oplopend
            rekenen met een fase-curve, guardrails met een bandbreedte (B-042). */}
        {data.type === 'vast' && (
          <p
            className="mt-3 text-[12px] italic text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            Default voor de meeste plannen. De simulator gebruikt de geconfigureerde effectieve SWR — in NL
            door Box 3 lager dan internationaal vaak wordt aangenomen (zie sectie vii).
          </p>
        )}
      </div>
    </section>
  )
}
