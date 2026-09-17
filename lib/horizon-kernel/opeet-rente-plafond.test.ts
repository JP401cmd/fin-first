/**
 * ADR 0151 — **opeethypotheek: rente zichtbaar en boven het plafond doorlopend**
 * (app-only, buiten het Excel-oracle-domein).
 *
 * Het oracle capt het opeetsaldo hard: `S!P = MIN(BD, (P(m−1)+BE)·(1+B66/12))` en zet de
 * rentekolom op 0. Drie defecten: (a) de bijgeschreven rente is nergens zichtbaar,
 * (b) zodra het saldo tegen het plafond aanloopt valt de rente stil weg, (c) daalt het
 * plafond, dan wordt de schuld zonder aflossing ingekort.
 *
 * Met `WoningStrategieParams.opeetRenteBovenPlafond` (app-adapter zet 'm altijd op
 * reverse_mortgage) vervalt de MIN: de schuld groeit met opname + rente en mag boven het
 * plafond uitkomen; alleen NIEUWE opname stopt (Bez!BE via `opeetCapRestant`). De rente
 * staat in het aparte veld `SSlot.renteBijgeschreven`; de oracle-kolom `rente` blijft 0.
 * Vlag weggelaten ⇒ oracle-formule; het fixture-pad zet 'm nooit ⇒ parity byte-identiek.
 *
 * TOLERANTIE-KEUZES:
 *  - rente-toetsen per maand: ABSOLUUT €1e-6 — de referentie is een directe herberekening
 *    van dezelfde float-formule, alleen som-volgorde-ruis mag overblijven.
 *  - jaarsom bridge (Σ 12 maanden, bedragen ~€1e3–1e5): ABSOLUUT €1e-3 — twaalf
 *    optellingen van waarden rond 1e4 geven ~1e-11 drift; 1e-3 is ruim en blijft ver
 *    onder de weergave-afronding (€1). Relatief zou hier geen foutklasse toevoegen.
 *  - "geen opname"/"tekort 0": ABSOLUUT €1e-6 (referentie 0; relatief zinloos).
 */
import { describe, it, expect } from 'vitest'
import { buildKernelInputFromAppWithNotices } from '@/lib/horizon-kernel/adapter'
import { runKernelProjection, type KernelProjection } from '@/lib/horizon-kernel/engine'
import { runKernelUnified } from '@/lib/horizon-kernel/run-unified'
import { opeetCapRestant } from '@/lib/horizon-kernel/tables/bez'
import type { KernelInput } from '@/lib/horizon-kernel/types'
import type { Asset } from '@/lib/asset-data'

const START_LEEFTIJD = 47
const TRIGGER_AGE = 67
const FALLBACK_AGE = 80
const LEVENSVERWACHTING = 90
const EPS = 1e-6

const HUIS = (waarde: number, rendementPct = 2) =>
  ({ id: 'house', name: 'Eigen woning', asset_type: 'eigen_huis', current_value: waarde, expected_return: rendementPct, monthly_contribution: 0, is_active: true, net_worth_inclusion_pct: 100 }) as unknown as Asset
const SPAAR = (bedrag: number) =>
  ({ id: 'sav', name: 'Spaarrekening', asset_type: 'savings', current_value: bedrag, expected_return: 1, monthly_contribution: 0, is_active: true, net_worth_inclusion_pct: 100 }) as unknown as Asset
const BELEG = (bedrag: number) =>
  ({ id: 'inv', name: 'Beleggingen', asset_type: 'investment', current_value: bedrag, expected_return: 5, monthly_contribution: 0, is_active: true, net_worth_inclusion_pct: 100 }) as unknown as Asset

type Trigger = 'fixed_age' | 'on_depletion'

function housing(trigger: Trigger, over: Record<string, unknown> = {}) {
  return {
    mode: 'reverse_mortgage',
    trigger,
    triggerAge: TRIGGER_AGE,
    fallbackAge: FALLBACK_AGE,
    depletionThresholdYears: 2,
    maxLoanPct: 0.6,
    interestRate: 0.055,
    monthlyPayout: null,
    ...over,
  }
}

