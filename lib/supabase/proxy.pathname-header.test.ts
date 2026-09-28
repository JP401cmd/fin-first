import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { KRANT_HOME_HREF, KRANT_ROUTES, PATHNAME_HEADER } from '@/lib/modules/krant-grens'

/**
 * De proxy geeft het pad door aan de layout (Krant 2B).
 *
 * De layout kent zijn eigen pad niet; de Krant-grens hangt aan deze header. Twee
 * dingen moeten waar zijn, anders is "fail-closed zonder lus" een belofte zonder
 * grond:
 *   1. de header staat op élk doorgelaten verzoek, óók nadat `setAll` de
 *      response herbouwt (cookie-refresh), en een client-waarde wordt overschreven;
 *   2. de matcher van `proxy.ts` pakt /nieuws en de andere grensroutes, zodat het
 *      vervolgverzoek na een fail-closed redirect de header wél draagt.
 */

const { claims, refreshCookies } = vi.hoisted(() => ({
  claims: { value: { sub: 'user-1' } as Record<string, unknown> | null },
  refreshCookies: { value: false },
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: { cookies: { setAll: (c: { name: string; value: string; options?: object }[]) => void } },
  ) => ({
    auth: {
      getClaims: async () => {
        // Simuleer een token-rotatie: dat is het pad waarin de response herbouwd wordt.
        if (refreshCookies.value) opts.cookies.setAll([{ name: 'sb-test-auth-token', value: 'nieuw' }])
        return { data: { claims: claims.value } }
      },
    },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
  }),
}))

import { updateSession } from './proxy'
import { config } from '../../proxy'

/** De door NextResponse.next doorgegeven request-header (Next's middleware-contract). */
function forwarded(res: Response, name: string): string | null {
  return res.headers.get(`x-middleware-request-${name}`)
}

beforeEach(() => {
  claims.value = { sub: 'user-1' }
  refreshCookies.value = false
})

describe('proxy — pad als request-header voor de layout', () => {
  it.each(['/nieuws', '/overzicht', '/mijn/account', '/beheer/nieuws'])('zet %s op de doorgegeven request', async (path) => {
    const res = await updateSession(new NextRequest(`https://x.test${path}`))
    expect(forwarded(res, PATHNAME_HEADER)).toBe(path)
  })

  it('ook na een cookie-refresh (setAll herbouwt de response) blijft de header staan, naast de nieuwe cookie', async () => {
    refreshCookies.value = true
    const res = await updateSession(new NextRequest('https://x.test/toekomst'))
    expect(forwarded(res, PATHNAME_HEADER)).toBe('/toekomst')
    expect(forwarded(res, 'cookie')).toContain('sb-test-auth-token=nieuw')
  })

  it('een door de client meegestuurde waarde wordt overschreven', async () => {
    const req = new NextRequest('https://x.test/overzicht', { headers: { [PATHNAME_HEADER]: '/nieuws' } })
    const res = await updateSession(req)
    expect(forwarded(res, PATHNAME_HEADER)).toBe('/overzicht')
  })

  it('bestaande request-headers reizen ongewijzigd mee', async () => {
    const req = new NextRequest('https://x.test/overzicht', { headers: { 'accept-language': 'nl-NL' } })
    const res = await updateSession(req)
    expect(forwarded(res, 'accept-language')).toBe('nl-NL')
  })
})

describe('proxy-matcher dekt de Krant-grens (geen redirect-lus bij een ontbrekende header)', () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`)

  it.each([KRANT_HOME_HREF, ...KRANT_ROUTES, '/overzicht', '/mijn'])('%s gaat door de proxy', (path) => {
    expect(matcher.test(path)).toBe(true)
  })
})
