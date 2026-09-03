-- Partner-samenwerkingslaag, fase 1 — "Te bespreken": een boeking markeren
-- om samen met je huishoudpartner te bespreken (Monarch-pariteit, roadmap C).
--
-- Kaart: "Partner-samenwerkingslaag (Monarch-pariteit) — samen geldkeuzes
-- maken (roadmap C)". Besluit eigenaar 03-09-2026: alleen fase 1 (deze tabel +
-- de lijst); K3 = vlaggen blijven buiten de AI-context; K4 = een vlag is hard
-- gekoppeld aan `bank_accounts.partner_visibility`. Zie ADR 0128.
--
-- ── Gemeten tegen de LIVE database (03-09-2026, pg_policies / pg_proc /
--    information_schema, niet uit migratiebestanden overgenomen) ──────────────
--   * `public.user_household_id()`          — bestaat, STABLE SECURITY DEFINER.
--   * `public.partner_hidden_account_ids()` — bestaat (20260829160000, op naam
--     geregistreerd in supabase_migrations.schema_migrations).
--   * SELECT-policy "View own or shared transactions" draagt de volledige
--     zichtbaarheidsregel: eigen rij OF (shared ∧ eigen huishouden ∧ rekening
--     niet in partner_hidden_account_ids()).
--   * SELECT-policy op `bank_accounts` is eigen rij OF gedeeld in huishouden;
--     de partner ziet de rekeningrij dus óók op 'balance'.
--   * `transactions.account_id` is NOT NULL (20260804110000), dus de join naar
--     bank_accounts hieronder kent geen NULL-tak.
--   Het register loopt op naam achter op de map (laatste op naam:
--   20260829161000); niets hieronder leunt op een nog niet gedraaide voorganger.
--
-- ── Het ontwerpbesluit dat deze tabel veilig maakt ───────────────────────────
-- De vlag herhaalt de zichtbaarheidsregel NIET. Elke policy hieronder vraagt
-- via een SECURITY INVOKER-helper "kan de aanroeper deze transactie zélf zien?"
-- — en dat antwoord komt uit de bestaande SELECT-policy op `transactions`,
-- inclusief `partner_hidden_account_ids()`. Eén bron van waarheid voor
-- zichtbaarheid; zet de rekeninghouder 'full' terug naar 'balance', dan
-- verdwijnt de vlag voor de partner op hetzelfde moment als de boeking
-- (lees-tijd, ADR 0118). Een vlag kan daardoor nooit het bestaan, het bedrag of
-- de omschrijving van een verborgen boeking verraden — het grootste risico dat
-- de analyse benoemde.
--
-- Bij het SCHRIJVEN geldt een strengere eis dan bij het lezen: alleen een
-- GEDEELDE boeking op een rekening die op 'full' staat is markeerbaar. Zo kan
-- niemand een vlag zetten op iets wat de ander per definitie niet ziet — een
-- "te bespreken" die de partner nooit te zien krijgt is geen samenwerking maar
-- een verwarring.
--
-- ── Toegangsmodel in gewone taal ─────────────────────────────────────────────
--   SELECT — huishoudgenoten, uitsluitend voor boekingen die ze zelf mogen zien.
--   INSERT — alleen als jezelf (`flagged_by`), alleen in je eigen huishouden,
--            alleen op een gedeelde boeking op een 'full'-rekening.
--   UPDATE — huishoudgenoten mogen de status omzetten (afgerond / heropend);
--            de NOTITIE mag alleen de melder zelf wijzigen (hij staat onder zijn
--            naam — attributie); de sleutels (boeking, huishouden, melder, id,
--            created_at) zijn onveranderlijk (trigger), `resolved_*` wordt
--            server-bepaald.
--   DELETE — alleen wie de vlag zette (intrekken).
--   anon   — geen enkele policy → 0 rijen, geen fout (policies `to authenticated`).
--   Geen service-role-pad; de route gebruikt de anon-RLS-client (ADR 0058).

-- ── 1. Tabel ─────────────────────────────────────────────────────────────────

