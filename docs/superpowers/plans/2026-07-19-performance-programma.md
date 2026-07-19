# Performance-programma TriFinity — implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De gemeten performance-knelpunten (TTFB 3,0 s server-side op /overzicht, LCP 12,5 s mobiel op /toekomst, CLS 0,94, bundels 3–5× boven budget, kapotte veldmeting) structureel wegnemen, in vier fasen met een release + meting per fase.

**Architecture:** Fase 1 repareert de meting en pakt de goedkope structurele winsten (registry-split, watervallen, fetch-hygiëne, DB-advisors, referentie-cache). Fase 2 saneert de server-datalaag (gedeelde basisdata, SQL-aggregaten, widget-gating, streaming). Fase 3 slankt de client-bundels af en migreert API-auth. Fase 4 doet de twee grote verbouwingen (enkelvoudige shell-render, kernel naar worker) — elk met een eigen detailplan bij fase-start.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, Supabase (PostgreSQL 17, RLS), Tailwind v4, Serwist, Vercel (dub1), Vitest.

## Besluitenlog (gebruiker, 19 jul 2026)

| Besluit | Keuze |
|---|---|
| Omvang | **Alles, in fasen** (incl. beide grote verbouwingen) |
| DB-migraties live | **Alles direct**: FK-indexen + initplan-rewrite + policy-consolidatie (met tests vóór/na) |
| Gedrag | **Alle vier akkoord**: snapshot 1×/dag · alleen actieve widgets berekenen · Toekomst eerst-tonen-dan-verfijnen · Overzicht in twee stappen |
| Livegang | **Per fase releasen + meten** (via release-skill) |
| Nog open | React Compiler-besluit → voorleggen bij fase 4 |

## Global Constraints

- API-foutvorm altijd via `lib/api/respond.ts`-helpers; nooit rauwe `error.message` naar de client (ADR 0044).
- Consume, don't recompute: kerngetallen alleen uit canonieke engines/loaders; geen financiële constanten buiten `lib/constants.ts`/`lib/box3-data.ts`.
- Maandgrenzen nooit via `toISOString()` — `localMonthBounds()` (TZ-lint = error).
- Bestanden met niet-ASCII alleen bewerken met Edit/Write-tools, nooit PowerShell Get-/Set-Content.
- Supabase-DDL: remote via MCP `apply_migration` ÉN als bestand in `supabase/migrations/` (drift-preventie).
- Na elke multi-file-wijziging: `npx tsc --noEmit` + relevante `npm run test:run`-paden.
- Vitest: mock-zware batches nooit met `--no-isolate`; bij "No test suite found" → `rm -rf node_modules/.vite/vitest`.
- Architectuurpagina bijhouden: structurele wijzigingen krijgen een ADR (`docs/adr/`) en waar relevant een update in concerns/curatie.
- Commits per taak; release per fase via de release-skill.

## Meetprotocol (na elke fase-release)

1. Chrome DevTools-traces op prod, identieke condities als baseline: mobiel 390×844×3 + 4× CPU + Fast 4G, en desktop 1440×900 zonder throttling; routes /overzicht, /toekomst, /login; ingelogd met REGRESSION_TEST-account.
2. Netwerk-waterfall: aantal API-calls, duplicaten, 4xx.
3. Veld: Speed Insights (na v2-fix per metric) 3–7 dagen na release vergelijken.

**Baseline 19 jul 2026:** /overzicht mobiel LCP 7,5 s / TTFB 4,4 s / CLS 0,94 · /overzicht desktop TTFB 3,0 s · /toekomst mobiel LCP 12,5 s / render-delay 10,5 s / forced reflow 3,55 s · /login mobiel LCP 1,4 s / TTFB 0,9 s · ~37 requests per load, 4× 403 op news-peek, dubbele page-status/postponed-ready/PATCH-calls.

---

# FASE 1 — Meetbaarheid + snelle winsten

## Task 1.1: Speed Insights v2 + service-worker- en proxy-fix

**Files:**
- Modify: `package.json:40` (`"@vercel/speed-insights": "^2.0.0"`)
- Modify: `app/sw.ts:63-69` (CacheFirst-matcher)
- Modify: `proxy.ts:8-12` (matcher)

