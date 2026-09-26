/**
 * C3 punt 12 (review): `createClient` (lib/supabase/server.ts) is zelf al per request
 * gecachet met React-`cache()`. Een tweede `cache(createClient)` eromheen voegde niets
 * toe, en het commentaar beweerde dat layout en page anders elk een eigen client kregen.
 * `getToekomstClient` is nu die ene request-gecachete `createClient` zelf; de naam blijft
 * voor de katern-pages.
 */
import { describe, it, expect, vi } from 'vitest'
import { readSourceLF } from '@/lib/test-utils/read-source'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

describe('getToekomstClient', () => {
  it('is de request-gecachete createClient zelf, geen tweede cache-laag', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const { getToekomstClient } = await import('./load-toekomst-data')
    expect(getToekomstClient).toBe(createClient)
  })

  it('het commentaar beweert niet meer dat createClient per aanroeper een eigen client geeft', () => {
    const src = readSourceLF('lib/toekomst/load-toekomst-data.ts')
    expect(src).not.toContain('cache(createClient)')
    expect(src).not.toMatch(/twee aanroepers met elk een eigen `createClient\(\)` zouden anders alles dubbel/)
  })
})
