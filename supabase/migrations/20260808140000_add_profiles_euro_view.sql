-- Per-gebruiker, cross-device euro-weergave: "toekomstige euro's" vs "huidige euro's".
--
-- WAAROM: één profiel-brede weergavekeuze die bepaalt of GEPROJECTEERDE bedragen
-- nominaal getoond worden (zoals de horizon-kernel ze rekent) of gedeflateerd
-- naar de koopkracht van vandaag.
--   'nominal' = toekomstige euro's — exact het huidige beeld, byte-identiek.
--   'real'    = huidige euro's — gedeeld door de kernel-deflator per rij.
-- De voorkeur staat server-side zodat ze op alle apparaten geldt (geen
-- localStorage). Eén scalar (geen jsonb) — het is één globale waarde, geen
-- per-route-map. Contract: `lib/euro-display.ts#EuroView`.
--
-- PUUR PRESENTATIE, GEEN ENGINE-KNOP: de horizon-kernel, de solver en de
-- parity-fixtures blijven onaangeraakt. "Inflatie op 0 zetten" is nadrukkelijk
-- een ándere vraag (die werkt door in indexering, Box 3-drempels en het
-- doelbedrag) en is NIET wat deze kolom doet.
--
-- TOEGANGSMODEL (geen nieuwe policy nodig) — GEMETEN TEGEN DE LIVE DATABASE OP
-- 08-08-2026, niet overgenomen uit een migratiebestand:
--   * pg_class.relrowsecurity op public.profiles = true (RLS staat aan).
--   * pg_policies levert precies één policy op de tabel:
--       "Users can manage own profile" — FOR ALL TO public,
--       USING ((SELECT auth.uid()) = id), WITH CHECK = NULL.
--     Bij een ALL-policy zonder eigen WITH CHECK hanteert Postgres de
--     USING-expressie óók als schrijfcheck, dus zowel de rij die je raakt als de
--     rij die je achterlaat moet je eigen rij zijn. `TO public` is hier geen
--     verbreding: voor anon is auth.uid() NULL en `NULL = id` is nooit waar.
--   * information_schema.role_table_grants: UPDATE op tabelniveau voor
--     authenticated (en anon). Er is GEEN kolom-scoped GRANT — de rijen in
--     information_schema.column_privileges zijn de expansie van diezelfde
--     tabel-grant over alle kolommen.
--   RLS is row-level, niet kolom-level. Deze nieuwe kolom valt daarmee
--   automatisch en volledig onder de bestaande eigen-rij ALL-policy.
--
-- DEKKINGSCHECK ADDITIEVE KOLOM (verplicht bij ALTER TABLE ... ADD COLUMN):
--   Dekkende policy voor lezen én schrijven: "Users can manage own profile".
--   Bedoeld en enig schrijfpad: PUT /api/euro-view — own-row update via de anon
--   RLS-client (`.eq('id', user.id)`), NOOIT service-role; spiegelt
--   app/api/appearance en app/api/display-mode. Leespad: de layout-render
--   server-side (server-seed naar EuroViewProvider, geen flash).
--   Deze migratie opent dus géén nieuw schrijfgat en introduceert ook geen
--   kolom die niemand mag schrijven: het bereik is exact de eigen profielrij.
--
-- BEWUST GÉÉN BACKFILL — het verschil met 20260622120000_add_profiles_display_mode.
--   Die migratie MOEST backfillen: haar default 'simple' klapte de diepte-secties
--   in, dus een kale NOT NULL DEFAULT zou élke bestaande gebruiker een plots
--   ingeklapte UI hebben gegeven. De backfill naar 'full' hield het beeld voor
--   bestaande accounts gelijk.
--   Hier ligt het precies andersom: 'nominal' IS het huidige beeld. Elk bedrag in
--   de app wordt vandaag nominaal getoond, dus de default levert voor iedere
--   bestaande gebruiker exact wat hij gisteren zag. Een backfill zou hier geen
--   gedrag behouden maar juist een GEDRAGSWIJZIGING zijn — een deel van de
--   gebruikers zou ongevraagd in gedeflateerde bedragen kijken. Niet doen.
--
-- PUUR ADDITIEF: raakt verder niets aan; veilig her-uitvoerbaar via IF NOT EXISTS.

alter table public.profiles
  add column if not exists euro_view text not null default 'nominal'
  check (euro_view in ('nominal', 'real'));

comment on column public.profiles.euro_view is
  'Profiel-brede euro-weergave: ''nominal'' (toekomstige euro''s, zoals de horizon-kernel rekent) of ''real'' (huidige euro''s, gedeflateerd met de kernel-factor per rij). Puur presentatie — de kernel/solver rekent ongewijzigd nominaal door. Cross-device omdat het op de eigen profiles-rij staat. Gelezen door de layout-render (server-seed, geen flash) en geschreven door PUT /api/euro-view (own-row, anon RLS-client, nooit service-role). Default ''nominal'' = exact het huidige beeld; bewust NIET gebackfilled, want een backfill zou hier een gedragswijziging zijn i.p.v. gedragsbehoud.';
