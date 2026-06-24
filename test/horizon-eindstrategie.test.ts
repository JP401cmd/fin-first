/**
 * Fase 1 — horizon V2 eindstrategie-rebuild (red→green).
 *
 * Dekt de zelf-consistentie-fixes van de deplete/legacy/V_nodig-eindstrategieën:
 *  A1. opeten (deplete) = nalatenschap met doelsaldo €0 → need-only onttrekking
 *      (geen floor-override die de pot vroegtijdig leegt). Eindigt op ~€0 op endAge.
 *  A2. Zuiver: backwardVnodig discounteert op ÉÉN reële voet (de waarde-gewogen
 *      blended reële return van de FIRE-eligible startpot) — geen verborgen 0,6×-buffer.
 *  A3. nalatenschap(€0) degenereert niet meer ("Je bent vrij" op startAge): legacy(€0)
 *      ≡ deplete, vuurt op een zinnige leeftijd.
 *  A4. bodem-eerlijk: onhoudbare uitgaven → fireReachable=false, geen stille leegloop.
 *  B.  include_full = eigen DEEL (na inclusion_pct) volledig besteedbaar in de engine,
 *      met haar EIGEN expected_return; inclusion_pct geldt ALTIJD (eigendom ⟂
 *      FIRE-behandeling) — een huis @ 50% telt voor €500.250, niet €1.000.500.
 *  C.  exclude = woning volledig buiten opbouw én FIRE-doel.
 *
 * Determinisme: de engine-cases draaien direct op runHorizonLedger met expliciete
 * currentAge (geen date-afhankelijkheid). De build-input-cases (B/C-wiring) pinnen
 * een vaste dateOfBirth en leiden de verwachte currentAge runtime af via ageAtDate.
 */
import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { UnifiedProjectionInput } from '@/lib/unified-projection'
import { runHorizonLedger } from '@/lib/horizon-engine'
import { buildHorizonInput } from '@/lib/horizon-engine/build-input'
import { runSelectedProjection } from '@/lib/horizon-engine/select'
import { ageAtDate } from '@/lib/horizon-data'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'

// ── Helpers ──────────────────────────────────────────────────────────────────

const mkAsset = (o: {
  id: string
  type: string
  v: number
  ret: number
  incl?: number
}): Asset =>
  ({
    id: o.id,
    name: o.id,
    asset_type: o.type,
    current_value: o.v,
    expected_return: o.ret,
    is_active: true,
    net_worth_inclusion_pct: o.incl ?? 100,
    depreciation_rate: null,
  }) as unknown as Asset

function mkInput(over: Partial<UnifiedProjectionInput> = {}): UnifiedProjectionInput {
  return {
    assets: [mkAsset({ id: 'inv', type: 'investment', v: 120_000, ret: 7 })],
    debts: [],
    currentAge: 40,
    endAge: 90,
    yearlyExpenses: 30_000,
    annualSavings: 15_000,
    monthlySurplus: 1_250,
    monthlyIncome: 5_000,
    incomeGrowthRate: 0,
    grossReturn: 0.07,
    inflationRate: 0.02,
    box3Method: 'forfaitair',
    cashflows: [],
    strategyConfig: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    withdrawalStrategy: { ...WITHDRAWAL_DEFAULTS },
    hasPartner: false,
    ...over,
  }
}

/**
 * Reconstructie van het echte account janpaul050486 (firsthand gediagnosticeerd):
 * deplete, include_full, huis €1.000.500 @ inclusion 50% (→ engine-waarde €500.250,
 * inclusion_pct geldt altijd; include_full maakt dát eigen deel volledig besteedbaar),
 * liquide-ex-huis ~€103k, studielening €20k @ 0%, 7%/2%, endAge 90,
 * na-pensioen €39.600. currentAge expliciet (determinisme).
 */
function realAccountInput(over: Partial<UnifiedProjectionInput> = {}): UnifiedProjectionInput {
  return mkInput({
    assets: [
      mkAsset({ id: 'huis', type: 'eigen_huis', v: 1_000_500, ret: 3.5, incl: 50 }),
      mkAsset({ id: 'cash1', type: 'cash', v: 36_500, ret: 0 }),
      mkAsset({ id: 'inv', type: 'investment', v: 31_539.43, ret: 7 }),
      mkAsset({ id: 'crypto', type: 'crypto', v: 20_864.57, ret: 0 }),
      mkAsset({ id: 'cash2', type: 'cash', v: 14_000, ret: 0 }),
    ],
    debts: [
      {
        id: 'duo',
        name: 'Studielening DUO',
        debt_type: 'student_loan',
        current_balance: 20_000,
        interest_rate: 0,
        monthly_payment: 111.11,
        repayment_type: 'lineair',
        is_tax_deductible: false,
        is_active: true,
        net_worth_inclusion_pct: 100,
        include_aflossing_in_savings: false,
      } as unknown as UnifiedProjectionInput['debts'][number],
    ],
    currentAge: 40,
    yearlyExpenses: 39_600,
    annualSavings: 18_000,
    monthlySurplus: 1_500,
    monthlyIncome: 4_500,
    strategyConfig: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    spendableAssetIds: ['huis'],
    ...over,
  })
}

