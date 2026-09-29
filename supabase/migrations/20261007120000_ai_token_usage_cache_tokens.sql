-- Prompt-caching meetbaar maken in ai_token_usage.
--
-- Vanaf 29 sep 2026 cachet de nieuwsduiding zijn systeemprompt
-- (lib/krant/duiding.ts). De AI SDK telt gecachete input mee in
-- `inputTokens.total`, maar Anthropic rekent cache-reads tegen 0,1× en
-- cache-writes (5 min) tegen 1,25× het inputtarief. Zonder deze twee kolommen
-- overschat /beheer de kosten en is de besparing niet te zien
-- (zie de toelichting in lib/ai/token-prices.ts).
--
-- Betekenis: `input_tokens` blijft het TOTAAL (ongewijzigd, zodat bestaande
-- rapportages kloppen); de twee nieuwe kolommen zijn het deel daarvan dat uit
-- de cache kwam of erin geschreven werd.
--
-- `not null default 0`: vóór vandaag gebruikte de app nergens caching, dus 0
-- is voor elke bestaande rij de juiste waarde — geen backfill nodig. Een
-- constante default herschrijft de tabel niet (PG ≥ 11).
--
-- Geen RLS-wijziging: de bestaande own-select-policy dekt de nieuwe kolommen;
-- schrijven blijft uitsluitend via de service-role.

alter table public.ai_token_usage
  add column if not exists cache_read_tokens integer not null default 0,
  add column if not exists cache_write_tokens integer not null default 0;
