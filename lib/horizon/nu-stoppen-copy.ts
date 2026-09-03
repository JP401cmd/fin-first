// lib/horizon/nu-stoppen-copy.ts
//
// ÉÉN bron voor het antwoord dat de eindstrategie 'Nu stoppen' (ADR 0127) op
// elk oppervlak geeft: *tot welke leeftijd reikt je LIQUIDE vermogen als je
// vandaag stopt?* — plus de woorden eromheen.
//
// "LIQUIDE" IS GEEN VERSIERING, HET IS DE GRONDSLAG. De runway leest
// `Prognose!J` = `nettoVermogen − (niet-liquide bezit − niet-liquide leningen)`:
// je eigen woning zit er niet in (en de hypotheek die eraan hangt evenmin),
// tenzij je woonstrategie hem liquide maakt — verkopen of opeethypotheek. Dat
// is de juiste grondslag, want van een woning kun je je boodschappen niet
// betalen. Maar op /overzicht staat het netto vermogen ERBOVEN, mét woning, en
// dat verschil kan een veelvoud zijn. Een zin die daar "je vermogen" zegt laat
// de lezer twee ongelijke grootheden op elkaar leggen — precies wat CLAUDE.md
// verbiedt voor netto vermogen versus de liquide portefeuille. Vandaar dat élke
// zin hier het woord draagt; schrijf het niet weg om de tekst te "verkorten".
//
// De term is `liquide vermogen` omdat de app die al ~90× gebruikt. Niet
// "vrij besteedbaar": dat is hier bezet voor het deel van je INKOMEN dat
// overblijft na vaste lasten en sparen — een ander begrip.
//
// WAAROM EEN EIGEN MODULE. Onder deze strategie is de kernel-`fireAge` per
// constructie de STARTleeftijd (D1): elk oppervlak dat "vrijheidsleeftijd 47"
// toont zegt dan iets waars én betekenisloos. Het echte antwoord is de RUNWAY —
// `kernelDepletionMonth` uit dezelfde run (ADR 0126). Die vertaling van
// maand → leeftijd → zin stond op het punt om op zes plekken los te ontstaan
// (hero-KPI, statusblok, grafiek-uitleg, strategie-modal, /overzicht-strip,
// vrijheidsbanner). Dit bestand is die ene plek.
//
// CONSUME-ONLY. Er wordt hier niets gerekend behalve de maand→jaar-omzetting
// die `lib/horizon/runway.ts` zelf ook doet (`startLeeftijd + months / 12`);
// de uitputtingsmaand, de startleeftijd en de eindleeftijd komen alle drie
// kant-en-klaar uit de kernel-run. Geen deflator: een leeftijd is een moment,
// geen euro (ADR 0093).
//
// TOON (harde randvoorwaarde uit het besluit). De app zegt NIET dat je kunt
// stoppen — ze zegt hoe ver je vermogen reikt. Beschrijvend, nooit aansporend;
// geen "oneindig" (het model stopt bij leeftijd 100 en claimt daar niets
// voorbij); en nooit de AOW-leeftijd, want een tekort onder dit anker kan ook
// ná de AOW vallen — precies waarom `stop_now_shortfall` een eigen status
// kreeg naast `pension_shortfall` (D2).

import { heroFireAgeYear } from './hero-fire-age'
import type { RunwayResult } from './runway'

/**
 * Tot waar het vermogen reikt onder 'Nu stoppen'. Vier uitkomsten, bewust
 * gescheiden zodat geen enkel oppervlak een tekort als "gedekt" kan tonen.
 */
export type NuStoppenReach =
  /** Het geld reikt tot het einde van het plan. `endAge` = de eigen eindleeftijd
   *  (`null` wanneer de run tot voorbij de horizon reikt en dus geen plan-einde noemt). */
  | { readonly kind: 'gedekt'; readonly endAge: number | null }
  /** Het geld raakt op vóór de eindleeftijd, op `age` (fractioneel). */
  | { readonly kind: 'reikt-tot'; readonly age: number; readonly endAge: number | null }
  /** Vandaag al geen vermogen om de uitgaven uit te dekken. */
  | { readonly kind: 'nu-op' }
  /** Geen run / geen bruikbare invoer — er valt niets te zeggen. */
  | { readonly kind: 'onbekend' }

const ONBEKEND: NuStoppenReach = { kind: 'onbekend' }

