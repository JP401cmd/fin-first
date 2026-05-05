# Routing-inventarisatie TriFinity (`fintwo`)

> Stand per **2026-05-04**. Volledige kaart van alle pagina's, modals en sub-routes per module — Kern, Wil, Horizon, Identiteit, plus globale en admin-routes. Gebaseerd op `app/(app)/**` + `app/**`.

Per route: localhost-URL, omschrijving, type, terug-/sluit-navigatie, of het pad zichtbaar is (breadcrumb), en aanvullende relevante info (module-gating, query-params, app-tabs, etc.).

Stack: Next.js 16 App Router, Supabase auth/data, route-groups `(app)` en `(onboarding)`, module-CSS-vars in elke module-layout.

---

## Globale architectuur

### Layouts (van buiten naar binnen)
- `app/layout.tsx` — root: fonts, metadata, palette-init, SpeedInsights.
- `app/(app)/layout.tsx` — auth-guard (`redirect('/login')` als geen user), `redirect('/onboarding')` als onboarding niet voltooid, plus alle providers en de **AppHeader + BottomNav**. Deze wikkel is de bron van top-navigatie op álle authenticated pagina's.
- Module-layouts:
  - `app/(app)/core/layout.tsx` → zet `--module-active-*` op Kern-shades + toont **`<Breadcrumb color="amber" />`**.
  - `app/(app)/identity/layout.tsx` → toont **`<ModuleNav config={identityNav} />` + `<Breadcrumb color="teal" />`**.
  - `app/(app)/will/layout.tsx` → ALLEEN module-CSS-vars, **geen breadcrumb, geen ModuleNav** (Will heeft maar 1 tab).
  - `app/(app)/horizon/layout.tsx` → module-CSS-vars + **DreamTransitionContext** (gouden veil-overgang), **geen breadcrumb, geen ModuleNav**.
  - `app/(app)/horizon/doorrekening-test/layout.tsx` → server-layout die `DoorrekeningSettingsProvider` + tabs (`Opbouw / Afbouw / Overzicht / Gebeurtenissen`) wrapt.
  - `app/(app)/beheer/layout.tsx` → admin-shell.
- `app/(onboarding)/onboarding/layout.tsx` — eigen route-groep, geen AppHeader.

### Globale navigatie-elementen
- **AppHeader** (`components/app/app-header.tsx`) — top-bar op alle authenticated routes; bevat profiel-dropdown met o.a. link naar **Rapportages** (tussen Identiteit en Uitloggen).
- **BottomNav** — mobile-bottom-tabs voor de 3 hoofdmodules.
- **ChatPanel** (floating) — overal aanwezig via `ChatProvider`.
- **NotificationModal**, **SessionMonitor**, **WelcomeBanner**, **AutoSnapshotTrigger**, **MobilePreviewFrame** — providers / overlays altijd actief in `(app)` layout.

### Module-nav configs (`lib/navigation.ts`)

| Module     | Items in ModuleNav                                                                                                       | Kleur  | Layout toont nav? |
|------------|--------------------------------------------------------------------------------------------------------------------------|--------|-------------------|
| Wil        | `Overzicht`                                                                                                              | teal   | Nee (1 tab → niet zichtbaar) |
| Horizon    | `Overzicht`                                                                                                              | purple | Nee                |
| Identiteit | `Overzicht / Profiel / Gids / Instellingen / Koppelingen / Testscenario's / Delen` (**7 tabs**)                          | teal   | **Ja**             |
| Kern       | (geen `ModuleNav`-config; navigatie loopt via Breadcrumb + items in de pagina zelf)                                      | amber  | Nee                |

---

## A. KERN-MODULE (`/core/**`)

**Kleur:** amber/kern. **Breadcrumb:** Ja (amber, in layout). **ModuleNav:** Nee.
Architectuurprincipe: Kern → Categorie → App. App-tabs via `?tab=<slug>` URL-state.

### A.1 Landing & overzichten

| URL                        | Bestand                                          | Omschrijving                                                                                                                                | Type           | Navigatie terug                                       | Breadcrumb? | Bijzonderheden |
|----------------------------|--------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|----------------|--------------------------------------------------------|-------------|----------------|
| `/core`                    | `app/(app)/core/page.tsx`                        | Kern-landing: hero (netto vermogen, FIRE-voortgang, samenvatting) + alle categorieën in twee secties (Bezittingen + Schulden).             | Server-pagina  | N.v.t. (landing) — back via AppHeader/BottomNav        | Ja          | Geen module-eis (fundament). |
| `/core/assets`             | `app/(app)/core/assets/page.tsx`                 | Overzicht van alle activa per type (cash, investment, crypto, real_estate, vordering, eigen_huis).                                          | Server-pagina  | Breadcrumb → `/core`                                   | Ja          | `loadAssetsData()` server-side. |
| `/core/debts`              | `app/(app)/core/debts/page.tsx`                  | Overzicht van alle schulden (hypotheek, persoonlijke lening, studieschuld, autolening, creditcard, revolving credit).                       | Client-pagina  | Breadcrumb → `/core`                                   | Ja          | Modals voor detail/edit/revalue (zie §A.7). Deep-link: `?debt=<id>`. |

### A.2 Asset-categorieën (`[type]`) — vaste types met dynamic param

