/**
 * Horizon-kernel adapter — event-laag eigenschaps-tests (FASE 3, snede 2).
 *
 * Buiten het Excel-parity-domein: geen fixtures. We asserteren de invariante
 * mapping-eigenschappen per event-type (bedragen/richting/postconventie), de
 * pensioen-slot-mapping, de AOW-params en — als harde eis (plan §9) — de
 * DUBBELTELLING-GUARD: met alle vier strategieën actief bevat de kern-invoer elke
 * afgeleide stroom precies één keer, en `solveFire` is byte-identiek mét/zónder de
 * (visueel) herhaalde beheerde events. Plus een rooktest op gemengde events.
 */

import { describe, it, expect } from 'vitest'
import type { Asset, AssetType } from '@/lib/asset-data'
import type { Debt, DebtType } from '@/lib/debt-data'
import { nibudChildrenCost, type LifeEvent, type UserDefinedCashflow } from '@/lib/horizon-data'
import { solveFire, type SolveFireResult } from '../index'
import {
  buildEventInputs,
  buildKernelInputFromApp,
  buildKernelInputFromAppWithNotices,
  partitionEvents,
  expanderFor,
  type EventMappingContext,
  type KernelAdapterProfile,
} from './index'

// ── Factories ──────────────────────────────────────────────────────────────────────

function makeEvent(p: Partial<LifeEvent> & { id: string; event_type: string }): LifeEvent {
  return {
    name: p.event_type,
    target_age: 50,
    target_date: null,
    one_time_cost: 0,
    monthly_cost_change: 0,
    monthly_income_change: 0,
    duration_months: 0,
    icon: '',
    is_active: true,
    sort_order: 0,
    is_indexed: true,
    metadata: {},
    ...p,
  }
}

/** Standaard mapping-context: startleeftijd 45, inflatie 2% (onafhankelijk van "vandaag"). */
const CTX: EventMappingContext = { startLeeftijd: 45, inflatie: 0.02 }

// ── Guard: partitie + expanderFor + dedup ────────────────────────────────────────────

describe('guard — partitionEvents/expanderFor', () => {
  it('classificeert elk expander-type + houdt vrije events apart', () => {
    const aow = makeEvent({ id: 'aow', event_type: 'aow' })
    const pension = makeEvent({ id: 'pen', event_type: 'pension' })
    const werk = makeEvent({ id: 'werk', event_type: 'werk' })
    const huis = makeEvent({ id: 'housing-strategy:sale', event_type: 'house_sale' })
    const kind = makeEvent({ id: 'kind', event_type: 'children' })
    const erf = makeEvent({ id: 'erf', event_type: 'inheritance' })
    const vrij1 = makeEvent({ id: 'sab', event_type: 'sabbatical' })

    const { strategieGestuurd, vrij } = partitionEvents([aow, pension, werk, huis, kind, erf, vrij1])
    expect(strategieGestuurd.map((e) => e.id)).toEqual(['aow', 'pen', 'werk', 'housing-strategy:sale', 'kind', 'erf'])
    expect(vrij.map((e) => e.id)).toEqual(['sab'])
  })

  it('expanderFor mapt de zes beheerde soorten en null voor vrij', () => {
    expect(expanderFor({ id: 'a', event_type: 'aow' })).toBe('aow')
    expect(expanderFor({ id: 'p', event_type: 'pension' })).toBe('pensioen')
    expect(expanderFor({ id: 'w', event_type: 'werk' })).toBe('werk')
    // Virtueel huis-event: id-prefix wint, ongeacht event_type.
    expect(expanderFor({ id: 'housing-strategy:x', event_type: 'whatever' })).toBe('huis')
    expect(expanderFor({ id: 'c', event_type: 'children' })).toBe('kinderen')
    expect(expanderFor({ id: 'i', event_type: 'inheritance' })).toBe('erfenis')
    expect(expanderFor({ id: 's', event_type: 'sabbatical' })).toBeNull()
  })

  it('dedupliceert op id (visuele herhaling telt één keer)', () => {
    const ev = makeEvent({ id: 'dup', event_type: 'aankopen', target_age: 50, one_time_cost: 1000 })
    const { gebeurtenissen } = buildEventInputs([ev, ev], CTX)
    expect(gebeurtenissen).toHaveLength(1)
  })
})

