-- STAP 4 — trek overbodige RPC-exposure in (hygiene, geen client-call-sites).
-- get_partner_privacy_level: enige aanroepers zijn interne SECURITY DEFINER-functies
-- (household_partner_totals/-items) die 'm als owner=postgres aanroepen -> blijven werken.
revoke execute on function public.get_partner_privacy_level(uuid, uuid, text) from authenticated, service_role;

-- save_onboarding_data: gedeprecieerd, nul call-sites (verwijst zelfs naar niet-bestaande kolom is_parent).
revoke execute on function public.save_onboarding_data(jsonb) from authenticated;
