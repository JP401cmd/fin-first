/**
 * Canonical bron voor afbouw-tabel-schedules.
 *
 * Alle 16 combinaties (4 eindstrategieën × 4 onttrekkingsstrategieën) leven
 * hier. Zowel de tabel-componenten op `/horizon/doorrekening-test/afbouw` als
 * de overzicht-pagina (`computeAfbouwSchedulePerAsset` wrapper,
 * `computeAfbouwRequiredSchedule` solver) lezen uit deze ene engine. Zo
 * divergeren de getoonde getallen op /afbouw en /overzicht niet meer.
 *
 * ── Principes ──────────────────────────────────────────────────────────
 *  1. Real-dollar terms (koopkracht-equivalent). Groei via `realReturn =
 *     (1+grossReturn) / (1+inflation) − 1`. `yearlyExpenses` is al in
 *     huidige koopkracht; we hoeven niet te inflateren.
 *  2. AOW is een vast real-dollar-inkomen vanaf `aowAge` (geen inflatie-
 *     correctie nodig omdat AOW wettelijk indexeert met inflatie).
 *  3. Tabel-trouw: elke branch matcht de inline-logica uit het bijbehorende
 *     tabel-component (`deplete-tables.tsx`, `legacy-tables.tsx`,
 *     `pension-tables.tsx`, `perpetual-tables.tsx`).
 *  4. Geen geneste solvers. Alle berekeningen zijn forward-only.
 */

import { NL_AOW_MONTHLY, NL_AOW_MONTHLY_SAMENWONEND, NL_SWR } from '@/lib/constants'

// ── Public types ──────────────────────────────────────────────

export type TableEndStrategy = 'perpetual' | 'legacy' | 'pensioen' | 'deplete'
export type TableWithdrawalStrategy = 'swr' | 'guardrails' | 'vpw' | 'bucket'

export interface TableScheduleInputs {
  startPortfolio: number
  retirementAge: number
  endAge: number
  yearlyExpenses: number
  grossReturn: number
  inflationRate: number
  hasPartner: boolean
  aowAge: number
  /** Legacy-strategie: gewenst eindsaldo in huidige koopkracht. */
  legacyAmount?: number
}

export interface TableScheduleRow {
  year: number
  age: number
  startBalance: number
  /** Onttrekking uit portfolio (excl. AOW-inkomen). */
  withdrawal: number
  /** AOW-uitkering dit jaar (real-dollar). */
  aowIncome: number
  growth: number
  endBalance: number
  // Optionele extras per strategie
  /** VPW-rate als percentage (bv. 3.33 voor 3.33%). Alleen bij VPW. */
  vpwRate?: number
  /** Resterende jaren. Alleen bij VPW en VPW-deplete. */
  remainingYears?: number
  /** Guardrail-trigger status. Alleen bij Guardrails. */
  guardrail?: 'upper' | 'lower' | 'normal'
  /** Bucket-balansen (cash / obligaties / aandelen). Alleen bij Bucket-strategie. */
  bucketCash?: number
  bucketBonds?: number
  bucketEquity?: number
}

// ── Constants ─────────────────────────────────────────────────

const BOND_RETURN = 0.02
const GUARDRAIL_BAND_DEPLETE_LEGACY = 0.20
const GUARDRAIL_BAND_PERPETUAL = 0.20  // perpetual uses ±10% trigger, ±10% adjust
const GUARDRAIL_BAND_PENSION = 0.10
const VPW_PLANNING_END_AGE = 100

// ── Helpers ───────────────────────────────────────────────────

function aowYearlyFor(hasPartner: boolean): number {
  return (hasPartner ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY) * 12
}

/** Level annuity payment that depletes `portfolio` over `years` years at real `rate`. */
function annuityPayment(portfolio: number, rate: number, years: number): number {
  if (years <= 0 || portfolio <= 0) return 0
  if (rate === 0) return portfolio / years
  return (portfolio * rate) / (1 - Math.pow(1 + rate, -years))
}

