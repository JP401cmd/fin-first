-- =====================================================================
-- Herstelreeks "bank koppelen / doelrekening", stap 1:
--   (a) schema-drift op public.transactions codificeren
--   (b) de unieke dedup-index rekening-gescoped maken
--   (c) herkomstveld public.transactions.source toevoegen
-- =====================================================================
-- Bron: specs/bank-connect-doelrekening/plan.md §0, besluiten B1(a) en B5.
-- Werkwijze conform ADR 0045 (documentaire, idempotente drift-codificatie:
-- historie != files != live).
--
-- ---------------------------------------------------------------------
-- (a) SCHEMA-DRIFT CODIFICEREN  -- op remote een no-op
-- ---------------------------------------------------------------------
-- public.transactions draagt live ELF kolommen die in geen enkele
-- repo-migratie voorkomen. Oorzaak (geverifieerd tegen de remote
-- migratiehistorie): er zijn toegepaste versies waarvan het migratiebestand
-- nooit in de repo is geland -- o.a. 20260221111227
-- add_linked_transfer_id_to_transactions, 20260608140755
-- add_transaction_bank_fields, 20260608164218 add_transaction_bank_code en
-- 20260608193759 transactions_bank_seq_composite_unique.
--
-- Gevolg zonder deze migratie: een verse `supabase db reset` levert een
-- transactions-tabel ZONDER bank_seq, waarop de import-dedup
-- (lib/parsers/shared.ts, app/(app)/core/cash/import/page.tsx) hard
-- stukloopt, en de ERD op /beheer/architectuur (gescand uit
-- supabase/migrations door scanTableRelations) toont een tabel die niet
-- overeenkomt met de werkelijkheid.
--
-- Typen, nullability en defaults zijn EXACT overgenomen uit
-- information_schema.columns op remote (29-07-2026), niet verzonnen.
-- ---------------------------------------------------------------------

alter table public.transactions add column if not exists currency text not null default 'EUR';
alter table public.transactions add column if not exists notes text;
alter table public.transactions add column if not exists is_split boolean default false;
alter table public.transactions add column if not exists linked_transfer_id uuid references public.transactions(id) on delete set null;
alter table public.transactions add column if not exists running_balance numeric;
alter table public.transactions add column if not exists creditor_id text;
alter table public.transactions add column if not exists fx_amount numeric;
alter table public.transactions add column if not exists fx_currency text;
alter table public.transactions add column if not exists fx_rate numeric;
alter table public.transactions add column if not exists bank_code text;
alter table public.transactions add column if not exists bank_seq text;

-- Ook index-drift: deze index bestaat live maar in geen repo-migratie.
create index if not exists transactions_account_id_idx
  on public.transactions using btree (account_id);

-- ---------------------------------------------------------------------
-- (b) UNIEKE DEDUP-INDEX REKENING-GESCOPED MAKEN  -- echte wijziging
-- ---------------------------------------------------------------------
-- Vandaag: UNIQUE (user_id, import_hash, coalesce(bank_seq,'')) WHERE
-- import_hash IS NOT NULL. import_hash = SHA-256 over datum|bedrag|
-- omschrijving. Twee ECHTE, verschillende boekingen met gelijke datum,
-- bedrag en omschrijving op TWEE rekeningen van dezelfde gebruiker kunnen
-- daardoor niet naast elkaar bestaan -- de database weigert de tweede.
-- Dat is stil dataverlies en het blokkeert besluit B1 (bewust koppelen aan
-- een rekening die al historie draagt).
--
-- De nieuwe index voegt account_id TOE aan de sleutel. Een kolom toevoegen
-- aan een unieke sleutel kan het aantal onderscheiden sleutels alleen maar
-- vergroten: elke rijverzameling die de oude index respecteert, respecteert
-- ook de nieuwe. Dit is dus per constructie een VERSOEPELING; geen bestaande
-- rij kan de nieuwe index schenden. Verificatievraag draaide op remote uit
-- op 0 conflicterende groepen.
--
-- NULL-gat: geen. account_id is NOT NULL (0 rijen met account_id IS NULL op
-- remote), dus er ontstaat geen rij die door een NULL in de sleutel
-- automatisch uniek wordt en zo langs de dedup glipt.
--
-- CONCURRENTLY kan niet: apply_migration draait in een transactieblok.
-- Zelfde afweging als 20260504000001_perf_composite_indexes.sql. Volume:
-- 37.000 rijen / 26 MB, waarvan 35.342 met import_hash -- de indexbouw is
-- sub-seconde. De SHARE-lock blokkeert in dat venster schrijvers op
-- transactions, geen lezers.
--
-- Volgorde: eerst de nieuwe index AANMAKEN, pas daarna de oude DROPPEN, zodat
-- er geen moment is waarop de tabel onbeschermd is tegen dubbele imports.
-- ---------------------------------------------------------------------

