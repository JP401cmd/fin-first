---
id: 0030-drawdown-grondslag-besteedbaar-vermogen-splitst-rauwe-opname-van-fire-eligibility
title: 'Drawdown-grondslag: besteedbaarVermogen splitst rauwe opname van FIRE-eligibility (Optie B)'
status: aanvaard
date: 2026-06-24
elements: [as-planning, fn-toekomstplannen]
---

# 0030 — Drawdown-grondslag: `besteedbaarVermogen` splitst rauwe opname van FIRE-eligibility (Optie B)

ADR 0028 verenigde `spendable` en `saleManaged` op de downsize-woning zodat ze al
tijdens de opbouw als FIRE-eligible telde. Daarna trad een nieuw defect op bij
`downsize` + `on_depletion`: de getoonde afbouwlijn dipte (~leeftijd 71), steeg
vervolgens (~87) en crashte op endAge (~88–90) in plaats van soepel af te bouwen.
Dit besluit heft het defect op door de FIRE-eligibility-grondslag en de
drawdown-grondslag expliciet te splitsen in twee aparte grootheden in de
v2-grootboek-engine (`lib/horizon-engine/engine.ts`) — aangeduid als **Optie B**.

## Context

Na ADR 0028 had één functie `liquidValue` **drie rollen tegelijk**:

1. **FIRE-eligibility en display** — telt de volledige FIRE-eligible pot op
   (`countsAsEligibilityLiquid`), inclusief de spendable downsize-woning (~€500k).
2. **Annuïteitsbasis** — `computeAnnuityBase` (deplete-annuïteit) gebruikte
   `liquidValue` als `currentPortfolio` en berekende de jaarlijkse onttrekking op
   de hele eligibility-pot, inclusief de woning.
3. **Uitputtings-meting voor de verkooptrigger** — `resolveDownsizeTriggerV2`
   (on_depletion) mat het moment waarop de pot de verkoopkosten-buffer raakt.

De combinatie was onhoudbaar: de annuïteit berekende onttrekking op ~€1M (woning
erbij) maar kon het huis nooit rauw opnemen — `mayBeRawWithdrawn` sluit de woning
uit. De echte cash liep daardoor stiller leeg terwijl `liquideVermogen` door de
groeiende woning juist steeg. De trigger mat op een ex-huis-meetrun die de
getoonde run niet beleefde → de vuurdrempel werd pas ~16 jaar te laat bereikt →
de annuïteit moest de overblijvende pot in ~2 jaar naar €0 persen → crash.

## Besluit (Optie B — grondslag splitsen)

**Drie orthogonale rollen, drie grondslagen** in `lib/horizon-engine/engine.ts`:

| Rol | Grootheid (`LedgerRow`) | Definitie | Gebruikt door |
|-----|-------------------------|-----------|---------------|
| FIRE-eligibility / FIRE-gate | `liquideVermogen` (`liquidValue`) | `countsAsEligibilityLiquid` — van nature liquide **of** `spendable` | `liquidSumStart`, `blendedRealReturnStart`, `meetsStrategyTarget`, `liquideAtFire`, FIRE-snijpuntdetectie |
| **Drawdown-grondslag** (nieuw) | `besteedbaarVermogen` (`withdrawableLiquidValue`) | `mayBeRawWithdrawn` — van nature liquide **en niet** `saleManaged` | `computeAnnuityBase` (deplete-annuïteit), `decumStartLiquide`, `yearReturn` (afbouwcontext), `resolveDownsizeTriggerV2`, grafiek-vOp-lijn (`views.ts` + `lib/check/build-report.ts`) |
| Rauwe onttrekking | predicaat `mayBeRawWithdrawn` | Zie ADR 0028 §Besluit-2 | Onttrekkingsvolgorde / pot-volgorde |

**Kernregel:** een asset dat `spendable` (eligible) én `saleManaged` (niet rauw
onttrekbaar) is — de downsize-woning — telt voor `liquideVermogen` mee maar
**niet** voor `besteedbaarVermogen`. De annuïteit en trigger teren daardoor op de
pot die ze werkelijk rauw kunnen opnemen.

