# Refactoring Backlog — TriFinity

> **Aangemaakt:** 2 maart 2026
> **Bron:** [Audit Variabelen & Datamodel](./audit-variables-datamodel.md)
> **Status-legenda:** `[ ]` open · `[~]` in progress · `[x]` done · `[-]` won't do

---

## Prioriteit: HOOG

### RF-001: Consolideer FIRE-berekeningen
- **Status:** `[ ]`
- **Ernst:** Hoog
- **Betrokken bestanden:** `lib/mock-data.ts`, `lib/horizon-data.ts`
- **Beschrijving:** `fireTarget`, `freedomYears/Months`, `savingsRate`, en `freedomPercentage` worden op twee plekken berekend (mock-data.ts en horizon-data.ts). Verplaats naar één gedeelde pure functie die door beide modules wordt aangeroepen.
- **Stappen:**
  1. [ ] Maak `lib/core-metrics.ts` met gedeelde functies: `computeFireTarget()`, `computeFreedomTime()`, `computeSavingsRate()`, `computeFreedomPercentage()`
  2. [ ] Refactor `computeCoreData()` in `mock-data.ts` om de gedeelde functies aan te roepen
  3. [ ] Refactor `computeFireProjection()` in `horizon-data.ts` om dezelfde functies te gebruiken
  4. [ ] Verifieer dat kern-pagina en horizon-pagina identieke waarden tonen
  5. [ ] Unit tests schrijven voor de gedeelde functies
- **Audit-referentie:** Inconsistenties #1, #2, #3, #4

---

### RF-002: Standaardiseer SWR-gebruik
- **Status:** `[ ]`
- **Ernst:** Hoog
- **Betrokken bestanden:** `lib/mock-data.ts`, `lib/horizon-data.ts`, `lib/fire-params.ts`
- **Beschrijving:** Er zijn drie SWR-waarden in de codebase: `0.04` (classic), `0.02883` (NL Box 3-gecorrigeerd), en een dynamische `effectiveSwr`. Het is onduidelijk welke wanneer geldt. `resolveFireParams()` moet de single source of truth worden.
- **Stappen:**
  1. [ ] Documenteer de drie SWR-varianten en wanneer elk geldt
  2. [ ] Refactor `computeCoreData()` om `resolveFireParams()` te gebruiken i.p.v. hardcoded `0.04`
  3. [ ] Verwijder lokale `const SWR = 0.04` uit `mock-data.ts`
  4. [ ] Zorg dat kern-pagina en horizon-pagina dezelfde resolved SWR gebruiken
  5. [ ] Test dat FIRE-targets consistent zijn over alle pagina's
- **Audit-referentie:** Inconsistenties #5, #6, #7, #8

---

### RF-003: Unificeer input-interfaces
- **Status:** `[x]` — afgerond
- **Ernst:** Hoog
- **Betrokken bestanden:** `lib/core-metrics.ts` (voorheen `lib/mock-data.ts`), `lib/horizon-data.ts`
- **Beschrijving:** `CoreData` mengde inputs en outputs; `HorizonInput` bevatte alleen inputs. Nu unified als `FinancialInput` (rauwe data) en `FinancialMetrics` (berekende waarden).
- **Stappen:**
  1. [x] Definieer `FinancialInput` interface (rauwe data uit DB: totalAssets, totalDebts, monthlyIncome, etc.)
  2. [x] Definieer `FinancialMetrics` interface (berekende waarden: fireTarget, freedomPercentage, etc.)
  3. [x] Refactor `computeCoreData()` om `FinancialInput` als parameter en `FinancialMetrics` als return te gebruiken
  4. [x] Refactor `computeFireProjection()` om dezelfde `FinancialInput` te accepteren
  5. [x] Update alle pagina's die deze functies aanroepen (28 bestanden)
  6. [x] Verwijder `CoreData` en `HorizonInput` interfaces; verwijder `lib/mock-data.ts`
