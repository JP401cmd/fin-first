-- ============================================================
-- Vrijheidscheck-funnel — anonieme pre-account intake + rapport-snapshot
--
-- Achtergrond (ADR 0022): de publieke Vrijheidscheck laat een nóg-niet-
-- geregistreerde bezoeker een korte intake doen, berekent server-side een
-- rapport en draagt via een token door naar /signup?check=<token>. De bezoeker
-- bestaat op dat moment NIET in auth.users — er is dus géén user_id-eigenaar en
-- géén auth.uid() om RLS op te scopen.
--
-- TOEGANGSMODEL — bewust service-role-only (ADR 0022):
--   * RLS staat AAN op beide tabellen, maar er is OPZETTELIJK GEEN ENKELE policy
--     voor anon/authenticated. Met RLS aan en nul policies geldt default-deny:
--     interactieve rollen (anon, authenticated) kunnen niets lezen/schrijven.
--   * Alle toegang loopt uitsluitend server-side via getServiceClient()
--     (lib/supabase/service.ts). De service-role omzeilt RLS, dus de API-laag is
--     de enige plek waar deze tabellen worden gelezen/geschreven. Daar zit de
--     validatie, rate-limiting (intake_rate_limit) en de consent-registratie.
--   * Er worden hier GEEN grants aan anon/authenticated/service_role toegevoegd;
--     service_role heeft al table-rechten via de standaard Supabase-rolopzet en
--     omzeilt RLS sowieso. Geen extra grant = geen grant-leak.
--
-- PRIVACY (AVG):
--   * E-mail staat plain (we moeten de bezoeker later kunnen mailen), maar de
--     tabel is uitsluitend service-role-bereikbaar.
--   * email_blind_index = HMAC-SHA256 blind index over de genormaliseerde e-mail
--     (zelfde mechanisme als de bestaande *_hash-velden, zie
--     lib/crypto/field-encryption.ts) — voor dedupe zonder op plain e-mail te
--     hoeven matchen/indexeren.
--   * De ruwe intake-blob staat ALLEEN versleuteld (intake_encrypted, AES-256-GCM
--     via de app-laag encryptField, formaat v1:<base64>). Er is BEWUST geen
--     plain intake-kolom.
--   * report_snapshot is afgeleide data (getallen/labels) + de VOORNAAM van de
--     bezoeker (voor de rapport-masthead). Géén hoog-gevoelige identifiers
--     (achternaam/IBAN/BSN); de voornaam is laag-gevoelig en staat acceptabel
--     plain omdat de rij service-role-only is, enkel via het onraadbare token
--     opvraagbaar, en na 90 dagen wordt gepurged. Daarom mag dit als plain jsonb.
--   * IP's worden nooit plain opgeslagen: intake_rate_limit bewaart enkel een
--     ip_hash.
-- ============================================================

-- ── lead_intakes: anonieme intake + server-berekend rapport ──────────────────
CREATE TABLE IF NOT EXISTS public.lead_intakes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token              UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  email              TEXT NOT NULL,
  email_blind_index  TEXT NOT NULL,
  intake_encrypted   TEXT NOT NULL,
  report_snapshot    JSONB,
  consent_at         TIMESTAMPTZ NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at         TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '90 days'),
  converted_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  converted_at       TIMESTAMPTZ
);

COMMENT ON TABLE public.lead_intakes IS
  'Anonieme pre-account Vrijheidscheck-intake (ADR 0022). Uitsluitend service-role-bereikbaar; RLS aan, géén policies.';
COMMENT ON COLUMN public.lead_intakes.token IS
  'Onraadbaar token dat doordraagt naar /signup?check=<token> en bij rapport-render. UNIQUE; default gen_random_uuid().';
COMMENT ON COLUMN public.lead_intakes.email IS
  'Plain e-mail — nodig om de bezoeker later te mailen. Alleen service-role-bereikbaar.';
COMMENT ON COLUMN public.lead_intakes.email_blind_index IS
  'HMAC-SHA256 blind index van de genormaliseerde e-mail — voor dedupe zonder plain-match. Zie lib/crypto/field-encryption.ts.';
COMMENT ON COLUMN public.lead_intakes.intake_encrypted IS
  'AES-256-GCM ciphertext van de volledige intake-blob (formaat v1:<base64>) via app-laag encryptField. Bewust geen plain intake-kolom.';
COMMENT ON COLUMN public.lead_intakes.report_snapshot IS
  'Server-berekende CheckReportData (afgeleide getallen/labels + voornaam voor de masthead). Plain jsonb: géén hoog-gevoelige identifiers (achternaam/IBAN/BSN); de laag-gevoelige voornaam staat plain omdat de rij service-role-only is, token-gated en 90d-TTL.';
