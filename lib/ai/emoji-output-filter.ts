/**
 * Emoji-uitvoertoets — deterministische laag onder de DNA-regel "geen emoji".
 *
 * WAAROM EEN TWEEDE LAAG (UR3-11, besluit eigenaar 6 sep 2026). Het emoji-verbod
 * staat sinds vóór de nulmeting letterlijk in `lib/ai/dna/base.ts`, en de
 * AI-regressieset mat op 6 sep 2026 alsnog 23 emoji in 129 antwoorden — méér dan
 * de nulmeting. Stijl is de getrainde default van het model; een promptregel
 * verschuift die maar deels. AC2 van de kaart is absoluut geformuleerd ("bevat
 * geen emoji") en een absolute eis is alleen met een deterministische laag waar
 * te maken.
 *
 * WEL EMOJI, GEEN LENGTE. Emoji strippen is teken-niveau, toestandsloos en
 * idempotent. Een stream halverwege afkappen om onder 150 woorden te komen is
 * dat NIET: dat produceert precies de kapotte zin die de kaart al meldt
 * ("Deze rentepercentages kloppen geen beleggingsrendement."). Lengte blijft dus
 * puur prompt-werk; hier staat alleen de emoji-toets.
 *
 * STRIPPEN, NIET WEIGEREN. `guardFigures` (lib/ai/local/figure-guard.ts) is
 * fail-closed en verwerpt de héle tekst — juist omdat een verzonnen cijfer
 * inhoudelijk fout is. Een emoji is cosmetisch; daar hoort strippen bij, geen
 * weigering en zeker geen tweede modelaanroep (die verdubbelt kosten en latentie
 * van het duurste oppervlak van de app voor een cosmetische regel).
 *
 * WAT BEWUST BLIJFT STAAN:
 *  - `∞` (U+221E) — `base.ts` § FRAMING licenseert dat symbool expliciet als
 *    merkteken voor "passief inkomen dekt permanent de uitgaven".
 *  - `→` (U+2192) en de overige pijlen — typografie in een opsomming, geen
 *    pictogram; de regressieset telt ze bewust apart en niet als emoji.
 *  Geen van beide draagt de Unicode-eigenschap `Extended_Pictographic`, dus ze
 *  vallen per constructie buiten het filter. `✓` (U+2713) draagt die eigenschap
 *  óók niet, maar wordt door het model wél als opsommingsvinkje gebruikt en
 *  staat er daarom expliciet bij.
 *
 * MEETLAT EN FILTER ZIJN HETZELFDE. `Extended_Pictographic` is exact de
 * eigenschap waarop `scripts/ai-regressie/run.mjs` emoji telt. Filter en meting
 * kunnen daardoor niet uiteenlopen.
 */

// LET OP bij bewerken: alle onzichtbare tekens (variatieselector U+FE0F/U+FE0E,
// zero-width joiner U+200D, keycap U+20E3) staan hier BEWUST als `\uXXXX`-escape
// in een `String.raw`/template-string en niet als letterlijk teken. De
// `RegExp`-constructor leest die escapes; in de broncode blijven ze zichtbaar en
// overleven ze een round-trip door een editor of shell die niet-ASCII mangelt.
/** Eén pictogram: basisteken, keycap, of regionale-indicator-vlagletter. */
const BASIS = String.raw`(?:[0-9#*]\uFE0F?\u20E3|[\p{Extended_Pictographic}\u2713\u{1F1E6}-\u{1F1FF}])`

/** Modificatoren die aan een basisteken vastzitten (variatie, huidskleur, keycap). */
const MODIFIER = String.raw`[\uFE0E\uFE0F\u{1F3FB}-\u{1F3FF}\u20E3]`

/**
 * Een volledige emoji-reeks: basisteken + modificatoren, eventueel via ZWJ
 * (U+200D) aan elkaar geregen (bv. een familie- of beroeps-emoji). Zonder de
 * ZWJ-tak zou een samengestelde emoji half blijven staan als losse deeltekens.
 */
const SEQUENCE = `${BASIS}(?:${MODIFIER}|\\u200D${BASIS})*`

/**
 * Een run van reeksen mét de omringende horizontale witruimte. De witruimte zit
 * BEWUST in de match: "je komt uit met ruimte over. 💪" moet eindigen op een
 * punt, niet op een punt-spatie, en "a 🎯 b" moet één spatie overhouden — geen
 * twee en geen nul.
 */
const EMOJI_RUN = new RegExp(`[ \\t]*(?:${SEQUENCE})+[ \\t]*`, 'gu')

