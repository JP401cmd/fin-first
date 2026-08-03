// ── Lokale briefing-redactie: DNA-tekst — SINGLE SOURCE ──────────────────────
//
// De dagelijkse briefing op /overzicht wordt DETERMINISTISCH gecomposeerd: elk
// bedrag komt uit de engine, nooit uit een model. Daarna herschrijft Fin de
// briefjes in zijn stem. Dit bestand bezit alleen de STEM voor het ON-DEVICE
// pad (Gemma 4 E2B, 2B params, 8192-tokenvenster); de assemblage — per-call
// opdracht, brontekst, directives — hoort in local-briefing-resolver.ts.
//
// GECONDENSEERDE VARIANT van REDACTIE_SYSTEM (lib/briefing/redactie.ts ~r166):
// het cloudpad doet één `generateObject`-call over álle briefjes tegelijk; een
// 2B-model kan dat niet. Hier krijgt het model per call ÉÉN taak (één briefje,
// of de kopzin) en antwoordt het met platte tekst — vandaar dat het JSON- en
// id-echo-deel van de cloudprompt hier bewust ontbreekt.
//
// WAAROM DE NUMMER-REGEL SCHERPER IS DAN IN DE CLOUD: `sanitizeRedactedText`
// (redactie.ts) is een post-hoc guard die elk briefje afkeurt waarin een
// bron-getal niet letterlijk terugkomt of waarin een nieuw getal opduikt — die
// tekst valt dan terug op het deterministische origineel. Een model dat
// "€1.234" beleefd herschrijft naar "1234 euro" levert dus zichtbaar NIETS op:
// de redactie wordt stil weggegooid. Kleine modellen normaliseren getallen uit
// zichzelf, dus staat de teken-voor-teken-eis hier vóóraan, met een concreet
// tegenvoorbeeld erbij (een klein model leest sequentieel — regels achteraan
// wegen minder).
//
// GEEN WFT-BLOK: dit is redactie van bestaande, goedgekeurde teksten, geen
// advies. De prompt lokt bewust ook niets uit dat om advies vraagt. Wél staat er
// sinds de compliance-toets een expliciet TOEVOEG-verbod in de REGELS: de
// post-hoc guard `sanitizeRedactedText` toetst alleen GETALLEN, dus een
// herschrijving die er een aanbeveling bij verzint ("overweeg te beleggen") kwam
// er ongehinderd doorheen. De brontekst is de grens, niet alleen de cijfers.
//
// BUDGET: ~200 tokens (meetmethode chars/4, zie scripts/ai-parity/scan.mjs).
// Wóórding is het domein van `ai-specialist-prompt-dna`; wijzig de copy niet
// zonder die route, en her-baseline daarna het parity-manifest.

/**
 * Gecondenseerde redactie-DNA voor de lokale briefing: kernfilosofie + de
 * harde nummer-/vorm-/lengte-regels + toon. Bevat GEEN brontekst en geen
 * opdrachtregel — die worden per call toegevoegd door de resolver.
 */
export const LOCAL_BRIEFING_DNA = `Je bent Fin, de redacteur van TriFinity. KERNFILOSOFIE: geld is opgeslagen tijd — elke euro is een stukje leven, dus vrijheidstijd is de taal.

REGELS: Je krijgt één taak: één briefje herschrijven, of één kopzin schrijven. De brontekst klopt al; jij herschrijft alleen de woorden. GETALLEN ZIJN HEILIG: neem elk getal teken voor teken over — "€1.234" blijft "€1.234", nooit "1234 euro", "€1234" of afgerond. Laat geen getal weg, voeg er geen toe. Behoud de lading: een waarschuwing blijft een waarschuwing, een viering een viering. Voeg niets toe wat er niet staat — geen advies, geen aanbeveling, geen oordeel. Briefje: max 2 zinnen, onder 240 tekens. Kopzin: één zin, max 90 tekens.

UITVOER: alleen de kale tekst — geen JSON, geen aanhalingstekens, geen opsomming, geen inleiding als "Hier is", geen markdown, geen emoji.

TOON: Nederlands, je/jij, warm, helder, concreet, nooit klef, nooit veroordelend.`
