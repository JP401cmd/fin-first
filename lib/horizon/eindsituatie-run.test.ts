/**
 * De gedeelde samenstelling van de detector-invoer (laag C van de kaart "Fin kent je
 * plan-instellingen niet"). Bewaakt de acht afleidingen die eerder twee keer letterlijk
 * in de repo stonden — een drift daarin zou betekenen dat het totaalplan-rapport en
 * Fins context een ándere eindsituatie duiden op dezelfde run.
 */

import { describe, it, expect } from 'vitest'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import type { ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'
import { detectEindsituatie } from './eindsituatie-duiding'
import { detectEindsituatieForRun, type EindsituatieRunInput } from './eindsituatie-run'

function row(age: number, j: number, over: Partial<UnifiedProjectionRow> = {}): UnifiedProjectionRow {
  return {
    year: age - 50,
    age,
    phase: 'withdrawal',
    assetBuckets: {},
    debtBalances: {},
    totalAssets: 0,
    totalDebts: 0,
    netWorth: j,
    startNetWorth: 0,
    nettoLiquide: j,
    grossIncome: 0,
    savings: 0,
    withdrawal: 0,
    withdrawalByType: {},
    cashflowNet: 0,
    oneTimeNet: 0,
    totalGrowth: 0,
    totalBox3: 0,
    cumulativeBox3: 0,
    inflationFactor: 1,
    withdrawalNeed: { uitgaveTerm: U, huurNaVerkoop: 0, vervallenHypotheeklast: 0, box3: 0, partnerBijdrage: 0, totaalNeed: U, restMaandClamp: 0, nietGedekt: 0 },
    ...over,
  } as UnifiedProjectionRow
}

const U = 40_000

/** Stop op 55, dieptepunt bijna op 67, inkomen dekt vanaf 68, hoog restbedrag op 89. */
const ROWS: UnifiedProjectionRow[] = [
  row(55, 500_000),
  row(67, 5_000),
  row(68, 20_000, { grossIncome: 45_000 }),
  row(89, 900_000, { grossIncome: 45_000 }),
]

const PROFILE = { date_of_birth: '1976-01-01', fire_end_strategy: 'deplete', fire_end_age: 90 } as ConvergentieRawProfileRow

const SIM: EindsituatieRunInput['sim'] = {
  stopAnker: null,
  fireAgeFractional: 55,
  displayEndAge: 90,
  strategy: 'deplete',
}

function run(over: Partial<EindsituatieRunInput> = {}) {
  return detectEindsituatieForRun({ rows: ROWS, sim: SIM, profile: PROFILE, currentAge: 50, yearlyExpenses: U, ...over })
}

describe('detectEindsituatieForRun', () => {
  it('duidt de run en vindt de bindende oorzaak', () => {
    const d = run()!
    expect(d).not.toBeNull()
    expect(d.oorzaken.map((o) => o.id)).toContain('geen-tekort-lening')
    expect(d.eindAge).toBe(90)
  })

  it('is identiek aan een directe detectEindsituatie-aanroep met dezelfde afleidingen', () => {
    // Deze gelijkheid IS het contract: de helper mag geen eigen lezing introduceren.
    expect(run()).toEqual(
      detectEindsituatie({
        rows: ROWS,
        endForm: 'deplete',
        endAge: 90,
        legacyAmount: 0,
        legacyIncludeIlliquid: false,
        vastStopmoment: false,
        fireAgeFractional: 55,
        currentAge: 50,
        geenTekortLeningAan: true,
        jaarUitgavenNu: U,
      }),
    )
  })

  it('zwijgt zonder leeftijd', () => {
    expect(run({ currentAge: null })).toBeNull()
  })

  it('zwijgt onder een pensioen-anker (het eindbedrag is daar geen keuze van de gebruiker)', () => {
    expect(run({ sim: { ...SIM, strategy: 'pensioen' } })).toBeNull()
  })

  it('zwijgt onder een vast stopmoment (kernel-echo, niet de strategienaam)', () => {
    expect(run({ sim: { ...SIM, stopAnker: { soort: 'leeftijd', leeftijd: 60 } } })).toBeNull()
  })

  it('leest de tekort-lening-eis als AAN bij NULL/afwezig en alleen UIT bij een expliciete false', () => {
    const bindend = (p: Partial<ConvergentieRawProfileRow>) =>
      run({ profile: { ...PROFILE, ...p } })?.oorzaken.map((o) => o.id) ?? []
    expect(bindend({})).toContain('geen-tekort-lening')
    expect(bindend({ fire_no_deficit_loan: null })).toContain('geen-tekort-lening')
    expect(bindend({ fire_no_deficit_loan: true })).toContain('geen-tekort-lening')
    expect(bindend({ fire_no_deficit_loan: false })).not.toContain('geen-tekort-lening')
  })

  it('leest `fire_legacy_include_illiquid` strikt als `=== true` (grondslag I vs. J)', () => {
    // Bij nalatenschap MÉT niet-liquide bezit toetst de detector op `netWorth` (P!I),
    // anders op `nettoLiquide` (P!J). Een `!== false`-lezing zou NULL als "ja" nemen en
    // de grondslag stil omzetten. Rijen met netWorth ≫ nettoLiquide maken dat zichtbaar.
    const rijen = ROWS.map((r) => ({ ...r, netWorth: r.nettoLiquide + 600_000 }) as UnifiedProjectionRow)
    const legacy = { ...PROFILE, fire_end_strategy: 'legacy', fire_legacy_amount: 800_000 } as ConvergentieRawProfileRow
    // J = 900k, doel 800k ⇒ overschot 100k > drempel 40k ⇒ duiding op de J-grondslag.
    expect(run({ rows: rijen, profile: { ...legacy, fire_legacy_include_illiquid: null } })).not.toBeNull()
    // I = 1,5 mln ⇒ overschot 700k; alleen met `=== true` schakelt hij naar die grondslag.
    const opI = run({ rows: rijen, profile: { ...legacy, fire_legacy_include_illiquid: true } })
    const opJ = run({ rows: rijen, profile: { ...legacy, fire_legacy_include_illiquid: null } })
    expect(opI!.overschot.bedrag).toBeGreaterThan(opJ!.overschot.bedrag)
  })

  it('laat de eindleeftijd van de RUN winnen van de profiel-kolom', () => {
    // `displayEndAge` is de kernel-eindleeftijd; `fire_end_age` kan ervan afwijken
    // (perpetual/pensioen-cap). De run wint — zelfde lezing als /toekomst. Won de
    // profiel-kolom (70), dan was de eindrij 68 met €20k en viel de duiding weg.
    expect(run({ profile: { ...PROFILE, fire_end_age: 70 } })?.eindAge).toBe(90)
    // En zonder eindleeftijd op de run valt hij wél op het plan terug.
    expect(run({ sim: { ...SIM, displayEndAge: undefined as unknown as number }, profile: { ...PROFILE, fire_end_age: 70 } })).toBeNull()
  })
})
