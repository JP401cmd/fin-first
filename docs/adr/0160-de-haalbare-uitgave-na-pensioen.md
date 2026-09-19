---
id: 0160-de-haalbare-uitgave-na-pensioen
title: 'De haalbare uitgave na pensioen — een vierde hefboom voor wie zijn stopmoment al vastzet'
status: aanvaard
date: 2026-09-19
elements: [as-planning, fn-toekomstplannen]
---

# 0160 — De haalbare uitgave na pensioen

Bouwt voort op spec `2026-09-18-haalbare-uitgave-na-pensioen-design.md`, ADR 0129
(vast stopmoment × eind-vorm) en ADR 0145 (lab-uitkomst/dekking als uitkomst
onder een vast anker).

## Context

Zodra een gebruiker zijn stopleeftijd vastzet (`fire_stop_anchor = 'age'` of
`'aow'`), stelt het plan een andere vraag dan daarvoor. Niet meer *"wanneer kan
ik stoppen?"* maar *"reikt mijn geld tot mijn eindleeftijd als ik op deze
leeftijd stop?"* — en het antwoord is zelden precies "ja". De app toonde het
**verschil** al (de dekkingsas: "Reikt tot 76 · Plan tot 90 · Gedekt 12%"), maar
niet de **knop waaraan dat verschil hangt**: de uitgave ná pensioen stond als
kaal getal in de KPI-tegel "Na pensioen" zonder enige relatie tot de dekking
ernaast.

Het antwoordenblok onder een vast anker (spec lab-haalbaarheid §3, ADR 0145)
geeft bij een tekort al drie hefbomen — "doorwerken tot X", "€ meer salaris",
"€ minder uitgeven" — die alle drie grijpen **vóór** het stopmoment. De uitgave
ná het stopmoment is voor iemand met een vastgezette stopleeftijd vaak de
enige knop die nog draait, en die ontbrak.

## Besluit

**Eén gesolved getal, twee oppervlakken, één bron.** `solveHaalbareUitgave`
(`lib/horizon/haalbare-uitgave.ts`) bisecteert de uitgave na pensioen (€/jaar)
tot het plan precies tot de eindleeftijd reikt, en levert `HaalbareUitgave |
null`. Dat resultaat landt als `ScenarioPresetBatch.haalbareUitgave`
(`lib/horizon/scenario-presets.ts`) — dezelfde ene worker-oversteek als
`solvedFireAge`/`solvedFireEndAge` — en voedt vandaaruit twee lezers zonder
tweede berekening:

1. de duidingsregel onder het bedrag in de KPI-tegel "Na pensioen"
   (`haalbaarBijUitgaveRegel`, donkerrood bij `richting === 'minder'`,
   donkergroen bij `'meer'`, geen regel bij `'gelijk'`);
2. de antwoordregel onder de vierde draaiknop "Uitgave na pensioen" in de
   vrijheidsas (`antwoordUitgaveNaPensioen`, vierde `LabAntwoord`).

**Bisectie op de rauwe profielrij, niet op één veld van de `KernelInput`.**
`buildInkomenUitgaven` leidt bij actieve flex-spending óók
`flexNiceFractiePerJaar` af uit `uitgaveNaPensioenPerJaar`
(`deriveNiceFractie`, `lib/horizon-kernel/adapter/params.ts`). Alleen dat ene
veld overschrijven zou de nice-fractie op de oude stand laten staan en
daarmee de must/nice-split stil scheeftrekken: essentiële uitgaven zouden
meebewegen met een bedrag dat ze niet hoort te raken. Elke iteratie patcht
daarom de profielrij (`retirement_expense_method: 'custom_amount',
retirement_expense_custom_amount: E`) en bouwt de `KernelInput` opnieuw via
`buildKernelInputFromApp` — die herleidt alles consistent, inclusief de
nice-fractie. Bijkomend voordeel: dit is **exact hetzelfde mechanisme als de
draaiknop zelf**, dus het beloofde getal in de tegel en wat de slider
daadwerkelijk doorrekent zijn dezelfde run, geen gespiegelde tweede
berekening.

**"Gedekt" is de kernel z'n eigen oordeel.** `isGedekt` toetst uitsluitend
`SolveFireResult.status !== 'anchor_shortfall' && !== 'stop_now_shortfall' &&
!== 'pension_shortfall'` — exact de drie statussen die `computeStatusBlok`
onder een vast anker zet bij een tekort. Die formule wordt **gelezen, niet
herhaald**: "haalbaar" betekent hier hetzelfde als overal elders op de
pagina, inclusief de eind-vorm van het plan en de tekort-lening-keuze uit
ADR 0149.

