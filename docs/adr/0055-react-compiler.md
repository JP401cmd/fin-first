---
id: 0055-react-compiler
title: 'React Compiler aan — automatische, correcte memoïsatie app-breed (Task 4.3)'
status: aanvaard
date: 2026-07-20
elements: [app-comp]
---

# 0055 — React Compiler aan (Task 4.3)

Laatste taak van FASE 4 van het performance-programma. We zetten de **React
Compiler** aan (`reactCompiler: true`), zodat React onze componenten op
build-time automatisch en *correct* memoïseert. Dat neemt de gebroken handmatige
memo-ketens uit de juli-performance-audit structureel weg zonder 318 bestanden
met de hand na te lopen, en versterkt de INP-winst van T4.1/T4.2 op `/overzicht`
en `/toekomst`. Eén omkeerbare vlag.

## Context

De app memoïseert op grote schaal met de hand — **318 componentbestanden**
gebruiken `useMemo`/`useCallback`/`memo`. Waar één schakel in zo'n keten een
verkeerde/ontbrekende dependency heeft (of bewust met
`// eslint-disable-next-line react-hooks/exhaustive-deps` is stilgezet, o.a. in
`components/app/horizon/horizon-client.tsx`), breekt de keten eronder: kinderen
re-renderen alsnog en de memoïsatie is verspild werk. Handmatige memo = per
definitie toekomstige drift. Fase 4 mikt op soepele interactie (lage INP /
main-thread-druk) op de twee zwaarste routes.

In Next.js 16 is de React Compiler-integratie **stabiel** (na de 1.0-release van
de compiler). Historisch draaide de compiler via een Babel-pass — wat botste met
onze bewuste keuze om **géén webpack-wrappers** te gebruiken (we bouwen met
Turbopack; zie ook de Serwist-configurator-keuze in `next.config.ts`). Dat risico
was de scherpste openstaande vraag vóór akkoord. De eigenaar koos het pad
"health-check-spike eerst; alleen bij groen activeren".

## Besluit

**React Compiler aanzetten via de top-level, stabiele config-vlag.**

- `reactCompiler: true` staat **top-level** in `next.config.ts` (in Next 16
  gepromoveerd uit `experimental` — de oude `experimental.reactCompiler` is niet
  de juiste sleutel voor onze versie). Bron: Next.js-docs `reactCompiler`
  (weergegeven op 16.2.10) + de Next.js 16-release-blog.
- Dependency: `babel-plugin-react-compiler@1.0.0` als **devDependency**.
- **Turbopack-route (het gate-risico) is schoon.** Next past de compiler via een
  **SWC-voorfilter** alléén toe op relevante (JSX/hook-)bestanden en draait de
  Babel-pass daar native onder Turbopack — **géén webpack-wrapper, géén
  `--webpack`-flag, geen project-`.babelrc` nodig** (die zou juist SWC breed
  uitschakelen; we hebben er bewust geen). De Rust-native Turbopack-compiler
  (`experimental.turbopackRustReactCompiler`) is een **16.3**-feature en is voor
  ons (16.2.6) niet beschikbaar; we nemen de Babel-plugin-route met SWC-voorfilter.
- **Compilatie-mode: default (infer)** — de compiler memoïseert alles wat de
  Rules of React volgt; bails vallen veilig terug op de bestaande code. We kiezen
  bewust níet voor `compilationMode: 'annotation'`.

### Spike-uitkomst (de go/no-go-data)

- `react-compiler-healthcheck` over `{app,components,lib}/**`: **1517/1517
  componenten compileren**, **0 incompatibele libraries**, StrictMode aanwezig.
  Nul harde bails.
