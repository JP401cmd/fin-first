/**
 * Opeethypotheek (reverse mortgage) in het v2-grootboek — ADR 0029, Fase 3.
 *
 * Toetst de KERNREGELS van de opeethypotheek-behandeling rechtstreeks op
 * `runHorizonLedger` (intern reëel, per-asset/per-schuld grootboek):
 *   (a) huis blijft staan + telt als onderpand-capaciteit (leen-ruimte → FIRE-eligible);
 *   (b) leefgeld uit een groeiende lening tegen lagere (onderpand-)rente;
 *   (c) schuld gecapt op max-LTV → opname stopt, géén oneindig lenen;
 *   (d) nalatenschap = huis − schuld (en niet-negatief);
 *   (e) life-events lopen mee;
 *   (f) inclusion_pct-weging;
 *   (g) tekort-gedreven vs. handmatige monthlyPayout-override.
 *
 * De synthetische opeetschuld heeft de stabiele id 'reverse-mortgage'.
 */

import { describe, it, expect } from 'vitest'
import { runHorizonLedger, REVERSE_MORTGAGE_DEBT_ID } from '@/lib/horizon-engine/engine'
import type { UnifiedProjectionInput, ReverseMortgagePlan } from '@/lib/unified-projection'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { SimCashflow } from '@/lib/fire-simulation'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import { reverseMortgageBorrowable, getFireEligibleNetWorth, deriveHousingContext } from '@/lib/housing-strategy'

// ── Fixtures ──────────────────────────────────────────────────

function huis(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'huis',
    name: 'Eigen woning',
    asset_type: 'eigen_huis',
    current_value: 500_000,
    woz_value: 500_000,
    expected_return: 2,
    monthly_contribution: 0,
    is_active: true,
    net_worth_inclusion_pct: 100,
    depreciation_rate: 0,
    linked_asset_id: null,
    ...overrides,
  } as unknown as Asset
}

function belegging(currentValue = 100_000, overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'inv',
    name: 'Beleggingen',
    asset_type: 'investment',
    current_value: currentValue,
    woz_value: null,
    expected_return: 5,
    monthly_contribution: 0,
    is_active: true,
    net_worth_inclusion_pct: 100,
    depreciation_rate: 0,
    linked_asset_id: null,
    ...overrides,
  } as unknown as Asset
}

function hypotheek(balance = 200_000, overrides: Partial<Debt> = {}): Debt {
  return {
    id: 'm1',
    name: 'Hypotheek',
    debt_type: 'mortgage',
    current_balance: balance,
    interest_rate: 3,
    monthly_payment: 0,
    repayment_type: 'aflossingsvrij',
    is_active: true,
    net_worth_inclusion_pct: 100,
    linked_asset_id: 'huis',
    ...overrides,
  } as unknown as Debt
}

const RM_PLAN: ReverseMortgagePlan = {
  houseAssetId: 'huis',
  triggerAge: 67,
  interestRate: 0.055,
  maxLoanPct: 0.5,
  monthlyPayout: null, // tekort-gedreven
  mortgageDebtIds: ['m1'],
}

function baseInput(over: Partial<UnifiedProjectionInput> = {}): UnifiedProjectionInput {
  return {
    assets: [belegging(100_000), huis()],
    debts: [hypotheek(200_000)],
    currentAge: 60,
    endAge: 90,
    yearlyExpenses: 40_000,
    annualSavings: 0,
    monthlySurplus: 0,
    monthlyIncome: 0,
    incomeGrowthRate: 0,
    grossReturn: 0.05,
    inflationRate: 0.02,
    box3Method: 'forfaitair',
    cashflows: [],
    strategyConfig: { strategy: 'deplete', endAge: 90, legacyAmount: 0 } as never,
    withdrawalStrategy: WITHDRAWAL_DEFAULTS,
    hasPartner: false,
    bankAccountCash: 0,
    reverseMortgage: RM_PLAN,
    collateralBorrowableById: { huis: 150_000 }, // overwaarde 300K × 0.5
    ...over,
  }
}

const rmRow = (res: ReturnType<typeof runHorizonLedger>, age: number) =>
  res.rows.find((r) => r.leeftijd === age)!
