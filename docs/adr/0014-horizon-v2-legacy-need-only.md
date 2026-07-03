---
status: aanvaard
date: 2026-06-13
elements: [as-planning, fn-toekomstplannen, as-vermogen]
---

# 0014 — Horizon v2: legacy (nalaten) onttrekt need-only, geen spend-down-annuïteit

## Context

De gedeelde onttrekkingsmotor `applyWithdrawalStrategy` (`lib/withdrawal-strategy.ts`) berekent voor de eindstrategie **legacy** een *spend-down-annuïteit*: `computeAnnuityBase` zet de contante waarde van het nalatenschapsbedrag apart en onttrekt het resterende surplus via een groeiende annuïteit tot ~€0 op de eindleeftijd (interpretatie B: "spendeer maximaal en laat exact €X na"). Dat is zelf-consistent **mits de over-onttrekking ook daadwerkelijk geconsumeerd wordt** — wat in v1 (`runUnifiedProjection`) impliciet zo gemodelleerd is (en v1 bepaalt FIRE bovendien via `requiredAt`, niet via de annuïteit).

In het **grootboek-model van v2** (`lib/horizon-engine/engine.ts`) klopt die aanname niet: de onttrekking wordt uit de assets gehaald, maar het deel boven de leefbehoefte wordt **niet geconsumeerd of herbelegd** — het verdwijnt uit het grootboek. Gevolg: voor legacy onttrok de annuïteit fors méér dan nodig (bv. €83k terwijl €42,7k nodig was) en dat surplus **verdampte**, waardoor de nalatenschap nooit gehaald werd. Reproductie op het owner-account (legacy €200k): het eindvermogen kapte rond ~€70k ónder het doel (legacy €50k eindigde zelfs op ~€3k), zodat `meetsStrategyTarget` legacy als **onbereikbaar** markeerde en /toekomst "FIRE niet haalbaar" toonde — terwijl deplete/perpetual op dezelfde data wél haalbaar waren. Zie ook de divergentie-diagnose ([[project-fire-drie-engines-divergentie]]).

## Besluit

Voor de eindstrategie **legacy** onttrekt v2 **need-only**: alleen de netto leefbehoefte; het residu blijft belegd en groeit naar de nalatenschap (interpretatie A: "laat **minstens** €X na"). De FIRE-leeftijd is daarmee de vroegste leeftijd waarop need-only onttrekken het grootboek niet vroegtijdig leegtrekt én op/boven het nalatenschapsbedrag eindigt — exact wat de backward `V_nodig`-lijn (die al `endVal = legacyAmount` gebruikt) en `meetsStrategyTarget` (legacy: eindvermogen ≥ nalatenschap −2%) veronderstellen. Deplete blijft de spend-down-annuïteit gebruiken (→ ~€0); perpetual/pensioen waren al need-only.

**Implementatie (respecteert INV-5 — onttrekkingsbedrag-logica hoort in `withdrawal-strategy.ts`, niet in `engine.ts`):** een opt-in vlag `WithdrawalContext.legacyPreserveOnly`. In `applyStatic`/`applyBucket`/`applyGuardrails` retourneert de legacy-tak `netBaseExpenses` zodra de vlag aanstaat (guardrails: `useAnnuityBase` wordt dan false). v2 zet de vlag aan; **v1 niet → default false = byte-identiek aan vandaag**, en de bestaande withdrawal-suite (die de annuïteit asserteert) blijft groen. `engine.ts` configureert alleen de plug-in (geen bespoke math in de jaar-loop — INV-4 blijft intact).

## Status & scope

- Geldt **alleen voor v2** (flag-gated, default uit). v1-productie en de gedeelde annuïteit-tests zijn ongewijzigd.
- De /toekomst-melding bij `!fireReachable` is strategie-bewust gemaakt: voor legacy benoemt 'ie het **nalatenschapsbedrag** als hefboom (i.p.v. enkel "spaarquote/uitgaven"), en "voor leeftijd 90" → "binnen je projectie (tot leeftijd 90)" — 90 is de horizon (`endAge`), niet AOW. (`horizon-client.tsx`, `sim-chart-widget.tsx`.)
- **Niet** in scope (blijft gated, ADR 0013): de cutover waarbij alle FIRE-consumenten (incl. de snapshot-writer `computeFireProjection`) op één engine komen. Tot die tijd kan /overzicht (v1/`computeFireProjection`) een ándere FIRE-leeftijd tonen dan /toekomst (v2) — dat is de bekende SSoT-divergentie, niet deze bug.

## Gevolgen / open

- Bij de cutover heroverwegen of de **gedeelde** legacy-default ook naar need-only moet (interpretatie A is voor een planner waarschijnlijk de juiste default); dan de v1-annuïteit-tests herzien i.p.v. de flag.
- Bewaakt door `test/horizon-engine.test.ts` (legacy: bereikbaar, eindvermogen ≥ nalatenschap, monotone in het bedrag, onttrekking ≈ behoefte) + de ongewijzigde `lib/withdrawal-strategy.test.ts` (annuïteit-default). Catalogus-entry `horizon-grootboek-v2` in `lib/architecture/calculations.ts`; invariantendocument `docs/architecture/horizon-engine-v2.md`.

## Addendum (2026-07-03) — geërfd door de horizon-kernel

De v2-engine die dit besluit implementeerde is fysiek verwijderd (FASE 6 stap 5A, commit
`95bafeb53`); de horizon-kernel (ADR 0032) is nu de motor. Het PRINCIPE — legacy onttrekt
naar behoefte, niet als spend-down-annuïteit die het surplus wegspendeert — ERFT over: de
kernel kent geen aparte "annuïteit vs need-only"-knop maar een generieke
**behoefte-gebaseerde onttrekking met een onttrekkingsprofiel** (Vast/Afnemend/Oplopend/
Guardrails, ADR 0032 punt 1) die voor élke eindstrategie hetzelfde werkt: de capaciteit-
waterval onttrekt wat nodig is, niet meer. Voor de doel-toets gebruikt de solver bij
`Nalatenschap` (legacy) het statusblok-veld `nietLiquideMeetellen` om te kiezen tussen
Prognose!I (netto vermogen, inclusief niet-liquide) en Prognose!J (netto-liquide) als
modelwaarde tegen het doelbedrag (`lib/horizon-kernel/gap.ts`); de adapter zet dit veld
altijd op `'Nee'` (geen app-tegenhanger) — de kernel toetst legacy dus tegen het
netto-LIQUIDE vermogen, niet het volledige netto vermogen. Catalogus-entry: zie
`horizon-kernel` in `lib/architecture/calculations.ts`.