**Stappen:**
- [ ] `package.json` bumpen naar `^2.0.0`, `npm install`, verifieer `npm ls @vercel/speed-insights` → 2.x.
- [ ] `app/sw.ts`: de CacheFirst-regel voor `request.destination === 'script'` beperken tot gefingerprinte assets: alleen `url.pathname.startsWith('/_next/static/')`; overige scripts vallen buiten de regel (netwerk). Commentaar bij de regel aanpassen (de fingerprint-claim gold niet voor het insights-script).
- [ ] `proxy.ts`: `_vercel` toevoegen aan de negative lookahead van de matcher zodat telemetrie geen `getClaims()`-roundtrip meer triggert.
- [ ] Verificatie: `npx tsc --noEmit`; `npm run build` (Serwist draait post-build); na deploy in prod checken dat het insights-script uit het nieuwe unique-path laadt en er een vitals-POST vertrekt bij tab-blur.
- [ ] Commit: `perf(insights): speed-insights v2 + SW-cache- en proxy-matcher-fix`

## Task 1.2: Registry-split — layout ontkoppelen van deepening-componenten

**Files:**
- Create: `lib/category-deepening-keys.ts` (pure key-/activatielogica, GEEN component-imports)
- Modify: `components/core/category-deepening-registry.ts` (consumeert keys uit lib, houdt component-map)
- Modify: `app/(app)/layout.tsx:28` (import uit `lib/category-deepening-keys`)

**Interfaces:**
- Produces: `getActiveAppKeys(...)` met exact dezelfde signatuur/return als nu (verhuisd, niet gewijzigd); registry re-exporteert voor bestaande consumers.

**Stappen:**
- [ ] Verplaats `getActiveAppKeys` + benodigde key-metadata naar `lib/category-deepening-keys.ts`; registry importeert die en voegt alleen de component-verwijzingen toe. Let op de Turbopack-ChunkLoadError-historie in de registry-header: componenten blijven statisch in de registry (dat was de werkende toestand), alleen de layout raakt de registry niet meer aan.
- [ ] Verificatie: `npx tsc --noEmit`; `npm run build`; daarna bewijs leveren dat `hypotheekplanner-tab`/`investment-holdings-tab` NIET meer voorkomen in `.next/server/app/(app)/overzicht/page_client-reference-manifest.js`.
- [ ] `npm run test:run -- components/core lib/` (bestaande suites groen).
- [ ] Commit: `perf(bundle): layout ontkoppeld van deepening-componenten via lib/category-deepening-keys`

## Task 1.3: /toekomst — kernel-context-dedupe (geen tweede solve meer)

**Files:**
- Modify: `lib/horizon-data-loader.ts` (AOW-rijen + dividend-aggregaat meeleveren in loader-output)
- Modify: `app/(app)/toekomst/page.tsx` (nieuwe velden doorgeven in initialData)
- Modify: `components/app/horizon/horizon-client.tsx:793-858` (mount-refetch)
- Test: bestaande suites rond `use-horizon-fire-sim` + nieuwe unit-test op de skip-conditie

**Stappen:**
- [ ] `loadHorizonData` levert `aowRows` (volledige `aow_leeftijd`-tabel, zit al in serverbereik) en een dividend-aggregaat mee.
- [ ] Mount-effect `loadKernelContext`: volledig overslaan wanneer `initialData.rawProfile` én `initialData.aowRows` aanwezig zijn; bij fallback-pad een structurele-gelijkheidscheck vóór `setKernelRawProfile`/`setAowRows` zodat identieke data geen nieuwe referentie oplevert.
- [ ] `/api/scenarios`-fetch verplaatsen naar het openen van de scenario-picker (lazy) i.p.v. mount.
- [ ] Unit-test: skip-conditie + gelijkheidsguard (geen setState bij deep-equal input).
- [ ] Verificatie: `npx tsc --noEmit`; `npm run test:run -- lib/hooks components/app/horizon`; lokaal: /toekomst laadt zonder de 6 dubbele mount-roundtrips.
- [ ] Commit: `perf(toekomst): kernel-context server-side meegeleverd — dubbele solve en mount-refetch weg`

## Task 1.4: Layout- en page-waterval indammen

**Files:**
- Modify: `app/(app)/layout.tsx:71-78` (getCachedUser), `:225-242` (staleness-batch in hoofdbatch)
- Modify: `app/(app)/overzicht/page.tsx:104` (getCachedUser), `:161-235` (seriële staart parallel aan loaders)

**Stappen:**
- [ ] Beide directe `supabase.auth.getUser()`-aanroepen vervangen door `getCachedUser` (`lib/supabase/cached-user.ts`) zodat React `cache()` dedupliceert.
- [ ] De staleness-queries (layout, tweede batch) opnemen in de hoofd-`Promise.all` (kolommen zitten al in batch 2).
- [ ] In `overzicht/page.tsx`: market-briefing, checkin-read, weekly-snapshot-read en minimized-read in dezelfde `Promise.all` als de vijf loaders hangen (alles hangt alleen van user-id af).
- [ ] Verificatie: `npx tsc --noEmit`; `npm run test:run -- app lib/page-status`; lokale render-check /overzicht.
- [ ] Commit: `perf(ssr): auth-dedupe + seriële stadia geparallelliseerd in shell en overzicht`