- **Audit-referentie:** Inconsistenties #9, #10

---

### RF-008: Supabase-egress laag C — lokale dev-DB + getClaims
- **Status:** `[ ]` — lagen A+B zijn afgerond (commits `d0ee5a3c7` + `f9dc19287`, jun 2026); dit is het open restant
- **Ernst:** Hoog (kosten/egress; vrijwel ál het Supabase-verkeer is dev-verkeer tegen remote)
- **Betrokken bestanden:** `supabase/config.toml`, `supabase/migrations/*`, `.env.local`, `lib/supabase/server.ts`, `app/(app)/layout.tsx`, ~40 API-routes met `auth.getUser()`
- **Beschrijving:** Onderzoek (jun 2026) wees uit: 6,16 mln PostgREST-calls in 4 mnd bij 24 users — polling (gefixt in laag A/B) + dev-verkeer. De structurele oplossing is development tegen een lokale Supabase-stack draaien en server-side auth via lokale JWT-verificatie. Volledig plan: `~/.claude/plans/wil-je-onderzoeken-doen-expressive-globe.md` (+ memory `project_supabase_egress.md`).
- **Stappen (C1 — lokale Supabase voor dev):**
  1. [ ] **Docker Desktop installeren** (blokkerend; CLI 2.102.0 staat er al)
  2. [ ] Migratie-drift-baseline: `supabase link` + `supabase db pull` → remote schema als baseline-migratie (lokale migrations-map mist o.a. de `budget_amounts`-DDL); lokaal `supabase db reset` en verifiëren
  3. [ ] Env-switch: `.env.local` → `http://127.0.0.1:54321` + lokale keys; remote keys alleen in productie-env
  4. [ ] Seed: testuser via lokale auth + `lib/seed-persona.ts`
  5. [ ] Discipline-afspraak: schema-wijzigingen voortaan ALLEEN via migrations
- **Stappen (C2 — `getUser()` → `getClaims()` waar veilig):**
  1. [ ] Helper `getAuthUser()` in `lib/supabase/server.ts` (JWKS-verificatie, patroon uit `lib/supabase/proxy.ts:32`); eerst op één route verifiëren
  2. [ ] Migreer `app/(app)/layout.tsx` (hoogste frequentie), daarna routes die alleen `user.id`/`email` gebruiken
  3. [ ] `getUser()` behouden voor admin/account-mutaties (revocatie-gevoelig)
- **Meetprotocol:** nulmeting pg_stat_statements gereset 2026-06-12 12:58 UTC → na 24-48 u top-20 op `calls` vergelijken (clusters ±430k en app_settings 664k moeten een orde van grootte dalen); Supabase Usage → Egress week-op-week; na C1: API-requests/dag van ~50k → < 5k verwacht.

---

## Prioriteit: MEDIUM

### RF-004: DB→Frontend type mapper
- **Status:** `[ ]`
- **Ernst:** Medium
- **Betrokken bestanden:** Alle bestanden met Supabase `.from()` queries
- **Beschrijving:** Er is geen gestandaardiseerde mapper voor snake_case (DB) → camelCase (TypeScript). Dit maakt de code foutgevoelig.
- **Stappen:**
  1. [ ] Maak `lib/db-mapper.ts` met generieke `mapDbRow<T>()` en `mapDbRows<T>()` functies
  2. [ ] Definieer type mappings voor de meest gebruikte tabellen (assets, debts, transactions, budgets)
  3. [ ] Pas toe in 2-3 bestanden als pilot (bijv. `horizon-data.ts`, `mock-data.ts`)
  4. [ ] Geleidelijk uitrollen naar overige bestanden
- **Audit-referentie:** Inconsistentie #11

---

