---
id: 0064-aow-bedragen-ssot-en-kernel-input-injectie
title: 'AOW-bedragen: één bron in constants.ts, de kernel krijgt de basis als INPUT (oracle-fallback blijft)'
status: aanvaard
date: 2026-07-29
elements: [as-planning, fn-toekomstplannen, as-vermogen]
---

# 0064 — AOW-bedragen: één bron + kernel-AOW als geïnjecteerde invoer

De app toonde en berekende de AOW op **twee grondslagen tegelijk**. Dit besluit maakt
`lib/constants.ts` de enige bron van de AOW-bedragen — óók voor de FIRE-projectie — en
legt vast hóe de horizon-kernel die bron consumeert zonder het Excel-oracle-contract
(ADR 0032) te breken.

## Context

Er lagen drie lagen AOW-bedragen naast elkaar:

1. **App-display/editor (canoniek)** — `NL_AOW_MONTHLY` / `NL_AOW_MONTHLY_SAMENWONEND`
   in `lib/constants.ts` (SVB per 1-7-2026: €1.581,55 / €1.084,13), met
   `computeAowMonthly()` (`lib/horizon-data.ts`) als enige rekenfunctie en
   `lib/fiscale-kerngetallen.ts#aow-bedragen` als gecureerd register
   (bron/`lastVerified`/frequentie). De eerdere losse duplicaten in `CASHFLOW_CATALOG`,
   de AOW-prefab en `components/onboarding/onboarding-horizon.tsx` zijn al opgeruimd en
   bewaakt door `lib/fiscale-duplicaten-guard.test.ts` (driftpunt `aow-bedrag-dubbel`).
2. **Horizon-kernel (divergent)** — `tables/auto-gebeurtenissen.ts` rekende Auto-geb
   **B21** onvoorwaardelijk op €1.452 / €993 (2025-basis van `Core calc v5.xlsm`), en
   `adapter/defaults.ts` spiegelde die 993 voor de partner-AOW (PT!B9). De FIRE-projectie
   hanteerde dus een ~8% lagere AOW dan de rest van de app toont. Code-comments
   markeerden dit wél, maar er was **geen besluit** vastgelegd.
3. **Persona-seeds (illustratief)** — `lib/test-personas.ts` (€1.380 / €940). Onschadelijk:
   de editor herrekent live via `computeAowMonthly` en de kernel negeert het event-bedrag;
   al vastgelegd als bewuste regressie-check in `lib/uat/acceptance/toek-checks.ts`.

De **AOW-leeftijd** is een aparte, correcte bron: de cohort-tabel `aow_leeftijd` (DB) via
`lookupAowAge` (`lib/aow-leeftijd.ts`). Dit besluit raakt die niet.

Drie opties lagen voor: (A) divergentie bewust laten en alleen documenteren, (B) het
Excel-oracle bijwerken en alle fixtures herextraheren, (C) de AOW-basis als **invoer** aan
de kernel geven. De eigenaar koos **C**.

## Besluit (eigenaar, 2026-07-29 — kaart [Arch F4], gap-besluit V20)

1. **`lib/constants.ts` is de enige bron van de AOW-bedragen**, voor élk oppervlak
   inclusief de FIRE-projectie. Geen tweede rekenpad, geen tweede literal.
2. **De kernel krijgt de basis als optionele invoer**, niet als hardcoded tabelconstante:
   `KernelInput.autoGebeurtenissen.aowBasisPerMaand` (`{ alleenstaand, samenwonend }`).
   De B21-**formulevorm** blijft ongewijzigd (`IF(B4="Alleenstaand"; a; s) · MIN(B5;50)/50`);
   alleen de basis is voortaan invoer.
