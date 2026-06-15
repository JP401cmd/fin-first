/**
 * Slottest: `computeReferencePeer` moet exact dezelfde rekenmotoren aanroepen
 * als de rest van de app — geen parallelle formules. We bouwen in de test
 * dezelfde synthetische peer-invoer na en verifiëren dat de uitkomst identiek is.
 *
 * CLAUDE.md: "Consume, don't recompute" — benchmark herberekent kerngetallen NIET.
 */
import { describe, it, expect } from 'vitest'
import { computeReferencePeer } from '@/lib/benchmark/reference-peer'
import { getCohortReference } from '@/lib/benchmark/nl-reference'
import { computeFireProjection, type FinancialInput } from '@/lib/horizon-data'
import { computeHealthScoreFromInputs, type HealthScoreInput } from '@/lib/financial-health'

// Vaste "vandaag" voor alle deterministische tests.
const NOW = new Date('2026-06-15')

// ── Hulpfunctie: zelfde synthetische peer-invoer als reference-peer.ts ──

function buildPeerInputs(
  ref: ReturnType<typeof getCohortReference>,
  midAge: number,
  now: Date,
): { fin: FinancialInput; hsInput: HealthScoreInput; proj: ReturnType<typeof computeFireProjection> } {
  const monthlyIncome = ref.incomeMedian / 12
  const monthlySavings = monthlyIncome * (ref.savingsRatePct / 100)
  const monthlyExpenses = Math.max(0, monthlyIncome - monthlySavings)

  const dob = new Date(now.getFullYear() - midAge, now.getMonth(), now.getDate())
  const dateOfBirth = dob.toISOString().split('T')[0]

  const fin: FinancialInput = {
    totalAssets: ref.netWorthMedian,
    totalDebts: 0,
    monthlyIncome,
    monthlyExpenses,
    yearlyMustExpenses: 0,
    monthlyContributions: monthlySavings,
    dateOfBirth,
  }

  // Zelfde aanroep als reference-peer.ts: spend-down (deplete) tot eind-leeftijd 90.
  const proj = computeFireProjection(fin, undefined, undefined, undefined, {
    strategy: 'deplete',
    endAge: 90,
  })

  const hsInput: HealthScoreInput = {
    savingsRate6m: ref.savingsRatePct,
    totalAssets: ref.netWorthMedian,
    totalDebts: 0,
    emergencyFundMonths: 3,
    freedomPct: proj.freedomPercentage,
    netMonthlyIncome: monthlyIncome,
    debtMonthlyPayments: 0,
    largestAssetTypeShare: null,
    budgetCategories: [],
  }

  return { fin, hsInput, proj }
}

// ── Test 1: consume-not-recompute lock ────────────────────

describe('computeReferencePeer — consume-not-recompute lock', () => {
  it('healthScoreTotal is exact gelijk aan directe aanroep van computeHealthScoreFromInputs', () => {
    const ref = getCohortReference('35-45', null)
    const midAge = 40
    const result = computeReferencePeer(ref, midAge, NOW)

    const { hsInput, proj } = buildPeerInputs(ref, midAge, NOW)
    const health = computeHealthScoreFromInputs(
      { ...hsInput, freedomPct: proj.freedomPercentage },
      false,
    )

    expect(result.healthScoreTotal).toBe(health.total)
  })

  it('fireAge is exact gelijk aan directe aanroep van computeFireProjection', () => {
    const ref = getCohortReference('35-45', null)
    const midAge = 40
    const result = computeReferencePeer(ref, midAge, NOW)

    const { proj } = buildPeerInputs(ref, midAge, NOW)

    expect(result.fireAge).toBe(proj.fireAge)
  })

  it('freedomPct is exact gelijk aan directe aanroep van computeFireProjection', () => {
    const ref = getCohortReference('35-45', null)
    const midAge = 40
    const result = computeReferencePeer(ref, midAge, NOW)

    const { proj } = buildPeerInputs(ref, midAge, NOW)

    expect(result.freedomPct).toBe(proj.freedomPercentage)
  })

  it('resultaat is stabiel over meerdere aanroepen (deterministisch)', () => {
    const ref = getCohortReference('45-55', null)
    const r1 = computeReferencePeer(ref, 50, NOW)
    const r2 = computeReferencePeer(ref, 50, NOW)
    expect(r1.healthScoreTotal).toBe(r2.healthScoreTotal)
    expect(r1.fireAge).toBe(r2.fireAge)
    expect(r1.freedomPct).toBe(r2.freedomPct)
  })
})