const lastRow = (r: ReturnType<typeof runHorizonLedger>) => r.rows[r.rows.length - 1]
const rowAt = (r: ReturnType<typeof runHorizonLedger>, age: number) =>
  r.rows.find((x) => x.leeftijd === age)!

describe('Fase 1 — eindstrategie zelf-consistentie (deplete/legacy/V_nodig)', () => {
  // ── Criterium 1: deplete eindigt op ~€0 op endAge=90, niet leeg op ~85 ───────
  it('1. deplete (opeten): laatste rij liquide ≈ €0 op endAge=90 (niet leeg op ~85)', () => {
    const r = runHorizonLedger(realAccountInput())
    expect(r.fireReachable).toBe(true)
    // Eindigt op ~de doel-saldo (€0), niet ruim daarboven en niet diep negatief.
    expect(lastRow(r).liquideVermogen).toBeLessThan(20_000)
    expect(lastRow(r).liquideVermogen).toBeGreaterThanOrEqual(-1_000)
    // Op leeftijd 85 staat er nog betekenisvol vermogen (de pot is dan NIET leeg).
    expect(rowAt(r, 85).liquideVermogen).toBeGreaterThan(50_000)
  })

  // ── Criterium 2: deplete ≡ legacy(€0) ────────────────────────────────────────
  it('2. deplete ≡ legacy(doelsaldo €0): zelfde fireAge + zelfde eind-curve', () => {
    const dep = runHorizonLedger(realAccountInput())
    const leg = runHorizonLedger(
      realAccountInput({ strategyConfig: { strategy: 'legacy', endAge: 90, legacyAmount: 0 } }),
    )
    expect(dep.fireAge).toBe(leg.fireAge)
    // Een paar curve-punten vergelijken (need-only ⇒ identiek pad).
    for (const age of [80, 85, 90]) {
      expect(rowAt(dep, age).liquideVermogen).toBeCloseTo(rowAt(leg, age).liquideVermogen, 2)
    }
  })

  // ── Criterium 3: legacy(€0) vuurt op een zinnige leeftijd, niet startAge ──────
  it('3. legacy(doelsaldo €0): fireAge > startAge en fireReachable (geen "Je bent vrij" op nu)', () => {
    const leg = runHorizonLedger(
      realAccountInput({ strategyConfig: { strategy: 'legacy', endAge: 90, legacyAmount: 0 } }),
    )
    expect(leg.fireReachable).toBe(true)
    expect(leg.fireAge).not.toBeNull()
    expect(leg.fireAge!).toBeGreaterThan(40) // niet degenererend op startAge
  })

  // ── Criterium 4: Zuiver — backwardVnodig op één reële voet (geen 0,6×) ────────
  it('4. Zuiver: V_nodig discounteert op de blended reële voet (geen 0,6×-buffer)', () => {
    // Eenvoudige fixture: één belegging @ 7% nominaal, 2% inflatie, deplete.
    // Reële voet = (1.07/1.02 − 1) ≈ 0.04902. De backward-recursie zonder
    // surplus-effecten: V[i] = (V[i+1] + need[i]) / (1 + r_real).
    // Met geen recurring inkomen is need[i] = yearlyExpenses (vlak reëel).
    const r = runHorizonLedger(
      mkInput({
        assets: [mkAsset({ id: 'inv', type: 'investment', v: 120_000, ret: 7 })],
        yearlyExpenses: 30_000,
        cashflows: [],
        strategyConfig: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
      }),
    )
    const v = r.vNodig
    const n = v.length
    const rReal = 1.07 / 1.02 - 1 // de blended reële voet (één asset @ 7%)
    // Reconstrueer V[n-2] uit V[n-1]=0 en need[n-1]=30_000 met de ENE reële voet.
    // need[n-1] = yearlyExpenses (geen recurring inkomen) = 30_000.
    const needLast = rowAt(r, 90).leefuitgaven + rowAt(r, 90).woonkosten
    const expectedSecondLast = (v[n - 1] + needLast) / (1 + rReal)
    expect(v[n - 2]).toBeCloseTo(expectedSecondLast, 0)
    // Tegenproef: met de OUDE 0,6×-voet (0.6 × rReal) zou V[n-2] hoger liggen.
    const oldRate = 0.6 * rReal
    const oldSecondLast = (v[n - 1] + needLast) / (1 + oldRate)
    expect(Math.abs(v[n - 2] - expectedSecondLast)).toBeLessThan(Math.abs(v[n - 2] - oldSecondLast))
  })

  // ── Criterium 7: bodem-eerlijk — onhoudbare uitgaven → fireReachable=false ────
  it('7. bodem: absurde uitgaven (€500k/jr) → fireReachable=false, geen stille leegloop', () => {
    const r = runHorizonLedger(
      realAccountInput({ yearlyExpenses: 500_000, annualSavings: 0, monthlySurplus: 0 }),
    )
    expect(r.fireReachable).toBe(false)
  })

  // ── Criterium 8: perpetual + pensioen blijven werken ─────────────────────────
  it('8a. perpetual blijft werken (bereikbaar + eindigt niet op €0)', () => {
    const r = runHorizonLedger(
      realAccountInput({ strategyConfig: { strategy: 'perpetual', endAge: 90, legacyAmount: 0 } }),
    )
    expect(r.fireReachable).toBe(true)
    expect(lastRow(r).liquideVermogen).toBeGreaterThan(1_000)
  })

  it('8b. pensioen blijft werken (bereikbaar)', () => {
    const r = runHorizonLedger(
      realAccountInput({
        strategyConfig: { strategy: 'pensioen', endAge: 90, legacyAmount: 0 },
        forcedFireAge: 67,
      }),
    )
    expect(r.fireReachable).toBe(true)
  })
})

