-- STAP 1 — voorkom self-escalatie van profiles.role.
-- Oorzaak: profiles-UPDATE-policy heeft geen WITH CHECK en authenticated/anon hebben
-- tabel-brede UPDATE/INSERT-grants; een kolom-REVOKE(role) is een no-op tegen een tabel-grant.
-- Oplossing: BEFORE-trigger die role-wijzigingen door de PostgREST-eindgebruikerrollen weigert.
-- Service-role (admin-route), migraties en SECURITY DEFINER-triggers (handle_new_user) blijven vrij.

create or replace function public.guard_profiles_role()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Alleen writes onder de PostgREST-eindgebruikerrollen worden bewaakt.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    raise exception 'Wijzigen van profiles.role is niet toegestaan' using errcode = '42501';
  elsif tg_op = 'INSERT' and new.role is distinct from 'user' then
    raise exception 'Zetten van profiles.role bij insert is niet toegestaan' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profiles_role on public.profiles;
create trigger trg_guard_profiles_role
  before insert or update on public.profiles
  for each row execute function public.guard_profiles_role();
