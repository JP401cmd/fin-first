// ── Lokale nieuwseditie: regelparser voor de twee passes ─────────────────────
//
// Het cloudpad gebruikt `streamObject` met een zod-schema: de provider dwingt de
// JSON-vorm af. Een 2B-model on-device heeft die luxe niet — het knoeit met
// aanhalingstekens, sluit arrays niet af en plakt er graag een "Hier is het
// resultaat:" voor. `lib/ai/local/parse.ts` bergt dat voor de categorisatie met
// een salvage-parser, maar dáár MOET het JSON zijn (geneste velden per transactie).
//
// Hier niet. De uitvoer van beide passes is regelgeoriënteerd met vaste
// veldprefixen, en dat is bewust: een afgekapte regel kost één veld in plaats van
// het hele antwoord, en er valt niets te "sluiten". De parser hoeft dan alleen
// regels te herkennen — geen balanced-bracket-scan, geen salvage.
//
// PUUR (geen IO, geen runtime-import) → los unit-testbaar en veilig in de
// client-bundel.

import { stripThink } from './parse'

// ── Pass A — scoring ─────────────────────────────────────────────────────────

/** Richting van de impact voor de gebruiker. */
export type LocalNewsDirection = 'positief' | 'negatief' | 'neutraal'

/** Het oordeel van pass A over één bronartikel. */
export interface LocalNewsScore {
  /** Vond het model dit artikel relevant voor dit profiel? */
  relevant: boolean
  impactType: 'direct' | 'relevant'
  /** Geheel getal 1-5, hier al geklemd. */
  impactScore: number
  impactDirection: LocalNewsDirection
}

/**
 * Klem een ruwe score op het 1-5-bereik. Dezelfde clamp die het cloudpad
 * server-side doet (`Math.min(5, Math.max(1, Math.round(...)))`) — een model
 * levert met enige regelmaat 0, 7 of "4.5".
 */
export function clampImpactScore(raw: number | null | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return 3
  return Math.min(5, Math.max(1, Math.round(raw)))
}

/**
 * Lees de waarde achter een veldprefix uit de tekst.
 *
 * De pass-A-uitvoer staat op één regel met '·' als scheidingsteken
 * (`RELEVANT: ja · TYPE: direct · SCORE: 4 · RICHTING: negatief`), maar een klein
 * model zet de velden net zo vaak op eigen regels. Daarom stoppen we bij een
 * '·' óf een regeleinde — dan werken beide vormen zonder tweede parser.
 * Hoofdletterongevoelig: 'Score:' komt net zo vaak voor als 'SCORE:'.
 *
 * SKELET-ECHO WORDT AFGEWEZEN. Een klein model geeft met enige regelmaat de
 * opdrachtregel letterlijk terug ("RELEVANT: ja|nee · TYPE: direct|relevant").
 * Zonder deze controle zou `/^ja\b/i` op "ja|nee" matchen — '|' is een
 * niet-woordteken — en werd élk artikel relevant verklaard: een fail-OPEN precies
 * op het veld dat de hele selectie draagt. Een waarde met '|' is per definitie
 * niet ingevuld, dus behandelen we 'm als afwezig.
 */
function readField(text: string, label: string): string | null {
  const match = new RegExp(`${label}\\s*:\\s*([^·\\n\\r]*)`, 'i').exec(text)
  if (!match) return null
  const value = match[1].trim()
  if (!value || value.includes('|')) return null
  return value
}

/**
 * Parse de pass-A-regel. Retourneert null wanneer er geen bruikbaar oordeel in
 * zit — de resolver behandelt dat als "niet relevant" (fail-closed: bij twijfel
 * géén bericht, want een onbegrepen antwoord is geen goedkeuring).
 */
export function parseLocalNewsScore(raw: string): LocalNewsScore | null {
  const text = stripThink(raw).trim()
  if (!text) return null

  const relevantRaw = readField(text, 'RELEVANT')
  const typeRaw = readField(text, 'TYPE')
  const scoreRaw = readField(text, 'SCORE')
  const directionRaw = readField(text, 'RICHTING')

  // Zonder RELEVANT-veld weten we niets: dat is het enige veld dat de selectie
  // draagt. De rest heeft een verdedigbare terugval, dit niet.
  if (relevantRaw === null) return null

  const relevant = /^ja\b/i.test(relevantRaw)

  // 'direct' alleen bij een expliciete match; alles anders degradeert naar
  // 'relevant'. Dat is de veilige kant op — 'direct' belooft een concrete,
  // berekenbare impact en die claim moet je verdienen, niet erven uit ruis.
  const impactType: 'direct' | 'relevant' = /\bdirect\b/i.test(typeRaw ?? '') ? 'direct' : 'relevant'

  // Eerste getal uit het veld; ontbreekt het, dan 3 (het midden) via clamp.
  const scoreMatch = /-?\d+(?:[.,]\d+)?/.exec(scoreRaw ?? '')
  const impactScore = clampImpactScore(
    scoreMatch ? Number(scoreMatch[0].replace(',', '.')) : null,
  )

  const direction = (directionRaw ?? '').toLowerCase()
  const impactDirection: LocalNewsDirection = direction.includes('positief')
    ? 'positief'
    : direction.includes('negatief')
      ? 'negatief'
      : 'neutraal'

  return { relevant, impactType, impactScore, impactDirection }
}

