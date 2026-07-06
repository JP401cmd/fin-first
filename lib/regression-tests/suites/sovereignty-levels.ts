import { registerTests } from '../test-registry'
import { assertEqual, assert, assertGreaterThan, assertGreaterThanOrEqual, assertLessThanOrEqual, assertLessThan } from '../assert'
import type { TestCase } from '../test-types'
import { computeSovereigntyLevel, levelToPhaseId, PHASES } from '@/lib/feature-phases'
import { computeFeatureAccess, isFeatureAccessible } from '@/lib/compute-feature-access'
import type { FinancialInput } from '@/lib/compute-feature-access'
import { NL_SWR } from '@/lib/horizon-data'

const CAT = 'identiteit.sovereignty'

// ── Persona financial snapshots ──────────────────────────────────────────────
// Derived from lib/test-personas.ts — these mirror the actual persona data.

// Roos: assets €3500, debts €18500 (credit_card + personal_loan + payment_plan)
// Net worth: -€15000, has consumer debt → level -2, phase recovery
const ROOS = {
  netWorth: -15_000,
  monthlyExpenses: 2_875, // ~€2800-2950 range
  freedomPct: 0,
  hasConsumerDebt: true, // credit_card + personal_loan
}

// Daan: assets €6850 (Meesman + BND), debts €13900 (student_loan only)
// Net worth: -€7050, NO consumer debt (student_loan excluded) → level -1, phase recovery
const DAAN = {
  netWorth: -7_050,
  monthlyExpenses: 2_100,
  freedomPct: 0,
  hasConsumerDebt: false, // student_loan is NOT consumer debt
}

// Lisa: assets €443000, debts €350000 (mortgage only)
// Net worth: ~€93000, sovereignty = 'stability'
// With freedomPct < 10 (netto vermogen excl. woning is laag) → level 2
const LISA = {
  netWorth: 93_000,
  monthlyExpenses: 3_000,
  freedomPct: 8, // < 10% keeps her in stability (level 2)
  hasConsumerDebt: false,
}

// Willem: assets €1,562,000, debts €0
// Net worth: €1,562,000, sovereignty = 'mastery', high freedom %
const WILLEM = {
  netWorth: 1_562_000,
  monthlyExpenses: 1_495,
  freedomPct: 85, // near FI
  hasConsumerDebt: false,
}

// Marijke: assets €765,000, debts €0 (gepensioneerd, hypotheekvrij)
// Net worth: €765,000, sovereignty = 'mastery'
const MARIJKE = {
  netWorth: 765_000,
  monthlyExpenses: 2_500,
  freedomPct: 100, // fully retired
  hasConsumerDebt: false,
}

// ── Helper to build minimal FinancialInput ───────────────────────────────────

function makeFinancialInput(overrides: {
  assets?: { current_value: number }[]
  debts?: { current_balance: number; debt_type: string }[]
  monthlyExpenses?: number
}): FinancialInput {
  const expenses = overrides.monthlyExpenses ?? 3000
  // Create 3 months of expense transactions (computeFeatureAccess divides by 3)
  const transactions = [
    { amount: -expenses, is_income: false },
    { amount: -expenses, is_income: false },
    { amount: -expenses, is_income: false },
  ]
  return {
    assets: overrides.assets ?? [],
    debts: overrides.debts ?? [],
    transactions,
    activeSubscriptions: [],
    userFeaturePrefs: null,
  }
}

