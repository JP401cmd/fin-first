-- Drop van de overbodige index idx_transactions_user_id (strikte prefix van
-- idx_transactions_user_date).
--
-- WAAROM
-- Migratie 20260804063307_perf_composite_indexes_apply heeft
-- idx_transactions_user_date (user_id, date desc) toegevoegd. Daarmee is
-- idx_transactions_user_id (user_id) een STRIKTE PREFIX geworden: een btree op
-- (user_id, date desc) bedient elke query die een btree op (user_id) bedient, want de
-- eerste sleutelkolom is identiek. De smalle index kost alleen nog schrijfwerk bij elke
-- insert/update/delete op transactions.
--
-- DAT DE PREFIX-CLAIM KLOPT — gemeten tegen pg_index/pg_indexes op de LIVE database,
-- 11-08-2026 (niet tegen de migratiebestanden; de repo beschrijft de bedoeling, ADR 0045):
--
--                      | idx_transactions_user_id | idx_transactions_user_date
--   kolommen           | user_id                  | user_id, date DESC
--   opclass 1e kolom   | uuid_ops                 | uuid_ops          <- gelijk
--   indoption 1e kolom | 0                        | 0                 <- gelijk (ASC/NULLS LAST)
--   predicaat (WHERE)  | geen                     | geen              <- beide volledig
--   uniek / primary    | nee / nee                | nee / nee
--   indisvalid/ready   | t / t                    | t / t             <- vervanger is VALID
--   grootte            | 960 kB                   | 720 kB
--
-- Alle vier de eigenschappen die een "lijkt-op-een-prefix" onveilig maken zijn dus
-- uitgesloten: afwijkende kolomvolgorde, een WHERE-clausule, een andere opclass en
-- uniciteit. Aanvullend gecontroleerd (zelfde meting): idx_transactions_user_id draagt
-- geen constraint (pg_constraint.conindid leeg, indisunique/indisprimary false), is geen
-- replica identity (indisreplident false), is niet geclusterd (indisclustered false) en
-- heeft geen andere pg_depend-afhankelijken. Er is dus niets dat aan deze index hangt.
--
-- GEBRUIK — waarom het scan-getal geen tegenargument is
-- pg_stat_user_indexes toonde 495.432 scans op de oude index. Dat is een CUMULATIEF
-- getal sinds stats_reset op 08-12-2025, dus over ~8 maanden, waarvan de eerste ~7 zonder
-- de samengestelde index. Het beslissende getal is pg_stat_all_indexes.last_idx_scan
-- (PG16+), gemeten 11-08-2026 01:31 UTC:
--   idx_transactions_user_id    laatste scan 09-08-2026 21:13  (~28 uur geleden)
--   idx_transactions_user_date  laatste scan 11-08-2026 01:24  (7 minuten geleden)
--   idx_transactions_date       laatste scan 11-08-2026 01:24  (7 minuten geleden)
-- De oude index is in het afgelopen etmaal niet één keer aangeraakt terwijl het verkeer
-- gewoon doorliep. Hij is dus feitelijk al buiten gebruik; de 495k is historie.
--
-- EXPLAIN op de hete queryvormen (read-only, 11-08-2026, gebruiker met 9.556 rijen).
-- Geen enkele vorm kiest de oude index — óók niet de twee vormen waarin een smalle index
-- klassiek juist zou winnen:
--   1. pure gelijkheid, geen datum   -> Bitmap Index Scan on idx_transactions_user_date
--   2. count(*) op user_id           -> Index Only Scan using idx_transactions_user_date
--   3. 13-maandsvenster + order by   -> Index Scan using idx_transactions_user_date
--   4. de RLS-vorm (eigen OR gedeeld)-> Index Scan Backward using idx_transactions_date
--      met de OR als Filter — conform het addendum bij ADR 0048: zolang een query voor de
--      gebruikersafbakening alléén op RLS leunt, dwingt de huishouden-OR een ander plan af.
--      Ook dáár speelt idx_transactions_user_id geen rol.
--
-- WAT DIT NIET IS
-- Geen ruimtebesparing van betekenis: ~960 kB. De eerdere conclusie "de oude index was
-- gebloat" blijft ONBEWEZEN — transactions heeft maar ~10 distinct user_id-waarden, dus
-- btree-deduplicatie domineert beide indexen en de samengestelde is bovendien vers
-- gepakt. Dat 720 kB < 960 kB is een artefact, geen bloatbewijs (pgstattuple is niet
-- geïnstalleerd). De winst zit in minder schrijfwerk per DML, niet in schijfruimte.

