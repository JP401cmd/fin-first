import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import {
  GUIDE_HELP_SETTINGS_KEY,
  getGuideHelp,
  type GuideHelpBlob,
  type HelpEntry,
} from '@/lib/briefing/guide-help'
import { isValidHelpKey } from '@/lib/briefing/help-key'

const BUCKET = 'guide-help'
const MAX_FILE_SIZE = 4 * 1024 * 1024 // 4 MB
const MAX_SCREENSHOTS_PER_KEY = 6
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

async function ensureBucket(supabase: SupabaseClient): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets()
  const exists = buckets?.some((b) => b.id === BUCKET)
  if (!exists) {
    await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_FILE_SIZE,
      allowedMimeTypes: [...ALLOWED_MIME],
    })
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'screenshot'
}

function extFromMime(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

// ── POST — Upload één screenshot voor een helpKey ──────────────────
//
// Multipart-form: file + optionele caption. Bestand wordt opgeslagen
// onder `{helpKey}/{seq}-{slug}.{ext}` waarbij seq = (huidige + 1).
// De public-URL wordt gecached in de app_settings blob.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ helpKey: string }> },
) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { helpKey } = await params
  if (!isValidHelpKey(helpKey)) {
    return NextResponse.json({ error: 'Invalid helpKey' }, { status: 400 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file')
  const caption = formData.get('caption')

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Geen bestand gevonden' }, { status: 400 })
  }
  if (!ALLOWED_MIME.includes(file.type as typeof ALLOWED_MIME[number])) {
    return NextResponse.json(
      { error: 'Alleen PNG, JPG of WebP toegestaan' },
      { status: 400 },
    )
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `Bestand te groot (max ${MAX_FILE_SIZE / 1024 / 1024} MB)` },
      { status: 400 },
    )
  }

  const blob: GuideHelpBlob = await getGuideHelp(supabase)
  const existing = blob[helpKey] ?? {
    explanation: '',
    howTo: '',
    screenshots: [],
    updatedAt: new Date().toISOString(),
  }

  if (existing.screenshots.length >= MAX_SCREENSHOTS_PER_KEY) {
    return NextResponse.json(
      { error: `Maximaal ${MAX_SCREENSHOTS_PER_KEY} screenshots per stap` },
      { status: 400 },
    )
  }

  await ensureBucket(supabase)

  const seq = String(existing.screenshots.length + 1).padStart(2, '0')
  const slug = slugify(file.name)
  const ext = extFromMime(file.type)
  const filename = `${seq}-${slug}.${ext}`
  const path = `${helpKey}/${filename}`
  const arrayBuffer = await file.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, {
      contentType: file.type,
      upsert: true,
    })

  if (uploadError) {
    console.error('[guide-help/screenshots] Upload error:', uploadError)
    return NextResponse.json({ error: 'Upload mislukt' }, { status: 500 })
  }

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path)
  const publicUrl = publicData.publicUrl

  const captionStr = typeof caption === 'string' ? caption.slice(0, 200) : undefined
  const updated: HelpEntry = {
    ...existing,
    screenshots: [
      ...existing.screenshots,
      { filename, url: publicUrl, caption: captionStr },
    ],
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
    // Bestand staat in storage maar metadata is niet bijgewerkt.
    // Logging voldoende — gebruiker kan opnieuw proberen.
    console.error('[guide-help/screenshots] Settings update error:', settingsError)
    return NextResponse.json(
      { error: 'Bestand geüpload maar metadata niet bijgewerkt' },
      { status: 500 },
    )
  }

  return NextResponse.json(updated)
}
