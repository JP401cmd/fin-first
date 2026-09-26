/**
 * Props-als-bron voor /toekomst (ADR 0179 fase 1 stap 3).
 *
 * Given de horizon-client seedde zijn projectie-invoer met `useState(initialData.x)`,
 * When de plan-review-wizard een instelling opsloeg en `router.refresh()` deed,
 * Then kreeg de pagina een nieuwe `initialData`, maar bleef de grafiek op de oude
 * invoer rekenen (useState negeert een nieuwe beginwaarde).
 *
 * Deze tests renderen de hook die `initialData` naar de sim-invoer vertaalt en
 * rerenderen met een nieuwe bundel, zoals `router.refresh()` dat doet.
 */
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { HorizonPageData } from '@/lib/horizon-data-loader'
import type { LifeEvent } from '@/lib/horizon-data'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import { useHorizonBron, useStructurallyStable } from './use-horizon-bron'

const AOW_RIJEN: AowLeeftijdRow[] = [
  {
    id: 'a1',
    birth_date_from: '1980-01-01',
    birth_date_through: '1989-12-31',
    aow_years: 68,
    aow_months: 3,
    is_definitive: false,
    source: 'test',
  },
]

function event(id: string, targetAge: number): LifeEvent {
  return { id, name: `event ${id}`, target_age: targetAge } as unknown as LifeEvent
}

/** Een verse bundel per aanroep, zoals elke `router.refresh()` nieuwe objecten levert. */
function bundel(over: {
  monthlyExpenses?: number
  grossReturn?: number
  stopAge?: number
  events?: LifeEvent[]
  aowRows?: AowLeeftijdRow[] | undefined
  retirementExpenseMethod?: HorizonPageData['retirementExpenseMethod']
} = {}): HorizonPageData {
  return {
    effectiveInput: { monthlyExpenses: over.monthlyExpenses ?? 2500, dateOfBirth: '1985-06-15' },
    fireParams: { grossReturn: over.grossReturn ?? 0.06, inflationRate: 0.02, effectiveSwr: 0.04 },
    withdrawalStrategy: undefined,
    fireStrategy: { strategy: 'deplete', endAge: 90 },
    rawProfile: { fire_stop_age: over.stopAge ?? 55, expected_return: over.grossReturn ?? 0.06 },
    aowRows: 'aowRows' in over ? over.aowRows : AOW_RIJEN,
    debts: [{ id: 'd1', current_balance: 1000 }],
    actions: [],
    resilienceSnapshots: [],
    avgIncome6m: 4000,
    avgExpenses6m: 2500,
    retirementExpenseMethod: over.retirementExpenseMethod ?? null,
    events: over.events ?? [event('e1', 50)],
  } as unknown as HorizonPageData
}

describe('useHorizonBron — de sim-invoer volgt initialData', () => {
  it('een nieuwe bundel (router.refresh na de wizard) levert nieuwe sim-invoer', () => {
    const { result, rerender } = renderHook(({ data }) => useHorizonBron(data), {
      initialProps: { data: bundel() },
    })
    expect(result.current.input?.monthlyExpenses).toBe(2500)
    expect(result.current.fireParams.grossReturn).toBe(0.06)
    expect(result.current.kernelRawProfile).toMatchObject({ fire_stop_age: 55 })

    rerender({ data: bundel({ monthlyExpenses: 3100, grossReturn: 0.05, stopAge: 60 }) })

    expect(result.current.input?.monthlyExpenses).toBe(3100)
    expect(result.current.fireParams.grossReturn).toBe(0.05)
    expect(result.current.kernelRawProfile).toMatchObject({ fire_stop_age: 60, expected_return: 0.05 })
  })

  it('een gelijke bundel met nieuwe objecten houdt dezelfde referenties (geen extra kernel-solve)', () => {
    const { result, rerender } = renderHook(({ data }) => useHorizonBron(data), {
      initialProps: { data: bundel() },
    })
    const voor = result.current
    rerender({ data: bundel() })
    const na = result.current
    expect(na.input).toBe(voor.input)
    expect(na.fireParams).toBe(voor.fireParams)
    expect(na.withdrawalStrategyConfig).toBe(voor.withdrawalStrategyConfig)
    expect(na.fireStrategy).toBe(voor.fireStrategy)
    expect(na.kernelRawProfile).toBe(voor.kernelRawProfile)
    expect(na.aowRows).toBe(voor.aowRows)
    expect(na.debts).toBe(voor.debts)
    expect(na.events).toBe(voor.events)
  })

  it('valt terug op de onttrekkingsdefaults en een stabiele lege AOW-tabel', () => {
    const { result, rerender } = renderHook(({ data }) => useHorizonBron(data), {
      initialProps: { data: bundel({ aowRows: undefined }) },
    })
    expect(result.current.withdrawalStrategyConfig).toBe(WITHDRAWAL_DEFAULTS)
    const leeg = result.current.aowRows
    expect(leeg).toEqual([])
    rerender({ data: bundel({ aowRows: undefined }) })
    expect(result.current.aowRows).toBe(leeg)
  })

  it('de AOW-leeftijd en de pensioenuitgave-methode volgen de nieuwe bundel', () => {
    const { result, rerender } = renderHook(({ data }) => useHorizonBron(data), {
      initialProps: { data: bundel({ aowRows: [] }) },
    })
    expect(result.current.userAowAge.fractional).toBe(67)
    expect(result.current.retirementMethod).toBe('essential_budgets')

    rerender({ data: bundel({ retirementExpenseMethod: 'current_income' }) })
    expect(result.current.userAowAge.fractional).toBe(68.25)
    expect(result.current.retirementMethod).toBe('current_income')
  })

  it('events: optimistisch lokaal, en een nieuwe server-lijst wint', () => {
    const { result, rerender } = renderHook(({ data }) => useHorizonBron(data), {
      initialProps: { data: bundel({ events: [event('e1', 50)] }) },
    })
    act(() => {
      result.current.setEvents((prev) => prev.map((e) => ({ ...e, target_age: 52 })))
    })
    expect(result.current.events[0].target_age).toBe(52)

    // Dezelfde server-lijst (bv. een refresh door iets anders): de lokale stand blijft.
    rerender({ data: bundel({ events: [event('e1', 50)] }) })
    expect(result.current.events[0].target_age).toBe(52)

    // De server-lijst ná de write: die wint.
    rerender({ data: bundel({ events: [event('e1', 53), event('e2', 60)] }) })
    expect(result.current.events.map((e) => [e.id, e.target_age])).toEqual([
      ['e1', 53],
      ['e2', 60],
    ])
  })
})

describe('useStructurallyStable', () => {
  it('houdt de referentie bij gelijke inhoud en wisselt bij een echte wijziging', () => {
    const a = { x: 1, lijst: [1, 2] }
    const { result, rerender } = renderHook(({ v }) => useStructurallyStable(v), { initialProps: { v: a } })
    rerender({ v: { x: 1, lijst: [1, 2] } })
    expect(result.current).toBe(a)
    const b = { x: 2, lijst: [1, 2] }
    rerender({ v: b })
    expect(result.current).toBe(b)
  })
})
