-- H9 fase 2 — het schrijfpad van `assets.household_id` sluitend maken.
--
-- Kaart: "Nazorg R2+R3 · security-restpunten (H9 WITH CHECK voorop)" (P1).
-- Alle schema-feiten hieronder zijn gemeten tegen de LIVE database op
-- 03-09-2026 (`pg_policies`, `pg_trigger`, `pg_proc`, `public.assets`), niet
-- afgelezen uit migratiebestanden — ADR 0045.
--
-- ── Wat de kaart meldde, en wat de meting ervan overliet ──────────────────────
-- De melding: de UPDATE-policy op `assets` heeft geen `WITH CHECK`, dus een
-- ingelogde gebruiker zou vanuit de console `household_id` op een VREEMDE
-- huishoud-UUID kunnen zetten en zijn eigen rij daarmee in het overzicht van een
-- ander huishouden kunnen injecteren (de SELECT-policy is huishoud-verbreed).
--
-- Op productie is dat NIET mogelijk, en de reden stond in geen enkel
-- migratiebestand: er hangt een BEFORE INSERT OR UPDATE-trigger
-- `trg_stamp_household_id` op `assets` die `household_id` server-bepaald
-- overschrijft:
--
--     IF NEW.ownership = 'shared' THEN NEW.household_id := user_household_id();
--     ELSE                              NEW.household_id := NULL;
--
-- Wat de client meestuurt wordt dus weggegooid vóórdat de rij de policy-check
-- bereikt. Gemeten: de trigger staat live op 8 tabellen (assets, bank_accounts,
-- budgets, debts, goals, life_events, recurring_transactions, transactions) en
-- is overal enabled (`tgenabled = 'O'`).
--
-- ── Waarom er dan tóch een migratie nodig is ─────────────────────────────────
-- Omdat die trigger NERGENS in `supabase/migrations/` wordt aangemaakt. De enige
-- vermelding in de hele keten is een ZIN IN EEN COMMENTAAR
-- (`20260731054821_transactions_dedup_index_account_scoped_cross_user.sql`
-- r.19-20, "de trigger trg_stamp_household_id stempelt household_id op elke rij
-- met ownership = 'shared'"). Een commentaar is geen `CREATE TRIGGER`.
--
-- Gevolg: op productie klopt het, maar op een verse `supabase db reset` of een
-- preview-branch bestaat de enige bewaker van `household_id` niet — en dáár is
-- de injectie uit de kaartmelding wél echt. Exact de driftklasse die ADR 0045
-- en `20260804101500_restore_assets_debts_write_policies.sql` beschrijven: de
-- live toestand is veiliger dan de keten, en niemand merkt het omdat de omgeving
-- waarin het misgaat de omgeving is die we niet resetten.
--
-- ── Wat deze migratie doet ───────────────────────────────────────────────────
-- Twee onafhankelijke lagen, zodat geen van beide de enige bewaker is:
--
--   1. De trigger + zijn functie komen in de keten te staan, exact zoals live
--      (`pg_get_functiondef`, gemeten 03-09-2026). Op productie letterlijk een
--      no-op — de functie wordt door zichzelf vervangen en de trigger opnieuw
--      aangemaakt met dezelfde definitie.
--   2. De INSERT- en UPDATE-policy krijgen een expliciete `WITH CHECK` die
--      `household_id` aan `user_household_id()` bindt. Declaratief, zichtbaar in
--      `pg_policies`, en onafhankelijk van de vraag of de trigger er nog is.
--
-- Dat de WITH CHECK vandaag geen enkele rij tegenhoudt is geen argument tegen
-- maar juist de reden dat 'm veilig is: zolang de trigger draait is
-- `NEW.household_id` per constructie NULL of `user_household_id()`, dus de check
-- is bewijsbaar een no-op op prod. Hij begint pas te werken op de dag dat de
-- trigger weg, disabled of vergeten is. Extra gecontroleerd: `select count(*)
-- from public.assets where household_id is not null` = 0 (03-09-2026), dus er
-- bestaat ook geen bestaande rij die de nieuwe check zou kunnen weigeren.
--
-- ── Dit vervangt bewust noot (a) van 20260804101500 voor `assets` ────────────
-- Dat bestand liet de `with check` er met opzet AF, met een correcte redenering:
-- Postgres gebruikt bij een UPDATE-policy zonder expliciete `WITH CHECK` de
-- `USING`-expressie óók als post-write-check, dus `user_id = auth.uid()` gold al.
-- Die redenering klopt nog steeds — maar ze gaat alleen over `user_id`. Voor
-- `household_id` zegt de USING-expressie niets, en dat is precies het gat dat
-- hier dichtgaat. Daar was 20260804101500 een drift-HERSTEL (no-op op prod);
-- dit is een bewuste gedragsWIJZIGING, in een eigen bestand, met deze kop als
-- verantwoording. Noot (a) blijft geldig voor `debts`,
-- `recurring_transactions`, `goals` en `net_worth_snapshots` — die raakt dit
-- bestand niet aan.
--
-- ── Rolset: `to authenticated`, en dat is hier geen cosmetica ────────────────
-- De twee herschreven policies gaan van `public` naar `authenticated`. Reden:
-- de nieuwe expressie roept `user_household_id()` aan, en `anon` heeft daar geen
-- EXECUTE op. Zou de policy `to public` blijven, dan gaf een anon-schrijfpoging
-- "permission denied for function" in plaats van een schone deny — precies het
-- foutgedrag dat `20260719090650_perf_rls_merged_select_authenticated.sql` voor
-- de SELECT-policies moest repareren. `anon` had hier sowieso nooit toegang
-- (`(select auth.uid())` is daar NULL), dus er gaat geen recht verloren; alleen
-- de manier van weigeren wordt schoon. De DELETE-policy blijft ongemoeid: die
-- roept de functie niet aan.
--
-- ── Toegangsmodel na deze migratie (assets) ──────────────────────────────────
--   SELECT — eigen rijen OF `ownership = 'shared'` binnen het eigen huishouden
--            (ongewijzigd).
--   INSERT — alleen eigen rijen (`user_id = auth.uid()`), en `household_id` mag
--            uitsluitend NULL of het eigen huishouden zijn.
--   UPDATE — alleen eigen rijen, vóór én ná de schrijfactie; `household_id`
--            idem. Een partner mag een gedeelde bezitting ZIEN, niet wijzigen.
--   DELETE — alleen eigen rijen (ongewijzigd).
--   Beheer/cross-user loopt via service-role (ADR 0006), niet via een policy.
--
-- ── Wat hier bewust NIET gebeurt ─────────────────────────────────────────────
-- De trigger staat live op 8 tabellen; deze migratie zet 'm alleen voor `assets`
-- in de keten, want dat is de scope van H9 fase 2. De overige 7 (bank_accounts,
-- budgets, debts, goals, life_events, recurring_transactions, transactions)
-- houden op een verse database dus nog steeds géén bewaker op `household_id`.
-- Ook `valuations` en `net_worth_snapshots` dragen een `household_id` met een
-- huishoud-verbrede SELECT maar hebben live helemaal geen stempel-trigger.
-- Dat is een aparte kaart waard en staat hier zodat de volgende lezer het niet
-- als gedekt leest.

-- ── 1. De stempel-functie in de keten (exacte live-definitie) ────────────────
create or replace function public.stamp_household_id()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.ownership = 'shared' then
    new.household_id := user_household_id();
  else
    new.household_id := null;
  end if;
  return new;
end;
$function$;

comment on function public.stamp_household_id() is
  'Bepaalt household_id server-side uit ownership; wat de client meestuurt wordt genegeerd. Live sinds vóór 31-07-2026, pas in 20260903100000 in de migratieketen gezet.';

drop trigger if exists trg_stamp_household_id on public.assets;
create trigger trg_stamp_household_id
  before insert or update on public.assets
  for each row execute function public.stamp_household_id();

-- ── 2. De declaratieve tweede laag: WITH CHECK op het schrijfpad ─────────────
drop policy if exists "Users can insert own assets" on public.assets;
create policy "Users can insert own assets" on public.assets
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      household_id is null
      or household_id = (select public.user_household_id())
    )
  );

drop policy if exists "Users can update own assets" on public.assets;
create policy "Users can update own assets" on public.assets
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      household_id is null
      or household_id = (select public.user_household_id())
    )
  );
