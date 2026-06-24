---
id: 0028-downsize-verkopen-spendable-salemanaged-verenigd
title: 'Downsize "Verkopen": de woning is BÉIDE spendable (FIRE-eligible in de opbouw) ÉN saleManaged (verlaat de pot enkel via de verkoop)'
status: aanvaard
date: 2026-06-24
elements: [as-planning, fn-toekomstplannen, as-vermogen]
---

# 0028 — Downsize "Verkopen": `spendable` + `saleManaged` verenigd

De v2-grootboek-engine behandelde de woning bij housing-strategie **downsize**
("Verkopen") tot dit besluit als niet-liquide tot het verkoopmoment: ze telde NIET
mee in het besteedbare/FIRE-eligible vermogen tijdens de opbouw. Dit besluit
**herdefinieert** de bestaande `downsize`-mode (geen nieuw enum) zo dat de woning
— eigendoms-gewogen via `inclusion_pct` — AL als besteedbaar FIRE-vermogen meetelt
tijdens de OPBOUW (zoals `include_full`), maar de pot UITSLUITEND verlaat via de
downsize-verkoop (met verkoopkosten + schuldaflossing), nooit rauw onttrokken. De
twee voorheen-samenvallende vragen "telt mee voor FIRE-eligibility?" en "mag rauw
onttrokken worden?" worden daartoe expliciet gesplitst in één gedeeld
liquiditeits-helper-paar in de engine.

## Context

