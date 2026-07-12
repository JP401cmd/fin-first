// ── lookup-tool sanitize test (ADR 0035) ────────────────────────────
//
// The chat lookup tool returns transaction/asset/debt data as a
// tool-result that is re-injected into the model AFTER the one-time
// context sanitize. This verifies the tool sanitizes its own free
// strings (IBAN stripped, the user's own name → 'gebruiker') while
// keeping merchant names.

import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createLookupTool } from './lookup'

/** Minimal thenable query-builder that resolves to `result` for every chain. */
function makeBuilder(result: unknown) {
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  for (const m of ['select', 'order', 'limit', 'eq', 'gte', 'lt', 'in']) {
    builder[m] = chain
  }
  builder.single = () => Promise.resolve(result)
  builder.then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled)
  return builder
}

function makeSupabase(): SupabaseClient {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table: string) => {
      if (table === 'profiles') {
        return makeBuilder({ data: { full_name: 'Jan de Vries', date_of_birth: null } })
      }
      if (table === 'transactions') {
        return makeBuilder({
          data: [
            {
              date: '2026-01-15',
              amount: -42.5,
              description: 'Overboeking naar NL91ABNA0417164300',
              counterparty_name: 'Jan de Vries',
              is_income: false,
              budget: { name: 'Boodschappen', slug: 'boodschappen' },
            },
            {
              date: '2026-01-10',
              amount: -18.0,
              description: 'Betaling Albert Heijn',
              counterparty_name: 'Albert Heijn',
              is_income: false,
              budget: { name: 'Boodschappen', slug: 'boodschappen' },
            },
          ],
        })
      }
      return makeBuilder({ data: [] })
    },
  } as unknown as SupabaseClient
}

describe('createLookupTool — sanitizes tool-result strings', () => {
  it('strips IBAN and the user own name, keeps merchant names', async () => {
    const tool = createLookupTool(makeSupabase())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = (await (tool as any).execute({ type: 'transactions' }, {})) as Array<{
      description: string | null
      counterparty: string | null
      category: string
    }>

    const joined = JSON.stringify(res)
    expect(joined).not.toContain('ABNA')
    expect(joined).toContain('[IBAN]')
    // Own name replaced with the neutral label
    expect(joined).not.toContain('Jan')
    // Merchant name preserved (business identifier, needed for the answer)
    expect(res.some((r) => r.counterparty === 'Albert Heijn')).toBe(true)
  })
})
