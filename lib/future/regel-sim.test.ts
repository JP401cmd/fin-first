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
