// lib/horizon/vrijheidsleeftijd-zin.ts
//
// ÉÉN bron voor de zin die het kerngetal van /toekomst vertaalt: "werken wordt
// voor jou een keuze rond je 53e".
//
// AANLEIDING (bevinding S15). Die zin bestond al op drie plekken — de
// tips-/spotlight-overlay (`toekomst-overlay.tsx`), de eenmalige welkomstkaart
// (`toekomst-welcome.tsx`) en de vrijheidsas — maar nergens op de pagina zelf.
// In Eenvoudig blijven van de hero-strip drie kale KPI's over en volgt daar
// direct de voortgangsbalk op: het kerngetal krijgt dan geen enkele duiding.
// De zin er simpelweg bíj zetten zou de formulering op vier plekken zetten en
// de leeftijds-afleiding op vijf — per definitie toekomstige drift. Vandaar
// deze module: de formulering woont hier, elk oppervlak formatteert zelf.
//
// GEEN JSX, met opzet: de uitkomst is opgeknipt in `lead` / `ageLabel` / `tail`
// zodat elk oppervlak de leeftijd eigen opmaak kan geven (de overlay zet 'm in
// `--module-active-800`, de welkomstkaart in `-700`) zonder dat de woorden
// uiteenlopen. `text` is dezelfde zin als platte tekst — voor aria-labels en
// voor tests die de hele regel willen pinnen.
//
// GEEN BEDRAG in deze zin, ook met opzet: een leeftijd valt buiten de
// deflator-regels (ADR 0090/0093) en buiten de bedrag-maskering (ADR 0091).
//
// AFRONDING: via `heroFireAgeYear` uit ./hero-fire-age — exact dezelfde regel
// als het kopgetal in de hero-KPI. Zie de noot bij `VrijheidsleeftijdZinInput`.

import { heroFireAgeYear } from './hero-fire-age'
import { ankerZin, ankerZinKort, type AnkerReach, type AnkerStop } from './anker-copy'
import type { FreedomFraming, StopAnchor } from '@/lib/fire-strategy'

/**
 * Welke boodschap de zin draagt.
 * - `leeftijd`  — er is een vrijheids-/pensioenleeftijd; de zin noemt 'm.
 * - `nu-al`     — de gebruiker is al vrij (of al met pensioen); geen leeftijd.
 * - `onbekend`  — geen leeftijd bekend of niet haalbaar binnen de horizon.
 * - `berekenen` — de kernel rekent nog. Oppervlakken renderen dan NIETS; een
 *                 flits van "vrijheid nog niet in zicht" die een seconde later
 *                 een leeftijd wordt, leest als een fout.
 */
export type VrijheidsleeftijdZinKind = 'leeftijd' | 'nu-al' | 'onbekend' | 'berekenen'

/**
 * Per oppervlak verschilt de vórm, niet de inhoud.
 * - `duiding`  — de regel onder het kerngetal op /toekomst (nieuw bij S15).
 * - `kaart`    — de belofte-zin op de welkomstkaart: hoofdletter, punt erachter.
 * - `inline`   — de samenvattingsregel in de tips-overlay: kleine letter,
 *                geen punt, want hij staat midden in een regel naast het
 *                netto vermogen.
 *
 * `kaart` en `inline` reproduceren de strings die vóór S15 in die twee
 * bestanden hardgecodeerd stonden, byte-voor-byte — hun bestaande suites
 * (`toekomst-welcome.test.tsx`, `toekomst-overlay.test.tsx`) draaien
 * ongewijzigd door en zijn daarmee het bewijs van de ontdubbeling.
 */
export type VrijheidsleeftijdZinVariant = 'duiding' | 'kaart' | 'inline'