interface Scenario {
  readonly huis?: number
  readonly huisRendementPct?: number
  readonly spaar?: number
  readonly beleg?: number
  readonly uitgaven?: number
}

function profileFor(housingConfig: Record<string, unknown>, sc: Scenario = {}) {
  return {
    date_of_birth: '1980-01-01',
    net_monthly_income: 5000,
    estimated_monthly_expenses: sc.uitgaven ?? 2000,
    expected_return: 0.05,
    inflation_rate: 0.02,
    box3_method: 'forfaitair',
    fire_end_strategy: 'deplete',
    fire_end_age: LEVENSVERWACHTING,
    withdrawal_strategy: 'static',
    housing_strategy_config: housingConfig,
  }
}

function assetsFor(sc: Scenario = {}): Asset[] {
  return [HUIS(sc.huis ?? 1_500_000, sc.huisRendementPct), SPAAR(sc.spaar ?? 30_000), BELEG(sc.beleg ?? 60_000)]
}

function kernelInput(housingConfig: Record<string, unknown>, sc: Scenario = {}): KernelInput {
  const input = buildKernelInputFromAppWithNotices({
    profile: profileFor(housingConfig, sc) as never,
    assets: assetsFor(sc),
    debts: [],
  }).input
  return { ...input, startLeeftijd: START_LEEFTIJD }
}

const mAt = (age: number) => Math.round((age - START_LEEFTIJD) * 12)

/** Vlag strippen = het oracle-pad (fixture zet 'm nooit). */
function zonderVlag(input: KernelInput): KernelInput {
  const { opeetRenteBovenPlafond: _weg, ...woning } = input.woning
  return { ...input, woning }
}

function opeetSlotIdx(input: KernelInput): number {
  return input.schuldPotten.find((p) => p.rol === 'opeethypotheek')?.slot ?? 3
}

function opeetCel(input: KernelInput, proj: KernelProjection, m: number) {
  return proj.s[m]?.slots[opeetSlotIdx(input)]
}

function opeetSaldo(input: KernelInput, proj: KernelProjection, m: number): number {
  const cel = opeetCel(input, proj, m)
  return typeof cel?.saldo === 'number' ? cel.saldo : 0
}

function woning(proj: KernelProjection, m: number) {
  const row = proj.bez[m]
  if (row === undefined || row.beyondHorizon) throw new Error(`maand ${m} buiten horizon`)
  return row.woning
}

function opeetStartMaand(proj: KernelProjection): number {
  return proj.bez.findIndex((r) => !r.beyondHorizon && r.woning.opeetGestart === 1)
}

/** Eerste maand ná de start waarin de leenruimte op is (opname gecapt op 0). */
function eerstePlafondMaand(input: KernelInput, proj: KernelProjection, mStart: number, mEind: number): number {
  for (let m = mStart + 1; m <= mEind; m++) {
    const restant = opeetCapRestant(woning(proj, m).opeetCap, input.woning.opeetRentePerJaar, opeetSaldo(input, proj, m - 1))
    if (restant < EPS && opeetSaldo(input, proj, m - 1) > 0) return m
  }
  return -1
}

/** Structurele vergelijking van de tabellen die de opeet-slot raakt. */
const kern = (p: KernelProjection) => ({
  woning: p.bez.map((r) => (r.beyondHorizon ? null : r.woning)),
  s: p.s,
  prognose: p.prognose,
})

// ── adapter ─────────────────────────────────────────────────────────────────────