// ── Pass B — proza ───────────────────────────────────────────────────────────

/** De drie tekstvelden die het model op het lokale pad wél schrijft. */
export interface LocalNewsProse {
  headline: string
  summary: string
  /** Null wanneer het model geen IMPACT-regel gaf (of die leeg was). */
  personalImpact: string | null
}

/** Maximale lengtes — een klein model dat doorratelt levert onleesbare kaarten. */
export const MAX_HEADLINE_LENGTH = 120
export const MAX_SUMMARY_LENGTH = 400
export const MAX_IMPACT_LENGTH = 300

/**
 * Lees een meerregelig veld: alles achter `label:` tot de volgende veldprefix óf
 * het einde van de tekst. Nodig omdat SAMENVATTING over meerdere regels mag lopen.
 *
 * HET EINDE MOET IN DE STOP-ALTERNATIE ZITTEN. Zonder `|$` matcht de lookahead
 * alleen wanneer er daadwerkelijk een volgend label komt — en dan levert het
 * LAATSTE veld altijd null op (bij IMPACT volgt er niets meer, en bij een antwoord
 * zonder IMPACT geldt hetzelfde voor SAMENVATTING). Dat maakte de parser stil
 * afhankelijk van de veldvolgorde in plaats van van de labels.
 *
 * HET LABEL HOEFT NIET OP EEN NIEUWE REGEL TE STAAN. Eiste de lookahead een
 * `\n` vóór het volgende label, dan slikte de KOP bij een eenregelig antwoord
 * ("KOP: … SAMENVATTING: … IMPACT: …") de hele rest op — inclusief de letterlijke
 * labels — en landde die brij als hero-kop bovenaan de pagina. Juist die
 * formaatafwijking is waarvoor deze parser bestaat, dus stoppen we op het label
 * zelf, met of zonder regeleinde ervoor.
 */
function readBlock(text: string, label: string, stopLabels: string[]): string | null {
  const stop =
    stopLabels.length > 0 ? `(?=[\\s]*(?:${stopLabels.join('|')})\\s*:|$)` : '(?=$)'
  const match = new RegExp(`${label}\\s*:\\s*([\\s\\S]*?)${stop}`, 'i').exec(text)
  if (!match) return null
  return match[1].replace(/\s+/g, ' ').trim() || null
}

/** Strip omsluitende aanhalingstekens en markdown-nadruk die het model toevoegt. */
function cleanProse(value: string): string {
  return value
    .replace(/^["'*_\s]+|["'*_\s]+$/g, '')
    .trim()
}

/**
 * Parse de pass-B-uitvoer (KOP/SAMENVATTING/IMPACT).
 *
 * Retourneert null wanneer kop óf samenvatting ontbreekt — zonder die twee is er
 * geen bericht te tonen. Een ontbrekende IMPACT is géén reden om het bericht weg
 * te gooien: dat veld mag vervallen (zie de nummer-guard), het bericht degradeert
 * dan naar impactType 'relevant'.
 */
export function parseLocalNewsProse(raw: string): LocalNewsProse | null {
  const text = stripThink(raw).trim()
  if (!text) return null

  const headlineRaw = readBlock(text, 'KOP', ['SAMENVATTING', 'IMPACT'])
  const summaryRaw = readBlock(text, 'SAMENVATTING', ['KOP', 'IMPACT'])
  const impactRaw = readBlock(text, 'IMPACT', ['KOP', 'SAMENVATTING'])

  if (!headlineRaw || !summaryRaw) return null

  const headline = cleanProse(headlineRaw).slice(0, MAX_HEADLINE_LENGTH)
  const summary = cleanProse(summaryRaw).slice(0, MAX_SUMMARY_LENGTH)
  if (!headline || !summary) return null

  const impactClean = impactRaw ? cleanProse(impactRaw).slice(0, MAX_IMPACT_LENGTH) : ''

  return {
    headline,
    summary,
    personalImpact: impactClean || null,
  }
}
