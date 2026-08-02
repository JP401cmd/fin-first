-- Field-level encryptie — Stage B, voorbereiding: de auto-link-trigger van de
-- plaintext-IBAN afhalen.
--
-- WAAROM
-- `fn_auto_link_bank_account_asset()` draait BEFORE INSERT op
-- `public.bank_accounts` en maakt de companion cash-asset aan. Hij schreef
-- daarbij `assets.account_number = NEW.iban` — de plaintext-kolom. Zolang die
-- regel bestaat is `bank_accounts.iban` niet te droppen: de trigger zou bij de
-- eerstvolgende INSERT van een bankrekening stukslaan op een niet-bestaande
-- kolom, en dat is precies het pad dat onboarding en module-activatie gebruiken.
-- Deze migratie haalt die laatste SQL-blokkade weg, zodat de DROP later een
-- losse, risicoloze stap is.
--
-- WAAROM DE CIPHERTEXT KOPIEREN EN NIET ONTSLEUTELEN
-- `NEW.iban_encrypted` (AES-256-GCM, `v1:`-prefix) en `NEW.iban_hash`
-- (HMAC-SHA256 blind index over de genormaliseerde IBAN) worden LETTERLIJK
-- doorgeschreven naar `assets.account_number_encrypted` /
-- `assets.account_number_hash`. Dat mag en moet zo:
--   * De sleutels (`ENCRYPTION_KEY_V1`, `IBAN_INDEX_KEY_V1`) zijn server-only in
--     de applicatie. De database heeft ze niet en KAN dus niet ontsleutelen —
--     dat is het hele punt van de opzet, geen tekortkoming.
--   * Beide kolomparen zijn met dezelfde sleutel en dezelfde normalisatie
--     gemaakt (zie `lib/crypto/field-encryption.ts` en de backfill in
--     `scripts/encrypt-existing-bank-credentials.mjs`, die voor bank_accounts
--     én voor cash-assets exact dezelfde `encryptField`/`blindIndex` gebruikt).
--     Een gekopieerde ciphertext ontsleutelt dus gewoon in de app, en de
--     gekopieerde blind index blijft matchen op de bestaande lookups.
--   * Ontsleutelen is hier ook niet nodig: de trigger heeft de IBAN nooit
--     inhoudelijk beoordeeld, hij verplaatste alleen de waarde.
-- Rijen die zonder IBAN worden aangemaakt (module-activatie, onboarding) hebben
-- NULL in beide kolommen; de kopie is dan NULL — hetzelfde gedrag als voorheen,
-- toen NULL-plaintext werd gekopieerd.
--
-- PLAINTEXT
-- Na deze migratie raakt deze trigger `bank_accounts.iban` en
-- `assets.account_number` NIET meer aan — niet lezend, niet schrijvend. De
-- kolommen blijven bestaan (de DROP is een aparte, door de eigenaar afgeroepen
-- stap na de live bankkoppeling-tests), maar de trigger vult ze niet langer.
--
-- GEEN NIEUWE `CREATE TRIGGER`
-- `trg_bank_account_auto_cash_asset` verwijst naar de functie via haar OID, niet
-- naar haar body. `CREATE OR REPLACE FUNCTION` werkt de bestaande pg_proc-rij
-- bij; de OID blijft gelijk en de trigger pikt de nieuwe body direct op. De
-- trigger opnieuw definiëren zou alleen risico toevoegen (een DROP/CREATE-venster
-- waarin inserts ongetriggerd door kunnen glippen) zonder iets op te lossen.
--
-- GRANTS BLIJVEN STAAN
-- `20260611130000_harden_app_settings_roadmap_rpc.sql` (regel 95) trekt de
-- execute-grant in: `revoke execute on function
-- public.fn_auto_link_bank_account_asset() from public, anon, authenticated`.
-- `CREATE OR REPLACE FUNCTION` behoudt die ACL — privileges hangen aan de
-- pg_proc-rij en die wordt bijgewerkt, niet vervangen. Alleen bij DROP + CREATE
-- zou de ACL terugvallen op de default (execute voor PUBLIC). De revoke wordt
-- hieronder tóch idempotent herhaald: niet uit twijfel over die semantiek, maar
-- omdat deze specifieke functie ooit buiten migraties om via het Supabase-
-- dashboard is aangemaakt (zie de kop van
-- `20260407000001_create_auto_link_bank_account_asset_trigger.sql`). Een
-- herhaalde revoke maakt de eindtoestand onafhankelijk van zulke drift.

CREATE OR REPLACE FUNCTION public.fn_auto_link_bank_account_asset()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  new_asset_id UUID;
BEGIN
  -- Only act if no linked asset yet
  IF NEW.linked_asset_id IS NOT NULL THEN
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
  'Kopieert uitsluitend de versleutelde IBAN (iban_encrypted) en de blind index (iban_hash) '
  'naar assets.account_number_encrypted/-_hash. Raakt de plaintext-kolommen bank_accounts.iban '
  'en assets.account_number bewust niet aan (Stage B van de field-level encryptie).';

-- Idempotente herhaling van de hardening uit 20260611130000 — zie de kop.
REVOKE EXECUTE ON FUNCTION public.fn_auto_link_bank_account_asset() FROM public, anon, authenticated;