## Waarom geen event

De drie bestaande knoppen bouwen een `WhatIfEvent`. De uitgave na pensioen is
géén life-event maar een **profielparameter**: de kern leest 'm als
`inkomenUitgaven.uitgaveNaPensioenPerJaar`, afgeleid uit
`retirement_expense_method` + `retirement_expense_custom_amount`. Hem als
`lifestyle_adjustment`-event modelleren zou een tweede waarheid naast dat veld
zetten (het event voedt de kasstroomtabel, niet het doelbedrag) — exact het
soort drift dat "consume, don't recompute" moet uitsluiten. Daarom: geen
nieuwe `SliderKey`, maar één optioneel veld op de bestaande override-ingang
(`HorizonScenarioOverrides.uitgaveNaPensioenPerJaar`,
`lib/hooks/use-horizon-fire-sim.ts`), dat een scenario-profiel met
`retirement_expense_method: 'custom_amount'` opbouwt — dezelfde twee kolommen
die de adapter al kent.

## De drie open keuzes uit de spec, nu vastgelegd mét reden

1. **Bovengrens van de bisectie = 3× de huidige uitgave
   (`BOVENGRENS_FACTOR`).** Een praktische klem, geen gemeten grens. Dekt het
   plan ook bij 3× de huidige uitgave, dan klemmen we daar (`richting =
   'meer'`) en doen we geen verdere uitspraak — noch de regel in de tegel,
   noch de slider-`bovenBereik`-tekst noemt de klem (zie besluit 4: die vlag
   is voor deze hefboom altijd `false`, want `uitgaveNaPensioenRange`
   verbreedt de sliderband zelf naar de gezette stand). Alternatief overwogen:
   klemmen op het netto jaarinkomen — niet gekozen, want dat veld ontbreekt op
   een deel van de profielen (bv. `income_source` niet 'manual') en zou de
   klem zelf een tweede afhankelijkheid geven.
2. **Drempel € 250/jaar (`HAALBARE_UITGAVE_DREMPEL`).** Onder dit verschil is
   `richting === 'gelijk'` en verschijnt er geen regel. Gespiegeld aan de
   bestaande "toon de delta alleen bij |Δ| ≥ € 500"-regel van de
   eindvermogen-badge (ADR 0145 M5) — niet apart gemeten. Zonder drempel zou
   een plan dat feitelijk klopt een rode of groene regel tonen over een paar
   euro per jaar.
3. **Sliderstap € 600/jaar (`UITGAVE_NA_PENSIOEN_STAP`, = € 50/mnd, gelijk aan
   "Meer salaris").** Gekozen zodat de nieuwe knop dezelfde "voelbare stap"
   heeft als zijn buren. De bisectie-precisie (€ 50/jaar, `PRECISIE`) is
   bewust **fijner** dan de sliderstap, zodat het gevonden antwoord niet op de
   sliderstap zelf afrondt — en diezelfde sliderstap is ook de afstand
   waarop de monotonie-vangrail toetst (`gevonden + SLIDER_STAP` mag niet ook
   dekken), zodat de belofte "één stap hoger dekt niet meer" en het werkelijke
   sliderintervalgedrag niet uit elkaar kunnen lopen.

## Tijdens de bouw genomen besluiten

4. **De vierde hefboom klemt nooit.** De knop-actie zet het onverkorte
   gesolvede bedrag; `LabAntwoord.bovenBereik` is voor `kind:
   'uitgave_na_pensioen'` altijd `false`. Reden: `bovenBereik` heeft in deze
   codebase precies één rendering — `"Reken met maximum"` — en een gesolved
   antwoord dat ónder de sliderband ligt (het gebruikelijke geval bij een
   tekort) zou daarmee een maximum-label krijgen op wat feitelijk een
   minimum-klem is, met een **hóger** bedrag dan de zin noemt. In plaats
   daarvan verbreedt `uitgaveNaPensioenRange` (`whatif-sliders.tsx`) de
   sliderband zelf naar de zojuist gezette stand. Dit maakt het **dragend**
   dat de knop die de vierde hefboom aanroept, dat altijd doet met de huidige
   sliderstand als `saved`: roept een toekomstig oppervlak dezelfde actie ooit
   aan met de basisstand in plaats van de huidige, dan klemt het antwoord
   alsnog weg — dat is geen losse implementatiedetail maar een contract
   tussen de actie en zijn aanroeper.