| URL                                | Bestand                                                | Omschrijving                                                                                                          | Type           | Navigatie terug                  | Breadcrumb? | Bijzonderheden |
|-------------------------------------|--------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------|----------------|----------------------------------|-------------|----------------|
| `/core/assets/[type]`              | `app/(app)/core/assets/[type]/page.tsx`                | Categorie-pagina per asset-type. Items-tab + app-tab(s). `[type]` ∈ `cash, investment, crypto, real_estate, vordering, eigen_huis`. | Server-pagina  | Breadcrumb → `/core/assets`      | Ja          | URL-state `?tab=<slug>`. Apps: cash → Budgetteren, investment/crypto → Holdings, eigen_huis → Hypotheekplanner, real_estate → Verhuurrendement. Module-gating: tip-strip + teaser als modul uit. Parallelle data-loads via `Promise.allSettled`. |
| `/core/assets/cash/[accountId]`    | `app/(app)/core/assets/cash/[accountId]/page.tsx`      | Detail van één bank-rekening (transacties, saldo, koppeling met budgets).                                              | Client-pagina  | `<CashAccountView backHref="/core/assets" />` → `/core/assets` | Ja          | URL-state `?month=<YYYY-MM>` voor maandselectie. |
| `/core/assets/investment/[holdingId]` | `app/(app)/core/assets/investment/[holdingId]/page.tsx` | Alias/redirect-route (legacy) voor investment-holding.                                                                 | Pagina/Redirect | → `/core/assets/holdings/[id]`   | Ja*         | Backwards-compat. |
| `/core/assets/crypto/[holdingId]`  | `app/(app)/core/assets/crypto/[holdingId]/page.tsx`    | Alias/redirect-route (legacy) voor crypto-holding.                                                                     | Pagina/Redirect | → `/core/assets/holdings/[id]`   | Ja*         | Backwards-compat. |
| `/core/assets/revalue`             | `app/(app)/core/assets/revalue/page.tsx`               | Bulk-herwaardering: wijzig waarden van meerdere assets tegelijk + maak balance-snapshot.                               | Client-pagina  | Annuleren/Save → `/core/assets`  | Ja          | Holdings-managed items zijn locked. |

### A.3 Holdings (full-page, ook embed in investment/crypto-tab)

| URL                                  | Bestand                                                  | Omschrijving                                                                                              | Type            | Navigatie terug                          | Breadcrumb? | Bijzonderheden |
|---------------------------------------|----------------------------------------------------------|------------------------------------------------------------------------------------------------------------|-----------------|------------------------------------------|-------------|----------------|
| `/core/assets/holdings`              | `app/(app)/core/assets/holdings/page.tsx`                | Holdings-overzicht (aandelen + crypto): tabel met posities, performance, allocatie.                       | Server-pagina   | Breadcrumb → `/core/assets`              | Ja          | `loadHoldingsData()`. Wordt ook embed in `/core/assets/investment` en `/core/assets/crypto`. |
| `/core/assets/holdings/[id]`         | `app/(app)/core/assets/holdings/[id]/page.tsx`           | Holding-detail: koershistorie, transacties, Box 3-impact.                                                  | Server-pagina   | Terug → `/core/assets/holdings`          | Ja          | UUID-validatie → `notFound()`. Polymorf: `resolveHolding()` checkt zowel `investment_holdings` als `crypto_holdings`. |
| `/core/assets/holdings/import`       | `app/(app)/core/assets/holdings/import/page.tsx`         | CSV-import wizard (Degiro, IBKR, Binance, Kraken, …). 3 stappen: upload → preview/duplicates → result.    | Client-wizard   | Annuleren → `/core/assets/holdings`      | Ja          | – |

### A.4 Cash-rekening flows (bank-koppeling, import)

| URL                              | Bestand                                              | Omschrijving                                                                                       | Type             | Navigatie terug                       | Breadcrumb? | Bijzonderheden |
|-----------------------------------|------------------------------------------------------|----------------------------------------------------------------------------------------------------|------------------|---------------------------------------|-------------|----------------|
| `/core/cash`                     | `app/(app)/core/cash/page.tsx`                       | **Server-redirect** → `/core/assets/cash` (één canonieke ingang).                                  | Redirect         | n.v.t.                                 | n.v.t.      | – |
| `/core/cash/connect`             | `app/(app)/core/cash/connect/page.tsx`               | Bank-koppeling wizard (Open Banking — Tink/Yodlee/Nordigen).                                        | Client-wizard    | Annuleren → `/core/assets/cash`        | Ja          | URL-state `?error=<code>` voor OAuth-fouten. |
| `/core/cash/connect/callback`    | `app/(app)/core/cash/connect/callback/page.tsx`      | OAuth-callback na bank-autorisatie.                                                                | Server-pagina    | Auto-redirect naar success/error       | Nee         | Verwerkt token + accounts. |
| `/core/cash/connect/success`     | `app/(app)/core/cash/connect/success/page.tsx`       | Success-pagina na koppeling, biedt "first sync" aan.                                                | Client-pagina    | "Klaar" → `/core/assets/cash`          | Ja          | – |
| `/core/cash/import`              | `app/(app)/core/cash/import/page.tsx`                | CSV-import van bank-transacties (legacy/onondersteunde banken).                                     | Client-wizard    | Annuleren → `/core/assets/cash`        | Ja          | – |

### A.5 Budgets (full-page = Cash-app `Budgetteren`)

