import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { recordAiUsage } from '@/lib/ai-credits'
import { getModel, AIConfigError } from '@/lib/ai/config'
import { checkTierGate } from '@/lib/require-tier'
import { checkCreditBudget, creditLimitMessage } from '@/lib/ai/credit-gate'
import { sanitizeForAI } from '@/lib/ai/sanitize'
import {
  buildCategorizeSystemPrompt,
  type CategorizeBudgetOption,
} from '@/lib/ai/categorize-system-prompt'
import { buildBudgetOptions, resolveSlug, type BudgetRow } from './budget-options'

const categorizationSchema = z.object({
  categorizations: z.array(z.object({
    budget_slug: z.string().nullable(),
    confidence: z.number(),
    reasoning: z.string(),
  })),
})

type RequestTransaction = {
  import_hash: string
  description: string
  counterparty_name?: string | null
  amount: number
  reference?: string | null
  date?: string | null
}

// BudgetRow en de pure helpers (buildBudgetOptions, resolveSlug, isAssignableType)
// leven nu in ./budget-options.ts zodat ze getest kunnen worden zonder Supabase.

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

  // Per-gebruiker rate-limit: dwing het maand-creditbudget af (gedeelde bucket)
  // vóór de dure LLM-call. Categorisatie kost 1 credit per batch (max 20 tx).
  const creditGate = await checkCreditBudget(supabase, user.id, 'categorize')
  if (!creditGate.allowed) {
    return new Response(JSON.stringify({ error: creditLimitMessage(creditGate) }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(creditGate.retryAfterSeconds) },
    })
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

  // ── Toewijsbare budgetten ophalen (RLS-respecterend) ──────────────────────
  // Geen user_id-filter en geen service-role: RLS surfacet zowel de eigen
  // budgetten (auth.uid() = user_id) als de via het huishouden gedeelde
  // budgetten (ownership='shared' AND household_id = user_household_id()).
  // We nemen alleen LEAF-budgetten als toewijsdoel — een parent mét children is
  // geen toewijsdoel (bestaande app-conventie, zie Sleepmodus/budget-keuzelijst).
  const { data: budgetRows, error: budgetError } = await supabase
    .from('budgets')
    .select('id, parent_id, name, slug, budget_type, description, ownership')
    .eq('is_archived', false)

  if (budgetError) {
    return Response.json({ error: 'Budgetten konden niet worden geladen.' }, { status: 500 })
  }

  const rows = (budgetRows ?? []) as BudgetRow[]

  const { options, slugToId, validSlugs } = buildBudgetOptions(rows)

  if (options.length === 0) {
    return Response.json({ error: 'Geen budgetten gevonden om transacties aan toe te wijzen.' }, { status: 422 })
  }

  let model
  try {
    model = await getModel(supabase, 'categorisatie')
  } catch (err) {
    if (err instanceof AIConfigError) {
      return Response.json({ error: err.message }, { status: 422 })
    }
    return Response.json({ error: 'AI model kon niet worden geladen.' }, { status: 500 })
  }

  // Systeemprompt opbouwen uit de echte budgetten van de gebruiker. Budgetnamen
  // zijn noodzakelijke feature-context maar zijn user-content → sanitizen vóór
  // ze naar het model gaan (zelfde discipline als bij de transactieregels).
  const sanitizedOptions: CategorizeBudgetOption[] = options.map((o) => ({
    ...o,
    name: sanitizeForAI(o.name),
    parentName: o.parentName ? sanitizeForAI(o.parentName) : o.parentName,
    description: o.description ? sanitizeForAI(o.description) : o.description,
  }))
  const system = buildCategorizeSystemPrompt(sanitizedOptions)

  const prompt = `Categoriseer de volgende ${batch.length} transacties.\nRetourneer een array van exact ${batch.length} items in dezelfde volgorde.\n\n${batch.map((tx, i) => {
    const parts = [
      `beschrijving: ${sanitizeForAI(tx.description ?? '')}`,
      tx.counterparty_name ? `tegenpartij: ${sanitizeForAI(tx.counterparty_name)}` : null,
      `bedrag: ${tx.amount > 0 ? '+' : ''}${tx.amount}`,
      tx.date ? `datum: ${tx.date}` : null,
      tx.reference ? `referentie: ${sanitizeForAI(tx.reference)}` : null,
    ].filter(Boolean)
    return `${i + 1}. ${parts.join('\n   ')}`
  }).join('\n\n')}`

  let object: z.infer<typeof categorizationSchema>
  try {
    const result = await generateObject({
      model,
      schema: categorizationSchema,
      system,
      prompt,
      maxRetries: 0,
    })
    object = result.object
    await recordAiUsage(supabase, user.id, 'categorize')
  } catch (err) {
    // Details alleen server-side loggen — provider-foutmeldingen kunnen
    // modelnamen/interne details bevatten en horen niet bij de client.
    console.error('AI categorization failed:', err)
    return Response.json(
      { error: 'AI-categorisatie is tijdelijk niet beschikbaar. Probeer het later opnieuw.' },
      { status: 500 },
    )
  }

  // Positional mapping: result[i] corresponds to batch[i]. Een door het model
  // geretourneerde slug valideren we tegen de set daadwerkelijk aangeboden slugs;
  // onbekend → nette degradatie naar budget_id null (output-shape ongewijzigd).
  const results = batch.map((tx, i) => {
    const cat = object.categorizations[i]
    if (!cat) return { import_hash: tx.import_hash, budget_slug: null, budget_id: null, confidence: 0, reasoning: '' }
    const validSlug = resolveSlug(cat.budget_slug, validSlugs)
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
