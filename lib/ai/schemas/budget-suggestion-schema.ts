import { z } from 'zod'
import { BUDGET_SLUGS } from '@/lib/budget-data'

/** All child budget slugs the AI should distribute amounts over */
const CHILD_SLUGS = [
  BUDGET_SLUGS.SALARIS_UITKERING,
  BUDGET_SLUGS.TOESLAGEN_KINDERBIJSLAG,
  BUDGET_SLUGS.TERUGGAVE_BELASTING,
  BUDGET_SLUGS.OVERIGE_INKOMSTEN,
  BUDGET_SLUGS.HUUR_HYPOTHEEK,
  BUDGET_SLUGS.GAS_WATER_LICHT,
  BUDGET_SLUGS.VERZEKERINGEN_WONEN,
  BUDGET_SLUGS.GEMEENTELIJKE_LASTEN,
  BUDGET_SLUGS.BOODSCHAPPEN,
  BUDGET_SLUGS.HUISHOUDEN_VERZORGING,
  BUDGET_SLUGS.KINDEREN_SCHOOL,
  BUDGET_SLUGS.MEDISCHE_KOSTEN,
  BUDGET_SLUGS.BRANDSTOF_OV,
  BUDGET_SLUGS.AUTO_VASTE_LASTEN,
  BUDGET_SLUGS.AUTO_ONDERHOUD,
  BUDGET_SLUGS.FIETS_DEELVERVOER,
  BUDGET_SLUGS.UIT_ETEN_HORECA,
  BUDGET_SLUGS.VRIJE_TIJD_SPORT,
  BUDGET_SLUGS.VAKANTIE,
  BUDGET_SLUGS.KLEDING_OVERIGE,
  BUDGET_SLUGS.SPAREN_NOODBUFFER,
  BUDGET_SLUGS.INVESTEREN_FIRE,
  BUDGET_SLUGS.SCHULDEN_AFLOSSINGEN,
  BUDGET_SLUGS.EXTRA_AFLOSSING_HYPOTHEEK,
] as const

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
): string {
  const childSlugsDesc = CHILD_SLUGS.map((s) => `  - "${s}"`).join('\n')

  return `Je bent een Nederlandse financiele adviseur. Verdeel het netto maandinkomen van een huishouden over budgetcategorieen.

HUISHOUDEN:
- Netto maandinkomen: €${netMonthlyIncome}
- Huishoudtype: ${householdType === 'solo' ? 'Alleenstaand' : householdType === 'samen' ? 'Samenwonend/getrouwd' : `Gezin met ${numberOfChildren} kinderen`}
${context ? `- Extra context van gebruiker: ${context}` : ''}

REGELS:
1. De som van alle UITGAVEN-categorieën + SPAREN + SCHULDEN moet het netto inkomen NIET overschrijden.
2. Het inkomen-slug "salaris-uitkering" = het volledige netto inkomen tenzij er toeslagen/overig bijkomen.
3. Wees realistisch voor Nederland in 2026. Gebruik NIBUD-richtlijnen als referentie.
4. Als huishoudtype "solo", zet kinderen-gerelateerde categorieën op 0.
5. Als geen auto-context vermeld, houd auto-kosten laag of op 0.
6. Sparen + investeren minimaal 10% van inkomen als het budget het toelaat.
7. Geef ALLEEN bedragen voor de volgende child-slugs:
${childSlugsDesc}

Retourneer een amounts array met voor elke slug een bedrag.`
}
