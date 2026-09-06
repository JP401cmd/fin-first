/**
 * Canonieke DAGELIJKS-INKOMEN-bron (€/dag bruto) — de noemer van elke
 * WERKTIJD-claim in de app.
 *
 * ── Waarom deze module bestaat (ADR 0105) ───────────────────────────────────
 * Dit is de inkomens-tegenhanger van `lib/expense-rate.ts`. Waar dát bestand het
 * canonieke UITGAVEN-dagtarief levert (de noemer van "hoeveel dagen leven koopt
 * dit bedrag" = VRIJHEIDSTIJD), levert dit bestand het canonieke BRUTO
 * INKOMEN-dagtarief (de noemer van "welk deel van mijn werkjaar gaat hier
 * naartoe" = WERKTIJD, `lib/work-time.ts`).
 *
 * Vóór deze bron bestond er géén dagelijks-inkomen-tarief: twee oppervlakken
 * gebruikten het uitgaven-dagtarief mét werktijd-taal, waardoor hun claims samen
 * op achttien maanden per jaar uitkwamen (bevinding C5). Werktijd hoort op het
 * inkomen te delen; dan zijn de claims delen van dezelfde taart.
 *
 * ── Eén grondslag, geen tweede afleiding ────────────────────────────────────
 * Het bruto jaarinkomen komt UITSLUITEND uit `resolveBox1GrossIncome`
 * (lib/box1-income.ts) — de canonieke bruto Box 1-grondslag van ADR 0086:
 * handmatige `profiles.box1_gross_income`-override wint, anders het effectieve
 * netto jaarinkomen (ADR 0103) via de schijfinversie `grossFromNet`. Dezelfde
 * bron die de belasting-hub, /overzicht/belasting/box1 en de fiscale optimizer
 * gebruiken. Hier wordt NIETS opnieuw afgeleid: wie een tweede weg naar bruto
 * inkomen inbouwt, herhaalt precies de fout die C5 opleverde.
 *
 * BEKENDE KOSTEN, bewust aanvaard: `resolveBox1GrossIncome` trekt via
 * `loadCashflowSettingsData` de `loadCoreData`-bundel binnen. Op de belasting-hub
 * is die al warm (de kansen-loader deed 'm) en is deze bron gratis; op
 * /overzicht/budget/vaste-lasten is het één extra PARALLELLE golf. Dat is
 * dezelfde koppeling die het aandachtspunt `bruto-box1-grondslag-meervoudig` al
 * registreert (opvolgactie: override-first met lazy estimate) — deze module voegt
 * er geen nieuwe koppeling aan toe, hij hangt aan de bestaande.
 *
 * SERVER-ONLY: importeert React `cache()` en de loader-keten. De PURE conversie
 * en formattering staan in `lib/work-time.ts`, zodat client-componenten die wél
 * kunnen importeren.
 */
import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveBox1GrossIncome } from '@/lib/box1-income'
import type { Box1TaxYear } from '@/lib/box1-tax'
import { DAYS_PER_YEAR } from '@/lib/constants'

export interface DailyIncomeRate {
  /** Bruto dagtarief in €/dag (bruto jaarinkomen / 365). 0 = geen basis. */
  dailyRate: number
  /** Het bruto jaarinkomen waarop het tarief staat. */
  grossYearlyIncome: number
  /** Herkomst: handmatige Box 1-override, afgeleide schatting, of geen inkomen. */
  source: 'manual' | 'estimate' | 'none'
}

/** Neutrale uitkomst: geen werkjaar-noemer bekend → oppervlakken tonen geen werktijd. */
export const EMPTY_DAILY_INCOME_RATE: DailyIncomeRate = {
  dailyRate: 0,
  grossYearlyIncome: 0,
  source: 'none',
}

/**
 * PURE conversie: bruto jaarinkomen → bruto €/dag.
 *
 * Deelt door 365, niet door 12×30 — exact dezelfde kalenderbasis als
 * `dailyExpenseRate` (lib/format.ts), zodat werktijd en vrijheidstijd op
 * dezelfde dag-eenheid staan en een lezer ze naast elkaar mag leggen.
 *
 * @param grossYearlyIncome - Bruto jaarinkomen in EUR (≤ 0 → 0 = geen basis).
 */
export function dailyIncomeRate(grossYearlyIncome: number): number {
  const safe =
    grossYearlyIncome == null ||
    typeof grossYearlyIncome !== 'number' ||
    !isFinite(grossYearlyIncome)
      ? 0
      : grossYearlyIncome
  if (safe <= 0) return 0
  return safe / DAYS_PER_YEAR
}

/**
 * PURE variant voor oppervlakken die het canonieke bruto jaarinkomen AL hebben
 * (de belasting-hub heeft het uit `loadFiscaleKansen.grossYearly`). Gebruik deze
 * i.p.v. een tweede DB-ronde; de grondslag is dezelfde.
 *
 * @param grossYearlyIncome - Bruto jaarinkomen uit de canonieke Box 1-grondslag.
 * @param isManual - True wanneer dat bedrag de handmatige override is.
 */
export function dailyIncomeRateFromGrossYearly(
  grossYearlyIncome: number,
  isManual = false,
): DailyIncomeRate {
  const rate = dailyIncomeRate(grossYearlyIncome)
  if (rate <= 0) return EMPTY_DAILY_INCOME_RATE
  return {
    dailyRate: rate,
    grossYearlyIncome,
    source: isManual ? 'manual' : 'estimate',
  }
}

/**
 * SERVER-bron: het canonieke bruto dagtarief voor de ingelogde gebruiker.
 *
 * `cache()`-gewrapt zodat meerdere oppervlakken binnen één render dezelfde
 * resolutie delen. `supabase` is RLS-gescoped; `userId` selecteert de profielrij
 * voor de handmatige override.
 */
export const getCanonicalDailyIncomeRate = cache(
  async (
    supabase: SupabaseClient,
    userId: string,
    year: Box1TaxYear = 2026,
  ): Promise<DailyIncomeRate> => {
    const resolution = await resolveBox1GrossIncome(supabase, userId, year)
    return dailyIncomeRateFromGrossYearly(resolution.grossYearly, resolution.isManual)
  },
)
