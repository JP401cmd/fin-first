---
id: 0150-opeethypotheek-opname-naar-behoefte
title: 'Opeethypotheek zonder eigen maandbedrag neemt op naar behoefte: per maand het gat, tot het leenplafond'
status: aanvaard
date: 2026-09-17
elements: [as-planning, fn-toekomstplannen, as-vermogen]
---

# 0150 — Opeethypotheek: opname naar behoefte

Een opeethypotheek zónder eigen maandbedrag (`ReverseMortgageConfig.monthlyPayout ===
null`) neemt in de horizon-kernel niet langer een vast, over de resterende
levensverwachting gespreid bedrag op. Ze neemt per maand op wat je tekortkomt: het gat
dat anders de synthetische tekort-lening zou voeden, plus een al openstaande
tekort-lening, tot het leenplafond. Dat geldt bij beide opeet-triggers (vaste leeftijd
én "wanneer nodig") vanaf het startmoment dat ADR 0148 al bepaalt. Een eigen
maandbedrag blijft winnen. Het oracle-pad en de parity-suites zijn onaangetast.

## Context

- **Eigenaarsbesluit (17 sep 2026).** Zonder eigen bedrag is de opeethypotheek een
  vangnet, geen inkomensplan: je leent wat je nodig hebt, niet wat de overwaarde
  toelaat.
- **Wat de kern deed.** `tables/bez.ts#computeWoningblok` rekende zonder P!B67 de
  Excel-auto-spreiding: `overwaarde bij start × max-leen% / ((90 − start)·12)` per
  maand, ongeacht behoefte, gecapt op de resterende leenruimte. Die opname liep via
  CF!I → Toename de potten in; de onttrekking kwam er via Verdeling weer uit, maar
  Verdeling rekent met potsaldi van m−1. Een opname van maand m was dus pas in m+1
  opneembaar en het tekort-budget van maand m (onbenut afname + onttrekking, de
  S!AB-voeding) negeerde hem: de tekort-lening ontstond tóch, één maand lang, en
  werd — via `tekortAflossingUitLiquide` (gap V19) — de maand erna weer afgelost.
- **Waarom de spreiding bovendien te rooskleurig is.** Ze leent vanaf de start de
  vólle cap. Het overschot boven de behoefte landt liquide in de potten en telt mee
  in Prognose!J, terwijl de opeetschuld (categorie Woning, niet-liquide onder
  reverse_mortgage) buiten J valt. Verzilverde overwaarde las zo als vrij vermogen —
  het plan werd haalbaarder naarmate er méér werd geleend. Dit is een bestaande
  asymmetrie in de J-grondslag, die onder de behoefte-opname grotendeels wegvalt
  omdat het geleende geld meteen wordt besteed.
- **Patroon.** Optioneel, inert-by-default `KernelInput`-veld dat het fixture-pad
  weglaat (V17/V19, ADR 0148, ADR 0149).

## Besluit

1. **Apart veld, app-only.** `WoningStrategieParams.opeetOpnameNaarBehoefte?: boolean`
   (`lib/horizon-kernel/types.ts`). Alleen de app-adapter
   (`adapter/params.ts`, reverse_mortgage-tak) zet het op `true` wanneer
   `monthlyPayout` leeg is; `input-from-fixture.ts` zet het nooit. Een eigen
   `opeetMaandopname` maakt de vlag inert.
2. **Behoefte = gat + openstaand tekort, in dezelfde maand.** Ná Verdeling(m) en vóór
   de volle Bez-call (engine.ts, stap 7b):
   `behoefte = (onbenut afname + onbenut onttrekking) + tekortRestant`, met
   `tekortRestant` een nieuw Verdeling-veld `MAX(0, tekort(m−1) + rente − AC)` — het
   pre-existente tekort dat ná Verdeling!AC nog openstaat.
   `opname = MIN(behoefte, capRestant)`, met exact dezelfde cap als BE
   (`tables/bez.ts#opeetCapRestant`, één home).
3. **De opname is directe dekking, geen pot-instroom.** De vroege woning-call (vóór
   CF) kent de behoefte nog niet en geeft BE 0; de opname komt dus niet in CF!I en
   niet in Toename. De engine verlaagt de tekort-voeding voor S met `MIN(opname, gat)`
   en verhoogt de tekort-aflossing (S!AC) met de rest. Gevolg: S!AB blijft 0 zolang
   het plafond niet knelt — ook in de eerste maand, en ook voor een tekort van vóór
   het startmoment, dat op de startmaand in één keer wordt afgelost (binnen de cap).
