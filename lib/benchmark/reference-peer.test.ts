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
 * GEVONDEN KERN-QUIRK (gerapporteerd, NIET gefixt — buiten scope van deze
 * test-migratie, zie `lib/horizon-kernel/solver.ts` regel ~26-29): de solver-status
 * volgt de Excel-oracle-formule 1-op-1, inclusief een bewuste "doel=0"-eigenaardigheid:
 * `B93 status = IF(Prognose!J(0) ≥ B36, reached_now, ...)`. Voor de `'deplete'`-
 * eindstrategie is `B36` (doelbedrag) per definitie **0** (geen legacy/perpetual-
 * doel) — dus `J(0) ≥ 0` is ALTIJD waar zodra het startvermogen niet-negatief is,
 * ongeacht of de werkelijke afbouw-wiskunde (de bisectie vindt hier zelf
 * `summary.fireAge ≈ 69,17`!) het spend-down-plan daadwerkelijk zou dragen. Gevolg:
 * `computeReferencePeer` — die bewust `strategy: 'deplete'` kiest (zie de module-
 * doc in reference-peer.ts) — rapporteert voor VRIJWEL ELKE peer met een niet-
 * negatief mediaan-vermogen `fireAge = currentAge` ("nu al FIRE"), oftewel de
 * `fireAge`-kolom van de benchmark is voor de deplete-tak effectief altijd "vandaag"
 * en zegt niets over vermogen/leeftijd-ordening. Dit is dezelfde soort kernel-tak
 * die vermoedelijk ook de fireAge-afwijkingen elders in FASE 6 verklaart (zie
 * `lib/fire-withdrawal-integration.test.ts` voor het aparte exponentiële-groei-
 * defect — dit is een ANDER, specifiek deplete/reached_now-mechanisme).
 * `freedomPct` blijft WEL betrouwbaar: dat veld is een STATISCHE scalar-formule
 * (`runScalarFallback`) die de kernel-tak nooit overschrijft (zie de module-doc van
 * `computeScalarFireProjection`) — de sanity-tests hieronder zijn daarom herijkt op
 * `freedomPct` in plaats van `fireAge` voor de vermogens-ordening, en de quirk zelf
 * is expliciet gepind zodat een toekomstige kernel-fix hier zichtbaar wordt.
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

// ── Test 1b: gedocumenteerde kern-quirk — deplete + reached_now (NIET gefixt) ──

describe('computeReferencePeer — gedocumenteerde deplete/reached_now-quirk (kern-defect, gepind)', () => {
  it('fireAge == currentAge (midAge) voor een peer met een niet-negatief mediaan-vermogen', () => {
    // Zie de module-doc bovenaan: `solveFire` markeert 'deplete' als reached_now
    // zodra het startvermogen ≥ 0 is (doelbedrag B36 = 0 voor deplete) — ongeacht of
    // de afbouw-wiskunde het plan daadwerkelijk draagt. Dit pint dat GEDRAG (niet de
    // wenselijkheid ervan) zodat een toekomstige kernel-fix hier zichtbaar rood wordt.
    const ref = getCohortReference('35-45', null)
    expect(ref.netWorthMedian).toBeGreaterThanOrEqual(0)
    const result = computeReferencePeer(ref, 40, NOW)
    expect(result.fireAge).toBe(40)
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
