-- Fase-1 tegenpartij-functies: expliciete anon-EXECUTE intrekken
--
-- ── WAT DIT HERSTELT ────────────────────────────────────────────────────────
-- Drie functies uit fase 1 (20260808110000_create_spend_limits) dragen live een
-- EXPLICIETE `anon=X/postgres` in hun proacl, terwijl hun eigen migratie-comment
-- stelt dat alleen `authenticated` EXECUTE heeft. Deze migratie trekt die grant
-- alsnog in en maakt de drie gelijk aan de latere fase-2-functie
-- (20260808160000 / 20260808170000), die het wél expliciet doet.
--
--   public.tx_counterparty_month_aggregate(date, date, text[], boolean)
--   public.tx_counterparty_suggestions(date, date, integer, boolean)
--   public.spend_limit_counterparty_key(text)
--
-- Signaturen GEMETEN tegen pg_proc (oid::regprocedure) op 08-08-2026 — niet
-- overgenomen uit het migratiebestand.
--
-- ── OORZAAK: ALTER DEFAULT PRIVILEGES, NIET EEN VERGETEN REVOKE ─────────────
-- GEMETEN op 08-08-2026 tegen pg_default_acl: in schema public staat voor
-- objecttype 'f' (functions) een default-ACL `{postgres=X/postgres,
-- anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}`. Elke
-- NIEUW aangemaakte functie in public krijgt daardoor automatisch een
-- EXPLICIETE grant aan de rol `anon`.
--
-- Het patroon `REVOKE ALL ON FUNCTION ... FROM public` — dat de fase-1-migratie
-- netjes toepaste — haalt uitsluitend de PUBLIC-pseudorol weg. Het raakt die
-- expliciete anon-grant NIET. Vandaar dat REVOKE PUBLIC + GRANT authenticated
-- eruitziet als een dichte functie terwijl anon EXECUTE gewoon blijft staan.
-- Conclusie: in dit schema is `REVOKE ... FROM anon` altijd apart nodig.
--
-- ── IS DIT EEN LEK? NEE — HET IS EEN ONWARE CLAIM ───────────────────────────
-- Alle drie zijn SECURITY INVOKER (prosecdef = false, gemeten in pg_proc op
-- 08-08-2026), dus de RLS van de aanroeper geldt onverkort:
--   * tx_counterparty_month_aggregate en tx_counterparty_suggestions lezen
--     public.transactions, waarvan de SELECT-policy `TO authenticated` is; een
--     anon-sessie ziet daar nul rijen.
--   * spend_limit_counterparty_key is een pure IMMUTABLE tekstnormalisatie
--     zonder tabeltoegang — die lekt niets, maar hoort in hetzelfde
--     least-privilege-regime.
-- Er stroomt vandaag dus geen data weg. Wat wél fout is: de codebase claimt een
-- afscherming die de database niet heeft. Die claim is precies wat een volgende
-- lezer vertrouwt als hij de functie uitbreidt — bijvoorbeeld met een tabel
-- zonder `TO authenticated`-policy, of met een SECURITY DEFINER-variant. Dan is
-- de latente grant ineens wél een lek. Daarom nu dichtgezet, niet later.
--
-- ── TOEGANGSMODEL NA DEZE MIGRATIE ──────────────────────────────────────────
-- anon:          GEEN EXECUTE op alle drie.
-- authenticated: EXECUTE; datatoegang blijft volledig door RLS bepaald.
-- service_role:  ongemoeid (behoudt EXECUTE via de default-ACL).
-- Geen enkele signatuur, body of returntype verandert — dit is puur een
-- privilege-correctie, dus geen impact op aanroepers of de ERD.

-- Idempotent: REVOKE op een reeds ingetrokken privilege is een no-op.
REVOKE ALL ON FUNCTION public.tx_counterparty_month_aggregate(date, date, text[], boolean) FROM anon;
REVOKE ALL ON FUNCTION public.tx_counterparty_suggestions(date, date, integer, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.spend_limit_counterparty_key(text) FROM anon;

-- De PUBLIC-pseudorol stond al ingetrokken in 20260808110000; hier herhaald
-- zodat deze migratie op een verse database dezelfde eindstaat oplevert.
REVOKE ALL ON FUNCTION public.tx_counterparty_month_aggregate(date, date, text[], boolean) FROM public;
REVOKE ALL ON FUNCTION public.tx_counterparty_suggestions(date, date, integer, boolean) FROM public;
REVOKE ALL ON FUNCTION public.spend_limit_counterparty_key(text) FROM public;

-- Expliciet herbevestigd: het intrekken hierboven mag authenticated niet raken.
GRANT EXECUTE ON FUNCTION public.tx_counterparty_month_aggregate(date, date, text[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tx_counterparty_suggestions(date, date, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.spend_limit_counterparty_key(text) TO authenticated;
