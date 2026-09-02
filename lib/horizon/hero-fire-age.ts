// lib/horizon/hero-fire-age.ts
//
// ÉÉN bron voor het kernantwoord van /toekomst: de vrijheids-/pensioenleeftijd
// in de hero-KPI, de kassabon eronder, en de welkomst-/exit-overlay.
//
// AANLEIDING (bevinding C1, 24-08-2026): dezelfde vraag kreeg per laadbeurt een
// ander antwoord. Niet omdat de gegevens wijzigden, maar omdat drie
// verschillende motoren op dezelfde plek mochten antwoorden zodra de
// canonieke motor nog niet klaar was:
//   1. de horizon-kernel (`simResult`)          — canoniek, async via web worker
//   2. de laatst weggeschreven `net_worth_snapshots.fire_age`
//   3. `computeFireProjection` (fire-scalar.ts) — een TWEEDE, eigen while-loop
// Bron 3 is een tweede motor op één grootheid en mag hier niet meer antwoorden
// (zie `lib/architecture/calculations.ts`, calc "scalar-fire-router": "nieuwe
// call-sites ... NOOIT computeFireProjection rechtstreeks").
//
// CORRECTIE (bevinding H21, 27-08-2026): bron 2 werd hier omschreven als "een
// eerder kernel-antwoord". Dat klopte niet — `net_worth_snapshots.fire_age`
// wordt door `app/api/snapshots/*` geschreven met de RAUWE scalar-lus
// (`computeFireProjection`), dus bron 2 was in de praktijk bron 3 met een
// datumstempel: de eerste paint toonde stelselmatig een andere leeftijd dan de
// worker die erna landde. De voorlopige bron is nu de SERVER-KERNELRUN
// (`computeHorizonFireSim` → `HorizonPageData.fireAgeFractional`): dezelfde
// motor, verse data. Hij blijft 'voorlopig' heten omdat de client-run met
// verse rijen en actieve schuifjes er nog van kán afwijken — maar niet meer
// omdat er een andere rekenwijze onder ligt.
//
// De regel die dit bestand afdwingt: er is altijd precies één getal én er staat
// altijd bij hoe hard het is. Kan de kernel het niet, dan is "we weten het nog
// niet" het antwoord — geen tweede antwoord.

import { HORIZON_MISSENDE_GEGEVENS_LABEL, guardFreedomAge } from './outcome-guard'

/** Hoe hard is het getoonde getal? */
export type HeroAnswerStatus =
  /** De canonieke motor heeft geantwoord; dit getal verandert niet meer vanzelf. */
  | 'definitief'
  /** De server-kernelrun of een nog niet geladen AOW-tabel — kan nog wijzigen. */
  | 'voorlopig'
  /** De kernel rekent nog en er is geen eerder antwoord om te tonen. */
  | 'berekenen'
  /** Er is geen antwoord: niet haalbaar, of er valt niets te berekenen. */
  | 'onbekend'
  /**
   * De motor gaf wél een leeftijd, maar één die niet kán kloppen — op of voorbij
   * het horizonplafond (de parkeerstand van de bisectie, bevinding M6). Dat is
   * geen "niet haalbaar" maar een gegevensprobleem: er staat een gegevensmelding
   * i.p.v. een getal. `age` is `null`, zodat geen enkele consument het
   * parkeerstand-getal alsnog als drempel of grafiekmarker gebruikt.
   */
  | 'ongeldig'

/**
 * Waar het getoonde getal vandaan komt. `null` als er geen getal is.
 * `'kernel-runway'` (ADR 0127): onder 'nu-stoppen' is het getal geen FIRE-leeftijd
 * maar de leeftijd tot waar het vermogen reikt (`kernelDepletionMonth` → leeftijd,
 * of de eigen eindleeftijd wanneer het geld daar reikt).
 */
export type HeroAnswerBron = 'kernel' | 'server-kernel' | 'aow-tabel' | 'kernel-runway'

export interface HeroFireAge {
  status: HeroAnswerStatus
  /** Leeftijd in jaren (fractioneel). `null` bij 'berekenen' en 'onbekend'. */
  age: number | null
  bron: HeroAnswerBron | null
}

