// lib/horizon/anker-copy.ts
//
// ÉÉN bron voor het antwoord dat een VAST STOP-ANKER (ADR 0129: `aow`, `now`, `age`)
// op elk oppervlak geeft: *als ik op {stop} stop, tot welke leeftijd reikt mijn
// LIQUIDE vermogen?* — plus de woorden eromheen. Opvolger van `nu-stoppen-copy.ts`
// (ADR 0127), dat hetzelfde antwoord alleen voor het nu-anker kende; die module is
// nu een compat-laag hierop (F4 verwijdert haar).
//
// "LIQUIDE" IS GEEN VERSIERING, HET IS DE GRONDSLAG. Het bereik leest `Prognose!J` =
// `nettoVermogen − (niet-liquide bezit − niet-liquide leningen)`: je eigen woning zit
// er niet in (en de hypotheek die eraan hangt evenmin), tenzij je woonstrategie hem
// liquide maakt — verkopen of opeethypotheek. Dat is de juiste grondslag, want van
// een woning kun je je boodschappen niet betalen. Maar op /overzicht staat het netto
// vermogen ERBOVEN, mét woning, en dat verschil kan een veelvoud zijn. Een zin die
// daar "je vermogen" zegt laat de lezer twee ongelijke grootheden op elkaar leggen —
// precies wat CLAUDE.md verbiedt voor netto vermogen versus de liquide portefeuille.
// Vandaar dat élke zin hier het woord draagt; schrijf het niet weg om te "verkorten".
// De term is `liquide vermogen` (~90× in de app), niet "vrij besteedbaar": dat is
// bezet voor het deel van je INKOMEN dat overblijft na vaste lasten en sparen.
//
// WAAROM EEN EIGEN MODULE. Onder een vast anker is de kernel-`fireAge` per constructie
// de ankerleeftijd: elk oppervlak dat "vrijheidsleeftijd 62" toont zegt dan iets waars
// én betekenisloos. Het echte antwoord is het BEREIK — `kernelDepletionMonth` uit
// dezelfde run (ADR 0126). Die vertaling van maand → leeftijd → zin stond op het punt
// om per anker én per oppervlak los te ontstaan; dit bestand is die ene plek.
//
// CONSUME-ONLY. Er wordt hier niets gerekend behalve de maand→jaar-omzetting die
// `lib/horizon/runway.ts` zelf ook doet (`startLeeftijd + months / 12`); de
// uitputtingsmaand, de startleeftijd, de eindleeftijd en het stopmoment komen alle
// kant-en-klaar uit de kernel-run. Geen deflator: een leeftijd is een moment, geen
// euro (ADR 0093).
//
// TOON (harde randvoorwaarde uit het besluit, bijlage ADR 0129, anker-generiek). De
// app zegt NIET dat je kunt stoppen — ze zegt hoe ver je vermogen reikt. Beschrijvend,
// nooit aansporend; geen "oneindig" (het model stopt bij leeftijd 100 en claimt daar
// niets voorbij); en nooit het woord AOW in een tekortzin, want een tekort kan ook ná
// de AOW vallen — het aow-anker noemt zijn stopmoment daarom als getal ("op 67").

import { HORIZON_PLAFOND_LEEFTIJD } from '@/lib/constants'
import { euroViewLabel, type EuroView } from '@/lib/euro-display'
import { formatCurrency, MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'
import type { KernelStopAnker } from '@/lib/horizon-kernel/types'
// Dezelfde afrondingsregel als het hero-kopgetal (`heroFireAgeYear`), via het
// import-vrije blad — hero-fire-age.ts importeert dít bestand, niet andersom.
import { leeftijdJaar as heroFireAgeYear } from './leeftijd-jaar'
import type { RunwayResult } from './runway'

/**
 * Tot waar het vermogen reikt onder een vast anker. Vier uitkomsten, bewust
 * gescheiden zodat geen enkel oppervlak een tekort als "gedekt" kan tonen.
 */
export type AnkerReach =
  /** Het geld reikt tot het einde van het plan. `endAge` = de eigen eindleeftijd
   *  (`null` wanneer de run tot voorbij de horizon reikt en dus geen plan-einde noemt). */
  | { readonly kind: 'gedekt'; readonly endAge: number | null }
  /** Het geld raakt op vóór de eindleeftijd, op `age` (fractioneel). */
  | { readonly kind: 'reikt-tot'; readonly age: number; readonly endAge: number | null }
  /** Vandaag al geen vermogen om de uitgaven uit te dekken. */
  | { readonly kind: 'nu-op' }
  /** Geen run / geen bruikbare invoer — er valt niets te zeggen. */
  | { readonly kind: 'onbekend' }

/**
 * Het STOPMOMENT waar de zin over gaat. `now` is vandaag (de zin zegt "nu"); `aow`
 * en `age` dragen de leeftijd als getal — bij `aow` bewust géén woord "AOW" in de
 * zin (toon-invariant: een tekort kan ook ná de AOW vallen), alleen het getal.
 * `stopAge` is fractioneel en komt uit `SimResult.vastStopLeeftijd` — nooit uit
 * `fireAge` (die is `ceil`, en maakt van 58,5 een 59; bevinding 11).
 */
export type AnkerStop =
  | { readonly kind: 'now' }
  | { readonly kind: 'aow' | 'age'; readonly stopAge: number }

const ONBEKEND: AnkerReach = { kind: 'onbekend' }

function bruikbaar(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n)
}

/**
 * Leidt het stopmoment af uit een REEDS GEDRAAIDE run: de kernel-echo van het anker
 * (`SimResult.stopAnker`) plus het stopmoment van de run als leeftijd
 * (`SimResult.vastStopLeeftijd`). `null` onder `solved` (geen anker) of wanneer de
 * leeftijd van een aow-/age-anker ontbreekt — dan valt er geen stopmoment te noemen.
 */
export function ankerStopFromSim(input: {
  stopAnker: KernelStopAnker | null | undefined
  vastStopLeeftijd: number | null | undefined
}): AnkerStop | null {
  const anker = input.stopAnker
  if (anker == null) return null
  if (anker.soort === 'nu') return { kind: 'now' }
  const stopAge = bruikbaar(input.vastStopLeeftijd)
    ? input.vastStopLeeftijd
    : anker.soort === 'leeftijd' && bruikbaar(anker.leeftijd)
      ? anker.leeftijd
      : null
  if (stopAge === null) return null
  return { kind: anker.soort === 'aow' ? 'aow' : 'age', stopAge }
}