/** VPW annuity-rate (fractie van balance per jaar). */
function vpwRate(remainingYears: number, realReturn: number): number {
  if (remainingYears <= 1) return 1
  if (realReturn === 0) return 1 / remainingYears
  return realReturn / (1 - Math.pow(1 + realReturn, -remainingYears))
}

function remainingVpwYears(age: number): number {
  return Math.max(1, VPW_PLANNING_END_AGE - age)
}

// ── Deplete (4 strategies) ────────────────────────────────────

function scheduleDepleteSwr(inputs: TableScheduleInputs): TableScheduleRow[] {
  const { startPortfolio, retirementAge, endAge, grossReturn, inflationRate, hasPartner, aowAge } = inputs
  const totalYears = endAge - retirementAge
  if (totalYears <= 0 || startPortfolio <= 0) return []

  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const aowYearly = aowYearlyFor(hasPartner)
  const baseWithdrawal = annuityPayment(startPortfolio, realReturn, totalYears)

  const rows: TableScheduleRow[] = []
  let balance = startPortfolio
  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const startBalance = balance
    const aow = age >= aowAge ? aowYearly : 0
    const neededFromPortfolio = Math.max(0, baseWithdrawal - aow)
    const withdrawal = Math.min(neededFromPortfolio, balance)
    const remaining = balance - withdrawal
    const growth = remaining * realReturn
    const endBalance = remaining + growth

    rows.push({
      year: y + 1,
      age,
      startBalance: Math.round(startBalance),
      withdrawal: Math.round(withdrawal),
      aowIncome: Math.round(aow),
      growth: Math.round(growth),
      endBalance: Math.max(0, Math.round(endBalance)),
    })
    balance = Math.max(0, endBalance)
    if (balance <= 0) break
  }
  return rows
}

function scheduleDepleteGuardrails(inputs: TableScheduleInputs): TableScheduleRow[] {
  const { startPortfolio, retirementAge, endAge, grossReturn, inflationRate, hasPartner, aowAge } = inputs
  const totalYears = endAge - retirementAge
  if (totalYears <= 0 || startPortfolio <= 0) return []

  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const aowYearly = aowYearlyFor(hasPartner)
  const annuityRate = realReturn === 0
    ? 1 / totalYears
    : realReturn / (1 - Math.pow(1 + realReturn, -totalYears))
  let currentWithdrawal = annuityPayment(startPortfolio, realReturn, totalYears)
  const ceiling = annuityRate * (1 + GUARDRAIL_BAND_DEPLETE_LEGACY)
  const floor = annuityRate * (1 - GUARDRAIL_BAND_DEPLETE_LEGACY)

  const rows: TableScheduleRow[] = []
  let balance = startPortfolio
  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const startBalance = balance
    const aow = age >= aowAge ? aowYearly : 0

    // Guardrail: ratio of withdrawal to current balance
    let guardrail: 'upper' | 'lower' | 'normal' = 'normal'
    if (balance > 0) {
      const ratio = currentWithdrawal / balance
      if (ratio > ceiling) {
        currentWithdrawal = ceiling * balance
        guardrail = 'upper'
      } else if (ratio < floor) {
        currentWithdrawal = floor * balance
        guardrail = 'lower'
      }
    }

    const neededFromPortfolio = Math.max(0, currentWithdrawal - aow)
    const withdrawal = Math.min(neededFromPortfolio, balance)
    const remaining = balance - withdrawal
    const growth = remaining * realReturn
    const endBalance = remaining + growth

    rows.push({
      year: y + 1,
      age,
      startBalance: Math.round(startBalance),
      withdrawal: Math.round(withdrawal),
      aowIncome: Math.round(aow),
      growth: Math.round(growth),
      endBalance: Math.max(0, Math.round(endBalance)),
      guardrail,
    })
    balance = Math.max(0, endBalance)
    if (balance <= 0) break
  }
  return rows
}

