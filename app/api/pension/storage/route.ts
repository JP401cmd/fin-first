import { createClient, getAuthClaims } from '@/lib/supabase/server'

const BUCKET = 'pension-documents'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

/**
 * Build the storage path for a pension PDF.
 * Format: {user_id}/{life_event_id}/pensioenoverzicht.pdf
 */
function storagePath(userId: string, lifeEventId: string) {
  return `${userId}/${lifeEventId}/pensioenoverzicht.pdf`
}

/**
 * Ensure the pension-documents bucket exists.
 * Creates it if missing (idempotent).
 */
async function ensureBucket(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: buckets } = await supabase.storage.listBuckets()
  const exists = buckets?.some(b => b.id === BUCKET)
  if (!exists) {
    await supabase.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: MAX_FILE_SIZE,
      allowedMimeTypes: ['application/pdf'],
    })
  }
}

// ── POST: Upload PDF to storage ──
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return Response.json({ error: 'Ongeldig verzoek.' }, { status: 400 })
  }

  const file = formData.get('file')
  const lifeEventId = formData.get('lifeEventId')

  if (!file || !(file instanceof File)) {
    return Response.json({ error: 'Geen bestand gevonden.' }, { status: 400 })
  }
  if (!lifeEventId || typeof lifeEventId !== 'string') {
    return Response.json({ error: 'Geen levensgebeurtenis ID opgegeven.' }, { status: 400 })
  }
  if (file.type !== 'application/pdf') {
    return Response.json({ error: 'Alleen PDF-bestanden zijn toegestaan.' }, { status: 400 })
  }
  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ error: 'Bestand is te groot. Maximaal 10 MB.' }, { status: 400 })
  }

  // Verify the life event belongs to this user
  const { data: lifeEvent, error: fetchError } = await supabase
    .from('life_events')
    .select('id, user_id, metadata')
    .eq('id', lifeEventId)
    .single()

  if (fetchError || !lifeEvent) {
    return Response.json({ error: 'Levensgebeurtenis niet gevonden.' }, { status: 404 })
  }
  if (lifeEvent.user_id !== user.id) {
    return Response.json({ error: 'Geen toegang.' }, { status: 403 })
  }

  await ensureBucket(supabase)

  const path = storagePath(user.id, lifeEventId)
  const arrayBuffer = await file.arrayBuffer()

  // Upload (upsert to allow overwriting)
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (uploadError) {
    console.error('[pension/storage] Upload error:', uploadError)
    return Response.json({ error: 'Upload mislukt.' }, { status: 500 })
  }

  // Save the storage path in life_events metadata
  const existingMetadata = (lifeEvent.metadata as Record<string, unknown>) || {}
  const { error: updateError } = await supabase
    .from('life_events')
    .update({
      metadata: { ...existingMetadata, pensionPdfPath: path },
    })
    .eq('id', lifeEventId)

  if (updateError) {
    console.error('[pension/storage] Metadata update error:', updateError)
    // File uploaded but metadata not saved — not critical
  }

  return Response.json({ path, message: 'PDF opgeslagen.' })
}

// ── GET: Download PDF (signed URL) ──
export async function GET(req: Request) {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const lifeEventId = searchParams.get('lifeEventId')

  if (!lifeEventId) {
    return Response.json({ error: 'Geen levensgebeurtenis ID opgegeven.' }, { status: 400 })
  }

  // Verify ownership
  const { data: lifeEvent, error: fetchError } = await supabase
    .from('life_events')
    .select('id, user_id, metadata')
    .eq('id', lifeEventId)
    .single()

  if (fetchError || !lifeEvent) {
    return Response.json({ error: 'Levensgebeurtenis niet gevonden.' }, { status: 404 })
  }
  if (lifeEvent.user_id !== claims.sub) {
    return Response.json({ error: 'Geen toegang.' }, { status: 403 })
  }

  const metadata = lifeEvent.metadata as Record<string, unknown> | null
  const pdfPath = metadata?.pensionPdfPath as string | undefined

  if (!pdfPath) {
    return Response.json({ error: 'Geen PDF gekoppeld aan deze levensgebeurtenis.' }, { status: 404 })
  }

  // Create a signed download URL (valid for 1 hour)
  const { data: signedUrl, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(pdfPath, 3600)

  if (signError || !signedUrl) {
    console.error('[pension/storage] Signed URL error:', signError)
    return Response.json({ error: 'Kan download-link niet genereren.' }, { status: 500 })
  }

  return Response.json({ url: signedUrl.signedUrl })
}

// ── DELETE: Remove PDF from storage ──
export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const lifeEventId = searchParams.get('lifeEventId')

  if (!lifeEventId) {
    return Response.json({ error: 'Geen levensgebeurtenis ID opgegeven.' }, { status: 400 })
  }

  // Verify ownership
  const { data: lifeEvent, error: fetchError } = await supabase
    .from('life_events')
    .select('id, user_id, metadata')
    .eq('id', lifeEventId)
    .single()

  if (fetchError || !lifeEvent) {
    return Response.json({ error: 'Levensgebeurtenis niet gevonden.' }, { status: 404 })
  }
  if (lifeEvent.user_id !== user.id) {
    return Response.json({ error: 'Geen toegang.' }, { status: 403 })
  }

  const metadata = lifeEvent.metadata as Record<string, unknown> | null
  const pdfPath = metadata?.pensionPdfPath as string | undefined

  if (pdfPath) {
    // Remove from storage
    const { error: removeError } = await supabase.storage
      .from(BUCKET)
      .remove([pdfPath])

    if (removeError) {
      console.error('[pension/storage] Remove error:', removeError)
    }

    // Clear the path from metadata
    const { pensionPdfPath: _, ...restMetadata } = (metadata || {}) as Record<string, unknown>
    await supabase
      .from('life_events')
      .update({ metadata: restMetadata })
      .eq('id', lifeEventId)
  }

  return Response.json({ message: 'PDF verwijderd.' })
}
