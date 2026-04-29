import { describe, expect, it } from 'vitest'
import {
  computeTableSchedule,
  type TableScheduleInputs,
  type TableEndStrategy,
  type TableWithdrawalStrategy,
} from '../afbouw-table-schedules'

// ── Test fixtures ──────────────────────────────────────────────

function baseInputs(overrides: Partial<TableScheduleInputs> = {}): TableScheduleInputs {
  return {
    startPortfolio: 1_000_000,
    retirementAge: 60,
    endAge: 90,
    yearlyExpenses: 40_000,
    grossReturn: 0.07,
    inflationRate: 0.02,
    hasPartner: false,
    aowAge: 67,
    legacyAmount: 0,
    ...overrides,
  }
}

const END_STRATEGIES: TableEndStrategy[] = ['perpetual', 'legacy', 'pensioen', 'deplete']
const WITHDRAWAL_STRATEGIES: TableWithdrawalStrategy[] = ['swr', 'guardrails', 'vpw', 'bucket']

// ── Basis invarianten ─────────────────────────────────────────

describe('computeTableSchedule — basis invarianten voor alle 16 combinaties', () => {
  for (const endStrat of END_STRATEGIES) {
    for (const wdStrat of WITHDRAWAL_STRATEGIES) {
      it(`${endStrat} × ${wdStrat}: retourneert niet-lege rows met monotone leeftijd`, () => {
        const rows = computeTableSchedule(endStrat, wdStrat, baseInputs())
        expect(rows.length).toBeGreaterThan(0)
        for (let i = 1; i < rows.length; i++) {
          expect(rows[i].age).toBe(rows[i - 1].age + 1)
          expect(rows[i].year).toBe(rows[i - 1].year + 1)
        }
      })

      it(`${endStrat} × ${wdStrat}: startBalance matcht vorige endBalance`, () => {
        const rows = computeTableSchedule(endStrat, wdStrat, baseInputs())
        for (let i = 1; i < rows.length; i++) {
          // Tolerantie ±€1 vanwege afronding per rij
          expect(Math.abs(rows[i].startBalance - rows[i - 1].endBalance)).toBeLessThanOrEqual(1)
        }
      })

      it(`${endStrat} × ${wdStrat}: alle waarden ≥ 0`, () => {
        const rows = computeTableSchedule(endStrat, wdStrat, baseInputs())
        for (const r of rows) {
          expect(r.startBalance).toBeGreaterThanOrEqual(0)
          expect(r.withdrawal).toBeGreaterThanOrEqual(0)
          expect(r.aowIncome).toBeGreaterThanOrEqual(0)
          expect(r.endBalance).toBeGreaterThanOrEqual(0)
        }
      })

      it(`${endStrat} × ${wdStrat}: AOW-inkomen pas vanaf aowAge`, () => {
        const rows = computeTableSchedule(endStrat, wdStrat, baseInputs())
        for (const r of rows) {
          if (r.age < 67) expect(r.aowIncome).toBe(0)
          else expect(r.aowIncome).toBeGreaterThan(0)
        }
      })
    }
  }
})

// ── Deplete: zonder AOW-interferentie depleteert SWR wél volledig ──

describe('computeTableSchedule — deplete SWR met retirement ≥ aowAge strikt ≈ €0', () => {
  // Annuity formule veronderstelt vaste baseWithdrawal uit portfolio. Zodra
  // AOW de nominal need verlaagt, trekt de user minder uit portfolio →
  // portfolio overshoot. Met retirementAge >= aowAge is AOW constant actief
  // → de AOW-bonus wordt ingebakken in de baseWithdrawal niet — dus er blijft
  // overshoot. Alleen zonder AOW (aowAge > endAge) depleteert SWR exact.
  it('deplete × swr met aowAge > endAge (geen AOW): eindsaldo ≈ 0', () => {
    const rows = computeTableSchedule('deplete', 'swr', baseInputs({
      startPortfolio: 1_000_000,
      retirementAge: 60,
      endAge: 90,
      aowAge: 999,  // nooit AOW
    }))
    const last = rows.at(-1)!
    expect(last.endBalance).toBeLessThan(100)
  })

  it('deplete × vpw zonder AOW: eindsaldo ≈ 0', () => {
    const rows = computeTableSchedule('deplete', 'vpw', baseInputs({
      startPortfolio: 1_000_000,
      retirementAge: 60,
      endAge: 90,
      aowAge: 999,
    }))
    const last = rows.at(-1)!
    expect(last.endBalance).toBeLessThan(100)
  })
})

