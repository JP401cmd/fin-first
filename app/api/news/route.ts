import { streamObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getModel, AIConfigError } from '@/lib/ai/config'
import { buildSharedContext } from '@/lib/ai/context/shared-context'
import { sanitizeForAI, type SanitizeOptions } from '@/lib/ai/sanitize'
import { maskPIIInObject } from '@/lib/ai/pii-output-filter'
import { NextResponse } from 'next/server'

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
  category: z.enum(NEWS_CATEGORIES).describe('Nieuwscategorie'),
  date: z.string().describe('Datum van het nieuws in YYYY-MM-DD formaat'),
  sourceContext: z.string().optional().describe('Broncontext of toelichting (bijv. "Belastingplan 2026", "ECB persconferentie")'),
})

export type NewsItem = z.infer<typeof newsItemSchema>

// ── System prompt ────────────────────────────────────────────────────

const NEWS_SYSTEM_PROMPT = `Je bent een persoonlijke financiele nieuwsassistent voor TriFinity, een Nederlandse personal finance app.

KERNFILOSOFIE: "Geld is opgeslagen tijd — elke euro vertegenwoordigt een stukje levenstijd."

Je taak:
1. Genereer 5-8 Nederlandse financiele nieuwsberichten op basis van actuele trends en wetswijzigingen.
2. Gebruik TWEE typen berichten: "direct" (concrete persoonlijke impact) en "relevant" (financieel relevant zonder concrete impact).

TWEE TYPEN BERICHTEN:

1. DIRECT IMPACT (impactType: "direct"):
   - Nieuws waarvan je de concrete financiele impact voor DEZE gebruiker kunt berekenen
   - personalImpact bevat specifieke euro-bedragen of vrijheidstijd gebaseerd op het profiel
   - Voorbeeld: "Met jouw maanduitgaven van €2.800 bespaart dit je €45/maand — 1,2 extra vrijheidsdagen per jaar"
   - Minimaal 4 berichten moeten direct impact hebben

2. RELEVANT (impactType: "relevant"):
   - Financieel nieuws dat relevant is voor de gebruiker maar waarvan je geen concrete impact kunt berekenen
   - personalImpact bevat een korte uitleg WAAROM dit relevant kan zijn voor de financiele situatie van de gebruiker
   - Voorbeeld: "Als belegger in ETF's is deze wijziging in EU-regelgeving het volgen waard"
   - Maximaal 4 relevante berichten (mag ook 0 zijn)
   - Gebruik dit voor bredere financiele trends, toekomstige ontwikkelingen, of achtergrondnieuws

SORTERING:
- Genereer EERST alle "direct" berichten, daarna de "relevant" berichten
- Het EERSTE bericht moet het bericht zijn met de GROOTSTE concrete impact voor de gebruiker — dit wordt het hoofdartikel

CATEGORIEËN:
- fiscaal: Belastingwijzigingen, box 1/2/3, toeslagen, aftrekposten
- rente: ECB-beslissingen, spaarrente, hypotheekrentes
- woningmarkt: Huizenprijzen, NHG, huurmarkt
- beleggingen: AEX, ETF's, crypto-regulering, dividenden
- pensioen: AOW, pensioenwet, lijfrente
- macro: Inflatie, koopkracht, loongroei, werkloosheid

REGELS:
- Schrijf ALTIJD in het Nederlands
- Baseer je op actuele Nederlandse financiele trends per maart 2026
- Elke headline moet kort en informatief zijn (max 80 tekens)
- Gebruik het YYYY-MM-DD datumformaat
- Zorg voor spreiding over categorieën (minimaal 3 verschillende)
- sourceContext is optioneel maar wordt gewaardeerd voor context
- Als er eerder gegenereerde koppen worden meegegeven, vermijd dezelfde onderwerpen

REGELS VOOR "direct" BERICHTEN:
- personalImpact MOET concrete euro-bedragen OF vrijheidstijd bevatten
- GEEN hypothetische impact: schrijf nooit "als je...", "mocht je...", "indien je..."
- personalImpact moet refereren aan de werkelijke situatie: "Met jouw vermogen van...", "Op basis van je maanduitgaven van..."

REGELS VOOR "relevant" BERICHTEN:
- personalImpact legt uit WAAROM dit relevant is voor het profiel van de gebruiker
- Refereer aan de context van de gebruiker (bijv. "als belegger", "met jouw pensioenopbouw") maar zonder specifieke bedragen
- Houd de toon informatief, niet alarmerend

VRIJHEIDSTIJD BEREKENING (alleen voor "direct"):
Als de gebruiker dagelijkse kosten heeft, gebruik die als basis:
- vrijheidsdagen = euro-impact / dagelijkse kosten
- Voorbeeld: "Dit bespaart je €90/maand — dat zijn 2,3 extra vrijheidsdagen per jaar"
`

// ── Cache helpers ────────────────────────────────────────────────────

function cacheKey(userId: string) {
  return `news_cache:${userId}`
}

