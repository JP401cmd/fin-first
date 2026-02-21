# Fase 9 — Templates & Onboarding

*Aangemaakt: 2026-02-21 | Vorige fase: Fase 4 (parallel)*

---

## Doel

Verbetering van de onboarding-ervaring en toevoeging van budget-templates voor verschillende levenssituaties.

---

## Originele User Stories

| ID | Story | Prioriteit |
|----|-------|-----------|
| F9-01 | Als nieuwe gebruiker wil ik een template kiezen die past bij mijn situatie | Hoog |
| F9-02 | Als gebruiker wil ik de standaard budgetten aanpassen tijdens onboarding | Hoog |
| F9-03 | Als gebruiker wil ik een bestaand budget als template opslaan | Middel |
| F9-04 | Als gebruiker wil ik een template importeren in een bestaand account | Middel |
| F9-05 | Als gebruiker wil ik de NIBUD-richtlijnen zien als referentie bij budget instellen | Laag |

---

## Gap Analyse

| Functie | Status | Noot |
|---------|--------|------|
| Default budgets seeding | ✅ Bestaat | `getDefaultBudgets()` in `lib/budget-data.ts` |
| Onboarding multi-step flow | ✅ Bestaat | `/onboarding` pagina |
| NIBUD referentiedata | ✅ Bestaat | `nibud_reference_data` tabel + migratie 20260213 |
| Template-keuze bij onboarding | ❌ Ontbreekt | Alleen 1 standaard template |
| Budget aanpassen tijdens onboarding | ⚠️ Deels | Mini-formulier aanwezig maar beperkt |
| Template opslaan | ❌ Ontbreekt | Geen template-export functie |
| Template importeren | ❌ Ontbreekt | Geen import-flow |

---

## Architectuurbeslissing

### Template systeem
Templates zijn sets van budgetten. Implementeer als JSON-bestanden in de codebase (geen DB):
```
lib/budget-templates/
  starter.ts      -- Klein budget, huur, basisboodschappen
  gezin.ts        -- Kinderen, school, hogere vaste lasten
  zzp.ts          -- Onregelmatig inkomen, zakelijke kosten
  pensioen.ts     -- Lagere inkomsten, meer vrije tijd
```

---

## Implementatiestappen

### Stap 9.1 — Template bestanden aanmaken
Maak 4 templates in `lib/budget-templates/`:
- Structuur identiek aan `getDefaultBudgets()` return type
- Aanpassen voor doelgroep (bedrags, categorieën)

### Stap 9.2 — Template-keuze in onboarding
In `/onboarding`, stap "Budgetten":
- Toon 4 template-kaarten met titel + omschrijving
- Selecteer template → pre-fill budget-bedragen
- "Aanpassen" stap na selectie

### Stap 9.3 — NIBUD referentie weergave
In BudgetEditModal, naast het bedrag-veld:
- Toon NIBUD-richtlijn voor dit budget-type
- Query `nibud_reference_data` op budget-categorie

### Stap 9.4 — Template opslaan
In budgetpagina, menu "Meer opties":
- "Sla huidige budgetten op als template" → download JSON of lokale opslag

---

## Verificatie

- [ ] 4 templates beschikbaar in onboarding
- [ ] Template-selectie pre-fills budgetbedragen
- [ ] NIBUD richtlijn zichtbaar in BudgetEditModal

---

*Plan aangemaakt: 2026-02-21 | Gebaseerd op budgetmodule-implementatieplan.md*