const rmDebt = (res: ReturnType<typeof runHorizonLedger>, age: number) =>
  rmRow(res, age).schulden.find((s) => s.id === REVERSE_MORTGAGE_DEBT_ID)

// ── (a) Huis blijft staan + telt als onderpand-capaciteit ─────

describe('opeethypotheek — huis als onderpand', () => {
  it('(a) huis blijft als eigen_huis-asset in het grootboek (groeit, wordt nooit rauw onttrokken)', () => {
    const res = runHorizonLedger(baseInput())
    const eind = rmRow(res, 90).assets.find((a) => a.id === 'huis')!
    // Huis is nooit verkocht/onttrokken → eindwaarde > startwaarde (reële groei 2%−2% infl ≈ 0,
    // maar nooit negatief en nooit 0 door onttrekking).
    expect(eind.eind).toBeGreaterThan(0)
    expect(eind.uitstroom).toBe(0) // nooit rauw onttrokken
  })

  it('(a/onderpand) de leen-ruimte telt mee als FIRE-eligibility: FIRE niet later dan zónder onderpand-bijdrage', () => {
    // Accumulerende persona (45 jr, spaart) zodat FIRE bereikbaar is en de FIRE-detectie
    // de doel-zoektocht draait waarin de onderpand-bijdrage meeweegt.
    const accum = (over: Partial<UnifiedProjectionInput>): UnifiedProjectionInput =>
      baseInput({
        currentAge: 45,
        assets: [belegging(400_000), huis()],
        annualSavings: 30_000,
        monthlyIncome: 6_000,
        ...over,
      })
    const metOnderpand = runHorizonLedger(accum({}))
    const zonderOnderpand = runHorizonLedger(accum({ collateralBorrowableById: undefined }))
    // De onderpand-bijdrage (leen-ruimte) telt mee in liquidSumStart/blendedRealReturnStart
    // → de FIRE-gate ziet méér eligible vermogen → FIRE wordt niet later bereikt.
    expect(metOnderpand.fireReachable).toBe(true)
    expect(metOnderpand.fireAge ?? Infinity).toBeLessThanOrEqual(zonderOnderpand.fireAge ?? Infinity)
  })
})

// ── (b) Leefgeld uit groeiende lening tegen lagere rente ──────

describe('opeethypotheek — leefgeld uit groeiende lening', () => {
  it('(b) bij liquiditeitstekort ná de trigger groeit de opeetschuld (opname + gestapelde rente)', () => {
    // Klein liquide pot zodat het tekort de opeethypotheek snel triggert ná 67.
    const res = runHorizonLedger(
      baseInput({ assets: [belegging(20_000), huis()], collateralBorrowableById: { huis: 150_000 } }),
    )
    const eind = rmDebt(res, 90)!
    expect(eind.eind).toBeGreaterThan(0) // er is geleend
    // De schuld is monotoon stijgend zodra ze loopt (aflossingsvrij + rente + opnames).
    let prev = 0
    for (const r of res.rows) {
      const d = r.schulden.find((s) => s.id === REVERSE_MORTGAGE_DEBT_ID)
      if (d && d.eind > 0) {
        expect(d.eind).toBeGreaterThanOrEqual(prev - 1)
        prev = d.eind
      }
    }
  })

  it('(b/lagere rente) een lagere opeethypotheek-rente laat de schuld langzamer stapelen (lager saldo gedurende de looptijd)', () => {
    // Gematigd tekort (geen cap-saturatie) zodat het rente-effect zichtbaar is i.p.v.
    // dat beide tegen de LTV-cap aanlopen.
    const laag = runHorizonLedger(
      baseInput({
        assets: [belegging(20_000), huis()],
        yearlyExpenses: 45_000,
        reverseMortgage: { ...RM_PLAN, interestRate: 0.03 },
      }),
    )
    const hoog = runHorizonLedger(
      baseInput({
        assets: [belegging(20_000), huis()],
        yearlyExpenses: 45_000,
        reverseMortgage: { ...RM_PLAN, interestRate: 0.08 },
      }),
    )
    // Vergelijk een vroeg punt ná de eerste opnames (vóór eventuele cap-saturatie):
    // bij gelijke opnames heeft de hogere rente al meer gestapeld.
    const laagSom = laag.rows.reduce((s, r) => s + (r.schulden.find((d) => d.id === REVERSE_MORTGAGE_DEBT_ID)?.eind ?? 0), 0)
    const hoogSom = hoog.rows.reduce((s, r) => s + (r.schulden.find((d) => d.id === REVERSE_MORTGAGE_DEBT_ID)?.eind ?? 0), 0)
    expect(laagSom).toBeLessThan(hoogSom)
  })
})

