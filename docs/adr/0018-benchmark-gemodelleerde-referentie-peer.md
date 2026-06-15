---
status: aanvaard
date: 2026-06-15
elements: [as-rapport, as-planning, as-vermogen]
---

# 0018 — Benchmarkrapportage: synthetische referentie-peer op basis van CBS/Nibud/DNB

## Context

De benchmarkrapportage op `/rapportages/benchmark` vergelijkt vijf canonieke gebruikersmaten (gezondheidsscore, vrijheidsleeftijd, spaarquote, netto vermogen, geschat jaarinkomen) met een referentie. Voor drie van de vijf maten bestaan officiële NL-statistieken (CBS Vermogen 2024, CBS Besteedbaar inkomen, indicatieve Nibud spaarquote). Voor de gezondheidsscore en de vrijheidsleeftijd bestaat géén externe statistiek: het zijn app-eigen samengestelde maten.

Twee opties stonden ter discussie:
1. **Cross-user-aggregatie** — bereken de gemiddelden over de eigen gebruikerspopulatie en gebruik die als referentie.
2. **Synthetische peer** — modelleer een "typische peer" door cohort-mediane CBS-invoer door dezelfde canonieke rekenmotoren te draaien als de gebruiker zelf.

## Besluit

Gekozen voor optie 2: een **volledig synthetische peer**, opgebouwd uit publieke NL-statistieken, zonder enige cross-user-aggregatie.

Kernkeuzes:

1. **Privacy-safe standaard**: eigen-gebruikersbasis aggregeren is technisch mogelijk (Supabase service-role) maar introduceert een nieuw privacy-regime (aggregaat van persoonlijke financiën). Door de peer volledig synthetisch te houden is de rapportage privacy-safe per constructie — geen opt-in, geen AVG-afweging per versie.

2. **Appels-met-appels via consume-don't-recompute (CLAUDE.md)**: de gezondheidsscore en vrijheidsleeftijd van de peer worden berekend via `computeHealthScoreFromInputs` en `computeFireProjection` — exact dezelfde functies als voor de gebruiker. Zo vergelijken gebruiker en peer altijd op dezelfde definitie, ook als de motoren evolueren.

3. **Eerlijkheidspositionering (measured vs. modelled)**: CBS- en Nibud-maten zijn gelabeld `tier: 'measured'`; de gemodelleerde peer-uitkomsten zijn expliciet `tier: 'modelled'`. De UI toont dit onderscheid om oververwachting te voorkomen.

4. **Transparante aannames**: wat niet uit CBS komt (noodfonds = 3 maanden, geen budgetdata → concentratie/budgetdiscipline-pijlers inactief) staat gedocumenteerd in `reference-peer.ts` en de Berekeningen-catalogus.

5. **Eigen-gebruikerscijfers nooit herberekend**: `buildBenchmarkReport` consumeert de `DashboardData`-bundel onveranderd. Alleen de referentie-zijde wordt hier opgebouwd.

6. **Wereld-reality-check via publieke datapunten**: inkomen- en vermogenspercentiel wereldwijd (UBS Global Wealth Report + World Inequality Database) zijn statische curatie met jaar-label — geen eigen berekening, wel gesourced en gedateerd.

7. **Bewuste beperking — cohort-beschikbaarheid**: als leeftijd of huishoudtype ontbreekt wordt de cohort-vergelijking weggelaten; de mondiale reality-check werkt altijd. Dit is een UX-keuze, geen architectuurprobleem.

## Gevolgen

- `lib/benchmark/` bevat vier bestanden met zuivere pure functies (geen I/O, testbaar).
- Een toekomstige eigen-gebruikersbasis-variant kan naast de synthetische peer worden toegevoegd als een opt-in feature, zonder de bestaande rapportage te breken.
- Cross-user-aggregatie is bewust uitgesteld en gedocumenteerd; wanneer de gebruikerspopulatie groot genoeg is voor statistisch zinvolle cohorten kan dit worden heroverwogen met een expliciete AVG-afweging.
