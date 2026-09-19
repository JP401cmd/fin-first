import { describe, expect, it } from 'vitest'
import { beslisGrondslagBudget } from './grondslag-budget'

/**
 * W-009 deel 2 — de HARDE voorwaarde uit de analyse: de uitnodiging gaat alleen naar
 * wie op `'manual'` staat MÉT budgetten voor diezelfde kant. Bij `'auto'`, `'estimate'`,
 * `'budget'` en `'transaction'` verdringt de budget-/transactiebasis het profielbedrag
 * al vanzelf (`resolveAmountWithBasis`), dus daar zou het bericht iets beschrijven dat
 * allang gebeurd is.
 */
const BASIS = {
  incomeSource: 'manual',
  expensesSource: 'manual',
  heeftInkomstenBudgetten: true,
  heeftUitgavenBudgetten: true,
  lastSentAt: null,
  now: new Date('2026-09-19T10:00:00.000Z'),
}

describe('beslisGrondslagBudget — de vier grondslagen', () => {
  it('manual + budgetten aan beide kanten → bericht over beide', () => {
    const uit = beslisGrondslagBudget(BASIS)
    expect(uit?.kant).toBe('beide')
    expect(uit?.description).toContain('Je inkomen en uitgaven rusten nu op bedragen die je zelf invulde')
  })

  it('alleen de uitgaven op manual → bericht alleen over uitgaven', () => {
    const uit = beslisGrondslagBudget({ ...BASIS, incomeSource: 'budget' })
    expect(uit?.kant).toBe('uitgaven')
  })

  it('auto, estimate, budget en transaction krijgen geen bericht', () => {
    for (const bron of ['auto', 'estimate', 'budget', 'transaction']) {
      expect(
        beslisGrondslagBudget({ ...BASIS, incomeSource: bron, expensesSource: bron }),
        bron,
      ).toBeNull()
    }
  })

  it('manual zonder budgetten voor diezelfde kant → geen bericht (de uitnodiging zou onwaar zijn)', () => {
    expect(
      beslisGrondslagBudget({
        ...BASIS,
        heeftInkomstenBudgetten: false,
        heeftUitgavenBudgetten: false,
      }),
    ).toBeNull()
    // Wél budgetten aan de ándere kant helpt niet: de kant moet kloppen.
    expect(
      beslisGrondslagBudget({
        ...BASIS,
        expensesSource: 'budget',
        heeftInkomstenBudgetten: false,
      }),
    ).toBeNull()
  })
})

describe('beslisGrondslagBudget — hooguit één keer per kalenderjaar', () => {
  it('dit jaar al verstuurd → geen bericht', () => {
    expect(beslisGrondslagBudget({ ...BASIS, lastSentAt: '2026-01-02T00:00:00.000Z' })).toBeNull()
  })

  it('vorig jaar verstuurd → weer een bericht', () => {
    expect(beslisGrondslagBudget({ ...BASIS, lastSentAt: '2025-12-31T00:00:00.000Z' })).not.toBeNull()
  })

  it('een onleesbare marker blokkeert niet', () => {
    expect(beslisGrondslagBudget({ ...BASIS, lastSentAt: 'geen-datum' })).not.toBeNull()
  })
})
