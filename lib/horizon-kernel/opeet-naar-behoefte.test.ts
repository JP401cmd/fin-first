/**
 * ADR 0150 — **opeethypotheek: opname naar behoefte** (app-only, buiten het
 * Excel-oracle-domein).
 *
 * Zonder eigen maandbedrag (`ReverseMortgageConfig.monthlyPayout === null`) neemt de
 * kern per maand op wat je tekortkomt: het gat dat anders de synthetische tekort-lening
 * zou voeden (Verdeling: onbenut afname + onttrekking) plus een al openstaande
 * tekort-lening (saldo m−1 + rente, ná wat Verdeling er al op afloste), begrensd door
 * de resterende leenruimte (`capRestant`). De opname is DIRECTE dekking: ze gaat niet
 * via CF!I/Toename de potten in (geen dubbeltelling), maar verlaagt de tekort-voeding
 * en verhoogt de tekort-aflossing in S van dezelfde maand.
 *
 * Vlag `WoningStrategieParams.opeetOpnameNaarBehoefte` weggelaten ⇒ de oracle-formule
 * (auto-spreiding over (90 − start)·12); het fixture-pad zet 'm nooit ⇒ parity
 * byte-identiek. Een eigen `opeetMaandopname` wint altijd (vlag inert).
 *
 * TOLERANTIE-KEUZE: de tekort-saldo-toetsen zijn ABSOLUUT (€1e-6). Ze toetsen een
 * structurele nul (S!AB = MAX(0, saldo + rente + voeding − aflossing) met voeding en
 * aflossing die per constructie tegen elkaar wegvallen); alleen float-ruis van de
 * som-volgorde (verdeling vs. s.ts) mag overblijven. Relatief zou hier zinloos zijn:
 * de referentiewaarde is 0.
 */
import { describe, it, expect } from 'vitest'
import { buildKernelInputFromAppWithNotices } from '@/lib/horizon-kernel/adapter'
import { runKernelProjection, type KernelProjection } from '@/lib/horizon-kernel/engine'
import { solveFire } from '@/lib/horizon-kernel/solver'
import type { KernelInput } from '@/lib/horizon-kernel/types'
import type { Asset } from '@/lib/asset-data'

// Startleeftijd op een heel getal, zodat maandindex ↔ leeftijd exact uitlijnt.
const START_LEEFTIJD = 47
const TRIGGER_AGE = 67
const FALLBACK_AGE = 80
const LEVENSVERWACHTING = 90
const EPS = 1e-6

const HUIS = (waarde: number) =>
  ({ id: 'house', name: 'Eigen woning', asset_type: 'eigen_huis', current_value: waarde, expected_return: 2, monthly_contribution: 0, is_active: true, net_worth_inclusion_pct: 100 }) as unknown as Asset
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
  readonly spaar?: number
  readonly beleg?: number
  readonly uitgaven?: number
  readonly geenTekortLening?: boolean
}

function kernelInput(housingConfig: Record<string, unknown>, sc: Scenario = {}): KernelInput {
  const profile = {
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
    fire_no_deficit_loan: sc.geenTekortLening === true ? true : undefined,
  }
  const input = buildKernelInputFromAppWithNotices({
    profile: profile as never,
    assets: [HUIS(sc.huis ?? 1_500_000), SPAAR(sc.spaar ?? 30_000), BELEG(sc.beleg ?? 60_000)],
    debts: [],
  }).input
  return { ...input, startLeeftijd: START_LEEFTIJD }
}

const mAt = (age: number) => Math.round((age - START_LEEFTIJD) * 12)

/** Vlag strippen = het oracle-pad (fixture zet 'm nooit). */
function zonderVlag(input: KernelInput): KernelInput {
  const { opeetOpnameNaarBehoefte: _weg, ...woning } = input.woning
  return { ...input, woning }
}

function tekortSlot(input: KernelInput): number {
  return input.schuldPotten.find((p) => p.rol === 'tekortLening')?.slot ?? 6
}

function tekortSaldo(input: KernelInput, proj: KernelProjection, m: number): number {
  const cel = proj.s[m]?.slots[tekortSlot(input)]
  return typeof cel?.saldo === 'number' ? cel.saldo : 0
}

function opeetSaldo(input: KernelInput, proj: KernelProjection, m: number): number {
  const slot = input.schuldPotten.find((p) => p.rol === 'opeethypotheek')?.slot ?? 3
  const cel = proj.s[m]?.slots[slot]
  return typeof cel?.saldo === 'number' ? cel.saldo : 0
}