describe('adapter · opeetRenteBovenPlafond (ADR 0151)', () => {
  it('reverse_mortgage ⇒ altijd true (beide triggers, mét en zonder eigen maandbedrag)', () => {
    expect(kernelInput(housing('fixed_age')).woning.opeetRenteBovenPlafond).toBe(true)
    expect(kernelInput(housing('on_depletion')).woning.opeetRenteBovenPlafond).toBe(true)
    expect(kernelInput(housing('fixed_age', { monthlyPayout: 1_000 })).woning.opeetRenteBovenPlafond).toBe(true)
  })

  it('niet-opeet-modi dragen de vlag niet', () => {
    expect(kernelInput({ mode: 'include_full' }).woning.opeetRenteBovenPlafond).toBeUndefined()
    expect(kernelInput({ mode: 'exclude_from_fire' }).woning.opeetRenteBovenPlafond).toBeUndefined()
    expect(
      kernelInput({ mode: 'downsize', trigger: 'fixed_age', triggerAge: 67, fallbackAge: 80, depletionThresholdYears: 2, salePricePct: 1, salesCostsPct: 0.04, newMonthlyHousingCost: null }).woning.opeetRenteBovenPlafond,
    ).toBeUndefined()
  })
})

// ── kern ────────────────────────────────────────────────────────────────────────

