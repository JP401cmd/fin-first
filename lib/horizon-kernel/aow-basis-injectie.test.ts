/**
 * Regressie — **AOW-basis als kernel-INPUT i.p.v. hardcoded tabelconstante**
 * (gap-besluit V20, ADR 0064; kaart [Arch F4], eigenaar-keuze C).
 *
 * Vóór deze wijziging rekende de kern B21 onvoorwaardelijk op de Excel-oracle-basis
 * €1.452 (alleenstaand) / €993 (samenwonend, 2025-basis), terwijl de rest van de app
 * de canonieke SVB-bedragen uit `lib/constants.ts` toont. Sinds ADR 0064 is de basis
 * een OPTIONEEL invoerveld:
 *
 *  - **weggelaten** (`input-from-fixture`, parity-/fixture-pad) → oracle-fallback
 *    1452/993, byte-identiek aan `Core calc v5.xlsm`;
 *  - **gezet** (app-adapter via `APP_AOW_BASIS_PER_MAAND`) → `NL_AOW_MONTHLY` /
 *    `NL_AOW_MONTHLY_SAMENWONEND`, één grondslag met de rest van de app.
 *
 * Deze suite is het vangnet onder beide takken: de fallback mag nooit stilletjes
 * verschuiven (parity-breuk) en het app-pad mag nooit stilletjes terugvallen op de
 * oracle-basis (SSoT-breuk). Tolerantie: exacte gelijkheid op de B21-uitkomst
 * (geen geldbedrag-vergelijking over een projectie, maar één deterministische
 * formule-uitkomst — een relatieve tolerantie zou hier juist fouten verbergen).
 */

import { describe, it, expect } from 'vitest'
import { NL_AOW_MONTHLY, NL_AOW_MONTHLY_SAMENWONEND } from '@/lib/constants'
import { computeAutoGebeurtenissen } from '@/lib/horizon-kernel/tables/auto-gebeurtenissen'
import {
  APP_AOW_BASIS_PER_MAAND,
  AOW_SAMENWONEND_PP_PER_MAAND,
} from '@/lib/horizon-kernel/adapter/defaults'
import { NEUTRAL_AUTO_GEBEURTENISSEN } from '@/lib/horizon-kernel/adapter/params'
import type { AowBasisPerMaand, AutoGebeurtenisParams, KernelInput } from '@/lib/horizon-kernel/types'

/** Excel v5-oracle-basis (Auto-geb B21) — bewust hier herhaald als parity-anker. */
const ORACLE_ALLEENSTAAND = 1452
const ORACLE_SAMENWONEND = 993

const AUTO_BASIS: AutoGebeurtenisParams = {
  leefsituatie: 'Alleenstaand',
  aowOpbouwjaren: 50,
  aantalKinderen: 0,
  kindGeboorteLeeftijden: [0, 0, 0],
  nibudBasisPerMaand: 0,
  kinderopvangNettoPerMaand: 0,
  kinderbijslagPerMaand: 0,
  babyuitzetEenmalig: 0,
  erfenisBruto: 0,
  erfenisRelatie: 'kind',
  erfenisLeeftijd: 0,
  pensioenPotten: [],
}

/** Minimale KernelInput-stub: `computeAutoGebeurtenissen` leest alleen deze velden. */
function inputMet(auto: Partial<AutoGebeurtenisParams>): KernelInput {
  return {
    startLeeftijd: 40,
    inflatie: 0.02,
    persoon: { aowLeeftijd: 67 },
    autoGebeurtenissen: { ...AUTO_BASIS, ...auto },
  } as unknown as KernelInput
}

const b21 = (auto: Partial<AutoGebeurtenisParams>) =>
  computeAutoGebeurtenissen(inputMet(auto)).aowBedrag

