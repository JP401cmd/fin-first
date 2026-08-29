-- Drift-herstel: de foreign keys van `transactions.account_id` en
-- `recurring_transactions.account_id` naar `bank_accounts(id)` terug in de repo,
-- zoals ze op de LIVE database werkelijk staan.
--
-- ── Wat er mis is ─────────────────────────────────────────────────────────────
-- `20260215000000_create_base_tables.sql` zegt op r.219 en r.266 dat beide
-- kolommen `ON DELETE SET NULL` zijn en nullable. **Op productie staan ze
-- allebei op `ON DELETE CASCADE`, met een `NOT NULL`-kolom.** Gemeten tegen
-- `pg_constraint` + `pg_attribute` op 04-08-2026:
--
--   transactions_account_id_fkey            confdeltype = 'c'  · attnotnull = t
--   recurring_transactions_account_id_fkey  confdeltype = 'c'  · attnotnull = t
--   bank_connection_accounts_bank_account_id_fkey  confdeltype = 'a' (NO ACTION)
--
-- Géén enkele migratie in de keten zet die twee ooit op CASCADE. Dit is dus
-- exact dezelfde drift-klasse die ADR 0045 beschrijft — DDL die remote is
-- toegepast zonder bijbehorend bestand — alleen op een FOREIGN KEY in plaats
-- van op een policy. (De derde regel klopt wél en wordt hier niet aangeraakt;
-- hij staat er alleen bij omdat de kop van `20260804102500` ernaar verwijst.)
--
-- ── Waarom dit géén administratief detail is ─────────────────────────────────
-- Een referentiële-integriteitscascade draait BUITEN RLS OM. Dat is geen
-- Postgres-eigenaardigheid maar het ontwerp: RI-acties worden intern als de
-- eigenaar van de bovenliggende tabel uitgevoerd en passeren de policies van de
-- kindtabel niet. Het verschil tussen de twee lezingen is daarmee het verschil
-- tussen twee totaal verschillende gebeurtenissen:
--
--   SET NULL (wat de repo zei)  — de boekingen BLIJVEN bestaan, met een lege
--                                 rekening. Een schoonheidsfout: wezen in het
--                                 grootboek, hersteld met één update.
--   CASCADE  (wat er echt is)   — de boekingen worden VERNIETIGD. Alles wat op
--                                 dat moment nog naar de rekening wijst, van
--                                 wie dan ook, ongeacht welke policy die rijen
--                                 beschermt.
--
-- Een `delete from public.bank_accounts` met een expliciet `user_id = auth.uid()`
-- filter beschermt dus NIET de rijen van de partner. Dat filter zorgt er alleen
-- voor dat de verwijderende query zélf van die rijen afblijft — waarna de
-- cascade ze alsnog meesleurt. `public.delete_bank_account()`
-- (`20260804102500`) is precies zo'n functie, en is op de repo-lezing ontworpen.
--
-- ── En waarom "groen getest" tot vandaag niets bewees ────────────────────────
-- Dit is het duurste gevolg en de reden dat dit bestand er moet zijn. Élke
-- omgeving die uit de MIGRATIES ontstaat — `supabase db reset`, een
-- preview-branch, een lokale stack, het rol-gesimuleerde testharnas — kreeg tot
-- nu toe SET NULL en nullable kolommen. Een verwijdertest die daar slaagt
-- bewijst iets over een database die niet bestaat: op productie doet dezelfde
-- code iets anders, en juist de destructieve kant. De twee sporen moeten één
-- verhaal vertellen vóórdat een test over verwijderen ergens over gaat.
--
-- ── Wat deze migratie doet ────────────────────────────────────────────────────
-- Precies wat ADR 0045 (`docs/adr/0045-migratie-baseline-resync-en-drift-hek.md`,
-- besluit 1-4) voorschrijft, in dezelfde vorm als
-- `20260804101500_restore_assets_debts_write_policies.sql` dat voor de
-- schrijf-policies doet:
--
--   besluit 1 — gegenereerd uit remote-introspectie (`pg_constraint`,
--               `pg_attribute`), niet met de hand verzonnen;
--   besluit 2 — idempotent EN een echte no-op op productie. Niet met
--               `drop constraint` + `add constraint` (dat zou de FK over álle
--               transactierijen hervalideren onder een ACCESS EXCLUSIVE-lock,
--               voor een eindtoestand die al klopt), maar met een voorwaardelijk
--               `do`-blok dat éérst kijkt of de constraint al de juiste
--               `confdeltype` heeft. Op prod voert dit blok nul DDL uit; op een
--               verse database repareert het;
--   besluit 3 — puur additief-corrigerend: geen history-rewrite, geen reset,
--               `20260215000000` blijft ongemoeid (zie de citaat-correctie daar
--               in `20260804102500`);
--   besluit 4 — dit bestand IS het hek: vanaf nu staat het echte
--               verwijdergedrag in git en is het vanuit git te reviewen.
--
-- ── De volgorde-val: `SET NOT NULL` faalt op bestaande NULL-rijen ────────────
-- `alter table … alter column account_id set not null` scant de tabel en
-- weigert zodra er ook maar één rij met `NULL` staat. Op productie kan dat niet
-- (de kolom is er al `NOT NULL`), maar op een database die ooit UIT DEZE REPO
-- is opgezet kan het wél: daar was de kolom nullable en zette de toenmalige
-- SET NULL-FK er bij elke verwijderde rekening wezen neer.
--
-- Gemeten op remote (04-08-2026): NUL rijen met `account_id IS NULL` in
-- `transactions` en NUL in `recurring_transactions` (tabelomvang relatief
-- gehouden, zie ADR 0111 — het nulresultaat is het hele argument). Deze migratie
-- is daar dus in beide blokken een no-op.
--
-- Treft een andere omgeving die wezen wél, dan stopt de migratie met een
-- expliciete fout die het aantal noemt, in plaats van met een kale
-- `23502`-melding of — veel erger — een stille aanname. WAT ER DAN MOET
-- GEBEUREN, en dat is een menselijk besluit, geen migratie:
--
--   1. de wezen zijn NIET automatisch weg te gooien. Het zijn boekingen van een
--      gebruiker; welke rekening erbij hoorde is niet meer af te leiden.
--   2. de juiste route is ze toe te wijzen aan de archief-rekening van hun
--      eigenaar (`bank_accounts.is_archive_bucket`, `20260804102000`) — precies
--      de bestemming die `delete_bank_account()` er ook voor gebruikt — en
--      daarna deze migratie opnieuw te draaien. Zoiets hoort een eigen,
--      reviewbare migratie te zijn met een eigen tijdstempel, zodat zichtbaar
--      is wélke rijen verplaatst zijn.
--   3. schoon-en-leeg (dev-sandbox, verse branch): `delete from
--      public.transactions where account_id is null` mag, maar dan als bewuste
--      handmatige stap, niet als bijwerking van een structuurmigratie.
--
-- Een migratie die zelf zou opruimen, zou onder de vlag "drift-herstel"
-- gebruikersgegevens aanraken. Dat is precies de vermenging die dit hele
-- bestand probeert te voorkomen.
--
-- ── Wat deze migratie NIET doet ──────────────────────────────────────────────
-- Ze verandert het gedrag niet, ze legt het vast. Of CASCADE hier de JUISTE
-- keuze is (ADR 0011 zou voor referentie-data eerder SET NULL voorschrijven, en
-- boekingshistorie is verdedigbaar referentie-data) is een aparte, openstaande
-- vraag. Die vraag beantwoorden in ditzelfde bestand zou van een drift-HERSTEL
-- stiekem een gedragsWIJZIGING maken en de no-op-eigenschap breken — dezelfde
-- afweging als (a) in de kop van `20260804101500`. De bescherming zit daarom
-- waar ze hoort zolang CASCADE de werkelijkheid is: in de guard van
-- `public.delete_bank_account()`, die weigert te verwijderen zodra er rijen van
-- een ander aan de rekening hangen.

