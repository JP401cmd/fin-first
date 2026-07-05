import { describe, it, expect } from 'vitest'
import {
  ALL_WEALTH_GROUPS,
  DEFAULT_GROUP_ORDER,
  WITHDRAWAL_ORDER_PRESETS,
  DEFICIT_ORDER_PRESETS,
  detectOrderPreset,
  resolvePotRules,
  type OrderPreset,
} from './pot-rules'

/**
 * Round-trip een preset-volgorde door de jsonb-sanitizer (via resolvePotRules):
 * een geldige permutatie moet er byte-identiek uitkomen. Dat bewijst dat de preset
 * geen groep mist/dupliceert en dus een geldige waterfall is.
 */
function roundTripWithdrawal(order: string[]): string[] {
  return resolvePotRules({ pot_rules: { withdrawal_order_groups: order } }).withdrawalOrderGroups
}

describe('order-presets — geldige permutaties', () => {
  const all: OrderPreset[] = [...WITHDRAWAL_ORDER_PRESETS, ...DEFICIT_ORDER_PRESETS]

  it('elke preset is een permutatie van de 5 groepen', () => {
    for (const preset of all) {
      expect(preset.order).toHaveLength(ALL_WEALTH_GROUPS.length)
      expect(new Set(preset.order).size).toBe(ALL_WEALTH_GROUPS.length)
      for (const g of ALL_WEALTH_GROUPS) {
        expect(preset.order).toContain(g)
      }
    }
  })

  it('elke preset overleeft de sanitizer ongewijzigd (round-trip)', () => {
    for (const preset of all) {
      expect(roundTripWithdrawal(preset.order)).toEqual(preset.order)
    }
  })

  it("'Liquide eerst' is gelijk aan de default-volgorde", () => {
    const liquide = WITHDRAWAL_ORDER_PRESETS.find((p) => p.id === 'liquide-eerst')
    expect(liquide?.order).toEqual(DEFAULT_GROUP_ORDER)
    expect(DEFICIT_ORDER_PRESETS.find((p) => p.id === 'liquide-eerst')?.order).toEqual(
      DEFAULT_GROUP_ORDER,
    )
  })

  it('onttrekkingsvolgorde heeft 4 presets, afname er 2 (geen pro-rata)', () => {
    expect(WITHDRAWAL_ORDER_PRESETS.map((p) => p.id)).toEqual([
      'liquide-eerst',
      'rendement-beschermen',
      'fiscaal-box3',
      'pensioen-sparen',
    ])
    expect(DEFICIT_ORDER_PRESETS.map((p) => p.id)).toEqual([
      'liquide-eerst',
      'rendement-beschermen',
    ])
  })
})

describe('detectOrderPreset', () => {
  it('herkent elke preset op zijn eigen volgorde', () => {
    for (const preset of WITHDRAWAL_ORDER_PRESETS) {
      expect(detectOrderPreset(preset.order, WITHDRAWAL_ORDER_PRESETS)).toBe(preset.id)
    }
  })

  it("geeft 'aangepast' voor een volgorde die met geen preset matcht", () => {
    // Draai de eerste twee groepen van 'liquide-eerst' om → geen preset meer.
    const custom = ['beleggingen', 'spaargeld', 'overig', 'pensioen', 'vastgoed'] as const
    expect(detectOrderPreset([...custom], WITHDRAWAL_ORDER_PRESETS)).toBe('aangepast')
  })

  it('respecteert de per-regel preset-set (fiscaal-box3 bestaat niet bij afname)', () => {
    const box3 = WITHDRAWAL_ORDER_PRESETS.find((p) => p.id === 'fiscaal-box3')!
    // Dezelfde volgorde is bij afname (kleinere set) 'aangepast'.
    expect(detectOrderPreset(box3.order, DEFICIT_ORDER_PRESETS)).toBe('aangepast')
  })
})
