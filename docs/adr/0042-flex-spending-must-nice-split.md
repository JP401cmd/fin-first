---
id: 0042-flex-spending-must-nice-split
title: 'Flex-spending: de onttrekkingsprofiel-factor grijpt alléén op het nice-deel — additief, inert-by-default (roadmap M)'
status: aanvaard
date: 2026-07-13
elements: [as-planning, fn-toekomstplannen, as-vermogen]
---

# 0042 — Flex-spending (must/nice-split in de onttrekking)

De horizon-kernel (ADR 0032) is de enige FIRE-rekenmotor en volgt het Excel-oracle
`Core calc v5.xlsm` byte-exact. Dit besluit legt de **flex-spending-mechaniek** (roadmap M)
vast: een gedragsregel die de flexibele (nice) uitgaven in de projectie laat meebewegen
met de portefeuille, terwijl de essentiële (must) uitgaven onaangetast blijven.

## Context — markt & bestaande bouwstenen

- **ProjectionLab v4.4.0 (okt 2025) — Flex Spending**: "dynamically adjust spending based
  on portfolio performance", met een essential/discretionary-categorisatie en
  gebruikersregels ("if the market drops 30% from ATH, reduce discretionary spending by
  60%"). Dit item is de NL-tegenhanger — gap-matrix #3, roadmap-item M.
- **Wat er al ligt** (niet heruitvinden): de must/nice-splitsing op budgetten via de
  boolean `is_essential` (`lib/budget-utils.ts#computeYearlyMustExpenses`), het
  guardrails-profiel in de kernel (`lib/horizon-kernel/tables/ont.ts`, kolom H/I), en het
  guardrail-kompas (`lib/horizon/guardrail-bounds.ts`, plan-brede bestedingsgrenzen).

## De draaiende motor + waar de regel moet landen

De guardrail-logica die de HUIDIGE projectie stuurt zit in de horizon-kernel
(`tables/ont.ts`): kolom **H** `guardrailsFactor` → kolom **I** `actieveFactor` → schaalt
de HELE post-FIRE uitgave-term. De v2-`lib/withdrawal-strategy.ts`-engine voedt de motor
niet meer (F6). De flex-regel moet dus in `ont.ts` landen om de projectie echt te bewegen.

## Besluit

1. **Splits de post-FIRE uitgave-term in must + nice; de profielfactor grijpt alléén op
   het nice-deel.** In `ont.ts` (kolom D) wordt `uitgaveTerm = baseTerm·factor` vervangen
   door `uitgaveTerm = mustTerm + niceTerm·factor` met `mustTerm = baseTerm·(1−niceFractie)`
   en `niceTerm = baseTerm·niceFractie`. Must blijft **ongefactord** — net als huur,
   vervallen hypotheeklast, Box 3 en de partnerbijdrage nu al ongefactord zijn.

2. **Strikt additief + achter een expliciete input-vlag, default-inert.** Nieuw veld
   `KernelInput.inkomenUitgaven.flexNiceOnly?: boolean`. Weggelaten/`false` → `baseTerm·factor`,
   **byte-identiek aan het Excel-oracle**. De nice-fractie (`flexNiceFractiePerJaar`,
   default 1) is zó gekozen dat de split ook mét de vlag AAN inert is bij fractie 1
   (`mustTerm = 0` → `niceTerm·factor = baseTerm·factor`). `input-from-fixture` zet de vlag
   NIET → alle 735 parity-fixtures blijven byte-groen (fixtures kennen geen must/nice).
   Alleen de app-adapter zet 'm AAN, en alleen als de gebruiker de flex-regel activeert.

3. **Trigger = de bestaande anker-ratio, géén nieuwe ATH/peak-state.** De kernel-guardrail
   vergelijkt `liquideNetto(m−1) / anker P!B82` (het liquide vermogen in de maand vóór
   FIRE — een VAST ijkpunt). Zowel het deterministische pad als elke MC-run is een glad
   pad met (per run) constant verschoven rendement; een echte "daling vanaf ATH"-trigger
   heeft in deze motor bijna geen signaal. We hergebruiken daarom de anker-ratio-trigger,
   gescoped op de nice-euro's — dit werkt meteen mee in slechte MC-runs (ratio onder de
   ondergrens → nice omlaag → hogere slaagkans). Een "drop vanaf ATH" is een aparte,
   grotere ingreep (nieuwe peak-state-kolom + fixture-herextractie) en wordt uitgesteld;
   de UI benoemt dit eerlijk (anker-ratio, geen ATH-drop).

4. **Optionele grotere cut-step op nice.** `flexNiceCutStep?: number` (0..1): alléén bij het
   Guardrails-profiel én een guardrails-dip (H < 1) wordt het nice-deel met
   `MAX(0, 1−flexNiceCutStep)` geschaald i.p.v. de op `guardrailFloor` gevloerde factor —
   zodat nice dieper kan zakken dan de reguliere band (ProjectionLab-conventie ≈60%).

5. **Consume, don't recompute.** De nice-fractie wordt afgeleid uit de budgetten
   (`(uitgaveNaPensioen − must)/uitgaveNaPensioen`, must uit `computeYearlyMustExpenses`),
   met een slider-override in de regel-editor. Bij methode `essential_budgets` is de
   uitgave al must-only → nice-fractie 0 → de regel is informatief. De portefeuille komt
   uit de bestaande kernel-velden (`guardrailsFactor`/anker) — geen lokale herberekening.

## Persistentie & UI

- De flex-config rijdt mee op de bestaande JSONB-kolom `profiles.withdrawal_profile_config`
  (`flex_nice_only`, `flex_nice_fractie`, `flex_cut_step`) — **geen migratie**.
- De UI is een verfijning van de bestaande regel **Onttrekkingsstrategie** (profiel
  Guardrails) op /toekomst → Voorkeuren: een toggle "pas alleen op mijn flexibele uitgaven
  toe" + nice-%- en cut-%-sliders + live-sim (vrijheidsdatum beweegt mee; de kernel-adapter
  leest de draft-config). In vrijheidstijd/must-nice-taal geframed.

## Gevolgen

- **Positief:** essentiële uitgaven worden nooit geknepen; flexibele uitgaven geven
  meetbare veerkracht (MC-vangnet: op een gestreste projectie stijgt de slaagkans van
  88% → 100%). Categorie-specifieke verdieping bovenop het bestaande guardrail-kompas.
- **Aandacht:** twee dempingslagen (fase-curve + guardrail + flex-op-nice) kunnen stapelen;
  expliciet tonen, niet stilzwijgend vermenigvuldigen. De regel is alleen zinvol wanneer
  de geplande pensioenuitgave bóven de must-euro's ligt.
- **Transitioneel:** dit is een bewuste, gedocumenteerde uitbreiding BUITEN het
  oracle-domein (zoals `potMutaties` V9 en `tekortAflossingUitLiquide` V19). Parity blijft
  de poortwachter met de vlag UIT.

## Vangnet

- `lib/horizon-kernel/tables/ont-flex.test.ts` — de deterministische must/nice-mechaniek
  (vlag uit = oracle; fractie 0/1; tussenwaarde; cut-step; regime-richting).
- `lib/horizon-kernel/adapter/flex-spending.test.ts` — parse + nice-fractie-afleiding +
  override-voorrang + MC-richting (deterministische sin-hash-shocks).
- `test/horizon-oracle/parity-ont.test.ts` (+ alle parity-suites) — byte-groen met de vlag
  UIT (hard gate).
