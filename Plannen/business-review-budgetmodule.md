# Business Review — Budgetmodule Implementatieplan
*Reviewdatum: 2026-02-21 | Reviewer: Business Analyst (Claude)*

---

## Samenvatting

Het budgetmodule-implementatieplan omvat **79 user stories** verdeeld over **10 fasen**.
Op basis van analyse van de codebase, de databaseschema's en de bestaande fase-plannen
in de `Plannen/` map is de volgende globale implementatiestatus vastgesteld:

| Fase | Naam | Stories | Volledig | Deels | Niet |
|------|------|---------|----------|-------|------|
| 1 | Fundament: Rekeningen & Structuur | 9 | 3 | 4 | 2 |
| 2 | Budgetplan & Enveloptoewijzing | 10 | 8 | 0 | 2 |
| 3 | Transactiekoppeling aan Budget | 6 | 3 | 1 | 2 |
| 4 | Doelen & Rollover | 9 | 4 | 3 | 2 |
| 5 | Inter-Account Transfers | 7 | 0 | 3 | 4 |
| 6 | Terugkerende Transacties & Auto-cat. | 7 | 2 | 0 | 5 |
| 7 | Facturenkalender & Herinneringen | 5 | 0 | 1 | 4 |
| 8 | Huishouden & Multi-user | 15 | 3 | 5 | 7 |
| 9 | Templates & Onboarding | 6 | 1 | 2 | 3 |
| 10 | AI-Advieslaag | 5 | 1 | 1 | 3 |
| **Totaal** | | **79** | **25 (32%)** | **20 (25%)** | **34 (43%)** |

> **Correctie 2026-02-21:** F2-01, F2-02, F2-04, F2-06, F2-07, F2-08, F2-09, F2-10 geïmplementeerd.
> F3-03 via `UncategorizedTransactionsBanner`. Zie git history voor details.
> **Deel 2 2026-02-21:** F6-01 (`RecurringEditSheet` + patroon-detectie) en F6-05 (`CategoryRulesSheet`) geïmplementeerd.

**Conclusie:** Circa **32% volledig geïmplementeerd**, **25% deels geïmplementeerd**
(schema/backend aanwezig, UI ontbreekt of functionaliteit is incompleet),
**43% niet geïmplementeerd**.

---

## Methodologie

De review is uitgevoerd op basis van:
- Broncode analyse: `app/(app)/core/budgets/page.tsx`, `components/app/budget-form.tsx`,
  `components/app/budget-shared.tsx`, `lib/budget-data.ts`, `lib/budget-rollover.ts`,
  `lib/budget-forecast.ts`, `components/onboarding/onboarding-budgets.tsx`
- Database schema: alle 30+ tabellen in de Supabase PostgreSQL database
- Bestaande faseplannen in `Plannen/` (fase 2 t/m 10 documenten)
- AI-context bestanden: `lib/ai/context/budget-insights-context.ts`
- Template bibliotheek: `lib/budget-templates/` (4 templates)

**Beoordelingsschaal:**
- ✅ **Volledig** — Functionaliteit is volledig geïmplementeerd (schema + business logica + UI)
- 🟡 **Deels** — Schema of backend aanwezig, maar UI ontbreekt of functionaliteit is incompleet
- ❌ **Niet** — Geen implementatie aangetroffen

---

## Feature Matrix — Alle 79 User Stories

### FASE 1 — Fundament: Rekeningen & Budgetstructuur

