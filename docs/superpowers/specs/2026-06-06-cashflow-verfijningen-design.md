# Ontwerp — Cashflow-pagina verfijningen (ronde 2)

**Datum:** 2026-06-06
**Branch:** `claude/household-integration`
**Status:** Goedgekeurd ontwerp — klaar voor implementatieplan
**Bouwt voort op:** `2026-06-06-cash-consolidatie-cashflow-design.md` (ronde 1, gemerged in dezelfde branch)

---

## 1. Aanleiding

Vier verfijningen op de nieuwe `/overzicht/budget`-landing na ronde 1:
1. Het rekeningen-deel is smaller dan de boven-/ondersecties.
2. De rekening-kaarten zijn eigen markup i.p.v. de echte bezittingen-kaart, en missen bewerk-/herwaardeer-acties.
3. Een gedeelde ("gezamenlijke") rekening verdwijnt in het persoonlijke perspectief op de cashflow-pagina (klopt wél op bezittingen).
4. Het bewerk-scherm van budget-tracked cash-rekeningen is te complex; en het instellingen-blok (inkomen/spaarquote/uitgaven) moet kassabon-gedreven worden met berekend-vs-handmatig.

## 2. Vastgelegde beslissingen (uit Q&A)

| # | Vraag | Keuze |
|---|-------|-------|
| Model 4b | Samenhang inkomen/uitgaven/spaarquote | **Alle drie los instelbaar** (Optie C): drie kassabonnen, elk berekend/handmatig; laatst-bewerkte veld wint, de afhankelijke herberekent. Inkomen = anker; uitgaven ⇄ spaarquote duaal. |
| Override-bereik | Hoe ver reikt een handmatige override | **Wint overal in de prognose** (Optie A, globaal) + **duidelijke "handmatig"-markering op de kaarten** (expliciete eis gebruiker). "Gebruik berekend" wist de override. |
| Bewerk-scherm 4a | Welk scherm versimpelen | Het **bestaande budget-tracked** "Rekening bewerken" (`AssetEditForm` in `cash-account-view.tsx`). Niet-budget cash-rekeningen houden hun bestaande simpele AssetPane-bewerking. |

## 3. Huidige staat (referentie; regelnummers indicatief)

- **Breedte:** `app/(app)/overzicht/budget/page.tsx` wrapt `<CashOverview>` in een eigen `<section className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">`; `components/app/cash-overview.tsx` root is óók `mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8` → dubbele horizontale padding.
- **Perspectief:** `components/core/assets-client.tsx` laadt via `loadPerspectiveData(supabase, perspective)` uit `lib/household/perspective-loader.ts` (RLS levert eigen + gedeeld; `stamp()` zet `_provenance` + `_myShareFraction`). `loadAllCashRekeningen` in `cash-overview.tsx` filtert daarentegen `.eq('ownership','personal')` → bug.
- **Kaart:** `components/core/vermogen-asset-card.tsx` — props `perspective/partnerName/provenance/shareFraction/aggregated`; rendert OwnershipBadge + `formatOwnershipSubline` ("Jouw aandeel: € X"). Sinds ronde 1 (T8) verbergt het de actie-rij hard via `asset.asset_type !== 'cash'`.
- **Rendement:** `assets.expected_return` bestaat; in `AssetForm` (assets-client.tsx) wordt het bij opslaan voor cash geforceerd op 0 (`isCashType ? 0 : …`). `projectPortfolio` (lib/asset-data.ts) gebruikt per-asset `expected_return` voor de lange-termijn/FIRE-projectie. De 6-mnd `buildForecast` (lib/cashflow-forecast-math.ts) gebruikt géén asset-rendement (alleen recurring in/uit).
- **Bewerk-scherm:** `AssetEditForm` in `cash-account-view.tsx` (~r.2365) — velden naam/saldo/iban/banknaam/subtype/net_worth_inclusion_pct + ontkoppelen; `handleSaveAsset` schrijft naar `assets` + `bank_accounts`. Bank-status via `bank_connection_accounts`/`bank_connections` + `SyncStatusBadge`; koppelen via `/core/cash/connect`.
- **Instellingen-blok:** `components/overview/cashflow-instellingen-blok.tsx` — inline-edit kaartjes (inkomen/spaarquote+doel/uitgaven) + live FIRE-banner. Data uit `lib/cashflow-settings-data.ts` (`estimatedAnnualIncome` 12-mnd, `savingsRate6m`, `netMonthlyIncome`, `estimatedMonthlyExpenses`).
- **Fallback:** `core-data-loader.ts` / `horizon-data-loader.ts` / `dashboard-data-loader.ts` gebruiken inline `monthlyIncome > 0 ? monthlyIncome : profile.net_monthly_income` (idem uitgaven). Kassabon-pattern: `components/app/kassabon-shell.tsx` + `BottomSheet`, voorbeelden in `cash-overview.tsx` (inkomsten/uitgaven-receipts).

