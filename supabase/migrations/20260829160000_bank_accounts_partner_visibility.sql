-- Per-rekening zichtbaarheid in het huishouden (Honeydue-model) — deel 1 van 2.
--
-- WAT DIT DOET
-- Voegt `bank_accounts.partner_visibility` toe met drie standen en dwingt die
-- af op LEES-tijd in de drie SELECT-policies van de transactiefamilie. Deel 2
-- (`..._household_partner_items_account_gate.sql`) doet hetzelfde voor de
-- SECURITY DEFINER-RPC die de partner-items levert.
--
--   'none'    — de partner ziet de rekening niet en de boekingen erop evenmin.
--   'balance' — de partner ziet de REKENINGRIJ (naam, saldo, type); de
--               boekingen van de eigenaar blijven verborgen.
--   'full'    — huidige gedrag: rekening én gedeelde boekingen zichtbaar.
--
-- WAAROM EEN APARTE KOLOM EN GEEN DERDE `ownership`-WAARDE
-- `ownership = 'shared'` is een overladen predicaat: 14 RLS-policies over 13
-- tabellen hangen eraan, en sinds ADR 0101 draagt het een tweede betekenis (de
-- weging van losse cash op `households.split_mode`, `lib/unlinked-cash.ts`).
-- Een derde enumwaarde verandert die weging stil mee. Daarom een eigen kolom,
-- met een CHECK die de twee aan elkaar knoopt zodat ze niet uit de pas kunnen
-- lopen: 'none' <=> persoonlijk, 'balance'/'full' <=> gedeeld.
--
-- WAAROM LEES-TIJD EN NIET (ALLEEN) STEMPELEN BIJ SCHRIJVEN
-- Terugschakelen van 'full' naar 'balance' moet onmiddellijk en met
-- terugwerkende kracht werken op historie die al als `ownership='shared'` op de
-- rekening staat. Lees-tijd geeft dat gratis; schrijf-tijd vraagt een backfill
-- (een niet-terugdraaibare datamutatie) en laat elke toekomstige schrijver de
-- poort vergeten. Dat is precies de faalklasse die ADR 0036 afwees en die ADR
-- 0004 als norm vastlegt. Besluit eigenaar 26-08-2026 (optie 1A). Zie ADR 0118.
--
-- GEMETEN FEITEN (live, tegen pg_policies / pg_attribute / information_schema,
-- 29-08-2026 — NIET uit migratiebestanden overgenomen):
--   * `bank_accounts` draagt géén `partner_visibility`; `ownership` is NOT NULL
--     met default 'personal'.
--   * `transactions.account_id` en `recurring_transactions.account_id` zijn
--     beide NOT NULL. Er is dus GEEN NULL-tak nodig in de policy-uitbreiding;
--     `account_id = any(...)` kan nooit NULL opleveren door een NULL-links.
--   * De drie SELECT-policies dragen vandaag exact het predicaat
--     `ownership = 'shared' AND household_id IS NOT NULL AND household_id =
--     (select user_household_id())` (transaction_splits: inline, via een
--     IN-subquery op transactions — die leunt NIET op de transactions-policy en
--     moet dus apart mee).
--   * `bank_accounts` heeft `idx_bank_accounts_user_id`; de helper hieronder
--     leest op `user_id IN (...)` en heeft daarmee zijn toegangspad. Een extra
--     index op `partner_visibility` zou dat pad niet verbeteren en wordt hier
--     bewust NIET toegevoegd.
--   * Alle bestaande rijen staan op `ownership='personal'` (0 gedeelde
--     rekeningen, 0 huishoudens, 0 huishoudleden op productie). De CHECK is
--     daarmee direct geldig en er is NUL backfill.
--
-- TOEGANGSMODEL IN GEWONE TAAL
-- De rekening heeft precies één eigenaar (`bank_accounts.user_id`) en de
-- UPDATE-policy is strikt eigen-rij. De knop is dus ASYMMETRISCH: alleen de
-- rekeninghouder bepaalt wat zijn partner ziet. De partner blijft zijn EIGEN
-- boekingen op een gedeelde rekening altijd zien — die vallen onder de eerste
-- disjunct (`auth.uid() = user_id`), die deze migratie niet aanraakt.

-- ── 1. Kolom + invariant ────────────────────────────────────────────────────

alter table public.bank_accounts
  add column if not exists partner_visibility text not null default 'none';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bank_accounts'::regclass
      and conname = 'bank_accounts_partner_visibility_check'
  ) then
    alter table public.bank_accounts
      add constraint bank_accounts_partner_visibility_check
      check (partner_visibility in ('none', 'balance', 'full'));
  end if;
end $$;

-- De twee kolommen kunnen niet uit de pas lopen. Dit is bewust een harde
-- constraint en geen trigger: elke schrijver die `ownership` omzet zonder
-- `partner_visibility` mee te schrijven MOET stuklopen, niet stil een halve
-- toestand achterlaten. `lib/bank-account-visibility.ts#ownershipWriteColumns`
-- is de TS-kant van dezelfde regel.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bank_accounts'::regclass
      and conname = 'bank_accounts_visibility_matches_ownership'
  ) then
    alter table public.bank_accounts
      add constraint bank_accounts_visibility_matches_ownership
      check ((ownership = 'personal') = (partner_visibility = 'none'));
  end if;
