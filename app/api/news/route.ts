import { streamObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { recordAiUsage } from '@/lib/ai-credits'
import { getModel, AIConfigError } from '@/lib/ai/config'
import { buildSharedContext } from '@/lib/ai/context/shared-context'
import { sanitizeForAI, type SanitizeOptions } from '@/lib/ai/sanitize'
import { maskPIIInObject } from '@/lib/ai/pii-output-filter'
import { NextResponse } from 'next/server'
import { checkTierGate } from '@/lib/require-tier'
import { NEWS_SYSTEM_PROMPT } from '@/lib/news-system-prompt'
import {
  selectSourceArticles,
  filterGroundedItems,
  type SelectableArticle,
} from '@/lib/news-selection'

// ── Cache TTL ────────────────────────────────────────────────────────

const CACHE_TTL_HOURS = 7 * 24 // 7 days

// ── Valid news categories ────────────────────────────────────────────

const NEWS_CATEGORIES = [
  'fiscaal',
  'rente',
  'woningmarkt',
  'beleggingen',
  'pensioen',
  'macro',
] as const

// ── Schema ───────────────────────────────────────────────────────────

const newsItemSchema = z.object({
  id: z.string().describe('Uniek ID voor het nieuwsitem (bijv. news-2026-03-07-1)'),
  headline: z.string().describe('Korte, pakkende kop in het Nederlands'),
  summary: z.string().describe('Samenvatting van het nieuws in 2-3 zinnen'),
  impactType: z.enum(['direct', 'relevant']).describe('"direct" = concrete, berekenbare impact op de financiele situatie van de gebruiker. "relevant" = financieel relevant nieuws zonder concrete berekenbare impact, maar wel waardevol om te weten.'),
  personalImpact: z.string().describe('Bij impactType "direct": concrete impact met specifieke euro-bedragen of vrijheidstijd gebaseerd op het profiel. Bij impactType "relevant": korte uitleg waarom dit nieuwsitem relevant is voor de financiele situatie van de gebruiker, zonder concrete bedragen.'),
  // NB: geen .int()/.min()/.max() — Anthropic structured output ondersteunt
  // geen minimum/maximum in het JSON-schema, en Zod v4 voegt die bij .int()
  // zelf toe (safe-integer-grenzen) → 400 invalid_request_error. Range en
  // afronding worden afgedwongen via de prompt + server-side clamp.
  impactScore: z.number().describe('Impactscore: geheel getal van 1 t/m 5 — hoe groot is de impact/relevantie voor deze gebruiker? 5 = grote concrete impact, 1 = achtergrond.'),
  impactDirection: z.enum(['positief', 'negatief', 'neutraal']).describe('Richting van de impact voor de gebruiker: "positief" (bespaart geld of versnelt vrijheid), "negatief" (kost geld of vertraagt vrijheid) of "neutraal".'),
  deadline: z.string().optional().describe('Alleen invullen als er een concrete datum (YYYY-MM-DD) is waarvoor de gebruiker iets kan of moet doen.'),
  category: z.enum(NEWS_CATEGORIES).describe('Nieuwscategorie'),
  date: z.string().describe('Datum van het nieuws in YYYY-MM-DD formaat'),
  sourceContext: z.string().optional().describe('Broncontext of toelichting (bijv. "Belastingplan 2026", "ECB persconferentie")'),
  sourceUrl: z.string().optional().describe('Directe URL naar het bronartikel waarop dit nieuwsitem gebaseerd is — LETTERLIJK overgenomen uit de aangeleverde bronnen'),
  sourceName: z.string().optional().describe('Naam van de bron (bijv. "Belastingdienst", "Rijksoverheid", "ECB")'),
})

export type NewsItem = z.infer<typeof newsItemSchema>

// System prompt is imported from lib/news-system-prompt.ts (single source of truth)

// ── Cache helpers ────────────────────────────────────────────────────

function cacheKey(userId: string) {
  return `news_cache:${userId}`
}

interface CachedNews {
  items: NewsItem[]
  generatedAt: string
  sourceCount?: number
  sourceNewestAt?: string
}

async function getCachedNews(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<CachedNews | null> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', cacheKey(userId))
    .maybeSingle()

  if (!data?.value) return null

  try {
    const cached: CachedNews = typeof data.value === 'string'
      ? JSON.parse(data.value)
      : data.value

    const generatedAt = new Date(cached.generatedAt)
    const now = new Date()
    const ageHours = (now.getTime() - generatedAt.getTime()) / (1000 * 60 * 60)

    // Een lege editie ("geen nieuws met impact") cachen we kort: morgen kan er
    // wél relevant nieuws zijn, en een fout-veroorzaakte lege editie mag de
    // gebruiker geen week achtervolgen.
    const ttlHours = cached.items.length === 0 ? 6 : CACHE_TTL_HOURS
    if (ageHours > ttlHours) return null

    return cached
  } catch {
    return null
  }
}

async function setCachedNews(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  items: NewsItem[],
  meta: { sourceCount: number; sourceNewestAt?: string },
): Promise<void> {
  const value: CachedNews = {
    items,
    generatedAt: new Date().toISOString(),
    sourceCount: meta.sourceCount,
    sourceNewestAt: meta.sourceNewestAt,
  }

  await supabase
    .from('app_settings')
    .upsert(
      {
        key: cacheKey(userId),
        value: JSON.stringify(value),
        updated_at: new Date().toISOString(),
        updated_by: userId,
      },
      { onConflict: 'key' },
    )
}

// ── Edition helpers ──────────────────────────────────────────────────

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

async function getNextEditionNr(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data } = await supabase
    .from('news_editions')
    .select('edition_nr')
    .eq('user_id', userId)
    .order('edition_nr', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data?.edition_nr ?? 0) + 1
}

