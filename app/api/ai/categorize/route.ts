import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { recordAiUsage } from '@/lib/ai-credits'
import { getModel, AIConfigError } from '@/lib/ai/config'
import { checkTierGate } from '@/lib/require-tier'
import { CATEGORIZE_SYSTEM_PROMPT } from '@/lib/ai/categorize-system-prompt'

const CHILD_SLUGS = [
  'salaris-uitkering',
  'toeslagen-kinderbijslag',
  'teruggave-belasting',
  'overige-inkomsten',
  'huur-hypotheek',
  'gas-water-licht',
  'verzekeringen-wonen',
  'gemeentelijke-lasten',
  'boodschappen',
  'huishouden-verzorging',
  'kinderen-school',
  'medische-kosten',
  'brandstof-ov',
  'auto-vaste-lasten',
  'auto-onderhoud',
  'fiets-deelvervoer',
  'uit-eten-horeca',
  'vrije-tijd-sport',
  'vakantie',
  'kleding-overige',
  'sparen-noodbuffer',
  'investeren-fire',
  'schulden-aflossingen',
  'extra-aflossing-hypotheek',
] as const

type BudgetSlug = typeof CHILD_SLUGS[number]

const categorizationSchema = z.object({
  categorizations: z.array(z.object({
    budget_slug: z.string().nullable(),
    confidence: z.number(),
    reasoning: z.string(),
  })),
})

const VALID_SLUGS = new Set<string>(CHILD_SLUGS)

type RequestTransaction = {
  import_hash: string
  description: string
  counterparty_name?: string | null
  amount: number
  reference?: string | null
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const tierGate = await checkTierGate(supabase, user.id, 'ai')
  if (tierGate) {
    return new Response(JSON.stringify({ error: tierGate.error }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  }

  let body: { transactions: RequestTransaction[] }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldig verzoek.' }, { status: 400 })
  }

  const { transactions } = body
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return Response.json({ error: 'Geen transacties meegegeven.' }, { status: 400 })
  }

  // Max 20 per batch to avoid model timeouts and hash mangling
  const batch = transactions.slice(0, 20)

  let model
  try {
    model = await getModel(supabase, 'categorisatie')
  } catch (err) {
    if (err instanceof AIConfigError) {
      return Response.json({ error: err.message }, { status: 422 })
    }
    return Response.json({ error: 'AI model kon niet worden geladen.' }, { status: 500 })
  }

  const prompt = `Categoriseer de volgende ${batch.length} transacties.\nRetourneer een array van exact ${batch.length} items in dezelfde volgorde.\n\n${batch.map((tx, i) => {
    const parts = [
      `beschrijving: ${tx.description}`,
      tx.counterparty_name ? `tegenpartij: ${tx.counterparty_name}` : null,
      `bedrag: ${tx.amount > 0 ? '+' : ''}${tx.amount}`,
      tx.reference ? `referentie: ${tx.reference}` : null,
    ].filter(Boolean)
    return `${i + 1}. ${parts.join('\n   ')}`
  }).join('\n\n')}`

  let object: z.infer<typeof categorizationSchema>
  try {
    const result = await generateObject({
      model,
      schema: categorizationSchema,
      system: CATEGORIZE_SYSTEM_PROMPT,
      prompt,
      maxRetries: 0,
    })
    object = result.object
    await recordAiUsage(supabase, user.id, 'categorize')
  } catch (err) {
    console.error('AI categorization failed:', err)
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return Response.json(
      { error: `AI-categorisatie mislukt: ${message}` },
      { status: 500 },
    )
  }

  // Build a lookup map from slug → budget_id.
  // Met gedeelde budgetten kan dezelfde slug twee keer voorkomen: een eigen
  // ('personal') rij én de gedeelde huishoud-rij ('shared'). Het gedeelde
  // huishoudbudget is canoniek, dus dat wint bij een collisie. (Gearchiveerde,
  // samengevoegde duplicaten krijgen hernoemde slugs en botsen daarom niet.)
  const { data: budgets } = await supabase
    .from('budgets')
    .select('id, slug, ownership')
    .in('slug', [...CHILD_SLUGS])

  const slugToId = new Map<BudgetSlug, string>()
  for (const b of budgets ?? []) {
    if (!b.slug) continue
    const slug = b.slug as BudgetSlug
    // Voorkeur voor 'shared' bij een slug-collisie.
    if (slugToId.has(slug) && b.ownership !== 'shared') continue
    slugToId.set(slug, b.id)
  }

  // Positional mapping: result[i] corresponds to batch[i]
  const results = batch.map((tx, i) => {
    const cat = object.categorizations[i]
    if (!cat) return { import_hash: tx.import_hash, budget_slug: null, budget_id: null, confidence: 0, reasoning: '' }
    const slug = cat.budget_slug?.toLowerCase().trim() ?? null
    const validSlug = slug && VALID_SLUGS.has(slug) ? (slug as BudgetSlug) : null
    return {
      import_hash: tx.import_hash,
      budget_slug: validSlug,
      budget_id: validSlug ? (slugToId.get(validSlug) ?? null) : null,
      confidence: Math.min(1, Math.max(0, cat.confidence)),
      reasoning: cat.reasoning,
    }
  })

  return Response.json({ results })
}