### RF-005: Standaardiseer variabelnamen
- **Status:** `[ ]`
- **Ernst:** Medium
- **Betrokken bestanden:** Diverse lib/ bestanden
- **Beschrijving:** Inconsistente naamgeving: `dailyExpense` vs `dailyMustExpense`, `vrijheidsdagen` vs `freedomDays`, NL/EN mix.
- **Stappen:**
  1. [ ] Definieer naamgevingsconventie: altijd EN voor variabelen, NL alleen in UI-strings
  2. [ ] Hernoem `vrijheidsdagen` → `freedomDays` in `box3-data.ts`
  3. [ ] Verduidelijk `dailyExpense` (alle uitgaven) vs `dailyMustExpense` (alleen essentieel) — hernoem waar nodig
  4. [ ] Verduidelijk `yearlyIncome` vs `estimatedYearlyIncome` — documenteer onderscheid
  5. [ ] Doorzoek codebase op andere NL/EN inconsistenties
- **Audit-referentie:** Inconsistenties #12, #13, #14

---

### RF-006: Verwijder duplicate format-functies
- **Status:** `[ ]`
- **Ernst:** Medium
- **Betrokken bestanden:** `lib/box3-data.ts`, `lib/format.ts`
- **Beschrijving:** `formatEur()` in `box3-data.ts:519` dupliceert `formatCurrency()` uit `format.ts`. Inline vrijheidsdagen-berekening in `box3-data.ts:270` i.p.v. `calculateFreedomTime()`.
- **Stappen:**
  1. [ ] Vervang `formatEur()` in `box3-data.ts` door import van `formatCurrency()` uit `format.ts`
  2. [ ] Vervang inline `belasting / dailyExpenses` door `calculateFreedomTime()` uit `format.ts`
  3. [ ] Verwijder de lokale `formatEur()` functie
  4. [ ] Zoek naar andere duplicate format-functies in de codebase
- **Audit-referentie:** Inconsistenties #15, #16

---

## Prioriteit: LAAG

### RF-007: Centraliseer constanten
- **Status:** `[ ]`
- **Ernst:** Laag
- **Betrokken bestanden:** `lib/mock-data.ts`, `lib/horizon-data.ts`, `lib/net-worth-projection.ts`
- **Beschrijving:** Financiële constanten zijn verspreid over meerdere bestanden: `annualReturn = 0.07`, `NL_AOW_MONTHLY = 1380`, etc.
- **Stappen:**
  1. [ ] Maak `lib/constants.ts` met alle gedeelde financiële constanten
  2. [ ] Verplaats: `DEFAULT_RETURN`, `DEFAULT_INFLATION`, `SWR`, `NL_SWR`, `BOX3_DRAG`, `NL_AOW_MONTHLY`, `NL_AOW_AGE`
  3. [ ] Update imports in `mock-data.ts`, `horizon-data.ts`, `net-worth-projection.ts`, `fire-simulation.ts`
  4. [ ] Verwijder lokale constante-definities
  5. [ ] Documenteer elke constante met bron/referentie
- **Audit-referentie:** Inconsistenties #17, #18

---

## Overzicht

| ID | Naam | Ernst | Status |
|----|------|-------|--------|
| RF-001 | Consolideer FIRE-berekeningen | Hoog | `[ ]` |
| RF-002 | Standaardiseer SWR-gebruik | Hoog | `[ ]` |
| RF-003 | Unificeer input-interfaces | Hoog | `[x]` |
| RF-004 | DB→Frontend type mapper | Medium | `[ ]` |
| RF-005 | Standaardiseer variabelnamen | Medium | `[ ]` |
| RF-006 | Verwijder duplicate format-functies | Medium | `[ ]` |
| RF-007 | Centraliseer constanten | Laag | `[ ]` |

**Aanbevolen volgorde:** RF-007 → RF-006 → RF-001 → RF-002 → RF-003 → RF-005 → RF-004
(begin met de eenvoudige, low-risk wijzigingen om het patroon te zetten, daarna de complexere refactors)