export interface VrijheidsleeftijdZinInput {
  /**
   * De vrijheids-/pensioenleeftijd zoals de pagina 'm toont — canoniek
   * aangeleverd (`HeroFireAge.age`, of `perspectiveHero.fireAge`). Nooit hier
   * herberekend: consume, don't recompute.
   */
  freedomAge: number | null
  /**
   * Uitkomst van `resolveFreedomFraming()` (lib/fire-strategy.ts). Bij `'free'` is
   * de leeftijd geen belofte meer maar een feit, en zegt de zin dat ook. Default
   * `'building'`. ('anchored' — een vast anker, nog niet vrij — wordt hier gedragen
   * door `ankerReach`: die zin gaat over bereik, niet over een moment.)
   */
  framing?: FreedomFraming
  /**
   * Het anker waarop `framing` is beoordeeld (`FreedomAgeView.anchor`); bepaalt onder
   * 'free' de woordkeuze "pensioen" (aow-anker) vs. "keuze" (de rest). Optioneel:
   * weggelaten ⇒ `isPensioen` (legacy) beslist.
   */
  anchor?: StopAnchor | null
  /** Toont de pagina de AOW-/pensioenleeftijd i.p.v. een FIRE-leeftijd? (legacy; zie `anchor`). */
  isPensioen?: boolean
  /**
   * ADR 0129 — een VAST stop-anker (aow/now/age). Dan gaat deze zin NIET over een
   * moment ("werken wordt een keuze rond je 53e") maar over BEREIK: het stopmoment
   * ligt al vast, dus de enige uitspraak is tot welke leeftijd het vermogen reikt.
   * Zonder deze invoer zou de leeftijd-tak de bereik-leeftijd als vrijheidsmoment
   * aankondigen — een belofte die het getal niet draagt.
   *
   * Consume-only: afgeleid met `ankerReachFromSim` uit dezelfde kernel-run. Het
   * stopmoment (`ankerStop`) geeft de zin haar aanhef ("nu" / "op 62"); weggelaten
   * ⇒ het nu-anker (het gedrag van vóór F3a onder 'nu-stoppen').
   */
  ankerReach?: AnkerReach | null
  /** Het stopmoment bij `ankerReach` (`ankerStopFromSim`); weggelaten ⇒ `{ kind: 'now' }`. */
  ankerStop?: AnkerStop | null
  /** @deprecated F4 — alias van `ankerReach` voor lezers van vóór F3a. */
  nuStoppenReach?: AnkerReach | null
  /**
   * Rekent de kernel nog? Dan `kind: 'berekenen'` en rendert het oppervlak niets.
   */
  pending?: boolean
  /**
   * D3 — huishoud-/partnerweergave: de zin spreekt dan niet "jou" aan maar
   * noemt het onderwerp bij naam ("Voor het huishouden …"). De naam staat al in
   * `perspectiveHero.householdName` en wordt elders in de hero ook getoond, dus
   * dit lekt niets nieuws. Leeg/afwezig = de eigen weergave.
   */
  subjectName?: string | null
  variant?: VrijheidsleeftijdZinVariant
}

export interface VrijheidsleeftijdZin {
  kind: VrijheidsleeftijdZinKind
  /** Woorden vóór de leeftijd. Bij `nu-al`/`onbekend` de hele zin. */
  lead: string
  /** De leeftijd, klaar om te tonen ("53e"). `null` als er geen leeftijd is. */
  ageLabel: string | null
  /** Woorden ná de leeftijd (meestal '.' of ''). */
  tail: string
  /** De volledige zin als platte tekst. */
  text: string
}

const LEEG: VrijheidsleeftijdZin = { kind: 'berekenen', lead: '', ageLabel: null, tail: '', text: '' }

/**
 * Is dit een leeftijd waar we een zin op mogen bouwen? Eindig én positief,
 * zodat er nooit "rond je undefined" of "rond je -3e" op het scherm komt.
 */
function heeftLeeftijd(age: number | null | undefined): age is number {
  return age != null && Number.isFinite(age) && age > 0
}

function samenstellen(
  kind: VrijheidsleeftijdZinKind,
  lead: string,
  ageLabel: string | null,
  tail: string,
): VrijheidsleeftijdZin {
  return { kind, lead, ageLabel, tail, text: `${lead}${ageLabel ?? ''}${tail}` }
}

/**
 * Bouwt de duidingszin bij het kerngetal van /toekomst.
 *
 * Bewust beschrijvend geformuleerd — "werken wordt een keuze", niet "stop met
 * werken op je 53e". De formuleringen komen letterlijk uit de reeds in
 * productie staande welkomstkaart en overlay, dus er komt met deze module geen
 * nieuwe claim bij die een eigen Wft-toets zou vragen.
 */
