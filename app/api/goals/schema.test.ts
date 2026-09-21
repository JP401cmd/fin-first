import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  CreateGoalSchema,
  UpdateGoalSchema,
  GOAL_TYPES,
  isAutoSyncGoalType,
  isLabOnlyGoalType,
  LAB_ONLY_GOAL_TYPE_MESSAGE,
} from './schema'
import { GOAL_TYPE_META } from '@/lib/goal-data'

/**
 * De schrijfpoort van `/api/goals`. Deze suite bewaakt vooral de eigenschap
 * waarvoor de poort er is: velden die de client NIET mag zetten (`metadata`,
 * `user_id`, `household_id`, `ownership` bij PATCH, de legacy-koppelkolommen)
 * halen het schema niet, ook niet stilzwijgend.
 */
describe('goals-schema — POST', () => {
  it('trimt, vult defaults en stript wat de client niet mag zetten', () => {
    const parsed = CreateGoalSchema.safeParse({
      name: '  Huis  ',
      target_value: '1234,50',
      metadata: { bron: 'parameter' },
      user_id: 'iemand-anders',
      household_id: 'ander-huishouden',
      linked_asset_id: randomUUID(),
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return

    expect(parsed.data.name).toBe('Huis')
    // nl-NL-invoer met komma leest als getal, niet als 0 (de oude route deed
    // `Number(x) || 0` en slikte daarmee ook onzin).
    expect(parsed.data.target_value).toBe(1234.5)
    expect(parsed.data.current_value).toBe(0)
    expect(parsed.data.goal_type).toBe('savings')
    expect(parsed.data.ownership).toBe('personal')
    expect(parsed.data.target_date).toBeNull()

    const keys = Object.keys(parsed.data)
    expect(keys).not.toContain('metadata')
    expect(keys).not.toContain('user_id')
    expect(keys).not.toContain('household_id')
    expect(keys).not.toContain('linked_asset_id')
  })

  it('dedupliceert koppelingen en begrenst het totaal', () => {
    const id = randomUUID()
    const parsed = CreateGoalSchema.safeParse({ name: 'x', links: { assetIds: [id, id] } })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.links).toEqual({ assetIds: [id], debtIds: [] })

    const tweeentwintig = Array.from({ length: 21 }, () => randomUUID())
    expect(CreateGoalSchema.safeParse({ name: 'x', links: { assetIds: tweeentwintig } }).success)
      .toBe(false)

    // Ook de SOM van bezittingen en schulden telt tegen het maximum.
    const elf = () => Array.from({ length: 11 }, () => randomUUID())
    expect(
      CreateGoalSchema.safeParse({ name: 'x', links: { assetIds: elf(), debtIds: elf() } }).success,
    ).toBe(false)
  })

  it('weigert onzin-invoer in plaats van hem naar 0 te laten zakken', () => {
    expect(CreateGoalSchema.safeParse({ name: 'x', target_value: 'abc' }).success).toBe(false)
    expect(CreateGoalSchema.safeParse({ name: '   ' }).success).toBe(false)
    expect(CreateGoalSchema.safeParse({ name: 'x', target_date: '01-09-2026' }).success).toBe(false)
    // 'wealth' is de niet-canonieke waarde die migratie 20260901140000 normaliseert.
    expect(CreateGoalSchema.safeParse({ name: 'x', goal_type: 'wealth' }).success).toBe(false)
    expect(CreateGoalSchema.safeParse({ name: 'x', sync: 'aan' }).success).toBe(false)
  })
})

describe('goals-schema — PATCH', () => {
  const id = randomUUID()

  it('houdt "afwezig" en "leeg" uit elkaar', () => {
    const partieel = UpdateGoalSchema.safeParse({ id, current_value: 42 })
    expect(partieel.success).toBe(true)
    if (!partieel.success) return
    expect(partieel.data.current_value).toBe(42)
    // Afwezig blijft afwezig — de route kopieert alleen gedefinieerde sleutels,
    // dus een niet-meegestuurd veld wordt nooit op null geschreven.
    expect(partieel.data.name).toBeUndefined()
    expect(partieel.data.description).toBeUndefined()
    expect(partieel.data.target_date).toBeUndefined()

    const gewist = UpdateGoalSchema.safeParse({ id, description: null, target_date: '', budget_id: null })
    expect(gewist.success).toBe(true)
    if (!gewist.success) return
    expect(gewist.data.description).toBeNull()
    expect(gewist.data.target_date).toBeNull()
    expect(gewist.data.budget_id).toBeNull()
  })

  it('stript de velden die een PATCH nooit mag zetten', () => {
    const parsed = UpdateGoalSchema.safeParse({
      id,
      ownership: 'shared',
      metadata: { sync: 'auto' },
      user_id: 'iemand-anders',
      household_id: 'ander-huishouden',
      linked_debt_id: randomUUID(),
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    for (const verboden of ['ownership', 'metadata', 'user_id', 'household_id', 'linked_debt_id']) {
      expect(verboden in parsed.data).toBe(false)
    }
  })

  it('eist een geldig doel-id', () => {
    expect(UpdateGoalSchema.safeParse({ current_value: 1 }).success).toBe(false)
    expect(UpdateGoalSchema.safeParse({ id: 'nope', current_value: 1 }).success).toBe(false)
  })
})

describe('goals-schema — doeltypen', () => {
  it('leidt de enum af uit de canonieke bron', () => {
    expect(GOAL_TYPES).toContain('savings')
    expect(GOAL_TYPES).toContain('fire_age')
    expect(GOAL_TYPES).toContain('custom')
  })

  it('POST weigert elk lab-type (viaLab) met de lab-tekst, zonder veldprefix', () => {
    const labTypes = GOAL_TYPES.filter((t) => GOAL_TYPE_META[t].viaLab === true)
    // Uitgebreid 20 sep 2026 met de drie knop-doelen: ook die ontstaan uitsluitend via
    // /api/toekomst-doel, dus een directe POST hoort er evengoed op af te ketsen.
    expect([...labTypes].sort()).toEqual([
      'expected_return',
      'extra_deposit',
      'fire_age',
      'legacy_amount',
      'plan_coverage',
      'retirement_expense',
    ])
    for (const t of labTypes) {
      expect(isLabOnlyGoalType(t)).toBe(true)
      const parsed = CreateGoalSchema.safeParse({ name: 'x', goal_type: t, target_value: 50 })
      expect(parsed.success, t).toBe(false)
      if (parsed.success) continue
      expect(parsed.error.issues[0].message).toBe(LAB_ONLY_GOAL_TYPE_MESSAGE)
      expect(parsed.error.issues[0].path).toEqual([])
    }
  })

  it('POST laat fire_age wél door als MEELOPENDE doelbasis (sync: auto, ADR 0125); plan_coverage/expected_return niet', () => {
    expect(CreateGoalSchema.safeParse({ name: 'Vrij op 55', goal_type: 'fire_age', target_value: 55, sync: 'auto' }).success).toBe(true)
    expect(CreateGoalSchema.safeParse({ name: 'x', goal_type: 'plan_coverage', target_value: 100, sync: 'auto' }).success).toBe(false)
    expect(CreateGoalSchema.safeParse({ name: 'x', goal_type: 'expected_return', target_value: 7, sync: 'auto' }).success).toBe(false)
  })

  it('POST laat de vrij aanmaakbare parameter-typen (savings_rate, salary) door', () => {
    expect(isLabOnlyGoalType('savings_rate')).toBe(false)
    expect(CreateGoalSchema.safeParse({ name: 'x', goal_type: 'savings_rate' }).success).toBe(true)
    expect(CreateGoalSchema.safeParse({ name: 'x', goal_type: 'salary' }).success).toBe(true)
  })

  it('PATCH-schema laat een lab-type staan (de route toetst of het type wisselt)', () => {
    expect(UpdateGoalSchema.safeParse({ id: randomUUID(), goal_type: 'fire_age', name: 'Vrij op 58' }).success).toBe(true)
  })

  it('kent auto-sync alleen toe aan typen met metricBasis', () => {
    expect(isAutoSyncGoalType('net_worth')).toBe(true)
    expect(isAutoSyncGoalType('savings_rate')).toBe(true)
    expect(isAutoSyncGoalType('end_balance')).toBe(true)
    expect(isAutoSyncGoalType('debt_free_date')).toBe(true)
    expect(isAutoSyncGoalType('tax_burden')).toBe(true)

    // Handmatige typen: een auto-sync-marker zou hier niets meesyncen.
    expect(isAutoSyncGoalType('custom')).toBe(false)
    expect(isAutoSyncGoalType('savings')).toBe(false)
    expect(isAutoSyncGoalType('freedom_days')).toBe(false)
  })
})