4. **Bez!BE draagt het werkelijke bedrag.** De volle Bez-call krijgt de opname via
   `BezWoningDep.opeetBehoefteOpname`; `computeWoningblok` klemt 'm nogmaals op
   `capRestant` (invariant blijft in bez.ts wonen). Daarmee dragen S!P, en de
   bridge-velden `opeetOpname` en `cashflowNet`, het werkelijk opgenomen bedrag.
5. **Gekozen boven het alternatief** (de behoefte al in de woningblok-stap afleiden
   en de opname alsnog via de potten laten lopen): dat vraagt óf een herordening van
   de maandvolgorde (Ont komt ná het woningblok), óf een tweede Verdeling-pass met
   same-month capaciteit — beide raken het oracle-pad structureel. Directe dekking
   ná Verdeling is één extra stap, leest alleen bestaande uitkomsten, en is bij vlag
   uit per constructie byte-identiek.

## Gevolgen

- **Parity onaangetast.** Het fixture-pad zet de vlag nooit; `huis-opeethypotheek`
  blijft byte-identiek, geen rebaseline. Het nieuwe Verdeling-veld `tekortRestant`
  is geen oracle-kolom en wordt door de parity-comparator niet gelezen.
- **Lag-conventie.** Capaciteit is m−1: in een overgangsmaand (instroom van dezelfde
  maand, bv. een pensioen dat net begint) kan de opname hoger zijn dan strikt nodig,
  omdat die instroom pas in m+1 opneembaar is. Dat is exact de conventie die de
  tekort-lening al volgde; er is bewust geen same-month-uitzondering gebouwd.
- **Consumenten van de bridge.** `withdrawal` (Σ Verdeling-onttrekking uit potten)
  bevat het door de opname gedekte gat niet; `withdrawalNeed.nietGedekt`
  (= behoefte − withdrawal) telt dat gat dus als "niet gedekt" hoewel de opname het
  dekt. Een oppervlak dat `nietGedekt` als tekort-lening leest (jaar-kassabon
  "Niet gedekt (tekort)"), moet `opeetOpname` ervan aftrekken — dat is weergave en
  hoort bij de laag die er een inkomstenlaag op bouwt, niet in de bridge.
  `lib/horizon/kernel-strategy-moments.ts` leidt de opeet-start af uit de eerste
  jaar-rij met `opeetOpname > 0`; onder behoefte-opname is dat de eerste gat-maand,
  niet het startmoment (`opeetGestart`).
- **Solver.** Bij een vaste startleeftijd is de FIRE-leeftijd met behoefte-opname
  nooit later dan met de spreiding (meer dekking na de start, identiek ervoor). Bij
  "wanneer nodig" kan de spreiding een vroegere leeftijd geven — het rooskleurige
  effect uit de context — en dat is geen regressie maar de reden van dit besluit.
- **Catalogus.** `lib/architecture/calculations.ts`, calc `huis-strategie-trigger`
  (formule, functies, bestanden, constante-toelichting).
- **Vangnetten.** `lib/horizon-kernel/opeet-naar-behoefte.test.ts`: adapter (beide
  triggers, eigen bedrag → vlag afwezig, andere modi); ruim plafond → tekort 0 en
  opname = gat bij beide triggers, geen dubbeltelling in CF!I, S!P groeit met de
  opname; plafond bereikt → opname = capRestant en het restgat wordt tekort-lening;
  tekort van vóór de start afgelost op de startmaand; eigen bedrag byte-identiek;
  vlag weggelaten = spreiding (ook zónder gat); met `geenTekortLening`: vaste
  leeftijd ≤, wanneer nodig gedocumenteerd; Verkopen inert. Tekort-toetsen zijn
  bewust absoluut (€1e-6) omdat de referentie 0 is; alleen float-residu van de
  som-volgorde mag overblijven.
- **Buiten scope.** De preview-schatting in het strategie-scherm
  (`estimateReverseMortgagePayout`) blijft een app-zijdige indicatie; de
  UI-inkomstenlaag op `opeetOpname` wordt parallel gebouwd.
