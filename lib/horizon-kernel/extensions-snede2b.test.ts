import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { listFixtures, loadFixture } from './oracle/fixture-load'
import type { OracleFixture } from './oracle/fixture-types'
import { buildKernelInput } from './input-from-fixture'
import { runKernelProjection } from './engine'
import { solveFire } from './solver'
import { computeS, debtSlotCount, type SDep } from './tables/s'
import type { BezComputedRow } from './tables/bez'
import type { DebtPot, KernelInput } from './types'

/**
 * EIGENSCHAPS-TESTS — kern-uitbreidingen buiten het oracle-domein (FASE 3, snede 2b).
 *
 * Géén fixtures/euro-parity (die zit in `test/horizon-oracle/`): hier pinnen we het
 * GEDRAG van de drie bewuste uitbreidingen vast (market_shock V9, dynamische schuld-
 * slots met de tekort-lening als getypte rol, generieke pot-liquidaties) én — als harde
 * eis (ADR 0032 §4) — dat een fixture-run met LEGE nieuwe velden byte-identiek is aan de
 * run zónder die velden (inert-by-default).
 */

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const hasFixtures = existsSync(FIXTURE_DIR) && listFixtures(FIXTURE_DIR).length > 0

/** Vaste FIRE-leeftijd zodat base-run en gemodificeerde run dezelfde gate delen. */
const FIRE_AGE_OFFSET = 25
/** Vroege maand (accumulatiefase, ruim in de horizon) om schok/liquidatie op te leggen. */
const M = 12

const computedBez = (row: { beyondHorizon: boolean }): BezComputedRow => {
  expect(row.beyondHorizon).toBe(false)
  return row as BezComputedRow
}

