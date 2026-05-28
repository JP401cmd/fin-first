import { z } from 'zod'
import { tool } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * suggestRecommendation — Will-tool die ÉÉN voorstel aan de gebruiker
 * toont, persistent opgeslagen in de `recommendations`-tabel als
 * status='pending'. De chat rendert een kaart met drie expliciete
 * knoppen (Accepteer / Uitstel / Wijs af). Niks doen = chat sluit met
 * een onbeantwoorde recommendation → trigger expire (zie chat-panel).
 *
 * Plan §6.6: voorstellen leven enkel nog in de chat, één tegelijk. De
 * DB-rij blijft bestaan voor anti-duplicaat (Will mag eerder
 * accepted/rejected/expired voorstellen niet opnieuw doen) en als
 * audit-trail van wat Will aanraadde.
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

export function createSuggestRecommendationTool(supabase: SupabaseClient, userId: string) {
  return tool({
    description:
      'Stel ÉÉN concrete optimalisatie voor aan de gebruiker en sla op als pending recommendation. ' +
      'De gebruiker kan in de chat Accepteren (creëert acties), Uitstellen (later terug) of Afwijzen. ' +
      'Gebruik MAX één keer per gesprekstap; voor losse actie-suggesties zonder voorstel-context gebruik suggestAction.',
    inputSchema: z.object({
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
    }),
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
