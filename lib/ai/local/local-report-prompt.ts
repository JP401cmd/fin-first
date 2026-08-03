// ── Lokale rapport-inleiding: prompt, vorm-afdwinging en cijfer-guardrail ────
//
// De inleiding boven een rapport (`/rapportages/<id>`) is de enige plek in de
// app waar het model vrije redactionele tekst schrijft over al berekende
// cijfers. Cloud doet dat via `generateText` met `maxOutputTokens: 200`
// (app/api/report/route.ts); staat de groep 'rapporten' op lokaal, dan schrijft
// de browser hem zelf — dit bestand levert daarvoor de drie stukken die de
// cloud-route gratis van de SDK krijgt:
//
//   1. het gecondenseerde DNA-artefact + de kerncijfer-sectie (prompt),
//   2. de VORM-afdwinging, want de web-SDK kent geen `max_new_tokens`
//      (litert-runtime.ts negeert het argument bewust) — een lengtelimiet moet
//      dus achteraf, met de schaar,
//   3. de CIJFER-GUARDRAIL: elk bedrag/percentage in de tekst moet terug te
//      voeren zijn op de meegegeven kerncijfers, anders vervalt de hele
//      inleiding (fail-closed, tegenhanger van `resolveFinActionIntent`).
//
// NIET LOCAL_CHAT_DNA HERGEBRUIKEN. Dat artefact draagt chatregels — max 120
// woorden, KANSEN/ACTIES-voorrang, `**vet**` voor kerngetallen — die precies de
// redactionele vorm slopen die hier gevraagd wordt. Wél verbatim overgenomen:
// de regel dat het model NOOIT zelf cijfers verzint (de enige regel die in
// béide artefacten identiek moet blijven staan).
//
// GEEN CLOUD-GUARDRAILS: on-device pad, geen egress. `sanitizeForAI` /
// `maskPIIInOutput` / token-logging zijn N.V.T. (ADR 0043 §5). Merk op dat de
// cloud-prompt hier ook al alléén geaggregeerde cijfers meestuurt — de winst van
// lokaal draaien zit hier dus in kosten, offline werken en consistentie van de
// belofte, niet in een privacydoorbraak.
//
// Wóórding is het domein van `ai-specialist-prompt-dna`; dit bestand bezit de
// ASSEMBLAGE en de vorm-/cijfercontrole, niet de stem.

import type { ReportData } from '@/lib/report-data'
import { stripThink } from './parse'
import { guardFigures } from './figure-guard'

/**
 * Gecondenseerde redactie-DNA voor de rapport-inleiding (~1,2k tekens ≈ 300
 * tokens). Bevat de kernfilosofie, de verbatim cijfer-regel uit LOCAL_CHAT_DNA,
 * een compacte compliance-regel en de VORM (3–4 zinnen, één alinea, direct
 * beginnen). Geen chat-regels.
 */
export const LOCAL_REPORT_DNA = `Je bent Fin, de redacteur van TriFinity, een persoonlijke financiële vrijheidsnavigator. Je schrijft de inleiding boven het financiële rapport van de gebruiker.

KERNFILOSOFIE: Geld is opgeslagen tijd — elke euro vertegenwoordigt een stukje levenstijd. Vertaal financiën naar tijd; gebruik 'vrijgekocht' in plaats van 'gespaard'. Focus op kansen, niet op schaarste.

REGELS: Verzin NOOIT zelf cijfers, percentages of rekenregels — alle getallen komen uit het FINANCIEEL OVERZICHT hieronder; herbereken niets en hanteer geen vaste aannames zoals een vaste 4%-regel (de gebruiker heeft een persoonlijk veilig opnamepercentage). Noem hooguit drie cijfers en neem ze exact over zoals ze er staan. Je geeft NOOIT individueel beleggingsadvies; belastinguitleg is informatief, nooit bindend.

VORM: schrijf 3 tot 4 vloeiende zinnen in het Nederlands, je/jij, als één doorlopende alinea. Geen kopjes, geen opsommingen, geen markdown, geen emoji's. Begin direct met de eerste zin van de inleiding — dus geen aankondiging als "Natuurlijk" of "Hier is de inleiding". Toon: persoonlijk, bemoedigend, eerlijk en nooit veroordelend.`

