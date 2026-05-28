'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Sparkles, ArrowRight } from 'lucide-react'
import {
  LIFE_EVENT_CATALOG,
  type LifeEvent,
  type FinancialInput,
  ageAtDate,
} from '@/lib/horizon-data'
import {
  runSimulation,
  lifeEventsToCashflows,
} from '@/lib/fire-simulation'
import type { FireParams } from '@/lib/fire-params'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import { Kicker, FiguresStrip } from '@/components/editorial'
import { MaskedAmount } from '@/components/app/masked-amount'
import { isHousingStrategyEvent } from '@/lib/housing-strategy'
import { formatCurrency } from '@/lib/format'
import { EventImpactPreview } from './event-impact-preview'
import { EVENT_ICONS } from './log-timeline'

interface Props {
  event: LifeEvent
  baselineEvents: LifeEvent[]
  baselineInput: FinancialInput
  fireParams: FireParams
  fireStrategy: FireStrategyConfig
  withdrawalStrategy: WithdrawalStrategyConfig
  endAge: number
}

export function EventPaneView({
  event,
  baselineEvents,
  baselineInput,
  fireParams,
  fireStrategy,
  withdrawalStrategy,
  endAge,
}: Props) {
  const currentAge = baselineInput.dateOfBirth ? Math.floor(ageAtDate(baselineInput.dateOfBirth)) : 30

  const { baselineSim, withSim } = useMemo(() => {
    const eventsWithout = baselineEvents.filter(e => e.id !== event.id)
    const baselineCashflows = lifeEventsToCashflows(eventsWithout)
    const withCashflows = lifeEventsToCashflows([...eventsWithout, event])
    const yearlyExp = baselineInput.yearlyMustExpenses > 0 ? baselineInput.yearlyMustExpenses : 0
    const annualSavings = (baselineInput.monthlyContributions ?? 0) * 12
    const portfolio = baselineInput.totalAssets - baselineInput.totalDebts
    const args = [
      currentAge,
      endAge,
      portfolio,
      yearlyExp,
      annualSavings,
      fireParams.grossReturn,
      'nl_box3' as const,
      fireParams.inflationRate,
    ] as const
    return {
      baselineSim: runSimulation(...args, baselineCashflows, fireStrategy, withdrawalStrategy),
      withSim: runSimulation(...args, withCashflows, fireStrategy, withdrawalStrategy),
    }
  }, [event, baselineEvents, baselineInput, fireParams, fireStrategy, withdrawalStrategy, endAge, currentAge])

  const fireDeltaMonths =
    baselineSim.fireAgeFractional != null && withSim.fireAgeFractional != null
      ? Math.round((withSim.fireAgeFractional - baselineSim.fireAgeFractional) * 12)
      : null

  const catalogEntry = LIFE_EVENT_CATALOG[event.event_type]
  const eventIcon = catalogEntry?.icon ?? event.icon ?? 'Calendar'
  const isHousing = isHousingStrategyEvent(event)

  return (
    // Outer padding wordt geleverd door SlideInPane (driewegregel — ui-ux skill).
    // Extra `pb-6` voor lucht onder content; horizontale padding komt van de pane.
    <div className="pb-6">
      {/* Header */}
      <div className="mb-6 flex items-start gap-3">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--module-active-50)] text-[var(--module-active-700)]">
          {EVENT_ICONS[eventIcon] ?? EVENT_ICONS['Calendar']}
          {isHousing && (
            <span
              aria-hidden
              className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--paper)] bg-[var(--module-active-700)] text-[var(--paper)]"
              title="Beheerd via Eigen-woning-strategie"
            >
              <Sparkles className="h-3 w-3" />
            </span>
          )}
        </span>
        <div className="flex-1 min-w-0">
          <Kicker>{catalogEntry?.label ?? event.event_type}</Kicker>
          <h2
            className="mt-1 text-2xl sm:text-3xl font-black tracking-[-0.02em] truncate"
            style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
          >
            {event.name}
          </h2>
          <p
            className="mt-1 italic text-sm text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            Op {event.target_age}-jarige leeftijd
            {isHousing && (
              <>
                {' · '}
                <span className="not-italic">Beheerd via</span>{' '}
                <Link
                  href="/toekomst"
                  className="not-italic underline underline-offset-2 hover:text-[var(--ink-2)]"
                >
                  Eigen-woning-strategie
                </Link>
              </>
            )}
          </p>
        </div>
      </div>

      {isHousing && <HousingCalculationBreakdown event={event} />}

      {/* Live impact-chart */}
      <div className="mb-6">
        <EventImpactPreview
          baselineRows={baselineSim.rows}
          draftRows={withSim.rows}
          baselineFireAge={baselineSim.fireAgeFractional}
          draftFireAge={withSim.fireAgeFractional}
        />
      </div>

      {/* FiguresStrip — drie dimensies + delta */}
      <FiguresStrip
        cols={4}
        figures={[
          {
            kicker: 'Eenmalig',
            amount:
              event.one_time_cost === 0 ? (
                <span className="text-[var(--ink-4)] text-base font-normal italic">—</span>
              ) : (
                <MaskedAmount
                  value={Math.abs(event.one_time_cost)}
                  tone="horizon"
                  monoWhenVisible={false}
                  signPrefix={event.one_time_cost < 0 ? '+' : '-'}
                />
              ),
            sub: event.one_time_cost === 0 ? undefined : event.one_time_cost < 0 ? 'inkomst' : 'uitgave',
          },
          {
            kicker: 'Maandelijks',
            amount:
              event.monthly_cost_change > 0 ? (
                <MaskedAmount
                  value={event.monthly_cost_change}
                  tone="horizon"
                  monoWhenVisible={false}
                  signPrefix="-"
                />
              ) : event.monthly_income_change > 0 ? (
                <MaskedAmount
                  value={event.monthly_income_change}
                  tone="horizon"
                  monoWhenVisible={false}
                  signPrefix="+"
                />
              ) : (
                <span className="text-[var(--ink-4)] text-base font-normal italic">—</span>
              ),
            sub:
              event.monthly_cost_change > 0
                ? 'uitgave'
                : event.monthly_income_change > 0
                  ? 'inkomst'
                  : undefined,
          },
          {
            kicker: 'Duur',
            amount:
              event.duration_months === 0 && (event.monthly_cost_change > 0 || event.monthly_income_change > 0) ? (
                <span className="text-base">blijvend</span>
              ) : event.duration_months > 0 ? (
                <span>
                  {Math.round(event.duration_months / 12)}
                  <span className="text-base font-normal text-[var(--ink-3)] ml-1">jr</span>
                </span>
              ) : (
                <span className="text-[var(--ink-4)] text-base font-normal italic">—</span>
              ),
            sub: event.is_indexed ? 'inflatie-gekoppeld' : undefined,
          },
          {
            kicker: 'FIRE-impact',
            variant: fireDeltaMonths != null && fireDeltaMonths > 0 ? 'negative' : 'winner',
            amount:
              fireDeltaMonths == null ? (
                <span className="text-base">—</span>
              ) : fireDeltaMonths === 0 ? (
                <span className="text-base">geen</span>
              ) : (
                <span>
                  {fireDeltaMonths > 0 ? '+' : '−'}
                  {Math.abs(fireDeltaMonths)}
                  <span className="text-base font-normal text-[var(--ink-3)] ml-1">mnd</span>
                </span>
              ),
            sub: fireDeltaMonths != null && fireDeltaMonths > 0 ? 'vertraging' : 'op tijd',
          },
        ]}
      />

      {/* Action-knoppen (Bewerken / Verwijderen) zitten in de pane-footer
          conform UI/UX skill — niet inline. EventPane bouwt primaryAction +
          secondaryAction op basis van onEdit/onDelete props. */}
    </div>
  )
}