| URL                              | Bestand                                          | Omschrijving                                                       | Type                | Navigatie terug                     | Breadcrumb? | Bijzonderheden |
|-----------------------------------|--------------------------------------------------|--------------------------------------------------------------------|---------------------|-------------------------------------|-------------|----------------|
| `/core/budgets`                  | `app/(app)/core/budgets/page.tsx`                | Budgets-overzicht (full-page); ook embed in `/core/assets/cash` als app-tab. | Server-pagina       | Breadcrumb → `/core`                | Ja          | URL-state `?budget=<id>` opent detail-modal; `?budget=<id>&edit=true` opent edit-modal. |
| `/core/budgets/new`              | `app/(app)/core/budgets/new/page.tsx`            | Nieuw-budget formulier (`<BudgetForm />`).                         | Client-pagina       | Annuleren → `/core/budgets`         | Ja          | Laadt parent-budgets voor hiërarchie-keuze. |
| `/core/budgets/[id]`             | `app/(app)/core/budgets/[id]/page.tsx`           | **Client-redirect met spinner** → `/core/budgets?budget=<id>`.     | Redirect (client)   | n.v.t.                              | n.v.t.      | Modal-state pattern. |
| `/core/budgets/[id]/edit`        | `app/(app)/core/budgets/[id]/edit/page.tsx`      | **Client-redirect met spinner** → `/core/budgets?budget=<id>&edit=true`. | Redirect (client) | n.v.t.                              | n.v.t.      | – |

### A.6 Schulden, belasting, check-in

| URL                              | Bestand                                          | Omschrijving                                                                                              | Type            | Navigatie terug                  | Breadcrumb? | Bijzonderheden |
|-----------------------------------|--------------------------------------------------|------------------------------------------------------------------------------------------------------------|-----------------|----------------------------------|-------------|----------------|
| `/core/debts/[type]`             | `app/(app)/core/debts/[type]/page.tsx`           | Schuld-categorie per type (mortgage, personal_loan, student_loan, car_loan, credit_card, revolving_credit). | Server-pagina   | Breadcrumb → `/core/debts`       | Ja          | URL-state `?tab=aflosstrategie` of `?tab=hypotheekplanner` (mortgage). |
| `/core/belasting`                | `app/(app)/core/belasting/page.tsx`              | Box 3 + Box 2 calculator: vermogensheffing, aanmerkelijk belang, partner-verdeling, year-selector (2025/2026). | Client-pagina   | Inline link → `/core`            | Ja          | Multi-perspectief: personal / partner1 / partner2 / combined. Partner-modal voor optimalisatie. |
| `/core/checkin`                  | `app/(app)/core/checkin/page.tsx`                | Maandelijkse check-in wizard (7 stappen: terugblik → bezittingen → schulden → doelen → budget → vooruitblik → reflectie). | Client-wizard   | Wizard-back of cancel → `/core`  | Ja          | Snapshot-workflow. |
| `/core/checkin/historie`         | `app/(app)/core/checkin/historie/page.tsx`       | Overzicht eerdere check-ins met trendline.                                                                 | Client-pagina   | Terug → `/core/checkin`          | Ja          | – |

### A.7 In-page modals & BottomSheets binnen Kern (geen route)

| Component                  | Bestand                                            | Gebruikt op                       | Functie                                                                          |
|----------------------------|----------------------------------------------------|------------------------------------|----------------------------------------------------------------------------------|
| `DebtDetailModal`          | `components/app/core/debts/debt-detail-modal.tsx`   | `/core/debts`                      | Detail van schuld; sluit met X.                                                   |
| `DebtForm`                 | `components/app/core/debts/debt-form.tsx`           | `/core/debts` (modal)              | Schuld bewerken / nieuw.                                                          |
| `DebtValuationModal`       | `components/app/core/debts/debt-valuation-modal.tsx`| `/core/debts` → DebtDetailModal    | Schuld herwaarderen.                                                              |
| `Box3PartnerModal`         | `components/app/core/box3-partner-modal.tsx`        | `/core/belasting`                  | Partner-verdeling Box 3 optimaliseren.                                             |
| `QuickAddWizard`           | `components/app/quick-add-wizard/quick-add-wizard.tsx` | `/core/assets`, `/core/debts`   | 3-stap wizard om asset/debt snel toe te voegen.                                    |
| Budget detail/edit modal   | (in `BudgetsClient`)                                | `/core/budgets?budget=<id>`        | Open via URL-state, sluit met `router.replace('/core/budgets')`.                  |

### A.8 Module-gating per app-tab (Kern)

| Categorie       | App-tab            | Vereiste module        | Fallback bij module uit                  |
|-----------------|--------------------|------------------------|-------------------------------------------|
| Cash            | Budgetteren         | `budgetteren`          | Tip-strip op items-tab + teaser-tab       |
| Investment      | Holdings            | `aandelenregistratie`  | Tip-strip + teaser-tab                    |
| Crypto          | Holdings            | `aandelenregistratie`  | Tip-strip + teaser-tab                    |
| Eigen Huis      | Hypotheekplanner    | `toekomstplannen`      | Tip-strip + teaser-tab                    |
| Real Estate     | Verhuurrendement    | `vermogensregistratie` | Tip-strip + teaser-tab                    |
| Mortgage (debt) | Aflosstrategie + Hypotheekplanner | `toekomstplannen` | Tip-strip + teaser-tab                    |
| Andere debts    | Aflosstrategie     | `toekomstplannen`      | Tip-strip + teaser-tab                    |

---

## B. WIL-MODULE (`/will/**`)

**Kleur:** wil/paars (CSS-vars). **Breadcrumb:** Nee. **ModuleNav:** Nee (1 tab → niet getoond).

