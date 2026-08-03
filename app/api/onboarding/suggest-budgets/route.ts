import { generateObject } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { getModel, AIConfigError } from '@/lib/ai/config'
import { checkTierGate } from '@/lib/require-tier'
import { assertCloudAllowed } from '@/lib/ai/privacy-gate'
import { sanitizeForAI } from '@/lib/ai/sanitize'
import {
  budgetSuggestionSchema,
  buildBudgetSuggestionPrompt,
} from '@/lib/ai/schemas/budget-suggestion-schema'
import { unauthorized, forbidden, serverError } from '@/lib/api/respond'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return unauthorized()
  }

  // PRIVÉ-MODUS EERST — vóór de tier-gate, de credit-gate en élke dataophaling.
  // Staat 'documenten' op lokaal, dan stelt de browser de budgetbedragen zelf
  // voor en hoort deze route niets te leveren.
  // Waarom deze volgorde: (1) privé-modus is de meest fundamentele keuze van de
  // gebruiker en gaat vóór commerciële gating — de eerlijke reden is "privé-modus
  // staat aan", niet "je mist een abonnement"; (2) een geblokkeerde call mag geen
  // credits kosten; (3) er mag niets richting promptopbouw gaan: het gaat hier om
  // netto maandinkomen, gezinssamenstelling én een vrije tekst over de eigen
  // situatie — dus ook vóór het ophalen van het budgetplan hieronder.
  // Nooit een stille terugval naar de cloud: 403 is het eindpunt.
  const privacyGate = await assertCloudAllowed(supabase, user.id, 'documenten')
  if (privacyGate) return privacyGate

  const tierGate = await checkTierGate(supabase, user.id, 'ai')
  if (tierGate) {
    return forbidden(tierGate.error)
  }

  const body = await req.json()
  const { netMonthlyIncome, householdType, numberOfChildren, context } = body

  if (!netMonthlyIncome || netMonthlyIncome <= 0) {
    return Response.json({ error: 'Netto maandinkomen is verplicht' }, { status: 400 })
  }

  // The free-text `context` is user content — strip generic PII (IBAN/e-mail/
  // phone/address/BSN) before it reaches the AI provider. Numbers/percentages
  // stay so the budget maths is unaffected.
  const safeContext = typeof context === 'string' ? sanitizeForAI(context) : context

  let model
  try {
    model = await getModel(supabase, 'budget_suggesties')
  } catch (err) {
    if (err instanceof AIConfigError) {
      // eslint-disable-next-line no-restricted-syntax -- rauwe error.message: zie [Arch F4] API-error-envelope
      return Response.json({ error: `AI niet geconfigureerd: ${err.message}` }, { status: 503 })
    }
    return Response.json({ error: 'AI model kon niet worden geladen' }, { status: 500 })
  }

  // Plan-bewust: verdeel alleen over de categorieën uit het budgetplan dat de
  // gebruiker daadwerkelijk heeft (actieve child-budgetten). Valt in de prompt
  // terug op de volledige standaardlijst als er (nog) geen plan is.
  const { data: budgetRows } = await supabase
    .from('budgets')
    .select('slug')
    .not('parent_id', 'is', null)
    .eq('is_archived', false)
    .order('sort_order', { ascending: true })
  const planSlugs = (budgetRows ?? [])
    .map((b) => b.slug)
    .filter((s): s is string => typeof s === 'string' && s.length > 0)

  try {
    const result = await generateObject({
      model,
      schema: budgetSuggestionSchema,
      system: buildBudgetSuggestionPrompt(
        netMonthlyIncome,
        householdType ?? 'solo',
        numberOfChildren ?? 0,
        safeContext,
        planSlugs,
      ),
      prompt: 'Genereer realistische maandelijkse budgetbedragen voor dit huishouden.',
    })

    // Convert array to Record<slug, amount>
    const amounts: Record<string, number> = {}
    for (const entry of result.object.amounts) {
      amounts[entry.slug] = entry.amount
    }

    return Response.json({
      amounts,
      tokenUsage: {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        totalTokens: (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0),
      },
    })
  } catch (err) {
    return serverError(err, 'suggest-budgets:POST')
  }
}
