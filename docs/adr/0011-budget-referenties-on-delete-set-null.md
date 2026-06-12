---
id: 0011-budget-referenties-on-delete-set-null
title: Budget-FK's — ON DELETE SET NULL voor referentie-data, CASCADE voor levenscyclus-data
status: aanvaard
date: 2026-06-12
elements: [as-budget, data-cont]
---

FK's naar `budgets(id)` krijgen ON DELETE SET NULL (referentie-data: transacties, doelen, leer-regels) of CASCADE (levenscyclus-data: bedragen, rollovers, ouder-kind-relaties) — nooit de default NO ACTION. Alle tabelstructuur gaat via migraties in de repo; anders is ze onzichtbaar op de ERD-plaat en ontsnapt ze aan de convention-check.

## Context

`category_corrections.budget_id` had als enige van 9 budget-FK's geen explicit ON DELETE-gedrag (tabel was via het Supabase-dashboard aangemaakt, geen migratiebestand). Gevolg:

1. **Runtime-fout:** een budget verwijderen faalde zodra er een leer-regel naar verwees — PostgreSQL gooit standaard een fout bij NO ACTION als er nog refererende rijen zijn.
2. **ERD-blindheid:** `scanTableRelations` leest FK's uitsluitend uit `supabase/migrations/*.sql`; de tabel was volledig onzichtbaar op de architectuurplaat. Dat is precies hoe de convention-check omzeild wordt zonder dat iemand het opmerkt.

## Besluit

**1. Conventie voor budget-FK's:**

| Type relatie | ON DELETE | Redenering |
|---|---|---|
| Referentie-data (transacties, doelen, leer-regels) | SET NULL | De rij heeft zelfstandige betekenis; het kwijtraken van het budgetdoelwit is geen reden om de rij te verwijderen. Kennis blijft behouden, doelwit valt weg. |
| Levenscyclus-data (budget_amounts, rollovers, parent_id) | CASCADE | De rij bestaat alleen als onderdeel van het budget; zonder budget geen betekenis. |
| Nooit | NO ACTION (default) | Stille fout bij verwijderen; onherleidbaar voor de developer en fout voor de gebruiker. |

**2. `category_corrections` specifiek:** `budget_id` wordt nullable + FK ON DELETE SET NULL (migratie `20260612010000`). De match_field + match_value (de geleerde herkenningskennis) blijft behouden; alleen de koppeling naar het budget valt weg. Een toekomstige categoriseer-run kan de leer-regel opnieuw koppelen of de gebruiker kan hem handmatig toewijzen.

**3. Alle tabelstructuur via migraties in de repo.** Een tabel die buiten de migratiehistorie bestaat — bv. via het Supabase-dashboard aangemaakt — is onzichtbaar voor:
- `scanTableRelations` → geen FK's op de ERD-plaat
- Code-review en convention-checks
- Lokale `supabase db reset` (schema-drift)

De canonieke definitie van `category_corrections` is nu idempotent vastgelegd in de repo (CREATE TABLE IF NOT EXISTS + RLS-policy + constraint + indexen). Op de bestaande remote is de CREATE een no-op; alleen de FK-correctie muteert.

## Gevolgen

- Bij verwijderen van een budget worden leer-regels (category_corrections), transactie-budget-koppelingen en doelen-koppelingen automatisch ontkoppeld (SET NULL) in plaats van dat de delete faalt of de regels meeverwijderd worden.
- De ERD-plaat toont `category_corrections` nu correct met zijn FK naar `budgets` na `npm run arch:diagram`.
- Nieuw te maken tabellen met een FK naar `budgets(id)` moeten expliciet kiezen tussen SET NULL en CASCADE en de keuze beargumenteren in de migratie-commentaar.
- Het bestaande `migration-drift`-concern in `archimate-concerns.ts` dekt dit risico-klasse; geen nieuw concern nodig.
