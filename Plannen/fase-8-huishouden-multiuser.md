# Fase 8 — Huishouden & Multi-user

*Aangemaakt: 2026-02-21 | Vorige fase: Fase 5*

---

## Doel

Activeren van de huishouden-functionaliteit voor het delen van budgetten en inzichten tussen partners. De database-structuur is al aanwezig maar de UI-logica ontbreekt grotendeels.

---

## Originele User Stories

| ID | Story | Prioriteit |
|----|-------|-----------|
| F8-01 | Als gebruiker wil ik een huishouden aanmaken en een partner uitnodigen | Hoog |
| F8-02 | Als gebruiker wil ik kiezen welke budgetten gedeeld zijn en welke persoonlijk | Hoog |
| F8-03 | Als gebruiker wil ik het gecombineerde overzicht zien van ons huishouden | Hoog |
| F8-04 | Als gebruiker wil ik mijn eigen transacties gescheiden zien van die van mijn partner | Middel |
| F8-05 | Als gebruiker wil ik een bijdrage-percentage instellen per budget | Laag |

---

## Gap Analyse

| Functie | Status | Noot |
|---------|--------|------|
| `household_id` op budgets/bank_accounts | ✅ Bestaat | Migratie 20260218000001 |
| Ownership toggle (personal/shared) | ✅ Bestaat | `OwnershipToggle` component + `ownership` kolom |
| `selected_perspective` op profiles | ✅ Bestaat | Migratie 20260218000002 |
| Huishouden aanmaken flow | ❌ Ontbreekt | Geen invite/join systeem |
| Gecombineerd overzicht | ❌ Ontbreekt | Filtering op household_id ontbreekt in de meeste queries |
| Partner-transacties zichtbaar | ❌ Ontbreekt | Transacties zijn altijd user-gebonden |
| Bijdrage-percentages | ❌ Ontbreekt | Geen budget-level percentage-veld |

---

## Architectuurbeslissing

### Household invite systeem
Voeg tabel toe voor uitnodigingen:
```sql
CREATE TABLE household_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL,
  inviter_user_id UUID REFERENCES auth.users(id),
  invite_email TEXT NOT NULL,
  invite_token TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days')
);
```

---

## Implementatiestappen

### Stap 8.1 — DB migratie: household_invites
Zie architectuurbeslissing.

### Stap 8.2 — Huishouden aanmaken UI
In `/identity` pagina:
- Knop "Huishouden starten"
- Formulier: naam huishouden
- Genereer invite-link met token
- Email-veld voor uitnodiging

### Stap 8.3 — Perspective selector activeren
`selected_perspective` bestaat al op profiles. Activeer UI:
- In navigatie: switcher "Persoonlijk | Huishouden"
- Filter queries op perspective

### Stap 8.4 — Budget ownership filtering
In `loadBudgets()`:
- Bij perspective = 'personal': toon alleen `ownership = 'personal'`
- Bij perspective = 'household': toon alles

---

## Verificatie

- [ ] Huishouden aanmaken en partner uitnodigen werkt
- [ ] Perspective switcher filtert budgetten correct
- [ ] Gedeelde budgetten zijn zichtbaar voor beide partners

---

*Plan aangemaakt: 2026-02-21 | Gebaseerd op budgetmodule-implementatieplan.md*