| URL      | Bestand                       | Omschrijving                                                                                                                                                    | Type           | Navigatie terug                              | Breadcrumb? | Bijzonderheden |
|----------|-------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------|----------------------------------------------|-------------|----------------|
| `/will`  | `app/(app)/will/page.tsx`     | **Primaire app-landing.** WillEditorialHeader (4 KPI's), DraggableWidgetGrid, DAIshboard (AI-briefing), ActionCenter (voorstellen ↔ acties), DoelenStrook, VasteKostenAnalyse. | Server-pagina  | n.v.t. (landing — back via AppHeader)         | Nee         | Parallel data-load: `loadDashboardData() + loadWillData()`. Subscriptions via `/api/subscriptions`. Feature `doelen_systeem` gate't DoelenStrook. |

### B.1 In-page modals/BottomSheets in Wil

| Component                    | Bestand                                              | Open via                              | Sluit naar |
|------------------------------|------------------------------------------------------|----------------------------------------|------------|
| `GoalDetailModal`            | `components/app/will/goal-detail-modal.tsx`           | Klik op doel in DoelenStrook           | `/will`    |
| `GoalForm` (embedded)        | `components/app/goal-form.tsx`                        | Inside GoalDetailModal                 | n.v.t.     |
| `GoalProgressTimeline`       | `components/app/will/goal-progress-timeline.tsx`      | Inside GoalDetailModal                 | n.v.t.     |
| `OpzegModal` (BottomSheet)   | `components/app/opzeg-modal.tsx`                      | Klik op subscription in VasteKostenAnalyse | `/will`    |
| Action/Recommendation modals | binnen `ActionCenter`                                 | Klik op kaart                          | `/will`    |

> **Let op:** `/dashboard` bestaat nog wel als bestand maar is een **server-redirect → `/will`** (zie §E.2). Wil is sinds de Identity-restructure de primaire landing.

---

## C. HORIZON-MODULE (`/horizon/**`)

**Kleur:** horizon/zandgoud. **Breadcrumb:** Nee. **ModuleNav:** Nee. **Speciale layout:** `DreamTransitionContext` met "dream gate" page-transitions (gouden veil ~1.2s; respect voor `prefers-reduced-motion`).

### C.1 Hoofdpagina's

| URL                                        | Bestand                                                  | Omschrijving                                                                                                                                            | Type           | Navigatie terug                  | Breadcrumb? | Bijzonderheden |
|---------------------------------------------|----------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|----------------|----------------------------------|-------------|----------------|
| `/horizon`                                 | `app/(app)/horizon/page.tsx`                             | Horizon-landing: WhatIfHeader + 4 KPI's, FIRE SimChart, WealthCompositionChart, IncomeExpenseChart, EventsTimeline, PhaseBar, HouseholdFireSection.    | Server-pagina  | n.v.t. (landing)                  | Nee         | `loadHorizonData()` (assets, debts, budget, life events, FIRE settings, AOW, household). Query-param `?via=dreamgate` wordt na mount opgeschoond. |
| `/horizon/strategie`                       | `app/(app)/horizon/strategie/page.tsx`                   | **Server-redirect** → `/horizon?strategie=open` (opent StrategieModal).                                                                                  | Redirect       | n.v.t.                            | n.v.t.      | – |
| `/horizon/whatif`                          | `app/(app)/horizon/whatif/page.tsx`                      | What-If scenario builder: 5 sliders (inkomen, dagen/week, spaarquote, rendement, extra inleg), WhatIfEventsPanel, presets, opgeslagen scenarios, AI-chat. | Client-pagina  | Browser-back of AppHeader        | Nee         | KassabonShell-BottomSheet voor vergelijking werkelijkheid ↔ scenario. |

### C.2 Doorrekening-test (sub-tree met eigen tab-layout)

Eigen layout `app/(app)/horizon/doorrekening-test/layout.tsx` + `layout-client.tsx` met **tab-nav** (Opbouw / Afbouw / Overzicht / Gebeurtenissen) + settings-banner. Alle vier de tabs delen `DoorrekeningSettingsProvider` (eindstrategie/eindleeftijd/legacy uit profiel).

| URL                                                  | Bestand                                                                  | Omschrijving                                                                                                       | Type            | Navigatie terug                                     | Breadcrumb? | Bijzonderheden |
|-------------------------------------------------------|--------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------|-----------------|------------------------------------------------------|-------------|----------------|
| `/horizon/doorrekening-test`                         | `app/(app)/horizon/doorrekening-test/page.tsx`                           | **Redirect** → `/horizon/doorrekening-test/opbouw`.                                                                  | Redirect        | n.v.t.                                              | n.v.t.      | – |
| `/horizon/doorrekening-test/opbouw`                  | `app/(app)/horizon/doorrekening-test/opbouw/page.tsx`                    | Opbouw-fase: vermogenspad-grafiek, compositie, fase-analyses.                                                       | Server-pagina   | Tab-nav binnen layout; AppHeader voor module-uit     | Nee (tabs zijn de pad-indicator) | Tab-active highlight in layout-client. |
| `/horizon/doorrekening-test/afbouw`                  | `app/(app)/horizon/doorrekening-test/afbouw/page.tsx`                    | Afbouw-fase: 4 onttrekkingsstrategieën als sub-tabs (deplete / legacy / perpetual / pensioen).                      | Server-pagina   | Tab-nav                                              | Nee         | Aparte tabel-componenten per strategie. |
| `/horizon/doorrekening-test/overzicht`               | `app/(app)/horizon/doorrekening-test/overzicht/page.tsx`                 | Overzicht-fase: levensloop-tabel (opbouw → afbouw → einde-leven). Klik op jaar opent `YearDetailsSheet` (BottomSheet). | Server-pagina   | Tab-nav                                              | Nee         | – |
| `/horizon/doorrekening-test/gebeurtenissen`          | `app/(app)/horizon/doorrekening-test/gebeurtenissen/page.tsx`            | Levensgebeurtenissen-beheer (CRUD + impact-analyse per scenario).                                                   | Server-pagina   | Tab-nav                                              | Nee         | Event-form inline. |

### C.3 In-page modals/BottomSheets in Horizon

| Modal/Sheet                      | Open via                              | Sluit naar                          |
|----------------------------------|----------------------------------------|--------------------------------------|
| `StrategieModal`                 | `?strategie=open` query                | `/horizon` (query verwijderd)        |
| `ScenariosModal`                 | Header-icoon                           | `/horizon` (modal sluit)             |
| `SimulationsModal`               | Header-icoon                           | `/horizon`                           |
| `WithdrawalModal`                | Header-icoon                           | `/horizon`                           |
| `BacktestingModal`               | Header-icoon                           | `/horizon`                           |
| `PhaseModalOpbouw/Overgang/Onttrekking` | Klik op PhaseBar                | `/horizon`                           |
| `SimChartModal`                  | Chart-icoon                            | `/horizon`                           |
| `PensionPdfUpload`               | Header-icoon                           | `/horizon`                           |
| `KassabonShell` (BottomSheet)    | Klik op KPI in `/horizon/whatif`       | `/horizon/whatif`                    |
| `YearDetailsSheet` (BottomSheet) | Klik op jaar in overzicht-tabel        | `/horizon/doorrekening-test/overzicht` |

---

## D. IDENTITEIT-MODULE (`/identity/**`)

**Kleur:** teal. **Breadcrumb:** Ja (teal). **ModuleNav:** **Ja** (7 tabs).

### D.1 Hoofdpagina's (zichtbaar in ModuleNav)

| URL                            | Bestand                                              | Omschrijving                                                                                                                                                            | Type            | Navigatie terug                                | Breadcrumb? | Bijzonderheden |
|--------------------------------|------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------|------------------------------------------------|-------------|----------------|
| `/identity`                    | `app/(app)/identity/page.tsx`                        | Identiteit-overzicht: profielsamenvatting strip, temporal balance, chronologische schaal.                                                                                | Server-pagina   | ModuleNav-tabs / Breadcrumb → `/`              | Ja          | Server-component. |
| `/identity/profiel`            | `app/(app)/identity/profiel/page.tsx`                | Persoonlijk profiel + huishouden (geboortedatum, NIBUD-kenmerken, partner).                                                                                              | Client-pagina   | ModuleNav / Breadcrumb                          | Ja          | Schrijft naar `profiles`. |
| `/identity/gids`               | `app/(app)/identity/gids/page.tsx`                   | App-gids: ConceptFlipCards, OntdekkenSection, GuideProgressBar — inleiding op alle concepten en modules.                                                                  | Client-pagina   | ModuleNav / Breadcrumb                          | Ja          | – |
| `/identity/instellingen`       | `app/(app)/identity/instellingen/page.tsx`           | **Centrale instellingen-hub** met secties: A Notificaties, B Widgets, C FIRE-instellingen, D Weergave (typografie + kleuren), E Gegevens, F Privacy, G Rebalancing, H Modules. | Client-pagina   | ModuleNav / Breadcrumb                          | Ja          | API's: `/api/parameters`, `/api/fire-settings`, `/api/withdrawal-strategy`, `/api/household/privacy`, `/api/partner-notifications`. ~50KB component. |
| `/identity/koppelingen`        | `app/(app)/identity/koppelingen/page.tsx`            | Externe koppelingen/integraties (banken, brokers, exchanges).                                                                                                            | Server-pagina   | ModuleNav / Breadcrumb                          | Ja          | `loadConnectionsData()`. |
| `/identity/testscenarios`      | `app/(app)/identity/testscenarios/page.tsx`          | Testscenario's discovery-hub: 26 use-cases × 4 personas (Pensioenplanner, Vermogensverdeler, Budgetteerder, FIRE-strijder) + algemene opdrachten. Voortgang in localStorage. | Client-pagina   | ModuleNav / Breadcrumb                          | Ja          | – |
| `/identity/delen`              | `app/(app)/identity/delen/page.tsx`                  | Vrijheidskaart-generator + entry naar `/identity/jaaroverzicht`.                                                                                                          | Client-pagina   | ModuleNav / Breadcrumb                          | Ja          | – |

### D.2 Sub-routes (NIET in ModuleNav)

| URL                                                | Bestand                                                                  | Omschrijving                                                                       | Type            | Navigatie terug                            | Breadcrumb? | Bijzonderheden |
|-----------------------------------------------------|--------------------------------------------------------------------------|-------------------------------------------------------------------------------------|-----------------|--------------------------------------------|-------------|----------------|
| `/identity/jaaroverzicht`                          | `app/(app)/identity/jaaroverzicht/page.tsx`                              | Year-in-Review: KPI's, grafieken, exporteerbare PNG, deelbare permalink.            | Client-pagina   | Terug-knop → `/identity/delen` of `/identity` | Ja          | Canvas-render, dark theme, fetch `/api/year-in-review?year=...`. |
| `/identity/testscenarios/vragenlijsten`            | `app/(app)/identity/testscenarios/vragenlijsten/page.tsx`                | Lijst met vragenlijsten/feedback-formulieren.                                       | Client-pagina   | Breadcrumb → `/identity/testscenarios`     | Ja          | Fetch `/api/questionnaires`. |
| `/identity/testscenarios/vragenlijsten/[id]`       | `app/(app)/identity/testscenarios/vragenlijsten/[id]/page.tsx`           | Detail van één vragenlijst, stappenflow voor invullen.                              | Client-pagina   | Breadcrumb / Terug-knop                    | Ja          | – |

### D.3 Redirects (legacy/consolidatie)

| URL                          | Bestand                                            | Doel                              | Type   |
|-------------------------------|----------------------------------------------------|------------------------------------|--------|
| `/identity/voortgang`        | `app/(app)/identity/voortgang/page.tsx`            | → `/identity`                       | Server-redirect |
| `/identity/widgets`          | `app/(app)/identity/widgets/page.tsx`              | → `/identity/instellingen`          | Server-redirect |
| `/identity/parameters`       | `app/(app)/identity/parameters/page.tsx`           | → `/identity/instellingen` (sectie C — FIRE) | Server-redirect |

---

## E. TOP-LEVEL & GLOBALE ROUTES (buiten modules)

### E.1 Authenticatie (publiek, geen `(app)` layout)

| URL                  | Bestand                              | Omschrijving                                                                                  | Type           | Navigatie terug                    | Breadcrumb? | Bijzonderheden |
|----------------------|--------------------------------------|-----------------------------------------------------------------------------------------------|----------------|------------------------------------|-------------|----------------|
| `/`                  | `app/page.tsx`                       | Marketing/landing-pagina (Header, Hero, Features, Footer).                                    | Pagina (publiek) | Header-nav / Footer                 | Nee         | Voor niet-ingelogde bezoekers. |
| `/login`             | `app/login/page.tsx`                 | Login (e-mail + wachtwoord, session-expiry banner).                                           | Client-pagina  | Link → `/signup` / `/forgot-password` | Nee         | `?redirectTo=` → default `/will`. |
| `/signup`            | `app/signup/page.tsx`                | Registratie + e-mailverificatie.                                                              | Client-pagina  | Link → `/login`                     | Nee         | – |
| `/forgot-password`   | `app/forgot-password/page.tsx`       | Wachtwoord-reset aanvraag.                                                                    | Client-pagina  | Link → `/login`                     | Nee         | – |
| `/reset-password`    | `app/reset-password/page.tsx`        | Nieuw wachtwoord instellen na e-mail-link.                                                    | Client-pagina  | Auto-redirect → `/will` (na 2s)     | Nee         | Vereist auth-sessie (callback). |
| `/logout`            | `app/logout/page.tsx`                | Roept `signOut()` aan in `useEffect`, redirect → `/`.                                          | Client-pagina  | Auto                                | Nee         | – |
| `/auth/callback`     | `app/auth/callback/route.ts`         | OAuth/email-link callback handler (Supabase).                                                 | API-route      | Redirect naar `?next=` of `/will`   | n.v.t.      | – |
| `/household-invite`  | `app/household-invite/page.tsx`      | Acceptatie-flow voor partner/huishouden-uitnodiging.                                          | Pagina         | Knop → `/identity/profiel`          | n.v.t.      | Vereist `?token=`. |

### E.2 Authenticated top-level (binnen `(app)`)

| URL                          | Bestand                                       | Omschrijving                                                                            | Type            | Navigatie terug                  | Breadcrumb? | Bijzonderheden |
|-------------------------------|-----------------------------------------------|------------------------------------------------------------------------------------------|-----------------|----------------------------------|-------------|----------------|
| `/dashboard`                 | `app/(app)/dashboard/page.tsx`                | **Server-redirect** → `/will` (legacy URL).                                              | Redirect        | n.v.t.                            | n.v.t.      | – |
| `/berichten`                 | `app/(app)/berichten/page.tsx`                | Berichten/Briefings-hub: AI-gegenereerde dag-briefings + financieel nieuws.              | Server-pagina   | AppHeader-nav                     | Nee         | Temporal context, AI-integratie. |
| `/nieuws`                    | `app/(app)/nieuws/page.tsx`                   | Nieuws-only view (`<NieuwsOnlyClient />`).                                               | Pagina           | AppHeader-nav                     | Nee         | – |
| `/rapportages`               | `app/(app)/rapportages/page.tsx`              | Rapportages-hub: maand-/kwartaal-/jaarrapport overzicht en generatie.                    | Client-pagina   | AppHeader-dropdown                 | Nee         | Genoemd in CLAUDE.md / app-header dropdown. |
| `/rapportages/[id]`          | `app/(app)/rapportages/[id]/page.tsx`         | Rapport-detail (specifieke periode, AI-analyse).                                          | Pagina           | Terug → `/rapportages`             | Nee         | Dynamic ID. |
| `/rapportages/budget`        | `app/(app)/rapportages/budget/page.tsx`       | Budget-rapport sjabloon.                                                                 | Pagina           | Terug → `/rapportages`             | Nee         | – |
| `/rapportages/balans`        | `app/(app)/rapportages/balans/page.tsx`       | Balans/netto-vermogen rapport sjabloon.                                                  | Pagina           | Terug → `/rapportages`             | Nee         | – |
| `/tools/fire-sim`            | `app/(app)/tools/fire-sim/page.tsx`           | Standalone FIRE-simulatie tool (sliders + chart + KassabonShell-BottomSheet).            | Client-pagina   | AppHeader / browser-back           | Nee         | Niet in een module-tree; gebruikt zelf `runSimulation()`. |
| `/verify-feature-gating`     | `app/(app)/verify-feature-gating/page.tsx`    | Dev/QA verificatie van feature-access matrix.                                            | Pagina           | n.v.t.                             | Nee         | Intern. |

### E.3 Onboarding (eigen route-groep)

| URL                  | Bestand                                              | Omschrijving                                                                  | Type            | Navigatie terug                        | Breadcrumb? | Bijzonderheden |
|----------------------|------------------------------------------------------|--------------------------------------------------------------------------------|-----------------|-----------------------------------------|-------------|----------------|
| `/onboarding`        | `app/(onboarding)/onboarding/page.tsx`               | Multi-step intake-flow (profiel, intent, voorkeuren, success).                | Server-pagina   | Wizard-back / "Sla over" → `/will`      | Nee         | Eigen `(onboarding)` layout (geen AppHeader). Auto-trigger uit `(app)/layout.tsx` als `!profile.onboarding_completed`. |

### E.4 Speciaal: legacy /holdings/[id] (root) en dev-tools

| URL                          | Bestand                                       | Omschrijving                                                              | Type           |
|-------------------------------|-----------------------------------------------|----------------------------------------------------------------------------|----------------|
| `/holdings/[id]`             | `app/holdings/[id]/page.tsx`                  | **Permanente 404** (`notFound()`) — bestaat alleen om legacy bookmarks netjes af te handelen. Echte holdings: `/core/assets/holdings/[id]`. | not-found      |
| `/dev-preview-breadcrumb`    | `app/dev-preview-breadcrumb/page.tsx`         | Dev-only Breadcrumb preview/testing.                                       | Pagina (dev)   |
| `/test-*` (~80 routes)       | `app/test-*/page.tsx`                         | QA-test-scaffolding pagina's voor regressie (één per scenario, bv. `test-holdings-list`, `test-budget-modes`, `test-back-button`, …). | Pagina (QA)    |

> De `/test-*` routes zijn **niet user-facing** — ze worden door de QA-pipeline aangeroepen. Niet meenemen in productie-navigatie.

---

## F. BEHEER (Admin-paneel, `/beheer/**`)

Eigen layout `app/(app)/beheer/layout.tsx`. Alleen toegankelijk voor `profile.role === 'admin'` (gehandhaafd in pagina's, niet in middleware).

| URL                                  | Bestand                                                  | Functie                                                  |
|--------------------------------------|----------------------------------------------------------|----------------------------------------------------------|
| `/beheer`                            | `app/(app)/beheer/page.tsx`                              | Server-redirect → `/beheer/ai`.                           |
| `/beheer/ai`                         | `app/(app)/beheer/ai/page.tsx`                           | AI-beheer (entry).                                        |
| `/beheer/ai-features`                | `app/(app)/beheer/ai-features/page.tsx`                  | Per-feature AI-instellingen.                              |
| `/beheer/aow-leeftijd`               | `app/(app)/beheer/aow-leeftijd/page.tsx`                 | AOW-leeftijd tabel.                                       |
| `/beheer/bank-connect`               | `app/(app)/beheer/bank-connect/page.tsx`                 | Bank-koppeling debug.                                     |
| `/beheer/blueprints`                 | `app/(app)/beheer/blueprints/page.tsx`                   | UI-blueprint-bibliotheek (10 page-type-archetypes).       |
| `/beheer/blueprints/[type]`          | `app/(app)/beheer/blueprints/[type]/page.tsx`            | Blueprint-detail per type.                                |
| `/beheer/briefing`                   | `app/(app)/beheer/briefing/page.tsx`                     | Briefing-engine debug.                                    |
| `/beheer/extractie-test`             | `app/(app)/beheer/extractie-test/page.tsx`               | PDF-/extractie-test.                                       |
| `/beheer/features`                   | `app/(app)/beheer/features/page.tsx`                     | Feature-flags.                                            |
| `/beheer/meldingen`                  | `app/(app)/beheer/meldingen/page.tsx`                    | Meldingen-systeem.                                        |
| `/beheer/migration`                  | `app/(app)/beheer/migration/page.tsx`                    | Datamigratie-tools.                                       |
| `/beheer/module-guide`               | `app/(app)/beheer/module-guide/page.tsx`                 | Module-gids editor.                                       |
| `/beheer/nieuws`                     | `app/(app)/beheer/nieuws/page.tsx`                       | Nieuws-feed beheer.                                       |
| `/beheer/nudges`                     | `app/(app)/beheer/nudges/page.tsx`                       | Nudges-engine.                                            |
| `/beheer/prompts`                    | `app/(app)/beheer/prompts/page.tsx`                      | AI-prompts beheer.                                        |
| `/beheer/propositie`                 | `app/(app)/beheer/propositie/page.tsx`                   | Marketing-propositie.                                     |
| `/beheer/regressietest`              | `app/(app)/beheer/regressietest/page.tsx`                | Regressie-test runner.                                    |
| `/beheer/releases`                   | `app/(app)/beheer/releases/page.tsx`                     | Release-management.                                       |
| `/beheer/roadmap`                    | `app/(app)/beheer/roadmap/page.tsx`                      | Roadmap-board.                                            |
| `/beheer/testdata`                   | `app/(app)/beheer/testdata/page.tsx`                     | Test-data seed.                                           |
| `/beheer/tiers`                      | `app/(app)/beheer/tiers/page.tsx`                        | Subscription-tiers.                                       |
| `/beheer/toegang`                    | `app/(app)/beheer/toegang/page.tsx`                      | Toegangsbeheer (rollen, accounts).                        |
| `/beheer/vragenlijsten`              | `app/(app)/beheer/vragenlijsten/page.tsx`                | Vragenlijsten-editor.                                     |
| `/beheer/widget-presets`             | `app/(app)/beheer/widget-presets/page.tsx`               | Widget-preset-bibliotheek.                                |
| `/beheer/widgets-test`               | `app/(app)/beheer/widgets-test/page.tsx`                 | Widget-rendering smoke-test.                              |
| `/beheer/will-avatar`                | `app/(app)/beheer/will-avatar/page.tsx`                  | "Will"-avatar/persona instellingen.                       |

Navigatie binnen Beheer loopt via de Beheer-layout (zijbalk/tabs); alle pagina's zijn `pagina`-type met als terugpad `/beheer` (admin-shell).

---

## G. SAMENVATTING — Routes-tree per module

```
/                                  (publiek, marketing)
├── /login, /signup, /forgot-password, /reset-password, /logout, /auth/callback, /household-invite
├── /onboarding                    (eigen route-groep)
└── (app)/                         AppHeader + BottomNav + alle providers
    ├── /dashboard                 → redirect naar /will
    ├── /will                      Will-module (1 pagina + modals)
    ├── /core/                     Kern-module
    │   ├── /core
    │   ├── /core/assets, /core/assets/[type], /core/assets/cash/[accountId]
    │   ├── /core/assets/holdings, /[id], /import
    │   ├── /core/assets/investment/[holdingId], /core/assets/crypto/[holdingId]
    │   ├── /core/assets/revalue
    │   ├── /core/cash → redirect; /core/cash/connect, /callback, /success; /core/cash/import
    │   ├── /core/budgets, /core/budgets/new, /[id] (redirect), /[id]/edit (redirect)
    │   ├── /core/debts, /core/debts/[type]
    │   ├── /core/belasting
    │   └── /core/checkin, /core/checkin/historie
    ├── /horizon/                  Horizon-module
    │   ├── /horizon
    │   ├── /horizon/strategie     → redirect ?strategie=open
    │   ├── /horizon/whatif
    │   └── /horizon/doorrekening-test (tab-layout)
    │       ├── opbouw, afbouw, overzicht, gebeurtenissen
    │       └── /  → redirect /opbouw
    ├── /identity/                 Identiteit-module (ModuleNav 7 tabs + Breadcrumb)
    │   ├── /identity, /profiel, /gids, /instellingen, /koppelingen, /testscenarios, /delen
    │   ├── /identity/jaaroverzicht
    │   ├── /identity/testscenarios/vragenlijsten, /[id]
    │   └── /identity/voortgang|widgets|parameters → redirects
    ├── /berichten, /nieuws
    ├── /rapportages, /[id], /budget, /balans
    ├── /tools/fire-sim
    ├── /beheer/*                  (admin, ~27 pagina's)
    └── /verify-feature-gating     (dev)
        en daarbuiten /holdings/[id] (notFound) + /test-* (~80 QA-routes) + /dev-preview-breadcrumb
```

---

## H. Belangrijkste vondsten / aandachtspunten

1. **Will en Horizon hebben géén breadcrumb** — alleen Kern (amber) en Identiteit (teal) tonen er een. Gebruiker oriënteert zich daar via AppHeader/BottomNav en pagina-titel.
2. **ModuleNav wordt alleen op Identiteit zichtbaar gerenderd** (7 tabs); Wil en Horizon hebben elk maar 1 tab in `lib/navigation.ts` en tonen daarom geen tab-strip; Kern heeft geen `ModuleNav`-config.
3. **Drie patronen voor "detail":**
   - Server-redirect (bv. `/core/cash`, `/dashboard`, `/horizon/strategie`).
   - Client-redirect met spinner (bv. `/core/budgets/[id]`, `/core/budgets/[id]/edit`) — gebruiker ziet ~100ms een spinner voordat de URL ververst.
   - Echte detail-pagina (bv. `/core/assets/holdings/[id]`, `/core/assets/cash/[accountId]`).
4. **Modal-via-URL-state** is het standaardpatroon (`?budget=<id>`, `?debt=<id>`, `?strategie=open`, `?via=dreamgate`). Sluiten = `router.replace()` zonder param.
5. **App-tabs in Kern** (Budgetteren, Holdings, Hypotheekplanner, Aflosstrategie, Verhuurrendement) zijn géén routes maar tabs op de categorie-pagina, geselecteerd via `?tab=<slug>`. Ze hebben wél een bijbehorende full-page ingang (bv. `/core/budgets`, `/core/assets/holdings`).
6. **Horizon kent een unieke "Dream Gate" page-transition** — alle navigatie binnen de module gebeurt via `triggerDream(href)` met een 2.4s gouden veil-animatie. Respecteert `prefers-reduced-motion`.
7. **`/will` is sinds Identity-restructure de primaire app-landing** (niet `/dashboard` meer).
8. **`/holdings/[id]` op root bestaat alleen om 404 te tonen** voor legacy bookmarks; echte holdings staan onder `/core/assets/holdings/[id]`.
9. **`/tools/fire-sim` is een niet-gemodulariseerde standalone tool** — leeft buiten de Kern/Wil/Horizon/Identity-tree maar binnen `(app)`.
10. **Beheer/admin** heeft ~27 pagina's. Toegang via `profile.role === 'admin'`; navigatie via eigen layout-shell.
11. **Test-routes (`app/test-*`)**: ~80 stuks, allemaal QA-scaffolding. Niet bedoeld voor productie-navigatie.
