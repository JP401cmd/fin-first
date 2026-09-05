import { z } from 'zod'
import { tool } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * suggestRecommendation — Fin-tool die ÉÉN voorstel aan de gebruiker
 * toont, persistent opgeslagen in de `recommendations`-tabel als
 * status='pending'. De chat rendert een kaart met drie expliciete
 * knoppen (Accepteer / Uitstel / Wijs af). Niks doen = chat sluit met
 * een onbeantwoorde recommendation → trigger expire (zie chat-panel).
 *
 * Plan §6.6: voorstellen leven enkel nog in de chat, één tegelijk. De
 * DB-rij blijft bestaan voor anti-duplicaat (Fin mag eerder
 * accepted/rejected/expired voorstellen niet opnieuw doen) en als
 * audit-trail van wat Fin aanraadde.
 *
 * Geaccepteerd voorstel → /api/ai/recommendations/[id] met action:'accept'
 * inserteert automatisch de bijhorende actions (bestaande flow).
 */

const RECOMMENDATION_TYPES = [
  'budget_optimization',
  'asset_reallocation',
  'debt_acceleration',
  'income_increase',
  'savings_boost',
] as const

const SUGGESTED_ACTION_SCHEMA = z.object({
  title: z.string().describe('Korte actiegerichte titel'),
  description: z.string().optional().describe('1 zin toelichting'),
  freedom_days_impact: z.number().describe('Schatting vrijheidsdagen per jaar'),
  euro_impact_monthly: z.number().optional().describe('Schatting €/maand effect'),
})

/**
 * Wft-grendel voor tip-tekst (bevinding UR3-03 #3): de DNA-tekst in
 * lib/ai/dna/base.ts/wil.ts verbiedt al productnamen en bedrag-als-opdracht,
 * maar had géén mechanische afdwinging op dít tool-schema — precies waar
 * "Beleg € 50.000 via je Meesman-portefeuille" doorheen glipte. Zusje van de
 * grendel op statische copy in lib/wft-copy-guard.test.ts (die AI-chat-output
 * expliciet buiten scope had). Bewust kort en letterlijk, zoals daar: een
 * breed lexicon geeft vals alarm op legitieme tip-tekst.
 */
const WFT_VERBODEN_IN_TIP: { patroon: RegExp; waarom: string }[] = [
  {
    patroon: /\bIndepender\b|\bHypotheker\b|\bMeesman\b|\bBrand New Day\b|\bDeGiro\b|\bTrading\s?212\b|\bBux\b/i,
    waarom: 'noemt een specifieke aanbieder of product',
  },
  {
    patroon: /\b(beleg|stort|koop|verkoop|zet)\w*\s+(al\s+)?€\s?[\d.,]/i,
    waarom: 'geeft een bedrag als opdracht in plaats van als afweging',
  },
]

function toetsWftVeilig(val: {
  title: string
  description: string
  suggested_actions: { title: string; description?: string }[]
}, ctx: z.RefinementCtx) {
  const velden: [string[], string | undefined][] = [
    [['title'], val.title],
    [['description'], val.description],
    ...val.suggested_actions.flatMap((a, i) => [
      [['suggested_actions', String(i), 'title'], a.title],
      [['suggested_actions', String(i), 'description'], a.description],
    ] as [string[], string | undefined][]),
  ]
  for (const [path, tekst] of velden) {
    if (!tekst) continue
    for (const { patroon, waarom } of WFT_VERBODEN_IN_TIP) {
      if (patroon.test(tekst)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `Wft-grens: ${waarom} ("${tekst}"). Beschrijf de afweging of het effect, noem geen aanbieder/product en geef geen bedrag als opdracht.`,
        })
      }
    }
  }
}

export function createSuggestRecommendationTool(supabase: SupabaseClient, userId: string) {
  return tool({
    description:
      'Stel ÉÉN concrete optimalisatie voor aan de gebruiker en sla op als pending recommendation. ' +
      'De gebruiker kan in de chat Accepteren (creëert acties), Uitstellen (later terug) of Afwijzen. ' +
      'Gebruik MAX één keer per gesprekstap; voor losse actie-suggesties zonder voorstel-context gebruik suggestAction.',
    inputSchema: z
      .object({
        title: z.string().describe('Korte aansprekende titel (bijv. "Versnel hypotheekaflossing met 10%")'),
        description: z.string().describe('2–3 zinnen: wat, waarom en welk effect'),
        recommendation_type: z.enum(RECOMMENDATION_TYPES).describe('Type categorie'),
        euro_impact_monthly: z.number().optional().describe('Schatting €/maand effect'),
        euro_impact_yearly: z.number().optional().describe('Schatting €/jaar effect'),
        freedom_days_per_year: z.number().describe('Schatting vrijheidsdagen per jaar'),
        priority_score: z.number().min(1).max(5).optional().describe('Prioriteit 1–5'),
        suggested_actions: z
          .array(SUGGESTED_ACTION_SCHEMA)
          .min(1)
          .max(3)
          .describe('1–3 concrete uitvoer-stappen die ontstaan na acceptatie'),
      })
      .superRefine(toetsWftVeilig),
    execute: async (args) => {
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('recommendations')
        .insert({
          user_id: userId,
          title: args.title,
          description: args.description,
          recommendation_type: args.recommendation_type,
          euro_impact_monthly: args.euro_impact_monthly ?? null,
          euro_impact_yearly: args.euro_impact_yearly ?? null,
          freedom_days_per_year: args.freedom_days_per_year,
          priority_score: args.priority_score ?? 3,
          suggested_actions: args.suggested_actions,
          status: 'pending',
          created_at: now,
          updated_at: now,
        })
        .select('id, title, description, recommendation_type, euro_impact_monthly, euro_impact_yearly, freedom_days_per_year, priority_score, suggested_actions, status')
        .single()

      if (error || !data) {
        return {
          error: true,
          message: 'Voorstel kon niet worden opgeslagen.',
        } as const
      }

      return {
        id: data.id,
        title: data.title,
        description: data.description,
        recommendation_type: data.recommendation_type,
        euro_impact_monthly: data.euro_impact_monthly,
        euro_impact_yearly: data.euro_impact_yearly,
        freedom_days_per_year: data.freedom_days_per_year,
        priority_score: data.priority_score,
        suggested_actions: data.suggested_actions,
      } as const
    },
  })
}

export type SuggestRecommendationResult = {
  id: string
  title: string
  description: string
  recommendation_type: string
  euro_impact_monthly: number | null
  euro_impact_yearly: number | null
  freedom_days_per_year: number
  priority_score: number
  suggested_actions: Array<{
    title: string
    description?: string
    freedom_days_impact: number
    euro_impact_monthly?: number
  }>
}
