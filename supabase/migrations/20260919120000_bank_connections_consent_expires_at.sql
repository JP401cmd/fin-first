-- ---------------------------------------------------------------------
-- bank_connections.consent_expires_at — de vervaldatum van de BANKAUTORISATIE,
-- apart van het toegangstoken (ADR 0161).
--
-- Aanleiding: `token_expires_at` is de levensduur van het TrueLayer-
-- TOEGANGSTOKEN (`expires_in`, 3600 s — live: in élke rij exact 1,00 u na
-- `updated_at`). De gezondheidsafleiding (`deriveBankLinkHealth`) las die kolom
-- als de 90/180-dagen-autorisatie: direct na elke sync "Verloopt over 1d", na
-- ~25 u "Verbinding kwijt" met een herstelknop naar de bank. Dezelfde
-- Rabobank-koppeling is daardoor in 7 weken 18× opnieuw geautoriseerd.
--
-- De echte consent-einddatum levert TrueLayer zelf: `GET /data/v1/me` →
-- `consent_expires_at`. De callback schrijft 'm bij autorisatie; de sync-route
-- vult 'm aan voor rijen waar hij nog ontbreekt (zelfherstel, geen backfill —
-- de waarde is niet uit bestaande kolommen af te leiden en hoort uit de bron te
-- komen, niet uit een aanname).
--
-- Additief en nullable: bestaande rijen blijven geldig, `NULL` = "einddatum
-- onbekend" en dat leest de afleiding als "geen oordeel op datum" (de
-- statuskolom en de eerstvolgende mislukte token-refresh vangen een echte
-- expiratie alsnog). Geen RLS-wijziging: de tabel is eigen-rij en blijft dat;
-- de kolom wordt nergens client-direct gelezen.
--
-- Terugweg: de kolom laten staan en niet meer lezen is voldoende; een drop
-- hoort — als ooit — in een aparte, latere migratie.
-- ---------------------------------------------------------------------

alter table public.bank_connections
  add column if not exists consent_expires_at timestamptz;

comment on column public.bank_connections.token_expires_at is
  'Vervaldatum van het TrueLayer-TOEGANGSTOKEN (~1 uur; `expires_in`). Alleen voor de token-refresh in sync/balances — NIET de looptijd van de bankautorisatie, daarvoor is consent_expires_at.';

comment on column public.bank_connections.consent_expires_at is
  'Vervaldatum van de bankautorisatie (consent) zoals TrueLayer die meldt via GET /data/v1/me (consent_expires_at). NULL = onbekend. Bron voor deriveBankLinkHealth ("verloopt binnenkort" / "verbinding kwijt"). ADR 0161.';