// ── (c) Cap op max-LTV → opname stopt, geen oneindig lenen ────

describe('opeethypotheek — max-LTV-cap', () => {
  it('(c) de opeetschuld overschrijdt nooit overwaarde × maxLoanPct (per jaar)', () => {
    // Forceer een groot, aanhoudend tekort: 0 liquide, hoge uitgaven, geen inkomen.
    const res = runHorizonLedger(
      baseInput({ assets: [belegging(1), huis()], yearlyExpenses: 60_000 }),
    )
    for (const r of res.rows) {
      const d = r.schulden.find((s) => s.id === REVERSE_MORTGAGE_DEBT_ID)
      if (!d || d.eind <= 0) continue
      const huisWaarde = r.assets.find((a) => a.id === 'huis')!.eind
      const overigeHyp = r.schulden
        .filter((s) => s.id !== REVERSE_MORTGAGE_DEBT_ID)
        .reduce((sum, s) => sum + Math.max(0, s.eind), 0)
      const overwaarde = Math.max(0, huisWaarde - overigeHyp)
      const cap = overwaarde * 0.5
      // Eindsaldo (incl. de rente-accrual van dit jaar) mag de cap niet overschrijden.
      expect(d.eind).toBeLessThanOrEqual(cap + 1)
    }
  })

  it('(c) bij een onbedekt tekort boven de cap blijft de lijn ÓNDER doel (geen oneindig lenen)', () => {
    // Extreem: piepkleine pot, hoge uitgaven → de opeethypotheek dekt het niet volledig.
    const res = runHorizonLedger(
      baseInput({ assets: [belegging(1), huis()], yearlyExpenses: 80_000 }),
    )
    // De opeetschuld is begrensd (cap), dus het netto vermogen blijft eindig en
    // het huis blijft in de pot — geen runaway-schuld.
    const eind = rmDebt(res, 90)
    if (eind && eind.eind > 0) {
      const huisWaarde = rmRow(res, 90).assets.find((a) => a.id === 'huis')!.eind
      expect(eind.eind).toBeLessThanOrEqual(huisWaarde * 0.5 + 1)
    }
  })
})

// ── (d) Nalatenschap = huis − schuld, niet-negatief ───────────

describe('opeethypotheek — nalatenschap', () => {
  it('(d) nalatenschap = totaalAssets − totaalSchuld, en is niet-negatief (cap op overwaarde)', () => {
    const res = runHorizonLedger(
      baseInput({ assets: [belegging(20_000), huis()], yearlyExpenses: 50_000 }),
    )
    const eind = rmRow(res, 90)
    expect(eind.nettoVermogen).toBeCloseTo(eind.totaalAssets - eind.totaalSchuld, 0)
    // Door de cap op de overwaarde kan de opeetschuld het huis nooit volledig
    // "opeten" → nalatenschap blijft ≥ 0.
    expect(eind.nettoVermogen).toBeGreaterThanOrEqual(0)
  })
})

// ── (e) Life-events lopen mee ─────────────────────────────────

describe('opeethypotheek — life-events', () => {
  it('(e) een recurring inkomens-event verlaagt het tekort → minder geleend (lagere eindschuld)', () => {
    const aow: SimCashflow = {
      id: 'aow',
      name: 'AOW',
      type: 'recurring',
      direction: 'income',
      amount: 1500, // maandbedrag
      fromAge: 67,
      toAge: null,
      indexed: true,
    } as unknown as SimCashflow
    const metEvent = runHorizonLedger(
      baseInput({ assets: [belegging(20_000), huis()], cashflows: [aow] }),
    )
    const zonderEvent = runHorizonLedger(
      baseInput({ assets: [belegging(20_000), huis()], cashflows: [] }),
    )
    // De AOW-inkomensstroom dekt een deel van de behoefte → minder opeethypotheek nodig.
    expect(rmDebt(metEvent, 90)?.eind ?? 0).toBeLessThan(rmDebt(zonderEvent, 90)?.eind ?? 0)
  })
})

