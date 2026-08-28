/**
 * Regressie — **échte annuïteit i.p.v. een bevroren aflossingsbedrag**
 * (kernel-extensie buiten het Excel v5-oracle; gap-besluit V22, ADR 0032-addendum).
 *
 * Bug (firsthand geverifieerd, 27-08-2026): `adapter/potten.ts` bevroor de
 * aflossingscomponent van VANDAAG (`computeRenteAflossingsSplit().currentAflossing`)
 * als constant jaarbedrag, en `tables/s.ts#regularSlot` paste dat constant toe over de
 * hele horizon. Bij een annuïteit hoort het aflossingsdeel juist te GROEIEN naarmate de
 * rente over een dalend saldo krimpt. Live-case: hypotheek €249.278,39 @4% met een
 * maandlast van €1.193,54 heeft vandaag een aflossingsdeel van €362,61 → bevroren duurt
 * aflossen ~687 maanden i.p.v. de werkelijke 358 (schuldenvrij pas rond leeftijd 103
 * i.p.v. 76). Gevolg-keten: `S!AF/AG` → `Prognose!totaalSchulden`/`nettoVermogen` →
 * netto vermogen structureel te laag en de FIRE-leeftijd te laat voor iedere
 * hypotheekhouder.
 *
 * Fix (`plannedMonthlyAt` in `tables/s.ts`, schakelbaar via
 * `input.echteAnnuiteitAflossing` + de pot-`annuiteitMaandlast` uit de adapter): de
 * rente/aflossing-split wordt PER MAAND herrekend,
 * `aflossing(m) = CLAMP(maandlast − saldo(m−1)·rente/12, 0, saldo(m−1))`, zodat het
 * saldo op de werkelijke einddatum €0 raakt. Vlag AAN = app-pad (adapter); vlag UIT én
 * geen `annuiteitMaandlast` = parity-/fixture-pad (byte-identiek oracle-gedrag).
 *
 * De harde eis uit ADR 0032 §4 (inert-by-default) wordt hier op unit-niveau gepind; de
 * euro-parity zelf staat in `test/horizon-oracle/` (die fixtures vullen het veld níet).
 *
 * ## Tolerantie-keuze (expliciet, per grootheid)
 * - **Saldo-op-einddatum**: absoluut €0,01 — een annuïteitsschema hóórt exact op 0 uit
 *   te komen; de enige ruis is float-afronding op centniveau. Een relatieve tolerantie
 *   is hier zinloos (de referentiewaarde is 0).
 * - **Afgeleide maandlast uit `end_date`**: absoluut €0,50 op ~€1.194. De term volgt uit
 *   `Math.round((end_date − now)/30.44 dagen)`, dus de PMT verschuift met de dag waarop
 *   de test draait; €0,50 dekt die drift zonder een echte scale-fout (×12, /12) te laten
 *   passeren.
 * - **Byte-identiteit inert-pad**: GEEN tolerantie — `toEqual` op de volledige
 *   saldo-reeks. Een tolerantie zou hier precies de foutklasse verbergen die de
 *   oracle-parity moet bewaken.
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { listFixtures, loadFixture } from './oracle/fixture-load'
import { buildKernelInput } from './input-from-fixture'
import { buildKernelInputFromAppWithNotices } from './adapter'
import { buildSchuldPotten } from './adapter/potten'
import { solveFire } from './solver'
import { computeS, type SDep } from './tables/s'
import type { DebtPot, KernelInput, WoningStrategieParams } from './types'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { computeRenteAflossingsSplit } from '@/lib/debt-data'

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const hasFixtures = existsSync(FIXTURE_DIR) && listFixtures(FIXTURE_DIR).length > 0

// ── De live-case uit de bugmelding (jpsmit, 27-08-2026) ──────────────────────────
const HYP_SALDO = 249_278.39
const HYP_RENTE = 0.04
const HYP_MAANDLAST = 1_193.54
/** Aflossingsdeel van vandaag: 1193,54 − 249278,39·0,04/12 = 362,61. */
const HYP_BEVROREN_AFLOSSING = HYP_MAANDLAST - (HYP_SALDO * HYP_RENTE) / 12
/** Werkelijke resterende looptijd (end_date 2056-06 t.o.v. de melding). */
const HYP_TERMIJN = 358

/** Reguliere slot (géén hypotheek-rol → geen AY-guard, géén opeet/tekort-tak). */
const REGULIER_SLOT = 1

function pot(over: Partial<DebtPot>): DebtPot {
  return {
    slot: REGULIER_SLOT,
    naam: 'test',
    box3Type: 'Box 3 schuld',
    categorie: 'Woning',
    startwaarde: 0,
    aflossingPct: 0,
    aflossingEur: 0,
    rente: 0,
    liquide: false,
    inSparenNaAflossing: false,
    rol: null,
    ...over,
  }
}

