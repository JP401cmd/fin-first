import { streamObject } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { recordAiUsage } from '@/lib/ai-credits'
import { getModel, AIConfigError } from '@/lib/ai/config'
import { assertCloudAllowed } from '@/lib/ai/privacy-gate'
import { buildSharedContext } from '@/lib/ai/context/shared-context'
import { sanitizeForAI, type SanitizeOptions } from '@/lib/ai/sanitize'
import { maskPIIInObject } from '@/lib/ai/pii-output-filter'
import { NextResponse } from 'next/server'
import { unauthorized, forbidden, serverError } from '@/lib/api/respond'
import { checkTierGate } from '@/lib/require-tier'
import { NEWS_SYSTEM_PROMPT } from '@/lib/news-system-prompt'
import { filterGroundedItems, type SelectableArticle } from '@/lib/news-selection'
import { newsItemSchema, type NewsItem } from '@/lib/news-item'
import { demotedCategories, demotionWindowStartIso } from '@/lib/news-feedback-summary'
import {
  archiveCurrentEdition,
  checkRefreshLimit,
  currentJaargang,
  getCachedNews,
  getNextEditionNr,
  getRecentHeadlines,
  loadNewsSourceArticles,
  markUsedArticles,
  setCachedNews,
  type NewsSupabaseClient,
} from '@/lib/news-edition-store'

// Schema, type en opslag wonen sinds de on-device editie in gedeelde modules
// (`lib/news-item.ts` + `lib/news-edition-store.ts`): het lokale pad schrijft naar
// DEZELFDE cache-sleutel, en twee kopieën van die sleutelvorm zou stil uit de pas
// lopen. Her-export zodat bestaande importeurs (components/berichten/*) ongewijzigd
// blijven werken.
export type { NewsItem }

type SupabaseClient = NewsSupabaseClient

// System prompt is imported from lib/news-system-prompt.ts (single source of truth)

// ── Feedback helper — categorieën die de gebruiker minder wil zien ──

async function getDemotedCategories(supabase: SupabaseClient, userId: string): Promise<string[]> {
  try {
    const { data } = await supabase
      .from('news_feedback')
      .select('category')
      .eq('user_id', userId)
      .eq('verdict', 'less')
      .gte('created_at', demotionWindowStartIso())

    if (!data) return []
    // Drempel en venster wonen in lib/news-feedback-summary.ts — dezelfde
    // implementatie die het beheervenster op /beheer/nieuws consumeert. Stond de
    // regel hier apart, dan zou dat scherm stil gaan liegen zodra hij wijzigt
    // (ADR 0113).
    return demotedCategories(data)
  } catch {
    return []
  }
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

/**
 * Aantal bronartikelen dat in ÉÉN cloud-prompt gaat. Het lokale pad hanteert een
 * veel lagere limiet (~12): daar krijgt elk artikel een eigen modelcall.
 */
const SOURCE_PROMPT_LIMIT = 40

// ── GET handler ──────────────────────────────────────────────────────

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return unauthorized()
  }

  // PRIVÉ-MODUS EERST — vóór de tier-gate, de credit-gate en élke dataophaling.
  // Staat 'nieuws' op lokaal, dan stelt de browser de editie zelf samen en hoort
  // deze route niets te leveren.
  // Waarom in deze volgorde: (1) privé-modus is de meest fundamentele keuze van
  // de gebruiker en gaat vóór commerciële gating — de eerlijke reden is dan
  // "privé-modus staat aan", niet "je mist een abonnement"; (2) een geblokkeerde
  // call mag geen credits verbruiken (recordAiUsage hangt verderop aan de
  // generatie die hier fire-and-forget start); (3) er mag geen enkel
  // gebruikersgegeven richting promptopbouw gaan — buildSharedContext haalt
  // hieronder de volledige financiële situatie op en zet die in de prompt.
  // Nooit een stille terugval naar de cloud: 403 is het eindpunt.
  //
  // WELKE HANDLER WEL, WELKE NIET. Deze GET is de enige handler in dit bestand
  // en het enige pad dat bij getModel(supabase, 'nieuws') uitkomt (de generatie
  // verderop), dus draagt hij de gate in zijn geheel — inclusief de vroege
  // peek-/cache-antwoorden, want die serveren precies de editie die dit
  // cloud-pad heeft gemaakt en staan achter dezelfde tier-gate. De naburige
  // nieuws-handlers doen géén modelcall en blijven bewust ongegate:
  // /api/news/archive (opgeslagen edities teruggeven), /api/news/read
  // (leesstatus) en /api/news/feedback (duim omhoog/omlaag). Die wél gaten zou
  // nieuws blokkeren dat al bestaat, terwijl er daar nooit iets naar een
  // AI-leverancier vertrekt.
  const privacyGate = await assertCloudAllowed(supabase, user.id, 'nieuws')
  if (privacyGate) return privacyGate

  const tierGate = await checkTierGate(supabase, user.id, 'ai')
  if (tierGate) {
    return forbidden(tierGate.error)
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
  const jaargang = currentJaargang()

  // ── Lopende of afgeronde achtergrond-generatie (state in DB) ───
  const existingState = await readGenerationState(supabase, user.id)
  if (existingState) {
    if (existingState.error) {
      await clearGenerationState(supabase, user.id)
      return serverError(
        new Error(existingState.error),
        'news:GET',
        'Nieuws kon niet worden gegenereerd. Probeer het later opnieuw.',
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
      // eslint-disable-next-line no-restricted-syntax -- rauwe error.message: zie [Arch F4] API-error-envelope
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    return NextResponse.json({ error: 'AI model kon niet worden geladen.' }, { status: 500 })
  }

  const [recentHeadlines, demotedCategories, sourceArticles] = await Promise.all([
    getRecentHeadlines(supabase, user.id),
    getDemotedCategories(supabase, user.id),
    loadNewsSourceArticles(SOURCE_PROMPT_LIMIT),
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