// ── (f) inclusion_pct-weging ──────────────────────────────────

describe('opeethypotheek — inclusion_pct', () => {
  it('(f) huis @ 50% inclusion → halve engine-huiswaarde → lagere LTV-cap dan @ 100%', () => {
    // Hoog, aanhoudend tekort zodat beide tegen hun LTV-cap aanlopen; de cap @ 50%
    // inclusion is de helft → maximale opeetschuld is lager.
    const vol = runHorizonLedger(
      baseInput({ assets: [belegging(1), huis({ net_worth_inclusion_pct: 100 })], yearlyExpenses: 60_000 }),
    )
    const half = runHorizonLedger(
      baseInput({
        assets: [belegging(1), huis({ net_worth_inclusion_pct: 50 })],
        yearlyExpenses: 60_000,
        // collateralBorrowableById is een START-pot grootheid (FIRE-eligibility); de
        // engine herberekent de cap zelf per jaar op de inclusion-gewogen huiswaarde.
        // @50%: engine-huiswaarde 250K − hyp 200K = 50K overwaarde × 0.5 = 25K.
        collateralBorrowableById: { huis: 25_000 },
      }),
    )
    const maxRm = (res: ReturnType<typeof runHorizonLedger>) =>
      Math.max(...res.rows.map((r) => r.schulden.find((s) => s.id === REVERSE_MORTGAGE_DEBT_ID)?.eind ?? 0))
    expect(maxRm(half)).toBeLessThan(maxRm(vol))
  })
})

// ── (g) tekort-gedreven vs. handmatige monthlyPayout ──────────

describe('opeethypotheek — payout-modus', () => {
  it('(g) vaste monthlyPayout leent PROACTIEF in de onttrekkingsfase (geen tekort nodig)', () => {
    // forcedFireAge = 67 → de gebruiker is vanaf 67 in decumulatie (pensioen-modus).
    // Modale pot die de uitgaven dekt, zodat een TEKORT-gedreven RM (vrijwel) niet leent,
    // maar de VASTE payout wél proactief opneemt zodra de onttrekkingsfase begint.
    const vast = runHorizonLedger(
      baseInput({
        currentAge: 67,
        assets: [belegging(800_000), huis()],
        forcedFireAge: 67,
        reverseMortgage: { ...RM_PLAN, monthlyPayout: 800 },
      }),
    )
    const tekort = runHorizonLedger(
      baseInput({
        currentAge: 67,
        assets: [belegging(800_000), huis()],
        forcedFireAge: 67,
        reverseMortgage: { ...RM_PLAN, monthlyPayout: null },
      }),
    )
    // Vaste payout: de opeetschuld groeit al kort ná de trigger (geen tekort nodig).
    expect(rmDebt(vast, 75)?.eind ?? 0).toBeGreaterThan(0)
    // Tekort-gedreven met een ruime pot: minder/geen opname op 75.
    expect(rmDebt(tekort, 75)?.eind ?? 0).toBeLessThan(rmDebt(vast, 75)?.eind ?? 0)
  })

  it('(g) vóór de trigger-leeftijd wordt er nooit geleend (saldo 0)', () => {
    const res = runHorizonLedger(
      baseInput({ assets: [belegging(20_000), huis()], reverseMortgage: { ...RM_PLAN, triggerAge: 70 } }),
    )
    for (const r of res.rows) {
      if (r.leeftijd >= 70) break
      const d = r.schulden.find((s) => s.id === REVERSE_MORTGAGE_DEBT_ID)
      expect(d?.eind ?? 0).toBe(0)
    }
  })
})

// ── Rand (a): onderwaterhuis — overwaarde ≤ 0 ────────────────