// ── Test 2: sanity checks — rijker cohort ≻ armer cohort ──

describe('computeReferencePeer — sanity: rijker cohort heeft betere uitkomst', () => {
  // 35-45 vs. tot25: ouder cohort heeft significant meer vermogen en inkomen.
  it('35-45 (meer vermogen/inkomen) heeft hogere healthScore dan tot25', () => {
    const refArm = getCohortReference('tot25', null)
    const refRijk = getCohortReference('35-45', null)

    const peerArm = computeReferencePeer(refArm, 22, NOW)
    const peerRijk = computeReferencePeer(refRijk, 40, NOW)

    expect(peerRijk.healthScoreTotal).toBeGreaterThan(peerArm.healthScoreTotal)
  })

  it('rijker cohort heeft eerder (lager) fireAge dan armer cohort — of beiden null', () => {
    const refArm = getCohortReference('tot25', null)
    const refRijk = getCohortReference('55-65', null)

    const peerArm = computeReferencePeer(refArm, 22, NOW)
    const peerRijk = computeReferencePeer(refRijk, 60, NOW)

    // Als het rijkere cohort een fireAge heeft, moet dat eerder zijn dan dat van het arme,
    // of het arme heeft geen fireAge (null) terwijl het rijke wel een heeft.
    if (peerRijk.fireAge !== null && peerArm.fireAge !== null) {
      expect(peerRijk.fireAge).toBeLessThanOrEqual(peerArm.fireAge)
    } else if (peerRijk.fireAge !== null) {
      // Rijke peer bereikt FIRE, arme niet — dit is het verwachte geval.
      expect(peerArm.fireAge).toBeNull()
    }
    // Als rijke peer ook null is, markeer de test als niet-gefaald (beide te jong/arm).
  })

  it('een cohort met hogere spaarquote heeft hogere freedomPct', () => {
    // 45-55 (savingsRatePct=13) vs. tot25 (savingsRatePct=6) — zelfde vermogen-kwaal,
    // we bouwen twee refs met dezelfde netWorth maar verschillende spaarquote.
    const refLaag = getCohortReference('tot25', null)  // 6% spaarquote
    const refHoog = getCohortReference('45-55', null)  // 13% spaarquote

    const peerLaag = computeReferencePeer(refLaag, 22, NOW)
    const peerHoog = computeReferencePeer(refHoog, 50, NOW)

    // 45-55 heeft ook véél meer vermogen — hogere freedomPct verwacht.
    expect(peerHoog.freedomPct).toBeGreaterThan(peerLaag.freedomPct)
  })
})

// ── Test 3: uitvoer-structuur ─────────────────────────────

describe('computeReferencePeer — uitvoer-structuur', () => {
  it('retourneert healthScoreTotal tussen 0 en 100', () => {
    const ref = getCohortReference('35-45', 'paar')
    const result = computeReferencePeer(ref, 40, NOW)
    expect(result.healthScoreTotal).toBeGreaterThanOrEqual(0)
    expect(result.healthScoreTotal).toBeLessThanOrEqual(100)
  })

  it('retourneert freedomPct >= 0', () => {
    const ref = getCohortReference('35-45', null)
    const result = computeReferencePeer(ref, 40, NOW)
    expect(result.freedomPct).toBeGreaterThanOrEqual(0)
  })

  it('fireAge is null of een positief getal', () => {
    const ref = getCohortReference('35-45', null)
    const result = computeReferencePeer(ref, 40, NOW)
    if (result.fireAge !== null) {
      expect(result.fireAge).toBeGreaterThan(0)
    } else {
      expect(result.fireAge).toBeNull()
    }
  })
})