describe('kernel · opeet-rente zichtbaar en boven het plafond (ADR 0151)', () => {
  // (a) rente zichtbaar: elke maand ná de start draagt de slot de bijgeschreven rente,
  // exact de groei van het saldo bovenop de opname; de oracle-kolom `rente` blijft 0.
  it('(a) renteBijgeschreven = (saldo(m−1) + opname)·r/12 = saldo-groei − opname; kolom `rente` blijft 0', () => {
    const input = kernelInput(housing('fixed_age', { maxLoanPct: 0.8 }), { huis: 2_000_000 })
    const proj = runKernelProjection(input, { fireAge: 56 })
    const mStart = opeetStartMaand(proj)
    const mEind = mAt(LEVENSVERWACHTING)
    expect(mStart).toBeGreaterThan(0)
    const r = input.woning.opeetRentePerJaar

    let somRente = 0
    for (let m = mStart; m <= mEind; m++) {
      const cel = opeetCel(input, proj, m)!
      const prev = opeetSaldo(input, proj, m - 1)
      const opname = woning(proj, m).opeetOpname
      const verwacht = ((prev + opname) * r) / 12
      expect(cel.renteBijgeschreven).toBeCloseTo(verwacht, 6)
      // Met de vlag is de rente exact de netto saldo-groei bovenop de opname.
      expect(opeetSaldo(input, proj, m) - prev - opname).toBeCloseTo(cel.renteBijgeschreven ?? NaN, 6)
      expect(cel.rente).toBe(0)
      somRente += cel.renteBijgeschreven ?? 0
    }
    // Het scenario spreekt de schuld ook echt aan.
    expect(opeetSaldo(input, proj, mEind)).toBeGreaterThan(10_000)
    expect(somRente).toBeGreaterThan(1_000)
  })

  // (b) plafond bereikt: nieuwe opname stopt, de rente loopt door en het saldo passeert
  // het plafond. Zonder de vlag (oracle) blijft het saldo op de cap hangen.
  it('(b) boven het plafond: opname 0, saldo groeit met exact (1+r/12) per maand en komt boven de cap uit; oracle blijft ≤ cap', () => {
    const met = kernelInput(housing('on_depletion', { maxLoanPct: 0.05 }))
    const zonder = zonderVlag(met)
    const pMet = runKernelProjection(met, { fireAge: 52 })
    const pZonder = runKernelProjection(zonder, { fireAge: 52 })
    const mStart = opeetStartMaand(pMet)
    const mEind = mAt(LEVENSVERWACHTING)
    expect(mStart).toBeGreaterThan(0)
    const groei = 1 + met.woning.opeetRentePerJaar / 12

    const mPlafond = eerstePlafondMaand(met, pMet, mStart, mEind)
    expect(mPlafond).toBeGreaterThan(mStart)

    let bovenCap = false
    for (let m = mPlafond; m <= mEind; m++) {
      const w = woning(pMet, m)
      const prev = opeetSaldo(met, pMet, m)
      // Nieuwe opname stopt zodra de leenruimte op is …
      if (opeetSaldo(met, pMet, m - 1) >= w.opeetCap / groei) expect(w.opeetOpname).toBeLessThan(EPS)
      // … en het saldo groeit dan met exact de rente.
      if (w.opeetOpname < EPS) {
        expect(prev).toBeCloseTo(opeetSaldo(met, pMet, m - 1) * groei, 6)
      }
      // Nooit ingekort.
      expect(prev).toBeGreaterThanOrEqual(opeetSaldo(met, pMet, m - 1) - EPS)
      if (prev > w.opeetCap + 1) bovenCap = true
      // Oracle-pad: hard op de cap.
      expect(opeetSaldo(zonder, pZonder, m)).toBeLessThanOrEqual(woning(pZonder, m).opeetCap + EPS)
    }
    expect(bovenCap).toBe(true)
    // Aan het eind staat de app-schuld boven de oracle-schuld: de weggevallen rente.
    expect(opeetSaldo(met, pMet, mEind)).toBeGreaterThan(opeetSaldo(zonder, pZonder, mEind) + 1_000)
  })

  // (c) dalend plafond: een krimpende huiswaarde trekt BD omlaag. Oracle: MIN kort de
  // schuld in (geld uit het niets). Met de vlag: de schuld daalt nooit.
  it('(c) dalend plafond kort de schuld niet in (vlag); het oracle-pad kort wél in — het defect', () => {
    const cfg = housing('fixed_age', { monthlyPayout: 4_000, maxLoanPct: 0.6 })
    const met = kernelInput(cfg, { huis: 800_000, huisRendementPct: -4 })
    const zonder = zonderVlag(met)
    const pMet = runKernelProjection(met, { fireAge: 60 })
    const pZonder = runKernelProjection(zonder, { fireAge: 60 })
    const mStart = mAt(TRIGGER_AGE)
    const mEind = mAt(LEVENSVERWACHTING)
    expect(opeetStartMaand(pMet)).toBe(mStart)

    // Het plafond daalt daadwerkelijk (huiswaarde krimpt 4%/jr).
    expect(woning(pMet, mEind).opeetCap).toBeLessThan(woning(pMet, mStart + 12).opeetCap)

    let oracleIngekort = false
    for (let m = mStart + 1; m <= mEind; m++) {
      expect(opeetSaldo(met, pMet, m)).toBeGreaterThanOrEqual(opeetSaldo(met, pMet, m - 1) - EPS)
      if (opeetSaldo(zonder, pZonder, m) < opeetSaldo(zonder, pZonder, m - 1) - 1) oracleIngekort = true
    }
    expect(oracleIngekort).toBe(true)
    // En het vlag-saldo ligt nooit onder het oracle-saldo.
    for (let m = mStart; m <= mEind; m++) {
      expect(opeetSaldo(met, pMet, m)).toBeGreaterThanOrEqual(opeetSaldo(zonder, pZonder, m) - EPS)
    }
  })

  // (d) oracle-pad: vlag weggelaten ≡ explicit false; renteBijgeschreven is ook dáár een
  // puur weergaveveld (de S-kolommen die het oracle vergelijkt veranderen niet).
  it('(d) vlag weggelaten ≡ false (byte-identiek), en het oracle-saldo blijft de MIN-formule', () => {
    const met = kernelInput(housing('fixed_age', { monthlyPayout: 3_000 }))
    const zonder = zonderVlag(met)
    const uit: KernelInput = { ...met, woning: { ...met.woning, opeetRenteBovenPlafond: false } }
    const pZonder = runKernelProjection(zonder, { fireAge: 60 })
    const pUit = runKernelProjection(uit, { fireAge: 60 })
    expect(kern(pUit)).toEqual(kern(pZonder))

    const r = zonder.woning.opeetRentePerJaar
    const mStart = mAt(TRIGGER_AGE)
    for (let m = mStart + 1; m <= mAt(LEVENSVERWACHTING); m++) {
      const w = woning(pZonder, m)
      const prev = opeetSaldo(zonder, pZonder, m - 1)
      // Letterlijk de oracle-formule (float-identiek: dezelfde associativiteit).
      expect(opeetSaldo(zonder, pZonder, m)).toBe(Math.min(w.opeetCap, (prev + w.opeetOpname) * (1 + r / 12)))
      const cel = opeetCel(zonder, pZonder, m)!
      expect(cel.rente).toBe(0)
      expect(cel.renteBijgeschreven).toBeCloseTo(((prev + w.opeetOpname) * r) / 12, 6)
    }
  })

  // (e) Verkopen / meetellen: de vlag is afwezig én geforceerd inert.
  it('(e) buiten opeet-modus is een geforceerde vlag inert', () => {
    const basis = kernelInput({ mode: 'downsize', trigger: 'fixed_age', triggerAge: TRIGGER_AGE, fallbackAge: FALLBACK_AGE, depletionThresholdYears: 2, salePricePct: 1, salesCostsPct: 0.04, newMonthlyHousingCost: null })
    const geforceerd: KernelInput = { ...basis, woning: { ...basis.woning, opeetRenteBovenPlafond: true } }
    expect(kern(runKernelProjection(geforceerd, { fireAge: 52 }))).toEqual(kern(runKernelProjection(basis, { fireAge: 52 })))
  })
})

