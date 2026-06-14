// lib/household-type.ts
//
// Single source of truth voor het huishoudtype en de afgeleide "heeft fiscaal
// partner"-vlag. Vóór deze module leidden minstens 6 plekken `hasPartner` zelf
// af door `household_type` te vergelijken met de VEROUDERDE woordenschat
// `'samenwonend'`/`'getrouwd'`. De canonieke `household_type`-waarden zijn echter
// `'solo' | 'samen' | 'gezin'` (gevalideerd in onboarding). Het gevolg: voor
// élke partner-huishouding was `hasPartner` foutief `false` → te lage Box 3-
// vrijstelling, verkeerde FIRE-projectie en gezondheidsscore. Deze helper
// centraliseert de afleiding zodat hij nooit meer kan divergeren.
//
// "Consume, don't recompute": niemand mag `household_type → hasPartner` opnieuw
// inline implementeren — importeer `hasPartner` uit dit bestand.
//
// LET OP: dit is NIET het AOW-`leefsituatie`-enum
// (`'alleenstaand' | 'samenwonend'`) dat de AOW-uitkeringshoogte bepaalt. Dat is
// een aparte, legitieme as en blijft ongemoeid.

/** Canonieke huishoudtypen zoals gevalideerd in onboarding. */
export type HouseholdType = 'solo' | 'samen' | 'gezin'

/** De geldige canonieke huishoudtypen (voor validatie/iteratie). */
export const VALID_HOUSEHOLD_TYPES: readonly HouseholdType[] = ['solo', 'samen', 'gezin']

/**
 * Of het huishouden een fiscaal partner heeft. `true` voor `'samen'` en
 * `'gezin'` (de canonieke partner-typen).
 *
 * Defensief accepteren we OOK de verouderde waarden `'samenwonend'`/`'getrouwd'`
 * zodat eventuele oude DB-rijen, seeds of testdata die nog niet gemigreerd zijn
 * blijven werken — een gemigreerd profiel levert hetzelfde resultaat als de
 * legacy-string die het ooit was. Een onbekende/ontbrekende waarde (incl.
 * `'solo'`/`'alleenstaand'`) → `false`.
 */
export function hasPartner(householdType: string | null | undefined): boolean {
  return (
    householdType === 'samen' ||
    householdType === 'gezin' ||
    // Back-compat: verouderde woordenschat (mag nooit in nieuwe data, maar
    // beschermt tegen stale rijen). Dit is DE enige toegestane plek voor de
    // legacy household_type-vocabulaire; de no-restricted-syntax-guard verbiedt
    // 'm overal elders (zie eslint.config.mjs).
    // eslint-disable-next-line no-restricted-syntax -- legacy back-compat, enkel hier toegestaan
    householdType === 'samenwonend' || householdType === 'getrouwd'
  )
}