if (!hasFixtures) {
  describe.skip('horizon-kernel · snede 2b (fixtures nog niet geëxtraheerd)', () => {
    it('overgeslagen tot de extractor fixtures heeft geschreven', () => {
      expect(hasFixtures).toBe(false)
    })
  })
} else {
  const fixtures: OracleFixture[] = listFixtures(FIXTURE_DIR).map(loadFixture)
  const inputByScenario = new Map<string, KernelInput>(
    fixtures.map((fx) => [fx.meta.scenario, buildKernelInput(fx)]),
  )
  const anyInput = fixtures.map((fx) => buildKernelInput(fx))

  // ────────────────────────────────────────────────────────────────────────────
  // INERTIE — byte-identiek zonder de nieuwe velden (harde eis, ADR 0032 §4)
  // ────────────────────────────────────────────────────────────────────────────
  describe('inertie-by-default', () => {
    it('solveFire met lege/afwezige potMutaties+potLiquidaties = byte-identiek', () => {
      // Neem een fixture MET een tekort-lening (schuld-prio) zodat óók het tekort-pad
      // door de refactor loopt; val terug op de eerste fixture als die ontbreekt.
      const input = inputByScenario.get('schuld-prio') ?? anyInput[0]
      const baseline = solveFire(input)
      const metLegeVelden = solveFire({ ...input, potMutaties: [], potLiquidaties: [] })
      const metUndefinedVelden = solveFire({
        ...input,
        potMutaties: undefined,
        potLiquidaties: undefined,
      })
      expect(metLegeVelden).toEqual(baseline)
      expect(metUndefinedVelden).toEqual(baseline)
    })

    it('een schok met pct 0 verandert de uitkomst niet', () => {
      const input = anyInput[0]
      const base = runKernelProjection(input, { fireAge: input.startLeeftijd + FIRE_AGE_OFFSET })
      const nul = runKernelProjection(
        { ...input, potMutaties: [{ maand: M, pct: 0, alleenInvestering: true }] },
        { fireAge: input.startLeeftijd + FIRE_AGE_OFFSET },
      )
      expect(nul.summary.eindNettoVermogen).toBeCloseTo(base.summary.eindNettoVermogen, 6)
    })
  })

  // ────────────────────────────────────────────────────────────────────────────
  // UITBREIDING 1 — market_shock (V9): schok vóór rendement
  // ────────────────────────────────────────────────────────────────────────────
  describe('market_shock (V9)', () => {
    const withInvestAndSpaar = fixtures
      .map((fx) => buildKernelInput(fx))
      .find(
        (i) =>
          i.assetPotten.some((p) => p.investering) &&
          i.assetPotten.some((p) => p.categorie === 'Spaargeld' && !p.investering),
      )

    it('vindt een fixture met investerings- én spaarpot', () => {
      expect(withInvestAndSpaar).toBeDefined()
    })

    it('halveert het rendement van investeringspotten op de schokmaand + verlaagt het eindvermogen', () => {
      const input = withInvestAndSpaar!
      const fireAge = input.startLeeftijd + FIRE_AGE_OFFSET
      const invSlot = input.assetPotten.find((p) => p.investering)!.slot

      const base = runKernelProjection(input, { fireAge })
      const shocked = runKernelProjection(
        { ...input, potMutaties: [{ maand: M, pct: -0.5, alleenInvestering: true }] },
        { fireAge },
      )

      const bezBase = computedBez(base.bez[M])
      const bezShock = computedBez(shocked.bez[M])
      // rendement(m) = waarde(m−1)·eff/12 → schaalt exact mee met de geschokte m−1.
      expect(bezShock.slots[invSlot].rendement).toBeCloseTo(bezBase.slots[invSlot].rendement * 0.5, 6)
      // De belegde grondslag daalt, het eindvermogen ligt lager (blijvend verlies).
      expect(bezShock.totaalBox3Investering).toBeLessThan(bezBase.totaalBox3Investering)
      expect(shocked.summary.eindNettoVermogen).toBeLessThan(base.summary.eindNettoVermogen)
    })

    it('alleenInvestering=true laat de spaarpot ongemoeid; false raakt hem wél', () => {
      const input = withInvestAndSpaar!
      const fireAge = input.startLeeftijd + FIRE_AGE_OFFSET
      const spaarSlot = input.assetPotten.find((p) => p.categorie === 'Spaargeld' && !p.investering)!.slot

      const base = computedBez(runKernelProjection(input, { fireAge }).bez[M])
      const invOnly = computedBez(
        runKernelProjection(
          { ...input, potMutaties: [{ maand: M, pct: -0.5, alleenInvestering: true }] },
          { fireAge },
        ).bez[M],
      )
      const broad = computedBez(
        runKernelProjection(
          { ...input, potMutaties: [{ maand: M, pct: -0.5, alleenInvestering: false }] },
          { fireAge },
        ).bez[M],
      )
      // Spaar-rendement ongewijzigd bij investerings-only, wél gehalveerd bij brede schok.
      expect(invOnly.slots[spaarSlot].rendement).toBeCloseTo(base.slots[spaarSlot].rendement, 6)
      expect(broad.slots[spaarSlot].rendement).toBeCloseTo(base.slots[spaarSlot].rendement * 0.5, 6)
    })

    it('een brede schok raakt de eigen-woning-pot NOOIT (die volgt het woningblok)', () => {
      const input = anyInput.find((i) => i.assetPotten.some((p) => p.rol === 'eigenHuis'))
      expect(input).toBeDefined()
      const fireAge = input!.startLeeftijd + FIRE_AGE_OFFSET
      const huisSlot = input!.assetPotten.find((p) => p.rol === 'eigenHuis')!.slot

      const base = computedBez(runKernelProjection(input!, { fireAge }).bez[M])
      const broad = computedBez(
        runKernelProjection(
          { ...input!, potMutaties: [{ maand: M, pct: -0.5, alleenInvestering: false }] },
          { fireAge },
        ).bez[M],
      )
      expect(broad.slots[huisSlot].waarde).toBeCloseTo(base.slots[huisSlot].waarde, 6)
      expect(broad.slots[huisSlot].rendement).toBeCloseTo(base.slots[huisSlot].rendement, 6)
    })
  })

  // ────────────────────────────────────────────────────────────────────────────
  // UITBREIDING 2 — dynamische schuld-slots + tekort-lening als getypte rol
  // ────────────────────────────────────────────────────────────────────────────
  describe('schuld-slot-cap ontgrensd', () => {
    const num = (v: number | ''): number => (typeof v === 'number' ? v : 0)

    // 7 reguliere schulden op slots 0,1,2,4,5,7,8 (7,8 vallen buiten de oude cap) +
    // een tekort-lening op slot 9 (NIET de hardcoded positie 6).
    const regularSlots = [0, 1, 2, 4, 5, 7, 8]
    const regulier: DebtPot[] = regularSlots.map((slot) => ({
      slot,
      naam: `schuld-${slot}`,
      box3Type: 'Geen Box 3 schuld',
      categorie: 'Consumptief',
      startwaarde: 10_000,
      aflossingPct: 0,
      aflossingEur: 1_200, // 100/mnd
      rente: 0.05,
      liquide: false,
      inSparenNaAflossing: false,
      rol: null,
    }))
    const tekort: DebtPot = {
      slot: 9,
      naam: 'Tekort-lening',
      box3Type: 'Box 3 schuld',
      categorie: 'Tekort',
      startwaarde: 1_000,
      aflossingPct: 0,
      aflossingEur: 0,
      rente: 0,
      liquide: false,
      inSparenNaAflossing: false,
      rol: 'tekortLening',
    }
    const synthetic = [...regulier, tekort]

    it('debtSlotCount groeit mee met de hoogste bezette slot (vloer = 7)', () => {
      expect(debtSlotCount(synthetic)).toBe(10)
      expect(debtSlotCount([])).toBe(7)
      expect(debtSlotCount(regulier)).toBe(9) // hoogste = 8 → 9
    })

    it('evolueert >7 schulden en lokaliseert de tekort-lening via de rol op slot 9', () => {
      const base = anyInput[0]
      const input: KernelInput = { ...base, schuldPotten: synthetic, tekortLeningRente: 0.06 }
      const nSlots = debtSlotCount(synthetic)
      const saldoVorige = Array.from(
        { length: nSlots },
        (_, i) => synthetic.find((p) => p.slot === i)?.startwaarde ?? 0,
      )
      const dep: SDep = {
        saldoVorige,
        verkocht: 0,
        opeetCap: 0,
        opeetOpname: 0,
        tekortBudget: 0,
        tekortAflossing: 0,
        extraAflossingBudget: [0, 0, 0, 0, 0],
        categorieCap: [0, 0, 0, 0, 0],
      }
      const row = computeS(input, dep, 1)

      // Alle 10 fysieke slots aanwezig (was gecapt op 7).
      expect(row.slots).toHaveLength(10)
      // Reguliere schuld op slot 8 (buiten de oude cap) amortiseert écht.
      expect(num(row.slots[8].saldo)).toBeCloseTo(9_900, 6)
      expect(num(row.slots[8].saldo)).toBeLessThan(10_000)
      // Lege slots (3, 6) blijven 0.
      expect(num(row.slots[3].saldo)).toBe(0)
      expect(num(row.slots[6].saldo)).toBe(0)
      // Tekort-rol op slot 9 (NIET 6): groeit met rente i.p.v. te amortiseren.
      expect(num(row.slots[9].saldo)).toBeCloseTo(1_000 + (1_000 * 0.06) / 12, 6)
      expect(num(row.slots[9].saldo)).toBeGreaterThan(1_000)

      // Totalen sluiten over álle 10 slots (reconciliatie).
      const somRegulier = regularSlots.reduce((s, slot) => s + num(row.slots[slot].saldo), 0)
      expect(num(row.totaalConsumptief)).toBeCloseTo(somRegulier, 6)
      expect(num(row.totaalGeenBox3)).toBeCloseTo(somRegulier, 6)
      expect(num(row.totaalBox3)).toBeCloseTo(num(row.slots[9].saldo), 6) // alleen tekort is Box 3-schuld
    })
  })

  // ────────────────────────────────────────────────────────────────────────────
  // UITBREIDING 3 — generieke pot-liquidaties
  // ────────────────────────────────────────────────────────────────────────────
  describe('generieke pot-liquidaties', () => {
    const withNonHouseSource = fixtures
      .map((fx) => buildKernelInput(fx))
      .find(
        (i) =>
          i.assetPotten.some((p) => p.rol !== 'eigenHuis' && p.categorie !== 'Spaargeld') &&
          i.assetPotten.some((p) => p.categorie === 'Spaargeld'),
      )

    it('vindt een fixture met een niet-huis-bron + een spaarbestemming', () => {
      expect(withNonHouseSource).toBeDefined()
    })

    it('zet de bronpot op de opbrengst → Spaargeld (netto van kosten) en teert het eindvermogen in', () => {
      const input = withNonHouseSource!
      const fireAge = input.startLeeftijd + FIRE_AGE_OFFSET
      const src = input.assetPotten.find((p) => p.rol !== 'eigenHuis' && p.categorie !== 'Spaargeld')!
      const kostenPct = 0.1

      const base = runKernelProjection(input, { fireAge })
      const liq = runKernelProjection(
        { ...input, potLiquidaties: [{ slot: src.slot, maand: M, kostenPct }] },
        { fireAge },
      )

      const bezPrevBase = computedBez(base.bez[M - 1])
      const bezBase = computedBez(base.bez[M])
      const bezLiq = computedBez(liq.bez[M])

      // Opbrengst = waarde(m−1) × (1 − kosten) landt exact als extra Spaargeld-inleg.
      const netto = bezPrevBase.slots[src.slot].waarde * (1 - kostenPct)
      expect(netto).toBeGreaterThan(0)
      expect(bezLiq.totaalSpaargeld - bezBase.totaalSpaargeld).toBeCloseTo(netto, 2)
      // Bronpot is (nagenoeg) leeg op de liquidatiemaand en het eindvermogen ligt lager
      // (de transactiekosten vernietigen waarde).
      expect(bezLiq.slots[src.slot].waarde).toBeLessThan(bezBase.slots[src.slot].waarde)
      expect(liq.summary.eindNettoVermogen).toBeLessThan(base.summary.eindNettoVermogen)
    })

    it('routeert naar een expliciete doelcategorie', () => {
      const input = withNonHouseSource!
      const fireAge = input.startLeeftijd + FIRE_AGE_OFFSET
      const src = input.assetPotten.find((p) => p.rol !== 'eigenHuis' && p.categorie !== 'Spaargeld')!
      // Kies een doelcategorie die potten heeft (anders vervalt de inleg) — Spaargeld.
      const base = computedBez(runKernelProjection(input, { fireAge }).bez[M])
      const liq = computedBez(
        runKernelProjection(
          { ...input, potLiquidaties: [{ slot: src.slot, maand: M, kostenPct: 0, doelCategorie: 'Spaargeld' }] },
          { fireAge },
        ).bez[M],
      )
      expect(liq.totaalSpaargeld).toBeGreaterThan(base.totaalSpaargeld)
    })
  })
}
