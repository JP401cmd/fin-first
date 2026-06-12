import { z } from 'zod'
import { tool } from 'ai'
import { calculateFreedomTime, dailyExpenseRate } from '@/lib/format'

/**
 * Tool that calculates freedom days for a given euro amount.
 * Uses the user's actual daily expenses for accurate conversion.
 */
export const freedomCalcTool = tool({
  description:
    'Bereken hoeveel dagen vrijheid een bedrag in euro vertegenwoordigt op basis van de dagelijkse uitgaven van de gebruiker. Gebruik dit om bedragen te vertalen naar vrijheidstijd. ' +
    'NOEMER-KEUZE: geef bij voorkeur monthlyMustExpenses door (essentiële maanduitgaven) — dat is de FIRE-grondslag en de juiste noemer voor "hoeveel vrijheid koop ik". ' +
    'Gebruik monthlyExpenses (totale maanduitgaven) alleen als fallback wanneer de must-uitgaven niet in de context staan. Pak beide waarden letterlijk uit de gebruikerscontext, verzin ze niet.',
  inputSchema: z.object({
    amount: z.number().describe('Het bedrag in euro om te vertalen naar vrijheidsdagen'),
    monthlyMustExpenses: z.number().optional().describe('Maandelijkse must-uitgaven (essentiële kosten) van de gebruiker — de voorkeurs-noemer (FIRE-grondslag). Gebruik de waarde uit de context. Geen default.'),
    monthlyExpenses: z.number().optional().describe('Fallback-noemer: totale maandelijkse uitgaven als must-uitgaven niet beschikbaar zijn.'),
  }),
  execute: async ({ amount, monthlyMustExpenses, monthlyExpenses }) => {
    const monthly = monthlyMustExpenses ?? monthlyExpenses
    if (!monthly) {
      return { error: 'Geen uitgavendata beschikbaar om vrijheidsdagen te berekenen.' }
    }
    // Canonieke dagtarief- en breakdown-conversie (jaar/365) via de gedeelde helpers.
    const dailyExpense = dailyExpenseRate(monthly)
    const bd = calculateFreedomTime(amount, dailyExpense)
    const { years, months, days } = bd
    const freedomDays = bd.totalDays

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
