/**
 * Box 3-methode — de ene keuze die bepaalt hoe de horizon-kernel de Box 3-heffing
 * in de projectie rekent (selector P!B90, `lib/horizon-kernel/tables/bel.ts`):
 *
 *   - `forfaitair` — heffing = tarief × fictief (forfaitair) rendement over de
 *     grondslag (spaar-/beleggings-/schuldforfaits uit `BOX3_PARAMS`), boven het
 *     heffingvrije vermogen. Wat de bezittingen werkelijk opbrengen speelt geen rol.
 *   - `werkelijk` — heffing = tarief × het werkelijk behaalde rendement van de
 *     Box 3-bezittingen min de rente op Box 3-schulden, boven een heffingvrij
 *     inkomen; een verliesmaand telt als 0 (geen verliesverrekening).
 *
 * Dit bestand is de ENIGE home voor de enum-lijst en de gebruikerslabels, zodat de
 * API (zod), het voorkeurenscherm en de rapporten dezelfde twee waarden en dezelfde
 * woorden gebruiken (TPR-10). Het type zelf woont in `lib/bucket-projection.ts`
 * (`Box3Method`) en spiegelt de kernel-`Box3Method` in `lib/horizon-kernel/types.ts`.
 */

import type { Box3Method } from './bucket-projection'

/** De geldige waarden, in weergavevolgorde (wettelijke methode eerst). */
export const BOX3_METHODS = ['forfaitair', 'werkelijk'] as const satisfies readonly Box3Method[]

/** Korte naam per methode — kaartwaarde en rapportregel. */
export const BOX3_METHOD_LABELS: Record<Box3Method, string> = {
  forfaitair: 'Forfaitair',
  werkelijk: 'Werkelijk rendement',
}

/** Type-guard voor rauwe DB-/API-waarden. */
export function isBox3Method(value: unknown): value is Box3Method {
  return typeof value === 'string' && (BOX3_METHODS as readonly string[]).includes(value)
}
