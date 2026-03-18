import { registerTests } from '../test-registry'
import {
  assertEqual, assertGreaterThan, assertGreaterThanOrEqual,
  assertLessThan, assertFinite, assert,
} from '../assert'
import type { TestCase } from '../test-types'
import {
  calculateBox3, BOX3_PARAMS,
  classifyAsset, classifyDebt,
} from '@/lib/box3-data'
import type { Box3Input, TaxYear } from '@/lib/box3-data'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import {
  NL_FICTIEF_BELEGGINGEN, BOX3_TARIEF, BOX3_DRAG,
} from '@/lib/constants'

const CAT = 'kern.belasting'

// ── Helper: minimal Asset stub ─────────────────────────────────────
function makeAsset(overrides: Partial<Asset> & { asset_type: Asset['asset_type']; current_value: number }): Asset {
  const { asset_type, current_value, ...rest } = overrides
  return {
    id: crypto.randomUUID(),
    user_id: 'test',
    name: 'Test Asset',
    asset_type,
    current_value,
    purchase_value: 0,
    purchase_date: null,
    expected_return: 0.07,
    monthly_contribution: 0,
    institution: null,
    account_number: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
    subtype: null,
    risk_profile: null,
    tax_benefit: null,
    is_liquid: null,
    lock_end_date: null,
    ticker_symbol: null,
    rental_income: null,
    woz_value: null,
    retirement_provider_type: null,
    depreciation_rate: null,
    address_postcode: null,
    address_house_number: null,
    expiry_date: null,
    beneficiary: null,
    kvk_number: null,
    ownership_percentage: null,
    annual_dividend: null,
    linked_asset_id: null,
    ownership: 'personal',
    household_id: null,
    net_worth_inclusion_pct: 100,
    has_budget_tracking: false,
    ...rest,
  }
}

function makeDebt(overrides: Partial<Debt> & { current_balance: number }): Debt {
  const { current_balance, ...rest } = overrides
  return {
    id: crypto.randomUUID(),
    user_id: 'test',
    name: 'Test Debt',
    debt_type: 'personal_loan',
    original_amount: current_balance,
    current_balance,
    interest_rate: 0.05,
    minimum_payment: 0,
    monthly_payment: 0,
    start_date: '2025-01-01',
    end_date: null,
    creditor: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
    subtype: null,
    is_tax_deductible: null,
    fixed_rate_end_date: null,
    nhg: null,
    linked_asset_id: null,
    credit_limit: null,
    repayment_type: null,
    draagkrachtmeting_date: null,
    tax_year: null,
    has_payment_plan: false,
    has_written_agreement: false,
    ownership: 'personal' as const,
    household_id: null,
    partner_split_pct: null,
    net_worth_inclusion_pct: 100,
    ...rest,
  }
}

function makeInput(overrides: Partial<Box3Input> = {}): Box3Input {
  return {
    assets: [],
    debts: [],
    hasPartner: false,
    dailyExpenses: 100,
    year: 2025 as TaxYear,
    ...overrides,
  }
}

