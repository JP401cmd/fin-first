# Requirements: Replace landing test users migration

## Achtergrond

De persona-reductie van 10 → 4 is uitgevoerd (zie commit-set rondom `wil-je-de-test-zazzy-horizon.md` plan). Code en regression-suites zijn bijgewerkt, maar de Supabase auth-database bevat nog test-user-rijen van de oude kloon-set.

De migration `supabase/migrations/20260325000002_create_landing_test_users.sql` heeft in productie (commit `b40dc7e8`) hardcoded `auth.users`-rijen aangemaakt voor de 4 kloon-personas:

- `ronald@test.trifinity.nl`
- `bas@test.trifinity.nl`
- `leo@test.trifinity.nl`
- `jochen@test.trifinity.nl`

Elk met `test_persona_key` in `raw_user_meta_data`. Die personas zijn nu uit de codebase verwijderd, dus deze 4 rijen leven als dangling test-accounts en kunnen geen valide seed-data meer ontvangen (de `PERSONA_KEYS`-array kent ze niet meer).

## Doel

Een nieuwe forward-migration die de productie-database in lijn brengt met de nieuwe code-set: oude users weg, nieuwe 4 users gezaaid, klaar voor de `app/api/admin/test-users/create`-flow.

## Acceptatiecriteria

1. **Schoon draaien**: migration draait zonder errors op een productie-kloon (lokaal getest via Supabase CLI of branch).
2. **Eindstaat auth.users**: na uitvoering geeft `select email from auth.users where email like '%@test.trifinity.nl' order by email` exact deze 4 rijen:
   - `daan@test.trifinity.nl`
   - `lisa@test.trifinity.nl`
   - `marijke@test.trifinity.nl`
   - `willem@test.trifinity.nl`
3. **Geen dangling data**: financial data van de oude 4 users (profiles, assets, debts, transactions, etc.) is via FK-cascade verwijderd. Geen wees-rijen met `user_id` van Ronald/Bas/Leo/Jochen.
4. **`raw_user_meta_data.test_persona_key`** van de 4 nieuwe rijen matcht `'daan' | 'lisa' | 'willem' | 'marijke'` precies (consistent met `PERSONA_KEYS` in `lib/test-personas.ts`).
5. **Idempotent**: migration kan veilig opnieuw gedraaid worden (`ON CONFLICT DO NOTHING` op `INSERT`, `IF EXISTS` op `DELETE`).
6. **Echte gebruikers onaangeroerd**: alleen `*@test.trifinity.nl`-emails worden aangepast. `jpsmit@jps-holding.nl` en andere productie-accounts blijven exact zoals ze zijn.
7. **Consistent met `app/api/admin/test-users/create/route.ts`**: de hardcoded array daar matcht 1-op-1 de 4 nieuwe rijen.

## Out of scope

- Rebuilding van de auth-user-creation-flow zelf
- Wijzigen van de bestaande `20260325000002_*.sql` (immutable history)
- Wijziging van de admin-route die test-users aanmaakt (al consistent na de persona-reductie)
- Nieuwe seed-strategie voor demo-data — alleen auth-rijen + cascade-cleanup
- Recovery-sovereignty-coverage (bewust niet in deze testset)

## Gerelateerde files

- `supabase/migrations/20260325000002_create_landing_test_users.sql` — bestaande migration als referentie voor de SQL-structuur (DO-block, INSERT INTO auth.users, etc.)
- `app/api/admin/test-users/create/route.ts` — consumer, regel 7-10 hardcoded array met de nieuwe 4
- `lib/test-personas.ts` — bron-van-waarheid voor de 4 valide `PERSONA_KEYS` (`daan`, `lisa`, `willem`, `marijke`)
- `C:\Users\janpa\.claude\plans\wil-je-de-test-zazzy-horizon.md` — plan-bestand van de persona-reductie

## Aandachtspunten

- **Direct SQL op `auth.users`**: normaal is dit alleen via Supabase Auth API toegestaan, maar de bestaande `20260325000002`-migration heeft de precedent gezet (DO-block + raw INSERT). Volg die conventie voor consistentie.
- **FK-cascade**: verifieer welke tabellen `ON DELETE CASCADE` hebben op `auth.users` voordat je vertrouwt op cascade-cleanup. `profiles` heeft het zeker; `assets`/`debts`/`transactions` lopen via `user_id` → `profiles.id` → cascade.
- **Encrypted/blind-indexed velden**: nieuwe users hebben geen seed-data nodig in deze migration. Hun financial data wordt later via de admin-route gegenereerd. Alleen auth.users + (lege) profiles-rij.
