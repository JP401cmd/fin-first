-- Per-gebruiker, cross-device weergavevoorkeur: "Eenvoudig" vs "Volledig".
--
-- WAAROM: één profiel-brede modus die de "diepte"-laag van de UI aanstuurt.
--   'simple' = tweede-laag-content (DepthSection's) standaard ingeklapt; rustig,
--              beginnervriendelijk.
--   'full'   = alle diepte-secties standaard open; expert-modus.
-- De voorkeur is server-side zodat ze op alle apparaten geldt (geen localStorage).
-- Eén scalar (geen jsonb) — het is één globale waarde, geen per-route-map.
--
-- TOEGANGSMODEL (geen nieuwe policy nodig):
--   profiles heeft al een row-level eigen-rij toegang: GRANT UPDATE op
--   tabelniveau voor 'authenticated' + RLS-policy USING (auth.uid() = id).
--   RLS is row-level (niet kolom-level) en er bestaat geen kolom-scoped GRANT,
--   dus deze nieuwe kolom valt automatisch onder de bestaande eigen-rij UPDATE.
--   De PUT /api/display-mode doet een own-row update via de anon RLS-client
--   (`.eq('id', user.id)`, nooit service-role).
--
-- PRODUCTBESLISSING — bestaande gebruikers (geflagd voor veto vóór toepassen):
--   De DB-default is 'simple', zodat NIEUWE accounts in Eenvoudig starten.
--   Een kale NOT NULL DEFAULT 'simple' zou echter ook ALLE BESTAANDE gebruikers
--   in Eenvoudig zetten — die zouden plots een ingeklapte UI ervaren. Daarom
--   backfillen we bestaande rijen expliciet naar 'full': wie de app al gebruikt
--   houdt de volledige ervaring; alleen nieuwe accounts beginnen Eenvoudig.
--
-- PUUR ADDITIEF: raakt verder niets aan; veilig her-uitvoerbaar via IF NOT EXISTS.

alter table public.profiles
  add column if not exists display_mode text not null default 'simple'
  check (display_mode in ('simple', 'full'));

-- Backfill bestaande gebruikers naar 'full' zodat zij geen plotse ingeklapte UI
-- krijgen. Nieuwe rijen blijven 'simple' via de kolom-default hierboven.
-- Idempotent: na de eerste run zijn er geen rijen meer die deze update raakt op
-- een verse kolom (her-uitvoeren zet bewust geen latere keuze terug — bij
-- her-uitvoer is de migratie al toegepast, dus dit blok draait niet opnieuw).
update public.profiles set display_mode = 'full' where display_mode = 'simple';

comment on column public.profiles.display_mode is
  'Profiel-brede weergavemodus: ''simple'' (diepte-secties standaard ingeklapt, beginnervriendelijk) of ''full'' (alles open, expert). Cross-device omdat het op de eigen profiles-rij staat. Gelezen door de layout-render (server-seed, geen flash) en geschreven door PUT /api/display-mode (own-row, anon RLS-client). Default ''simple'' voor nieuwe accounts; bestaande accounts zijn bij introductie naar ''full'' gebackfilled.';