-- ── transactions.account_id ──────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid    = 'public.transactions'::regclass
      and conname     = 'transactions_account_id_fkey'
      and contype     = 'f'
      and confrelid   = 'public.bank_accounts'::regclass
      and confdeltype = 'c'
  ) then
    alter table public.transactions
      drop constraint if exists transactions_account_id_fkey;
    alter table public.transactions
      add constraint transactions_account_id_fkey
      foreign key (account_id) references public.bank_accounts(id)
      on delete cascade;
    raise notice 'transactions_account_id_fkey op ON DELETE CASCADE gezet (drift-herstel)';
  end if;
end $$;

do $$
declare
  v_orphans bigint;
begin
  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.transactions'::regclass
      and attname  = 'account_id'
      and attnum   > 0
      and not attisdropped
      and not attnotnull
  ) then
    select count(*) into v_orphans from public.transactions where account_id is null;
    if v_orphans > 0 then
      raise exception
        'transactions: % rij(en) met account_id IS NULL — SET NOT NULL kan niet. Wijs ze eerst toe aan de archief-rekening van hun eigenaar (zie de kop van deze migratie); niet blind verwijderen.',
        v_orphans
        using errcode = '23502';
    end if;
    alter table public.transactions alter column account_id set not null;
    raise notice 'transactions.account_id op NOT NULL gezet (drift-herstel)';
  end if;
