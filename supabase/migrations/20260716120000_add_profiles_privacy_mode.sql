-- Per-gebruiker privé-modus voor lokale transactie-categorisatie (fase 1, FR-1.1).
--
-- WAAROM: één profiel-brede boolean die aangeeft dat deze gebruiker transactie-
--   categorisatie uitsluitend LOKAAL (op het eigen toestel, WebGPU/Gemma) wil laten
--   draaien i.p.v. via de cloud-AI. De vlag stuurt twee dingen aan:
--     - server-side: de nieuwe privacy-guard geeft 403 op /api/ai/categorize (laag 3,
--       beslissend) vóór er transactiedata een externe AI-provider bereikt;
--     - client-side: de resolver-keuze in runCombinedCategorization kiest het lokale
--       pad (scope A — zie docs/requirements-lokale-categorisatie.md §3).
--   Scope: dit is scope A ("transacties lokaal categoriseren"), NIET de brede
--   privé-modus-paraplu (optie B) — de vlag blokkeert vandaag alleen het
--   categorisatie-pad; overige AI-functies blijven ongewijzigd.
--
-- DEFAULT false: privé-modus staat standaard UIT. Dat is de veilige, gedrag-
--   behoudende default voor zowel nieuwe als BESTAANDE accounts — iedereen houdt
--   het huidige cloud-categorisatiepad tot men de toggle bewust aanzet. Daarom is
--   er (anders dan bij display_mode) GEEN backfill nodig: false is voor alle
--   bestaande rijen het gewenste startpunt.
--
-- Eén scalar boolean (geen jsonb) — het is één globale aan/uit-keuze, geen
--   per-route-map.
--
-- TOEGANGSMODEL (geen nieuwe RLS-policy nodig):
--   profiles heeft al een row-level eigen-rij policy:
--     CREATE POLICY "Users can manage own profile" ON profiles
--       FOR ALL USING (auth.uid() = id);
--   (zie 20260215000000_create_base_tables.sql). RLS is row-level, niet
--   kolom-level, en er bestaat geen kolom-scoped GRANT op profiles. Deze nieuwe
--   kolom valt dus automatisch onder dezelfde FOR ALL eigen-rij policy als
--   ai_enabled/display_mode: een gebruiker leest/schrijft uitsluitend de eigen
--   privacy_mode; gebruiker B kan A's waarde via de anon-client niet lezen of
--   schrijven. Het bedoelde schrijfpad is een own-row read-modify-write via de
--   anon RLS-client (`.eq('id', user.id)`), NOOIT service-role — spiegelt
--   app/api/display-mode/route.ts en app/api/appearance. Geen aparte policy nodig.
--
-- PUUR ADDITIEF: raakt verder niets aan; veilig her-uitvoerbaar via IF NOT EXISTS.

alter table public.profiles
  add column if not exists privacy_mode boolean not null default false;

comment on column public.profiles.privacy_mode is
  'Privé-modus voor transactie-categorisatie (scope A). true = deze gebruiker categoriseert transacties uitsluitend lokaal op het eigen toestel; de server-side privacy-guard blokkeert dan /api/ai/categorize (403, laag 3) en de client kiest het lokale resolver-pad, zodat transactiedata geen externe AI-provider bereikt. false (default) = ongewijzigd cloud-categorisatiepad. Eigen-rij scalar: gelezen/geschreven via own-row anon RLS-client (nooit service-role), gedekt door de bestaande profiles-policy USING (auth.uid() = id). Raakt in scope A alleen categorisatie; overige AI-functies blijven cloud.';
