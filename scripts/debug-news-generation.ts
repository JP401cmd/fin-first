// Diagnose-script: reproduceert de nieuwsgeneratie van /api/news buiten Next om.
// Draait met de echte bronartikelen en het echte model en rapporteert per item
// wat het model schreef en of het grounding-filter het zou houden of droppen.
//
// Gebruik: npx tsx scripts/debug-news-generation.ts

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { streamObject } from 'ai'
import { z } from 'zod'
import { selectSourceArticles, filterGroundedItems, normalizeUrl } from '../lib/news-selection'
import { NEWS_SYSTEM_PROMPT } from '../lib/news-system-prompt'

// ── .env.local laden ─────────────────────────────────────────────────
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const NEWS_CATEGORIES = ['fiscaal', 'rente', 'woningmarkt', 'beleggingen', 'pensioen', 'macro'] as const

const newsItemSchema = z.object({
  id: z.string(),
  headline: z.string(),
  summary: z.string(),
  impactType: z.enum(['direct', 'relevant']),
  personalImpact: z.string(),
  impactScore: z.number(),
  impactDirection: z.enum(['positief', 'negatief', 'neutraal']),
  deadline: z.string().optional(),
  category: z.enum(NEWS_CATEGORIES),
  date: z.string(),
  sourceContext: z.string().optional(),
  sourceUrl: z.string().optional(),
  sourceName: z.string().optional(),
})

async function getModelInline() {
  const { data } = await service
    .from('app_settings')
    .select('key, value')
    .in('key', ['ai_provider', 'ai_model_anthropic', 'ai_model_openai', 'anthropic_api_key', 'openai_api_key'])
  const settings: Record<string, string> = {}
  for (const row of data ?? []) settings[row.key] = row.value
  const provider = settings.ai_provider || 'anthropic'
  if (provider === 'openai') {
    return createOpenAI({ apiKey: settings.openai_api_key || process.env.OPENAI_API_KEY! })(settings.ai_model_openai || 'gpt-4o')
  }
  return createAnthropic({ apiKey: settings.anthropic_api_key || process.env.ANTHROPIC_API_KEY! })(settings.ai_model_anthropic || 'claude-sonnet-4-5-20250929')
}

async function main() {
  // ── Bronartikelen exact zoals /api/news ze laadt ───────────────
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data } = await service
    .from('news_articles')
    .select('id, title, summary, source_url, source_name, category, published_at, potential_impact, is_used')
    .gte('fetched_at', thirtyDaysAgo.toISOString())
    .order('published_at', { ascending: false })
    .limit(120)

  const sourceArticles = selectSourceArticles(data || [], { limit: 40 })
  console.log(`Bronartikelen geselecteerd: ${sourceArticles.length} (van ${data?.length ?? 0} kandidaten)\n`)

  const model = await getModelInline()

  // Representatief profiel (synthetisch — geen echte gebruikersdata in een debug-script)
  const financialContext = `Netto vermogen: €1.050.000 (waarvan €600.000 beleggingen, €250.000 spaargeld, €200.000 overwaarde woning).
Maandinkomen: €6.500 netto (loondienst). Maanduitgaven: €3.800. Spaarquote: 41%.
Hypotheek: €280.000 restschuld, rente 3,1% vast tot 2031.
FIRE-doel: financieel onafhankelijk op 55e (over 12 jaar). Dagelijkse kosten: €125.
Box 3-vermogen boven de vrijstelling. Geen ondernemer, geen box 2.`

  const today = new Date().toISOString().split('T')[0]
  const sourcesContext = `\n\nACTUELE NIEUWSBRONNEN (toets ze op relevantie en impact; gebruik sourceUrl en sourceName letterlijk):\n${sourceArticles.map(a =>
    `- [${a.source_name}] "${a.title}" (${a.published_at ? a.published_at.split('T')[0] : 'onbekend'})\n  Link: ${a.source_url}\n  Samenvatting: ${a.summary || '(geen)'}${a.potential_impact ? `\n  Potentiele impact: ${a.potential_impact}` : ''}`
  ).join('\n\n')}`

  const result = streamObject({
    model,
    output: 'array',
    schema: newsItemSchema,
    system: NEWS_SYSTEM_PROMPT,
    prompt: `Datum vandaag: ${today}

FINANCIEEL PROFIEL VAN DE GEBRUIKER:
${financialContext}

Toets de aangeleverde bronartikelen op relevantie en impact voor dit profiel en schrijf ALLEEN over artikelen met duidelijke nieuwswaarde (0-8 berichten; minder is beter dan geforceerd). Sorteer: direct-impact eerst (hoogste impactScore bovenaan), dan relevant.${sourcesContext}`,
  })

  const items: z.infer<typeof newsItemSchema>[] = []
  try {
    for await (const item of result.elementStream) {
      items.push(item)
      console.log(`→ [${item.impactType}/${item.impactScore}] ${item.headline}`)
      console.log(`   sourceUrl: ${item.sourceUrl ?? '(ontbreekt)'}`)
    }
  } catch (err) {
    console.error('\n!! elementStream brak af:', err instanceof Error ? err.message : err)
  }

  console.log(`\nModel produceerde: ${items.length} items`)

  const allowed = sourceArticles.map((a) => a.source_url)
  const { kept, dropped } = filterGroundedItems(items, allowed)
  console.log(`Grounding: ${kept.length} gehouden, ${dropped.length} gedropt`)

  for (const d of dropped) {
    console.log(`\nGEDROPT: ${d.headline}`)
    console.log(`  item.sourceUrl : ${d.sourceUrl ?? '(geen)'}`)
    if (d.sourceUrl) {
      const norm = normalizeUrl(d.sourceUrl)
      const closest = allowed.find((u) => normalizeUrl(u).split('#')[0] === norm.split('#')[0])
      console.log(`  genormaliseerd : ${norm}`)
      console.log(`  dichtstbij bron: ${closest ?? '(geen match, ook niet zonder #fragment)'}`)
    }
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
