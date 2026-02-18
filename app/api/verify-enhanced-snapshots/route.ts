import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

type TestResult = {
  name: string
  pass: boolean
  detail: string
}

/**
 * GET /api/verify-enhanced-snapshots
 *
 * Verification endpoint for Feature #248: Enhanced net_worth_snapshots table columns.
 * Verifies that freedom_percentage, fire_age, sovereignty_level, savings_rate,
 * and resilience_score columns exist and are populated by snapshot creation logic.
 */
export async function GET() {
  const cwd = process.cwd()
  const results: TestResult[] = []

  // ─── Test 1: freedom_percentage column in migration ───────────────
  try {
    const migrationPath = join(cwd, 'supabase/migrations/20260215000001_create_new_tables.sql')
    const applyPath = join(cwd, 'app/api/apply-migration/route.ts')
    const migrationSource = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''
    const applySource = existsSync(applyPath) ? readFileSync(applyPath, 'utf8') : ''

    const inMigration = migrationSource.includes('ADD COLUMN IF NOT EXISTS freedom_percentage NUMERIC')
    const inApply = applySource.includes('freedom_percentage NUMERIC')

    results.push({
      name: 'freedom_percentage column (numeric, nullable) in migration',
      pass: inMigration && inApply,
      detail: inMigration && inApply
        ? 'ALTER TABLE net_worth_snapshots ADD COLUMN IF NOT EXISTS freedom_percentage NUMERIC — in both migration SQL and apply-migration route'
        : `migration: ${inMigration}, apply-route: ${inApply}`,
    })
  } catch (e) {
    results.push({ name: 'freedom_percentage column (numeric, nullable) in migration', pass: false, detail: String(e) })
  }

  // ─── Test 2: fire_age column in migration ─────────────────────────
  try {
    const migrationPath = join(cwd, 'supabase/migrations/20260215000001_create_new_tables.sql')
    const applyPath = join(cwd, 'app/api/apply-migration/route.ts')
    const migrationSource = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''
    const applySource = existsSync(applyPath) ? readFileSync(applyPath, 'utf8') : ''

    const inMigration = migrationSource.includes('ADD COLUMN IF NOT EXISTS fire_age NUMERIC')
    const inApply = applySource.includes('fire_age NUMERIC')

    results.push({
      name: 'fire_age column (numeric, nullable) in migration',
      pass: inMigration && inApply,
      detail: inMigration && inApply
        ? 'ALTER TABLE net_worth_snapshots ADD COLUMN IF NOT EXISTS fire_age NUMERIC — in both migration SQL and apply-migration route'
        : `migration: ${inMigration}, apply-route: ${inApply}`,
    })
  } catch (e) {
    results.push({ name: 'fire_age column (numeric, nullable) in migration', pass: false, detail: String(e) })
  }

  // ─── Test 3: sovereignty_level column in migration ────────────────
  try {
    const migrationPath = join(cwd, 'supabase/migrations/20260215000001_create_new_tables.sql')
    const applyPath = join(cwd, 'app/api/apply-migration/route.ts')
    const migrationSource = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''
    const applySource = existsSync(applyPath) ? readFileSync(applyPath, 'utf8') : ''

    const inMigration = migrationSource.includes('ADD COLUMN IF NOT EXISTS sovereignty_level INT')
    const inApply = applySource.includes('sovereignty_level INT')

    results.push({
      name: 'sovereignty_level column (int, nullable) in migration',
      pass: inMigration && inApply,
      detail: inMigration && inApply
        ? 'ALTER TABLE net_worth_snapshots ADD COLUMN IF NOT EXISTS sovereignty_level INT — in both migration SQL and apply-migration route'
        : `migration: ${inMigration}, apply-route: ${inApply}`,
    })
  } catch (e) {
    results.push({ name: 'sovereignty_level column (int, nullable) in migration', pass: false, detail: String(e) })
  }

  // ─── Test 4: savings_rate column in migration ─────────────────────
  try {
    const migrationPath = join(cwd, 'supabase/migrations/20260215000001_create_new_tables.sql')
    const applyPath = join(cwd, 'app/api/apply-migration/route.ts')
    const migrationSource = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''
    const applySource = existsSync(applyPath) ? readFileSync(applyPath, 'utf8') : ''

    const inMigration = migrationSource.includes('ADD COLUMN IF NOT EXISTS savings_rate NUMERIC')
    const inApply = applySource.includes('savings_rate NUMERIC')

    results.push({
      name: 'savings_rate column (numeric, nullable) in migration',
      pass: inMigration && inApply,
      detail: inMigration && inApply
        ? 'ALTER TABLE net_worth_snapshots ADD COLUMN IF NOT EXISTS savings_rate NUMERIC — in both migration SQL and apply-migration route'
        : `migration: ${inMigration}, apply-route: ${inApply}`,
    })
  } catch (e) {
    results.push({ name: 'savings_rate column (numeric, nullable) in migration', pass: false, detail: String(e) })
  }

  // ─── Test 5: resilience_score column in migration ─────────────────
  try {
    const migrationPath = join(cwd, 'supabase/migrations/20260215000001_create_new_tables.sql')
    const applyPath = join(cwd, 'app/api/apply-migration/route.ts')
    const migrationSource = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''
    const applySource = existsSync(applyPath) ? readFileSync(applyPath, 'utf8') : ''

    const inMigration = migrationSource.includes('ADD COLUMN IF NOT EXISTS resilience_score INT')
    const inApply = applySource.includes('resilience_score INT')

    results.push({
      name: 'resilience_score column (int, nullable) in migration',
      pass: inMigration && inApply,
      detail: inMigration && inApply
        ? 'ALTER TABLE net_worth_snapshots ADD COLUMN IF NOT EXISTS resilience_score INT — in both migration SQL and apply-migration route'
        : `migration: ${inMigration}, apply-route: ${inApply}`,
    })
  } catch (e) {
    results.push({ name: 'resilience_score column (int, nullable) in migration', pass: false, detail: String(e) })
  }

  // ─── Test 6: All columns are nullable (backward compatible) ──────
  try {
    const migrationPath = join(cwd, 'supabase/migrations/20260215000001_create_new_tables.sql')
    const migrationSource = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''

    // Check that none of the new columns have NOT NULL constraint
    const columnDefs = migrationSource.match(/ADD COLUMN IF NOT EXISTS (freedom_percentage|fire_age|sovereignty_level|savings_rate|resilience_score)[^,;]*/g) || []
    const allNullable = columnDefs.length === 5 && columnDefs.every(d => !d.includes('NOT NULL'))

    results.push({
      name: 'All new columns are nullable (backward compatibility)',
      pass: allNullable,
      detail: allNullable
        ? 'All 5 columns use ADD COLUMN IF NOT EXISTS without NOT NULL — existing data is not affected'
        : `Found ${columnDefs.length} column defs; nullable check: ${columnDefs.map(d => !d.includes('NOT NULL')).join(', ')}`,
    })
  } catch (e) {
    results.push({ name: 'All new columns are nullable (backward compatibility)', pass: false, detail: String(e) })
  }

  // ─── Test 7: Existing snapshot data preserved (IF NOT EXISTS) ────
  try {
    const migrationPath = join(cwd, 'supabase/migrations/20260215000001_create_new_tables.sql')
    const applyPath = join(cwd, 'app/api/apply-migration/route.ts')
    const migrationSource = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''
    const applySource = existsSync(applyPath) ? readFileSync(applyPath, 'utf8') : ''

    const ifNotExistsInMigration = migrationSource.includes('ADD COLUMN IF NOT EXISTS freedom_percentage') &&
      migrationSource.includes('ADD COLUMN IF NOT EXISTS fire_age') &&
      migrationSource.includes('ADD COLUMN IF NOT EXISTS sovereignty_level') &&
      migrationSource.includes('ADD COLUMN IF NOT EXISTS savings_rate') &&
      migrationSource.includes('ADD COLUMN IF NOT EXISTS resilience_score')

    const ifNotExistsInApply = applySource.includes('ADD COLUMN IF NOT EXISTS freedom_percentage') &&
      applySource.includes('ADD COLUMN IF NOT EXISTS fire_age') &&
      applySource.includes('ADD COLUMN IF NOT EXISTS sovereignty_level') &&
      applySource.includes('ADD COLUMN IF NOT EXISTS savings_rate') &&
      applySource.includes('ADD COLUMN IF NOT EXISTS resilience_score')

    results.push({
      name: 'Existing snapshot data not affected (IF NOT EXISTS + no defaults)',
      pass: ifNotExistsInMigration && ifNotExistsInApply,
      detail: ifNotExistsInMigration && ifNotExistsInApply
        ? 'All ALTER TABLE statements use IF NOT EXISTS — safe to apply repeatedly, existing rows get NULL for new columns'
        : `migration: ${ifNotExistsInMigration}, apply: ${ifNotExistsInApply}`,
    })
  } catch (e) {
    results.push({ name: 'Existing snapshot data not affected (IF NOT EXISTS + no defaults)', pass: false, detail: String(e) })
  }

  // ─── Test 8: POST /api/snapshots populates new columns ───────────
  try {
    const snapshotsPath = join(cwd, 'app/api/snapshots/route.ts')
    const source = readFileSync(snapshotsPath, 'utf8')

    const populatesFreedom = source.includes('freedom_percentage:') && source.includes('freedomPercentage')
    const populatesFireAge = source.includes('fire_age:') && source.includes('fireProjection.fireAge')
    const populatesSovereignty = source.includes('sovereignty_level:') && source.includes('computeSovereigntyLevel')
    const populatesSavingsRate = source.includes('savings_rate:') && source.includes('savingsRate')
    const populatesResilience = source.includes('resilience_score:') && source.includes('computeResilienceScore')

    const allPopulated = populatesFreedom && populatesFireAge && populatesSovereignty && populatesSavingsRate && populatesResilience

    results.push({
      name: 'POST /api/snapshots populates all 5 new columns',
      pass: allPopulated,
      detail: allPopulated
        ? 'Manual snapshot creation computes and stores: freedom_percentage, fire_age, sovereignty_level, savings_rate, resilience_score'
        : `freedom: ${populatesFreedom}, fireAge: ${populatesFireAge}, sovereignty: ${populatesSovereignty}, savings: ${populatesSavingsRate}, resilience: ${populatesResilience}`,
    })
  } catch (e) {
    results.push({ name: 'POST /api/snapshots populates all 5 new columns', pass: false, detail: String(e) })
  }

  // ─── Test 9: GET /api/snapshots/auto populates new columns ───────
  try {
    const autoPath = join(cwd, 'app/api/snapshots/auto/route.ts')
    const source = readFileSync(autoPath, 'utf8')

    const populatesFreedom = source.includes('freedom_percentage:') && source.includes('freedomPercentage')
    const populatesFireAge = source.includes('fire_age:') && source.includes('fireProjection.fireAge')
    const populatesSovereignty = source.includes('sovereignty_level:') && source.includes('computeSovereigntyLevel')
    const populatesSavingsRate = source.includes('savings_rate:') && source.includes('savingsRate')
    const populatesResilience = source.includes('resilience_score:') && source.includes('computeResilienceScore')

    const allPopulated = populatesFreedom && populatesFireAge && populatesSovereignty && populatesSavingsRate && populatesResilience

    results.push({
      name: 'GET /api/snapshots/auto populates all 5 new columns',
      pass: allPopulated,
      detail: allPopulated
        ? 'Auto monthly snapshot computes and stores: freedom_percentage, fire_age, sovereignty_level, savings_rate, resilience_score'
        : `freedom: ${populatesFreedom}, fireAge: ${populatesFireAge}, sovereignty: ${populatesSovereignty}, savings: ${populatesSavingsRate}, resilience: ${populatesResilience}`,
    })
  } catch (e) {
    results.push({ name: 'GET /api/snapshots/auto populates all 5 new columns', pass: false, detail: String(e) })
  }

  // ─── Test 10: GET /api/snapshots/cron populates new columns ──────
  try {
    const cronPath = join(cwd, 'app/api/snapshots/cron/route.ts')
    const source = readFileSync(cronPath, 'utf8')

    const populatesFreedom = source.includes('freedom_percentage:') && source.includes('freedomPercentage')
    const populatesFireAge = source.includes('fire_age:') && source.includes('fireProjection.fireAge')
    const populatesSovereignty = source.includes('sovereignty_level:') && source.includes('computeSovereigntyLevel')
    const populatesSavingsRate = source.includes('savings_rate:') && source.includes('savingsRate')
    const populatesResilience = source.includes('resilience_score:') && source.includes('computeResilienceScore')

    const allPopulated = populatesFreedom && populatesFireAge && populatesSovereignty && populatesSavingsRate && populatesResilience

    results.push({
      name: 'GET /api/snapshots/cron populates all 5 new columns',
      pass: allPopulated,
      detail: allPopulated
        ? 'Cron bulk snapshot computes and stores: freedom_percentage, fire_age, sovereignty_level, savings_rate, resilience_score'
        : `freedom: ${populatesFreedom}, fireAge: ${populatesFireAge}, sovereignty: ${populatesSovereignty}, savings: ${populatesSavingsRate}, resilience: ${populatesResilience}`,
    })
  } catch (e) {
    results.push({ name: 'GET /api/snapshots/cron populates all 5 new columns', pass: false, detail: String(e) })
  }

  // ─── Test 11: Graceful fallback when columns don't exist ─────────
  try {
    const snapshotsSource = readFileSync(join(cwd, 'app/api/snapshots/route.ts'), 'utf8')
    const autoSource = readFileSync(join(cwd, 'app/api/snapshots/auto/route.ts'), 'utf8')
    const cronSource = readFileSync(join(cwd, 'app/api/snapshots/cron/route.ts'), 'utf8')

    const snapshotsFallback = snapshotsSource.includes('extendedFields') &&
      snapshotsSource.includes('fullError') &&
      snapshotsSource.includes('basicSnapshot')
    const autoFallback = autoSource.includes('extendedFields') &&
      autoSource.includes('fullError') &&
      autoSource.includes('basicSnapshot')
    const cronFallback = cronSource.includes('upsertError') &&
      cronSource.includes('basicError')

    results.push({
      name: 'Graceful fallback if columns missing (backward compat)',
      pass: snapshotsFallback && autoFallback && cronFallback,
      detail: snapshotsFallback && autoFallback && cronFallback
        ? 'All 3 endpoints try extended fields first, fall back to basic 5 columns if migration not applied'
        : `snapshots: ${snapshotsFallback}, auto: ${autoFallback}, cron: ${cronFallback}`,
    })
  } catch (e) {
    results.push({ name: 'Graceful fallback if columns missing (backward compat)', pass: false, detail: String(e) })
  }

  // ─── Test 12: GET /api/apply-migration checks column status ──────
  try {
    const applySource = readFileSync(join(cwd, 'app/api/apply-migration/route.ts'), 'utf8')

    const checksColumns = applySource.includes("'freedom_percentage'") &&
      applySource.includes("'fire_age'") &&
      applySource.includes("'sovereignty_level'") &&
      applySource.includes("'savings_rate'") &&
      applySource.includes("'resilience_score'")
    const hasGetEndpoint = applySource.includes('export async function GET()')
    const reportsStatus = applySource.includes('all_columns_exist')

    results.push({
      name: 'GET /api/apply-migration reports column existence status',
      pass: checksColumns && hasGetEndpoint && reportsStatus,
      detail: checksColumns && hasGetEndpoint && reportsStatus
        ? 'GET endpoint checks all 5 columns and reports complete/incomplete status'
        : `checks: ${checksColumns}, GET: ${hasGetEndpoint}, status: ${reportsStatus}`,
    })
  } catch (e) {
    results.push({ name: 'GET /api/apply-migration reports column existence status', pass: false, detail: String(e) })
  }

  // ─── Test 13: auto endpoint selects new columns when checking existing ──
  try {
    const autoSource = readFileSync(join(cwd, 'app/api/snapshots/auto/route.ts'), 'utf8')

    const selectsNewColumns = autoSource.includes('freedom_percentage') &&
      autoSource.includes('fire_age') &&
      autoSource.includes('sovereignty_level') &&
      autoSource.includes('savings_rate') &&
      autoSource.includes('resilience_score') &&
      autoSource.includes('.select(')

    results.push({
      name: 'Auto endpoint selects new columns when returning existing snapshot',
      pass: selectsNewColumns,
      detail: selectsNewColumns
        ? 'GET /api/snapshots/auto selects all 5 new columns when returning already-existing monthly snapshot'
        : 'New columns not included in SELECT query for existing snapshots',
    })
  } catch (e) {
    results.push({ name: 'Auto endpoint selects new columns when returning existing snapshot', pass: false, detail: String(e) })
  }

  // ─── Test 14: Correct data types for all columns ──────────────────
  try {
    const migrationPath = join(cwd, 'supabase/migrations/20260215000001_create_new_tables.sql')
    const migrationSource = readFileSync(migrationPath, 'utf8')

    const freedomIsNumeric = migrationSource.includes('freedom_percentage NUMERIC')
    const fireAgeIsNumeric = migrationSource.includes('fire_age NUMERIC')
    const sovereigntyIsInt = migrationSource.includes('sovereignty_level INT')
    const savingsIsNumeric = migrationSource.includes('savings_rate NUMERIC')
    const resilienceIsInt = migrationSource.includes('resilience_score INT')

    const allCorrect = freedomIsNumeric && fireAgeIsNumeric && sovereigntyIsInt && savingsIsNumeric && resilienceIsInt

    results.push({
      name: 'Correct data types: NUMERIC for %, INT for level/score',
      pass: allCorrect,
      detail: allCorrect
        ? 'freedom_percentage=NUMERIC, fire_age=NUMERIC, sovereignty_level=INT, savings_rate=NUMERIC, resilience_score=INT'
        : `freedom: ${freedomIsNumeric ? 'NUMERIC' : '?'}, fire_age: ${fireAgeIsNumeric ? 'NUMERIC' : '?'}, sovereignty: ${sovereigntyIsInt ? 'INT' : '?'}, savings: ${savingsIsNumeric ? 'NUMERIC' : '?'}, resilience: ${resilienceIsInt ? 'INT' : '?'}`,
    })
  } catch (e) {
    results.push({ name: 'Correct data types: NUMERIC for %, INT for level/score', pass: false, detail: String(e) })
  }

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#248 — Enhanced net_worth_snapshots table columns',
    summary: `${passing}/${total} tests passing`,
    all_passing: passing === total,
    tests: results,
  })
}
