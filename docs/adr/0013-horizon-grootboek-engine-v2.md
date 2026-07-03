---
status: vervangen
date: 2026-06-13
elements: [as-planning, fn-toekomstplannen, as-vermogen]
---

# 0013 — Horizon FIRE-rekenmotor v2: tabel-georiënteerd grootboek

## Context

De productie-engine `runUnifiedProjection` (`lib/unified-projection.ts`) bepaalt de FIRE-leeftijd via een forward-loop met per-leeftijd een binary search (`requiredAt`, met geneste decumulatie-subsimulatie). Dat is ondoorzichtig, duur en moeilijk uit te breiden; een reeks gewenste impacts (pot-regels, inkomensgroei, schuld-aflossen-uit-surplus, Box 1) is daardoor niet aangesloten. De functionele uitwerking + het beperkingenregister staan op de (tijdelijke) referentiepagina `/beheer/grafiek-werking`; het plan in `docs/horizon-tabel-rekenmotor-plan.md`.

## Besluit

Een tweede, **tabel-georiënteerde** engine in `lib/horizon-engine/` naast de bestaande, achter een per-gebruiker feature-flag (`profiles.feature_preferences.horizon_engine_v2`). Kenmerken:

1. **Grootboek per jaar** (`LedgerRow`), **per individueel asset en per individuele schuld** — fundering voor interventies/volgordelijkheid op assetniveau. Elk asset groeit op zijn eigen verwachte rendement; schulden lossen af op hun eigen rente/schema.
2. **Reëel** gerekend (koopkracht nu); `realRet = (1+nominaal)/(1+inflatie)−1`. Box 3-drag per asset.
3. **Forward V_op**: opbouw tot FIRE, daarna onttrekking volgens de **onttrekkings- + eindstrategie** (`applyWithdrawalStrategy`): deplete → ~€0 op eindleeftijd, legacy → nalatenschap, perpetual → koopkracht behouden, guardrails/vpw/bucket. De annuïteit gebruikt het **werkelijke gewogen reële rendement van de liquide portefeuille** (niet `grossReturn`), zodat deplete niet vroegtijdig leegloopt.
4. **Backward V_nodig**: het benodigd vermogen per leeftijd (vanaf de eindleeftijd terug, dus dalend) als referentielijn.
5. **FIRE = forward doel-zoektocht** (zelf-consistent): de vroegste leeftijd waarop "stop met werken + onttrek volgens de strategie" het einddoel haalt. De getoonde lijn ÍS die run, dus grafiek en FIRE-leeftijd kloppen per constructie — i.p.v. een crossing op een afwijkende decumulatie-aanname.
6. **Route 2 — reëel → nominaal**: de adapter (`adapter.ts`) rekent terug naar nominaal (× (1+inflatie)^jaar) en levert een `UnifiedProjectionResult`, zodat de bestaande grafiekcomponenten v2 drop-in consumeren en de schaal vergelijkbaar blijft met v1.
7. **Selectie** via `runSelectedProjection` in de /toekomst-hook (`use-horizon-fire-sim.ts`); default uit = byte-identiek aan v1.

## Status & scope

- v2 staat live **achter de flag** (default uit; aan voor het owner-account voor troubleshooten).
- Inspecteerbaar op `/beheer/horizon-tabellen` (tabellen A–G + vergelijking v1↔v2).
- Verschil met v1 is **puur methode** en hangt af van strategie/profiel (bv. persona perpetual ~+7 jr later, deplete ~+2 jr; netto-pad enkele tot tientallen %). Meet per account via `compareEngines` vóór de cutover-beslissing — de cijfers hier zijn indicatief, niet bindend.

> **Let op bij vervolgwerk:** FIRE wordt bepaald via een **forward doel-zoektocht** (`meetsStrategyTarget`), NIET via het V_op×V_nodig-snijpunt (dat bleek inconsistent voor deplete/perpetual — de getoonde lijn decumuleert immers, terwijl de werkende lijn doorspaart). De V_nodig-lijn is een referentie. Herintroduceer geen crossing-gebaseerde FIRE. Zie `docs/architecture/horizon-engine-v2.md` (INV-3).

## Gevolgen / nog open (worden via de feature-pijplijn afgerond)

- **Pot-regels** (`profiles.pot_rules`: onttrekkingsvolgorde / verdeling-bij-toename / onttrekking-bij-afname) nog niet doorgedraad naar de engine-opties; v2 gebruikt defaults.
- **Box 1** in de projectie is nog een vereenvoudigde placeholder (tabel D).
- **Werkelijke tabellen voor de eigen gebruiker** (transparantie) nog te ontsluiten.
- ~~De **onomkeerbare** stap — v2 als globale default + verwijderen van `runUnifiedProjection`/`runSimulation` — blijft gated tot de live-test akkoord is.~~ **C5-c AFGEROND (14 jun 2026):** `runUnifiedProjection` en `runSimulation` zijn fysiek verwijderd. De gedeelde types/helpers in `lib/unified-projection.ts`/`lib/fire-simulation.ts` zijn bewaard. Scalar-bridge toegevoegd: `runScalarProjectionV2` (`lib/horizon-engine/scalar-bridge.ts`) is een drop-in voor de scalar-portfolio-signatuur. De parity-tooling (`compareEngines`, `/beheer/horizon-tabellen`) is bewust behouden per productbeslissing D3 (`docs/horizon-v1-verwijderplan-c5.md`). 238 bestanden / 3389 tests groen, tsc schoon.

Bewaakt door `test/horizon-engine.test.ts`, `test/horizon-persona.test.ts`, `test/horizon-engine-compare.test.ts` en de catalogus-entry `horizon-grootboek-v2` in `lib/architecture/calculations.ts`.

## Addendum (2026-07-03) — VERVANGEN door ADR 0032

De v2-grootboek-engine die dit besluit beschrijft is **fysiek verwijderd** (FASE 6 stap 5A,
commit `95bafeb53`), na de default-flip naar de horizon-kernel (`afb75d738`, 2026-07-03).
ADR 0032 (`0032-horizon-kernel-excel-oracle-maandbasis.md`) legt het vervolgbesluit vast:
een pure-TypeScript rekenkern (`lib/horizon-kernel/`) die de eigenaar-geverifieerde Excel-
oracle port — maandbasis + nominaal (keert punt 2/6 hierboven om), met een eigen maand-
bisectie-solver i.p.v. de forward-doel-zoektocht in punt 5. De catalogus-entry heet nu
`horizon-kernel` in `lib/architecture/calculations.ts`. Dit document blijft staan als
historisch besluit-record van de v2-architectuur; wijzig de tekst hierboven niet met
terugwerkende kracht — nieuwe besluiten horen in ADR 0032 of een eigen addendum.