## 4. Ontwerp

### 4.1 Breedte (item 1)
Verwijder de dubbele wrapper: render `<CashOverview embedded showAllCashAccounts />` in `cashflow/page.tsx` **zonder** de extra `max-w-6xl px-6`-sectie. CashOverview's eigen root (`max-w-6xl px-4 sm:px-6`) levert de breedte → lijnt met de 4 hefboom-kaarten en het instellingen-blok (alle drie één keer `max-w-6xl px-6`). Controleer dat het instellingen-blok ook één-constraint blijft.

### 4.2 Bezittingen-kaart + gedeelde-rekening-fix (items 2 + 3)
- `CashOverview` (showAllCashAccounts) laadt cash-assets via `loadPerspectiveData(supabase, perspective)` en filtert op `asset_type==='cash'`. Dit includeert gedeelde rekeningen mét `_provenance`/`_myShareFraction` (bug-fix).
- Render de échte `VermogenAssetCard` per cash-asset (vervangt de eigen markup), met `perspective`, `partnerName`, `provenance={a._provenance}`, `shareFraction={a._myShareFraction}`, `aggregated`. Anker blijft `id="rekening-<asset.id>"` (wrap of via een container met dat id, want VermogenAssetCard zet zelf geen id — gebruik een wrappende `<div id=… className="scroll-mt-24">`).
- `VermogenAssetCard`: vervang de harde `asset.asset_type !== 'cash'`-conditie op de actie-rij door een prop `hideActions?: boolean` (default false). Bezittingen geeft `hideActions` voor cash; cashflow geeft het niet (acties zichtbaar). Verifieer dat de bezittingen-aanroep (assets-client.tsx) `hideActions` voor cash meegeeft zodat die display-only blijft.
- Klik-routing op cashflow:
  - `onClick` (kaart-body): budget-tracked (asset heeft gekoppeld bank_account) → `setDetailAccountId(bankAccountId)` (bestaande CashAccountView-modal); handmatig → AssetPane (view).
  - `onEditClick` (✎): budget-tracked → open de (versimpelde) CashAccountView-edit; handmatig → AssetPane (edit).
  - `onRevalueClick` (⟳): `ValuationModal` voor het asset.
- Bank-mapping: houd een lichte `bank_accounts`-query (`id, linked_asset_id, has_budget_tracking via join`) voor de asset→bank_account-koppeling t.b.v. klik-routing + geldstroom. De geldstroom-aggregatie blijft ongewijzigd op budget-tracked rekeningen.

### 4.3 Simpeler budget-tracked cash-bewerkscherm + rendement (item 4a)
Versimpel `AssetEditForm` in `cash-account-view.tsx` tot vier secties:
1. **Naam** (tekst).
2. **Bank-koppeling:** indien gekoppeld → `SyncStatusBadge` + "Synchroniseer"/"Ontkoppel"; indien niet → "Koppel een bank" (→ `/core/cash/connect`). IBAN/banknaam read-only tonen bij gekoppelde rekening.
3. **Waarde:** huidig saldo + "Herwaardeer" (opent `ValuationModal` met historie).
4. **Verwacht rendement %** (`assets.expected_return`).
Weg: subtype, net_worth_inclusion_pct (default 100%). `handleSaveAsset` schrijft `expected_return` mee.
- Hef de cash-`expected_return = 0`-forcering op in `AssetForm` (assets-client.tsx) zodat cash een rendement kan dragen, dat via `projectPortfolio` in de FIRE/lange-termijn-prognose meetelt. (6-mnd cashflow-forecast ongewijzigd.)

