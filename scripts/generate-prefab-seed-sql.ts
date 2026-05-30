/**
 * Generator — bouwt de seed-migratie voor de 12 prefab-rekenhulpen.
 *
 * De CalculatorDefinitions in lib/calculator/prefab-definitions.ts zijn
 * de source of truth (type-checked + unit-getest). Dit script serialiseert
 * ze naar een SQL-migratie die:
 *   1. een vaste "TriFinity"-curator (auth.users + identity + profile)
 *      aanmaakt indien die nog niet bestaat,
 *   2. elke prefab als publieke custom_calculators-rij invoegt
 *      (is_public=true, published_at=now(), deterministisch id),
 *   3. volledig idempotent is (ON CONFLICT DO NOTHING + IF NOT EXISTS).
 *
 * Run:  npx tsx scripts/generate-prefab-seed-sql.ts
 * Out:  supabase/migrations/20260530120000_seed_prefab_calculators.sql
 *
 * Regenereer na elke wijziging in prefab-definitions.ts zodat de SQL en
 * de geteste TS in sync blijven.
 */

import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PREFAB_CALCULATORS } from '../lib/calculator/prefab-definitions'

// Vaste curator-identiteit (deterministisch zodat re-runs idempotent zijn).
const CURATOR_ID = 'a0a0a0a0-0000-4000-8000-000000000001'
const CURATOR_EMAIL = 'curator@trifinity.nl'
const CURATOR_NAME = 'TriFinity'
const MIGRATION_FILE = '20260530120000_seed_prefab_calculators.sql'

/** Deterministische, geldig-geformatteerde UUID uit een seed-string. */
function deterministicUuid(seed: string): string {
  const h = createHash('md5').update(`trifinity-prefab:${seed}`).digest('hex')
  // Format als UUID en forceer versie-4/variant-bits voor geldigheid.
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    '4' + h.slice(13, 16),
    '8' + h.slice(17, 20),
    h.slice(20, 32),
  ].join('-')
}

/** Escape een string voor een SQL single-quoted literal. */
function sqlStr(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** Serialiseer een JS-object naar een ::jsonb SQL-literal. */
function sqlJsonb(obj: unknown): string {
  return `${sqlStr(JSON.stringify(obj))}::jsonb`
}

function buildSql(): string {
  const lines: string[] = []
  lines.push('-- Seed: 12 prefab (TriFinity-curated) rekenhulpen in de bibliotheek.')
  lines.push('-- GEGENEREERD door scripts/generate-prefab-seed-sql.ts — niet handmatig bewerken.')
  lines.push('-- Bron: lib/calculator/prefab-definitions.ts (type-checked + unit-getest).')
  lines.push('--')
  lines.push('-- Vereist de tabellen uit 20260526000000 + 20260529100000 (custom_calculators')
  lines.push('-- met is_public/published_at + profiles.marketplace_display_name). Idempotent.')
  lines.push('')

  // ── 1. Curator-account (auth.users + identity + profile) ──────────
  lines.push('-- ── 1. TriFinity-curator (eigenaar van de prefab-rekenhulpen) ──')
  lines.push('DO $$')
  lines.push('DECLARE')
  lines.push(`  curator_id UUID := '${CURATOR_ID}';`)
  lines.push('BEGIN')
  lines.push('  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = curator_id) THEN')
  lines.push('    INSERT INTO auth.users (')
  lines.push('      instance_id, id, aud, role, email, encrypted_password,')
  lines.push('      email_confirmed_at, raw_user_meta_data, raw_app_meta_data,')
  lines.push('      created_at, updated_at, confirmation_token, recovery_token')
  lines.push('    ) VALUES (')
  lines.push("      '00000000-0000-0000-0000-000000000000',")
  lines.push('      curator_id,')
  lines.push("      'authenticated',")
  lines.push("      'authenticated',")
  lines.push(`      ${sqlStr(CURATOR_EMAIL)},`)
  lines.push("      crypt(gen_random_uuid()::text, gen_salt('bf')),")
  lines.push('      now(),')
  lines.push(`      jsonb_build_object('full_name', ${sqlStr(CURATOR_NAME)}),`)
  lines.push(`      '{"provider":"email","providers":["email"]}'::jsonb,`)
  lines.push('      now(), now(), \'\', \'\'')
  lines.push('    );')
  lines.push('')
  lines.push('    INSERT INTO auth.identities (')
  lines.push('      id, user_id, provider_id, identity_data, provider,')
  lines.push('      last_sign_in_at, created_at, updated_at')
  lines.push('    ) VALUES (')
  lines.push('      gen_random_uuid(), curator_id,')
  lines.push(`      ${sqlStr(CURATOR_EMAIL)},`)
  lines.push(`      jsonb_build_object('sub', curator_id::text, 'email', ${sqlStr(CURATOR_EMAIL)}),`)
  lines.push("      'email', now(), now(), now()")
  lines.push('    );')
  lines.push('  END IF;')
  lines.push('')
  lines.push('  -- Profiel + marketplace-naam (idempotent; ook als user al bestond).')
  lines.push('  INSERT INTO profiles (id, full_name, onboarding_completed, role, marketplace_display_name)')
  lines.push(`  VALUES (curator_id, ${sqlStr(CURATOR_NAME)}, true, 'user', ${sqlStr(CURATOR_NAME)})`)
  lines.push('  ON CONFLICT (id) DO UPDATE SET marketplace_display_name = EXCLUDED.marketplace_display_name;')
  lines.push('END $$;')
  lines.push('')

  // ── 2. De 12 prefab-rekenhulpen ───────────────────────────────────
  lines.push('-- ── 2. Prefab-rekenhulpen (publiek, eigendom van de curator) ──')
  PREFAB_CALCULATORS.forEach((prefab, index) => {
    const id = deterministicUuid(prefab.slug)
    const def = prefab.definition
    lines.push(`-- [${prefab.tier} · ${'★'.repeat(prefab.complexity)}] ${def.name}`)
    lines.push('INSERT INTO custom_calculators (')
    lines.push('  id, user_id, name, description, definition, created_by_ai,')
    lines.push('  sort_order, is_public, published_at')
    lines.push(') VALUES (')
    lines.push(`  '${id}',`)
    lines.push(`  '${CURATOR_ID}',`)
    lines.push(`  ${sqlStr(def.name)},`)
    lines.push(`  ${def.description ? sqlStr(def.description) : 'NULL'},`)
    lines.push(`  ${sqlJsonb(def)},`)
    lines.push('  true,')
    lines.push(`  ${index},`)
    lines.push('  true,')
    lines.push('  now()')
    lines.push(') ON CONFLICT (id) DO UPDATE SET')
    lines.push('  name = EXCLUDED.name,')
    lines.push('  description = EXCLUDED.description,')
    lines.push('  definition = EXCLUDED.definition,')
    lines.push('  sort_order = EXCLUDED.sort_order,')
    lines.push('  is_public = true,')
    lines.push('  updated_at = now();')
    lines.push('')
  })

  return lines.join('\n')
}

const sql = buildSql()
const outPath = join(process.cwd(), 'supabase', 'migrations', MIGRATION_FILE)
writeFileSync(outPath, sql, 'utf8')
console.log(`✓ ${PREFAB_CALCULATORS.length} prefab-rekenhulpen → ${outPath}`)
console.log(`  ${sql.length} bytes`)
