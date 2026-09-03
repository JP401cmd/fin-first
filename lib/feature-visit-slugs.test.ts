import { describe, expect, it } from 'vitest'
import { CLIENT_WRITABLE_FEATURE_SLUGS } from './feature-visit-slugs'
import { GUIDE_VISIT_SLUGS, GUIDE_VISIT_ROUTES } from './welcome-guide'
import { APP_SETUP_SLUGS } from './app-setup-status'

/**
 * De whitelist van `POST /api/feature-visits` staat als letterlijke lijst in
 * `lib/feature-visit-slugs.ts` (z.enum heeft literals nodig). Deze test is de
 * tegenhanger daarvan: hij bewaakt dat die lijst niet stilletjes uiteen loopt
 * met de bronnen waar de slugs vandaan komen — en, belangrijker, dat er nooit
 * een POORT-slug in glipt.
 */
describe('CLIENT_WRITABLE_FEATURE_SLUGS', () => {
  it('bevat elke bezoek-slug die de welkomstgids kent', () => {
    // Zonder deze koppeling zou een nieuwe gidsstap een slug opleveren die de
    // tracker post en de route met een 400 weigert — de stap blijft dan
    // eeuwig onafgevinkt, zonder zichtbare fout (de POST is fire-and-forget).
    for (const slug of GUIDE_VISIT_SLUGS) {
      expect(CLIENT_WRITABLE_FEATURE_SLUGS).toContain(slug)
    }
  })

  it('bevat elke slug die de route-tabel van de gids kan opleveren', () => {
    for (const route of GUIDE_VISIT_ROUTES) {
      expect(CLIENT_WRITABLE_FEATURE_SLUGS).toContain(route.slug)
    }
  })

  it('bevat GEEN setup-poort: die zet alleen de server', () => {
    // De kern van de beveiliging. `*_setup_completed` bepaalt of een
    // setup-gate nog verschijnt; een client die 'm zelf mag stempelen slaat
    // de setup over. Deze markers horen uitsluitend uit de server-routes
    // onder app/api/*/setup te komen.
    const gateSlugs = [...Object.values(APP_SETUP_SLUGS), 'horizon_setup_completed']
    for (const slug of gateSlugs) {
      expect(CLIENT_WRITABLE_FEATURE_SLUGS).not.toContain(slug)
    }
  })

  it('bevat geen enkele slug die op _setup_completed eindigt', () => {
    // Vangnet voor toekomstige poorten die (nog) niet in APP_SETUP_SLUGS staan.
    const gateLike = CLIENT_WRITABLE_FEATURE_SLUGS.filter((s) =>
      s.endsWith('_setup_completed'),
    )
    expect(gateLike).toEqual([])
  })

  it('heeft geen dubbele entries', () => {
    const unique = new Set<string>(CLIENT_WRITABLE_FEATURE_SLUGS)
    expect(unique.size).toBe(CLIENT_WRITABLE_FEATURE_SLUGS.length)
  })
})