/**
 * Leidt het bereik af uit een REEDS GEDRAAIDE kernel-run (`SimResult`).
 *
 * `kernelDepletionMonth` draagt drie betekenissen die niet door elkaar mogen
 * lopen:
 *  - `undefined` — geen kernel-pad (stub/mock/scalar) ⇒ 'onbekend';
 *  - `null`      — geen aanhoudende uitputting binnen de horizon ⇒ 'gedekt';
 *  - een getal   — de eerste aanhoudende uitputtingsmaand (maand 0 = nu).
 *
 * Lees `kernelDepletionMonth` dus RAUW aan (niet via `?? null`): die shorthand
 * maakt van "geen kernel-antwoord" stilzwijgend "je bent gedekt".
 */
export function ankerReachFromSim(input: {
  /** `KernelInput.startLeeftijd` — de leeftijd waarop de tijdas begint (maand 0). */
  startAge: number | null | undefined
  /** `SimResult.kernelDepletionMonth` — rauw, zie hierboven. */
  kernelDepletionMonth: number | null | undefined
  /** `SimResult.displayEndAge` — de eigen eindleeftijd. */
  endAge: number | null | undefined
}): AnkerReach {
  const endAge = bruikbaar(input.endAge) ? input.endAge : null
  const maand = input.kernelDepletionMonth
  if (maand === undefined) return ONBEKEND
  if (maand === null) return { kind: 'gedekt', endAge }
  if (!Number.isFinite(maand)) return ONBEKEND
  if (maand <= 0) return { kind: 'nu-op' }
  if (!bruikbaar(input.startAge)) return ONBEKEND
  const age = input.startAge + maand / 12
  // Reikt de uitputting tot voorbij het plan-einde, dan is dat "gedekt" — zelfde
  // grens als `computeRunwayFromSolve` (`m > eindMaandVan(endAge, startLeeftijd)`).
  if (endAge != null && age >= endAge) return { kind: 'gedekt', endAge }
  return { kind: 'reikt-tot', age, endAge }
}

/**
 * Idem, maar uit een reeds geduide `RunwayResult` (de run die /overzicht toch al
 * draait — geen tweede run).
 */
export function ankerReachFromRunway(runway: RunwayResult): AnkerReach {
  switch (runway.kind) {
    case 'months':
      return runway.depletionAge >= runway.endAge
        ? { kind: 'gedekt', endAge: runway.endAge }
        : { kind: 'reikt-tot', age: runway.depletionAge, endAge: runway.endAge }
    case 'reaches-end-age':
      return { kind: 'gedekt', endAge: runway.endAge }
    // Voorbij de horizon: gedekt, maar zónder plan-einde om te noemen. Bewust
    // geen "oneindig" — het model stopt bij leeftijd 100 en claimt niets erna.
    case 'beyond-horizon':
      return { kind: 'gedekt', endAge: null }
    case 'deficit':
      return { kind: 'nu-op' }
    case 'unavailable':
      return ONBEKEND
  }
}

/**
 * De leeftijd waartoe het vermogen reikt, als getal voor een tegel of drieslag
 * ("REIKT TOT"): de uitputtingsleeftijd, de eindleeftijd bij dekking, of — zonder
 * plan-einde — het horizonplafond ("zover het model rekent"). `null` bij 'nu-op' en
 * 'onbekend'. Fractioneel; rond af met `ankerReachYear` voor weergave.
 */
export function ankerReachesAge(reach: AnkerReach): number | null {
  if (reach.kind === 'reikt-tot') return reach.age
  if (reach.kind === 'gedekt') return reach.endAge ?? HORIZON_PLAFOND_LEEFTIJD
  return null
}

// ── Woorden ────────────────────────────────────────────────────────────────

/** Het KPI-label dat onder een vast anker in de plaats van "Vrijheidsleeftijd" komt. */
export const ANKER_KPI_LABEL = 'Reikt tot'
/** Dezelfde kop op smal scherm (past al; één constante zodat ze niet uiteenlopen). */
export const ANKER_KPI_LABEL_KORT = 'Reikt tot'

/**
 * Het onderschrift onder de vermogenstegel van een vast anker ("Vermogen op je
 * stopmoment").
 *
 * AANLEIDING (melding 18-09-2026): die tegel toont de stand van Prognose!J op de
 * ankermaand — netto LIQUIDE, dus zónder de eigen woning en ná aftrek van de
 * niet-woningschulden (gemeten: € 56.201 liquide bezit − € 40.000 studieschuld −
 * € 800 krediet + één maand inleg = € 17.101). Het onderschrift zei alleen
 * "geprojecteerd op je stopmoment"; zonder de grondslag erbij leest dat als een
 * doelbedrag dat te laag is. In de `solved`-tak noemt het onderschrift zijn
 * grondslag wél ("benodigd — met/zonder je huis", `FIRE_DOEL_ONDERSCHRIFT`,
 * UR2-17) — precies dezelfde reden: het label moet de grootheid benoemen die er
 * staat.
 *
 * WAAROM NIET "liquide vermogen — geprojecteerd op je stopmoment" (eigenaarsbesluit
 * 18-09-2026, herziening van de eerste versie hiervan):
 *  - "liquide" is een VAKTERM. De ui-ux-conventie zet de vakterm in de kicker, niet
 *    in de enige duidingsregel die de lezer krijgt. De kicker boven de tegel is al
 *    "Vermogen op je stopmoment"; het title-attribuut draagt de term voluit.
 *  - "geprojecteerd op je stopmoment" herhaalt die kicker letterlijk — twee regels
 *    die hetzelfde zeggen, terwijl er maar één iets kán toevoegen.
 *  - De klacht ging er juist over dat de gebruiker niet wist dát zijn studielening
 *    er al vanaf was. "na schulden" beantwoordt die vraag; "liquide" niet.
 *  - "zonder je huis" sluit aan op het bestaande woordpaar "met je huis / zonder je
 *    huis" in `FIRE_DOEL_ONDERSCHRIFT`, zodat de twee takken één taal spreken.
 * De uitzondering blijft benoemd: maakt de woonstrategie de woning liquide
 * (verkopen/opeethypotheek), dan zit de opbrengst er ná dat moment wél in — dat is
 * de verkoopmarker in de grafiek, niet iets dat dit onderschrift moet dragen.
 * Geen doel-woord: onder een vast anker bestaat er geen doelvermogen (ADR 0129 D4).
 */
