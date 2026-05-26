import { describe, it, expect } from 'vitest'
import { buildLifeEventDraft } from './to-life-event'

describe('buildLifeEventDraft', () => {
  it('eenmalige kost → one_time_cost', () => {
    const d = buildLifeEventDraft({
      name: 'Verbouwing',
      targetAge: 40,
      impactKind: 'one_time_cost',
      amount: 30000,
    })
    expect(d.one_time_cost).toBe(30000)
    expect(d.monthly_cost_change).toBe(0)
    expect(d.target_age).toBe(40)
    expect(d.event_type).toBe('custom')
    expect(d.icon).toBe('Calculator')
  })

  it('maandelijkse kost → monthly_cost_change + duur', () => {
    const d = buildLifeEventDraft({
      name: 'Extra aflossing',
      targetAge: 35,
      impactKind: 'monthly_cost',
      amount: 500,
      durationMonths: 120,
    })
    expect(d.monthly_cost_change).toBe(500)
    expect(d.duration_months).toBe(120)
    expect(d.one_time_cost).toBe(0)
  })

  it('maandelijks inkomen → monthly_income_change', () => {
    const d = buildLifeEventDraft({
      name: 'Verhuur',
      targetAge: null,
      impactKind: 'monthly_income',
      amount: 800,
      durationMonths: 60,
    })
    expect(d.monthly_income_change).toBe(800)
    expect(d.duration_months).toBe(60)
  })

  it('negatief bedrag wordt absoluut gemaakt', () => {
    const d = buildLifeEventDraft({
      name: 'X',
      targetAge: 50,
      impactKind: 'one_time_cost',
      amount: -5000,
    })
    expect(d.one_time_cost).toBe(5000)
  })

  it('lege naam valt terug op default', () => {
    const d = buildLifeEventDraft({
      name: '   ',
      targetAge: null,
      impactKind: 'one_time_cost',
      amount: 100,
    })
    expect(d.name).toBe('Rekenhulp-uitkomst')
  })
})
