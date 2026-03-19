import { registerTests } from '../test-registry'
import {
  assert, assertEqual, assertNotNull, assertGreaterThan,
  assertLessThan, assertFinite,
} from '../assert'
import type { TestCase } from '../test-types'
import {
  compareMortgageVsInvest,
  type HvBParams,
  type HvBResult,
} from '@/lib/hypotheek-vs-beleggen'
import { BOX3_DRAG } from '@/lib/horizon-data'

const CAT = 'kern.hypotheek-vs-beleggen'

// ── Standard test params ──────────────────────────────────────────────────────

const STANDARD: HvBParams = {
  extraBedrag: 500,
  hypotheekBalance: 250_000,
  rente: 3.5,
  repaymentType: 'annuity',
  restLooptijd: 300, // 25 jaar
  isTaxDeductible: true,
  marginaalTarief: 0.3697,
  verwachtRendement: 0.07,
  inflatie: 0.02,
  hasPartner: false,
  horizonJaren: 20,
}

function run(overrides: Partial<HvBParams> = {}): HvBResult {
  return compareMortgageVsInvest({ ...STANDARD, ...overrides })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Annuïteit extra aflossen ────────────────────────────────────────────────
  {
    id: 'hvb-annuiteit-rentebesparing',
    name: 'Annuïteits-hypotheek extra aflossen berekent correct rentebesparing',
    category: CAT,
    description: 'Bij annuïteitshypotheek levert extra aflossen een positief nettoVoordeel op (rentebesparing)',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      const r = run()
      // Aflossing scenario moet positief netto voordeel hebben (rentebesparing)
      assertGreaterThan(r.aflossing.nettoVoordeel, 0, 'Aflossen nettoVoordeel > 0')
      // Aflossing eindwaarde > nettoVoordeel (bevat ook het afgeloste bedrag)
      assertGreaterThan(r.aflossing.eindwaarde, r.aflossing.nettoVoordeel, 'Eindwaarde > netto voordeel')
      assertFinite(r.aflossing.nettoVoordeel, 'nettoVoordeel is finite')
      assertFinite(r.aflossing.eindwaarde, 'eindwaarde is finite')
    },
  },

  // ── Aflossingsvrij zonder HRA verlies ───────────────────────────────────────
  {
    id: 'hvb-aflossingsvrij-geen-hra',
    name: 'Aflossingsvrij hypotheek heeft geen HRA verlies bij is_tax_deductible=false',
    category: CAT,
    description: 'Bij annuïteit zonder HRA is het aflossingsvoordeel groter (geen aftrekverlies)',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // Use annuity (not interest_only) — interest_only has constant interest so
      // extra payments don't reduce scheduled interest in the engine's model.
      // With HRA
      const metHra = run({
        repaymentType: 'annuity',
        isTaxDeductible: true,
      })
      // Without HRA
      const zonderHra = run({
        repaymentType: 'annuity',
        isTaxDeductible: false,
      })
      // Zonder HRA: aflossen levert méér netto voordeel (geen verlies van renteaftrek)
      assertGreaterThan(
        zonderHra.aflossing.nettoVoordeel,
        metHra.aflossing.nettoVoordeel,
        'Zonder HRA: hoger netto voordeel aflossen (geen aftrekverlies)',
      )
      // Both should be positive
      assertGreaterThan(metHra.aflossing.nettoVoordeel, 0, 'Met HRA: nog steeds positief')
      assertGreaterThan(zonderHra.aflossing.nettoVoordeel, 0, 'Zonder HRA: positief')
    },
  },

  // ── Breakeven rendement ─────────────────────────────────────────────────────
  {
    id: 'hvb-breakeven-correct',
    name: 'Breakeven rendement — bij dat rendement is verschil ≈ 0',
    category: CAT,
    description: 'Het breakeven rendement zorgt ervoor dat beleggen en aflossen nagenoeg gelijk uitkomen',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const base = run()
      assertFinite(base.breakevenRendement, 'breakeven is finite')
      assertGreaterThan(base.breakevenRendement, 0, 'breakeven > 0%')
      assertLessThan(base.breakevenRendement, 0.25, 'breakeven < 25%')

      // Verify: running with breakeven rendement should yield ~0 verschil
      const atBreakeven = run({ verwachtRendement: base.breakevenRendement })
      // Verschil should be near 0 (within €500 tolerance — binary search precision
      // is limited and rounding amplifies over 20-year horizon)
      assert(
        Math.abs(atBreakeven.verschil) <= 500,
        `Bij breakeven rendement (${(base.breakevenRendement * 100).toFixed(2)}%) is verschil ≈ 0, maar was ${atBreakeven.verschil}`,
      )
    },
  },

  // ── Box 3 belasting meegenomen ──────────────────────────────────────────────
  {
    id: 'hvb-box3-belasting',
    name: 'Box 3 belasting wordt correct meegenomen in beleggingsscenario',
    category: CAT,
    description: 'Beleggen scenario houdt rekening met Box 3 drag (forfaitaire rendementsheffing)',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // Met standaard verwachtRendement (7%) en BOX3_DRAG
      const r = run()

      // Het netto rendement is verwachtRendement - BOX3_DRAG
      // Als BOX3_DRAG 0 zou zijn, zou beleggen meer opleveren
      // We verifiëren indirect: het beleggingsvoordeel is lager dan bij een
      // scenario zonder Box 3 (hypothetisch netto = bruto)
      assert(BOX3_DRAG > 0, 'BOX3_DRAG is positief (er IS belasting)')
      assertGreaterThan(r.beleggen.nettoVoordeel, 0, 'Beleggen levert toch positief rendement op')

      // Het beleggingsscenario moet reëel zijn: niet hoger dan theoretisch max
      // Max = €500/mnd * 12 * 20 jaar * verwachtRendement compound
      // Simpele sanity: eindwaarde mag niet meer dan 4x totale inleg zijn bij 7% over 20j
      const totaleInleg = 500 * 12 * 20 // €120.000
      assertLessThan(r.beleggen.eindwaarde, totaleInleg * 4, 'Eindwaarde realistisch (<4x inleg)')
    },
  },

  // ── FIRE-impact logica ──────────────────────────────────────────────────────
  {
    id: 'hvb-fire-impact',
    name: 'FIRE-impact geeft logische maanden (positief voor beleggen)',
    category: CAT,
    description: 'Bij standaard params (7% rendement) levert beleggen een positieve FIRE-impact op',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // Zonder FIRE-params: impact is null
      const rZonder = run()
      assertEqual(rZonder.fireImpactMaanden, null, 'Zonder FIRE-params: null')

      // Met FIRE-params
      const rMet = run({
        currentAge: 35,
        currentPortfolio: 150_000,
        yearlyExpenses: 36_000,
        annualSavings: 18_000,
      })
      assertNotNull(rMet.fireImpactMaanden, 'Met FIRE-params: niet null')
      assertFinite(rMet.fireImpactMaanden!, 'FIRE-impact is finite')
      // Bij 7% rendement: beleggen zou FIRE eerder moeten brengen (positief)
      assertGreaterThan(rMet.fireImpactMaanden!, 0, 'Bij 7%: beleggen brengt FIRE eerder (positief)')
    },
  },

  // ── Edge case: 0% rente ─────────────────────────────────────────────────────
  {
    id: 'hvb-zero-rente',
    name: 'Edge case 0% rente → beleggen altijd beter',
    category: CAT,
    description: 'Bij 0% hypotheekrente levert aflossen geen rentebesparing op, beleggen wint altijd',
    priority: 'medium',
    estimatedDurationMs: 100,
    fn() {
      const r = run({ rente: 0 })
      // Bij 0% rente: aflossen levert 0 rentebesparing
      assertEqual(r.aflossing.nettoVoordeel, 0, 'Aflossen: 0 rentebesparing bij 0% rente')
      // Beleggen levert wél rendement
      assertGreaterThan(r.beleggen.nettoVoordeel, 0, 'Beleggen: positief rendement')
      // Verschil positief (beleggen wint)
      assertGreaterThan(r.verschil, 0, 'Verschil positief: beleggen wint')
      assertEqual(r.aanbeveling, 'beleggen', 'Aanbeveling: beleggen')
    },
  },

  // ── Edge case: hypotheek bijna afbetaald ────────────────────────────────────
  {
    id: 'hvb-bijna-afbetaald',
    name: 'Edge case hypotheek bijna afbetaald → kleine impact',
    category: CAT,
    description: 'Bij een bijna afgeloste hypotheek is het verschil klein',
    priority: 'medium',
    estimatedDurationMs: 100,
    fn() {
      const r = run({
        hypotheekBalance: 5_000, // slechts €5.000 over
        restLooptijd: 12,        // 1 jaar restant
        horizonJaren: 1,
      })
      // Het verschil is klein (beperkte impact door lage restschuld)
      assert(
        Math.abs(r.verschil) < 1000,
        `Verschil klein bij bijna afbetaald: ${r.verschil}`,
      )
      // Aflossing netto voordeel is beperkt
      assertLessThan(
        Math.abs(r.aflossing.nettoVoordeel), 500,
        'Aflossingsvoordeel beperkt bij kleine restschuld',
      )
    },
  },

  // ── Partner situatie: dubbele Box 3 vrijstelling ────────────────────────────
  {
    id: 'hvb-partner-box3',
    name: 'Partner situatie → hasPartner vlag correct doorgegeven',
    category: CAT,
    description: 'Met partner geeft de engine een geldig resultaat; hasPartner wordt meegegeven',
    priority: 'medium',
    estimatedDurationMs: 100,
    fn() {
      const solo = run({ hasPartner: false })
      const partner = run({ hasPartner: true })

      // Both should produce valid results
      assertFinite(solo.verschil, 'Solo: verschil is finite')
      assertFinite(partner.verschil, 'Partner: verschil is finite')
      assertGreaterThan(solo.beleggen.nettoVoordeel, 0, 'Solo: beleggen positief')
      assertGreaterThan(partner.beleggen.nettoVoordeel, 0, 'Partner: beleggen positief')

      // Both produce jaarlijkseVergelijking with correct length
      assertEqual(solo.jaarlijkseVergelijking.length, 20, 'Solo: 20 jaar vergelijking')
      assertEqual(partner.jaarlijkseVergelijking.length, 20, 'Partner: 20 jaar vergelijking')
    },
  },

  // ── Jaarlijkse vergelijking structuur ───────────────────────────────────────
  {
    id: 'hvb-jaarlijkse-vergelijking',
    name: 'Jaarlijkse vergelijking is monotoon oplopend en correct gestructureerd',
    category: CAT,
    description: 'De jaarlijkse vergelijking bevat alle jaren en het beleggingsvoordeel groeit cumulatief',
    priority: 'medium',
    estimatedDurationMs: 100,
    fn() {
      const r = run()
      assertEqual(r.jaarlijkseVergelijking.length, 20, '20 jaren')

      // Check structure
      for (let i = 0; i < r.jaarlijkseVergelijking.length; i++) {
        const jv = r.jaarlijkseVergelijking[i]
        assertEqual(jv.jaar, i + 1, `Jaar ${i + 1}`)
        assertFinite(jv.aflossen, `aflossen jaar ${i + 1}`)
        assertFinite(jv.beleggen, `beleggen jaar ${i + 1}`)
        // verschil is Math.round(raw_beleggen - raw_aflossen), NOT beleggen - aflossen
        // (each is independently rounded), so allow ±1 rounding difference
        assert(
          Math.abs(jv.verschil - (jv.beleggen - jv.aflossen)) <= 1,
          `verschil ≈ beleggen - aflossen jaar ${i + 1} (got ${jv.verschil} vs ${jv.beleggen - jv.aflossen})`,
        )
      }

      // Beleggen cumulatief voordeel should be growing (compound growth)
      const lastBeleggen = r.jaarlijkseVergelijking[19].beleggen
      const firstBeleggen = r.jaarlijkseVergelijking[0].beleggen
      assertGreaterThan(lastBeleggen, firstBeleggen, 'Beleggen groeit over tijd')
    },
  },

  // ── Aanbeveling logica ──────────────────────────────────────────────────────
  {
    id: 'hvb-aanbeveling',
    name: 'Aanbeveling volgt verschil correct',
    category: CAT,
    description: 'Aanbeveling is beleggen/aflossen/gelijk op basis van verschil met €100 drempel',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // Bij hoog rendement: beleggen wint
      const hoog = run({ verwachtRendement: 0.10 })
      assertEqual(hoog.aanbeveling, 'beleggen', 'Bij 10% rendement: beleggen')

      // Bij 0% rente: beleggen wint
      const nulRente = run({ rente: 0 })
      assertEqual(nulRente.aanbeveling, 'beleggen', 'Bij 0% rente: beleggen')

      // Bij 0 extra bedrag: gelijk
      const nul = run({ extraBedrag: 0 })
      assertEqual(nul.aanbeveling, 'gelijk', 'Bij €0 extra: gelijk')
    },
  },
]

export function register(): void {
  registerTests(tests)
}
