-- De archief-rekening: de verzamelplek voor transacties van verwijderde
-- betaalrekeningen.
--
-- ── Waarom een verzamelplek en niet gewoon weggooien ──────────────────────────
-- Wie een betaalrekening verwijdert, wil van de RÉKENING af — niet per se van
-- zijn geschiedenis. Zonder verzamelplek is er maar één uitkomst mogelijk, en
-- die is onomkeerbaar: `transactions.account_id` is ON DELETE **CASCADE** met
-- een `NOT NULL`-kolom — gemeten tegen `pg_constraint` op 04-08-2026 en
-- gecodificeerd in `20260804110000_codify_bank_account_cascade_fks.sql`. (Het
-- migratiebestand `20260215000000_create_base_tables.sql:219` zegt SET NULL;
-- dat is drift, en een eerdere versie van deze kop nam die lezing over.) De
-- boekingen blijven dus niet als wees staan — ze worden VERNIETIGD, en omdat
-- een RI-cascade buiten RLS om draait ook de boekingen die de verwijderende
-- gebruiker zelf niet mag aanraken. De gebruiker moet kunnen kiezen —
-- meeverhuizen of meeverdwijnen — en "meeverhuizen" heeft een doel nodig dat
-- de cascade níét raakt. Dat doel is deze rij.
--
-- ── Waarom een eigen KOLOM en geen `account_type = 'archive'` ─────────────────
-- De voor de hand liggende variant kost drie dingen en levert er nul op:
--   * `bank_accounts_account_type_check` moet verbreed
--     (`20260616000000_widen_bank_accounts_account_type_check.sql`);
--   * `lib/account-types.ts` krijgt een zevende waarde, terwijl
--     `lib/regression-tests/suites/bank-account-type-constraint.test.ts:39-46`
--     die lijst op exact zes waarden pint (de test is er juist om die drie
--     lagen synchroon te houden — hem oprekken voor een niet-type is precies
--     wat hij hoort te verhinderen);
--   * de waarde verschijnt daarna als kéuze in élk rekeningformulier, want dat
--     formulier rendert `ACCOUNT_TYPES`.
-- En inhoudelijk klopt het niet: een archief is een ROL die een rekening
-- vervult, geen SOORT rekening. Vandaar een eigen booleaanse vlag. De bucket
-- krijgt `account_type = 'other'` — een bestaande, al toegestane waarde.
--
-- ── Waarom de bucket onzichtbaar blijft ──────────────────────────────────────
-- De bucket is administratie, geen rekening: hij hoort niet in het
-- rekeningoverzicht, niet in het netto vermogen en niet in de FIRE-cijfers. Dat
-- wordt niet met een nieuw filter afgedwongen maar met de eigenschappen die de
-- app AL leest. Hij krijgt:
--
--   is_active = false · balance = 0 · linked_asset_id IS NULL ·
--   ownership = 'personal'
--
-- Het app-brede predicaat voor "losse bankrekening" (saldo dat BOVENOP het
-- cash-bezit wordt geteld) is `is_active = true AND linked_asset_id IS NULL`.
-- Alle acht vindplaatsen dragen `is_active = true` mee — nagelopen, niet
-- aangenomen: `lib/unlinked-cash.ts`, `lib/core-data-loader.ts:441`,
-- `lib/assets-data-loader.ts:81-91`, `components/app/horizon/horizon-client.tsx:983`,
-- `app/(app)/horizon/whatif/whatif-page-client.tsx:216`,
-- `app/api/report/balans/route.ts:143`, `lib/kpi-context.ts:287`,
-- `lib/server-data/base.ts`. `is_active = false` sluit de bucket daarmee overal
-- uit; `balance = 0` is het tweede vangnet voor een vindplaats die ooit vergeten
-- wordt.
--
-- `ownership = 'personal'` is de derde: een gedeelde rij wordt door de
-- huishoud-stempel aan het huishouden gehangen, en de SELECT-policy op
-- `bank_accounts` is huishoud-verbreed. Een 'personal'-bucket komt dus nooit in
-- het zicht van de partner. (De stempel-trigger zelf staat overigens NIET in de
-- migratiebestanden — hij bestaat alleen live, zie de comment in
-- `20260731054821` r.19. Dat is een aparte drift, buiten scope hier; de
-- 'personal'-keuze werkt met of zonder die trigger.)
--
-- ── Waarom de unieke index niet cosmetisch is ────────────────────────────────
-- De bucket wordt LAZY aangemaakt: pas bij de eerste verwijdering waarbij de
-- gebruiker zijn transacties wil houden. Dat is een lezen-dan-schrijven, en dus
-- een TOCTOU. Twee gelijktijdige verwijderingen (twee tabbladen, een dubbelklik,
-- een herhaling na een timeout) lezen allebei "geen bucket" en maken er allebei
-- één — waarna de gebruiker twee archieven heeft en zijn geschiedenis over
-- beide verdeeld is. De partiële unieke index is de grens eronder; het
-- `select`-dan-`insert` in de RPC is de vriendelijke variant erboven. Zelfde
-- redenering en zelfde vorm als
-- `bank_connection_accounts_one_active_per_bank_account`
-- (`20260729234928`, invariant 1) — en zelfde reden voor een PARTIËLE index in
-- plaats van een constraint: de vlag is `false` op vrijwel elke rij, en die
-- rijen hoeven elkaar niet uit te sluiten.
--
-- ── RLS-DEKKING van de nieuwe kolom (expliciet, want additief) ────────────────
-- Een `add column` erft de bestaande policies stilzwijgend. Vastgelegd wélke:
--
--   SELECT · "Users view own or shared bank_accounts" (rol `authenticated`,
--            eigen rij OF gedeeld binnen het huishouden). De bucket is altijd
--            'personal', dus in de praktijk: alleen de eigenaar leest hem.
--   INSERT · "Users insert own bank_accounts"  — `with check auth.uid()=user_id`
--   UPDATE · "Users update own bank_accounts"  — `using` én `with check` idem
--   DELETE · "Users delete own bank_accounts"  — `using auth.uid()=user_id`
--   (alle vier uit `20260719090108` r.240-244.)
--
-- BEDOELD SCHRIJFPAD: uitsluitend `public.delete_bank_account()` (de volgende
-- migratie). Geen route, formulier of loader zet deze vlag. De kolom is
-- daarmee schrijfbaar-maar-niet-geschreven, en dat is bewust: de vlag met een
-- trigger dichttimmeren zou deze migratie van additief naar gedragswijzigend
-- tillen. RESTRISICO, benoemd en begrensd: een gebruiker kan via de anon-RLS-
-- client de vlag op zijn EIGEN rekening zetten. Gevolg blijft binnen zijn eigen
-- gegevens — die rekening wordt dan het archiefdoel en is niet meer te
-- verwijderen (TF409). Geen cross-user bereik: `user_id = auth.uid()` staat in
-- élke van de vier policies, en de unieke index is per gebruiker gescoped.
--
-- ── Geen tabelherschrijving ──────────────────────────────────────────────────
-- `add column … not null default false` is sinds PostgreSQL 11 een
-- metadata-operatie (niet-volatiele default), dus geen rewrite van
-- `bank_accounts` en geen langdurige ACCESS EXCLUSIVE-lock.

