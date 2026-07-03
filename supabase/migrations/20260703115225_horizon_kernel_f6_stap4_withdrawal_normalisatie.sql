-- FASE 6 stap 4 (horizon-kernel, ADR 0032) — withdrawal-contract na de default-flip.
--
-- vpw/bucket zijn als onttrekkingsstrategie vervallen (gap-besluit V4: geen
-- kernel-equivalent; de kernel kent profielen Vast/Afnemend/Oplopend/Guardrails via
-- withdrawal_profile_config). De instellingen-UI schrijft sinds FASE 4 alleen nog
-- 'static' of 'guardrails'. Deze migratie:
--   1. normaliseert eventuele legacy-rijen (op moment van schrijven: 0 — puur vangnet,
--      idempotent) zodat de app-side enum-vernauwing in stap 5 geen verweesde waarden
--      kan tegenkomen;
--   2. documenteert het kolom-contract (restpunt "COMMENT-update profiel-shape").
-- Bewust GEEN DB-CHECK op de enum — die is app-side (lib/withdrawal-strategy.ts).

UPDATE public.profiles
SET withdrawal_strategy = 'static'
WHERE withdrawal_strategy IN ('vpw', 'bucket');

COMMENT ON COLUMN public.profiles.withdrawal_strategy IS
'Onttrekkingsstrategie-enum (app-side, lib/withdrawal-strategy.ts): ''static'' | ''guardrails''. Sinds FASE 6 stap 4 (horizon-kernel-cutover, ADR 0032) zijn ''vpw'' en ''bucket'' vervallen en genormaliseerd naar ''static''; de kernel leest het onttrekkingsprofiel uit withdrawal_profile_config (profiel Vast/Afnemend/Oplopend/Guardrails) en gebruikt deze enum alleen nog als terugval-afleiding (static→Vast, guardrails→Guardrails). Verdwijnt mogelijk in een latere opschoning zodra de v2-noodklep (FASE 6 stap 5) is ontmanteld.';

COMMENT ON COLUMN public.profiles.withdrawal_profile_config IS
'V4 (horizon-kernel) — onttrekkingsprofiel: 3-fasen-curve + profielkeuze. NULL = adapter gebruikt de Excel-defaults (P!B71-75). Shape (alle velden optioneel; ontbrekend veld valt per veld terug op de Excel-default): { "profiel": ''vast''|''afnemend''|''oplopend''|''guardrails'' (voorrang boven de withdrawal_strategy-enum-afleiding), "gogo_tot_leeftijd": number (P!B71, default 75), "gogo_pct": number pct (P!B72, default 100), "slowgo_tot_leeftijd": number (P!B73, default 85), "slowgo_pct": number pct (P!B74, default 85), "nogo_pct": number pct (P!B75, default 70) }. Geparset door lib/withdrawal-strategy.ts#parseWithdrawalProfileConfig; geconsumeerd door lib/horizon-kernel/adapter/params.ts. Sinds de default-flip (FASE 6 stap 3) is dit de primaire onttrekkingsbron; de withdrawal_strategy-enum is terugval-afleiding voor de v2-noodklep tot stap 5.';