function scheduleDepleteVpw(inputs: TableScheduleInputs): TableScheduleRow[] {
  const { startPortfolio, retirementAge, endAge, grossReturn, inflationRate, hasPartner, aowAge } = inputs
  const totalYears = endAge - retirementAge
  if (totalYears <= 0 || startPortfolio <= 0) return []

  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const aowYearly = aowYearlyFor(hasPartner)

  const rows: TableScheduleRow[] = []
  let balance = startPortfolio
  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const startBalance = balance
    const aow = age >= aowAge ? aowYearly : 0
    const remainingYears = Math.max(1, totalYears - y)

    // VPW deplete: withdraw balance / remainingYears (guarantees full deplete)
    const vpwAmount = balance / remainingYears
    const rate = balance > 0 ? vpwAmount / balance : 0
    const neededFromPortfolio = Math.max(0, vpwAmount - aow)
    const withdrawal = Math.min(neededFromPortfolio, balance)
    const remaining = balance - withdrawal
    const growth = remaining * realReturn
    const endBalance = remaining + growth

    rows.push({
      year: y + 1,
      age,
      startBalance: Math.round(startBalance),
      withdrawal: Math.round(withdrawal),
      aowIncome: Math.round(aow),
      growth: Math.round(growth),
      endBalance: Math.max(0, Math.round(endBalance)),
      vpwRate: Math.round(rate * 10000) / 100,  // percentage with 2 decimals
      remainingYears,
    })
    balance = Math.max(0, endBalance)
    if (balance <= 0) break
  }
  return rows
}

function scheduleDepleteBucket(inputs: TableScheduleInputs): TableScheduleRow[] {
  const { startPortfolio, retirementAge, endAge, yearlyExpenses, grossReturn, inflationRate, hasPartner, aowAge } = inputs
  const totalYears = endAge - retirementAge
  if (totalYears <= 0 || startPortfolio <= 0) return []

  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const aowYearly = aowYearlyFor(hasPartner)

  const cashTarget = yearlyExpenses * 2
  const bondTarget = yearlyExpenses * 5

  let cash = Math.min(cashTarget, startPortfolio)
  let bonds = Math.min(bondTarget, Math.max(0, startPortfolio - cash))
  let equity = Math.max(0, startPortfolio - cash - bonds)

  const rows: TableScheduleRow[] = []
  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const startBal = cash + bonds + equity
    const aow = age >= aowAge ? aowYearly : 0
    const neededFromPortfolio = Math.max(0, yearlyExpenses - aow)
    const withdrawal = Math.min(neededFromPortfolio, startBal)

    // Withdraw cash → bonds → equity
    let toWithdraw = withdrawal
    const fromCash = Math.min(toWithdraw, cash)
    cash -= fromCash
    toWithdraw -= fromCash
    const fromBonds = Math.min(toWithdraw, bonds)
    bonds -= fromBonds
    toWithdraw -= fromBonds
    const fromEquity = Math.min(toWithdraw, equity)
    equity -= fromEquity

    // Growth per bucket
    const bondsGrowth = bonds * BOND_RETURN
    const equityGrowth = equity * realReturn
    bonds += bondsGrowth
    equity += equityGrowth

    // Refill equity → bonds → cash
    const bondShortfall = Math.max(0, bondTarget - bonds)
    const bondRefill = Math.min(bondShortfall, equity)
    bonds += bondRefill
    equity -= bondRefill

    const cashShortfall = Math.max(0, cashTarget - cash)
    const cashRefill = Math.min(cashShortfall, bonds)
    cash += cashRefill
    bonds -= cashRefill

    const endBal = cash + bonds + equity
    rows.push({
      year: y + 1,
      age,
      startBalance: Math.round(startBal),
      withdrawal: Math.round(withdrawal),
      aowIncome: Math.round(aow),
      growth: Math.round(bondsGrowth + equityGrowth),
      endBalance: Math.max(0, Math.round(endBal)),
      bucketCash: Math.max(0, Math.round(cash)),
      bucketBonds: Math.max(0, Math.round(bonds)),
      bucketEquity: Math.max(0, Math.round(equity)),
    })
    if (endBal <= 0) break
  }
  return rows
}

// ── Legacy (4 strategies) ─────────────────────────────────────

