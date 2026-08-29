---
id: 0119-grenzenpot-tempo-van-de-lopende-periode
title: 'Grenzenpot: het tempo van de lopende periode is informatief, nooit sturend'
status: aanvaard
date: 2026-08-29
elements: [as-budget, fn-budgetteren]
---

# 0119 — Grenzenpot: het tempo van de lopende periode

## Context

Een testgebruiker meldde (13-08-2026): *"Grenzenpot weergave zou aangevuld kunnen
worden met een rolling forecast van de uitgave. Niet de dag en week potten maar
maandpot wel. Als de max 100 is en de 1e van de maand heb je al 80 uitgegeven is
het fijn dat te zien."*

De drie oppervlakken van een grenzenpot — de tegel op `/overzicht`, de kaart in de
sectie en de prestatieweergave — toonden alle drie **hoeveel van de grens op is**
en geen van drieën **hoe ver de periode zelf is**. Een balk op 80 % zegt niets
over of dat na één dag of na 28 dagen is. De melder vraagt materieel om de
**tijd-as** van de lopende periode.

ADR 0092 zette "prognose voor de lopende periode" expliciet onder *Wat expliciet
niet gebouwd is*. Deze ADR keert die keuze om en legt vast onder welke
voorwaarden.

De naïeve lezing loopt vast op het voorbeeld van de melder zelf: een lineaire
run-rate (`gerealiseerd ÷ verstreken-fractie`) maakt van €80 op 1 augustus
**€2.480 verwacht** — formeel juist, communicatief onbruikbaar, en precies het
scenario waarvoor de wens is ingediend.

## Besluit

**1. Twee lagen, met een verschillende bewijslast.**

- **De tempo-markering** (verstreken dagen ÷ periodelengte, naast het gebruikte
  aandeel van de grens) is een kale kalenderdeling. Geen statistiek, geen
  historie, werkt vanaf dag 1 en vanaf de eerste dag dat een pot bestaat, en kan
  per definitie niet misleiden. Dit is het **fundament** en staat er altijd.
- **Het prognosebedrag** is `gerealiseerd + resterende dagen × eigen historisch
  dagtempo`. Nadrukkelijk **niet** de lineaire run-rate: er wordt nergens door de
  verstreken-fractie gedeeld, dus het €2.480-geval kan niet ontstaan en een
  oneindige prognose evenmin. Het bedrag is de **verrijking** en verschijnt pas
  onder de voorwaarden hieronder.

**2. Het prognosebedrag draagt dezelfde poort als de trend en de score.** Het is
een uitspraak over gedrag en verschijnt daarom pas bij ≥ 3 afgesloten periodes
**ná de aanmaak** van de pot (`closedPeriodsSinceCreation` +
`SPEND_LIMIT_PACE_MIN_PERIODS = SPEND_LIMIT_SCORE_MIN_PERIODS = 3`). Geen nieuwe
conventie; exact de drempel die de motor al hanteert. Zonder die historie blijft
alleen de tempo-markering staan — die heeft geen historie nodig.

**3. Het basistempo komt uit hetzelfde venster als de trend.**
`SPEND_LIMIT_PACE_BASELINE_WINDOW = SPEND_LIMIT_TREND_WINDOW = 3`. Zou de
prognose over een ánder venster middelen, dan kan de tegel "je geeft minder uit
dan daarvoor" zeggen terwijl het bedrag ernaast op een oudere, hogere basis rust
— twee uitspraken over hetzelfde gedrag die elkaar tegenspreken. Het tempo wordt
gewogen op **dagen** (Σbedrag ÷ Σdagen), niet als gemiddelde van losse
per-periode-dagtempo's: februari en januari zijn geen gelijkwaardige noemers.

**4. Maand, kwartaal en jaar — niet dag en week.** Bij een dagpot ís de korrel de
periode: er is geen uren-dimensie, dus "hoe ver is vandaag" bestaat niet in het
model — een technische onmogelijkheid, geen smaak. Week valt af als
productkeuze (eigenaar, 26-08-2026): zeven punten zijn te ruisgevoelig; één vaste
last verschuift het beeld met tientallen procenten. Kwartaal en jaar lopen mee met
maand: zelfde maandkorrel, even zinvolle verstreken-fractie, één conditie.

