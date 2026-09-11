import { z } from 'zod'
import { tool } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateFreedomTime, formatFreedomRateFootnote } from '@/lib/format'
import { getRecentDailyExpenseRate, type RecentDailyExpenseRate } from '@/lib/expense-rate'

/**
 * freedomCalc — vertaalt een eurobedrag naar vrijheidstijd.
 *
 * ── Eén dagtarief overal (B-040) ────────────────────────────────────────────
 * Tot B-040 gaf het MODEL de noemer mee (`monthlyMustExpenses`, met
 * `monthlyExpenses` als terugval) en rekende de tool daar zelf ×12/365 op. Dat
 * gaf een tweede wisselkoers naast het scherm: op /overzicht/bezittingen stond
 * €251/dag, Fin rekende €1.250 om tegen ~€100/dag en zei "12,5 dagen" in plaats
 * van ~5. Het model levert nu ALLEEN het bedrag; het tarief leest de tool zelf,
 * server-side, uit exact de bron die /overzicht/bezittingen voedt:
 * `getRecentDailyExpenseRate(supabase, now)` (lib/assets-data-loader.ts), de
 * canonieke 12-maands consumptiegrondslag (ADR 0126 D1/D2, lib/expense-rate.ts).
 * Geen tweede berekening, geen profiel-schatting als terugval (de bezittingen-
 * pagina geeft er ook geen mee) en zeker geen terugval op must-uitgaven.
 *
 * Het schema is `strictObject`: een noemer die het model tóch meestuurt is een
 * invoerfout, geen stil genegeerd veld — zo kan hij niet onopgemerkt terugkeren.
 *
 * Factory per request (zelfde patroon als `createLookupTool`): de supabase-client
 * is de anon-RLS-client van de ingelogde gebruiker, dus de scoping is identiek
 * aan die van de bezittingen-pagina. Het tarief wordt binnen één request één
 * keer opgehaald, ook als het model de tool in meerdere stappen aanroept.
 */

export const freedomCalcInputSchema = z.strictObject({
  amount: z.number().describe('Het bedrag in euro om te vertalen naar vrijheidstijd'),
})

const NO_RATE_ERROR =
  'Er is nog geen dagtarief: er staan te weinig uitgaven in de app om bedragen in vrijheidstijd om te rekenen. ' +
  'Leg uit dat dit kan zodra er uitgaven (transacties) zijn geboekt; reken het NIET zelf uit met een andere noemer.'

const FETCH_ERROR = 'Het dagtarief kon nu niet worden opgehaald. Reken het bedrag NIET zelf om met een andere noemer.'

export function createFreedomCalcTool(supabase: SupabaseClient) {
  let ratePromise: Promise<RecentDailyExpenseRate> | null = null
  const loadRate = () => {
    // Zelfde aanroep als lib/assets-data-loader.ts: peildatum nu, geen terugval-schatting.
    ratePromise ??= getRecentDailyExpenseRate(supabase, new Date())
    return ratePromise
  }

  return tool({
    description:
      'Reken een bedrag in euro om naar vrijheidstijd (dagen/maanden/jaren) met het dagtarief van de gebruiker. ' +
      'Geef alleen het bedrag mee: de tool leest zelf hetzelfde dagtarief dat de app op de schermen toont ' +
      '(gemiddelde uitgaven van de afgelopen 12 maanden). Noem in je antwoord het gebruikte dagtarief uit het resultaat.',
    inputSchema: freedomCalcInputSchema,
    execute: async ({ amount }) => {
      let rate: RecentDailyExpenseRate
      try {
        rate = await loadRate()
      } catch (err) {
        ratePromise = null
        console.error('[ai-tool:freedomCalc] dagtarief ophalen mislukt', err)
        return { error: FETCH_ERROR }
      }

      if (!(rate.dailyRate > 0) || rate.source === 'none') {
        return { error: NO_RATE_ERROR }
      }

      const bd = calculateFreedomTime(amount, rate.dailyRate)
      const { years, months, days } = bd

      return {
        amount,
        dailyExpense: Math.round(rate.dailyRate * 100) / 100,
        rateSource: rate.source,
        rateExplanation: formatFreedomRateFootnote(rate.dailyRate, rate.source, false),
        freedomDays: Math.round(bd.totalDays * 10) / 10,
        isDeficit: bd.isDeficit,
        breakdown: { years, months, days },
        formatted: years > 0
          ? `${years} jaar, ${months} maanden en ${days} dagen`
          : months > 0
            ? `${months} maanden en ${days} dagen`
            : `${days} dagen`,
      }
    },
  })
}
