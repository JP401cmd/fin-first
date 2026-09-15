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
import { MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'
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

/** De drie hefbomen + de secundaire knop (spec lab-haalbaarheid §2/§5, 15 sep 2026). */
export const HEFBOOM_COPY = {
  meerOpzij: 'Meer opzij',
  minderUitgeven: 'Minder uitgeven',
  laterEerder: 'Later of eerder stoppen',
  minderWerken: 'Minder werken',
  werkdagen: 'Werkdagen per week',
} as const

/** Sectie 2 van de Vrijheidsas onder een vast anker (spec lab-haalbaarheid §1/§5). */
export const DEKKINGSAS_COPY = {
  kop: 'Reikt je plan?',
  tag: 'de dekking',
  sliderLabel: 'Doorwerken tot',
  tegelReikt: 'Reikt tot',
  tegelPlan: 'Plan tot',
  tegelGedekt: 'Gedekt',
} as const

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
      return `Je plan is gedekt ${totJeEind(reach.endAge ?? endAge)}. Verkennen kan; er is niets vast te leggen.`
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

// ── Zin 11 — antwoordenblok "Wat maakt het haalbaar?" (spec lab-haalbaarheid §3/§5, 15 sep 2026) ──
// Beschrijvend ("dekt je plan"), nooit een instructie; geen "AOW" in een tekortzin.
// Vervangt de plan-hint ("Reken met € X extra inleg", ADR 0145 D7) onder een vast anker.
// De knop is generiek ("Reken hiermee"): het bedrag staat al in de zin, en in de
// privacy-weergave toont de UI geen knop (de slider zou het echte bedrag verraden).

export const ANTWOORDEN_KOP = 'Wat maakt het haalbaar?'
export const ANTWOORD_KNOP = 'Reken hiermee'
export const ANTWOORD_BOVEN_BEREIK = 'Dat is meer dan de knop toelaat — de knop zet het hoogste bedrag.'

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

/** Antwoord 2 — `maandHint` (P!B96) als extra inleg. */
export function antwoordExtraOpzij(hint: number, masked = false): string {
  return `Zo'n ${maandBedrag(hint, masked)} per maand extra opzij dekt je plan.`
}

/** Antwoord 3 — hetzelfde bedrag als minder uitgeven (dezelfde maandelijkse stroom). */
export function antwoordMinderUitgeven(hint: number, masked = false): string {
  return `Zo'n ${maandBedrag(hint, masked)} per maand minder uitgeven dekt je plan.`
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