function scheduleLegacySwr(inputs: TableScheduleInputs): TableScheduleRow[] {
  const { startPortfolio, retirementAge, endAge, grossReturn, inflationRate, hasPartner, aowAge, legacyAmount = 0 } = inputs
  const totalYears = endAge - retirementAge
  if (totalYears <= 0 || startPortfolio <= 0) return []

  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const aowYearly = aowYearlyFor(hasPartner)
  // Legacy-SWR: `(surplus) × NL_SWR`. Match `legacy-tables.tsx:64`. Dit is een
  // **conservatieve** onttrekking (SWR 3.58% is lager dan annuity-rate ~6.5%
  // over 30j) waardoor portfolio vaak méér dan legacyAmount overhoudt.
  const pvLegacy = realReturn === 0 ? legacyAmount : legacyAmount / Math.pow(1 + realReturn, totalYears)
  const baseWithdrawal = Math.max(0, (startPortfolio - pvLegacy) * NL_SWR)

  const rows: TableScheduleRow[] = []
  let balance = startPortfolio
  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const startBalance = balance
    const aow = age >= aowAge ? aowYearly : 0
    const neededFromPortfolio = Math.max(0, baseWithdrawal - aow)
    const withdrawal = Math.min(neededFromPortfolio, balance)
    const remaining = balance - withdrawal
    const growth = remaining * realReturn
    const endBalance = remaining + growth

    rows.push({
      year: y + 1,
      age,
      startBalance: Math.round(startBalance),
      withdrawal: Math.round(withdrawal),
      aowIncome: Math.round(aow),
      growth: Math.round(growth),
      endBalance: Math.max(0, Math.round(endBalance)),
    })
    balance = Math.max(0, endBalance)
    if (balance <= 0) break
  }
  return rows
}

function scheduleLegacyGuardrails(inputs: TableScheduleInputs): TableScheduleRow[] {
  const { startPortfolio, retirementAge, endAge, grossReturn, inflationRate, hasPartner, aowAge, legacyAmount = 0 } = inputs
  const totalYears = endAge - retirementAge
  if (totalYears <= 0 || startPortfolio <= 0) return []

  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const aowYearly = aowYearlyFor(hasPartner)
  // Legacy-Guardrails: SWR-base ± 20% band (match `legacy-tables.tsx:109-111`).
  const pvLegacy = realReturn === 0 ? legacyAmount : legacyAmount / Math.pow(1 + realReturn, totalYears)
  let currentWithdrawal = Math.max(0, (startPortfolio - pvLegacy) * NL_SWR)
  const ceiling = NL_SWR * (1 + GUARDRAIL_BAND_DEPLETE_LEGACY)
  const floor = NL_SWR * (1 - GUARDRAIL_BAND_DEPLETE_LEGACY)

  const rows: TableScheduleRow[] = []
  let balance = startPortfolio
  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const startBalance = balance
    const aow = age >= aowAge ? aowYearly : 0

    let guardrail: 'upper' | 'lower' | 'normal' = 'normal'
    if (balance > 0) {
      const ratio = currentWithdrawal / balance
      if (ratio > ceiling) {
        currentWithdrawal = ceiling * balance
        guardrail = 'upper'
      } else if (ratio < floor) {
        currentWithdrawal = floor * balance
        guardrail = 'lower'
      }
    }

    const neededFromPortfolio = Math.max(0, currentWithdrawal - aow)
    const withdrawal = Math.min(neededFromPortfolio, balance)
    const remaining = balance - withdrawal
    const growth = remaining * realReturn
    const endBalance = remaining + growth

    rows.push({
      year: y + 1,
      age,
      startBalance: Math.round(startBalance),
      withdrawal: Math.round(withdrawal),
      aowIncome: Math.round(aow),
      growth: Math.round(growth),
      endBalance: Math.max(0, Math.round(endBalance)),
      guardrail,
    })
    balance = Math.max(0, endBalance)
    if (balance <= 0) break
  }
  return rows
}