export interface HeroFireAgeInput {
  /** Heeft de horizon-kernel een resultaat afgeleverd? (`simResult != null`) */
  hasKernelResult: boolean
  /** `simResult.fireAgeFractional` — de precieze kernel-uitkomst. */
  kernelFireAgeFractional?: number | null
  /** `simResult.fireAge` — hele jaren, alleen als de fractionele ontbreekt. */
  kernelFireAge?: number | null
  /** `simResult.strategy === 'pensioen'`: de hero toont dan de AOW-leeftijd. */
  isPensioenMode?: boolean
  /**
   * `simResult.strategy === 'nu-stoppen'` (ADR 0127 D6): de hero toont dan NIET de
   * kernel-`fireAge` (die is per constructie de startleeftijd) maar de leeftijd tot
   * waar het vermogen reikt — spiegel van `isPensioenMode`. `planningMode` blijft
   * tweewaardig; dit is een eigen tak, geen derde mode.
   */
  isNuStoppenMode?: boolean
  /**
   * De runway van de stop-nu-run, uit dezelfde kernel-run als `simResult`:
   * `depletionAgeFractional` = `startLeeftijd + kernelDepletionMonth / 12` (of `null`
   * wanneer het geld — op bruggetjes na — tot de eindleeftijd/horizon reikt) en
   * `endAge` = de eigen eindleeftijd (`simResult.displayEndAge`). `null`/weggelaten
   * = nog geen run → 'berekenen' (zolang de kernel rekent) of 'onbekend'.
   */
  nuStoppenRunway?: { depletionAgeFractional: number | null; endAge: number } | null
  /** `userAowAge.fractional`. */
  aowAgeFractional?: number | null
  /**
   * Is de wettelijke AOW-tabel client-side beschikbaar? Zo niet, dan staat
   * `userAowAge` nog op de 67-terugval uit `lookupAowAge` — precies het "exact
   * 67"-getal uit de bevinding. Dat is dan een voorlopige waarde, geen antwoord.
   */
  aowTableLoaded?: boolean
  /**
   * De SERVER-kernelrun (`HorizonPageData.fireAgeFractional`, uit
   * `computeHorizonFireSim`) — dezelfde motor als de client-worker, maar al
   * beschikbaar bij de eerste paint. Bewust NIET `net_worth_snapshots.fire_age`:
   * die kolom komt uit de rauwe scalar-lus (zie de correctie in de module-doc).
   */
  serverFireAge?: number | null
  /** Draait de kernel-worker nog? (`isRefining` uit `useHorizonFireSim`) */
  isRefining?: boolean
}

const ONBEKEND: HeroFireAge = { status: 'onbekend', age: null, bron: null }
const BEREKENEN: HeroFireAge = { status: 'berekenen', age: null, bron: null }
const ONGELDIG: HeroFireAge = { status: 'ongeldig', age: null, bron: null }

/**
 * Bepaalt welk getal de hero-KPI toont én hoe hard dat getal is.
 *
 * Volgorde is bewust: de client-kernel wint altijd; daarna de SERVER-kernelrun
 * (dezelfde motor, expliciet voorlopig); daarna niets. `computeFireProjection` komt in
 * deze keten niet voor — dat is de tweede motor die de bevinding veroorzaakte.
 */
export function resolveHeroFireAge(input: HeroFireAgeInput): HeroFireAge {
  // Nu-stoppen-modus (ADR 0127 D6): de kernel-`fireAge` ís de startleeftijd en zegt
  // niets; het kernantwoord is tot welke leeftijd het vermogen reikt. Geen
  // M6-vangrail hier: een runway die tot de eindleeftijd (bv. 100) reikt is een
  // antwoord, geen parkeerstand.
  if (input.isNuStoppenMode) {
    const runway = input.nuStoppenRunway
    if (runway == null) return input.isRefining ? BEREKENEN : ONBEKEND
    const age = runway.depletionAgeFractional ?? runway.endAge
    if (!Number.isFinite(age)) return ONBEKEND
    return { status: 'definitief', age, bron: 'kernel-runway' }
  }

  // Pensioen-modus: de hero toont de wettelijke AOW-leeftijd, niet een
  // FIRE-leeftijd. `isPensioenMode` volgt uit `simResult.strategy`, dus de
  // kernel heeft hier per definitie al geantwoord; de onzekerheid zit
  // uitsluitend in de AOW-tabel.
  if (input.isPensioenMode) {
    const aow = input.aowAgeFractional
    if (aow == null || !Number.isFinite(aow)) return BEREKENEN
    return {
      status: input.aowTableLoaded ? 'definitief' : 'voorlopig',
      age: aow,
      bron: 'aow-tabel',
    }
  }

  if (input.hasKernelResult) {
    const age = input.kernelFireAgeFractional ?? input.kernelFireAge ?? null
    // Kernel klaar zonder leeftijd = "niet haalbaar binnen de horizon". Dat is
    // een antwoord, geen gat — en zeker geen aanleiding voor een tweede motor.
    if (age == null || !Number.isFinite(age)) return ONBEKEND
    // M6-vangrail: een leeftijd op/voorbij het horizonplafond is de parkeerstand
    // van de bisectie, geen antwoord. De rekenkant hiervan is bij de bron gefixt
    // (solver-scoping op een negatief doelbedrag); dit is de tweede linie.
    if (!guardFreedomAge(age).ok) return ONGELDIG
    return { status: 'definitief', age, bron: 'kernel' }
  }

  const server = input.serverFireAge
  if (server != null && Number.isFinite(server)) {
    if (!guardFreedomAge(server).ok) return ONGELDIG
    return { status: 'voorlopig', age: server, bron: 'server-kernel' }
  }

  return input.isRefining ? BEREKENEN : ONBEKEND
}

