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
import type { FreedomFraming } from '@/lib/fire-strategy'

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
   * Uitkomst van `resolveFreedomFraming()` (lib/fire-strategy.ts). Bij `'free'`
   * of `'pensioen'` is de leeftijd geen belofte meer maar een feit, en zegt de
   * zin dat ook. Default `'building'`.
   */
  framing?: FreedomFraming
  /** Toont de pagina de AOW-/pensioenleeftijd i.p.v. een FIRE-leeftijd? */
  isPensioen?: boolean
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
 * Is dit een leeftijd waar we een zin op mogen bouwen? Dezelfde drempel als
 * `toekomst-welcome.tsx` hanteerde: eindig én positief, zodat er nooit "rond je
 * undefined" of "rond je -3e" op het scherm komt.
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
  const isPensioen = input.isPensioen === true
  const naam = input.subjectName?.trim() || null

  if (input.pending) return LEEG

  // ── Al vrij / al met pensioen ────────────────────────────────────────────
  // Dan is de leeftijd geen vooruitzicht meer. Alleen relevant voor de eigen
  // weergave; in een perspectiefweergave gaat de zin over iemand anders en valt
  // de eigen framing weg (precies zoals `showFreeHero` in horizon-client).
  if (framing !== 'building' && !naam) {
    const zin =
      framing === 'pensioen'
        ? 'Je pensioen is ingegaan — werken is nu een keuze.'
        : 'Werken is voor jou nu al een keuze.'
    if (variant === 'inline') {
      return samenstellen('nu-al', framing === 'pensioen' ? 'je pensioen is ingegaan' : 'werken is nu al een keuze', null, '')
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
