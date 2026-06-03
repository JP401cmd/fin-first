# Huishouden-integratie — Volledig bouwplan (voor terminal-sessie)

> **Doel van dit document:** een zelfstandig leesbaar bouwplan dat een verse Claude Code-sessie in de terminal kan uitvoeren, zónder de context van de plansessie. Bevat de stack-context, wat er al gebouwd is (niet opnieuw doen), en de resterende stappen per onderdeel.

---

## ✅ STATUS (3 jun 2026) — fundament + alle 6 domeinen GEBOUWD

> Onderdeel 1 (rest) + Onderdelen 2-6 zijn uitgevoerd en geverifieerd.
>
> **Fundament:** write-stamp trigger (`stamp_household_id`), transactionele `household_leave()` RPC, `household_partner_items` uitgebreid met `transactions`+`income`, `life_events`/`goals` shared-RLS + ownership-kolommen. TS: `tf_perspective`-cookie + `getServerPerspective()`, `OwnershipBadge` 3-staten, `formatOwnershipSubline`, `dailyExpensesByPerspective`, `loadPerspectiveTransactions`. ⚠️ `perspective-loader` is **dual-use** (géén React `cache`).
> **Domeinen:** bezittingen, schulden, cashflow+budgetten, belasting (incl. `lib/household-tax.ts`), FIRE (incl. `lib/household-projection.ts`) — alle via de perspectief-loaders; shared data-loaders kregen een optionele `perspective`-param.
> **Verificatie:** simulated-JWT RLS-leaktest PASS · `tsc` 0 source-fouten · 2614/2614 real-tree vitest groen · advisors schoon.
>
> **⚠️ Plan-correctie:** §6 nam aan dat `life_events` al `ownership`/`household_id` had — dat was NIET zo; nu toegevoegd.
>
> **Resterend (extra surfaces, geen kern-6):** dashboard/overzicht-LANDING + widgets, AI-context + briefing, transactie-import-eigendom, e-mailbezorging uitnodigingen, income_ratio één-bron tussen cashflow & FIRE.

---

## 0. Context die je MOET weten voordat je bouwt

**App:** TriFinity — Nederlandse personal-finance app. Next.js 16 (App Router, React 19), Supabase (Postgres), Tailwind v4. Filosofie "Geld is opgeslagen tijd" → bedragen ook tonen als vrijheidstijd.

**Doel feature:** een gebruiker kan een **partner met een eigen account** koppelen; de hele app kent 3 perspectieven **eigen / huishouden / partner**; op elke bezitting/schuld/transactie/belastingpost is zichtbaar **van wie** het is; dit werkt door in cashflow, belasting en toekomst (FIRE).

**Vastgelegde beslissingen (niet heroverwegen):**
1. **Privacy:** instelbaar per categorie (vermogen/schulden/budgetten/transacties/inkomen) met niveaus `full`/`totals`/`hidden`; default `totals`. **Gedeelde items zijn altijd wederzijds volledig zichtbaar.** Partner-persoonlijke items zijn afgeschermd volgens diens privacy-instelling.
2. **Eigendom:** binair `personal`/`shared` + split-modus. **Géén** per-item eigendoms-%. "Van wie" = `personal`→`user_id` (eigen vs partner), `shared`→gezamenlijk.
3. **2 leden per huishouden** (stel/koppel).
4. **Extra scope (meenemen):** koppel-lifecycle/ontkoppelen, dashboard+widgets, AI+briefing, transactie-import-eigendom.

### ⚠️ Kritieke architectuur-feiten (anders bouw je verkeerd)
- **Auth = Supabase Auth** is canoniek. RLS gebruikt `auth.uid() = user_id`. Data-loaders leunen op RLS (bv. `lib/assets-data-loader.ts` queryt `from('assets').select('*')` **zonder** `.eq('user_id')`). De `src/lib/auth.ts` (better-auth + Drizzle) is **vermoedelijk dode starter-scaffolding** — gebruik die niet.
- **Migratie-drift:** de lokale map `supabase/migrations/*.sql` is **NIET** de bron van waarheid. De remote DB heeft andere migratie-namen/timestamps en diverse lokale bestanden zijn nooit toegepast. **Werkwijze:** nieuwe DDL via `mcp__supabase__apply_migration` (idempotent, `IF NOT EXISTS`/`CREATE OR REPLACE`). **Verifieer altijd** bestaande kolommen/functies/policies met `mcp__supabase__execute_sql` op `information_schema`/`pg_proc`/`pg_policies` vóór je iets bouwt. Draai `mcp__supabase__get_advisors(security)` na DDL.
- **De feature is ~80% gebouwd maar was "hol"**: UI/API's bestonden, maar partnerdata stroomde niet door (geen huishoud-RLS) en server-loaders waren perspectief-blind. Het meeste werk = **consolideren op één fundament + correctheid + "van wie"-badges**, niet greenfield.

