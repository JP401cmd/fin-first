-- Per-gebruiker, cross-device voorkeur: welke status-duiding-banner heeft de
-- gebruiker geminimaliseerd, en op welk LeverageStatus-niveau.
--
-- WAAROM: de status-duiding-banner op overzicht-pagina's (bv. /overzicht/schulden)
-- kan door de gebruiker geminimaliseerd worden. Die keuze moet op alle apparaten
-- gelden en mag niet opnieuw opduiken op hetzelfde niveau. We slaan dit per route
-- op, gekoppeld aan het niveau waarop de gebruiker minimaliseerde.
--
-- TOEGANGSMODEL (geen nieuwe policy nodig):
--   profiles heeft al een row-level eigen-rij toegang: GRANT UPDATE op
--   tabelniveau voor 'authenticated' + RLS-policy USING (auth.uid() = id).
--   RLS is row-level (niet kolom-level) en er bestaat geen kolom-scoped GRANT,
--   dus deze nieuwe kolom valt automatisch onder de bestaande eigen-rij UPDATE.
--   De PUT /api/overzicht/page-status doet read-modify-write op de eigen rij via
--   de anon RLS-client (nooit service-role).
--
-- PUUR ADDITIEF: raakt verder niets aan; veilig her-uitvoerbaar via IF NOT EXISTS.

alter table public.profiles
  add column if not exists status_banner_minimized jsonb not null default '{}'::jsonb;

comment on column public.profiles.status_banner_minimized is
  'Map van route (bv. ''/overzicht/schulden'') -> het LeverageStatus-niveau (''warn''|''bad'') waarop de gebruiker de status-duiding-banner van die pagina minimaliseerde. Afwezigheid van een sleutel = niet geminimaliseerd. Gebruikt door /api/overzicht/page-status (GET leest, PUT zet/wist). Per-gebruiker en cross-device omdat het op de eigen profiles-rij staat.';
