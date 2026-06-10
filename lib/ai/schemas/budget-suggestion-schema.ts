import { z } from 'zod'
import { BUDGET_SLUGS } from '@/lib/budget-data'

export const budgetSuggestionSchema = z.object({
  amounts: z.array(
    z.object({
      slug: z.string().describe('The budget slug identifier'),
      amount: z.number().describe('Suggested monthly amount in euros (0 or positive)'),
    }),
  ).describe('Suggested monthly amounts per budget category'),
})

export type BudgetSuggestionOutput = z.infer<typeof budgetSuggestionSchema>

export function buildBudgetSuggestionPrompt(
  netMonthlyIncome: number,
  householdType: string,
  numberOfChildren: number,
  context?: string,
  planSlugs?: string[],
): string {
  // De categorieën komen volledig uit het budgetplan van de gebruiker — er is
  // geen hardgecodeerde standaardlijst. Zonder plan (bv. de preview op
  // /beheer/prompts) tonen we een placeholder i.p.v. een categorielijst.
  const hasPlan = !!planSlugs && planSlugs.length > 0
  const hasIncomeSlug = hasPlan ? planSlugs!.includes(BUDGET_SLUGS.SALARIS_UITKERING) : true
  const categoryBlock = hasPlan
    ? planSlugs!.map((s) => `  - "${s}"`).join('\n')
    : '  {de child-slugs uit het budgetplan van de gebruiker worden hier ingevuld}'

  return `Je bent een Nederlandse financiele adviseur. Verdeel het netto maandinkomen van een huishouden over de budgetcategorieen die in het budgetplan van de gebruiker staan.

HUISHOUDEN:
- Netto maandinkomen: €${netMonthlyIncome}
- Huishoudtype: ${householdType === 'solo' ? 'Alleenstaand' : householdType === 'samen' ? 'Samenwonend/getrouwd' : `Gezin met ${numberOfChildren} kinderen`}
${context ? `- Extra context van gebruiker: ${context}` : ''}

REGELS:
1. De som van alle UITGAVEN-categorieën + SPAREN + SCHULDEN moet het netto inkomen NIET overschrijden.
${hasIncomeSlug ? '2. Het inkomen-slug "salaris-uitkering" = het volledige netto inkomen tenzij er toeslagen/overig bijkomen.\n' : ''}3. Wees realistisch voor Nederland in 2026. Gebruik NIBUD-richtlijnen als referentie.
4. Als huishoudtype "solo", zet kinderen-gerelateerde categorieën op 0.
5. Als geen auto-context vermeld, houd auto-kosten laag of op 0.
6. Sparen + investeren minimaal 10% van inkomen als het budget het toelaat.
7. Geef ALLEEN bedragen voor de volgende categorieën uit het budgetplan van de gebruiker. Verzin GEEN categorieën daarbuiten en sla geen categorie uit deze lijst over:
${categoryBlock}

Retourneer een amounts array met voor elke categorie uit bovenstaande lijst een bedrag.`
}
