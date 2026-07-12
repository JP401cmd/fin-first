import { describe, it, expect } from 'vitest'
import { buildCoverageStrip, coveragePctForRow, spendablePortfolio } from './coverage-strip'
import type { UnifiedProjectionRow } from '../unified-projection'
import { NL_SWR } from '../constants'
import type { Asset, AssetType } from '../asset-data'
import type { Debt, DebtType } from '../debt-data'
import { buildKernelInputFromApp, type KernelAdapterPartner, type KernelAdapterProfile } from '../horizon-kernel/adapter'
import { solveFire } from '../horizon-kernel'
import { buildKernelSlotMeta, kernelToUnifiedResult, type KernelBridgeContext } from '../horizon-kernel/bridge'

/** Minimale synthetische rij — alleen de velden die buildCoverageStrip leest. */
function mkRow(p: Partial<UnifiedProjectionRow> & { age: number; phase: UnifiedProjectionRow['phase'] }): UnifiedProjectionRow {
  return p as unknown as UnifiedProjectionRow
}

describe('buildCoverageStrip', () => {
  it('accumulatie-jaren zijn 100% (groen)', () => {
    const rows = [40, 45, 50].map(age => mkRow({ age, phase: 'accumulation' }))
    const nodes = buildCoverageStrip(rows, { sampleEveryYears: 5 })
    expect(nodes.every(n => n.coveragePct === 100 && n.status === 'green')).toBe(true)
  })

  it('brug leunt op VEILIGE onttrekking (SWR×belegbaar); huis + feitelijke withdrawal tellen niet', () => {
    const spendable = 200_000
    const totaalNeed = 40_000
    const rows: UnifiedProjectionRow[] = [
      mkRow({ age: 60, phase: 'accumulation' }),
      // Brug: geen AOW/pensioen; huis (600k) telt NIET mee, belegbaar 200k.
      // Feitelijke withdrawal is hoog (95k) maar mag de dekking NIET opblazen.
      mkRow({
        age: 64,
        phase: 'transition',
        withdrawal: 95_000,
        withdrawalNeed: { totaalNeed } as UnifiedProjectionRow['withdrawalNeed'],
        grossIncomeBySource: { salaris: 0, gebeurtenisBaten: 0 },
        assetBuckets: { investment: { endValue: spendable }, eigen_huis: { endValue: 600_000 } } as unknown as UnifiedProjectionRow['assetBuckets'],
      }),
      // Post-AOW + verzilverd vermogen: vaste inkomsten dekken bijna alles → ~100% groen.
      mkRow({
        age: 70,
        phase: 'withdrawal',
        withdrawal: 5_000,
        withdrawalNeed: { totaalNeed } as UnifiedProjectionRow['withdrawalNeed'],
        grossIncomeBySource: { salaris: 0, gebeurtenisBaten: 38_000 },
        assetBuckets: { investment: { endValue: 900_000 } } as unknown as UnifiedProjectionRow['assetBuckets'],
      }),
    ]
    const nodes = buildCoverageStrip(rows, { sampleEveryYears: 5 })
    const brug = nodes.find(n => n.age === 64)!
    const post = nodes.find(n => n.age === 70)!
    const verwachtBrug = Math.round((Math.min(NL_SWR * spendable, totaalNeed) / totaalNeed) * 100)
    expect(brug.coveragePct).toBe(verwachtBrug)
    expect(brug.coveragePct).toBeLessThan(100) // interen → onder 100, niet 200%+
    expect(post.coveragePct).toBeGreaterThanOrEqual(100)
    expect(post.coveragePct).toBeLessThanOrEqual(105)
    expect(brug.coveragePct).toBeLessThan(post.coveragePct)
  })

  it('de eigen woning telt niet als belegbaar vermogen (brug-krapte)', () => {
    const nodes = buildCoverageStrip([
      mkRow({ age: 60, phase: 'accumulation' }),
      mkRow({
        age: 64,
        phase: 'transition',
        withdrawal: 0,
        withdrawalNeed: { totaalNeed: 40_000 } as UnifiedProjectionRow['withdrawalNeed'],
        grossIncomeBySource: { salaris: 0, gebeurtenisBaten: 0 },
        assetBuckets: { eigen_huis: { endValue: 1_000_000 } } as unknown as UnifiedProjectionRow['assetBuckets'],
      }),
    ])
    const brug = nodes.find(n => n.age === 64)!
    expect(brug.coveragePct).toBe(0) // geen inkomen én huis telt niet → geen dekking
    expect(brug.status).toBe('red')
  })

  it('fase-overgangsleeftijden komen altijd voor als knoop', () => {
    const rows: UnifiedProjectionRow[] = [
      mkRow({ age: 61, phase: 'accumulation' }),
      mkRow({ age: 63, phase: 'transition', withdrawal: 20_000, withdrawalNeed: { totaalNeed: 40_000 } as UnifiedProjectionRow['withdrawalNeed'], grossIncomeBySource: { salaris: 0, gebeurtenisBaten: 0 } }),
      mkRow({ age: 67, phase: 'withdrawal', withdrawal: 10_000, withdrawalNeed: { totaalNeed: 40_000 } as UnifiedProjectionRow['withdrawalNeed'], grossIncomeBySource: { salaris: 0, gebeurtenisBaten: 30_000 } }),
    ]
    const ages = buildCoverageStrip(rows).map(n => n.age)
    expect(ages).toContain(63) // brug begint
    expect(ages).toContain(67) // AOW-instap
  })
})

