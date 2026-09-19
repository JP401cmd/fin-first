import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * runRegelProjection — de override op de rauwe kernel-context. Gepind voor TPR-15:
 * een kandidaat-verkoopinstelling vervangt alleen `sale_config` van de genoemde
 * bezitting; andere rijen en het profiel blijven identiek, en zonder override gaat de
 * context ongewijzigd naar de kern (geen default-drift t.o.v. de Tijdas).
 */

const ontvangen = vi.hoisted(() => ({ contexts: [] as unknown[] }))
vi.mock('@/lib/horizon-kernel/convergentie-router', () => ({
  computeConvergentieProjection: ({ rawContext }: { rawContext: unknown }) => {
    ontvangen.contexts.push(rawContext)
    return { ok: false }
  },
}))

import { runRegelProjection, type RegelSimSnapshot } from './regel-sim'

const AUTO = { id: 'a1', asset_type: 'vehicle', sale_config: null }
const KUNST = { id: 'a2', asset_type: 'physical', sale_config: { stand: 'niet_verkopen' } }

const snapshot = {
  rawContext: { profile: { housing_strategy_config: null }, assets: [AUTO, KUNST], debts: [], lifeEvents: [] },
} as unknown as RegelSimSnapshot

beforeEach(() => {
  ontvangen.contexts = []
})

describe('runRegelProjection — assetSaleConfigs', () => {
  it('zonder override gaat de rauwe context ongewijzigd naar de kern', () => {
    runRegelProjection(snapshot)
    expect(ontvangen.contexts[0]).toBe(snapshot.rawContext)
  })

  it('vervangt alleen sale_config van de genoemde bezitting', () => {
    runRegelProjection(snapshot, { assetSaleConfigs: { a1: { stand: 'vast_moment', triggerAge: 70 } } })
    const ctx = ontvangen.contexts[0] as { assets: unknown[]; profile: unknown }
    expect(ctx.assets[0]).toEqual({ ...AUTO, sale_config: { stand: 'vast_moment', triggerAge: 70 } })
    expect(ctx.assets[1]).toBe(KUNST)
    expect(ctx.profile).toEqual(snapshot.rawContext.profile)
    // De snapshot zelf is niet gemuteerd.
    expect(AUTO.sale_config).toBeNull()
  })

  it('een onbekend id verandert niets', () => {
    runRegelProjection(snapshot, { assetSaleConfigs: { onbekend: { stand: 'niet_verkopen' } } })
    const ctx = ontvangen.contexts[0] as { assets: unknown[] }
    expect(ctx.assets).toEqual([AUTO, KUNST])
  })
})

describe('runRegelProjection — lifeEvent (TPR-15 stap 3)', () => {
  const ev = (id: string, event_type: string) => ({ id, event_type, name: id }) as never
  const AOW = ev('e-aow', 'aow')
  const POT1 = ev('p1', 'pension')
  const POT2 = ev('p2', 'pension')
  const KIND = ev('k1', 'children')
  const metEvents = {
    rawContext: { ...snapshot.rawContext, lifeEvents: [AOW, POT1, POT2, KIND] },
  } as unknown as RegelSimSnapshot
  const lifeEvents = () => (ontvangen.contexts[0] as { lifeEvents: unknown[] }).lifeEvents

  it('vervangt per type alle rijen van dat type en laat de rest staan', () => {
    const draft = ev('aow-draft', 'aow')
    runRegelProjection(metEvents, { lifeEvent: { vervang: { eventType: 'aow' }, event: draft } })
    expect(lifeEvents()).toEqual([POT1, POT2, KIND, draft])
  })

  it('vervangt per id alleen die pot; id null voegt toe', () => {
    const nieuw = ev('p1', 'pension')
    runRegelProjection(metEvents, { lifeEvent: { vervang: { id: 'p1' }, event: nieuw } })
    expect(lifeEvents()).toEqual([AOW, POT2, KIND, nieuw])
    ontvangen.contexts = []
    const extra = ev('pension-draft', 'pension')
    runRegelProjection(metEvents, { lifeEvent: { vervang: { id: null }, event: extra } })
    expect(lifeEvents()).toEqual([AOW, POT1, POT2, KIND, extra])
  })

  it('event null laat alleen weg (vergelijking "zonder"), zonder de snapshot te muteren', () => {
    runRegelProjection(metEvents, { lifeEvent: { vervang: { eventType: 'pension' }, event: null } })
    expect(lifeEvents()).toEqual([AOW, KIND])
    expect((metEvents.rawContext.lifeEvents as unknown[]).length).toBe(4)
  })
})

