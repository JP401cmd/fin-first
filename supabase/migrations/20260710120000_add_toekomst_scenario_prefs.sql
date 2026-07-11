-- Wat-als-scenario-voorkeuren voor /toekomst — server-side, cross-device bewaard.
--
-- WAAROM: de scenariolaag (2e, gestippelde lijn op /toekomst) laat de gebruiker
--   sliders, per-categorie rendement-delta's, een stopleeftijd-marker en een paar
--   vlaggen zetten ZONDER de basislijn te muteren. Die keuzes moeten op elk apparaat
--   gelden en bij herbezoek terugkomen — dus server-side op de eigen profiles-rij,
--   niet in localStorage. De vorm is een kleine, versioned JSONB-blob
--   (`ToekomstScenarioPrefs`, `v: 1`) die uitsluitend door de defensieve parser
--   `parseToekomstScenarioPrefs` wordt geschreven (server-side, PUT /api/toekomst-scenario).
--
-- BEWUST NIET in `feature_preferences`: die kolom voedt de FIRE-kernel en heeft
--   concurrente schrijvers (meerdere features mergen erin). Een eigen, exclusieve
--   kolom maakt een VOLLEDIGE overwrite veilig (geen read-modify-write nodig) en
--   voorkomt dat een scenario-schrijver per ongeluk kernel-invoer overschrijft.
--
-- TOEGANGSMODEL (geen nieuwe policy nodig):
--   `profiles` heeft al eigen-rij toegang: RLS-policy
--   "Users can manage own profile" ON profiles FOR ALL USING (auth.uid() = id).
--   FOR ALL dekt SELECT/INSERT/UPDATE/DELETE; zonder aparte WITH CHECK hergebruikt
--   Postgres de USING-expressie ook als schrijf-check, dus een own-row UPDATE van
--   deze nieuwe kolom is volledig afgedekt. RLS is row-level (niet kolom-level) en
--   er is geen kolom-scoped GRANT, dus de nieuwe kolom erft deze policy automatisch.
--   Schrijfpad: PUT /api/toekomst-scenario doet een own-row VOLLEDIGE overwrite via
--   de anon RLS-client (`.update({...}).eq('id', user.id)`, nooit service-role); de
--   parser is de enige schrijf-poort. Lezen gebeurt server-side in de horizon-loader
--   (opnieuw defensief geparsed — DB-inhoud nooit vertrouwen).
--
-- NULLABLE, GEEN DEFAULT: afwezig = geen scenario gezet (consument valt op defaults
--   terug). Puur additief; raakt verder niets aan; veilig her-uitvoerbaar via IF NOT EXISTS.

alter table public.profiles
  add column if not exists toekomst_scenario_prefs jsonb;

comment on column public.profiles.toekomst_scenario_prefs is
  'Wat-als-scenariovoorkeuren voor /toekomst (versioned JSONB, shape ToekomstScenarioPrefs v:1): sliders, per-categorie rendement-delta, stopleeftijd-marker en weergavevlaggen. Nullable = geen scenario gezet. Cross-device (eigen profiles-rij). Enige schrijf-poort: parseToekomstScenarioPrefs via PUT /api/toekomst-scenario (own-row, anon RLS-client, volledige overwrite — geen read-modify-write want kolom is exclusief van deze feature). Bewust NIET in feature_preferences (dat voedt de FIRE-kernel en heeft concurrente schrijvers).';