function scheduleLegacyVpw(inputs: TableScheduleInputs): TableScheduleRow[] {
  const { startPortfolio, retirementAge, endAge, grossReturn, inflationRate, hasPartner, aowAge, legacyAmount = 0 } = inputs
  const totalYears = endAge - retirementAge
  if (totalYears <= 0 || startPortfolio <= 0) return []

  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const aowYearly = aowYearlyFor(hasPartner)

  const rows: TableScheduleRow[] = []
  let balance = startPortfolio
  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const startBalance = balance
    const aow = age >= aowAge ? aowYearly : 0
    const remainingYears = Math.max(1, totalYears - y)
    const pvLegacyNow = realReturn === 0 ? legacyAmount : legacyAmount / Math.pow(1 + realReturn, remainingYears)
    const vpwAmount = Math.max(0, (balance - pvLegacyNow) / remainingYears)
    const neededFromPortfolio = Math.max(0, vpwAmount - aow)
    const withdrawal = Math.min(neededFromPortfolio, balance)
    const remaining = balance - withdrawal
    const growth = remaining * realReturn
    const endBalance = remaining + growth

    rows.push({
      year: y + 1,
      age,
      startBalance: Math.round(startBalance),
      withdrawal: Math.round(withdrawal),
      aowIncome: Math.round(aow),
      growth: Math.round(growth),
      endBalance: Math.max(0, Math.round(endBalance)),
      remainingYears,
    })
    balance = Math.max(0, endBalance)
    if (balance <= 0) break
  }
  return rows
}

function scheduleLegacyBucket(inputs: TableScheduleInputs): TableScheduleRow[] {
  const { startPortfolio, retirementAge, endAge, yearlyExpenses, grossReturn, inflationRate, hasPartner, aowAge, legacyAmount = 0 } = inputs
  const totalYears = endAge - retirementAge
  if (totalYears <= 0 || startPortfolio <= 0) return []

  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const aowYearly = aowYearlyFor(hasPartner)

  const cashTarget = yearlyExpenses * 2
  const bondTarget = yearlyExpenses * 5
  const legacyBuffer = legacyAmount  // kept in equity

  let cash = Math.min(cashTarget, startPortfolio)
  let bonds = Math.min(bondTarget, Math.max(0, startPortfolio - cash))
  let equity = Math.max(0, startPortfolio - cash - bonds)

  const rows: TableScheduleRow[] = []
  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const startBal = cash + bonds + equity
    const aow = age >= aowAge ? aowYearly : 0
    const neededFromPortfolio = Math.max(0, yearlyExpenses - aow)
    const withdrawal = Math.min(neededFromPortfolio, startBal)

    // Withdraw cash → bonds → available equity (above legacy buffer)
    let toWithdraw = withdrawal
    const fromCash = Math.min(toWithdraw, cash)
    cash -= fromCash
    toWithdraw -= fromCash
    const fromBonds = Math.min(toWithdraw, bonds)
    bonds -= fromBonds
    toWithdraw -= fromBonds
    const availableEquity = Math.max(0, equity - legacyBuffer)
    const fromEquity = Math.min(toWithdraw, availableEquity)
    equity -= fromEquity

    // Growth
    const bondsGrowth = bonds * BOND_RETURN
    const equityGrowth = equity * realReturn
    bonds += bondsGrowth
    equity += equityGrowth

    // Refill cascade, respecting legacy buffer
    const bondShortfall = Math.max(0, bondTarget - bonds)
    const equityForRefill = Math.max(0, equity - legacyBuffer)
    const bondRefill = Math.min(bondShortfall, equityForRefill)
    bonds += bondRefill
    equity -= bondRefill

    const cashShortfall = Math.max(0, cashTarget - cash)
    const cashRefill = Math.min(cashShortfall, bonds)
    cash += cashRefill
    bonds -= cashRefill

    const endBal = cash + bonds + equity
    rows.push({
      year: y + 1,
      age,
      startBalance: Math.round(startBal),
      withdrawal: Math.round(withdrawal),
      aowIncome: Math.round(aow),
      growth: Math.round(bondsGrowth + equityGrowth),
      endBalance: Math.max(0, Math.round(endBal)),
      bucketCash: Math.max(0, Math.round(cash)),
      bucketBonds: Math.max(0, Math.round(bonds)),
      bucketEquity: Math.max(0, Math.round(equity)),
    })
    if (endBal <= 0) break
  }
  return rows
}