### Verificatie-commando's
- Tests: `npx vitest run <pad>` (vitest, `globals:true` maar tests importeren toch `{ describe, it, expect } from 'vitest'`; alias `@`→repo-root).
- Typecheck: `npx tsc --noEmit`. ⚠️ **Master is niet tsc-clean**: er zijn pre-existing type-fouten in test-fixtures (`*.test.ts(x)` — mock-typings, dubbele `asset_type`, een test zonder vitest-globals). Filter op je eigen bestanden: `npx tsc --noEmit 2>&1 | Select-String "lib/household"`. Een schone build is `next build`.
- DB-introspectie: `mcp__supabase__execute_sql`, `mcp__supabase__list_migrations`, `mcp__supabase__list_tables`.

---

## 1. Bestaande infrastructuur — NIET opnieuw bouwen

**DB (bestaat remote):**
- Tabellen `households`, `household_members` (UNIQUE(household_id,user_id), role owner/member, `privacy_settings` jsonb), `household_invitations` — met werkende RLS.
- Helpers (SECURITY DEFINER): `user_household_id()`, `user_owned_household_id()`, `household_partner_totals()`.
- Op **alle** financiële tabellen: `ownership ('personal'|'shared')` + `household_id`. `debts.partner_split_pct` bestaat. `goals.ownership/household_id` bestaat. `profiles.selected_perspective` + `household_id` bestaan.

**Pure logica — `lib/household-data.ts`:** `computeSharePct`, `computePerspectiveNetWorth`, `filterByPerspective`, `applyPrivacyFilter`, `normalisePrivacySettings`, `PrivacySettings`/`PrivacyLevel`, `DEFAULT_PRIVACY_SETTINGS`.

**Client-perspectief:** `components/app/perspective-provider.tsx` (localStorage + PATCH naar `profiles.selected_perspective`) + `perspective-switcher.tsx`. Consumenten: `assets-client`, `budgets-client`, `core/debts/page`, `horizon-client`, `belasting/page`, widgets `huishouden-*`.

**API's:** `/api/perspective` (GET/PATCH) en `/api/household/{data,status,invite,accept,leave,privacy,partner-privacy,settings,box2,box3,fire-projections}`.

**Méér klaar dan je zou denken (hergebruik, niet herbouwen):**
- `app/api/household/box3/route.ts` doet al **échte gecombineerde Box 3** over beide partners + `optimizePartnerAllocation`.
- `app/api/household/box2/route.ts` doet al per-persoon + gecombineerd.
- `app/api/household/fire-projections/route.ts` doet al gecombineerde + per-partner FIRE met income_ratio uit transacties + per-schuld split.
- `lib/dashboard-data-loader.ts` (~regel 1255-1330) bouwt al `householdOverrides`/`partnerOverrides` via `household_partner_totals()`.
- `components/app/budgets-client.tsx` toont al `OwnershipBadge` + per-partner split (~regel 2184-2224).

---

## 2. AL GEBOUWD in deze sessie (3 jun 2026) — applied/werkend, NIET overdoen

> Deze wijzigingen staan al in de live DB resp. in de working tree (nog niet gecommit). Controleer ze, bouw erop voort.