async function archiveCurrentEdition(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  // Read current cached news
  const { data: cacheRow } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', cacheKey(userId))
    .maybeSingle()

  if (!cacheRow?.value) return

  let cached: CachedNews
  try {
    cached = typeof cacheRow.value === 'string'
      ? JSON.parse(cacheRow.value)
      : cacheRow.value
  } catch {
    return
  }

  if (!cached.items || cached.items.length === 0) return

  const nextNr = await getNextEditionNr(supabase, userId)
  const jaargang = new Date().getFullYear() - 2025

  await supabase.from('news_editions').insert({
    user_id: userId,
    edition_nr: nextNr,
    jaargang,
    articles: cached.items,
    article_count: cached.items.length,
    hero_headline: cached.items[0].headline,
  })

  // Enforce 50-edition cap — delete oldest if over limit
  const { data: editions } = await supabase
    .from('news_editions')
    .select('id, edition_nr')
    .eq('user_id', userId)
    .order('edition_nr', { ascending: false })

  if (editions && editions.length > 50) {
    const toDelete = editions.slice(50).map((e) => e.id)
    await supabase.from('news_editions').delete().in('id', toDelete)
  }
}

// ── Deduplication helper ─────────────────────────────────────────────

async function getRecentHeadlines(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const twoMonthsAgo = new Date()
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)

  const { data } = await supabase
    .from('news_editions')
    .select('articles')
    .eq('user_id', userId)
    .gte('created_at', twoMonthsAgo.toISOString())
    .order('created_at', { ascending: false })

  if (!data || data.length === 0) return []
  return data.flatMap((row) => {
    const articles = row.articles as NewsItem[]
    return articles.map((a) => a.headline)
  })
}

// ── Feedback helper — categorieën die de gebruiker minder wil zien ──

async function getDemotedCategories(supabase: SupabaseClient, userId: string): Promise<string[]> {
  try {
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    const { data } = await supabase
      .from('news_feedback')
      .select('category')
      .eq('user_id', userId)
      .eq('verdict', 'less')
      .gte('created_at', ninetyDaysAgo.toISOString())

    if (!data) return []
    const counts = new Map<string, number>()
    for (const row of data) {
      if (!row.category) continue
      counts.set(row.category, (counts.get(row.category) ?? 0) + 1)
    }
    return [...counts.entries()].filter(([, n]) => n >= 2).map(([cat]) => cat)
  } catch {
    return []
  }
}

// ── Refresh rate limiter ─────────────────────────────────────────────

async function checkRefreshLimit(
  supabase: SupabaseClient, userId: string
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'news_max_refreshes_per_week')
    .maybeSingle()
  const limit = setting?.value ? parseInt(setting.value, 10) : 3

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  const { count } = await supabase
    .from('news_editions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', weekAgo.toISOString())

  const used = count ?? 0
  return { allowed: used < limit, remaining: Math.max(0, limit - used), limit }
}

// ── Background generation state (persisted in app_settings) ─────────
//
// Eerder leefde deze state in in-memory Maps. Op serverless kan een poll op
// een andere instance landen, waardoor de state onvindbaar was en er een
// tweede (dure) generatie startte. De state staat daarom in app_settings
// onder een uid-gebonden sleutel (valt onder de "own keys" RLS-policy).

