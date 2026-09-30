import { NextResponse } from 'next/server'
import { serverError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { vereisBearer } from '@/lib/supabase/bearer'
import { feedbackBodySchema } from '@/lib/krant/contract'

/**
 * POST /api/v1/krant/feedback — "minder/meer hierover" (Krant 3A, ADR 0187).
 *
 * Spiegelt POST /api/news/feedback: dezelfde tabel (`news_feedback`, own-row
 * RLS `user_id = auth.uid()`), dezelfde idempotente upsert — één oordeel per
 * artikel per lezer. Alleen de validatie is strenger (zod strict, lengtes).
 * `user_id` komt uit het via getUser geverifieerde token, nooit uit de body.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = await vereisBearer(request, { muteren: true })
  if (!auth.ok) return auth.response
  const parsed = await parseBody(feedbackBodySchema, request)
  if (!parsed.ok) return parsed.response
  const { articleId, verdict, headline, category } = parsed.data

  const { error } = await auth.client.from('news_feedback').upsert(
    {
      user_id: auth.userId,
      article_id: articleId,
      headline: headline || null,
      category: category || null,
      verdict,
    },
    { onConflict: 'user_id,article_id,verdict', ignoreDuplicates: true },
  )
  if (error) return serverError(error, 'krant-v1:feedback:POST')

  return NextResponse.json({ success: true })
}
