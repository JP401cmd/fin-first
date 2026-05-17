# Implementation Plan: Replace landing test users migration

## Overview

Schrijf één forward-migration die de 4 oude kloon-test-users uit `auth.users` verwijdert en 4 nieuwe lifecycle-test-users seedt, in lijn met de gereduceerde persona-set in de codebase. Idempotent, productie-veilig, en alleen scoped op `*@test.trifinity.nl`-emails.

## Phase 1: Onderzoek & voorbereiding

Verifieer de huidige database-staat en FK-cascade-keten voordat we de migration schrijven.

### Tasks

- [ ] Query productie-snapshot van bestaande test-users (gebruik `mcp__supabase__execute_sql`): `select id, email, raw_user_meta_data->'test_persona_key' as persona_key, created_at from auth.users where email like '%@test.trifinity.nl' order by email`. Documenteer de exacte UUIDs + persona-keys voor referentie.
- [ ] Inventariseer FK-cascade-keten op `auth.users.id`: query `pg_constraint` (zie Technical Details) voor alle FK's met cascade-delete-actie. Lijst de keten op: welke tabellen verwijderen automatisch vs. handmatig?
- [ ] Check of er dependent data is voor de oude users: per oude UUID, count rijen in `profiles`, `assets`, `debts`, `transactions`, `budgets`, `goals`, `life_events`, `net_worth_snapshots`. Doel: weten of cascade alles afhandelt of dat we expliciet moeten opruimen.
- [ ] Bevestig dat geen productie-account de email-pattern `%@test.trifinity.nl` heeft buiten de 4 oude. Een mismatch hier zou catastrofaal zijn — `select count(*) from auth.users where email like '%@test.trifinity.nl'` moet exact 4 zijn.

### Technical Details

**Query voor FK-cascade-inventarisatie:**

```sql
select
  conrelid::regclass as table_name,
  conname as constraint_name,
  confdeltype as delete_action,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'f'
  and confrelid = 'auth.users'::regclass
order by conrelid::regclass::text;
```

`confdeltype`-waarden: `c` = CASCADE, `r` = RESTRICT, `n` = SET NULL, `d` = SET DEFAULT, `a` = NO ACTION.

**Verwachte cascade-keten** (op basis van migration-history):

- `auth.users` → `profiles.id` (CASCADE)
- `profiles.id` → `assets.user_id`, `debts.user_id`, `bank_accounts.user_id`, `budgets.user_id`, `transactions.user_id`, `goals.user_id`, `life_events.user_id`, `net_worth_snapshots.user_id`, `balance_snapshots.user_id`, `holding_alerts.user_id`, `target_allocations.user_id`, `valuations.user_id`, `recommendations.user_id`, `actions.user_id`, `recurring_transactions.user_id`, `budget_rollovers.user_id` — meeste cascade via FK naar profiles.

**Bron-van-waarheid voor nieuwe set** (`lib/test-personas.ts`):

```ts
export const PERSONA_KEYS: PersonaKey[] = ['daan', 'lisa', 'willem', 'marijke']
```

## Phase 2: Migration schrijven

Schrijf de forward-migration die de oude users verwijdert en de nieuwe seedt.

### Tasks