const NUL_DEP = {
  verkocht: 0,
  opeetCap: 0,
  opeetOpname: 0,
  tekortBudget: 0,
  tekortAflossing: 0,
  extraAflossingBudget: [0, 0, 0, 0, 0],
  categorieCap: [0, 0, 0, 0, 0],
} as const

/**
 * Draai één schuld-slot maand-op-maand door `computeS` en geef de saldo-reeks terug
 * (index = maand). Voedt `saldoVorige` uit de eigen vorige rij — precies zoals de
 * engine dat doet — zodat dit het échte recursie-gedrag test en niet een losse formule.
 */
function saldoReeks(base: KernelInput, p: DebtPot, months: number, vlag: boolean): number[] {
  const input: KernelInput = {
    ...base,
    schuldPotten: [p],
    ...(vlag ? { echteAnnuiteitAflossing: true } : {}),
  }
  const reeks: number[] = []
  let vorig = 0
  for (let m = 0; m <= months; m++) {
    const dep: SDep = { ...NUL_DEP, saldoVorige: Array.from({ length: 7 }, (_, i) => (i === REGULIER_SLOT ? vorig : 0)) }
    const cel = computeS(input, dep, m).slots[REGULIER_SLOT].saldo
    // Voorbij de horizon (leeftijd > 100) leegt Excel de kolom; die maanden zijn hier
    // niet interessant — de tests blijven ruim binnen de horizon.
    const saldo = typeof cel === 'number' ? cel : vorig
    reeks.push(saldo)
    vorig = saldo
  }
  return reeks
}

if (!hasFixtures) {
  describe.skip('horizon-kernel · echte annuïteit (fixtures nog niet geëxtraheerd)', () => {
    it('overgeslagen tot de extractor fixtures heeft geschreven', () => {
      expect(hasFixtures).toBe(false)
    })
  })
} else {
  const base = buildKernelInput(loadFixture(listFixtures(FIXTURE_DIR)[0]))

  describe('kernel · S-tabel: échte annuïteit vs. bevroren aflossing (gap V22)', () => {
    it('annuïteit: saldo raakt €0 op de werkelijke einddatum (358 mnd) — mét vlag', () => {
      const p = pot({
        startwaarde: HYP_SALDO,
        rente: HYP_RENTE,
        aflossingEur: HYP_BEVROREN_AFLOSSING * 12,
        annuiteitMaandlast: HYP_MAANDLAST,
      })
      const reeks = saldoReeks(base, p, HYP_TERMIJN + 2, true)

      // Nog schuld één maand vóór de einddatum, en exact afgelost op de einddatum.
      expect(reeks[HYP_TERMIJN - 1]).toBeGreaterThan(0)
      expect(reeks[HYP_TERMIJN]).toBeCloseTo(0, 2) // absoluut €0,01 — zie kop
      // Monotoon dalend: het aflossingsdeel groeit, het saldo loopt nooit op.
      for (let m = 2; m <= HYP_TERMIJN; m++) expect(reeks[m]).toBeLessThan(reeks[m - 1])
    })

    it('annuïteit: ZONDER vlag blijft >€100k staan op maand 358 (het gemelde defect)', () => {
      const p = pot({
        startwaarde: HYP_SALDO,
        rente: HYP_RENTE,
        aflossingEur: HYP_BEVROREN_AFLOSSING * 12,
        annuiteitMaandlast: HYP_MAANDLAST,
      })
      const reeks = saldoReeks(base, p, HYP_TERMIJN, false)
      // 249.278 − 358 × 362,61 ≈ 119.464 → de schuld lost ~5× te langzaam af.
      expect(reeks[HYP_TERMIJN]).toBeGreaterThan(100_000)
    })

    it('aflossingsvrij lost NIET ineens af (geen maandlast → saldo blijft vlak)', () => {
      const p = pot({ startwaarde: 800, rente: 0.1, aflossingEur: 0, categorie: 'Consumptief' })
      const reeks = saldoReeks(base, p, 120, true)
      for (let m = 0; m <= 120; m++) expect(reeks[m]).toBe(800)
    })

    it('lineair houdt zijn vaste aflossing — vlag AAN is byte-identiek aan vlag UIT', () => {
      // DUO-vorm: €40.000 / 180 mnd, 0% rente → vaste €222,22.
      const p = pot({ startwaarde: 40_000, rente: 0, aflossingEur: (40_000 / 180) * 12, categorie: 'Studie' })
      expect(saldoReeks(base, p, 200, true)).toEqual(saldoReeks(base, p, 200, false))
    })

    it('creditcard (vaste maandlast, hoge rente) lost sneller af mét vlag', () => {
      const maandlast = 150
      const startwaarde = 5_000
      const rente = 0.14
      const bevroren = maandlast - (startwaarde * rente) / 12 // 91,67
      const p = pot({
        startwaarde,
        rente,
        aflossingEur: bevroren * 12,
        annuiteitMaandlast: maandlast,
        categorie: 'Consumptief',
      })
      const eerste0 = (reeks: number[]) => reeks.findIndex((s, m) => m > 0 && s <= 0.01)

      const metVlag = eerste0(saldoReeks(base, p, 80, true))
      const zonderVlag = eerste0(saldoReeks(base, p, 80, false))
      expect(metVlag).toBeGreaterThan(0)
      expect(metVlag).toBeLessThanOrEqual(43) // PMT-looptijd bij 14%
      expect(zonderVlag).toBeGreaterThan(50) // bevroren: 5000/91,67 ≈ 55
    })

    it('negatieve amortisatie (maandlast ≤ rente) laat de schuld stagneren, niet groeien', () => {
      const p = pot({ startwaarde: 10_000, rente: 0.12, aflossingEur: 0, annuiteitMaandlast: 50 })
      const reeks = saldoReeks(base, p, 24, true)
      for (let m = 0; m <= 24; m++) expect(reeks[m]).toBe(10_000)
    })

    it('INERT-BY-DEFAULT: pot zónder annuiteitMaandlast is byte-identiek met vlag AAN/UIT', () => {
      const p = pot({ startwaarde: HYP_SALDO, rente: HYP_RENTE, aflossingEur: HYP_BEVROREN_AFLOSSING * 12 })
      expect(saldoReeks(base, p, 400, true)).toEqual(saldoReeks(base, p, 400, false))
    })
  })
}

