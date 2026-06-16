---
status: aanvaard
date: 2026-06-16
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

---

## Correctie — 2026-06-16: methodiek `HOUSEHOLD_ADJUST`-factoren

### Wat was het probleem

De oorspronkelijke `HOUSEHOLD_ADJUST`-factoren in `lib/benchmark/nl-reference.ts` werden toegepast op de CBS-leeftijdsband-cijfers zonder te realiseren dat die cijfers al **gestandaardiseerd (geëquivaleerd)** zijn: CBS tabel 2.4.1 rapporteert *besteedbaar inkomen per equivalent* (CBS-equivalentieschaal), en de medianen per leeftijdsband zijn gebaseerd op die geëquivaleerde maat. Een alleenstaand persoon met equivalentiefactor 1,00 heeft daarin al een "gecorrigeerd" inkomen — de factor 0,62 die daarvóór werd toegepast was een dubbeldiscount.

Hetzelfde gold voor het vermogen: de CBS-vermogensstatistiek (Materiële welvaart 2024) levert medianen per leeftijdsband over alle huishoudtypen; de factoren werden toegepast op die gecombineerde mediaan zonder rekening te houden met het inherente gewicht van alleenstaanden (laag vermogen) in die populatie.

### Gecorrigeerde factoren (nl-reference.ts, HOUSEHOLD_ADJUST)

**Inkomen** — nu CBS-equivalentiefactoren (Budgetonderzoek 2015, verslagjaar ≥2018):

| huishoudtype   | oud   | nieuw (CBS) |
|---------------|-------|-------------|
| alleenstaand  | 0,62  | 1,00        |
| paar          | 1,28  | 1,40        |
| gezin\_jong   | 1,22  | 1,75        |
| gezin\_tiener | 1,34  | 1,91        |

Ratio: CBS gestandaardiseerd inkomen × equivalentiefactor = ruw huishoudinkomen. Een alleenstaande heeft equivalentiefactor 1,00 (de referentiehuishouding in de CBS-schaal); geen correctie nodig.

**Vermogen** — expliciet gemodelleerd (geen gepubliceerde CBS-kruistabel leeftijd × huishoudtype beschikbaar):

| huishoudtype   | oud   | nieuw (gemodelleerd) |
|---------------|-------|----------------------|
| alleenstaand  | 0,55  | 0,35                 |
| paar          | 1,30  | 1,45                 |
| gezin\_jong   | 1,05  | 1,25                 |
| gezin\_tiener | 1,20  | 1,55                 |

Grondslag: CBS vermogen per huishoudtype 2022 (alleenstaand mediaan ~€18k, meerpersoons ~€218k), gematigd voor leeftijdsband. De richting (alleenstaand lager dan gemiddelde mediaan, paar en gezin hoger) is CBS-gegrond; de precieze waarden zijn een modelschatting.

### Presentatie-aanpassing

De UI-badge "CBS-cijfer" is hernoemd naar **"Geraamde referentie (CBS-basis)"** (badge op kaart-niveau) en **"Geraamde referentie (CBS-basis)"** (tooltiptekst). Reden: de fijnmazige leeftijd × huishoudtype-kruising is een modelschatting — er bestaat geen gepubliceerde CBS-tabel op dat niveau. De CBS-leeftijdsbasis van de ruwdata is echter ongewijzigd; alleen de huishoudtype-splitsing is geraamd.

### Gevolgen voor punt 3 van dit besluit

Punt 3 (eerlijkheidspositionering measured vs. modelled) blijft van kracht; de aanpassing verfijnt het onderscheid: de leeftijdsbasis-medianen zijn `tier:'measured'` (CBS), de huishoudtype-verdeling is nu expliciet gelabeld als geraamd (`tier:'modelled'`) ook in de UI, niet alleen intern. De architectuurkeuze (synthetische peer, geen cross-user-aggregatie) is ongewijzigd.