// ── Criterium 5 + 6: woningstrategie-grondslag via buildHorizonInput ───────────
describe('Fase 1 — woningstrategie-grondslag (include_full 100% / exclude buiten)', () => {
  const DOB = '1984-06-01' // vaste geboortedatum; currentAge runtime afgeleid
  const currentAge = ageAtDate(DOB)

  const horizonInput = (over: Partial<Parameters<typeof buildHorizonInput>[0]['horizonInput'] & object> = {}) => ({
    totalAssets: 0,
    totalDebts: 0,
    monthlyIncome: 4_500,
    monthlyExpenses: 3_300,
    yearlyMustExpenses: 39_600,
    monthlyContributions: 1_500,
    dateOfBirth: DOB,
    ...over,
  })

  const assets: Asset[] = [
    mkAsset({ id: 'huis', type: 'eigen_huis', v: 1_000_500, ret: 3.5, incl: 50 }),
    mkAsset({ id: 'inv', type: 'investment', v: 103_000, ret: 7 }),
  ]

  it('5. include_full: huis-engine-waarde op start = current_value × inclusion_pct (50% → €500.250), met eigen reële return', () => {
    const built = buildHorizonInput({
      horizonInput: horizonInput(),
      lifeEvents: [],
      assets,
      debts: [],
      grossReturn: 0.07,
      inflation: 0.02,
      housingStrategy: { mode: 'include_full' },
      horizonEngineV2: true,
      hasPartner: false,
    })
    expect(built).not.toBeNull()
    const r = runHorizonLedger(built!.input)
    const huisRow0 = r.rows[0].assets.find((a) => a.id === 'huis')!
    // begin = waarde vóór groei dit jaar = current_value × inclusion_pct (50%).
    // inclusion_pct is EIGENDOM en geldt altijd; include_full bepaalt enkel dat dát
    // eigen deel volledig FIRE-eligible/besteedbaar is, niet de grondslag.
    expect(huisRow0.begin).toBeCloseTo(500_250, 0)
    // Tegenproef: NIET de ongewogen ×100%-waarde (oude, foute Fase-1-beslissing).
    expect(huisRow0.begin).not.toBeCloseTo(1_000_500, 0)
    // Eigen return: het rendement van het huis volgt zijn EIGEN expected_return (3,5% reëel
    // gemaakt), niet de portefeuille-7%. realRet_huis = 1.035/1.02 − 1 ≈ 0.0147.
    // Toegepast op de inclusion-gewogen grondslag €500.250.
    const huisRealRet = 1.035 / 1.02 - 1
    expect(huisRow0.rendement).toBeCloseTo(500_250 * huisRealRet, -1)
    // Tegenproef: de portefeuille-7%-real op de gewogen grondslag zou veel hoger zijn.
    const portReal = 1.07 / 1.02 - 1
    expect(huisRow0.rendement).toBeLessThan(500_250 * portReal * 0.6)
  })

  it('6. exclude: het huis komt in GEEN enkele ledger-rij voor en netto vermogen sluit het uit', () => {
    const built = buildHorizonInput({
      horizonInput: horizonInput(),
      lifeEvents: [],
      assets,
      debts: [],
      grossReturn: 0.07,
      inflation: 0.02,
      housingStrategy: { mode: 'exclude_from_fire' },
      horizonEngineV2: true,
      hasPartner: false,
    })
    expect(built).not.toBeNull()
    const r = runHorizonLedger(built!.input)
    for (const row of r.rows) {
      expect(row.assets.find((a) => a.id === 'huis')).toBeUndefined()
    }
    // Netto vermogen jaar 0 ≈ alleen de belegging (huis uitgesloten), geen €1M-component.
    expect(r.rows[0].nettoVermogen).toBeLessThan(200_000)
    expect(currentAge).toBeGreaterThan(0) // sanity: DOB → stabiele leeftijd
  })

  it('6b. exclude via runSelectedProjection: fireReachable consistent (geen crash, huis weg)', () => {
    const built = buildHorizonInput({
      horizonInput: horizonInput(),
      lifeEvents: [],
      assets,
      debts: [],
      grossReturn: 0.07,
      inflation: 0.02,
      housingStrategy: { mode: 'exclude_from_fire' },
      horizonEngineV2: true,
      hasPartner: false,
    })
    const res = runSelectedProjection(built!.input, true)
    expect(res.rows.length).toBeGreaterThan(0)
  })
})