interface CachedNews {
  items: NewsItem[]
  generatedAt: string
}

async function getCachedNews(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<NewsItem[] | null> {
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

    if (ageHours > CACHE_TTL_HOURS) return null

    return cached.items
  } catch {
    return null
  }
}

async function setCachedNews(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  items: NewsItem[],
): Promise<void> {
  const value: CachedNews = {
    items,
    generatedAt: new Date().toISOString(),
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

// ── Background generation tracker ────────────────────────────────────

interface GenerationState {
  items: NewsItem[]
  complete: boolean
  startedAt: number
}

const activeGenerations = new Map<string, GenerationState>()
const generationErrors = new Map<string, string>()    // userId → error message
const GENERATION_TIMEOUT_MS = 120_000                 // 2 min — auto-cleanup

function cleanupStaleGenerations() {
  const now = Date.now()
  for (const [userId, state] of activeGenerations) {
    if (now - state.startedAt > GENERATION_TIMEOUT_MS) {
      activeGenerations.delete(userId)
    }
  }
}

// ── GET handler ──────────────────────────────────────────────────────

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const url = new URL(request.url)
  const forceRefresh = url.searchParams.get('refresh') === '1'

  const editionNr = await getNextEditionNr(supabase, user.id)
  const jaargang = new Date().getFullYear() - 2025

  // Cleanup stale background generations
  cleanupStaleGenerations()

  // Return error from a previously failed background generation
  if (generationErrors.has(user.id)) {
    const error = generationErrors.get(user.id)!
    generationErrors.delete(user.id)
    return NextResponse.json(
      { error: `Nieuws kon niet worden gegenereerd: ${error}` },
      { status: 500 },
    )
  }

  // If generation is already running, return partial items
  if (activeGenerations.has(user.id)) {
    const state = activeGenerations.get(user.id)!
    if (state.complete) {
      activeGenerations.delete(user.id)
      const refreshStatus = await checkRefreshLimit(supabase, user.id)
      return NextResponse.json({
        items: state.items,
        cached: false,
        editionNr,
        jaargang,
        refreshesRemaining: refreshStatus.remaining,
      })
    }
    return NextResponse.json({ status: 'generating', items: state.items, editionNr, jaargang })
  }

  // Check cache first (unless refresh is forced)
  if (!forceRefresh) {
    const cached = await getCachedNews(supabase, user.id)
    if (cached) {
      const refreshStatus = await checkRefreshLimit(supabase, user.id)
      return NextResponse.json({
        items: cached,
        cached: true,
        editionNr,
        jaargang,
        refreshesRemaining: refreshStatus.remaining,
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
    model = await getModel(supabase)
  } catch (err) {
    if (err instanceof AIConfigError) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    return NextResponse.json({ error: 'AI model kon niet worden geladen.' }, { status: 500 })
  }

  const recentHeadlines = await getRecentHeadlines(supabase, user.id)

  // ── Fire-and-forget background generation ──────────────────────

  const state: GenerationState = { items: [], complete: false, startedAt: Date.now() }
  activeGenerations.set(user.id, state)

  const generation = (async () => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const headlinesContext = recentHeadlines.length > 0
        ? `\n\nEERDER GEGENEREERDE KOPPEN (afgelopen 2 maanden — vermijd herhaling van dezelfde onderwerpen):\n${recentHeadlines.map(h => `- "${h}"`).join('\n')}\n\nGenereer nieuws over ANDERE onderwerpen. Varieer in invalshoek, subcategorie en focus.`
        : ''

      const result = streamObject({
        model,
        output: 'array',
        schema: newsItemSchema,
        system: NEWS_SYSTEM_PROMPT,
        prompt: `Datum vandaag: ${today}

FINANCIEEL PROFIEL VAN DE GEBRUIKER:
${financialContext}

Genereer 5-8 Nederlandse financiele nieuwsitems. Begin met minimaal 4 "direct" impact berichten (het eerste bericht moet de grootste impact hebben). Vul aan met maximaal 4 "relevant" berichten. Sorteer: direct-impact eerst, dan relevant.${headlinesContext}`,
      })

      for await (const item of result.elementStream) {
        state.items.push(maskPIIInObject(item))
      }

      // Enforce sort: direct-impact items first, then relevant items
      // The AI is instructed to sort this way, but we guarantee it server-side
      state.items.sort((a, b) => {
        if (a.impactType === 'direct' && b.impactType !== 'direct') return -1
        if (a.impactType !== 'direct' && b.impactType === 'direct') return 1
        return 0
      })

      state.complete = true
      await setCachedNews(supabase, user.id, state.items)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error('[/api/news] Background generation failed:', errMsg)
      generationErrors.set(user.id, errMsg)
      activeGenerations.delete(user.id)
    }
  })()

  // Prevent unhandled rejection warning (errors captured in generationErrors)
  generation.catch(() => {})

  return NextResponse.json({ status: 'generating', items: [], editionNr, jaargang })
}
