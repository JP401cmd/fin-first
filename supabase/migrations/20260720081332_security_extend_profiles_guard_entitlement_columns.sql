-- Uitbreiding STAP 1 — voorkom ook zelf-zetten van entitlement-kolommen (paywall/AI-credit-bypass).
-- Zelfde root-cause als profiles.role: profiles-UPDATE-policy heeft geen WITH CHECK en
-- authenticated/anon hebben tabel-brede grants. Geen enkele gebruikers-flow schrijft deze kolommen
-- (alleen service-role-admin-routes doen dat) -> veilig te bewaken.

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
  end if;
  return new;
end;
$$;