| ID | User Story | Status | Bevinding |
|----|-----------|--------|-----------|
| F1-01 | Rekening aanmaken (naam, type, beginsaldo) | 🟡 Deels | `bank_accounts` tabel heeft `budget_role` (budget/credit/registered) ✅. UI voor typewijziging niet gecontroleerd — transactie-engine bestaat. |
| F1-02 | Rekening bewerken met waarschuwing bij typewijziging | 🟡 Deels | Bewerken mogelijk, maar expliciete waarschuwing bij typewijziging is niet gevonden in de code. |
| F1-03 | Rekening archiveren/verwijderen (met transactie-beveiliging) | 🟡 Deels | `is_active` veld aanwezig ✅. Blokkering bij verwijderen met transacties is niet aantoonbaar geïmplementeerd. |
| F1-04 | Minimaal één budgetrekening afdwingen | ❌ Niet | Geen validatieregel gevonden die dit afdwingt bij archiveren/verwijderen. |
| F1-05 | Hoofdbudget aanmaken met verplichte categorie | 🟡 Deels | `budgets` tabel met `parent_id` hiërarchie ✅. Verplichte "categorie" als apart concept (bijv. Vaste Lasten) ontbreekt — `budget_type` is enig type-veld. Categorielijst niet uitbreidbaar. |
| F1-06 | Subbudget aanmaken binnen hoofdbudget | ✅ Volledig | `parent_id` structuur aanwezig ✅. Budget form met parent-selectie ✅. Na aanmaken direct zichtbaar ✅. |
| F1-07 | Drag & drop volgorde aanpassen | 🟡 Deels | `sort_order` veld aanwezig in DB ✅. Drag & drop UI is niet gevonden in de code. |
| F1-08 | Subbudget/hoofdbudget archiveren | ✅ Volledig | `is_archived` veld aanwezig ✅. Archivering omkeerbaar ✅. Validatie (hoofdbudget pas archiveren als alle subs gearchiveerd zijn): niet aantoonbaar. |
| F1-09 | Minimaal één actief subbudget per hoofdbudget afdwingen | ❌ Niet | Geen validatieregel gevonden die dit afdwingt. |

**Fase 1 Score: 2× volledig, 5× deels, 2× niet**

---

### FASE 2 — Budgetplan & Enveloptoewijzing

| ID | User Story | Status | Bevinding |
|----|-----------|--------|-----------|
| F2-01 | Verwacht maandinkomen instellen per periode | ✅ Volledig | Via `budget_amounts` tabel per periode + BudgetAllocationModal voor instellen verwacht inkomen. |
| F2-02 | Geld verdelen over subbudgetten, Te Verdelen zichtbaar | ✅ Volledig | Te Verdelen saldo berekend en getoond in `budgets/page.tsx` (emerald/rood blok). BudgetAllocationModal voor verdeling. |
| F2-03 | Budget van vorige maand kopiëren | ❌ Niet | Geen "Kopieer vorige maand" functionaliteit gevonden. |
| F2-04 | Visuele indicator Te Verdelen = €0 (volledig verdeeld) | ✅ Volledig | Groene achtergrond bij €0 saldo (emerald), rode achtergrond bij negatief saldo. Dekkingsgraad percentage zichtbaar. |
| F2-05 | Geld verplaatsen tussen enveloppen | 🟡 Deels | “Verplaats →” knop aanwezig (opent EnvelopeTransferSheet). Flow bestaat maar is niet volledig afgetest. |
| F2-06 | Dekkingsgraad tonen (werkelijk inkomen / verwacht inkomen) | ✅ Volledig | `dekkingsgraad` berekend en getoond als percentage in het Te Verdelen blok van `budgets/page.tsx`. |
| F2-07 | Waarschuwing achterlopende dekkingsgraad | ✅ Volledig | Rode waarschuwingstekst bij `dekkingsgraad > 100%` aanwezig in `budgets/page.tsx`. |
| F2-08 | Extra inkomen (>verwacht) toevoegen aan Te Verdelen | ✅ Volledig | Extra inkomen verhoogt Te Verdelen automatisch via de berekening (inkomen − toegewezen budgetten). |
| F2-09 | Per subbudget gepland beschikbaar tonen (gebudgetteerd − uitgaven) | ✅ Volledig | `beschikbaarMap` berekend (effectieve limiet incl. rollover − spent) en getoond als "€X vrij/over" per ChildBar in `budget-tree.tsx`. |
| F2-10 | Indicator of envelop gedekt is door werkelijk inkomen | ✅ Volledig | `coverageRatio` (totalIncomeActual/totalIncome) als waarschuwingsbanner boven budget-secties. Amber bij ≥80%, rood bij <80%. |

