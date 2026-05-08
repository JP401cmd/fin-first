import { describe, it, expect } from 'vitest'
import { buildDraftEvent, initFormState, type EditFormState } from '@/components/app/horizon/event-pane-edit'

const baseState: EditFormState = {
  name: 'Test',
  event_type: 'custom',
  shared_age: 50,
  oneTimeAmount: 0,
  oneTimeDirection: 'expense',
  tempEnabled: false,
  tempAmount: 0,
  tempDirection: 'expense',
  tempDurationYears: 5,
  tempIndexed: true,
  contEnabled: false,
  contAmount: 0,
  contDirection: 'expense',
  contIndexed: true,
}

describe('buildDraftEvent', () => {
  it('mapt eenmalige uitgave naar positief one_time_cost', () => {
    const ev = buildDraftEvent(
      { ...baseState, oneTimeAmount: 25000, oneTimeDirection: 'expense' },
      null,
    )
    expect(ev.one_time_cost).toBe(25000)
    expect(ev.monthly_cost_change).toBe(0)
    expect(ev.monthly_income_change).toBe(0)
    expect(ev.duration_months).toBe(0)
  })

  it('mapt eenmalige inkomst (erfenis) naar negatief one_time_cost', () => {
    const ev = buildDraftEvent(
      { ...baseState, oneTimeAmount: 50000, oneTimeDirection: 'income' },
      null,
    )
    expect(ev.one_time_cost).toBe(-50000)
  })

  it('mapt tijdelijke uitgave naar monthly_cost_change met duration_months > 0', () => {
    const ev = buildDraftEvent(
      {
        ...baseState,
        tempEnabled: true,
        tempAmount: 500,
        tempDirection: 'expense',
        tempDurationYears: 4,
      },
      null,
    )
    expect(ev.monthly_cost_change).toBe(500)
    expect(ev.monthly_income_change).toBe(0)
    expect(ev.duration_months).toBe(48)
  })

  it('mapt continue inkomst naar monthly_income_change met duration_months = 0', () => {
    const ev = buildDraftEvent(
      {
        ...baseState,
        contEnabled: true,
        contAmount: 1500,
        contDirection: 'income',
      },
      null,
    )
    expect(ev.monthly_income_change).toBe(1500)
    expect(ev.monthly_cost_change).toBe(0)
    expect(ev.duration_months).toBe(0)
  })

  it('combineert eenmalig + continu in één event (bv. huiskoop)', () => {
    const ev = buildDraftEvent(
      {
        ...baseState,
        oneTimeAmount: 25000,
        oneTimeDirection: 'expense',
        contEnabled: true,
        contAmount: 300,
        contDirection: 'expense',
      },
      null,
    )
    expect(ev.one_time_cost).toBe(25000)
    expect(ev.monthly_cost_change).toBe(300)
    expect(ev.duration_months).toBe(0)
  })

  it('tijdelijk wint van continu wanneer beide aan staan', () => {
    const ev = buildDraftEvent(
      {
        ...baseState,
        tempEnabled: true,
        tempAmount: 500,
        tempDirection: 'expense',
        tempDurationYears: 5,
        contEnabled: true,
        contAmount: 999,
        contDirection: 'income',
      },
      null,
    )
    expect(ev.monthly_cost_change).toBe(500)
    expect(ev.monthly_income_change).toBe(0)
    expect(ev.duration_months).toBe(60)
  })

  it('one_time_cost is 0 als amount = 0 (richting irrelevant)', () => {
    const ev = buildDraftEvent({ ...baseState, oneTimeAmount: 0, oneTimeDirection: 'income' }, null)
    expect(ev.one_time_cost).toBe(0)
  })

  it('hergebruikt id van bestaand event bij bewerken', () => {
    const existing = {
      id: 'abc-123',
      name: 'Old',
      event_type: 'inheritance',
      target_age: 60,
      target_date: null,
      one_time_cost: -10000,
      monthly_cost_change: 0,
      monthly_income_change: 0,
      duration_months: 0,
      icon: 'Calendar',
      is_active: true,
      sort_order: 5,
      is_indexed: false,
      metadata: { foo: 'bar' },
    }
    const ev = buildDraftEvent(
      { ...baseState, name: 'New name', oneTimeAmount: 50000, oneTimeDirection: 'income' },
      existing,
    )
    expect(ev.id).toBe('abc-123')
    expect(ev.sort_order).toBe(5)
    expect(ev.metadata).toEqual({ foo: 'bar' })
    expect(ev.name).toBe('New name')
    expect(ev.one_time_cost).toBe(-50000)
  })
})

describe('initFormState', () => {
  it('vult vanuit catalog default voor sabbatical (tijdelijk inkomensverlies)', () => {
    const state = initFormState('sabbatical', null, 35)
    // Sabbatical: defaultCost=2000 (uitgave), defaultMonthlyIncome=-3000, defaultDuration=6
    expect(state.event_type).toBe('sabbatical')
    expect(state.oneTimeAmount).toBe(2000)
    expect(state.oneTimeDirection).toBe('expense')
    expect(state.tempEnabled).toBe(true)
    expect(state.tempAmount).toBe(3000)
    expect(state.tempDurationYears).toBe(1) // 6 mnd → 1 jaar (afgerond)
    expect(state.contEnabled).toBe(false)
  })

  it('vult vanuit bestaand event (round-trip)', () => {
    const event = {
      id: 'x',
      name: 'Mijn pensioen',
      event_type: 'pension',
      target_age: 67,
      target_date: null,
      one_time_cost: 0,
      monthly_cost_change: 0,
      monthly_income_change: 1500,
      duration_months: 0,
      icon: 'Landmark',
      is_active: true,
      sort_order: 0,
      is_indexed: true,
      metadata: {},
    }
    const state = initFormState('pension', event, 60)
    expect(state.name).toBe('Mijn pensioen')
    expect(state.shared_age).toBe(67)
    expect(state.contEnabled).toBe(true)
    expect(state.contAmount).toBe(1500)
    expect(state.contDirection).toBe('income')
    expect(state.tempEnabled).toBe(false)
  })

  it('lege custom event krijgt alle velden op 0/uit', () => {
    const state = initFormState('custom', null, 40)
    expect(state.oneTimeAmount).toBeGreaterThanOrEqual(0)
    // custom catalog heeft defaultCost: 0 / monthly: 0
    expect(state.tempEnabled).toBe(false)
    expect(state.contEnabled).toBe(false)
  })
})

describe('round-trip buildDraftEvent ↔ initFormState', () => {
  it('build dan re-init bewaart de drie impact-dimensies', () => {
    const initial = buildDraftEvent(
      {
        ...baseState,
        name: 'Studie kind',
        event_type: 'custom',
        shared_age: 45,
        oneTimeAmount: 5000,
        oneTimeDirection: 'expense',
        tempEnabled: true,
        tempAmount: 800,
        tempDirection: 'expense',
        tempDurationYears: 4,
        tempIndexed: true,
      },
      null,
    )
    // Round-trip via een fake "bestaand event"
    const reInit = initFormState('custom', { ...initial, id: 'tmp' }, 30)
    expect(reInit.oneTimeAmount).toBe(5000)
    expect(reInit.oneTimeDirection).toBe('expense')
    expect(reInit.tempEnabled).toBe(true)
    expect(reInit.tempAmount).toBe(800)
    expect(reInit.tempDurationYears).toBe(4)
  })
})