// ── AOW → AutoGebeurtenisParams ──────────────────────────────────────────────────────

describe('events — AOW', () => {
  it('samenwonend + jaren-buiten-NL → leefsituatie + opbouwjaren', () => {
    const aow = makeEvent({
      id: 'aow',
      event_type: 'aow',
      target_age: 67,
      metadata: { leefsituatie: 'samenwonend', jarenBuitenNL: 10 },
    })
    const { autoGebeurtenissen } = buildEventInputs([aow], CTX)
    expect(autoGebeurtenissen.leefsituatie).toBe('Samenwonend')
    expect(autoGebeurtenissen.aowOpbouwjaren).toBe(40) // 50 − 10
  })

  it('geen metadata → alleenstaand + volle opbouw', () => {
    const aow = makeEvent({ id: 'aow', event_type: 'aow', target_age: 67 })
    const { autoGebeurtenissen } = buildEventInputs([aow], CTX)
    expect(autoGebeurtenissen.leefsituatie).toBe('Alleenstaand')
    expect(autoGebeurtenissen.aowOpbouwjaren).toBe(50)
  })

  it('geen AOW-event → inert (opbouwjaren 0 = geen AOW)', () => {
    const { autoGebeurtenissen } = buildEventInputs([], CTX)
    expect(autoGebeurtenissen.aowOpbouwjaren).toBe(0)
  })
})

// ── Pensioen → PensioenPot[] ─────────────────────────────────────────────────────────

describe('events — pensioen-multipot', () => {
  it('inleg-modus (tijdelijke oudedagslijfrente) → pot-slot met Excel-type', () => {
    const p = makeEvent({
      id: 'p',
      event_type: 'pension',
      target_age: 67,
      metadata: {
        pensioenType: 'tijdelijke_oudedagslijfrente',
        inlegBedrag: 120_000,
        ingangLeeftijd: 68,
        uitkeringsduur: '10',
        isGeindexeerd: true,
      },
    })
    const [pot] = buildEventInputs([p], CTX).autoGebeurtenissen.pensioenPotten
    expect(pot.slot).toBe(0)
    expect(pot.type).toBe('lijfrente_tijdelijk')
    expect(pot.invoermodus).toBe('pot')
    expect(pot.inlegPot).toBe(120_000)
    expect(pot.brutoPerMaand).toBeNull()
    expect(pot.ingangsLeeftijd).toBe(68)
    expect(pot.duurJaarInvoer).toBe(10)
    expect(pot.geindexeerd).toBe('Ja')
    expect(pot.partnerUitkeringPct).toBeNull() // alleen bij levenslang
    expect(pot.naam).toBeTruthy()
  })

  it('direct-bruto-modus (bedrijfspensioen zonder inleg) → invoermodus bruto', () => {
    const p = makeEvent({
      id: 'p',
      event_type: 'pension',
      target_age: 67,
      metadata: { pensioenType: 'bedrijf', brutoBedrag: 1500, ingangLeeftijd: 67 },
    })
    const [pot] = buildEventInputs([p], CTX).autoGebeurtenissen.pensioenPotten
    expect(pot.type).toBe('bedrijf')
    expect(pot.invoermodus).toBe('bruto')
    expect(pot.brutoPerMaand).toBe(1500)
    expect(pot.inlegPot).toBeNull()
  })

  it('levenslange lijfrente draagt de partner-uitkering door', () => {
    const p = makeEvent({
      id: 'p',
      event_type: 'pension',
      target_age: 67,
      metadata: { pensioenType: 'lijfrente_levenslang', inlegBedrag: 100_000, partnerUitkeringPct: 70 },
    })
    const [pot] = buildEventInputs([p], CTX).autoGebeurtenissen.pensioenPotten
    expect(pot.type).toBe('lijfrente_levenslang')
    expect(pot.partnerUitkeringPct).toBe(70)
  })

  it('meer dan 6 pensioenen → 6 slots + overflow-melding', () => {
    const events = Array.from({ length: 7 }, (_, i) =>
      makeEvent({ id: `p${i}`, event_type: 'pension', target_age: 67, metadata: { pensioenType: 'bedrijf', brutoBedrag: 100 } }),
    )
    const { autoGebeurtenissen, notices } = buildEventInputs(events, CTX)
    expect(autoGebeurtenissen.pensioenPotten).toHaveLength(6)
    expect(autoGebeurtenissen.pensioenPotten.map((p) => p.slot)).toEqual([0, 1, 2, 3, 4, 5])
    expect(notices.some((n) => n.kind === 'overflow' && /pensioen/.test(n.message))).toBe(true)
  })
})