## Task 1.5: Client-fetch-hygiëne (na 1.2/1.4 i.v.m. gedeelde bestanden)

**Files:**
- Modify: bron van `/api/news?peek=1`-403 (sidebar-dots/news-consumers) + `POST /api/log-error`-veroorzaker
- Modify: `lib/hooks/use-auto-snapshot.ts` + `app/api/snapshots/auto/route.ts` (server-side dag-gate; besluit: 1×/dag)
- Modify: dedupe dubbele fetches: page-status (2×), postponed-ready (2×), dubbele PATCH `net_worth_snapshots`
- Modify: `components/overview/checkin-banner.tsx` + `components/overview/welcome-guide-banner.tsx` → server-side seeden via props (patroon `PageStatusSeed`), wiring in `app/(app)/overzicht/page.tsx`

**Stappen:**
- [ ] Root-cause de 403 (entitlement-check?) — bij geen recht: niet aanroepen i.p.v. 4× falen; één gedeelde bron voor alle consumers.
- [ ] Root-cause de `log-error`-POST bij elke pageload en fix de onderliggende clientfout.
- [ ] Dag-gate in de snapshots-route (zelfde patroon als daily-open-claim; let op PostgREST 42703-val: `{ count: 'exact' }` zonder select).
- [ ] Unit-tests: dag-gate (tweede call zelfde dag = no-op), seed-pad banners.
- [ ] Verificatie: `npx tsc --noEmit`; relevante vitest-paden; lokale waterfall-check: geen 403's, geen duplicaten.
- [ ] Commit: `perf(client): fetch-hygiëne — 403-lek, log-error, snapshot-daggate, seeds, dedupes`

## Task 1.6: DB-migraties — FK-indexen + RLS-initplan + policy-consolidatie

**Files:**
- Create: `supabase/migrations/<ts>_perf_fk_indexes.sql`
- Create: `supabase/migrations/<ts>_perf_rls_initplan_en_consolidatie.sql` (per tabel initplan-rewrite én consolidatie in één pass)
- Docs: `docs/adr/00xx-rls-performance-sanering.md`