**Twee nieuwe engine-helpers** naast `liquidValue`:
- `withdrawableLiquidValue(assets)` — som van `max(0, value)` over de
  `mayBeRawWithdrawn`-set.
- `withdrawableRealReturn(assets)` — waarde-gewogen reëel rendement over diezelfde
  set; vervangt het oude `liquidRealReturn` dat uitsluitend de afbouwannuïteit
  voedde.

**Meetrun aangepast:** `build-input.ts baseSimInput` draait nu met de woning als
`spendable` (zelfde FIRE-eligibility-grondslag als de getoonde grafiek) en scant
`besteedbaarVermogen` in plaats van `liquideVermogen` → de verkoop vuurt op de
leeftijd waarop de getoonde besteedbare daling de verkoopkosten-buffer raakt, niet
~16 jaar later.

**Grafiek-vOp-lijn** (`views.ts buildChartSeries.vOp`, `build-report.ts
buildKruising.vOp`) leest `besteedbaarVermogen` → toont de échte besteedbare
daling vóór de verkoop, niet de eligibility-pot die door de groeiende woning
misleidend zou stijgen.

## Gevolgen

- **FIRE-leeftijd voor `downsize` ongewijzigd** — `liquidValue`/`liquidSumStart`/
  `blendedRealReturnStart`/`meetsStrategyTarget`/`liquideAtFire` blijven de
  eligibility-pot lezen. Het huis telt er nog steeds mee in de OPBOUW (ADR 0028).
- **`include_full` byte-identiek** — een `spendable`-zónder-`saleManaged` woning
  zit ook in `mayBeRawWithdrawn` → `besteedbaarVermogen == liquideVermogen`.
- **`reverse_mortgage` ongemoeid** — het huis zit in geen van beide potten; de
  leenruimte blijft een apart kanaal via `collateralBorrowableById` (ADR 0029).
- **`legacy` (need-only) ongemoeid** — `computeAnnuityBase` wordt in de
  `legacyPreserveOnly`-tak niet aangeroepen.
- **Elke `LedgerRow` draagt beide potten** — `liquideVermogen` (eligibility/FIRE-gate)
  én `besteedbaarVermogen` (rauw besteedbaar/afbouwlijn).
- **Open consistentie-vraag** (ongewijzigd t.o.v. ADR 0028 §Gevolgen): de
  DISPLAY-helper `getFireEligibleNetWorth` trekt voor downsize de overwaarde nog
  af. De desync tussen engine-eligibility (`liquidValue`, huis telt mee) en
  dashboard-display (`getFireEligibleNetWorth`, equity trekt) blijft open — zie
  concern `downsize-display-eligibility-desync` in
  `lib/architecture/archimate-concerns.ts`.

## Alternatieven overwogen

| Optie | Verworpen omdat |
|---|---|
| **A — extra input-markering** (`saleOnlyAssetIds`): de engine negeert deze ids in de onttrekkingsvolgorde maar gebruikt `liquidValue` ongewijzigd als annuïteitsbasis | Lost de getoonde lijn niet op: de lijn blijft de eligibility-pot (incl. woning) tonen → misleidende stijging blijft |
| **B — grondslag splitsen** (`withdrawableLiquidValue` naast `liquidValue`) | Aanvaard: exact drie-weg-scheiding, FIRE-gate ongemoeid, `include_full` byte-identiek, één wijzigingspunt in de engine |
| **C — `saleManaged`-bit laten vallen na ADR 0028** | Maakt de woning rauw onttrekbaar → liquidatievolgorde en ADR 0028-invariant geschonden |

Bewaakt door `test/horizon-downsize-verkopen.test.ts` (case "SSoT (ADR 0030):
`besteedbaarVermogen` is KLEINER dan `liquideVermogen` pre-verkoop, en gelijk
daarna"; regressie "besteedbaarVermogen monotoon niet-stijgend ná downsize-verkoop
(symptoom 1)") en `test/horizon-housing-liquidation.test.ts` (ADR 0030 / Optie B:
engine scant intern `besteedbaarVermogen` via saleManaged-markering op endAge+1).
