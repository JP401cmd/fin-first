-- Duurzame hardening voor /beheer/gebruikers en /beheer/testdata.
--
-- ROOT CAUSE (zie Notion-kaart "Toevoegen van abonnement en zoeken gebruiker op
-- beheer"): de admin-routes zoeken een gebruiker door ALLE auth.users-rijen te
-- pagineren via GoTrue's admin.listUsers(). Wanneer één rij NULL bevat in een
-- token-kolom die GoTrue als non-null string inleest (bv. email_change /
-- email_change_token_new — gevolg van een account dat buiten de normale signup
-- om is aangemaakt), faalt de HELE lijst-call met "Database error finding
-- users" en breekt ELKE zoekopdracht. De losse data-remediatie (COALESCE de
-- NULL-tokens naar '') lost het symptoom op; deze migratie verhelpt de
-- fragiliteit structureel.
--
-- OPLOSSING: gerichte SECURITY DEFINER-lookups die alleen de veilige kolommen
-- SELECTen (een plain SELECT scant de token-kolommen niet en is dus immuun voor
-- dit soort auth-datacorruptie). O(1)/O(n emails) i.p.v. door alle gebruikers
-- pagineren. EXECUTE uitsluitend voor service_role: de admin-routes draaien al
-- achter isSuperAdmin + audit-log met de service-role-client (ADR 0006), er
-- ontstaat geen nieuw publiek oppervlak.

-- Enkele lookup op e-mail (case-insensitive) — voedt de gebruikerszoeker.
create or replace function public.admin_lookup_user_by_email(p_email text)
returns table (
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select u.id, u.email::text, u.created_at, u.last_sign_in_at
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;
$$;

-- Meervoudige lookup op een lijst e-mails — voedt de testgebruikers-lijst.
-- Geeft ook raw_user_meta_data terug (bevat test_persona_key).
create or replace function public.admin_lookup_users_by_emails(p_emails text[])
returns table (
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  raw_user_meta_data jsonb
)
language sql
security definer
set search_path = ''
as $$
  select u.id, u.email::text, u.created_at, u.last_sign_in_at, u.raw_user_meta_data
  from auth.users u
  where lower(u.email) = any (
    select lower(trim(e)) from unnest(p_emails) as e
  );
$$;

-- Alleen de service-role mag deze functies aanroepen (geen anon/authenticated).
revoke execute on function public.admin_lookup_user_by_email(text) from public, anon, authenticated;
revoke execute on function public.admin_lookup_users_by_emails(text[]) from public, anon, authenticated;
grant execute on function public.admin_lookup_user_by_email(text) to service_role;
grant execute on function public.admin_lookup_users_by_emails(text[]) to service_role;
