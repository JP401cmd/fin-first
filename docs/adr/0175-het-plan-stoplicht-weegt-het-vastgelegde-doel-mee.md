---
id: 0175-het-plan-stoplicht-weegt-het-vastgelegde-doel-mee
title: 'Onder "zo vroeg mogelijk" weegt het plan-stoplicht het vastgelegde doel mee: haalbaar maar het doel reikt niet is oranje'
status: aanvaard
date: 2026-09-22
elements: [as-planning, fn-toekomstplannen]
---

# 0175 — Het plan-stoplicht weegt het vastgelegde doel mee

## Context

Eén regel kleurt het plan: `resolvePlanStatus` (`lib/horizon/plan-status.ts`, eigenaarsbesluit
15 sep 2026). Die regel voedt de kop op /toekomst ("Je toekomstplan is *haalbaar*.", ADR 0174
D6), de plankaart en het statuspunt op /overzicht en het menupunt "De toekomst".

Onder de stopstrategie "zo vroeg mogelijk" (anker `solved`) keek die regel alleen naar
`sim.fireReachable` van de hoofdrun. De solver zoekt daar per definitie een gedekt stopmoment,
dus de kop was vrijwel altijd groen. Het doelscenario-blok eronder beoordeelt intussen het doel
van de gebruiker: een stopleeftijd plus wensen zoals een hogere uitgave na pensioen of een
nalatenschap. Dat blok kon "reikt niet" zeggen, terwijl de kop erboven groen "haalbaar" zei.
Gemeld door de eigenaar op 22 sep 2026: vrij op 50,1 volgens het plan, 53,3 met het doel, doel
stopleeftijd 52, en toch "Je toekomstplan is haalbaar."

## Besluit

**D1 — Oranje bij een haalbaar plan en een doel dat niet reikt.** Onder `solved` geldt:
- plan niet haalbaar → rood, ongeacht het doel;
- plan haalbaar en vastgelegd doel reikt niet → oranje, met de kop "Je toekomstplan is
  *haalbaar, je doel nog niet*." en op de plankaart de regel "haalbaar, je doel nog niet";
- anders groen, zoals voorheen.

Onder een vast stopmoment verandert niets: daar beslist de dekking.

**D2 — Alleen het VASTGELEGDE doel telt.** Het oordeel gebruikt `doel.stand` uit
`profiles.toekomst_scenario_prefs`, niet de live knopstand. De kop verspringt dus niet terwijl
de gebruiker aan de knoppen draait. De stopleeftijd telt alleen als de gebruiker die zelf als
doel vastlegde (`doel.parameters.fire`). De lab-stand bewaart de stop-knop namelijk altijd,
ook bij wie alleen bijvoorbeeld de spaarquote aanvinkte. Zonder die poort zou de kop "je doel
nog niet" zeggen over een stopleeftijd die nooit doel werd. Het vastleg-venster vinkt alle
afwijkende onderdelen standaard aan. Zonder stopleeftijd als doel heeft `solved` geen moment
om aan te toetsen, en blijft het groen, net als zonder doel.

**D3 — Hetzelfde predicaat als het lab.** Het oordeel is `standGedekt`
(`lib/horizon/lab-grenzen.ts`). Dat predicaat staat ook achter `huidig.gedekt` van de
grenzen-batch en dus achter het zone-woord "reikt niet". De doel-stand gaat door
`doelStandNaarLab` (`lib/horizon/doel-stand.ts`); "Herstel mijn doel" gebruikt dezelfde
vertaling. De marktbias loopt via `assetsMetRendementDelta`, dezelfde afleiding als de
scenariolijn. Na "Herstel mijn doel" rekenen kop en lab zo op dezelfde stand. Geen eigen toets
naast het lab.

**D4 — Eén keuze per plek.**
- *Blik:* het doel telt alleen in de eigen blik. Het lab op /toekomst rekent altijd `personal`
  en kent geen partnerblok, terwijl de huishoud-run andere potten en een partnerlaag heeft. In
  Huishouden volgt de plankaart dus alleen de haalbaarheid. Het menupunt draait altijd in de
  eigen blik. In Huishouden kan de kaart dus groen zijn en het menupunt oranje. Dat verschil
  bestond al (WF-OVZ-28) en is bewust.
- *Kosten:* de doel-run is één geankerde kernel-run (`vastgelegdDoelGedekt`,
  `lib/horizon/doel-oordeel.ts`). Hij draait op de rauwe context van de canonieke hoofdrun,
  alleen bij `solved`, een haalbaar plan en een vastgelegd doel met stopleeftijd.
  `loadPlanStatusInput` is React-`cache()`'d, zodat kop en menupunt de run in één request delen.
- *Verversen:* na "Maak dit mijn doel" en "Doel loslaten" ververst de pagina met
  `router.refresh()`. Kop en menupunt komen van de server en bleven anders op het oude doel
  staan.
- *Fouten:* een kern-fout geeft `null`, en dan blijft de status zoals voorheen. Liever geen
  oordeel dan een verzonnen oordeel.

## Gevolgen

- `lib/horizon/plan-status.ts`: `PlanStatusInput.doelGedekt`; een nieuwe tak in
  `resolvePlanStatus`, `resolvePlanVerdict` en `resolvePlanVerdictSentence`.
- `lib/horizon/plan-status-loader.ts`: de doel-run, beperkt tot de eigen blik, en `cache()`.
- Nieuw:
  - `lib/horizon/doel-stand.ts` (vertaling, zonder kernel: gaat mee in de browserbundel);
  - `lib/horizon/doel-oordeel.ts` (oordeel, alleen server-side);
  - `standGedekt` in `lab-grenzen.ts`;
  - `assetsMetRendementDelta` in `toekomst-scenario.ts`. Die wordt nu gelezen door
    `resolveScenarioContext`, dat daarvoor een eigen kopie had.
- `components/overview/mini-networth-chart.tsx`: de oranje regel onder "zo vroeg mogelijk". De
  kleur alleen draagt geen betekenis.
- Tests:
  - `lib/horizon/doel-oordeel.test.ts` (pariteit van de KernelInput met de batch);
  - `plan-status.test.ts` en `plan-status-loader.test.ts` (elke tak, beide kanten);
  - `mini-networth-chart.test.tsx`;
  - de bron-grendels van "Herstel mijn doel".
- UAT: WF-OVZ-28 kent de vijfde plansituatie. Berekeningen: de catalogus-entry `lab-grenzen`
  noemt de nieuwe lezer.

## Verworpen alternatieven

- **De kop client-side laten volgen op het zone-woord van het lab.** Verworpen:
  - de kop verspringt tijdens het slepen;
  - hij kan pas kleuren als de worker-batch klaar is;
  - plankaart en menupunt kennen de live stand niet, dus de regel valt uiteen.
- **Alleen de /toekomst-kop oranje, plankaart en menu ongewijzigd.** Verworpen door de
  eigenaar: dan zegt de plankaart "haalbaar" en de kop oranje, en dat breekt de ene regel van
  15 sep.
- **De `fire_age`-doelrij vergelijken met de vrijheidsleeftijd van het plan.** Verworpen: die
  toets negeert de andere doelwensen (uitgave na pensioen, nalatenschap, inleg, rendement), en
  juist die schuiven het doel in het gemelde geval van 50,1 naar 53,3.
