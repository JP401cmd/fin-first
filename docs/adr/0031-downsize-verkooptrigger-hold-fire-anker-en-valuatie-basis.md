---
id: 0031-downsize-verkooptrigger-hold-fire-anker-en-valuatie-basis
title: 'Downsize-verkooptrigger: hold-FIRE-anker (geen vaste-punt-iteratie) + valuatie-basis'
status: aanvaard
date: 2026-06-25
elements: [as-planning, fn-toekomstplannen]
---

# 0031 — Downsize-verkooptrigger: hold-FIRE-anker + valuatie-basis

Na ADR 0028 (de downsize-woning is `spendable` + `saleManaged`) en ADR 0030 (de
FIRE-eligibility-pot `liquideVermogen` en de rauw-besteedbare pot
`besteedbaarVermogen` zijn gesplitst) bleven twee defecten en één ontbrekende
planningskeuze rond de eigen-huis-downsize over. Dit besluit legt de gekozen
oplossing vast: een **stabiel hold-FIRE-anker + één income-gated verfijning** voor
de verkooptrigger (bewust **géén** vaste-punt-iteratie, die divergeert), de
**engine-reële verkoopopbrengst** in de preview, en een gebruikerskeuze
`saleValuationBasis: 'market' | 'woz'` (default `market` = continuïteit). Raakt
uitsluitend `lib/horizon-engine/build-input.ts` (`resolveDownsizeTriggerV2`,
`buildV2DownsizeHousing`) en `lib/housing-strategy.ts`
(`applyDownsizeValuationBasis`).

## Context — drie defecten/keuzes

**Bug A — verkoop-trigger viel in de accumulatiefase.** `resolveDownsizeTriggerV2`
liet de trigger-meetrun zijn *eigen* FIRE-leeftijd berekenen. Sinds ADR 0028 telt
de spendable woning mee in `liquideVermogen`, dus de FIRE-gate
(`meetsStrategyTarget` op `liquideVermogen`) wordt al op `currentAge` bevredigd —
terwijl de rauw-besteedbare ex-huis pot (`besteedbaarVermogen`, ADR 0030) dat niet
kan dragen. De meetrun "pensioneerde" daardoor een nog-werkende gebruiker direct,
teerde op de kleine ex-huis cash en kruiste de verkoopkosten-buffer al in de
opbouwfase. Symptoom (persona `janpaul050486`, firsthand): trigger op **41**
terwijl de getoonde run pas op **~59–60** FIRE bereikt.

**Waarom een vaste-punt-iteratie hier DIVERGEERT.** De voor de hand liggende fix —
pin de meetrun op de getoonde downsize-FIRE, herbereken, herhaal tot vast punt —
is firsthand aangetoond instabiel. De getoonde downsize-FIRE wordt zelf op
`liquideVermogen` gedetecteerd, en bij een verkoop ver in de toekomst houdt de
spendable woning die pot kunstmatig positief → de FIRE-gate claimt een
onmogelijk-vroege FIRE → de terugkoppeling oscilleert (waargenomen
41→79→83→41). Het defect zit dus niet in de iteratie-implementatie maar in de
**gate-grondslag**: zolang FIRE op de eligibility-pot (incl. spendable woning)
wordt gedetecteerd, is de zelf-berekende downsize-FIRE geen contractie en
convergeert een vaste-punt-zoektocht niet.

**Bug B — preview-opbrengst week af van de engine.** De getoonde
`metadata.saleProceeds` kwam uit `buildHousingLifeEventsAtAge` →
`projectEigenHuisValuesAt` (WOZ-nominaal, met fallback op `woz_value`) en week
daarmee ~€171k af van de markt-reële verkoop die de engine werkelijk in het
grootboek injecteert. Twee getallen voor één verkoop = drift (schending
single-source-of-truth voor het bedrag).

**Ontbrekende keuze — valuatie-grondslag.** Er was geen manier om de projectie
conservatiever (op WOZ) te laten rekenen; de engine gebruikte altijd
`current_value` (marktwaarde) als huis-startwaarde.

## Besluit

**1. Hold-FIRE-anker + één income-gated verfijning (geen vaste-punt-iteratie).**
`resolveDownsizeTriggerV2` pint de trigger-meetrun op een *stabiele* FIRE-leeftijd
in twee stappen in plaats van een eigen FIRE te laten berekenen:

