import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Try primary column first
  const { data, error } = await supabase
    .from('profiles')
    .select('module_guide_state, onboarding_intent')
    .eq('id', user.id)
    .single()

  if (!error) {
    return NextResponse.json({
      state: data?.module_guide_state ?? {},
      hasOnboardingIntent: !!data?.onboarding_intent,
    })
  }

  // If column doesn't exist, fall back to feature_preferences
  if (isColumnMissing(error)) {
    const { data: fbData, error: fbError } = await supabase
      .from('profiles')
      .select('feature_preferences, onboarding_intent')
      .eq('id', user.id)
      .single()

    if (fbError) {
      return NextResponse.json({ state: {}, hasOnboardingIntent: false })
    }

    const prefs = (fbData?.feature_preferences ?? {}) as Record<string, unknown>
    return NextResponse.json({
      state: (prefs[FALLBACK_KEY] as ModuleGuideState) ?? {},
      hasOnboardingIntent: !!fbData?.onboarding_intent,
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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
