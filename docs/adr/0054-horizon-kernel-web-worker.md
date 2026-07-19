---
id: 0054-horizon-kernel-web-worker
title: 'Horizon-kernel draait client-side in een web worker, met progressieve first paint op server-scalars'
status: aanvaard
date: 2026-07-19
elements: [as-planning, fn-toekomstplannen]
---

# 0055 — Horizon-kernel naar een web worker (Task 4.2)

## Context

`/toekomst` draaide de FIRE-kernel **synchroon op de main thread**. In
`use-horizon-fire-sim.ts` deden drie `useMemo`'s elk een volledige kernel-run:
de hoofd-projectie (`computeConvergentieProjection` — gemeten 173–419 ms), de
wat-als-scenario-run en het gekozen-stop-pad (`runForcedStopPath`). Omdat
`horizon-client.tsx` een `'use client'`-component is die Next.js óók server-side
rendert, liep die synchrone `useMemo` ook mee in de SSR-render. Daarbovenop
draaiden — al deferred, maar nog op de main thread — de Monte-Carlo-overlay
(1000 sims), de dekkingsradar-MC (500 sims) en de vijf scenario-presets
(~5 volle kernel-solves, ~1 s samen), eager in `requestIdleCallback`.

Baseline (mobiel, 4× CPU, Fast 4G): LCP 12,5 s / render-delay 10,5 s /
forced-reflow 3,55 s; en INP-tikken van ~1 s zodra de idle-runs vuurden.

De kernel is **puur en isomorf** (`lib/horizon-kernel/**` raakt geen
`window`/`document`/`createClient`/`react`; de MC-/preset-runners evenmin), dus
veilig te verplaatsen naar een aparte thread. **De rekenkern zelf verandert
niet** — dit besluit gaat over *wáár* hij draait, niet *hoe* hij rekent.

## Besluit

1. **Kernel-runs naar een web worker.** Een dunne abstractie
   (`lib/horizon-kernel/worker/run-in-worker.ts`) biedt `runKernelAsync`,
   `runForcedStopPathAsync`, `runScenarioPresetsAsync` en `runMonteCarloAsync`.
   Eén lazy-gecreëerde `module`-worker
   (`new Worker(new URL('./kernel.worker.ts', import.meta.url), { type: 'module' })`)
   wordt op een oplopende request-id gemultiplext, zodat parallelle runs
   (hoofd/scenario/stop/MC/presets) elkaars antwoorden niet kruisen. De worker
   importeert alléén het pure gedeelde protocol (`kernel-protocol.ts`), dat de
   pure reken-modules aanroept — geen react/window/supabase.

2. **Synchrone fallback (parity heilig).** Zonder `Worker` (jsdom-tests, SSR,
   oude runtime) draait `executeKernelRequest` direct op de aanroepende thread en
   levert een resolved Promise. De hook kiest zélf sync-vs-async op
   `isKernelWorkerAvailable()`: in jsdom/SSR blijft de bestaande `useMemo`-tak
   intact (byte-identiek resultaat op de eerste render), in de browser levert die
   memo `null` en vult een effect de state via de worker. Zo blijven de
   735-parity-suite, `scenario-baseline-parity` en de hook-contracttests
   **byte-identiek groen** en blijft de SSR-render kernel-vrij.

3. **Progressieve first paint ("eerst tonen, dan verfijnen").** Zolang de
   worker-run nog niet geland is, toont de hero de al-server-berekende scalars
   uit `initialData` — `freedomPct` en `requiredPortfolioExclHome` (loader) plus
   de laatst weggeschreven `fire_age` (`net_worth_snapshots`). Consume, don't
   recompute: geen nieuwe som in de client. Zodra de worker de exacte projectie
   teruggeeft, verfijnt de weergave naar de kernel-waarden.

4. **Zichtbaarheids-gating.** De dekkingsradar-MC en de scenario-presets rekenen
   niet langer eager in idle, maar pas wanneer hun sectie via een
   `IntersectionObserver` (bijna) in beeld komt — en dan via de worker. De
   Monte-Carlo-overlay houdt zijn expand-klik als (striktere) zichtbaarheids-gate
   en verhuist enkel naar de worker.

## Gevolgen

- **Positief:** de main thread blokkeert niet meer op de kernel-/MC-/preset-runs;
  de eerste paint toont de server-scalar direct i.p.v. te wachten op de solve of
  te flitsen. INP-interacties (slider slepen, radar/presets in beeld scrollen)
  belasten de main thread niet meer met ~1 s reken-taken.
- **Geaccepteerd:** de getoonde `fire_age` kan bij de first paint licht *stale*
  zijn (laatst weggeschreven snapshot) tot de worker verfijnt — precies het
  bedoelde "eerst tonen, dan verfijnen"-gedrag (gebruikersbesluit 19 jul 2026).
- **Geen Berekeningen-curatie nodig:** er is geen rekenmotor toegevoegd of
  gewijzigd; `horizon-kernel` in `lib/architecture/calculations.ts` beschrijft
  dezelfde motor — die draait nu enkel client-side in een worker.
- **Serialisatie:** de request-payloads en responses zijn structured-clone-veilig
  over de `postMessage`-grens (bewezen met een `structuredClone`-round-trip-test).
  Een kapotte/onbereikbare worker valt automatisch terug op de synchrone runner,
  zodat een worker-fout de projectie hooguit trager maakt, nooit stuk.

## Alternatieven overwogen

- **Alles in `useDeferredValue` laten (huidige situatie):** dat is *scheduling*,
  geen *offload* — de rekenkost blijft op de main thread. Verworpen.
- **Pure effect-tak zónder synchrone fallback:** breekt de hook-contracttests,
  die het resultaat synchroon ná `renderHook()` lezen. De dual-mode-aanpak
  (sync `useMemo` waar geen Worker is) houdt die byte-identiek groen.
