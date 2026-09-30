-- Y1 (security-run 0.92.27) — een geblokkeerde gebruiker kan zichzelf niet meer deblokkeren.
--
-- HET GAT. `profiles.blocked_at` is de blokkade die beheer zet via
-- `POST /api/admin/users/block` (service-role). De (app)-layout en de Bearer-poort
-- (`lib/supabase/bearer.ts`) weigeren een account zodra hij gevuld is. Maar de
-- sessie mocht hem zelf wissen. Gemeten op productie, 30-09-2026:
--   · `has_column_privilege('authenticated','public.profiles','blocked_at','UPDATE')` = true
--     (en INSERT = true; anon heeft dezelfde tabelbrede grants);
--   · de enige policy op profiles is "Users can manage own profile", FOR ALL, roles {public},
--     USING ((select auth.uid()) = id), WITH CHECK null — dus own-row INSERT/UPDATE/DELETE;
--   · de enige trigger is `trg_guard_profiles_role` (BEFORE INSERT OR UPDATE), en
--     `guard_profiles_role()` bewaakt alleen `role`, `commercial_tier` en
--     `active_subscriptions` (bron: pg_get_functiondef + pg_get_triggerdef, 30-09-2026).
-- Een geblokkeerde gebruiker met een nog geldig JWT kon dus rechtstreeks via PostgREST
-- `update profiles set blocked_at = null where id = auth.uid()` doen.
--
-- EN EEN TWEEDE WEG NAAR HETZELFDE. Dezelfde FOR ALL-policy staat ook DELETE op de eigen
-- rij toe (`has_table_privilege('authenticated','public.profiles','DELETE')` = true,
-- gemeten 30-09-2026). Eigen profiel wissen en opnieuw aanmaken leverde een rij zonder
-- `blocked_at` op; de layout faalt open bij een ontbrekend profiel
-- (`if (profile?.blocked_at)`). Deze migratie dicht die weg ook, maar alleen voor een
-- geblokkeerde rij: een niet-geblokkeerde gebruiker houdt precies het gedrag van nu.
--
-- WAT DEZE MIGRATIE DOET
--   1. `guard_profiles_role()` krijgt twee regels erbij, in dezelfde vorm als `role`:
--        UPDATE: `new.blocked_at is distinct from old.blocked_at` → 42501;
--        INSERT: `new.blocked_at is not null`                   → 42501.
--      Al het bestaande gedrag staat er letterlijk in (gelijk aan de live definitie van
--      30-09-2026 = 20260720081332_security_extend_profiles_guard_entitlement_columns.sql).
--      De trigger zelf verandert niet.
--   2. Nieuwe functie `guard_profiles_blocked_delete()` + trigger
--      `trg_guard_profiles_blocked_delete` (BEFORE DELETE): een sessie
--      (authenticated/anon) mag een rij met `blocked_at` gevuld niet wissen → 42501.
--      Bewust een aparte functie: `guard_profiles_role()` geeft `new` terug, en in een
--      BEFORE DELETE-trigger is `new` null, wat de delete stil zou annuleren — ook voor
--      service_role. Een eigen functie met `return old` houdt de bestaande functie
--      ongewijzigd.
--
-- WIE MAG WAT (ná deze migratie)
--   · authenticated/anon: `blocked_at` niet zetten, niet wissen, niet meegeven bij insert;
--     een geblokkeerde eigen rij niet wissen. Overige profielvelden: ongewijzigd (own-row).
--   · service_role en postgres (en elke andere niet-sessierol, zoals supabase_auth_admin en
--     de RI-cascade vanaf auth.users, die als eigenaar van profiles draait): vrij, precies
--     zoals bij `role`. De beheerroute `app/api/admin/users/block/route.ts` schrijft met de
--     service-role-client (`createServiceClient(url, SUPABASE_SERVICE_ROLE_KEY)`) →
--     current_user = 'service_role' → de guard laat door. AVG-verwijdering
--     (`/api/account/delete`, `/api/admin/user-delete`) loopt via
--     `service.auth.admin.deleteUser` → cascade → niet geraakt.
--   · Er is geen gebruikersflow die `blocked_at` schrijft (grep op de repo, 30-09-2026:
--     alleen de beheerroute), dus niets legitiems breekt.
--
-- Gemeten op 30-09-2026: 0 profielen met `blocked_at` gevuld (van 29). Er is dus niemand
-- die op dit moment via dit gat ontsnapt; de migratie is puur preventief.
--
-- Idempotent: `create or replace function` + `drop trigger if exists` / `create trigger`.
--
-- VERIFICATIE: `scripts/verify-profiles-blocked-at-guard.sql` (rol-gesimuleerd, in één
-- transactie die terugrolt; RAISE EXCEPTION bij een afwijking). Draaien ná het toepassen.

create or replace function public.guard_profiles_role()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      raise exception 'Wijzigen van profiles.role is niet toegestaan' using errcode = '42501';
    end if;
    if new.commercial_tier is distinct from old.commercial_tier then
      raise exception 'Wijzigen van profiles.commercial_tier is niet toegestaan' using errcode = '42501';
    end if;
    if new.active_subscriptions is distinct from old.active_subscriptions then
      raise exception 'Wijzigen van profiles.active_subscriptions is niet toegestaan' using errcode = '42501';
    end if;
    if new.blocked_at is distinct from old.blocked_at then
      raise exception 'Wijzigen van profiles.blocked_at is niet toegestaan' using errcode = '42501';
    end if;
  elsif tg_op = 'INSERT' then
    if new.role is distinct from 'user' then
      raise exception 'Zetten van profiles.role bij insert is niet toegestaan' using errcode = '42501';
    end if;
    if new.commercial_tier is distinct from 'gratis' then
      raise exception 'Zetten van profiles.commercial_tier bij insert is niet toegestaan' using errcode = '42501';
    end if;
    if new.active_subscriptions is distinct from array[]::text[] then
      raise exception 'Zetten van profiles.active_subscriptions bij insert is niet toegestaan' using errcode = '42501';
    end if;
    if new.blocked_at is not null then
      raise exception 'Zetten van profiles.blocked_at bij insert is niet toegestaan' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.guard_profiles_blocked_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return old;
  end if;
  if old.blocked_at is not null then
    raise exception 'Verwijderen van een geblokkeerd profiel is niet toegestaan' using errcode = '42501';
  end if;
  return old;
end;
$$;

comment on function public.guard_profiles_blocked_delete() is
  'Y1 (0.92.27): een sessie (authenticated/anon) mag een profiel met blocked_at niet wissen — anders is wissen + opnieuw aanmaken een ontsnapping uit de blokkade. service_role/postgres vrij.';

drop trigger if exists trg_guard_profiles_blocked_delete on public.profiles;
create trigger trg_guard_profiles_blocked_delete
  before delete on public.profiles
  for each row execute function public.guard_profiles_blocked_delete();
