import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
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
// PUT  → muteer per-user staat via één actie (afvinken/navigeren/minimaliseren/
//        heropenen/afsluiten/heractiveren).
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

// De handgerolde body-parsing is bij S13 (nieuwe minimize/restore-acties) op
// zod gezet — CLAUDE.md: "zod komt erbij waar de migratie er toch al langskomt".
// `parseBody` levert bij falen een client-veilige 400 via de gedeelde envelope.
const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('toggleStep'), stepId: z.string().min(1) }),
  z.object({ action: z.literal('nextScreen') }),
  z.object({ action: z.literal('prevScreen') }),
  z.object({ action: z.literal('revealScreen') }),
  // S13 — inklappen tot het punt naast de pagina-'i' (heropenbaar) …
  z.object({ action: z.literal('minimize') }),
  z.object({ action: z.literal('restore') }),
  // … tegenover `dismiss`: klaar met de gids.
  z.object({ action: z.literal('dismiss') }),
  // ADR 0130 — en terug. Sinds de gids in Fin woont is "klaar" geen eenrichtings-
  // uitgang meer: de gidsweergave toont dan een lege staat met één knop die de
  // gids weer aanzet. De voortgang (completedStepIds/currentScreen) blijft staan.
  z.object({ action: z.literal('reactivate') }),
])

type Action = z.infer<typeof ActionSchema>

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
    case 'minimize': {
      next.minimized = true
      break
    }
    case 'restore': {
      next.minimized = false
      break
    }
    case 'dismiss': {
      next.status = 'dismissed'
      break
    }
    case 'reactivate': {
      next.status = 'active'
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

  const parsed = await parseBody(ActionSchema, request)
  if (!parsed.ok) return parsed.response

  const config = await loadConfig(supabase)
  const { raw, useFallback, map } = await loadRawState(supabase, user.id)
  const current = parseWelcomeGuideState(raw, config)
  current.completedStepIds = reconcileCompleted(config, current.completedStepIds)
  const updated = applyAction(current, parsed.data, config)

  if (useFallback) {
    const prefs = { ...map, [FALLBACK_KEY]: { [WELCOME_GUIDE_MODULE_KEY]: updated } }
    const { error } = await supabase
      .from('profiles')
      .update({ feature_preferences: prefs })
      .eq('id', user.id)
    if (error) return serverError(error, 'welcome-guide:PUT')
  } else {
    const nextMap = { ...map, [WELCOME_GUIDE_MODULE_KEY]: updated }
    const { error } = await supabase
      .from('profiles')
      .update({ module_guide_state: nextMap })
      .eq('id', user.id)
    if (error) return serverError(error, 'welcome-guide:PUT')
  }

  return NextResponse.json({ state: updated })
}