3. **Inert-by-default (parity-borging).** Het veld weglaten → de kern valt terug op de
   Excel-oracle-basis €1.452/€993 in `tables/auto-gebeurtenissen.ts`.
   `lib/horizon-kernel/input-from-fixture.ts` zet het veld **níet**, dus het
   parity-/fixture-pad blijft **byte-identiek** aan `Core calc v5.xlsm` (ADR 0032,
   tolerantie €0,01 absoluut op geldbedragen). De oracle-constanten blijven staan als
   fallback en mogen nooit door een lib-import worden vervangen.
4. **Het app-pad injecteert wél.** `adapter/defaults.ts#APP_AOW_BASIS_PER_MAAND` leest
   `NL_AOW_MONTHLY` / `NL_AOW_MONTHLY_SAMENWONEND` en wordt via
   `NEUTRAL_AUTO_GEBEURTENISSEN` (adapter/params.ts) op **elke** app-run meegegeven — ook
   wanneer er geen AOW-life-event is, want de kern genereert de AOW-post zelf.
5. **Partner-AOW volgt dezelfde grondslag.** `EXCEL_AOW_SAMENWONEND_PP_PER_MAAND` (993) is
   vervangen door `AOW_SAMENWONEND_PP_PER_MAAND` = `APP_AOW_BASIS_PER_MAAND.samenwonend`.
   Zo houdt PT!B9 binnen één huishouden-run dezelfde grondslag als B21 — de consistentie
   die de oude constante al nastreefde, nu op de canonieke waarde.
6. **De resterende divergentie is bewust en gedocumenteerd:** kernel-fixture-pad €1.452/€993
   (oracle) vs. app-pad €1.581,55/€1.084,13 (SVB). Zij mag níet "richting oracle" worden
   weggefixt zonder nieuw eigenaar-besluit, en de kernelwaarden mogen niet worden gewijzigd
   zonder fixture-herijking via het Excel-oracle-proces.

## Gevolgen

- **Gedragswijziging (bewust):** de FIRE-projectie rekent voortaan met de actuele SVB-AOW
  (~8% hoger dan voorheen). FIRE-leeftijd, vrijheids-% en het benodigde doelvermogen
  bewegen daardoor licht gunstig mee. Dit is precies het doel: één getal, overal.
- **Parity:** onaangetast. `test/horizon-oracle` (736 assertions over 21 suites) en
  `lib/horizon-kernel` (343) blijven groen zonder fixture-herijking.
- **Jaarwissel:** SVB indexeert 2× per jaar (januari/juli). Bijwerken gebeurt op één plek
  (`lib/constants.ts`), waarna de kernel automatisch meebeweegt. De bedragen zijn
  (nog) **niet jaargelaagd**; het kerngetal `aow-bedragen` in `lib/fiscale-kerngetallen.ts`
  draagt `updateFrequency: 'jaarlijks'` + `lastVerified` en staat daarmee op de
  jaar-checklist. Een volwaardige `AOW_PARAMS`-jaartabel blijft een open verbetering.
- **Toekomstpad:** zodra Excel v6 dezelfde AOW-basis draagt en de fixtures heréxtraheerd
  zijn, kan het fixture-pad de injectie óók meegeven en vervalt de fallback-tak.

## Borging

- `lib/horizon-kernel/aow-basis-injectie.test.ts` — beide takken: fallback exact 1452/993,
  injectie exact de constanten, opbouwkorting op beide, partner-grondslag gelijk, en de
  structurele check dat `input-from-fixture` het veld niet zet.
- `lib/fiscale-duplicaten-guard.test.ts` — geen 1558/1072-literals buiten `constants.ts`.
- `lib/aow-surface-consistency.test.ts` — AOW-leeftijd-bron (cohort-tabel) intact.
- `test/horizon-oracle/**` + `lib/horizon-kernel/parity` — byte-parity tegen Excel v5.
- Aandachtspunt `horizon-kernel-bekende-afwijkingen` (punt 5) in
  `lib/architecture/archimate-concerns.ts`; catalogus-entry `horizon-kernel-maandmotor` in
  `lib/architecture/calculations.ts`; gap-besluit V20 in
  `docs/horizon-excel-oracle-plan.md`.
