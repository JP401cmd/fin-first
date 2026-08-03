// ── Lokale aanbevelingen ("Golden Nuggets"): DNA + assemblage ────────────────
//
// Dit bestand bezit de STEM (de gecondenseerde DNA) en de ASSEMBLAGE (het
// KANS-blok) voor het ON-DEVICE tips-pad (Gemma 4 E2B, 2B params, 8192-
// tokenvenster).
//
// GECONDENSEERDE VARIANT van RECOMMENDATIONS_SYSTEM_PROMPT (lib/ai/dna/
// recommendations.ts). Het cloudpad doet één `generateObject`-call die drie tips
// tegelijk bedenkt, doorrekent én in een genest zod-schema giet. Hier krijgt het
// model per call ÉÉN al doorgerekende kans en levert het alleen taal.
//
// WAT ER BEWUST UIT IS (en waarom dat mag): de hele REKENREGELS-sectie
// (yearlyMustExpenses/365, compound 1,07^10, FIRE-doel/SWR), de vijf
// `recommendation_type`-enums, de priority_score-uitleg, de Temporal-Balance-
// niveaus, de NIBUD-uitleg en het "vermijd duplicaten"-blok. Al die dingen doet
// TypeScript nu deterministisch in `local-tips-context.ts` — een 2B-model dat
// zelf euro's of vrijheidsdagen uitrekent produceert plausibele onzin mét
// financiële strekking, en dat is hier het grootste risico.
//
// WAT ER BEWUST IN BLIJFT: de vrijheidsdagen-taalregel (compliance — die claim
// mag alleen bij essentiële budgetten én `retirement_expense_method =
// 'essential_budgets'`), het "nooit veroordelend"-verbod ("je geeft te veel uit"),
// en de Wft-grens.
//
// KOPPELING PROMPT ↔ RENDERER (breekbaar, dus expliciet): de VRIJHEIDSDAGEN-regel
// in de DNA hangt op de LETTERLIJKE string `Vrijheidsdagen:` in het KANS-blok.
// `renderKansBlok` laat die regel weg zodra de compliance-regel niet geldt; dat
// weglaten ÍS de guard. Hernoem het label dus nooit los van de DNA-tekst.
//
// BUDGET: 2.468 tekens ≈ 617 tokens (meetmethode chars/4, scripts/ai-parity/
// scan.mjs). Plus een KANS-blok (~150 tok) en ~180 tokens uitvoer blijft één call
// ruim onder de 1.000 — waar het cloudpad er 4.500-7.500 nodig had.
//
// Wóórding is het domein van `ai-specialist-prompt-dna`; wijzig de copy niet
// zonder die route.
//
// GEEN CLOUD-GUARDRAILS: on-device pad, geen egress. `sanitizeForAI` /
// `maskPIIInOutput` / token-logging zijn N.V.T. (ADR 0043 §5).

import type { LocalTipCandidate } from './local-tips-context'

/**
 * Gecondenseerde aanbevelingen-DNA voor het lokale pad: kernfilosofie + de harde
 * getallen-/vrijheidsdagen-/toon-regels + het uitvoercontract. Bevat GEEN kans —
 * die wordt per call door {@link renderKansBlok} toegevoegd.
 */
export const LOCAL_RECOMMENDATIONS_DNA = `Je bent Fin, de kansenredacteur van TriFinity. KERNFILOSOFIE: geld is opgeslagen tijd — elke euro is een stukje leven, dus vrijheidstijd is de taal.

OPDRACHT: je krijgt hieronder ÉÉN kans (het KANS-blok), die de app al voor deze gebruiker heeft doorgerekend. Jij levert alleen de TAAL: een titel, een korte toelichting en 1-3 acties. Meer niet.

GETALLEN ZIJN HEILIG: verzin, herbereken of schat NOOIT een getal, percentage of rekenregel. Je noemt uitsluitend getallen die letterlijk in het KANS-blok staan, teken voor teken overgenomen — "€1.080" blijft "€1.080", nooit "1080 euro", "€1.100" of afgerond. Elk ander getal laat je weg.

VRIJHEIDSDAGEN: staat er een regel "Vrijheidsdagen:" in het KANS-blok, dan mag je zeggen "win je N vrijheidsdagen per jaar", met N exact uit die regel. Ontbreekt die regel, dan gebruik je die formulering NOOIT — ook niet in andere woorden als "dagen vrijheid" of "levenstijd terug". Schrijf dan: "bespaar je €X per jaar richting je FIRE-doel".

NOOIT VEROORDELEND: niet "je geeft te veel uit aan boodschappen", wel "vergelijkbare huishoudens geven gemiddeld €X uit" of "als je hier €X bespaart...". De gebruiker doet niets fout; dit is een kans, geen verwijt.

CONCREET: schrijf over déze ene kans en noem 'm bij naam — niet over sparen, budgetteren of vrijheid in het algemeen.

COMPLIANCE (Wft): geen individueel beleggingsadvies, geen koop- of verkoopaanbeveling voor specifieke aandelen, crypto of andere producten, ook niet indirect.

TOON: Nederlands, je/jij, empowerend, eerlijk, kort. Geen markdown-headers, geen emoji.

UITVOER: precies dit ene blok en niets eromheen — geen inleiding, geen proza, geen uitleg erna:
\`\`\`fin-tip
{"title": "…", "description": "…", "actions": ["…"]}
\`\`\`
title: max 60 tekens, concreet. description: 1-2 zinnen, max 200 tekens, noemt de euro-impact uit het KANS-blok. actions: 1-3 korte actietitels in gebiedende wijs, elk max 60 tekens, zonder getallen en zonder uitleg.

VOORBEELD (KANS-blok zonder regel "Vrijheidsdagen:", dus zonder vrijheidsdagen in de tekst):
\`\`\`fin-tip
{"title": "Meer overhouden aan je boodschappen", "description": "Vergelijkbare huishoudens geven hier ~€520/maand uit. Bespaar je €90 per maand, dan bespaar je €1.080 per jaar richting je FIRE-doel.", "actions": ["Vergelijk een week lang je vaste supermarkt", "Zet een weekbedrag voor boodschappen"]}
\`\`\`
Het voorbeeld toont alleen de vorm; schrijf altijd over de kans die jij krijgt, met de getallen die dáár staan.`