- ESLint met de versie-gelijke `eslint-plugin-react-hooks@7` (de compiler-
  diagnostiek als lint): **169 Rules-of-React-signalen over 103 van 2458
  bestanden**. Verdeling: `set-state-in-effect` 99, `preserve-manual-memoization`
  35, `refs` 20, `purity` 5, `error-boundaries` 4, `static-components` 4,
  `immutability` 2. Dit zijn **veilige bails**: de compiler laat zo'n component
  ongewijzigd (met zijn bestaande handmatige memo) staan i.p.v. het te
  transformeren — **geen gedragswijziging**, alleen "hier nog geen extra winst".
  Deze 103 bestanden zijn de latere-opschoning-lijst, geen blokkade.

### Verificatie

- `npx tsc --noEmit`: schoon (exit 0).
- `npm run test:run` (volledig, kaal): **588 test files pass / 2 skip; 7669 tests
  pass / 4 skip; exit 0**. **Nul gedragsdrift** — geen enkele test viel om, dus
  geen gerichte Rules-of-React-fixes nodig. (Kanttekening: vitest draait via
  `@vitejs/plugin-react`, niet via de compiler — de suite bewijst logica/typen,
  niet de gecompileerde output; die verifiëren we via build + runtime.)
- `npm run build` (volledig, incl. Serwist): **exit 0**, service worker geschreven.

### Build-tijd-impact (verwacht, acceptabel)

| stap | zonder compiler | met compiler |
| --- | --- | --- |
| Next compile-stap ("Compiled successfully in") | 26,4 s | 39,1 s (+12,7 s / +48%) |
| `next build` totaal (elapsed) | 96 s | ~114 s (incl. Serwist-stap) |
| TypeScript | 61 s | 61 s (ongewijzigd) |

Dit is de door de docs voorspelde "kleine, gelokaliseerde" Babel-overhead. De
Rust-native compiler (16.3) zou dit later grotendeels wegnemen.

### Lokale meetindicatie (prod-build lokaal, chrome-devtools)

Interactie-traces op de prod-build (compiler aan), 1× CPU, geen netwerk-throttle:

- `/overzicht` — INP **53 ms** (bedragen-maskeren = app-brede currency-re-render),
  CLS 0,00.
- `/toekomst` — INP **84 ms** (scenario- + Monte-Carlo-overlay + maskeren =
  chart-hercompute op de horizon-god-component), CLS 0,00.

Beide ruim in de "goede" INP-band (<200 ms). De compiler is aantoonbaar actief:
de build meldt de `[BABEL]`-pass op `horizon-client.tsx` en **13 client-chunks
dragen de `useMemoCache`-runtime**. Dit is een *indicatie*; de formele prod-
hermeting (throttled, veld-INP 3–7 dagen) doet de controller na de release.

## Gevolgen

- **Bestaande handmatige memo's mogen blijven staan** — de compiler is idempotent
  t.o.v. correcte `useMemo`/`useCallback`. **Nieuwe componenten hoeven niet meer
  defensief gememoïseerd te worden**; de audit-bevinding "handmatige memo =
  toekomstige drift" is structureel weg.
- **Omkeerbaar.** Eén vlag uit = terug naar de oude situatie. Laag lock-in-risico;
  de vóór-meting is bewaard zodat een regressie hard aantoonbaar is.
- **Latere opschoning (geen blokkade):** de 103 bail-bestanden krijgen (nog) geen
  compiler-winst. De grootste concentraties zitten in `set-state-in-effect`
  (cascading-render-smell) en `preserve-manual-memoization` (kapotte dep-array).
  Wie zo'n hot-path-component aanraakt, kan de Rules-of-React-overtreding
  opruimen zodat de compiler 'm alsnog memoïseert — minimaal-invasief, per geval.
- **God-component-signaal:** `horizon-client.tsx` triggert een Babel
  code-generator-deopt-note (>500KB). Cosmetisch (build slaagt), maar het
  onderstreept de bestaande backlog om dit bestand op te knippen.
- **De `react-hooks/*`-lints staan al op `warn`** (compiler-prep). Die blijven
  advisory; ze zijn nu de curatie-lijst voor de latere opschoning.
