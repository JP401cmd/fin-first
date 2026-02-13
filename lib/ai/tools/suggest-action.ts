import { z } from 'zod'
import { tool } from 'ai'

/**
 * Tool that allows the AI to suggest an action the user can add to their plan.
 * Does NOT save to DB — the suggestion is rendered as a clickable card in chat.
 * The user confirms by clicking, which creates the action.
 */
export const suggestActionTool = tool({
  description:
    'Stel een concrete actie voor die de gebruiker kan toevoegen aan het actieplan. ' +
    'Gebruik dit wanneer je een optimalisatie-kans identificeert of de gebruiker om advies vraagt. ' +
    'De actie wordt getoond als een klikbare kaart in de chat. De gebruiker kan het dan inplannen en bewerken.',
  inputSchema: z.object({
    title: z.string().describe('Korte, actiegerichte titel (bijv. "Wissel energieleverancier")'),
    description: z.string().optional().describe('Korte toelichting van wat de gebruiker moet doen'),
    freedom_days_impact: z.number().describe('Geschatte impact in vrijheidsdagen per jaar'),
    euro_impact_monthly: z.number().optional().describe('Geschatte maandelijkse euro-impact'),
    priority_score: z.number().optional().describe('Prioriteit 1-5 (5 = hoogst)'),
  }),
  execute: async (args) => {
    // Return the suggestion data for display — not saved to DB yet
    return {
      title: args.title,
      description: args.description ?? null,
      freedom_days_impact: args.freedom_days_impact,
      euro_impact_monthly: args.euro_impact_monthly ?? null,
      priority_score: args.priority_score ?? 3,
    }
  },
})