/**
 * Ruimte voor de uitvoer van één tip. Het contract is klein (titel +
 * 1-2 zinnen + max 3 actietitels ≈ 120-180 tokens); 256 geeft marge zodat het
 * JSON-blok nooit halverwege afkapt — een afgekapt blok kost een hele tip,
 * want de parser is fail-closed.
 */
export const LOCAL_TIP_MAX_NEW_TOKENS = 256

/** EUR-notatie, nl-NL (bv. "€1.080") — identiek aan de notatie in de DNA-voorbeelden. */
function euro(amount: number): string {
  return `€${Math.round(amount).toLocaleString('nl-NL')}`
}

/**
 * Dwing één regel af voor elke waarde die in het KANS-blok wordt ingevoegd.
 *
 * WAAROM DIT ER MOET STAAN: het blok is REGEL-gebaseerd en de DNA hangt op de
 * letterlijke regel `Vrijheidsdagen:`. Sommige waarden komen uit vrije tekst die
 * de gebruiker niet zelf schreef — `Heroverweeg <tegenpartijnaam>` komt uit een
 * bankimport (MT940/CSV/OFX), een schuld- of bezitsnaam is zelf ingetypt. Eén
 * regelovergang daarin zou een eigen `Vrijheidsdagen: 99 per jaar`-regel kunnen
 * bijschrijven, waarna het model netjes toestemming leest voor een claim die de
 * compliance-regel juist verbood. Newlines platslaan is de goedkoopste dichte
 * deur; de backtick vervangen houdt bovendien de fence-structuur intact.
 */
function eenRegel(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/`/g, "'").trim().slice(0, 160)
}

/**
 * Rendert één kandidaat als KANS-blok.
 *
 * De `Vrijheidsdagen:`-regel verschijnt ALLEEN wanneer de compliance-regel is
 * gehaald (zie `resolveTipFreedomDays`). Het model mag over vrijheidsdagen
 * schrijven precies dan, en de DNA hangt op die letterlijke string — het
 * weglaten van de regel is dus de handhaving, niet een verzoek aan het model.
 */
export function renderKansBlok(candidate: LocalTipCandidate): string {
  const lines = ['KANS', `Titel: ${eenRegel(candidate.titel)}`]
  if (candidate.toelichting) {
    lines.push(`Toelichting: ${eenRegel(candidate.toelichting)}`)
  }
  const maand =
    candidate.euroImpactMonthly != null && candidate.euroImpactMonthly > 0
      ? ` (${euro(candidate.euroImpactMonthly)} per maand)`
      : ''
  lines.push(`Besparing: ${euro(candidate.besparingPerJaar)} per jaar${maand}`)
  if (candidate.vrijheidsdagenToegestaan && candidate.vrijheidsdagen > 0) {
    lines.push(`Vrijheidsdagen: ${candidate.vrijheidsdagen} per jaar`)
  }
  return lines.join('\n')
}

/**
 * Bouw de twee berichten voor één generate-call. System = de DNA (constant, dus
 * per sessie herbruikbaar prefill), user = het KANS-blok van deze ene kandidaat.
 */
export function buildLocalTipMessages(
  candidate: LocalTipCandidate,
): { role: 'system' | 'user'; content: string }[] {
  return [
    { role: 'system', content: LOCAL_RECOMMENDATIONS_DNA },
    { role: 'user', content: renderKansBlok(candidate) },
  ]
}
