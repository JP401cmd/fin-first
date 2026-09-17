---
id: 0151-opeet-rente-boven-plafond
title: 'Opeethypotheek: de bijgeschreven rente is zichtbaar, loopt boven het leenplafond door en een dalend plafond kort de schuld niet in'
status: aanvaard
date: 2026-09-17
elements: [as-planning, fn-toekomstplannen, as-vermogen]
---

# 0151 — Opeethypotheek: rente zichtbaar en boven het plafond

De opeethypotheek heeft per ontwerp géén maandlast: de rente wordt bij de schuld
opgeteld. Dat blijft zo. Wat verandert: de bijgeschreven rente wordt een apart,
zichtbaar getal, ze loopt door zodra de schuld tegen het leenplafond aanloopt (de
schuld mag boven het plafond uitkomen — alleen nieuwe opname stopt), en een dalend
plafond kort de schuld niet meer stilzwijgend in. Alles achter een app-only vlag; het
oracle-pad en de parity-suites zijn onaangetast.

## Context

- **Eigenaarsvraag (17 sep 2026).** De "hypotheeklast" van de opeethypotheek staat
  niet in de kassabon. Verkenning: terecht — er ís geen maandlast — maar de rente die
  op de schuld wordt bijgeschreven was nergens te zien.
- **Wat de kern deed** (`tables/s.ts#opeetSlot`, Excel-oracle):
  `S!P(m) = MIN(BD, (P(m−1) + BE)·(1 + B66/12))` met de rentekolom hard op 0. Drie
  defecten:
  - (a) de bijgeschreven rente is nergens zichtbaar (kolom 0, geen ander veld);
  - (b) zodra het saldo tegen het plafond `BD` aanloopt, slokt de `MIN` de rente op:
    de schuld staat stil terwijl er wél rente verschuldigd is;
  - (c) daalt `BD` (de overwaarde krimpt, bv. een dalende huiswaarde), dan trekt de
    `MIN` het saldo mee omlaag — een aflossing die niemand heeft gedaan, geld uit
    het niets.
- **Waarom de rentekolom 0 moet blijven.** `SSlot.rente` (S!S) voedt `S!AI`
  (totaalRente) en via `engine.ts#sSlotRente` de belastingtabel als *betaalde* rente;
  de bridge telt 'm op in `interestPaid`, dat `totalDebtInterest` en de rentelagen
  van het Inkomen & Uitgaven-overzicht voedt. Bijgeschreven rente is geen kasstroom;
  die in dezelfde kolom zetten zou 'm als uitgave laten meetellen.
- **Patroon.** Optioneel, inert-by-default `KernelInput`-veld dat het fixture-pad
  weglaat (V17/V19, ADR 0148, 0149, 0150).

## Besluit

1. **Apart veld, app-only.** `WoningStrategieParams.opeetRenteBovenPlafond?: boolean`
   (`lib/horizon-kernel/types.ts`). De app-adapter (`adapter/params.ts`,
   reverse_mortgage-tak) zet het altijd op `true`; `input-from-fixture.ts` zet het
   nooit.
2. **Rente loopt door, opname stopt.** Met de vlag laat `opeetSlot` de `MIN` weg:
   `P(m) = (P(m−1) + BE)·(1 + B66/12)`. Nieuwe opname stopt vanzelf: `Bez!BE` is
   al 0 zodra `opeetCapRestant` (leest `P(m−1)`) geen ruimte meer ziet — daar
   verandert niets. Invariant: `P(m) ≤ MAX(BD(m), P(m−1)·(1 + B66/12))` en
   `P(m) ≥ P(m−1)` (nooit ingekort).
3. **Bijgeschreven rente in een eigen veld.** `SSlot.renteBijgeschreven =
   (P(m−1) + BE)·B66/12`, alleen op de opeet-slot, in beide paden (weergave). De
   oracle-kolom `rente` blijft 0. De oracle-formule staat in het vlag-uit-pad
   letterlijk, met dezelfde float-associativiteit: de bijgeschreven rente wordt
   apart berekend en níet hergebruikt om het saldo te vormen.