// ── Kinderen → NIBUD-params ──────────────────────────────────────────────────────────

describe('events — kinderen', () => {
  it('count + geboorteleeftijden + per-kind-basis (uit app-totalen)', () => {
    const kids = makeEvent({
      id: 'k',
      event_type: 'children',
      target_age: 35,
      metadata: { aantalKinderen: 2, kinderopvangDagen: 3, kinderbijslag: true, babyuitzet: 1500 },
    })
    const { autoGebeurtenissen } = buildEventInputs([kids], CTX)
    expect(autoGebeurtenissen.aantalKinderen).toBe(2)
    expect(autoGebeurtenissen.kindGeboorteLeeftijden).toEqual([35, 35, 0])
    expect(autoGebeurtenissen.nibudBasisPerMaand).toBe(Math.round(nibudChildrenCost(2) / 2))
    expect(autoGebeurtenissen.babyuitzetEenmalig).toBe(1500)
    expect(autoGebeurtenissen.kinderopvangNettoPerMaand).toBeGreaterThan(0)
  })

  it('meer dan 3 kinderen → gecapt op 3 + overflow-melding', () => {
    const kids = makeEvent({ id: 'k', event_type: 'children', target_age: 35, metadata: { aantalKinderen: 5 } })
    const { autoGebeurtenissen, notices } = buildEventInputs([kids], CTX)
    expect(autoGebeurtenissen.aantalKinderen).toBe(3)
    expect(notices.some((n) => n.kind === 'overflow' && /kinderen/.test(n.message))).toBe(true)
  })
})

// ── Erfenis → erfenis-params ─────────────────────────────────────────────────────────

describe('events — erfenis', () => {
  it('bruto/relatie/leeftijd doorgegeven (kern doet de netting, V16)', () => {
    const inh = makeEvent({
      id: 'i',
      event_type: 'inheritance',
      target_age: 70,
      metadata: { brutoBedrag: 200_000, erfbelastingSchijf: 'kind' },
    })
    const { autoGebeurtenissen } = buildEventInputs([inh], CTX)
    expect(autoGebeurtenissen.erfenisBruto).toBe(200_000)
    expect(autoGebeurtenissen.erfenisRelatie).toBe('kind')
    expect(autoGebeurtenissen.erfenisLeeftijd).toBe(70)
  })

  it('meerdere erfenissen → eerste-met-leeftijd + melding', () => {
    const a = makeEvent({ id: 'i1', event_type: 'inheritance', target_age: 70, metadata: { brutoBedrag: 100_000, erfbelastingSchijf: 'kind' } })
    const b = makeEvent({ id: 'i2', event_type: 'inheritance', target_age: 80, metadata: { brutoBedrag: 50_000, erfbelastingSchijf: 'overig' } })
    const { autoGebeurtenissen, notices } = buildEventInputs([a, b], CTX)
    expect(autoGebeurtenissen.erfenisBruto).toBe(100_000)
    expect(notices.some((n) => n.kind === 'info' && /erfenis/.test(n.message))).toBe(true)
  })
})

// ── Werk → WerkStrategieParams ───────────────────────────────────────────────────────

