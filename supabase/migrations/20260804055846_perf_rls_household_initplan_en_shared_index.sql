-- Performance-sanering fase 3 — Taak T3.1
-- Initplan-wrap voor user_household_id() + partiële index voor de gedeelde tak.
--
-- WAAROM (vervolg op ADR 0048):
-- ADR 0048 wikkelde auth.uid() in (select auth.uid()) zodat Postgres 'm als InitPlan
-- eenmaal per query evalueert i.p.v. per rij. De huishouden-helper user_household_id()
-- bleef in diezelfde policies KAAL staan. Die helper is STABLE SECURITY DEFINER met een
-- eigen SELECT ... FROM household_members erin: SECURITY DEFINER-functies worden nooit
-- ge-inlined en STABLE-functies worden niet constant-gefold. Zonder scalar-subquery-
-- wrapper evalueert Postgres 'm dus PER RIJ die de eerste OR-tak (auth.uid() = user_id)
-- niet al waarmaakt — precies de partnerrijen binnen een huishouden.
--
-- SEMANTIEK IS IDENTIEK; alleen plannerkosten wijzigen:
--  * user_household_id() levert per definitie een scalaire waarde (LIMIT 1), dus
--    (select public.user_household_id()) geeft exact dezelfde waarde — inclusief NULL
--    voor een gebruiker zonder huishouden. NULL = x blijft NULL (niet-waar), dus de
--    gedeelde tak blijft precies even dicht voor solo-gebruikers als voorheen.
--  * De functie is STABLE: binnen een query kan de uitkomst niet wijzigen, dus een
--    enkele evaluatie geeft dezelfde rijenset als N evaluaties per rij.
--  * De functie is read-only (LANGUAGE sql, enkel SELECT): geen side effects die van
--    het aantal aanroepen afhangen.
--  * Rolset (to authenticated), policynamen en de WITH CHECK-kant blijven onaangeroerd.
--    Er wordt geen enkele tak toegevoegd, verwijderd of verbreed.
--
-- ANON: deze drie SELECT-policies staan op `to authenticated` (migratie
-- 20260719090650_perf_rls_merged_select_authenticated). De rol `anon` heeft GEEN
-- EXECUTE op user_household_id(), maar evalueert deze policies ook nooit — anon krijgt
-- 0 rijen zonder fout, voor en na deze migratie. Bewust geverifieerd: bij ADR 0048 was
-- juist een SECURITY DEFINER-helper zonder anon-execute de valkuil die stil een harde
-- fout had kunnen geven i.p.v. een lege set.

-- ── DEEL A — initplan-wrap ────────────────────────────────────────────────────

alter policy "View own or shared transactions" on public.transactions
  using (
    ((select auth.uid()) = user_id)
    or (
      (ownership = 'shared'::text)
      and (household_id is not null)
      and (household_id = (select public.user_household_id()))
    )
  );

alter policy "View own or shared recurring transactions" on public.recurring_transactions
  using (
    ((select auth.uid()) = user_id)
    or (
      (ownership = 'shared'::text)
      and (household_id is not null)
      and (household_id = (select public.user_household_id()))
    )
  );

-- transaction_splits heeft twee subselects; alleen de tweede draagt
-- user_household_id() (de eerste gaat via auth.uid(), al gewikkeld door ADR 0048).
alter policy "View own or shared transaction splits" on public.transaction_splits
  using (
    (transaction_id in (
      select transactions.id from transactions
      where transactions.user_id = (select auth.uid())
    ))
    or (transaction_id in (
      select transactions.id from transactions
      where transactions.ownership = 'shared'::text
        and transactions.household_id = (select public.user_household_id())
    ))
  );

-- ── DEEL B — partiële index voor de gedeelde tak ──────────────────────────────
--
-- De OR in de policy dwingt een BitmapOr af. De eigen-tak matcht
-- idx_transactions_user_id; de gedeelde tak kon alleen terugvallen op
-- idx_transactions_household (household_id) — zonder date en zonder ownership. Die
-- levert dus ALLE huishoudrijen ooit, waarna date/ownership als recheck-filter draaien
-- en de ORDER BY date DESC een expliciete sort wordt over het bitmapresultaat.
-- Gemeten met een huishoud-fixture in een teruggedraaide transactie (6-maands venster):
-- de gedeelde tak leverde ruim meer indexrijen dan relevant en het plan las een
-- veelvoud aan gedeelde buffers.
--
-- Deze index dekt exact de policy-tak: partial op ownership = 'shared', met keys
-- (household_id, date desc) — equality op household_id, range op date en de
-- sorteervolgorde in één index.
--
-- BEWUST GEEN `concurrently`: apply_migration draait transactioneel en CONCURRENTLY is
-- daar niet toegestaan. De tabel is op dit moment bescheiden van omvang en het partial-
-- predikaat matcht vooralsnog geen enkele rij, dus de SHARE-lock duurt milliseconden.
create index if not exists idx_transactions_household_shared_date
  on public.transactions (household_id, date desc)
  where ownership = 'shared';
