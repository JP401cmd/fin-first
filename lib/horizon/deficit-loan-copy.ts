/**
 * Situatie-specifieke copy bij de tekort-lening-melding op /toekomst (pure).
 *
 * De detector (`lib/horizon/deficit-loan-display.ts`) levert alléén de feiten
 * `{ firstAge, peak }`. Deze module vertaalt die feiten — samen met de plan-
 * parameters uit dezélfde run — naar uitleg in gewone taal: wát er in DIT plan
 * gebeurt, waaróm, en met welke keuzes het getal meebeweegt.
 *
 * BEWUSTE SCHEIDING (spiegelt `lib/page-status/copy.ts`): de detector blijft
 * ongewijzigd en kent geen copy; deze module kent geen React, geen Supabase en
 * geen formattering van bedragen. Bedragen komen als RÉÉDS geformatteerde tekst
 * binnen (`peakText` / `freedomText`), zodat de canonieke helpers uit
 * `lib/format.ts` (`formatMaskedCurrency`, `formatWithFreedom`) en de
 * masked-modus in het component blijven wonen — en de copy tóch volledig
 * unit-testbaar is, inclusief de vrijheidstijd-variant.
 *
 * WFT-GRENS (toon-grendel): alle zinnen beschrijven een REKENUITKOMST. Geen
 * opdrachten ("je moet", "verhoog je"), geen aanbevelingen ("wij raden"), geen
 * beloftes ("gegarandeerd"). De knoppen-zin benoemt bewust wélke keuzes het
 * getal beïnvloeden als FEIT ("beweegt mee met"), niet wat je ermee zou moeten
 * doen. `deficit-loan-copy.test.ts` grendelt dit over álle plan-varianten.
 */

/**
 * Welke bovengrens de leenperiode in dit plan heeft:
 *  - 'tot-aow'   — de AOW-leeftijd ligt ná de eerste tekort-leeftijd; vóór AOW
 *    is er nog geen inkomen dat de uitgaven dekt (de klassieke pensioen-tak).
 *  - 'tot-einde' — geen AOW-leeftijd ná de eerste tekort-leeftijd; de periode
 *    loopt tot het einde van de projectie (de FIRE-tak, of een tekort dat pas
 *    ná AOW ontstaat).
 */
export type DeficitLoanPeriodVariant = 'tot-aow' | 'tot-einde'

export interface DeficitLoanCopyInput {
  /** Eerste leeftijd met een aangesproken tekort-lening (uit de detector). */
  firstAge: number
  /** AOW-leeftijd van de gebruiker (fractioneel), of null als onbekend. */
  aowAge: number | null
  /** Eindleeftijd die de run zélf hanteerde (`SimResult.displayEndAge`). */
  displayEndAge: number | null
  /** Draait het plan in pensioen-modus (i.p.v. de FIRE-tak)? */
  isPensioenMode: boolean
  /** Staat de eigen woning buiten de FIRE-pot (`exclude_from_fire`)? */
  homeExcludedFromFire: boolean
  /** Reeds geformatteerde piek (masked-aware), bv. "€ 42.000" of "•••". */
  peakText: string
  /** Reeds geformatteerde vrijheidstijd bij de piek, of null (masked/geen dagtarief). */
  freedomText: string | null
}

export interface DeficitLoanCopy {
  /** Welke bovengrens de periode-zin gebruikt. */
  variant: DeficitLoanPeriodVariant
  /** Kop-zin: de leenperiode in dit plan. */
  periode: string
  /** Waarom het model in die jaren bijleent. */
  waarom: string
  /** Woonstrategie-uitleg — alleen bij `exclude_from_fire`, anders null. */
  woning: string | null
  /** De piek, met vrijheidstijd-vertaling wanneer beschikbaar. */
  piek: string
  /** Waarom de vermogenslijn dit tekort niet laat zien. */
  lijn: string
  /** Welke keuzes dit getal beïnvloeden — feitelijk, geen advies. */
  knoppen: string
  /** App-brede disclaimer-conventie ("Indicatie, geen advies — …"). */
  disclaimer: string
}

/** Hele leeftijd, of null bij een niet-eindig getal. */
function wholeAge(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : null
}

/**
 * Bouw de situatie-specifieke uitleg bij een aangesproken tekort-lening.
 *
 * Alle getallen komen uit dezélfde run als de melding zelf — er wordt hier niets
 * herberekend en niets verzonnen.
 */
export function buildDeficitLoanCopy(input: DeficitLoanCopyInput): DeficitLoanCopy {
  const startAge = wholeAge(input.firstAge) ?? 0
  const aow = wholeAge(input.aowAge)
  const eind = wholeAge(input.displayEndAge)

  // De AOW-bovengrens is alleen zinvol als hij ná de eerste tekort-leeftijd ligt;
  // een tekort dát pas ná AOW ontstaat hoort bij de 'tot-einde'-lezing.
  const variant: DeficitLoanPeriodVariant =
    aow != null && aow > startAge ? 'tot-aow' : 'tot-einde'

  const periode =
    variant === 'tot-aow'
      ? `De leenperiode loopt van leeftijd ${startAge} tot je AOW-leeftijd (${aow}).`
      : eind != null
        ? `De leenperiode begint op leeftijd ${startAge} en loopt door tot het einde van je projectie (leeftijd ${eind}).`
        : `De leenperiode begint op leeftijd ${startAge}.`

  const waarom =
    variant === 'tot-aow'
      ? `Je liquide vermogen is dan op, en je AOW en pensioen zijn nog niet begonnen. Het model dekt je uitgaven in die jaren met een tekort-lening.`
      : `Je liquide vermogen is dan op en je inkomen dekt je uitgaven niet volledig. Het model dekt het verschil met een tekort-lening.`

  const woning = input.homeExcludedFromFire
    ? `Je huis telt in dit plan niet mee: je hebt gekozen om je eigen woning buiten je vrijheidsvermogen te houden. De overwaarde staat er dus wel, maar het model spreekt hem niet aan.`
    : null

  const piek = input.freedomText
    ? `Op het diepste punt staat er ${input.peakText} open — ${input.freedomText} vrijheid die je later terugkoopt.`
    : `Op het diepste punt staat er ${input.peakText} open.`

  const lijn = `Op de vermogenslijn zie je dit niet: die toont je nettovermogen, waarin het tekort al is verrekend.`

  const knoppen = input.isPensioenMode
    ? `Dit bedrag beweegt mee met je woonstrategie, met je liquide opbouw vóór leeftijd ${startAge}, en met je AOW- en pensioendatum.`
    : `Dit bedrag beweegt mee met je woonstrategie, met je liquide opbouw vóór leeftijd ${startAge}, en met de leeftijd waarop je stopt met werken.`

  const disclaimer = `Indicatie, geen advies — een rekenuitkomst bij je huidige aannames.`

  return { variant, periode, waarom, woning, piek, lijn, knoppen, disclaimer }
}
