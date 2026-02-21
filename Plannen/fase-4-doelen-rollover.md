# Fase 4 — Doelen & Rollover

*Aangemaakt: 2026-02-21 | Vorige fase: Fase 3*

---

## Doel

Uitbreiding van het rollover-systeem met expliciete spaardoelen gekoppeld aan budgetten. Rollover-logica bestaat al (`lib/budget-rollover.ts`), maar doeltypen en voortgangstracking missen.

---

## Originele User Stories

| ID | Story | Prioriteit |
|----|-------|-----------|
| F4-01 | Als gebruiker wil ik een spaardoel koppelen aan een budget (bijv. €500 voor vakantie) | Hoog |
| F4-02 | Als gebruiker wil ik voortgang zien naar mijn spaardoel | Hoog |
| F4-03 | Als gebruiker wil ik een doeldatum instellen en zien of ik op schema bent | Middel |
| F4-04 | Als gebruiker wil ik overschot automatisch doorsturen naar mijn spaardoel | Middel |
| F4-05 | Als gebruiker wil ik rollover-geschiedenis inzien per budget | Middel |
| F4-06 | Als gebruiker wil ik rollover handmatig aanpassen voor uitzonderingsmaanden | Laag |

---

## Gap Analyse

| Functie | Status | Noot |
|---------|--------|------|
| Rollover types (reset/carry-over/invest-sweep) | ✅ Bestaat | `lib/budget-rollover.ts` |
| Rollover berekening | ✅ Bestaat | `computeRollover()` functie |
| Rollover UI in BudgetDetailModal | ✅ Bestaat | Carry-over weergave |
| Spaardoelen (budget-level) | ⚠️ Deels | `goals` tabel bestaat maar is losgekoppeld van budgets |
| Budget → Goal koppeling | ❌ Ontbreekt | `budget_id` kolom op `goals` tabel ontbreekt |
| Doelvoortgang per budget | ❌ Ontbreekt | Geen cumulatieve rollover-voortgang |
| Rollover-geschiedenis UI | ❌ Ontbreekt | `budget_rollovers` tabel bestaat, geen UI |

---

## Architectuurbeslissing

### Budget → Goal koppeling
Voeg `budget_id` toe aan `goals` tabel. Een goal kan dan direct worden voortgevoed door rollovers van dat budget.

```sql
ALTER TABLE goals ADD COLUMN budget_id UUID REFERENCES budgets(id) ON DELETE SET NULL;
```

### Spaardoel progress
Cumulatief carry-over bedrag over periodes = voortgang naar doel. Leesbaar uit `budget_rollovers`.

---

## Implementatiestappen

### Stap 4.1 — DB migratie: budget_id op goals
Zie architectuurbeslissing.

### Stap 4.2 — Goal aanmaken vanuit BudgetDetailModal
In budget detail modal, voeg toe:
- "Spaardoel instellen" sectie voor savings-type budgetten
- Velden: doelbedrag, doeldatum, naam
- Koppelt aan bestaand goals-systeem

### Stap 4.3 — Voortgangsbalk in BudgetDetailModal
Voor budgetten met `rollover_type = 'carry-over'` en een gekoppeld doel:
- Toon cumulatief carry-over bedrag vs. doelbedrag
- Voortgangsbalk met datum-indicator "op schema" / "achter"

### Stap 4.4 — Rollover-geschiedenis tab
In BudgetDetailModal, voeg tab toe:
- Lijst van `budget_rollovers` per periode
- Bedrag, type, datum
- Handmatige override knop

### Stap 4.5 — Overschot doorsturen naar spaardoel
In rollover-berekening (`lib/budget-rollover.ts`):
- Bij `invest-sweep`: overweeg ook koppeling aan specifiek spaardoel
- Leg overschot vast als doelbijdrage

---

## Verificatie

- [ ] Spaardoel aanmaken vanuit budget werkt
- [ ] Voortgangsbalk toont correct cumulatief bedrag
- [ ] Rollover-geschiedenis is zichtbaar per budget
- [ ] Handmatige rollover-override werkt

---

## Handoff Context → Fase 5

### DB schema na Fase 4
```sql
-- goals tabel
budget_id UUID REFERENCES budgets(id) ON DELETE SET NULL
```

### Bestanden gewijzigd
- `supabase/migrations/` — budget_id op goals
- `app/(app)/core/budgets/page.tsx` — spaardoel UI + rollover-geschiedenis

---

*Plan aangemaakt: 2026-02-21 | Gebaseerd op budgetmodule-implementatieplan.md*