- **Stap 1 — honest hold-FIRE-anker** = `runHorizonLedger(baseInput).fireAge`: de
  FIRE-leeftijd van de run waarin de woning `spendable` **én** rauw besteedbaar is
  (geen `saleManaged`-markering, geen huur). Daar geldt per constructie
  `besteedbaarVermogen == liquideVermogen` → de FIRE-gate is **eerlijk** en de
  leeftijd is **sale-timing-onafhankelijk** (≈ `include_full`-FIRE) en dus stabiel.
  Dit verwijdert de terugkoppellus die de iteratie deed divergeren.
- **Stap 2 — één verfijning, alléén voor een echte opbouwfase**
  (`monthlyIncome > 0` **én** `holdFireAge > currentAge + 1`): pin de meetrun op de
  getoonde downsize-FIRE (huur + verkoopkosten → iets later dan het anker),
  **geklemd** `≥ holdFireAge` (tegen het spendable-woning-artefact bij een verre
  verkoop) en `≤ endAge`. Een al-gestopte gebruiker (geen salaris) slaat de
  verfijning over — de ruwe trigger op het hold-anker is daar al juist en de
  instabiele getoonde-downsize-FIRE zou 'm alleen kunstmatig vertragen.

Pensioen-modus (exogene `forcedFireAge`) wint altijd en negeert beide stappen. De
verkoop valt zo gegarandeerd `≥` FIRE of nooit (`no_sale`).

**2. Engine-reële opbrengst in de preview (Bug B).** `resolveDownsizeTriggerV2`
retourneert de échte engine-net-opbrengst op de trigger-leeftijd
(`ledgerHouseValueAt(triggerRow) × salePricePct × (1 − salesCostsPct) − afgelost
hypotheeksaldo`, basis-bewust uit de meetrun-rij); `buildV2DownsizeHousing`
overschrijft daarmee `metadata.saleProceeds`. Preview/markers en grafiek tonen per
constructie **hetzelfde** bedrag dat de engine injecteert — de WOZ-nominale
parallelberekening vervalt.

**3. `DownsizeConfig.saleValuationBasis: 'market' | 'woz'` (default `market`).**
`applyDownsizeValuationBasis` (`lib/housing-strategy.ts`) is **dé ene bron** voor de
basis-substitutie: bij `'woz'` vervangt het `current_value → woz_value` (met
fallback op `current_value` als `woz_value` ontbreekt/0) vóór de engine. Omdat de
engine de huiswaarde overal via `assetEngineValue` leest, raakt deze ene
substitutie automatisch netto vermogen, FIRE-pot, verkoopopbrengst én de preview.
De substitutie wordt gedeeld door de getoonde grafiek-run (`buildHorizonInput`), de
trigger-meetrun en de modal-preview (`runHousingScenarioProjectionV2`), zodat alle
drie van dezelfde basis-bewuste huiswaarde uitgaan. Geen DB-migratie
(`housing_strategy_config` is JSONB; veld optioneel in het type, parser +
`DEFAULT_DOWNSIZE_CONFIG` zetten het altijd expliciet). Default `'market'` =
byte-identieke continuïteit met de bestaande prognose.

## Gevolgen

- **`include_full`-FIRE ongewijzigd** (51, firsthand), **`fixed_age` ongewijzigd**
  (verkoopt op de gekozen leeftijd — de huiswaarde van een `saleManaged` huis is
  FIRE-leeftijd-onafhankelijk, dus één meetrun volstaat). Decumulatie-personas
  (geen salaris) zijn ongewijzigd; de verfijning raakt alléén accumulerende
  gebruikers.
- **Single-source-of-truth versterkt**: de getoonde verkoopopbrengst is nu de
  engine-waarde i.p.v. een tweede (WOZ-nominale) berekening; de valuatie-basis
  heeft één substitutiepunt dat grafiek + meetrun + preview voedt.