// ── Berekenings-uitleg voor housing-strategy events ──────────────────

interface DepletionTriggerInfo {
  triggerAge: number
  liquidAtTrigger: number
  equityAtTrigger: number
  reason: 'immediate' | 'crossover' | 'fallback' | 'still_accumulating'
  phase: 'accumulation' | 'decumulation'
  netDeclinePerYear: number
}

interface HousingMetadata {
  formula?: 'downsize' | 'reverse-payout'
  saleProceeds?: number
  wozValue?: number
  salePricePct?: number
  salesCostsPct?: number
  mortgageBalance?: number
  /** Geprojecteerd hypotheek-saldo bij trigger (na amortisatie). */
  mortgageBalanceAtTrigger?: number
  mortgageMonthlyPayment?: number
  /** Geprojecteerde maandbetaling bij trigger (0 als hypotheek dan al afgelost). */
  mortgagePaymentAtTrigger?: number
  /** Resterende maanden vanaf trigger tot oorspronkelijke einddatum hypotheek. */
  mortgageRemainingMonthsAtTrigger?: number
  yearsToTrigger?: number
  newMonthly?: number
  isAutoEstimate?: boolean
  equity?: number
  maxLoanPct?: number
  interestRate?: number
  remainingYears?: number
  monthlyPayout?: number
  eigenHuisValue?: number
  /** Trigger-mode ('fixed_age' | 'on_depletion'). */
  triggerMode?: 'fixed_age' | 'on_depletion'
  /** Trigger-uitleg bij on_depletion: waarom dit moment. */
  depletion?: DepletionTriggerInfo
  /** Huidig liquide vermogen (voor on_depletion-uitleg). */
  currentLiquidPortfolio?: number
  /** Jaarlijkse uitgaven (voor on_depletion-uitleg). */
  yearlyExpenses?: number
  /** Jaarlijks netto-spaarsaldo (voor on_depletion phase-uitleg). */
  annualSavings?: number
  /** Huidig jaarlijks netto-cashflow (income − expenses) × 12. */
  currentNetCashflowYearly?: number
}