**Stappen:**
- [ ] `get_advisors(performance)` ophalen → exacte lijst (43 FK's, 148 initplan, 269 permissive) als werklijst.
- [ ] FK-index-migratie genereren en toepassen (`apply_migration` remote + bestand lokaal).
- [ ] Per tabel: policies herschrijven naar `(select auth.uid())` en meerdere permissive policies per (rol, actie) samenvoegen met OR — semantiek identiek, gedocumenteerd in de ADR.
- [ ] Verificatie vóór/na: `get_advisors(performance)` (targets → 0), volledige RLS-vitest-suites (huishouden-leaktest!), handmatige leak-queries met het pentest-/regressieaccount, `npm run test:run` breed.
- [ ] Commit: `perf(db): FK-indexen + RLS initplan-rewrite + policy-consolidatie (ADR 00xx)`

## Task 1.7: Referentiedata-cache (AOW + NIBUD)

**Files:**
- Create: `lib/reference-cache.ts` (module-level TTL-cache, 24 u; werkt per lambda-instance — bewust geen `unstable_cache` i.v.m. cookie-gebonden client)
- Modify call-sites: `lib/dashboard-data-loader.ts:209`, `lib/core-data-loader.ts:450`, `lib/fire-target-shared.ts:58`, `lib/horizon-kernel-report/load-input.ts:103`, NIBUD-pad `lib/nibud/reference-data.ts`

**Stappen:**
- [ ] `getAowLeeftijden(supabase)` / `getNibudReferences(supabase)`: eerste call vult de module-cache, daarna TTL-hits; client wordt alleen gebruikt bij miss.
- [ ] Unit-test: tweede call binnen TTL doet geen query (mock-client-teller).
- [ ] Verificatie: `npx tsc --noEmit`; `npm run test:run -- lib/`; AOW-consistentietest (`lib/aow-surface-consistency.test.ts`) groen.
- [ ] Commit: `perf(data): module-TTL-cache voor AOW- en NIBUD-referentiedata`

## Fase 1-afsluiting
- [ ] `npx tsc --noEmit` + `npm run test:run` volledig groen; `npm run build` slaagt.
- [ ] Release via release-skill → prod; meetprotocol draaien; resultaten vastleggen onderaan dit plan.

---

# FASE 2 — Server-datalaag (detail-pass bij fase-start)

- **T2.1 Gedeelde basisdata-laag**: `lib/server-data/base.ts` met `cache()`-gewrapte per-tabel-fetchers (assets, debts, profiles, budgets, bank_accounts, tx-vensters); loaders (dashboard/horizon/lever/will/aandachtspunten/layout) consumeren daaruit. Doel: ~90–105 → ~40–50 queries per /overzicht-load, gedrag identiek (bestaande snapshot-tests als vangnet).
- **T2.2 Transactie-aggregatie naar SQL**: migratie met maand-aggregaat-view/RPC; loaders consumeren aggregaten; ruwe-rijen-fetch alleen nog voor recurring-detectie (kolom-getrimd). Parity-test oud↔nieuw op fixtures. Fixt tegelijk de stille-afkap-bug (queries zonder `.limit()` onder de PostgREST-cap — dit is een rekenfout-risico, apart benoemen in de release-notes).
- **T2.3 Widget-gated berekenen** (besluit: akkoord): backtest/fee-sim/HvB/heatmaps/weekOverview alleen bij actieve widget (prefs zijn vóór de berekeningen beschikbaar); hero krijgt getrimde subset; flight-payload aantoonbaar kleiner.
- **T2.4 Suspense-streaming /overzicht** (besluit: akkoord): hero + hefbomen als eerste blok (voedt uit gedeeld `loadLeverScores`), briefing/widgets als tweede gestreamd blok.
- **T2.5 Loader-opschoning**: `loadWillData` op de basisdata-laag (shared-parameter vervalt), actions-query begrensd; interne waterval `loadDashboardData` van ~8 naar ~4 stadia (rebalance/membership/pot_rules naar hoofdbatch, budgets-lookup uit `budgetNameMap`).
- Afsluiting: release + meting.

# FASE 3 — Bundels & API-auth (detail-pass bij fase-start)

- **T3.1 Auth-pagina's afslanken**: supabase-client dynamisch in submit-handler voor /login, /signup, /forgot-password; eigen route-group met minimale layout (fonts/CSS-impact meenemen).
- **T3.2 Cashflow/overzicht dynamics**: below-the-fold-blokken (CashOverview-detail, CashflowInstellingenBlok, HealthScoreReceipt) achter `next/dynamic`.
- **T3.3 Fonts snoeien**: Andada Pro/Inter alleen bij actief thema; Playfair-preload beperken tot LCP-gewicht.
- **T3.4 Bundle-budget in CI**: `scripts/perf/route-sizes.mjs` op build-manifesten (methode van de audit), faildrempel per route (gzip > 300 kB), aanhaken in CI.
- **T3.5 getClaims-migratie**: 218 API-routes van `auth.getUser()` naar `getClaims()` voor read-paden (mutatie-/admin-routes behouden getUser) — mechanische fanout met subagents, RF-008/C2.
- **T3.6 Verificatie oude kaarten**: de vijf "Klaar om te testen"-Notion-kaarten aftesten en bijwerken.
- Afsluiting: release + meting.

# FASE 4 — Grote verbouwingen (elk een eigen detailplan + ADR)

- **T4.1 ResponsiveShell enkelvoudig**: één render van `children` met CSS-gestuurde chrome i.p.v. dubbele desktop/mobiel-tak (`components/app/shell/responsive-shell.tsx:293-300`). Verwacht: halvering HTML/hydratie + CLS-fix (0,94 → <0,1). Eigen detailplan, ADR, ux-review-agent, vóór/na-trace.
- **T4.2 Kernel naar web worker + Toekomst progressief** (besluit: akkoord): `solveFire` in worker (pure module), eerste paint op server-scalar, verfijning async; scenario-/preset-/MC-runs gededuped en pas bij zichtbaarheid; horizon-client-decompositie hervatten (below-the-fold-secties dynamic). Eigen detailplan.
- **T4.3 React Compiler**: besluit voorleggen aan gebruiker (eigenaar-besluit), bij akkoord aanzetten + memo-sweep-verificatie.
- Afsluiting: release + meting + eindrapport t.o.v. baseline.

---

## Meetlog

| Moment | /overzicht LCP mob | /overzicht TTFB desk | /toekomst LCP mob | CLS /overzicht | Opmerkingen |
|---|---|---|---|---|---|
| Baseline 19 jul | 7,5 s | 3,0 s | 12,5 s | 0,94 | zie audit |
| Na fase 1 (19 jul, deploy 7977e8cf7) | 5,7 s (−24%) | **0,72 s (−76%)** | **4,1 s (−67%)** | **0,00** | /toekomst render-delay 10,5→1,2 s; /toekomst-waterfall 44→29 req; /overzicht-API-burst ~15+4×403 → 9×200; log-error weg; Speed Insights v2 actief (veld-metrics na dagen zichtbaar) |
