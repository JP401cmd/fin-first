---
status: aanvaard
date: 2026-06-13
elements: [as-planning, fn-toekomstplannen, as-vermogen]
---

# 0016 — Horizon v2: reëel-vs-nominaal productiekeuze (B3) + cutover-acceptatiecriteria (B1)

## Context

v2 (de grootboek-engine, ADR 0013) draait live achter een per-user flag. De validatiefase (Fase B uit `docs/horizon-tabel-rekenmotor-plan.md` §6) is grotendeels gedaan: de parity-review (B2) en de regressiesuites (B4) zijn klaar, en surfacede drie echte v2-bugs die inmiddels gefixt zijn — legacy-need-only (ADR 0014), eigen-huis-downsize als asset-liquidatie (ADR 0015) en de recurring-×12-eenheid (B2-fix, `horizon-engine-v2.md` §4.8). Vóór de **onomkeerbare** Fase C-cutover (alle FIRE-consumenten op v2, default flippen, legacy verwijderen) legt deze ADR twee dingen vast: de reëel-vs-nominaal-keuze (B3) en de expliciete go/no-go-criteria (B1).

## Besluit B3 — Reëel intern, nominaal getoond (Route 2)

v2 rekent **intern volledig reëel** (koopkracht heden; `realReturn = (1+nom)/(1+infl)−1`, vlakke reële uitgaven). De **adapter `ledgerToUnifiedResult` is het enige conversiepunt** en rekent terug naar **nominaal** (× (1+infl)^jaar), zodat /toekomst nominale bedragen toont op dezelfde schaal als v1 (INV-2). De `inflationFactor` blijft per rij bewaard zodat een reële weergave optioneel blijft.

Rationale: continuïteit met v1 en met de rest van de app (gebruikers kennen nominale bedragen); de reële kern maakt de engine wél koopkracht-eerlijk en uitbreidbaar. **Gevolg, bewust geaccepteerd:** omdat reëel rendement < nominaal, is v2 structureel conservatiever dan v1 — gemeten op de persona (B2): FIRE **deplete +7 jr, legacy +6 jr**, perpetual +1, pensioen 0. Dit is een correcter (koopkracht-eerlijk) antwoord, géén bug; de diffs decomponeren volledig naar deze modelkeuze + de drie gefixte gedragingen.

## Besluit B1 — Acceptatiecriteria vóór de cutover (Fase C)

De globale flip mag pas wanneer **alle** criteria groen zijn:

1. **Functionele dekking** — elke /toekomst-voorkeur + elk life-event aantoonbaar gehonoreerd in v2 (dekkingsmatrix §4 van het plan). *Status: grotendeels (Fase A); housing-downsize nu via ADR 0015.*
2. **Zinnige FIRE per strategie** — deplete/perpetual/legacy/pensioen leveren voor representatieve profielen een haalbare, plausibele FIRE; geen spurious "onbereikbaar". *Status: ✓ na de drie fixes (B2).*
3. **Decomponeerbare diffs** — elk materieel v1↔v2-verschil herleidbaar tot een gedocumenteerde modelkeuze (reëel-vs-nominaal, need-only legacy, housing-liquidatie), niet tot een onverklaarde fout. *Status: ✓ (B2-parity).*
4. **Geen kapotte afgeleide metrics** — de consumenten van de FIRE-output (`computeFreedomProgress`/freedomPct, gezondheidsscore, sovereignty, horizon-hero, `net_worth_snapshots`, briefing, AI-context) blijven correct met v2's `requiredFirePortfolio`/`fireAge`. *Status: ✓ geverifieerd (13 jun, Fase D). Sterker nog: de cutover **corrigeert** een live v1-bug. `runUnifiedProjection.requiredAt` rekent voor perpetual met `verifyEndAge = candidateFireAge + 100` (≈ leeftijd 189) en crediteert de **levenslange** AOW/pensioen (`toAge: null`) over dat hele venster → het benodigd vermogen klapt in (gemeten: €1,29M bij AOW-tot-90 vs **€196k** bij levenslange AOW, identiek profiel). Daardoor is v1's freedomPct (= FIRE-eligible vermogen ÷ requiredFirePortfolio) voor perpetual+AOW-gebruikers — de gangbare pensioensituatie — structureel te hoog. v2 (backward `V_nodig` tot de échte eindleeftijd; AOW 67→90) geeft een plausibel benodigd vermogen (€1,08M) → freedomPct wordt realistischer (meestal lager). De verschuiving bij de flip is dus een correctie, geen regressie. v1 wordt niet apart gefixt (gemoot door C5).*
5. **Regressiedekking** — engine-gedrag vastgelegd door tests: deplete→~€0, perpetual behoud, legacy ≥ doel, recurring ×12, housing netto-continuïteit. *Status: ✓ (`test/horizon-engine*.test.ts`, `test/horizon-housing-liquidation.test.ts`).*
6. **Reëel-vs-nominaal bevestigd** — Besluit B3 hierboven. *Status: ✓.*
7. **Surfaces convergeren** — /overzicht en /toekomst (en de snapshot-writer `computeFireProjection`) tonen ná de cutover dezelfde FIRE-leeftijd (de SSoT-doelstelling; zie [[project-fire-drie-engines-divergentie]]). *Status: ✓ MET (Fase C4, 13 jun). `computeHorizonFireTarget` (`lib/fire-target-shared.ts`) draait nu via `buildHorizonInput` + `runSelectedProjection(flag)` i.p.v. een hardgecodeerde v1-aanroep, zodat /core + AI-context + freedomPct/gezondheidsscore/sovereignty hetzelfde FIRE-doelbedrag lezen als /overzicht en /toekomst. Ook what-if, regel-sim (Voorkeuren-editors) en de AOW/Pensioen-previews (`strategy-preview.ts`, nu op de volledige `UnifiedProjectionInput`) lopen flag-bewust. De snapshot-`fire_age` (trend/fallback via `computeFireProjection`) houdt bewust zijn eigen closed-form definitie (ADR 0009-uitzondering).*

