---
id: 0167-niet-geindexeerd-is-nominaal-vast
title: '"Stijgt niet mee met inflatie" is een nominaal vast bedrag — ook na de startmaand'
status: aanvaard
date: 2026-09-19
elements: [as-planning, fn-toekomstplannen]
---

# 0167 — "Stijgt niet mee met inflatie" is een nominaal vast bedrag

## Context

Een eigen gebeurtenis met het vinkje *Stijgt mee met inflatie* **uit** hoort een nominaal
vast maandbedrag te zijn: €1.000 blijft €1.000, en verliest dus elk jaar koopkracht. De
horizon-kernel rekent nominaal en indexeert alle gebeurtenis-posten centraal
(`CF!H = Σ posten · (1+i)^(m/12)`, `Af!D` idem), precies zoals het Excel-oracle. Het
Excel-Geb-blok kent géén indexatievlag per handmatige post; de app wel.

De adapter loste dat op door een niet-geïndexeerd bedrag **één keer** te delen naar de
startmaand (`bedrag / (1+i)^startjaren`), zodat de centrale indexatie op de startmaand
weer exact het ingevoerde bedrag opleverde. Voor een eenmalige post is dat exact. Voor een
periodieke post groeit het bedrag daarna tóch mee: €1.000/mnd vanaf +10 jaar gaf +10 jaar
€1.219 en +20 jaar €1.486 (×1,02^t) — "uit" gedroeg zich als "aan" met een lager
basisbedrag, en in euro van vandaag stond de lijn vlak in plaats van dalend. Bevestigd
met een kernel-eigenschapstest (Notion 3daf9e8d, 17 sep 2026). Live geraakt: 24 van 55
actieve gebeurtenissen (12 gebruikers) en 15 van 18 pensioen-events.

Het eigen pensioen met *Geïndexeerd = Nee* had dezelfde fout, mét oracle-verankering:
`Auto-gebeurtenissen!M` de-indexeert vooraf naar de ingangsleeftijd en laat de motor daarna
centraal indexeren. Die Excel-structuur is onbeproefd (geen van de 19 fixtures heeft
H = "Nee") en intern strijdig met het partnerpensioen `PT!K`, dat bij niet-geïndexeerd wél
vlak nominaal blijft.

## Besluit

1. **Nominaal vast is een eigenschap van de post, niet een truc op het bedrag.**
   `GebPost.nominaalVast?: boolean` (optioneel, buiten oracle-domein, zelfde patroon als
   `eindBijStopmoment` in ADR 0143). De adapter deelt niet meer naar de startmaand: een
   niet-geïndexeerde flow gaat als het ingevoerde bedrag de kern in, met de vlag — voor
   eenmalige én periodieke posten (eenmalig blijft exact en verliest de jaar/maand-
   afronding van de oude deling).
2. **CF!H en Af!D tellen twee sommen**: geïndexeerd × `idx(m)` + vast × 1. Zonder vaste
   posten is de tweede som 0 en blijft de formule letterlijk `baten · idx` — de 19
   oracle-fixtures rekenen byte-identiek. De vlag reist mee via `GebPostHelper`
   (engine → cf) en `AfGebPost` (engine → af); de Geb-helperkolommen W:AE blijven qua
   sIdx/eIdx/bn ongewijzigd.
3. **Eigen pensioen "Geïndexeerd = Nee" volgt dezelfde semantiek — als bewuste
   oracle-afwijking (gap-besluit V25, optie B1).** `KernelInput.pensioenNominaalVast`
   is optioneel en inert-by-default: de app-adapter zet hem altijd op `true`, het
   fixture-pad (`input-from-fixture`) nooit. Onder de vlag geeft `derivePensioenPot`
   het ongedeelde maandbedrag door met `nominaalVast` op het auto-event, en CF!H telt
   het zonder index. Zonder vlag blijft de Excel-structuur staan (parity groen).
   De erfenis (Eenmalig, reeds gede-indexeerd) is ongewijzigd: daar is de benadering exact.
4. **Niet "richting oracle" wegfixen** zonder nieuw eigenaarsbesluit. Definitieve borging
   is een Excel v6 met een indexatievlag per post en heréxtraheerde fixtures; tot die tijd
   bewaakt `lib/horizon-kernel/geb-nominaal-vast.test.ts` het gedrag (absolute
   tolerantie €0,01 — de grootheden zijn maandbedragen rond €1.000).

## Gevolgen

- Niet-geïndexeerde inkomsten worden later in het leven lager (stopmoment later of dekking
  lager); niet-geïndexeerde kosten worden lager (stopmoment eerder). Bij de 12+ geraakte
  gebruikers verschuift het plan zichtbaar — correct, maar communiceren.
- De jaardetail-kassabon (`lib/horizon/cashflows-for-year.ts`) rekende niet-geïndexeerd al
  vlak en sprak de grafiek tegen; beide zijn nu consistent. De eigen fase-motoren
  (`lib/phase-analysis.ts`, `deeltijdwerk-impact.tsx`) rekenden al vlak.
- De preview (`event-preview-sim.ts` → strategy-preview → convergentie-router) en de
  huishoudrun draaien dezelfde kern en erven de fix.
- `EventMappingContext.inflatie` wordt in `adapter/events.ts` niet meer gebruikt voor de
  de-indexatie; het veld blijft omdat de aanroepers het leveren.
- Buiten oracle-domein, zelfde patroon als `stopAnker`, `potMutaties` (V9) en
  `eindBijStopmoment` (ADR 0143): de Excel-export kent de velden niet.