4. **Bridge.** `debtBalances['opeethypotheek'].renteBijgeschreven` (jaarsom; bewust
   niet `interestPaid`) en het rijveld `opeetPlafondBereikt` (opeet-modus): opeet-tak
   gestart én `opeetCapRestant(BD(mEind), B66, S!P(mEind)) < €0,01`. Absolute drempel
   omdat de referentie een structurele 0 is (opname = capRestant ⇒ saldo = BD op
   float-ruis na).
5. **Weergave.** Jaarkaart-`DebtRow` toont "+ Opgenomen" (`row.opeetOpname`) en
   "+ Rente bijgeschreven"; de kassabonregel "Gedekt uit je huis (opeethypotheek)"
   krijgt de toelichting "geen maandlast: de rente wordt bij de schuld opgeteld";
   `lib/income-expense-breakdown.ts` sluit de sleutel `opeethypotheek` uit de rentelagen —
   die rente is bijgeschreven, geen kas. De tekort-lening blijft een rentelaag, consistent
   met `flowOut`, de jaarkaart en de fasetabel (zie Buiten scope).

## Gevolgen

- **Parity onaangetast.** Het fixture-pad zet de vlag nooit; `huis-opeethypotheek`
  blijft byte-identiek, geen rebaseline. De parity-comparator leest S kolomgewijs
  (saldo/aflossing/extra/rente) en ziet `renteBijgeschreven` niet.
- **Woonstrategie-matrix.** Geen golden-verschuiving (24/24 groen): op de persona knelt
  het plafond niet binnen de horizon.
- **Plan-effect.** Waar het plafond wél knelt, staat de opeetschuld aan het eind hóger
  dan voorheen (de weggevallen rente telt nu mee) en daalt ze nooit meer met de
  overwaarde. De schuld is niet-liquide (buiten Prognose!J), dus de FIRE-leeftijd
  verschuift hierdoor niet; het netto vermogen (I) en de eindsituatie wél. Dat is het
  eerlijke beeld — precies de aanleiding van de eigenaarsvraag.
- **Volgende stap (eindsituatie-duiding).** Een detector leest per jaar-rij de
  opeetschuld uit `debtBalances['opeethypotheek'].endBalance` en "plafond bereikt"
  uit `opeetPlafondBereikt`; beide zijn weergavevelden uit dezelfde run.
- **Bestaande invarianten herijkt.** Twee tests op het app-pad toetsten
  `saldo ≤ cap`; die toetsen nu `saldo(m) ≤ MAX(cap, saldo(m−1)·(1+r/12))` plus
  "opname 0 zodra de ruimte op is" (`opeet-naar-behoefte.test.ts` (b),
  `adapter/opeethypotheek-pot.test.ts`).
- **Catalogus.** `lib/architecture/calculations.ts`, calc `huis-strategie-trigger`
  (outputs, formule, functies, constante-toelichting).
- **Vangnetten.** `lib/horizon-kernel/opeet-rente-plafond.test.ts`: adapter (altijd
  true bij reverse_mortgage, afwezig elders); rente = saldo-groei − opname en kolom
  `rente` 0; boven het plafond opname 0, groei exact (1+r/12), saldo passeert de cap
  terwijl het oracle-pad ≤ cap blijft; dalend plafond kort niet in terwijl het
  oracle-pad wél inkort (het defect, gedocumenteerd); vlag weggelaten ≡ `false`
  byte-identiek en letterlijk de MIN-formule; buiten opeet-modus inert; bridge:
  jaar-sluiting `endBalance − startBalance = opname + renteBijgeschreven`,
  `interestPaid` 0, `opeetPlafondBereikt`. Plus sheet- en breakdown-tests.
- **Buiten scope.** De tekort-lening schrijft haar rente óók bij (S!AE) maar draagt
  die in de oracle-kolom `rente` en dus in `interestPaid`; alle oppervlakken (flowOut,
  jaarkaart, fasetabel, Inkomen & Uitgaven) tonen haar daarom nog als rente. Een aparte `renteBijgeschreven`
  voor de tekort-lening is een eigen besluit.