const tests: TestCase[] = [
  // ── Step 1: Roos (schulden) → Herstel (level -2 or -1) ────────────────────
  {
    id: 'sov-roos-recovery',
    name: 'Persona Roos: level -2 (schulden + consumentensckuld)',
    category: CAT,
    description: 'Roos heeft negatief vermogen EN consumentensckuld → level -2, phase recovery',
    priority: 'critical',
    estimatedDurationMs: 5,
    fn() {
      const level = computeSovereigntyLevel(
        ROOS.netWorth, ROOS.monthlyExpenses, ROOS.freedomPct, ROOS.hasConsumerDebt,
      )
      assertEqual(level, -2, 'Roos level')
      assertEqual(levelToPhaseId(level), 'recovery', 'Roos phase')
    },
  },

  // ── Step 2: Daan (starter) → Herstel/Stabiliteit grens ────────────────────
  {
    id: 'sov-daan-starter',
    name: 'Persona Daan: level -1 (negatief vermogen, geen consumentensckuld)',
    category: CAT,
    description: 'Daan heeft negatief vermogen maar alleen studieschuld (geen consumentensckuld) → level -1, phase recovery',
    priority: 'critical',
    estimatedDurationMs: 5,
    fn() {
      const level = computeSovereigntyLevel(
        DAAN.netWorth, DAAN.monthlyExpenses, DAAN.freedomPct, DAAN.hasConsumerDebt,
      )
      assertEqual(level, -1, 'Daan level')
      assertEqual(levelToPhaseId(level), 'recovery', 'Daan phase')
    },
  },

  // ── Step 3: Lisa (100K) → Stabiliteit (level 2) ───────────────────────────
  {
    id: 'sov-lisa-stability',
    name: 'Persona Lisa: Stabiliteit (level 2)',
    category: CAT,
    description: 'Lisa heeft €93K netto, 6+ maanden buffer maar <10% freedom → level 2, phase stability',
    priority: 'critical',
    estimatedDurationMs: 5,
    fn() {
      // Lisa: monthsCovered = 93000/3000 = 31, freedomPct 8%
      // monthsCovered >= 6 but freedomPct < 10 → level 2
      const level = computeSovereigntyLevel(
        LISA.netWorth, LISA.monthlyExpenses, LISA.freedomPct, LISA.hasConsumerDebt,
      )
      assertEqual(level, 2, 'Lisa level')
      assertEqual(levelToPhaseId(level), 'stability', 'Lisa phase')
    },
  },

  // ── Step 4: Willem (bijna-FI) → Momentum/Mastery (level 4-5) ──────────────
  {
    id: 'sov-willem-mastery',
    name: 'Persona Willem: Meesterschap (level 5)',
    category: CAT,
    description: 'Willem heeft €1.5M netto, 85% freedom → level 5, phase mastery',
    priority: 'critical',
    estimatedDurationMs: 5,
    fn() {
      const level = computeSovereigntyLevel(
        WILLEM.netWorth, WILLEM.monthlyExpenses, WILLEM.freedomPct, WILLEM.hasConsumerDebt,
      )
      assertEqual(level, 5, 'Willem level')
      assertEqual(levelToPhaseId(level), 'mastery', 'Willem phase')
    },
  },

  // ── Step 5: Marijke (gepensioneerd) → Meesterschap (level 6) ──────────────
  {
    id: 'sov-marijke-mastery',
    name: 'Persona Marijke: Meesterschap (level 6)',
    category: CAT,
    description: 'Marijke is gepensioneerd, 100% freedom → level 6, phase mastery',
    priority: 'critical',
    estimatedDurationMs: 5,
    fn() {
      const level = computeSovereigntyLevel(
        MARIJKE.netWorth, MARIJKE.monthlyExpenses, MARIJKE.freedomPct, MARIJKE.hasConsumerDebt,
      )
      assertEqual(level, 6, 'Marijke level')
      assertEqual(levelToPhaseId(level), 'mastery', 'Marijke phase')
    },
  },

  // ── Step 6: consumentensckuld impact ──────────────────────────────────────
  {
    id: 'sov-consumer-debt-impact',
    name: 'Consumentensckuld beperkt level',
    category: CAT,
    description: 'hasConsumerDebt=true met negatief vermogen → level -2 i.p.v. -1',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      // Without consumer debt: negative net worth → -1
      const levelNoDebt = computeSovereigntyLevel(-5000, 2000, 0, false)
      assertEqual(levelNoDebt, -1, 'zonder consumentensckuld')

      // With consumer debt: negative net worth → -2
      const levelWithDebt = computeSovereigntyLevel(-5000, 2000, 0, true)
      assertEqual(levelWithDebt, -2, 'met consumentensckuld')

      // Consumer debt only matters for negative net worth
      // With positive net worth + consumer debt → level determined by other factors
      const levelPositive = computeSovereigntyLevel(50000, 2000, 5, true)
      assertGreaterThan(levelPositive, 0, 'positief vermogen met consumentensckuld')
    },
  },

  // ── Step 7: Fase transitie bij gewijzigde financiële data ─────────────────
  {
    id: 'sov-phase-transition',
    name: 'Fase transitie bij gewijzigde financiële data',
    category: CAT,
    description: 'Wijziging van financiële data triggert level herberekening en fase-overgang',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      // Start: negative net worth with consumer debt → level -2 (recovery)
      const level1 = computeSovereigntyLevel(-5000, 2000, 0, true)
      assertEqual(level1, -2, 'start: level -2')
      assertEqual(levelToPhaseId(level1), 'recovery', 'start: recovery')

      // Pay off debts, reach 0 → level 0 (still recovery)
      const level2 = computeSovereigntyLevel(500, 2000, 0, false)
      assertEqual(level2, 0, 'bijna nul: level 0')
      assertEqual(levelToPhaseId(level2), 'recovery', 'bijna nul: recovery')

      // Build 1 month buffer → level 1 (recovery)
      const level3 = computeSovereigntyLevel(2500, 2000, 0, false)
      assertEqual(level3, 1, 'buffer 1 maand: level 1')
      assertEqual(levelToPhaseId(level3), 'stability', 'buffer 1 maand: stability')

      // Build 3 month emergency fund → level 2 (stability)
      const level4 = computeSovereigntyLevel(8000, 2000, 2, false)
      assertEqual(level4, 2, 'noodfonds 3m: level 2')
      assertEqual(levelToPhaseId(level4), 'stability', 'noodfonds 3m: stability')

      // Grow investments to 10% freedom → level 3 (momentum)
      const level5 = computeSovereigntyLevel(20000, 2000, 15, false)
      assertEqual(level5, 3, 'freedom 15%: level 3')
      assertEqual(levelToPhaseId(level5), 'momentum', 'freedom 15%: momentum')

      // Coast FIRE territory, 50% freedom → level 4 (momentum)
      const level6 = computeSovereigntyLevel(100000, 2000, 50, false)
      assertEqual(level6, 4, 'freedom 50%: level 4')
      assertEqual(levelToPhaseId(level6), 'momentum', 'freedom 50%: momentum')

      // Near independence, 85% freedom → level 5 (mastery)
      const level7 = computeSovereigntyLevel(200000, 2000, 85, false)
      assertEqual(level7, 5, 'freedom 85%: level 5')
      assertEqual(levelToPhaseId(level7), 'mastery', 'freedom 85%: mastery')

      // Full FI, 100%+ freedom → level 6 (mastery)
      const level8 = computeSovereigntyLevel(500000, 2000, 105, false)
      assertEqual(level8, 6, 'freedom 105%: level 6')
      assertEqual(levelToPhaseId(level8), 'mastery', 'freedom 105%: mastery')
    },
  },

  // ── Step 8: Doorwerking — sovereignty level is puur motivatie, geen gating ──
  {
    id: 'sov-feature-gating',
    name: 'Sovereignty level stuurt géén feature-toegang (motivatie-only)',
    category: CAT,
    description: 'Feature access is identiek voor recovery- en mastery-gebruikers; level/phase alleen voor weergave',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      // Recovery user (negative net worth + consumer debt)
      const recoveryInput = makeFinancialInput({
        assets: [{ current_value: 3500 }],
        debts: [
          { current_balance: 4800, debt_type: 'credit_card' },
          { current_balance: 12500, debt_type: 'personal_loan' },
        ],
        monthlyExpenses: 2800,
      })
      const recoveryAccess = computeFeatureAccess(recoveryInput)
      assertEqual(recoveryAccess.phase, 'recovery', 'recovery phase')
      assertLessThanOrEqual(recoveryAccess.level, 0, 'recovery level <= 0')

      // Mastery user (high net worth, no debts)
      const masteryInput = makeFinancialInput({
        assets: [{ current_value: 1_500_000 }],
        debts: [],
        monthlyExpenses: 3000,
      })
      const masteryAccess = computeFeatureAccess(masteryInput)
      assertEqual(masteryAccess.phase, 'mastery', 'mastery phase')
      assertGreaterThanOrEqual(masteryAccess.level, 5, 'mastery level >= 5')

      // Fase stuurt geen toegang meer: recovery en mastery hebben exact
      // dezelfde feature-toegang (abonnement + user-toggles zijn de enige assen).
      const recoveryMap = recoveryAccess.features
      const masteryMap = masteryAccess.features
      for (const [id, masteryResult] of Object.entries(masteryMap)) {
        const recoveryResult = recoveryMap[id]
        assert(recoveryResult !== undefined, `feature ${id} aanwezig voor recovery-gebruiker`)
        assertEqual(
          recoveryResult.accessible,
          masteryResult.accessible,
          `feature ${id}: toegang identiek ongeacht sovereignty-fase`,
        )
      }

      // Gratis features staan voor beide standaard aan
      assert(recoveryMap['vermogensbeheer']?.accessible === true, 'vermogensbeheer aan in recovery')
      assert(masteryMap['vermogensbeheer']?.accessible === true, 'vermogensbeheer aan in mastery')
    },
  },

  // ── Canonieke grondslag (ADR 0009 / audit §R2): freedomPct, niet vol-vermogen ─
  // Regressie voor de WP-B-fix in dashboard-data-loader: het sovereignty-niveau
  // ("Jouw Pad") krijgt nu de canonieke `freedomPct` (FIRE-eligible vermogen ÷
  // benodigde portfolio, huis-uitgesloten) i.p.v. een lokaal hertelde
  // `netWorth / (jaaruitgaven / NL_SWR)`. Voor een huiseigenaar dúwde die oude
  // som het percentage — en daarmee het niveau — kunstmatig omhoog, terwijl het
  // dashboard tegelijk een lager (correcter) getal toonde. Deze case pint vast
  // dat de canonieke freedomPct een STRIKT lager (en juister) niveau oplevert.
  {
    id: 'sov-freedompct-canoniek-niet-volvermogen',
    name: 'Sovereignty-niveau volgt canonieke freedomPct, niet netWorth/NL_SWR (huiseigenaar)',
    category: CAT,
    description:
      'Huiseigenaar: vol netWorth ÷ (jaaruitgaven/NL_SWR) zou ~92% (level 5) geven; de canonieke huis-uitgesloten freedomPct is 50% (level 4). Het niveau MOET het canonieke, lagere getal volgen.',
    priority: 'critical',
    estimatedDurationMs: 5,
    fn() {
      // Huiseigenaar met veel vastgeklonken woningwaarde.
      const netWorth = 1_150_000        // incl. woning
      const monthlyExpenses = 3_000
      const yearlyExpenses = monthlyExpenses * 12 // 36.000

      // OUD (buggy): vol vermogen ÷ benodigde portfolio op NL_SWR-grondslag.
      // NL_SWR ≈ 0,0284 (2026) → benodigd ≈ 1.267.605.
      const oldRequired = yearlyExpenses / NL_SWR          // ≈ 1.267.605
      const oldFreedomPct = (netWorth / oldRequired) * 100 // 1.150k/1.268M ≈ 90,7%
      // CANONIEK: FIRE-eligible (huis uitgesloten) ÷ dezelfde noemer.
      const fireEligibleNetWorth = 624_000                 // belegd + cash, huis eruit
      const canonicalFreedomPct = (fireEligibleNetWorth / oldRequired) * 100 // ≈ 49,2%

      // Sanity: de twee grondslagen verschillen substantieel (anders zegt de case niets).
      assertGreaterThanOrEqual(oldFreedomPct, 75, `oude grondslag duwt naar ≥75% (was ${oldFreedomPct.toFixed(1)}%)`)
      assertLessThan(canonicalFreedomPct, 75, `canonieke grondslag blijft <75% (${canonicalFreedomPct.toFixed(1)}%)`)

      const oldLevel = computeSovereigntyLevel(netWorth, monthlyExpenses, oldFreedomPct, false)
      const canonicalLevel = computeSovereigntyLevel(netWorth, monthlyExpenses, canonicalFreedomPct, false)

      // De fix: het niveau dat de loader vaststelt = het canonieke, lagere.
      assertEqual(oldLevel, 5, 'oude grondslag → level 5 (75–100% freedom)')
      assertEqual(canonicalLevel, 4, 'canonieke grondslag → level 4 (25–75% freedom)')
      assertLessThan(canonicalLevel, oldLevel, 'canoniek niveau is strikt lager dan de oude vol-vermogen-som')
    },
  },

  // ── Runway-grondslag: buffer/noodfonds op de LIQUIDE pot, niet vol vermogen ──
  // Regressie voor de kaart "Dashboard telt gedeeld bezit overal even zwaar":
  // de buffer/noodfonds-tiers (1/3/6 maanden) rekenen sinds deze fix op de
  // inclusion-gewogen liquide pot (5e arg `runwayNetWorth`), niet op het totale
  // netto vermogen. Een huiseigenaar met veel vastgeklonken overwaarde maar
  // weinig spaargeld zakt zo naar het niveau dat zijn ECHTE buffer rechtvaardigt.
  {
    id: 'sov-runway-liquide-pot-niet-volvermogen',
    name: 'Sovereignty-buffer volgt liquide pot, niet totaal netto vermogen (huiseigenaar)',
    category: CAT,
    description:
      'Huiseigenaar met €140k netto (grotendeels overwaarde) maar €15k liquide: buffer = 5 mnd (level 2), niet 46 mnd op vol vermogen. Het niveau MOET de liquide pot volgen.',
    priority: 'critical',
    estimatedDurationMs: 5,
    fn() {
      const netWorth = 140_000        // incl. (gewogen) overwaarde
      const liquidPot = 15_000        // spaar + cash, inclusion-gewogen
      const monthlyExpenses = 3_000
      const freedomPct = 30           // momentum-territorium op vrijheid

      // OUD (4 args → runwayNetWorth = netWorth): 46 mnd buffer + 30% → level 4.
      const oldLevel = computeSovereigntyLevel(netWorth, monthlyExpenses, freedomPct, false)
      assertEqual(oldLevel, 4, 'oude vol-vermogen-grondslag → level 4')

      // NIEUW: buffer op liquide pot (5 mnd) haalt de 6-mnd-tier niet → level 2,
      // ondanks 30% vrijheid.
      const newLevel = computeSovereigntyLevel(netWorth, monthlyExpenses, freedomPct, false, liquidPot)
      assertEqual(newLevel, 2, 'liquide-pot-grondslag → level 2')
      assertLessThan(newLevel, oldLevel, 'liquide-pot-niveau is strikt lager dan vol-vermogen')

      // Teken van netto vermogen blijft bepalend voor herstel, ongeacht liquide pot.
      assertEqual(computeSovereigntyLevel(-5_000, monthlyExpenses, 0, true, 30_000), -2, 'negatief vermogen → recovery, ondanks buffer')
    },
  },

  // ── Edge cases ─────────────────────────────────────────────────────────────
  {
    id: 'sov-edge-zero-expenses',
    name: 'Edge case: nul maandelijkse uitgaven',
    category: CAT,
    description: 'monthlyExpenses <= 0 retourneert level 0',
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      assertEqual(computeSovereigntyLevel(100000, 0, 50, false), 0, 'zero expenses')
      assertEqual(computeSovereigntyLevel(100000, -100, 50, false), 0, 'negative expenses')
    },
  },

  {
    id: 'sov-level-to-phase-coverage',
    name: 'Alle levels mappen naar een geldige fase',
    category: CAT,
    description: 'Levels -2 t/m 6 mappen elk naar een bekende fase',
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      const validPhases = PHASES.map(p => p.id)
      for (let level = -2; level <= 6; level++) {
        const phase = levelToPhaseId(level)
        assert(validPhases.includes(phase), `level ${level} → fase ${phase} is geldig`)
      }
      // Recovery: -2, -1, 0
      assertEqual(levelToPhaseId(-2), 'recovery', 'level -2 → recovery')
      assertEqual(levelToPhaseId(-1), 'recovery', 'level -1 → recovery')
      assertEqual(levelToPhaseId(0), 'recovery', 'level 0 → recovery')
      // Stability: 1, 2
      assertEqual(levelToPhaseId(1), 'stability', 'level 1 → stability')
      assertEqual(levelToPhaseId(2), 'stability', 'level 2 → stability')
      // Momentum: 3, 4
      assertEqual(levelToPhaseId(3), 'momentum', 'level 3 → momentum')
      assertEqual(levelToPhaseId(4), 'momentum', 'level 4 → momentum')
      // Mastery: 5, 6
      assertEqual(levelToPhaseId(5), 'mastery', 'level 5 → mastery')
      assertEqual(levelToPhaseId(6), 'mastery', 'level 6 → mastery')
    },
  },
]

export function register(): void {
  registerTests(tests)
}
