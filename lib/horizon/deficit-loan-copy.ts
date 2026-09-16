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

import { formatAowAge } from '@/lib/aow-leeftijd'
import type { HousingStrategyMode } from '@/lib/housing-strategy'

/**
 * Welke bovengrens de leenperiode in dit plan heeft — altijd uit de rijen, nooit
 * aangenomen (de oude 'tot-aow'-lezing beweerde "tot je AOW-leeftijd" terwijl de
 * lening in de rijen vaak nog decennia doorliep):
 *  - 'tot-aflossing' — de detector zag de lening binnen het venster op €0 komen.
 *  - 'tot-einde'     — de lening staat aan het einde van de projectie nog open.
 */
export type DeficitLoanPeriodVariant = 'tot-aflossing' | 'tot-einde'

/** Woonstrategie-feiten uit dezélfde run, zodat de melding de keuze benoemt. */
export interface DeficitLoanHousingFacts {
  mode: HousingStrategyMode
  /** Leeftijd van de huisverkoop in deze run (`kernelHousingSale.age`), of null. */
  saleAge: number | null
  /** Leeftijd van de eerste opname (eerste opeethypotheek-saldo) in deze run, of null. */
  reverseMortgageStartAge: number | null
}

export interface DeficitLoanCopyInput {
  /** Eerste leeftijd met een aangesproken tekort-lening (uit de detector). */
  firstAge: number
  /** Leeftijd waarop de gemelde episode weer op €0 staat, of null (detector). */
  clearedAge: number | null
  /** Start van een latere aanhoudende tekort-episode, of null/afwezig (detector). */
  terugkeerAge?: number | null
  /** Woonstrategie-feiten, of null zonder eigen woning. */
  housing: DeficitLoanHousingFacts | null
  /** AOW-leeftijd van de gebruiker (fractioneel), of null als onbekend. */
  aowAge: number | null
  /** Eindleeftijd die de run zélf hanteerde (`SimResult.displayEndAge`). */
  displayEndAge: number | null
  /** Draait het plan in pensioen-modus (i.p.v. de FIRE-tak)? */
  isPensioenMode: boolean
  /** Staat de eigen woning buiten de FIRE-pot (`exclude_from_fire`)? */
  homeExcludedFromFire: boolean
  /** ADR 0149 — staat "Geen tekort-lening in mijn plan" (`fire_no_deficit_loan`) aan? */
  geenTekortLeningAan: boolean
  /** Ligt het stopmoment vast (de run had een stop-anker)? Afwezig = nee. */
  vastStopmoment?: boolean
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
  /** Wat de gekozen woonstrategie in deze run doet met dit gat, of null. */
  woning: string | null
  /** Heeft de woonstrategie invloed op dit tekort (→ ingang naar de instelling)? */
  toonWoonstrategieLink: boolean
  /** Wat de instelling "Geen tekort-lening in mijn plan" hier betekent (ADR 0149). */
  instelling: string
  /** Ingang naar die instelling — bij elke geconstateerde tekort-lening. */
  toonInstellingLink: boolean
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
  const cleared = wholeAge(input.clearedAge)

  const variant: DeficitLoanPeriodVariant = cleared != null ? 'tot-aflossing' : 'tot-einde'

  const terugkeer = wholeAge(input.terugkeerAge)
  const periode =
    cleared != null
      ? `De leenperiode loopt van leeftijd ${startAge} tot leeftijd ${cleared}.` +
        (terugkeer != null ? ` Vanaf leeftijd ${terugkeer} ontstaat opnieuw een tekort-lening.` : '')
      : eind != null
        ? `De leenperiode begint op leeftijd ${startAge} en loopt door tot het einde van je projectie (leeftijd ${eind}).`
        : `De leenperiode begint op leeftijd ${startAge}.`

  // UR3-24: de VERGELIJKING mag op hele jaren (`aow`), de WEERGAVE niet — canonieke
  // vorm via `formatAowAge` op de onafgeronde waarde.
  const waarom =
    aow != null && aow > startAge && input.aowAge != null
      ? `Je liquide vermogen is dan op, en je AOW (vanaf ${formatAowAge(input.aowAge)}) en pensioen zijn nog niet begonnen. Het model dekt je uitgaven in die jaren met een tekort-lening.`
      : `Je liquide vermogen is dan op en je inkomen dekt je uitgaven niet volledig. Het model dekt het verschil met een tekort-lening.`

  const woning = input.homeExcludedFromFire
    ? `Je huis telt in dit plan niet mee: je hebt gekozen om je eigen woning buiten je vrijheidsvermogen te houden. De overwaarde staat er dus wel, maar het model spreekt hem niet aan.`
    : housingSentence(input.housing, startAge, cleared)

