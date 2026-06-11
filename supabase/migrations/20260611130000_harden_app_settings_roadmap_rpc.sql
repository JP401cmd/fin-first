-- Beveiligingsverharding na het superadmin-RLS-lek (zie ADR 0006):
--
-- 1) app_settings — de policies "Authenticated users can manage/read app_settings"
--    gaven ELKE ingelogde gebruiker lees- én schrijfrecht op de hele tabel,
--    inclusief API-secrets (anthropic/openai/mistral_api_key, truelayer_client_
--    id/secret) en per-user-sleutels van ándere gebruikers (notificatie-
--    historie, check-ins). Nieuw model:
--      • eigen sleutels (uid in key) — volledige rw
--      • huishoud-check-in-kopieën — leesbaar voor huishoudgenoten
--      • globale config — leesbaar, behalve secrets en uid-gebonden sleutels
--      • superadmin — volledige rw (insert/update/select bestonden al; delete nieuw)
--    Secrets worden voortaan server-side via de service-role gelezen
--    (lib/ai/config.ts, lib/truelayer/client.ts).
--
-- 2) roadmap_features — insert/update stond open voor elke gebruiker; nu
--    superadmin-only (lezen blijft voor ingelogde gebruikers).
--
-- 3) SECURITY DEFINER-RPC's — EXECUTE ingetrokken voor anon (hygiëne; de
--    functies guarden zelf al op auth.uid()). user_household_id/
--    user_owned_household_id/is_superadmin blijven breed executeerbaar:
--    ze worden in RLS-policy-expressies geëvalueerd met de rol van de
--    aanvrager — intrekken zou anon-queries laten erroren i.p.v. leeg.
--    Triggerfuncties (handle_new_user, fn_auto_link_bank_account_asset)
--    hoeven door niemand via RPC aanroepbaar te zijn.

-- ── 1) app_settings ─────────────────────────────────────────────────────────

drop policy if exists "Authenticated users can manage app_settings" on public.app_settings;
drop policy if exists "Authenticated users can read app_settings" on public.app_settings;

create policy "app_settings own keys" on public.app_settings
  for all to authenticated
  using (position((select auth.uid())::text in key) > 0)
  with check (position((select auth.uid())::text in key) > 0);

create policy "app_settings household checkin read" on public.app_settings
  for select to authenticated
  using (
    user_household_id() is not null
    and key like 'checkin_household_' || user_household_id()::text || '\_%'
  );

create policy "app_settings global read" on public.app_settings
  for select to authenticated
  using (
    key !~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    and key not in (
      'anthropic_api_key', 'openai_api_key', 'mistral_api_key',
      'truelayer_client_id', 'truelayer_client_secret'
    )
  );

create policy "Superadmins can delete app_settings" on public.app_settings
  for delete to authenticated
  using (is_superadmin());

-- ── 2) roadmap_features ─────────────────────────────────────────────────────

drop policy if exists "Authenticated can insert roadmap features" on public.roadmap_features;
drop policy if exists "Authenticated can update roadmap features" on public.roadmap_features;

create policy "Superadmins can insert roadmap features" on public.roadmap_features
  for insert to authenticated
  with check (is_superadmin());

create policy "Superadmins can update roadmap features" on public.roadmap_features
  for update to authenticated
  using (is_superadmin())
  with check (is_superadmin());

-- ── 3) SECURITY DEFINER-RPC's ───────────────────────────────────────────────

revoke execute on function public.household_partner_items(text) from public, anon;
revoke execute on function public.household_partner_totals() from public, anon;
revoke execute on function public.household_partner_life_events() from public, anon;
revoke execute on function public.household_member_profiles() from public, anon;
revoke execute on function public.household_leave() from public, anon;
revoke execute on function public.get_partner_privacy_level(uuid, uuid, text) from public, anon;
revoke execute on function public.save_budget_plan(jsonb) from public, anon;
revoke execute on function public.save_onboarding_data(jsonb) from public, anon;
revoke execute on function public.set_household_combined_summary(jsonb) from public, anon;
revoke execute on function public.set_household_retirement_expense(text, numeric, jsonb) from public, anon;

grant execute on function public.household_partner_items(text) to authenticated, service_role;
grant execute on function public.household_partner_totals() to authenticated, service_role;
grant execute on function public.household_partner_life_events() to authenticated, service_role;
grant execute on function public.household_member_profiles() to authenticated, service_role;
grant execute on function public.household_leave() to authenticated, service_role;
grant execute on function public.get_partner_privacy_level(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.save_budget_plan(jsonb) to authenticated, service_role;
grant execute on function public.save_onboarding_data(jsonb) to authenticated, service_role;
grant execute on function public.set_household_combined_summary(jsonb) to authenticated, service_role;
grant execute on function public.set_household_retirement_expense(text, numeric, jsonb) to authenticated, service_role;

revoke execute on function public.fn_auto_link_bank_account_asset() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
