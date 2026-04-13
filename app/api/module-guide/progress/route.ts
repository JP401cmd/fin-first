import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// ── Types ──────────────────────────────────────────────────────
// { [moduleId]: { completedSteps: string[], dismissedAt: string | null } }
interface ModuleGuideProgress {
  completedSteps: string[]
  dismissedAt: string | null
}
type ModuleGuideState = Record<string, ModuleGuideProgress>

// ── GET — Return the user's module guide progress ─────────────

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('profiles')
    .select('module_guide_state')
    .eq('id', user.id)
    .single()

  // If column doesn't exist yet (migration not applied), return empty state
  if (error && (error.code === '42703' || error.message?.includes('does not exist'))) {
    return NextResponse.json({})
  }

  if (error) {
    return NextResponse.json({ error: 'Failed to load progress' }, { status: 500 })
  }

  return NextResponse.json(data?.module_guide_state ?? {})
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

  // Read current state
  const { data: profile, error: readError } = await supabase
    .from('profiles')
    .select('module_guide_state')
    .eq('id', user.id)
    .single()

  // If column doesn't exist yet (migration not applied), return error with helpful message
  if (readError && (readError.code === '42703' || readError.message?.includes('does not exist'))) {
    return NextResponse.json(
      { error: 'module_guide_state column not yet available. Migration pending.' },
      { status: 503 },
    )
  }

  if (readError) {
    return NextResponse.json({ error: 'Failed to load progress' }, { status: 500 })
  }

  const currentState: ModuleGuideState = (profile?.module_guide_state as ModuleGuideState) ?? {}
  const moduleProgress: ModuleGuideProgress = currentState[moduleId] ?? {
    completedSteps: [],
    dismissedAt: null,
  }

  if (action === 'toggleStep' && stepKey) {
    const idx = moduleProgress.completedSteps.indexOf(stepKey)
    if (idx >= 0) {
      // Remove step (un-complete)
      moduleProgress.completedSteps = moduleProgress.completedSteps.filter(s => s !== stepKey)
    } else {
      // Add step (complete)
      moduleProgress.completedSteps = [...moduleProgress.completedSteps, stepKey]
    }
  } else if (action === 'dismiss') {
    moduleProgress.dismissedAt = new Date().toISOString()
  }

  const updatedState: ModuleGuideState = {
    ...currentState,
    [moduleId]: moduleProgress,
  }

  const { error: writeError } = await supabase
    .from('profiles')
    .update({ module_guide_state: updatedState })
    .eq('id', user.id)

  if (writeError) {
    return NextResponse.json({ error: 'Failed to save progress' }, { status: 500 })
  }

  return NextResponse.json(updatedState)
}
