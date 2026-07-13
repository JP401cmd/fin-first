---
id: 0041-jaarruimte-besparing-single-source
title: 'Jaarruimte-besparing = single source (marginaal-correct via computeBox1Tax × 2)'
status: accepted
date: 2026-07-13
elements: [as-belasting]
---

# 0041 — Jaarruimte-besparing als single source (marginaal-correct)

## Context

De jaarruimte-belastingbesparing werd op vijf plekken lokaal berekend met
dezelfde vlakke benadering: `onbenutte jaarruimte × marginaal tarief`. De
plekken: de Box 1-jaarruimtekaart, de belasting-hub (inzicht C4), de
aandachtspunten-loader, de AI-tax-context (waar De Wil dit vertelt), en de
belast-acceptance-oracle. Onderling consistent, maar allemaal minder correct:
ADR 0040 benoemde deze vlakke methode zelf al als inferieur aan een
marginaal-correcte berekening via `computeBox1Tax`. De fiscale-strategie-
optimizer krijgt nu een jaarruimte-as (voorheen "binnenkort" in ADR 0040) — een
zesde plek die dezelfde som zou herhalen, en dus een zesde kans op drift.

## Besluit

**Optie A-full**: één pure helper `jaarruimteBesparing(grossYearlyIncome,
inleg, year, opts?)` in `lib/jaarruimte.ts`, marginaal-correct berekend als
`computeBox1Tax(gross) − computeBox1Tax(gross − inleg)`. Alle vijf bestaande
consumenten migreren hierop, plus de nieuwe optimizer-consument (zes in
totaal).

Bewuste vereenvoudiging: marginaal-correct op **bruto-grondslag** — de
eigen-woning-band-shift (hypotheekrenteaftrek-interactie) valt buiten scope en
blijft een "Indicatie". `aow`-status default `false` tenzij expliciet
meegegeven.

Toekomst-precisie (Optie B, niet in deze wijziging): een `lijfrenteAftrek`-
input aan `computeBox1Tax` die de belastbare grondslag verlaagt zónder de
arbeidskorting-grondslag te raken — dat is de fiscaal exacte volgorde
(lijfrente-aftrek werkt door in het belastbaar inkomen maar niet in de
grondslag voor de arbeidskorting). Genoteerd als vervolgfase.

## Gevolgen

- Gedragswijziging op vier reeds-verscheepte oppervlakken: de kaart, de hub,
  de aandachtspunten-loader en de AI-tax-context tonen voortaan een
  correcter — in de afbouwzones van heffingskortingen doorgaans hóger —
  besparingsbedrag dan de oude vlakke `× marginaal`-som.
- De belast-acceptance-oracle wordt her-afgeleid op de nieuwe, correcte
  getallen.
- Geregistreerd in `lib/architecture/calculations.ts` onder zowel de
  `box1`-calc (canonieke functie) als de `fiscale-optimizer`-calc (nieuwe
  jaarruimte-as-consument).
- Consistent met CLAUDE.md "consume, don't recompute": één bron, zes
  consumenten, geen lokale herberekening meer.
