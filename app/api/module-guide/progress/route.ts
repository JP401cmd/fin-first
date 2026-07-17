import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { unauthorized } from '@/lib/api/respond'

// ── Types ──────────────────────────────────────────────────────
// { [moduleId]: { completedSteps: string[], dismissedAt: string | null } }
interface ModuleGuideProgress {
  completedSteps: string[]
  dismissedAt: string | null
}
type ModuleGuideState = Record<string, ModuleGuideProgress>

// ── Fallback key inside feature_preferences JSONB ─────────────
const FALLBACK_KEY = '_module_guide_state'

// ── Column detection helper ───────────────────────────────────
function isColumnMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42703' || !!error.message?.includes('does not exist')
}

// ── GET — Return the user's module guide progress ─────────────

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  // Try primary column first
  const { data, error } = await supabase
    .from('profiles')
    .select('module_guide_state')
    .eq('id', user.id)
    .single()

  // Also try onboarding_intent separately (may not exist yet)
  const { data: intentData, error: intentError } = await supabase
    .from('profiles')
    .select('onboarding_intent')
    .eq('id', user.id)
    .single()
  // Default to true when column doesn't exist (pre-migration users still see guide cards)
  const hasIntent = isColumnMissing(intentError)
    ? true
    : !!(intentData as Record<string, unknown> | null)?.onboarding_intent

  // Primary goal slug — added voor de goal-guide-card op /will. Aparte fetch
  // omdat de kolom nog kan ontbreken op staging-DBs zonder migration.
  const { data: goalData, error: goalError } = await supabase
    .from('profiles')
    .select('primary_goal_slug')
    .eq('id', user.id)
    .single()
  const primaryGoalSlug = isColumnMissing(goalError)
    ? null
    : ((goalData as Record<string, unknown> | null)?.primary_goal_slug as string | null) ?? null

  // Selected goal slugs (multi-select uit onboarding fase 3, mei 2026).
  // Aparte fetch zodat een ontbrekende kolom de andere queries niet meesleurt.
  // Bij column-missing of leeg array: val terug op de single-goal-list afgeleid
  // van primary_goal_slug zodat pre-migration profielen hun ene kaart behouden.
  const { data: slugsData, error: slugsError } = await supabase
    .from('profiles')
    .select('selected_goal_slugs')
    .eq('id', user.id)
    .single()
  const rawSlugs = isColumnMissing(slugsError)
    ? null
    : ((slugsData as Record<string, unknown> | null)?.selected_goal_slugs as string[] | null) ?? null
  const selectedGoalSlugs: string[] =
    Array.isArray(rawSlugs) && rawSlugs.length > 0
      ? rawSlugs
      : primaryGoalSlug
        ? [primaryGoalSlug]
        : []

  if (!error) {
    return NextResponse.json({
      state: data?.module_guide_state ?? {},
      hasOnboardingIntent: hasIntent,
      primaryGoalSlug,
      selectedGoalSlugs,
    })
  }

  // If column doesn't exist, fall back to feature_preferences
  if (isColumnMissing(error)) {
    const { data: fbData, error: fbError } = await supabase
      .from('profiles')
      .select('feature_preferences')
      .eq('id', user.id)
      .single()

    if (fbError) {
      return NextResponse.json({ state: {}, hasOnboardingIntent: hasIntent, primaryGoalSlug, selectedGoalSlugs })
    }

    const prefs = (fbData?.feature_preferences ?? {}) as Record<string, unknown>
    return NextResponse.json({
      state: (prefs[FALLBACK_KEY] as ModuleGuideState) ?? {},
      hasOnboardingIntent: hasIntent,
      primaryGoalSlug,
      selectedGoalSlugs,
    })
  }

  return NextResponse.json({ error: 'Failed to load progress' }, { status: 500 })
}

// ── PUT — Update module guide progress via action ────────────
// Body: { moduleId: string, action: 'toggleStep' | 'dismiss', stepKey?: string }

interface ProgressAction {
  moduleId: string
  action: 'toggleStep' | 'dismiss'
  stepKey?: string
}

function isValidAction(body: unknown): body is ProgressAction {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false
  const b = body as Record<string, unknown>
  if (typeof b.moduleId !== 'string' || !b.moduleId) return false
  if (b.action !== 'toggleStep' && b.action !== 'dismiss') return false
  if (b.action === 'toggleStep' && (typeof b.stepKey !== 'string' || !b.stepKey)) return false
  return true
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!isValidAction(body)) {
    return NextResponse.json(
      { error: 'Invalid body: expected { moduleId: string, action: "toggleStep" | "dismiss", stepKey?: string }' },
      { status: 400 },
    )
  }

  const { moduleId, action, stepKey } = body as ProgressAction

  // Try reading from primary column
  const { data: profile, error: readError } = await supabase
    .from('profiles')
    .select('module_guide_state')
    .eq('id', user.id)
    .single()

  const useFallback = isColumnMissing(readError)

  // If column doesn't exist, read from fallback
  let currentState: ModuleGuideState = {}
  if (useFallback) {
    const { data: fbData } = await supabase
      .from('profiles')
      .select('feature_preferences')
      .eq('id', user.id)
      .single()
    const prefs = (fbData?.feature_preferences ?? {}) as Record<string, unknown>
    currentState = (prefs[FALLBACK_KEY] as ModuleGuideState) ?? {}
  } else if (readError) {
    return NextResponse.json({ error: 'Failed to load progress' }, { status: 500 })
  } else {
    currentState = (profile?.module_guide_state as ModuleGuideState) ?? {}
  }

  const moduleProgress: ModuleGuideProgress = currentState[moduleId] ?? {
    completedSteps: [],
    dismissedAt: null,
  }

  if (action === 'toggleStep' && stepKey) {
    const idx = moduleProgress.completedSteps.indexOf(stepKey)
    if (idx >= 0) {
      moduleProgress.completedSteps = moduleProgress.completedSteps.filter(s => s !== stepKey)
    } else {
      moduleProgress.completedSteps = [...moduleProgress.completedSteps, stepKey]
    }
  } else if (action === 'dismiss') {
    moduleProgress.dismissedAt = new Date().toISOString()
  }

  const updatedState: ModuleGuideState = {
    ...currentState,
    [moduleId]: moduleProgress,
  }

  // Write to primary column or fallback
  if (useFallback) {
    // Read current feature_preferences, merge in guide state
    const { data: fbData } = await supabase
      .from('profiles')
      .select('feature_preferences')
      .eq('id', user.id)
      .single()
    const prefs = (fbData?.feature_preferences ?? {}) as Record<string, unknown>
    const updatedPrefs = { ...prefs, [FALLBACK_KEY]: updatedState }

    const { error: writeError } = await supabase
      .from('profiles')
      .update({ feature_preferences: updatedPrefs })
      .eq('id', user.id)

    if (writeError) {
      return NextResponse.json({ error: 'Failed to save progress' }, { status: 500 })
    }
  } else {
    const { error: writeError } = await supabase
      .from('profiles')
      .update({ module_guide_state: updatedState })
      .eq('id', user.id)

    if (writeError) {
      return NextResponse.json({ error: 'Failed to save progress' }, { status: 500 })
    }
  }

  return NextResponse.json(updatedState)
}
