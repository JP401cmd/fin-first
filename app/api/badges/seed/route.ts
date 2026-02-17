import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { BADGE_DEFINITIONS } from '@/lib/badges'

/**
 * Criteria type mapping for each badge.
 * Maps badge slugs to their criteria_type and criteria_value.
 */
const BADGE_CRITERIA: Record<string, { criteria_type: string; criteria_value: Record<string, unknown> }> = {
  // Onboarding
  eerste_stap: { criteria_type: 'milestone', criteria_value: { event: 'first_login' } },
  data_detective: { criteria_type: 'milestone', criteria_value: { event: 'first_import' } },
  budgetbouwer: { criteria_type: 'count', criteria_value: { table: 'budgets', min: 1 } },

  // Consistency
  weekstreak_x4: { criteria_type: 'streak', criteria_value: { weeks: 4 } },
  maandmeester: { criteria_type: 'streak', criteria_value: { weeks: 4, type: 'monthly' } },
  dagelijkse_discipline: { criteria_type: 'streak', criteria_value: { days: 30 } },

  // Financial Health
  noodfonds_bereikt: { criteria_type: 'threshold', criteria_value: { metric: 'emergency_months', min: 3 } },
  schuldenvrij: { criteria_type: 'threshold', criteria_value: { metric: 'debt_count', max: 0 } },
  positief_vermogen: { criteria_type: 'threshold', criteria_value: { metric: 'net_worth', min: 0.01 } },
  eerste_10k: { criteria_type: 'threshold', criteria_value: { metric: 'net_worth', min: 10000 } },
  '100k_club': { criteria_type: 'threshold', criteria_value: { metric: 'net_worth', min: 100000 } },

  // FIRE Milestones
  fire_10_pct: { criteria_type: 'threshold', criteria_value: { metric: 'fire_progress', min: 10 } },
  fire_halftime: { criteria_type: 'threshold', criteria_value: { metric: 'fire_progress', min: 50 } },
  coast_fire: { criteria_type: 'milestone', criteria_value: { event: 'coast_fire_reached' } },
  fire_bereikt: { criteria_type: 'threshold', criteria_value: { metric: 'fire_progress', min: 100 } },

  // Actions
  eerste_actie: { criteria_type: 'count', criteria_value: { table: 'actions', status: 'completed', min: 1 } },
  actieheld_x10: { criteria_type: 'count', criteria_value: { table: 'actions', status: 'completed', min: 10 } },
  vrijheidsjager: { criteria_type: 'count', criteria_value: { table: 'actions', status: 'completed', min: 25 } },
  beslisser: { criteria_type: 'count', criteria_value: { table: 'actions', status: 'completed', min: 50 } },

  // Budget
  onder_budget: { criteria_type: 'milestone', criteria_value: { event: 'budget_month_on_track' } },
  zuinig_kwartaal: { criteria_type: 'streak', criteria_value: { months: 3, event: 'budget_on_track' } },
  spaarkampioen: { criteria_type: 'threshold', criteria_value: { metric: 'savings_rate', min: 30 } },

  // Exploration
  ontdekker: { criteria_type: 'milestone', criteria_value: { pages: ['core', 'core/budgets', 'core/cash', 'core/assets', 'core/debts', 'core/belasting'] } },
  analist: { criteria_type: 'milestone', criteria_value: { pages: ['core/budgets', 'core/assets', 'core/belasting'] } },
  strateeg: { criteria_type: 'milestone', criteria_value: { pages: ['horizon'] } },
  fiscaal_slim: { criteria_type: 'milestone', criteria_value: { pages: ['core/belasting', 'horizon'] } },

  // Sovereignty (one per level, -2 to 6)
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
 * POST /api/badges/seed — Seed the badges table with all 35 badge definitions.
 * Clears existing badges first, then inserts all definitions fresh.
 * This ensures badge definitions always match the latest code.
 */
export async function POST() {
  const supabase = await createClient()

  // Get the current user (require auth)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    // Check current badges in database
    const { data: existingBadges, error: checkError } = await supabase
      .from('badges')
      .select('slug')

    if (checkError) {
      return NextResponse.json({
        error: 'Kan badges tabel niet bereiken',
        details: checkError.message,
      }, { status: 500 })
    }

    const existingSlugs = new Set((existingBadges ?? []).map((b: { slug: string }) => b.slug))

    // Build insert rows for missing badges
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
        message: 'Alle badges bestaan al in de database',
        existing_count: existingSlugs.size,
        inserted_count: 0,
      })
    }

    // Insert badges
    const { data: insertedData, error: insertError } = await supabase
      .from('badges')
      .insert(toInsert)
      .select('id, slug, name')

    if (insertError) {
      return NextResponse.json({
        error: 'Kan badges niet invoegen',
        details: insertError.message,
      }, { status: 500 })
    }

    return NextResponse.json({
      message: `${insertedData?.length ?? 0} badges ingevoegd`,
      existing_count: existingSlugs.size,
      inserted_count: insertedData?.length ?? 0,
      inserted_badges: insertedData?.map((b: { slug: string; name: string }) => b.slug) ?? [],
      total_count: existingSlugs.size + (insertedData?.length ?? 0),
    })
  } catch (err) {
    console.error('Badge seed error:', err)
    return NextResponse.json({
      error: 'Fout bij seeden van badges',
      details: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 })
  }
}

/**
 * GET /api/badges/seed — Check seed status (how many badges exist).
 */
export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    const { data: badges, error } = await supabase
      .from('badges')
      .select('id, slug, name, category')
      .order('sort_order', { ascending: true })

    if (error) {
      return NextResponse.json({
        error: 'Kan badges tabel niet bereiken',
        details: error.message,
      }, { status: 500 })
    }

    return NextResponse.json({
      count: badges?.length ?? 0,
      expected: BADGE_DEFINITIONS.length,
      seeded: (badges?.length ?? 0) >= BADGE_DEFINITIONS.length,
      badges: badges ?? [],
    })
  } catch (err) {
    return NextResponse.json({
      error: 'Fout bij ophalen badge status',
      details: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 })
  }
}
