---
id: 0029-opeethypotheek-reverse-mortgage-grootboek
title: 'Opeethypotheek (reverse mortgage) als echte grootboek-schuld in de V2-engine'
status: aanvaard
date: 2026-06-24
elements: [as-planning, fn-toekomstplannen, as-vermogen]
---

# 0029 — Opeethypotheek: van display-only schaduwschuld naar echte grootboek-schuld

De `reverse_mortgage` woningstrategie was in de V2-engine niet gemodelleerd: de
engine kende enkel een recurring-payout-life-event (fictieve maanduitkering) en
een display-only schaduwschuld buiten het grootboek. Dit besluit **modelleert de
opeethypotheek volledig in het V2-grootboek** (geen nieuw enum — `reverse_mortgage`
+ `ReverseMortgageConfig` blijven de bestaande API).

## Context

De vorige implementatie kende drie structurele tekortkomingen:

1. **Nalatenschap loog te hoog.** De engine kende de opeetschuld niet: het netto
   vermogen aan het einde = huiswaarde − 0 i.p.v. huiswaarde − opeetschuld. De
   separate schaduwschuld (`applyHousingStrategy.shadowDebtAtEndAge`,
   `wealth-composition-housing.ts` reverse_mortgage-tak) was display-only en drukte
   het werkelijke netto vermogen in de engine niet naar beneden.

2. **FIRE-eligibility-desync.** `getFireEligibleNetWorth(reverse_mortgage)` gaf
   `totalNetWorth` (huis 100% mee), terwijl het huis zonder de lening niet liquide is.
   De engine zag geen eligibility-bijdrage van de leenruimte. Display en engine
   spraken een ander taal.

3. **ADR 0015 erkende de tekortkoming.** De `reverse_mortgage`-strategie werd
   bewust op het oude model gelaten ("voorlopig") omdat de engine-modellering complex
   was. Dit besluit heft dat "voorlopig" op — niet als superseding maar als
   uitbreiding/voltooiing van ADR 0015.

## Besluit

**Acht kernregels** voor de V2-grootboek-modellering:

1. **Geen nieuw enum.** Hergebruik `reverse_mortgage` + `ReverseMortgageConfig`.
   De bestaande `build-input.ts`-tak (`useV2ReverseMortgage`) is het enige routing-punt.

2. **Huis blijft in de ledger, NIET spendable, NOOIT rauw onttrokken.**
   `countsAsEligibilityLiquid=false`, `mayBeRawWithdrawn=false` op de rauwe huiswaarde.
   Het huis groeit op `expected_return`, inclusion_pct-gewogen. Dit is een **vierde
   liquiditeit-aspect** naast het ADR-0028-helperpaar (`countsAsEligibilityLiquid` /
   `mayBeRawWithdrawn`): de huiswaarde zelf is nooit eligible of rauw onttrekbaar;
   enkel de leenruimte (zie regel 6) telt als eligibility-bijdrage.

3. **Synthetische aflossingsvrije "Opeethypotheek"-RunningDebt** opent op de
   trigger-leeftijd. Tekort-gedreven opname (`monthlyPayout==null`) leent reactief ná
   de liquide pot precies het onbedekte tekort; optionele vaste payout leent proactief.
   Rente (5,5% nominaal, onderpand-korting) stapelt op het saldo (blok-3-stijl,
   geen reëel-conversie — consistent met hoe de engine gewone schuldrente behandelt).

4. **CAP = overwaarde(jaar) × maxLoanPct** als jaar-loop-gate.
   - Opname: eindsaldo na opname ≤ cap/(1+rente) − begin.
   - Rente-accrual: eindsaldo geklemd op de cap.
   - Gevolg: opeetschuld overschrijdt nooit de LTV-grens, ook niet via gestapelde
     rente. Een onbedekt tekort boven de cap blijft als shortfall staan (FIRE-later).

5. **Nalatenschap = huis − schuld, gegarandeerd ≥ 0.**
   `nettoVermogen = totaalAssets − totaalSchuld` drukt de opeetschuld als echte
   grootboek-schuld per rij naar beneden. De display-only schaduwschuld is vervallen.

6. **FIRE-eligibility-grondslag = leenruimte (Optie B).**
   `reverseMortgageBorrowable(overwaarde, maxLoanPct)` is de ENNE home voor de
   × maxLoanPct-formule: één berekening in `lib/housing-strategy.ts`, geconsumeerd
   door zowel `getFireEligibleNetWorth` (display, ~8 consumers) als de engine-
   eligibility via het nieuwe input-veld `collateralBorrowableById` in `build-input.ts`.
   De leenruimte telt in `liquidSumStart` / `blendedRealReturnStart` met de
   huis-return als voet.
   `getFireEligibleNetWorth(reverse_mortgage)` = `totalNetWorth − overwaarde +
   reverseMortgageBorrowable(overwaarde, maxLoanPct)` (was `totalNetWorth`).

