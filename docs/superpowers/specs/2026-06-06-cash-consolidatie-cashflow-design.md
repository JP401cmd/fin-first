# Ontwerp — Cash consolideren op de cashflow-pagina

**Datum:** 2026-06-06
**Branch (huidig):** `claude/household-integration`
**Status:** Goedgekeurd ontwerp — klaar voor implementatieplan

---

## 1. Aanleiding & doel

Cash-rekeningen worden vandaag op twee plekken "verdiept" beheerd:

- **`/core/assets/cash`** (asset-categoriepagina) — met een rijk cash-overzicht
  (Rekeningen-lijst, geldstroom-banner, CashflowChart, kengetallen) én een
  **Budgetteren-tab**.
- **`/overzicht/cashflow`** — een hub met vier hefboom-kaarten (Budget,
  Transacties, Vaste lasten, Forecast) die deeplinken naar sub-routes, waarvan
  `/overzicht/cashflow/budget` exact dezelfde budget-functionaliteit biedt als
  de Budgetteren-tab hierboven.

Dat is de dubbeling. Cash-rekeningen horen thuis op de cashflow-pagina — dat is
de plek voor cash, met én zonder budgetteren.

**Doel:** alle inzicht, info en bewerking voor cash-rekeningen consolideren op
`/overzicht/cashflow`. De bezittingen-pagina blijft cash tonen als *waarde*
(onderdeel van het vermogen), maar de verdieping verhuist volledig naar
cashflow. De cashflow-pagina wordt bovendien uitgebreid met instellingen + info
voor geschat jaarinkomen, spaarquote en (bij gebrek aan budgetten) geschatte
uitgaven, inclusief de live impact op de toekomst (FIRE).

---

## 2. Vastgelegde beslissingen

| # | Vraag | Keuze |
|---|-------|-------|
| 1 | Informatie-architectuur cashflow-landing | **Rijke landing**: volledig cash-overzicht onder het inspiratieblok; de 4 hefboom-kaarten blijven bovenaan als "ga dieper"-navigatie. Landing = samenvatting, sub-routes = detail. |
| 2 | Klik-bestemming vanaf bezittingen | **Landing + focus**: klik op cash-rekening → `/overzicht/cashflow#rekening-<assetId>` (scroll + markeer die rekening). Oude routes redirecten hierheen. |
| 3 | Diepte instellingen-blok | **Volledig instelbaar + live FIRE-impact**: jaarinkomen + geschatte uitgaven inline bewerkbaar (schrijven naar `profiles`), spaarquote afgeleid getoond + instelbaar doel, live herberekende FIRE-leeftijd bij wijziging. |

**Aanvullende akkoorden:**
- §2 — cash-kaarten op bezittingen worden **display-only** (inline bewerk/herwaardeer-knoppen weg).
- §5 — `CoreKengetallen` wordt **niet apart** getoond op cashflow; het nieuwe instellingen-blok subsumeert inkomen/uitgaven.
- §6 — de per-rekening detailpagina (`cash-account-view` via `/core/assets/cash/[accountId]`) vervalt; focus-op-landing vervangt 'm.
- §6 — de **Budgetten-tab** op `/core/assets/cash` vervalt expliciet; budgetbeheer leeft op het bestaande `/overzicht/cashflow/budget`.

---

## 3. Huidige staat (referentie)

Bestandsverwijzingen zijn indicatief; regelnummers kunnen verschuiven.

### Bezittingen-overzicht
- Route: `app/(app)/overzicht/bezittingen/page.tsx` → `components/overview/bezittingen-view.tsx` → `components/core/assets-client.tsx`.
- Cash-categorie-header: `CategoryGroupHeader` met `href={`/core/assets/${type}`}` (cash → `/core/assets/cash`).
- Kaart-klik: `handleAssetClick(asset)` → `router.push(`/core/assets/${asset.asset_type}?asset=${asset.id}`)`.
- Kaart-component: `components/core/vermogen-asset-card.tsx` (heeft inline bewerk- + herwaardeer-knoppen).
- Header-component: `components/core/category-group-header.tsx` — props `{ href, label, iconName, iconColor, total }`.

### Cash-categoriepagina `/core/assets/cash`
- Route: `app/(app)/core/assets/[type]/page.tsx` (server, dynamisch voor álle asset-types).
- Client: `components/core/asset-category-page.tsx` — `CategoryHero`, `CategoryTabs` (Rekeningen | Budgetteren), `ItemsTab` (grid `VermogenAssetCard`), `CashOverview` (embedded), `CoreKengetallen`.
- Budgetteren-tab: `components/core/deepenings/cash-budgetteren-tab.tsx`, geregistreerd in `components/core/category-deepening-registry.ts`.
- Per-rekening detail: `app/(app)/core/assets/cash/[accountId]/page.tsx` → `components/app/cash-account-view.tsx`.

