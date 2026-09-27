import { describe, it, expect, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { PAGES_CACHE_NAME } from '@serwist/next/worker'
import { readSourceLF } from '@/lib/test-utils/read-source'
import { OFFLINE_URL, USER_CONTENT_CACHE_NAMES, deleteUserContentCaches } from './sw-caches'

/**
 * De service worker mag nooit meer een gerenderde pagina uit de cache serveren
 * (kaart "Snelheid A", besluit eigenaar 27 sep 2026). Tot dan liepen navigaties
 * via NetworkFirst met een timeout van 3 s: bij elke trage serverrespons kreeg de
 * gebruiker de vorige HTML met oude cijfers, en die HTML bleef na uitloggen staan.
 *
 * `app/sw.ts` draait alleen als gebundelde worker (Serwist-CLI) en is in vitest
 * niet uit te voeren zonder de hele worker-runtime na te bootsen — vandaar een
 * bron-toets op de regels die ertoe doen.
 */

const ROOT = process.cwd()
const SW_SRC = readSourceLF(join(ROOT, 'app/sw.ts'))
const SW_CONFIG = readSourceLF(join(ROOT, 'serwist.config.mjs'))
/** De worker zonder commentaar: de uitleg noemt de oude strategie bij naam. */
const SW_CODE = SW_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('app/sw.ts — navigaties komen nooit uit een cache', () => {
  it('handelt navigate-verzoeken af met NetworkOnly', () => {
    const navigateRules = SW_SRC.match(/request\.mode === "navigate"/g) ?? []
    // Precies één regel: een tweede, eerdere regel zou de NetworkOnly overschaduwen.
    expect(navigateRules).toHaveLength(1)
    const handler = SW_SRC.match(/request\.mode === "navigate",\s*handler:\s*new (\w+)\(/)
    expect(handler?.[1]).toBe('NetworkOnly')
  })

  it('kent geen cache-eerst- of netwerk-eerst-strategie met een timeout meer', () => {
    // NetworkFirst en StaleWhileRevalidate zijn precies de strategieën die een
    // oude respons teruggeven; de worker importeert ze daarom helemaal niet.
    // (Serwist's defaultCache gebruikt ze wél, voor statische bestanden — die
    // matchen pas ná de NetworkOnly-regels hieronder.)
    expect(SW_CODE).not.toMatch(/\bNetworkFirst\b/)
    expect(SW_CODE).not.toMatch(/\bStaleWhileRevalidate\b/)
    expect(SW_CODE).not.toMatch(/networkTimeoutSeconds/)
    expect(SW_CODE).not.toMatch(/cacheName:\s*"pages/)
  })

  it('handelt RSC-verzoeken af met NetworkOnly, vóór Serwist’s defaultCache', () => {
    // Zonder deze regel zet defaultCache ze NetworkFirst in `pages-rsc` — dezelfde
    // cijfers als de HTML, alleen in een ander formaat.
    const rsc = SW_SRC.match(/request\.headers\.get\("RSC"\) === "1",\s*handler:\s*new (\w+)\(/)
    expect(rsc?.[1]).toBe('NetworkOnly')
    const rscAt = SW_SRC.indexOf('request.headers.get("RSC")')
    const navigateAt = SW_SRC.indexOf('request.mode === "navigate"')
    const defaultAt = SW_SRC.indexOf('...defaultCache')
    expect(defaultAt).toBeGreaterThan(-1)
    expect(navigateAt).toBeLessThan(defaultAt)
    expect(rscAt).toBeLessThan(defaultAt)
  })

  it('handelt cross-origin-verzoeken (Supabase REST) af met NetworkOnly, vóór defaultCache', () => {
    // defaultCache eindigt met een NetworkFirst `cross-origin`-cache. Directe
    // Supabase-reads hebben voor elk account dezelfde URL; gecachet zou het
    // volgende account op dit toestel ze offline of na 10 s terugkrijgen.
    const cross = SW_SRC.match(/=> !sameOrigin,\s*handler:\s*new (\w+)\(/)
    expect(cross?.[1]).toBe('NetworkOnly')
    expect(SW_SRC.indexOf('=> !sameOrigin')).toBeLessThan(SW_SRC.indexOf('...defaultCache'))
    expect(USER_CONTENT_CACHE_NAMES).toContain('cross-origin')
  })

  it('valt offline terug op de statische offline-pagina, alleen voor documenten', () => {
    expect(SW_SRC).toMatch(/from "\.\.\/lib\/pwa\/sw-caches"/)
    expect(SW_SRC).toMatch(
      /fallbacks:\s*\{\s*entries:\s*\[\s*\{\s*url:\s*OFFLINE_URL,\s*matcher:\s*\(\{ request \}\) => request\.destination === "document"/,
    )
  })

  it('wist bij het activeren de caches die een oude worker kan hebben gevuld', () => {
    expect(SW_SRC).toMatch(
      /addEventListener\("activate",[\s\S]*?waitUntil\(deleteUserContentCaches\(self\.caches\)\)/,
    )
  })
})

describe('de offline-pagina', () => {
  it('bestaat als route onder OFFLINE_URL', () => {
    expect(existsSync(join(ROOT, 'app', OFFLINE_URL, 'page.tsx'))).toBe(true)
  })

  it('staat in de precache — de fallback antwoordt alleen uit de precache', () => {
    expect(SW_CONFIG).toContain(`additionalPrecacheEntries: [{ url: "${OFFLINE_URL}"`)
  })
})

describe('USER_CONTENT_CACHE_NAMES', () => {
  it('dekt alle paginacaches van Serwist’s defaultCache', () => {
    // Hernoemt een Serwist-upgrade deze caches, dan wist de uitlog ze stil niet meer.
    for (const name of Object.values(PAGES_CACHE_NAME)) {
      expect(USER_CONTENT_CACHE_NAMES, name).toContain(name)
    }
  })

  it('bevat de oude navigatiecache', () => {
    expect(USER_CONTENT_CACHE_NAMES).toContain('pages-cache')
  })
})

describe('deleteUserContentCaches', () => {
  it('wist precies de caches met gebruikersinhoud', async () => {
    const storage = { delete: vi.fn(async (_name: string) => true) }
    await deleteUserContentCaches(storage as unknown as CacheStorage)
    expect(storage.delete.mock.calls.map(([name]) => name)).toEqual([...USER_CONTENT_CACHE_NAMES])
  })

  it('lost op zonder Cache Storage', async () => {
    await expect(deleteUserContentCaches(undefined)).resolves.toBeUndefined()
  })

  it('gaat door als één verwijdering weigert', async () => {
    const storage = {
      delete: vi.fn(async (name: string) => {
        if (name === 'pages-rsc') throw new Error('SecurityError')
        return true
      }),
    }
    await expect(deleteUserContentCaches(storage as unknown as CacheStorage)).resolves.toBeUndefined()
    expect(storage.delete).toHaveBeenCalledTimes(USER_CONTENT_CACHE_NAMES.length)
  })
})
