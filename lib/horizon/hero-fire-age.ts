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
//   2. de laatst weggeschreven kernel-scalar    — `net_worth_snapshots.fire_age`
//   3. `computeFireProjection` (fire-scalar.ts) — een TWEEDE, eigen while-loop
// Bron 3 is een tweede motor op één grootheid en mag hier niet meer antwoorden
// (zie `lib/architecture/calculations.ts`, calc "scalar-fire-router": "nieuwe
// call-sites ... NOOIT computeFireProjection rechtstreeks"). Bron 2 mag wel
// antwoorden — het is een eerder kernel-antwoord — maar dan expliciet als
// VOORLOPIG, nooit als een van de eindwaarde ononderscheidbaar getal.
//
// De regel die dit bestand afdwingt: er is altijd precies één getal én er staat
// altijd bij hoe hard het is. Kan de kernel het niet, dan is "we weten het nog
// niet" het antwoord — geen tweede antwoord.

/** Hoe hard is het getoonde getal? */
export type HeroAnswerStatus =
  /** De canonieke motor heeft geantwoord; dit getal verandert niet meer vanzelf. */
  | 'definitief'
  /** Een eerder kernel-antwoord (snapshot) of nog niet geladen AOW-tabel — kan nog wijzigen. */
  | 'voorlopig'
  /** De kernel rekent nog en er is geen eerder antwoord om te tonen. */
  | 'berekenen'
  /** Er is geen antwoord: niet haalbaar, of er valt niets te berekenen. */
  | 'onbekend'

/** Waar het getoonde getal vandaan komt. `null` als er geen getal is. */
export type HeroAnswerBron = 'kernel' | 'snapshot' | 'aow-tabel'

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
  /** `userAowAge.fractional`. */
  aowAgeFractional?: number | null
  /**
   * Is de wettelijke AOW-tabel client-side beschikbaar? Zo niet, dan staat
   * `userAowAge` nog op de 67-terugval uit `lookupAowAge` — precies het "exact
   * 67"-getal uit de bevinding. Dat is dan een voorlopige waarde, geen antwoord.
   */
  aowTableLoaded?: boolean
  /** `net_worth_snapshots.fire_age` — het laatst weggeschreven kernel-antwoord. */
  snapshotFireAge?: number | null
  /** Draait de kernel-worker nog? (`isRefining` uit `useHorizonFireSim`) */
  isRefining?: boolean
}

const ONBEKEND: HeroFireAge = { status: 'onbekend', age: null, bron: null }
const BEREKENEN: HeroFireAge = { status: 'berekenen', age: null, bron: null }

/**
 * Bepaalt welk getal de hero-KPI toont én hoe hard dat getal is.
 *
 * Volgorde is bewust: de kernel wint altijd; daarna een EERDER kernel-antwoord
 * (snapshot, expliciet voorlopig); daarna niets. `computeFireProjection` komt in
 * deze keten niet voor — dat is de tweede motor die de bevinding veroorzaakte.
 */
export function resolveHeroFireAge(input: HeroFireAgeInput): HeroFireAge {
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
    return { status: 'definitief', age, bron: 'kernel' }
  }

  const snapshot = input.snapshotFireAge
  if (snapshot != null && Number.isFinite(snapshot)) {
    return { status: 'voorlopig', age: snapshot, bron: 'snapshot' }
  }

  return input.isRefining ? BEREKENEN : ONBEKEND
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
 */
export function formatHeroFireAge(state: HeroFireAge, opts: FormatHeroFireAgeOptions = {}): string {
  const dash = opts.dash ?? '–'
  if (state.bron === 'aow-tabel') {
    if (opts.aowText) return opts.aowText
    return state.age != null ? `${Math.round(state.age)} jaar` : dash
  }
  if (state.age != null) return state.age.toFixed(1)
  if (state.status === 'berekenen') return opts.pendingText ?? 'berekenen…'
  return dash
}

/** Toont dit oppervlak nu iets dat nog kan verschuiven? */
export function isHeroAnswerPending(state: HeroFireAge): boolean {
  return state.status === 'voorlopig' || state.status === 'berekenen'
}

/**
 * Onderschrift bij het getal. `base` is het normale bijschrift ('jaar',
 * 'AOW-leeftijd'); bij een niet-definitief antwoord komt de waarschuwing ervoor
 * in de plaats of erbij, zodat de gebruiker nooit een voorlopig getal voor een
 * eindantwoord aanziet.
 */
export function heroFireAgeCaption(state: HeroFireAge, base: string): string {
  if (state.status === 'berekenen') return 'wordt berekend…'
  if (state.status === 'voorlopig') return base ? `${base} · voorlopig` : 'voorlopig'
  return base
}