### Cashflow-landing `/overzicht/cashflow`
- Route: `app/(app)/overzicht/cashflow/page.tsx` (server). Laadt `loadDashboardData`, `loadCashflowData(supabase, perspective)`, `loadVasteLastenSummary`; bouwt kaarten via `buildCashflowCards`.
- Rendert: titel "Je geldstroom" + `PerspectiveContextLabel`, `CashflowLandingCards`, en — bij `baselineExpenses >= 500` — het inspiratieblok `InflationImpactCard`.
- Sub-routes: `/budget`, `/transacties`, `/vaste-lasten`, `/forecast`.

### Cash-overzicht component
- `components/app/cash-overview.tsx` (client). Props: `embedded`, `onNavigateToAccount`, `hideAccountsSection`, `hideQuickActions`.
- Laadt zelf `bank_accounts` (alleen waar `linked_asset.has_budget_tracking === true`), `budgets`, `transactions`; perspectief-bewust via `usePerspective`. Heeft al een geneste detail-modal (`detailAccountId`).

### Inkomen / spaarquote / uitgaven
- **Jaarinkomen:** `profiles.net_monthly_income`; bij voorkeur afgeleid uit 12-mnd-transacties (extrapolatie in `lib/horizon-data-loader.ts`). UI vandaag op `/identity/profiel`. `GET /api/parameters` geeft het terug; **PUT slaat het nu niet op**.
- **Spaarquote:** volledig afgeleid (`computeSavingsRate` in `lib/core-metrics.ts`; 6-mnd in `lib/horizon-data-loader.ts`; net-worth-delta-variant `computeSavingsRateFromNetWorthDelta`). Niet opgeslagen.
- **Geschatte uitgaven:** `profiles.estimated_monthly_expenses`, `retirement_expense_method`, `retirement_expense_custom_amount`. Logica: `computeRetirementExpenses` in `lib/budget-utils.ts`. UI vandaag in onboarding / `/toekomst`. **Niet** in `/api/parameters` PUT.
- **Toekomst-impact:** `computeFireProjection` (`lib/horizon-data.ts`), `resolveFireParams` (`lib/fire-params.ts`); volledige projectie via `runSimulation` / `runUnifiedProjection`.

---

## 4. Ontwerp per surface

### 4.1 Bezittingen-pagina (blijft compleet)
- Cash-categorie blijft tonen met saldo's; telt mee in totaal vermogen. Geen wijziging aan weergave/telling.
- Cash-categorie-header: `href` wordt `/overzicht/cashflow` (conditioneel op `type === 'cash'`; overige types ongewijzigd).
- Kaart-klik: voor `asset_type === 'cash'` → `router.push(`/overzicht/cashflow#rekening-${asset.id}`)`; overige types ongewijzigd.
- Cash-kaarten **display-only**: `VermogenAssetCard` verbergt inline bewerk- + herwaardeer-knoppen wanneer `asset_type === 'cash'` (via prop of interne conditie). Andere types behouden hun knoppen.

### 4.2 Cashflow-landing — nieuwe opbouw (boven → onder)
1. Titel "Je geldstroom" + perspectief-label *(ongewijzigd)*.
2. 4 hefboom-kaarten *(ongewijzigd — "ga dieper")*.
3. Inspiratieblok `InflationImpactCard` *(ongewijzigd; zelfde conditie)*.
4. **NIEUW — Rekeningen + geldstroom:** `<CashOverview embedded />`. Toont alle cashrekeningen (incl. handmatige), geldstroom-banner (Inkomen/Uitgaven/Saldo/Spaarquote — deze maand), CashflowChart, quick actions (importeren/koppelen).
5. **NIEUW — Instellingen & toekomst** (zie §4.4).

### 4.3 Rekening-focus & redirects
- `CashOverview` rekening-kaarten krijgen `id="rekening-<assetId>"`. Bij laden met matchende `location.hash`: scroll-into-view + tijdelijke highlight.
- **`CashOverview` verbreden** zodat álle cash-rekeningen verschijnen — ook handmatige cash-assets zonder `bank_account`/budget-tracking. (Vandaag filtert het op `has_budget_tracking === true`.) De geldstroom-aggregaties blijven gebaseerd op rekeningen met transacties; handmatige cash-assets verschijnen als saldo-kaart zonder transactie-stroom.
- `/core/assets/cash` → `redirect('/overzicht/cashflow')` (alleen wanneer `type === 'cash'`; de generieke `[type]`-route blijft voor alle andere types werken).
- `/core/assets/cash/[accountId]` → redirect naar `/overzicht/cashflow#rekening-<assetId>` (map `accountId` → gekoppeld `assetId`; valt terug op de landing zonder hash als de mapping ontbreekt).

### 4.4 Instellingen & toekomst-blok (nieuw component)
Eén blok onderaan de landing dat info én instellingen bundelt:

- **Geschat jaarinkomen** — toont de afgeleide waarde (12-mnd-extrapolatie of profiel-schatting) met context-label; inline bewerken schrijft naar `profiles.net_monthly_income`.
- **Spaarquote** — afgeleide 6-mnd-waarde getoond; daarnaast een instelbare **doel-spaarquote** (nieuwe kolom `profiles.target_savings_rate`). Toont voortgang t.o.v. doel.
- **Geschatte uitgaven** — inline bewerken schrijft naar `profiles.estimated_monthly_expenses` (+ `retirement_expense_method`, optioneel `retirement_expense_custom_amount`); valt terug op de schatting wanneer er geen budgetten zijn.
- **Live FIRE-impact** — bij elke wijziging direct herberekende FIRE-leeftijd/datum, client-side via `computeFireProjection` + `resolveFireParams` (lichtgewicht preview; de volledige `runSimulation`-projectie blijft op Horizon).
- **Geen aparte `CoreKengetallen`** op deze pagina — dit blok is dé plek voor inkomen/uitgaven. (De geldstroom-banner toont "deze maand"; dit blok 6-mnd-gemiddelde + doel + instellingen — verschillende tijdvensters, complementair, geen dubbeling.)

### 4.5 Opruimen (ontdubbelen)
- Budgetteren-tab voor cash verwijderd: `cash-budgetteren-tab.tsx` + de cash-entry in `category-deepening-registry.ts`. Budgetbeheer leeft op `/overzicht/cashflow/budget`.
- Per-rekening detail (`cash-account-view` via `/core/assets/cash/[accountId]`) vervalt; focus-op-landing vervangt 'm. In de plan-fase beslissen: behouden als embedded detail-modal binnen `CashOverview` (bestaande `detailAccountId`-modal) óf verwijderen. Voorkeur: hergebruiken als detail-modal mits dat goedkoop is, anders verwijderen.
- Dode code (componenten/route-bestanden die nergens meer renderen) expliciet markeren of verwijderen.

---

## 5. Datamodel- & API-wijzigingen

### Migratie
- Nieuwe kolom `profiles.target_savings_rate numeric NULL` (doel-spaarquote, in procenten). Toepassen via `apply_migration` (remote), kolommen vooraf checken i.v.m. migratie-drift tussen lokale map en remote.

### API `/api/parameters`
- **PUT** uitbreiden zodat het ook opslaat: `net_monthly_income`, `estimated_monthly_expenses`, `retirement_expense_method`, `retirement_expense_custom_amount`, `target_savings_rate` (met validatie/whitelist per veld).
- **GET** uitbreiden zodat het deze velden teruggeeft (income geeft het al terug; rest toevoegen).
- Geen wijziging aan de bestaande `expected_return` / `inflation_rate` / box3-velden.

---

## 6. Componenten & hergebruik

- **Hergebruik** `CashOverview` (embedded), `CashflowChart` (binnen `CashOverview`), de freedom-time-primitieven — geen duplicatie van geldstroom-UI.
- **Nieuw** instellingen-blok-component (werknaam `CashflowInstellingenBlok`) dat inkomen/spaarquote/uitgaven + live FIRE-impact bundelt. Client-component met optimistic inline edit → `PUT /api/parameters`.
- **Server-data:** de landing laadt aanvullend de defaults voor het instellingen-blok (afgeleid jaarinkomen, 6-mnd spaarquote, geschatte uitgaven, FIRE-baseline) server-side mee (hergebruik bestaande loaders, bijv. uit `loadDashboardData` / `loadCoreData` / `loadCashflowData`). `CashOverview` blijft z'n eigen transacties/rekeningen client-side laden.
- **Perspectief-bewust:** `usePerspective` / `getServerPerspective` blijven leidend; compatibel met de household-branch.

---

## 7. Verificatie

- `npx tsc --noEmit`.
- Relevante vitest-suites: cashflow, `asset-data`, `financial-health`, en eventuele tests rond `cashflow-cards` / parameters.
- Handmatige check:
  - Klikpad bezittingen → cashflow met correcte focus/highlight op de gekozen rekening.
  - Beide redirects (`/core/assets/cash`, `/core/assets/cash/[accountId]`).
  - Handmatige cash-assets verschijnen op de landing.
  - Inline bewerken inkomen/uitgaven/doel → opgeslagen in `profiles` → live FIRE-impact update zonder reload.
  - Andere asset-types op bezittingen ongewijzigd (klik + bewerk-knoppen intact).

---

## 8. Buiten scope

- Geen nieuwe household-functies; alleen bestaande perspectief-afhandeling hergebruiken.
- Geen wijziging aan de FIRE-engine zelf; de live preview gebruikt de bestaande `computeFireProjection`.
- Geen wijziging aan de cashflow-sub-routes (budget/transacties/vaste-lasten/forecast) behalve waar ze van de opgeruimde verdieping afhankelijk waren.

---

## 9. Open implementatie-details (voor plan-fase)

- Exacte sleutel voor de focus-hash (`assetId` vs. `bank_account.id`) en de mapping in de `[accountId]`-redirect.
- Wel/niet behouden van `cash-account-view` als embedded detail-modal.
- Precieze plek/vorm van de doel-spaarquote-voortgang in de UI.
- Of het instellingen-blok de FIRE-baseline uit een bestaande client-hook (`use-horizon-fire-sim`) haalt of een eigen lichte berekening doet.