const GENERATION_TIMEOUT_MS = 120_000 // 2 min — daarna geldt een run als gestrand

function generationKey(userId: string) {
  return `news_generation:${userId}`
}

interface GenerationState {
  items: NewsItem[]
  complete: boolean
  error?: string
  startedAt: string
  sourceCount?: number
  sourceNewestAt?: string
}

async function readGenerationState(
  supabase: SupabaseClient,
  userId: string,
): Promise<GenerationState | null> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', generationKey(userId))
    .maybeSingle()

  if (!data?.value) return null
  try {
    return typeof data.value === 'string' ? JSON.parse(data.value) : data.value
  } catch {
    return null
  }
}

async function writeGenerationState(
  supabase: SupabaseClient,
  userId: string,
  state: GenerationState,
): Promise<void> {
  await supabase
    .from('app_settings')
    .upsert(
      {
        key: generationKey(userId),
        value: JSON.stringify(state),
        updated_at: new Date().toISOString(),
        updated_by: userId,
      },
      { onConflict: 'key' },
    )
}

async function clearGenerationState(supabase: SupabaseClient, userId: string): Promise<void> {
  await supabase.from('app_settings').delete().eq('key', generationKey(userId))
}

// ── Source articles ──────────────────────────────────────────────────

const SOURCE_CANDIDATE_LIMIT = 120
const SOURCE_PROMPT_LIMIT = 40

/**
 * Laad bronartikelen via de service-role-client: news_articles is een
 * systeemtabel (RLS: superadmin + service_role) en moet voor ÁLLE gebruikers
 * de generatie voeden. Er gaat geen gebruikersinput in deze query en het
 * resultaat blijft server-side — alleen de AI-prompt ziet de artikelen.
 */
async function loadSourceArticles(): Promise<SelectableArticle[]> {
  let client: ReturnType<typeof getServiceClient>
  try {
    client = getServiceClient()
  } catch (err) {
    console.error('[/api/news] Service client unavailable — no source articles:', err)
    return []
  }

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data, error } = await client
    .from('news_articles')
    .select('id, title, summary, source_url, source_name, category, published_at, potential_impact, is_used')
    .gte('fetched_at', thirtyDaysAgo.toISOString())
    .order('published_at', { ascending: false })
    .limit(SOURCE_CANDIDATE_LIMIT)

  if (error) {
    console.error('[/api/news] Failed to load source articles:', error.message)
    return []
  }

  return selectSourceArticles(data || [], { limit: SOURCE_PROMPT_LIMIT })
}

/** Markeer alleen de artikelen die daadwerkelijk in de editie zijn gebruikt. */
async function markUsedArticles(articles: SelectableArticle[], items: NewsItem[]): Promise<void> {
  const usedUrls = new Set(items.map((i) => i.sourceUrl).filter(Boolean))
  const usedIds = articles.filter((a) => usedUrls.has(a.source_url)).map((a) => a.id)
  if (usedIds.length === 0) return

  try {
    const client = getServiceClient()
    await client.from('news_articles').update({ is_used: true }).in('id', usedIds)
  } catch (err) {
    console.error('[/api/news] Failed to mark used articles:', err)
  }
}

