import { z } from 'zod'
import { tool } from 'ai'

/**
 * Tool that allows the AI to suggest a life event the user can add to the what-if scenario.
 * Does NOT save to DB — the suggestion is rendered as a clickable card in the what-if chat.
 * The user confirms by clicking, which adds it to the scenario simulation.
 */
export const suggestLifeEventTool = tool({
  description:
    'Stel een levensgebeurtenis voor die de gebruiker kan toevoegen aan het wat-als scenario. ' +
    'Gebruik dit wanneer de gebruiker praat over toekomstplannen zoals kinderen, verhuizen, sabbatical, etc. ' +
    'Het event wordt getoond als een klikbare kaart. De gebruiker kan het dan toevoegen aan de simulatie.',
  inputSchema: z.object({
    event_type: z.string().describe(
      'Type uit LIFE_EVENT_CATALOG: sabbatical, world_trip, children, renovation, study, career_change, part_time, early_retirement, house_purchase, house_sale, wedding, move, car_purchase, inheritance, side_hustle, werkloosheid, schenking, overlijden_partner, scheiding, begrafenis, custom'
    ),
    name: z.string().describe('Beschrijvende naam voor het event (bijv. "Eerste kind", "Verbouwing keuken")'),
    target_age: z.number().nullable().describe('Leeftijd waarop het event plaatsvindt'),
    one_time_cost: z.number().describe('Eenmalige kosten in euro (positief getal)'),
    monthly_cost_change: z.number().describe('Maandelijkse kostenwijziging in euro'),
    monthly_income_change: z.number().describe('Maandelijkse inkomenswijziging in euro (negatief = minder inkomen)'),
    duration_months: z.number().describe('Duur in maanden (0 = eenmalig)'),
    explanation: z.string().describe('Korte toelichting over de financiële impact'),
  }),
  execute: async (args) => ({ ...args }),
})
