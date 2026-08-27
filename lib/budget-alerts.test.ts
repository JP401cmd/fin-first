/**
 * Grensgevallen van de budgetdrempels.
 *
 * Dit pad had geen enkele test — precies daarom kon `pct >= 100` jarenlang
 * "budget overschreden" roepen bij een budget dat exact op zijn limiet stond
 * (bevinding H16). Vaste lasten raken dat geval elke maand, omdat
 * `lib/budget-plan-diff.ts` hun limiet gelijkzet aan de maandelijkse
 * afschrijving.
 */

import { describe, it, expect } from 'vitest'
import { shouldAlert, budgetLimitStatus } from './budget-alerts'

describe('shouldAlert — uitgavenbudget', () => {
  it('meldt niet onder de drempel en wél vanaf de drempel', () => {
    expect(shouldAlert(79, 100, 80, 'expense')).toBe(false)
    expect(shouldAlert(80, 100, 80, 'expense')).toBe(true)
    expect(shouldAlert(99.5, 100, 80, 'expense')).toBe(true)
    expect(shouldAlert(100, 100, 80, 'expense')).toBe(true)
    expect(shouldAlert(100.01, 100, 80, 'expense')).toBe(true)
    expect(shouldAlert(120, 100, 80, 'expense')).toBe(true)
  })

  it('meldt nooit zonder limiet', () => {
    expect(shouldAlert(50, 0, 80, 'expense')).toBe(false)
    expect(shouldAlert(50, -10, 80, 'expense')).toBe(false)
  })

  it('zet meldingen UIT bij drempel 0 — de stille semantische omkering (N1)', () => {
    // "Notificatiedrempel: 0%" leest in de slider als "altijd melden", maar
    // schakelt meldingen juist uit. Vastgelegd omdat het gedrag is, geen
    // ongeluk: verandert dit, dan moet de slider-copy mee.
    expect(shouldAlert(999, 100, 0, 'expense')).toBe(false)
  })
})

describe('shouldAlert — spaar-, aflos- en inkomensbudgetten', () => {
  it('meldt bij spaar/aflos juist ONDER de drempel', () => {
    expect(shouldAlert(79, 100, 80, 'savings')).toBe(true)
    expect(shouldAlert(80, 100, 80, 'savings')).toBe(false)
    expect(shouldAlert(79, 100, 80, 'debt')).toBe(true)
    expect(shouldAlert(100, 100, 80, 'debt')).toBe(false)
  })

  it('meldt nooit op een inkomensbudget', () => {
    expect(shouldAlert(0, 100, 80, 'income')).toBe(false)
    expect(shouldAlert(999, 100, 80, 'income')).toBe(false)
  })
})

describe('budgetLimitStatus — drie toestanden, niet twee', () => {
  it('onderscheidt onder / bereikt / over', () => {
    expect(budgetLimitStatus(93, 100)).toBe('onder')
    expect(budgetLimitStatus(99.5, 100)).toBe('onder')
    expect(budgetLimitStatus(100, 100)).toBe('bereikt')
    expect(budgetLimitStatus(100.01, 100)).toBe('over')
    expect(budgetLimitStatus(120, 100)).toBe('over')
  })

  it('noemt exact-op-de-grens nooit "over" — de kern van H16', () => {
    // De vijf gemeten vaste lasten uit de reproductie op productiedata.
    for (const [spent, limit] of [
      [1280, 1280],
      [195, 195],
      [110, 110],
      [340, 340],
      [125, 125],
    ]) {
      expect(budgetLimitStatus(spent, limit)).toBe('bereikt')
    }
    // Alleen dit budget was écht over.
    expect(budgetLimitStatus(98.48, 95)).toBe('over')
    // En dit stond op 93%.
    expect(budgetLimitStatus(195.61, 210)).toBe('onder')
  })

  it('laat zich niet door euro-float-ruis "over" noemen', () => {
    // Een som van transactiebedragen komt zelden precies uit; zonder
    // cent-tolerantie zou 0.1 + 0.2 tegen 0.3 als overschrijding tellen.
    expect(budgetLimitStatus(0.1 + 0.2, 0.3)).toBe('bereikt')
    expect(budgetLimitStatus(1280.001, 1280)).toBe('bereikt')
    expect(budgetLimitStatus(1279.999, 1280)).toBe('bereikt')
    // Een halve cent verschil is nog "bereikt"; ruim een cent is echt over.
    expect(budgetLimitStatus(1280.02, 1280)).toBe('over')
  })
})

describe('reproductieset H16 — 7 budgetten, 1 echte overschrijding', () => {
  it('levert 1× over, 5× bereikt, 1× onder', () => {
    const gemeten: Array<[number, number]> = [
      [1280, 1280],
      [195, 195],
      [110, 110],
      [340, 340],
      [98.48, 95],
      [125, 125],
      [195.61, 210],
    ]
    const statuses = gemeten.map(([s, l]) => budgetLimitStatus(s, l))
    expect(statuses.filter((s) => s === 'over')).toHaveLength(1)
    expect(statuses.filter((s) => s === 'bereikt')).toHaveLength(5)
    expect(statuses.filter((s) => s === 'onder')).toHaveLength(1)
  })
})