**DB (toegepast via `apply_migration` — `households`/`household_members` hadden 0 rijen, dus risicovrij):**
1. **Fase 0 — live bug fix.** `household_members.privacy_settings` jsonb (default alle `totals`) + `get_partner_privacy_level(uuid,uuid,text)` (met `SET search_path=public`) + UPDATE-policy "Users can update own privacy settings". → **Fixte een productie-bug**: `app/api/household/accept/route.ts:104` insertte de ontbrekende kolom → uitnodiging accepteren faalde volledig. (Lokaal bestand `supabase/migrations/20260308000001_add_household_privacy_settings.sql` is bijgewerkt met de search_path-fix.)
2. **Shared-SELECT RLS** op 8 tabellen (`assets, debts, budgets, transactions, bank_accounts, valuations, net_worth_snapshots, recurring_transactions`): policy `"Household members can view shared <t>"`, `FOR SELECT TO authenticated USING (ownership='shared' AND household_id IS NOT NULL AND household_id = user_household_id())`. Additief (PERMISSIVE OR), strikt op `ownership='shared'` zodat persoonlijke partner-rijen NIET lekken.
3. **RPC `household_partner_items(p_category text) RETURNS jsonb`** (SECURITY DEFINER, search_path) voor `assets`/`debts`/`budgets`: geeft partner-PERSOONLIJKE items met privacy server-side toegepast (`full`→itemized, `totals`→1 aggregaatrij met `_aggregated:true`, `hidden`→`[]`). Buiten huishouden → `[]`.

**TS (type-clean, 9 vitest-tests groen):**
4. `lib/household-data.ts` uitgebreid: `Perspective` + `Provenance` types, `deriveProvenance(item, currentUserId)`, `debtShareFraction(debt, viewerId, householdShareFraction)`, en een **`'partner'`-tak** + optionele `partnerId?`-param in `computePerspectiveNetWorth`. Dode `PerspectiveData`-interface verwijderd. Tests: `lib/household-data.test.ts`.
5. **`lib/household/perspective-loader.ts`** (NIEUW) — de unified loader:
   - `loadPerspectiveContext(supabase)` → `{ userId, hasHousehold, householdId, partnerId, partnerName, splitMode, customSplitPct, primaryPayerId, mySharePct, partnerPrivacy }`.
   - `loadPerspectiveData(supabase, perspective)` → `{ perspective, context, assets, debts, budgets }` waarbij elk item `_provenance` ('eigen'|'partner'|'gezamenlijk') + `_myShareFraction` (0-1) krijgt; combineert de shared-RLS-query (eigen + alle gedeeld) met de `household_partner_items`-RPC (partner-persoonlijk).
   - ⚠️ **Runtime I/O nog niet end-to-end getest** (geen gekoppelde accounts). Eerste taak hieronder: dit verifiëren.

---

## 3. Resterende build — per onderdeel (afhankelijkheids-geordend)

### Onderdeel 1 (rest) — fundament afmaken

**1a. Verifieer het read-fundament end-to-end (DOE DIT EERST).**
Maak twee testaccounts, koppel ze (uitnodigen→accepteren werkt nu), voeg eigen + gedeelde + partner-persoonlijke assets/debts toe. Verifieer per privacy-niveau (`full`/`totals`/`hidden`):
- `loadPerspectiveData` levert correcte sets per perspectief.
- **Negatieve RLS-leaktest:** in eigen-perspectief mogen partner-PERSOONLIJKE rijen NIET zichtbaar zijn / niet direct queryebaar; gedeelde items WEL voor beide.
- Kan ook met gesimuleerde JWT in SQL: `SET request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}'; SET role authenticated;` dan queries draaien (binnen één transactie, ROLLBACK na afloop — vervuil de DB niet).

**1b. Cookie `tf_perspective` — perspectief naar de server.**
In `components/app/perspective-provider.tsx` `setPerspective()`: zet naast localStorage + PATCH ook cookie `tf_perspective` (path=/, ~1 jaar). Lees in server-loaders via `cookies()` uit `next/headers`. Roep `router.refresh()` na een switch voor zachte re-render. Doel: `/core`, `/dashboard`, `/overzicht` renderen server-side het juiste perspectief (geen "eigen-data-flits"). Maak een helper `getServerPerspective()` (leest cookie, valideert tegen `'personal'|'household'|'partner'`, default `'personal'`).

**1c. Write-path trigger — stempel `household_id` server-side.**
BEFORE INSERT/UPDATE-trigger op `assets/debts/budgets/transactions/bank_accounts/recurring_transactions`: als `NEW.ownership='shared'` → `NEW.household_id = user_household_id()`; als `'personal'` → `NEW.household_id = NULL`. Vertrouw client-input nooit. (Bestaande `OwnershipToggle` + forms blijven de UI.) Migratie via `apply_migration`.