- [ ] Genereer een nieuwe migration-file met naam `supabase/migrations/{YYYYMMDDHHMMSS}_replace_landing_test_users.sql` (timestamp moet later zijn dan `20260325000002` zodat hij na de originele draait). Voor lokale Supabase CLI: `supabase migration new replace_landing_test_users`.
- [ ] Schrijf de DELETE-block: verwijder de 4 oude users uit `auth.users` via emails (niet UUIDs, want UUIDs verschillen per omgeving). Gebruik `IN`-clause met de 4 emails, scope alleen op `email like '%@test.trifinity.nl'` als extra safety net.
- [ ] Schrijf de INSERT-block voor de 4 nieuwe users in `auth.users`. Volg exact de structuur van de oude migration (DO-block, instance_id, aud='authenticated', role='authenticated', email_confirmed_at=now(), encrypted_password als bcrypt-stub, raw_user_meta_data met `test_persona_key`). Gebruik `ON CONFLICT (email) DO NOTHING` voor idempotency.
- [ ] Schrijf de matching `profiles`-INSERT met `ON CONFLICT (id) DO NOTHING`. De `profiles.id` moet matchen met de gegenereerde `auth.users.id` — gebruik een CTE of subquery die de zojuist-aangemaakte user-IDs opvist via email.
- [ ] Verifieer dat `full_name` en andere verplichte profile-velden zijn ingevuld (kijk in de oude migration welke kolommen NOT NULL zijn).
- [ ] Voeg een header-comment toe bovenaan de migration met: doel, datum, plan-referentie (`specs/replace-landing-test-users-migration/`), en de 4 nieuwe emails. Volg de stijl van de oude migration.

### Technical Details

**Migration-skelet** (gebaseerd op `20260325000002_create_landing_test_users.sql`):

```sql
-- Migration: replace_landing_test_users
-- Doel: vervang de 4 kloon-test-users (ronald/bas/leo/jochen) door de 4 lifecycle-test-users (daan/lisa/willem/marijke)
-- Plan: specs/replace-landing-test-users-migration/

-- ── Stap 1: Verwijder oude kloon-test-users ──
DELETE FROM auth.users
WHERE email IN (
  'ronald@test.trifinity.nl',
  'bas@test.trifinity.nl',
  'leo@test.trifinity.nl',
  'jochen@test.trifinity.nl'
)
AND email LIKE '%@test.trifinity.nl';

-- ── Stap 2: Seed 4 nieuwe lifecycle-test-users ──
DO $$
DECLARE
  v_users JSONB := '[
    {"email": "daan@test.trifinity.nl",    "name": "Daan Bakker",     "persona": "daan"},
    {"email": "lisa@test.trifinity.nl",    "name": "Lisa de Groot",   "persona": "lisa"},
    {"email": "willem@test.trifinity.nl",  "name": "Willem Jansen",   "persona": "willem"},
    {"email": "marijke@test.trifinity.nl", "name": "Marijke Vermeer", "persona": "marijke"}
  ]'::JSONB;
  v_user JSONB;
  v_user_id UUID;
BEGIN
  FOR v_user IN SELECT * FROM jsonb_array_elements(v_users)
  LOOP
    -- Insert auth.users
    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated', 'authenticated',
      v_user->>'email',
      crypt('test-password-' || (v_user->>'persona'), gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object(
        'full_name', v_user->>'name',
        'test_persona_key', v_user->>'persona'
      ),
      now(), now(),
      '', '', '', ''
    )
    ON CONFLICT (email) DO NOTHING
    RETURNING id INTO v_user_id;

    -- Skip profile-insert als user al bestond
    IF v_user_id IS NULL THEN
      SELECT id INTO v_user_id FROM auth.users WHERE email = v_user->>'email';
    END IF;

    -- Insert profiles
    INSERT INTO profiles (id, full_name, created_at, updated_at)
    VALUES (
      v_user_id,
      v_user->>'name',
      now(), now()
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;
```

**Belangrijk**: dit is een skelet — de exacte kolommen + defaults voor `auth.users` moeten worden gekopieerd uit de bestaande `20260325000002`-migration om geen veld over te slaan dat NOT NULL is. Lees die file eerst.

**Plek voor file**: `supabase/migrations/{YYYYMMDDHHMMSS}_replace_landing_test_users.sql` — bepaal timestamp via `Get-Date -Format "yyyyMMddHHmmss"` in PowerShell of `date +%Y%m%d%H%M%S` op Unix. Moet later zijn dan `20260325000002`.

## Phase 3: Verificatie & deployment

Test de migration op een veilige omgeving en verifieer de eindstaat voordat deze in productie landt.

