/**
 * Server-zijde van de variantensweep: bouwt de serialiseerbare
 * `VariantenSweepSnapshot` die de CLIENT gebruikt om de drie kernel-runs te doen.
 *
 * Spiegel van het `RegelSimSnapshot`-patroon (`lib/future/regel-sim.ts` +
 * `dashboard-data-loader`): de server levert uitsluitend INVOER, geen uitkomst. Er
 * draait hier dus GEEN variantensweep — de drie solves horen achter een expliciete
 * gebruikersactie, off-main-thread in de kernel-worker.
 *
 * ## Kosten, expliciet
 * `computeHorizonFireSim` is React-`cache()`'d: op een oppervlak dat de Horizon-run
 * al deed (bv. /overzicht) is deze snapshot GRATIS. Op een oppervlak dat 'm nog niet
 * deed (de fiscale optimizer) kost hij één horizon-load + één kernel-solve — de
 * canonieke run, niet een tweede motor. Dat is bewust: de snapshot MOET dezelfde
 * rauwe context dragen als het plan dat de gebruiker elders ziet, anders vergelijkt
 * de sweep varianten van een ander plan.
 *
 * Deze module is server-only (Supabase + React `cache`) en wordt daarom NOOIT door
 * `varianten-sweep.ts` geïmporteerd — die blijft puur/worker-veilig.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Box1TaxYear } from '@/lib/box1-tax'
import { computeHorizonFireSim } from '@/lib/fire-target-shared'
import type { VariantenSweepSnapshot } from './varianten-sweep'

/**
 * Bouw de sweep-snapshot uit de canonieke Horizon-run. `null` wanneer die run niet
 * mogelijk is (geen geboortedatum, geen profielrij, kern-fout) — het aanroepende
 * oppervlak toont dan zijn lege staat en biedt de sweep niet aan.
 *
 * @param box1Jaar - optioneel Box 1-tariefjaar; afwezig → `CURRENT_TAX_YEAR` in de
 *   sweep zelf (in lockstep met de rest van de belastinglaag).
 */
export async function loadVariantenSweepSnapshot(
  supabase: SupabaseClient,
  box1Jaar?: Box1TaxYear,
): Promise<VariantenSweepSnapshot | null> {
  const run = await computeHorizonFireSim(supabase)
  if (!run) return null
  return {
    rawContext: run.rawContext,
    // De AOW-leeftijd komt UIT de run (dezelfde die de kernel-adapter gebruikte);
    // deze laag leidt 'm nooit zelf af — dat zou een tweede bron zijn.
    aowLeeftijd: run.aowAgeFractional,
    ...(box1Jaar ? { box1Jaar } : {}),
  }
}
