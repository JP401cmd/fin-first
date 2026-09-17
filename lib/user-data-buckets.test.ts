import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ALL_BUCKETS,
  NON_PERSONAL_BUCKETS,
  USER_REPORT_SCREENSHOT_BUCKET,
  USER_SCOPED_BUCKETS,
  listObjectsUnderPrefix,
  purgeUserScopedBuckets,
  wipeUserBucketPrefixes,
} from './user-data-buckets'
import { USER_REPORT_SCREENSHOT_RETENTION_DAYS } from './retention'

/**
 * ADR 0152 — schermafbeeldingen (en andere gebruikersuploads) volgen de wis.
 *
 * Twee lagen:
 *  1. DEKKING: élke bucket die de repo aanmaakt (migratie of `createBucket`) staat
 *     in precies één partitie van lib/user-data-buckets.ts. Dit is de storage-
 *     tegenhanger van lib/user-data-tables.test.ts en vangt precies de drift
 *     waardoor `user-report-screenshots` een maand buiten de wis lag: een nieuwe
 *     upload-bucket zonder wis-/bewaarbeslissing maakt deze test rood.
 *  2. GEDRAG: de prefix-wis (recursief, hard falend) en de retentie-purge
 *     (wezen + verlopen, pad-loskoppeling vóór het wissen).
 */

const ROOT = join(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|mjs|sql)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** Bucket-id's die de bron aanmaakt of aanspreekt — gescand, niet overgetypt. */
function scanBucketIdsInSource(): Set<string> {
  const ids = new Set<string>()
  const files = [
    ...walk(join(ROOT, 'supabase', 'migrations')),
    ...walk(join(ROOT, 'app')),
    ...walk(join(ROOT, 'lib')),
    ...walk(join(ROOT, 'scripts')),
  ]
  const patterns = [
    // Migratie: INSERT INTO storage.buckets (...) VALUES ('id', ...
    /storage\.buckets\s*\([^)]*\)\s*VALUES\s*\(\s*'([^']+)'/gi,
    // Code: storage.createBucket('id', …) of een BUCKET-constante.
    /createBucket\(\s*['"]([^'"]+)['"]/g,
    /const\s+\w*BUCKET\w*\s*=\s*['"]([^'"]+)['"]/g,
    // Code: service.storage.from('id')
    /storage\s*\.from\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    for (const re of patterns) {
      re.lastIndex = 0
      for (let m = re.exec(src); m; m = re.exec(src)) ids.add(m[1])
    }
  }
  return ids
}

describe('user-data-buckets — dekking van álle buckets (drift-baken)', () => {
  const nonPersonal = Object.keys(NON_PERSONAL_BUCKETS)

  it('geen duplicaten en de partities zijn disjunct', () => {
    expect(new Set(USER_SCOPED_BUCKETS).size).toBe(USER_SCOPED_BUCKETS.length)
    expect(new Set(nonPersonal).size).toBe(nonPersonal.length)
    for (const b of USER_SCOPED_BUCKETS) {
      expect(nonPersonal, `${b} in beide partities`).not.toContain(b)
    }
    expect(ALL_BUCKETS.length).toBe(USER_SCOPED_BUCKETS.length + nonPersonal.length)
  })

  it('elke bucket in de bron valt in precies één partitie (nieuwe upload-bucket → hier indelen)', () => {
    const inSource = scanBucketIdsInSource()
    // Sanity: de scan vindt de bekende drie, anders bewaakt deze test niets.
    expect(inSource).toContain('user-report-screenshots')
    expect(inSource).toContain('pension-documents')
    expect(inSource).toContain('guide-help')
    for (const id of inSource) {
      expect(ALL_BUCKETS, `Ongeadresseerde bucket "${id}": deel 'm in in lib/user-data-buckets.ts`).toContain(id)
    }
  })

  it('geen partitie-entry zonder bron (typo/dode entry)', () => {
    const inSource = scanBucketIdsInSource()
    for (const id of ALL_BUCKETS) {
      expect(inSource, `${id} komt nergens in de bron voor`).toContain(id)
    }
  })

  it('de meldingen-bucket is user-scoped én de retentie-bucket', () => {
    expect(USER_SCOPED_BUCKETS).toContain(USER_REPORT_SCREENSHOT_BUCKET)
    expect(USER_REPORT_SCREENSHOT_RETENTION_DAYS).toBe(90)
  })
})

// ── Gedrag ──────────────────────────────────────────────────────────────────

type Entry = { name: string; id: string | null; created_at: string | null }

interface FakeStorage {
  /** bucket → map (prefix, '' = wortel) → entries */
  tree: Record<string, Record<string, Entry[]>>
  removed: Record<string, string[][]>
  failListOn?: string
  failRemove?: boolean
}

