# Fase 2 — Budgetplan & Enveloptoewijzing

*Aangemaakt: 2026-02-21 | Vorige fase: Fase 1*

---

## Doel

Fase 2 introduceert het "Te Verdelen" concept — de YNAB-stijl allocatielaag bovenop het bestaande limietsysteem. Gebruikers verdelen het verwachte maandinkomen over hun budgetten, zodat er een "Te Verdelen" saldo zichtbaar is.

---

## Originele User Stories (uit budgetmodule-implementatieplan.md)

| ID | Story | Prioriteit |
|----|-------|-----------|
| F2-01 | Als gebruiker wil ik mijn verwachte maandinkomen instellen per periode | Hoog |
| F2-02 | Als gebruiker wil ik zien hoeveel ik nog niet heb toegewezen (Te Verdelen) | Hoog |
| F2-03 | Als gebruiker wil ik snel alle budgetten toewijzen vanuit één overzicht | Hoog |
| F2-04 | Als gebruiker wil ik een waarschuwing als ik meer toewijs dan ik verwacht te verdienen | Hoog |
| F2-05 | Als gebruiker wil ik het toegewezen bedrag aanpassen zonder alle budgetten opnieuw in te stellen | Middel |
| F2-06 | Als gebruiker wil ik zien wat de dekkingsgraad is (toegewezen / totale limieten) | Middel |
| F2-07 | Als gebruiker wil ik het budgetplan als startpunt gebruiken, niet als hard limiet | Middel |

---

## Gap Analyse

| Functie | Status | Noot |
|---------|--------|------|
| Verwacht inkomen per periode | ❌ Ontbreekt | Inkomen budget bestaat, maar geen "Te Verdelen" saldo |
| "Te Verdelen" berekening | ❌ Ontbreekt | Inkomen - som van alle expense/savings/debt limieten |
| Dekkingsgraad | ❌ Ontbreekt | % van inkomen dat is toegewezen |
| Bulk-toewijzing UI | ❌ Ontbreekt | Snelle verdeling vanuit maandoverzicht |
| Overschot-waarschuwing | ❌ Ontbreekt | Alert als limieten > inkomen |
| Budget_amounts periode-override | ✅ Bestaat | Kan gebruikt worden voor periode-specifieke allocaties |

---

## Architectuurbeslissing

Het bestaande systeem gebruikt `default_limit` + `budget_amounts` voor limieten. "Te Verdelen" is een UI-concept: `verwacht_inkomen - som(expense/savings/debt limieten)`.

**Geen nieuwe tabel nodig.** Het `verwacht_inkomen` staat al in het inkomen-budget als `default_limit`. De berekening is:
```
Te Verdelen = som(inkomen limieten) - som(expense + savings + debt limieten)
```

**Nieuw veld nodig:** `monthly_income_target` op `profiles` tabel of gebruik het bestaande inkomen-budget. Aanbeveling: gebruik bestaande inkomen-budget.

---

## Implementatiestappen

### Stap 2.1 — "Te Verdelen" banner in de budgetpagina
In `app/(app)/core/budgets/page.tsx`, voeg toe aan de maandoverzicht sectie:
- Bereken: `toeWijzen = totalIncome - (totalExpenseBudget + totalSavingsBudget + totalDebtBudget)`
- Toon als groene banner bij positief saldo, rode banner bij negatief
- Label: "Te Verdelen" | subtext: "Vrij inkomen deze maand"

### Stap 2.2 — Dekkingsgraad KPI
Voeg toe aan de 4-kolom statistieken sectie:
```
Dekkingsgraad = (totalExpenseBudget + totalSavingsBudget + totalDebtBudget) / totalIncome * 100
```
Toon als percentage met kleurindicator (groen <95%, oranje 95-105%, rood >105%).

### Stap 2.3 — Snelle toewijzing modal
Knop "Budgetplan instellen" → modal met:
- Inkomen-veld (pre-filled met huidige inkomen-budget)
- Slider/input per budget-groep
- Live "Te Verdelen" counter
- Opslaan via `budget_amounts` tabel (period-specifiek)

### Stap 2.4 — Overschot-waarschuwing
Bij openen van budgetpagina: als dekkingsgraad > 100%, toon inline waarschuwing met actie-link naar Stap 2.3. Will kan via de chat proactief adviseren als overschot structureel is.

---

## Verificatie

- [ ] "Te Verdelen" toont correct positief/negatief saldo
- [ ] Dekkingsgraad berekening klopt
- [ ] Snelle toewijzing slaat op in budget_amounts
- [ ] Overschot-waarschuwing verschijnt bij >100% dekkingsgraad

---

## Handoff Context → Fase 3

### DB schema na Fase 2
Geen wijzigingen — alles via bestaande `budget_amounts` tabel.

### Bestanden gewijzigd
- `app/(app)/core/budgets/page.tsx` — Te Verdelen banner + dekkingsgraad KPI + toewijzingsmodal

### Startpunt voor Fase 3 (Transactiekoppeling)
Fase 3 focust op splits transacties en verbetering van de handmatige koppeling. Lees eerst:
- `app/(app)/core/cash/page.tsx` — huidige transactie-koppeling flow
- `components/app/transaction-form.tsx` — transactieformulier
- `transactions` tabel schema in Supabase

---

*Plan aangemaakt: 2026-02-21 | Gebaseerd op budgetmodule-implementatieplan.md*
