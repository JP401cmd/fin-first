import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

/**
 * De grens van de testsectie en het meting-paneel, in de bron vastgelegd.
 *
 * WAAROM DEZE TEST BESTAAT. De fail-closed ADR 0146-gate
 * (lib/beheer/geen-inhoud.test.ts) scant beheer-bronnen: app/api/admin,
 * app/(app)/beheer, components/app/beheer, lib/beheer, plus élke route die
 * `isSuperAdmin` gebruikt. Fase 3 voegt twee oppervlakken toe die daar net
 * buiten of net binnen vallen, en in beide gevallen is de bescherming iets
 * anders dan een kolomlijst:
 *
 *   1. `GET /api/admin/krant-meting` is een échte beheer-route. Hij leest
 *      daarom UITSLUITEND `job_runs` (VRIJ_LEESBAAR: operationele log, en de
 *      k=5-onderdrukking zit al in de cron-summary). Zou hij ooit
 *      `krant_edities` gaan lezen, dan moet dat een bewuste verruiming van de
 *      gate zijn — deze test maakt die stap zichtbaar (openstaande G6).
 *
 *   2. `GET /api/krant/testeditie` leest wél editie-inhoud, maar alleen de
 *      EIGEN rij van de aanroeper, via de sessie-client onder own-row-RLS. Een
 *      superadmin ziet daar zijn eigen editie, nooit die van een ander. Die
 *      belofte hangt aan twee dingen: geen service-role, en geen gebruikers-id
 *      uit het verzoek. Dát toetst deze test — de gate kan het niet zien.
 *
 * Bron-scan; commentaar telt niet mee (anders zou deze toelichting zelf de
 * test rood maken).
 */

const ROOT = join(__dirname, '..', '..')
const METING_ROUTE = join(ROOT, 'app/api/admin/krant-meting/route.ts')
const TESTEDITIE_ROUTE = join(ROOT, 'app/api/krant/testeditie/route.ts')
const TESTEDITIE_LIB = join(ROOT, 'lib/krant/testeditie.ts')
const TOEGANG_LIB = join(ROOT, 'lib/krant/testeditie-toegang.ts')

function code(pad: string): string {
  return readSourceLF(pad)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

function tabellen(bron: string): string[] {
  return [...bron.matchAll(/\.from\(\s*['"`]([\w.]+)['"`]\s*\)/g)].map((m) => m[1])
}

describe('meting-route: alleen job_runs (G6 — de ADR 0146-gate hoeft niet te verruimen)', () => {
  const bron = code(METING_ROUTE)

  it('leest geen enkele Krant-tabel', () => {
    expect(tabellen(bron)).toEqual(['job_runs'])
    for (const t of ['krant_edities', 'krant_editie_items', 'nieuwsprofiel']) {
      expect(bron, t).not.toContain(t)
    }
  })

  it('gebruikt de sessie-client met de superadmin-gate, geen service-role', () => {
    expect(bron).toContain('isSuperAdmin')
    expect(bron).toMatch(/@\/lib\/supabase\/server/)
    expect(bron).not.toMatch(/getServiceClient|SERVICE_ROLE/)
  })

  it('sentinel: de scan zou een nieuwe tabel wél zien', () => {
    expect(tabellen(`x.from('job_runs').select('summary'); y.from('krant_edities').select('tekst')`)).toEqual([
      'job_runs',
      'krant_edities',
    ])
  })
})

describe('testsectie-route: eigen rij, sessie-client, geen id uit het verzoek', () => {
  const route = code(TESTEDITIE_ROUTE)
  const lib = code(TESTEDITIE_LIB)
  const toegang = code(TOEGANG_LIB)

  it('nergens een service-role-client: RLS is hier de grens', () => {
    for (const [naam, bron] of [
      ['route', route],
      ['lib', lib],
      ['toegang', toegang],
    ] as const) {
      expect(bron, naam).not.toMatch(/getServiceClient|@\/lib\/supabase\/service|SUPABASE_SERVICE_ROLE_KEY/)
    }
    expect(route).toMatch(/@\/lib\/supabase\/server/)
  })

  it('de route kiest geen gebruiker: het id komt uit auth.getUser()', () => {
    expect(route).toContain('auth.getUser()')
    expect(route).toContain('user.id')
    // Geen queryparameter, body of route-parameter waarmee je een ander account opgeeft.
    expect(route).not.toMatch(/searchParams|params|request\.json|req\.json/)
    expect(route).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/)
  })

  it('elke Krant-lezing in de lib draagt een expliciete user_id-scope bovenop de RLS', () => {
    const gelezen = tabellen(lib)
    expect(gelezen).toEqual(['krant_edities', 'krant_editie_items'])
    for (const m of lib.matchAll(/\.from\(\s*['"`](krant_\w+)['"`]\s*\)([\s\S]{0,400})/g)) {
      const keten = m[2].split('.from(')[0]
      expect(keten, `${m[1]} zonder user_id-scope`).toMatch(/\.eq\(\s*['"`]user_id['"`]\s*,\s*userId\s*\)/)
    }
  })

  it('de eligibility-check zit in de route én in de page, via één helper', () => {
    expect(route).toContain('magTesteditieZien')
    // De rolvergelijking deelt de constante met isSuperAdmin — geen tweede
    // definitie van "wie is beheerder".
    expect(toegang).toContain('SUPERADMIN_ROLE')
    expect(toegang).not.toMatch(/['"`]superadmin['"`]/)
    // 22 sep: is_demo_user is bewust GEEN toegangssignaal meer (Y1/H1 —
    // zelf te zetten via seed+reset), zie lib/krant/testeditie-toegang.ts.
    expect(toegang).not.toContain('is_demo_user')
    expect(code(join(ROOT, 'app/(app)/nieuws/page.tsx'))).toContain('magTesteditieZien')
  })

  it('sentinel: de scope-scan bijt op een ongescopete lezing', () => {
    const stuk = `const q = supabase.from('krant_edities').select('id').order('created_at')`
    const treffers = [...stuk.matchAll(/\.from\(\s*['"`](krant_\w+)['"`]\s*\)([\s\S]{0,400})/g)]
    expect(treffers).toHaveLength(1)
    expect(treffers[0][2]).not.toMatch(/\.eq\(\s*['"`]user_id['"`]/)
  })
})