interface ServiceOpts {
  /** Prefixen mét profielrij. */
  liveProfiles?: string[]
  /** Prefixen die in auth.users bestaan; default = liveProfiles. Een prefix hier zónder profiel is het "eigen profiel gewist"-geval. */
  authUsers?: string[]
  failProfiles?: boolean
  failUpdate?: boolean
  /** getUserById faalt met iets anders dan 404. */
  failAuthLookup?: boolean
}

function makeService(fake: FakeStorage, opts: ServiceOpts = {}) {
  const updates: string[][] = []
  const authLookups: string[] = []
  const authUsers = opts.authUsers ?? opts.liveProfiles ?? []
  const auth = {
    admin: {
      getUserById: async (id: string) => {
        authLookups.push(id)
        if (opts.failAuthLookup) return { data: { user: null }, error: { status: 500, code: 'unexpected', message: 'auth kaput' } }
        return authUsers.includes(id)
          ? { data: { user: { id } }, error: null }
          : { data: { user: null }, error: { status: 404, code: 'user_not_found', message: 'User not found' } }
      },
    },
  }
  const storage = {
    from(bucket: string) {
      return {
        list: async (dir: string, o: { limit: number; offset?: number }) => {
          if (fake.failListOn === `${bucket}/${dir}`) return { data: null, error: { message: 'list kaput' } }
          const all = fake.tree[bucket]?.[dir] ?? []
          return { data: all.slice(o.offset ?? 0, (o.offset ?? 0) + o.limit), error: null }
        },
        remove: async (paths: string[]) => {
          if (fake.failRemove) return { data: null, error: { message: 'remove kaput' } }
          ;(fake.removed[bucket] ??= []).push(paths)
          return { data: paths.map((p) => ({ name: p })), error: null }
        },
      }
    },
  }
  const from = (table: string) => {
    const b = {
      select: () => b,
      in: async (_col: string, values: string[]) => {
        if (table === 'profiles') {
          if (opts.failProfiles) return { data: null, error: { message: 'profiles kaput' } }
          return { data: values.filter((v) => opts.liveProfiles?.includes(v)).map((id) => ({ id })), error: null }
        }
        if (table === 'user_reports') {
          if (opts.failUpdate) return { data: null, error: { message: 'update kaput' } }
          updates.push(values)
          return { data: null, error: null }
        }
        throw new Error(`onverwachte tabel ${table}`)
      },
      update: () => b,
    }
    return b
  }
  return { client: { storage, from, auth } as unknown as SupabaseClient, updates, authLookups }
}

const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'
const file = (name: string, created_at: string | null = '2026-09-01T00:00:00.000Z'): Entry => ({
  name,
  id: `id-${name}`,
  created_at,
})
const folder = (name: string): Entry => ({ name, id: null, created_at: null })

describe('wipeUserBucketPrefixes — de wis van `<user-id>/` in elke user-scoped bucket', () => {
  it('wist recursief (pensioendocumenten zitten twee niveaus diep) en telt per bucket', async () => {
    const fake: FakeStorage = {
      tree: {
        'user-report-screenshots': { [U1]: [file('a.png'), file('b.jpg')] },
        'pension-documents': {
          [U1]: [folder('event-1'), folder('event-2')],
          [`${U1}/event-1`]: [file('pensioenoverzicht.pdf')],
          [`${U1}/event-2`]: [file('pensioenoverzicht.pdf')],
        },
      },
      removed: {},
    }
    const { client } = makeService(fake)
    const counts = await wipeUserBucketPrefixes(client, U1)
    expect(counts).toEqual({ 'user-report-screenshots': 2, 'pension-documents': 2 })
    expect(fake.removed['user-report-screenshots'].flat().sort()).toEqual([`${U1}/a.png`, `${U1}/b.jpg`])
    expect(fake.removed['pension-documents'].flat().sort()).toEqual([
      `${U1}/event-1/pensioenoverzicht.pdf`,
      `${U1}/event-2/pensioenoverzicht.pdf`,
    ])
  })

  it('raakt uitsluitend de eigen prefix — andermans map blijft staan', async () => {
    const fake: FakeStorage = {
      tree: {
        'user-report-screenshots': { [U1]: [file('a.png')], [U2]: [file('z.png')] },
        'pension-documents': {},
      },
      removed: {},
    }
    const { client } = makeService(fake)
    await wipeUserBucketPrefixes(client, U1)
    const alle = Object.values(fake.removed).flat(2)
    expect(alle).toEqual([`${U1}/a.png`])
    expect(alle.some((p) => p.startsWith(U2))).toBe(false)
  })

  it('een lege prefix telt 0 en roept remove niet aan', async () => {
    const fake: FakeStorage = { tree: {}, removed: {} }
    const { client } = makeService(fake)
    const counts = await wipeUserBucketPrefixes(client, U1)
    expect(counts).toEqual({ 'user-report-screenshots': 0, 'pension-documents': 0 })
    expect(fake.removed).toEqual({})
  })

  it('gooit hard bij een storage-fout (geen stil doorgaan — er is geen cascade-vangnet)', async () => {
    const fake: FakeStorage = {
      tree: { 'user-report-screenshots': { [U1]: [file('a.png')] } },
      removed: {},
      failRemove: true,
    }
    const { client } = makeService(fake)
    await expect(wipeUserBucketPrefixes(client, U1)).rejects.toThrow(/user-report-screenshots/)
  })

  it('weigert een lege of niet-UUID prefix — die zou de wortel (álle gebruikers) raken', async () => {
    const fake: FakeStorage = { tree: { 'user-report-screenshots': { '': [folder(U1), folder(U2)] } }, removed: {} }
    const { client } = makeService(fake)
    await expect(wipeUserBucketPrefixes(client, '')).rejects.toThrow(/geen UUID/)
    await expect(wipeUserBucketPrefixes(client, '..')).rejects.toThrow(/geen UUID/)
    expect(fake.removed).toEqual({})
  })

  it('pagineert de listing (meer objecten dan één pagina)', async () => {
    const many = Array.from({ length: 1001 }, (_, i) => file(`s${i}.png`))
    const fake: FakeStorage = { tree: { 'user-report-screenshots': { [U1]: many } }, removed: {} }
    const { client } = makeService(fake)
    const objs = await listObjectsUnderPrefix(client, 'user-report-screenshots', U1)
    expect(objs).toHaveLength(1001)
  })
})

