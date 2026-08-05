import { describe, it, expect } from 'vitest'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import type { KernelPensionPotView } from '@/lib/horizon-kernel/bridge'
import {
  deriveOpeetLifespanFromRows,
  derivePensionPotEndFromRows,
} from './kernel-strategy-moments'

/**
 * Feature #876 — kernel-afgeleide strategiemomenten op de Gebeurtenissen-tab.
 * Randgevallen per delta-spec: geen opeet, opeet zonder uitputting binnen de
 * horizon, en een levenslange pensioenpot (= geen einde-rij).
 */

/** Minimale jaar-rij; alleen de velden die de afleidingen lezen zijn relevant. */
function makeRow(
  age: number,
  over: Partial<UnifiedProjectionRow> = {},
): UnifiedProjectionRow {
  return {
    year: age - 55,
    age,
    phase: 'withdrawal',
    assetBuckets: {},
    debtBalances: {},
    totalAssets: 0,
    totalDebts: 0,
    netWorth: 0,
    startNetWorth: 0,
    // Mock-rij: volledig liquide (Prognose!J == I) tenzij een test `nettoLiquide` zet.
    nettoLiquide: 0,
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
    ...over,
  }
}

// ── deriveOpeetLifespanFromRows ──────────────────────────────────────────────

describe('deriveOpeetLifespanFromRows', () => {
  it('null bij lege of ontbrekende rijen', () => {
    expect(deriveOpeetLifespanFromRows(null)).toBeNull()
    expect(deriveOpeetLifespanFromRows(undefined)).toBeNull()
    expect(deriveOpeetLifespanFromRows([])).toBeNull()
  })

  it('null zonder opeet-velden (alle niet-opeet-modi)', () => {
    expect(deriveOpeetLifespanFromRows([makeRow(55), makeRow(56)])).toBeNull()
  })

  it('null wanneer het venster actief is maar er nooit wordt opgenomen', () => {
    const rows = [makeRow(70, { opeetOpname: 0, opeetCap: 100_000 })]
    expect(deriveOpeetLifespanFromRows(rows)).toBeNull()
  })

  it('start = eerste jaar met opname > 0; zonder uitputting binnen horizon → depletionAge null', () => {
    const rows = [
      makeRow(69, { opeetOpname: 0, opeetCap: 0 }),
      makeRow(70, { opeetOpname: 12_000, opeetCap: 150_000 }),
      makeRow(71, { opeetOpname: 12_000, opeetCap: 155_000 }),
    ]
    expect(deriveOpeetLifespanFromRows(rows)).toEqual({
      startAge: 70,
      totalDrawn: 24_000,
      depletionAge: null,
    })
  })

  it('uitputting = eerste jaar ná start met opname 0 terwijl het venster actief is', () => {
    const rows = [
      makeRow(70, { opeetOpname: 18_000, opeetCap: 40_000 }),
      makeRow(71, { opeetOpname: 18_500.4, opeetCap: 41_000 }),
      makeRow(72, { opeetOpname: 0, opeetCap: 42_000 }),
      makeRow(73, { opeetOpname: 0, opeetCap: 43_000 }),
    ]
    expect(deriveOpeetLifespanFromRows(rows)).toEqual({
      startAge: 70,
      totalDrawn: 36_500, // afgerond
      depletionAge: 72, // eerste uitputtingsjaar, niet het tweede
    })
  })

  it('opname-0-jaar zonder actief venster (cap 0) telt NIET als uitputting', () => {
    const rows = [
      makeRow(70, { opeetOpname: 10_000, opeetCap: 40_000 }),
      makeRow(71, { opeetOpname: 0, opeetCap: 0 }),
    ]
    expect(deriveOpeetLifespanFromRows(rows)?.depletionAge).toBeNull()
  })
})

// ── derivePensionPotEndFromRows ──────────────────────────────────────────────

function makePot(over: Partial<KernelPensionPotView> = {}): KernelPensionPotView {
  return {
    naam: 'Lijfrente',
    ingangsLeeftijd: 67,
    eindLeeftijd: 87,
    maandbedrag: 500.6,
    levenslang: false,
    ...over,
  }
}

describe('derivePensionPotEndFromRows', () => {
  const rows = [makeRow(55), makeRow(56), makeRow(90)] // horizon 55..90

  it('lege invoer → geen eindes', () => {
    expect(derivePensionPotEndFromRows(null, [makePot()])).toEqual([])
    expect(derivePensionPotEndFromRows(rows, null)).toEqual([])
    expect(derivePensionPotEndFromRows(rows, [])).toEqual([])
  })

  it('eindige pot binnen horizon → einde-rij met afgerond maandbedrag', () => {
    expect(derivePensionPotEndFromRows(rows, [makePot()])).toEqual([
      { naam: 'Lijfrente', endAge: 87, maandbedrag: 501 },
    ])
  })

  it('levenslange pot (bedrijf/lijfrente_levenslang) → géén einde-rij', () => {
    const out = derivePensionPotEndFromRows(rows, [
      makePot({ naam: 'Bedrijfspensioen', levenslang: true, eindLeeftijd: 100 }),
    ])
    expect(out).toEqual([])
  })

  it('einde buiten de rij-horizon of vóór de eerste rij-leeftijd → géén rij', () => {
    const out = derivePensionPotEndFromRows(rows, [
      makePot({ naam: 'Te laat', eindLeeftijd: 95 }), // ná laatste rij (90)
      makePot({ naam: 'Al gestopt', eindLeeftijd: 55 }), // ≤ eerste rij (55)
    ])
    expect(out).toEqual([])
  })

  it('meerdere eindige potten gesorteerd op eind-leeftijd', () => {
    const out = derivePensionPotEndFromRows(rows, [
      makePot({ naam: 'B', eindLeeftijd: 87 }),
      makePot({ naam: 'A', eindLeeftijd: 77, maandbedrag: 250 }),
    ])
    expect(out.map((p) => p.naam)).toEqual(['A', 'B'])
  })
})
