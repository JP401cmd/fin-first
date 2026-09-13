-- Plan-review Toekomst (TPR-01, ADR 0142): per-gebruiker, cross-device markering
-- welke van de vijf review-stappen de gebruiker expliciet heeft bevestigd.
--
-- WAAROM EEN EIGEN KOLOM: de review laat de gebruiker keuzes herbevestigen waarmee
-- de Toekomst-grafiek rekent (plan, uitgaven na stoppen, AOW/pensioen, woning,
-- potten). Of zo'n keuze "bewust" is, is uit de keuzevelden zelf niet af te lezen:
-- een `pot_rules.surplus_group` op de DB-default is niet te onderscheiden van een
-- bewuste keuze (TPR-05). De markering zegt "gezien en bevestigd"; de profielstaat
-- bepaalt of die bevestiging nog geldt (lib/plan-review/progress.ts).
--
-- VORM: jsonb-map  stap -> { bevestigd_op: ISO-tijdstip, bron: 'review' }
--   stappen: plan | uitgaven | inkomsten | woning | potten
--   Afwezige sleutel = niet bevestigd. Onbekende sleutels worden bij het lezen
--   genegeerd (parsePlanReviewState).
--
-- TOEGANGSMODEL (geen nieuwe policy nodig — zelfde redenering als
-- 20260617110000_add_profiles_status_banner_minimized.sql):
--   profiles heeft al eigen-rij toegang: GRANT UPDATE op tabelniveau voor
--   'authenticated' + RLS-policy USING (auth.uid() = id). RLS is row-level, dus deze
--   kolom valt automatisch onder de bestaande eigen-rij SELECT/UPDATE.
--   PUT /api/plan-review doet read-modify-write op de eigen rij via de anon
--   RLS-client (nooit service-role). Bewust NIET in `feature_preferences`: dat is
--   een gedeelde JSONB waar gelijktijdige schrijvers elkaars sleutels kunnen
--   overschrijven (lost update); een eigen kolom houdt de schrijfset klein.
--
-- PUUR ADDITIEF: raakt verder niets aan; veilig her-uitvoerbaar via IF NOT EXISTS.
-- Geen backfill: een bestaand account start met {} (niets bevestigd) en ziet de
-- review als optionele ingang op de Voorkeuren-kaart van /toekomst.

alter table public.profiles
  add column if not exists plan_review_state jsonb not null default '{}'::jsonb;

comment on column public.profiles.plan_review_state is
  'Plan-review Toekomst (ADR 0142): map van review-stap (''plan''|''uitgaven''|''inkomsten''|''woning''|''potten'') -> { bevestigd_op: ISO-tijdstip, bron: ''review'' }. Afwezige sleutel = niet bevestigd. Geschreven door PUT /api/plan-review (own-row read-modify-write, anon RLS-client); gelezen door /toekomst (lib/plan-review/read-state.ts). De voortgang is AFGELEID: een markering geldt alleen zolang de profielstaat haar niet inhaalt (lib/plan-review/progress.ts).';