create table if not exists public.transaction_flags (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  -- Eigen kolom (en niet "via de boeking") zodat de policy zonder join op het
  -- huishouden kan filteren; de WITH CHECK bindt 'm aan user_household_id().
  household_id   uuid not null references public.households(id) on delete cascade,
  -- FK → auth.users ON DELETE CASCADE conform de AVG-norm sinds
  -- 20260721140000_avg_ondelete_fk_erasure.sql.
  flagged_by     uuid not null references auth.users(id) on delete cascade,
  status         text not null default 'open',
  -- Vrije tekst van de melder; kan PII bevatten en gaat daarom bewust NIET
  -- naar de AI-context (K3). Begrensd zodat een vlag geen opslagplaats wordt.
  note           text,
  resolved_by    uuid references auth.users(id) on delete set null,
  resolved_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint transaction_flags_status_check
    check (status in ('open', 'resolved')),
  constraint transaction_flags_note_length
    check (note is null or char_length(note) <= 500),
  -- Precies één vlag per boeking: afronden en heropenen zijn statuswissels op
  -- dezelfde rij, geen nieuwe rijen. Dat houdt de lijst en de badge eenduidig.
  constraint transaction_flags_one_per_transaction unique (transaction_id),
  -- Status en tijdstempel kunnen niet uit de pas lopen (de trigger stempelt ze
  -- samen; dit is de declaratieve tweede laag).
  constraint transaction_flags_resolved_pair
    check ((status = 'resolved') = (resolved_at is not null))
);

comment on table public.transaction_flags is
  'Partner-samenwerking fase 1: een gedeelde boeking gemarkeerd als "te bespreken" binnen het huishouden. Zichtbaarheid volgt de SELECT-policy van transactions (incl. partner_visibility) via transaction_flag_transaction_visible(); markeren kan alleen op een gedeelde boeking op een rekening met partner_visibility = full (transaction_flaggable()). Bewust buiten de AI-context. Zie ADR 0128.';
comment on column public.transaction_flags.note is
  'Vrije notitie van de melder (max 500 tekens). Kan PII bevatten; wordt nooit aan een AI-prompt toegevoegd (eigenaarsbesluit K3, 03-09-2026).';

-- Leespaden: "alle open vlaggen van dit huishouden" (lijst + badge) en de
-- own-row DELETE-policy. De unique constraint dekt de lookup op boeking.
create index if not exists transaction_flags_household_status_idx
  on public.transaction_flags using btree (household_id, status);
create index if not exists transaction_flags_flagged_by_idx
  on public.transaction_flags using btree (flagged_by);

-- ── 2. Helpers — SECURITY INVOKER, dus de RLS van de aanroeper geldt ─────────
--
-- SECURITY INVOKER is hier het hele punt (en het tegendeel van
-- partner_hidden_account_ids(), dat juist DEFINER moet zijn): de vraag is niet
-- "bestaat deze boeking" maar "mag JIJ 'm zien". Een boeking die de policy op
-- `transactions` voor de aanroeper verbergt, levert hier `false` — en daarmee
-- geen vlag. Leeg search_path: alles is volledig gekwalificeerd.

create or replace function public.transaction_flag_transaction_visible(p_transaction_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.transactions t
    where t.id = p_transaction_id
  );
$$;

comment on function public.transaction_flag_transaction_visible(uuid) is
  'Kan de AANROEPER deze boeking zien onder zijn eigen RLS (eigen rij, of gedeeld en niet op een verborgen partnerrekening)? SECURITY INVOKER — bewust; hergebruikt de SELECT-policy van transactions als enige bron van zichtbaarheid. Basis van de SELECT/UPDATE-policies op transaction_flags.';

create or replace function public.transaction_flaggable(p_transaction_id uuid, p_household_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.transactions t
    join public.bank_accounts ba on ba.id = t.account_id
    where t.id = p_transaction_id
      and t.ownership = 'shared'
      and t.household_id = p_household_id
      and ba.partner_visibility = 'full'
  );
$$;

comment on function public.transaction_flaggable(uuid, uuid) is
  'Mag deze boeking in dit huishouden als "te bespreken" gemarkeerd worden: gedeeld, in het opgegeven huishouden, én op een rekening die de partner op full (ook boekingen) ziet. SECURITY INVOKER: de aanroeper moet boeking én rekeningrij zelf kunnen lezen. Basis van de INSERT-policy op transaction_flags (K4, ADR 0128).';

revoke all on function public.transaction_flag_transaction_visible(uuid) from public;
revoke all on function public.transaction_flag_transaction_visible(uuid) from anon;
grant execute on function public.transaction_flag_transaction_visible(uuid) to authenticated;
grant execute on function public.transaction_flag_transaction_visible(uuid) to service_role;

