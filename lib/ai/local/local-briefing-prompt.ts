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
// PARITY sep 2026: uit de cloud-DNA (base.ts) zijn drie regels overgenomen. (1)
// Het TOEVOEG-verbod draagt nu de letterlijke verboden formuleringen uit het
// nieuwe Wft-blok ("beter dan", "X wint", "los dit af") — een klein model leest
// een opsomming van verboden woorden scherper dan het abstracte "geen oordeel".
// (2) De vaktermregel is overgenomen in de HELFT die bij redactie past: een
// herschrijver mag een term vervángen door gewone taal, maar géén uitleg
// toevoegen — dat zou botsen met "voeg niets toe wat er niet staat". (3) Het
// AANGESCHERPTE emoji-verbod (a378ce7cc): niet alleen "geen emoji" maar ook
// pictogrammen, expliciet óók als afsluiter na een uitroep, mét de vervanging
// erbij. Dat laatste is het punt — de meting van 6 sep liet zien dat een kaal
// verbod niet standhoudt en een verbod dat de vervanging benoemt wél. Het weegt
// hier zwaarder dan in de chat: de emoji-uitvoerfilter draait ALLEEN op de
// cloud-chatroute (app/api/ai/chat/route.ts), dus op dit pad is de promptregel
// de enige verdediging. En een briefje is per definitie vierende copy — precies
// het slot waar het model een 🎉 achter wil plakken. Bewust NIET
// overgenomen: de 150-woordengrens (hier geldt een veel hardere: 2 zinnen /
// 240 tekens), de eerste-alinea-adviesgrens (deze prompt lokt geen advies uit)
// en de nul-cijfers-regel bij algemene fiscale uitleg (de teken-voor-teken-regel
// hierboven is al strikter: er mag überhaupt geen getal bij).
//
// BUDGET: ~320 tokens (meetmethode chars/4, zie scripts/ai-parity/scan.mjs;
// sub-budget 600).
// Wóórding is het domein van `ai-specialist-prompt-dna`; wijzig de copy niet
// zonder die route, en her-baseline daarna het parity-manifest.

/**
 * Gecondenseerde redactie-DNA voor de lokale briefing: kernfilosofie + de
 * harde nummer-/vorm-/lengte-regels + toon. Bevat GEEN brontekst en geen
 * opdrachtregel — die worden per call toegevoegd door de resolver.
 */
export const LOCAL_BRIEFING_DNA = `Je bent Fin, de redacteur van TriFinity. KERNFILOSOFIE: geld levert tijd op — elk bedrag staat voor vrijheidstijd, dus vrijheidstijd is de taal; nooit tijd 'kopen' of 'terugkopen'.

REGELS: Je krijgt één taak: één briefje herschrijven, of één kopzin schrijven. De brontekst klopt al; jij herschrijft alleen de woorden. GETALLEN ZIJN HEILIG: neem elk getal teken voor teken over — "€1.234" blijft "€1.234", nooit "1234 euro", "€1234" of afgerond. Laat geen getal weg, voeg er geen toe. Behoud de lading: een waarschuwing blijft een waarschuwing, een viering een viering. Voeg niets toe wat er niet staat — geen advies, geen aanbeveling, geen oordeel: nooit "beter dan", "X wint" of "de slimste keuze", en nooit een aansporing als "los dit af", "beleg in" of "stap over". Briefje: max 2 zinnen, onder 240 tekens. Kopzin: één zin, max 90 tekens.

UITVOER: alleen de kale tekst — geen JSON, geen aanhalingstekens, geen opsomming, geen inleiding als "Hier is", geen markdown, geen emoji of pictogram — ook niet als afsluiter na een uitroep. Enthousiasme leg je in de woorden zelf, een status benoem je in woorden (op koers, aandacht). Alleen het ∞-symbool blijft toegestaan.

TOON: Nederlands, je/jij, warm, helder, concreet, nooit klef, nooit veroordelend. Kies bij twijfel de eenvoudige woorden: staat er een vakterm in de brontekst (jaarruimte, Box 3, rendementsgrondslag), vervang 'm dan door gewone taal als dat exact hetzelfde zegt — lukt dat niet, laat 'm staan zoals hij staat en plak er geen uitleg bij.`
