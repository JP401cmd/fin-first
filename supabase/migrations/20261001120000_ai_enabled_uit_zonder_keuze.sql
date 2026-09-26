-- AI staat uit voor wie nog niet koos. ADR 0155 punt 7, de aangekondigde
-- correctie "14 dagen na uitrol" van 20260917130000_ai_consent_events.sql.
--
-- ── Waarom ────────────────────────────────────────────────────────────────────
-- Bestaande accounts hielden bij de uitrol van 17 sep `ai_enabled = true` tot ze
-- de keuze-overlay beantwoordden. De overlay is UI; de server-gate
-- (lib/ai/privacy-gate.ts) leest `ai_enabled`, niet `ai_consent_at`. Wie de
-- overlay omzeilt, gebruikt AI dus zonder vastgelegde keuze. Het tijdvak is om:
-- wie nu nog niet koos, staat uit tot hij kiest.
--
-- ── De keuze blijft bereikbaar (geverifieerd 26 sep 2026) ─────────────────────
-- Geen van de drie keuze-oppervlakken leest `ai_enabled`:
--   1. met AI-abonnement: de overlay in app/(app)/layout.tsx opent op
--      `ai_consent_at IS NULL` (AiConsentInterstitial → POST /api/consent/ai);
--   2. zonder AI-abonnement: AiSubscriptionUpsell → BetaAddonDialog →
--      POST /api/beta/addon, die éérst recordAiConsent('granted') schrijft
--      (ADR 0157) en daarmee `ai_enabled` weer op true zet;
--   3. altijd: de toggle op /mijn/privacy, via dezelfde /api/consent/ai.
--
-- ── Wie valt erbuiten ─────────────────────────────────────────────────────────
-- De geseede testpersona's (`<persona>@test.trifinity.nl`, lib/test-personas.ts)
-- zijn fixtures. Volgens ADR 0155 punt 10 horen ze al een keuze met
-- `source = 'seed'` te dragen; op 26 sep bleken er 4 zonder te staan (geseed
-- vóór 17 sep). Ze uitzetten laat elke UAT-/regressierun op 403 `ai_disabled`
-- lopen. Opnieuw seeden herstelt het (wist wel de accountdata). Tot dan blijven
-- ze buiten deze correctie. Het eigenaarsaccount en de superadmins vallen er
-- niet in: die hebben al gekozen.
--
-- ── Droge telling 26 sep 2026 (productie, alleen-lezen) ───────────────────────
--   ai_consent_at IS NULL           22  (alle 22 met ai_enabled = true)
--     waarvan met AI-abonnement      8  → overlaypad
--     waarvan zonder AI-abonnement  14  → upsell/beta-pad
--     waarvan testpersona            4  → blijven buiten
--     waarvan superadmin             0
--     ingelogd sinds 17 sep          0
--   verwacht effect: 18 rijen ai_enabled true → false.
--
-- ── Uitrollen ─────────────────────────────────────────────────────────────────
-- NIET vóór 1 okt 2026 en alleen na een expliciete go van de eigenaar. Het
-- DO-blok weigert zelf een vroegere datum. Uitrollen via execute_sql + een
-- expliciete INSERT in supabase_migrations.schema_migrations met versie
-- 20261001120000; verifiëren op schema-effect (de telling hieronder = 0).
--
-- ── Idempotent ────────────────────────────────────────────────────────────────
-- Een tweede run raakt 0 rijen: het filter eist `ai_enabled = true`.
--
-- ── Verificatie na afloop ─────────────────────────────────────────────────────
--   select count(*) from public.profiles p join auth.users u on u.id = p.id
--   where p.ai_consent_at is null and p.ai_enabled
--     and u.email not like '%@test.trifinity.nl';            -- verwacht 0
--
-- ── Terugweg ──────────────────────────────────────────────────────────────────
-- Er is geen bewijs dat deze 18 mensen AI wilden, dus terugzetten naar true is
-- geen correctie maar het oude probleem. Wie AI terug wil, kiest via een van de
-- drie oppervlakken hierboven; dat legt meteen het bewijs vast. Ging het mis
-- (bv. rijen mét keuze geraakt), dan zie je dat aan
--   select count(*) from public.profiles where ai_consent_at is not null
--     and not ai_enabled and ai_consent_version is not null;
-- vóór en ná vergelijken, en herstel je die rijen uit consent_events (laatste
-- event per gebruiker bepaalt de stand).

do $$
declare
  geraakt integer;
begin
  if now() < timestamptz '2026-10-01 00:00:00+02' then
    raise exception 'ADR 0155 punt 7: deze correctie mag pas vanaf 1 okt 2026 draaien';
  end if;

  update public.profiles p
     set ai_enabled = false
   where p.ai_consent_at is null
     and p.ai_enabled = true
     and not exists (
       select 1 from auth.users u
        where u.id = p.id
          and u.email like '%@test.trifinity.nl'
     );

  get diagnostics geraakt = row_count;
  raise notice 'ai_enabled uitgezet voor % profiel(en) zonder vastgelegde keuze', geraakt;
end
$$;