end $$;

comment on column public.bank_accounts.partner_visibility is
  'Wat de huishoudpartner van deze rekening ziet: none (niets) / balance (alleen de rekeningrij + saldo) / full (ook de gedeelde boekingen). Gekoppeld aan ownership via bank_accounts_visibility_matches_ownership. Afgedwongen op lees-tijd — zie partner_hidden_account_ids() en ADR 0118.';

-- ── 2. Helper ───────────────────────────────────────────────────────────────
--
-- Levert de rekeningen van de HUISHOUDPARTNER(S) die NIET op 'full' staan.
--
-- SECURITY DEFINER is hier noodzakelijk, geen gemak: de aanroeper mag de
-- persoonlijke rekeningrijen van zijn partner per definitie niet lezen, dus een
-- kale subquery in de policy zou (onder de RLS van bank_accounts) een lege set
-- opleveren en het gat juist openhouden.
--
-- `coalesce(..., '{}')` is essentieel: `x = any(NULL)` is NULL en `not NULL` is
-- NULL, dus zonder de coalesce zou de policy stilzwijgend DICHTklappen voor
-- iedereen zonder verborgen partnerrekeningen.
--
-- BEWUST GEACCEPTEERDE RESTBLOOTSTELLING: een huishoudlid dat de functie
-- rechtstreeks aanroept leert HOEVEEL niet-'full'-rekeningen zijn partner heeft
-- (kale UUID's — geen naam, saldo, IBAN of hash). Dat is inherent aan de
-- InitPlan-vorm die deze policy betaalbaar houdt; de alternatieve
-- per-rij-boolean draait de hele optimalisatieronde van 20260719090108 /
-- 20260810220000 terug. Vastgelegd in ADR 0118.
create or replace function public.partner_hidden_account_ids()
returns uuid[]
language sql
stable
security definer
-- Leeg search_path (strenger dan `= public`): alles hieronder is volledig
-- gekwalificeerd — `public.bank_accounts`, `public.household_members`,
-- `public.user_household_id()`, `auth.uid()` — dus er valt niets te kapen.
set search_path = ''
as $$
  select coalesce(array_agg(ba.id), '{}'::uuid[])
  from public.bank_accounts ba
  where ba.partner_visibility <> 'full'
    and ba.user_id <> (select auth.uid())
    and ba.user_id in (
      select hm.user_id
      from public.household_members hm
      where hm.household_id = (select public.user_household_id())
    );
$$;

comment on function public.partner_hidden_account_ids() is
  'Rekening-ids van de huishoudpartner met partner_visibility <> full. Bedoeld als InitPlan-subquery in RLS-policies: (select public.partner_hidden_account_ids()). Geeft nooit NULL.';

revoke all on function public.partner_hidden_account_ids() from public;
revoke all on function public.partner_hidden_account_ids() from anon;
grant execute on function public.partner_hidden_account_ids() to authenticated;
grant execute on function public.partner_hidden_account_ids() to service_role;

-- ── 3. Lees-tijd afdwinging op de transactiefamilie ─────────────────────────
--
-- Alleen de GEDEELDE disjunct wordt beperkt. De eigen-rij-disjunct blijft
-- onaangeroerd: je eigen boekingen blijf je zien, ook op de gedeelde rekening
-- van je partner.
--
-- De helper wordt als scalar-subquery aangeroepen zodat Postgres 'm als
-- InitPlan één keer per statement evalueert i.p.v. per rij — hetzelfde patroon
-- als 20260810220000_rls_initplan_wrap_helpers_buiten_transactions.sql. Verifieer
-- dit bij de release met EXPLAIN op een 13-maands transactievenster.

alter policy "View own or shared transactions" on public.transactions
  using (
    ((select auth.uid()) = user_id)
    or (
      ownership = 'shared'
      and household_id is not null
      and household_id = (select public.user_household_id())
      and not (account_id = any ((select public.partner_hidden_account_ids())::uuid[]))
    )
  );

alter policy "View own or shared recurring transactions" on public.recurring_transactions
  using (
    ((select auth.uid()) = user_id)
    or (
      ownership = 'shared'
      and household_id is not null
      and household_id = (select public.user_household_id())
      and not (account_id = any ((select public.partner_hidden_account_ids())::uuid[]))
    )
  );

-- transaction_splits herimplementeert het predicaat INLINE en leunt dus niet op
-- de policy hierboven. Zonder deze tak lekken de splitsdetails van verborgen
-- boekingen door de zijdeur naar buiten.
alter policy "View own or shared transaction splits" on public.transaction_splits
  using (
    (transaction_id in (
      select t.id from public.transactions t
      where t.user_id = (select auth.uid())
    ))
    or (transaction_id in (
      select t.id from public.transactions t
      where t.ownership = 'shared'
        and t.household_id = (select public.user_household_id())
        and not (t.account_id = any ((select public.partner_hidden_account_ids())::uuid[]))
    ))
  );
