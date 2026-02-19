import { NextRequest, NextResponse } from 'next/server'

// Household migration SQL statements - executed individually for error handling
const MIGRATION_STATEMENTS = [
  // 1. households table
  `CREATE TABLE IF NOT EXISTS households (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    split_mode TEXT NOT NULL DEFAULT 'equal' CHECK (split_mode IN ('equal', 'income_ratio', 'custom', 'one_carries_all')),
    custom_split_pct NUMERIC CHECK (custom_split_pct >= 0 AND custom_split_pct <= 100),
    primary_payer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE households ENABLE ROW LEVEL SECURITY`,

  // 2. household_members table
  `CREATE TABLE IF NOT EXISTS household_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    sort_order INT NOT NULL DEFAULT 0,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(household_id, user_id)
  )`,
  `ALTER TABLE household_members ENABLE ROW LEVEL SECURITY`,

  // 3. household_invitations table
  `CREATE TABLE IF NOT EXISTS household_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    invited_email TEXT NOT NULL,
    token UUID NOT NULL DEFAULT gen_random_uuid(),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE household_invitations ENABLE ROW LEVEL SECURITY`,

  // 4. Add ownership + household_id to existing tables
  `ALTER TABLE assets ADD COLUMN IF NOT EXISTS ownership TEXT NOT NULL DEFAULT 'personal'`,
  `DO $$ BEGIN ALTER TABLE assets ADD CONSTRAINT assets_ownership_check CHECK (ownership IN ('personal', 'shared')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `ALTER TABLE assets ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE SET NULL`,

  `ALTER TABLE debts ADD COLUMN IF NOT EXISTS ownership TEXT NOT NULL DEFAULT 'personal'`,
  `DO $$ BEGIN ALTER TABLE debts ADD CONSTRAINT debts_ownership_check CHECK (ownership IN ('personal', 'shared')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `ALTER TABLE debts ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE SET NULL`,

  `ALTER TABLE budgets ADD COLUMN IF NOT EXISTS ownership TEXT NOT NULL DEFAULT 'personal'`,
  `DO $$ BEGIN ALTER TABLE budgets ADD CONSTRAINT budgets_ownership_check CHECK (ownership IN ('personal', 'shared')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `ALTER TABLE budgets ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE SET NULL`,

  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ownership TEXT NOT NULL DEFAULT 'personal'`,
  `DO $$ BEGIN ALTER TABLE transactions ADD CONSTRAINT transactions_ownership_check CHECK (ownership IN ('personal', 'shared')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE SET NULL`,

  `ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS ownership TEXT NOT NULL DEFAULT 'personal'`,
  `DO $$ BEGIN ALTER TABLE bank_accounts ADD CONSTRAINT bank_accounts_ownership_check CHECK (ownership IN ('personal', 'shared')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE SET NULL`,

  `ALTER TABLE net_worth_snapshots ADD COLUMN IF NOT EXISTS ownership TEXT NOT NULL DEFAULT 'personal'`,
  `DO $$ BEGIN ALTER TABLE net_worth_snapshots ADD CONSTRAINT net_worth_snapshots_ownership_check CHECK (ownership IN ('personal', 'shared')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `ALTER TABLE net_worth_snapshots ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE SET NULL`,

  `ALTER TABLE valuations ADD COLUMN IF NOT EXISTS ownership TEXT NOT NULL DEFAULT 'personal'`,
  `DO $$ BEGIN ALTER TABLE valuations ADD CONSTRAINT valuations_ownership_check CHECK (ownership IN ('personal', 'shared')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `ALTER TABLE valuations ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE SET NULL`,

  `ALTER TABLE recurring_transactions ADD COLUMN IF NOT EXISTS ownership TEXT NOT NULL DEFAULT 'personal'`,
  `DO $$ BEGIN ALTER TABLE recurring_transactions ADD CONSTRAINT recurring_transactions_ownership_check CHECK (ownership IN ('personal', 'shared')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `ALTER TABLE recurring_transactions ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE SET NULL`,

  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE SET NULL`,

  // 5. Indexes
  `CREATE INDEX IF NOT EXISTS idx_assets_household ON assets (household_id) WHERE household_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_debts_household ON debts (household_id) WHERE household_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_budgets_household ON budgets (household_id) WHERE household_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_household ON transactions (household_id) WHERE household_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_bank_accounts_household ON bank_accounts (household_id) WHERE household_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_net_worth_snapshots_household ON net_worth_snapshots (household_id) WHERE household_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_valuations_household ON valuations (household_id) WHERE household_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_recurring_transactions_household ON recurring_transactions (household_id) WHERE household_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_profiles_household ON profiles (household_id) WHERE household_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_household_members_user ON household_members (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_household_invitations_email ON household_invitations (invited_email)`,
  `CREATE INDEX IF NOT EXISTS idx_household_invitations_token ON household_invitations (token)`,

  // 6. RLS policies for households
  `DO $$ BEGIN CREATE POLICY "Members can view own household" ON households FOR SELECT TO authenticated USING (id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE POLICY "Owner can update household" ON households FOR UPDATE TO authenticated USING (id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND role = 'owner')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE POLICY "Authenticated users can create households" ON households FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE POLICY "Owner can delete household" ON households FOR DELETE TO authenticated USING (created_by = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  // 7. RLS policies for household_members
  `DO $$ BEGIN CREATE POLICY "Members can view household members" ON household_members FOR SELECT TO authenticated USING (household_id IN (SELECT hm.household_id FROM household_members hm WHERE hm.user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE POLICY "Can insert household members" ON household_members FOR INSERT TO authenticated WITH CHECK (household_id IN (SELECT hm.household_id FROM household_members hm WHERE hm.user_id = auth.uid() AND hm.role = 'owner') OR user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE POLICY "Owner can update household members" ON household_members FOR UPDATE TO authenticated USING (household_id IN (SELECT hm.household_id FROM household_members hm WHERE hm.user_id = auth.uid() AND hm.role = 'owner')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE POLICY "Members can leave or owner can remove" ON household_members FOR DELETE TO authenticated USING (user_id = auth.uid() OR household_id IN (SELECT hm.household_id FROM household_members hm WHERE hm.user_id = auth.uid() AND hm.role = 'owner')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  // 8. RLS policies for household_invitations
  `DO $$ BEGIN CREATE POLICY "Members can view household invitations" ON household_invitations FOR SELECT TO authenticated USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()) OR invited_email IN (SELECT email FROM auth.users WHERE id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE POLICY "Owner can create invitations" ON household_invitations FOR INSERT TO authenticated WITH CHECK (invited_by = auth.uid() AND household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND role = 'owner')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE POLICY "Owner or invitee can update invitations" ON household_invitations FOR UPDATE TO authenticated USING (invited_by = auth.uid() OR invited_email IN (SELECT email FROM auth.users WHERE id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE POLICY "Owner can delete invitations" ON household_invitations FOR DELETE TO authenticated USING (invited_by = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  // 9. Helper function: user_household_id()
  `CREATE OR REPLACE FUNCTION public.user_household_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
    SELECT household_id FROM household_members WHERE user_id = auth.uid() LIMIT 1;
  $$`,

  // 10. Privacy-safe partner totals function
  `CREATE OR REPLACE FUNCTION public.household_partner_totals()
  RETURNS TABLE (
    partner_total_assets NUMERIC,
    partner_total_debts NUMERIC,
    partner_net_worth NUMERIC
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
    WITH my_household AS (
      SELECT household_id FROM household_members WHERE user_id = auth.uid() LIMIT 1
    ),
    partner AS (
      SELECT hm.user_id
      FROM household_members hm
      JOIN my_household mh ON hm.household_id = mh.household_id
      WHERE hm.user_id != auth.uid()
      LIMIT 1
    )
    SELECT
      COALESCE((SELECT SUM(a.current_value) FROM assets a WHERE a.user_id = p.user_id AND a.is_active = true AND a.ownership = 'personal'), 0) AS partner_total_assets,
      COALESCE((SELECT SUM(d.current_balance) FROM debts d WHERE d.user_id = p.user_id AND d.is_active = true AND d.ownership = 'personal'), 0) AS partner_total_debts,
      COALESCE((SELECT SUM(a.current_value) FROM assets a WHERE a.user_id = p.user_id AND a.is_active = true AND a.ownership = 'personal'), 0) -
      COALESCE((SELECT SUM(d.current_balance) FROM debts d WHERE d.user_id = p.user_id AND d.is_active = true AND d.ownership = 'personal'), 0) AS partner_net_worth
    FROM partner p;
  $$`,
]

// Helper: check if error means "not found"
function isNotFoundError(msg: string): boolean {
  const lower = msg.toLowerCase()
  return lower.includes('relation') || lower.includes('does not exist') || lower.includes('could not find')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { db_password, access_token } = body

    if (!db_password && !access_token) {
      return NextResponse.json({
        error: 'Provide db_password or access_token',
        usage: {
          option1: 'POST with {"db_password":"YOUR_DB_PASSWORD"}',
          option2: 'POST with {"access_token":"YOUR_SUPABASE_ACCESS_TOKEN"}',
          where_to_find: {
            db_password: 'Supabase Dashboard > Settings > Database > Connection string',
            access_token: 'https://supabase.com/dashboard/account/tokens',
          }
        },
      }, { status: 400 })
    }

    const ref = 'pnnuqwdcgoympgddrvze'

    // Method 1: Direct PostgreSQL connection with db_password
    if (db_password) {
      const connectionString = `postgresql://postgres.${ref}:${encodeURIComponent(db_password)}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`
      const postgres = (await import('postgres')).default
      const sql = postgres(connectionString, {
        ssl: 'require',
        connect_timeout: 10,
        idle_timeout: 5,
      })

      const results: Array<{ statement: string; status: 'ok' | 'skip' | 'error'; message?: string }> = []
      for (const stmt of MIGRATION_STATEMENTS) {
        const preview = stmt.substring(0, 100).replace(/\n/g, ' ').trim()
        try {
          await sql.unsafe(stmt)
          results.push({ statement: preview, status: 'ok' })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          if (message.includes('already exists')) {
            results.push({ statement: preview, status: 'skip', message: 'Already exists' })
          } else {
            results.push({ statement: preview, status: 'error', message })
          }
        }
      }

      // Verify tables exist
      const verifyTables = await sql`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN ('households', 'household_members', 'household_invitations')
        ORDER BY table_name
      `
      const tables = verifyTables.map((r: any) => r.table_name)

      // Verify ownership columns on key tables
      const verifyColumns = await sql`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND column_name IN ('ownership', 'household_id')
        AND table_name IN ('assets', 'debts', 'budgets', 'transactions', 'bank_accounts', 'net_worth_snapshots', 'valuations', 'recurring_transactions', 'profiles')
        ORDER BY table_name, column_name
      `

      // Verify functions
      const verifyFunctions = await sql`
        SELECT routine_name FROM information_schema.routines
        WHERE routine_schema = 'public'
        AND routine_name IN ('user_household_id', 'household_partner_totals')
      `

      // Verify RLS enabled
      const verifyRLS = await sql`
        SELECT tablename, rowsecurity FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename IN ('households', 'household_members', 'household_invitations')
      `

      // Verify policies
      const verifyPolicies = await sql`
        SELECT tablename, policyname FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename IN ('households', 'household_members', 'household_invitations')
        ORDER BY tablename, policyname
      `

      await sql.end()

      return NextResponse.json({
        status: 'success',
        method: 'direct_postgres',
        summary: {
          total: results.length,
          success: results.filter(r => r.status === 'ok').length,
          skipped: results.filter(r => r.status === 'skip').length,
          errors: results.filter(r => r.status === 'error').length,
        },
        household_tables: tables,
        ownership_columns: verifyColumns,
        functions: verifyFunctions.map((r: any) => r.routine_name),
        rls_enabled: verifyRLS,
        policies: verifyPolicies,
        results,
      })
    }

    // Method 2: Supabase Management API with access_token
    if (access_token) {
      const fullSQL = MIGRATION_STATEMENTS.join(';\n\n') + ';'
      const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: fullSQL }),
      })

      const text = await response.text()
      if (!response.ok) {
        return NextResponse.json({ status: 'error', method: 'management_api', error: text }, { status: response.status })
      }

      return NextResponse.json({ status: 'success', method: 'management_api', response: text })
    }

    return NextResponse.json({ error: 'Unexpected state' }, { status: 500 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ status: 'error', error: message }, { status: 500 })
  }
}

// GET returns migration verification status
export async function GET() {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const requiredTables = ['households', 'household_members', 'household_invitations']
  const ownershipTables = ['assets', 'debts', 'budgets']

  const tableStatus: Record<string, boolean> = {}
  for (const table of requiredTables) {
    const { error } = await supabase.from(table).select('id').limit(0)
    tableStatus[table] = !error || !isNotFoundError(error.message)
  }

  const ownershipStatus: Record<string, boolean> = {}
  for (const table of ownershipTables) {
    const { error } = await supabase.from(table).select('ownership').limit(0)
    ownershipStatus[`${table}_ownership`] = !error || !isNotFoundError(error.message)
  }

  const householdIdStatus: Record<string, boolean> = {}
  for (const table of ownershipTables) {
    const { error } = await supabase.from(table).select('household_id').limit(0)
    householdIdStatus[`${table}_household_id`] = !error || !isNotFoundError(error.message)
  }

  // Check profiles.household_id
  const { error: profileError } = await supabase.from('profiles').select('household_id').limit(0)
  const profileHouseholdId = !profileError || !isNotFoundError(profileError.message)

  // Check functions
  const { error: fnError1 } = await supabase.rpc('user_household_id')
  const userHouseholdIdFn = !fnError1 || !isNotFoundError(fnError1.message)

  const { error: fnError2 } = await supabase.rpc('household_partner_totals')
  const partnerTotalsFn = !fnError2 || !isNotFoundError(fnError2.message)

  const allTablesMigrated = Object.values(tableStatus).every(Boolean)
  const allOwnershipCols = Object.values(ownershipStatus).every(Boolean)
  const allHouseholdIdCols = Object.values(householdIdStatus).every(Boolean)
  const allFunctions = userHouseholdIdFn && partnerTotalsFn

  return NextResponse.json({
    status: allTablesMigrated && allOwnershipCols && allHouseholdIdCols && profileHouseholdId && allFunctions ? 'complete' : 'incomplete',
    tables: tableStatus,
    ownership_columns: ownershipStatus,
    household_id_columns: householdIdStatus,
    profiles_household_id: profileHouseholdId,
    functions: { user_household_id: userHouseholdIdFn, household_partner_totals: partnerTotalsFn },
    all_tables_exist: allTablesMigrated,
    all_ownership_columns: allOwnershipCols,
    all_household_id_columns: allHouseholdIdCols,
    all_functions: allFunctions,
  })
}