// ── Adapter: welke schuldvariant krijgt een `annuiteitMaandlast`? ────────────────
const GEEN_WONING: WoningStrategieParams = {
  selector: 'Niet verkopen',
} as unknown as WoningStrategieParams

function debt(over: Partial<Debt>): Debt {
  return {
    id: 'd1',
    name: 'schuld',
    debt_type: 'personal_loan',
    current_balance: 10_000,
    interest_rate: 5,
    monthly_payment: 200,
    is_active: true,
    ...over,
  } as unknown as Debt
}

/** `annuiteitMaandlast` van de eerste niet-synthetische pot (slot ≠ 3/6). */
function maandlastVan(d: Debt): number | undefined {
  const potten = buildSchuldPotten([d], new Set(), 0.05, GEEN_WONING)
  return potten.find((p) => p.rol === null || p.rol === 'hypotheek')?.annuiteitMaandlast
}

/** end_date die `computeRenteAflossingsSplit` als ~`m` resterende maanden leest. */
function eindDatumOver(maanden: number): string {
  return new Date(Date.now() + maanden * 30.44 * 24 * 3600 * 1000).toISOString().slice(0, 10)
}

describe('adapter · annuiteitMaandlast per schuldvariant (gap V22)', () => {
  it('annuïteit-hypotheek krijgt de constante maandlast (live-case)', () => {
    const d = debt({
      debt_type: 'mortgage',
      repayment_type: 'annuiteit',
      current_balance: HYP_SALDO,
      interest_rate: 4,
      monthly_payment: HYP_MAANDLAST,
      end_date: eindDatumOver(HYP_TERMIJN),
    })
    // Zelfde bron als de kern gebruikt — geen tweede PMT-formule in de test.
    const split = computeRenteAflossingsSplit(d)
    expect(maandlastVan(d)).toBeCloseTo(split!.monthlyPayment, 6)
    expect(maandlastVan(d)).toBeCloseTo(HYP_MAANDLAST, 1) // absoluut €0,50-orde — zie kop
  })

  it('lineair krijgt GEEN maandlast (vaste aflossing is al juist in het oracle)', () => {
    expect(maandlastVan(debt({ repayment_type: 'lineair', end_date: eindDatumOver(180) }))).toBeUndefined()
  })

  it('aflossingsvrij krijgt GEEN maandlast (mag niet ineens gaan aflossen)', () => {
    expect(maandlastVan(debt({ repayment_type: 'aflossingsvrij' }))).toBeUndefined()
  })

  it('creditcard met vaste maandlast (repayment_type null) telt als annuïteit', () => {
    const d = debt({ debt_type: 'credit_card', repayment_type: null, current_balance: 5_000, interest_rate: 14, monthly_payment: 150 })
    expect(maandlastVan(d)).toBeCloseTo(150, 6)
  })

  it('creditcard die expliciet aflossingsvrij is, krijgt GEEN maandlast', () => {
    const d = debt({ debt_type: 'credit_card', repayment_type: 'aflossingsvrij', current_balance: 5_000, interest_rate: 14, monthly_payment: 58.33 })
    expect(maandlastVan(d)).toBeUndefined()
  })

  it('custom_aflossing_amount wint: gebruiker-vastgezet tempo blijft constant', () => {
    const d = debt({ repayment_type: 'annuiteit', custom_aflossing_amount: 300, end_date: eindDatumOver(60) })
    expect(maandlastVan(d)).toBeUndefined()
  })

  it('maandlast ≤ rente (lost niets af) → geen maandlast, oracle-pad blijft', () => {
    const d = debt({ repayment_type: 'annuiteit', current_balance: 10_000, interest_rate: 12, monthly_payment: 50 })
    expect(maandlastVan(d)).toBeUndefined()
  })

  it('inclusion_pct schaalt de maandlast mee met de startwaarde', () => {
    const over = { repayment_type: 'annuiteit' as const, current_balance: 100_000, interest_rate: 4, monthly_payment: 600, end_date: eindDatumOver(240) }
    const vol = maandlastVan(debt(over))!
    const half = maandlastVan(debt({ ...over, net_worth_inclusion_pct: 50 }))!
    expect(half).toBeCloseTo(vol / 2, 6)
  })
})