describe('B21 zonder injectie — Excel-oracle-fallback (parity-pad)', () => {
  it('alleenstaand, volle opbouw → exact de oracle-basis 1452', () => {
    expect(b21({})).toBe(ORACLE_ALLEENSTAAND)
  })

  it('samenwonend, volle opbouw → exact de oracle-basis 993', () => {
    expect(b21({ leefsituatie: 'Samenwonend' })).toBe(ORACLE_SAMENWONEND)
  })

  it('opbouwkorting werkt op de oracle-basis (40/50 jaar)', () => {
    expect(b21({ aowOpbouwjaren: 40 })).toBe((ORACLE_ALLEENSTAAND * 40) / 50)
  })
})

describe('B21 mét injectie — canonieke SVB-basis (app-pad)', () => {
  it('alleenstaand → NL_AOW_MONTHLY', () => {
    expect(b21({ aowBasisPerMaand: APP_AOW_BASIS_PER_MAAND })).toBe(NL_AOW_MONTHLY)
  })

  it('samenwonend → NL_AOW_MONTHLY_SAMENWONEND', () => {
    expect(
      b21({ leefsituatie: 'Samenwonend', aowBasisPerMaand: APP_AOW_BASIS_PER_MAAND }),
    ).toBe(NL_AOW_MONTHLY_SAMENWONEND)
  })

  it('opbouwkorting werkt op de geïnjecteerde basis (40/50 jaar)', () => {
    expect(b21({ aowOpbouwjaren: 40, aowBasisPerMaand: APP_AOW_BASIS_PER_MAAND })).toBe(
      (NL_AOW_MONTHLY * 40) / 50,
    )
  })

  it('een willekeurige injectie wint van de fallback (geen stille terugval)', () => {
    const eigen: AowBasisPerMaand = { alleenstaand: 2000, samenwonend: 1500 }
    expect(b21({ aowBasisPerMaand: eigen })).toBe(2000)
    expect(b21({ leefsituatie: 'Samenwonend', aowBasisPerMaand: eigen })).toBe(1500)
  })
})

describe('Adapter-pad — één grondslag, geen eigen literals', () => {
  it('APP_AOW_BASIS_PER_MAAND is exact de canonieke bron (geen kopie)', () => {
    expect(APP_AOW_BASIS_PER_MAAND).toEqual({
      alleenstaand: NL_AOW_MONTHLY,
      samenwonend: NL_AOW_MONTHLY_SAMENWONEND,
    })
  })

  it('de adapter-basisinvoer injecteert de AOW-basis altijd (ook zonder AOW-event)', () => {
    expect(NEUTRAL_AUTO_GEBEURTENISSEN.aowBasisPerMaand).toBe(APP_AOW_BASIS_PER_MAAND)
  })

  it('partner-AOW (PT!B9) draait op dezelfde samenwonend-grondslag als B21', () => {
    expect(AOW_SAMENWONEND_PP_PER_MAAND).toBe(NL_AOW_MONTHLY_SAMENWONEND)
    expect(AOW_SAMENWONEND_PP_PER_MAAND).toBe(APP_AOW_BASIS_PER_MAAND.samenwonend)
  })

  it('de oracle-fallback wijkt aantoonbaar af van het app-pad (bewuste divergentie)', () => {
    expect(NL_AOW_MONTHLY).not.toBe(ORACLE_ALLEENSTAAND)
    expect(NL_AOW_MONTHLY_SAMENWONEND).not.toBe(ORACLE_SAMENWONEND)
  })
})

describe('Fixture-pad zet de injectie NIET (parity-borging)', () => {
  it('input-from-fixture laat aowBasisPerMaand weg', async () => {
    const { readFileSync } = await import('node:fs')
    const path = await import('node:path')
    const src = readFileSync(
      path.join(process.cwd(), 'lib', 'horizon-kernel', 'input-from-fixture.ts'),
      'utf8',
    )
    // Alleen de toelichtende comment mag het veld noemen — geen toewijzing.
    expect(src).not.toMatch(/^\s*aowBasisPerMaand:/m)
  })
})