function woning(proj: KernelProjection, m: number) {
  const row = proj.bez[m]
  if (row === undefined || row.beyondHorizon) throw new Error(`maand ${m} buiten horizon`)
  return row.woning
}

function opnameSerie(proj: KernelProjection): number[] {
  return proj.bez.map((row) => (row.beyondHorizon ? 0 : row.woning.opeetOpname))
}

/** Het gat van maand m zoals Verdeling het ziet: onbenut afname + onttrekking. */
function gat(proj: KernelProjection, m: number): number {
  const v = proj.verdeling[m]
  return v.afname.onbenut + v.onttrekking.onbenut
}

function eersteMaandMetGat(proj: KernelProjection, vanaf: number): number {
  for (let m = vanaf; m < proj.verdeling.length; m++) {
    if (proj.verdeling[m].beyondHorizon) break
    if (gat(proj, m) > EPS) return m
  }
  return -1
}

function opeetStartMaand(proj: KernelProjection): number {
  return proj.bez.findIndex((r) => !r.beyondHorizon && r.woning.opeetGestart === 1)
}

const maxTekort = (input: KernelInput, proj: KernelProjection, van: number, tot: number) => {
  let max = 0
  for (let m = van; m <= tot; m++) max = Math.max(max, tekortSaldo(input, proj, m))
  return max
}

/** Structurele vergelijking van de drie tabellen die de opname raakt. */
const kern = (p: KernelProjection) => ({
  woning: p.bez.map((r) => (r.beyondHorizon ? null : r.woning)),
  s: p.s,
  prognose: p.prognose,
})

// ── adapter ─────────────────────────────────────────────────────────────────────

describe('adapter · opeetOpnameNaarBehoefte (ADR 0150)', () => {
  it('monthlyPayout null ⇒ vlag true, bij beide triggers', () => {
    expect(kernelInput(housing('fixed_age')).woning.opeetOpnameNaarBehoefte).toBe(true)
    expect(kernelInput(housing('on_depletion')).woning.opeetOpnameNaarBehoefte).toBe(true)
  })

  it('eigen monthlyPayout ⇒ vlag afwezig', () => {
    const w = kernelInput(housing('fixed_age', { monthlyPayout: 1_000 })).woning
    expect(w.opeetMaandopname).toBe(1_000)
    expect(w.opeetOpnameNaarBehoefte).toBeUndefined()
  })

  it('niet-opeet-modi dragen de vlag niet', () => {
    expect(kernelInput({ mode: 'include_full' }).woning.opeetOpnameNaarBehoefte).toBeUndefined()
    expect(kernelInput({ mode: 'exclude_from_fire' }).woning.opeetOpnameNaarBehoefte).toBeUndefined()
    expect(
      kernelInput({ mode: 'downsize', trigger: 'fixed_age', triggerAge: 67, fallbackAge: 80, depletionThresholdYears: 2, salePricePct: 1, salesCostsPct: 0.04, newMonthlyHousingCost: null }).woning.opeetOpnameNaarBehoefte,
    ).toBeUndefined()
  })
})

// ── kern ────────────────────────────────────────────────────────────────────────

