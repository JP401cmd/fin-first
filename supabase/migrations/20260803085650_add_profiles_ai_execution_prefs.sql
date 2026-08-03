-- Per-groep keuze "waar draait de AI?" — override op de privé-modus-hoofdschakelaar.
--
-- WAAROM: `privacy_mode` (20260716120000) is één boolean voor ALLES. Zolang er maar
--   twee functies lokaal konden draaien (categorisatie, chat) was dat genoeg. Nu de
--   lokale stack over de volle breedte wordt uitgerold, wil een gebruiker kunnen
--   differentiëren: transacties en gesprek lokaal (gevoelige gegevens), maar bv. de
--   nieuwseditie via de cloud omdat die daar merkbaar beter is. Eén vlag kan dat niet
--   uitdrukken.
--
-- VORM: jsonb-map van uitvoergroep → 'lokaal' | 'cloud'. Bewust GEEN losse kolom per
--   groep: de groepsindeling is productbeleid dat kan schuiven (lib/ai/execution-groups.ts
--   is de single source of truth), en dat hoort geen migratie per wijziging te kosten.
--   Bewust ook geen aparte tabel: het is een eigen-rij voorkeur van hooguit zeven
--   sleutels, precies het profiel van de bestaande jsonb-prefs op profiles.
--
--   De zeven sleutels (zie lib/ai/execution-groups.ts):
--     gesprek · transacties · briefing · tips · rapporten · documenten · nieuws
--
-- DEFAULT '{}': leeg = geen enkele override, dus elke groep volgt de hoofdschakelaar
--   `privacy_mode`. Dat is gedrag-behoudend voor élke bestaande rij — wie vandaag
--   privé-modus aan heeft, houdt lokaal; wie 'm uit heeft, houdt cloud. Geen backfill.
--
--   De resolutie staat in code (resolveExecutionMode), niet in SQL:
--     mode(groep) = prefs[groep] ?? (privacy_mode ? 'lokaal' : 'cloud')
--   Een onbekende of ongeldige waarde in de map wordt door die functie genegeerd en
--   valt terug op de hoofdschakelaar — bij privacy_mode=true betekent onleesbare
--   rommel dus 'lokaal', de veilige kant op. De CHECK hieronder houdt de vorm grof
--   in het gareel (een object), de fijne validatie is zod op de API-route.
--
-- TOEGANGSMODEL (geen nieuwe RLS-policy nodig): identiek aan privacy_mode. profiles
--   heeft al `FOR ALL USING (auth.uid() = id)` (20260215000000_create_base_tables.sql);
--   RLS is row-level en er is geen kolom-scoped GRANT, dus deze kolom valt automatisch
--   onder dezelfde eigen-rij policy. Schrijfpad is een own-row read-modify-write via de
--   anon RLS-client (`.eq('id', user.id)`), NOOIT service-role — spiegelt
--   app/api/privacy-mode en app/api/appearance.
--
-- PUUR ADDITIEF: raakt privacy_mode niet aan (die blijft de hoofdschakelaar) en is
--   veilig her-uitvoerbaar via IF NOT EXISTS.

alter table public.profiles
  add column if not exists ai_execution_prefs jsonb not null default '{}'::jsonb;

-- Grove vormbewaking: het moet een object zijn (geen array/scalar/null), zodat een
-- read-modify-write nooit op een onverwacht type stuit. Inhoudelijke validatie van
-- sleutels en waarden gebeurt met zod op /api/ai-execution-prefs.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_ai_execution_prefs_is_object'
  ) then
    alter table public.profiles
      add constraint profiles_ai_execution_prefs_is_object
      check (jsonb_typeof(ai_execution_prefs) = 'object');
  end if;
end $$;

comment on column public.profiles.ai_execution_prefs is
  'Per-groep override op privacy_mode: jsonb-map van uitvoergroep (gesprek, transacties, briefing, tips, rapporten, documenten, nieuws — zie lib/ai/execution-groups.ts) naar ''lokaal'' of ''cloud''. Leeg (default) = elke groep volgt de hoofdschakelaar privacy_mode. Resolutie in code: prefs[groep] ?? (privacy_mode ? lokaal : cloud); ongeldige waarden worden genegeerd en vallen terug op de hoofdschakelaar. Eigen-rij voorkeur: gelezen/geschreven via own-row anon RLS-client (nooit service-role), gedekt door de bestaande profiles-policy USING (auth.uid() = id).';
