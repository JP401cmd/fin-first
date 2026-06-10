import { generateObject } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { getModel, AIConfigError } from '@/lib/ai/config'
import { checkTierGate } from '@/lib/require-tier'
import {
  budgetSuggestionSchema,
  buildBudgetSuggestionPrompt,
} from '@/lib/ai/schemas/budget-suggestion-schema'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tierGate = await checkTierGate(supabase, user.id, 'ai')
  if (tierGate) {
    return Response.json({ error: tierGate.error }, { status: 403 })
  }

  const body = await req.json()
  const { netMonthlyIncome, householdType, numberOfChildren, context } = body

  if (!netMonthlyIncome || netMonthlyIncome <= 0) {
    return Response.json({ error: 'Netto maandinkomen is verplicht' }, { status: 400 })
  }

  let model
  try {
    model = await getModel(supabase)
  } catch (err) {
    if (err instanceof AIConfigError) {
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
        context,
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
    console.error('Budget suggestion AI failed:', err)
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return Response.json({ error: `AI-suggestie mislukt: ${message}` }, { status: 500 })
  }
}