export const ANKER_VERMOGEN_TEGEL_ONDERSCHRIFT = 'zonder je huis, na schulden'

/**
 * Wat er in een RAPPORTAGE in de plaats komt van "FIRE-voortgang X %" zodra het
 * stopmoment vastligt (ADR 0129 B3/D4).
 *
 * AANLEIDING (eindreview 18-09-2026): de rapportpagina toonde in dezelfde kolom een
 * voortgangsbalk mét "Doel: € X" én een vergelijkingstabel met "—". Onder een vast
 * anker bestaat dat doelbedrag niet en meet `nettoVermogen / fireTarget` niets. Het
 * rapport draait geen kernel-run, dus de DEKKING (het getal dat /toekomst wél kan
 * tonen) is daar niet beschikbaar — vandaar een zin in plaats van een tweede getal.
 *
 * Twee delen, bewust gescheiden: `kop` is kort genoeg voor een figures-strip-cel,
 * `uitleg` staat in de kolom eronder. Toon-invarianten van deze module: beschrijvend,
 * geen aansporing, en het woord AOW mag hier wél — dit is een instellingslabel, geen
 * tekortzin (zelfde uitzondering als `planCoverageKaartSubregel`).
 *
 * `stopAge` is alleen bekend bij een `age`-anker (het rapport laadt de wettelijke
 * AOW-tabel niet); `null` laat de zin die leeftijd weg.
 */
export function rapportAnkerVoortgang(
  anchor: 'aow' | 'now' | 'age',
  stopAge: number | null,
): { kop: string; uitleg: string } {
  const kop =
    anchor === 'now'
      ? 'Je stopt nu'
      : anchor === 'aow'
        ? 'Je AOW-leeftijd'
        : stopAge != null
          ? formatStopAge(stopAge)
          : 'Vast stopmoment'
  const aanhef =
    anchor === 'now'
      ? 'Je rekent alsof je nu stopt.'
      : anchor === 'aow'
        ? 'Je stopmoment ligt vast op je AOW-leeftijd.'
        : stopAge != null
          ? `Je stopmoment ligt vast op ${formatStopAge(stopAge)}.`
          : 'Je stopmoment ligt vast.'
  return {
    kop,
    uitleg: `${aanhef} Er is dan geen doelvermogen om voortgang tegen af te zetten; wat telt is hoe ver je plan reikt.`,
  }
}

/** De kicker boven die cel/kolom — vervangt "FIRE-voortgang" onder een vast anker. */
export const RAPPORT_ANKER_KICKER = 'Stopmoment'

/**
 * De draaiknoppen van het lab, in deze volgorde (eigenaarskeuze 15 sep 2026, bijstelling van
 * spec lab-haalbaarheid §2): 1 Meer salaris (het extra-inleg-event — rekenkundig dezelfde
 * hefboom), 2 Spaarquote (in % met het bedrag minder uitgeven eronder), 3 Minder werken.
 * "Later of eerder stoppen" is de stop-schuif in sectie 2 van de Vrijheidsas.
 */
export const HEFBOOM_COPY = {
  meerSalaris: 'Meer salaris',
  spaarquote: 'Spaarquote',
  minderWerken: 'Minder werken',
  laterEerder: 'Later of eerder stoppen',
} as const

/** De euro-regel onder de spaarquote-knop: "+€ 1.290/mnd minder uitgeven" (0 op de basis → leeg). */
export function spaarquoteEuroRegel(euroPerMaand: number, masked = false): string | null {
  const bedrag = Math.round(euroPerMaand)
  if (bedrag === 0) return null
  const teken = bedrag > 0 ? '+' : '−'
  const waarde = masked ? MASKED_AMOUNT_PLACEHOLDER : `€ ${Math.abs(bedrag).toLocaleString('nl-NL')}`
  return `${teken}${waarde}/mnd ${bedrag > 0 ? 'minder uitgeven' : 'meer uitgeven'}`
}

/** Sectie 2 van de Vrijheidsas onder een vast anker (spec lab-haalbaarheid §1/§5). */
export const DEKKINGSAS_COPY = {
  kop: 'Reikt je plan?',
  tag: 'de dekking',
  sliderLabel: 'Doorwerken tot',
  tegelReikt: 'Reikt tot',
  /**
   * ADR 0145 D12 (15 sep 2026) — tegel 2 toont het EINDVERMOGEN i.p.v. "Plan tot".
   * Die eindleeftijd stond al onder de balk ("plan tot 90"); wat ontbrak was het derde
   * component dat onder een gedekt plan nog beweegt: wat er op je eindleeftijd over is.
   */
  tegelEindvermogen: 'Eindvermogen',
  tegelGedekt: 'Gedekt',
} as const

/**
 * Onderschrift onder de Eindvermogen-tegel: het moment én de euro-weergave waarin het bedrag
 * staat. De weergave-naam komt uit de ene app-bron (`euroViewLabel`: "huidige euro's" /
 * "toekomstige euro's", zoals de schakelaar zelf heet) — nooit een eigen woord, want onder
 * `nominal` staat het bedrag NIET in euro's van nu (eindreview I3, 15 sep 2026).
 */
export function eindvermogenTegelCaption(endAge: number | null, view: EuroView): string {
  const weergave = euroViewLabel(view).toLowerCase()
  return endAge != null ? `op je ${heroFireAgeYear(endAge)}e, in ${weergave}` : `op je eindleeftijd, in ${weergave}`
}