7. **Constanten naar `lib/constants.ts`:**
   - `REVERSE_MORTGAGE_DEFAULT_MAX_LOAN_PCT` = 0,50 (NL-markt 35–65%; tevens de
     LTV-cap en de FIRE-eligibility-fractie)
   - `REVERSE_MORTGAGE_DEFAULT_RATE` = 0,055 (NL 2026, nominaal; onderpand-korting
     t.o.v. ongedekte lening — bewust lager)
   - `DOWNSIZE_DEFAULT_SALES_COSTS_PCT` = 0,04 (al bestond; nu geëxpliciteerd)
   - `HOUSING_COST_AFTER_SALE_PCT` = 0,04/jr van WOZ (geschatte huur na verkoop)

8. **Één grootboek-waarheid.**
   De display-only schaduwschuld (`applyHousingStrategy.shadowDebtAtEndAge`,
   `wealth-composition-housing.ts` reverse_mortgage-tak) is **verwijderd**. De
   stapelbalk leest de opeetschuld 1:1 uit de engine-schuldrij.

**Rente-interpretatie:** nominaal (5,5%), consistent met blok-2b schuldbehandeling.
**Box-3-keuze:** de engine berekent Box-3-drag uitsluitend op positieve asset-waarden
(`Math.max(0, a.value)`) en netteert schulden niet — gewone hypotheken evenmin. De
opeetschuld verlaagt de Box-3-grondslag dus niet (conservatief, consistent).

## Gevolgen

- **Nalatenschap daalt nu correct.** De engine-grootboek-schuld drukt het netto
  vermogen aan het einde naar beneden; een "gratis" nalatenschap (huis − 0) is niet
  meer mogelijk.

- **FIRE telt fractie overwaarde mee i.p.v. 0% of 100%.** Vóór Fase 3 zag de
  engine geen eligibility-bijdrage (0%); de display gaf totalNetWorth (100%). Nu is
  beide grondslag de leenruimte (50% van de overwaarde bij de standaard maxLoanPct).

- **~8 display-consumers consistent met de engine.**
  `getFireEligibleNetWorth` (gebruikt door dashboard/core/horizon-loader, AI
  shared-context, freedom-card, report) erft de correctie automatisch via de
  gedeelde `reverseMortgageBorrowable`-functie — geen aparte consumer-updates nodig.

- **ADR 0015 "voorlopig" opgeheven** — niet superseded maar uitgebreid/voltooid.

- **ADR 0028-helperpaar → vier aspecten.**
  `countsAsEligibilityLiquid` / `mayBeRawWithdrawn` beschrijven de twee bestaande
  vrijheidsdimensies; de reverse_mortgage-woning voegt een DERDE (eligibility via
  leenruimte, niet via spendable) en VIERDE (mag nooit rauw) op de rauwe huiswaarde.

- **ADR 0025 (vrijheidscheck-funnel) ongewijzigd** — de funnel hanteert een eigen
  50%-conventie via `HOUSE_FIRE_WEIGHT` en `reverseMortgageBorrowable` niet direct.

- **De `deplete-doel-lijn-grondslag`-concern** is voor de reverse_mortgage-helft
  beslist: engine en display spreken nu dezelfde leenruimte-taal. De downsize-helft
  van die display-desync (open consistentie-vraag uit ADR 0028) blijft open en is
  geherformuleerd in het concern `deplete-doel-lijn-grondslag`.

## Alternatieven overwogen

| Optie | Verworpen omdat |
|---|---|
| Netto-correctie eindwaarde (aftrek achteraf) | Drukt netto vermogen pas bij de eindleeftijd naar beneden, niet elk jaar; tabel-G klopt dan niet tussentijds. |
| Display-only schaduwschuld behouden | Één extra aftelpad buiten het grootboek = drift-risico; nalatenschapsgrafiek en engine spreken nooit dezelfde taal. |
| Huis als spendable/rauw onttrekbaar markeren | Maakt de volledige huiswaarde liquide in de onttrekkingsvolgorde — overtreft de werkelijke liquiditeitsruimte (een opeethypotheek levert slechts een fractie van de overwaarde liquide). |
| Nieuw enum (bv. `equity_release`) | Extra code-pad voor geen verschil in semantiek; bestaande config/UI/RLS-queries hoeven dan niet aan te passen, en de testmatrix verdubbelt. |
