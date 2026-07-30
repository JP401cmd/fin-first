-- Fase 1 (B8/B9) — het werkelijke aantal provider-verzoeken per sync.
--
-- Sinds de eerste ophaal in blokken werkt (maximale historie op een lege
-- rekening) is "één synchronisatie" niet meer "één HTTP-verzoek". De
-- eigenaarskeuze is dat zo'n eerste ophaal tegen onze eigen rem van 10/dag als
-- ÉÉN synchronisatie telt — het is één gebruikershandeling, en de rem die er
-- werkelijk toe doet is de bank-eigen verzoeklimiet
-- (429 + provider_request_limit_exceeded).
--
-- Die keuze mag alleen als het echte aantal verzoeken observeerbaar blijft:
-- zonder deze kolom is achteraf niet vast te stellen na hoeveel verzoeken een
-- bank ons afknijpt, en wordt dat een gok in plaats van een meting.
--
-- Additief en nullable: bestaande rijen (en de bestaande insert-paden voor
-- `rate_limited` en `error`) houden NULL = "niet vastgelegd". Geen default,
-- want 0 zou een meting suggereren die er niet was.
alter table public.bank_sync_log
  add column if not exists provider_requests integer;

comment on column public.bank_sync_log.provider_requests is
  'Aantal HTTP-verzoeken aan de bank/provider tijdens deze sync (blok-lus van de eerste ophaal). NULL = niet vastgelegd. Staat los van bank_connection_accounts.daily_requests, de app-rem van 10 synchronisaties per dag.';
