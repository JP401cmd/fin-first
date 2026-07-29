---
id: 0065-landingspagina-blijft-in-fin-first
title: 'Landingspagina en publieke funnel blijven in fin-first (geen aparte marketing-repo)'
status: aanvaard
date: 2026-07-29
elements: [as-vrijheidscheck, b-bezoeker, t-platform]
---

# 0065 — Landingspagina blijft in fin-first

Org-besluit 01 (`trifinity-org/org_plan/60-besluiten.md`), hier vastgelegd zodat de
vraag niet elk kwartaal terugkomt.

## Context

De landingspagina, de funnel-routes (`/functies`, `/prijzen`, `/check`, …) en de app
delen één repo. Afsplitsen naar een eigen marketing-repo klinkt hygiënisch, maar de
Vrijheidscheck (`/check`) draait op de **volledige rekenkernel** (`runHorizonLedger`,
`computeFireProjection`) en schrijft met service-role naar `lead_intakes` (ADR 0022).
Rekenmotoren dupliceren is expliciet verboden (consume, don't recompute); de enige
afsplitsroute zou een publieke API-laag rond de kernel zijn.

Met de SEO-routes uit werkstroom 09 wordt de koppeling alleen maar sterker: elke
publieke pagina hoort naar `/check` te kunnen wijzen — een publieke pagina zonder die
route is een doodlopende weg.

## Besluit

De landingspagina en alle publieke routes **blijven in fin-first**. Er komt geen
aparte marketing-repo en geen API-laag rond de rekenkernel zolang er geen tweede
afnemer van die kernel bestaat.

## Gevolgen

- Elke wijziging aan publieke tekst blijft langs `compliance-check` gaan (de
  Grenswachter-poort); de repo-scheiding verandert daar niets aan.
- De scheiding app/publiek blijft een **oppervlakte-scheiding binnen één repo**:
  `app/(app)/**` versus root-routes + `components/landing/*` (zie
  `org_plan/40-landingsplekken.md`).
- Heroverwegen is pas aan de orde als er een tweede kernel-afnemer komt (bijv. een
  mobiele app) — dan is de API-laag het echte besluit, niet de repo-splitsing.