**Fase 2 Score: 8× volledig, 0× deels, 2× niet** *(bijgewerkt 2026-02-21)*

---

### FASE 3 — Transactiekoppeling aan Budget

| ID | User Story | Status | Bevinding |
|----|-----------|--------|-----------|
| F3-01 | Subbudget kiezen bij transactie invoer | ✅ Volledig | `transactions.budget_id` aanwezig ✅. TransactionForm heeft budget-selector ✅. Saldo daalt na boeking ✅. Achteraf wijzigen mogelijk ✅. |
| F3-02 | Inkomenstransacties zonder subbudgetkoppeling | ✅ Volledig | `is_income` veld ✅. Inkomen verhoogt geen envelop maar verhoogt dekkingsgraad (voor zover die bestaat). Inkomstenbron als label: deels via budget_type=income. |
| F3-03 | Ongecategoriseerde transacties apart tonen | ✅ Volledig | `UncategorizedTransactionsBanner` toont teller + totaalbedrag op budgetpagina. Navigeert naar `/core/cash?filterBudget=uncategorized`. |
| F3-04 | Transactie splitsen over meerdere subbudgetten | 🟡 Deels | `transaction_splits` tabel aanwezig (2 rijen data) ✅. `is_split` vlag op transactions ✅. Maar split-UI in TransactionForm is niet bevestigd als volledig werkend. Fase-3 plan: "❌ Ontbreekt" voor split UI. |
| F3-05 | Bestaande transactie achteraf splitsen | ❌ Niet | Niet gevonden in de code. Fase-3 plan: nog te implementeren. |
| F3-06 | Split transactie als één regel met uitklap | ❌ Niet | Niet gevonden in de code. |

**Fase 3 Score: 3× volledig, 1× deels, 2× niet** *(gecorrigeerd 2026-02-21)*

---

### FASE 4 — Doelen & Rollover

| ID | User Story | Status | Bevinding |
|----|-----------|--------|-----------|
| F4-01 | Doeltype "Vaste Maandlast" instellen | 🟡 Deels | `goal_type = 'vaste_maandlast'` in DB schema ✅. Budget form heeft goal_type veld ✅. Maar "Gedekt/Tekort" indicator in UI is niet bevestigd. |
| F4-02 | Doeltype "Bestedingslimiet" instellen | 🟡 Deels | `goal_type = 'bestedingslimiet'` in DB ✅. Alert threshold (0-100%) aanwezig ✅. Rode weergave bij overschrijding: deels (budget pagina toont spending/limit). |
| F4-03 | Doeltype "Spaardoel" met doelbedrag en einddatum | ✅ Volledig | `goal_type = 'spaardoel'` ✅. `goal_amount` en `goal_date` aanwezig ✅. Goals koppeling via `goals` tabel + `budget_id` ✅. Voortgangscalculatie aanwezig ✅. |
| F4-04 | Doeltype "Maandelijkse Reservering" | ✅ Volledig | `goal_type = 'maandelijkse_reservering'` ✅. Rollover `carry-over` type zorgt voor opbouw ✅. `budget_rollovers` tabel ✅. |
| F4-05 | Doeltype "Periodieke Last" (sinking fund) | 🟡 Deels | `goal_type = 'periodieke_last'` ✅. `goal_frequency` (jaarlijks/halfjaarlijks/kwartaal) ✅. Reset-cyclus na uitgave is niet bevestigd geïmplementeerd. |
| F4-06 | Rollover aan/uit per subbudget | ✅ Volledig | `rollover_type` (reset/carry-over/invest-sweep) ✅. `lib/budget-rollover.ts` met `computeRollover()` ✅. Toggle in budget form ✅. |
| F4-07 | Rollover-aan: saldo meenemen naar volgende maand | ✅ Volledig | `computeRollover()` logica ✅. `budget_rollovers` tabel ✅. Rollover als apart bedrag zichtbaar in budget page ✅. |
| F4-08 | Rollover-uit: overschot naar Te Verdelen | ❌ Niet | "Te Verdelen" concept ontbreekt → kan niet volledig werken. Schema wel aanwezig (rollover_type=reset). |
| F4-09 | Maandovergang rollover overzicht | ❌ Niet | Geen "eerste bezoek nieuwe maand" overzicht gevonden. |