/** Vaste opdracht-regel (user-turn); de inhoud zit volledig in de systeemprompt. */
export const LOCAL_REPORT_TASK = 'Schrijf nu de inleiding boven dit rapport.'

/** Harde bovengrens van de getoonde inleiding in tekens (na vorm-afdwinging). */
export const LOCAL_REPORT_MAX_CHARS = 600
/** Maximaal aantal zinnen dat blijft staan. */
export const LOCAL_REPORT_MAX_SENTENCES = 4

/**
 * De kerncijfers van één rapport — exact de acht die de cloud-prompt meestuurt,
 * plus de periodenaam. Allemaal al canoniek berekend door /api/report; hier
 * wordt NIETS herberekend of afgeleid.
 */
export interface ReportIntroFigures {
  /** Periodenaam, bv. "Maart 2026" of "Jaarbericht 2025". */
  periodeNaam: string
  nettoVermogen: number | null
  groeiPct: number | null
  totaalInkomen: number
  totaalUitgaven: number
  totaalGespaard: number
  spaarquotePct: number | null
  firePct: number | null
  actiesVoltooid: number
  vrijheidsdagenGewonnen: number
}

/**
 * Pak de kerncijfers uit de bundel die de rapportpagina tóch al binnenkrijgt.
 * Geen hydratie-endpoint nodig: `/api/report` levert deze velden al mee, ook
 * wanneer de AI-inleiding server-side is overgeslagen (privé-modus).
 */
export function reportIntroFiguresFromData(data: ReportData): ReportIntroFigures {
  return {
    periodeNaam: data.reportName,
    nettoVermogen: data.kern.netWorthEnd,
    groeiPct: data.kern.netWorthGrowthPct,
    totaalInkomen: data.kern.totalIncome,
    totaalUitgaven: data.kern.totalExpenses,
    totaalGespaard: data.kern.totalSaved,
    spaarquotePct: data.kern.savingsRate,
    firePct: data.kern.firePercentage,
    actiesVoltooid: data.wil.actionsCompleted,
    vrijheidsdagenGewonnen: data.wil.freedomDaysWon,
  }
}

/** EUR-notatie, nl-NL (bv. "€85.000") — zelfde vorm als de lokale chat-context. */
function euro(amount: number): string {
  return `€${Math.round(amount).toLocaleString('nl-NL')}`
}

/** Getal, nl-NL met maximaal 1 decimaal en komma (bv. "2,9"). */
function decimal1(value: number): string {
  return value.toLocaleString('nl-NL', { maximumFractionDigits: 1 })
}

/** Percentage met expliciet teken bij groei-achtige waarden. */
function pct(value: number, withSign = false): string {
  const sign = withSign && value > 0 ? '+' : ''
  return `${sign}${decimal1(value)}%`
}

/**
 * Rendert de kerncijfers als FINANCIEEL OVERZICHT-sectie — dezelfde opzet als
 * `renderOverview` in local-chat-context.ts, zodat het model in beide functies
 * hetzelfde blok herkent. Onbekende waarden worden expliciet als "onbekend"
 * benoemd; dan is er niets om over te schrijven en verzint het model niets.
 */
