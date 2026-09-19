/**
 * SQL↔TS-parity van de `app_settings`-allowlist (ADR 0163).
 *
 * Twee grendels:
 *  1. de array in tak 2 van de nieuwste migratie die `app_settings select`
 *     aanmaakt is exact `PUBLIEKE_APP_SETTINGS` — een sleutel die aan één kant
 *     bijkomt zonder de andere is een stille breuk (policy dicht, code verwacht
 *     open) of een stille verruiming (policy open, niemand weet waarom);
 *  2. elke sleutel op de lijst heeft een lezer buiten `app/api/admin` en buiten
 *     tests — een sleutel zonder gebruikerslezer hoort niet open te staan.
 *
 * Bewust op de MIGRATIE getoetst en niet op de live database: de repo is de
 * bedoeling, de release-stap verifieert de werkelijkheid (`pg_policies`).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PUBLIEKE_APP_SETTINGS } from './publieke-sleutels'

const ROOT = process.cwd()
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')

/** De nieuwste migratie (op tijdstempel) die de SELECT-policy aanmaakt. */
function nieuwsteSelectPolicyMigratie(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse()
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8')
    if (/create policy "app_settings select" on public\.app_settings/i.test(sql)) {
      return { file, sql }
    }
  }
  throw new Error('geen migratie gevonden die "app_settings select" aanmaakt')
}

/** Alleen de uitvoerbare SQL: commentaarregels weg (het kopblok citeert de vorm). */
function zonderCommentaar(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
}

/** De sleutels uit `key = any (array[ ... ])` in tak 2 van de policy zelf. */
function allowlistUitSql(sql: string): string[] {
  const policy = zonderCommentaar(sql)
  const m = policy.match(/key = any \(array\[([\s\S]*?)\]\)/i)
  if (!m) throw new Error('tak 2 is geen allowlist (geen `key = any (array[...])` gevonden)')
  return [...m[1].matchAll(/'([^']+)'::text/g)].map((x) => x[1]).sort()
}

function* bronbestanden(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      yield* bronbestanden(full)
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      yield full
    }
  }
}

describe('PUBLIEKE_APP_SETTINGS ↔ RLS-allowlist', () => {
  const { file, sql } = nieuwsteSelectPolicyMigratie()

  it(`is exact de array in tak 2 van ${'' + file}`, () => {
    expect(allowlistUitSql(sql)).toEqual([...PUBLIEKE_APP_SETTINGS].sort())
  })

  it('tak 2 draagt géén denylist-restant meer (uuid-regex of notion-uitsluiting)', () => {
    const body = sql.slice(sql.indexOf('create policy "app_settings select"'))
    const tak2 = zonderCommentaar(body.slice(body.indexOf('-- 2.'), body.indexOf('-- 3.')))
    expect(tak2).toMatch(/key = any \(array\[/i)
    expect(tak2).not.toMatch(/key <> all/i)
    expect(tak2).not.toMatch(/notion/i)
    expect(tak2).not.toMatch(/!~\*/)
  })

  it('elke publieke sleutel heeft een lezer buiten app/api/admin', () => {
    const lezers = [...bronbestanden(join(ROOT, 'app')), ...bronbestanden(join(ROOT, 'lib'))]
      .filter((f) => !f.replace(/\\/g, '/').includes('/app/api/admin/'))
      .filter((f) => !f.replace(/\\/g, '/').endsWith('/lib/app-settings/publieke-sleutels.ts'))
    const zonderLezer = PUBLIEKE_APP_SETTINGS.filter(
      (key) => !lezers.some((f) => readFileSync(f, 'utf8').includes(`'${key}'`)),
    )
    expect(zonderLezer, `publieke sleutel zonder gebruikerslezer: ${zonderLezer.join(', ')}`).toEqual([])
  })

  /**
   * De omgekeerde richting: een SESSIE-client-lezer van een globale sleutel die
   * NIET op de allowlist staat, is de stille-breuk-richting (policy dicht, code
   * verwacht open). Gescand: elk bestand buiten app/api/admin en app/(app)/beheer
   * dat `app_settings` leest zónder `getServiceClient()`, met een LETTERLIJKE
   * sleutel in `.eq('key', '…')` of `.in('key', [...])`. Sleutels met
   * interpolatie (`${uid}`) zijn per-user (tak 1/3) en vallen buiten de scan.
   */
  it('elke letterlijke sessie-client-sleutel buiten beheer staat op de allowlist (of is bewust uitgezonderd)', () => {
    /** Lezers met een client-PARAMETER die alleen door beheer (tak 4) of een service-cron worden aangeroepen. */
    const UITGEZONDERD: Record<string, string> = {
      'lib/news-sources.ts':
        'loadNewsSources(supabase): aangeroepen door app/(app)/beheer/nieuws (superadmin, tak 4) en lib/news-ingest.ts (cron, service-role) — news_web_sources/news_rss_feeds zijn beheer-content',
    }
    const overtredingen: string[] = []
    for (const file of [...bronbestanden(join(ROOT, 'app')), ...bronbestanden(join(ROOT, 'lib'))]) {
      const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/')
      if (rel.startsWith('app/api/admin/') || rel.startsWith('app/(app)/beheer/')) continue
      if (rel in UITGEZONDERD) continue
      const src = readFileSync(file, 'utf8')
      if (!src.includes(".from('app_settings')") || src.includes('getServiceClient')) continue
      const literals = [
        ...[...src.matchAll(/\.eq\('key',\s*'([^'$]+)'\)/g)].map((m) => m[1]),
        ...[...src.matchAll(/\.in\('key',\s*\[([^\]]*)\]\)/g)].flatMap((m) =>
          [...m[1].matchAll(/'([^'$]+)'/g)].map((x) => x[1]),
        ),
      ]
      for (const key of literals) {
        if (!(PUBLIEKE_APP_SETTINGS as readonly string[]).includes(key)) overtredingen.push(`${rel}: '${key}'`)
      }
    }
    expect(overtredingen, 'sessie-client leest een globale sleutel die niet op de allowlist staat').toEqual([])
  })

  it('de lijst is gesorteerd en uniek (leesbaarheid van de diff)', () => {
    const sorted = [...PUBLIEKE_APP_SETTINGS].sort()
    expect([...PUBLIEKE_APP_SETTINGS]).toEqual(sorted)
    expect(new Set(PUBLIEKE_APP_SETTINGS).size).toBe(PUBLIEKE_APP_SETTINGS.length)
  })
})