function bruikbaar(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n)
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
export function nuStoppenReachFromSim(input: {
  /** `KernelInput.startLeeftijd` — onder dit anker gelijk aan `SimResult.fireAge`. */
  startAge: number | null | undefined
  /** `SimResult.kernelDepletionMonth` — rauw, zie hierboven. */
  kernelDepletionMonth: number | null | undefined
  /** `SimResult.displayEndAge` — de eigen eindleeftijd (D2, niet de 100 van 'pensioen'). */
  endAge: number | null | undefined
}): NuStoppenReach {
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
 * Idem, maar uit een reeds geduide `RunwayResult` (de stop-nu-run die
 * /overzicht toch al draait — geen tweede run).
 */
export function nuStoppenReachFromRunway(runway: RunwayResult): NuStoppenReach {
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

// ── Woorden ────────────────────────────────────────────────────────────────

/** Het KPI-label dat onder deze strategie in de plaats van "Vrijheidsleeftijd" komt. */
export const NU_STOPPEN_KPI_LABEL = 'Reikt tot'
/** Dezelfde kop op smal scherm (past al; één constante zodat ze niet uiteenlopen). */
export const NU_STOPPEN_KPI_LABEL_KORT = 'Reikt tot'
/** De kop van het statusblok / de banner. */
export const NU_STOPPEN_TITEL = 'Je rekent alsof je nu stopt'

/**
 * Het HELE JAAR dat op het scherm komt — via dezelfde afrondingsregel als het
 * kopgetal van de hero-KPI (`heroFireAgeYear`), zodat de zin en het getal
 * erboven nooit één jaar uiteenlopen (bevinding S15).
 */
export function nuStoppenReachYear(reach: NuStoppenReach): number | null {
  if (reach.kind === 'reikt-tot') return heroFireAgeYear(reach.age)
  if (reach.kind === 'gedekt') return reach.endAge != null ? heroFireAgeYear(reach.endAge) : null
  return null
}

/** Onderschrift bij het KPI-getal: 'jaar' of, bij volledige dekking, de duiding. */
export function nuStoppenKpiCaption(reach: NuStoppenReach): string {
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
 * Vervangt onder deze strategie de `FIRE: 47 jr`/`AOW: 67 jr`-regel.
 */
export function nuStoppenKort(reach: NuStoppenReach): string {
  const jaar = nuStoppenReachYear(reach)
  if (jaar != null) return `${NU_STOPPEN_KPI_LABEL}: ${jaar} jr`
  if (reach.kind === 'nu-op') return `${NU_STOPPEN_KPI_LABEL}: vandaag`
  return `${NU_STOPPEN_KPI_LABEL}: —`
}

/**
 * De volledige, beschrijvende zin — voor het statusblok op /toekomst, de
 * grafiek-uitleg en de /overzicht-strip.
 *
 * Nooit aansporend ("je kunt nu stoppen"), nooit "oneindig", nooit de AOW.
 */
export function nuStoppenZin(reach: NuStoppenReach): string {
  switch (reach.kind) {
    case 'gedekt':
      return reach.endAge != null
        ? `Als je nu stopt, reikt je liquide vermogen tot je ${heroFireAgeYear(reach.endAge)}e — het einde van je plan.`
        : 'Als je nu stopt, reikt je liquide vermogen tot het einde van je plan.'
    case 'reikt-tot': {
      const jaar = heroFireAgeYear(reach.age)
      return reach.endAge != null
        ? `Als je nu stopt, reikt je liquide vermogen tot je ${jaar}e. Je plan loopt tot je ${heroFireAgeYear(reach.endAge)}e.`
        : `Als je nu stopt, reikt je liquide vermogen tot je ${jaar}e.`
    }
    case 'nu-op':
      return 'Als je nu stopt, dekt je liquide vermogen je uitgaven vanaf vandaag niet.'
    case 'onbekend':
      return 'We kunnen nog niet bepalen tot welke leeftijd je liquide vermogen reikt.'
  }
}

/**
 * Korte variant van dezelfde uitspraak, voor een strip of banner waar de zin
 * naast een kop staat en dus geen aanhef nodig heeft.
 */
export function nuStoppenZinKort(reach: NuStoppenReach): string {
  switch (reach.kind) {
    case 'gedekt':
      return reach.endAge != null
        ? `je liquide vermogen reikt tot je ${heroFireAgeYear(reach.endAge)}e`
        : 'je liquide vermogen reikt tot het einde van je plan'
    case 'reikt-tot':
      return `je liquide vermogen reikt tot je ${heroFireAgeYear(reach.age)}e`
    case 'nu-op':
      return 'je liquide vermogen dekt je uitgaven vanaf vandaag niet'
    case 'onbekend':
      return 'we kunnen nog niet bepalen tot welke leeftijd je liquide vermogen reikt'
  }
}

/**
 * De afsluitende zin voor het onttrekking-hoofdstuk van de grafiek-uitleg —
 * beschrijvend, en bij een tekort NIET de deplete-belofte ("bouwt af naar nul
 * rond X") die er vóór ADR 0127 via de `default`-tak uit rolde.
 */
export function nuStoppenGrafiekZin(reach: NuStoppenReach): string {
  switch (reach.kind) {
    case 'gedekt':
      return reach.endAge != null
        ? `Je werkt in dit beeld niet meer: je onttrekt vanaf vandaag, en je liquide vermogen reikt tot je ${heroFireAgeYear(reach.endAge)}e — het einde van je plan.`
        : 'Je werkt in dit beeld niet meer: je onttrekt vanaf vandaag, en je liquide vermogen reikt tot het einde van je plan.'
    case 'reikt-tot':
      return `Je werkt in dit beeld niet meer: je onttrekt vanaf vandaag, en je liquide vermogen reikt tot je ${heroFireAgeYear(reach.age)}e.`
    case 'nu-op':
      return 'Je werkt in dit beeld niet meer: je onttrekt vanaf vandaag, en je liquide vermogen dekt die uitgaven niet.'
    case 'onbekend':
      return 'Je werkt in dit beeld niet meer: je onttrekt vanaf vandaag. Tot welke leeftijd je liquide vermogen reikt kunnen we nog niet bepalen.'
  }
}
