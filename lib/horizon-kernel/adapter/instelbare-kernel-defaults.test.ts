import { describe, it, expect } from 'vitest'
import {
  buildBox3,
  buildEindstrategie,
  resolveHeffingvrijInkomenPP,
  type KernelAdapterProfile,
} from './params'
import { EXCEL_HEFFINGVRIJ_INKOMEN_PP } from './defaults'
import { buildConvergentieAdapterProfile } from '../convergentie-router'
import { buildWhatifKernelAdapterInput } from './whatif-varianten'
import { PARAMETER_BANDS } from '@/lib/parameters-band'

/**
 * TPR-12 — twee Excel-defaults zonder app-veld worden instelbaar:
 *   - P!B54 "niet-liquide meetellen in nalatenschap" ← profiles.fire_legacy_include_illiquid
 *   - P!B91 heffingvrij inkomen p.p. per jaar (werkelijk-tak) ← profiles.box3_heffingvrij_inkomen
 *
 * De invariant die telt: NULL/ontbrekend rekent BYTE-IDENTIEK aan vóór TPR-12 ('Nee' resp.
 * 1800); alleen een expliciete, geldige keuze verandert de kern-invoer. Beide velden reizen
 * mee over de convergentie- én de what-if-mapper (zelfde plan op elk oppervlak).
 */

const base: KernelAdapterProfile = {
  date_of_birth: '1980-01-01',
  fire_end_strategy: 'legacy',
  fire_end_age: 90,
  fire_legacy_amount: 100_000,
}

describe('buildEindstrategie — nietLiquideMeetellen (P!B54)', () => {
  it('NULL/ontbrekend → "Nee" (de bestaande kernel-default)', () => {
    expect(buildEindstrategie(base).nietLiquideMeetellen).toBe('Nee')
    expect(buildEindstrategie({ ...base, fire_legacy_include_illiquid: null }).nietLiquideMeetellen).toBe('Nee')
  })

  it('true → "Ja"; false → "Nee"', () => {
    expect(buildEindstrategie({ ...base, fire_legacy_include_illiquid: true }).nietLiquideMeetellen).toBe('Ja')
    expect(buildEindstrategie({ ...base, fire_legacy_include_illiquid: false }).nietLiquideMeetellen).toBe('Nee')
  })

  it('de rest van het eindstrategie-blok verandert niet mee', () => {
    const uit = buildEindstrategie(base)
    const aan = buildEindstrategie({ ...base, fire_legacy_include_illiquid: true })
    expect({ ...aan, nietLiquideMeetellen: 'Nee' }).toEqual(uit)
  })
})

describe('resolveHeffingvrijInkomenPP / buildBox3 — heffingvrij inkomen (P!B91)', () => {
  it('NULL/ontbrekend → Excel-default 1800', () => {
    expect(resolveHeffingvrijInkomenPP(base)).toBe(EXCEL_HEFFINGVRIJ_INKOMEN_PP)
    expect(resolveHeffingvrijInkomenPP({ ...base, box3_heffingvrij_inkomen: null })).toBe(EXCEL_HEFFINGVRIJ_INKOMEN_PP)
    expect(buildBox3(base, 2026).heffingvrijInkomenTotaal).toBe(EXCEL_HEFFINGVRIJ_INKOMEN_PP)
  })

  it('een geldige keuze telt letterlijk en schaalt × personen (P!B92)', () => {
    const p = { ...base, box3_heffingvrij_inkomen: 2500 }
    expect(resolveHeffingvrijInkomenPP(p)).toBe(2500)
    expect(buildBox3(p, 2026, 1).heffingvrijInkomenTotaal).toBe(2500)
    expect(buildBox3(p, 2026, 2).heffingvrijInkomenTotaal).toBe(5000)
  })

  it('een bewuste 0 telt als 0 (geen "leeg")', () => {
    expect(resolveHeffingvrijInkomenPP({ ...base, box3_heffingvrij_inkomen: 0 })).toBe(0)
  })

  it('numeric-kolom als string (PostgREST) wordt gelezen', () => {
    expect(resolveHeffingvrijInkomenPP({ ...base, box3_heffingvrij_inkomen: '2000' })).toBe(2000)
  })

  it('buiten de band (= DB-CHECK) of ongeldig → default, nooit een rare waarde', () => {
    const band = PARAMETER_BANDS.box3_heffingvrij_inkomen
    expect(resolveHeffingvrijInkomenPP({ ...base, box3_heffingvrij_inkomen: band.max + 1 })).toBe(EXCEL_HEFFINGVRIJ_INKOMEN_PP)
    expect(resolveHeffingvrijInkomenPP({ ...base, box3_heffingvrij_inkomen: -1 })).toBe(EXCEL_HEFFINGVRIJ_INKOMEN_PP)
    expect(resolveHeffingvrijInkomenPP({ ...base, box3_heffingvrij_inkomen: 'abc' })).toBe(EXCEL_HEFFINGVRIJ_INKOMEN_PP)
  })

  it('de overige Box 3-parameters zijn onafhankelijk van het veld', () => {
    const uit = buildBox3(base, 2026)
    const aan = buildBox3({ ...base, box3_heffingvrij_inkomen: 2500 }, 2026)
    expect({ ...aan, heffingvrijInkomenTotaal: uit.heffingvrijInkomenTotaal }).toEqual(uit)
  })
})

describe('beide velden reizen mee over de convergentie- en de what-if-mapper', () => {
  const row = {
    date_of_birth: '1980-01-01',
    fire_end_strategy: 'legacy',
    fire_end_age: 90,
    fire_legacy_amount: 100_000,
    fire_legacy_include_illiquid: true,
    box3_heffingvrij_inkomen: 2400,
  }

  it('convergentie (hoofdlijn /toekomst, /overzicht, live-sim)', () => {
    const mapped = buildConvergentieAdapterProfile(row)
    expect(mapped.fire_legacy_include_illiquid).toBe(true)
    expect(mapped.box3_heffingvrij_inkomen).toBe(2400)
    // Ontbrekend → null → adapter-default.
    const leeg = buildConvergentieAdapterProfile({ date_of_birth: '1980-01-01' })
    expect(leeg.fire_legacy_include_illiquid).toBeNull()
    expect(leeg.box3_heffingvrij_inkomen).toBeNull()
  })

  it('what-if (zelfde plan als de hoofdlijn)', () => {
    const out = buildWhatifKernelAdapterInput({ profile: row, assets: [], debts: [], lifeEvents: [] })
    expect(out.profile.fire_legacy_include_illiquid).toBe(true)
    expect(out.profile.box3_heffingvrij_inkomen).toBe(2400)
  })
})