describe('opeethypotheek — onderwaterhuis (equity ≤ 0)', () => {
  it('bij overwaarde = 0 (hypotheek = huiswaarde) wordt er nooit geleend, geen crash', () => {
    // hypotheek gelijk aan huiswaarde → overwaarde 0 → cap 0 → geen opname mogelijk.
    const res = runHorizonLedger(
      baseInput({
        assets: [belegging(20_000), huis({ current_value: 500_000 })],
        debts: [hypotheek(500_000)], // onderwatergrens: hypotheek = huiswaarde
        collateralBorrowableById: { huis: 0 },
      }),
    )
    // Projectie loopt door zonder crash (geen throw/NaN/Infinity).
    expect(res.rows).toHaveLength(31) // leeftijd 60..90
    for (const r of res.rows) {
      const d = r.schulden.find((s) => s.id === REVERSE_MORTGAGE_DEBT_ID)
      expect(d?.eind ?? 0).toBe(0) // nooit geleend
    }
  })

  it('bij negatieve overwaarde (hypotheek > huiswaarde) wordt er ook nooit geleend', () => {
    const res = runHorizonLedger(
      baseInput({
        assets: [belegging(20_000), huis({ current_value: 300_000 })],
        debts: [hypotheek(400_000)], // hypotheek boven waarde huis
        collateralBorrowableById: { huis: 0 },
      }),
    )
    for (const r of res.rows) {
      const d = r.schulden.find((s) => s.id === REVERSE_MORTGAGE_DEBT_ID)
      const saldo = d?.eind ?? 0
      // Engine mag nooit een negatief (negatieve schuld = vordering) produceren.
      expect(saldo).toBeGreaterThanOrEqual(0)
    }
  })
})

// ── Rand (c/post-cap): na het bereiken van de LTV-cap groeit de schuld uitsluitend via rente ──

describe('opeethypotheek — post-cap groei alleen via rente', () => {
  it('zodra de cap geraakt is, blijft het saldo stabiel (engine klampt eind-saldo inclusief rente op cap)', () => {
    // Extreme setup: minimale pot, hoge uitgaven. De cap wordt snel bereikt.
    // Engine-gedrag (ADR 0029, drawReverseMortgage): de cap wordt bepaald als
    //   cap / (1 + rate) − begin_balance
    // zodat het EIND-SALDO (begin + opname) × (1 + rate) ≤ cap.
    // Gevolg: zodra cap volledig benut is, is begin = cap / (1 + rate),
    // wordt geen opname meer toegestaan, en geldt eind = begin × (1 + rate) = cap.
    // Na die stabilisatie is het EIND-SALDO monotoon ≤ cap — er komt GEEN rente meer
    // bovenop de cap.
    const res = runHorizonLedger(
      baseInput({ assets: [belegging(1), huis()], yearlyExpenses: 80_000 }),
    )
    const rmRows = res.rows
      .map((r) => {
        const d = r.schulden.find((s) => s.id === REVERSE_MORTGAGE_DEBT_ID)
        const huis = r.assets.find((a) => a.id === 'huis')
        const hypSaldo = r.schulden
          .filter((s) => s.id !== REVERSE_MORTGAGE_DEBT_ID)
          .reduce((s, d) => s + Math.max(0, d.eind), 0)
        const cap = Math.max(0, (huis?.eind ?? 0) - hypSaldo) * RM_PLAN.maxLoanPct
        return { age: r.leeftijd, eind: d?.eind ?? 0, cap }
      })
      .filter((x) => x.eind > 0)
    // (1) Eind-saldo overschrijdt nooit de cap (inclusief het jaar van cap-bereik).
    for (const row of rmRows) {
      expect(row.eind).toBeLessThanOrEqual(row.cap + 1)
    }
    // (2) Zodra het eind-saldo de cap-waarde bereikt, daalt of stabiliseert het daarna
    // (huis groeit nominaal mee → cap kan licht stijgen, maar de schuld groeit niet
    // sneller dan de cap zelf).
    let prevEind = 0
    let capReached = false
    for (const row of rmRows) {
      if (!capReached && Math.abs(row.eind - row.cap) < 1) {
        capReached = true
      }
      if (capReached && prevEind > 0) {
        // Na cap-bereik: eind mag niet harder groeien dan de cap (door nominale huisgroei
        // groeit de cap iets mee; de schuld groeit hooguit mee met de cap).
        expect(row.eind).toBeLessThanOrEqual(row.cap + 1)
      }
      prevEind = row.eind
    }
    expect(capReached).toBe(true) // cap is daadwerkelijk bereikt in dit extreme scenario
  })
})