describe('events — werk-strategie', () => {
  it('mapt ladder-parameters (eenheden: pct/100, sprong-leeftijd afgerond)', () => {
    const werk = makeEvent({
      id: 'w',
      event_type: 'werk',
      target_age: 45,
      metadata: {
        huidigNettoMaand: 4000,
        reeleGroeiPct: 0.02,
        groeiTotLeeftijd: 60,
        plafondNettoMaand: 6000,
        sprongen: [{ atAge: 50.4, deltaNettoMaand: 300 }],
        faseStappen: [{ fromAge: 58, pct: 80 }],
      },
    })
    const { werkStrategie } = buildEventInputs([werk], CTX)
    expect(werkStrategie.basisNettoPerMaand).toBe(4000)
    expect(werkStrategie.reeleGroei).toBe(0.02)
    expect(werkStrategie.groeiTotLeeftijd).toBe(60)
    expect(werkStrategie.plafondNettoPerMaand).toBe(6000)
    expect(werkStrategie.sprongen).toEqual([{ bijLeeftijd: 50, deltaNettoPerMaand: 300 }])
    expect(werkStrategie.deeltijd).toEqual([{ vanafLeeftijd: 58, pct: 0.8 }])
  })

  it('werk-event zonder basisinkomen → inert + melding', () => {
    const werk = makeEvent({ id: 'w', event_type: 'werk', target_age: 45, metadata: { reeleGroeiPct: 0.03 } })
    const { werkStrategie, notices } = buildEventInputs([werk], CTX)
    expect(werkStrategie.basisNettoPerMaand).toBe(0)
    expect(werkStrategie.reeleGroei).toBe(0)
    expect(notices.some((n) => n.kind === 'info' && /basisinkomen/.test(n.message))).toBe(true)
  })
})

// ── Vrije events → handmatige Geb-rijen (postconventie) ───────────────────────────────