export function renderReportFigures(figures: ReportIntroFigures): string {
  const lines = [
    `- Periode: ${figures.periodeNaam}`,
    `- Netto vermogen aan het eind: ${figures.nettoVermogen != null ? euro(figures.nettoVermogen) : 'onbekend'}${
      figures.groeiPct != null ? ` (${pct(figures.groeiPct, true)} t.o.v. het begin)` : ''
    }`,
    `- Inkomen deze periode: ${euro(figures.totaalInkomen)} · uitgaven: ${euro(figures.totaalUitgaven)}`,
    `- Vrijgekocht deze periode: ${euro(figures.totaalGespaard)}${
      figures.spaarquotePct != null ? ` · spaarquote: ${pct(figures.spaarquotePct)}` : ''
    }`,
    `- Voortgang naar volledige vrijheid (FIRE): ${figures.firePct != null ? pct(figures.firePct) : 'onbekend'}`,
    `- Acties afgerond: ${figures.actiesVoltooid} · vrijheidsdagen gewonnen: ${decimal1(figures.vrijheidsdagenGewonnen)}`,
  ]
  return `FINANCIEEL OVERZICHT (gepersonaliseerd, canoniek berekend):\n${lines.join('\n')}`
}

/** Bouw de volledige systeemprompt voor de lokale rapport-inleiding. */
export function buildLocalReportSystemPrompt(figures: ReportIntroFigures): string {
  return [LOCAL_REPORT_DNA, renderReportFigures(figures)].join('\n\n')
}

/**
 * Alle waarden die in de inleiding genoemd MOGEN worden. Dit is precies de set
 * die `renderReportFigures` neerzet — de guardrail toetst één-op-één tegen wat
 * het model te zien kreeg.
 */
export function reportFigureAllowlist(figures: ReportIntroFigures): number[] {
  const all = [
    figures.nettoVermogen,
    figures.groeiPct,
    figures.totaalInkomen,
    figures.totaalUitgaven,
    figures.totaalGespaard,
    figures.spaarquotePct,
    figures.firePct,
    figures.actiesVoltooid,
    figures.vrijheidsdagenGewonnen,
  ]
  return all.filter((n): n is number => n != null && Number.isFinite(n))
}

/* ── Vorm-afdwinging (post-processing) ───────────────────────────────────── */

/**
 * Meta-openingen die een klein instructiemodel er graag voor plakt. Alleen de
 * EERSTE regel wordt hierop getoetst, en alleen wanneer er nog tekst achteraan
 * komt — anders zouden we het hele antwoord weggooien.
 */
const META_OPENING_RE =
  /^(natuurlijk|zeker|uiteraard|graag|prima|ok[eé]?|hier(bij)? (is|volgt|komt)|dit is|hieronder)\b/i