end $$;

comment on constraint transactions_account_id_fkey on public.transactions is
  'ON DELETE CASCADE — het verwijderen van een bankrekening VERNIETIGT haar boekingen; de repo zei tot 04-08-2026 ten onrechte SET NULL (20260215000000:219), gecodificeerd in 20260804110000 uit pg_constraint. Een RI-cascade draait buiten RLS om: een user_id-filter in de verwijderende query beschermt de rijen van de huishoud-partner NIET. Wie hier code op bouwt, moet vóór de delete zelf tellen of er vreemde rijen aan de rekening hangen — zie public.count_foreign_rows_on_bank_account() en de TF410-guard in public.delete_bank_account().';

-- ── recurring_transactions.account_id ────────────────────────────────────────
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid    = 'public.recurring_transactions'::regclass
      and conname     = 'recurring_transactions_account_id_fkey'
      and contype     = 'f'
      and confrelid   = 'public.bank_accounts'::regclass
      and confdeltype = 'c'
  ) then
    alter table public.recurring_transactions
      drop constraint if exists recurring_transactions_account_id_fkey;
    alter table public.recurring_transactions
      add constraint recurring_transactions_account_id_fkey
      foreign key (account_id) references public.bank_accounts(id)
      on delete cascade;
    raise notice 'recurring_transactions_account_id_fkey op ON DELETE CASCADE gezet (drift-herstel)';
  end if;
end $$;

do $$
declare
  v_orphans bigint;
begin
  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.recurring_transactions'::regclass
      and attname  = 'account_id'
      and attnum   > 0
      and not attisdropped
      and not attnotnull
  ) then
    select count(*) into v_orphans from public.recurring_transactions where account_id is null;
    if v_orphans > 0 then
      raise exception
        'recurring_transactions: % rij(en) met account_id IS NULL — SET NOT NULL kan niet. Zet ze op de archief-rekening van hun eigenaar of deactiveer en verwijder ze bewust (zie de kop van deze migratie).',
        v_orphans
        using errcode = '23502';
    end if;
    alter table public.recurring_transactions alter column account_id set not null;
    raise notice 'recurring_transactions.account_id op NOT NULL gezet (drift-herstel)';
  end if;
end $$;

comment on constraint recurring_transactions_account_id_fkey on public.recurring_transactions is
  'ON DELETE CASCADE — het verwijderen van een bankrekening VERNIETIGT de terugkerende regels erop; de repo zei tot 04-08-2026 ten onrechte SET NULL (20260215000000:266), gecodificeerd in 20260804110000 uit pg_constraint. Draait buiten RLS om, dus ook regels van de huishoud-partner. public.delete_bank_account() telt ze daarom expliciet mee in zijn TF410-guard.';
