import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Privacy categories and valid visibility levels.
 *
 * Database schema uses English keys: assets, debts, budgets, transactions, income
 * with levels: full, totals, hidden.
 *
 * UI uses Dutch keys: vermogen, schulden, budgetten, transacties, inkomen
 * with levels: volledig, totalen, verborgen.
 *
 * The API accepts BOTH formats and normalises internally.
 */

// ── DB (English) keys ────────────────────────────────────────────────────
const DB_CATEGORIES = ['assets', 'debts', 'budgets', 'transactions', 'income'] as const
type DbCategory = typeof DB_CATEGORIES[number]
type DbLevel = 'full' | 'totals' | 'hidden'
const VALID_DB_LEVELS: DbLevel[] = ['full', 'totals', 'hidden']

const DEFAULT_DB_PRIVACY: Record<DbCategory, DbLevel> = {
  assets: 'totals',
  debts: 'totals',
  budgets: 'totals',
  transactions: 'totals',
  income: 'totals',
}

// ── UI (Dutch) keys ──────────────────────────────────────────────────────
const UI_CATEGORIES = ['vermogen', 'schulden', 'budgetten', 'transacties', 'inkomen'] as const
type UiCategory = typeof UI_CATEGORIES[number]
type UiLevel = 'volledig' | 'totalen' | 'verborgen'
const VALID_UI_LEVELS: UiLevel[] = ['volledig', 'totalen', 'verborgen']

const DEFAULT_UI_PRIVACY: Record<UiCategory, UiLevel> = {
  vermogen: 'totalen',
  schulden: 'totalen',
  budgetten: 'totalen',
  transacties: 'totalen',
  inkomen: 'totalen',
}

// ── Mappings ─────────────────────────────────────────────────────────────
const UI_TO_DB_CATEGORY: Record<UiCategory, DbCategory> = {
  vermogen: 'assets', schulden: 'debts', budgetten: 'budgets',
  transacties: 'transactions', inkomen: 'income',
}
const DB_TO_UI_CATEGORY: Record<DbCategory, UiCategory> = {
  assets: 'vermogen', debts: 'schulden', budgets: 'budgetten',
  transactions: 'transacties', income: 'inkomen',
}
const UI_TO_DB_LEVEL: Record<UiLevel, DbLevel> = {
  volledig: 'full', totalen: 'totals', verborgen: 'hidden',
}
const DB_TO_UI_LEVEL: Record<DbLevel, UiLevel> = {
  full: 'volledig', totals: 'totalen', hidden: 'verborgen',
}

/** Convert UI privacy settings to DB format */
function toDb(ui: Record<string, string>): Record<DbCategory, DbLevel> {
  const out = { ...DEFAULT_DB_PRIVACY }
  for (const [k, v] of Object.entries(ui)) {
    const dbCat = UI_TO_DB_CATEGORY[k as UiCategory]
    const dbLvl = UI_TO_DB_LEVEL[v as UiLevel]
    if (dbCat && dbLvl) out[dbCat] = dbLvl
    // Also accept English keys directly
    if (DB_CATEGORIES.includes(k as DbCategory) && VALID_DB_LEVELS.includes(v as DbLevel)) {
      out[k as DbCategory] = v as DbLevel
    }
  }
  return out
}

/** Convert DB privacy settings to UI format */
function toUi(db: Record<string, string>): Record<UiCategory, UiLevel> {
  const out = { ...DEFAULT_UI_PRIVACY }
  for (const [k, v] of Object.entries(db)) {
    const uiCat = DB_TO_UI_CATEGORY[k as DbCategory]
    const uiLvl = DB_TO_UI_LEVEL[v as DbLevel]
    if (uiCat && uiLvl) out[uiCat] = uiLvl
    // Also accept Dutch keys directly
    if (UI_CATEGORIES.includes(k as UiCategory) && VALID_UI_LEVELS.includes(v as UiLevel)) {
      out[k as UiCategory] = v as UiLevel
    }
  }
  return out
}

/** Detect if input uses Dutch keys */
function isDutchFormat(settings: Record<string, string>): boolean {
  return UI_CATEGORIES.some(c => c in settings)
}