// ── BUG: partnerinkomen dubbel gecrediteerd (coveragePctForRow) ─────────────
//
// `withdrawalNeed.totaalNeed` is al partner-NETTO (ont.ts trekt PT!K/partnerTotaal
// af vóór de MAX(0,·)-clamp — geëxposed als `partnerBijdrage`), terwijl
// `grossIncomeBySource.salaris` (CF!D) diezelfde partnerbijdrage OPNIEUW bevat.
// De huidige `coveragePctForRow` telt `vasteInkomsten` (incl. partner) op tegen de
// reeds-genette `totaalNeed` → dekking overschat zodra `partnerBijdrage > 0`.
//
// Correcte semantiek: dekking = (vasteInkomsten + min(NL_SWR×belegbaar, restNeed))
// ÷ brutoNeed × 100, met brutoNeed = totaalNeed + partnerBijdrage en restNeed =
// max(0, brutoNeed − vasteInkomsten). Bij partnerBijdrage=0 reduceert dit exact
// tot de huidige formule (non-regressie).
describe('coveragePctForRow — partnerinkomen mag maar ÉÉN keer tellen', () => {
  /** De eerlijke bruto-formule, berekend uit de rij zélf (fixer-onafhankelijk). */
  function verwachteDekking(row: UnifiedProjectionRow): number {
    const wn = row.withdrawalNeed!
    const salaris = row.grossIncomeBySource?.salaris ?? 0
    const gebeurtenisBaten = row.grossIncomeBySource?.gebeurtenisBaten ?? 0
    const vasteInkomsten = salaris + gebeurtenisBaten
    const brutoNeed = wn.totaalNeed + wn.partnerBijdrage
    const restNeed = Math.max(0, brutoNeed - vasteInkomsten)
    const veiligeOnttrekking = Math.min(NL_SWR * spendablePortfolio(row), restNeed)
    return Math.round(((vasteInkomsten + veiligeOnttrekking) / brutoNeed) * 100)
  }

  it('synthetische kerncase — bruto behoefte 40k, partner 15k (totaalNeed=25k al genet), belegbaar 50k → dekking volgens bruto-formule, NIET de dubbel-gecrediteerde huidige uitkomst', () => {
    const spendable = 50_000
    const totaalNeed = 25_000 // al partner-netto (bruto 40k − partnerBijdrage 15k)
    const partnerBijdrage = 15_000
    const row = mkRow({
      age: 65,
      phase: 'withdrawal',
      withdrawalNeed: {
        uitgaveTerm: totaalNeed,
        huurNaVerkoop: 0,
        vervallenHypotheeklast: 0,
        box3: 0,
        partnerBijdrage,
        totaalNeed,
        restMaandClamp: 0,
        nietGedekt: 0,
      } as UnifiedProjectionRow['withdrawalNeed'],
      // De partner is de enige "vaste inkomsten"-bron in dit jaar (CF!D bevat
      // dezelfde partnerbijdrage die Ont!D er al vanaf trok).
      grossIncomeBySource: { salaris: partnerBijdrage, gebeurtenisBaten: 0 },
      assetBuckets: { investment: { endValue: spendable } } as unknown as UnifiedProjectionRow['assetBuckets'],
    })

    const verwacht = verwachteDekking(row)
    // Expliciete controle-som: bruto-behoefte 40k, restNeed 25k, veilige onttrekking
    // min(NL_SWR×50k, 25k), coverage = (15k + veilig)/40k×100 — altijd lager dan de
    // huidige (dubbel-gecrediteerde) uitkomst die op de al-genette 25k deelt.
    expect(verwacht).toBeLessThan(Math.round(((partnerBijdrage + Math.min(NL_SWR * spendable, Math.max(0, totaalNeed - partnerBijdrage))) / totaalNeed) * 100))

    // ROOD verwacht: de huidige implementatie deelt door de al-genette totaalNeed
    // en credit dus de partner-euro's een tweede keer.
    expect(coveragePctForRow(row)).toBe(verwacht)
  })

  it('non-regressie — partnerBijdrage=0 blijft identiek aan de huidige (al groene) formule', () => {
    const spendable = 50_000
    const totaalNeed = 25_000
    const row = mkRow({
      age: 65,
      phase: 'withdrawal',
      withdrawalNeed: {
        uitgaveTerm: totaalNeed,
        huurNaVerkoop: 0,
        vervallenHypotheeklast: 0,
        box3: 0,
        partnerBijdrage: 0,
        totaalNeed,
        restMaandClamp: 0,
        nietGedekt: 0,
      } as UnifiedProjectionRow['withdrawalNeed'],
      grossIncomeBySource: { salaris: 0, gebeurtenisBaten: 0 },
      assetBuckets: { investment: { endValue: spendable } } as unknown as UnifiedProjectionRow['assetBuckets'],
    })

    const verwacht = verwachteDekking(row)
    expect(coveragePctForRow(row)).toBe(verwacht) // partnerBijdrage=0 → bruto === huidig, dit hoort al groen te zijn
  })

  // ── Bridge-representatieve case: echte partner-fixture door de kernel/bridge ──
  //
  // Huishouden-run (buildKernelInputFromApp met partner-blok) → solveFire →
  // kernelToUnifiedResult (dezelfde bridge die de app gebruikt). Primair is al
  // FIRE (groot vermogen, geen eigen inkomen), partner werkt door tot de eigen
  // AOW-leeftijd (fallback 67) — dus jarenlang overlap waarin de partner-
  // bijdrage zowel in CF!D (salaris) als afgetrokken in Ont!D zit.
  function makeAsset(p: Partial<Asset> & { id: string; asset_type: AssetType; current_value: number }): Asset {
    return {
      user_id: 'u', name: p.asset_type, purchase_value: 0, purchase_date: null, expected_return: 5,
      monthly_contribution: 0, institution: null, account_number: null, notes: null, is_active: true,
      sort_order: 0, created_at: '2026-01-01', updated_at: '2026-01-01', subtype: null, risk_profile: null,
      tax_benefit: null, is_liquid: null, lock_end_date: null, ticker_symbol: null, rental_income: null,
      woz_value: null, retirement_provider_type: null, depreciation_rate: null, address_postcode: null,
      address_house_number: null, expiry_date: null, beneficiary: null, kvk_number: null,
      ownership_percentage: null, annual_dividend: null, linked_asset_id: null, ownership: 'personal',
      household_id: null, net_worth_inclusion_pct: 100, has_budget_tracking: false, has_holdings_tracking: false,
      has_woonbalans_tracking: false, has_rental_tracking: false, monthly_maintenance_cost: 0, vva_fee: 0,
      vacancy_log: [], ...p,
    }
  }

  function makeDebt(p: Partial<Debt> & { id: string; debt_type: DebtType; current_balance: number }): Debt {
    return {
      user_id: 'u', name: p.debt_type, original_amount: p.current_balance ?? 0, interest_rate: 3,
      minimum_payment: 0, monthly_payment: 0, start_date: '2020-01-01', end_date: null, creditor: null,
      notes: null, is_active: true, sort_order: 0, created_at: '2026-01-01', updated_at: '2026-01-01',
      subtype: null, is_tax_deductible: null, fixed_rate_end_date: null, nhg: null, linked_asset_id: null,
      credit_limit: null, repayment_type: 'annuiteit', draagkrachtmeting_date: null, tax_year: null,
      has_payment_plan: false, has_written_agreement: false, ownership: 'personal', household_id: null,
      partner_split_pct: null, net_worth_inclusion_pct: 100, include_aflossing_in_savings: false,
      custom_aflossing_amount: null, has_hypotheekplanner_tracking: false, ...p,
    }
  }

  /**
   * Bescheiden vermogen (géén overfunding) zodat de veilige-onttrekkings-clamp
   * (NL_SWR×belegbaar) daadwerkelijk BINDT — anders saturaeert coverage altijd op
   * 100% ongeacht bruto/netto-noemer (de clamp vult dan exact op tot de gevraagde
   * teller, wat de bug onzichtbaar maakt). Zelfde vorm als bridge.test.ts's
   * synthetische profiel, bewust NIET overgefinancierd.
   */
  function pinnedProfile(over: Partial<KernelAdapterProfile> = {}): KernelAdapterProfile {
    return {
      date_of_birth: `${new Date().getFullYear() - 58}-01-01`,
      net_monthly_income: 0,
      estimated_monthly_expenses: 3_500,
      expected_return: 0.05,
      inflation_rate: 0.02,
      box3_method: 'forfaitair',
      fire_end_strategy: 'deplete',
      fire_end_age: 90,
      ...over,
    }
  }

  function partnerProfile(over: Partial<KernelAdapterProfile> = {}): KernelAdapterProfile {
    return pinnedProfile({
      date_of_birth: `${new Date().getFullYear() - 50}-01-01`, // 8 jaar jonger, werkt door tot eigen AOW
      net_monthly_income: 2_200,
      estimated_monthly_expenses: 0,
      ...over,
    })
  }

  it('bridge-representatief — echt huishouden (kernel/bridge) met werkende partner: dekking volgt de bruto-semantiek, niet de huidige dubbel-creditering', () => {
    const assets: Asset[] = [
      makeAsset({ id: 'sav', asset_type: 'savings', current_value: 40_000 }),
      makeAsset({ id: 'etf', asset_type: 'investment', current_value: 220_000, expected_return: 6 }),
    ]
    const debts: Debt[] = [makeDebt({ id: 'loan', debt_type: 'personal_loan', current_balance: 5_000, interest_rate: 5, monthly_payment: 150 })]
    const partner: KernelAdapterPartner = { profile: partnerProfile() }

    const input = buildKernelInputFromApp({ profile: pinnedProfile(), assets, debts, partner })
    const { assetSlotMeta, debtSlotMeta } = buildKernelSlotMeta(assets, debts, new Set())
    const ctx: KernelBridgeContext = { input, yearlyExpenses: 3_500 * 12, assetSlotMeta, debtSlotMeta }
    const solve = solveFire(input)
    const result = kernelToUnifiedResult(solve, ctx)

    // Eerste post-FIRE rij met partnerbijdrage>0 waar de SWR-clamp ook echt bindt
    // (veiligeOnttrekking < restNeed) — anders saturaeert coverage triviaal op 100%.
    const row = result.rows.find((r) => {
      if (r.phase === 'accumulation' || r.withdrawalNeed === undefined) return false
      const wn = r.withdrawalNeed
      if (wn.totaalNeed <= 0 || wn.partnerBijdrage <= 0) return false
      const vasteInkomsten = (r.grossIncomeBySource?.salaris ?? 0) + (r.grossIncomeBySource?.gebeurtenisBaten ?? 0)
      const restNeed = Math.max(0, wn.totaalNeed - vasteInkomsten)
      return NL_SWR * spendablePortfolio(r) < restNeed
    })
    expect(row, 'deze fixture moet minstens één krappe post-FIRE-brugrij met partnerbijdrage>0 opleveren').toBeDefined()

    const verwacht = verwachteDekking(row!)
    expect(coveragePctForRow(row!)).toBe(verwacht)
  })
})