describe('kernel · opeethypotheek neemt op naar behoefte (ADR 0150)', () => {
  // (a) + (g): plafond ruim (huis €2M, 80% leenruimte), beide triggers — nooit een
  // tekort-lening, opname = het gat. Bij vaste leeftijd 67 is FIRE zó gekozen dat de
  // potten pas ná 67 op raken (geen tekort vóór de start — dat is scenario c).
  const RUIM: Scenario = { huis: 2_000_000 }
  const varianten: Array<[string, Record<string, unknown>, number]> = [
    ['wanneer nodig (FIRE 52, opeet start op behoefte)', housing('on_depletion', { maxLoanPct: 0.8 }), 52],
    ['vaste leeftijd 67 (FIRE 56, potten raken ná 67 op)', housing('fixed_age', { maxLoanPct: 0.8 }), 56],
  ]

  for (const [naam, cfg, fireAge] of varianten) {
    it(`(a/g) ${naam}: tekort-lening blijft 0 over de hele opeet-periode en de opname is exact het gat`, () => {
      const input = kernelInput(cfg, RUIM)
      const proj = runKernelProjection(input, { fireAge })
      const mStart = opeetStartMaand(proj)
      const mEind = mAt(LEVENSVERWACHTING)
      expect(mStart).toBeGreaterThan(0)

      // Het scenario moet de behoefte ook echt aanspreken: er is een gat ná de start …
      const mGat = eersteMaandMetGat(proj, mStart)
      expect(mGat).toBeGreaterThanOrEqual(mStart)
      expect(mGat).toBeLessThan(mEind)
      // … en het plafond wordt vóór de eindleeftijd niet bereikt (opname < capRestant).
      for (let m = mStart; m <= mEind; m++) {
        const w = woning(proj, m)
        const capRestant = w.opeetCap / (1 + input.woning.opeetRentePerJaar / 12) - opeetSaldo(input, proj, m - 1)
        expect(w.opeetOpname).toBeLessThan(capRestant)
      }

      // (i) Geen tekort-lening — ook niet in de startmaand of de eerste gat-maand.
      expect(maxTekort(input, proj, 0, mEind)).toBeLessThan(EPS)

      // Opname = het gat van dezelfde maand (geen vorige tekort ⇒ niets extra).
      for (let m = mStart; m <= mEind; m++) {
        expect(woning(proj, m).opeetOpname).toBeCloseTo(gat(proj, m), 6)
      }
      // Vóór het eerste gat wordt niets opgenomen (naar behoefte ≠ auto-spreiding).
      // Absoluut €1e-6: Verdeling laat bij een volle dekking een float-residu (~1e-12)
      // als `onbenut` staan; dat residu is de enige 'opname' die hier mag voorkomen.
      for (let m = mStart; m < mGat; m++) expect(woning(proj, m).opeetOpname).toBeLessThan(EPS)
      expect(woning(proj, mGat).opeetOpname).toBeGreaterThan(1)

      // (ii) Geen dubbeltelling: de opname zit niet in CF!I (ze gaat niet de potten in).
      const cf = proj.cf[mGat]
      if (cf.beyondHorizon) throw new Error('cf buiten horizon')
      expect(cf.totaalExtraGeld).toBeCloseTo(cf.sparen + cf.renteVrijval + cf.gebeurtenisBaten + woning(proj, mGat).verkoopopbrengst, 6)

      // De opeetschuld groeit wél met exact de opname (+ rente) — S!P.
      const mNa = mGat
      const verwacht = (opeetSaldo(input, proj, mNa - 1) + woning(proj, mNa).opeetOpname) * (1 + input.woning.opeetRentePerJaar / 12)
      expect(opeetSaldo(input, proj, mNa)).toBeCloseTo(verwacht, 6)
    })
  }

  // (b) plafond bereikt: opname stopt bij het plafond, daarna groeit de tekort-lening.
  it('(b) plafond bereikt: de opname stopt op capRestant en het restgat wordt tekort-lening', () => {
    const input = kernelInput(housing('on_depletion', { maxLoanPct: 0.05 }))
    const proj = runKernelProjection(input, { fireAge: 52 })
    const mStart = opeetStartMaand(proj)
    const mEind = mAt(LEVENSVERWACHTING)
    expect(mStart).toBeGreaterThan(0)

    // Eerste maand waarin het gat groter is dan de resterende leenruimte.
    let mPlafond = -1
    for (let m = mStart; m <= mEind; m++) {
      const w = woning(proj, m)
      const capRestant = Math.max(0, w.opeetCap / (1 + input.woning.opeetRentePerJaar / 12) - opeetSaldo(input, proj, m - 1))
      if (gat(proj, m) > capRestant + EPS) {
        mPlafond = m
        break
      }
    }
    expect(mPlafond).toBeGreaterThan(mStart)

    // Tot het plafond: geen tekort-lening. Op de plafondmaand: opname = capRestant.
    expect(maxTekort(input, proj, 0, mPlafond - 1)).toBeLessThan(EPS)
    const wP = woning(proj, mPlafond)
    const capRestantP = wP.opeetCap / (1 + input.woning.opeetRentePerJaar / 12) - opeetSaldo(input, proj, mPlafond - 1)
    expect(wP.opeetOpname).toBeCloseTo(capRestantP, 6)
    expect(wP.opeetOpname).toBeLessThan(gat(proj, mPlafond))
    // Het restgat van die maand is precies de tekort-lening-voeding.
    expect(tekortSaldo(input, proj, mPlafond)).toBeCloseTo(gat(proj, mPlafond) - wP.opeetOpname, 6)
    // Daarna: geen nieuwe opname boven het plafond en de tekort-lening loopt op. Sinds
    // ADR 0151 (app-pad: `opeetRenteBovenPlafond`) mag het saldo zélf boven de cap
    // uitkomen — alleen door bijgeschreven rente: saldo(m) ≤ MAX(cap, saldo(m−1)·(1+r/12)).
    expect(tekortSaldo(input, proj, mPlafond + 12)).toBeGreaterThan(tekortSaldo(input, proj, mPlafond))
    const groei = 1 + input.woning.opeetRentePerJaar / 12
    for (let m = mPlafond; m <= mEind; m++) {
      const w = woning(proj, m)
      const bovengrens = Math.max(w.opeetCap, opeetSaldo(input, proj, m - 1) * groei)
      expect(opeetSaldo(input, proj, m)).toBeLessThanOrEqual(bovengrens + EPS)
      if (opeetSaldo(input, proj, m - 1) >= w.opeetCap / groei) expect(w.opeetOpname).toBeLessThan(EPS)
    }
  })

  // (c) een tekort-lening van vóór het startmoment wordt vanaf de start afgelost.
  it('(c) vaste leeftijd 67 met potten die vóór 67 op zijn: de tekort-lening wordt vanaf de start afgelost binnen het plafond', () => {
    const input = kernelInput(housing('fixed_age', { maxLoanPct: 0.8 }), RUIM)
    const proj = runKernelProjection(input, { fireAge: 52 })
    const mStart = opeetStartMaand(proj)
    expect(mStart).toBe(mAt(TRIGGER_AGE))

    // Vóór de start bestaat er een materiële tekort-lening (het scenario).
    const tekortVoor = tekortSaldo(input, proj, mStart - 1)
    expect(tekortVoor).toBeGreaterThan(1_000)

    // Startmaand: opname = gat + (tekort m−1 + rente − wat Verdeling al afloste) ⇒ tekort 0.
    const v = proj.verdeling[mStart]
    const w = woning(proj, mStart)
    expect(w.opeetOpname).toBeCloseTo(gat(proj, mStart) + v.tekortRestant, 6)
    expect(w.opeetOpname).toBeGreaterThan(tekortVoor)
    expect(tekortSaldo(input, proj, mStart)).toBeLessThan(EPS)
    // S!AC van de startmaand draagt de aflossing (zichtbaar als `aflossing` op de tekort-slot).
    const cel = proj.s[mStart].slots[tekortSlot(input)]
    expect(typeof cel.aflossing === 'number' ? cel.aflossing : 0).toBeGreaterThanOrEqual(tekortVoor)
    // En blijft 0 t/m de eindleeftijd (het plafond knelt in dit scenario niet).
    expect(maxTekort(input, proj, mStart, mAt(LEVENSVERWACHTING))).toBeLessThan(EPS)
  })

  // (d) eigen maandbedrag ⇒ exact het oude gedrag; de vlag is dan inert.
  it('(d) eigen monthlyPayout: vlag afwezig, en geforceerd true is byte-identiek', () => {
    const basis = kernelInput(housing('fixed_age', { monthlyPayout: 1_500 }))
    expect(basis.woning.opeetOpnameNaarBehoefte).toBeUndefined()
    const geforceerd: KernelInput = { ...basis, woning: { ...basis.woning, opeetOpnameNaarBehoefte: true } }
    const pBasis = runKernelProjection(basis, { fireAge: 52 })
    const pForce = runKernelProjection(geforceerd, { fireAge: 52 })
    expect(kern(pForce)).toEqual(kern(pBasis))
    // Het oude gedrag: vanaf de start elke maand het (geïndexeerde) eigen bedrag.
    const mStart = mAt(TRIGGER_AGE)
    expect(woning(pBasis, mStart).opeetOpname).toBeCloseTo(1_500 * Math.pow(1 + basis.inflatie, mStart / 12), 6)
  })

  // (e) vlag weggelaten ⇒ oracle-formule (auto-spreiding), ongeacht behoefte.
  it('(e) vlag weggelaten: auto-spreiding vanaf de start ook zónder gat; explicit false ≡ weggelaten', () => {
    const met = kernelInput(housing('fixed_age'))
    const zonder = zonderVlag(met)
    const uit: KernelInput = { ...met, woning: { ...met.woning, opeetOpnameNaarBehoefte: false } }
    const fireAge = 64 // potten raken pas ná 67 op ⇒ in de startmaand is er géén gat
    const pMet = runKernelProjection(met, { fireAge })
    const pZonder = runKernelProjection(zonder, { fireAge })
    const pUit = runKernelProjection(uit, { fireAge })
    expect(kern(pUit)).toEqual(kern(pZonder))

    const mStart = mAt(TRIGGER_AGE)
    expect(gat(pZonder, mStart)).toBe(0)
    // Oracle: gewenst = overwaarde(mStart−1)·max-leen% / ((90 − 67)·12), cap-restant is ruim.
    const w0 = woning(pZonder, mStart)
    const gewenst = (w0.overwaardeVorig * zonder.woning.opeetMaxLeningPctOverwaarde) / ((LEVENSVERWACHTING - TRIGGER_AGE) * 12)
    expect(w0.opeetOpname).toBeCloseTo(gewenst, 6)
    expect(w0.opeetOpname).toBeGreaterThan(0)
    // Mét vlag: geen gat ⇒ geen opname in diezelfde maand (op het Verdeling-float-residu na).
    expect(woning(pMet, mStart).opeetOpname).toBeLessThan(EPS)
    expect(opnameSerie(pMet)).not.toEqual(opnameSerie(pZonder))
  })

  // (f) samen met geenTekortLening (ADR 0149).
  // Vaste leeftijd: vóór de start zijn beide paden identiek; erna dekt de behoefte-
  // opname elk gat tot het plafond, waar de auto-spreiding een vast bedrag geeft dat
  // kleiner kan zijn dan de behoefte ⇒ niet later vrij.
  it('(f) vaste leeftijd: de solver-leeftijd mét behoefte-opname is ≤ die zonder', () => {
    const met = kernelInput(housing('fixed_age'), { geenTekortLening: true })
    expect(met.geenTekortLening).toBe(true)
    const sMet = solveFire(met)
    const sZonder = solveFire(zonderVlag(met))
    expect(['reached_now', 'reached_at']).toContain(sMet.status)
    expect(sMet.fireAge).toBeLessThanOrEqual(sZonder.fireAge)
  })
  // Wanneer nodig: de ongelijkheid geldt hier BEWUST NIET. De oracle-spreiding leent
  // vanaf de start de vólle cap, ongeacht behoefte; het overschot landt liquide in de
  // potten (Prognose!J) terwijl de opeetschuld niet-liquide is en buiten J valt — dat
  // pad is dus systematisch optimistischer dan een plan dat alleen opneemt wat nodig
  // is. Wat wél moet gelden: het plan is haalbaar zonder blijvende tekort-lening.
  it('(f) wanneer nodig: haalbaar zonder blijvende tekort-lening; de oracle-spreiding is optimistischer (gedocumenteerd)', () => {
    const met = kernelInput(housing('on_depletion'), { geenTekortLening: true })
    const sMet = solveFire(met)
    const sZonder = solveFire(zonderVlag(met))
    expect(['reached_now', 'reached_at']).toContain(sMet.status)
    expect(sMet.fireAge).toBeGreaterThanOrEqual(sZonder.fireAge)
    // En op de gevonden leeftijd: de tekort-lening is over de hele horizon 0.
    expect(maxTekort(met, sMet.projection, 0, mAt(LEVENSVERWACHTING))).toBeLessThan(EPS)
  })

  // (g) Verkopen: de vlag is inert.
  it('(g) Verkopen: geforceerde vlag verandert niets', () => {
    const basis = kernelInput({ mode: 'downsize', trigger: 'fixed_age', triggerAge: TRIGGER_AGE, fallbackAge: FALLBACK_AGE, depletionThresholdYears: 2, salePricePct: 1, salesCostsPct: 0.04, newMonthlyHousingCost: null })
    expect(basis.woning.selector).toBe('Verkopen')
    const geforceerd: KernelInput = { ...basis, woning: { ...basis.woning, opeetOpnameNaarBehoefte: true } }
    const pBasis = runKernelProjection(basis, { fireAge: 52 })
    const pForce = runKernelProjection(geforceerd, { fireAge: 52 })
    expect(kern(pForce)).toEqual(kern(pBasis))
  })
})
