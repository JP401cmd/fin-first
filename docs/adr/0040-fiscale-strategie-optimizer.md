---
id: 0040-fiscale-strategie-optimizer
title: 'Fiscale-strategie-optimizer = orchestratie over bestaande engines (Box 3-MVP, gesloten-vorm, Wft = illustratie)'
status: accepted
date: 2026-07-13
elements: [as-belasting]
---

# 0040 — Fiscale-strategie-optimizer als orchestratie-laag (Box 3-MVP)

## Context

Roadmap J vraagt de stap van belasting **berekenen** naar **optimaliseren**: de
gebruiker kiest een fiscaal doel en TriFinity zet doorgerekende strategieën
naast elkaar (in euro's én vrijheidsdagen). Concurrenten (ProjectionLab v4.6,
Boldin) doen dit voor het Amerikaanse stelsel met beam-search + Compare-heatmap;
de NL-invulling bestaat nergens. Het onderzoek (`docs/marktonderzoek-functionaliteiten-jul2026.md`
§3.4, gap #4) wees uit dat de per-as-rekenkracht grotendeels al bestaat — wat
ontbrak was (a) een doel-gedreven voordeur en (b) één Compare-oppervlak.

Twee beslispunten lagen voor; de eigenaar koos:

1. **MVP-as = Box 3.** ("voor personal finance is box 3 voor ons het meest
   toonaangevend; Box 1 is minimaal.") De Box 3-motor is al af
   (`calculateBox3`, `optimizePartnerAllocation`), single-year/gesloten-vorm,
   volledig uitlegbaar → laagste Wft-risico en de sterkste NL-differentiator
   (forfaitair stelsel + partnerverdeling + peildatum).
2. **IA-plek = nieuwe route `/overzicht/belasting/optimizer`** als 4e hub-kaart
   onder de belasting-hub (firm aanbeveling, geen expliciete override).

## Besluit

De optimizer is een **orchestratie-laag + UI**, **geen nieuwe rekenkern**.

- **Pure lib `lib/tax-optimizer/`** genereert de Box 3-scenario's uitsluitend via
  de canonieke engine `calculateBox3` (samenstelling-shift) en de scalaire
  uitkomst van `optimizePartnerAllocation` (partnerverdeling). Ranking is een
  pure doel-functie; er zijn twee actieve doelen (minimale heffing /
  geen-rendementsverlies) en twee "binnenkort"-doelen (jaarruimte, levenslange
  druk).
- **Consume, don't recompute (hard):** de optimizer forkt geen tax-logica en
  definieert geen forfait/tarief-constanten. `synthBox3Input` voedt
  `calculateBox3` een **compositie-equivalente** invoer (twee synthetische
  assets + één niet-hypotheek-schuld) zodat een shift over willekeurig veel
  echte assets exact reproduceerbaar is. Een parity-test vergrendelt dat de
  synthetische baseline **byte-identiek** dezelfde heffing geeft als het echte
  resultaat — er ontstaat geen derde Box 3-getal.
- **Gesloten-vorm / brute-force, geen beam-search.** De NL-assen zijn
  laag-dimensionaal; exhaustief enumereren volstaat en is beter uitlegbaar.
- **Partner-privacy (ADR 0036):** de partnerverdeling loopt via
  `loadPerspectiveBox3`; alleen de scalairen `savingsVsEqual` + `totalTax`
  bereiken de client — nooit de per-partner-splitsing.
- **Wft = illustratie, geen advies.** Alles is geframed als "doorgerekend
  scenario / kans" met een vaste "Indicatie, geen advies"-callout. Ranken =
  tonen wat het meeste oplevert, niet aanraden-als-advies; voor persoonlijk
  advies verwijzen we naar een erkend adviseur.

## Gevolgen

- Nieuwe rekenmotor geregistreerd in `lib/architecture/calculations.ts`
  (`fiscale-optimizer`, domein Belasting).
- Acceptatie gehaald: doel kiezen → ≥2 doorgerekende scenario's met € +
  vrijheidsdagen naast elkaar; alle getallen uit bestaande engines.

## Openstaande vervolgfasen (bewust buiten deze MVP)

- ~~**Jaarruimte-as** — marginaal-correcte besparing via `computeBox1Tax` × 2
  (i.p.v. de vlakke inleg×marginaal-benadering).~~ **GEREALISEERD** (13 jul
  2026) — zie ADR 0041, `jaarruimteBesparing` in `lib/jaarruimte.ts`.
- **Onttrekkingsvolgorde-as** — kernel preset-sweep (`evaluateFireAt`), doel =
  laagste levenslange Box 3 + FIRE-leeftijd-behoud.
- **Peildatum-timing** — pas ná antimisbruik-3-maandsregel-modellering (Wft:
  een timing-suggestie die de terugkoopregel negeert = misleidend).
- **Data-gedreven Box 1-signalen** (eigenaar-vraag) — bv. veel medische
  transacties → attenderen op de zorgkosten-aftrek (specifieke zorgkosten met
  inkomens­drempel). Vereist transactie-categorie-detectie + de drempeltabel;
  past als een "fiscale signalen"-laag, buiten de Box 3-rekenscope van deze MVP.
- **Partnerverdeling breder** dan Box 3 (Box 1-inkomsten toerekenen).