/**
 * De tegelwaarde wanneer een run de eindleeftijd NIET haalt (eindreview I1): dan bestaat er
 * geen eindvermogen. Het kernel-netto-vermogen op die leeftijd is dan de tekort-lening
 * (negatief, of positief door een woning min die lening) — dat is geen vermogen, en klemmen op
 * € 0 zou verzwijgen dat het model leent. Dus geen bedrag, maar waar het plan ophoudt.
 */
export function eindvermogenOpTegel(endAge: number | null): string {
  return endAge != null ? `op vóór je ${heroFireAgeYear(endAge)}e` : 'op vóór je eindleeftijd'
}

/**
 * Het stopmoment als getal in een zin: hele jaren kaal ("62"), halve jaren met een
 * komma ("58,5" — B6 staat halve jaren toe). Geen ordinaal ("62e"): de leeftijden
 * waar het vermogen tot REIKT zijn ordinaal, het stopmoment is een instelling.
 */
export function formatStopAge(stopAge: number): string {
  return Number.isInteger(stopAge) ? String(stopAge) : stopAge.toFixed(1).replace('.', ',')
}

/** "nu" of "op {stop}" — het onderwerp van elke zin. */
function stopFrase(stop: AnkerStop): string {
  return stop.kind === 'now' ? 'nu' : `op ${formatStopAge(stop.stopAge)}`
}

/** De kop van het statusblok / de banner. */
export function ankerTitel(stop: AnkerStop): string {
  return stop.kind === 'now'
    ? 'Je rekent alsof je nu stopt'
    : `Je rekent met stoppen op ${formatStopAge(stop.stopAge)}`
}

/**
 * Het HELE JAAR dat op het scherm komt — via dezelfde afrondingsregel als het
 * kopgetal van de hero-KPI (`heroFireAgeYear`), zodat de zin en het getal
 * erboven nooit één jaar uiteenlopen (bevinding S15).
 */
export function ankerReachYear(reach: AnkerReach): number | null {
  if (reach.kind === 'reikt-tot') return heroFireAgeYear(reach.age)
  if (reach.kind === 'gedekt') return reach.endAge != null ? heroFireAgeYear(reach.endAge) : null
  return null
}

/** Onderschrift bij het KPI-getal: 'jaar' of, bij volledige dekking, de duiding. */
export function ankerKpiCaption(reach: AnkerReach): string {
  switch (reach.kind) {
    case 'gedekt':
      return reach.endAge != null ? 'jaar — einde van je plan' : 'jaar'
    case 'reikt-tot':
      return 'jaar'
    case 'nu-op':
      return 'vanaf vandaag niet gedekt'
    case 'onbekend':
      return 'nog niet te bepalen'
  }
}

/**
 * De compacte regel voor een kaart/pil: `Reikt tot: 86 jr`.
 * Vervangt onder een vast anker de `FIRE: 47 jr`/`AOW: 67 jr`-regel.
 */
export function ankerKort(reach: AnkerReach): string {
  const jaar = ankerReachYear(reach)
  if (jaar != null) return `${ANKER_KPI_LABEL}: ${jaar} jr`
  if (reach.kind === 'nu-op') return `${ANKER_KPI_LABEL}: vandaag`
  return `${ANKER_KPI_LABEL}: —`
}

/**
 * De volledige, beschrijvende zin — voor het statusblok op /toekomst, de
 * grafiek-uitleg en de /overzicht-strip. Zinnen uit de bijlage van ADR 0129.
 *
 * Nooit aansporend ("je kunt stoppen"), nooit "oneindig", nooit het woord AOW.
 * Onder `now` byte-identiek aan de ADR 0127-zinnen (gepind in nu-stoppen-copy.test.ts).
 */
export function ankerZin(reach: AnkerReach, stop: AnkerStop): string {
  const s = stopFrase(stop)
  switch (reach.kind) {
    case 'gedekt':
      if (stop.kind === 'now') {
        return reach.endAge != null
          ? `Als je nu stopt, reikt je liquide vermogen tot je ${heroFireAgeYear(reach.endAge)}e — het einde van je plan.`
          : 'Als je nu stopt, reikt je liquide vermogen tot het einde van je plan.'
      }
      return reach.endAge != null
        ? `Als je ${s} stopt, reikt je liquide vermogen tot voorbij je ${heroFireAgeYear(reach.endAge)}e — het einde van je plan.`
        : `Als je ${s} stopt, reikt je liquide vermogen tot het einde van je plan.`
    case 'reikt-tot': {
      const jaar = heroFireAgeYear(reach.age)
      return reach.endAge != null
        ? `Als je ${s} stopt, reikt je liquide vermogen tot je ${jaar}e. Je plan loopt tot je ${heroFireAgeYear(reach.endAge)}e.`
        : `Als je ${s} stopt, reikt je liquide vermogen tot je ${jaar}e.`
    }
    case 'nu-op':
      return stop.kind === 'now'
        ? 'Als je nu stopt, dekt je liquide vermogen je uitgaven vanaf vandaag niet.'
        : `Als je ${s} stopt, dekt je liquide vermogen je uitgaven niet: het is vandaag al op.`
    case 'onbekend':
      return 'We kunnen nog niet bepalen tot welke leeftijd je liquide vermogen reikt.'
  }
}

/**
 * Korte variant van dezelfde uitspraak, voor een strip of banner waar de zin
 * naast een kop staat en dus geen aanhef nodig heeft.
 */
export function ankerZinKort(reach: AnkerReach, stop: AnkerStop): string {
  const bijStop = stop.kind === 'now' ? '' : ` als je ${stopFrase(stop)} stopt`
  switch (reach.kind) {
    case 'gedekt':
      return reach.endAge != null
        ? `je liquide vermogen reikt tot je ${heroFireAgeYear(reach.endAge)}e${bijStop}`
        : `je liquide vermogen reikt tot het einde van je plan${bijStop}`
    case 'reikt-tot':
      return `je liquide vermogen reikt tot je ${heroFireAgeYear(reach.age)}e${bijStop}`
    case 'nu-op':
      return stop.kind === 'now'
        ? 'je liquide vermogen dekt je uitgaven vanaf vandaag niet'
        : 'je liquide vermogen is vandaag al op'
    case 'onbekend':
      return 'we kunnen nog niet bepalen tot welke leeftijd je liquide vermogen reikt'
  }
}