**1d. `household_leave()` RPC (transactioneel).**
Bij verlaten/scheiding: gedeelde items van het huishouden → terug naar `ownership='personal'` van de **aanmaker** (`user_id`), `partner_split_pct` wissen, `household_id` → NULL; `household_members`-rij verwijderen; `profiles.household_id`/`selected_perspective` resetten. Historie (valuations/snapshots) intact. Eenmalige cleanup van bestaande "zombie" shared-rijen zonder geldig huishouden. ⚠️ **[BESLISSING]** attributie naar aanmaker (vs achterblijver) — bevestig met gebruiker. Herbouw `app/api/household/leave/route.ts` om deze RPC aan te roepen.

**1e. RPC uitbreiden** met categorieën `transactions` + `income` (nodig voor cashflow-domein; nu alleen assets/debts/budgets).

**Cross-cutting (samen met de eerste domeinen): `OwnershipBadge` 3-staten.**
Breid `components/app/ownership-toggle.tsx` `OwnershipBadge` uit naar 3 staten — **behoud de naam + bestaande `data-testid="ownership-badge-shared"`** (67 call-sites/tests). Props bv. `{ provenance: Provenance, partnerName?, perspective?, compact? }`:
- `gezamenlijk` → Users-icon, "Gezamenlijk" (kern-tint, huidige shared-stijl)
- `eigen` → render **null** in `personal`-perspectief (ruis); anders "Eigen"
- `partner` → partnernaam ?? "Partner" (wil/horizon-tint)
Toon altijd in huishouden-view; toon `gezamenlijk` ook in eigen/partner. Plaats inline op de naam-rij van de kaarten.
Plus helper `formatOwnershipSubline(item, perspective, sharePct)` in `lib/household-data.ts` voor de "jouw aandeel"-subregel. En: `calculateFreedomTime` moet de **perspectief-correcte `dailyExpenses`** krijgen (eigen=mijn dag-uitgaven, huishouden=gecombineerd) — expose `dailyExpensesByPerspective`.

### Onderdeel 2 — Bezittingen
- Totalen per view via `computePerspectiveNetWorth` (hergebruik, incl. nieuwe `'partner'`-tak). eigen = eigen-persoonlijk + `shared × mijnfractie`; huishouden = alles vol; partner = partner-persoonlijk (gated) + `shared × (1−mijnfractie)`.
- `components/core/assets-client.tsx`: vervang de bespoke ownership-query + privacy-fetch door `loadPerspectiveData(supabase,'...').assets`. In de `byType`-groepeer-loop: perspectief-aangepast sommeren (`ownership==='shared' && perspective!=='household' ? value × _myShareFraction : value`). `net_worth_inclusion_pct` toepassen **vóór** de split.
- `lib/assets-data-loader.ts`: wordt dunne wrapper die `loadPerspectiveData` gebruikt voor de itemset, behoudt sparkline/kpi/connection-decoratie.
- `OwnershipBadge` + "jouw aandeel"-subregel op `VermogenAssetCard` (naam-rij). `CategoryGroupHeader` houdt zijn `total: number`-signature; de client berekent het perspectief-totaal.
- Edge: partner `assets:hidden` → partner-persoonlijk weg, shared blijft (toon `PrivacyHiddenNotice`); `one_carries_all` niet-betaler → shared draagt €0 maar **toon de items wel**.

### Onderdeel 3 — Schulden
- Symmetrisch; gebruik `debtShareFraction` (nieuw) voor per-schuld `partner_split_pct`. `computePerspectiveNetWorth` past dit al toe.
- `app/(app)/core/debts/page.tsx`: query → `loadPerspectiveData().debts`. `OwnershipBadge` + subregel op `VermogenDebtCard`.
- **Aflosroute/KPI:** `simulatePayoff`/`debtProjection` (lib/debt-data.ts) **altijd huishoud-gescoped** (volledige balansen — fractioneel amortiseren is fiscaal onzin). Alleen kop-cijfers in eigen-view schalen; label "Aflosroute toont het hele huishouden."