**Fase 4 Score: 4× volledig, 3× deels, 2× niet**

---

### FASE 5 — Inter-Account Transfers

| ID | User Story | Status | Bevinding |
|----|-----------|--------|-----------|
| F5-01 | Transfer aanmaken (bron, doel, bedrag, datum) | 🟡 Deels | `transactions.transaction_type = 'transfer'` ✅. `linked_transfer_id` voor gekoppelde boekingen ✅. `transfer-confirm-sheet.tsx` component aanwezig ✅. Maar volledige "Transfer aanmaken" flow met 2 gekoppelde boekingen: niet bevestigd. |
| F5-02 | Budget→Budget transfer zonder budgetimpact | ❌ Niet | Logica voor rekeningtype-gebaseerde budgetimpact niet gevonden. |
| F5-03 | Budget→Geregistreerd transfer met budgetimpact (subbudget verplicht) | 🟡 Deels | `bank_accounts.budget_role` (budget/credit/registered) aanwezig als basis ✅. Maar verplichte subbudget-koppeling bij deze transfercombinatie: niet gevonden. |
| F5-04 | Geregistreerd→Budget transfer naar Te Verdelen | ❌ Niet | Te Verdelen concept ontbreekt → niet implementeerbaar. |
| F5-05 | Budget→Schuld als aflossing zonder dubbele budgetimpact | ❌ Niet | Niet gevonden. `budget_role = 'credit'` als basis aanwezig. |
| F5-06 | Wijziging transfer past beide boekingen aan | ❌ Niet | Cascade-update logica niet gevonden. |
| F5-07 | Transfers herkenbaar in transactielijst | 🟡 Deels | `transaction_type = 'transfer'` als visueel onderscheid mogelijk ✅. Tegenrekening zichtbaar via linked_transfer_id ✅. Filterfunctionaliteit: deels. |

**Fase 5 Score: 0× volledig, 3× deels, 4× niet**

---

### FASE 6 — Terugkerende Transacties & Auto-categorisatie

| ID | User Story | Status | Bevinding |
|----|-----------|--------|-----------|
| F6-01 | Terugkerende transactie instellen | ✅ Volledig | `RecurringEditSheet` component geïmplementeerd ✅. Patronen detecteren via `/api/detect-recurring` ✅. Beheer-UI met aanmaken, bewerken en deactiveren in cash/page.tsx ✅. |
| F6-02 | Automatisch aanmaken vs herinnering | ❌ Niet | `recurring_transactions` heeft geen `auto_apply` of `reminder_only` vlag. Logica niet gevonden. |
| F6-03 | Matching binnenkomende transactie met verwachte | ❌ Niet | Matching-algoritme (tegenpartij + bedrag ±10% + datum ±5 dagen) niet gevonden. |
| F6-04 | Waarschuwing uitblijvende terugkerende transactie | ❌ Niet | Geen alert/notification systeem voor uitblijvende transacties. |
| F6-05 | Categorisatieregels op basis van tegenpartij | ✅ Volledig | `CategoryRulesSheet` component geïmplementeerd ✅. CRUD op `category_corrections` tabel (aanmaken, verwijderen, auto_apply toggle) ✅. Toegankelijk via Tag-knop in recurring sectie ✅. |
| F6-06 | Voorstel aanmaken regel na handmatige categorisatie | ❌ Niet | Geen UX-flow voor regelvoorstel gevonden. |
| F6-07 | Bulk-categorisering ongecategoriseerde transacties | ❌ Niet | Geen multi-select + bulk-toewijzing in transactielijst gevonden. Fase-3 plan: "❌ Ontbreekt". |