// ── Perpetual (4 strategies) ──────────────────────────────────

function schedulePerpetualSwr(inputs: TableScheduleInputs): TableScheduleRow[] {
  const { startPortfolio, retirementAge, endAge, yearlyExpenses, grossReturn, inflationRate, hasPartner, aowAge } = inputs
  const totalYears = Math.max(0, endAge - retirementAge)
  if (totalYears === 0 || startPortfolio <= 0) return []

  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const aowYearly = aowYearlyFor(hasPartner)

  const rows: TableScheduleRow[] = []
  let balance = startPortfolio
  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const startBal = balance
    if (balance <= 0) break
    const aow = age >= aowAge ? aowYearly : 0
    // Perpetual: withdraw SWR × balance, capped at max(expenses − aow, 0).
    const swrAmount = balance * NL_SWR
    const needed = Math.max(0, yearlyExpenses - aow)
    const withdrawal = Math.min(Math.max(swrAmount, needed), balance)
    const remaining = balance - withdrawal
    const growth = remaining * realReturn
    const endBalance = remaining + growth

    rows.push({
      year: y + 1,
      age,
      startBalance: Math.round(startBal),
      withdrawal: Math.round(withdrawal),
      aowIncome: Math.round(aow),
      growth: Math.round(growth),
      endBalance: Math.round(endBalance),
    })
    balance = endBalance
  }
  return rows
}

function schedulePerpetualGuardrails(inputs: TableScheduleInputs): TableScheduleRow[] {
  const { startPortfolio, retirementAge, endAge, yearlyExpenses, grossReturn, inflationRate, hasPartner, aowAge } = inputs
  const totalYears = Math.max(0, endAge - retirementAge)
  if (totalYears === 0 || startPortfolio <= 0) return []

  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const aowYearly = aowYearlyFor(hasPartner)
  let currentWithdrawal = startPortfolio * NL_SWR
  const upperThreshold = startPortfolio * (1 + GUARDRAIL_BAND_PERPETUAL)
  const lowerThreshold = startPortfolio * (1 - GUARDRAIL_BAND_PERPETUAL)

  const rows: TableScheduleRow[] = []
  let balance = startPortfolio
  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const startBal = balance
    if (balance <= 0) break
    const aow = age >= aowAge ? aowYearly : 0

    let guardrail: 'upper' | 'lower' | 'normal' = 'normal'
    if (balance > upperThreshold) {
      currentWithdrawal *= 1.1
      guardrail = 'upper'
    } else if (balance < lowerThreshold) {
      currentWithdrawal *= 0.9
      guardrail = 'lower'
    }

    const needed = Math.max(0, yearlyExpenses - aow)
    const withdrawal = Math.min(Math.max(currentWithdrawal, needed), balance)
    const remaining = balance - withdrawal
    const growth = remaining * realReturn
    const endBalance = remaining + growth

    rows.push({
      year: y + 1,
      age,
      startBalance: Math.round(startBal),
      withdrawal: Math.round(withdrawal),
      aowIncome: Math.round(aow),
      growth: Math.round(growth),
      endBalance: Math.round(endBalance),
      guardrail,
    })
    balance = endBalance
  }
  return rows
}

function schedulePerpetualVpw(inputs: TableScheduleInputs): TableScheduleRow[] {
  const { startPortfolio, retirementAge, endAge, yearlyExpenses, grossReturn, inflationRate, hasPartner, aowAge } = inputs
  const totalYears = Math.max(0, endAge - retirementAge)
  if (totalYears === 0 || startPortfolio <= 0) return []

  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const aowYearly = aowYearlyFor(hasPartner)

  const rows: TableScheduleRow[] = []
  let balance = startPortfolio
  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const startBal = balance
    if (balance <= 0) break
    const aow = age >= aowAge ? aowYearly : 0
    const remYears = remainingVpwYears(age)
    const rate = vpwRate(remYears, realReturn)
    const vpwAmount = balance * rate
    const needed = Math.max(0, yearlyExpenses - aow)
    const withdrawal = Math.min(Math.max(vpwAmount, needed), balance)
    const remaining = balance - withdrawal
    const growth = remaining * realReturn
    const endBalance = remaining + growth

    rows.push({
      year: y + 1,
      age,
      startBalance: Math.round(startBal),
      withdrawal: Math.round(withdrawal),
      aowIncome: Math.round(aow),
      growth: Math.round(growth),
      endBalance: Math.round(endBalance),
      vpwRate: Math.round(rate * 10000) / 100,
      remainingYears: remYears,
    })
    balance = endBalance
  }
  return rows
}

