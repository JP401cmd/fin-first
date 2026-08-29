---
id: 0033-tekort-aflossing-uit-liquide-transitioneel
title: 'Tekort-lening wordt maandelijks afgelost uit liquide bezit — bewuste, transitionele afwijking van het Excel v5-oracle'
status: aanvaard
date: 2026-07-04
elements: [as-planning, fn-toekomstplannen, as-vermogen]
---

# 0033 — Tekort-aflossing uit liquide bezit (F6-bugfix, transitionele oracle-afwijking)

De horizon-kernel (ADR 0032) volgt het eigen Excel-model `Core calc v5.xlsm` byte-exact
als oracle. Dit besluit legt een **bewuste, gedocumenteerde en transitionele afwijking**
van dat v5-oracle vast: de tekort-lening wordt voortaan (app-pad) maandelijks afgelost uit
liquide bezit, waar het Excel v5 die lening eindeloos laat compounden.

## Context — de F6-modelbeperking

- Bij een "wanneer nodig"-huisverkoop capt de capaciteit-waterval (`Verdeling`) op het
  **categoriesaldo van m−1** (lag-veilig, gedocumenteerd `tables/verdeling/index.ts`).
  In de verkoopmaand is het liquide vermogen van m−1 nog nét niet toereikend voor de
  onttrekking → er ontstaat een **één-maand-tekort** dat als tekort-lening (S!AB) wordt
  geboekt. Op een eigenaar-account: een tekort van enkele duizenden euro's rond leeftijd 75
  (exacte bedragen in het meetrapport buiten git, zie ADR 0111).
- Die lening kon daarna **nooit worden afgelost.** `tekortAflossing` (S!AC) werd
  uitsluitend gevoed uit het Toename-aflos-budget (`aflossingBudget`, de positieve
  maandkasstroom-surplus-tak) — en dat is in de onttrekkingsfase structureel 0. Gevolg:
  17 jaar 5%-rente-compounding, waardoor de lening tot leeftijd 92 ruim **verdubbelt**,
  terwijl er een **veelvoud daarvan aan liquide vermogen náást stond**.
- Dit gedrag is **oracle-getrouw** (Excel v5 doet het exact zo). Het is dus geen
  port-bug maar een **modelbeperking** van het oracle zelf.

## Besluit (eigenaar, 2026-07-04)

1. **Root-cause-fix in de kern, niet het verkoopmoment.** Een **maandelijkse
   tekort-aflos-stap** in `computeVerdeling` (`tables/verdeling/index.ts`): elke maand,
   ná de reguliere afname/onttrekking, als het tekort-lening-saldo > 0 én er nog liquide
   capaciteit is, wordt het **pre-existente** tekort (`saldo(m−1) + tekortrente`, vóór
   zover de surplus-tak het al pakte) alsnog afgelost uit de **resterende liquide
   bezit-capaciteit** (`categoriesaldo m−1 − afname − onttrekking`), in de
   **onttrekking-waterval-volgorde**. De afgeloste hoeveelheid landt als `S!AC` op de
   tekort-lening én — share-gewogen, net als afname/onttrekking — als extra onttrekking
   op de liquide potten (`Bez`).

2. **Invarianten.**
   - **Σruw=0.** Wat uit bezit wordt getrokken (`tekortAflossingLiquide`) is exact gelijk
     aan wat op de tekort-lening wordt afgelost (het liquide deel van `tekortAflossing`);
     netto-vermogen-neutraal (bezit −X, schuld −X). Geld verschijnt of verdampt nergens.
   - **Geen dubbele rente-boeking.** De aflos-cap `saldo(m−1) + tekortrente` is exact het
     bedrag dat `S` deze maand accruet (`AE = saldo(m−1)·rente/12`); de aflossing dekt
     hoofdsom + die ene rente-bijschrijving, niet meer.
   - **m−1-lag gerespecteerd.** De stap capt op m−1-capaciteit (zelfde conventie als de
     overige caps): het verkoopmaand-tekort wordt daardoor pas de **maand ná** de verkoop
     afgelost (zodra de verkoopopbrengst in het m−1-saldo zit).
   - **Inert bij lege potten.** Bij échte (terminale) depletie is er geen liquide
     capaciteit → de stap doet niets → gedrag identiek aan vandaag (legitieme insolventie
     wordt niet weggepapt).

3. **Schakelbaar + transitioneel.** De stap staat achter de kern-instelling
   `KernelInput.tekortAflossingUitLiquide` (inert-by-default, spiegel van de snede-2b
   `potMutaties`/`potLiquidaties`-conventie):
   - **App-pad AAN** — de adapter (`buildKernelInputFromApp*`) zet de vlag op `true`.
   - **Parity-/fixture-pad UIT** — `input-from-fixture` zet de vlag níet, dus de
     **735 oracle-parity-tests blijven byte-groen** tegen de Excel v5-fixtures.
   - **Transitioneel.** Zodra de eigenaar dezelfde stap in `Core calc v6.xlsm` doorvoert
     en de fixtures heréxtraheert (`scripts/horizon-oracle/extract_fixtures.py`), kan de
     parity-suite mét de stap AAN draaien en **vervalt deze vlag**.

## Alternatieven overwogen

- **Oracle byte-exact volgen (niets doen).** Verworpen: het levert een aantoonbaar
  onjuist beeld (miljoenen-tekort náást miljoenen liquide) dat gebruikers misleidt.
- **Alleen het verkoopmoment patchen.** Verworpen: de lag-piek kan ook buiten een
  huisverkoop ontstaan; een generieke maandelijkse stap dekt de root-cause (toename én
  onttrekking) en is inert waar niets af te lossen valt.
- **Same-month aflossen (geen lag).** Verworpen: doorbreekt de structurele één-maand-lag
  die het hele model draagt en zou een nieuwe divergentie met het oracle introduceren.

## Gevolgen

- Positief: het transitie-lag-tekort verdwijnt op het app-pad (eigenaar: jaarrij-endBalance
  leeftijd 75 = €0 → de tekort-lening-UI-melding verdwijnt); netto-vermogen blijft correct.
- Kosten: de app-uitkomst wijkt tijdelijk (transitioneel) af van Excel v5. Geborgd door de
  vlag-scheiding, `lib/horizon-kernel/tekort-aflossing-liquide.test.ts` (9 tests: transitie,
  lege potten, gedeeltelijke capaciteit, vlag-uit, waterval-volgorde, Σruw=0) en concern
  `horizon-kernel-bekende-afwijkingen` (punt 4). De divergentie mag niet "richting oracle"
  worden weggefixt zonder nieuw eigenaar-besluit.
- Register: gap-besluit **V19** (`docs/horizon-excel-oracle-plan.md` §7). Verwant aan V17
  (lege-surplus-doelpot) — zelfde patroon "kernel-extensie nu, Excel v6 + fixture-refresh
  borgt later".