function HousingCalculationBreakdown({ event }: { event: LifeEvent }) {
  const meta = (event.metadata ?? {}) as HousingMetadata
  if (!meta.formula) return null

  return (
    <section className="mb-6 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)]">
      <div className="border-b border-dashed border-[var(--border-ed)] px-4 py-2.5">
        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
          Berekening
        </p>
      </div>
      <div className="px-4 py-3">
        {meta.formula === 'downsize' && <DownsizeBreakdown meta={meta} />}
        {meta.formula === 'reverse-payout' && <ReversePayoutBreakdown meta={meta} />}
        <p className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] italic text-[var(--ink-3)]">
          Pas aan via{' '}
          <Link
            href="/toekomst"
            className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-[var(--ink-2)]"
          >
            Eigen-woning-strategie
            <ArrowRight className="h-3 w-3" />
          </Link>
        </p>
      </div>
    </section>
  )
}

function SubFormula({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <p className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--module-active-700)]">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function CalcRow({
  label,
  value,
  emphasis,
  divider,
}: {
  label: string
  value: string
  emphasis?: boolean
  divider?: boolean
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 ${divider ? 'border-t border-[var(--ink)] pt-2 mt-1' : 'py-0.5'}`}
    >
      <span
        className={`font-sans text-sm ${emphasis ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}
      >
        {label}
      </span>
      <span
        className={`font-mono tabular-nums ${emphasis ? 'text-sm font-semibold text-[var(--ink)]' : 'text-sm text-[var(--ink-2)]'}`}
      >
        {value}
      </span>
    </div>
  )
}