### 4.4 Drie kassabonnen + interdependentie + globale override (item 4b)
Vervang de inline-kaartjes van `CashflowInstellingenBlok` door drie kassabon-modals (KassabonShell + BottomSheet):
- **Jaarinkomen** (12-mnd): per-maand breakdown → geëxtrapoleerd jaarbedrag; keuze "gebruik berekend" / "eigen bedrag".
- **Geschatte uitgaven**: breakdown (essentiële budgetten of 6-mnd transacties); keuze berekend/handmatig.
- **Spaarquote** (6-mnd): breakdown (inkomen − uitgaven + spaarbudgetten + aflossing) → %; keuze berekend/handmatig.
- **Interdependentie (Optie C):** state `monthlyIncome`, `monthlyExpenses`, `savingsRate` + `lastEdited ∈ {expenses, savingsRate}`. Regels:
  - bewerk inkomen → houd `lastEdited`; herbereken de afhankelijke (`savingsRate→expenses` of `expenses→savingsRate`).
  - bewerk uitgaven → `lastEdited='expenses'`; `savingsRate=(I−E)/I`.
  - bewerk spaarquote → `lastEdited='savingsRate'`; `expenses=I×(1−S)`.
- **Markering:** elke kaart toont duidelijk of de waarde **berekend** of **handmatig** is (badge/label) + een "gebruik berekend"-actie die de override wist.
- **Persistentie:** handmatig inkomen → `net_monthly_income` + `income_source='manual'`; handmatige uitgaven (direct of via spaarquote-afleiding) → `estimated_monthly_expenses` + `expenses_source='manual'`. Geen aparte spaarquote-opslag (afgeleid). `target_savings_rate` (doel) blijft een los veld.
- **Live FIRE-banner** blijft, gevoed door de effectieve (mogelijk overschreven) waarden.

### 4.5 Data/schema (item 5)
- Migratie: `profiles.income_source text default 'auto'`, `profiles.expenses_source text default 'auto'` (waarden `'auto'|'manual'`). Toepassen via `apply_migration` + lokaal spiegelbestand.
- Gedeelde resolver `lib/effective-financials.ts` → `resolveEffectiveIncomeExpenses(profile, txIncome, txExpenses)`:
  - `effectiveIncome = profile.income_source==='manual' ? net_monthly_income : (txIncome>0 ? txIncome : net_monthly_income)`
  - idem uitgaven met `expenses_source`/`estimated_monthly_expenses`.
  - Unit-getest.
- Vervang de inline `tx>0 ? tx : profiel`-logica in `core-data-loader.ts`, `horizon-data-loader.ts`, `dashboard-data-loader.ts` door deze resolver (DRY, globale doorwerking van overrides).
- `/api/parameters` GET geeft `income_source`/`expenses_source` terug; PUT slaat ze op via `sanitizeCashSettingsInput` (whitelist uitbreiden met de twee source-velden, waarde `'auto'|'manual'`).

## 5. Buiten scope
- Niet-budget cash-rekeningen behouden hun bestaande AssetPane-bewerking.
- De 6-mnd lineaire cashflow-forecast-engine blijft transactie-gebaseerd (asset-rendement loopt via de lange-termijn `projectPortfolio`/FIRE).
- Geen nieuwe household-functies; alleen bestaande perspectief-afhandeling hergebruiken.

## 6. Verificatie
- `npx tsc --noEmit` → geen nieuwe fouten boven de bestaande 142-baseline (household-WIP).
- Unit-tests: interdependentie-resolver (laatst-bewerkte-wint) + `resolveEffectiveIncomeExpenses` (manual-wint, auto-fallback).
- Handmatig: gedeelde rekening zichtbaar in persoonlijk perspectief op cashflow met "Jouw aandeel"; kaart-breedte gelijk aan boven/onder; VermogenAssetCard met edit/revalue op cashflow, display-only op bezittingen; kassabon override-markering + doorwerking in Horizon/dashboard; versimpeld bewerk-scherm; cash-rendement zichtbaar in FIRE.

## 7. Open implementatie-details (plan-fase)
- Exacte plek van de override-badge op de kaart (kassabon-trigger-kaart).
- Of de drie kassabonnen als aparte BottomSheets of één gecombineerde sheet renderen.
- Hoe `onEditClick` voor budget-tracked precies de CashAccountView-edit opent (directe sheet vs. via detail-modal).
