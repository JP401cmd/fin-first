-- Per-gebruiker, cross-device kleur van de mobiele TopBar (ADR 0174, D3).
--
-- WAAROM: de TopBar draagt sinds F1 de paginanaam op een leisteenblauwe balk
-- (`#3f4a5e`). De gebruiker kiest die kleur op /mijn/uiterlijk, en de keuze
-- moet op elk apparaat gelden. Dus server-side, niet localStorage. Eén scalar
-- (geen jsonb): het is één waarde, geen map per sleutel.
--
-- CHROME, GEEN IDENTITEIT OF STATUS: de balk krijgt geen `--color-*-50..950`-
-- palet en telt niet als vijfde accent. De layout rekent de waarde om met
-- `topbarColorVars()` (lib/color-palette.ts) naar de vier `--topbar-*`-tokens.
--
-- NULL = DE STANDAARDKLEUR. Een reset schrijft NULL, niet '#3f4a5e'. Zo volgt
-- wie niets koos een latere wijziging van de standaard vanzelf.
--
-- DE CHECK IS LOWERCASE (`^#[0-9a-f]{6}$`). PUT /api/appearance lowercaset vóór
-- de upsert. De check staat er omdat de waarde server-side rechtstreeks een
-- `style`-attribuut in gaat. `topbarColorVars` valideert daar óók zelf (en valt
-- terug op de standaard), maar de database laat vuil er niet eens in.
--
-- TOEGANGSMODEL (geen nieuwe policy nodig). GEMETEN TEGEN DE LIVE DATABASE OP
-- 22-09-2026, niet overgenomen uit een migratiebestand:
--   * pg_class.relrowsecurity op public.profiles = true (RLS staat aan).
--   * pg_policy levert precies één policy op de tabel:
--       "Users can manage own profile": FOR ALL,
--       USING ((SELECT auth.uid()) = id), WITH CHECK = NULL.
--     Bij een ALL-policy zonder eigen WITH CHECK geldt de USING-expressie óók
--     als schrijfcheck. Zowel de rij die je raakt als de rij die je achterlaat
--     moet dus je eigen rij zijn. Voor anon is auth.uid() NULL, en `NULL = id`
--     is nooit waar.
--   * Trigger trg_guard_profiles_role (BEFORE INSERT OR UPDATE) bewaakt de
--     `role`-kolom. Deze migratie raakt die niet.
--   RLS is row-level, niet kolom-level. De nieuwe kolom valt daarmee
--   automatisch en volledig onder de bestaande eigen-rij ALL-policy.
--
-- DEKKINGSCHECK ADDITIEVE KOLOM (verplicht bij ALTER TABLE ... ADD COLUMN):
--   Dekkende policy voor lezen én schrijven: "Users can manage own profile".
--   Enig bedoeld schrijfpad: PUT /api/appearance. Dat is een own-row upsert via
--   de anon RLS-client (id = auth-gebruiker), NOOIT service-role, met zod-
--   validatie op het veld. Leespad: de (app)-layout server-side (getOwnProfile,
--   own-row), als SSR-seed voor de `--topbar-*`-vars en de ModuleColorProvider.
--   Deze migratie opent geen nieuw schrijfgat en introduceert geen kolom die
--   niemand mag schrijven: het bereik is exact de eigen profielrij.
--
-- BEWUST GÉÉN BACKFILL: NULL is precies het huidige beeld (de standaardbalk uit
-- F1). Een backfill zou niets behouden, alleen een vaste waarde bevriezen die
-- een latere wijziging van de standaard niet meer volgt.
--
-- TERUGWEG: puur additief en nullable. Gaat er iets mis, dan leest de app de
-- kolom niet meer (de layout valt terug op DEFAULT_TOPBAR_COLOR). Een drop
-- column hoort, als het ooit nodig is, in een aparte latere migratie.
--
-- Veilig her-uitvoerbaar via IF NOT EXISTS.

alter table public.profiles
  add column if not exists topbar_color text
  check (topbar_color ~ '^#[0-9a-f]{6}$');

comment on column public.profiles.topbar_color is
  'Kleur van de mobiele TopBar (ADR 0174 D3), als lowercase #rrggbb. NULL = de standaardkleur (DEFAULT_TOPBAR_COLOR, leisteen #3f4a5e); een reset schrijft NULL. Chrome, geen module-identiteit of status. Gelezen door de (app)-layout (server-seed van de --topbar-*-vars via topbarColorVars, geen flash) en geschreven door PUT /api/appearance (own-row, anon RLS-client, zod, nooit service-role).';