// ── Doorwerking: totaalSchulden / nettoVermogen bewegen mee ──────────────────────
const assets: Asset[] = [
  { id: 'a1', name: 'Spaarrekening', asset_type: 'savings', current_value: 40_000, expected_return: 2.5, monthly_contribution: 0, is_active: true } as unknown as Asset,
  { id: 'a3', name: 'Mijn woning', asset_type: 'eigen_huis', current_value: 500_000, expected_return: 3.5, monthly_contribution: 0, is_active: true } as unknown as Asset,
]
const debts: Debt[] = [
  debt({
    id: 'd3', name: 'Hypotheek — Mijn woning', debt_type: 'mortgage', repayment_type: 'annuiteit',
    current_balance: HYP_SALDO, interest_rate: 4, monthly_payment: HYP_MAANDLAST,
    end_date: eindDatumOver(HYP_TERMIJN), linked_asset_id: 'a3',
  }),
]
const adapterInput = {
  profile: {
    date_of_birth: '1980-01-01', net_monthly_income: 5000, estimated_monthly_expenses: 3500,
    yearly_essential_expenses: 42000, expected_return: 0.07, inflation_rate: 0.02,
    box3_method: 'forfaitair', marginaal_tarief: 0.495, fire_end_strategy: 'deplete',
    fire_end_age: 90, fire_legacy_amount: null, feature_preferences: { horizon_kernel_convergentie: true },
    withdrawal_strategy: 'static', guardrail_floor: 0.8, guardrail_ceiling: 1.2,
    guardrail_cut_step: 0.1, guardrail_raise_step: 0.1,
    housing_strategy_config: { mode: 'keep' },
    pot_rules: { surplus_group: 'beleggingen', deficit_order_groups: ['spaargeld', 'beleggingen', 'overig', 'pensioen', 'vastgoed'], withdrawal_order_groups: ['spaargeld', 'beleggingen', 'overig', 'pensioen', 'vastgoed'] },
    retirement_expense_method: 'essential_budgets', retirement_custom_amount: null,
  },
  assets, debts, lifeEvents: [],
}

describe('kernel · doorwerking naar totaalSchulden / nettoVermogen (gap V22)', () => {
  const input = buildKernelInputFromAppWithNotices(adapterInput as never).input

  it('de app-adapter zet echteAnnuiteitAflossing AAN', () => {
    expect(input.echteAnnuiteitAflossing).toBe(true)
  })

  it('de hypotheek-pot draagt een annuiteitMaandlast', () => {
    const hyp = input.schuldPotten.find((p) => p.rol === 'hypotheek')
    expect(hyp?.annuiteitMaandlast).toBeCloseTo(HYP_MAANDLAST, 1)
  })

  it('op de einddatum is de schuld weg en het netto vermogen hoger dan zonder de vlag', () => {
    const aan = solveFire(input)
    const uit = solveFire({ ...input, echteAnnuiteitAflossing: false })
    const rij = (r: ReturnType<typeof solveFire>, m: number) => {
      const p = r.projection.prognose[m]
      return p && !p.beyondHorizon ? p : null
    }
    const mEind = HYP_TERMIJN
    const aanEind = rij(aan, mEind)
    const uitEind = rij(uit, mEind)
    expect(aanEind).not.toBeNull()
    expect(uitEind).not.toBeNull()

    // Schuld weg mét vlag (alleen de hypotheek staat er); zonder vlag > €100k over.
    expect(aanEind!.totaalSchulden).toBeCloseTo(0, 2)
    expect(uitEind!.totaalSchulden).toBeGreaterThan(100_000)
    // Netto vermogen beweegt precies mee: minder schuld = meer vermogen.
    expect(aanEind!.nettoVermogen).toBeGreaterThan(uitEind!.nettoVermogen)
  })
})