/**
 * De vraag die de modus draagt (ADR 0129 B10) — de kop van de hero op /toekomst en
 * van de vrijheidsas: geen systeemlabel ("Pensioen-modus"), maar de vraag die het
 * scherm beantwoordt. `null` = `solved`.
 */
export function ankerVraag(stop: AnkerStop | null): string {
  if (stop == null) return 'Wanneer kun je stoppen?'
  if (stop.kind === 'now') return 'Hoe ver reikt je vermogen?'
  return `Kun je op ${formatStopAge(stop.stopAge)} stoppen?`
}

/**
 * De "vrij mogelijk vanaf"-zin bij tegel 1 van de drieslag (ADR 0129 D7/B9): de
 * OPGELOSTE leeftijd van de tweede run als inzicht naast het gekozen stopmoment.
 * Verleden tijd wanneer dat moment al achter de huidige leeftijd ligt (bijlage:
 * "vrij was mogelijk vanaf"), onbereikbaar ⇒ de vaste zin uit de bijlage.
 * Beschrijvend over de projectie — geen aansporing om eerder te stoppen.
 */
export function ankerVrijZin(input: {
  /** `ScenarioPresetBatch.solvedFireAge` — `null` = onbereikbaar binnen de horizon. */
  solvedFireAge: number | null
  currentAge: number | null
  stop: AnkerStop
  /** Alleen bij gedekt onder aow/age: de tweede zin uit de bijlage ("de jaren die je langer werkt…"). */
  gedekt?: boolean
}): string {
  const { solvedFireAge, currentAge, stop } = input
  if (solvedFireAge == null || !Number.isFinite(solvedFireAge)) {
    return 'De app vindt binnen dit plan nog geen leeftijd waarop je vermogen het zelf draagt.'
  }
  const jaar = heroFireAgeYear(solvedFireAge)
  const verleden = currentAge != null && Number.isFinite(currentAge) && solvedFireAge < currentAge
  if (stop.kind === 'now') {
    return verleden ? `Vrij was mogelijk vanaf je ${jaar}e.` : `Vrij mogelijk vanaf je ${jaar}e.`
  }
  const eerder = solvedFireAge <= stop.stopAge
  if (input.gedekt && eerder) {
    return `Vrij was al mogelijk vanaf je ${jaar}e; de jaren die je langer werkt komen bovenop je plan.`
  }
  return verleden ? `Vrij was mogelijk vanaf je ${jaar}e.` : `Vrij mogelijk vanaf je ${jaar}e.`
}

/**
 * De notitie op een `fire_age`-doelkaart onder een vast anker (ADR 0129, bijlage
 * "Doelen"): het doel heeft geen uitkomst, want het stopmoment ligt vast.
 * `stopAge` fractioneel (of `null` bij `now`); `endAge` de eindleeftijd van het plan.
 */
export function fireAgeGoalNotApplicableReason(
  anchor: 'aow' | 'now' | 'age',
  stopAge: number | null,
  endAge: number | null,
): string {
  const reikt = endAge != null ? ` Wat telt, is of je plan tot je ${heroFireAgeYear(endAge)}e reikt.` : ' Wat telt, is of je plan tot je eindleeftijd reikt.'
  if (anchor === 'now') {
    return `Je rekent alsof je nu stopt, dus dit doel heeft geen uitkomst om naar te kijken.${reikt}`
  }
  const stop = stopAge != null ? ` op ${formatStopAge(stopAge)}` : ''
  return `Je stopmoment ligt vast${stop}, dus dit doel heeft geen uitkomst om naar te kijken.${reikt}`
}

// ── Dekking als uitkomst van het lab (ADR 0145, zinnen B6 — compliance-check 14 sep 2026) ──
//
// Onder een vast stopmoment beweegt het lab niet de vrijheidsleeftijd maar de DEKKING
// (`computeRunwayCoveragePct`). Elke zin hieronder is een rekensom op eigen data —
// inzicht, geen advies. Dezelfde toon-invarianten als hierboven: geen "je kunt stoppen",
// geen "oneindig", geen woord AOW in een tekortzin (het aow-anker noemt zijn getal).
// De `{hint}` is een som ("hoort daar … bij"), geen instructie; de knop leest als een
// rekenopdracht aan de app ("Reken met …"), niet als een opdracht aan de gebruiker.

/** Percentage voor de zinnen: heel getal, geen decimalen. */
function fmtPct(pct: number): string {
  // Nooit "100%" zolang er een tekort is: 99,6 rondt naar 99, anders zegt de zin
  // "100% gedekt" naast een aanbod om het plan haalbaar te maken.
  return pct >= 100 ? '100' : String(Math.min(99, Math.round(pct)))
}

/** Maandbedrag in een zin: afgerond, nl-NL duizendtal (`1.250`). */
function fmtHint(hint: number): string {
  return Math.round(hint).toLocaleString('nl-NL')
}

/** "tot je 90e" of, zonder plan-einde, "tot je eindleeftijd". */
function totJeEind(endAge: number | null): string {
  return endAge != null ? `tot je ${heroFireAgeYear(endAge)}e` : 'tot je eindleeftijd'
}

/**
 * Zin 1 — toelichting bovenaan het vastleg-venster onder aow/age: het lab legt geen
 * vrijheidsleeftijd vast, maar of het plan reikt.
 */
export function dekkingSheetToelichting(stop: AnkerStop, endAge: number | null): string {
  const aanhef = stop.kind === 'now'
    ? 'Je rekent alsof je nu stopt.'
    : `Je stopmoment ligt vast op ${formatStopAge(stop.stopAge)}.`
  return `${aanhef} Het lab legt daarom geen vrijheidsleeftijd vast, maar of je plan ${totJeEind(endAge)} reikt.`
}

/** Zin 2 — de waarde-string van de vaste preview-rij "Plan gedekt" in het vastleg-venster. */
export function dekkingPreviewWaarde(basisPct: number, scenarioPct: number, endAge: number | null): string {
  return `nu ${fmtPct(basisPct)}% → ${fmtPct(scenarioPct)}% · doel 100% ${totJeEind(endAge)}`
}

