-- De SELECT-policy op `public.app_settings` wordt voor gewone gebruikers een
-- ALLOWLIST: standaard dicht, expliciet open wat een ingelogde gebruiker mag
-- lezen. Eigenaarsbesluit 19-09-2026, vastgelegd als ADR 0163.
--
-- ── Het gebrek ────────────────────────────────────────────────────────────────
-- Tak 2 van de policy ("globale, niet-geheime instellingen") was een DENYLIST:
-- alles zonder uuid in de sleutel, behalve zeven met name genoemde secrets en
-- `notion\_%`. Fail-open: een nieuw geheim is standaard leesbaar voor élke
-- ingelogde gebruiker tot iemand de array aanvult — en dat lek ontstaat niet bij
-- het schrijven van code maar op het moment dat een beheerder de koppeling
-- inricht, lang na elke review. De repo is publiek, dus de denylist zelf was
-- ook leesbaar. Live gemeten (17-09-2026, alleen sleutelnamen): een willekeurige
-- niet-superadmin zag 23 globale sleutels, waaronder de productie-prompt-
-- override, de briefing-directives, `local_knowledge` en `ollama_base_url`.
--
-- ── Wat deze migratie doet ────────────────────────────────────────────────────
-- Tak 2 wordt `key = any (array[...])` met precies de sleutels die
-- gebruikersoppervlakken via de SESSIE-client lezen (inventaris 17-09-2026,
-- herbevestigd 19-09-2026 tegen élke `.from('app_settings')` in app/ en lib/).
-- De uuid-regex en de `notion\_%`-regel in tak 2 vervallen: wat niet genoemd
-- is, is dicht. Takken 1, 3 en 4 zijn LETTERLIJK overgenomen uit het live
-- predicaat (`pg_policies.qual`, gemeten 19-09-2026) — ongewijzigd.
--
-- De TS-spiegel staat in `lib/app-settings/publieke-sleutels.ts`;
-- `publieke-sleutels.test.ts` vergelijkt die constante met de array in de
-- nieuwste `app_settings select`-migratie én eist voor elke sleutel een lezer
-- buiten app/api/admin. Een nieuwe publieke sleutel = een nieuwe migratie
-- (append-only, drop + create) + de constante bijwerken. Dat is de gewenste
-- frictie: de grens staat in een review-bare diff, niet in data.
--
-- Beheer-content die tot nu toe via de sessie-client werd gelezen
-- (`ai_system_prompt_override`, `extraction_system_prompt`,
-- `aangifte_extraction_prompt`, `briefing_directives`,
-- `briefing_functional_directives`, `waardestromen`) staat BEWUST NIET op de
-- lijst: die lezers gaan in dezelfde wijziging naar de service-role
-- (`lib/app-settings/beheer-instelling.ts`). Uitrolvolgorde daardoor: eerst
-- de code-deploy, dan deze migratie — omgekeerd vallen die lezers stil terug
-- op hun in-code default (geen lek, wél gedragswijziging).
--
-- Hardening: `anon` verliest zijn (default) tabelrechten. RLS gaf anon al 0
-- rijen (geen policy voor die rol); de revoke maakt dat onafhankelijk van welke
-- policy iemand later nog `to public` toevoegt. Gevolg voor de leak-check:
-- `set local role anon` levert op deze tabel voortaan `permission denied`
-- (42501) in plaats van 0 rijen — dat is hier de bedoelde uitkomst, geen
-- rolset-regressie. Geen enkel niet-ingelogd pad leest `app_settings`
-- (gecontroleerd 19-09-2026: alle lezers zitten achter `auth.getUser()` of op
-- de service-role).
--
-- ── Wat deze migratie bewust NIET doet ────────────────────────────────────────
-- - Geen aparte publieke tabel (fase 2 van hetzelfde besluit; komt in een eigen
--   migratie zodra deze allowlist zich bewezen heeft).
-- - INSERT/UPDATE/DELETE-policies ongewijzigd (schrijfrechten, ADR 0146).
-- - Dode sleutels (feature_phase_matrix, unified_feature_matrix,
--   nudge_overrides, ai_system_prompt_override_backup_pre_fin_rename) worden
--   onleesbaar voor gebruikers maar niet verwijderd — opruimen is een aparte
--   datamigratie.
-- - TrueLayer-credentials blijven plaintext in de rij (vervolgkaart:
--   versleuteling of env-vars).
--
-- ── Terugweg ──────────────────────────────────────────────────────────────────
-- Een correctiemigratie die tak 2 opnieuw als denylist aanmaakt (de tekst van
-- 20260915120000) — nooit deze migratie zelf aanpassen. De revoke hieronder
-- haalt bij anon ZEVEN privileges weg (live gemeten: select, insert, update,
-- delete, truncate, references, trigger — Supabase's blanket-grant); een
-- terugweg hoeft daarvan niets te herstellen (anon heeft geen enkele policy,
-- RLS staat aan) en herstelt bewust hooguit `grant select … to anon` — de
-- overige zes zijn dood onder RLS en komen niet terug.
-- Symptoom van een onvolledige allowlist is ZICHTBAAR, niet stil:
-- `lib/truelayer/feature-flag.ts` leest `truelayer_enabled` en de zes
-- bank-connect-routes antwoorden dan 503 "Bank Connect is niet ingeschakeld";
-- de overige lezers vallen op hun default terug (coach/platform-banner leeg,
-- widget-presets weg, `truelayer_environment` → sandbox-URL's).

drop policy if exists "app_settings select" on public.app_settings;

create policy "app_settings select" on public.app_settings
  for select to authenticated
  using (
    -- 1. Eigen per-user key (de key draagt de uuid van de gebruiker). Ongewijzigd.
    (position(((select auth.uid())::text) in key) > 0)
    -- 2. ALLOWLIST: de globale instellingen die gebruikersoppervlakken via de
    --    sessie-client lezen. Spiegel: lib/app-settings/publieke-sleutels.ts.
    or (key = any (array[
      'ai_credit_config'::text,
      'coach_config'::text,
      'guide_help_content'::text,
      'module_guide_disabled_modules'::text,
      'news_max_refreshes_per_week'::text,
      'platform_status'::text,
      'truelayer_enabled'::text,
      'truelayer_environment'::text,
      'welcome_guide_config'::text,
      'widget_presets'::text
    ]))
    -- 3. Check-ins van het eigen huishouden. Ongewijzigd.
    or (
      ((select public.user_household_id()) is not null)
      and (key ~~ (('checkin_household_'::text || ((select public.user_household_id()))::text) || '\_%'::text))
    )
    -- 4. Superadmin leest globale sleutels (ook de secrets), nooit een sleutel
    --    met een uuid erin (ADR 0146). Ongewijzigd.
    or (
      (key !~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'::text)
      and (exists (
        select 1 from public.profiles
        where profiles.id = (select auth.uid()) and profiles.role = 'superadmin'::text
      ))
    )
  );

-- Hardening: anon heeft op deze tabel niets te zoeken. RLS gaf al 0 rijen;
-- zonder tabelrechten kan ook een toekomstige `to public`-policy dat niet
-- meer openen.
revoke all on table public.app_settings from anon;