### Onderdeel 4 — Cashflow + Budgetten (lastigste; echte nieuwe data-as)
- Transacties zijn per-persoon (`transactions.user_id`+`ownership`); `lib/cashflow-data-loader.ts` hard-filtert nu `.eq('user_id', user.id)` → **signature-wijziging** naar perspectief-aware (drop de filter, respecteer `ownership`), of vouw de transactie-fetch in `loadPerspectiveData` (breid RPC uit, 1e). Splits: eigen = mijn txns + mijn aandeel shared; huishouden = beide (shared één keer, dedup op id); partner = partner-persoonlijk (gated op `transactions`+`income`) + partner-aandeel shared.
- **income_ratio unificeren:** standaardiseer op **transactie-inkomen** (val terug op income-budget). Nu wijken `/api/household/data` (budget) en `fire-projections` (transactie) af. Centraliseer in `loadPerspectiveContext`.
- **Budgetten:** gedeelde envelop = één huishoud-envelop; besteding = som van **beide** partners' transacties tegen de volledige `default_limit`. ⚠️ **RLS-check:** zijn partner-persoonlijke transacties tegen een gedeeld budget zichtbaar? Zo niet → gedeelde-envelop-besteding wordt ondergeteld; neem dit mee in de shared-SELECT-scope of via een RPC. `budgets-client.tsx` heeft de per-partner-breakdown al — behouden, voeden uit fundament.
- **Forecast:** `buildForecast`/`recurringPerMonth` (lib/cashflow-forecast-math.ts) ongewijzigd; inputs perspectief-scopen (recurrings via `ownership`, `bank_accounts` startsaldo via `ownership`). Vaste lasten idem. Badge provenance op transactie-/vaste-lasten-rijen.

### Onderdeel 5 — Belasting
- **Box 3:** `app/api/household/box3/route.ts` doet al gecombineerde Box 3 + `optimizePartnerAllocation`; `calculateBox3` (lib/box3-data.ts) doubelt al `heffingsvrij`+`schuldendrempel` bij `hasPartner`. **Geen engine-wijziging.** Werk: (1) databron → `loadPerspectiveData` (unie mijn-persoonlijk ∪ partner-persoonlijk ∪ shared, shared één keer); (2) toon "optimale verdeling spaart €X t.o.v. ieder apart"; (3) perspectief-correcte `dailyExpenses`.
- **Privacy:** Box 3 heeft minimaal **totalen per Box-3-categorie** nodig (spaargeld/beleggingen/schulden) → voeg een `tax-totals`-aggregatie toe (`aggregatePartnerBox3Totals()`) i.p.v. één groottotaal. Partner `hidden` → **graceful degradation**: val terug op single-person (`hasPartner:false`) + melding "Vraag je partner om 'totalen' te delen". **Nooit** stil `hasPartner:true` zonder partner-vermogen.
- **Box 1:** per-persoon. In huishoud-view **twee `JaarruimteCard`s** naast elkaar (`computeJaarruimte` per-persoon). **Box 2:** per-persoon AB/DGA (`/api/household/box2` doet dit al) — databron naar fundament.

### Onderdeel 6 — Toekomst / FIRE
- **Aanpak: twee projecties draaien + mergen** (niet een 2e persoon in `runUnifiedProjection` proppen). `fire-projections/route.ts` doet de 3-inputs-aanpak al.
- **Dual-AOW zonder engine-wijziging:** modelleer beide AOW/pensioen-stromen als `SimCashflow`-inkomensregels in `runUnifiedProjection.cashflows` — mijn AOW (fromAge=mijn AOW-leeftijd) + partner-AOW (omgerekend naar mijn leeftijd-as via DOB-offset). `lifeEventsToCashflows`+`computeAowMonthly`/`annuitizePension` bestaan. Combined gebruikt oudste DOB als hoofd-as.
- **Upgrade:** schakel de combined projectie van het lichte `computeFireProjection` naar `runUnifiedProjection` (zelfde nauwkeurigheid als solo-Horizon).
- **Gedeelde vs persoonlijke events/goals:** `life_events`/`goals` hebben `ownership`. Gedeeld event (kind) → volledige kosten in combined; persoonlijk → alleen in die partner + combined (niet dubbel). Goals default persoonlijk, optioneel gedeeld.
- **Nieuw:** `buildHouseholdProjectionInput()` in `lib/horizon-data-loader.ts` (of `lib/household-projection.ts`) — heeft partner-DOB nodig (toevoegen aan members-fetch). Edge: partner-DOB/-assets hidden → degradeer + melding. `components/app/household-fire-section.tsx` rendert het meeste al.

