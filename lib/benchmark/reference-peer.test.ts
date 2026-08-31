/**
 * Slottest: `computeReferencePeer` moet exact dezelfde rekenmotoren aanroepen
 * als de rest van de app — geen parallelle formules. We bouwen in de test
 * dezelfde synthetische peer-invoer na en verifiëren dat de uitkomst identiek is.
 *
 * CLAUDE.md: "Consume, don't recompute" — benchmark herberekent kerngetallen NIET.
 *
 * FASE 6 stap 5A — kernel-migratie: `reference-peer.ts` consumeert sinds de v2-
 * verwijdering `computeScalarFireProjection` (horizon-kernel via de scalar-router),
 * niet meer het rauwe `computeFireProjection` (lib/horizon-data.ts). De "consume-
 * not-recompute"-lock hieronder herbouwt daarom de KERNEL-aanroep, niet de scalar-
 * formule rechtstreeks — anders vergelijkt de lock met de verkeerde bron.
 *
 * B93-doel=0-QUIRK & DE WEERGAVE-REGEL: de solver-status volgt de Excel-oracle-
 * formule 1-op-1, inclusief de "doel=0"-eigenaardigheid — voor `'deplete'` is het
 * doelbedrag `B36` per definitie 0, dus de status is triviaal `reached_now` zodra
 * het startvermogen niet-negatief is. De scalar-router past daarom dezelfde
 * weergave-regel toe als de bridge (`bridge.ts#isKernelReachedNowDisplay`): alleen
 * wanneer de bisectie daadwerkelijk op ~ de startmaand landt geldt "nu al bereikt";
 * anders is `solve.fireAge` (de echte gevonden spend-down-maand) de uitkomst, en is
 * een reached_now-stand met gap < 0 "Niet haalbaar". De peer-`fireAge` is daarmee
 * weer een betekenisvolle maat (test 1b); `freedomPct` blijft de statische
 * scalar-formule (zie de module-doc van `computeScalarFireProjection`).
 */
import { describe, it, expect } from 'vitest'
import { computeReferencePeer } from '@/lib/benchmark/reference-peer'
import { getCohortReference } from '@/lib/benchmark/nl-reference'
import type { FinancialInput } from '@/lib/horizon-data'
import { computeScalarFireProjection } from '@/lib/horizon-kernel/scalar-router'
import { computeHealthScoreFromInputs, type HealthScoreInput } from '@/lib/financial-health'

// Vaste "vandaag" voor alle deterministische tests.
const NOW = new Date('2026-06-15')

// ── Hulpfunctie: zelfde synthetische peer-invoer + KERNEL-aanroep als reference-peer.ts ──

function buildPeerInputs(
  ref: ReturnType<typeof getCohortReference>,
  midAge: number,
  now: Date,
) {
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

  // Zelfde aanroep als reference-peer.ts: de KERNEL-scalar-router, spend-down
  // (deplete) tot eind-leeftijd 90 — niet meer het rauwe computeFireProjection.
  const proj = computeScalarFireProjection({
    input: fin,
    strategyOptions: { strategy: 'deplete', endAge: 90 },
  }).result

  const hsInput: HealthScoreInput = {
    savingsRate6m: ref.savingsRatePct,
    totalAssets: ref.netWorthMedian,
    totalDebts: 0,
    emergencyFundMonths: 3,
    freedomPct: proj.freedomPercentage,
    // Spiegel van de productie-constructie: de peer wordt langs dezelfde
    // peer-relatieve fire_progress-maat gelegd als de gebruiker.
    currentAge: midAge,
    fireAgeFractional: proj.fireAge,
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

  it('fireAge is exact gelijk aan directe aanroep van computeScalarFireProjection (de kernel-tak)', () => {
    const ref = getCohortReference('35-45', null)
    const midAge = 40
    const result = computeReferencePeer(ref, midAge, NOW)

    const { proj } = buildPeerInputs(ref, midAge, NOW)

    expect(result.fireAge).toBe(proj.fireAge)
  })

  it('freedomPct is exact gelijk aan directe aanroep van computeScalarFireProjection', () => {
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

// ── Test 1b: peer-vrijheidsleeftijd is een echte spend-down-uitkomst ──

describe('computeReferencePeer — fireAge is de bisectie-uitkomst, niet de eigen leeftijd', () => {
  it('fireAge > midAge voor een mediaan-peer (35-45): €120k draagt geen spend-down tot 90', () => {
    // De B93-doel=0-quirk (deplete → doelbedrag 0 → solver-status triviaal
    // 'reached_now') mag hier niet doorlekken: de scalar-router toont de échte
    // bisectie-maand (weergave-regel als bridge.ts#isKernelReachedNowDisplay).
    const ref = getCohortReference('35-45', null)
    expect(ref.netWorthMedian).toBeGreaterThanOrEqual(0)
    const result = computeReferencePeer(ref, 40, NOW)
    expect(result.fireAge).not.toBeNull()
    expect(result.fireAge!).toBeGreaterThan(41)
  })

  it('fireAge > midAge voor de 45-55/alleenstaand-peer (€65.590 mediaan) — regressie benchmark-melding aug 2026', () => {
    // Gemeld defect: de spiegel toonde "typische peer: 50 jaar" — exact de midAge —
    // terwijl €65.590 met €458/mnd inleg overduidelijk geen spend-down vanaf nu tot
    // 90 draagt. De peer hoort een echte, latere vrijheidsleeftijd te krijgen.
    const ref = getCohortReference('45-55', 'alleenstaand')
    const result = computeReferencePeer(ref, 50, NOW)
    expect(result.fireAge).not.toBeNull()
    expect(result.fireAge!).toBeGreaterThan(51)
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

  // Golden herijkt (kern-quirk hierboven): `fireAge` is voor de deplete-tak niet
  // meer een betrouwbare vermogens-ordening — bij een niet-negatief vermogen is
  // `fireAge` vrijwel altijd gewoon de eigen `midAge`, dus een OUDER (rijker) cohort
  // heeft per constructie een HOGERE `fireAge`-waarde, niet een lagere — dat zegt
  // niets over vermogen. `freedomPct` blijft wél de betrouwbare, kernel-onafhankelijke
  // scalar-maat (zie de module-doc) en draagt de eigenlijke sanity-intentie van deze
  // test: een rijker cohort staat verder op het pad naar FIRE.
  it('rijker cohort heeft een hogere freedomPct dan armer cohort (fireAge is bij deplete geen betrouwbare maat — zie de quirk-test hierboven)', () => {
    const refArm = getCohortReference('tot25', null)
    const refRijk = getCohortReference('55-65', null)

    const peerArm = computeReferencePeer(refArm, 22, NOW)
    const peerRijk = computeReferencePeer(refRijk, 60, NOW)

    expect(peerRijk.freedomPct).toBeGreaterThanOrEqual(peerArm.freedomPct)
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