function DepletionReasoning({
  depletion,
  meta,
}: {
  depletion: DepletionTriggerInfo
  meta: HousingMetadata
}) {
  const liquidNow = meta.currentLiquidPortfolio ?? 0
  const equityNow = (meta.eigenHuisValue ?? meta.wozValue ?? 0) - (meta.mortgageBalance ?? 0)
  const yearlyExp = meta.yearlyExpenses ?? 0
  const annualSav = meta.annualSavings ?? 0
  const isAccumulating = depletion.phase === 'accumulation'

  const intro =
    depletion.reason === 'still_accumulating'
      ? 'Je zit nu nog in de opbouw-fase: je spaart per jaar meer dan je uitgeeft. Het huis hoef je niet aan te spreken als reservepot — pas zodra je netto inteert op je vermogen wordt verkoop relevant.'
      : depletion.reason === 'immediate'
        ? 'Je hebt nu geen liquide vermogen meer en zit in de afbouw-fase. Het huis is je laatste reservepot — verkoop is direct nodig.'
        : depletion.reason === 'crossover'
          ? `Op leeftijd ${depletion.triggerAge} raakt je liquide vermogen op. Vanaf dat moment is het huis nodig om aan je uitgaven te kunnen voldoen.`
          : `Liquide vermogen raakt niet op binnen je fallback-window. We forceren de verkoop op leeftijd ${depletion.triggerAge} als uiterste moment.`

  return (
    <div className="mt-4 rounded-[var(--r)] border border-l-4 border-l-[var(--module-active-500)] border-[var(--border-ed)] bg-[var(--paper)] p-4">
      <p className="mb-3 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
        Waarom op deze leeftijd?
      </p>
      <p className="mb-3 font-sans text-[13px] leading-relaxed text-[var(--ink-2)]">{intro}</p>

      <p className="mb-1.5 font-sans text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-3)]">
        Stap 1 — Welke fase zit je in?
      </p>
      <p className="mb-2 font-sans text-[11px] italic leading-snug text-[var(--ink-3)]">
        Opbouw = je inkomen overstijgt je uitgaven; je vermogen groeit netto. In dat geval is
        verkoop niet nodig — los van wat de getallen zeggen.
      </p>
      <div className="mb-3 space-y-0.5">
        {meta.currentNetCashflowYearly != null ? (
          <>
            <CalcRow
              label="Huidig jaarlijks inkomen − uitgaven"
              value={`${meta.currentNetCashflowYearly >= 0 ? '+' : '−'} ${formatCurrency(Math.abs(meta.currentNetCashflowYearly))}/jr`}
            />
            <CalcRow
              label={
                isAccumulating
                  ? 'Positief: nog in opbouw-fase'
                  : 'Negatief: tussen- of afbouw-fase'
              }
              value={isAccumulating ? '— geen trigger nu' : '— trigger eligible'}
              emphasis
              divider
            />
          </>
        ) : (
          <>
            <CalcRow label="Jaarlijks netto-spaarsaldo" value={`+ ${formatCurrency(annualSav)}`} />
            <CalcRow label="Jaarlijkse uitgaven" value={`− ${formatCurrency(yearlyExp)}`} />
            <CalcRow
              label={
                isAccumulating
                  ? 'Saldo positief — opbouw-fase'
                  : 'Saldo negatief — tussen- of afbouw-fase'
              }
              value={`= ${annualSav - yearlyExp >= 0 ? '+' : '−'} ${formatCurrency(Math.abs(annualSav - yearlyExp))}/jr`}
              emphasis
              divider
            />
          </>
        )}
      </div>

      {!isAccumulating && (
        <>
          <p className="mb-1.5 font-sans text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-3)]">
            Stap 2 — Wanneer is het huis nodig als reservepot?
          </p>
          <p className="mb-2 font-sans text-[11px] italic leading-snug text-[var(--ink-3)]">
            Regel: zodra het totale vermogen daalt tot het niveau van het eigen-huis-vermogen
            (= liquide raakt op).
          </p>
          <div className="space-y-0.5">
            <CalcRow label="Liquide vermogen nu" value={formatCurrency(liquidNow)} />
            <CalcRow
              label="Eigen-huis-vermogen (WOZ − hypotheek)"
              value={formatCurrency(equityNow)}
            />
            <CalcRow
              label="Totaal vermogen nu (liquide + eigen-huis)"
              value={formatCurrency(liquidNow + equityNow)}
            />
            {depletion.reason !== 'immediate' && depletion.netDeclinePerYear > 0 && (
              <CalcRow
                label={`Liquide neemt netto af met ${formatCurrency(depletion.netDeclinePerYear)}/jaar`}
                value=""
              />
            )}
            <CalcRow
              label={`Liquide vermogen op leeftijd ${depletion.triggerAge}`}
              value={formatCurrency(depletion.liquidAtTrigger)}
            />
            <CalcRow
              label={`Totaal = eigen-huis-vermogen op leeftijd ${depletion.triggerAge}`}
              value={formatCurrency(depletion.equityAtTrigger)}
              divider
            />
            <CalcRow
              label="→ Verkoop-moment"
              value={`leeftijd ${depletion.triggerAge}`}
              emphasis
            />
          </div>
        </>
      )}

      {isAccumulating && (
        <>
          <p className="mb-1.5 font-sans text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-3)]">
            Stap 2 — Geen trigger nodig
          </p>
          <p className="font-sans text-[13px] leading-relaxed text-[var(--ink-2)]">
            Zolang je netto blijft sparen, groeit je vermogen vanzelf. Verkoop wordt pas
            relevant zodra je inteert — dan komt deze trigger automatisch terug. Tot dan
            gebruiken we leeftijd <strong>{depletion.triggerAge}</strong> als uiterste moment.
          </p>
        </>
      )}

      <p className="mt-3 font-sans text-[11px] italic text-[var(--ink-3)]">
        Schatting: liquide vermogen daalt lineair met (uitgaven − spaarsaldo) per jaar;
        rendement wordt niet meegerekend (conservatief). Overwaarde volgt de amortisatie
        van je hypotheek per jaar.
      </p>
    </div>
  )
}

