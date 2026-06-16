-- ============================================================
-- Broker-koppelingen — aandelen-broker read-only API-credentials (start: Trading 212)
--
-- Spiegelt `exchange_connections` (crypto, 20260501000001) exact qua opzet:
-- per-gebruiker versleutelde API-credentials, strikt 1-op-1 gekoppeld aan één
-- `assets`-rij (de beleggingsrekening), met blind-index voor duplicaat-detectie.
-- Het verschil met crypto: een broker levert beleggingen (`investment_holdings`)
-- i.p.v. crypto-coins, en Trading 212 gebruikt enkel een API-key (geen secret).
--
-- Encryptie: API-key/secret staan in `*_encrypted`-kolommen met hetzelfde
-- AES-256-GCM wire-formaat als exchange_connections/bank_connections
-- (zie lib/crypto/field-encryption.ts, formaat `v1:<base64>`). `api_key_hash`
-- is een HMAC-SHA256 blind index over de genormaliseerde plaintext-key — om
-- dubbele koppelingen per gebruiker te detecteren zonder de key in klare tekst
-- op te slaan. `api_key_last4` is voor veilige UI-weergave ("•••• 1234").
--
-- Toegangsmodel: volledig user-scoped via RLS (auth.uid() = user_id). Geen
-- huishouden-deling — credentials zijn strikt persoonlijk. Geen service-role
-- write-pad nodig: de sync-route draait namens de ingelogde gebruiker.
-- ============================================================

-- ── broker_connections: versleutelde API-credentials per broker ─────────
CREATE TABLE IF NOT EXISTS public.broker_connections (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  broker               TEXT NOT NULL CHECK (broker IN ('trading212')),
  api_key_encrypted    TEXT NOT NULL,
  api_secret_encrypted TEXT,
  api_key_hash         TEXT NOT NULL,
  api_key_last4        TEXT,
  label                TEXT,
  last_synced_at       TIMESTAMPTZ,
  last_sync_error      TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  linked_asset_id      UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE
);

COMMENT ON COLUMN public.broker_connections.broker IS
  'Broker-identifier. Bewust beperkt tot ''trading212'' nu; uitbreidbaar via een nieuwe migratie die de CHECK verruimt.';
COMMENT ON COLUMN public.broker_connections.api_key_encrypted IS
  'AES-256-GCM ciphertext van de API-key (formaat v1:<base64>). Zie lib/crypto/field-encryption.ts.';
COMMENT ON COLUMN public.broker_connections.api_secret_encrypted IS
  'AES-256-GCM ciphertext van een API-secret (formaat v1:<base64>). NULLABLE: Trading 212 gebruikt alleen een API-key; kolom aanwezig voor symmetrie met exchange_connections en toekomstige brokers met key+secret.';
COMMENT ON COLUMN public.broker_connections.api_key_hash IS
  'HMAC-SHA256 blind index van de genormaliseerde api_key — voorkomt dubbele koppelingen per gebruiker.';
COMMENT ON COLUMN public.broker_connections.api_key_last4 IS
  'Laatste 4 plaintext-tekens van api_key voor gemaskeerde UI-weergave ("•••• 1234"). Veilig naar de client.';
COMMENT ON COLUMN public.broker_connections.linked_asset_id IS
  'Verplichte 1-op-1 koppeling met de beleggingsrekening-asset. ON DELETE CASCADE: verwijder de asset → verwijder de koppeling.';

-- Geen dubbele key per (user, broker): blind-index uniciteit, identiek aan exchange_connections.
CREATE UNIQUE INDEX IF NOT EXISTS broker_connections_user_broker_keyhash_uidx
  ON public.broker_connections (user_id, broker, api_key_hash);

CREATE INDEX IF NOT EXISTS broker_connections_user_idx
  ON public.broker_connections (user_id);

-- Strikt 1-op-1: één koppeling per asset (net als exchange_connections_linked_asset_uidx).
CREATE UNIQUE INDEX IF NOT EXISTS broker_connections_linked_asset_uidx
  ON public.broker_connections (linked_asset_id);

ALTER TABLE public.broker_connections ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'broker_connections' AND policyname = 'broker_connections_select_own'
  ) THEN
    CREATE POLICY "broker_connections_select_own" ON public.broker_connections
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'broker_connections' AND policyname = 'broker_connections_insert_own'
  ) THEN
    CREATE POLICY "broker_connections_insert_own" ON public.broker_connections
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'broker_connections' AND policyname = 'broker_connections_update_own'
  ) THEN
    CREATE POLICY "broker_connections_update_own" ON public.broker_connections
      FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'broker_connections' AND policyname = 'broker_connections_delete_own'
  ) THEN
    CREATE POLICY "broker_connections_delete_own" ON public.broker_connections
      FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── external_data_sources: audit-log hergebruiken voor broker-syncs ─────
-- De polymorfe audit-log (20260501000001) kende source_type IN
-- ('exchange', 'wallet', 'market_data'). Breid uit met 'broker' zodat
-- broker-sync-runs in dezelfde log landen. Veilig: drop de bestaande CHECK
-- en her-creëer 'm met de volledige verzameling. De DROP CONSTRAINT IF EXISTS
-- maakt de stap idempotent; de constraintnaam is de Postgres-default
-- (<tabel>_<kolom>_check).
ALTER TABLE public.external_data_sources
  DROP CONSTRAINT IF EXISTS external_data_sources_source_type_check;

ALTER TABLE public.external_data_sources
  ADD CONSTRAINT external_data_sources_source_type_check
    CHECK (source_type IN ('exchange', 'wallet', 'market_data', 'broker'));

-- ── investment_holdings: bron-koppeling per holding (badge) ─────────────
-- Nullable FK zodat een fully-manual of CSV-geïmporteerde holding geen bron
-- heeft. ON DELETE SET NULL: koppeling weghalen laat de holding bestaan
-- (identiek aan crypto_holdings.source_exchange_connection_id).
ALTER TABLE public.investment_holdings
  ADD COLUMN IF NOT EXISTS source_broker_connection_id UUID
    REFERENCES public.broker_connections(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.investment_holdings.source_broker_connection_id IS
  'Broker-koppeling die deze holding heeft gesynct (NULL voor handmatige/CSV-holdings). Voor een "Trading 212"-badge per holding.';

CREATE INDEX IF NOT EXISTS investment_holdings_broker_src_idx
  ON public.investment_holdings(source_broker_connection_id)
  WHERE source_broker_connection_id IS NOT NULL;