function schedulePerpetualBucket(inputs: TableScheduleInputs): TableScheduleRow[] {
  const { startPortfolio, retirementAge, endAge, yearlyExpenses, grossReturn, inflationRate, hasPartner, aowAge } = inputs
  const totalYears = Math.max(0, endAge - retirementAge)
  if (totalYears === 0 || startPortfolio <= 0) return []

  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const aowYearly = aowYearlyFor(hasPartner)

  const cashTarget = yearlyExpenses * 2
  const bondTarget = yearlyExpenses * 5
  let cash = Math.min(cashTarget, startPortfolio)
  let bonds = Math.min(bondTarget, Math.max(0, startPortfolio - cash))
  let equity = Math.max(0, startPortfolio - cash - bonds)

  const rows: TableScheduleRow[] = []
  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const startBal = cash + bonds + equity
    if (startBal <= 0) break
    const aow = age >= aowAge ? aowYearly : 0
    const needed = Math.max(0, yearlyExpenses - aow)
    const withdrawal = Math.min(needed, startBal)

    let toWithdraw = withdrawal
    const fromCash = Math.min(toWithdraw, cash)
    cash -= fromCash
    toWithdraw -= fromCash
    const fromBonds = Math.min(toWithdraw, bonds)
    bonds -= fromBonds
    toWithdraw -= fromBonds
    const fromEquity = Math.min(toWithdraw, equity)
    equity -= fromEquity

    const bondsGrowth = bonds * BOND_RETURN
    const equityGrowth = equity * realReturn
    bonds += bondsGrowth
    equity += equityGrowth

    const bondShortfall = Math.max(0, bondTarget - bonds)
    const bondRefill = Math.min(bondShortfall, equity)
    bonds += bondRefill
    equity -= bondRefill

    const cashShortfall = Math.max(0, cashTarget - cash)
    const cashRefill = Math.min(cashShortfall, bonds)
    cash += cashRefill
    bonds -= cashRefill

    const endBal = cash + bonds + equity
    rows.push({
      year: y + 1,
      age,
      startBalance: Math.round(startBal),
      withdrawal: Math.round(withdrawal),
      aowIncome: Math.round(aow),
      growth: Math.round(bondsGrowth + equityGrowth),
      endBalance: Math.round(endBal),
      bucketCash: Math.max(0, Math.round(cash)),
      bucketBonds: Math.max(0, Math.round(bonds)),
      bucketEquity: Math.max(0, Math.round(equity)),
    })
  }
  return rows
}

// ── Pensioen (4 strategies) ──────────────────────────────────

// Pensioen: identiek aan perpetual-formules, maar afbouw begint pas op aowAge.
// De caller moet `retirementAge === aowAge` meegeven. Tijdens pre-AOW jaren
// zou de user in opbouw-fase zijn (niet dit helper's verantwoordelijkheid).

function schedulePensioenSwr(inputs: TableScheduleInputs): TableScheduleRow[] {
  return schedulePerpetualSwr(inputs)
}

