/**
 * Unit tests voor de huishouden-helpers in `lib/household-data.ts`.
 *
 * Dekt de nieuwe perspectief-fundament-helpers die elk domein hergebruikt:
 * - `deriveProvenance` — "van wie is dit" (eigen/partner/gezamenlijk)
 * - `computePerspectiveNetWorth` — de nieuwe 'partner'-tak
 * - `debtShareFraction` — per-schuld aandeel rekening houdend met partner_split_pct
 */

import { describe, it, expect } from 'vitest'
import {
  deriveProvenance,
  computePerspectiveNetWorth,
  debtShareFraction,
  formatOwnershipSubline,
  dailyExpensesByPerspective,
} from './household-data'

describe('deriveProvenance', () => {
  it('shared → gezamenlijk', () => {
    expect(deriveProvenance({ ownership: 'shared', user_id: 'me' }, 'me')).toBe('gezamenlijk')
    expect(deriveProvenance({ ownership: 'shared', user_id: 'partner' }, 'me')).toBe('gezamenlijk')
  })

  it('personal van mij → eigen', () => {
    expect(deriveProvenance({ ownership: 'personal', user_id: 'me' }, 'me')).toBe('eigen')
  })

  it('personal van partner → partner', () => {
    expect(deriveProvenance({ ownership: 'personal', user_id: 'partner' }, 'me')).toBe('partner')
  })

  it('personal zonder bekende user_id → eigen (veilige default)', () => {
    expect(deriveProvenance({ ownership: 'personal' }, 'me')).toBe('eigen')
  })
})

describe('debtShareFraction', () => {
  it('geen partner_split_pct → huishoud-fractie', () => {
    expect(debtShareFraction({ partner_split_pct: null, user_id: 'me' }, 'me', 0.5)).toBe(0.5)
    expect(debtShareFraction({ user_id: 'me' }, 'me', 0.3)).toBe(0.3)
  })

  it('partner_split_pct is het aandeel van de eigenaar', () => {
    // eigenaar 'me' ziet 70%
    expect(debtShareFraction({ partner_split_pct: 70, user_id: 'me' }, 'me', 0.5)).toBe(0.7)
    // de partner ziet de rest (30%)
    expect(debtShareFraction({ partner_split_pct: 70, user_id: 'me' }, 'partner', 0.5)).toBeCloseTo(0.3, 10)
  })
})

describe('computePerspectiveNetWorth — partner-tak', () => {
  const assets = [
    { current_value: 1000, ownership: 'personal' as const, user_id: 'me' },
    { current_value: 2000, ownership: 'personal' as const, user_id: 'partner' },
    { current_value: 4000, ownership: 'shared' as const },
  ]
  const debts = [
    { current_balance: 500, ownership: 'personal' as const, user_id: 'partner' },
    { current_balance: 1000, ownership: 'shared' as const },
  ]

  it('partner-perspectief: partner-persoonlijk + partner-aandeel van gedeeld', () => {
    const r = computePerspectiveNetWorth(assets, debts, 'partner', 50, 'me', 'partner')
    // partner personal assets = 2000; partner share of shared = 4000 * (1-0.5) = 2000
    expect(r.totalAssets).toBe(4000)
    // partner personal debts = 500; partner share of shared = 1000 * 0.5 = 500
    expect(r.totalDebts).toBe(1000)
    expect(r.netWorth).toBe(3000)
    expect(r.personalAssets).toBe(2000)
    expect(r.personalDebts).toBe(500)
  })

  it('eigen-perspectief blijft ongewijzigd (regressie)', () => {
    const r = computePerspectiveNetWorth(assets, debts, 'personal', 50, 'me', 'partner')
    // my personal assets = 1000; my share of shared = 4000 * 0.5 = 2000
    expect(r.totalAssets).toBe(3000)
    // my personal debts = 0; my share of shared = 1000 * 0.5 = 500
    expect(r.totalDebts).toBe(500)
    expect(r.netWorth).toBe(2500)
  })

  it('huishouden-perspectief telt alles vol (regressie)', () => {
    const r = computePerspectiveNetWorth(assets, debts, 'household', 50, 'me', 'partner')
    expect(r.totalAssets).toBe(7000) // 1000 + 2000 + 4000
    expect(r.totalDebts).toBe(1500) // 500 + 1000
    expect(r.netWorth).toBe(5500)
  })
})

describe('formatOwnershipSubline', () => {
  it('persoonlijk item → null (geen subregel)', () => {
    expect(formatOwnershipSubline({ ownership: 'personal' }, 'personal', 1000)).toBeNull()
  })

  it('gedeeld item in huishouden-view → null (volledige waarde getoond)', () => {
    expect(formatOwnershipSubline({ ownership: 'shared', _myShareFraction: 0.5 }, 'household', 1000)).toBeNull()
  })

  it('gedeeld item in eigen-view → "Jouw aandeel"', () => {
    const s = formatOwnershipSubline({ ownership: 'shared', _myShareFraction: 0.5 }, 'personal', 1000)
    expect(s).not.toBeNull()
    expect(s).toMatch(/^Jouw aandeel:/)
  })

  it('gedeeld item in partner-view → "Aandeel partner"', () => {
    const s = formatOwnershipSubline({ ownership: 'shared', _myShareFraction: 0.3 }, 'partner', 1000)
    expect(s).toMatch(/^Aandeel partner:/)
  })

  it('valt terug op 50% wanneer _myShareFraction ontbreekt', () => {
    const s = formatOwnershipSubline({ ownership: 'shared' }, 'personal', 1000)
    expect(s).not.toBeNull()
  })
})

describe('dailyExpensesByPerspective', () => {
  const monthly = { personal: 1500, household: 3600 }
  it('eigen → mijn dag-uitgaven', () => {
    expect(dailyExpensesByPerspective(monthly, 'personal')).toBeCloseTo(50, 10) // 1500/30
  })
  it('huishouden → gecombineerd', () => {
    expect(dailyExpensesByPerspective(monthly, 'household')).toBeCloseTo(120, 10) // 3600/30
  })
  it('partner → afgeleid als household - personal wanneer geen expliciete waarde', () => {
    expect(dailyExpensesByPerspective(monthly, 'partner')).toBeCloseTo(70, 10) // (3600-1500)/30
  })
  it('partner → expliciete waarde heeft voorrang', () => {
    expect(dailyExpensesByPerspective({ ...monthly, partner: 900 }, 'partner')).toBeCloseTo(30, 10)
  })
})
