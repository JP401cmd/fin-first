-- ADR 0139 · "budgetteren uit" telt niet mee in de uitgaven- en inkomstencijfers.
--
-- WAAROM
-- ──────────────────────────────────────────────────────────────────────────────
-- `public.tx_month_aggregate` is de ENE bron van elk maandcijfer dat uit
-- transacties komt: de budgetsom (lib/budget-realized.ts), het transactie-
-- jaarinkomen, de spaarquote (lib/savings-source.ts), het dagtarief
-- (lib/expense-rate.ts), de FIRE-uitgaven en de nachtelijke snapshots
-- (app/api/snapshots/cron/route.ts). De functie filterde tot nu toe UITSLUITEND
-- op datum en scope — nooit op de budget-status van de rekening waar de boeking
-- op staat.
--
-- Gevolg: zet een gebruiker "budgetteren" UIT op een rekening, dan blijven de
-- boekingen van die rekening gewoon meetellen in al die cijfers, terwijl het
-- SALDO van diezelfde rekening al als cash-bezitting (mét rendement) in het
-- vermogen zit. Dat is dubbel geteld in twee richtingen tegelijk: de rekening
-- levert vermogensgroei én consumptie, en de gebruiker heeft juist gezegd dat
-- hij die boekingen niet in zijn budget wil.
--
-- EIGENAARSBESLUIT (11 sep 2026): budgetteren uit = alleen het saldo telt; de
-- boekingen van die rekening vallen buiten de uitgaven- én inkomstencijfers.
--
-- WAT "BUDGETTEREN UIT" IS — TWEE VLAGGEN, ÉÉN REGEL
-- ──────────────────────────────────────────────────────────────────────────────
-- De keuze leeft op twee plekken die gesynchroniseerd hóren te zijn:
--
--   • `assets.has_budget_tracking` — de CANONIEKE gate. Dit is de vlag die de
--     gebruiker aanvinkt (`lib/budget-cash-sources.ts`, de inrichtwizard) en die
--     `syncBudgetingActive` (lib/budgeting-active.ts) leest om
--     `profiles.budgeting_active` te bepalen.
--   • `bank_accounts.is_active` — de COMPANION-spiegel. `syncBankAccountCompanion`
--     (lib/bank-account-companion.ts) zet 'm op false bij uitzetten; precies de
--     surfaces die boekingen voeden (/core/cash, /core/cash/import) filteren er al
--     op.
--
-- De regel hieronder sluit uit zodra ÉÉN van de twee "uit" zegt. Dat is bewust,
-- want ze kunnen alleen uiteenlopen door een half geslaagde schrijfactie (de
-- gedocumenteerde faalvorm: de setup-route vergat de sync ooit, bug jun 2026) —
-- en dan heeft de gebruiker érgens "uit" gezegd. De andere keuze ("pas uitsluiten
-- als beide uit staan") zou een desync laten uitpakken als "telt toch mee", wat
-- exact het defect is dat deze migratie repareert. Bovendien is een boeking op een
-- `is_active = false`-rekening vandaag al ONZICHTBAAR in /core/cash — hem wél in de
-- budgetsom laten meetellen is precies de inconsistentie.
--
-- `assets.is_active` gaat mee in dezelfde regel: een gedeactiveerd cash-bezit is de
-- vorm waarin een oude rekening wordt weggezet, en `syncBudgetingActive` telt die
-- rijen ook al niet mee.
--
-- HET ARCHIEF IS GEEN BUDGETKEUZE — EN IS DE ENIGE UITZONDERING VOORAF
-- ──────────────────────────────────────────────────────────────────────────────
-- `bank_accounts.is_archive_bucket` (migratie 20260804085748) is NADRUKKELIJK GÉÉN
-- uitsluitingsgrond (eigenaarsbesluit 12 sep 2026, herziening van de eerste
-- lezing van deze migratie). "Budgetteren uit" is een bewuste keuze per rekening
-- ("reken deze niet mee"); het archief is opruimen. Daar belanden boekingen
-- wanneer iemand een rekening verwijdert MÉT "transacties bewaren" — de
-- rekeningoverstap. Zou het archief uitgesloten worden, dan verliest iemand die
-- van bank wisselt in één klap zijn hele voorgeschiedenis uit dagtarief,
-- spaarquote en FIRE, en zakt `historyMonths` (ADR 0138) in tot de maanden sinds
-- de overstap. Bewaarde historie blijft dus meetellen.
--
-- DAAROM STAAT DE ARCHIEF-TEST VOORAAN EN NIET IN DE OR-KETEN. `delete_bank_account`
-- maakt de bucket aan met `is_active = false` (gemeten tegen `pg_proc`,
-- 12-09-2026: stap 4 zet expliciet `is_active` op false, `ownership` op 'personal'
-- en `is_archive_bucket` op true) en verplaatst de boekingen er daarna heen
-- (stap 6: `account_id = v_bucket`). `is_archive_bucket` simpelweg UIT de
-- uitsluitingslijst halen zou dus niets oplossen: de bucket viel dan alsnog weg via
-- de actief-vlag — precies het stille verlies dat dit besluit verbiedt. De bucket
-- wordt daarom als eerste conjunct uitgezonderd: hij is NOOIT uitgesloten,
-- ongeacht de andere vlaggen.
--
-- De asset-tak raakt de bucket sowieso nooit: `delete_bank_account` maakt hem
-- zonder `linked_asset_id` aan (die kolom staat niet in de INSERT-kolomlijst, dus
-- NULL — gemeten 12-09-2026), en het bezit dat in stap 8 op
-- `has_budget_tracking = false` wordt gezet hangt aan de VERWIJDERDE rekening, niet
-- aan de bucket. De vooraf-uitzondering is dus geen dubbele beveiliging maar de
-- enige die de actief-vlag afvangt.
--
-- GEEN GEKOPPELD BEZIT = MEETELLEN (belangrijk, en gemeten). Een rekening ZONDER
-- `linked_asset_id` heeft geen canonieke gate; die valt terug op `is_active`. Op
-- productie (gemeten tegen `public.bank_accounts`/`public.transactions`,
-- 12-09-2026) zijn dat 2 actieve rekeningen met samen 7.975 van de 24.606
-- transacties — een regel die "geen gekoppeld bezit" als "budgetteren uit" leest,
-- zou een derde van alle boekingen laten verdwijnen.
--
-- HET RLS-RISICO, EN WAAROM DEZE VORM HET NIET INTRODUCEERT
-- ──────────────────────────────────────────────────────────────────────────────
-- `tx_month_aggregate` is SECURITY INVOKER (`prosecdef = false`, gemeten tegen
-- `pg_proc`, 12-09-2026). Een JOIN of EXISTS op `public.bank_accounts` zou dus
-- onder de RLS van de AANROEPER vallen. De SELECT-policy daar is smaller dan die
-- op `transactions` (beide gemeten tegen `pg_policies`, 12-09-2026):
--
--   bank_accounts "Users view own or shared bank_accounts":
--     auth.uid() = user_id OR (ownership = 'shared' AND household_id = user_household_id())
--   transactions "View own or shared transactions":
--     auth.uid() = user_id OR (ownership = 'shared' AND household_id = user_household_id()
--                              AND account_id <> ALL (partner_hidden_account_ids()))
--
-- Er bestaan dus rijen die je wél als transactie mag zien terwijl je de rekening
-- niet mag zien — bijvoorbeeld een eigen boeking die naar de PERSOONLIJKE rekening
-- van de partner wijst, of een gedeelde boeking waarvan de rekeninghouder het
-- huishouden inmiddels verlaten heeft. Bij een gewone join zou zo'n rij STIL uit
-- de huishoudcijfers vallen: een bedragverschuiving zonder financiële
-- gebeurtenis, en onzichtbaar voor de gebruiker.
--
-- (Het meest voor de hand liggende geval kán níét optreden: een persoonlijke
-- rekening van de partner is per CHECK-constraint `bank_accounts_visibility_
-- matches_ownership` — `(ownership = 'personal') = (partner_visibility = 'none')`,
-- gemeten tegen `pg_constraint`, 12-09-2026 — altijd `partner_visibility = 'none'`
-- en dus altijd opgenomen in `partner_hidden_account_ids()`; haar gedeelde
-- boekingen zijn dan al onzichtbaar. De randgevallen hierboven blijven staan, en
-- een constraint die de fix draagt is geen constraint waarop je een geldbedrag
-- wilt laten rusten.)
--
-- DE GEKOZEN VORM: aftrekken van een set die de aanroeper al ziet, in plaats van
-- joinen op een tabel die hij misschien niet ziet.
--
--   1. De zichtbare transactierijen worden ONGEWIJZIGD bepaald — zelfde WHERE,
--      zelfde invoker-RLS. De rijverzameling van deze functie hangt dus nog steeds
--      uitsluitend aan de policy op `transactions`.
--   2. Uit DIE rijen komen de voorkomende `account_id`'s.
--   3. Een SECURITY DEFINER-helper, `public.budget_excluded_account_ids(uuid[])`,
--      zegt welke van die ids "budgetteren uit" hebben. Definer, omdat alleen zo
--      de status van een rekening leesbaar is die de aanroeper zelf niet mag zien
--      — zodat het antwoord voor een huishoudcijfer hetzelfde is, ongeacht wie het
--      opvraagt.
--   4. Die ids worden AFGETROKKEN. Kent de helper een id niet, dan blijft de rij
--      staan: de faalrichting is "telt mee zoals vandaag", nooit "verdwijnt stil".
--
-- De helper VERRUIMT niets aan zichtbaarheid: hij geeft geen enkele transactierij
-- terug, en geen enkel attribuut van een rekening (geen naam, saldo, IBAN of
-- eigenaar) — alleen een deelverzameling van de uuid's die de aanroeper zélf heeft
-- meegegeven. Wat een aanroeper er hooguit uit leert, is voor een rekening-uuid dat
-- hij al bezit óf die hij zou raden (uuid's zijn niet te raden) het feit "hierop
-- staat budgetteren uit" — en zelfs dat is niet te onderscheiden van "dit id
-- bestaat niet", want beide leveren niets op. Dat is de bewust geaccepteerde,
-- begrensde rest; hij staat ook in ADR 0139.
--
-- WAAROM GEEN `auth.uid()`-GEDREVEN HELPER (zoals `partner_hidden_account_ids`):
-- het SNAPSHOT-CRON-pad draait op de service-role, waar `auth.uid()` NULL is
-- (migratie 20260811180000 / ADR 0103). Een helper die zijn perimeter uit
-- `auth.uid()` afleidt, zou daar een lege set opleveren en de cron stil op de OUDE
-- regel laten rekenen — twee grondslagen in één tijdreeks, precies wat ADR 0103
-- juist heeft opgeruimd. De array-vorm is rol-onafhankelijk en werkt in beide paden
-- identiek.
--
-- VANDAAG VERSCHUIFT ER GEEN ENKEL GETAL — deze migratie is PREVENTIEF. Gemeten op
-- productie, 12-09-2026: 27 rekeningen, waarvan NUL uitgesloten. De enige
-- kandidaat was de archief-bucket (`is_active = false` + `is_archive_bucket =
-- true`, 0 transacties) en die is sinds het eigenaarsbesluit van 12 sep 2026
-- juist expliciet vrijgesteld. 24.606 transacties, 0 zonder rekening. De oude en
-- de nieuwe definitie leveren over de VOLLEDIGE historie exact dezelfde 3.105
-- aggregaatrijen op (`except` in beide richtingen = 0 rijen, ad-hoc nagerekend
-- 12-09-2026).
--
-- INDEXEN: geen nieuwe nodig. De helper zoekt op `bank_accounts.id` en
-- `assets.id` — beide primaire sleutels. De transactie-WHERE is ongewijzigd en
-- wordt nog steeds gedekt door `idx_transactions_user_date` en
-- `idx_transactions_household_shared_date`.
--
-- IDEMPOTENT: `create or replace` op beide functies; her-uitvoeren is veilig.
-- SIGNATUUR ONGEWIJZIGD: alle bestaande aanroepers blijven zonder wijziging werken.

-- ── De helper ────────────────────────────────────────────────────────────────
create or replace function public.budget_excluded_account_ids(p_account_ids uuid[])
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(ba.id), '{}'::uuid[])
  from public.bank_accounts ba
  where ba.id = any(coalesce(p_account_ids, '{}'::uuid[]))
    -- HET ARCHIEF IS NOOIT UITGESLOTEN — en deze conjunct staat VOORAAN, niet in
    -- de OR-keten hieronder. De bucket draagt `is_active = false` (zo maakt
    -- `delete_bank_account` hem aan), dus zonder deze uitzondering zou bewaarde
    -- historie alsnog via de actief-vlag wegvallen. Bewaarde historie is opruimen,
    -- geen budgetkeuze: zie de kop (rekeningoverstap).
    and ba.is_archive_bucket = false
    and (
      -- companion-spiegel: budgetteren staat uit (syncBankAccountCompanion)
      ba.is_active = false
      -- canonieke gate op het gekoppelde cash-bezit. GEEN gekoppeld bezit =
      -- geen rij = false = meetellen (zie de kop: 7.975 boekingen hangen daaraan).
      or exists (
        select 1
        from public.assets a
        where a.id = ba.linked_asset_id
          and (a.has_budget_tracking is not true or a.is_active is not true)
      )
    );
$$;

-- GRANTS — spiegelt die van `tx_month_aggregate`, en om dezelfde reden.
--
-- PUBLIC krijgt niets. `anon` KRIJGT WEL execute: de functie wordt aangeroepen
-- BINNEN `tx_month_aggregate`, die SECURITY INVOKER is, dus het execute-recht van
-- de aanroeper geldt. Zonder dit recht zou een uitgelogde server-render geen lege
-- set maar `permission denied for function` (42501) krijgen — een gedragsregressie
-- op een pad dat vandaag stil goed gaat. De conventie in deze codebase is
-- expliciet "0 rijen, géén fout" (zie de leak-check-regel in
-- .claude/skills/_shared/pijplijn-conventies.md en ADR 0048). Voor anon is de
-- uitkomst sowieso `'{}'`: hij matcht geen SELECT-policy op `transactions`, dus de
-- meegegeven array is leeg.
revoke all on function public.budget_excluded_account_ids(uuid[]) from public;
grant execute on function public.budget_excluded_account_ids(uuid[])
  to authenticated, anon, service_role;

comment on function public.budget_excluded_account_ids(uuid[]) is
  'Geeft van de MEEGEGEVEN rekening-id''s terug welke "budgetteren uit" hebben: bank_accounts.is_active = false, of een gekoppeld cash-bezit met has_budget_tracking/is_active niet waar. De ARCHIEF-bucket (is_archive_bucket) is altijd vrijgesteld — bewaarde historie na een rekeningverwijdering is opruimen, geen budgetkeuze, en de bucket draagt is_active = false, dus die uitzondering moet vooraf staan. SECURITY DEFINER omdat de SELECT-policy op bank_accounts smaller is dan die op transactions — zo is de budget-status van een rekening leesbaar zonder de zichtbaarheid van de boeking te veranderen. Verruimt niets: geeft geen attributen terug, alleen een deelverzameling van de meegegeven uuid''s. Gebruikt door public.tx_month_aggregate (ADR 0139).';

-- ── Het aggregaat ────────────────────────────────────────────────────────────
-- CREATE OR REPLACE met ONGEWIJZIGDE signatuur en returns-clausule: geen DROP
-- nodig (en geen PGRST203-risico zoals bij 20260811180000, want er komt geen
-- tweede functie bij).
create or replace function public.tx_month_aggregate(
  p_from date,
  p_to date,
  p_own_only boolean default false,
  p_user_id uuid default null,
  p_household_id uuid default null
)
returns table (
  month text,
  budget_id uuid,
  transaction_type text,
  sum_positief numeric,
  sum_negatief numeric,
  count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  -- STAP 1 — de zichtbare rijen. Ongewijzigd t.o.v. 20260811180000: dezelfde
  -- datumgrenzen, dezelfde ownOnly-tak, hetzelfde restrictieve scope-filter. De
  -- rijverzameling hangt dus nog steeds uitsluitend aan de RLS van transactions.
  with zichtbaar as (
    select t.date, t.budget_id, t.transaction_type, t.amount, t.account_id
    from public.transactions t
    where t.date >= p_from
      and t.date <  p_to
      and (not p_own_only or t.user_id = (select auth.uid()))
      and (
        p_user_id is null
        or t.user_id = p_user_id
        or (
          t.ownership = 'shared'
          and t.household_id is not null
          and t.household_id = p_household_id
        )
      )
  ),
  -- STAP 2 — welke van de rekeningen die in DIE rijen voorkomen hebben
  -- budgetteren uit. De helper is SECURITY DEFINER; hij krijgt alleen id's die
  -- uit hierboven zichtbare rijen komen en geeft alleen id's terug.
  uitgesloten as (
    select public.budget_excluded_account_ids(
      array(select distinct z.account_id from zichtbaar z where z.account_id is not null)
    ) as ids
  )
  -- STAP 3 — aftrekken, niet joinen. Een rekening die de helper niet kent blijft
  -- staan: de faalrichting is "ongewijzigd", nooit "stil verdwenen".
  --
  -- De `account_id is null`-tak is DEFENSIEF: `transactions.account_id` is vandaag
  -- NOT NULL (gemeten tegen `information_schema.columns`, 12-09-2026) en er zijn 0
  -- rijen zonder rekening. De tak kost niets en zorgt dat een toekomstige
  -- versoepeling van die constraint geen boekingen laat verdampen — het verschil
  -- tussen `not (x = any(...))` en NULL is precies waar een filter stil te veel
  -- wegneemt.
  select
    to_char(z.date, 'YYYY-MM')                                    as month,
    z.budget_id,
    z.transaction_type,
    coalesce(sum(z.amount) filter (where z.amount > 0), 0)::numeric as sum_positief,
    coalesce(sum(z.amount) filter (where z.amount < 0), 0)::numeric as sum_negatief,
    count(*)::bigint                                              as count
  from zichtbaar z
  cross join uitgesloten u
  where z.account_id is null
     or not (z.account_id = any(u.ids))
  group by 1, 2, 3
$$;

-- Grants ongewijzigd t.o.v. 20260811180000; `create or replace` laat ze staan.
-- Ze staan hier expliciet zodat dit bestand de volledige eindtoestand beschrijft.
revoke all on function public.tx_month_aggregate(date, date, boolean, uuid, uuid) from public;
grant execute on function public.tx_month_aggregate(date, date, boolean, uuid, uuid)
  to authenticated, anon, service_role;

comment on function public.tx_month_aggregate(date, date, boolean, uuid, uuid) is
  'Maand-aggregaat (som pos/neg + count) per (maand, budget_id, transaction_type) over [p_from, p_to). SECURITY INVOKER — de RLS van transactions geldt onverkort. p_own_only=true beperkt tot eigen rijen (excl. gedeeld huishouden). p_user_id/p_household_id (ADR 0103) zijn een puur RESTRICTIEF extra AND-filter dat de policy "View own or shared transactions" spiegelt, zodat een service-role-aanroeper (snapshot-cron) per gebruiker kan afbakenen; voor een authenticated aanroeper met een vreemd id levert dat 0 rijen en geen fout — het is nooit een RLS-bypass. Sinds ADR 0139 vallen boekingen op een rekening met "budgetteren uit" buiten het aggregaat (public.budget_excluded_account_ids); dat gebeurt door AFTREKKEN van een definer-bepaalde set, niet door een join op bank_accounts, zodat de zichtbaarheid van de boeking zelf niet verandert. De ARCHIEF-bucket is daarbij expliciet vrijgesteld: bewaarde historie na een rekeningverwijdering blijft de vensters voeden.';

-- Signatuur is niet gewijzigd, maar er komt een functie bij op het REST-oppervlak;
-- PostgREST leest zijn schema-cache normaal via de Supabase-event-trigger — we
-- vragen het expliciet zodat er geen venster is waarin de helper onbekend is.
notify pgrst, 'reload schema';
