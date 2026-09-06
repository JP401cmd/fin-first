import { describe, it, expect } from 'vitest'
import { buildHorizonContext } from './horizon-context'

/**
 * Given de SELECT-policy op `assets` en `debts` "own or shared" is — eigen rijen
 * OF rijen van het huishouden met `ownership = 'shared'` — When de AI-context die
 * tabellen leest, Then moet de query ZELF op `user_id` scopen.
 *
 * RLS doet die scoping hier niet. Zonder eigen filter komen de gedeelde rijen van
 * de partner, inclusief het vrije-tekstveld `name`, verbatim in de promptcontext
 * terecht — buiten de privacy-bewuste perspectief-loaders om, en zonder dat
 * `privacy_settings` geraadpleegd is.
 *
 * De TOTAAL-regel (UR3-06) maakt dat zwaarder: die telt over exact deze
 * rijenverzameling op en instrueert het model de uitkomst letterlijk over te
 * nemen. Fin zou dan partnerschuld als eigen maandlast rapporteren, mét een
 * expliciet verbod om zelf te corrigeren.
 *
 * Bevinding uit de security-poort van 5 sep 2026; op dat moment latent (0
 * huishoudens, 0 gedeelde rijen op productie), scherp zodra huishoudens live gaan.
 */

type EqCall = [string, unknown]

/** Fake die elke `.eq()` in de keten registreert en de keten laat doorlopen. */
function makeSupabase(assets: unknown[], debts: unknown[], eqCalls: Record<string, EqCall[]>) {
  return {
    from: (table: string) => {
      eqCalls[table] ??= []
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          eqCalls[table].push([col, val])
          return chain
        },
        order: async () => ({ data: table === 'assets' ? assets : debts, error: null }),
      }
      return chain
    },
  } as never
}

const ASSET = {
  name: 'Beleggingsrekening',
  asset_type: 'investment',
  current_value: 50_000,
  expected_return: 6,
  monthly_contribution: 500,
  depreciation_rate: null,
  purchase_value: null,
  is_active: true,
}

const DEBT = {
  name: 'Hypotheek',
  debt_type: 'mortgage',
  current_balance: 200_000,
  interest_rate: 3.5,
  monthly_payment: 1_000,
  repayment_type: 'annuity',
  end_date: null,
}

describe('buildHorizonContext — eigen-scoping op assets en debts', () => {
  it('scopet de assets-query expliciet op user_id', async () => {
    const eqCalls: Record<string, EqCall[]> = {}
    await buildHorizonContext(makeSupabase([ASSET], [DEBT], eqCalls), 'user-1')
    expect(eqCalls.assets).toContainEqual(['user_id', 'user-1'])
  })

  it('scopet de debts-query expliciet op user_id', async () => {
    const eqCalls: Record<string, EqCall[]> = {}
    await buildHorizonContext(makeSupabase([ASSET], [DEBT], eqCalls), 'user-1')
    expect(eqCalls.debts).toContainEqual(['user_id', 'user-1'])
  })

  it('haalt zonder ingelogde gebruiker geen enkele rij op', async () => {
    const eqCalls: Record<string, EqCall[]> = {}
    const ctx = await buildHorizonContext(makeSupabase([ASSET], [DEBT], eqCalls), null)
    expect(eqCalls.assets ?? []).toHaveLength(0)
    expect(eqCalls.debts ?? []).toHaveLength(0)
    expect(ctx).toContain('Nog geen assets of schulden geregistreerd.')
  })
})
