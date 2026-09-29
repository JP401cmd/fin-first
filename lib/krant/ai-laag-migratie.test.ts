import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readSourceLF } from '@/lib/test-utils/read-source'
import { AI_UITKOMSTEN } from './ai-laag'

/**
 * Migratie 20261008120000_krant_ai_laag (Krant 1E, K7 + K8) — TEKSTUEEL
 * getoetst: de migratie is geschreven, niet toegepast. Wat hier vastligt:
 * herhaalbaar (if not exists / drop … if exists / de oud_ref-toets), de oude
 * bronnen blijven staan, fail-closed, en de kolomrechten.
 */

const PAD = join(process.cwd(), 'supabase', 'migrations', '20261008120000_krant_ai_laag.sql')
const VERIFY = join(process.cwd(), 'scripts', 'verify-krant-ai-laag-rls.sql')
const sql = readSourceLF(PAD)
/** Zonder commentaarregels: alleen wat de database uitvoert. */
const code = sql
  .split('\n')
  .filter((r) => !r.trim().startsWith('--'))
  .join('\n')
  .toLowerCase()

describe('migratie krant_ai_laag — herhaalbaar', () => {
  it('bestaat, met een verify-script ernaast', () => {
    expect(existsSync(PAD)).toBe(true)
    expect(existsSync(VERIFY)).toBe(true)
    expect(readSourceLF(VERIFY)).toContain('20261008120000_krant_ai_laag.sql')
  })

  it('elke add constraint wordt voorafgegaan door een drop constraint if exists op dezelfde naam', () => {
    const toegevoegd = [...code.matchAll(/add constraint (\w+)/g)].map((m) => m[1])
    expect(toegevoegd.length).toBeGreaterThanOrEqual(8)
    for (const naam of toegevoegd) {
      const drop = code.indexOf(`drop constraint if exists ${naam}`)
      expect(drop, naam).toBeGreaterThanOrEqual(0)
      expect(drop, naam).toBeLessThan(code.indexOf(`add constraint ${naam}`))
    }
  })

  it('kolommen en indexen alleen met if not exists', () => {
    expect(code).not.toMatch(/add column (?!if not exists)/)
    expect(code).not.toMatch(/create (unique )?index (?!if not exists)/)
    expect(code).toMatch(/create unique index if not exists krant_edities_oud_ref_key\s+on public\.krant_edities \(oud_ref\)\s+where oud_ref is not null/)
  })

  it('de omzetting slaat een al omgezette editie over (oud_ref = md5 van de artikelen) — een tweede run maakt geen dubbelen', () => {
    expect(code).toContain("ref := 'ai-oud:' || r.user_id::text || ':' || md5(r.items::text)")
    expect(code).toMatch(/if exists \(select 1 from public\.krant_edities k where k\.oud_ref = ref\) then[\s\S]*?continue;/)
  })
})

describe('migratie krant_ai_laag — de inhoud van K7/K8', () => {
  it("de vorm-CHECK kent 'ai' naast de bestaande vormen", () => {
    expect(code).toContain("check (vorm in ('direct', 'gevoeligheid', 'relevant', 'raakt', 'ai'))")
  })

  it('ai_tekst (nullable) en ai_toegevoegd (not null default false)', () => {
    expect(code).toMatch(/add column if not exists ai_tekst text,/)
    expect(code).toMatch(/add column if not exists ai_toegevoegd boolean not null default false/)
  })

  it('de ai_uitkomst-CHECK noemt precies de uitkomsten uit de code', () => {
    const m = code.match(/ai_uitkomst in \(([^)]*)\)\)/)
    expect(m).not.toBeNull()
    const inSql = m![1].split(',').map((s) => s.trim().replace(/'/g, ''))
    expect(inSql).toEqual([...AI_UITKOMSTEN])
  })

  it('de omgezette items: vorm ai, article_id leeg, tijdlijn true, met_ai true op de editie', () => {
    const insert = code.slice(code.indexOf('insert into public.krant_editie_items'))
    expect(insert).toMatch(/select\s+e_id,\s+r\.user_id,\s+null,\s+true,/)
    expect(insert).toContain("'ai',")
    expect(code).toMatch(/'tijdlijn', true, null, ref,/)
  })

  it('de oude bronnen BLIJVEN staan: geen delete, update, drop of truncate op news_editions of app_settings', () => {
    for (const tabel of ['news_editions', 'app_settings']) {
      expect(code).not.toMatch(new RegExp(`(delete from|update|truncate|drop table( if exists)?) (public\\.)?${tabel}\\b`))
    }
  })

  it('fail-closed: onbekende sleutels, ongeldige JSON, geen lijst of een niet-object bericht → raise exception (hele transactie terug)', () => {
    expect(code.match(/raise exception/g)?.length).toBeGreaterThanOrEqual(6)
    expect(code).toContain("pg_input_is_valid(s.value #>> '{}', 'jsonb')")
  })

  it('alleen edities van de afgelopen 120 dagen (de bewaartermijn van de tijdlijn), van een bestaand account', () => {
    expect(code).toContain("b.gemaakt >= now() - interval '120 days'")
    expect(code).toContain('exists (select 1 from auth.users u where u.id = b.user_id)')
  })

  it('kolomrechten: geen sessie-schrijfrecht op de AI-kolommen, anon niets', () => {
    expect(code).toContain('revoke insert (ai_tekst, ai_toegevoegd), update (ai_tekst, ai_toegevoegd) on table public.krant_editie_items from authenticated')
    expect(code).toContain('revoke insert (ai_uitkomst, oud_ref), update (ai_uitkomst, oud_ref) on table public.krant_edities from authenticated')
    expect(code).toContain('revoke all on table public.krant_editie_items from anon')
    expect(code).not.toMatch(/grant (insert|update)[^;]*to authenticated/)
  })

  it('geen BEGIN/COMMIT in het bestand: de transactie hoort bij de uitrol (execute_sql) of de CLI', () => {
    expect(code).not.toMatch(/^\s*(begin|commit)\s*;/m)
  })
})