**Fase 6 Score: 2× volledig, 0× deels, 5× niet**

---

### FASE 7 — Facturenkalender & Herinneringen

| ID | User Story | Status | Bevinding |
|----|-----------|--------|-----------|
| F7-01 | Kalenderweergave verwachte transacties | 🟡 Deels | `components/app/bill-calendar.tsx` bestaat als untracked bestand → in actieve ontwikkeling. Maar niet geïntegreerd in de app. |
| F7-02 | Verwacht resultaat per dag/week/maand (cashflow) | ❌ Niet | Niet geïmplementeerd. Vereist F6 (recurring transactions). |
| F7-03 | Handmatig eenmalige verwachte transactie toevoegen | ❌ Niet | Geen apart concept voor "verwachte eenmalige transacties" gevonden. |
| F7-04 | Herinneringen per terugkerende transactie (X dagen van tevoren) | ❌ Niet | Geen notification/reminder systeem gevonden. |
| F7-05 | Maandelijkse herinnering bij Te Verdelen > €0 | ❌ Niet | Te Verdelen ontbreekt + geen reminder systeem. |

**Fase 7 Score: 0× volledig, 1× deels, 4× niet**

---

### FASE 8 — Huishouden & Multi-user

| ID | User Story | Status | Bevinding |
|----|-----------|--------|-----------|
| F8-01 | Huishouden aanmaken en leden uitnodigen | 🟡 Deels | `households`, `household_members`, `household_invitations` tabellen aanwezig ✅. Maar 0 huishoudens in productie → flow is gebouwd maar niet actief gebruikt. |
| F8-02 | Rollen toewijzen (beheerder/lid/beperkt lid) | 🟡 Deels | `household_members.role` heeft alleen 'owner' of 'member' — "beperkt lid" rol ontbreekt ⚠️. |
| F8-03 | Lid verwijderen met bevestiging | ❌ Niet | Geen verwijder-flow met waarschuwing gevonden. |
| F8-04 | Rekeningen markeren als gedeeld/persoonlijk | ✅ Volledig | `bank_accounts.ownership` (personal/shared) ✅. `household_id` koppeling ✅. |
| F8-05 | Persoonlijke rekeningen privacybescherming | ❌ Niet | Geen "beheerder-inzage" instelling per huishouden gevonden. |
| F8-06 | Subbudgetten gedeeld/persoonlijk markeren | ✅ Volledig | `budgets.ownership` (personal/shared) ✅. `household_id` ✅. Visuele scheiding in budgetoverzicht: aanwezig via ownership-toggle. |
| F8-07 | Transacties boeken op gedeelde subbudgetten | 🟡 Deels | `transactions.ownership` ✅. Wie de transactie invoerde: deels via `user_id` op transactie. |
| F8-08 | Persoonlijke enveloppen gevoed vanuit gedeeld budget | ❌ Niet | Geen mechanisme om persoonlijke envelop te voeden vanuit gedeeld Te Verdelen. |
| F8-09 | Verdeelsleutel instellen | 🟡 Deels | `households.split_mode` (equal/income_ratio/custom/one_carries_all) ✅. `custom_split_pct` ✅. Maar UI om verdeelsleutel in te stellen is niet bevestigd. |
| F8-10 | Lid ziet eigen bijdragestatus | ❌ Niet | Geen per-lid bijdrageoverzicht gevonden. |
| F8-11 | Automatische verrekenpost bij gedeelde uitgave van persoonlijke rekening | ❌ Niet | Geen verrekensysteem gevonden. |
| F8-12 | Verrekenoverzicht per lid | ❌ Niet | Geen verrekenoverzicht gevonden. |
| F8-13 | Verrekenpost afwikkelen | ❌ Niet | Geen verrekenafwikkeling gevonden. |
| F8-14 | Alleenstaande gebruiker zonder huishouden | ✅ Volledig | `profiles.household_type` (solo/samen/gezin) ✅. Solo-flow werkt volledig zonder huishouden. |
| F8-15 | Huisgenoten met gemengde gedeeld/privé structuur | 🟡 Deels | Schema aanwezig (ownership velden op alle entiteiten). Verdeelsleutel voor gedeeld deel aanwezig. Verrekening ontbreekt. |