function DownsizeBreakdown({ meta }: { meta: HousingMetadata }) {
  const woz = meta.wozValue ?? 0
  const salePct = meta.salePricePct ?? 1
  const costsPct = meta.salesCostsPct ?? 0
  const grossSale = woz * salePct
  const netSale = grossSale * (1 - costsPct)
  const mortgageBalanceNow = meta.mortgageBalance ?? 0
  const mortgageBalanceAtTrigger = meta.mortgageBalanceAtTrigger ?? mortgageBalanceNow
  const yearsToTrigger = meta.yearsToTrigger ?? 0
  const proceeds = meta.saleProceeds ?? netSale - mortgageBalanceAtTrigger
  const mortgagePaymentNow = meta.mortgageMonthlyPayment ?? 0
  const mortgagePaymentAtTrigger = meta.mortgagePaymentAtTrigger ?? mortgagePaymentNow
  const newMonthly = meta.newMonthly ?? 0
  const isAuto = meta.isAutoEstimate ?? true
  const netMonthlyDelta = newMonthly - mortgagePaymentAtTrigger // positief = duurder dan voorheen
  const hypotheekAfgelostBijTrigger = mortgageBalanceAtTrigger === 0 && mortgageBalanceNow > 0

  return (
    <div>
      <p className="font-sans text-[13px] leading-relaxed text-[var(--ink-2)]">
        Op dit moment verandert er drie dingen tegelijk: je krijgt cash uit de verkoop, je oude
        hypotheekbetaling vervalt, en er komt een nieuwe woonlast voor in de plaats.
      </p>

      {meta.triggerMode === 'on_depletion' && meta.depletion && (
        <DepletionReasoning depletion={meta.depletion} meta={meta} />
      )}

      <div className="mt-4 border-t border-[var(--border-ed)] pt-4">
        <SubFormula label="1. Eenmalige verkoopopbrengst">
          <CalcRow label="WOZ-waarde" value={formatCurrency(woz)} />
          <CalcRow
            label={`Verkoopprijs (${(salePct * 100).toFixed(0)}% van WOZ)`}
            value={formatCurrency(grossSale)}
          />
          <CalcRow
            label={`Verkoopkosten (${(costsPct * 100).toFixed(1)}%) — makelaar, notaris, verhuizen`}
            value={`− ${formatCurrency(grossSale * costsPct)}`}
          />
          <CalcRow label="Netto verkoopopbrengst" value={formatCurrency(netSale)} />
          {mortgageBalanceNow > 0 && (
            <>
              <CalcRow
                label="Huidig hypotheek-saldo"
                value={formatCurrency(mortgageBalanceNow)}
              />
              {yearsToTrigger > 0 && (
                <CalcRow
                  label={
                    hypotheekAfgelostBijTrigger
                      ? `Geheel afgelost in ${yearsToTrigger} jaar (afhankelijk van aflossingsschema)`
                      : `Geprojecteerd saldo na ${yearsToTrigger} jaar amortisatie`
                  }
                  value={`− ${formatCurrency(mortgageBalanceAtTrigger)}`}
                />
              )}
            </>
          )}
          <CalcRow label="Naar belegbaar vermogen" value={formatCurrency(proceeds)} emphasis divider />
        </SubFormula>

        {mortgagePaymentNow > 0 && (
          <SubFormula label="2. Reductie hypotheekkosten">
            <CalcRow
              label="Huidige maandelijkse hypotheekbetaling"
              value={formatCurrency(mortgagePaymentNow)}
            />
            {mortgagePaymentAtTrigger === 0 ? (
              <CalcRow
                label="Hypotheek is bij trigger al volledig afgelost"
                value="€ 0/mnd"
                emphasis
                divider
              />
            ) : (
              <>
                <CalcRow
                  label="Vervalt vanaf trigger-moment"
                  value={`+ ${formatCurrency(mortgagePaymentAtTrigger)}/mnd`}
                  emphasis
                  divider
                />
                {meta.mortgageRemainingMonthsAtTrigger != null &&
                  meta.mortgageRemainingMonthsAtTrigger > 0 && (
                    <p className="mt-1.5 font-sans text-[11px] italic text-[var(--ink-3)]">
                      Besparing loopt nog{' '}
                      {meta.mortgageRemainingMonthsAtTrigger >= 12
                        ? `${Math.round(meta.mortgageRemainingMonthsAtTrigger / 12)} jaar`
                        : `${meta.mortgageRemainingMonthsAtTrigger} maanden`}{' '}
                      — tot oorspronkelijke einddatum van de hypotheek. Daarna had je toch geen
                      hypotheekbetaling meer gehad.
                    </p>
                  )}
              </>
            )}
          </SubFormula>
        )}

        <SubFormula label={mortgagePaymentNow > 0 ? '3. Nieuwe woonkosten' : '2. Nieuwe woonkosten'}>
          {isAuto ? (
            <>
              <CalcRow label="WOZ-waarde (referentie)" value={formatCurrency(woz)} />
              <CalcRow
                label="Jaarlijkse huurnorm (4% NL-gemiddelde)"
                value={formatCurrency(woz * 0.04)}
              />
              <CalcRow label="Per maand (÷ 12)" value={`− ${formatCurrency(newMonthly)}/mnd`} emphasis divider />
            </>
          ) : (
            <CalcRow
              label="Handmatig ingevulde maandlast"
              value={`− ${formatCurrency(newMonthly)}/mnd`}
              emphasis
            />
          )}
        </SubFormula>

        {mortgagePaymentAtTrigger > 0 && newMonthly > 0 && (
          <SubFormula label="Netto effect op maandbudget">
            <CalcRow
              label={netMonthlyDelta > 0 ? 'Duurder per maand' : netMonthlyDelta < 0 ? 'Goedkoper per maand' : 'Gelijk'}
              value={
                netMonthlyDelta === 0
                  ? '€ 0'
                  : `${netMonthlyDelta > 0 ? '−' : '+'} ${formatCurrency(Math.abs(netMonthlyDelta))}/mnd`
              }
              emphasis
            />
          </SubFormula>
        )}
      </div>
    </div>
  )
}

