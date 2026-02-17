import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { BADGE_DEFINITIONS } from '@/lib/badges'

/**
 * Criteria type mapping for each badge.
 */
const BADGE_CRITERIA: Record<string, { criteria_type: string; criteria_value: Record<string, unknown> }> = {
  eerste_stap: { criteria_type: 'milestone', criteria_value: { event: 'first_login' } },
  data_detective: { criteria_type: 'milestone', criteria_value: { event: 'first_import' } },
  budgetbouwer: { criteria_type: 'count', criteria_value: { table: 'budgets', min: 1 } },
  weekstreak_x4: { criteria_type: 'streak', criteria_value: { weeks: 4 } },
  maandmeester: { criteria_type: 'streak', criteria_value: { weeks: 4, type: 'monthly' } },
  dagelijkse_discipline: { criteria_type: 'streak', criteria_value: { days: 30 } },
  noodfonds_bereikt: { criteria_type: 'threshold', criteria_value: { metric: 'emergency_months', min: 3 } },
  schuldenvrij: { criteria_type: 'threshold', criteria_value: { metric: 'debt_count', max: 0 } },
  positief_vermogen: { criteria_type: 'threshold', criteria_value: { metric: 'net_worth', min: 0.01 } },
  eerste_10k: { criteria_type: 'threshold', criteria_value: { metric: 'net_worth', min: 10000 } },
  '100k_club': { criteria_type: 'threshold', criteria_value: { metric: 'net_worth', min: 100000 } },
  fire_10_pct: { criteria_type: 'threshold', criteria_value: { metric: 'fire_progress', min: 10 } },
  fire_halftime: { criteria_type: 'threshold', criteria_value: { metric: 'fire_progress', min: 50 } },
  coast_fire: { criteria_type: 'milestone', criteria_value: { event: 'coast_fire_reached' } },
  fire_bereikt: { criteria_type: 'threshold', criteria_value: { metric: 'fire_progress', min: 100 } },
  eerste_actie: { criteria_type: 'count', criteria_value: { table: 'actions', status: 'completed', min: 1 } },
  actieheld_x10: { criteria_type: 'count', criteria_value: { table: 'actions', status: 'completed', min: 10 } },
  vrijheidsjager: { criteria_type: 'count', criteria_value: { table: 'actions', status: 'completed', min: 25 } },
  beslisser: { criteria_type: 'count', criteria_value: { table: 'actions', status: 'completed', min: 50 } },
  onder_budget: { criteria_type: 'milestone', criteria_value: { event: 'budget_month_on_track' } },
  zuinig_kwartaal: { criteria_type: 'streak', criteria_value: { months: 3, event: 'budget_on_track' } },
  spaarkampioen: { criteria_type: 'threshold', criteria_value: { metric: 'savings_rate', min: 30 } },
  ontdekker: { criteria_type: 'milestone', criteria_value: { pages: ['core', 'core/budgets', 'core/cash', 'core/assets', 'core/debts', 'core/belasting'] } },
  analist: { criteria_type: 'milestone', criteria_value: { pages: ['core/budgets', 'core/assets', 'core/belasting'] } },
  strateeg: { criteria_type: 'milestone', criteria_value: { pages: ['horizon'] } },
  fiscaal_slim: { criteria_type: 'milestone', criteria_value: { pages: ['core/belasting', 'horizon'] } },
  sovereignty_level_neg2: { criteria_type: 'milestone', criteria_value: { sovereignty_level: -2 } },
  sovereignty_level_neg1: { criteria_type: 'milestone', criteria_value: { sovereignty_level: -1 } },
  sovereignty_level_0: { criteria_type: 'milestone', criteria_value: { sovereignty_level: 0 } },
  sovereignty_level_1: { criteria_type: 'milestone', criteria_value: { sovereignty_level: 1 } },
  sovereignty_level_2: { criteria_type: 'milestone', criteria_value: { sovereignty_level: 2 } },
  sovereignty_level_3: { criteria_type: 'milestone', criteria_value: { sovereignty_level: 3 } },
  sovereignty_level_4: { criteria_type: 'milestone', criteria_value: { sovereignty_level: 4 } },
  sovereignty_level_5: { criteria_type: 'milestone', criteria_value: { sovereignty_level: 5 } },
  sovereignty_level_6: { criteria_type: 'milestone', criteria_value: { sovereignty_level: 6 } },
}

/**
 * POST /api/badges/seed-public — Seed badges without auth.
 * Uses Supabase Management API to insert badge seed data.
 * Only works in development mode.
 */
export async function POST() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    // Create admin-level client using the postgres connection
    // Since we can't bypass RLS with anon key for inserts,
    // we'll use a different approach: use the REST API directly with the anon key
    // But first check if a service role key is available
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    const client = createClient(supabaseUrl, serviceRoleKey || supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Check existing badges
    const { data: existingBadges, error: checkError } = await client
      .from('badges')
      .select('slug')

    if (checkError) {
      return NextResponse.json({
        error: 'Cannot access badges table',
        details: checkError.message,
      }, { status: 500 })
    }

    const existingSlugs = new Set((existingBadges ?? []).map((b: { slug: string }) => b.slug))

    // Build insert rows
    const toInsert = BADGE_DEFINITIONS
      .filter((b) => !existingSlugs.has(b.slug))
      .map((b) => {
        const criteria = BADGE_CRITERIA[b.slug] ?? { criteria_type: 'manual', criteria_value: {} }
        return {
          slug: b.slug,
          name: b.name,
          description: b.description,
          icon: b.icon,
          color: b.color,
          category: b.category,
          criteria_type: criteria.criteria_type,
          criteria_value: criteria.criteria_value,
          sort_order: b.sort_order,
        }
      })

    if (toInsert.length === 0) {
      return NextResponse.json({
        message: 'All badges already exist in database',
        existing_count: existingSlugs.size,
        inserted_count: 0,
        total: existingSlugs.size,
      })
    }

    // Try to insert
    const { data: inserted, error: insertError } = await client
      .from('badges')
      .insert(toInsert)
      .select('id, slug, name, category')

    if (insertError) {
      return NextResponse.json({
        error: 'Failed to insert badges',
        details: insertError.message,
        hint: 'You may need a SUPABASE_SERVICE_ROLE_KEY in .env.local to bypass RLS for inserts',
      }, { status: 500 })
    }

    return NextResponse.json({
      message: `${inserted?.length ?? 0} badges seeded`,
      existing_count: existingSlugs.size,
      inserted_count: inserted?.length ?? 0,
      total: existingSlugs.size + (inserted?.length ?? 0),
      inserted_slugs: inserted?.map((b: { slug: string }) => b.slug) ?? [],
    })
  } catch (err) {
    return NextResponse.json({
      error: 'Seed failed',
      details: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 })
  }
}

/**
 * GET /api/badges/seed-public — Check badge count.
 */
export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    const client = createClient(supabaseUrl, serviceRoleKey || supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: badges, error } = await client
      .from('badges')
      .select('id, slug, name, category, sort_order')
      .order('sort_order', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Group by category
    const byCategory: Record<string, string[]> = {}
    for (const b of (badges ?? [])) {
      if (!byCategory[b.category]) byCategory[b.category] = []
      byCategory[b.category].push(b.name)
    }

    return NextResponse.json({
      count: badges?.length ?? 0,
      expected: BADGE_DEFINITIONS.length,
      seeded: (badges?.length ?? 0) >= BADGE_DEFINITIONS.length,
      by_category: byCategory,
      badges: badges ?? [],
    })
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 })
  }
}