## Status & scope

- B3 ✓ (dit besluit), B2 ✓, B4 ✓; B1-criteria gedefinieerd. Criteria 1/2/3/4/5/6/7 zijn **allemaal groen** — criterium 7 afgevinkt in C4 (fire-target-shared op v2; /core + AI + freedomPct convergeren met /overzicht + /toekomst).
- De cutover is **volledig afgerond — Optie B (volledige fysieke verwijdering)**: C1 ✓, C2 ✓, C3 ✓, C4 ✓, **C5-c ✓ (14 jun 2026)** — `runUnifiedProjection` en `runSimulation` zijn fysiek verwijderd. `lib/unified-projection.ts` en `lib/fire-simulation.ts` bestaan nog maar bevatten uitsluitend gedeelde types/helpers. Scalar-bridge toegevoegd: `runScalarProjectionV2` (`lib/horizon-engine/scalar-bridge.ts`), die de scalar-portfolio-callers (incl. `strategie-modal.tsx`, de hypotheek-vs-beleggen-UI, de event-panes en de horizon-client scenario-overlays) naar v2 routeert. **§8 "toggle per gebruiker" achterhaald:** `isHorizonV2Enabled` retourneert altijd `true`; de toggle-UI en `/api/horizon-engine` GET/PUT zijn verwijderd (C5-a). `runSelectedProjection` is **v2-only**: de `useV2`-parameter blijft in de signatuur staan maar wordt genegeerd — er is **GEEN v1-arm** meer in de selector. **Parity-/compare-tooling is VERWIJDERD, niet behouden:** Optie B overrulede de eerdere productbeslissing D3 — `compareEngines`, de ledger-API (`/api/horizon-engine/ledger`) en de v1↔v2-vergelijk-inspector `/beheer/horizon-tabellen` + de parity-tests zijn weg (er is geen v1 meer om tegen te vergelijken). `strategie-modal.tsx` is **niet meer uitgesteld** — het draait op v2 via de scalar-bridge. Géén openstaand v1-werkpakket meer.
- Gerelateerd: ADR 0013 (engine), 0014 (legacy), 0015 (housing); plan `docs/horizon-tabel-rekenmotor-plan.md` §6; invariantendoc `docs/architecture/horizon-engine-v2.md`.

## /overzicht-convergentie: netto-vermogen-grondslag (jun 2026)

Criterium 7 ("Surfaces convergeren") had betrekking op de FIRE-leeftijd en het vrijheidsdoel. Na de grafiek-fix op `/overzicht` (ADR 0015-addendum) convergeert ook de **netto-vermogensprojectielijn** tussen `/overzicht` en `/toekomst`:

- `/overzicht` toont `simNetWorthRows` (volledig netto vermogen per jaar — FIRE-portefeuille + meegroeiende overwaarde), aangeleverd door `lib/dashboard-data-loader.ts` via `buildSimNetWorthRows`.
- `/toekomst` toont de grootboek-reeksen direct uit dezelfde engine-run.
- Beide verankeren op dezelfde Vandaag-grondslag (`currentNetWorth`) via de reconcile-offset in `buildSimNetWorthRows`.

**Verwijdering housing-strategy-nudge-sheet (jun 2026):** de eenmalige educatieve pop-up `components/app/horizon/housing-strategy-nudge-sheet.tsx` is verwijderd. De housing-strategie-functionaliteit zelf (instellingen-sectie, `lib/housing-strategy.ts`, `/api/housing-strategy`) blijft. De nudge was een tijdelijke UX-laag en liet geen architectureel spoor achter — geen ADR-besluit vereist, geen element of concern geraakt.
