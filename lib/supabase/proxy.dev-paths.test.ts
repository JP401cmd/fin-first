import { describe, it, expect } from 'vitest'
import { DEV_ONLY_PATHS, isDevOnlyPathBlocked } from './proxy'

/**
 * Dev-harness-routes bestaan buiten `next dev` niet (security-sweep 3 sep 2026).
 *
 * WAAROM een test: deze drie paden staan bewust in `publicPaths` (uitgelogd
 * bereikbaar in dev), dus de `/api/`-protected-prefix beschermt ze NIET. De
 * enige lagen zijn de proxy-404 hier en de route-eigen NODE_ENV-guard.
 * `/api/schema-check` had tot de sweep géén van beide en onthulde
 * ongeauthenticeerd de tabel-/kolomtopologie. Deze test bewaakt de lijst en de
 * omgevingssemantiek van de proxy-laag; de route-laag heeft eigen tests.
 */
describe('dev-only paths: proxy-404 buiten next dev', () => {
  it('dekt precies de drie dev-harness-routes', () => {
    expect([...DEV_ONLY_PATHS].sort()).toEqual([
      '/api/dev-login',
      '/api/schema-check',
      '/api/session-info',
    ])
  })

  it.each([...DEV_ONLY_PATHS])(
    '%s is geblokkeerd in production/test/onbekend, alleen open in development',
    (path) => {
      expect(isDevOnlyPathBlocked(path, 'production')).toBe(true)
      expect(isDevOnlyPathBlocked(path, 'test')).toBe(true)
      expect(isDevOnlyPathBlocked(path, undefined)).toBe(true)
      expect(isDevOnlyPathBlocked(path, 'development')).toBe(false)
    },
  )

  it('raakt geen andere paden — matching is exact', () => {
    for (const p of ['/api/health', '/api/schema-check/', '/api/dev-login/x', '/login', '/']) {
      expect(isDevOnlyPathBlocked(p, 'production'), p).toBe(false)
    }
  })
})