  const piek = input.freedomText
    ? `Op het diepste punt staat er ${input.peakText} open — ${input.freedomText} vrijheid die je later terugkoopt.`
    : `Op het diepste punt staat er ${input.peakText} open.`

  const lijn = `Op de vermogenslijn zie je dit niet: die toont je nettovermogen, waarin het tekort al is verrekend.`

  // Wft: beschrijvend. Aan + toch een lening: onder een vast stopmoment is dat de oorzaak;
  // zonder vast stopmoment (plan komt binnen de horizon niet rond, of een brug in het laatste
  // planjaar die de melding anders venstert dan de solver) claimen we geen oorzaak.
  const instelling = !input.geenTekortLeningAan
    ? `Je plan staat een tekort-lening nu toe. Met de instelling "Geen tekort-lening in mijn plan" rekent de app met het vroegste stopmoment waarop je zonder lening rondkomt.`
    : input.vastStopmoment === true
      ? `Je hebt ingesteld dat een tekort-lening niet in je plan hoort, maar met je gekozen stopmoment is hij toch nodig.`
      : `Je hebt ingesteld dat een tekort-lening niet in je plan hoort; deze berekening laat er toch een zien.`

  const knoppen = input.isPensioenMode
    ? `Dit bedrag beweegt mee met je woonstrategie, met je liquide opbouw vóór leeftijd ${startAge}, met je AOW- en pensioendatum, en met je instelling of een tekort-lening in je plan mag.`
    : `Dit bedrag beweegt mee met je woonstrategie, met je liquide opbouw vóór leeftijd ${startAge}, met de leeftijd waarop je stopt met werken, en met je instelling of een tekort-lening in je plan mag.`

  const disclaimer = `Indicatie, geen advies — een rekenuitkomst bij je huidige aannames.`

  return {
    variant,
    periode,
    waarom,
    woning,
    toonWoonstrategieLink: input.housing != null,
    instelling,
    toonInstellingLink: true,
    piek,
    lijn,
    knoppen,
    disclaimer,
  }
}

/**
 * Wat de gekozen verkoop- of opeetstrategie in DEZE run met het gat doet. Een
 * opeethypotheek is een keuze, de tekort-lening is wat er daarnaast nog openstaat —
 * de melding moet die twee uit elkaar houden, anders leest hij als "je keuze werkt niet".
 */
function housingSentence(
  housing: DeficitLoanHousingFacts | null,
  startAge: number,
  cleared: number | null,
): string | null {
  if (!housing) return null

  if (housing.mode === 'reverse_mortgage') {
    const opeet = wholeAge(housing.reverseMortgageStartAge)
    if (opeet == null) {
      return `Je hebt een opeethypotheek gekozen, maar in deze projectie wordt er niets uit opgenomen: er komt geen geld uit je huis om dit gat te dekken.`
    }
    if (opeet > startAge) {
      // Staat de lening kort na de start op nul, dan zeggen we niets over de oorzaak:
      // dat kan de opname zijn, maar net zo goed AOW of pensioen die rond dezelfde tijd ingaan.
      const daarna =
        cleared != null && cleared <= opeet + 1
          ? ''
          : ` Ook daarna blijft er een tekort-lening openstaan: de opname uit je huis vult het gat niet volledig, bijvoorbeeld omdat het leenplafond is bereikt.`
      return `Je hebt een opeethypotheek gekozen. Die neemt in deze projectie voor het eerst op op leeftijd ${opeet}; tot dan komt er geen geld uit je huis en dekt de tekort-lening het gat.${daarna}`
    }
    return `Je hebt een opeethypotheek gekozen en die neemt op vanaf leeftijd ${opeet}, maar de opname uit je huis vult het gat niet volledig, bijvoorbeeld omdat het leenplafond is bereikt. Het verschil is de tekort-lening.`
  }

  if (housing.mode === 'downsize') {
    const verkoop = wholeAge(housing.saleAge)
    if (verkoop == null) {
      return `Je hebt gekozen om je huis te verkopen, maar dat gebeurt in deze projectie niet: de overwaarde dekt dit gat dus niet.`
    }
    if (verkoop > startAge) {
      const aflossing =
        cleared != null && cleared <= verkoop + 1
          ? `; met de opbrengst is hij daarna afgelost.`
          : `. De opbrengst is niet genoeg om hem helemaal af te lossen.`
      return `Je huis wordt in deze projectie verkocht op leeftijd ${verkoop}. Tot die verkoop dekt de tekort-lening het gat${aflossing}`
    }
    return `Je huis is in deze projectie al verkocht op leeftijd ${verkoop}; de opbrengst dekt je uitgaven daarna niet tot het einde.`
  }

  return null
}
