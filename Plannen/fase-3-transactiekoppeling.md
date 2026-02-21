# Fase 3 — Transactiekoppeling

*Aangemaakt: 2026-02-21 | Vorige fase: Fase 2*

---

## Doel

Verbetering van de transactie-naar-budget koppeling. Het kerngemis is splits: één transactie verdelen over meerdere budgetten. Daarnaast verbetering van handmatige categorisering en matching.

---

## Originele User Stories

| ID | Story | Prioriteit |
|----|-------|-----------|
| F3-01 | Als gebruiker wil ik een transactie splitsen over meerdere budgetten | Hoog |
| F3-02 | Als gebruiker wil ik suggesties krijgen voor budget-koppeling op basis van historische data | Hoog |
| F3-03 | Als gebruiker wil ik snel transacties categoriseren via bulk-actie | Middel |
| F3-04 | Als gebruiker wil ik een "ongecategoriseerd" filter om gemiste transacties te vinden | Hoog |
| F3-05 | Als gebruiker wil ik een regel aanmaken (tegenpartij → budget) die automatisch categoriseert | Middel |
| F3-06 | Als gebruiker wil ik terugkerende betalingen automatisch aan het juiste budget koppelen | Middel |

---

## Gap Analyse

| Functie | Status | Noot |
|---------|--------|------|
| Budget_id koppeling via TransactionForm | ✅ Bestaat | `components/app/transaction-form.tsx` |
| Ongecategoriseerd filter | ✅ Bestaat | Filter op `budget_id = null` |
| Suggesties op basis van tegenpartij | ❌ Ontbreekt | Geen matching-logica |
| Split transacties | ❌ Ontbreekt | `transactions` tabel ondersteunt geen splits |
| Categorisatieregels (tegenpartij → budget) | ❌ Ontbreekt | `category_corrections` tabel bestaat maar is basis |
| Bulk-categorisering | ❌ Ontbreekt | Geen multi-select in transactielijst |

---

## Architectuurbeslissing

### Split transacties
Splits vereisen een extra tabel of een zelf-referentie op `transactions`. Aanbeveling:
```sql
CREATE TABLE transaction_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  budget_id UUID REFERENCES budgets(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```
En `transactions.is_split BOOLEAN DEFAULT false` als vlag.

### Categorisatieregels
De `category_corrections` tabel bestaat al. Uitbreiden met `auto_apply BOOLEAN` voor automatische toepassing bij import.

---

## Implementatiestappen

### Stap 3.1 — DB migratie: transaction_splits + is_split vlag
Zie architectuurbeslissing hierboven.

### Stap 3.2 — Split UI in TransactionForm
In `components/app/transaction-form.tsx`:
- Voeg "Splits toevoegen" knop toe
- Bij splits: toon N regels met budget-selector + bedrag
- Validatie: som van splits moet gelijk zijn aan totaal transactiebedrag

### Stap 3.3 — Suggesties op basis van tegenpartij
In de budget-selector dropdown:
- Zoek meest recente koppeling voor dezelfde `counterparty_name`
- Toon als "Eerder: [budgetnaam]" suggestie bovenin de lijst

### Stap 3.4 — Bulk-categorisering
In `app/(app)/core/cash/page.tsx`:
- Voeg checkbox toe aan elke transactierij (toggle-modus)
- "Categoriseer alle geselecteerde" dropdown-actie
- Past budget_id bulk toe via Supabase update

### Stap 3.5 — Automatische regels
In `app/(app)/core/cash/page.tsx` bij import/opslaan:
- Controleer `category_corrections` op tegenpartij-match
- Pas automatisch budget_id toe als `auto_apply = true`

---

## Verificatie

- [ ] Split transactie aanmaken werkt, som = totaal
- [ ] Transactie-suggestie verschijnt bij bekende tegenpartij
- [ ] Bulk-categorisering werkt op geselecteerde transacties
- [ ] Automatische regel past toe bij nieuwe transactie met bekende tegenpartij

---

## Handoff Context → Fase 4

### DB schema na Fase 3
```sql
-- transactions tabel
is_split BOOLEAN DEFAULT false

-- Nieuwe tabel
transaction_splits (id, transaction_id, budget_id, amount, description, created_at)
```

### Bestanden gewijzigd
- `app/(app)/core/cash/page.tsx` — bulk-categorisering + auto-regels
- `components/app/transaction-form.tsx` — split UI
- `supabase/migrations/` — transaction_splits migratie

---

*Plan aangemaakt: 2026-02-21 | Gebaseerd op budgetmodule-implementatieplan.md*
