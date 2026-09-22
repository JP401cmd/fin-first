import { NextResponse } from 'next/server'
import { z } from 'zod'
import { forbidden, serverError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { normaliseerRssFeeds, normaliseerWebBronnen, WEB_BRON_SOORTEN } from '@/lib/news-sources'
import { bronUrlBezwaar } from '@/lib/safe-url'

// ── Validatie (ADR 0044 + ADR 0176) ──────────────────────────────────
//
// Een bron is een http(s)-URL met een label; een webbron draagt verplicht zijn
// vaste bronsoort (`web_lijst` of `web_pagina`) — die bepaalt wat de ingest
// als artikel ziet. RSS-feeds zijn per definitie `rss`.

// Dezelfde toets als elke fetch-hop in lib/news-sources.ts (`isVeiligeBronUrl`):
// https, een DNS-naam (geen IP-literal, geen localhost/.local/.internal), geen
// eigen poort, geen inloggegevens. Zo is het schrijfpad geen SSRF-ingang
// (security-review 1F, S1).
const bronUrl = z
  .string()
  .trim()
  .max(500)
  .superRefine((u, ctx) => {
    const bezwaar = bronUrlBezwaar(u)
    if (bezwaar) ctx.addIssue({ code: 'custom', message: bezwaar })
  })

const label = z.string().trim().min(1, 'label is verplicht').max(120)

const NewsSourcesBodySchema = z.object({
  webSources: z
    .array(z.object({ url: bronUrl, label, soort: z.enum(WEB_BRON_SOORTEN) }).strict())
    .max(100),
  rssFeeds: z.array(z.object({ url: bronUrl, label }).strict()).max(100),
})

// ── GET — Return current news sources ────────────────────────────────

export async function GET() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const [webRes, rssRes] = await Promise.all([
    supabase.from('app_settings').select('value').eq('key', 'news_web_sources').maybeSingle(),
    supabase.from('app_settings').select('value').eq('key', 'news_rss_feeds').maybeSingle(),
  ])

  if (webRes.error) {
    return serverError(webRes.error, 'admin-news-sources:GET')
  }
  if (rssRes.error) {
    return serverError(rssRes.error, 'admin-news-sources:GET')
  }

  // Opgeslagen waarden kunnen strings of al-geparste objecten zijn. Een
  // webbron van vóór ADR 0176 zonder soort krijgt dezelfde standaard als de
  // ingest (`web_pagina`), zodat de beheerpagina toont wat er werkelijk draait.
  const parse = (value: unknown): unknown => {
    try {
      return typeof value === 'string' ? JSON.parse(value) : value
    } catch {
      return []
    }
  }

  return NextResponse.json({
    webSources: normaliseerWebBronnen(parse(webRes.data?.value ?? [])),
    rssFeeds: normaliseerRssFeeds(parse(rssRes.data?.value ?? [])),
  })
}

// ── PUT — Save news sources ──────────────────────────────────────────

export async function PUT(req: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const parsed = await parseBody(NewsSourcesBodySchema, req)
  if (!parsed.ok) return parsed.response
  const { webSources, rssFeeds } = parsed.data

  const { data: { user } } = await supabase.auth.getUser()
  const now = new Date().toISOString()
  const updatedBy = user?.id

  const [webErr, rssErr] = await Promise.all([
    supabase.from('app_settings').upsert(
      {
        key: 'news_web_sources',
        value: JSON.stringify(webSources),
        updated_at: now,
        updated_by: updatedBy,
      },
      { onConflict: 'key' },
    ),
    supabase.from('app_settings').upsert(
      {
        key: 'news_rss_feeds',
        value: JSON.stringify(rssFeeds),
        updated_at: now,
        updated_by: updatedBy,
      },
      { onConflict: 'key' },
    ),
  ])

  if (webErr.error) {
    return serverError(webErr.error, 'admin-news-sources:PUT')
  }
  if (rssErr.error) {
    return serverError(rssErr.error, 'admin-news-sources:PUT')
  }

  return NextResponse.json({ success: true })
}

// ── DELETE — Remove all news sources ─────────────────────────────────

export async function DELETE() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const { error } = await supabase
    .from('app_settings')
    .delete()
    .in('key', ['news_web_sources', 'news_rss_feeds'])

  if (error) {
    return serverError(error, 'admin-news-sources:DELETE')
  }

  return NextResponse.json({ success: true })
}