function schedulePensioenGuardrails(inputs: TableScheduleInputs): TableScheduleRow[] {
  // Pensioen-specifiek: ±10% band (strenger dan perpetual's 20%). Implementatie
  // spiegelt `pension-tables.tsx:108-140`.
  const { startPortfolio, retirementAge, endAge, yearlyExpenses, grossReturn, inflationRate, hasPartner, aowAge } = inputs
  const totalYears = Math.max(0, endAge - retirementAge)
  if (totalYears === 0 || startPortfolio <= 0) return []

  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const aowYearly = aowYearlyFor(hasPartner)
  let baseWithdrawal = startPortfolio * NL_SWR
  const floor = baseWithdrawal * (1 - GUARDRAIL_BAND_PENSION)
  const ceiling = baseWithdrawal * (1 + GUARDRAIL_BAND_PENSION)

  const rows: TableScheduleRow[] = []
  let balance = startPortfolio
  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const startBal = balance
    if (balance <= 0) break
    const aow = age >= aowAge ? aowYearly : 0
    const impliedWithdrawal = balance * NL_SWR
    let guardrail: 'upper' | 'lower' | 'normal' = 'normal'
    if (impliedWithdrawal > ceiling) {
      baseWithdrawal = ceiling
      guardrail = 'upper'
    } else if (impliedWithdrawal < floor) {
      baseWithdrawal = floor
      guardrail = 'lower'
    } else {
      baseWithdrawal = impliedWithdrawal
    }
    const needed = Math.max(0, yearlyExpenses - aow)
    const withdrawal = Math.min(Math.max(baseWithdrawal, needed), balance)
    const remaining = balance - withdrawal
    const growth = remaining * realReturn
    const endBalance = remaining + growth

    rows.push({
      year: y + 1,
      age,
      startBalance: Math.round(startBal),
      withdrawal: Math.round(withdrawal),
      aowIncome: Math.round(aow),
      growth: Math.round(growth),
      endBalance: Math.round(endBalance),
      guardrail,
    })
    balance = endBalance
  }
  return rows
}

function schedulePensioenVpw(inputs: TableScheduleInputs): TableScheduleRow[] {
  return schedulePerpetualVpw(inputs)
}

function schedulePensioenBucket(inputs: TableScheduleInputs): TableScheduleRow[] {
  return schedulePerpetualBucket(inputs)
}

// ── Dispatcher ────────────────────────────────────────────────

/**
 * Compute een afbouw-schedule voor de gegeven (eindstrategie ×
 * onttrekkingsstrategie) combinatie. Retourneert rijen in real-dollar
 * terms (koopkracht-equivalent), met AOW apart uitgelicht per rij.
 *
 * Delegeert naar 16 strategie-specifieke helpers. Elke helper matcht
 * 1:1 de inline-logica van het bijbehorende tabel-component op
 * `/horizon/doorrekening-test/afbouw`.
 */
export function computeTableSchedule(
  endStrategy: TableEndStrategy,
  withdrawalStrategy: TableWithdrawalStrategy,
  inputs: TableScheduleInputs,
): TableScheduleRow[] {
  switch (endStrategy) {
    case 'deplete':
      switch (withdrawalStrategy) {
        case 'swr': return scheduleDepleteSwr(inputs)
        case 'guardrails': return scheduleDepleteGuardrails(inputs)
        case 'vpw': return scheduleDepleteVpw(inputs)
        case 'bucket': return scheduleDepleteBucket(inputs)
      }
      break
    case 'legacy':
      switch (withdrawalStrategy) {
        case 'swr': return scheduleLegacySwr(inputs)
        case 'guardrails': return scheduleLegacyGuardrails(inputs)
        case 'vpw': return scheduleLegacyVpw(inputs)
        case 'bucket': return scheduleLegacyBucket(inputs)
      }
      break
    case 'perpetual':
      switch (withdrawalStrategy) {
        case 'swr': return schedulePerpetualSwr(inputs)
        case 'guardrails': return schedulePerpetualGuardrails(inputs)
        case 'vpw': return schedulePerpetualVpw(inputs)
        case 'bucket': return schedulePerpetualBucket(inputs)
      }
      break
    case 'pensioen':
      switch (withdrawalStrategy) {
        case 'swr': return schedulePensioenSwr(inputs)
        case 'guardrails': return schedulePensioenGuardrails(inputs)
        case 'vpw': return schedulePensioenVpw(inputs)
        case 'bucket': return schedulePensioenBucket(inputs)
      }
      break
  }
  // Exhaustive switch — TypeScript should catch missing cases.
  return []
}