// ── GET handler ──────────────────────────────────────────────────────

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const tierGate = await checkTierGate(supabase, user.id, 'ai')
  if (tierGate) {
    return NextResponse.json({ error: tierGate.error }, { status: 403 })
  }

  const url = new URL(request.url)
  const forceRefresh = url.searchParams.get('refresh') === '1'
  // Peek-modus: cache-only "is er een editie?"-signaal. Uitsluitend leeswerk —
  // dit pad mag NOOIT een AI-generatie starten (de gewone GET doet dat fire-
  // and-forget bij een koude cache). De sidebar-freshness-dot op "Nieuws"
  // rendert op élke app-pagina en gebruikt deze modus zodat een sidebar-dot
  // nooit token-kosten/egress veroorzaakt. Retourneert de gecachte items als
  // die er zijn (of de items van een afgeronde/lopende achtergrond-generatie),
  // anders een lege lijst — generatie wordt hier nooit getriggerd.
  const peek = url.searchParams.get('peek') === '1'
  if (peek) {
    const state = await readGenerationState(supabase, user.id)
    if (state && !state.error && state.items.length > 0) {
      // Lopende of afgeronde generatie met al-beschikbare items — stuur alleen
      // de id's: de sidebar-freshness-dot heeft de volledige payload niet nodig.
      return NextResponse.json({ ids: state.items.map((i: NewsItem) => i.id), cached: false, peek: true })
    }
    const cached = await getCachedNews(supabase, user.id)
    return NextResponse.json({
      ids: (cached?.items ?? []).map((i: NewsItem) => i.id),
      cached: cached != null,
      peek: true,
    })
  }

  const editionNr = await getNextEditionNr(supabase, user.id)
  const jaargang = new Date().getFullYear() - 2025

  // ── Lopende of afgeronde achtergrond-generatie (state in DB) ───
  const existingState = await readGenerationState(supabase, user.id)
  if (existingState) {
    if (existingState.error) {
      await clearGenerationState(supabase, user.id)
      return NextResponse.json(
        { error: `Nieuws kon niet worden gegenereerd: ${existingState.error}` },
        { status: 500 },
      )
    }

    if (existingState.complete) {
      await clearGenerationState(supabase, user.id)
      const refreshStatus = await checkRefreshLimit(supabase, user.id)
      return NextResponse.json({
        items: existingState.items,
        cached: false,
        editionNr,
        jaargang,
        generatedAt: new Date().toISOString(),
        refreshesRemaining: refreshStatus.remaining,
        sourceCount: existingState.sourceCount,
        sourceNewestAt: existingState.sourceNewestAt,
      })
    }

    const ageMs = Date.now() - new Date(existingState.startedAt).getTime()
    if (ageMs < GENERATION_TIMEOUT_MS) {
      return NextResponse.json({
        status: 'generating',
        items: existingState.items,
        editionNr,
        jaargang,
      })
    }

    // Gestrande generatie — opruimen en opnieuw starten
    await clearGenerationState(supabase, user.id)
  }

  // Check cache first (unless refresh is forced)
  if (!forceRefresh) {
    const cached = await getCachedNews(supabase, user.id)
    if (cached) {
      const refreshStatus = await checkRefreshLimit(supabase, user.id)
      return NextResponse.json({
        items: cached.items,
        cached: true,
        editionNr,
        jaargang,
        generatedAt: cached.generatedAt,
        refreshesRemaining: refreshStatus.remaining,
        sourceCount: cached.sourceCount,
        sourceNewestAt: cached.sourceNewestAt,
      })
    }
  }

  // Archive current edition + rate limit check for refresh
  if (forceRefresh) {
    const { allowed, remaining, limit } = await checkRefreshLimit(supabase, user.id)
    if (!allowed) {
      return NextResponse.json({
        error: `Je hebt het maximale aantal verversingen bereikt (${limit} per week). Probeer het later opnieuw.`,
        rateLimited: true,
        remaining: 0,
        limit,
      }, { status: 429 })
    }
    await archiveCurrentEdition(supabase, user.id)
  }

  // ── Prepare context (errors returned synchronously) ────────────

  let financialContext: string
  try {
    financialContext = await buildSharedContext(supabase)
  } catch {
    financialContext = 'Geen financiele gegevens beschikbaar.'
  }

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, date_of_birth')
      .eq('id', user.id)
      .single()

    const sanitizeOpts: SanitizeOptions = {}
    if (profile) {
      const names = [profile.full_name].filter(Boolean) as string[]
      if (names.length > 0) sanitizeOpts.names = names
      if (profile.date_of_birth) sanitizeOpts.dateOfBirth = profile.date_of_birth
    }

    financialContext = sanitizeForAI(financialContext, sanitizeOpts)
  } catch (err) {
    console.error('[/api/news] Sanitization failed — AI call blocked (fail-safe):', err)
    return NextResponse.json(
      { error: 'De AI-assistent is tijdelijk niet beschikbaar vanwege een beveiligingscontrole. Probeer het later opnieuw.' },
      { status: 503 },
    )
  }

  let model
  try {
    model = await getModel(supabase, 'nieuws')
  } catch (err) {
    if (err instanceof AIConfigError) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    return NextResponse.json({ error: 'AI model kon niet worden geladen.' }, { status: 500 })
  }

  const [recentHeadlines, demotedCategories, sourceArticles] = await Promise.all([
    getRecentHeadlines(supabase, user.id),
    getDemotedCategories(supabase, user.id),
    loadSourceArticles(),
  ])

  const sourceNewestAt = sourceArticles
    .map((a) => a.published_at)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1)

  // ── Fire-and-forget background generation ──────────────────────

  const startedAt = new Date().toISOString()
  await writeGenerationState(supabase, user.id, {
    items: [],
    complete: false,
    startedAt,
    sourceCount: sourceArticles.length,
    sourceNewestAt,
  })

  const generation = (async () => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const headlinesContext = recentHeadlines.length > 0
        ? `\n\nEERDER GEGENEREERDE KOPPEN (afgelopen 2 maanden — vermijd herhaling van dezelfde onderwerpen):\n${recentHeadlines.map(h => `- "${h}"`).join('\n')}\n\nGenereer nieuws over ANDERE onderwerpen. Varieer in invalshoek, subcategorie en focus.`
        : ''

      const feedbackContext = demotedCategories.length > 0
        ? `\n\nFEEDBACK VAN DE GEBRUIKER: geef berichten in deze categorieën alleen een plek bij hoge impact (impactScore 4-5): ${demotedCategories.join(', ')}.`
        : ''

      // Build source context from database articles, incl. de ingest-impactanalyse
      const sourcesContext = sourceArticles.length > 0
        ? `\n\nACTUELE NIEUWSBRONNEN (toets ze op relevantie en impact; gebruik sourceUrl en sourceName letterlijk):\n${sourceArticles.map(a =>
          `- [${a.source_name}] "${a.title}" (${a.published_at ? a.published_at.split('T')[0] : 'onbekend'})\n  Link: ${a.source_url}\n  Samenvatting: ${a.summary || '(geen)'}${a.potential_impact ? `\n  Potentiele impact: ${a.potential_impact}` : ''}`
        ).join('\n\n')}`
        : '\n\nER ZIJN GEEN BRONARTIKELEN BESCHIKBAAR. Genereer daarom GEEN berichten — een lege editie is het juiste antwoord.'

      const state: GenerationState = {
        items: [],
        complete: false,
        startedAt,
        sourceCount: sourceArticles.length,
        sourceNewestAt,
      }

      const result = streamObject({
        model,
        output: 'array',
        schema: newsItemSchema,
        system: NEWS_SYSTEM_PROMPT,
        prompt: `Datum vandaag: ${today}

FINANCIEEL PROFIEL VAN DE GEBRUIKER:
${financialContext}

Toets de aangeleverde bronartikelen op relevantie en impact voor dit profiel en schrijf ALLEEN over artikelen met duidelijke nieuwswaarde (0-8 berichten; minder is beter dan geforceerd). Sorteer: direct-impact eerst (hoogste impactScore bovenaan), dan relevant.${headlinesContext}${feedbackContext}${sourcesContext}`,
      })

      for await (const item of result.elementStream) {
        const masked = maskPIIInObject(item)
        masked.impactScore = Math.min(5, Math.max(1, Math.round(masked.impactScore ?? 3)))
        state.items.push(masked)
        await writeGenerationState(supabase, user.id, state)
      }

      // Grounding: zonder geldige bron-URL uit de aangeleverde set vervalt
      // een bericht (alleen afdwingbaar als er bronnen wáren)
      const { kept, dropped } = filterGroundedItems(
        state.items,
        sourceArticles.map((a) => a.source_url),
      )
      if (dropped.length > 0) {
        console.warn(`[/api/news] Dropped ${dropped.length} ungrounded item(s):`, dropped.map(d => d.headline))
      }

      // Sortering garanderen: direct eerst, daarbinnen hoogste impactScore
      kept.sort((a, b) => {
        if (a.impactType === 'direct' && b.impactType !== 'direct') return -1
        if (a.impactType !== 'direct' && b.impactType === 'direct') return 1
        return (b.impactScore ?? 0) - (a.impactScore ?? 0)
      })

      await setCachedNews(supabase, user.id, kept, {
        sourceCount: sourceArticles.length,
        sourceNewestAt,
      })
      await recordAiUsage(supabase, user.id, 'news')
      await markUsedArticles(sourceArticles, kept)

      await writeGenerationState(supabase, user.id, { ...state, items: kept, complete: true })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error('[/api/news] Background generation failed:', errMsg)
      await writeGenerationState(supabase, user.id, {
        items: [],
        complete: false,
        error: errMsg,
        startedAt,
      })
    }
  })()

  // Prevent unhandled rejection warning (errors persisted in generation state)
  generation.catch(() => {})

  return NextResponse.json({ status: 'generating', items: [], editionNr, jaargang })
}
