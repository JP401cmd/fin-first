---
id: 0164-schulden-stap-raster-first
title: 'De schulden-stap van de onboarding is raster-first — één aanvinkraster, meerdere schulden per soort'
status: aanvaard
date: 2026-09-19
elements: [sp-registreren, as-vermogen]
---

# 0164 — De schulden-stap van de onboarding is raster-first

Eigenaarsbesluit van 19 september 2026 op Notion-kaart B-054 (optie A).
Herziet het eigenaarsbesluit H13 van 26 augustus 2026 (`docs/ux-review-jul2026.md`
§8, optie C "hybride") naar de destijds afgewezen optie B.

## Context

Sinds H13 stelde de schulden-sectie (`components/onboarding/onboarding-schulden.tsx`)
vier gerichte ja/nee-kopvragen (hypotheek, studielening, persoonlijke lening,
autolening) en sloot af met één aanvinkraster voor de rest van de catalogus:
vijf schermen bij "alles nee". Een testgebruiker vroeg alle schulden in één
keer uit te vragen én meerdere schulden van dezelfde soort te kunnen opgeven.
Dat tweede was een echte gap: in het raster was een soort één vinkje en de
collect-queue kende geen "Nog een?", zodat twee creditcards alleen via de
kop-lus of via review → "Voeg nog iets toe" konden.

## Besluit

1. De sectie opent direct op het aanvinkraster (`pick-many`) met de volledige
   catalogus. De vier voormalige kopsoorten staan vooraan onder "Meest
   voorkomend" (`FEATURED_DEBT_TYPES`), de rest onder "Andere schulden".
2. Schuldsoorten die al via een bezitting zijn opgegeven
   (`LINKED_DEBT_SUGGESTIONS`: hypotheek bij je woning, autolening bij je
   voertuig, RC bij je BV) staan uitgeschakeld in het raster mét herkomst
   ("al opgegeven via je woning") — zichtbaar, niet dubbel opvoerbaar.
3. Per aangevinkte soort opent de gedeelde `QuickAddWizard` (mode `collect`);
   ná elke toevoeging volgt "Nog een …?" (fase `more`, `qIndex` = index in
   `QUICK_ADD_DEBT_ORDER`) zodat meerdere schulden per soort kunnen.
   **Het herhaalbare blok is altijd de wizard** — nooit een eigen inline
   type+saldo-formulier, want dat zet rente/looptijd/aflossingsvorm op
   type-defaults en verandert daarmee `monthly_payment`, de box 1-aftrek en de
   kernel-uitkomst.
4. De drempelloze uitgang blijft op elk scherm en is scherp geformuleerd:
   "Ik heb geen schulden" zolang er niets staat, "Ik heb verder geen schulden"
   daarna.
5. Geen schemawijziging, geen API-wijziging: het uitvoercontract blijft
   `DebtQuickInput[]`. Een hersteld concept van vóór dit besluit (stack op
   `ask`/`more`) heelt naar het raster (`healSchuldenPhases`), met een
   vangnet in de component.

## Gevolgen

- 1 scherm bij "geen schulden" (was 5, daarvóór 8). Bij twee schulden:
  raster + 2× wizard + 2× "nog een?" + review — vergelijkbaar met voorheen.
- De prijs is volledigheid (elf tegels scannen); gemitigeerd door de groepskop,
  de uitgeschakelde gekoppelde soorten, de deck-tekst die hypotheek en
  studielening noemt, en de scherpe uitgang.
- Asymmetrie met de bezittingen-sectie (nog vier ja/nee-vragen, Besluit 13)
  wordt groter; dezelfde wens is daar te verwachten.
- UAT: WF-START-19 beschrijft het raster; de cijfers (€351.800 / €288.000 /
  €63.800) zijn ongewijzigd.