/**
 * Het HELE JAAR dat een fractionele leeftijd op het scherm krijgt.
 *
 * ÉÉN afrondingsregel voor de hele /toekomst-seam: het kopgetal van de
 * hero-KPI (`formatHeroFireAge`) én de duidingszin eronder
 * (`lib/horizon/vrijheidsleeftijd-zin.ts`) lezen hier. Dat is geen
 * schoonheidsfoutje-preventie maar de kern van bevinding S15: zou de zin
 * anders afronden dan de KPI, dan staat er "rond je 53e" pal onder een
 * kopgetal dat 54 toont — en dat leest als een fout.
 *
 * `Math.round` en niet `floor`: sinds bevinding M5 (27-08-2026) toont het
 * kopgetal zelf hele jaren via afronding, niet meer `.toFixed(1)`. De
 * overlay-samenvatting en de welkomstkaart deden al hetzelfde. Wie dit ooit
 * naar `floor` wil verzetten, verzet het hier — voor alle drie tegelijk.
 */
export function heroFireAgeYear(age: number): number {
  return Math.round(age)
}

export interface FormatHeroFireAgeOptions {
  /** Voorgeformatteerde AOW-leeftijd ("67j + 3m"); alleen gebruikt bij bron 'aow-tabel'. */
  aowText?: string
  /** Teken voor "geen antwoord". Per oppervlak anders ('–' vs '-'). */
  dash?: string
  /** Tekst zolang de kernel rekent. */
  pendingText?: string
}

/**
 * Weergavevorm van het kernantwoord. Eén functie, zodat de hero, de kassabon en
 * de overlay per constructie hetzelfde getal in dezelfde vorm tonen.
 *
 * PRECISIE (bevinding M5, 27-08-2026): het kopgetal toont HELE jaren. Een
 * vrijheidsleeftijd van "52,8 jaar" belooft een tiende-van-een-jaar-nauwkeurige
 * projectie vijftien jaar vooruit — schijnzekerheid. De welkomstoverlay op
 * dezelfde pagina (`toekomst-welcome.tsx`) rondde al af op een heel jaar
 * ("rond je 53e"); dat was dus twee weergavestijlen voor één getal, op één
 * scherm. Hele jaren is nu de enige stijl in deze seam. De fractionele waarde
 * blijft ongemoeid in `state.age` — de kassabon toont hem exact, want dáár is
 * de onderbouwing juist het punt.
 */
export function formatHeroFireAge(state: HeroFireAge, opts: FormatHeroFireAgeOptions = {}): string {
  const dash = opts.dash ?? '–'
  if (state.bron === 'aow-tabel') {
    if (opts.aowText) return opts.aowText
    return state.age != null ? `${heroFireAgeYear(state.age)} jaar` : dash
  }
  if (state.age != null) return String(heroFireAgeYear(state.age))
  if (state.status === 'berekenen') return opts.pendingText ?? 'berekenen…'
  return dash
}

/** Toont dit oppervlak nu iets dat nog kan verschuiven? */
export function isHeroAnswerPending(state: HeroFireAge): boolean {
  return state.status === 'voorlopig' || state.status === 'berekenen'
}

/**
 * Is dit een uitkomst die we NIET als getal mogen tonen (M6)? De aanroeper zet
 * dan de gegevensmelding neer i.p.v. het kopgetal.
 */
export function isHeroAnswerInvalid(state: HeroFireAge): boolean {
  return state.status === 'ongeldig'
}

/**
 * Onderschrift bij het getal. `base` is het normale bijschrift ('jaar',
 * 'AOW-leeftijd'); bij een niet-definitief antwoord komt de waarschuwing ervoor
 * in de plaats of erbij, zodat de gebruiker nooit een voorlopig getal voor een
 * eindantwoord aanziet.
 */
export function heroFireAgeCaption(state: HeroFireAge, base: string): string {
  if (state.status === 'berekenen') return 'wordt berekend…'
  // M6: geen getal, dus ook geen eenheid — de gegevensmelding IS het onderschrift.
  // Zelfde formulering als elk ander oppervlak (één bron in outcome-guard.ts).
  if (state.status === 'ongeldig') return HORIZON_MISSENDE_GEGEVENS_LABEL.toLowerCase()
  if (state.status === 'voorlopig') return base ? `${base} · voorlopig` : 'voorlopig'
  return base
}
