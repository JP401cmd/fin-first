-- STAP 2 — dicht self-inschrijving in een vreemd huishouden + member->owner zelfpromotie.
-- Oorzaak: INSERT-policy had een 'OR user_id = auth.uid()'-tak zonder household-scope,
-- en de update-own-row-policy stond role-wijziging toe.

-- Helpers (SECURITY DEFINER: lezen als owner -> geen RLS-recursie; search_path leeg + fully-qualified).
create or replace function public.user_created_household(p_household uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.households
    where id = p_household and created_by = auth.uid()
  );
$$;
revoke execute on function public.user_created_household(uuid) from public, anon;
grant  execute on function public.user_created_household(uuid) to authenticated;

create or replace function public.has_pending_household_invite(p_household uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1
    from public.household_invitations i
    join auth.users u on u.id = auth.uid()
    where i.household_id = p_household
      and i.status = 'pending'
      and i.expires_at > now()
      and lower(i.invited_email) = lower(u.email)
  );
$$;
revoke execute on function public.has_pending_household_invite(uuid) from public, anon;
grant  execute on function public.has_pending_household_invite(uuid) to authenticated;

-- Strakke INSERT-policy: je kunt alleen je eigen lidmaatschap invoegen --
-- als owner van een huishouden dat jij aanmaakte, of als member met een geldige pending-uitnodiging.
drop policy if exists "Can insert household members" on public.household_members;
create policy "Can insert household members"
  on public.household_members for insert to authenticated
  with check (
    (user_id = auth.uid() and role = 'owner'  and public.user_created_household(household_id))
    or
    (user_id = auth.uid() and role = 'member' and public.has_pending_household_invite(household_id))
  );

-- Blokkeer role-wijziging op een bestaande lidmaatschapsrij (member->owner) door eindgebruikerrollen.
create or replace function public.guard_household_member_role()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    raise exception 'Wijzigen van household_members.role is niet toegestaan' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_household_member_role on public.household_members;
create trigger trg_guard_household_member_role
  before update on public.household_members
  for each row execute function public.guard_household_member_role();