**Fase 8 Score: 3× volledig, 5× deels, 7× niet**

---

### FASE 9 — Templates & Onboarding

| ID | User Story | Status | Bevinding |
|----|-----------|--------|-----------|
| F9-01 | Template kiezen bij start | ✅ Volledig | `lib/budget-templates/` met 4 templates (starter, gezin, zzp, pensioen) ✅. `onboarding-budgets.tsx` met templatekeuze ✅. Volledige structuur aangemaakt na keuze ✅. |
| F9-02 | Template aanpassen na laden | 🟡 Deels | Budgets zijn bewerkbaar na laden ✅. Maar of aanpassing direct in de onboarding-wizard zit: deels (handmatige bewerking later mogelijk). |
| F9-03 | Template "Samenwonend/Gezin" met persoonlijke enveloppen per partner | ❌ Niet | Template vraagt niet naar huishoudsamensamenstelling. Geen automatische per-partner enveloppen. |
| F9-04 | Eigen structuur opslaan als template | ❌ Niet | Geen "Opslaan als template" functionaliteit gevonden. Geen deelcode. |
| F9-05 | Stapsgewijze onboarding wizard (7 stappen) | 🟡 Deels | Onboarding flow bestaat ✅. Maar de volledige 7-staps wizard (stap 2: rekening aanmaken, stap 4: verwacht inkomen, stap 6: terugkerende transacties) is niet volledig — mist stappen die afhangen van F2 (inkomen) en F6 (recurring). |
| F9-06 | Wizard afbreken en hervatten | ❌ Niet | Geen voortgangsopslag per stap gevonden. |

**Fase 9 Score: 1× volledig, 2× deels, 3× niet**

---

### FASE 10 — AI-Advieslaag

| ID | User Story | Status | Bevinding |
|----|-----------|--------|-----------|
| F10-01 | Dagelijkse evaluatie budgetdata tegen adviesregels | 🟡 Deels | `lib/ai/context/budget-insights-context.ts` met budget alerts (overschreden, bijna vol), 12-maands trends, NIBUD vergelijking ✅. Maar "dagelijkse evaluatie" als scheduler-mechanisme: niet gevonden. Wordt per sessie geëvalueerd. |
| F10-02 | Persoonlijk advies op basis van werkelijke data | ✅ Volledig | Budget insights context met concrete bedragen ✅. NIBUD benchmarking per budget-slug ✅. Freedom-day impact per budget ✅. Advies via AI-assistenten (Fhin/Finn/Ffin) ✅. |
| F10-03 | Frequentie en type adviezen instellen | ❌ Niet | Geen per-gebruiker advies-instellingen gevonden. |
| F10-04 | Waarschuwing bij dekkingsgraadproblemen | ❌ Niet | Dekkingsgraad concept (F2-06) ontbreekt → niet implementeerbaar. |
| F10-05 | Maandelijkse budgetsamenvatting | ❌ Niet | Geen automatisch gegenereerde maandelijkse samenvatting gevonden. |

**Fase 10 Score: 1× volledig, 1× deels, 3× niet**

---

## Gap-analyse: Kritieke Ontbrekende Functionaliteiten

### 1. "Te Verdelen" Concept (YNAB-stijl) — KRITIEK
**Impact:** Raakt F2-01 t/m F2-08, F4-08, F5-04, F7-05 (in totaal ~13 stories)

