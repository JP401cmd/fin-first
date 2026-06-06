# Ontwerp — Spaarquote-herziening + uitgaven-berekening (cashflow-instellingen)

**Datum:** 2026-06-07
**Branch:** `claude/household-integration`
**Status:** Goedgekeurd ontwerp — klaar voor implementatieplan
**Bouwt voort op:** `2026-06-06-cashflow-verfijningen-design.md` (de kassabonnen op de cashflow-landing)

## 1. Aanleiding
Twee verfijningen aan het "Instellingen & toekomst"-blok (`components/overview/cashflow-instellingen-blok.tsx`):
1. **Spaarquote herzien:** de kaart + de "gebruik berekend"-knop tonen nu `computedRate` — een hybride van 12-maands-inkomen ÷ 6-maands-uitgaven — terwijl de kassabon-uitkomst `sixMonth.rate` (rauw 6m) toont. Die kunnen verschillen. De gebruiker wil de **canonieke 6-maands spaarquote die overal in de app gebruikt wordt** (`core.savingsRate6m`) hier zien, mét de berekening zichtbaar in de bon.
2. **Geschatte uitgaven:** de uitgaven-kassabon toont enkel "Berekend €X" — er moet een per-maand berekening (breakdown) bij, net als de inkomen- en spaarquote-bonnen.

## 2. Vastgelegde beslissingen
| # | Beslissing |
|---|-----------|
| Spaarquote-definitie | De **canonieke `savingsRate6m`**: gecorrigeerde 6-maands rate = `(inkomen − uitgaven + spaarbudget-stortingen + schuldaflossing) / inkomen` over de laatste 6 maanden. Zelfde getal als health-pijler/dashboard. |
| Overschrijfbaar | **Blijft instelbaar** (gebruiker-eis): de "eigen percentage"-lever blijft. Alleen de *berekend*-referentie + breakdown veranderen. |
| Uitgaven-breakdown | Akkoord: 6-maands per-maand breakdown in de uitgaven-kassabon. |

## 3. Huidige staat (referentie)
- `core.savingsRate6m` (line 1102) is de gecorrigeerde 6m-rate. Correctie-componenten al op `CorePageData`: `savingsBudgetTotal6m`, `debtAflossingTotal6m`, `debtAflossingItems`, en `savingsReceiptData.{extHalfYearIncome, extHalfYearExpenses, rawIncome6m, rawExpenses6m}`.
- `CashflowSettingsData` heeft al: `savingsRate6m`, `monthlyBreakdown` (12 maand-slots {label, income, expenses}), `computedMonthlyExpenses` (= extHalfYearExpenses/6).
- Component: `computedRate = (computedIncome − computedExpenses)/computedIncome` (hybride); `sixMonth` memo = rauw 6m uit `monthlyBreakdown.slice(-6)`; spaarquote-kaart toont `triple.savingsRate`; spaarquote-kassabon toont `sixMonth.*`; "gebruik berekend (computedRate%)". Uitgaven-kassabon: enkel "Berekend".

## 4. Ontwerp

### 4.1 Spaarquote = canonieke `savingsRate6m`, mét gecorrigeerde bon, blijft instelbaar
- **"Berekend"-referentie** wordt `data.savingsRate6m` (i.p.v. de hybride `computedRate`). De "gebruik berekend (X%)"-knop toont `X = savingsRate6m`.
- **Kaart-weergave:** in *auto*-modus toont de spaarquote-kaart `savingsRate6m`; in *handmatig*-modus toont 'm de door de gebruiker gezette rate (`triple.savingsRate`, rauw afgeleid van inkomen/uitgaven). De "handmatig"-badge bij override.
- **Kassabon — toont de savingsRate6m-berekening:**
  - per maand netto (`income − expenses`) voor de laatste 6 maand-slots (uit `monthlyBreakdown.slice(-6)`),
  - Σ Inkomen (6 mnd), Σ Uitgaven (6 mnd),
  - **+ Sparen in budgetten** (`savingsBudgetTotal6m`) — alleen tonen als ≠ 0,
  - **+ Schuldaflossing** (`debtAflossingTotal6m`) — alleen tonen als ≠ 0,
  - = **Gespaard** (gecorrigeerd), → **Spaarquote = `savingsRate6m`**.
- **Instelbaar (ongewijzigd mechanisme):** de "eigen percentage"-`ChoiceRow` blijft; een handmatige % zet `estimated_monthly_expenses = inkomen × (1 − %/100)` + `expenses_source='manual'` (zoals nu). "Gebruik berekend" zet `expenses_source='auto'` terug en de kaart toont weer `savingsRate6m`.
- **Bewuste nuance:** in auto-modus is de getoonde `savingsRate6m` (gecorrigeerd) hoger dan de rauwe (inkomen−uitgaven)/inkomen wanneer er spaarbudgetten/aflossing zijn — dat is correct en wordt door de +regels in de bon verklaard. De Σ-regels gebruiken de 6m-grondslag van `savingsRate6m` (`extHalfYearIncome`/`extHalfYearExpenses`); voor gebruikers met <6 mnd data kan een extrapolatie-marge bestaan tussen de losse maand-rijen en de Σ — de getoonde headline-rate blijft altijd exact `savingsRate6m`.

### 4.2 Uitgaven-kassabon: 6-maands breakdown toevoegen
- Vervang de enkele "Berekend €X"-regel door een per-maand uitgaven-breakdown (uit `monthlyBreakdown.slice(-6)`): per maand de uitgaven → **Σ Uitgaven (6 mnd)** → **≈ €X/mnd** (= `computedExpenses`, de "Berekend"-waarde). Zelfde stijl als de inkomen-/spaarquote-bon. De berekend/handmatig-`ChoiceRow` blijft ongewijzigd.

### 4.3 Data
Surface op `CashflowSettingsData` (al berekend in `core-data-loader`):
- `savingsBudgetTotal6m: number` (← `core.savingsBudgetTotal6m`)
- `debtAflossingTotal6m: number` (← `core.debtAflossingTotal6m`)
(`savingsRate6m` en `monthlyBreakdown` zijn er al; de Σ-inkomen/uitgaven-regels in de bon komen uit de bestaande `monthlyBreakdown` — geen aparte 6m-inkomen/uitgaven-velden nodig.)

## 5. Buiten scope
- Geen wijziging aan de FIRE-projectie-inputs (blijven `triple.income`/`triple.expenses`).
- Geen wijziging aan de inkomen-kassabon (12-maands breakdown blijft) of aan de bases (inkomen 12m, uitgaven 6m, spaarquote 6m).
- Geen nieuwe DB-kolommen of migraties.

## 6. Verificatie
- `npx tsc --noEmit` → geen nieuwe fouten boven de bestaande baseline.
- Bestaande lib-tests (`cashflow-settings`, `cashflow-overrides`, `effective-financials`) blijven groen; `components/overview` blijft groen.
- Handmatig: spaarquote-kaart toont hetzelfde getal als elders in de app (`savingsRate6m`); de bon's +sparen/+aflossing-regels verschijnen alleen bij niet-nul en de bon eindigt op exact dat percentage; "eigen percentage" overschrijft nog steeds (handmatig-badge + doorwerking in FIRE); uitgaven-bon toont de 6-maands breakdown die optelt tot de Berekend-waarde.
