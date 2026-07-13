-- Opt-in voor de wekelijkse briefing-e-mail (roadmap L) — server-side, cross-device.
--
-- WAAROM een APARTE kolom (en bewust NIET de notifications_preferences-blob):
--   De push-notificatie-voorkeuren in app_settings (`notifications_preferences_<uid>`)
--   coercen élke bekende key naar default-TRUE (`prefs[key] !== false`). Dat is de
--   juiste semantiek voor push (opt-out), maar botst frontaal met een e-mail-kanaal
--   dat wettelijk opt-IN moet zijn (AVG/e-Privacy: engagement-mail vereist expliciete
--   toestemming, default UIT). Een eigen boolean-kolom met DEFAULT FALSE maakt de
--   toestemming ondubbelzinnig en auditeerbaar: afwezig/false = geen mail.
--
-- TOEGANGSMODEL (geen nieuwe policy nodig):
--   `profiles` heeft al eigen-rij toegang: RLS-policy
--   "Users can manage own profile" ON profiles FOR ALL USING (auth.uid() = id).
--   FOR ALL dekt SELECT/INSERT/UPDATE/DELETE; zonder aparte WITH CHECK hergebruikt
--   Postgres de USING-expressie ook als schrijf-check, dus een own-row UPDATE van
--   deze nieuwe kolom is volledig afgedekt. RLS is row-level (niet kolom-level) en er
--   is geen kolom-scoped GRANT, dus de nieuwe kolom erft deze policy automatisch.
--   Schrijfpad: PUT /api/briefing/email/pref doet een own-row UPDATE via de anon
--   RLS-client (`.update({...}).eq('id', user.id)`, nooit service-role), spiegel
--   /api/appearance. Uitzet-pad #2 = de login-loze unsubscribe-route, die de kolom
--   uitsluitend voor de uid in het HMAC-token op false zet via de service-role.
--
-- NOT NULL + DEFAULT FALSE: iedere bestaande rij krijgt expliciet false (geen mail
--   tot iemand actief opt-in kiest). Puur additief; raakt verder niets; her-uitvoerbaar
--   via IF NOT EXISTS.

alter table public.profiles
  add column if not exists weekly_briefing_email boolean not null default false;

comment on column public.profiles.weekly_briefing_email is
  'Opt-in voor de wekelijkse briefing-e-mail (roadmap L). DEFAULT FALSE = geen mail (AVG/e-Privacy opt-in). Bewust een eigen kolom i.p.v. de notifications_preferences-blob (die coerced naar default-true = opt-out-semantiek). Schrijfpaden: PUT /api/briefing/email/pref (own-row, anon RLS) + login-loze unsubscribe (service-role, alleen de uid in het HMAC-token). Gelezen door de cron GET /api/briefing/email/cron (service-role).';