/**
 * Zin 3 — de sub-regel op de "Plan gedekt"-doelkaart: eindleeftijd + stopmoment. Het
 * aow-anker zegt hier wél "je AOW-leeftijd": dit is geen tekortzin maar een
 * instellingslabel (zelfde woordkeuze als tegel 2 van de hero, ADR 0129 bijlage).
 */
export function planCoverageKaartSubregel(
  endAge: number | null,
  stopAnker: 'aow' | 'age' | 'now' | null,
  stopLeeftijd: number | null,
): string {
  const eind = totJeEind(endAge)
  const stop =
    stopAnker === 'aow'
      ? 'je AOW-leeftijd'
      : stopAnker === 'now'
        ? 'nu'
        : stopLeeftijd != null
          ? formatStopAge(stopLeeftijd)
          : null
  return stop ? `${eind} · stopmoment ${stop}` : eind
}

/**
 * De naam van het "Plan gedekt"-doel — één bron voor de DB-rij (`buildRow('dekking')` in
 * toekomst-doel.ts) én de live kaart (spec lab-haalbaarheid §4.1). Woont hier en niet in
 * toekomst-doel.ts: die module trekt de kernel-adapter mee, en de doelen-view is een
 * client-component. Eindleeftijd met max. 1 decimaal en komma (`90` / `92,5`).
 */
export function planCoverageGoalName(eindleeftijd: number | null): string {
  return bruikbaar(eindleeftijd)
    ? `Plan gedekt tot ${eindleeftijd.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} jaar`
    : 'Plan gedekt'
}

/**
 * Zin 4 — de notitie op een `plan_coverage`-doelkaart onder `solved`: de app zoekt het
 * stopmoment zelf, dus een dekkingsdoel heeft geen uitkomst (spiegel van
 * `fireAgeGoalNotApplicableReason` onder een vast anker).
 */
export function planCoverageGoalNotApplicableReason(): string {
  return 'De app zoekt je stopmoment zelf, dus dit doel heeft geen uitkomst om naar te kijken. Wat telt, is vanaf welke leeftijd werken een keuze wordt.'
}

/**
 * Zin 5 — de notitie op het VRIJHEIDSGETAL-doel onder een vast anker: er is geen
 * doelvermogen om naartoe te sparen (bridge-vlag `requiredFireIsAnchorPortfolio`, D4).
 * Vóór ADR 0145 viel dit doel stil terug op de opgeslagen waarde zonder notitie.
 */
export function vrijheidsgetalGoalNotApplicableReason(
  anchor: 'aow' | 'now' | 'age',
  stopAge: number | null,
  endAge: number | null,
): string {
  const reikt = ` Wat telt, is of je plan ${totJeEind(endAge)} reikt.`
  if (anchor === 'now') {
    return `Je rekent alsof je nu stopt, dus er is geen doelvermogen om naartoe te sparen.${reikt}`
  }
  const stop = stopAge != null ? ` op ${formatStopAge(stopAge)}` : ''
  return `Je stopmoment ligt vast${stop}, dus er is geen doelvermogen om naartoe te sparen.${reikt}`
}

/**
 * Zin 6 — de verken-samenvatting onder een vast anker: dekking basis → scenario, en tot
 * waar het scenario reikt (`reikt` = `ankerReachYear(scenarioReach)`; zonder jaar valt
 * de staart weg).
 */
export function dekkingVerkenZin(input: { basisPct: number; scenarioPct: number; reikt: number | null }): string {
  const kern = `Wat-als actief — plan gedekt ${fmtPct(input.basisPct)}% → ${fmtPct(input.scenarioPct)}%`
  return input.reikt != null ? `${kern}, reikt tot je ${input.reikt}e` : kern
}

/** Zin 7a — de badge/pil met de dekking zelf: "78% gedekt". */
export function dekkingBadge(pct: number): string {
  return `${fmtPct(pct)}% gedekt`
}

/**
 * Zin 7b — de delta-badge: "+12% gedekt" / "−4% gedekt"; onder één procentpunt
 * "gelijk" (zelfde conventie als de FIRE-delta-pil "gelijk").
 */
export function dekkingDeltaBadge(deltaPct: number): string {
  const n = Math.round(deltaPct)
  if (Math.abs(n) < 1) return 'gelijk'
  return `${n > 0 ? '+' : '−'}${Math.abs(n)}% gedekt`
}

/**
 * Zin 8 — de notitie op de Vrijheidsas in de `ankerVast`-tak: tekort (met dekking) of
 * gedekt (niets vast te leggen). 'nu-op' is de 0%-variant van het tekort; 'onbekend'
 * geeft `null` (dan toont de as niets — liever niets dan een gegokte zin).
 */
export function dekkingAsNotitie(reach: AnkerReach, pct: number | null, endAge: number | null): string | null {
  switch (reach.kind) {
    case 'gedekt':
      // ADR 0145 D12 — vóór 15 sep 2026: "Verkennen kan; er is niets vast te leggen." Dat is
      // niet meer waar: bij een gedekt plan legt het lab het eindvermogen vast. De staart spiegelt
      // de goedgekeurde tekortzin ("Draai aan de knoppen om te zien wat dat verandert.").
      return `Je plan is gedekt ${totJeEind(reach.endAge ?? endAge)}. Draai aan de knoppen om te zien wat er ${opJeEind(reach.endAge ?? endAge)} over is.`
    case 'reikt-tot':
      return `Je plan reikt nu tot je ${heroFireAgeYear(reach.age)}e — ${fmtPct(pct ?? 0)}% gedekt. Draai aan de knoppen om te zien wat dat verandert.`
    case 'nu-op':
      return `Je plan reikt nu niet verder dan vandaag — ${fmtPct(pct ?? 0)}% gedekt. Draai aan de knoppen om te zien wat dat verandert.`
    case 'onbekend':
      return null
  }
}

/**
 * Zin 9 — de radar-subtitel. `null` onder `solved` (de UI houdt dan haar bestaande
 * tekst); onder een vast anker "gerekend op je plan" resp. "op een verkend stopmoment"
 * wanneer de stop-slider (stop-pad) de rijen levert. Onder `now` is er geen slider.
 */