export function buildVrijheidsleeftijdZin(
  input: VrijheidsleeftijdZinInput,
): VrijheidsleeftijdZin {
  const variant = input.variant ?? 'duiding'
  const framing = input.framing ?? 'building'
  const isPensioen = input.anchor ? input.anchor.kind === 'aow' : input.isPensioen === true
  const naam = input.subjectName?.trim() || null

  if (input.pending) return LEEG

  // ── Vast stop-anker (ADR 0129; vóór F3a alleen 'Nu stoppen', ADR 0127) ────
  // Wint van elke andere tak: onder een vast anker is er geen vrijheidsMOMENT om aan
  // te kondigen (`fireAge` ís het anker), alleen een bereik. Alleen in de eigen
  // weergave — een perspectiefweergave gaat over iemand anders' plan.
  const reach = input.ankerReach ?? input.nuStoppenReach
  if (reach != null && !naam) {
    const stop: AnkerStop = input.ankerStop ?? { kind: 'now' }
    return samenstellen(
      'nu-al',
      variant === 'inline' ? ankerZinKort(reach, stop) : ankerZin(reach, stop),
      null,
      '',
    )
  }

  // ── Al vrij / al met pensioen ────────────────────────────────────────────
  // Dan is de leeftijd geen vooruitzicht meer. Alleen relevant voor de eigen
  // weergave; in een perspectiefweergave gaat de zin over iemand anders en valt
  // de eigen framing weg (precies zoals `showFreeHero` in horizon-client).
  // 'anchored' (vast anker, nog niet vrij) zonder bereik-invoer valt hieronder
  // NIET — dan is er (nog) geen uitspraak en volgt de gewone leeftijd-tak.
  if (framing === 'free' && !naam) {
    // Het nu-anker (ADR 0127/0129): 'free' betekent daar GEDEKT — een uitspraak over
    // bereik, geen "werken is een keuze" (het plan ís al stoppen). Zonder bereik-invoer
    // is de enige eerlijke zin de plan-eind-vorm; de grondslag heet liquide vermogen.
    if (input.anchor?.kind === 'now') {
      const gedekt = { kind: 'gedekt' as const, endAge: null }
      return samenstellen(
        'nu-al',
        variant === 'inline' ? ankerZinKort(gedekt, { kind: 'now' }) : ankerZin(gedekt, { kind: 'now' }),
        null,
        '',
      )
    }
    const zin = isPensioen
      ? 'Je pensioen is ingegaan — werken is nu een keuze.'
      : 'Werken is voor jou nu al een keuze.'
    if (variant === 'inline') {
      const inline = isPensioen ? 'je pensioen is ingegaan' : 'werken is nu al een keuze'
      return samenstellen('nu-al', inline, null, '')
    }
    return samenstellen('nu-al', zin, null, '')
  }

  // ── Geen (bruikbare) leeftijd ────────────────────────────────────────────
  if (!heeftLeeftijd(input.freedomAge)) {
    if (variant === 'inline') {
      // Byte-identiek aan de string die `SummaryLine` hardgecodeerd had.
      return samenstellen('onbekend', 'vrijheid nog niet in zicht', null, '')
    }
    // Byte-identiek aan `choiceSentenceFallback` uit toekomst-welcome.tsx.
    return samenstellen(
      'onbekend',
      'Werken wordt steeds meer een keuze naarmate je vrijheid opbouwt.',
      null,
      '',
    )
  }

  // ── Met leeftijd ─────────────────────────────────────────────────────────
  // ÉÉN afrondingsregel voor de hele pagina: `heroFireAgeYear`, dezelfde die
  // het kopgetal van de hero-KPI gebruikt. Zie de noot in hero-fire-age.ts.
  const jaar = heroFireAgeYear(input.freedomAge)

  if (variant === 'inline') {
    // De overlay draagt de AOW-nuance in de LEAD ("je pensioen valt rond je"),
    // de kaart in het LABEL ("65e (AOW-leeftijd)"). Beide vormen stonden er al
    // zo; ze samentrekken zou een van beide suites breken zonder dat iemand er
    // iets mee opschiet.
    return samenstellen(
      'leeftijd',
      isPensioen ? 'je pensioen valt rond je ' : 'werken wordt een keuze rond je ',
      `${jaar}e`,
      '',
    )
  }

  if (variant === 'kaart') {
    return samenstellen(
      'leeftijd',
      'Werken wordt voor jou een keuze rond je ',
      isPensioen ? `${jaar}e (AOW-leeftijd)` : `${jaar}e`,
      '.',
    )
  }

  // variant 'duiding' — de nieuwe regel onder het kerngetal.
  if (naam) {
    // Derde persoon: "je" past niet als de zin over het huishouden of de
    // partner gaat, dus wordt het "het 53e jaar".
    return samenstellen(
      'leeftijd',
      isPensioen
        ? `Dit betekent: voor ${naam} valt het pensioen rond het `
        : `Dit betekent: voor ${naam} wordt werken een keuze rond het `,
      `${jaar}e`,
      ' jaar.',
    )
  }
  return samenstellen(
    'leeftijd',
    isPensioen ? 'Dit betekent: je pensioen valt rond je ' : 'Dit betekent: werken wordt voor jou een keuze rond je ',
    `${jaar}e`,
    '.',
  )
}