/**
 * Staartdetectie voor de streaming-variant: tekens aan het EIND van een chunk
 * die het begin of het vervolg van een reeks kunnen zijn, inclusief een losse
 * high surrogate (de eerste helft van een surrogaatpaar). Die houden we vast tot
 * de volgende chunk, anders glipt een pictogram dat precies op de chunkgrens
 * valt langs het filter.
 *
 * Niet-globaal: `exec` moet toestandsloos zijn.
 *
 * BEKEND GAT, bewust: een keycap die exact tussen het cijfer en U+FE0F breekt
 * (het cijfer in de ene chunk, U+FE0F+U+20E3 in de volgende) glipt door. De
 * alternatieve regel — elk trailing cijfer bufferen — zou bij elk bedrag de
 * laatste cijfers laten haperen. Keycaps komen in dit domein niet voor;
 * haperende bedragen wel.
 */
const TRAILING_PENDING = new RegExp(
  String.raw`[ \t]*(?:[\uD800-\uDBFF]|[\p{Extended_Pictographic}\u2713\u{1F1E6}-\u{1F1FF}\uFE0E\uFE0F\u{1F3FB}-\u{1F3FF}\u200D\u20E3]+[\uD800-\uDBFF]?)$`,
  'u',
)

/**
 * Plafond op de vastgehouden staart. Een pathologische run van pictogrammen mag
 * de stream niet laten stokken: boven dit plafond geven we vrij wat we hebben
 * (de reeks is dan sowieso compleet genoeg om te strippen).
 */
const MAX_PENDING = 32

/**
 * Verwijder alle emoji/pictogrammen uit een tekst en herstel de spatiëring.
 *
 * Geeft de originele referentie terug als er niets te strippen valt (zero-copy,
 * net als `maskPIIInOutput`).
 */
export function stripEmoji(text: string, precededBy?: string): string {
  if (!text) return text
  return text.replace(EMOJI_RUN, (match: string, offset: number, whole: string) => {
    // `precededBy` is het teken dat in de VOLLEDIGE uitvoer vlak vóór deze tekst
    // stond. Zonder dat zou elk streamfragment dat toevallig met een emoji begint
    // als regelbegin worden gelezen, en dan verdwijnt de spatie die het vorige
    // fragment en dit fragment uit elkaar houdt ("let op" + "nu" -> "let opnu").
    const before = offset === 0 ? precededBy : whole[offset - 1]
    const after = whole[offset + match.length]
    // Aan het begin of eind van een regel: ook de bijbehorende witruimte weg,
    // anders blijft er een inspringing of een spatie vóór de regelovergang staan.
    if (before === undefined || before === '\n') return ''
    if (after === undefined || after === '\n') return ''
    // Middenin een zin: precies één spatie terug als er witruimte in de match zat.
    return /[ \t]/.test(match) ? ' ' : ''
  })
}

/** Lengte van de nog niet vrij te geven staart (0 als de chunk veilig is). */
export function pendingEmojiTailLength(text: string): number {
  const match = TRAILING_PENDING.exec(text)
  if (!match) return 0
  return match[0].length > MAX_PENDING ? 0 : match[0].length
}

export type EmojiTextFilter = {
  /** Filter één tekst-delta van tekstblok `id`; geeft terug wat vrijgegeven mag worden. */
  delta(id: string, text: string): string
  /** Sluit tekstblok `id` af en geef de resterende staart (gestript) terug. */
  end(id: string): string
}

/**
 * Streaming-variant: houdt per tekstblok een korte staart vast zodat een
 * pictogram dat over een chunkgrens valt alsnog wordt herkend.
 *
 * Per `id` en niet globaal, omdat één antwoord meerdere tekstblokken kan hebben
 * (tekst → tool-call → tekst): een gedeelde staart zou de tekst van blok A vóór
 * blok B plakken.
 */
export function createEmojiTextFilter(): EmojiTextFilter {
  const pending = new Map<string, string>()
  /** Laatste teken dat per tekstblok daadwerkelijk is vrijgegeven (zie stripEmoji). */
  const vorigTeken = new Map<string, string>()

  return {
    delta(id: string, text: string): string {
      const buffered = (pending.get(id) ?? '') + text
      const tailLength = pendingEmojiTailLength(buffered)
      if (tailLength > 0) {
        pending.set(id, buffered.slice(buffered.length - tailLength))
      } else {
        pending.delete(id)
      }
      const safe = tailLength > 0 ? buffered.slice(0, buffered.length - tailLength) : buffered
      const uit = stripEmoji(safe, vorigTeken.get(id))
      if (uit) vorigTeken.set(id, uit[uit.length - 1])
      return uit
    },
    end(id: string): string {
      const rest = pending.get(id) ?? ''
      const uit = stripEmoji(rest, vorigTeken.get(id))
      pending.delete(id)
      vorigTeken.delete(id)
      return uit
    },
  }
}
