/**
 * Unit tests voor `lib/check/intake-to-persona.ts`.
 *
 * Verifieert dat `intakeToPersona` een volledige `CheckIntake` correct omzet
 * naar het `PersonaData`-formaat dat `seedPersonaData` verwacht:
 * - profile-velden kloppen (household_type-mapping, sources als hints in
 *   feature_preferences, expectedReturn als fraction)
 * - eigen_huis-asset krijgt `asset_type === 'eigen_huis'` en `is_liquid: false`
 * - noodfonds wordt als cash-asset toegevoegd bij positief saldo
 * - schulden: interestRate wordt van percentage naar fraction omgezet
 * - goal wordt als één goal-rij geseed bij aanwezigheid
 * - budgets, transactions en bank_accounts zijn altijd leeg
 */

import { describe, it, expect } from 'vitest'
import { intakeToPersona } from '../intake-to-persona'
import type { CheckIntake } from '@/lib/check/types'

// ── Fixture: volledige intake ─────────────────────────────────────────────────

const volledigeIntake: CheckIntake = {
  firstName: 'Jan',
  dateOfBirth: '1985-04-15',
  household: 'samen',
  monthlyIncomeNet: 4500,
  yearlyIncomeGross: 72000,
  expenses: {
    wonen: 1200,
    vasteLasten: 400,
    vrijBesteedbaar: 800,
    totaalMaand: 2400,
  },
  emergencyFund: 8000,
  assets: [
    {
      assetType: 'eigen_huis',
      name: 'Eigen woning',
      value: 350000,
      extra: null,
    },
    {
      assetType: 'investment',
      name: 'Beleggingsrekening',
      value: 45000,
      extra: 'VWRL',
    },
    {
      assetType: 'cash',
      name: 'Spaarrekening',
      value: 15000,
      extra: 'ING',
    },
  ],
  debts: [
    {
      debtType: 'mortgage',
      name: 'Hypotheek',
      balance: 280000,
      interestRatePct: 3.5,
      monthlyPayment: 1100,
    },
    {
      debtType: 'personal_loan',
      name: 'Persoonlijke lening',
      balance: 5000,
      interestRatePct: 6.9,
      monthlyPayment: 180,
    },
  ],
  pension: {
    aowExpectedMonthly: 1300,
    expectedReturnPct: 7.0,
    riskProfile: 'neutraal',
  },
  goal: { label: 'Eerder stoppen met werken' },
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('intakeToPersona — profiel', () => {
  it('zet firstName als full_name', () => {
    const result = intakeToPersona(volledigeIntake)
    expect(result.profile.full_name).toBe('Jan')
  })

  it('valt terug op "Gast" wanneer firstName ontbreekt', () => {
    const intake: CheckIntake = { ...volledigeIntake, firstName: undefined }
    const result = intakeToPersona(intake)
    expect(result.profile.full_name).toBe('Gast')
  })

  it('mapt household "alleen" → household_type "solo"', () => {
    const intake: CheckIntake = { ...volledigeIntake, household: 'alleen' }
    const result = intakeToPersona(intake)
    expect(result.profile.household_type).toBe('solo')
  })

  it('mapt household "samen" → household_type "samen"', () => {
    const result = intakeToPersona(volledigeIntake)
    expect(result.profile.household_type).toBe('samen')
  })

  it('mapt household "gezin" → household_type "gezin"', () => {
    const intake: CheckIntake = { ...volledigeIntake, household: 'gezin' }
    const result = intakeToPersona(intake)
    expect(result.profile.household_type).toBe('gezin')
  })

  it('schrijft monthlyIncomeNet als net_monthly_income', () => {
    const result = intakeToPersona(volledigeIntake)
    expect(result.profile.net_monthly_income).toBe(4500)
  })

  it('schrijft expenses.totaalMaand als estimated_monthly_expenses', () => {
    const result = intakeToPersona(volledigeIntake)
    expect(result.profile.estimated_monthly_expenses).toBe(2400)
  })

  it('converteert expectedReturnPct (%) naar fraction in expected_return', () => {
    const result = intakeToPersona(volledigeIntake)
    // 7.0 % → 0.07
    expect(result.profile.expected_return).toBeCloseTo(0.07)
  })

  it('laat expected_return undefined wanneer pension.expectedReturnPct ontbreekt', () => {
    const intake: CheckIntake = {
      ...volledigeIntake,
      pension: { ...volledigeIntake.pension, expectedReturnPct: null },
    }
    const result = intakeToPersona(intake)
    expect(result.profile.expected_return).toBeUndefined()
  })

  it('bevat active_modules (alle modules)', () => {
    const result = intakeToPersona(volledigeIntake)
    expect(result.profile.active_modules.length).toBeGreaterThan(0)
  })

  it('legt income_source en expenses_source intentie vast in feature_preferences', () => {
    const result = intakeToPersona(volledigeIntake)
    const prefs = result.profile.feature_preferences
    expect(prefs?.['_intake_income_source']).toBe('manual')
    expect(prefs?.['_intake_expenses_source']).toBe('manual')
  })

  it('legt yearlyIncomeGross vast als hint in feature_preferences', () => {
    const result = intakeToPersona(volledigeIntake)
    expect(result.profile.feature_preferences?.['_intake_estimated_yearly_income']).toBe(72000)
  })

  it('slaat de yearlyIncomeGross-hint over wanneer niet aanwezig', () => {
    const intake: CheckIntake = { ...volledigeIntake, yearlyIncomeGross: null }
    const result = intakeToPersona(intake)
    expect(result.profile.feature_preferences?.['_intake_estimated_yearly_income']).toBeUndefined()
  })

  it('heeft temporal_balance 3 als neutrale middenwaarde', () => {
    const result = intakeToPersona(volledigeIntake)
    expect(result.profile.temporal_balance).toBe(3)
  })
})

describe('intakeToPersona — eigen woning (housing-strategy)', () => {
  it('mapt eigen_huis-asset met asset_type "eigen_huis"', () => {
    const result = intakeToPersona(volledigeIntake)
    const huis = result.assets.find((a) => a.name === 'Eigen woning')
    expect(huis).toBeDefined()
    expect(huis?.asset_type).toBe('eigen_huis')
  })

  it('eigen_huis heeft is_liquid: false (housing-strategy niet-FIRE-eligible)', () => {
    const result = intakeToPersona(volledigeIntake)
    const huis = result.assets.find((a) => a.asset_type === 'eigen_huis')
    expect(huis?.is_liquid).toBe(false)
  })

  it('eigen_huis-waarde wordt correct overgenomen', () => {
    const result = intakeToPersona(volledigeIntake)
    const huis = result.assets.find((a) => a.asset_type === 'eigen_huis')
    expect(huis?.current_value).toBe(350000)
  })
})

describe('intakeToPersona — noodfonds als cash-asset', () => {
  it('voegt noodfonds toe als cash-asset bij positief saldo', () => {
    const result = intakeToPersona(volledigeIntake)
    const noodfonds = result.assets.find((a) => a.name === 'Noodfonds')
    expect(noodfonds).toBeDefined()
    expect(noodfonds?.asset_type).toBe('cash')
    expect(noodfonds?.current_value).toBe(8000)
  })

  it('slaat noodfonds-asset over wanneer emergencyFund = 0', () => {
    const intake: CheckIntake = { ...volledigeIntake, emergencyFund: 0 }
    const result = intakeToPersona(intake)
    const noodfonds = result.assets.find((a) => a.name === 'Noodfonds')
    expect(noodfonds).toBeUndefined()
  })

  it('noodfonds heeft is_liquid: true (niet gezet = undefined, default truthy)', () => {
    const result = intakeToPersona(volledigeIntake)
    const noodfonds = result.assets.find((a) => a.name === 'Noodfonds')
    // is_liquid is expliciet true voor cash-assets
    expect(noodfonds?.is_liquid).toBe(true)
  })
})

describe('intakeToPersona — overige bezittingen', () => {
  it('mapt investment-asset met ticker in ticker_symbol', () => {
    const result = intakeToPersona(volledigeIntake)
    const belegging = result.assets.find((a) => a.name === 'Beleggingsrekening')
    expect(belegging?.asset_type).toBe('investment')
    expect(belegging?.ticker_symbol).toBe('VWRL')
  })

  it('mapt cash-asset met bank in institution', () => {
    const result = intakeToPersona(volledigeIntake)
    const spaar = result.assets.find((a) => a.name === 'Spaarrekening')
    expect(spaar?.asset_type).toBe('cash')
    expect(spaar?.institution).toBe('ING')
  })

  it('per-asset expectedReturnPct overschrijft het globale rendement (fraction)', () => {
    const intake: CheckIntake = {
      ...volledigeIntake,
      assets: [
        // Eigen rendement 9% op de belegging; globaal pensioenrendement is 7%.
        { assetType: 'investment', name: 'Groei-ETF', value: 30000, expectedReturnPct: 9 },
        // Geen eigen rendement → valt terug op het globale 7%.
        { assetType: 'investment', name: 'Wereld-ETF', value: 20000 },
      ],
    }
    const result = intakeToPersona(intake)
    const groei = result.assets.find((a) => a.name === 'Groei-ETF')
    const wereld = result.assets.find((a) => a.name === 'Wereld-ETF')
    // 9 % → 0,09 (per-asset override).
    expect(groei?.expected_return).toBeCloseTo(0.09)
    // Geen override → globaal 7 % → 0,07.
    expect(wereld?.expected_return).toBeCloseTo(0.07)
  })

  it('per-asset rendement 0/leeg valt terug op het globale rendement', () => {
    const intake: CheckIntake = {
      ...volledigeIntake,
      assets: [
        { assetType: 'investment', name: 'Nul-rendement', value: 10000, expectedReturnPct: 0 },
        { assetType: 'investment', name: 'Null-rendement', value: 10000, expectedReturnPct: null },
      ],
    }
    const result = intakeToPersona(intake)
    for (const a of result.assets.filter((x) => x.asset_type === 'investment')) {
      expect(a.expected_return).toBeCloseTo(0.07)
    }
  })
})

describe('intakeToPersona — schulden', () => {
  it('mapt hypotheek-schuld correct', () => {
    const result = intakeToPersona(volledigeIntake)
    const hypotheek = result.debts.find((d) => d.debt_type === 'mortgage')
    expect(hypotheek).toBeDefined()
    expect(hypotheek?.current_balance).toBe(280000)
    expect(hypotheek?.monthly_payment).toBe(1100)
    expect(hypotheek?.minimum_payment).toBe(1100)
  })

  it('converteert interestRatePct van percentage naar fraction', () => {
    const result = intakeToPersona(volledigeIntake)
    // 3.5 % → 0.035
    const hypotheek = result.debts.find((d) => d.debt_type === 'mortgage')
    expect(hypotheek?.interest_rate).toBeCloseTo(0.035)

    // 6.9 % → 0.069
    const lening = result.debts.find((d) => d.debt_type === 'personal_loan')
    expect(lening?.interest_rate).toBeCloseTo(0.069)
  })

  it('zet original_amount gelijk aan current_balance (historisch onbekend)', () => {
    const result = intakeToPersona(volledigeIntake)
    result.debts.forEach((d) => {
      expect(d.original_amount).toBe(d.current_balance)
    })
  })

  it('retourneert lege schuldenlijst wanneer intake.debts leeg is', () => {
    const intake: CheckIntake = { ...volledigeIntake, debts: [] }
    const result = intakeToPersona(intake)
    expect(result.debts).toHaveLength(0)
  })
})

describe('intakeToPersona — doelen', () => {
  it('mapt goal naar één goal-rij van type "savings"', () => {
    const result = intakeToPersona(volledigeIntake)
    expect(result.goals).toHaveLength(1)
    expect(result.goals[0].goal_type).toBe('savings')
    expect(result.goals[0].name).toBe('Eerder stoppen met werken')
  })

  it('retourneert lege goals-lijst wanneer intake.goal afwezig is', () => {
    const intake: CheckIntake = { ...volledigeIntake, goal: null }
    const result = intakeToPersona(intake)
    expect(result.goals).toHaveLength(0)
  })
})

describe('intakeToPersona — lege collecties', () => {
  it('budgets is altijd een lege array', () => {
    const result = intakeToPersona(volledigeIntake)
    expect(result.budgets).toHaveLength(0)
  })

  it('transactions is altijd een lege array', () => {
    const result = intakeToPersona(volledigeIntake)
    expect(result.transactions).toHaveLength(0)
  })

  it('bank_accounts is altijd een lege array', () => {
    const result = intakeToPersona(volledigeIntake)
    expect(result.bank_accounts).toHaveLength(0)
  })

  it('life_events is een lege array', () => {
    const result = intakeToPersona(volledigeIntake)
    expect(result.life_events).toHaveLength(0)
  })

  it('recommendations is een lege array', () => {
    const result = intakeToPersona(volledigeIntake)
    expect(result.recommendations).toHaveLength(0)
  })
})

describe('intakeToPersona — meta', () => {
  it('bevat het juiste netWorth in meta', () => {
    const result = intakeToPersona(volledigeIntake)
    // assets: 8000 (noodfonds) + 350000 (huis) + 45000 (belegging) + 15000 (spaar) = 418000
    // debts: 280000 + 5000 = 285000
    // netWorth = 133000
    expect(result.meta.netWorth).toBe(133000)
  })

  it('meta.income = monthlyIncomeNet', () => {
    const result = intakeToPersona(volledigeIntake)
    expect(result.meta.income).toBe(4500)
  })

  it('meta.expenses = expenses.totaalMaand', () => {
    const result = intakeToPersona(volledigeIntake)
    expect(result.meta.expenses).toBe(2400)
  })

  it('meta.firstGoal = goal.label', () => {
    const result = intakeToPersona(volledigeIntake)
    expect(result.meta.firstGoal).toBe('Eerder stoppen met werken')
  })

  it('meta.firstGoal = leeg wanneer geen goal', () => {
    const intake: CheckIntake = { ...volledigeIntake, goal: null }
    const result = intakeToPersona(intake)
    expect(result.meta.firstGoal).toBe('')
  })
})

describe('intakeToPersona — minimale intake (alleen verplichte velden)', () => {
  const minimaleIntake: CheckIntake = {
    dateOfBirth: '1990-01-01',
    household: 'alleen',
    monthlyIncomeNet: 2800,
    expenses: {
      wonen: 800,
      vasteLasten: 200,
      vrijBesteedbaar: 400,
      totaalMaand: 1400,
    },
    emergencyFund: 0,
    assets: [],
    debts: [],
    pension: {},
  }

  it('produceert valide PersonaData zonder crashes', () => {
    expect(() => intakeToPersona(minimaleIntake)).not.toThrow()
  })

  it('household_type is "solo"', () => {
    const result = intakeToPersona(minimaleIntake)
    expect(result.profile.household_type).toBe('solo')
  })

  it('full_name is "Gast" (geen firstName)', () => {
    const result = intakeToPersona(minimaleIntake)
    expect(result.profile.full_name).toBe('Gast')
  })

  it('alle lege collecties aanwezig', () => {
    const result = intakeToPersona(minimaleIntake)
    expect(result.budgets).toHaveLength(0)
    expect(result.transactions).toHaveLength(0)
    expect(result.bank_accounts).toHaveLength(0)
    expect(result.goals).toHaveLength(0)
    expect(result.assets).toHaveLength(0) // geen noodfonds, geen assets
    expect(result.debts).toHaveLength(0)
  })
})
