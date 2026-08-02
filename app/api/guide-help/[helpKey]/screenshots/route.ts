import { NextRequest, NextResponse } from 'next/server'
import { forbidden, badRequest, serverError } from '@/lib/api/respond'
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
const MAX_FILE_SIZE = 4 * 1024 * 1024 // 4 MB
const MAX_SCREENSHOTS_PER_KEY = 6
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const

type StorageClient = ReturnType<typeof getServiceClient>

async function ensureBucket(client: StorageClient): Promise<void> {
  const { data: buckets } = await client.storage.listBuckets()
  const exists = buckets?.some((b) => b.id === BUCKET)
  if (!exists) {
    await client.storage.createBucket(BUCKET, {
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
    return forbidden()
  }

  const { helpKey } = await params
  if (!isValidHelpKey(helpKey)) {
    return badRequest('Invalid helpKey')
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return badRequest('Invalid form data')
  }

  const file = formData.get('file')
  const caption = formData.get('caption')

  if (!file || !(file instanceof File)) {
    return badRequest('Geen bestand gevonden')
  }
  if (!ALLOWED_MIME.includes(file.type as typeof ALLOWED_MIME[number])) {
    return badRequest('Alleen PNG, JPG of WebP toegestaan')
  }
  if (file.size > MAX_FILE_SIZE) {
    return badRequest(`Bestand te groot (max ${MAX_FILE_SIZE / 1024 / 1024} MB)`)
  }

  const blob: GuideHelpBlob = await getGuideHelp(supabase)
  const existing = blob[helpKey] ?? {
    explanation: '',
    howTo: '',
    screenshots: [],
    updatedAt: new Date().toISOString(),
  }

  if (existing.screenshots.length >= MAX_SCREENSHOTS_PER_KEY) {
    return badRequest(`Maximaal ${MAX_SCREENSHOTS_PER_KEY} screenshots per stap`)
  }

  const service = getServiceClient()
  await ensureBucket(service)

  const seq = String(existing.screenshots.length + 1).padStart(2, '0')
  const slug = slugify(file.name)
  const ext = extFromMime(file.type)
  const filename = `${seq}-${slug}.${ext}`
  const path = `${helpKey}/${filename}`
  const arrayBuffer = await file.arrayBuffer()

  const { error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, {
      contentType: file.type,
      upsert: true,
    })

  if (uploadError) {
    return serverError(uploadError, 'guide-help-screenshots:POST upload', 'Upload mislukt')
  }

  const { data: publicData } = service.storage.from(BUCKET).getPublicUrl(path)
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
    return serverError(
      settingsError,
      'guide-help-screenshots:POST metadata',
      'Bestand geüpload maar metadata niet bijgewerkt',
    )
  }

  return NextResponse.json(updated)
}
