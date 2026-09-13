/**
 * TPR-07 — server-side partnerblok voor de canonieke huishouden-FIRE-run.
 *
 * Toetst de privacy-/geschiktheidsroute op de loader-laag:
 *  - solo-gebruiker (geen huishouden) → null, RPC wordt NIET aangeroepen;
 *  - partner met toekomst verborgen (RPC levert future_hidden + NULL-velden) → null;
 *  - partner zonder geboortedatum → null;
 *  - happy path → blok met het gemapte partnerprofiel (en NIET het eigen profiel);
 *  - RPC-fout of niet-ingelogd → null (nooit een throw).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const getCachedPerspectiveContextMock = vi.fn()
vi.mock('@/lib/household/perspective-loader-server', () => ({
  getCachedPerspectiveContext: (...args: unknown[]) => getCachedPerspectiveContextMock(...args),
}))

import { loadPartnerKernelBlok } from './partner-kernel-blok'

const ME = 'user-me'
const PARTNER = 'user-partner'

const MY_ROW = { id: ME, date_of_birth: '1980-01-01', net_monthly_income: 5000, future_hidden: false }
const PARTNER_ROW = {
  id: PARTNER,
  date_of_birth: '1983-06-15',
  net_monthly_income: 2800,
  estimated_monthly_expenses: 1900,
  expected_return: 0.05,
  inflation_rate: 0.02,
  fire_end_strategy: 'deplete',
  fire_end_age: 90,
  fire_legacy_amount: null,
  retirement_expense_method: null,
  retirement_expense_custom_amount: null,
  future_hidden: false,
}

function makeSupabase(rpcResult: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(rpcResult)
  // Elke test een verse client-instantie: React cache() keyt op de instantie.
  return { client: { rpc } as never, rpc }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loadPartnerKernelBlok', () => {
  it('solo-gebruiker → null en géén RPC-aanroep', async () => {
    getCachedPerspectiveContextMock.mockResolvedValue({ hasHousehold: false, partnerId: null })
    const { client, rpc } = makeSupabase({ data: [MY_ROW], error: null })
    expect(await loadPartnerKernelBlok(client)).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('happy path → partnerblok met het PARTNER-profiel (niet het eigen)', async () => {
    getCachedPerspectiveContextMock.mockResolvedValue({ hasHousehold: true, partnerId: PARTNER })
    const { client, rpc } = makeSupabase({ data: [MY_ROW, PARTNER_ROW], error: null })
    const blok = await loadPartnerKernelBlok(client)
    expect(rpc).toHaveBeenCalledWith('household_member_profiles')
    expect(blok).not.toBeNull()
    expect(blok!.profile.date_of_birth).toBe('1983-06-15')
    expect(blok!.profile.net_monthly_income).toBe(2800)
    // Alleen het profiel — geen aowRows/lifeEvents-sleutels (adapter valt terug op top-level).
    expect(Object.keys(blok!)).toEqual(['profile'])
  })

  it('partner verbergt toekomst (RPC: future_hidden + NULL-velden) → null', async () => {
    getCachedPerspectiveContextMock.mockResolvedValue({ hasHousehold: true, partnerId: PARTNER })
    const hidden = { ...PARTNER_ROW, date_of_birth: null, net_monthly_income: null, future_hidden: true }
    const { client } = makeSupabase({ data: [MY_ROW, hidden], error: null })
    expect(await loadPartnerKernelBlok(client)).toBeNull()
  })

  it('partner zonder geboortedatum → null', async () => {
    getCachedPerspectiveContextMock.mockResolvedValue({ hasHousehold: true, partnerId: PARTNER })
    const { client } = makeSupabase({ data: [MY_ROW, { ...PARTNER_ROW, date_of_birth: null }], error: null })
    expect(await loadPartnerKernelBlok(client)).toBeNull()
  })

  it('RPC-fout → null; niet ingelogd (context gooit) → null', async () => {
    getCachedPerspectiveContextMock.mockResolvedValue({ hasHousehold: true, partnerId: PARTNER })
    const { client } = makeSupabase({ data: null, error: { message: 'boom' } })
    expect(await loadPartnerKernelBlok(client)).toBeNull()

    getCachedPerspectiveContextMock.mockRejectedValue(new Error('Not authenticated'))
    const { client: c2 } = makeSupabase({ data: [PARTNER_ROW], error: null })
    expect(await loadPartnerKernelBlok(c2)).toBeNull()
  })
})