/** Markdown-restanten aan het begin van een regel: kop, bullet, nummer, quote. */
const LINE_MARKUP_RE = /^\s*(?:#{1,6}\s*|[-*•+]\s+|\d+[.)]\s+|>\s*)/
/** Een markdown-kopregel ("## Inleiding") — markup, geen zin. */
const HEADING_LINE_RE = /^\s*#{1,6}\s+\S/

/** Zinsgrens: punt/uitroep/vraag + witruimte + hoofdletter of aanhalingsteken. */
const SENTENCE_SPLIT_RE = /(?<=[.!?])\s+(?=["'‘“„]?[A-ZÀ-ÝÄËÏÖÜ])/

/**
 * Knip de ruwe modeluitvoer terug tot een redactionele inleiding.
 *
 * Waarom achteraf en niet via de prompt: de LiteRT-web-SDK kent geen
 * `max_new_tokens` (zie litert-runtime.ts), dus "max 4 zinnen" is een verzoek,
 * geen limiet. Deze functie maakt er een limiet van:
 *   1. `<think>`-preambles en markdown-fences eraf (dezelfde faalmodi als bij
 *      de categorisatie — gedeelde helper uit parse.ts);
 *   2. een leidende meta-openingsregel eraf;
 *   3. markdown-kopjes/bullets/quotes eraf, `**vet**` en `_cursief_` ontdaan;
 *   4. alles tot één alinea samengevouwen;
 *   5. maximaal {@link LOCAL_REPORT_MAX_SENTENCES} zinnen;
 *   6. hard gekapt op {@link LOCAL_REPORT_MAX_CHARS} tekens, bij voorkeur op een
 *      zinsgrens zodat er nooit een halve zin in het rapport belandt.
 *
 * Levert `null` wanneer er niets bruikbaars overblijft.
 */
export function shapeReportIntro(raw: string): string | null {
  let text = stripThink(raw).trim()
  if (!text) return null

  // Fence-inhoud pakken (```…``` of ```json…```); een niet-afgesloten fence
  // laten we staan minus de backticks — er kan gewoon proza in staan.
  const fence = text.match(/```(?:\w+)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1].trim()
  text = text.replace(/```/g, '').trim()

  const rawLines = text.split(/\r?\n/)
  // Een korte kopregel is een titel, geen zin: die verdwijnt helemaal, mits er
  // nog inhoud onder staat (anders zouden we het hele antwoord weggooien).
  const hasBodyBelowHeadings = rawLines.some((l) => l.trim() && !HEADING_LINE_RE.test(l))
  const lines = rawLines
    .filter((l) => !(hasBodyBelowHeadings && HEADING_LINE_RE.test(l) && l.trim().length <= 80))
    .map((l) => l.replace(LINE_MARKUP_RE, '').trim())
    .filter((l) => l.length > 0 && !/^[-–—_*=]{3,}$/.test(l))

  if (lines.length === 0) return null

  // Meta-opening ("Natuurlijk! Hier is de inleiding:") alleen weghalen wanneer
  // er nog inhoud onder staat.
  if (lines.length > 1 && (META_OPENING_RE.test(lines[0]) || /:$/.test(lines[0])) && lines[0].length <= 160) {
    lines.shift()
  }

  let body = lines
    .join(' ')
    .replace(/\*\*|__|(?<![a-zA-Z0-9])[_*](?![ *_])/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!body) return null

  const sentences = body.split(SENTENCE_SPLIT_RE).slice(0, LOCAL_REPORT_MAX_SENTENCES)
  body = sentences.join(' ').trim()

  if (body.length > LOCAL_REPORT_MAX_CHARS) {
    const window = body.slice(0, LOCAL_REPORT_MAX_CHARS)
    const lastStop = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '))
    if (lastStop > 80) {
      body = window.slice(0, lastStop + 1).trim()
    } else {
      const lastSpace = window.lastIndexOf(' ')
      body = `${window.slice(0, lastSpace > 0 ? lastSpace : LOCAL_REPORT_MAX_CHARS).trim()}…`
    }
  }

  return body.length > 0 ? body : null
}

export interface ReportIntroResolution {
  /** De te tonen inleiding, of null wanneer er niets bruikbaars overbleef. */
  intro: string | null
  /** Waarom er niets is: vorm (leeg/onbruikbaar) of cijfer (guardrail). */
  reason: 'ok' | 'leeg' | 'cijfer-mismatch'
  /** Niet-herleidbare getallen bij een mismatch — voor de console-kanarie. */
  offending: number[]
}

/**
 * Vorm-afdwinging + cijfer-guardrail in één: de enige functie die de UI nodig
 * heeft om van ruwe modeltekst naar een toonbare inleiding te komen.
 *
 * FAIL-CLOSED: noemt de inleiding een bedrag of percentage dat niet in de
 * meegegeven kerncijfers voorkomt, dan is de hele inleiding verworpen (`intro:
 * null`). Liever geen inleiding dan een verzonnen getal in een rapport dat er
 * verder deterministisch en betrouwbaar uitziet — dat laatste maakt een fout
 * cijfer juist gevaarlijker, niet onschuldiger.
 */
export function resolveLocalReportIntro(raw: string, figures: ReportIntroFigures): ReportIntroResolution {
  const shaped = shapeReportIntro(raw)
  if (!shaped) return { intro: null, reason: 'leeg', offending: [] }

  const guard = guardFigures(shaped, reportFigureAllowlist(figures))
  if (!guard.ok) return { intro: null, reason: 'cijfer-mismatch', offending: guard.offending }

  return { intro: shaped, reason: 'ok', offending: [] }
}