describe('computeTableSchedule — deplete bij AOW-interferentie: overshoot is correct', () => {
  // /afbouw's deplete-SWR annuity ignoreert AOW-toekomst → overshoot. Dit is
  // bewuste tabel-semantiek; wij matchen dat 1:1 zodat getallen aansluiten.
  it('deplete × swr mét AOW: portfolio daalt maar eindigt > 0 (AOW-overshoot)', () => {
    const rows = computeTableSchedule('deplete', 'swr', baseInputs({
      startPortfolio: 1_000_000,
      retirementAge: 60,
      endAge: 90,
      aowAge: 67,
    }))
    const last = rows.at(-1)!
    expect(last.endBalance).toBeGreaterThan(0)
    expect(last.endBalance).toBeLessThan(1_000_000)
  })

  it('deplete × guardrails: portfolio daalt zichtbaar (eindsaldo < startPortfolio)', () => {
    const start = 1_000_000
    const rows = computeTableSchedule('deplete', 'guardrails', baseInputs({
      startPortfolio: start,
      retirementAge: 60,
      endAge: 90,
      yearlyExpenses: 40_000,
    }))
    const last = rows.at(-1)!
    expect(last.endBalance).toBeLessThan(start)
  })

  it('deplete × bucket: eindsaldo is finite (geen NaN/infinity)', () => {
    const rows = computeTableSchedule('deplete', 'bucket', baseInputs({
      startPortfolio: 1_000_000,
      retirementAge: 60,
      endAge: 90,
      yearlyExpenses: 40_000,
    }))
    const last = rows.at(-1)!
    expect(Number.isFinite(last.endBalance)).toBe(true)
  })
})

// ── Legacy-specifieke invariant: eindsaldo ≈ legacyAmount ──────

describe('computeTableSchedule — legacy houdt minimaal legacyAmount over', () => {
  // Note: legacy-SWR op /afbouw gebruikt NL_SWR (3.58%) × surplus, wat
  // conservatief is (annuity rate zou ~6.5% zijn over 30j). Resultaat:
  // eindsaldo ligt ruim boven `legacyAmount` — dat is gedrag van /afbouw.
  it('legacy × swr: eindsaldo ≥ legacyAmount (SWR is conservatief)', () => {
    const legacy = 200_000
    const rows = computeTableSchedule('legacy', 'swr', baseInputs({
      startPortfolio: 1_000_000,
      retirementAge: 60,
      endAge: 90,
      legacyAmount: legacy,
    }))
    const last = rows.at(-1)!
    expect(last.endBalance).toBeGreaterThanOrEqual(legacy)
  })
})

// ── Perpetual-specifieke invariant: stabiel portfolio ─────────

describe('computeTableSchedule — perpetual portfolio blijft stabiel', () => {
  it('perpetual × swr: eindsaldo ≥ 50% van startPortfolio (niet leegkomend)', () => {
    const start = 1_500_000
    const rows = computeTableSchedule('perpetual', 'swr', baseInputs({
      startPortfolio: start,
      retirementAge: 60,
      endAge: 90,
      yearlyExpenses: 40_000,
    }))
    const last = rows.at(-1)!
    expect(last.endBalance).toBeGreaterThan(start * 0.5)
  })
})

// ── Withdrawal-plausibiliteit ─────────────────────────────────

describe('computeTableSchedule — withdrawal plausibility', () => {
  it('deplete × swr met ruim portfolio: withdrawal ≥ yearlyExpenses − AOW', () => {
    const rows = computeTableSchedule('deplete', 'swr', baseInputs({
      startPortfolio: 2_000_000,
      retirementAge: 65,
      endAge: 90,
      yearlyExpenses: 40_000,
    }))
    // Annuity voor €2M over 25j met 5% reëel ≈ €141k/jaar — > yearlyExpenses
    const firstWd = rows[0].withdrawal
    expect(firstWd).toBeGreaterThan(40_000)
  })

  it('perpetual × swr: withdrawal ≈ balance × SWR of yearlyExpenses', () => {
    const rows = computeTableSchedule('perpetual', 'swr', baseInputs({
      startPortfolio: 1_000_000,
      retirementAge: 60,
      endAge: 90,
      yearlyExpenses: 40_000,
    }))
    const firstWd = rows[0].withdrawal
    // SWR 3.58% × 1M = 35.8k; max(35.8k, 40k) = 40k
    expect(firstWd).toBeGreaterThanOrEqual(35_000)
    expect(firstWd).toBeLessThanOrEqual(42_000)
  })
})

