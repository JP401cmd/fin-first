-- Performance-sanering fase 2 — index-hygiëne: laatste FK-index + 8 redundante plain-indexen
--
-- WAAROM: Na fase 1 (20260719085405_perf_fk_indexes.sql, ADR 0048/0049) meldt de Supabase
-- performance-advisor nog exact 1× unindexed_foreign_keys en 0× duplicate_index. Deze migratie
-- sluit die laatste FK-warning en ruimt 8 plain-indexen op die functioneel gedubbeld worden door
-- een UNIQUE-constraint-index op dezelfde leidende kolommen. De advisor flagt die 8 NIET als
-- duplicate_index (ze zijn niet byte-identiek: verschil in partial-WHERE, DESC-sortering of
-- uniqueness), maar ze dienen hetzelfde toegangspad en kosten enkel extra schrijf/onderhoudslast.
--
-- BEWUST NIET IN SCOPE: de 43 unused_index-warnings. Die zijn misleidend op deze low-traffic /
-- pre-launch DB — pg_stat_user_indexes weerspiegelt alleen het minieme verkeer tot nu toe. 38 ervan
-- dekken een foreign key (droppen heropent direct de FK-warnings die fase 1 sloot én schaadt
-- join/on-delete-perf zodra er verkeer komt); 3 zijn doelgerichte partial/route-indexen op nog niet
-- belopen paden. De enige écht dode indexen zitten op _legacy_*-tabellen → beter opgelost door die
-- dode tabellen zélf te droppen (aparte opschoon-kaart), niet door losse indexen te verwijderen.
--
-- CONCURRENTLY-afweging: bewust GÉÉN `create/drop index concurrently`. Dat kan niet binnen een
-- transactieblok, en Supabase draait migraties in een transactie. Alle betrokken tabellen zijn
-- klein/pre-launch, dus de kortstondige lock van een gewone CREATE/DROP is verwaarloosbaar. Idempotent
-- via `if not exists` / `if exists`. Alleen indexen — geen data-mutaties, geen policy-/FK-wijzigingen.
-- GUARDRAIL: nog niet op remote toegepast; live-apply + get_advisors-hermeting hoort bij test/release.

-- ── Slice A — laatste ontbrekende foreign-key-index ───────────────────────────
-- web_vitals kwam ná fase 1 (observability/RUM, 20260720100000). De FK web_vitals_user_id_fkey
-- (ON DELETE SET NULL) had nog geen dekkende index → seq scan bij user-verwijdering/joins.
create index if not exists web_vitals_user_id_idx on public.web_vitals (user_id);

-- ── Slice B — 8 redundante plain-indexen droppen (UNIQUE-index blijft altijd staan) ──
-- Per paar dropt de plain/partiële kopie; de constraint-gedragen UNIQUE dekt hetzelfde pad
-- (equality-lookups + backward scan voor DESC-varianten).
drop index if exists public.lead_intakes_token_idx;                        -- UNIQUE lead_intakes_token_key blijft (exacte dupe)
drop index if exists public.idx_bank_accounts_linked_asset;                -- partial; UNIQUE bank_accounts_linked_asset_id_key blijft
drop index if exists public.wallet_addresses_linked_asset_idx;             -- partial; UNIQUE wallet_addresses_linked_asset_uidx blijft
drop index if exists public.idx_news_editions_user;                        -- (user_id, edition_nr DESC); UNIQUE news_editions_user_id_edition_nr_key blijft
drop index if exists public.idx_valuations_entity;                         -- (entity_id, valuation_date DESC); UNIQUE valuations_entity_id_valuation_date_key blijft
drop index if exists public.idx_crypto_holding_prices_holding_date;        -- (holding_id, date DESC); UNIQUE crypto_holding_prices_holding_id_date_key blijft
drop index if exists public.idx_investment_holding_prices_holding_date;    -- (holding_id, date DESC); UNIQUE investment_holding_prices_holding_id_date_key blijft
drop index if exists public.idx_holding_prices_holding_date;               -- _legacy_holding_prices; UNIQUE holding_prices_holding_id_date_key blijft
