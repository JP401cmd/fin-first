---
id: 0032-horizon-kernel-excel-oracle-maandbasis
title: 'Horizon-rekenkern volgt het eigen Excel-oracle: maandbasis, nominaal, parity ≤ €0,01'
status: aanvaard
date: 2026-07-02
elements: [as-planning, fn-toekomstplannen, as-vermogen]
---

# 0032 — Horizon-rekenkern volgt het Excel-oracle (maandkern vervangt v2-grootboek)

De eigenaar vervangt de rekenwijze achter de Horizon/Toekomst-grafiek door die van
zijn eigen, gevalideerde Excel-model (**`Core calc v5.xlsm`**, vastgesteld
2026-07-02; snapshot SHA256 `3E905809B5CC…A80D`). De app-interactie blijft
ongewijzigd; alleen de motor eronder gaat rekenen zoals het Excel. Het Excel is
de **oracle**: de nieuwe kern moet aantoonbaar dezelfde uitkomsten geven.

## Context

- De huidige v2-grootboek-engine (`lib/horizon-engine/`, ADR 0013) rekent op
  **jaarbasis**, intern **reëel** (ADR 0016), met Box 3 als vermogens-drag en een
  forward doel-zoektocht als FIRE-bepaling.
- Het Excel-model rekent op **maandbasis** (index 0..1199, tot leeftijd 100),
  **nominaal** (reële invoer vooraf geïndexeerd), met een structurele
  **één-maand-lag** (belasting/capaciteit/rendement op saldi van m−1), Box 3
  **via de cashflow**, een **capaciteit-waterval** met prioriteit-gewichten
  ½^(prio−1) + reserve + tekort-lening, behoefte-gebaseerde onttrekking met een
  onttrekkingsprofiel (Vast/Afnemend/Oplopend/Guardrails), en een
  **maand-bisectie-solver** met expliciete statussen.
- Eerdere pogingen tot "twee waarheden naast elkaar" (drie-engines-divergentie)
  hebben geleerd dat alleen een aantoonbaar-gelijke, cel-voor-cel geteste kern
  vertrouwen geeft.

## Besluit

1. **Excel is de bron van waarheid.** Een nieuwe pure-TypeScript rekenkern
   (`lib/horizon-kernel/` — "kernel" om verwarring met De Kern-module te
   vermijden) implementeert de Excel-rekenwijze exact: maandbasis, forward-
   recursie, één-maand-lag (feature, geen bug), Box 3 via cashflow (forfaitair
   én werkelijk), netto = bruto, FIRE-grondslag netto-liquide, capaciteit-
   waterval met tekort-lening, eindstrategieën deplete/legacy/perpetual/
   pensioen, onttrekkingsprofielen, woning-modi incl. opeethypotheek, en de
   bisectie-solver met statussen `reached_now`/`reached_at`/
   `unreachable_within_horizon`/`pension_shortfall`.
2. **Parity is de poortwachter.** Een fixture-extractor trekt inputs + alle
   maandtabellen uit het .xlsm; een vitest-parity-suite vergelijkt cel-voor-cel
   per maand per tabel met tolerantie **≤ €0,01** en draait mee in de normale
   testrun. Elke wijziging aan de kern vereist groene parity.
3. **Nominaal-throughout.** De kern rekent nominaal zoals het Excel; dit keert
   de modelkeuze van ADR 0016 (reëel-intern) bewust om. Reële weergave blijft
   mogelijk als presentatie-wrapper (deflatie achteraf), niet als kernmodel.
4. **Parity binnen het Excel-domein; eigenschaps-tests daarbuiten.** N potten/
   gebeurtenissen is in code onbeperkt (Excel-slots zijn geen limiet; de
   slot-rollen huis/hypotheek/opeethypotheek/tekort-lening worden getypte
   rollen). Buiten het Excel-domein gelden eigenschaps-tests: totalen sluiten,
   geen negatieve potten, waterval sluit.
5. **Domein-expanders vóór de kern.** De 4 levensstrategieën (AOW, Pensioen,
   Huis, Werk) en de event-catalogus voeden de kern als kasstromen/events; de
   kern kent geen domeinbegrippen. De expanders worden zelf parity-getest tegen
   de Geb/Auto-gebeurtenissen-tabel van het Excel.
6. **Cutover per oppervlak achter een (her te bouwen) flag**, met een harde
   invariant: de **convergentie-set** (/overzicht-hero, /toekomst-grafiek,
   dashboard-loader/freedomPct via `fire-target-shared`, AI-context) flipt als
   geheel — nooit gedeeltelijk, om een nieuwe engines-divergentie te voorkomen.
   Default-flip en fysieke verwijdering van v2-paden volgen het C5-precedent en
   vereisen expliciet akkoord van de eigenaar.
7. **vpw en bucket vervallen** als onttrekkingsstrategieën; bestaande profielen
   migreren naar "Vast". Het onttrekkingsprofiel vervangt de oude
   `WithdrawalStrategyType`-as; de eindstrategie-as blijft apart.

## Gevolgen

- ADR 0013 en 0016 blijven van kracht tijdens de flag-periode en gaan pas naar
  `vervangen` bij de default-flip; besluiten die de kern materieel wijzigt
  (0014/0015/0027/0028/0030/0031) krijgen bij cutover een gerichte addendum-
  of superseding-ADR.
- Tijdens de flag-periode bestaan twee motoren naast elkaar — vastgelegd als
  aandachtspunt op de plaat; verwijderen bij afronding (FASE 6).
- Plan, mapping en gap-besluitenregister: `docs/horizon-excel-oracle-plan.md`.