**5. HARDE INVARIANT — het tempo is informatief en stuurt niets aan.**
`status`, `isNearLimit`, `periodOverAmount`, `periodHeadroom`, de reeks, de trend
en de score blijven **100 % op gerealiseerde bedragen**. De meldingenlaag
(`decideSpendLimitEvents`) ziet het tempo niet en er komt géén nieuwe melding bij.
Zou `isNearLimit` op een prognose gaan leunen, dan verschuiven meteen de meldingen
én de reeks-score. Vastgelegd in `engine.test.ts`: een pot met een prognose bóven
de grens houdt status `within`, `isNearLimit` `false`, en reeks/trend/score
identiek aan de canonieke afleidingen over uitsluitend de afgesloten periodes.

**6. Eén home, drie oppervlakken.** Rekenen in
`lib/spend-limits/engine.ts` (`computeSpendLimitPace`), projecteren via
`lib/spend-limits/widget-data.ts` (selectie, geen berekening), en de **zin** met
zijn afronding in `lib/spend-limits/status-display.ts`
(`describeSpendLimitPace`) — dezelfde plek als `resolveSpendLimitDisplayStatus`,
om dezelfde reden. Geen component leidt de verstreken-fractie uit `since`/`until`
+ `new Date()` af: dat zou drie keer dezelfde deling zijn, plus hydration-drift en
een client-klok die van de serverklok kan afwijken.

**7. Puur en tijdzone-veilig.** `now` komt van de aanroeper; er wordt nergens een
klok gelezen. Dagverschillen lopen via UTC-dagnummers (`Date.UTC`), niet via een
lokale millisecondendeling: over een zomertijd-sprong zit die er 23 of 25 uur
naast en telt hij een dag te veel of te weinig — precies op de maandgrens waar het
tempo het meest wordt gelezen. Periodegrenzen zelf blijven lokaal geparsed,
identiek aan `resolveSpendLimitPeriods`.

**8. Maskering en euro-weergave.** Het prognose**bedrag** is een bedrag en loopt
verplicht door `<MaskedAmount>` (ADR 0091). De verstreken-fractie en het gebruikte
percentage zijn géén bedragen en blijven onder maskering leesbaar — dat is meteen
de reden dat de tempo-markering ook met verborgen bedragen werkt. Het bedrag is
nominaal en ligt binnen dezelfde kalenderperiode als het gerealiseerde bedrag
ernaast; de deflator (ADR 0090) hoort er dus niet op, gemarkeerd met
`// euro-view: exempt` + reden (ADR 0093 D12/D13), aansluitend op ADR 0092
besluit 10.

## Gevolgen

**Bewust aanvaarde zwakte.** Een pot met een vaste last aan het begin van de
periode (huur, verzekering) over-voorspelt: het historische dagtempo komt bovenop
een al-geboekte eenmalige post. Het echte antwoord daarop is een
intra-periode-vórm uit dagdata, en die kost een tweede aggregaat — de maandkorrel
levert de lopende maand als **één bucket**, dus een burn-up-curve binnen de maand
bestaat niet in de huidige data. De prestatieweergave **benoemt** de beperking bij
het getal in plaats van haar weg te poetsen.

**Boekingsvertraging.** Banktransacties komen met dagen vertraging binnen, dus
"tot nu toe" is structureel iets te laag en de prognose dus iets te optimistisch.
Dezelfde beperking als bij elk gerealiseerd bedrag in dit domein; ze staat in de
uitleg, niet in de statusregel.

**Randgevallen, expliciet afgevangen.** Grens 0 ⇒ geen gebruikt-percentage (geen
deling door nul). Laatste dag van de periode ⇒ verstreken-fractie exact 1 en géén
prognose (er valt niets meer te projecteren; de periode blijft wél `isOpen`).
Netto refunds ⇒ negatief basistempo wordt op 0 geklemd en een negatieve prognose
verschijnt niet: dat zegt niets over een uitgavengrens.

**Wat niet gebouwd is.** Een burn-up-curve binnen de lopende periode · een
"je gaat je grens overschrijden"-melding (aparte, latere afweging; zou zonder gate
spammen) · een prognose-markering op de open staaf van de verloopgrafiek
(`spend-limit-period-chart.tsx`) · tempo op dag- en weekpotten.

## Bronnen

- `lib/spend-limits/engine.ts` — `computeSpendLimitPace`, `SPEND_LIMIT_PACE_*`
- `lib/spend-limits/status-display.ts` — `describeSpendLimitPace`
- `lib/spend-limits/widget-data.ts` — de projectie
- ADR 0089, 0092 (fase 1–5), 0097 (meerdere regels + dag/week), 0090/0093
  (euro-weergave), 0091 (maskering)