`include_full` (ADR 0015) markeert de woning `spendable`: ze telt volledig als
besteedbare/liquide FIRE-pot. `saleManaged` (ADR 0020/0021) markeert dat een asset
als UNIT via een verkoop-config (`assetLiquidations`, engine-block 6b) verkocht
wordt — mét verkoopkosten + schuldaflossing — en nooit rauw onttrokken; tot de
verkoop telde zo'n asset NIET als liquide pot. De engine ging er expliciet van uit
dat `spendable` en `saleManaged` **wederzijds uitsluitend** waren ("geen overlap in
de praktijk"): het `saleManagedIds`-filter sloot `spendable`-assets uit.

Dat klopte voor `downsize` niet meer zodra we wilden dat de woning de
FIRE-eligibility in de opbouw optilt (FIRE vervroegt) maar tóch alleen via de
verkoop de pot verlaat. De woning moet dan TEGELIJK:

- meetellen in `liquidValue` / `liquidSumStart` / `blendedRealReturnStart` / de
  afbouw-annuïteit / de FIRE-gate (eligibility), én
- nooit rauw worden leeggetrokken in de onttrekkings-/tekort-volgorde — ze verlaat
  het grootboek uitsluitend via de fixed_age- of on_depletion-verkoop.

Met de oude `isNonLiquid`-shortcircuit (één predicaat dat beide vragen beantwoordde)
"paste het niet": markeer je de woning `spendable`, dan werd ze óók rauw
onttrekbaar; markeer je haar niet, dan telde ze niet mee voor FIRE.

## Besluit

1. **Herdefinieer `downsize` als "Verkopen"** — geen nieuw enum, geen UI/config-
   wijziging. De bestaande `DownsizeConfig` (trigger, `triggerAge`, `salePricePct`,
   `salesCostsPct`, `newMonthlyHousingCost`) blijft de bron.

2. **SSoT-kern — één gedeeld liquiditeits-helper-paar** in `lib/horizon-engine/engine.ts`,
   die de twee orthogonale vragen scheidt en door zowel de engine-drawdown ALS de
   trigger-meting (`resolveDownsizeTriggerV2`) wordt gedeeld:
   - `countsAsEligibilityLiquid(a)` — telt dit asset mee in het besteedbare/FIRE-
     eligible liquide vermogen? Ja als van nature liquide **of** `spendable`. Een
     `saleManaged`-zónder-spendable asset (generieke liquidatie) telt hier NIET mee
     tot de verkoop.
   - `mayBeRawWithdrawn(a)` — mag dit asset rauw onttrokken worden in de
     onttrekkings-/tekort-volgorde? Alleen als van nature liquide **én NIET**
     `saleManaged`. Een `saleManaged` asset is hier ALTIJD uitgesloten, ongeacht
     `spendable`.

   *Eligibility-liquide* (incl. huis) en *trigger-liquide* (ex. huis) zijn één en
   dezelfde definitie bekeken vanuit twee runs: de echte run markeert de woning
   `spendable` → ze telt mee; de trigger-MEETRUN markeert haar NIET als spendable →
   `countsAsEligibilityLiquid` sluit haar daar uit → ex-huis. Zo deelt de meetrun
   exact dezelfde liquide-definitie als de echte run.

3. **Verzoen `spendable` + `saleManaged` op het `eigen_huis`-asset.** Het
   `saleManagedIds`-filter filtert `spendable` NIET langer weg (anders zou de
   spendable woning rauw onttrekbaar worden). RAW-bestemmingen voor
   surplus/verkoop-opbrengst gebruiken `mayBeRawWithdrawn` (niet eligibility), zodat
   een opbrengst nooit in de zojuist-verkochte woning terugbelandt. In
   `build-input.ts` markeert zowel de grafiek-keten (`buildHorizonInput`) als de
   modal-preview (`runHousingScenarioProjectionV2`) het huis `spendable` voor
   `useV2Downsize`.

4. **Verkoop op vaste leeftijd ÓF `on_depletion`.** `fixed_age` verkoopt
   onvoorwaardelijk op `triggerAge`; `on_depletion` verkoopt zodra de trigger-liquide
   pot (ex. huis) is uitgeput (`liquide ≤ verkoopkosten-buffer`). De gerapporteerde
   trigger-leeftijd == de leeftijd waarop de engine werkelijk verkoopt (SSoT-invariant).

5. **Aannames (gemarkeerd, instelbaar):**
   - **Verkoopkosten** = `salesCostsPct`, default **4%** (`DEFAULT_DOWNSIZE_CONFIG`
     in `lib/housing-strategy.ts`). Liquideren op eigendoms-gewogen reële waarde ×
     `salePricePct` − verkoopkosten; gekoppelde hypotheek wordt afgelost.
   - **Huur ná verkoop** = `newMonthlyHousingCost`, default
     `estimateMonthlyHousingCostAfterSale(woz) = woz × 4% / 12`
     (`lib/housing-strategy.ts`). Vanaf de verkoopleeftijd komt deze woonlast als
     recurring expense erbij (rent-event-cashflow).

6. **`inclusion_pct` overal** — de engine-waarde van élk asset (ook de downsize-
   woning) = `current_value × net_worth_inclusion_pct` (EIGENDOM; ADR 0027-addendum).
   `include_full`/`spendable` is een orthogonale FIRE-behandeling, geen eigendoms-as.
   Zuiver (Fase 1) blijft: de afbouw eindigt op het doelsaldo op endAge.

## Gevolgen

- **FIRE vervroegt doorgaans** voor downsize-gebruikers (de eligibility-pot is altijd
  groter; in de strategie-matrix-persona: `A-downsize` 62 → 58, doelbedrag
  €2.071.090 → €2.343.807). De NETTO richting is return-mix-afhankelijk: een groot
  laag-rendement-huis drukt via `blendedRealReturnStart` de disconto-voet → V_nodig
  stijgt mee → in zulke fixtures kan FIRE +1 jr; de eligibility-pot is altijd groter.
  De goldens zijn herijkt (geen verkapte regressie — alleen `A-downsize` schoof;
  overige combo's byte-identiek).
- **Verkoop laat netto vermogen continu** (alleen −verkoopkosten + dat-jaars
  onttrekking), geen sprong van de volledige huiswaarde (het oude filter-model deed
  dat). Geen dubbeltelling van huis-equity: `sim-netto-vermogen-projectie` telt voor
  v2-downsize géén losse overwaarde bij (het huis zit al in `endPortfolio`).
- **Generieke liquidaties ongewijzigd**: een `saleManaged`-zónder-spendable asset
  (voertuig/inboedel/deelneming/beleggingspand) blijft tot de verkoop buiten de
  eligibility-pot (`countsAsEligibilityLiquid` = false), zoals ADR 0021.
  `include_full` en `exclude_from_fire` zijn byte-identiek (de Fase-2-wijziging raakt
  uitsluitend het downsize-pad).
- **Open consistentie-vraag (bewust buiten scope, voor architect/owner):** de
  DISPLAY-helper `getFireEligibleNetWorth` (engine-agnostisch) trekt voor downsize de
  overwaarde nog AF. Daardoor kunnen dashboard-"belegbaar vermogen"- en
  freedomPct-oppervlakken de downsize-gebruiker ÓNDER-tellen t.o.v. wat de engine als
  eligible ziet. Een cross-surface grondslag-besluit; niet in deze build gewijzigd.

Bewaakt door `test/horizon-downsize-verkopen.test.ts` (huis-in-opbouw FIRE-eligible,
fixed_age-verkoop = opbrengst − kosten in liquide met netto-continuïteit,
on_depletion-trigger == werkelijk verkoopjaar, `inclusion_pct=50`-weging, generieke
saleManaged-regressie, include_full/exclude_from_fire ongewijzigd),
`test/horizon-housing-liquidation.test.ts` (her-gebaselined: liquide verspringt niet
meer omhoog bij verkoop) en de herijkte strategie-matrix (`A-downsize`).

---

## Addendum — Drawdown-grondslag gesplitst (Optie B, jun 2026)

Dit addendum voltooit de splitsing die ADR 0028 begon: twee rollen zijn nu drie.

### Aanleiding

Na ADR 0028 trad een nieuw defect op bij `downsize` + `on_depletion`: de getoonde
afbouwlijn dipte (~leeftijd 71), steeg daarna (~87) en crashte vervolgens (~88–90)
in plaats van soepel af te bouwen. Oorzaak: één functie `liquidValue` vervulde **drie
rollen tegelijk** — (1) FIRE-eligibility/display, (2) de deplete-annuïteitsbasis
(`computeAnnuityBase via currentPortfolio=liquidValue`) en (3) de uitputtings-meting
van de verkooptrigger (`resolveDownsizeTriggerV2`).

Doordat de downsize-woning met ADR 0028 `spendable` werd, telde `liquidValue` de
volledige woningwaarde (~€500k) mee → de annuïteit werd berekend op ~€1M en
onttrok daardoor te weinig. Tegelijk sloot `mayBeRawWithdrawn` de woning uit van
rauwe onttrekking → de échte cash liep leeg terwijl `liquideVermogen` (woning groeit
mee) juist steeg. De trigger mat op een ex-huis-meetrun die de getoonde run niet
beleefde → de vuurdrempel werd pas ~16 jaar te laat bereikt → crash.

### Besluit (Optie B — grondslag splitsen)

**Drie orthogonale rollen, drie grondslagen in `lib/horizon-engine/engine.ts`:**

| Rol | Grootheid | Definitie | Gebruikt door |
|-----|-----------|-----------|---------------|
| FIRE-eligibility / FIRE-gate | `liquidValue` / `liquideVermogen` | `countsAsEligibilityLiquid` — van nature liquide **of** `spendable` | `liquidSumStart`, `blendedRealReturnStart`, `meetsStrategyTarget`, `liquideAtFire`, de FIRE-snijpuntdetectie |
| **Drawdown-grondslag** (nieuw) | `withdrawableLiquidValue` / `besteedbaarVermogen` | `mayBeRawWithdrawn` — van nature liquide **en niet** `saleManaged` | `computeAnnuityBase` (deplete-annuïteit), `decumStartLiquide`, `yearReturn` in de afbouwcontext, de v2-verkoop-trigger (`resolveDownsizeTriggerV2`), de getoonde afbouwlijn (`views.ts` + `lib/check/build-report.ts`) |
| Rauwe onttrekking | `mayBeRawWithdrawn` predicaat | Zie ADR 0028 §Besluit-2 | onttrekkingsvolgorde / pot-volgorde |

**Invariant:** `eligibility ≠ drawdown-basis voor de `saleManaged`-`spendable` woning.`
Een woning die `spendable` (eligible) én `saleManaged` (niet rauw onttrekbaar) is,
telt voor eligibility mee in `liquidValue` maar **niet** voor de drawdown-grondslag
in `withdrawableLiquidValue`. De annuïteit en trigger teren daardoor op de pot die
ze werkelijk rauw kunnen opnemen.

**`LedgerRow.besteedbaarVermogen`** is de display-grootheid voor de afbouwlijn in de
grafiek. Elke `LedgerRow` draagt nu **beide** potten:
- `liquideVermogen` = `liquidValue` → FIRE-gate, eligibility, vrijheidsvoortgang.
- `besteedbaarVermogen` = `withdrawableLiquidValue` → de rauw besteedbare afbouw,
  grafiek-afbouwlijn (`vOp` in `views.ts` en `buildKruising.vOp` in `build-report.ts`).

**Trigger-meetrun aangepast:** `build-input.ts baseSimInput` draait nu met de woning
als `spendable` (zelfde FIRE-eligibility-grondslag als de getoonde grafiek) en scant
`besteedbaarVermogen` i.p.v. `liquideVermogen` → de verkoop vuurt op de leeftijd
waarop de getoonde besteedbare daling de verkoopkosten-buffer raakt.

### Gevolgen

- **FIRE-leeftijd downsize ongewijzigd** — `liquidValue`/`liquidSumStart`/
  `blendedRealReturnStart`/`meetsStrategyTarget`/`liquideAtFire` lezen nog steeds
  de eligibility-pot (huis spendable → telt mee). De FIRE-leeftijd schuift niet.
- **`include_full` byte-identiek** — een `spendable`-zonder-`saleManaged` woning
  zit ook in `mayBeRawWithdrawn` → `besteedbaarVermogen == liquideVermogen`.
- **`reverse_mortgage` ongemoeid** — huis in geen van beide potten; de leenruimte
  blijft een apart kanaal via `collateralBorrowableById`.
- **`legacy` (need-only) ongemoeid** — `computeAnnuityBase` wordt in de
  `legacyPreserveOnly`-tak niet aangeroepen.
- **Open consistentie-vraag (ADR 0028 §Gevolgen, ongewijzigd):** de DISPLAY-helper
  `getFireEligibleNetWorth` trekt voor downsize de overwaarde nog af. Deze fix
  raakt uitsluitend de engine-drawdown, niet de display-helper. De desync tussen
  engine-eligibility (`liquidValue`, huis telt mee) en dashboard-display
  (`getFireEligibleNetWorth`, trekt equity af) blijft open — zie concern
  `downsize-display-eligibility-desync` in `lib/architecture/archimate-concerns.ts`.

### Bewaking

`test/horizon-downsize-verkopen.test.ts` — case (d) meetrun her-gebaselined
(oude buggy ex-huis-meetpad codificeerde de bug); de overige cases (huis-in-opbouw,
`fixed_age`-continuïteit, `SSoT-trigger==verkoop`, `inclusion_pct=50`, generieke
saleManaged-regressie, `include_full`/`exclude_from_fire` byte-identiek) groen.
