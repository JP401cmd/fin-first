-- Database-slotwerk: rechten & policies aanscherpen
--
-- Waarom: het RLS-fundament is solide (geen tabel zonder RLS), maar een handvol
-- grants en policies is te ruim. Deze migratie dicht 7 live-geverifieerde punten
-- (remote DB, 13 jul 2026 — alle 7 stonden nog OPEN, bevestigd via pg_proc/
-- pg_policies/proacl + get_advisors(security)). Least-privilege zonder de app te
-- breken: `authenticated` behoudt overal zijn eigen expliciete EXECUTE-grant.
--
-- LET OP (herstel-risico): een latere `CREATE OR REPLACE FUNCTION` van de hieronder
-- ingetrokken functies herstelt stilzwijgend de default `GRANT EXECUTE TO PUBLIC`.
-- Plaats de REVOKE's dan opnieuw ná de (her)definitie, of documenteer expliciet.
--
-- Punt 7b (leaked-password-protection) is GEEN SQL → Auth-config:
--   Dashboard → Authentication → Password → "Leaked password protection" AAN.
-- Deze migratie raakt dat punt bewust niet.

-- =====================================================================
-- 1. Budget-model-RPC's: EXECUTE intrekken van PUBLIC
-- ---------------------------------------------------------------------
-- Live: proacl = {=X (PUBLIC), authenticated=X, service_role=X}. anon erft
-- EXECUTE uitsluitend via PUBLIC (geen expliciete anon-grant). De eerdere
-- `…_revoke_anon`-migratie was een no-op (REVOKE FROM anon terwijl de grant via
-- PUBLIC loopt). REVOKE FROM PUBLIC verwijdert anon-toegang; authenticated houdt
-- zijn eigen grant. Interne auth.uid()-check in de functies blijft de mitigatie.
REVOKE EXECUTE ON FUNCTION public.propose_budget_model(text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_budget_model_proposal(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.propose_budget_model(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_budget_model_proposal(uuid, text) TO authenticated;

-- =====================================================================
-- 2. calculator_likes: SELECT owner-scopen (was USING(true) voor PUBLIC)
-- ---------------------------------------------------------------------
-- Live: policy "Likes are publicly readable" SELECT USING(true) roles={public}
-- → elke user leest (user_id, calculator_id) van iedereen. Beide app-leespaden
-- filteren al op .eq('user_id', user.id); de publieke telling komt uit
-- custom_calculators.like_count. Owner-scope is dus veilig.
DROP POLICY IF EXISTS "Likes are publicly readable" ON public.calculator_likes;
DROP POLICY IF EXISTS "calculator_likes own select" ON public.calculator_likes;
CREATE POLICY "calculator_likes own select" ON public.calculator_likes
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

-- =====================================================================
-- 3. error_logs INSERT: WITH CHECK(true) → eigen user_id afdwingen
-- ---------------------------------------------------------------------
-- Live: policy "error_logs auth insert" WITH CHECK(true) roles={authenticated}.
-- Enige schrijfpad (app/api/log-error/route.ts) zet altijd user_id = user.id →
-- aanscherpen is veilig en sluit user_id-spoofing uit.
ALTER POLICY "error_logs auth insert" ON public.error_logs
  WITH CHECK ((select auth.uid()) = user_id);

-- =====================================================================
-- 4. mail_log INSERT: authenticated-policy droppen (Optie A — least-privilege)
-- ---------------------------------------------------------------------
-- Keuze gebruiker = Optie A. mail_log is een systeem-log zonder user_id-kolom;
-- WITH CHECK(auth.uid()=user_id) is hier niet toepasbaar. In plaats van een
-- zwakke status-CHECK schrijven we mail_log voortaan via de service-role-client
-- (lib/email.ts#recordMail → getServiceClient()) en droppen de authenticated
-- INSERT-policy volledig. Daarna kan geen ingelogde gebruiker nog mail_log-rijen
-- spoofen (valse to_email/subject). Superadmin-SELECT-policy blijft ongemoeid.
DROP POLICY IF EXISTS "mail_log auth insert" ON public.mail_log;

-- =====================================================================
-- 5. prijs-tabellen UPDATE: spiegelende WITH CHECK toevoegen
-- ---------------------------------------------------------------------
-- Live: *_update_own UPDATE-policies hebben USING(holding_id IN eigen holdings)
-- maar with_check = null → bij UPDATE kan holding_id naar een niet-eigen holding
-- worden gezet ("row verplaatsen"). Spiegel de USING-conditie in WITH CHECK.
ALTER POLICY "investment_holding_prices_update_own" ON public.investment_holding_prices
  WITH CHECK (
    holding_id IN (
      SELECT id FROM public.investment_holdings WHERE user_id = (select auth.uid())
    )
  );
ALTER POLICY "crypto_holding_prices_update_own" ON public.crypto_holding_prices
  WITH CHECK (
    holding_id IN (
      SELECT id FROM public.crypto_holdings WHERE user_id = (select auth.uid())
    )
  );

-- =====================================================================
-- 6. Definer-helpers: EXECUTE intrekken van anon + PUBLIC
-- ---------------------------------------------------------------------
-- Live: proacl = {=X (PUBLIC), anon=X (expliciet!), authenticated=X, service_role=X}.
-- Anders dan punt 1 heeft anon hier een EXPLICIETE grant → beide (anon + PUBLIC)
-- intrekken. Geen anon/public-geroleerde RLS-policy verwijst naar deze helpers
-- (geverifieerd); authenticated houdt zijn eigen grant (nodig — ze draaien in
-- authenticated RLS-policies).
REVOKE EXECUTE ON FUNCTION public.is_superadmin() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_household_id() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_owned_household_id() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_household_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_owned_household_id() TO authenticated;

-- =====================================================================
-- 7a. Triggerfuncties: search_path fixeren (advisor WARN function_search_path_mutable)
-- ---------------------------------------------------------------------
-- Live: proconfig = null (mutable) op 3 SECURITY INVOKER triggerfuncties.
-- sync_calculator_like_count refereert custom_calculators ongekwalificeerd →
-- search_path='' zou breken; = public gekozen (consistent met bestaande
-- definer-config). Geen gedragswijziging.
ALTER FUNCTION public.sync_calculator_like_count() SET search_path = public;
ALTER FUNCTION public.update_questionnaires_updated_at() SET search_path = public;
ALTER FUNCTION public.update_roadmap_features_updated_at() SET search_path = public;

-- 7b. Leaked-password-protection: handmatige Auth-config-stap (zie header). Geen SQL.
