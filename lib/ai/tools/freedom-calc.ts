import { z } from 'zod'
import { tool } from 'ai'

/**
 * Tool that calculates freedom days for a given euro amount.
 * Uses the user's actual daily expenses for accurate conversion.
 */
export const freedomCalcTool = tool({
  description: 'Bereken hoeveel dagen vrijheid een bedrag in euro vertegenwoordigt op basis van de dagelijkse uitgaven van de gebruiker. Gebruik dit om bedragen te vertalen naar vrijheidstijd.',
  inputSchema: z.object({
    amount: z.number().describe('Het bedrag in euro om te vertalen naar vrijheidsdagen'),
    monthlyExpenses: z.number().optional().describe('Optioneel: maandelijkse uitgaven om dagprijs te berekenen (default: €2.510)'),
  }),
  execute: async ({ amount, monthlyExpenses }) => {
    const monthly = monthlyExpenses ?? 2510
    const yearlyExpenses = monthly * 12
    const dailyExpense = yearlyExpenses / 365

    const freedomDays = amount / dailyExpense
    const years = Math.floor(freedomDays / 365)
    const months = Math.floor((freedomDays % 365) / 30)
    const days = Math.round(freedomDays % 30)

    return {
      amount,
      dailyExpense: Math.round(dailyExpense * 100) / 100,
      freedomDays: Math.round(freedomDays * 10) / 10,
      breakdown: { years, months, days },
      formatted: years > 0
        ? `${years} jaar, ${months} maanden en ${days} dagen`
        : months > 0
          ? `${months} maanden en ${days} dagen`
          : `${days} dagen`,
    }
  },
})