- **Tweede-orde restspanning (kanttekening, zie concern).** Het hold-FIRE-anker
  *omzeilt* de divergentie, maar de onderliggende oorzaak blijft: de FIRE-detectie
  (`meetsStrategyTarget`/`liquideAtFire`) draait op de eligibility-pot
  `liquideVermogen` — incl. de spendable `saleManaged` downsize-woning — terwijl
  die woning niet rauw besteedbaar is. Daardoor blijft een zelf-berekende
  downsize-graaf-FIRE bij een late verkoop onbetrouwbaar, en is de trigger-resolver
  voor zijn correctheid gekoppeld aan dit asymmetrie-artefact. De **principiëlere
  richting** (bewust uitgesteld, groter dan deze bugfix) is de downsize-FIRE-gate te
  baseren op de rauw-besteedbare pot (`besteedbaarVermogen`) of op de
  overwaarde-bijdrage van de woning i.p.v. de volle spendable-waarde — dat raakt de
  ADR 0028-keuze (spendable woning in de eligibility-pot), de matrix-goldens en de
  cross-surface display-grondslag, en hoort in een eigen besluit. Verankerd als
  concern `downsize-fire-gate-eligibility-vs-besteedbaar` in
  `lib/architecture/archimate-concerns.ts`.
- **Niet hetzelfde als de bestaande display-desync.** Concern
  `downsize-display-eligibility-desync` (ADR 0028/0030) gaat over *display*
  (`getFireEligibleNetWorth`) vs. engine; dit nieuwe punt gaat over de
  *FIRE-gate-grondslag binnen de engine* en de stabiliteit van de
  trigger-detectie. Twee verschillende verankeringen, beide open.

## Alternatieven overwogen

| Optie | Verworpen omdat |
|---|---|
| **Vaste-punt-iteratie** op de getoonde downsize-FIRE | Firsthand aangetoond divergent (41→79→83→41): de getoonde FIRE wordt op `liquideVermogen` gedetecteerd, dat een verre spendable woning kunstmatig positief houdt → geen contractie. |
| **Hold-FIRE-anker zónder verfijning** | Te vroeg voor accumulerende gebruikers: de echte downsize-FIRE (huur + verkoopkosten) ligt later dan het anker → verkoop ~1 jaar vóór de stop-werk-leeftijd. |
| **FIRE-gate herdefiniëren op `besteedbaarVermogen`** (de principiële fix) | Correct maar buiten scope: raakt ADR 0028, de matrix-goldens en de cross-surface display-grondslag → eigen ADR + her-baselining nodig. Uitgesteld via concern. |
| **Preview WOZ-nominaal laten** | Twee getallen voor één verkoop → blijvende drift tussen preview en grafiek. |

Bewaakt door `test/horizon-downsize-valuation-trigger.test.ts` (Bug A relatieve
invariant `trigger ≥ eligibility-FIRE` of `no_sale`; Bug B exacte
`saleProceeds == engine-net` binnen €1; woz-basis kleinere huiswaarde;
`fixed_age`-regressie) en de bestaande
`test/horizon-downsize-verkopen.test.ts` / `test/housing-strategy.test.ts`.

## Addendum (2026-07-03) — MOOT onder de horizon-kernel

De v2-engine die dit besluit implementeerde is fysiek verwijderd (FASE 6 stap 5A, commit
`95bafeb53`). Het hold-FIRE-anker was een workaround voor de vaste-punt-iteratie-divergentie
die ontstond doordat de app-zijdige meetrun de verkoop-trigger BUITEN de eigenlijke
engine-run moest schatten (ADR 0028's spendable-vóór-verkoop-model maakte die schatting
instabiel). De horizon-kernel bepaalt de verkoop-trigger NATIVE, ÉÉN keer, binnen dezelfde
maandloop als de rest van de projectie (`Bez!AY`, `lib/horizon-kernel/tables/bez.ts`) — er
is geen aparte meetrun, geen vaste-punt-iteratie, dus geen hold-FIRE-anker nodig. De
valuatie-basis-keuze (`saleValuationBasis: 'market' | 'woz'`) is NIET overgenomen: de kernel
kent geen WOZ-alternatief en gebruikt altijd de pot-waarde (het Excel-oracle heeft geen
market/woz-onderscheid). Dit besluit is daarmee **moot** voor het hold-FIRE-anker-deel en
**vervallen** voor het valuatie-basis-deel; blijft staan als historisch besluit-record. Wie
een WOZ-conservatieve verkoopwaarde nog nodig heeft, moet dat als nieuw gap-besluit voor de
kernel indienen (`docs/horizon-excel-oracle-plan.md`).
