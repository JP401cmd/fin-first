-- Hardening: budgetmodel-RPC's niet door anon aanroepbaar (functies weigeren
-- zelf al via auth.uid()-check, maar de grant hoeft er simpelweg niet te zijn).
-- Toegepast op remote via mcp apply_migration (household_budget_rpc_revoke_anon).
REVOKE EXECUTE ON FUNCTION public.propose_budget_model(text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_budget_model_proposal(uuid, text) FROM anon;