alter table public.bank_accounts
  add column if not exists is_archive_bucket boolean not null default false;

comment on column public.bank_accounts.is_archive_bucket is
  'Markeert de archief-rekening: de verzamelplek voor transacties van verwijderde betaalrekeningen. Hoogstens één per gebruiker (partiële unieke index bank_accounts_one_archive_per_user_idx). Bewust een eigen kolom en géén account_type-waarde — een archief is een rol, geen rekeningtype, en account_type kent een CHECK-constraint plus een op zes waarden gepinde UI-lijst (lib/account-types.ts). De bucket draagt is_active=false, balance=0, linked_asset_id=null en ownership=personal, zodat hij buiten elk app-breed "losse rekening"-predicaat (is_active AND linked_asset_id IS NULL) en buiten het zicht van de huishoud-partner blijft. Enige schrijver: public.delete_bank_account().';

-- ── Hoogstens één archief per gebruiker ──────────────────────────────────────
create unique index if not exists bank_accounts_one_archive_per_user_idx
  on public.bank_accounts (user_id) where is_archive_bucket;

comment on index public.bank_accounts_one_archive_per_user_idx is
  'Hoogstens één archief-rekening per gebruiker. Niet cosmetisch: de bucket wordt lazy aangemaakt in public.delete_bank_account (select-dan-insert = TOCTOU), dus twee gelijktijdige verwijderingen zouden er zonder deze index twee maken en de geschiedenis over beide verdelen. Partieel, zodat de vele is_archive_bucket=false-rijen elkaar niet uitsluiten. Zelfde vorm als bank_connection_accounts_one_active_per_bank_account (20260729234928).';