revoke all on function public.transaction_flaggable(uuid, uuid) from public;
revoke all on function public.transaction_flaggable(uuid, uuid) from anon;
grant execute on function public.transaction_flaggable(uuid, uuid) to authenticated;
grant execute on function public.transaction_flaggable(uuid, uuid) to service_role;

-- ── 3. Trigger — sleutels onveranderlijk, resolved_* server-bepaald ──────────
--
-- Een UPDATE-policy kan OLD niet lezen, dus "je mag de status omzetten maar de
-- boeking of het huishouden niet verwisselen" is alleen als trigger uit te
-- drukken. Dezelfde trigger stempelt wie en wanneer afrondde: de client stuurt
-- alleen `status` (en eventueel `note`), nooit `resolved_by`/`resolved_at`.
-- De notitie staat in de UI onder de naam van de melder; een partner die 'm
-- herschrijft zou woorden in andermans mond leggen — daarom mag alleen de
-- melder zijn eigen notitie wijzigen (security-review 03-09-2026).

create or replace function public.transaction_flags_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.transaction_id is distinct from old.transaction_id
       or new.household_id is distinct from old.household_id
       or new.flagged_by is distinct from old.flagged_by
       or new.created_at is distinct from old.created_at then
      raise exception 'transaction_flags: boeking, huishouden en melder zijn onveranderlijk'
        using errcode = '42501';
    end if;
    if new.note is distinct from old.note and old.flagged_by <> auth.uid() then
      raise exception 'transaction_flags: alleen de melder wijzigt zijn notitie'
        using errcode = '42501';
    end if;
  end if;

  if new.status = 'resolved' then
    if tg_op = 'INSERT' or old.status is distinct from 'resolved' then
      new.resolved_by := auth.uid();
      new.resolved_at := now();
    end if;
  else
    new.resolved_by := null;
    new.resolved_at := null;
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;

  return new;
end;
$$;

comment on function public.transaction_flags_guard() is
  'BEFORE INSERT OR UPDATE op transaction_flags: weigert het verwisselen van id/transaction_id/household_id/flagged_by/created_at (42501), laat alleen de melder zijn notitie wijzigen (42501) en stempelt resolved_by/resolved_at/updated_at server-side uit de statuswissel.';

drop trigger if exists trg_transaction_flags_guard on public.transaction_flags;
create trigger trg_transaction_flags_guard
  before insert or update on public.transaction_flags
  for each row execute function public.transaction_flags_guard();

-- ── 4. RLS ───────────────────────────────────────────────────────────────────

alter table public.transaction_flags enable row level security;

drop policy if exists "transaction_flags household select" on public.transaction_flags;
create policy "transaction_flags household select" on public.transaction_flags
  for select to authenticated
  using (
    household_id = (select public.user_household_id())
    and public.transaction_flag_transaction_visible(transaction_id)
  );

drop policy if exists "transaction_flags own insert" on public.transaction_flags;
create policy "transaction_flags own insert" on public.transaction_flags
  for insert to authenticated
  with check (
    flagged_by = (select auth.uid())
    and household_id = (select public.user_household_id())
    and public.transaction_flaggable(transaction_id, household_id)
  );

-- USING én WITH CHECK, allebei met de zichtbaarheidstoets: de rij moet vóór
-- en ná de wijziging in je huishouden liggen op een boeking die je mag zien.
drop policy if exists "transaction_flags household update" on public.transaction_flags;
create policy "transaction_flags household update" on public.transaction_flags
  for update to authenticated
  using (
    household_id = (select public.user_household_id())
    and public.transaction_flag_transaction_visible(transaction_id)
  )
  with check (
    household_id = (select public.user_household_id())
    and public.transaction_flag_transaction_visible(transaction_id)
  );

drop policy if exists "transaction_flags own delete" on public.transaction_flags;
create policy "transaction_flags own delete" on public.transaction_flags
  for delete to authenticated
  using (flagged_by = (select auth.uid()));

-- ── Terugweg (vooraf, ADR-norm) ──────────────────────────────────────────────
-- Dit is een losstaande, additieve tabel zonder backfill. Gaat er iets mis, dan
-- is de correctie vooruit: policies vervangen of, in het uiterste geval, de
-- tabel in een LATERE migratie droppen (verlies = alleen de vlaggen zelf, geen
-- financiële data). Herkenning: een vlag zichtbaar op een boeking die de
-- partner niet ziet = SELECT-policy zonder de zichtbaarheidshelper.