export function radarSubtitel(input: { stop: AnkerStop | null; verkendStopAge: number | null }): string | null {
  const { stop, verkendStopAge } = input
  if (stop == null) return null
  if (stop.kind === 'now') return "Vier dekkingsratio's — je rekent alsof je nu stopt."
  const plan = formatStopAge(stop.stopAge)
  if (verkendStopAge != null && Number.isFinite(verkendStopAge)) {
    return `Vier dekkingsratio's — gerekend op een verkend stopmoment: stoppen op ${formatStopAge(verkendStopAge)} jr; je plan rekent met ${plan}.`
  }
  return `Vier dekkingsratio's — gerekend op je plan: stoppen op ${plan}.`
}

/**
 * Zin 10 — de reden waarom radar-as 4 (eindstrategie, behoud-tak) onder een vast
 * stopmoment `null` is: `requiredFirePortfolio` is daar de stand op het anker, geen doel
 * (ADR 0087-principe, ADR 0145 D5).
 */
export function radarEindstrategieAnkerReden(): string {
  return 'Onder een vast stopmoment is er geen doelvermogen om het eindvermogen tegen af te zetten — de dekking hiernaast zegt of je plan reikt.'
}

// ── Zin 11 — antwoorden naast de knoppen (spec lab-haalbaarheid §3/§5; spec antwoorden-naast-sliders, 15 sep 2026) ──
// Beschrijvend ("dekt je plan" / "hoort bij een gedekt plan"), nooit een instructie; geen "AOW" in een tekortzin.
// Vervangt de plan-hint ("Reken met € X extra inleg", ADR 0145 D7) onder een vast anker.
// Elk antwoord staat onder zijn eigen knop; het losse blok "Wat maakt het haalbaar?" is weg.
// De knop is generiek ("Reken hiermee"): het bedrag staat al in de zin, en in de
// privacy-weergave toont de UI geen knop (de slider zou het echte bedrag verraden). Boven
// het slider-bereik heet de knop "Reken met maximum" — zo belooft hij niet wat hij niet doet.
// Geen gebiedend "Zet …" (compliance-lijn 14 sep 2026, eindreview I5): het label sluit aan op
// "Reken hiermee" en valt dus onder dezelfde strikte toon-invariant als de zinnen.
// "Uitgesmeerd tot je eindleeftijd" staat niet meer in elke zin: de ene sluitregel onder de
// twee kolommen zegt het ("Indicatie, geen advies — …").

export const ANTWOORD_KNOP = 'Reken hiermee'
export const ANTWOORD_KNOP_MAX = 'Reken met maximum'
export const ANTWOORD_BOVEN_BEREIK = 'Meer dan deze knop toelaat.'

/**
 * Antwoord 1 — de opgeloste leeftijd zonder anker (tweede run, ADR 0129 D7), op halve
 * jaren. Het getal gaat via `formatStopAge` ("61", "61,5"): het is een stopmoment.
 */
export function antwoordDoorwerken(stopAge: number): string {
  return `Doorwerken tot ${formatStopAge(stopAge)} dekt je plan.`
}

/** Het maandbedrag in een antwoordzin — de vaste placeholder in de privacy-weergave. */
function maandBedrag(hint: number, masked: boolean): string {
  return masked ? MASKED_AMOUNT_PLACEHOLDER : `€${fmtHint(hint)}`
}

// De twee €-antwoorden claimen bewust GEEN uitkomst ("hoort bij", niet "dekt"): P!B96 is
// uitgesmeerd tot de eindleeftijd (dat zegt de sluitregel), maar de slider-hefbomen stoppen op het stopmoment.
// Gemeten in lib/horizon/lab-antwoorden.kernel.test.ts: hint-bedrag gezet → 94% resp. 87%
// dekking, niet 100% (eindreview I2). "Doorwerken tot X dekt je plan." is daar wél bewezen.

/** Antwoord 2 — `planMaandHint` (P!B96 van de hoofd-run) als meer salaris (het extra-inleg-event). */
export function antwoordMeerSalaris(hint: number, masked = false): string {
  return `Zo'n ${maandBedrag(hint, masked)}/mnd meer salaris hoort bij een gedekt plan.`
}

/** Antwoord 3 — hetzelfde bedrag als minder uitgeven (dezelfde maandelijkse stroom). */
export function antwoordMinderUitgeven(hint: number, masked = false): string {
  return `Zo'n ${maandBedrag(hint, masked)}/mnd minder uitgeven hoort bij een gedekt plan.`
}

/** Doelenpagina: één regel wanneer lab-doelen niet meer bij het plan passen (spec §4.2). */
export function doelenPlanGewijzigdMelding(n: number): string {
  return `Je plan is veranderd. ${n} ${n === 1 ? 'doel' : 'doelen'} uit het lab ${n === 1 ? 'past' : 'passen'} er niet meer bij.`
}
export const DOELEN_MELDING_ACTIES = { bijwerken: 'Bijwerken', loslaten: 'Loslaten' } as const

/** Zin 12 — de toast na het vastleggen van een dekkingsdoel. */
export function dekkingVastgelegdToast(endAge: number | null): string {
  return `Je verkenning is nu je doel — de app volgt of je plan ${totJeEind(endAge)} reikt.`
}

// ── Eindvermogen als derde verandercomponent (ADR 0145 D12, eigenaarsbesluit 15 sep 2026) ──
//
// Onder een GEDEKT plan bewegen de dekking (100 %) en het bereik (het plan-einde) niet meer;
// wat er op je eindleeftijd óverblijft wél. Die grootheid staat daarom als derde component in
// het lab, en is daar ook het doel dat het lab schrijft (`end_balance`) — dat overschrijft
// eigenaarsbesluit E5 ("gedekt → geen doel uit het lab").
//
// TOON: dezelfde invarianten als hierboven — beschrijvend ("wat er over is"), nooit
// aansporend, nooit "oneindig". Het woord AOW komt hier niet voor: de aanhef noemt het
// stopmoment als getal, net als de dekkings-zinnen.
//
// GRONDSLAG: het eindvermogen is het NETTO VERMOGEN op de eindleeftijd (Prognose!I via
// `SimRow.endPortfolio = netWorth`, `pickEndBalanceAtEndAge`; bij een woonstrategie anders dan
// meerekenen telt de eigen woning mee) — NIET het liquide vermogen waar de zinnen hierboven over
// gaan (Prognose!J). Open besluit I vs J ligt bij de eigenaar (ADR 0145 D12). De bedragen die
// hier binnenkomen zijn AL GEDEFLATEERD door de aanroeper (de euro-weergave-render-grens in
// horizon-client). Dit bestand rekent niets om.

