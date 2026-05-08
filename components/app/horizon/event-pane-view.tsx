'use client'

import { useMemo } from 'react'
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

  return (
    // Outer padding wordt geleverd door SlideInPane (driewegregel — ui-ux skill).
    // Extra `pb-6` voor lucht onder content; horizontale padding komt van de pane.
    <div className="pb-6">
      {/* Header */}
      <div className="mb-6 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--module-active-50)] text-[var(--module-active-700)]">
          {EVENT_ICONS[eventIcon] ?? EVENT_ICONS['Calendar']}
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
          </p>
        </div>
      </div>

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