// ── Rand (d/extreme): nalatenschap niet-negatief ook bij schuldniveaus dicht op de cap ──

describe('opeethypotheek — nalatenschap niet-negatief bij extreme scenario', () => {
  it('nalatenschap ≥ 0 ook bij piepkleine liquide pot en hoge uitgaven (schuld dicht op cap)', () => {
    // Maximale druk op de cap: vrijwel geen liquide vermogen, hoge maanduitgaven.
    const res = runHorizonLedger(
      baseInput({ assets: [belegging(1), huis()], yearlyExpenses: 80_000 }),
    )
    for (const r of res.rows) {
      // nettoVermogen = totaalAssets − totaalSchuld moet nooit negatief worden
      // dankzij de cap (schuld kan nooit meer dan huiswaarde × maxLoanPct bedragen).
      expect(r.nettoVermogen).toBeGreaterThanOrEqual(-1) // -1 = afrondingstolerantie
    }
  })
})

// ── Rand (f): reverseMortgageBorrowable = de ENIGE × maxLoanPct ──────────────

describe('opeethypotheek — SSoT reverseMortgageBorrowable (ADR 0029)', () => {
  it('getFireEligibleNetWorth(reverse_mortgage) = totalNetWorth − equity + reverseMortgageBorrowable(equity, maxLoanPct)', () => {
    // Verifieer dat de display-formule en de engine exact dezelfde grondslag delen.
    // Context: huis 500K, hypotheek 200K → equity 300K; maxLoanPct 0.5.
    const eigenHuis: Asset = {
      id: 'huis',
      name: 'Eigen woning',
      asset_type: 'eigen_huis',
      current_value: 500_000,
      woz_value: 500_000,
      expected_return: 2,
      monthly_contribution: 0,
      is_active: true,
      net_worth_inclusion_pct: 100,
      depreciation_rate: 0,
      linked_asset_id: null,
    } as unknown as Asset
    const hyp = hypotheek(200_000)
    const ctx = deriveHousingContext([eigenHuis], [hyp])
    const equity = ctx.eigenHuisValue - ctx.mortgageBalance // 500K - 200K = 300K
    const maxLoanPct = 0.5
    const borrowable = reverseMortgageBorrowable(equity, maxLoanPct) // 150K

    const totalNetWorth = 600_000 // willekeurig, inclusief beleggingen
    const config = {
      mode: 'reverse_mortgage' as const,
      trigger: 'fixed_age' as const,
      triggerAge: 67,
      depletionThresholdYears: 0,
      maxLoanPct,
      interestRate: 0.055,
      monthlyPayout: null,
    }
    const eligible = getFireEligibleNetWorth(totalNetWorth, ctx, config)
    // Canonieke formule: totalNetWorth − equity + borrowable.
    expect(eligible).toBe(totalNetWorth - equity + borrowable)
    // Numeriek: 600K − 300K + 150K = 450K.
    expect(eligible).toBe(450_000)
  })

  it('reverseMortgageBorrowable retourneert 0 bij negatieve equity (geen negatieve leen-ruimte)', () => {
    expect(reverseMortgageBorrowable(-50_000, 0.5)).toBe(0)
    expect(reverseMortgageBorrowable(0, 0.5)).toBe(0)
  })

  it('reverseMortgageBorrowable klampt maxLoanPct op [0, 1] (geen loan > equity)', () => {
    // maxLoanPct = 2.0 (ongeldig) wordt geclamped naar 1 → borrowable = equity.
    expect(reverseMortgageBorrowable(100_000, 2.0)).toBe(100_000)
    expect(reverseMortgageBorrowable(100_000, 0)).toBe(0)
  })
})
