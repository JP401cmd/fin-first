import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

/**
 * Bronscan-gate voor het LEESPAD van de tijdlijn (Krant 1C fase 2, patroon:
 * lib/krant/testeditie.gate.test.ts).
 *
 * `lib/krant/tijdlijn-lezen.ts`, `lib/krant/tijdlijn-bron.ts` en de route
 * `app/api/krant/tijdlijn/route.ts` mogen NOOIT de service-role gebruiken —
 * lezen gaat uitsluitend via de sessie-client onder de own-row-RLS van
 * migratie 20260922120000. En de route kiest zelf geen gebruiker: het id komt
 * uit `auth.getUser()`, nooit uit een query-param of body.
 *
 * Bron-scan; commentaar telt niet mee.
 */

const ROOT = join(__dirname, '..', '..')
const LEZEN_LIB = join(ROOT, 'lib/krant/tijdlijn-lezen.ts')
const BRON_LIB = join(ROOT, 'lib/krant/tijdlijn-bron.ts')
const ROUTE = join(ROOT, 'app/api/krant/tijdlijn/route.ts')

function code(pad: string): string {
  return readSourceLF(pad)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

describe('tijdlijn-lezen + tijdlijn-bron: geen service-role', () => {
  for (const [naam, pad] of [
    ['tijdlijn-lezen.ts', LEZEN_LIB],
    ['tijdlijn-bron.ts', BRON_LIB],
    ['app/api/krant/tijdlijn/route.ts', ROUTE],
  ] as const) {
    it(`${naam} importeert geen getServiceClient / lib/supabase/service`, () => {
      const bron = code(pad)
      expect(bron, naam).not.toMatch(/getServiceClient/)
      expect(bron, naam).not.toMatch(/@\/lib\/supabase\/service/)
      expect(bron, naam).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/)
    })
  }

  it('sentinel: de scan zou een service-role-import wél zien', () => {
    const stuk = `import { getServiceClient } from '@/lib/supabase/service'`
    expect(stuk).toMatch(/getServiceClient/)
    expect(stuk).toMatch(/@\/lib\/supabase\/service/)
  })
})

describe('app/api/krant/tijdlijn/route.ts: geen gebruiker uit het verzoek', () => {
  const route = code(ROUTE)

  it('gebruikt de sessie-client (@/lib/supabase/server) en haalt het id uit auth.getUser()', () => {
    expect(route).toMatch(/@\/lib\/supabase\/server/)
    expect(route).toContain('auth.getUser()')
    expect(route).toContain('user.id')
  })

  it('leest geen user-id uit de query of de body: searchParams levert alleen cursor/week/peek, nooit een user(id)', () => {
    // De route leest wél searchParams (cursor/week/peek) — dat mag; het gaat
    // erom dat er geen user-scoping-parameter (user/userId/uid/account) bij zit.
    expect(route).not.toMatch(/searchParams\.get\(\s*['"`](user|userId|uid|account|user_id)['"`]\s*\)/i)
    // GET zonder body: geen enkele request.json()/req.json() in dit bestand.
    expect(route).not.toMatch(/request\.json\(\)|req\.json\(\)/)
    // Geen andere HTTP-methoden die een body met een user-id zouden kunnen dragen.
    expect(route).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/)
  })

  it('sentinel: de scan zou een user-id-parameter wél zien', () => {
    const stuk = `const uid = new URL(request.url).searchParams.get('userId')`
    expect(stuk).toMatch(/searchParams\.get\(\s*['"`](user|userId|uid|account|user_id)['"`]\s*\)/i)
  })
})
