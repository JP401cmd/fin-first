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
    monthlyMustExpenses: z.number().optional().describe('Maandelijkse must-uitgaven (essentiële kosten) van de gebruiker. Gebruik de waarde uit de context. Geen default — gebruik de juiste waarde uit de gebruikerscontext.'),
    monthlyExpenses: z.number().optional().describe('Fallback: totale maandelijkse uitgaven als must-uitgaven niet beschikbaar zijn.'),
  }),
  execute: async ({ amount, monthlyMustExpenses, monthlyExpenses }) => {
    const monthly = monthlyMustExpenses ?? monthlyExpenses
    if (!monthly) {
      return { error: 'Geen uitgavendata beschikbaar om vrijheidsdagen te berekenen.' }
    }
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