describe('purgeUserScopedBuckets — wezen in elke bucket, verlopen alleen bij schermafbeeldingen (ADR 0152)', () => {
  const now = new Date('2026-09-17T03:45:00.000Z')
  const oud = '2026-05-01T00:00:00.000Z' // > 90 dagen
  const vers = '2026-09-10T00:00:00+00:00' // Storage-notatie met +00:00
  const S = 'user-report-screenshots'
  const P = 'pension-documents'

  it('wist alles van een verdwenen account, alleen het verlopen deel van een levend account', async () => {
    const fake: FakeStorage = {
      tree: {
        [S]: {
          '': [folder(U1), folder(U2)],
          [U1]: [file('oud.png', oud), file('vers.png', vers)],
          [U2]: [file('wees-oud.png', oud), file('wees-vers.png', vers)],
        },
      },
      removed: {},
    }
    const { client, updates } = makeService(fake, { liveProfiles: [U1] })
    const result = await purgeUserScopedBuckets(client, now)
    expect(result[S]).toEqual({ verlopen: 1, wees: 2, overgeslagenPrefixen: [] })
    expect(result[P]).toEqual({ verlopen: 0, wees: 0, overgeslagenPrefixen: [] })
    const gewist = fake.removed[S].flat().sort()
    expect(gewist).toEqual([`${U1}/oud.png`, `${U2}/wees-oud.png`, `${U2}/wees-vers.png`])
    // Het pad is losgekoppeld van de melding, voor exact dezelfde objecten.
    expect(updates.flat().sort()).toEqual(gewist)
  })

  it('pensioendocumenten: wezen gaan weg (óók twee niveaus diep), maar er is géén bewaartermijn', async () => {
    const fake: FakeStorage = {
      tree: {
        [P]: {
          '': [folder(U1), folder(U2)],
          [U1]: [folder('ev-1')],
          [`${U1}/ev-1`]: [file('pensioenoverzicht.pdf', oud)],
          [U2]: [folder('ev-9')],
          [`${U2}/ev-9`]: [file('pensioenoverzicht.pdf', vers)],
        },
      },
      removed: {},
    }
    const { client, updates } = makeService(fake, { liveProfiles: [U1] })
    const result = await purgeUserScopedBuckets(client, now)
    expect(result[P]).toEqual({ verlopen: 0, wees: 1, overgeslagenPrefixen: [] })
    expect(fake.removed[P].flat()).toEqual([`${U2}/ev-9/pensioenoverzicht.pdf`])
    // Geen screenshot_path-loskoppeling voor pensioendocumenten.
    expect(updates).toEqual([])
  })

  it('een account zónder profielrij maar mét auth-gebruiker is GEEN wees (eigen profiel gewist)', async () => {
    const fake: FakeStorage = {
      tree: { [S]: { '': [folder(U1)], [U1]: [file('vers.png', vers)] } },
      removed: {},
    }
    const { client, authLookups } = makeService(fake, { liveProfiles: [], authUsers: [U1] })
    const result = await purgeUserScopedBuckets(client, now)
    expect(result[S].wees).toBe(0)
    expect(fake.removed).toEqual({})
    // De bevestiging is wél gevraagd — en alleen voor de kandidaat.
    expect(authLookups).toEqual([U1])
  })

  it('vraagt geen auth-bevestiging voor prefixen die een profielrij hebben', async () => {
    const fake: FakeStorage = {
      tree: { [S]: { '': [folder(U1)], [U1]: [file('vers.png', vers)] } },
      removed: {},
    }
    const { client, authLookups } = makeService(fake, { liveProfiles: [U1] })
    await purgeUserScopedBuckets(client, now)
    expect(authLookups).toEqual([])
  })

  it('een ándere auth-fout dan "niet gevonden" stopt de veeg zonder te wissen', async () => {
    const fake: FakeStorage = {
      tree: { [S]: { '': [folder(U2)], [U2]: [file('x.png', oud)] } },
      removed: {},
    }
    const { client } = makeService(fake, { liveProfiles: [], failAuthLookup: true })
    await expect(purgeUserScopedBuckets(client, now)).rejects.toThrow(/bevestiging van wees-prefix/)
    expect(fake.removed).toEqual({})
  })

  it('vergelijkt op tijd, niet op tekst: een `+00:00`-object van gisteren is niet verlopen', async () => {
    const gisteren = '2026-09-16T03:45:00+00:00'
    const fake: FakeStorage = {
      tree: { [S]: { '': [folder(U1)], [U1]: [file('g.png', gisteren)] } },
      removed: {},
    }
    const { client } = makeService(fake, { liveProfiles: [U1] })
    const result = await purgeUserScopedBuckets(client, now)
    expect(result[S].verlopen).toBe(0)
    expect(fake.removed).toEqual({})
  })

  it('laat een niet-UUID-prefix ongemoeid en meldt hem', async () => {
    const fake: FakeStorage = {
      tree: { [S]: { '': [folder('beheer-export')], 'beheer-export': [file('x.png', oud)] } },
      removed: {},
    }
    const { client } = makeService(fake)
    const result = await purgeUserScopedBuckets(client, now)
    expect(result[S]).toEqual({ verlopen: 0, wees: 0, overgeslagenPrefixen: ['beheer-export'] })
    expect(fake.removed).toEqual({})
  })

  it('stopt zonder te wissen als de profiles-check faalt (beeld van een levend account is heilig)', async () => {
    const fake: FakeStorage = {
      tree: { [S]: { '': [folder(U1)], [U1]: [file('oud.png', oud)] } },
      removed: {},
    }
    const { client } = makeService(fake, { failProfiles: true })
    await expect(purgeUserScopedBuckets(client, now)).rejects.toThrow(/bestaanscheck/)
    expect(fake.removed).toEqual({})
  })

  it('koppelt het pad los VÓÓR het wissen: faalt de update, dan blijft het object staan', async () => {
    const fake: FakeStorage = {
      tree: { [S]: { '': [folder(U1)], [U1]: [file('oud.png', oud)] } },
      removed: {},
    }
    const { client } = makeService(fake, { liveProfiles: [U1], failUpdate: true })
    await expect(purgeUserScopedBuckets(client, now)).rejects.toThrow(/screenshot_path/)
    expect(fake.removed).toEqual({})
  })

  it('pagineert de wortel en brokt de bestaanscheck (meer dan 1000 prefixen)', async () => {
    const prefixes = Array.from({ length: 1001 }, (_, i) =>
      `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`,
    )
    const tree: Record<string, Entry[]> = { '': prefixes.map(folder) }
    for (const p of prefixes) tree[p] = [file('v.png', vers)]
    const fake: FakeStorage = { tree: { [S]: tree }, removed: {} }
    const { client } = makeService(fake, { liveProfiles: prefixes })
    const result = await purgeUserScopedBuckets(client, now)
    expect(result[S]).toEqual({ verlopen: 0, wees: 0, overgeslagenPrefixen: [] })
    expect(fake.removed).toEqual({})
  })

  it('een lege bucket is geen fout', async () => {
    const fake: FakeStorage = { tree: {}, removed: {} }
    const { client } = makeService(fake)
    const result = await purgeUserScopedBuckets(client, now)
    expect(result[S]).toEqual({ verlopen: 0, wees: 0, overgeslagenPrefixen: [] })
    expect(result[P]).toEqual({ verlopen: 0, wees: 0, overgeslagenPrefixen: [] })
  })

  it('de storage-fout draagt de bucketnaam, nooit een stil resultaat', async () => {
    const fake: FakeStorage = {
      tree: { [S]: { '': [folder(U1)] } },
      removed: {},
      failListOn: `${S}/${U1}`,
    }
    const { client } = makeService(fake, { liveProfiles: [U1] })
    await expect(purgeUserScopedBuckets(client, now)).rejects.toThrow(/user-report-screenshots/)
  })
})

