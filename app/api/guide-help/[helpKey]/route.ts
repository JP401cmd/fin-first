import { NextRequest, NextResponse } from 'next/server'
import { forbidden, badRequest, serverError } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import {
  GUIDE_HELP_SETTINGS_KEY,
  getGuideHelp,
  type GuideHelpBlob,
  type HelpEntry,
} from '@/lib/briefing/guide-help'
import { isValidHelpKey } from '@/lib/briefing/help-key'

interface PutBody {
  explanation?: unknown
  howTo?: unknown
}

function sanitizeText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.slice(0, maxLen)
}

// ── PUT — Update explanation + howTo voor één helpKey ──────────────
//
// Houdt screenshots ongemoeid (die worden via de screenshots-route
// gemuteerd). Werkt als upsert binnen de blob: als de helpKey nog
// niet bestaat, wordt een nieuwe entry aangemaakt met lege screenshots.

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ helpKey: string }> },
) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const { helpKey } = await params
  if (!isValidHelpKey(helpKey)) {
    return badRequest('Invalid helpKey')
  }

  let body: PutBody
  try {
    body = (await request.json()) as PutBody
  } catch {
    return badRequest('Invalid JSON body')
  }

  const explanation = sanitizeText(body.explanation, 2000)
  const howTo = sanitizeText(body.howTo, 4000)

  const blob: GuideHelpBlob = await getGuideHelp(supabase)
  const existing = blob[helpKey]
  const updated: HelpEntry = {
    explanation,
    howTo,
    screenshots: existing?.screenshots ?? [],
    updatedAt: new Date().toISOString(),
  }

  const nextBlob: GuideHelpBlob = { ...blob, [helpKey]: updated }

  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('app_settings')
    .upsert(
      {
        key: GUIDE_HELP_SETTINGS_KEY,
        value: JSON.stringify(nextBlob),
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      },
      { onConflict: 'key' },
    )

  if (error) {
    return serverError(error, 'guide-help:PUT', 'Failed to save help content')
  }

  return NextResponse.json(updated)
}

// ── DELETE — Verwijder een hele helpKey-entry (incl. opgeslagen URLs) ──
//
// Verwijdert NIET de bestanden uit de storage-bucket — die kun je via
// de screenshots-route verwijderen, of laten staan voor handmatige
// opruiming. Reden: cascading-delete vereist extra IO, en in praktijk
// is het meestal handig om bestanden te behouden als historische bron.

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ helpKey: string }> },
) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const { helpKey } = await params
  if (!isValidHelpKey(helpKey)) {
    return badRequest('Invalid helpKey')
  }

  const blob: GuideHelpBlob = await getGuideHelp(supabase)
  if (!blob[helpKey]) {
    return NextResponse.json({ ok: true, removed: false })
  }

  const { [helpKey]: _removed, ...rest } = blob
  void _removed

  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('app_settings')
    .upsert(
      {
        key: GUIDE_HELP_SETTINGS_KEY,
        value: JSON.stringify(rest),
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      },
      { onConflict: 'key' },
    )

  if (error) {
    return serverError(error, 'guide-help:DELETE', 'Failed to delete entry')
  }

  return NextResponse.json({ ok: true, removed: true })
}