/** Een eindvermogen-bedrag in een zin; de vaste placeholder in de privacy-weergave. */
function eindBedrag(euro: number, masked: boolean): string {
  return masked ? MASKED_AMOUNT_PLACEHOLDER : formatCurrency(euro)
}

/** "op je 90e" / "op je eindleeftijd" — het moment waar het eindvermogen bij hoort. */
function opJeEind(endAge: number | null): string {
  return endAge != null ? `op je ${heroFireAgeYear(endAge)}e` : 'op je eindleeftijd'
}

/** De waarde-string van de vaste preview-rij "Eindvermogen": `nu € X → € Y op je 90e`. */
export function eindvermogenPreviewWaarde(
  basis: number,
  scenario: number,
  endAge: number | null,
  masked = false,
): string {
  return `nu ${eindBedrag(basis, masked)} → ${eindBedrag(scenario, masked)} ${opJeEind(endAge)}`
}

/**
 * De duiding achter de preview-rij wanneer het getoonde bedrag niet het opgeslagen bedrag is
 * (eindreview I4): de sheet toont in huidige euro's, het doel wordt NOMINAAL vastgelegd en de
 * doelkaart meet nominaal. Zo ziet de gebruiker vóór de klik welk getal er op de kaart komt.
 * De weergave-naam komt uit `euroViewLabel('nominal')`; de aanroeper beslist óf de noot nodig is.
 */
export function eindvermogenOpgeslagenNoot(nominaal: number): string {
  return `(opgeslagen als ${formatCurrency(nominaal)} in ${euroViewLabel('nominal').toLowerCase()})`
}

/**
 * Onder welk verschil (in weergave-euro's) de eindvermogen-delta-badge niets zegt (eindreview
 * M5): een paar euro verschil is ruis in een projectie over tientallen jaren, net zoals de
 * dekkings-delta onder één procentpunt "gelijk" heet.
 */
export const EINDVERMOGEN_DELTA_DREMPEL = 500

/**
 * De delta-badge naast de dekkings-badge: "+€ 12.000 eindvermogen" / "−€ 3.000 eindvermogen".
 * Spiegelt `dekkingDeltaBadge`; het minteken is het typografische − (U+2212), zoals overal.
 */
export function eindvermogenDeltaBadge(delta: number): string {
  return `${delta >= 0 ? '+' : '−'}${formatCurrency(Math.abs(delta))} eindvermogen`
}

/**
 * Toelichting bovenaan het vastleg-venster bij een GEDEKT plan onder een vast stopmoment —
 * de spiegel van `dekkingSheetToelichting` (die gaat over een plan dat nog niet reikt).
 */
export function eindvermogenSheetToelichting(stop: AnkerStop, endAge: number | null): string {
  const aanhef =
    stop.kind === 'now'
      ? 'Je rekent alsof je nu stopt en je plan is gedekt.'
      : `Je stopmoment ligt vast op ${formatStopAge(stop.stopAge)} en je plan is gedekt.`
  return `${aanhef} Het lab legt daarom vast wat er ${opJeEind(endAge)} over is.`
}

/**
 * De naam van het eindvermogen-doel — één bron voor de DB-rij (`buildRow('eindvermogen')` in
 * toekomst-doel.ts) én de live kaart, net als `planCoverageGoalName`.
 */
export function eindvermogenGoalName(eindleeftijd: number | null): string {
  return bruikbaar(eindleeftijd)
    ? `Eindvermogen op je ${eindleeftijd.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}e`
    : 'Eindvermogen'
}

/**
 * De n.v.t.-notitie op een lab-eindvermogen-doel wanneer het plan onder een vast stopmoment
 * NIET meer tot de eindleeftijd reikt (eindreview I1): dan is er op dat moment niets over om te
 * meten — het kernel-bedrag zou de tekort-lening zijn. Spiegel van de fire_age-notitie.
 */
export function eindvermogenGoalNotApplicableReason(endAge: number | null): string {
  return `Je plan reikt nu niet ${totJeEind(endAge)}, dus er is op dat moment niets over om te meten. Wat telt, is of je plan weer gedekt raakt.`
}

/** De toast na het vastleggen van een eindvermogen-doel. */
export function eindvermogenVastgelegdToast(endAge: number | null): string {
  return `Je verkenning is nu je doel — de app volgt wat er ${opJeEind(endAge)} over is.`
}

/**
 * De afsluitende zin voor het onttrekking-hoofdstuk van de grafiek-uitleg —
 * beschrijvend, en bij een tekort NIET de deplete-belofte ("bouwt af naar nul
 * rond X") die er vóór ADR 0127 via de `default`-tak uit rolde.
 */
export function ankerGrafiekZin(reach: AnkerReach, stop: AnkerStop): string {
  const aanhef =
    stop.kind === 'now'
      ? 'Je werkt in dit beeld niet meer: je onttrekt vanaf vandaag'
      : `Je werkt in dit beeld tot je ${formatStopAge(stop.stopAge)} bent: je onttrekt vanaf dat moment`
  switch (reach.kind) {
    case 'gedekt':
      return reach.endAge != null
        ? `${aanhef}, en je liquide vermogen reikt tot je ${heroFireAgeYear(reach.endAge)}e — het einde van je plan.`
        : `${aanhef}, en je liquide vermogen reikt tot het einde van je plan.`
    case 'reikt-tot':
      return `${aanhef}, en je liquide vermogen reikt tot je ${heroFireAgeYear(reach.age)}e.`
    case 'nu-op':
      return stop.kind === 'now'
        ? `${aanhef}, en je liquide vermogen dekt die uitgaven niet.`
        : `${aanhef}, maar je liquide vermogen is vandaag al op.`
    case 'onbekend':
      return `${aanhef}. Tot welke leeftijd je liquide vermogen reikt kunnen we nog niet bepalen.`
  }
}
