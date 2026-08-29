-- Actie-toewijzing aan een huishoudpartner herstellen (Groep B — live bug 1 van 2).
--
-- ## Waarom dit bestand bestaat naast 20260308000003_add_action_partner_assignment
--
-- Dat maart-bestand heeft NOOIT gedraaid. Gemeten op 28-08-2026 tegen de
-- productie-DB: `information_schema.columns` kent op `public.actions` géén
-- `assigned_to` en géén `assigned_by` (0 van 2 aanwezig). Dat het bestand in de
-- repo staat bewijst niets over wat gedraaid heeft — de repo beschrijft de
-- bedóéling, niet de werkelijkheid (ADR 0045).
--
-- Dit is een echte live bug, geen administratie:
--   * `app/api/ai/actions/[id]/assign/route.ts` leest `assigned_to` (r. 27) en
--     schrijft `assigned_to` + `assigned_by` (r. 73-74) → een actie aan je
--     partner toewijzen faalt vandaag met een PostgREST-fout.
--
-- De lineage-kop op productie is 20260827165521 (gemeten op naam in
-- `supabase_migrations.schema_migrations`, 28-08-2026). Een migratie met een
-- maart-tijdstempel landt daar ACHTER en zou bij `db push` out-of-order draaien.
-- Daarom een nieuw, lineage-correct bestand in plaats van het oude alsnog draaien.
--
-- ## Waarom de RLS hier bewust ANDERS is dan in het maart-bestand
--
-- Het maart-bestand verving de UPDATE-policy door
--     USING (auth.uid() = user_id OR auth.uid() = assigned_to)
-- zónder WITH CHECK. Dat is een eigenaarschapsgat: zonder WITH CHECK wordt de
-- NIEUWE rij niet getoetst, dus de toegewezene kan `user_id` op zichzelf zetten
-- en de rij overnemen. Die vorm wordt hier NIET overgenomen.
--
-- Toegangsmodel na deze migratie:
--   * SELECT   — eigen rijen OF rijen die aan mij zijn toegewezen.
--                Nodig: `components/app/action-board.tsx` r. 78 filtert expliciet
--                op `assigned_to === currentUserId && user_id !== currentUserId`.
--   * UPDATE   — eigenaar (bestaande policy, ongewijzigd) OF toegewezene. Die
--                laatste krijgt een eigen policy MET WITH CHECK, plus een trigger
--                die `user_id`/`assigned_to`/`assigned_by` pint zolang de caller
--                niet de eigenaar is. Nodig: `app/api/ai/actions/[id]/route.ts`
--                r. 96-98 meldt de opdrachtgever wanneer de TOEGEWEZENE afrondt.
--   * INSERT   — ongewijzigd eigenaar-only.
--   * DELETE   — ongewijzigd eigenaar-only. Bewust NIET verbreed: een
--                toegewezene mag andermans actie afronden, niet weggooien.
--
-- Alle bestaande policies op `actions` staan in de `(select auth.uid())`-vorm
-- (plan-caching); die vorm wordt hier consequent aangehouden.
--
-- ## Kolommen
--
-- `on delete set null` op beide FK's: het verwijderen van een partner-account
-- mag nooit blokkeren op een openstaande toewijzing, en sluit aan bij het
-- AVG-wisbeleid (20260721140000_avg_ondelete_fk_erasure).

-- ── 1. Kolommen + index ─────────────────────────────────────────────────────

alter table public.actions
  add column if not exists assigned_to uuid references auth.users(id) on delete set null;

alter table public.actions
  add column if not exists assigned_by uuid references auth.users(id) on delete set null;

comment on column public.actions.assigned_to is
  'Huishoudpartner aan wie deze actie is toegewezen. NULL = niet toegewezen.';
comment on column public.actions.assigned_by is
  'Wie de actie toewees (normaal de eigenaar). NULL zodra de toewijzing vervalt.';

-- Partieel: alleen toegewezen rijen zijn interessant voor deze lookup.
create index if not exists idx_actions_assigned_to
  on public.actions (assigned_to)
  where assigned_to is not null;

-- ── 2. RLS: SELECT verbreden naar de toegewezene ────────────────────────────

drop policy if exists "Users can view own actions" on public.actions;

create policy "Users can view own actions"
  on public.actions
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or assigned_to = (select auth.uid())
  );

-- ── 3. RLS: UPDATE voor de toegewezene, mét WITH CHECK ──────────────────────
--
-- De eigenaar-policy "Users can update own actions" blijft ongemoeid. Deze
-- tweede, permissieve policy geldt alleen voor een niet-eigenaar:
--   USING      — ik ben de toegewezene en niet de eigenaar.
--   WITH CHECK — na de wijziging moet dat nóg steeds gelden. `user_id <> uid`
--                blokkeert het naar-jezelf-toeschrijven; `assigned_to = uid`
--                blokkeert het losmaken of doorschuiven van de toewijzing.

drop policy if exists "Assignees can update assigned actions" on public.actions;

create policy "Assignees can update assigned actions"
  on public.actions
  for update
  to authenticated
  using (
    assigned_to = (select auth.uid())
    and user_id <> (select auth.uid())
  )
  with check (
    assigned_to = (select auth.uid())
    and user_id <> (select auth.uid())
  );

-- ── 4. Trigger: pin de eigenaarschaps-/toewijzingsvelden voor niet-eigenaren ─
--
-- WITH CHECK kan de NIEUWE rij toetsen maar niet met de OUDE vergelijken, dus
-- het kan niet uitsluiten dat een toegewezene `user_id` naar een DERDE zet (dat
-- voldoet immers aan `user_id <> uid`). Deze trigger sluit dat laatste gaatje.

create or replace function public.guard_action_assignment_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Server-side context (service-role, cron, migraties): auth.uid() is NULL.
  -- Die paden omzeilen RLS sowieso en worden hier niet beperkt.
  if (select auth.uid()) is null then
    return new;
  end if;

  -- De eigenaar mag alles, inclusief toewijzen en intrekken.
  if old.user_id = (select auth.uid()) then
    return new;
  end if;

  if new.user_id     is distinct from old.user_id
     or new.assigned_to is distinct from old.assigned_to
     or new.assigned_by is distinct from old.assigned_by then
    raise exception 'Alleen de eigenaar kan het eigenaarschap of de toewijzing van deze actie wijzigen'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_action_assignment_fields is
  'Belet dat een toegewezene user_id/assigned_to/assigned_by van andermans actie wijzigt. '
  'Vult het gat dat WITH CHECK niet kan dichten (geen OLD-vergelijking in RLS).';

drop trigger if exists trg_guard_action_assignment_fields on public.actions;

create trigger trg_guard_action_assignment_fields
  before update on public.actions
  for each row
  execute function public.guard_action_assignment_fields();

-- Een triggerfunctie hoort NIET in het PostgREST-oppervlak. Zonder deze revoke
-- staat hij als SECURITY DEFINER op /rest/v1/rpc/guard_action_assignment_fields
-- en meldt de Supabase-linter dat zelfs `anon` hem mag aanroepen
-- (0028_anon_security_definer_function_executable). Praktisch loopt zo'n aanroep
-- stuk op "trigger functions can only be called as triggers", maar een
-- SECURITY DEFINER-functie in de publieke API is geen oppervlak dat je op goed
-- vertrouwen laat staan — zeker niet één die eigenaarschapscontroles draagt.
revoke all on function public.guard_action_assignment_fields() from public;
revoke all on function public.guard_action_assignment_fields() from anon;
revoke all on function public.guard_action_assignment_fields() from authenticated;