function ReversePayoutBreakdown({ meta }: { meta: HousingMetadata }) {
  const equity = meta.equity ?? 0 // overwaarde bij trigger
  const maxLoanPct = meta.maxLoanPct ?? 0.5
  const remainingYears = meta.remainingYears ?? 1
  const monthly = meta.monthlyPayout ?? 0
  const maxLoan = equity * maxLoanPct
  const isAuto = meta.isAutoEstimate ?? true
  const mortgageNow = meta.mortgageBalance ?? 0
  const mortgageAtTrigger = meta.mortgageBalanceAtTrigger ?? mortgageNow
  const yearsToTrigger = meta.yearsToTrigger ?? 0
  return (
    <div>
      {isAuto ? (
        <>
          <p className="font-sans text-[13px] text-[var(--ink-2)]">
            Maandbedrag berekend uit overwaarde × max% gespreid over de resterende horizon. De
            overwaarde wordt geprojecteerd: de hypotheek lost tot trigger-moment al af.
          </p>
          <div className="mt-3 space-y-0.5">
            {meta.eigenHuisValue != null && (
              <CalcRow label="Eigen woning waarde" value={formatCurrency(meta.eigenHuisValue)} />
            )}
            {mortgageNow > 0 && (
              <CalcRow label="Huidig hypotheek-saldo" value={formatCurrency(mortgageNow)} />
            )}
            {yearsToTrigger > 0 && mortgageNow > 0 && (
              <CalcRow
                label={
                  mortgageAtTrigger === 0
                    ? `Geheel afgelost in ${yearsToTrigger} jaar`
                    : `Geprojecteerd saldo na ${yearsToTrigger} jaar`
                }
                value={`− ${formatCurrency(mortgageAtTrigger)}`}
              />
            )}
            <CalcRow label="Overwaarde bij trigger" value={formatCurrency(equity)} />
            <CalcRow
              label={`Max op te nemen (${(maxLoanPct * 100).toFixed(0)}%)`}
              value={formatCurrency(maxLoan)}
            />
            <CalcRow label={`Verdeeld over (${remainingYears} jaar × 12 mnd)`} value={`÷ ${remainingYears * 12}`} />
            <CalcRow label="Maandelijkse uitkering" value={`+ ${formatCurrency(monthly)}`} emphasis divider />
          </div>
          {meta.interestRate != null && (
            <p className="mt-2 font-sans text-[11px] italic text-[var(--ink-3)]">
              Rente {(meta.interestRate * 100).toFixed(2)}% stapelt op tegen je toekomstige schuld
              (niet zichtbaar in deze grafiek — wordt bij verkoop/overlijden afgelost).
            </p>
          )}
        </>
      ) : (
        <>
          <p className="font-sans text-[13px] text-[var(--ink-2)]">
            Handmatige waarde uit Eigen-woning-strategie. Auto-berekening wordt overschreven.
          </p>
          <div className="mt-3">
            <CalcRow
              label="Maandelijkse uitkering (handmatig)"
              value={`+ ${formatCurrency(monthly)}`}
              emphasis
            />
          </div>
        </>
      )}
    </div>
  )
}