5. **De knop is zichtbaar voor de doel-machinerie.** `conceptGewijzigd`
   meldt drift op deze hefboom net als op de andere drie, en
   `handleDoelHerstellen` zet 'm terug naar de plan-stand. Bewust **buiten**
   scope gehouden: de sliderstand overleeft geen paginareload
   (`ToekomstScenarioPrefs` draagt het veld niet). Dat is **inert, niet
   inconsistent** — na een reload staat de knop op de basisstand en geen
   ander oppervlak spreekt dat tegen; er is alleen geen geheugen voor een
   verkenning die de gebruiker niet heeft opgeslagen.
6. **Grondslag = de hoofdrun, niet de wat-als-run.** Zelfde keuze als
   `planMaandHint` (eindreview I1, ADR 0145): het getal in de tegel en in de
   antwoordregel hangt aan het PLAN, niet aan een lopende sliderverkenning.
   Gevolg: het bedrag springt niet rond terwijl de gebruiker aan een andere
   knop draait, en de antwoordregel blijft staan waar hij op sloeg.

## Gevolgen

- **Geen migratie, geen nieuwe API-route, geen nieuwe rekenmotor buiten
  `lib/horizon/haalbare-uitgave.ts`.** De vierde hefboom hergebruikt de
  bestaande override-ingang, de bestaande worker-oversteek en de bestaande
  antwoordenblok-mapper.
- **~350 ms extra in de scenario-batch onder een vast anker.** Gemeten
  referentie (ADR 0129 D7): de volledige anker-batch kostte vóór dit besluit
  al ~174 ms voor de zes preset-kaarten; ~14 extra geankerde runs voor de
  bisectie komen daar bovenop. Blijkt dit in de praktijk zwaarder, dan is de
  goedkope uitweg de bovengrens verlagen (minder bisectie-iteraties), niet het
  getal cachen — caching zou de garantie "dezelfde run als de knop" verliezen.
- **Discontinuïteiten kunnen de dekking niet-monotoon maken** (woningverkoop,
  potregels). De monotonie-vangrail geeft dan `null` in plaats van een
  misleidend getal — zichtbaar als "geen regel", nooit als een verkeerd
  bedrag.
- **Geen round-trip in een opgeslagen scenario.** De scenario-state reist als
  `WhatIfEvent[]`; deze hefboom is een profielparameter en zit daar bewust
  niet in. Een opgeslagen of gedeeld scenario draagt de vierde-hefboom-stand
  dus niet terug — alleen de drie bestaande knoppen (die wél events zijn)
  reizen mee.
- **Huishoud-/partnerweergave: opgelost (eindreview F2a, 19 sep 2026).** Deze
  ADR beschreef eerder een bewuste asymmetrie: de tegelregel verbergt zich in
  partner-/huishoudweergave (`!hasPerspectiveHero`), de knop + antwoordregel
  niet. Bij nader inzien was dat exact de grondslagvermenging die dit besluit
  elders uitsluit — de tegel toonde dan `perspectiveHero.retirementExpense`
  (huishouden) terwijl de knop zijn "nu"-inkeping en basis op `huidigPerJaar`
  (eigen) zette, twee verschillende "uitgave na pensioen"-getallen een paar
  secties uit elkaar. De `uitgaveNaPensioen`-prop (`horizon-client.tsx`) gaat
  nu ook alleen mee als `!hasPerspectiveHero`: de knop bestaat, net als de
  tegelregel, alleen in de eigen weergave.
- **Bij een niet-monotone dekking geeft de solve `null` in plaats van een
  getal** — geen regel, geen antwoord, in plaats van een bedrag dat de
  belofte "dit dekt, één stap hoger niet meer" niet waarmaakt.

## Verwant

ADR 0129 (vast stopmoment × eind-vorm, de kosten-referentie voor de
worker-oversteek), ADR 0145 (lab-uitkomst/dekking als uitkomst onder een vast
anker, de drie bestaande hefbomen en `planMaandHint`), ADR 0149 (geen
tekort-lening als planvoorwaarde — telt mee in `SolveFireResult.status`).
