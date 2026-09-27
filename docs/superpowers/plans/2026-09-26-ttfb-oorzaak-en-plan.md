# TTFB 4,5 s op ingelogde pagina's — oorzaak en plan

Datum: 26 september 2026 · Status: **diagnose afgerond, nog niets gefixt**
Voortgang: Notion-plankaart [Snelheid — TTFB-plan, oorzaak en stappen](https://app.notion.com/p/3e7f9e8d568a812abe73d294ff865d04) (filter `Release = Snelheid`, negen werkkaarten 0 · A · B1–B3 · C · D1–D2 · E)
Aanleiding: review van Vercel Speed Insights (TTFB p75 ≈ 4,5 s, FCP/LCP daar
vlak boven, INP goed, mobiele CLS 0,40).

## 1. Wat er is gemeten

Bronnen: `vercel metrics vercel.speed_insights.*` (Hobby: 7 dagen), de eigen
`web_vitals`-tabel (60 dagen, ~1.150 TTFB-samples, 13 gebruikers),
`pg_stat_statements`, Supabase performance-advisors, `curl` op publieke routes,
en een statische waterval-analyse van `app/(app)/layout.tsx`.

| Feit | Bewijs |
|---|---|
| Publieke routes zijn snel: `/`, `/login` ≈ 150 ms uit de CDN-cache; `/api/health` 1,07 s koud, 0,4–0,5 s warm. | curl, 26 sep |
| Lichte routes onder de `(app)`-layout zijn óók snel: `/nieuws` 1,3 s, `/berichten` 1,1 s, `/overzicht/belasting` 1,1 s, `/mijn` 1,7 s (p75, 21 dagen). | `web_vitals` |
| Traag zijn precies de routes met een zware pagina-loader: `/overzicht` 5,5 s, `/overzicht/budget` 3,4 s, `/toekomst` 3,1 s, `/overzicht/bezittingen` 3,0 s. | `web_vitals` |
| **Van ~800 `/overzicht*`-loads landen er 163 in de bucket 3000–3250 ms** — vier keer de buurbuckets. Tientallen routes hebben een p75 van exact 3013–3080 ms; p95's clusteren op ~6170. | histogram `web_vitals` |
| Regressie: aandeel `/overzicht`-loads met TTFB > 3,3 s ging van 9–13 % (eind aug) naar 42–46 % (weken 14 en 21 sep). p50 `navigate` 2,75 → 4,44 s. | `web_vitals` per week |
| Geen populatieverschuiving: mobiel-aandeel 73 % vóór en 74 % ná 14 sep. | `web_vitals` |
| `reload` is sneller dan `navigate` op `/overzicht`: p50 1,9 s vs 3,1 s. | `web_vitals` |
| Database is niet de bottleneck: advisors alleen INFO (5 FK's zonder index, 2 dubbele policies), geen RLS-initplan-waarschuwing. Eén hete query: `SELECT date FROM transactions WHERE amount > $1 … ORDER BY date` — 6.198 calls, gem. 105 ms, max 5,6 s. | advisors, `pg_stat_statements` |
| CPU is niet de bottleneck: tax-optimizer 1–4 ms per test, kernel-run "13–25 ms" (`lib/horizon-kernel/marktcheck.ts:37`). | vitest verbose |
| Tot de eerste byte: **5 opeenvolgende rondes (1 auth + 4 DB), ~29 queries**, allemaal in `app/(app)/layout.tsx` buiten elke `<Suspense>`. | waterval-analyse, zie §3 |

Niet gemeten (geblokkeerd): een ingelogde trace in productie. Het uitlezen van
`REGRESSION_TEST_*` uit `.env.local` is door de permissie-classifier
geweigerd; functieduur/cold-start-cijfers per route vereisen Observability
Plus (Pro-plan).

## 2. Oorzaken, gerangschikt

### O1 — De service worker serveert na 3 s de vorige HTML (masker + stale data)

`app/sw.ts:58-66`: navigaties lopen via `NetworkFirst({ networkTimeoutSeconds: 3 })`.
Serwist cachet élke 200-navigatieresponse in `pages-cache`, ongeacht
`Cache-Control`. Doet de server er langer dan 3 s over, dan krijgt de gebruiker
de **gecachte pagina van de vorige keer** en meet de browser exact 3,0 s TTFB.
Dat verklaart de piek op 3000–3250 ms (≈ 20–25 % van alle loads, elke week).

Gevolgen, buiten de metriek om:
- **Verouderde cijfers** op een financiële pagina zonder dat de gebruiker het
  ziet — in een kwart van de loads.
- **Privacy/AVG**: gerenderde HTML met vermogens- en transactiecijfers blijft
  in de SW-cache op het apparaat staan; uitloggen wist `pages-cache` niet (het
  wis-script in `components/app/head-scripts.tsx:49` draait alleen in `next dev`).
- De 3-secondenband **verbergt** hoe traag de server werkelijk is; de
  Speed-Insights-cijfers zijn dus eerder te optimistisch dan te somber.

### O2 — De `(app)`-layout houdt de hele shell tegen

`app/(app)/layout.tsx:131-516` wacht achter elkaar op:

1. `getCachedUser` → `auth.getUser()` — 1 auth-ronde (`lib/supabase/cached-user.ts:10`)
2. `Promise.all` van 14 queries (`:147-277`) — 1 ronde
3. `loadLeverScores` (`lib/lever-scores-loader.ts`) — 2 rondes: batch van 6 (`:688`) → `loadBudgetBasis` 3 RPC's (`:862`) → soms `getCurrentMonthSplits` (`:974`)
4. `loadWelcomeGuideSeed` (`:516`) — 1 ronde, 5 queries (alleen zolang de gids niet is afgesloten)

Pas daarna kan de shell én de `loading.tsx`-skeleton van de pagina de deur uit.
De vijf `<Suspense>`-grenzen in de layout (`:672`, `:727`, `:733`, `:738`,
`:741`) staan om client-only onderdelen; de hoofdbatch, de leverscores en de
gids-seed staan erbuiten. Stappen 2, 3 en 4 zijn onderling **onafhankelijk**
(de Explore-analyse: 3 heeft alleen de client en de cookie nodig, 4 alleen
`user.id` en een profielvlag) maar draaien sequentieel. Alleen de
redirect-checks (`blocked_at`, `onboarding_completed`, `:286-292`) hebben het
profiel écht nodig vóór de render.

Kosten van dit blok: ~1 s (de lichte routes bewijzen dat). Niet het grootste
stuk, wél het stuk dat élke route raakt en waar `loading.tsx` niets aan doet.

### O3 — `/overzicht` is het instappunt en vangt cold start + token-refresh

`/overzicht` is de landing na login en de PWA-start-URL. De eerste request van
een sessie betaalt: cold start van de grote server-bundel (kernel + loaders +
optimizer; `/api/health` is al 0,6 s trager koud), een JWKS-/token-refresh in
de proxy (`lib/supabase/proxy.ts:86`), en pas dan de layout-waterval. Dat past
bij `navigate` 3,1 s vs `reload` 1,9 s en bij de tweede bult op ~6 s.

**Dit is de best passende verklaring, geen bewezen feit.** Het is precies het
deel dat alleen met een ingelogde trace of met eigen instrumentatie (§4, stap 0)
hard te maken is.

### O4 — Dubbel werk en één hete query (secundair)

Uit de waterval-analyse:
- `layout.tsx:194`: ruwe transactierijen over 3 maanden (`limit 1000`) op élke
  route, alleen voor fase-detectie; overlapt met het maandaggregaat.
- 4× RPC `tx_month_aggregate` per request over grotendeels hetzelfde venster
  (`lib/server-data/tx-aggregates.ts:419`, 3× `lib/budget-realized.ts:320`).
- 5× `app_settings` verspreid over layout en page; 2× `investment_holdings`
  in dezelfde batch (`lib/account-status.ts:144` + `layout.tsx:267`); 3× `profiles`.
- `getEarliestIncomeDate` (`lib/server-data/base.ts:298-315`) is de hete
  query uit `pg_stat_statements` (gem. 105 ms).

### O5 — CLS op mobiel (los van TTFB)

Per Speed-Insights-attributie: `/toekomst` 2×2-KPI-strip
(`components/app/horizon/horizon-client.tsx:6312`), `/nieuws` de `section.mt-4`
in `components/berichten/nieuws-only-client.tsx:584`, `/overzicht/budget` een
knop over de volle breedte. Vermoedens uit de code, nog niet bevestigd met een
trace.

### Wat de regressie sinds 14 sep verklaart

Tussen 7 en 22 sep kwamen er in het laadpad geen extra `await`s bij, maar de
bundel en de batches groeiden (`lever-scores-loader.ts` +482 regels incl.
tax-optimizer-import, `dashboard-data-loader.ts` +199, plan-stoplicht + kernel
in de layout op 15 sep, ADR 0177 op 22 sep). Eén aanwijsbare schuldige is er
niet; de zwaardere bundel (O3) en de dikkere batches (O2/O4) tellen samen op.
Stap 0 hieronder geeft de splitsing.

## 3. Wat het níét is

- Niet het netwerk/CDN (publieke routes ~150 ms).
- Niet de database-engine (advisors schoon, geen RLS-initplan, queries 5–20 ms
  behalve de ene van 105 ms).
- Niet rekenwerk (optimizer en kernel in milliseconden).
- Niet de regio-afstand dub1 ↔ Frankfurt (5 rondes × ~25 ms = ~125 ms).
- Niet de populatie (mobiel-aandeel gelijk gebleven).

## 4. Plan

Vier werkstromen; A en B zijn no-regret en kunnen direct, C wacht op de meting
uit stap 0, D staat los.

### Stap 0 — Meten zonder Pro-plan (`kleine-aanpassing`, hoofdthread)

Voeg in `app/(app)/layout.tsx` `performance.now()`-markers toe rond de vijf
stappen uit O2, plus een module-level `warm`-vlag (cold start ja/nee), en
geef ze via een klein client-component door aan `/api/web-vitals` als extra
metrics (`SRV_AUTH_MS`, `SRV_BATCH_MS`, `SRV_LEVER_MS`, `SRV_GUIDE_MS`,
`SRV_COLD`). Zo landt de server-opsplitsing in dezelfde tabel als de TTFB en
is O3 na een week hard of weerlegd. Geen nieuwe tabel, geen migratie.

Alternatief dat vandaag al kan: log in in de open Chrome-tab (isolated
context `perf`) of geef de testcredentials vrij; dan doe ik een koude en een
warme trace op `/overzicht` en `/nieuws`.

### A — Service worker: geen stale HTML meer (`bug-fix`, fast-path + security-lens)

1. Navigaties: `NetworkFirst` met timeout vervangen door `NetworkOnly` mét een
   Serwist-`fallbacks`-entry naar een statische `/offline`-pagina. Offline
   blijft dan werken (de shell, niet de cijfers), maar er komt nooit meer een
   verouderde ingelogde pagina uit de cache.
2. Bij uitloggen `pages-cache` wissen (`caches.delete`) — ook voor de al
   uitgerolde SW's bij bestaande gebruikers.
3. Bewijs: de 3-secondenband in `web_vitals` verdwijnt binnen een week.
   Bijvangst: de TTFB-cijfers worden eerst *slechter* zichtbaar — dat is de
   echte servertijd die nu boven water komt.

Security-specialist-run verplicht (gecachte accountdata op het apparaat).
Besluit vooraf nodig: wil het product offline-weergave van de laatste stand?
Zo ja, dan is dat een bewuste functie met een "laatst bijgewerkt"-label, geen
bijwerking van een timeout.

### B — Layout: kortere waterval (`refactor`, geen gedragswijziging)

Volgorde van klein naar groot; elke stap apart meetbaar met stap 0.

1. **Parallelliseren** (klein, ~1 bestand): start `loadLeverScores` en
   `loadWelcomeGuideSeed` vóór de `await` van de hoofdbatch; profiel/assets/
   debts delen ze toch via `cache()`. Trek `getRealizedBudgetAmounts` in de
   `:688`-golf van de lever-loader. Verwacht: 5 rondes → 2–3.
2. **Auth-ronde schrappen**: `getClaims()` (lokale JWT-check, 0 rondes) in de
   layout waar nu `getUser()` staat; de proxy verifieert al. Verwacht: −1 ronde.
3. **Streamen**: sidebar-signalen, leverscores en gids-seed achter een eigen
   `<Suspense>`; de layout wacht alleen nog op auth + profiel (voor de twee
   redirect-checks). `ResponsiveShell` krijgt dan promises/async children in
   plaats van kant-en-klare `sidebarMetrics`. Dit is het grootste stuk werk en
   de grootste winst: de shell én `loading.tsx` komen na ~1 ronde.

### C — Instappunt `/overzicht` (na stap 0)

Pas kiezen als de meting zegt waar het zit:
- Cold start dominant → bundel van de `(app)`-route-groep verkleinen
  (`next build`-output bekijken; kernel/optimizer lazy importeren waar ze
  niet op het layout-pad horen), en/of één warm-houder.
- Auth dominant → token-refresh en JWKS-cache in de proxy bekijken.
- Waterval dominant → B is al voldoende.

Regio `fra1` naast Supabase is een gratis kleine winst, maar geen oplossing.

### D — Opruimen dubbel werk + hete query (`refactor`/`schemawijziging`)

- `layout.tsx:194` vervangen door het maandaggregaat (ADR 0050); 4× RPC → 1×;
  `app_settings` in één `.in('key', …)`; `investment_holdings` en `profiles`
  ontdubbelen.
- Index voor `getEarliestIncomeDate` (`transactions (user_id, date) WHERE amount > 0`)
  na een `EXPLAIN` op de echte query — via `schemawijziging`.

### E — CLS (`bug-fix`, fast-path per bestand)

Eerst een trace per pagina om de drie vermoedens te bevestigen, dan per
bestand: hoogte reserveren voor content die na de fetch verschijnt.

## 5. Doel en bewijs

- TTFB p75 < 1,8 s app-breed en < 2,5 s op `/overzicht` (Google "needs
  improvement"-grens; "goed" is 0,8 s — dat vraagt C).
- Geen piek meer op 3000–3250 ms in `web_vitals`.
- LCP p75 < 2,5 s op mobiel; CLS < 0,1.
- Nameting: dezelfde queries als deze diagnose (`vercel metrics … --group-by
  route` en de `web_vitals`-week-query), minstens één week na uitrol.

## 6. Steekproef-voorbehoud

~10 loads per dag, 13 gebruikers. Richtingen zijn betrouwbaar (de patronen
zijn week na week gelijk); losse p75's per route met n < 20 niet.
