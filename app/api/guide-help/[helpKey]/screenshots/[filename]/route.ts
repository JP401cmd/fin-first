import { NextRequest, NextResponse } from 'next/server'
import { forbidden, badRequest, notFound, serverError } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { getServiceClient } from '@/lib/supabase/service'
import {
  GUIDE_HELP_SETTINGS_KEY,
  getGuideHelp,
  type GuideHelpBlob,
  type HelpEntry,
} from '@/lib/briefing/guide-help'
import { isValidHelpKey } from '@/lib/briefing/help-key'

const BUCKET = 'guide-help'

interface RouteParams {
  params: Promise<{ helpKey: string; filename: string }>
}

// ── DELETE — Verwijder één screenshot ───────────────────────────────

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const { helpKey, filename } = await params
  if (!isValidHelpKey(helpKey)) {
    return badRequest('Invalid helpKey')
  }
  if (!filename || filename.includes('/') || filename.includes('..')) {
    return badRequest('Invalid filename')
  }

  const blob: GuideHelpBlob = await getGuideHelp(supabase)
  const entry = blob[helpKey]
  if (!entry) {
    return NextResponse.json({ ok: true, removed: false })
  }

  const path = `${helpKey}/${filename}`
  const service = getServiceClient()
  const { error: removeError } = await service.storage.from(BUCKET).remove([path])
  if (removeError) {
    console.error('[guide-help/screenshots/delete] Remove error:', removeError)
    // Doorgaan met metadata-update — bestand kan al weg zijn.
  }

  const updated: HelpEntry = {
    ...entry,
    screenshots: entry.screenshots.filter((s) => s.filename !== filename),
    updatedAt: new Date().toISOString(),
  }

  const nextBlob: GuideHelpBlob = { ...blob, [helpKey]: updated }
  const { data: { user } } = await supabase.auth.getUser()
  const { error: settingsError } = await supabase
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

  if (settingsError) {
    return serverError(
      settingsError,
      'guide-help-screenshot:DELETE metadata',
      'Bestand verwijderd maar metadata niet bijgewerkt',
    )
  }

  return NextResponse.json(updated)
}

// ── PATCH — Update caption van een screenshot ──────────────────────

interface PatchBody {
  caption?: unknown
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const { helpKey, filename } = await params
  if (!isValidHelpKey(helpKey)) {
    return badRequest('Invalid helpKey')
  }

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return badRequest('Invalid JSON body')
  }

  const caption = typeof body.caption === 'string'
    ? body.caption.slice(0, 200)
    : undefined

  const blob: GuideHelpBlob = await getGuideHelp(supabase)
  const entry = blob[helpKey]
  if (!entry) {
    return notFound('Entry not found')
  }
  const screenshot = entry.screenshots.find((s) => s.filename === filename)
  if (!screenshot) {
    return notFound('Screenshot not found')
  }

  const updated: HelpEntry = {
    ...entry,
    screenshots: entry.screenshots.map((s) =>
      s.filename === filename ? { ...s, caption } : s,
    ),
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
    return serverError(error, 'guide-help-screenshot:PATCH', 'Failed to update caption')
  }

  return NextResponse.json(updated)
}