describe('events — handmatige Geb-rijen', () => {
  it('eenmalige kost (niet-geïndexeerd) → Eenmalig-post, negatief, gede-indexeerd', () => {
    const ev = makeEvent({ id: 'o', event_type: 'aankopen', target_age: 50, one_time_cost: 20_000, is_indexed: false })
    const { gebeurtenissen } = buildEventInputs([ev], CTX)
    expect(gebeurtenissen).toHaveLength(1)
    expect(gebeurtenissen[0].rij).toBe(4)
    const [post] = gebeurtenissen[0].posten
    expect(post.type).toBe('Eenmalig')
    expect(post.startLeeftijd).toBe(50)
    expect(post.startMaand).toBe(1)
    expect(post.eindLeeftijd).toBeNull()
    // Kost negatief; gede-indexeerd naar startjaar (50 − 45 = 5 jaar).
    expect(post.bedrag).toBeCloseTo(-20_000 / Math.pow(1.02, 5), 6)
  })

  it('maandelijkse baat met duur → Periodiek met eind, positief, koopkracht-nu', () => {
    const ev = makeEvent({
      id: 'r',
      event_type: 'side_hustle',
      target_age: 50,
      monthly_income_change: 500,
      duration_months: 24,
      is_indexed: true,
    })
    const [post] = buildEventInputs([ev], CTX).gebeurtenissen[0].posten
    expect(post.type).toBe('Periodiek')
    expect(post.startLeeftijd).toBe(50)
    expect(post.eindLeeftijd).toBe(51)
    expect(post.eindMaand).toBe(12)
    expect(post.bedrag).toBe(500)
  })

  it('doorlopende maandkost → Periodiek zonder eind (kern loopt tot horizon)', () => {
    const ev = makeEvent({ id: 'c', event_type: 'custom', target_age: 55, monthly_cost_change: 200, is_indexed: true })
    const [post] = buildEventInputs([ev], CTX).gebeurtenissen[0].posten
    expect(post.type).toBe('Periodiek')
    expect(post.eindLeeftijd).toBeNull()
    expect(post.bedrag).toBe(-200)
  })

  it('market_shock (portfolio-mutatie) → potMutatie op de juiste maand (V9), geen Geb-rij', () => {
    const shock = makeEvent({ id: 's', event_type: 'market_shock', target_age: 55, metadata: { shockPercentage: -0.3 } })
    const { gebeurtenissen, potMutaties } = buildEventInputs([shock], CTX)
    expect(gebeurtenissen).toHaveLength(0)
    // CTX.startLeeftijd = 45 → maand = round((55−45)·12) = 120.
    expect(potMutaties).toHaveLength(1)
    expect(potMutaties[0]).toEqual({ maand: 120, pct: -0.3, alleenInvestering: true })
  })

  it('> 3 posten per event → gecapt op 3 + overflow-melding', () => {
    const cashflows: UserDefinedCashflow[] = Array.from({ length: 4 }, (_, i) => ({
      id: `cf${i}`,
      name: `stroom ${i}`,
      type: 'recurring',
      direction: 'expense',
      amount: 100 * (i + 1),
      durationMonths: 12,
      indexed: true,
    }))
    const ev = makeEvent({ id: 'mp', event_type: 'custom', target_age: 50, metadata: { cashflows } })
    const { gebeurtenissen, notices } = buildEventInputs([ev], CTX)
    expect(gebeurtenissen[0].posten).toHaveLength(3)
    expect(notices.some((n) => n.kind === 'overflow' && /posten/.test(n.message))).toBe(true)
  })

  it('> 10 handmatige rijen → eerste 10 gemapt + overflow-melding', () => {
    const many = Array.from({ length: 11 }, (_, i) =>
      makeEvent({ id: `m${i}`, event_type: 'aankopen', target_age: 50, one_time_cost: 1000 }),
    )
    const { gebeurtenissen, notices } = buildEventInputs(many, CTX)
    expect(gebeurtenissen).toHaveLength(10)
    expect(gebeurtenissen.map((r) => r.rij)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
    expect(notices.some((n) => n.kind === 'overflow' && /handmatige/.test(n.message))).toBe(true)
  })
})

// ── DE VERPLICHTE MISSIE-TEST + rooktest ──────────────────────────────────────────────

/** Minimale, volledige DB-shape zodat `buildKernelInputFromApp` door `solveFire` loopt. */
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

function pinnedProfile(over: Partial<KernelAdapterProfile> = {}): KernelAdapterProfile {
  return {
    date_of_birth: `${new Date().getFullYear() - 45}-01-01`,
    net_monthly_income: 4500,
    estimated_monthly_expenses: 2500,
    expected_return: 0.07,
    inflation_rate: 0.02,
    box3_method: 'forfaitair',
    fire_end_strategy: 'deplete',
    fire_end_age: 90,
    ...over,
  }
}

/** Solver-scalars (zonder de zware projectie) — de "uitkomst" voor de byte-identiteit. */
function solveScalars(r: SolveFireResult) {
  return {
    fireAge: r.fireAge,
    eindleeftijd: r.eindleeftijd,
    doelbedrag: r.doelbedrag,
    modelwaarde: r.modelwaarde,
    gap: r.gap,
    status: r.status,
    maandHint: r.maandHint,
    tekortLeningTotEindleeftijd: r.tekortLeningTotEindleeftijd,
    engineRuns: r.engineRuns,
  }
}

describe('MISSIE — dubbeltelling-guard over alle vier strategieën', () => {
  const profile = pinnedProfile({ housing_strategy_config: { mode: 'downsize', triggerAge: 72 } })
  const assets = [
    makeAsset({ id: 'sav', asset_type: 'savings', current_value: 80_000 }),
    makeAsset({ id: 'etf', asset_type: 'investment', current_value: 200_000, expected_return: 7 }),
    makeAsset({ id: 'house', asset_type: 'eigen_huis', current_value: 400_000, expected_return: 2 }),
  ]
  const debts = [
    makeDebt({ id: 'mort', debt_type: 'mortgage', current_balance: 220_000, linked_asset_id: 'house', interest_rate: 3.5, monthly_payment: 950, is_tax_deductible: true }),
  ]

  // De vier strategieën als echte events + één vrije gebeurtenis.
  const aow = makeEvent({ id: 'aow-1', event_type: 'aow', target_age: 67, metadata: { leefsituatie: 'alleenstaand', jarenBuitenNL: 0 } })
  const pension = makeEvent({ id: 'pen-1', event_type: 'pension', target_age: 67, metadata: { pensioenType: 'lijfrente_bancair', inlegBedrag: 100_000, ingangLeeftijd: 67, uitkeringsduur: '20', isGeindexeerd: true } })
  const werk = makeEvent({ id: 'werk-1', event_type: 'werk', target_age: 45, metadata: { huidigNettoMaand: 4500, reeleGroeiPct: 0.01, plafondNettoMaand: 6500 } })
  // Virtueel huis-event dat de gebeurtenissen-pagina óók toont (badge-rij) — mag NOOIT een Geb-rij worden.
  const huisVisual = makeEvent({ id: 'housing-strategy:downsize', event_type: 'house_sale', target_age: 72, metadata: { source: 'housing-strategy' } })
  const sabbatical = makeEvent({ id: 'sab-1', event_type: 'sabbatical', target_age: 50, monthly_income_change: -3000, duration_months: 6 })

  const driving = [aow, pension, werk, huisVisual, sabbatical]
  // "Visuele lijst": dezelfde beheerde events nogmaals aangeboden (badge-herhaling).
  const withVisualDupes = [...driving, aow, pension, werk, huisVisual]

  it('(a) elke afgeleide stroom precies één keer; alleen het vrije event wordt een Geb-rij', () => {
    const { input } = buildKernelInputFromAppWithNotices({ profile, assets, debts, lifeEvents: driving })
    // AOW één keer (opbouwjaren gezet), pensioen één pot, werk één inkomenslijn.
    expect(input.autoGebeurtenissen.aowOpbouwjaren).toBe(50)
    expect(input.autoGebeurtenissen.pensioenPotten).toHaveLength(1)
    expect(input.werkStrategie.basisNettoPerMaand).toBe(4500)
    // De handmatige Geb-rijen bevatten UITSLUITEND het vrije event — geen aow/pension/werk/huis.
    expect(input.gebeurtenissen).toHaveLength(1)
    expect(input.gebeurtenissen[0].naam).toBe(sabbatical.name)
  })

  it('(b) solveFire byte-identiek mét en zónder de visuele duplicaten', () => {
    const a = buildKernelInputFromApp({ profile, assets, debts, lifeEvents: driving })
    const b = buildKernelInputFromApp({ profile, assets, debts, lifeEvents: withVisualDupes })
    // De guard + dedup maken de kern-invoer structureel identiek …
    expect(b).toStrictEqual(a)
    // … en dus de solver-uitkomst byte-identiek.
    expect(solveScalars(solveFire(b))).toStrictEqual(solveScalars(solveFire(a)))
  })
})

describe('events — rooktest gemengde events door solveFire', () => {
  it('realistisch gemengd profiel: solveFire draait; Geb-rijen kloppen', () => {
    const profile = pinnedProfile()
    const assets = [
      makeAsset({ id: 'sav', asset_type: 'savings', current_value: 60_000 }),
      makeAsset({ id: 'etf', asset_type: 'investment', current_value: 150_000, expected_return: 7 }),
    ]
    const debts: Debt[] = []
    const lifeEvents = [
      makeEvent({ id: 'aow', event_type: 'aow', target_age: 67, metadata: { leefsituatie: 'alleenstaand' } }),
      makeEvent({ id: 'pen', event_type: 'pension', target_age: 67, metadata: { pensioenType: 'bedrijf', brutoBedrag: 1200, ingangLeeftijd: 67 } }),
      makeEvent({ id: 'kind', event_type: 'children', target_age: 46, metadata: { aantalKinderen: 1 } }),
      makeEvent({ id: 'reno', event_type: 'renovation', target_age: 52, one_time_cost: 25_000, is_indexed: false }),
      makeEvent({ id: 'hobby', event_type: 'custom', target_age: 55, monthly_cost_change: 150, is_indexed: true }),
    ]
    const { input, notices } = buildKernelInputFromAppWithNotices({ profile, assets, debts, lifeEvents })

    // Twee vrije events (renovatie + hobby) → twee Geb-rijen; aow/pension/children niet.
    expect(input.gebeurtenissen).toHaveLength(2)
    expect(input.gebeurtenissen.every((r) => r.posten.length >= 1 && r.posten.length <= 3)).toBe(true)
    expect(notices.every((n) => n.kind !== 'skip')).toBe(true) // niets ongemapt overgeslagen

    const result = solveFire(input)
    expect(Number.isFinite(result.fireAge)).toBe(true)
    expect(typeof result.status).toBe('string')
  })
})
