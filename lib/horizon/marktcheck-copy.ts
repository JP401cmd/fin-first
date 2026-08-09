/**
 * De **taal van de marktcheck-marge** — één bron voor de pil, de legenda, de
 * explainer en de `aria-label`/`title` van de knop.
 *
 * ## Waarom een eigen module
 * De vorige ronde liet zien hoe makkelijk copy en motor uit elkaar lopen: de pil
 * zei "kans dat je plan standhoudt", de legenda "Plan houdt stand" en de
 * explainer iets over p10–p90, terwijl het getal iets anders mat. Alle vier de
 * oppervlakken lezen daarom nu dezelfde functies; wijzigt de motor, dan wijzigt
 * de tekst op één plek mee.
 *
 * ## De grootheid in gewone taal
 * `RendementMarge.marge` is een verschuiving van het jaarrendement (decimaal:
 * 0,018 = 1,8% per jaar). Positief = het rendement mág zoveel tegenvallen;
 * negatief = er is zoveel méér nodig. Het woord "procentpunt" komt hier bewust
 * NIET in voor — "je rendement valt 1,8% per jaar tegen" is wat een mens zegt.
 *
 * Pure module: geen React, geen fs, geen Date.now.
 */

import { RENDEMENT_MARGE_GRENS } from '@/lib/constants'
import type { RendementMarge } from '@/lib/horizon-kernel/rendement-marge'

/**
 * Weergaveprecisie van de marge in procentpunt: één decimaal. De motor rekent
 * tot ~0,004pp nauwkeurig (zie `RENDEMENT_MARGE_ITERATIES`), dus dit is de
 * bindende afronding — geen schijnprecisie.
 */
const MARGE_WEERGAVE_DECIMALEN = 1

/**
 * Alles binnen een halve weergave-eenheid van nul (±0,05 procentpunt) heet
 * "geen speling". Zonder deze drempel toont een marge van −0,004pp het teken
 * van de ruis (`−0%`) terwijl de uitspraak "je plan gaat precies op" is — en dát
 * is precies wat je ziet wanneer je stopleeftijd samenvalt met de gesolvede
 * FIRE-leeftijd. Puur een afrondingsdrempel, geen financiële aanname.
 */
const GEEN_SPELING_DREMPEL = 0.5 * 10 ** -(MARGE_WEERGAVE_DECIMALEN + 2)

/** Is de marge binnen de afronding nul? Dan gaat het plan precies op. */
function isNul(m: RendementMarge): boolean {
  return m.begrensd === null && Math.abs(m.marge) < GEEN_SPELING_DREMPEL
}

/** `1,8` · `15` · `0,4` — nl-NL, maximaal één decimaal, nooit een loze `,0`. */
function pct(decimaal: number): string {
  return (Math.abs(decimaal) * 100).toLocaleString('nl-NL', {
    maximumFractionDigits: MARGE_WEERGAVE_DECIMALEN,
  })
}

/** Hele leeftijd voor weergave (de stop-slider levert hele jaren; AOW kan breuken hebben). */
function leeftijd(m: RendementMarge): number {
  return Math.round(m.ankerLeeftijd)
}

/**
 * De pil-waarde — kort genoeg voor de compacte pillenbalk (waar het label
 * wegvalt en alleen de datawaarde blijft staan):
 * `1,8%` · `−2,9%` · `>15%` · `<−15%`.
 */
export function margeKort(m: RendementMarge): string {
  if (m.begrensd === 'boven') return `>${pct(RENDEMENT_MARGE_GRENS)}%`
  if (m.begrensd === 'onder') return `<−${pct(RENDEMENT_MARGE_GRENS)}%`
  if (isNul(m)) return '0%'
  return m.marge > 0 ? `${pct(m.marge)}%` : `−${pct(m.marge)}%`
}

/**
 * De ankerzin — welke stopleeftijd de toets gebruikt. Benoemt expliciet dat de
 * AOW-leeftijd een TERUGVAL is (er is dan geen eigen stopkeuze).
 */
export function margeAnkerZin(m: RendementMarge): string {
  return m.anker === 'stopkeuze'
    ? `als je stopt op je ${leeftijd(m)}e`
    : `als je doorwerkt tot je AOW (${leeftijd(m)})`
}

/** Idem, maar als korte bijzin voor de legenda: `bij stoppen op je 55e`. */
export function margeAnkerKort(m: RendementMarge): string {
  return m.anker === 'stopkeuze'
    ? `bij stoppen op je ${leeftijd(m)}e`
    : `bij doorwerken tot je AOW (${leeftijd(m)})`
}

/** Eén regel voor de legenda, zonder anker (dat staat er los naast). */
export function margeLegenda(m: RendementMarge): string {
  if (m.begrensd === 'boven') {
    return `Houdt stand tot meer dan ${pct(RENDEMENT_MARGE_GRENS)}% minder rendement per jaar`
  }
  if (m.begrensd === 'onder') {
    return `Houdt geen stand — meer dan ${pct(RENDEMENT_MARGE_GRENS)}% extra rendement per jaar nodig`
  }
  if (isNul(m)) return 'Geen speling — je plan gaat precies op'
  return m.marge > 0
    ? `Houdt stand tot ${pct(m.marge)}% minder rendement per jaar`
    : `Houdt geen stand — ${pct(m.marge)}% extra rendement per jaar nodig`
}

/**
 * De volledige zin voor de explainer en de `aria-label`/`title` van de pil.
 * Dezelfde uitspraak als de motor: gap-toets op de anker-leeftijd.
 */
export function margeZin(m: RendementMarge): string {
  const aanhef = m.anker === 'stopkeuze'
    ? `Stop je op je ${leeftijd(m)}e`
    : `Werk je door tot je AOW (${leeftijd(m)})`
  if (m.begrensd === 'boven') {
    return `${aanhef}, dan houdt je plan stand tot je rendement méér dan ${pct(RENDEMENT_MARGE_GRENS)}% per jaar tegenvalt.`
  }
  if (m.begrensd === 'onder') {
    return `${aanhef}, dan houdt je plan het niet: zelfs ${pct(RENDEMENT_MARGE_GRENS)}% per jaar méér rendement is niet genoeg.`
  }
  if (isNul(m)) {
    return `${aanhef}, dan gaat je plan precies op: valt je rendement ook maar iets tegen, dan red je het net niet.`
  }
  return m.marge > 0
    ? `${aanhef}, dan houdt je plan stand tot je rendement ${pct(m.marge)}% per jaar tegenvalt.`
    : `${aanhef}, dan houdt je plan het niet: er is ${pct(m.marge)}% per jaar méér rendement voor nodig.`
}
