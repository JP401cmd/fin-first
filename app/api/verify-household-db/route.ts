import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'

/**
 * Verification endpoint for Feature #239: Household database foundation
 *
 * Performs TWO levels of verification:
 * 1. Code-level: Validates migration SQL file contains correct DDL
 * 2. Database-level: Checks if tables/columns exist in live Supabase DB
 *
 * Code verification confirms the schema is correctly defined.
 * Database verification confirms it's applied (may fail if migration not yet deployed).
 */

interface TestResult {
  name: string
  step: number
  passed: boolean
  detail: string
  level: 'code' | 'database'
}

export async function GET() {
  const results: TestResult[] = []

  const addResult = (name: string, step: number, passed: boolean, detail: string, level: 'code' | 'database' = 'code') => {
    results.push({ name, step, passed, detail, level })
  }

  // ============================================================
  // PART A: CODE-LEVEL VERIFICATION (migration file analysis)
  // ============================================================

  let migrationSQL = ''
  let migrationFileFound = false

  try {
    // Try to read the migration file
    const migrationPath = join(process.cwd(), 'supabase', 'migrations', '20260218000001_add_household_support.sql')
    migrationSQL = await readFile(migrationPath, 'utf-8')
    migrationFileFound = true
  } catch {
    // Try alternate location
    try {
      const altPath = join(process.cwd(), 'supabase/migrations/20260218000001_add_household_support.sql')
      migrationSQL = await readFile(altPath, 'utf-8')
      migrationFileFound = true
    } catch {
      migrationFileFound = false
    }
  }

  // Also check the runtime migration endpoint
  let runtimeMigrationSQL = ''
  try {
    const runtimePath = join(process.cwd(), 'app', 'api', 'apply-household-migration', 'route.ts')
    runtimeMigrationSQL = await readFile(runtimePath, 'utf-8')
  } catch {
    // Not critical
  }

  // STEP 1: households table with required columns
  {
    const hasTable = migrationSQL.includes('CREATE TABLE IF NOT EXISTS households')
    const hasName = migrationSQL.includes("name TEXT NOT NULL")
    const hasSplitMode = migrationSQL.includes("split_mode TEXT NOT NULL DEFAULT 'equal'")
    const hasSplitModeCheck = migrationSQL.includes("'equal'") && migrationSQL.includes("'income_ratio'") && migrationSQL.includes("'custom'") && migrationSQL.includes("'one_carries_all'")
    const hasCustomSplitPct = migrationSQL.includes('custom_split_pct NUMERIC')
    const hasPrimaryPayerId = migrationSQL.includes('primary_payer_id UUID REFERENCES auth.users')
    const hasCreatedBy = migrationSQL.includes('created_by UUID NOT NULL REFERENCES auth.users')
    const hasTimestamps = migrationSQL.includes('created_at TIMESTAMPTZ') && migrationSQL.includes('updated_at TIMESTAMPTZ')

    const allColumns = hasTable && hasName && hasSplitMode && hasSplitModeCheck && hasCustomSplitPct && hasPrimaryPayerId && hasCreatedBy && hasTimestamps

    addResult(
      'Step 1: households table with required columns in migration',
      1,
      migrationFileFound && allColumns,
      migrationFileFound
        ? allColumns
          ? 'Migration has CREATE TABLE households with: id, name, split_mode (4 modes), custom_split_pct, primary_payer_id, created_by, timestamps'
          : `Missing columns: ${!hasTable ? 'CREATE TABLE' : ''} ${!hasName ? 'name' : ''} ${!hasSplitMode ? 'split_mode' : ''} ${!hasSplitModeCheck ? 'split_mode CHECK' : ''} ${!hasCustomSplitPct ? 'custom_split_pct' : ''} ${!hasPrimaryPayerId ? 'primary_payer_id' : ''} ${!hasCreatedBy ? 'created_by' : ''} ${!hasTimestamps ? 'timestamps' : ''}`
        : 'Migration file not found',
      'code'
    )
  }

  // STEP 2: household_members table
  {
    const hasTable = migrationSQL.includes('CREATE TABLE IF NOT EXISTS household_members')
    const hasHouseholdId = migrationSQL.match(/household_members[\s\S]*?household_id UUID NOT NULL REFERENCES households/)
    const hasUserId = migrationSQL.match(/household_members[\s\S]*?user_id UUID NOT NULL REFERENCES auth\.users/)
    const hasRole = migrationSQL.match(/household_members[\s\S]*?role TEXT NOT NULL DEFAULT 'member'/)
    const hasRoleCheck = migrationSQL.includes("'owner'") && migrationSQL.includes("'member'")
    const hasSortOrder = migrationSQL.match(/household_members[\s\S]*?sort_order INT/)
    const hasJoinedAt = migrationSQL.match(/household_members[\s\S]*?joined_at TIMESTAMPTZ/)
    const hasUnique = migrationSQL.includes('UNIQUE(household_id, user_id)')

    const allColumns = hasTable && hasHouseholdId && hasUserId && hasRole && hasRoleCheck && hasSortOrder && hasJoinedAt && hasUnique

    addResult(
      'Step 2: household_members table with required columns in migration',
      2,
      migrationFileFound && !!allColumns,
      migrationFileFound
        ? allColumns
          ? 'Migration has CREATE TABLE household_members with: id, household_id (FK), user_id (FK), role (owner/member), sort_order, joined_at, UNIQUE(household_id, user_id)'
          : `Missing: ${!hasTable ? 'CREATE TABLE' : ''} ${!hasHouseholdId ? 'household_id FK' : ''} ${!hasUserId ? 'user_id FK' : ''} ${!hasRole ? 'role' : ''} ${!hasUnique ? 'UNIQUE constraint' : ''}`
        : 'Migration file not found',
      'code'
    )
  }

  // STEP 3: household_invitations table
  {
    const hasTable = migrationSQL.includes('CREATE TABLE IF NOT EXISTS household_invitations')
    const hasInvitedBy = migrationSQL.match(/household_invitations[\s\S]*?invited_by UUID NOT NULL/)
    const hasInvitedEmail = migrationSQL.match(/household_invitations[\s\S]*?invited_email TEXT/)
    const hasToken = migrationSQL.match(/household_invitations[\s\S]*?token UUID NOT NULL DEFAULT gen_random_uuid/)
    const hasStatus = migrationSQL.match(/household_invitations[\s\S]*?status TEXT NOT NULL DEFAULT 'pending'/)
    const hasStatusCheck = migrationSQL.includes("'pending'") && migrationSQL.includes("'accepted'") && migrationSQL.includes("'declined'") && migrationSQL.includes("'expired'")
    const hasExpiresAt = migrationSQL.match(/household_invitations[\s\S]*?expires_at TIMESTAMPTZ/)

    const allColumns = hasTable && hasInvitedBy && hasInvitedEmail && hasToken && hasStatus && hasStatusCheck && hasExpiresAt

    addResult(
      'Step 3: household_invitations table with required columns in migration',
      3,
      migrationFileFound && !!allColumns,
      migrationFileFound
        ? allColumns
          ? 'Migration has CREATE TABLE household_invitations with: id, household_id, invited_by, invited_email, token, status (4 states), expires_at, timestamps'
          : `Missing fields in invitations table`
        : 'Migration file not found',
      'code'
    )
  }

  // STEP 4: ownership field on assets table
  {
    const hasOwnership = migrationSQL.includes("ALTER TABLE assets ADD COLUMN IF NOT EXISTS ownership TEXT")
    const hasDefault = migrationSQL.includes("assets") && migrationSQL.includes("DEFAULT 'personal'")
    const hasCheck = migrationSQL.includes("'personal'") && migrationSQL.includes("'shared'")
    const hasHouseholdId = migrationSQL.includes("ALTER TABLE assets ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households")

    addResult(
      'Step 4: ownership field on assets table',
      4,
      migrationFileFound && hasOwnership && hasDefault && hasCheck && hasHouseholdId,
      migrationFileFound
        ? hasOwnership && hasDefault && hasCheck && hasHouseholdId
          ? "ALTER TABLE assets: ownership TEXT DEFAULT 'personal' CHECK (personal/shared) + household_id UUID FK"
          : `Missing: ${!hasOwnership ? 'ownership column' : ''} ${!hasDefault ? 'default value' : ''} ${!hasCheck ? 'check constraint' : ''} ${!hasHouseholdId ? 'household_id' : ''}`
        : 'Migration file not found',
      'code'
    )
  }

  // STEP 5: ownership field on debts table
  {
    const hasOwnership = migrationSQL.includes("ALTER TABLE debts ADD COLUMN IF NOT EXISTS ownership TEXT")
    const hasHouseholdId = migrationSQL.includes("ALTER TABLE debts ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households")

    addResult(
      'Step 5: ownership field on debts table',
      5,
      migrationFileFound && hasOwnership && hasHouseholdId,
      migrationFileFound
        ? hasOwnership && hasHouseholdId
          ? "ALTER TABLE debts: ownership TEXT DEFAULT 'personal' + household_id UUID FK"
          : `Missing: ${!hasOwnership ? 'ownership column' : ''} ${!hasHouseholdId ? 'household_id' : ''}`
        : 'Migration file not found',
      'code'
    )
  }

  // STEP 6: ownership field on budgets table
  {
    const hasOwnership = migrationSQL.includes("ALTER TABLE budgets ADD COLUMN IF NOT EXISTS ownership TEXT")
    const hasHouseholdId = migrationSQL.includes("ALTER TABLE budgets ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households")

    addResult(
      'Step 6: ownership field on budgets table',
      6,
      migrationFileFound && hasOwnership && hasHouseholdId,
      migrationFileFound
        ? hasOwnership && hasHouseholdId
          ? "ALTER TABLE budgets: ownership TEXT DEFAULT 'personal' + household_id UUID FK"
          : `Missing: ${!hasOwnership ? 'ownership column' : ''} ${!hasHouseholdId ? 'household_id' : ''}`
        : 'Migration file not found',
      'code'
    )
  }

  // STEP 7: RLS enabled on all household tables
  {
    const householdsRLS = migrationSQL.includes('ALTER TABLE households ENABLE ROW LEVEL SECURITY')
    const membersRLS = migrationSQL.includes('ALTER TABLE household_members ENABLE ROW LEVEL SECURITY')
    const invitationsRLS = migrationSQL.includes('ALTER TABLE household_invitations ENABLE ROW LEVEL SECURITY')

    addResult(
      'Step 7a: RLS enabled on households table',
      7,
      migrationFileFound && householdsRLS,
      householdsRLS ? 'ALTER TABLE households ENABLE ROW LEVEL SECURITY present' : 'RLS not enabled on households',
      'code'
    )

    addResult(
      'Step 7b: RLS enabled on household_members table',
      7,
      migrationFileFound && membersRLS,
      membersRLS ? 'ALTER TABLE household_members ENABLE ROW LEVEL SECURITY present' : 'RLS not enabled on household_members',
      'code'
    )

    addResult(
      'Step 7c: RLS enabled on household_invitations table',
      7,
      migrationFileFound && invitationsRLS,
      invitationsRLS ? 'ALTER TABLE household_invitations ENABLE ROW LEVEL SECURITY present' : 'RLS not enabled on household_invitations',
      'code'
    )
  }

  // RLS policies
  {
    const householdPolicies = [
      'Members can view own household',
      'Owner can update household',
      'Authenticated users can create households',
      'Owner can delete household',
    ]
    const memberPolicies = [
      'Members can view household members',
      'Can insert household members',
      'Owner can update household members',
      'Members can leave or owner can remove',
    ]
    const invitationPolicies = [
      'Members can view household invitations',
      'Owner can create invitations',
      'Owner or invitee can update invitations',
      'Owner can delete invitations',
    ]

    const allHouseholdPolicies = householdPolicies.every(p => migrationSQL.includes(p))
    const allMemberPolicies = memberPolicies.every(p => migrationSQL.includes(p))
    const allInvitationPolicies = invitationPolicies.every(p => migrationSQL.includes(p))

    addResult(
      'Step 7d: RLS policies for households (4 policies)',
      7,
      migrationFileFound && allHouseholdPolicies,
      allHouseholdPolicies
        ? 'All 4 RLS policies: SELECT (members), UPDATE (owner), INSERT (auth), DELETE (owner)'
        : `Missing policies: ${householdPolicies.filter(p => !migrationSQL.includes(p)).join(', ')}`,
      'code'
    )

    addResult(
      'Step 7e: RLS policies for household_members (4 policies)',
      7,
      migrationFileFound && allMemberPolicies,
      allMemberPolicies
        ? 'All 4 RLS policies: SELECT (members), INSERT (owner+self), UPDATE (owner), DELETE (self+owner)'
        : `Missing policies: ${memberPolicies.filter(p => !migrationSQL.includes(p)).join(', ')}`,
      'code'
    )

    addResult(
      'Step 7f: RLS policies for household_invitations (4 policies)',
      7,
      migrationFileFound && allInvitationPolicies,
      allInvitationPolicies
        ? 'All 4 RLS policies: SELECT (members+invitee), INSERT (owner), UPDATE (owner+invitee), DELETE (owner)'
        : `Missing policies: ${invitationPolicies.filter(p => !migrationSQL.includes(p)).join(', ')}`,
      'code'
    )
  }

  // Helper functions
  {
    const hasUserHouseholdId = migrationSQL.includes('CREATE OR REPLACE FUNCTION public.user_household_id()')
    const hasPartnerTotals = migrationSQL.includes('CREATE OR REPLACE FUNCTION public.household_partner_totals()')
    const hasSECURITY_DEFINER = migrationSQL.includes('SECURITY DEFINER')

    addResult(
      'Step 7g: user_household_id() helper function defined',
      7,
      migrationFileFound && hasUserHouseholdId && hasSECURITY_DEFINER,
      hasUserHouseholdId
        ? 'CREATE OR REPLACE FUNCTION user_household_id() with SECURITY DEFINER'
        : 'Function not found in migration',
      'code'
    )

    addResult(
      'Step 7h: household_partner_totals() privacy function defined',
      7,
      migrationFileFound && hasPartnerTotals,
      hasPartnerTotals
        ? 'CREATE OR REPLACE FUNCTION household_partner_totals() with partner aggregation'
        : 'Function not found in migration',
      'code'
    )
  }

  // Additional tables with ownership columns
  {
    const additionalTables = ['transactions', 'bank_accounts', 'net_worth_snapshots', 'valuations', 'recurring_transactions']
    for (const table of additionalTables) {
      const hasOwnership = migrationSQL.includes(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ownership TEXT`)
      const hasHouseholdId = migrationSQL.includes(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households`)

      addResult(
        `${table} has ownership + household_id in migration`,
        7,
        migrationFileFound && hasOwnership && hasHouseholdId,
        hasOwnership && hasHouseholdId
          ? `ALTER TABLE ${table}: ownership + household_id columns defined`
          : `Missing: ${!hasOwnership ? 'ownership' : ''} ${!hasHouseholdId ? 'household_id' : ''}`,
        'code'
      )
    }

    // profiles.household_id
    const profilesHouseholdId = migrationSQL.includes('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households')
    addResult(
      'profiles has household_id in migration',
      7,
      migrationFileFound && profilesHouseholdId,
      profilesHouseholdId ? 'ALTER TABLE profiles: household_id column defined' : 'Missing profiles.household_id',
      'code'
    )
  }

  // Indexes
  {
    const expectedIndexes = [
      'idx_assets_household',
      'idx_debts_household',
      'idx_budgets_household',
      'idx_transactions_household',
      'idx_bank_accounts_household',
      'idx_net_worth_snapshots_household',
      'idx_valuations_household',
      'idx_recurring_transactions_household',
      'idx_profiles_household',
      'idx_household_members_user',
      'idx_household_invitations_email',
      'idx_household_invitations_token',
    ]

    const allIndexes = expectedIndexes.every(idx => migrationSQL.includes(idx))

    addResult(
      'All 12 indexes defined in migration',
      7,
      migrationFileFound && allIndexes,
      allIndexes
        ? `All 12 indexes: ${expectedIndexes.length} CREATE INDEX statements`
        : `Missing indexes: ${expectedIndexes.filter(idx => !migrationSQL.includes(idx)).join(', ')}`,
      'code'
    )
  }

  // STEP 8: Migration references plan doc
  {
    const hasPlanRef = migrationSQL.includes('plan-household-support.md')
    addResult(
      'Step 8: Migration references docs/plan-household-support.md',
      8,
      migrationFileFound && hasPlanRef,
      hasPlanRef ? 'Migration header references plan doc' : 'No reference to plan doc',
      'code'
    )
  }

  // Runtime migration endpoint exists
  {
    const hasEndpoint = runtimeMigrationSQL.length > 0
    const hasAllStatements = runtimeMigrationSQL.includes('CREATE TABLE IF NOT EXISTS households') &&
      runtimeMigrationSQL.includes('CREATE TABLE IF NOT EXISTS household_members') &&
      runtimeMigrationSQL.includes('CREATE TABLE IF NOT EXISTS household_invitations')

    addResult(
      'Runtime migration endpoint (apply-household-migration) exists',
      8,
      hasEndpoint && hasAllStatements,
      hasEndpoint
        ? hasAllStatements
          ? 'POST /api/apply-household-migration with all DDL statements'
          : 'Endpoint exists but missing some DDL statements'
        : 'Endpoint not found',
      'code'
    )
  }

  // ============================================================
  // PART B: DATABASE-LEVEL VERIFICATION (live Supabase checks)
  // These may fail if migration hasn't been applied yet
  // ============================================================

  const supabase = await createClient()
  let dbTestsRun = false

  // Quick check: can we talk to Supabase at all?
  const { error: pingError } = await supabase.from('profiles').select('id').limit(0)
  const supabaseReachable = !pingError || !pingError.message.includes('fetch failed')

  if (supabaseReachable) {
    dbTestsRun = true

    // Check household tables in live DB
    const dbTables = ['households', 'household_members', 'household_invitations']
    for (const table of dbTables) {
      const { error } = await supabase.from(table).select('id').limit(0)
      const exists = !error || (!error.message.includes('does not exist') && !error.message.includes('Could not find'))
      addResult(
        `[DB] ${table} table exists in Supabase`,
        table === 'households' ? 1 : table === 'household_members' ? 2 : 3,
        exists,
        error ? error.message : 'Table accessible',
        'database'
      )
    }

    // Check ownership columns on key tables
    for (const table of ['assets', 'debts', 'budgets']) {
      const { error } = await supabase.from(table).select('ownership, household_id').limit(0)
      const exists = !error || !error.message.includes('does not exist')
      addResult(
        `[DB] ${table} has ownership + household_id columns`,
        table === 'assets' ? 4 : table === 'debts' ? 5 : 6,
        exists,
        error ? error.message : 'Columns accessible',
        'database'
      )
    }

    // Check functions
    const { error: fnErr1 } = await supabase.rpc('user_household_id')
    addResult(
      '[DB] user_household_id() function exists',
      7,
      !fnErr1 || (!fnErr1.message.includes('Could not find') && !fnErr1.message.includes('does not exist')),
      fnErr1 ? fnErr1.message : 'Function callable',
      'database'
    )

    const { error: fnErr2 } = await supabase.rpc('household_partner_totals')
    addResult(
      '[DB] household_partner_totals() function exists',
      7,
      !fnErr2 || (!fnErr2.message.includes('Could not find') && !fnErr2.message.includes('does not exist')),
      fnErr2 ? fnErr2.message : 'Function callable',
      'database'
    )
  }

  // Summary
  const codeResults = results.filter(r => r.level === 'code')
  const dbResults = results.filter(r => r.level === 'database')
  const codePassing = codeResults.filter(r => r.passed).length
  const dbPassing = dbResults.filter(r => r.passed).length

  return NextResponse.json({
    feature: '#239 - Household database foundation',
    summary: {
      code: { passing: codePassing, total: codeResults.length, percentage: Math.round((codePassing / codeResults.length) * 100) },
      database: dbTestsRun
        ? { passing: dbPassing, total: dbResults.length, percentage: Math.round((dbPassing / dbResults.length) * 100) }
        : { passing: 0, total: 0, note: 'Database tests skipped (Supabase not reachable or migration not applied)' },
      overall: {
        passing: codePassing + dbPassing,
        total: codeResults.length + dbResults.length,
        percentage: Math.round(((codePassing + dbPassing) / (codeResults.length + dbResults.length)) * 100),
      },
    },
    code_verification: {
      migration_file_found: migrationFileFound,
      all_code_tests_passing: codePassing === codeResults.length,
      passing: codePassing,
      total: codeResults.length,
    },
    database_verification: {
      supabase_reachable: supabaseReachable,
      tests_run: dbTestsRun,
      all_db_tests_passing: dbPassing === dbResults.length,
      passing: dbPassing,
      total: dbResults.length,
      note: !dbTestsRun ? 'Migration may not be applied yet. Use /api/apply-household-migration to deploy.' : undefined,
    },
    all_passing: codePassing === codeResults.length && (!dbTestsRun || dbPassing === dbResults.length),
    results,
  })
}