const tests: TestCase[] = [
  // ── Step 1: Box 3 berekening met actuele tarieven ────────────────
  {
    id: 'box3-tarieven-constanten', name: 'Box 3: constanten NL_FICTIEF_BELEGGINGEN en BOX3_TARIEF', category: CAT,
    description: 'NL_FICTIEF_BELEGGINGEN = 5.88%, BOX3_TARIEF = 36%, BOX3_DRAG ≈ 2.117%',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      assertEqual(NL_FICTIEF_BELEGGINGEN, 0.0588, 'fictief rendement beleggingen')
      assertEqual(BOX3_TARIEF, 0.36, 'Box 3 tarief')
      // BOX3_DRAG = 0.0588 * 0.36 = 0.021168
      const expectedDrag = 0.0588 * 0.36
      assertEqual(BOX3_DRAG, expectedDrag, 'Box 3 drag = forfait × tarief')
    },
  },
  {
    id: 'box3-params-2025', name: 'Box 3: BOX3_PARAMS 2025 tarieven correct', category: CAT,
    description: 'Forfait spaargeld 1.37%, beleggingen 5.88%, schulden 2.70%, tarief 36%',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      const p = BOX3_PARAMS[2025]
      assertEqual(p.forfaitSpaargeld, 0.0137, 'forfait spaargeld 2025')
      assertEqual(p.forfaitBeleggingen, 0.0588, 'forfait beleggingen 2025')
      assertEqual(p.forfaitSchulden, 0.0270, 'forfait schulden 2025')
      assertEqual(p.tarief, 0.36, 'tarief 2025')
      assertEqual(p.heffingsvrijSingle, 57_684, 'vrijstelling single 2025')
      assertEqual(p.heffingsvrijPartner, 115_368, 'vrijstelling partner 2025')
    },
  },
  {
    id: 'box3-params-2026', name: 'Box 3: BOX3_PARAMS 2026 tarieven correct', category: CAT,
    description: 'Forfait spaargeld 1.28%, beleggingen 6.00%, tarief 36%, hogere vrijstelling',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      const p = BOX3_PARAMS[2026]
      assertEqual(p.forfaitSpaargeld, 0.0128, 'forfait spaargeld 2026')
      assertEqual(p.forfaitBeleggingen, 0.0600, 'forfait beleggingen 2026')
      assertEqual(p.tarief, 0.36, 'tarief 2026')
      assertEqual(p.heffingsvrijSingle, 59_357, 'vrijstelling single 2026')
      assertEqual(p.heffingsvrijPartner, 118_714, 'vrijstelling partner 2026')
    },
  },
  {
    id: 'box3-berekening-alleen-beleggingen', name: 'Box 3: berekening met alleen beleggingen', category: CAT,
    description: 'Alleen beleggingen boven vrijstelling → correcte belasting',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      const assets = [makeAsset({ asset_type: 'investment', current_value: 200_000 })]
      const result = calculateBox3(makeInput({ assets }))
      const p = BOX3_PARAMS[2025]

      assertEqual(result.totaalBeleggingen, 200_000, 'totaal beleggingen')
      assertEqual(result.totaalSpaargeld, 0, 'geen spaargeld')

      // rendementsgrondslag = 200_000 (geen schulden)
      assertEqual(result.rendementsgrondslag, 200_000, 'rendementsgrondslag')

      // heffingsvrijVermogen = 57_684 (single)
      assertEqual(result.heffingsvrijVermogen, 57_684, 'heffingsvrij vermogen')

      // grondslagSparen = 200_000 - 57_684 = 142_316
      assertEqual(result.grondslagSparen, 142_316, 'grondslag sparen')

      // forfaitairBeleggingen = 200_000 * 0.0588 = 11_760
      assertEqual(result.forfaitairBeleggingen, 200_000 * p.forfaitBeleggingen, 'forfaitair beleggingen')

      // effectiefRendement = 11_760 / 200_000 = 0.0588
      assertEqual(result.effectiefRendement, p.forfaitBeleggingen, 'effectief rendement = forfait beleggingen')

      // box3Income = 142_316 * 0.0588 = 8_368.1808
      const expectedIncome = 142_316 * p.forfaitBeleggingen
      assertEqual(result.box3Income, expectedIncome, 'box3 inkomen')

      // tax = box3Income * 0.36
      const expectedTax = expectedIncome * p.tarief
      assertEqual(result.tax, expectedTax, 'belasting')
      assertGreaterThan(result.tax, 0, 'belasting > 0')
    },
  },

  // ── Step 2: Vrijstelling ──────────────────────────────────────────
  {
    id: 'box3-onder-vrijstelling', name: 'Box 3: vermogen onder vrijstellingsgrens → geen belasting', category: CAT,
    description: 'Vermogen volledig onder heffingsvrij → tax = 0',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      // 50_000 < 57_684 → under threshold
      const assets = [makeAsset({ asset_type: 'investment', current_value: 50_000 })]
      const result = calculateBox3(makeInput({ assets }))
      assertEqual(result.grondslagSparen, 0, 'grondslag = 0 (onder vrijstelling)')
      assertEqual(result.box3Income, 0, 'geen box3 inkomen')
      assertEqual(result.tax, 0, 'geen belasting')
    },
  },
  {
    id: 'box3-net-boven-vrijstelling', name: 'Box 3: vermogen net boven vrijstellingsgrens', category: CAT,
    description: 'Vermogen 1 euro boven vrijstelling → minimale belasting',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      const p = BOX3_PARAMS[2025]
      const vermogen = p.heffingsvrijSingle + 1 // 57_685
      const assets = [makeAsset({ asset_type: 'investment', current_value: vermogen })]
      const result = calculateBox3(makeInput({ assets }))

      assertEqual(result.grondslagSparen, 1, 'grondslag = 1 euro')
      // effectief rendement = forfait beleggingen = 0.0588
      // box3Income = 1 * 0.0588 = 0.0588
      // tax = 0.0588 * 0.36 = 0.021168
      assertGreaterThan(result.tax, 0, 'minimale belasting > 0')
      assertLessThan(result.tax, 1, 'belasting < 1 euro')
    },
  },
  {
    id: 'box3-exact-vrijstelling', name: 'Box 3: vermogen exact op vrijstellingsgrens', category: CAT,
    description: 'Vermogen exact gelijk aan heffingsvrij → tax = 0',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const p = BOX3_PARAMS[2025]
      const assets = [makeAsset({ asset_type: 'investment', current_value: p.heffingsvrijSingle })]
      const result = calculateBox3(makeInput({ assets }))
      assertEqual(result.grondslagSparen, 0, 'grondslag = 0')
      assertEqual(result.tax, 0, 'geen belasting')
    },
  },

  // ── Step 3: Fiscaal partnerschap ──────────────────────────────────
  {
    id: 'box3-partner-dubbele-vrijstelling', name: 'Box 3: fiscaal partnerschap verdubbelt vrijstelling', category: CAT,
    description: 'Met partner: heffingsvrij = 2× single, lagere belasting',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      const assets = [makeAsset({ asset_type: 'investment', current_value: 200_000 })]
      const resultSingle = calculateBox3(makeInput({ assets }))
      const resultPartner = calculateBox3(makeInput({ assets, hasPartner: true }))

      assertEqual(resultPartner.heffingsvrijVermogen, 115_368, 'partner vrijstelling = 115_368')
      assertEqual(resultPartner.heffingsvrijVermogen, resultSingle.heffingsvrijVermogen * 2, 'dubbele vrijstelling')

      // Partner has higher exemption → lower taxable base → lower tax
      assertGreaterThan(resultSingle.tax, resultPartner.tax, 'single betaalt meer dan partner')
    },
  },
  {
    id: 'box3-partner-onder-dubbele-grens', name: 'Box 3: vermogen tussen single/partner vrijstelling', category: CAT,
    description: 'Vermogen boven single grens maar onder partner grens → 0 belasting met partner',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      // 80_000 > 57_684 (single) but < 115_368 (partner)
      const assets = [makeAsset({ asset_type: 'investment', current_value: 80_000 })]
      const resultSingle = calculateBox3(makeInput({ assets }))
      const resultPartner = calculateBox3(makeInput({ assets, hasPartner: true }))

      assertGreaterThan(resultSingle.tax, 0, 'single betaalt belasting')
      assertEqual(resultPartner.tax, 0, 'partner betaalt geen belasting')
    },
  },
  {
    id: 'box3-partner-schuldendrempel', name: 'Box 3: fiscaal partner dubbele schuldendrempel', category: CAT,
    description: 'Met partner: schuldendrempel = 7600 i.p.v. 3800',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const assets = [makeAsset({ asset_type: 'investment', current_value: 200_000 })]
      const debts = [makeDebt({ current_balance: 5_000 })]
      const resultSingle = calculateBox3(makeInput({ assets, debts }))
      const resultPartner = calculateBox3(makeInput({ assets, debts, hasPartner: true }))

      // Single: drempel 3800, aftrekbaar = 5000 - 3800 = 1200
      assertEqual(resultSingle.schuldendrempel, 3_800, 'single drempel')
      assertEqual(resultSingle.aftrekbareSchulden, 1_200, 'single aftrekbaar')

      // Partner: drempel 7600, aftrekbaar = max(0, 5000-7600) = 0
      assertEqual(resultPartner.schuldendrempel, 7_600, 'partner drempel')
      assertEqual(resultPartner.aftrekbareSchulden, 0, 'partner aftrekbaar = 0')
    },
  },

  // ── Step 4: Combinatie spaargeld + beleggingen ────────────────────
  {
    id: 'box3-gewogen-rendement', name: 'Box 3: gewogen fictief rendement spaargeld + beleggingen', category: CAT,
    description: 'Mix van spaargeld (1.37%) en beleggingen (5.88%) geeft gewogen effectief rendement',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      const p = BOX3_PARAMS[2025]
      const spaargeld = 100_000
      const beleggingen = 100_000
      const assets = [
        makeAsset({ asset_type: 'savings', current_value: spaargeld }),
        makeAsset({ asset_type: 'investment', current_value: beleggingen }),
      ]
      const result = calculateBox3(makeInput({ assets }))

      assertEqual(result.totaalSpaargeld, spaargeld, 'totaal spaargeld')
      assertEqual(result.totaalBeleggingen, beleggingen, 'totaal beleggingen')

      // forfaitairSpaargeld = 100_000 * 0.0137 = 1_370
      assertEqual(result.forfaitairSpaargeld, spaargeld * p.forfaitSpaargeld, 'forfaitair spaargeld')

      // forfaitairBeleggingen = 100_000 * 0.0588 = 5_880
      assertEqual(result.forfaitairBeleggingen, beleggingen * p.forfaitBeleggingen, 'forfaitair beleggingen')

      // voordeelUitSparen = 1_370 + 5_880 = 7_250
      const expectedVoordeel = (spaargeld * p.forfaitSpaargeld) + (beleggingen * p.forfaitBeleggingen)
      assertEqual(result.voordeelUitSparen, expectedVoordeel, 'voordeel uit sparen')

      // rendementsgrondslag = 200_000
      assertEqual(result.rendementsgrondslag, 200_000, 'rendementsgrondslag')

      // effectiefRendement = 7_250 / 200_000 = 0.03625
      const expectedRendement = expectedVoordeel / 200_000
      assertEqual(result.effectiefRendement, expectedRendement, 'gewogen effectief rendement')

      // Het gewogen rendement moet tussen spaar en beleggings forfait liggen
      assertGreaterThan(result.effectiefRendement, p.forfaitSpaargeld, 'hoger dan spaarforfait')
      assertLessThan(result.effectiefRendement, p.forfaitBeleggingen, 'lager dan beleggingsforfait')
    },
  },
  {
    id: 'box3-alleen-spaargeld', name: 'Box 3: alleen spaargeld (laag forfait)', category: CAT,
    description: 'Alleen spaargeld → effectief rendement = forfait spaargeld (1.37%)',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const p = BOX3_PARAMS[2025]
      const assets = [makeAsset({ asset_type: 'savings', current_value: 200_000 })]
      const result = calculateBox3(makeInput({ assets }))

      assertEqual(result.effectiefRendement, p.forfaitSpaargeld, 'effectief = spaarforfait')
      // Lagere belasting dan bij zelfde bedrag in beleggingen
      const belegResult = calculateBox3(makeInput({
        assets: [makeAsset({ asset_type: 'investment', current_value: 200_000 })],
      }))
      assertLessThan(result.tax, belegResult.tax, 'spaargeld betaalt minder belasting')
    },
  },
  {
    id: 'box3-overwegend-spaargeld', name: 'Box 3: 80% spaargeld, 20% beleggingen', category: CAT,
    description: 'Overwegend spaargeld drukt effectief rendement naar beneden',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const p = BOX3_PARAMS[2025]
      const assets = [
        makeAsset({ asset_type: 'savings', current_value: 160_000 }),
        makeAsset({ asset_type: 'investment', current_value: 40_000 }),
      ]
      const result = calculateBox3(makeInput({ assets }))

      // Gewogen: (160K * 0.0137 + 40K * 0.0588) / 200K
      const expectedRendement = (160_000 * p.forfaitSpaargeld + 40_000 * p.forfaitBeleggingen) / 200_000
      assertEqual(result.effectiefRendement, expectedRendement, 'gewogen rendement 80/20')

      // Dichter bij spaarforfait dan beleggingsforfait
      const distToSpaar = Math.abs(result.effectiefRendement - p.forfaitSpaargeld)
      const distToBelegging = Math.abs(result.effectiefRendement - p.forfaitBeleggingen)
      assertLessThan(distToSpaar, distToBelegging, 'dichter bij spaarforfait')
    },
  },
  {
    id: 'box3-classificatie-uitgesloten', name: 'Box 3: eigen woning en pensioen uitgesloten', category: CAT,
    description: 'Eigen woning (Box 1) en pensioen met fiscaal voordeel niet in Box 3',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const eigenhuis = classifyAsset(makeAsset({ asset_type: 'eigen_huis', current_value: 400_000 }))
      assertEqual(eigenhuis.category, null, 'eigen woning niet in Box 3')
      assert(eigenhuis.exclusionReason !== null, 'eigen woning heeft exclusion reason')

      const pensioen = classifyAsset(makeAsset({ asset_type: 'retirement', current_value: 100_000, tax_benefit: true }))
      assertEqual(pensioen.category, null, 'pensioen fiscaal voordeel niet in Box 3')

      // Pensioen zonder fiscaal voordeel WEL in Box 3
      const pensioenZonder = classifyAsset(makeAsset({ asset_type: 'retirement', current_value: 100_000, tax_benefit: false }))
      assertEqual(pensioenZonder.category, 'beleggingen', 'pensioen zonder voordeel = beleggingen')
    },
  },
  {
    id: 'box3-classificatie-cash-savings', name: 'Box 3: cash en savings als spaargeld', category: CAT,
    description: 'Cash en savings worden als spaargeld geclassificeerd (laag forfait)',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const cash = classifyAsset(makeAsset({ asset_type: 'cash', current_value: 10_000 }))
      assertEqual(cash.category, 'spaargeld', 'cash = spaargeld')

      const savings = classifyAsset(makeAsset({ asset_type: 'savings', current_value: 10_000 }))
      assertEqual(savings.category, 'spaargeld', 'savings = spaargeld')
    },
  },
  {
    id: 'box3-nul-vermogen', name: 'Box 3: geen vermogen → nul belasting', category: CAT,
    description: 'Zonder assets → alle waarden 0',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const result = calculateBox3(makeInput())
      assertEqual(result.totaalSpaargeld, 0, 'geen spaargeld')
      assertEqual(result.totaalBeleggingen, 0, 'geen beleggingen')
      assertEqual(result.rendementsgrondslag, 0, 'geen grondslag')
      assertEqual(result.tax, 0, 'geen belasting')
      assertEqual(result.effectiefRendement, 0, 'geen rendement')
      assertFinite(result.tax, 'finite belasting')
    },
  },
  {
    id: 'box3-inactieve-assets', name: 'Box 3: inactieve assets worden genegeerd', category: CAT,
    description: 'Alleen is_active assets tellen mee in de berekening',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const assets = [
        makeAsset({ asset_type: 'investment', current_value: 200_000, is_active: true }),
        makeAsset({ asset_type: 'investment', current_value: 500_000, is_active: false }),
      ]
      const result = calculateBox3(makeInput({ assets }))
      assertEqual(result.totaalBeleggingen, 200_000, 'alleen actieve assets meegeteld')
    },
  },
  {
    id: 'box3-freedom-days', name: 'Box 3: freedomDays berekening', category: CAT,
    description: 'freedomDays = tax / dailyExpenses, afgerond',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const assets = [makeAsset({ asset_type: 'investment', current_value: 300_000 })]
      const result = calculateBox3(makeInput({ assets, dailyExpenses: 100 }))

      assertGreaterThan(result.tax, 0, 'er is belasting')
      assertEqual(result.freedomDays, Math.round(result.tax / 100), 'freedomDays correct')
      assertEqual(result.dailyExpenses, 100, 'dailyExpenses doorgegeven')
    },
  },
]

export function register(): void {
  registerTests(tests)
}
