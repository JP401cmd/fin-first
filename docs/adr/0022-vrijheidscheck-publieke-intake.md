---
id: 0022-vrijheidscheck-publieke-intake
title: Vrijheidscheck — publieke pre-account intake en conversie
status: aanvaard
date: 2026-06-17
elements: [as-vrijheidscheck, sp-vrijheidscheck, b-bezoeker, do-lead, t-supabase]
---

De publieke Vrijheidscheck-funnel (`/check`) laat een anonieme bezoeker een korte intake doen, krijgt server-side een Vrijheidsrapport berekend en converteert daarna naar een account. Omdat de bezoeker op dat moment nog niet in `auth.users` bestaat, loopt het schrijven via een service-role-pad (achter zod, payload-grens, IP-rate-limit en Turnstile, fail-closed) i.p.v. een anonieme RLS-insert; de intake wordt e-mail-first in een aparte, versleutelde lead-tabel bewaard met 90-dagen-TTL-purge; het rapport consumeert de bestaande rekenmotoren ongewijzigd (geen herberekening); en de conversie maakt het account met `seedPersonaData` via de RLS-user-client (least privilege), terwijl de lead-read via de service-role gaat.

## Context

TriFinity wilde een gratis voordeur: laat iemand zónder account in een paar stappen zien waar hij financieel staat, en converteer pas daarna. Dat botst met het bestaande beveiligingsmodel, dat volledig op `auth.uid()`-gescopte RLS rust:

- De bezoeker bestaat (nog) niet in `auth.users`. Er is dus geen `user_id`-eigenaar en geen `auth.uid()` om RLS op te scopen. Een anonieme RLS-insert zou een `INSERT`-policy voor de `anon`-rol vergen op een tabel met PII (e-mail, financiële intake) — een open publiek schrijfvlak dat lastig te begrenzen is en het eerste gat in het "alles via eigenaarschap"-model.
- Het rapport moet exact dezelfde getallen tonen als de ingelogde app, anders ondermijnt de check het vertrouwen op het moment dat de bezoeker converteert.
- Een lead is per definitie persoonsgegeven (AVG): we bewaren een e-mail om later te kunnen mailen, plus een ruwe intake-blob met financiële details.

## Besluit

Vier samenhangende besluiten:

**(a) Publiek service-role-schrijfpad i.p.v. anonieme RLS-insert.** `lead_intakes` en `intake_rate_limit` hebben RLS aan met OPZETTELIJK nul policies (default-deny voor `anon`/`authenticated`). Alle toegang loopt uitsluitend server-side via `getServiceClient()`; de service-role omzeilt RLS, dus de API-laag (`/api/check/submit`) is de enige schrijfplek. Dat schrijfpad is fail-closed achter de volledige vangrail-keten: zod-validatie van de intake, een harde payload-grens, een IP-rate-limit (`intake_rate_limit`, met `ip_hash` — nooit plain IP) en Turnstile-verificatie. Geen extra grants aan interactieve rollen = geen grant-leak.

**(b) E-mail-first, aparte versleutelde lead-tabel, 90-dagen-TTL-purge.** De lead leeft niet in de bestaande domeintabellen maar in een eigen `lead_intakes`-tabel. De e-mail staat plain (we moeten kunnen mailen) maar uitsluitend service-role-bereikbaar, met een HMAC-blind-index voor dedupe zonder plain-match. De ruwe intake-blob staat ALLEEN versleuteld (`intake_encrypted`, AES-256-GCM via de app-laag `encryptField`); er is bewust geen plain intake-kolom. Het `report_snapshot` is afgeleide data (getallen/labels) en mag plain `jsonb`. Het bevat bewust géén hoog-gevoelige identifiers (achternaam/IBAN/BSN); wél de **voornaam** van de bezoeker voor de personalisatie van de rapport-masthead — een laag-gevoelig persoonsgegeven dat acceptabel plain staat omdat de rij default-deny-RLS heeft (uitsluitend service-role), alleen via een onraadbaar random-UUID-token opvraagbaar is, en na 90 dagen wordt gepurged. Niet-geconverteerde rijen verlopen na 90 dagen (`expires_at`) en worden geruimd door `purge_expired_lead_intakes()` (`SECURITY DEFINER`, lege `search_path`, `EXECUTE` ingetrokken van `anon`/`authenticated`).

