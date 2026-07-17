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

/**
 * NL-labels voor de canonieke huishoudtypen. Bewust `Record<HouseholdType, …>`
 * (geen losse `Record<string, string>`): breidt de canonieke set ooit uit, dan
 * geeft dit een COMPILE-fout i.p.v. stilzwijgend opnieuw te divergeren — exact
 * het defect dat de vorige (los in de rapportagelaag gedefinieerde) map had:
 * sleutels `single/partner/family/single_parent` matchten nooit de echte
 * waarden `solo/samen/gezin`, waardoor de ruwe string werd getoond.
 */
export const HOUSEHOLD_TYPE_LABELS: Record<HouseholdType, string> = {
  solo: 'Alleenstaand',
  samen: 'Samenwonend / getrouwd',
  gezin: 'Gezin met kinderen',
}

/**
 * Nette NL-labelweergave voor een (mogelijk ontbrekende of legacy)
 * `household_type`-waarde. Canonieke waarden → hun label; de verouderde
 * woordenschat `'samenwonend'`/`'getrouwd'` → hetzelfde label als `'samen'`
 * (dezelfde back-compat als `hasPartner()`); elke andere/ontbrekende waarde
 * (incl. de dode kolom-default `'single'` van vóór het 3-waardenschema) valt
 * veilig terug op `'Alleenstaand'` — nooit meer de ruwe databasewaarde.
 */
export function householdTypeLabel(householdType: string | null | undefined): string {
  if (householdType === 'solo' || householdType === 'samen' || householdType === 'gezin') {
    return HOUSEHOLD_TYPE_LABELS[householdType]
  }
  // Back-compat: verouderde woordenschat (zie hasPartner()). Enige toegestane
  // plek voor deze legacy-vocabulaire; de no-restricted-syntax-guard verbiedt
  // 'm overal elders (zie eslint.config.mjs).
  // eslint-disable-next-line no-restricted-syntax -- legacy back-compat, enkel hier toegestaan
  if (householdType === 'samenwonend' || householdType === 'getrouwd') {
    return HOUSEHOLD_TYPE_LABELS.samen
  }
  return HOUSEHOLD_TYPE_LABELS.solo
}