create unique index if not exists transactions_import_hash_account_idx
  on public.transactions using btree (user_id, account_id, import_hash, coalesce(bank_seq, ''::text))
  where (import_hash is not null);

drop index if exists public.transactions_import_hash_idx;

-- ---------------------------------------------------------------------
-- (c) HERKOMSTVELD public.transactions.source  -- echte wijziging
-- ---------------------------------------------------------------------
-- Besluit B5. Onveranderlijk herkomstfeit per transactie:
--   'bank'      -- opgehaald via een bankkoppeling (TrueLayer-sync)
--   'import'    -- door de gebruiker geimporteerd bestand (MT940/CSV/OFX)
--   'handmatig' -- met de hand ingevoerd
--
-- BEWUST NULLABLE EN BEWUST ZONDER DEFAULT.
--   * Nullable: de 37.000 bestaande rijen hebben geen vastgelegde herkomst.
--     Ze terugvullen zou een gok zijn die daarna niet meer van een echt
--     vastgesteld feit te onderscheiden is. NULL betekent hier precies wat
--     het moet betekenen: "herkomst niet vastgelegd".
--   * Geen default: er bestaat geen herkomst die voor alle schrijfpaden
--     juist is. Een default 'handmatig' zou elke sync-rij fout stempelen,
--     een default 'bank' elke handmatige invoer. Erger: een default laat
--     NULL verdwijnen en wist daarmee het onderscheid tussen "onbekend" en
--     "vastgesteld". Elk schrijfpad moet zijn eigen herkomst expliciet
--     zetten; ontbreekt dat, dan hoort dat zichtbaar te zijn als NULL en
--     niet gemaskeerd door een aanname.
--
-- CHECK-vorm gespiegeld op 20260726130000_unify_source_constraints.sql
-- (assets/debts): `source is null or source = any (array[...])`, met een
-- pg_constraint-guard zodat herdraaien veilig is.
--
-- LET OP - andere woordenlijst dan assets/debts. Die dragen
-- manual/aangifte_import/broker_csv/bank_psd2/ai_extracted/bank_sync. Dit is
-- bewust een derde vocabulaire (besluit B5 schrijft bank/import/handmatig
-- voor); zie het rapport bij deze migratie, punt "restrisico".
-- ---------------------------------------------------------------------

alter table public.transactions add column if not exists source text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_source_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_source_check
      check (source is null or source = any (array['bank'::text, 'import'::text, 'handmatig'::text]));
  end if;
end $$;

comment on column public.transactions.source is
  'Herkomst van de transactie: bank (bankkoppeling/sync), import (bestandsimport) of handmatig. NULL = herkomst niet vastgelegd (alle rijen van voor deze migratie). Bewust zonder default: elk schrijfpad zet zijn eigen herkomst.';

-- ---------------------------------------------------------------------
-- RLS-DEKKINGSCHECK bij de additieve kolommen (verplicht bij ADD COLUMN)
-- ---------------------------------------------------------------------
-- Er wordt hier GEEN policy toegevoegd of verbreed. transactions heeft RLS
-- aan staan; de nieuwe kolommen erven exact de bestaande policies:
--
--   SELECT "View own or shared transactions" (to authenticated)
--     using: auth.uid() = user_id
--            OR (ownership = 'shared' AND household_id = user_household_id())
--     -> eigen rijen altijd; herkomst van een GEDEELDE huishoudtransactie is
--        ook voor de partner zichtbaar. Dat is bedoeld en niet gevoelig:
--        het zegt hoe de rij binnenkwam, niet wat erin staat.
--
--   INSERT "Users insert own transactions"  with check: auth.uid() = user_id
--   UPDATE "Users update own transactions"  using/with check: auth.uid() = user_id
--   DELETE "Users delete own transactions"  using: auth.uid() = user_id
--     -> schrijfpad = eigen-rij read-modify-write. Geen enkele nieuwe kolom
--        opent een pad naar de rij van een andere gebruiker; de sleutel van
--        alle vier de policies blijft user_id.
--
-- Bedoeld schrijfpad voor `source`: server-side, door het schrijfpad dat de
-- transactie aanmaakt (sync-route, import-route, handmatige invoer). De
-- kolom is technisch ook door de gebruiker zelf te overschrijven via de
-- bestaande UPDATE-policy -- de database dwingt de onveranderlijkheid NIET
-- af. Dat is een bewuste keuze: een immutability-trigger zou de geplande
-- her-attributie/herkoppeling (plan fase 4) blokkeren. Zie het rapport,
-- punt "restrisico".
-- =====================================================================