-- ── Slot op de deur: nooit droppen zonder werkende vervanger ──────────────────────
--
-- Dit is geen decoratie. In deze repo bestaat een reëel precedent: migratie
-- 20260504000001_perf_composite_indexes.sql staat wél in supabase/migrations/ maar is
-- NOOIT toegepast — precies daarom moest 20260804063307 de samengestelde index alsnog
-- aanleggen. Een omgeving waarin die laatste migratie ontbreekt, zou door deze drop haar
-- ENIGE index op user_id verliezen. Daarom eerst bewijzen dat de vervanger er ligt.
-- to_regclass (niet ::regclass) omdat dit bestand ook mag draaien in een omgeving waar de
-- index al weg is: ::regclass wérpt dan, to_regclass geeft NULL. De migratie blijft zo
-- herhaalbaar, net als de `drop index if exists` eronder.
do $$
declare
  doelwit oid := to_regclass('public.idx_transactions_user_id');
  vervanger text;
begin
  if doelwit is null then
    raise notice 'idx_transactions_user_id bestaat hier niet (meer) — niets te doen.';
    return;
  end if;

  select i.indexrelid::regclass::text into vervanger
  from pg_index i
  join pg_attribute a
    on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
  where i.indrelid = 'public.transactions'::regclass
    and a.attname = 'user_id'          -- user_id is de EERSTE sleutelkolom
    and i.indpred is null              -- geen partiële index
    and i.indisvalid                   -- bruikbaar voor de planner
    and i.indisready                   -- en bijgewerkt door DML
    and i.indexrelid <> doelwit
  limit 1;

  if vervanger is null then
    raise exception
      'Drop afgebroken: er is geen andere geldige, niet-partiële index op transactions met user_id als eerste kolom. '
      'Draai eerst 20260804063307_perf_composite_indexes_apply (idx_transactions_user_date).';
  end if;

  raise notice 'Vervanger aanwezig en valid: % — idx_transactions_user_id kan weg.', vervanger;
end;
$$;

-- ── De drop ───────────────────────────────────────────────────────────────────────
--
-- BEWUST GEEN `concurrently`: DROP INDEX CONCURRENTLY mag niet binnen een transactieblok
-- en de migratie-pipeline draait transactioneel (zelfde reden als in
-- 20260804055846_perf_rls_household_initplan_en_shared_index.sql). Een gewone DROP INDEX
-- neemt kort ACCESS EXCLUSIVE op transactions.
--
-- Het risico is niet de drop zelf — 960 kB is milliseconden werk — maar de WACHTRIJ: kan
-- de lock niet meteen genomen worden (een lopende query op transactions), dan gaat élke
-- nieuwe query op die tabel achter ons in de rij staan. Op het heetste pad van de app is
-- dat precies de stall die je niet wilt. Vandaar een korte lock_timeout: liever een
-- migratie die netjes faalt en opnieuw gedraaid wordt, dan een app die even staat.
--
-- LET OP bij toepassen: `set local` werkt alleen binnen een transactieblok. Draait de
-- pipeline deze migratie NIET transactioneel, dan is deze regel een no-op (met een
-- warning) en is er dus géén lock-bescherming. Zie de release-aanwijzing onderaan.
set local lock_timeout = '5s';

drop index if exists public.idx_transactions_user_id;

-- ── De terugweg ───────────────────────────────────────────────────────────────────
--
-- Migraties zijn append-only, dus terugdraaien bestaat niet — corrigeren vooruit wel.
-- Valt het tegen (een plan dat onverwacht verslechtert op een vorm die hierboven niet
-- getest is), herstel je de index met een NIEUWE migratie:
--
--   create index concurrently if not exists idx_transactions_user_id
--     on public.transactions (user_id);
--
-- Let op: `concurrently` kan niet in een transactieblok, dus die herstelmigratie moet
-- buiten de transactionele pipeline om (psql/SQL-editor). Zonder `concurrently` kan het
-- ook gewoon in een migratie — de index is ~960 kB en in ondereen seconde opgebouwd.
--
-- WAARAAN ZIE JE DAT HET MISGING: een queryvorm op transactions die na de drop een
-- Seq Scan kiest waar hij eerst een index gebruikte. Te zien met dezelfde EXPLAIN's als
-- hierboven, of aan een oplopende seq_scan-teller op
-- pg_stat_user_tables where relname = 'transactions'.
--
-- RELEASE-AANWIJZING
-- 1. Draai deze migratie bij voorkeur buiten piek.
-- 2. Faalt hij met "canceling statement due to lock timeout": dat is het vangnet dat
--    werkt, niet een defect. Opnieuw draaien op een rustiger moment.
-- 3. Verifieer ná toepassen live: idx_transactions_user_id is weg uit pg_indexes,
--    idx_transactions_user_date is nog indisvalid, en de vier EXPLAIN-vormen hierboven
--    kiezen nog steeds een index (geen Seq Scan).