### Extra surfaces (na fundament)
- **Koppel-lifecycle/ontkoppelen:** §1a (verificatie) + §1d (`household_leave`). **E-mailbezorging uitnodigingen ontbreekt** (`src/lib/auth.ts` logt naar console) — minimaal melden, idealiter mailprovider koppelen.
- **Dashboard/overzicht + widgets:** `dashboard/page.tsx` (server) leest `tf_perspective`-cookie → `loadPerspectiveData`; widgets `netto-vermogen`, `huishouden-vergelijking`, `huishouden-activiteit` perspectief-correct voeden. `DashboardData`-mock in `components/widgets/draggable-widget-grid.test.tsx` bijwerken.
- **AI + briefing:** AI-context-builders (`lib/ai/context/*`) + briefing-engine (`lib/briefing/*`) krijgen het perspectief mee (default huishouden indien gekoppeld).
- **Transactie-import eigendom:** `/core/cash/import` (MT940/CSV/OFX) → eigenaar/`ownership`-keuze (default = eigenaar van de rekening; gedeelde rekening → default `shared`, per-transactie overrideable).

### Gedocumenteerd maar nog niet uitgewerkt (kandidaten vervolg)
Berichten/notificaties (partner-events), rapportages+export (per-perspectief, aangifte per partner), realtime cross-account sync, onboarding-koppeling, instellingen-hub voor huishoudbeheer, sovereignty-niveau (per-persoon houden).

---

## 4. Signature-ledger (hergebruiken vs wijzigen)
- **Ongewijzigd hergebruiken:** `computePerspectiveNetWorth` (heeft nu `'partner'`-tak), `computeSharePct`, `applyPrivacyFilter` (voeg `tax-totals`-modus toe), `calculateBox3`/`optimizePartnerAllocation`, `computeJaarruimte`, `simulatePayoff`/`debtProjection` (alleen volledige balansen), `buildForecast`, `runUnifiedProjection`/`computeFireProjection` (per-input + AOW-als-cashflow).
- **Signature-wijziging:** `loadCashflowData` (perspectief-aware).
- **Vervangen door fundament:** bespoke ownership-filtering in `assets-client`/`debts-page`/`budgets-client` + round-trips naar `/api/household/{data,partner-privacy}`.
- **Nieuw (deels al gedaan):** `lib/household/perspective-loader.ts` ✅, RPC `household_partner_items` ✅ (uitbreiden), `household_leave`, write-trigger, cookie-helper, `buildHouseholdProjectionInput`, `debtShareFraction` ✅, `deriveProvenance` ✅, `formatOwnershipSubline`, `aggregatePartnerBox3Totals`.

## 5. Verificatie (per stap + eind)
- `npx vitest run lib/household-data.test.ts` (bestaat) + nieuwe tests per pure helper.
- Twee gekoppelde testaccounts: per privacy-niveau verifiëren + negatieve RLS-leaktest.
- Per perspectief totalen controleren (eigen=aandeel, huishouden=vol, partner=rest) over bezittingen/schulden/cashflow/Box 3/FIRE.
- Upgrade de helper-endpoints `api/verify-shared-data` + `api/verify-perspective-switcher` (worktree) van file-greps naar echte 2-account-tests. Regressiesuite `lib/regression-tests/suites/identiteit-household.ts` uitbreiden.
- `npx tsc --noEmit 2>&1 | Select-String "lib/household"` (alleen eigen bestanden) + `get_advisors(security)` na RLS/DDL.

## 6. Kritieke bestanden
- `lib/household-data.ts` (math-hub) ✅ uitgebreid · `lib/household/perspective-loader.ts` ✅ nieuw
- `app/api/household/{data,box3,box2,fire-projections,accept,leave}/route.ts` · `app/api/perspective/route.ts`
- `lib/{assets-data-loader,core-data-loader,cashflow-data-loader,horizon-data-loader}.ts`
- `components/app/perspective-provider.tsx` · `components/app/ownership-toggle.tsx`
- `components/core/assets-client.tsx` · `app/(app)/core/debts/page.tsx` · `components/app/budgets-client.tsx`
- DB via `apply_migration` (write-trigger, `household_leave`, RPC-uitbreiding)

## 7. Risico's / aannames
- **[BESLISSING]** breakup: shared-items → aanmaker (vs achterblijver).
- **[AANNAME]** valuations van shared assets worden shared-zichtbaar (vereist write-stempel + backfill).
- **[RISICO]** migratie-drift: DDL strikt via `apply_migration`; lokale map niet vertrouwen.
- **[RISICO]** gedeeld-budget-besteding ondergeteld als partner-transacties tegen gedeelde budgetten onzichtbaar zijn — RLS-scope verifiëren.