COMMENT ON COLUMN public.lead_intakes.consent_at IS
  'Tijdstip waarop de bezoeker toestemming gaf (AVG-grondslag voor verwerking + later mailen).';
COMMENT ON COLUMN public.lead_intakes.expires_at IS
  'Vervaldatum (default created_at + 90 dagen). Niet-geconverteerde verlopen rijen worden gepurged.';
COMMENT ON COLUMN public.lead_intakes.converted_user_id IS
  'auth.users-id ná conversie naar een echt account; NULL tot conversie. ON DELETE SET NULL: account weg → lead bewaart historie maar verliest de koppeling.';

-- Lookup bij rapport-render via het token.
CREATE INDEX IF NOT EXISTS lead_intakes_token_idx
  ON public.lead_intakes (token);

-- Dedupe op blind index.
CREATE INDEX IF NOT EXISTS lead_intakes_email_blind_index_idx
  ON public.lead_intakes (email_blind_index);

-- Purge-helper: snel verlopen, niet-geconverteerde rijen vinden.
CREATE INDEX IF NOT EXISTS lead_intakes_expires_unconverted_idx
  ON public.lead_intakes (expires_at)
  WHERE converted_user_id IS NULL;

-- RLS AAN, GEEN policies: default-deny voor anon/authenticated. Alle toegang
-- uitsluitend via getServiceClient() (service-role omzeilt RLS). Bewust (ADR 0022).
ALTER TABLE public.lead_intakes ENABLE ROW LEVEL SECURITY;

-- ── intake_rate_limit: IP-rate-limit-vensters voor de publieke funnel (W7) ────
CREATE TABLE IF NOT EXISTS public.intake_rate_limit (
  ip_hash       TEXT NOT NULL,
  window_start  TIMESTAMPTZ NOT NULL,
  count         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, window_start)
);

COMMENT ON TABLE public.intake_rate_limit IS
  'IP-rate-limit-tellers voor de publieke Vrijheidscheck (ADR 0022). Uitsluitend service-role-bereikbaar; RLS aan, géén policies.';
COMMENT ON COLUMN public.intake_rate_limit.ip_hash IS
  'Gehasht IP (geen plain IP, AVG). Sleutel samen met window_start.';
COMMENT ON COLUMN public.intake_rate_limit.window_start IS
  'Begin van het rate-limit-venster. Oude vensters worden gepurged.';

-- RLS AAN, GEEN policies: service-role-only, identiek aan lead_intakes (ADR 0022).
ALTER TABLE public.intake_rate_limit ENABLE ROW LEVEL SECURITY;

-- ── purge_expired_lead_intakes(): opruimen van verlopen leads + oude vensters ─
-- SECURITY DEFINER zodat de functie ongeacht aanroeper de rijen kan verwijderen,
-- met lege search_path (hardening, voorkomt search_path-hijack). EXECUTE wordt
-- ingetrokken van anon én authenticated: de purge hoort alleen via een
-- service-role beheer-route of een scheduler te draaien.
CREATE OR REPLACE FUNCTION public.purge_expired_lead_intakes()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.lead_intakes
   WHERE converted_user_id IS NULL
     AND expires_at < now();

  -- Rate-limit-vensters ouder dan 24u zijn niet meer relevant.
  DELETE FROM public.intake_rate_limit
   WHERE window_start < now() - INTERVAL '24 hours';
$$;

COMMENT ON FUNCTION public.purge_expired_lead_intakes() IS
  'Verwijdert niet-geconverteerde, verlopen lead_intakes en oude intake_rate_limit-vensters. SECURITY DEFINER, alleen via service-role/scheduler.';

-- Niet aanroepbaar door interactieve rollen. REVOKE van PUBLIC is essentieel:
-- CREATE FUNCTION verleent EXECUTE standaard aan PUBLIC, en anon/authenticated
-- erven dat — alleen FROM anon/authenticated revoken laat de PUBLIC-grant (en dus
-- de PostgREST /rpc-route voor anon) open. Daarom eerst FROM PUBLIC.
REVOKE EXECUTE ON FUNCTION public.purge_expired_lead_intakes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_expired_lead_intakes() FROM anon;
REVOKE EXECUTE ON FUNCTION public.purge_expired_lead_intakes() FROM authenticated;

-- Schedulen (kies één, NIET hard hier gezet omdat pg_cron-beschikbaarheid niet
-- gegarandeerd is):
--
--   1) pg_cron (indien beschikbaar) — dagelijks om 03:30 UTC:
--        select cron.schedule(
--          'purge-expired-lead-intakes',
--          '30 3 * * *',
--          $$ select public.purge_expired_lead_intakes(); $$
--        );
--
--   2) Service-role beheer-/cron-route (bv. /api/cron/purge-leads) die met
--      getServiceClient() `rpc('purge_expired_lead_intakes')` aanroept, getriggerd
--      door de bestaande job-runner (vgl. job_runs).