// ── bridge ──────────────────────────────────────────────────────────────────────

describe('bridge · debtBalances["opeethypotheek"].renteBijgeschreven + opeetPlafondBereikt (ADR 0151)', () => {
  const cfg = housing('on_depletion', { maxLoanPct: 0.05 })
  const { result } = runKernelUnified({
    adapterInput: {
      profile: profileFor(cfg) as never,
      assets: assetsFor(),
      debts: [],
      asOf: new Date(2027, 0, 1), // geboren 1980-01-01 ⇒ startleeftijd 47
    },
    yearlyExpenses: 24_000,
  })
  const opeetRows = result.rows.filter((row) => row.debtBalances['opeethypotheek'] !== undefined)

  it('de bijgeschreven rente staat per jaar apart; interestPaid (kas) blijft 0', () => {
    expect(opeetRows.length).toBeGreaterThan(0)
    let somRente = 0
    for (const row of opeetRows) {
      const d = row.debtBalances['opeethypotheek']
      expect(d.interestPaid).toBe(0)
      expect(d.principalPaid).toBe(0)
      expect(d.renteBijgeschreven ?? 0).toBeGreaterThanOrEqual(0)
      // Jaar-sluiting: eindsaldo − startsaldo = opname + bijgeschreven rente.
      expect(d.endBalance - d.startBalance).toBeCloseTo((row.opeetOpname ?? 0) + (d.renteBijgeschreven ?? 0), 3)
      somRente += d.renteBijgeschreven ?? 0
    }
    expect(somRente).toBeGreaterThan(1_000)
  })

  it('opeetPlafondBereikt wordt true zodra de leenruimte op is en het saldo groeit dan boven opeetCap uit', () => {
    const bereikt = opeetRows.filter((row) => row.opeetPlafondBereikt === true)
    expect(bereikt.length).toBeGreaterThan(0)
    const eersteBereikt = result.rows.findIndex((row) => row.opeetPlafondBereikt === true)
    // Vóór het plafond: false (of afwezig vóór de opeet-modus-rij), erna nieuwe opname 0.
    for (const row of result.rows.slice(0, eersteBereikt)) expect(row.opeetPlafondBereikt ?? false).toBe(false)
    const laatste = bereikt[bereikt.length - 1]
    expect(laatste.opeetOpname).toBeLessThan(1)
    expect(laatste.debtBalances['opeethypotheek'].endBalance).toBeGreaterThan(laatste.opeetCap ?? Infinity)
  })

  it('andere schuldsleutels dragen geen renteBijgeschreven', () => {
    for (const row of result.rows) {
      for (const [key, d] of Object.entries(row.debtBalances)) {
        if (key !== 'opeethypotheek') expect(d.renteBijgeschreven).toBeUndefined()
      }
    }
  })
})
