# Action Required: Replace landing test users migration

Manual steps die niet automatiseerbaar zijn — beoordeling en uitvoering door een human.

## Before Implementation

- [ ] **Bevestig productie-snapshot** — Run `select id, email, raw_user_meta_data->>'test_persona_key' from auth.users where email like '%@test.trifinity.nl' order by email` op de productie-database (via Supabase dashboard of MCP) en controleer dat exact 4 rijen terugkomen, allemaal met de oude kloon-personas. Zo niet — onverwachte state, escaleer voor analyse voor verder te gaan.

- [ ] **Beslis over auth.users-direct-SQL** — De bestaande migration `20260325000002` muteert `auth.users` direct met SQL. Bevestig dat deze conventie nog acceptabel is in dit project, of dat de nieuwe migration via de Supabase Auth Admin API zou moeten lopen. Beslissing bepaalt of de migration-template in Phase 2 nog past.

## During Implementation

- [ ] **Lokaal testen op Supabase-instance** — Spin een lokale of branch-Supabase op via `supabase start` of `mcp__supabase__create_branch` voordat je de migration in productie draait. Geen direct-to-prod toepassing zonder voorafgaande test.

- [ ] **Acceptatie-queries uitvoeren** — Run de 4 SQL-queries uit `implementation-plan.md` Phase 3 op de teststand. Alleen doorgaan naar productie als alle 4 het verwachte resultaat geven.

## After Implementation

- [ ] **Productie-verificatie** — Run dezelfde 4 acceptatie-queries op productie. Documenteer de output ergens (bv. in een PR-comment) voor audit-trail.

- [ ] **Admin-flow end-to-end test** — Log als superadmin in op productie, ga naar `/beheer/testdata`, klik door alle 4 nieuwe persona-kaarten en verifieer dat de seed-flow werkt zonder errors.

- [ ] **Geen oude data meer** — `select count(*) from profiles where full_name in ('Ronald Hoekstra', 'Bas Mulder', 'Leo Pietersen', 'Jochen Brouwer')` moet 0 zijn op productie. Idem voor losse `user_id`-checks in financial tabellen.

---

> **Note:** Deze taken staan ook in context binnen `implementation-plan.md`. Geen credential-setup of third-party config nodig — alles draait binnen Supabase.