describe('runRegelProjection — parameters en assetExpectedReturns (TPR-15 laag 2)', () => {
  const profiel = { housing_strategy_config: null, inflation_rate: 0.02, expected_return: 0.07, box3_method: 'forfaitair', box3_heffingvrij_inkomen: 1800 }
  const metProfiel = { rawContext: { ...snapshot.rawContext, profile: profiel } } as unknown as RegelSimSnapshot
  const ctx = () => ontvangen.contexts[0] as { profile: Record<string, unknown>; assets: Record<string, unknown>[] }

  it('zet alleen de meegegeven profielkolommen; de rest blijft staan', () => {
    runRegelProjection(metProfiel, { parameters: { inflation_rate: 0.03 } })
    expect(ctx().profile).toEqual({ ...profiel, inflation_rate: 0.03 })
    expect(profiel.inflation_rate).toBe(0.02)
  })

  it('box3_heffingvrij_inkomen null = terug naar de kernel-default (kolom leeg)', () => {
    runRegelProjection(metProfiel, { parameters: { box3_method: 'werkelijk', box3_heffingvrij_inkomen: null } })
    expect(ctx().profile.box3_method).toBe('werkelijk')
    expect(ctx().profile.box3_heffingvrij_inkomen).toBeNull()
  })

  it('vervangt expected_return (PERCENT) alleen van de genoemde bezitting, naast een sale_config-override', () => {
    runRegelProjection(metProfiel, {
      assetExpectedReturns: { a2: -5 },
      assetSaleConfigs: { a1: { stand: 'niet_verkopen' } },
    })
    expect(ctx().assets[0]).toEqual({ ...AUTO, sale_config: { stand: 'niet_verkopen' } })
    expect(ctx().assets[1]).toEqual({ ...KUNST, expected_return: -5 })
  })

  it('de override-sleutels zijn kolommen die de client-snapshot meestuurt', async () => {
    const { PROFIEL_KERNEL_KOLOMMEN } = await import('./regel-sim-snapshot')
    for (const kolom of ['inflation_rate', 'expected_return', 'box3_method', 'box3_heffingvrij_inkomen']) {
      expect(PROFIEL_KERNEL_KOLOMMEN as readonly string[]).toContain(kolom)
    }
  })
})

describe('runRegelProjection — cashflow (W-009)', () => {
  const metBedragen = {
    rawContext: {
      profile: { net_monthly_income: 3000, estimated_monthly_expenses: 2000 },
      assets: [],
      debts: [],
      lifeEvents: [],
    },
  } as unknown as RegelSimSnapshot

  it('zonder cashflow-override blijft de context byte-identiek (geen default-drift)', () => {
    runRegelProjection(metBedragen)
    expect(ontvangen.contexts[0]).toBe(metBedragen.rawContext)
  })

  it('vervangt precies de twee kasstroomvelden die withResolvedKernelBedragen ook vult', () => {
    runRegelProjection(metBedragen, { cashflow: { monthlyIncome: 4200, monthlyExpenses: 2500 } })
    const ctx = ontvangen.contexts[0] as { profile: Record<string, unknown> }
    expect(ctx.profile.net_monthly_income).toBe(4200)
    expect(ctx.profile.estimated_monthly_expenses).toBe(2500)
    // De snapshot zelf is niet gemuteerd.
    expect(metBedragen.rawContext.profile).toEqual({
      net_monthly_income: 3000,
      estimated_monthly_expenses: 2000,
    })
  })
})
