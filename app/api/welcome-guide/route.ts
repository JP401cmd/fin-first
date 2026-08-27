import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { unauthorized } from '@/lib/api/respond'
import {
  WELCOME_GUIDE_SETTINGS_KEY,
  WELCOME_GUIDE_MODULE_KEY,
  parseWelcomeGuideConfig,
  parseWelcomeGuideState,
  getVisibleScreens,
  reconcileCompleted,
  deriveGuideStates,
  type WelcomeGuideConfig,
  type WelcomeGuideState,
} from '@/lib/welcome-guide'
import { loadAccountStatus } from '@/lib/account-status'

// ── Welkomstgids — per-user API ─────────────────────────────────────────────
// GET  → merged config (app_settings) + per-user staat (module_guide_state).
// PUT  → muteer per-user staat via één actie (afvinken/navigeren/sluiten).
//
// De config is leesbaar voor élke ingelogde user; alleen superadmin schrijft hem
// (zie /api/admin/welcome-guide). De per-user staat leeft genest onder de
// bestaande jsonb-kolom profiles.module_guide_state, key 'welcome:guide'.

// ── Kolom-detectie (parity met module-guide/progress) ───────────────────────
const FALLBACK_KEY = '_welcome_guide_state'
function isColumnMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42703' || !!error.message?.includes('does not exist')
}

// ── Config laden (app_settings, default bij afwezigheid) ─────────────────────
async function loadConfig(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<WelcomeGuideConfig> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', WELCOME_GUIDE_SETTINGS_KEY)
    .maybeSingle()
  return parseWelcomeGuideConfig(data?.value)
}

// ── Per-user staat lezen (kolom → feature_preferences-fallback) ──────────────
async function loadRawState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<{ raw: unknown; useFallback: boolean; map: Record<string, unknown> }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('module_guide_state')
    .eq('id', userId)
    .single()

  if (!isColumnMissing(error)) {
    const map = (data?.module_guide_state as Record<string, unknown>) ?? {}
    return { raw: map[WELCOME_GUIDE_MODULE_KEY], useFallback: false, map }
  }

  // Staging-DB zonder migration: val terug op feature_preferences.
  const { data: fb } = await supabase
    .from('profiles')
    .select('feature_preferences')
    .eq('id', userId)
    .single()
  const prefs = (fb?.feature_preferences as Record<string, unknown>) ?? {}
  const map = (prefs[FALLBACK_KEY] as Record<string, unknown>) ?? {}
  return { raw: map[WELCOME_GUIDE_MODULE_KEY] ?? map, useFallback: true, map: prefs }
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  const [config, rawState, accountStatus] = await Promise.all([
    loadConfig(supabase),
    loadRawState(supabase, claims.sub),
    loadAccountStatus(supabase, claims.sub),
  ])
  const state = parseWelcomeGuideState(rawState.raw, config)
  // Orphan-cleanup: drop afgevinkte ids van inmiddels verwijderde stappen.
  state.completedStepIds = reconcileCompleted(config, state.completedStepIds)

  // `derived` = wat de app al wéét (M1). Bewust naast `state`, nooit erin:
  // afgeleide ids in de jsonb schrijven maakt uitvinken onmogelijk en laat een
  // vinkje staan nadat de onderliggende data is verdwenen.
  return NextResponse.json({
    config,
    state,
    derived: deriveGuideStates(config, accountStatus),
  })
}

// ── PUT ───────────────────────────────────────────────────────────────────────

type Action =
  | { action: 'toggleStep'; stepId: string }
  | { action: 'nextScreen' }
  | { action: 'prevScreen' }
  | { action: 'revealScreen' }
  | { action: 'dismiss' }

function isValidAction(body: unknown): body is Action {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false
  const b = body as Record<string, unknown>
  switch (b.action) {
    case 'toggleStep':
      return typeof b.stepId === 'string' && b.stepId.length > 0
    case 'nextScreen':
    case 'prevScreen':
    case 'revealScreen':
    case 'dismiss':
      return true
    default:
      return false
  }
}

function applyAction(
  state: WelcomeGuideState,
  action: Action,
  config: WelcomeGuideConfig,
): WelcomeGuideState {
  const next: WelcomeGuideState = { ...state, completedStepIds: [...state.completedStepIds] }
  const totalEnabled = config.screens.filter((s) => s.enabled).length

  switch (action.action) {
    case 'toggleStep': {
      // Alleen bekende stap-ids accepteren (geen junk in de jsonb).
      const known = config.screens.some((s) => s.steps.some((st) => st.id === action.stepId))
      if (!known) break
      const i = next.completedStepIds.indexOf(action.stepId)
      if (i >= 0) next.completedStepIds.splice(i, 1)
      else next.completedStepIds.push(action.stepId)
      break
    }
    case 'nextScreen': {
      const visible = getVisibleScreens(config, next).length
      next.currentScreen = Math.min(next.currentScreen + 1, Math.max(0, visible - 1))
      break
    }
    case 'prevScreen': {
      next.currentScreen = Math.max(0, next.currentScreen - 1)
      break
    }
    case 'revealScreen': {
      const requiredCount = Math.max(1, config.screens.filter((s) => s.enabled && s.required).length)
      next.revealedScreens = Math.min(
        Math.max(next.revealedScreens + 1, requiredCount),
        Math.max(totalEnabled, requiredCount),
      )
      // Spring naar het zojuist ontgrendelde scherm.
      const visible = getVisibleScreens(config, next).length
      next.currentScreen = Math.max(0, visible - 1)
      break
    }
    case 'dismiss': {
      next.status = 'dismissed'
      break
    }
  }
  return next
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!isValidAction(body)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const config = await loadConfig(supabase)
  const { raw, useFallback, map } = await loadRawState(supabase, user.id)
  const current = parseWelcomeGuideState(raw, config)
  current.completedStepIds = reconcileCompleted(config, current.completedStepIds)
  const updated = applyAction(current, body, config)

  if (useFallback) {
    const prefs = { ...map, [FALLBACK_KEY]: { [WELCOME_GUIDE_MODULE_KEY]: updated } }
    const { error } = await supabase
      .from('profiles')
      .update({ feature_preferences: prefs })
      .eq('id', user.id)
    if (error) return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  } else {
    const nextMap = { ...map, [WELCOME_GUIDE_MODULE_KEY]: updated }
    const { error } = await supabase
      .from('profiles')
      .update({ module_guide_state: nextMap })
      .eq('id', user.id)
    if (error) return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }

  return NextResponse.json({ state: updated })
}
