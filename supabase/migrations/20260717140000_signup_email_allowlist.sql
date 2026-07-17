-- Registratie-allowlist voor de besloten testfase (ADR 0047).
--
-- Tijdens de besloten testfase mag alleen wie is uitgenodigd een account
-- aanmaken. Elke nieuwe registratie (e-mail/wachtwoord én Google-OAuth) wordt
-- op GoTrue-niveau geweigerd via de Supabase `before_user_created`-auth-hook
-- (functie hieronder), tenzij het genormaliseerde adres (lower(trim(email)),
-- exacte match) op deze tabel staat. Bewust GEEN `BEFORE INSERT`-trigger op
-- auth.users: die zou de nette foutmelding verliezen en ook seeds/admin-
-- createUser raken (zie ADR 0047, optie A vs. B).
--
-- Aanzetten van de hook gebeurt LATER handmatig via het Dashboard
-- (Authentication → Hooks → Before User Created → public.<functie>). Deze
-- migratie levert alleen tabel + functie + seed; config.toml blijft bewust
-- ongemoeid (geen config-push-afhankelijkheid, ADR 0045). Exit = hook uitzetten
-- in het Dashboard, geen migratieteruggraaf.

-- ── 1. Allowlist-tabel (platform/beheer-control-plane) ────────────────────────
-- Niet client-leesbaar: RLS aan, GEEN anon/authenticated-policy. Beheer
-- leest/schrijft via getServiceClient (BYPASSRLS, ADR 0006). Alleen de
-- hook-rol supabase_auth_admin krijgt leesrecht (zie policy hieronder), zoals
-- de Supabase-docs voorschrijven ("alter your RLS policies to allow the
-- supabase_auth_admin role").

create table if not exists public.signup_email_allowlist (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null unique,   -- match-sleutel = lower(trim(email))
  label text,                              -- notitie/wie/waarom
  created_by uuid references auth.users(id) on delete set null,  -- provenance, geen ownership
  created_at timestamptz not null default now()
);

alter table public.signup_email_allowlist enable row level security;

-- Defense-in-depth: de default-privileges in public geven anon/authenticated
-- table-level DML; RLS-deny blokkeert dat al, maar een expliciete revoke houdt
-- de membership-lijst (PII) ook dicht als er ooit per ongeluk een policy bijkomt.
revoke all on table public.signup_email_allowlist from anon, authenticated;

-- De hook draait als supabase_auth_admin en moet de tabel kunnen lezen.
grant usage on schema public to supabase_auth_admin;
grant select on table public.signup_email_allowlist to supabase_auth_admin;

-- for-select-policy uitsluitend voor de hook-rol (idempotent).
drop policy if exists "allowlist auth admin read" on public.signup_email_allowlist;
create policy "allowlist auth admin read" on public.signup_email_allowlist
  for select to supabase_auth_admin
  using (true);

-- ── 2. before_user_created-hook-functie ───────────────────────────────────────
-- Signatuur/security exact conform de Supabase-docs (before-user-created-hook):
-- public.<fn>(event jsonb) returns jsonb, eigenaar postgres, GEEN security
-- definer (draait als supabase_auth_admin), toestaan = '{}'::jsonb, weigeren =
-- error-object met http_code 403 (GoTrue propageert de message naar de client).
-- Vaste, lege search_path met volledig gekwalificeerde namen (pg_catalog blijft
-- impliciet beschikbaar voor lower/trim/jsonb_build_object).
--
-- FAIL-CLOSED: leeg/onbekend adres → óók weigeren met dezelfde sentinel
-- (besloten testfase). De token TRIFINITY_NOT_INVITED in de message is een
-- cross-brok-contract waar de client op matcht — niet wijzigen.

create or replace function public.hook_restrict_signup_by_allowlist(event jsonb)
  returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  v_normalized text;
  v_allowed int;
begin
  v_normalized := lower(trim(coalesce(event->'user'->>'email', '')));

  -- Fail-closed: geen bruikbaar adres = weigeren.
  if v_normalized = '' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'TRIFINITY_NOT_INVITED: dit e-mailadres staat niet op de uitnodigingslijst voor de besloten testfase.'
      )
    );
  end if;

  select count(*) into v_allowed
  from public.signup_email_allowlist
  where email_normalized = v_normalized;

  if v_allowed > 0 then
    -- Toegestaan: event ONGEWIJZIGD doorgeven.
    return '{}'::jsonb;
  end if;

  -- Niet op de lijst: weigeren met de stabiele NL-sentinel.
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'TRIFINITY_NOT_INVITED: dit e-mailadres staat niet op de uitnodigingslijst voor de besloten testfase.'
    )
  );
end;
$$;

-- Alleen de hook-rol mag de functie uitvoeren; standaard PUBLIC-execute intrekken.
grant execute on function public.hook_restrict_signup_by_allowlist(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_restrict_signup_by_allowlist(jsonb) from authenticated, anon, public;

-- ── 3. Seed: bestaande test-persona-adressen ──────────────────────────────────
-- Canonieke bron: TEST_EMAILS in lib/test-personas.ts, afgeleid van
-- TEST_USER_PERSONA_KEYS = ['daan','lisa','willem','marijke']. 'compleet' zit
-- BEWUST NIET in die keys (regressie-fixture, geen beheerbaar account) → niet
-- geseed. Adressen zijn al lowercase/genormaliseerd.

insert into public.signup_email_allowlist (email_normalized, label) values
  ('daan@test.trifinity.nl',    'Test-persona (seed)'),
  ('lisa@test.trifinity.nl',    'Test-persona (seed)'),
  ('willem@test.trifinity.nl',  'Test-persona (seed)'),
  ('marijke@test.trifinity.nl', 'Test-persona (seed)')
on conflict (email_normalized) do nothing;