-- ── De auto-cash-asset-trigger moet de bucket overslaan ──────────────────────
-- KRITIEK. `fn_auto_link_bank_account_asset()` draait BEFORE INSERT op
-- `bank_accounts` en maakt bij `linked_asset_id IS NULL` een `assets`-rij aan
-- met `is_active = true` en `has_budget_tracking = true`. Zonder de guard
-- hieronder zou het aanmaken van de archief-rekening dus een ZICHTBARE
-- bezitting-kaart opleveren, mét budgettering, voor een "rekening" die de
-- gebruiker nooit heeft gemaakt — en die kaart telt via `assets` gewoon mee in
-- netto vermogen. De guard staat direct ná de bestaande `linked_asset_id`-guard
-- en vóór de INSERT, dus de bucket krijgt geen companion en houdt
-- `linked_asset_id IS NULL`.
--
-- Gevolg voor de zusterrigger `trg_guard_bank_account_linked_asset`
-- (`20260730210321`): die returned meteen bij `linked_asset_id IS NULL`, en dat
-- is precies de toestand waarin deze trigger de bucket achterlaat. BEFORE-
-- triggers draaien op alfabetische naam, dus `trg_bank_account_auto_cash_asset`
-- eerst en de guard daarna — de guard ziet dus null en laat de rij door.
-- Bevestigd, niet aangenomen: de bucket raakt die guard niet.
--
-- GEEN NIEUWE `create trigger` — zelfde motivering als in de kop van
-- `20260802093000_auto_link_cash_asset_encrypted_iban.sql`:
-- `trg_bank_account_auto_cash_asset` verwijst naar de functie via haar OID, niet
-- naar haar body. `CREATE OR REPLACE FUNCTION` werkt de bestaande pg_proc-rij
-- bij, de OID blijft gelijk en de trigger pikt de nieuwe body direct op. Een
-- DROP/CREATE zou alleen een venster openen waarin inserts ongetriggerd
-- doorglippen.
--
-- De rest van de body is LETTERLIJK die uit `20260802093000` — deze migratie
-- voegt vier regels toe en verandert verder niets (ook niet de omgang met de
-- versleutelde IBAN-kolommen).
--
-- ÉÉN bewuste afwijking, expliciet zodat ze niet stil is: `set search_path`
-- gaat van `public` naar `''`, de vorm die alle recente migraties gebruiken
-- (`20260729222134`, `20260729234928`, `20260730210321`, `20260802140500`,
-- `20260803090000`). Dat kan zonder gedragswijziging omdat de body ELKE
-- verwijzing al volledig kwalificeert — `public.assets` is de enige tabel en
-- `gen_random_uuid()` komt niet in deze functie voor. Bij een SECURITY
-- DEFINER-functie is een lege search_path de veilige stand: hij sluit uit dat
-- een aanroeper met een eigen schema een objectnaam kaapt.
CREATE OR REPLACE FUNCTION public.fn_auto_link_bank_account_asset()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  new_asset_id UUID;
BEGIN
  -- Only act if no linked asset yet
  IF NEW.linked_asset_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- De archief-rekening krijgt GEEN companion cash-bezit: hij representeert geen
  -- geld maar een verzamelplek. Zie de kop van deze migratie.
  IF NEW.is_archive_bucket THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.assets (
    user_id, name, asset_type, current_value, purchase_value,
    expected_return, monthly_contribution, institution,
    account_number_encrypted, account_number_hash,
    is_active, sort_order, ownership, household_id, net_worth_inclusion_pct,
    is_liquid, subtype, has_budget_tracking
  ) VALUES (
    NEW.user_id, NEW.name, 'cash', NEW.balance, NEW.balance,
    0, 0, NEW.bank_name,
    NEW.iban_encrypted, NEW.iban_hash,
    true, COALESCE(NEW.sort_order, 0), COALESCE(NEW.ownership, 'personal'),
    NEW.household_id, 100, true, NEW.account_type, true
  ) RETURNING id INTO new_asset_id;

  NEW.linked_asset_id := new_asset_id;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_auto_link_bank_account_asset() IS
  'BEFORE INSERT-trigger op bank_accounts: maakt de companion cash-asset en zet de backlink. '
  'Slaat de archief-rekening (is_archive_bucket) over — die representeert een verzamelplek, geen geld, '
  'en zou anders als zichtbare bezitting-kaart mét budgettering in het netto vermogen opduiken. '
  'Kopieert uitsluitend de versleutelde IBAN (iban_encrypted) en de blind index (iban_hash) '
  'naar assets.account_number_encrypted/-_hash. Raakt de plaintext-kolommen bank_accounts.iban '
  'en assets.account_number bewust niet aan (Stage B van de field-level encryptie).';

-- Idempotente herhaling van de hardening uit 20260611130000 — zelfde reden als
-- in 20260802093000: `create or replace` behoudt de ACL, maar deze functie is
-- ooit buiten migraties om via het dashboard aangemaakt, dus de eindtoestand
-- wordt hier onafhankelijk van die drift gemaakt.
REVOKE EXECUTE ON FUNCTION public.fn_auto_link_bank_account_asset() FROM public, anon, authenticated;
