import { gone } from '@/lib/api/respond'

/**
 * POST /api/feedback — GESLOTEN (ADR 0096).
 *
 * Melden loopt sinds 9 aug 2026 uitsluitend via de meldmodus in het gesprek
 * met Fin (`POST /api/user-reports`): zod-validatie, 5 meldingen per rollend
 * uur, optioneel scherm, en doorstroom naar de werkqueue. Dit endpoint schreef
 * naar de tabel `feedback` — een tweede inbox die niemand structureel las.
 *
 * De route blijft bestaan en antwoordt bewust met **410 Gone** in plaats van
 * 404: een 404 leest als defect en lokt een bugmelding uit. De tabel `feedback`
 * en `/beheer/feedback` blijven ongemoeid als historisch archief (de tabel zit
 * in de AVG-export via `lib/user-data-tables.ts` en heeft geen eigen-rij
 * DELETE-policy).
 *
 * Er wordt hier bewust NIETS meer gelezen of geschreven — ook geen eigen
 * auth-check: een gesloten endpoint hoort geen datapad meer te hebben dat
 * beschermd moet worden. In de praktijk zie je 410 dus als je ingelogd bent;
 * uitgelogd geeft de proxy (`lib/supabase/proxy.ts`, prefix `/api/`) eerst een
 * 401 — beide zonder datapad. `/api/feedback` hoort daarom NIET in
 * `publicPaths`: publiek maken zou een inerte route onnodig blootstellen.
 */
export async function POST() {
  return gone(
    'Melden gaat nu vanuit je gesprek met Fin: open de chat en tik op de megafoon.',
  )
}