Het concept van verwacht maandinkomen + envelope-allocatie + "Te Verdelen" saldo
is de kern van de budgetmodule maar volledig afwezig. Het huidige systeem gebruikt
vaste limieten per budget zonder het allocatie-concept.

### 2. Dekkingsgraad — KRITIEK
**Impact:** F2-06, F2-07, F2-09, F2-10, F10-04 (5 stories)

Mist volledig. Berekening verwacht inkomen vs. werkelijk ontvangen is nergens
geïmplementeerd.

### 3. Terugkerende Transacties (UI) — HOOG
**Impact:** F6-01 t/m F6-07 (7 stories)

Schema aanwezig (`recurring_transactions` tabel), maar geen UI om ze aan te maken
of te beheren. 0 rijen in productie.

### 4. Facturenkalender — HOOG
**Impact:** F7-01 t/m F7-05 (5 stories)

`bill-calendar.tsx` is in ontwikkeling maar niet geïntegreerd. Afhankelijk van F6.

### 5. Verrekensysteem (Household) — MIDDEL
**Impact:** F8-11, F8-12, F8-13 (3 stories)

Volledig afwezig. Fundamenteel voor huishoudbudgettering.

### 6. Split Transacties UI — MIDDEL
**Impact:** F3-04, F3-05, F3-06 (3 stories)

Schema aanwezig, 2 testsplits in DB, maar volledige UI is niet bevestigd aanwezig.

### 7. Envelop-naar-envelop verplaatsing — MIDDEL
**Impact:** F2-05 (1 story)

Technisch mogelijk maar geen dedicated UI.

---

## Voortgang vs. Fase-documentatie

De `Plannen/` map bevat al uitgewerkte implementatieplannen voor fase 2-10.
Deze documenten zijn aangemaakt op 2026-02-21 en bevatten gap-analyses die
overeenkomen met deze bevindingen. De plannen zijn klaar voor uitvoering.

| Fase | Plan document | Gap-analyse kwaliteit |
|------|--------------|----------------------|
| 2 | fase-2-budgetplan-enveloptoewijzing.md | ✅ Volledig en accuraat |
| 3 | fase-3-transactiekoppeling.md | ✅ Volledig en accuraat |
| 4 | fase-4-doelen-rollover.md | ✅ Aanwezig |
| 5 | fase-5-inter-account-transfers.md | ✅ Aanwezig |
| 6 | fase-6-terugkerende-transacties.md | ✅ Aanwezig |
| 7 | fase-7-facturenkalender.md | ✅ Aanwezig |
| 8 | fase-8-huishouden-multiuser.md | ✅ Aanwezig |
| 9 | fase-9-templates-onboarding.md | ✅ Aanwezig |
| 10 | fase-10-ai-advieslaag.md | ✅ Aanwezig |

---

## Aanbevelingen

### Prioriteit 1: Te Verdelen + Dekkingsgraad (Fase 2)
Zonder dit concept missen de fasen 2, 4 (deels), 5 en 7 hun functionele basis.
Implementeer eerst het YNAB-stijl Te Verdelen concept voor maximaal doorstroom-effect.

### Prioriteit 2: Split Transacties UI (Fase 3)
Schema is gereed. Implementatie van de UI heeft hoge impact op dagelijks gebruik.

### Prioriteit 3: Terugkerende Transacties UI (Fase 6)
Schema is gereed. Bouwt de fundering voor fase 7 (kalender).

### Prioriteit 4: Fase 8 Verrekensysteem
Vereist aparte tabel `settlement_entries`. Hoge businesswaarde voor huishoudens.

---

*Rapport gegenereerd: 2026-02-21 | Gebaseerd op codebase-analyse + Supabase schema-inspectie*
*Bronbestanden: budgetmodule-implementatieplan.md + codebase TriFinity v0.71*
