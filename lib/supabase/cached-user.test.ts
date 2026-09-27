/**
 * `getCachedUser` (claims, lees-pad) vs. `getVerifiedUser` (getUser, schrijfpad)
 * — Snelheid B2, ADR 0052.
 *
 * Vastgepind:
 *   - `getCachedUser` leest de identiteit uit `auth.getClaims()` en doet NOOIT een
 *     `auth.getUser()`-ronde (dat is de hele winst van B2);
 *   - zonder geldige sessie, of met een token zonder `sub`, is de uitkomst `null`
 *     (de layout redirect dan naar /login, loaders nemen hun lege pad);
 *   - `getVerifiedUser` blijft de server-side check via `auth.getUser()`;
 *   - elke exported POST/PUT/PATCH/DELETE onder `app/api/**` die een gebruiker
 *     resolvet via deze module, doet dat met `getVerifiedUser` — nooit met de
 *     claims-variant (ADR 0052: mutaties houden de revocatie-check).
 */
import { describe, it, expect, vi } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readSourceLF } from '@/lib/test-utils/read-source'
import { getCachedUser, getVerifiedUser } from './cached-user'

function makeClient(opts: {
  claims?: Record<string, unknown> | null
  user?: { id: string } | null
}) {
  const getClaims = vi.fn(async () =>
    opts.claims ? { data: { claims: opts.claims }, error: null } : { data: null, error: null },
  )
  const getUser = vi.fn(async () => ({ data: { user: opts.user ?? null }, error: null }))
  const supabase = { auth: { getClaims, getUser } } as unknown as SupabaseClient
  return { supabase, getClaims, getUser }
}

describe('getCachedUser — identiteit uit de geverifieerde claims', () => {
  it('bouwt de gebruiker uit de claims en doet geen getUser-ronde', async () => {
    const { supabase, getClaims, getUser } = makeClient({
      claims: {
        sub: 'u1',
        email: 'a@example.nl',
        app_metadata: { provider: 'email' },
        user_metadata: { naam: 'A' },
      },
    })

    const user = await getCachedUser(supabase)

    expect(user).toEqual({
      id: 'u1',
      email: 'a@example.nl',
      app_metadata: { provider: 'email' },
      user_metadata: { naam: 'A' },
    })
    expect(getClaims).toHaveBeenCalledTimes(1)
    expect(getUser).not.toHaveBeenCalled()
  })

  it('vult ontbrekende metadata aan met lege objecten', async () => {
    const { supabase } = makeClient({ claims: { sub: 'u1' } })
    const user = await getCachedUser(supabase)
    expect(user).toEqual({ id: 'u1', email: undefined, app_metadata: {}, user_metadata: {} })
  })

  it('geeft null zonder geldige sessie', async () => {
    const { supabase, getUser } = makeClient({ claims: null })
    expect(await getCachedUser(supabase)).toBeNull()
    expect(getUser).not.toHaveBeenCalled()
  })

  it('geeft null bij een token zonder sub', async () => {
    const { supabase } = makeClient({ claims: { email: 'a@example.nl' } })
    expect(await getCachedUser(supabase)).toBeNull()
  })
})

describe('getVerifiedUser — server-side check', () => {
  it('loopt via auth.getUser()', async () => {
    const { supabase, getClaims, getUser } = makeClient({ user: { id: 'u1' } })
    expect(await getVerifiedUser(supabase)).toEqual({ id: 'u1' })
    expect(getUser).toHaveBeenCalledTimes(1)
    expect(getClaims).not.toHaveBeenCalled()
  })

  it('geeft null zonder gebruiker', async () => {
    const { supabase } = makeClient({ user: null })
    expect(await getVerifiedUser(supabase)).toBeNull()
  })
})

// ── Bron-toets: mutaties gebruiken nooit de claims-variant ──────────────────

const ROOT = process.cwd()
const MUTATION = /^export (?:async function|const) (POST|PUT|PATCH|DELETE)\b/

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return routeFiles(full)
    return name === 'route.ts' ? [full] : []
  })
}

/** Knipt een bronbestand op in exported top-level blokken (tot de volgende `export`). */
function exportedBlocks(source: string): { name: string; body: string }[] {
  const lines = source.split('\n')
  const blocks: { name: string; body: string }[] = []
  let current: { name: string; lines: string[] } | null = null
  for (const line of lines) {
    if (line.startsWith('export ')) {
      if (current) blocks.push({ name: current.name, body: current.lines.join('\n') })
      const m = MUTATION.exec(line)
      current = { name: m ? m[1] : '', lines: [line] }
    } else if (current) {
      current.lines.push(line)
    }
  }
  if (current) blocks.push({ name: current.name, body: current.lines.join('\n') })
  return blocks.filter((b) => b.name !== '')
}

describe('app/api — mutaties resolven de gebruiker server-side (ADR 0052)', () => {
  const files = routeFiles(join(ROOT, 'app', 'api'))

  it('vindt route-bestanden (de scan kijkt echt)', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('geen exported POST/PUT/PATCH/DELETE roept getCachedUser aan', () => {
    const overtredingen: string[] = []
    for (const file of files) {
      const source = readSourceLF(file)
      if (!source.includes('getCachedUser(')) continue
      for (const block of exportedBlocks(source)) {
        if (block.body.includes('getCachedUser(')) {
          overtredingen.push(`${relative(ROOT, file).replace(/\\/g, '/')} → ${block.name}`)
        }
      }
    }
    expect(overtredingen).toEqual([])
  })
})