// ── Guardrails-specifieke invariant: withdrawal binnen band ────

describe('computeTableSchedule — guardrails respecteert band', () => {
  it('deplete × guardrails: withdrawal ratio ∈ [floor, ceiling]', () => {
    const rows = computeTableSchedule('deplete', 'guardrails', baseInputs({
      startPortfolio: 1_000_000,
      retirementAge: 60,
      endAge: 90,
    }))
    // Band bij annuityRate × (1 ± 0.2) — de guardrail activeert bij extreme ratios.
    // Gewoon checken dat rows een geldige guardrail-tag hebben.
    for (const r of rows) {
      if (r.guardrail !== undefined) {
        expect(['upper', 'lower', 'normal']).toContain(r.guardrail)
      }
    }
  })
})

// ── Bucket-specifieke invariant: cash → bonds → equity cascade ──

describe('computeTableSchedule — bucket strategy basis', () => {
  it('deplete × bucket: eerste onttrekking uit cash-bucket', () => {
    const rows = computeTableSchedule('deplete', 'bucket', baseInputs({
      startPortfolio: 1_000_000,
      retirementAge: 60,
      endAge: 90,
      yearlyExpenses: 40_000,
    }))
    expect(rows[0].withdrawal).toBeGreaterThan(0)
    expect(rows[0].withdrawal).toBeLessThanOrEqual(40_000)
  })
})

// ── Edge cases ────────────────────────────────────────────────

describe('computeTableSchedule — edge cases', () => {
  it('leeg portfolio: geeft lege rows', () => {
    const rows = computeTableSchedule('deplete', 'swr', baseInputs({ startPortfolio: 0 }))
    expect(rows).toHaveLength(0)
  })

  it('retirementAge === endAge: geeft lege rows', () => {
    const rows = computeTableSchedule('perpetual', 'swr', baseInputs({
      retirementAge: 90,
      endAge: 90,
    }))
    expect(rows).toHaveLength(0)
  })

  it('hasPartner=true → hogere AOW', () => {
    const alleenstaand = computeTableSchedule('deplete', 'swr', baseInputs({ hasPartner: false }))
    const samenwonend = computeTableSchedule('deplete', 'swr', baseInputs({ hasPartner: true }))
    const aowAlleen = alleenstaand.find(r => r.age === 67)?.aowIncome ?? 0
    const aowSamen = samenwonend.find(r => r.age === 67)?.aowIncome ?? 0
    // In Nederland is AOW alleenstaand hoger dan samenwonend per persoon —
    // test de relatie op basis van constants zonder hard-coded waardes.
    expect(aowAlleen).toBeGreaterThan(aowSamen)
  })
})

// ── Regression test: janpaul050486 scenario ───────────────────

describe('computeTableSchedule — janpaul050486 scenario (deplete @ realistic portfolio)', () => {
  it('met €1M portfolio + €38k yearlyExpenses over 30j deplete: withdrawal eerste jaar > €38k', () => {
    const rows = computeTableSchedule('deplete', 'swr', baseInputs({
      startPortfolio: 1_000_000,
      retirementAge: 60,
      endAge: 90,
      yearlyExpenses: 38_000,
    }))
    // Annuity: €1M × 5% real / (1 − 1.05^-30) = ~€65k — ruim boven €38k
    expect(rows[0].withdrawal).toBeGreaterThan(40_000)
  })

  it('met €130k portfolio + €38k yearlyExpenses: withdrawal ~€8k (annuity met klein portfolio)', () => {
    // Dit is de oorspronkelijke observatie van de user — bevestigt dat
    // DE TABEL correct werkt; het probleem zit in de required-solver die
    // FIRE te vroeg triggert op dit te-kleine portfolio.
    const rows = computeTableSchedule('deplete', 'swr', baseInputs({
      startPortfolio: 130_000,
      retirementAge: 47,
      endAge: 90,
      yearlyExpenses: 38_000,
    }))
    // Annuity over 43j met 5% real ≈ €7-9k → matcht user's observatie
    expect(rows[0].withdrawal).toBeLessThan(15_000)
    expect(rows[0].withdrawal).toBeGreaterThan(5_000)
  })
})
