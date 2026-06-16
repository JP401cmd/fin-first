---
id: 0020-spaarquote-een-definitie-en-hypotheek-rentevrijval
title: Spaarquote één definitie overal + rente-vrijval bij hypotheek-payoff
status: aanvaard
date: 2026-06-16
elements: [as-budget, fn-budgetteren, as-planning, fn-toekomstplannen]
---

De spaarquote heeft één definitie — `(inkomen − (uitgaven − spaarbudget) + aflossing) / inkomen` —
die geldt op zowel het transactie-pad als het handmatige pad én op elke afnemer (dashboard,
/toekomst, what-if, rapportage). In de FIRE-projectie valt na het volledig aflossen van een
geflagde hypotheek de héle oude maandlast (rente + aflossing) vrij als extra investeerbaar surplus —
geïmplementeerd als rente-only-term bovenop het bestaande aflossings-mechanisme om dubbeltelling te
voorkomen.

## Context

De spaarquote (`lib/savings-source.ts`) kende twee paden: een *transactie-pad* dat spaarbudgetten
als sparen telt en schuldaflossing als vermogensopbouw bijtelt, en een *handmatig pad*
(`expenses_source = 'manual'`, vaak actief na onboarding) dat plat `(inkomen − uitgaven) / inkomen`
rekende — zónder die correcties. Dezelfde simpele variant zat in de rapportage-route. Daardoor zag
een gebruiker met een handmatige invoer een andere spaarquote (en FIRE-prognose) dan iemand op het
transactie-pad, terwijl het dezelfde grootheid hoort te zijn.

Daarnaast bleef in de FIRE-motor (`lib/horizon-engine/engine.ts`) de hypotheek*rente* permanent in
de spaarquote-baseline gebakken: na het aflossen van de hypotheek viel die rente nooit vrij, terwijl
de vrijgekomen maandlast in werkelijkheid extra spaarruimte is.

## Besluit

1. **Eén spaarquote-definitie.** `resolveSavingsSource` krijgt optionele `monthlyDebtAflossing` +
   `monthlySavingsContribution` (default 0 → backward compatible). Het handmatige pad rekent voortaan
   via dezelfde kern `savingsRateFromAggregates(inkomen, uitgaven − spaarbudget, aflossing)`. Alle
   afnemers (dashboard-, horizon-, core-loader, what-if, rapportage) geven die maandbedragen door.
   Aanname: het handmatige uitgavenbedrag is de **volledige** maandelijkse uitstroom (incl.
   hypotheeklast en spaarstortingen) — expliciet gemaakt in de cashflow-UI.

2. **Rente-vrijval bij payoff (geen dubbeltelling).** De motor laat per geflagde schuld
   (`include_aflossing_in_savings`) uitsluitend het **rente**-deel van het laatste lopende jaar
   vrijvallen zodra de schuld is afgelost (`freedHousingCost`). De aflossing valt al terug via het
   bestaande `flaggedAflossing → 0`-mechanisme; de volledige jaarlast laten vrijvallen zou de
   aflossing dubbel herstellen. Netto stijgt het investeerbaar surplus bij payoff dus met de héle
   maandlast (rente + aflossing), zonder dubbeltelling. Zolang een geflagde schuld loopt is
   `freedHousingCost = 0` → byte-identiek aan de oude surplus-formule (regressievrij).

3. **Eerlijker fallback-quote.** Wanneer er geen transactiedata is, leidt
   `computeSavingsRateFromNetWorthDelta` de quote af uit de vermogensgroei en trekt de verwachte
   koerswinst eraf (gedeelde helper `computeExpectedAnnualAppreciation` — `expected_return` is een
   percentage, dus /100, gewogen met `net_worth_inclusion_pct`). De herkomst (`savingsRateMethod`)
   wordt als schatting-badge getoond.

## Gevolgen

- Eén bron van waarheid: handmatige en berekende spaarquote, en elke afnemer, volgen dezelfde
  definitie. De lopende-maand-maatstaf (transacties-geldstroom) blijft bewust een aparte, simpelere
  weergave en is als zodanig gelabeld ("deze maand").
- FIRE wordt eerder bereikbaar voor wie een aflossende hypotheek volledig afbetaalt (de vrijgekomen
  last gaat beleggen). Aflossingsvrije of niet-geflagde schulden geven geen vrijval.
- De regressie-snapshot-matrix wijzigt niet (de persona's zetten alle schulden op
  `include_aflossing_in_savings: false`).
- Restpunt: de net-worth-delta-fallback-appreciation rekent op de gewogen assetwaarde maar negeert
  asset-typen zonder ingevuld `expected_return` (default 0) — bewust conservatief.
