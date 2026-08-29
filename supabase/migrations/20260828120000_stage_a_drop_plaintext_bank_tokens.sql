-- Field-level encryptie — Stage A afmaken: de plaintext-token-kolommen droppen.
--
-- ## Waarom deze migratie bestaat naast 20260713141000/142000
--
-- Stage A (TrueLayer-tokens versleuteld opslaan) is in juli in code afgerond,
-- maar de twee sluitmigraties zijn NOOIT op productie gedraaid. Geverifieerd op
-- 2026-08-28, op NAAM in `supabase_migrations.schema_migrations` (de CLI stempelt
-- een eigen versienummer, dus vergelijken op versie zegt niets):
--
--   * wél geregistreerd: 20260713140000_bank_connections_access_token_drop_notnull
--     (als versie 20260713212303)
--   * NIET geregistreerd: 20260713141000_null_plaintext_bank_tokens,
--     20260713142000_drop_plaintext_bank_tokens
--
-- Dubbel bewezen: `information_schema.columns` laat `bank_connections.access_token`
-- en `refresh_token` nog gewoon bestaan.
--
-- De laatst toegepaste migratie op productie is 20260827165521
-- (`create_import_idempotency`). Een migratie met een juli-tijdstempel landt dus
-- ACHTER de lineage-kop en draait bij een `db push` out-of-order. Daarom een
-- nieuw, lineage-correct bestand dat de twee juli-bestanden vervangt. Die zijn
-- leeggemaakt tot alléén commentaar: hun namen worden door code-commentaar en
-- regressiecases geciteerd (dus verwijderen zou verwijzingen breken), maar zouden
-- ze hun SQL houden, dan draait `supabase db push --include-all` ze vanwege hun
-- lágere versie vóór dit bestand — en dan wordt de gate hieronder overgeslagen
-- door een ongegate `UPDATE` uit juli. De bescherming mag niet afhangen van de
-- gekozen uitrolmethode.
--
-- ## Wat er verandert
--
-- De TrueLayer access-/refresh-tokens leven uitsluitend versleuteld in
-- `access_token_encrypted` / `refresh_token_encrypted`. Deze migratie verwijdert
-- de plaintext-voorgangers definitief, zodat een database-lek geen werkende
-- bankcredentials meer prijsgeeft.
--
-- Meting op productie (2026-08-28, read-only; tabelomvang bewust relatief, zie
-- ADR 0111): `count(access_token) = 0` en `count(refresh_token) = 0` over ALLE
-- rijen, en `access_token_encrypted` is op élke rij gevuld. Dit is
-- dus een no-op op data. Geen index, view, RLS-policy, trigger of functie verwijst
-- naar de twee kolommen — geen cascade-risico.
--
-- Geen code leest of schrijft deze kolommen nog: de OAuth-callback, de sync- en
-- de balances-route schrijven alleen de `_encrypted`-tweelingen. De vermeldingen
-- in `lib/account-export-shape.ts#EXPORT_REDACTED_COLUMNS` blijven bewust staan
-- als vangnet (zie de toelichting daar); na deze migratie zijn het stille no-ops.
--
-- ## Scope en de terugweg
--
-- Scope = ALLEEN de tokens (Stage A). De plaintext-IBAN-kolommen
-- (`bank_accounts.iban`, `bank_connection_accounts.iban`, `assets.account_number`)
-- horen bij Stage B en blijven hier ongemoeid — die drop mag pas ná de
-- V1-keyrotatie, want daarna is `ENCRYPTION_KEY_V1` het enige pad naar die data.
--
-- Terugweg: geen rollback, corrigeren vooruit. Faalt er iets, dan herstelt een
-- nieuwe migratie de twee kolommen (`ADD COLUMN ... text`); vullen is niet nodig,
-- want er stond niets in. Waaraan je ziet dat het misging: de OAuth-callback of
-- `/api/bank-connect/sync` gooit een "column does not exist"-fout — dat zou
-- betekenen dat er tóch nog een plaintext-schrijver bestond.
--
-- ## Gate
--
-- De juli-migratie liet de count-gate aan een comment over ("draai eerst deze
-- SELECT"). Hier is hij afgedwongen: staat er één rij met een plaintext-token
-- zónder versleutelde tegenhanger, dan breekt deze migratie af in plaats van die
-- token permanent te wissen.

DO $$
DECLARE
  -- Per kolom apart afhandelen: bij een half uitgevoerde herstelstap kan de ene
  -- kolom bestaan en de andere niet. Eén gezamenlijke check zou dan een statement
  -- plannen op een kolom die er niet is en klappen met "column does not exist" —
  -- precies waar deze migratie netjes hoort af te breken of door te lopen.
  v_kolom       text;
  v_bestaat     boolean;
  v_zonder_ct   integer;
  v_geraakt     integer;
  v_iets_gedaan boolean := false;
BEGIN
  FOREACH v_kolom IN ARRAY ARRAY['access_token', 'refresh_token'] LOOP
    SELECT EXISTS (
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'bank_connections'
         AND column_name = v_kolom
    ) INTO v_bestaat;

    CONTINUE WHEN NOT v_bestaat;
    v_iets_gedaan := true;

    EXECUTE format(
      'SELECT count(*) FROM public.bank_connections'
      || ' WHERE %I IS NOT NULL AND %I IS NULL',
      v_kolom, v_kolom || '_encrypted'
    ) INTO v_zonder_ct;

    IF v_zonder_ct > 0 THEN
      RAISE EXCEPTION
        'Stage A afgebroken: % rij(en) in bank_connections dragen een plaintext % zonder versleutelde tegenhanger. Draai eerst scripts/encrypt-existing-bank-credentials.mjs (die leest de plaintext-kolom en werkt dus alleen zolang deze migratie nog niet gedraaid is); droppen zou die tokens permanent wissen.',
        v_zonder_ct, v_kolom;
    END IF;

    EXECUTE format(
      'UPDATE public.bank_connections SET %I = NULL WHERE %I IS NOT NULL',
      v_kolom, v_kolom
    );
    GET DIAGNOSTICS v_geraakt = ROW_COUNT;
    RAISE NOTICE 'Stage A: % rij(en) geleegd op bank_connections.%', v_geraakt, v_kolom;
  END LOOP;

  IF NOT v_iets_gedaan THEN
    RAISE NOTICE 'Stage A was al af: bank_connections.access_token/refresh_token bestaan niet meer.';
  END IF;
END
$$;

ALTER TABLE public.bank_connections
  DROP COLUMN IF EXISTS access_token,
  DROP COLUMN IF EXISTS refresh_token;
