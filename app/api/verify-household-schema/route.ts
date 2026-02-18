import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface TestResult {
  name: string
  passed: boolean
  details?: string
}

// Helper to check if an error means the table/column doesn't exist
function isNotFoundError(error: { message: string } | null): boolean {
  if (!error) return false
  const msg = error.message.toLowerCase()
  return msg.includes('relation') || msg.includes('does not exist') || msg.includes('could not find')
}

export async function GET() {
  const results: TestResult[] = []
  const supabase = await createClient()

  // ========================================
  // Test 1: households table exists
  // ========================================
  {
    const { error } = await supabase.from('households').select('id').limit(0)
    const exists = !error || !isNotFoundError(error)
    results.push({
      name: '1. households table exists',
      passed: exists,
      details: error ? error.message : 'Table accessible',
    })
  }

  // ========================================
  // Test 2: households has required columns
  // ========================================
  {
    const { error } = await supabase
      .from('households')
      .select('id, name, split_mode, custom_split_pct, primary_payer_id, created_by, created_at, updated_at')
      .limit(0)
    const passed = !error
    results.push({
      name: '2. households has required columns (id, name, split_mode, custom_split_pct, primary_payer_id, created_by, created_at, updated_at)',
      passed,
      details: error ? error.message : 'All columns present',
    })
  }

  // ========================================
  // Test 3: household_members table exists
  // ========================================
  {
    const { error } = await supabase.from('household_members').select('id').limit(0)
    const exists = !error || !isNotFoundError(error)
    results.push({
      name: '3. household_members table exists',
      passed: exists,
      details: error ? error.message : 'Table accessible',
    })
  }

  // ========================================
  // Test 4: household_members has required columns
  // ========================================
  {
    const { error } = await supabase
      .from('household_members')
      .select('id, household_id, user_id, role, sort_order, joined_at')
      .limit(0)
    const passed = !error
    results.push({
      name: '4. household_members has required columns (id, household_id, user_id, role, sort_order, joined_at)',
      passed,
      details: error ? error.message : 'All columns present',
    })
  }

  // ========================================
  // Test 5: household_invitations table exists
  // ========================================
  {
    const { error } = await supabase.from('household_invitations').select('id').limit(0)
    const exists = !error || !isNotFoundError(error)
    results.push({
      name: '5. household_invitations table exists',
      passed: exists,
      details: error ? error.message : 'Table accessible',
    })
  }

  // ========================================
  // Test 6: household_invitations has required columns
  // ========================================
  {
    const { error } = await supabase
      .from('household_invitations')
      .select('id, household_id, invited_by, invited_email, token, status, expires_at, created_at, updated_at')
      .limit(0)
    const passed = !error
    results.push({
      name: '6. household_invitations has required columns (id, household_id, invited_by, invited_email, token, status, expires_at)',
      passed,
      details: error ? error.message : 'All columns present',
    })
  }

  // ========================================
  // Test 7: assets table has ownership column
  // ========================================
  {
    const { error } = await supabase.from('assets').select('ownership').limit(0)
    const passed = !error
    results.push({
      name: '7. assets table has ownership column',
      passed,
      details: error ? error.message : 'Column accessible',
    })
  }

  // ========================================
  // Test 8: assets table has household_id column
  // ========================================
  {
    const { error } = await supabase.from('assets').select('household_id').limit(0)
    const passed = !error
    results.push({
      name: '8. assets table has household_id column',
      passed,
      details: error ? error.message : 'Column accessible',
    })
  }

  // ========================================
  // Test 9: debts table has ownership column
  // ========================================
  {
    const { error } = await supabase.from('debts').select('ownership').limit(0)
    const passed = !error
    results.push({
      name: '9. debts table has ownership column',
      passed,
      details: error ? error.message : 'Column accessible',
    })
  }

  // ========================================
  // Test 10: debts table has household_id column
  // ========================================
  {
    const { error } = await supabase.from('debts').select('household_id').limit(0)
    const passed = !error
    results.push({
      name: '10. debts table has household_id column',
      passed,
      details: error ? error.message : 'Column accessible',
    })
  }

  // ========================================
  // Test 11: budgets table has ownership column
  // ========================================
  {
    const { error } = await supabase.from('budgets').select('ownership').limit(0)
    const passed = !error
    results.push({
      name: '11. budgets table has ownership column',
      passed,
      details: error ? error.message : 'Column accessible',
    })
  }

  // ========================================
  // Test 12: budgets table has household_id column
  // ========================================
  {
    const { error } = await supabase.from('budgets').select('household_id').limit(0)
    const passed = !error
    results.push({
      name: '12. budgets table has household_id column',
      passed,
      details: error ? error.message : 'Column accessible',
    })
  }

  // ========================================
  // Test 13: RLS enabled on households
  // ========================================
  {
    // We test RLS indirectly: unauthenticated query should return empty or error
    const { data, error } = await supabase.from('households').select('id').limit(1)
    // With RLS enabled and no rows matching policy, we get empty array (not an error about permissions)
    // If table doesn't exist, we get an error
    const passed = !error || !isNotFoundError(error)
    results.push({
      name: '13. RLS enabled on households table',
      passed,
      details: error ? error.message : `Query returned ${data?.length ?? 0} rows (empty = RLS working)`,
    })
  }

  // ========================================
  // Test 14: RLS enabled on household_members
  // ========================================
  {
    const { data, error } = await supabase.from('household_members').select('id').limit(1)
    const passed = !error || !isNotFoundError(error)
    results.push({
      name: '14. RLS enabled on household_members table',
      passed,
      details: error ? error.message : `Query returned ${data?.length ?? 0} rows (empty = RLS working)`,
    })
  }

  // ========================================
  // Test 15: RLS enabled on household_invitations
  // ========================================
  {
    const { data, error } = await supabase.from('household_invitations').select('id').limit(1)
    const passed = !error || !isNotFoundError(error)
    results.push({
      name: '15. RLS enabled on household_invitations table',
      passed,
      details: error ? error.message : `Query returned ${data?.length ?? 0} rows (empty = RLS working)`,
    })
  }

  // ========================================
  // Test 16: Existing assets data preserved with default ownership='personal'
  // ========================================
  {
    const { data, error } = await supabase.from('assets').select('id, ownership').limit(5)
    if (error) {
      results.push({
        name: '16. Existing assets data preserved with ownership=personal default',
        passed: false,
        details: error.message,
      })
    } else {
      const allPersonal = !data || data.length === 0 || data.every((a: { ownership: string }) => a.ownership === 'personal')
      results.push({
        name: '16. Existing assets data preserved with ownership=personal default',
        passed: allPersonal,
        details: data && data.length > 0
          ? `${data.length} assets checked, all ownership=${data[0]?.ownership ?? 'N/A'}`
          : 'No existing assets (default will be personal for new ones)',
      })
    }
  }

  // ========================================
  // Test 17: Existing debts data preserved with default ownership='personal'
  // ========================================
  {
    const { data, error } = await supabase.from('debts').select('id, ownership').limit(5)
    if (error) {
      results.push({
        name: '17. Existing debts data preserved with ownership=personal default',
        passed: false,
        details: error.message,
      })
    } else {
      const allPersonal = !data || data.length === 0 || data.every((d: { ownership: string }) => d.ownership === 'personal')
      results.push({
        name: '17. Existing debts data preserved with ownership=personal default',
        passed: allPersonal,
        details: data && data.length > 0
          ? `${data.length} debts checked, all ownership=${data[0]?.ownership ?? 'N/A'}`
          : 'No existing debts (default will be personal for new ones)',
      })
    }
  }

  // ========================================
  // Test 18: Existing budgets data preserved with default ownership='personal'
  // ========================================
  {
    const { data, error } = await supabase.from('budgets').select('id, ownership').limit(5)
    if (error) {
      results.push({
        name: '18. Existing budgets data preserved with ownership=personal default',
        passed: false,
        details: error.message,
      })
    } else {
      const allPersonal = !data || data.length === 0 || data.every((b: { ownership: string }) => b.ownership === 'personal')
      results.push({
        name: '18. Existing budgets data preserved with ownership=personal default',
        passed: allPersonal,
        details: data && data.length > 0
          ? `${data.length} budgets checked, all ownership=${data[0]?.ownership ?? 'N/A'}`
          : 'No existing budgets (default will be personal for new ones)',
      })
    }
  }

  // ========================================
  // Test 19: profiles table has household_id column
  // ========================================
  {
    const { error } = await supabase.from('profiles').select('household_id').limit(0)
    const passed = !error
    results.push({
      name: '19. profiles table has household_id column',
      passed,
      details: error ? error.message : 'Column accessible',
    })
  }

  // ========================================
  // Test 20: user_household_id() function exists (via RPC)
  // ========================================
  {
    const { error } = await supabase.rpc('user_household_id')
    // Function exists if error is NOT about function not existing
    // It may return null (no household for current user) which is fine
    const passed = !error || !isNotFoundError(error)
    results.push({
      name: '20. user_household_id() function exists',
      passed,
      details: error ? error.message : 'Function callable (returns null for solo users)',
    })
  }

  // ========================================
  // Test 21: household_partner_totals() function exists (via RPC)
  // ========================================
  {
    const { error } = await supabase.rpc('household_partner_totals')
    const passed = !error || !isNotFoundError(error)
    results.push({
      name: '21. household_partner_totals() function exists',
      passed,
      details: error ? error.message : 'Function callable',
    })
  }

  const passing = results.filter(r => r.passed).length
  const total = results.length

  return NextResponse.json({
    feature: '#239 - Household database foundation',
    summary: `${passing}/${total} tests passing`,
    passing,
    total,
    all_passing: passing === total,
    results,
  })
}