### Tasks

- [ ] Test lokaal: spin een lokale Supabase op (`supabase start`), seed met de productie-snapshot of een kloon, run `supabase db reset` of `supabase migration up`. Verifieer dat de migration zonder errors draait.
- [ ] Run de acceptatie-query: `select email from auth.users where email like '%@test.trifinity.nl' order by email` moet exact de 4 nieuwe emails teruggeven.
- [ ] Verifieer cascade-cleanup: `select count(*) from profiles where id not in (select id from auth.users)` moet 0 zijn. Idem voor `assets`, `debts`, `transactions` met `user_id` joins.
- [ ] Verifieer dat alleen test-emails geraakt zijn: `select count(*) from auth.users where email not like '%@test.trifinity.nl'` moet onveranderd zijn t.o.v. de pre-migration count.
- [ ] Test idempotency: draai de migration een tweede keer (`supabase migration up` opnieuw). Mag geen errors geven, mag de bestaande 4 nieuwe rijen niet beschadigen.
- [ ] Test de admin-flow end-to-end: log in als superadmin, navigeer naar `/beheer/testdata`, klik op één van de 4 nieuwe persona-kaarten, verifieer dat de seed werkt en data correct wordt aangemaakt.
- [ ] Maak een Supabase preview-branch via `mcp__supabase__create_branch` als sanity-check op productie-niveau. Run de migration daar, verifieer met `mcp__supabase__execute_sql`, merge of trash.
- [ ] Commit de migration via standaard git-flow. Push naar `preview` of `master` afhankelijk van project-conventie.

### Technical Details

**Lokale Supabase test-commands:**

```powershell
# Reset lokale db met alle migrations
supabase db reset

# Of: alleen nieuwe migrations toepassen
supabase migration up

# Run acceptatie-query
supabase db query "select email from auth.users where email like '%@test.trifinity.nl' order by email"
```

**Supabase branch-flow (via MCP):**

```
mcp__supabase__create_branch — maak feature-branch
mcp__supabase__apply_migration — apply de nieuwe migration
mcp__supabase__execute_sql — run acceptatie-queries
mcp__supabase__merge_branch / delete_branch — afronding
```

**Acceptatie-queries** (run na migration):

```sql
-- Test 1: exact 4 nieuwe test-users
SELECT email FROM auth.users
WHERE email LIKE '%@test.trifinity.nl'
ORDER BY email;
-- Verwacht: daan@..., lisa@..., marijke@..., willem@...

-- Test 2: geen dangling profile-rijen
SELECT COUNT(*) FROM profiles
WHERE id NOT IN (SELECT id FROM auth.users);
-- Verwacht: 0

-- Test 3: geen dangling user-data
SELECT 'assets' as table, COUNT(*) FROM assets WHERE user_id NOT IN (SELECT id FROM auth.users)
UNION ALL
SELECT 'debts', COUNT(*) FROM debts WHERE user_id NOT IN (SELECT id FROM auth.users)
UNION ALL
SELECT 'transactions', COUNT(*) FROM transactions WHERE user_id NOT IN (SELECT id FROM auth.users);
-- Verwacht: alle counts 0

-- Test 4: test_persona_key match
SELECT email, raw_user_meta_data->>'test_persona_key' as persona
FROM auth.users
WHERE email LIKE '%@test.trifinity.nl'
ORDER BY email;
-- Verwacht: 4 rijen waarvan elk persona-veld matcht email-prefix
```

**Rollback-strategie** (als migration ergens faalt):

Geen automatische rollback in Supabase migrations. Bij failure:
1. Identificeer de failing stap uit de error message.
2. Schrijf een correctie-migration (geen back-revert van deze) die de partial state opruimt.
3. Re-run.

De DELETE-stap is veilig herhaalbaar (idempotent door `IN`-filter). De INSERT-stap is veilig herhaalbaar via `ON CONFLICT DO NOTHING`.