/**
 * GET /api/household/privacy
 * Returns the current user's privacy settings in both UI (Dutch) and DB (English) formats.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Find user's household membership
  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id, role, privacy_settings')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'Geen huishouden gevonden' }, { status: 404 })
  }

  let raw = membership.privacy_settings as Record<string, string> | null

  // Fallback: try app_settings if column not available
  if (!raw) {
    const { data: appSetting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', `household_privacy:${user.id}`)
      .single()

    raw = appSetting?.value ?? null
  }

  // Normalise to both formats
  const dbSettings = raw ? (isDutchFormat(raw) ? toDb(raw) : { ...DEFAULT_DB_PRIVACY, ...raw }) : DEFAULT_DB_PRIVACY
  const uiSettings = raw ? (isDutchFormat(raw) ? { ...DEFAULT_UI_PRIVACY, ...raw as Record<UiCategory, UiLevel> } : toUi(raw)) : DEFAULT_UI_PRIVACY

  // Toekomst-privacy (binair): transparant | verborgen. Standaard transparant.
  const futureVal = raw?.future === 'hidden' ? 'hidden' : 'transparent'

  return NextResponse.json({
    householdId: membership.household_id,
    // UI-facing (Dutch) — used by the frontend
    privacySettings: { ...uiSettings, future: futureVal },
    // DB-facing (English) — canonical format
    dbPrivacySettings: { ...dbSettings, future: futureVal },
    defaults: DEFAULT_UI_PRIVACY,
    dbDefaults: DEFAULT_DB_PRIVACY,
  })
}

/**
 * PATCH /api/household/privacy
 * Update the current user's privacy settings.
 * Accepts both Dutch and English keys.
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const body = await request.json()
  const { privacySettings } = body

  if (!privacySettings || typeof privacySettings !== 'object') {
    return NextResponse.json({ error: 'Ongeldige privacy-instellingen' }, { status: 400 })
  }

  // Accept Dutch or English keys — normalise to DB format for storage
  const dutch = isDutchFormat(privacySettings)
  const dbSettings = dutch ? toDb(privacySettings) : { ...DEFAULT_DB_PRIVACY }
  const uiSettings = dutch ? { ...DEFAULT_UI_PRIVACY, ...privacySettings } : toUi(privacySettings)

  if (!dutch) {
    // Validate English keys
    for (const cat of DB_CATEGORIES) {
      if (!(cat in privacySettings)) {
        return NextResponse.json({ error: `Ontbrekende categorie: ${cat}` }, { status: 400 })
      }
      if (!VALID_DB_LEVELS.includes(privacySettings[cat])) {
        return NextResponse.json(
          { error: `Ongeldig niveau voor ${cat}: ${privacySettings[cat]}. Kies uit: ${VALID_DB_LEVELS.join(', ')}` },
          { status: 400 },
        )
      }
      dbSettings[cat] = privacySettings[cat]
    }
  } else {
    // Validate Dutch keys
    for (const cat of UI_CATEGORIES) {
      if (!(cat in privacySettings)) {
        return NextResponse.json({ error: `Ontbrekende categorie: ${cat}` }, { status: 400 })
      }
      if (!VALID_UI_LEVELS.includes(privacySettings[cat])) {
        return NextResponse.json(
          { error: `Ongeldig niveau voor ${cat}: ${privacySettings[cat]}. Kies uit: ${VALID_UI_LEVELS.join(', ')}` },
          { status: 400 },
        )
      }
    }
  }

  // Find user's household membership
  const { data: membership } = await supabase
    .from('household_members')
    .select('id, household_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'Geen huishouden gevonden' }, { status: 404 })
  }

  // Toekomst-privacy (binair) meenemen — accepteert NL/EN.
  const rawFuture = (privacySettings as Record<string, string>).future ?? (privacySettings as Record<string, string>).toekomst
  const futureVal = (rawFuture === 'hidden' || rawFuture === 'verborgen') ? 'hidden' : 'transparent'
  const storedSettings = { ...dbSettings, future: futureVal }

  // Store in DB format (English keys) in household_members.privacy_settings
  const { error: memberError } = await supabase
    .from('household_members')
    .update({ privacy_settings: storedSettings })
    .eq('id', membership.id)

  if (memberError) {
    // Fallback: store in app_settings if column doesn't exist yet
    const { error: settingsError } = await supabase
      .from('app_settings')
      .upsert({
        key: `household_privacy:${user.id}`,
        value: storedSettings,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })

    if (settingsError) {
      return NextResponse.json({ error: settingsError.message }, { status: 500 })
    }
  }

  return NextResponse.json({
    success: true,
    message: 'Privacy-instellingen opgeslagen',
    privacySettings: { ...uiSettings, future: futureVal },
    dbPrivacySettings: storedSettings,
  })
}

/**
 * POST /api/household/privacy
 * Alias of PATCH — the privacy UI (components/mijn/household-privacy-settings.tsx)
 * saves via POST. Without this handler Next.js returns 405 → "Opslaan mislukt".
 */
export async function POST(request: NextRequest) {
  return PATCH(request)
}