**(c) De funnel consumeert de rekenmotoren direct — geen herberekening.** `lib/check/build-report.ts` is een pure mapper/aggregator zonder eigen formules of Supabase-calls: hij bouwt synthetische `Asset[]`/`Debt[]` uit de intake en draait dezelfde canonieke engines als de ingelogde app (`runHorizonLedger`, `computeFireProjection`, `computeFreedomProgress`, `buildHealthScoreInput`→`computeHealthScoreFromInputs`, `resolveSavingsSource`, `getCohortReference`+`computeReferencePeer`, …). De horizon v2-engine draait byte-identiek aan de app. Het rapport is dus een nieuw afgeleide-getallen-OPPERVLAK, geen nieuwe rekenmotor — consistent met de "consume, don't recompute"-regel.

**(d) Conversie via `seedPersonaData` met de RLS-user-client (least privilege); lead-read via service-role.** Bij activatie (`/api/check/activate`) maakt de bezoeker een echt account aan en wordt de intake omgezet in startdata via `seedPersonaData`, draaiend op de RLS-user-client van de net aangemaakte gebruiker — het schrijven van persoonlijke financiële data gebeurt dus binnen het normale, `auth.uid()`-gescopte RLS-pad, niet met de service-role. Alleen het teruglézen van de lead (op token) loopt via de service-role, omdat de lead-tabel anders onbereikbaar is. De koppeling wordt geregistreerd (`converted_user_id`/`converted_at`).

## Alternatieven

- **Anonieme RLS-insert voor `anon`.** Verworpen: opent een publiek schrijfvlak op een PII-tabel, breekt het "alles via eigenaarschap"-model en is moeilijker te begrenzen dan één server-route met expliciete vangrails.
- **Geen aparte tabel — direct in een staging-deel van de domeintabellen.** Verworpen: vervuilt de eigenaar-gescopte tabellen met eigenaarloze rijen en bemoeilijkt de TTL-purge en de AVG-afbakening.
- **Het rapport in de funnel opnieuw berekenen (lichte variant).** Verworpen: zou een tweede waarheid introduceren en bij conversie afwijken van de in-app cijfers — schending van de SSoT-regel.
- **`seedPersonaData` met de service-role.** Verworpen: meer rechten dan nodig. De gebruiker bestaat na signup, dus het RLS-user-pad volstaat (least privilege).

## Gevolgen

- Dit is het eerste publieke service-role-schrijfpad in de app — het scherpste structurele risico tot de hardening getest én uitgerold is. Vastgelegd als aandachtspunt `public-intake-write` (severity `risk`) op `as-vrijheidscheck`/`t-supabase`/`do-lead`; te verwijderen zodra de migratie/secrets gedeployed zijn en security GO geeft (security gaf inmiddels een voorwaardelijke GO).
- De Vrijheidscheck is bewust GÉÉN functionele module (`ModuleId`): het is een instroomproces vóór account, geen gebruiker-activeerbare capability. Het verschijnt daarom als business-actor + bedrijfsproces + applicatieservice + data-object op de plaat, maar niet in `FUNCTION_SERVICE_MAP` of als HLD-module.
- Elke wijziging aan `lib/check/build-report.ts` moet een consument blijven: geen eigen formule, geen Supabase, JSON-serialiseerbaar (het rapport landt als `report_snapshot`). Bewaakt door `lib/check/__tests__/build-report.test.ts`.
- De purge moet gescheduled draaien (pg_cron of een service-role-cron-route); een niet-draaiende purge laat verlopen leads staan.
