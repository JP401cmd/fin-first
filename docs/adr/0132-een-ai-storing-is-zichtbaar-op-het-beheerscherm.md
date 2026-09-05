---
id: 0132-een-ai-storing-is-zichtbaar-op-het-beheerscherm
title: 'Een AI-storing registreert zichzelf en is zichtbaar op het beheerscherm'
status: aanvaard
date: 2026-09-05
elements: [as-coach, t-aigateway]
---

# 0132 — Een AI-storing registreert zichzelf en is zichtbaar op het beheerscherm

## Context

Van 24 augustus tot 5 september 2026 stond het providertegoed bij Anthropic
op — elke aanroep naar Fin kreeg `HTTP 400 invalid_request_error: "Your
credit balance is too low"`. Twaalf dagen lang was dit onzichtbaar:

- `serverError()` (`lib/api/respond.ts`) loggede alleen naar `console.error`
  — nooit naar `error_logs`. `onRequestError` (instrumentation-hook) ziet de
  fout nooit, want elke AI-route vangt 'm altijd zelf.
- De chat-route start de stream vóórdat de eerste providercall gebeurt; een
  providerfout komt daardoor als `error`-part MIDDEN in een reeds gestarte
  200-stream. Voor elke statuscode-monitor was dit een geslaagd request.
- `ai_stream_failed` droeg altijd de tekst "Probeer het zo nog eens" — er was
  geen onderscheid tussen een voorbijgaande hapering en een providerweigering
  waar geen enkele retry doorheen komt. De AI-SDK kent dat onderscheid wél
  (`APICallError.isRetryable`).
- `ai_token_usage` logt alleen geslaagde calls; een gat in die tabel is niet
  te onderscheiden van "geen gebruik".
- Het beheerscherm toonde nergens een AI-status.

Drie persona-runs, elf vragen, elf keer dezelfde fout — pas een directe
probe tegen de provider legde de oorzaak bloot (UX-onderzoek 5 sep 2026,
UR3-09).

## Beslissing

**Registratie en classificatie, geen nieuwe tabel.**

1. **Eén universeel keerpunt.** `lib/ai/ai-failure-middleware.ts` is een
   AI-SDK-middleware die `getModel()` (`lib/ai/config.ts`) ALTIJD om het
   model legt — ook zonder feature-string ('onbekend') — en elke mislukte
   `doGenerate`/`doStream`-call, én elk `error`-stream-part, wegschrijft naar
   `error_logs` (context `ai:<feature>`, geen requestBody/prompt). Dit dekt
   alle `getModel`-callsites automatisch, inclusief de routes die niet zelf
   zijn gewijzigd.
2. **Classificatie, niet alleen registratie.** `lib/ai/provider-error.ts#
   classifyProviderError` leest `APICallError.isRetryable` (en
   `LoadAPIKeyError`) uit tot `refused` / `transient` / `unknown` — in plaats
   van zelf statuscodes te herclassificeren, zodat het meebeweegt met de
   SDK. De Fin-chat en de acht overige generatieve AI-routes (categorisatie,
   aanbevelingen + initieel, abonnementen-advies/-analyse/-detectie,
   budget-suggesties) tonen bij `refused` de nieuwe foutcode
   `ai_provider_refused` (`lib/ai/error-copy.ts`, affordance `geen` — geen
   retry-knop); bij `transient`/`unknown` blijft het bestaande gedrag
   (retry-affordance) ongewijzigd.
3. **Gezondheid afgeleid, niet geboekt.** `lib/ai/ai-health.ts#deriveAiHealth`
   (patroon `deriveJobHealth`, puur, getest) leidt `ok | idle | attention |
   hapering | storing | unknown` af uit de laatste geslaagde
   `ai_token_usage`-rij plus de `ai:*`-rijen in `error_logs` sinds dat succes.
   Drempel: **2 mislukte calls sinds het laatste succes** (eigenaar-besluit
   5 sep 2026 — bij weinig verkeer duurt een derde poging te lang, en een
   losse valse melding is de goedkopere fout). De jongste mislukking bepaalt
   `storing` (refused) vs. `hapering` (transient/unknown).
4. **Zichtbaar op twee plekken.** `lib/ai/ai-health-loader.ts` (service-role,
   ná `isSuperAdmin()`, precedent `/beheer/ai-verbruik`) voedt: een
   storings-strip op de `/beheer`-hub (alleen bij `storing`/`hapering`) en
   een altijd-zichtbare statuskaart bovenaan `/beheer/ai` (ook bij `ok`).

## Overwogen alternatieven

- **Een `ai_provider_status`-sleutel in `app_settings`, per call bijgewerkt.**
  O(1) lezen, maar een tweede boekhouding naast `error_logs`/`ai_token_usage`,
  race-gevoelig bij gelijktijdige calls, en een extra write op het hete pad.
  Afleiden uit de bestaande tabellen wint.
- **De HTTP-status van de chat-route "eerlijk" maken** door op de eerste
  provider-chunk te wachten vóór de stream start. Kost streaming-latency voor
  alle gebruikers, en niemand monitort die statuscode extern — de
  error-part-classificatie lost hetzelfde probleem op zonder die kosten.
- **Een dagelijkse actieve provider-probe.** Extra tokenkosten, en zou op
  dezelfde stilstaande cron-infrastructuur draaien als de meldingen-sweep
  (die zelf al niet draait — zie Gevolgen).

## Gevolgen

- Elke mislukte cloud-AI-aanroep laat nu een spoor na, ongeacht welke route —
  ook routes die niet expliciet in deze wijziging zijn geraakt (bv. de
  briefing, het rapport, pensioen-extractie): zij profiteren automatisch mee
  omdat de middleware op `getModel()`-niveau zit.
- `/beheer/errors` groeit met een `ai:<feature>`-groep zodra dit optreedt;
  `lib/alerts/fingerprint.ts` staat dat patroon toe op de allowlist zodat de
  meldingen-sweep 'm herkent (de sweep zelf draait momenteel niet — zie
  hieronder).
- **Bewust buiten deze beslissing:** het dúwen van de melding naar een
  beheerder (e-mail/push). De alerts-sweep heeft nog nooit gedraaid en
  `CRON_SECRET` ontbreekt in productie — dat blijft een handmatige
  eigenaarsactie (change-request), geen gevolg van dit ADR. Deze wijziging
  maakt de storing zichtbaar OP het scherm; ze duwt hem niet naar buiten.
- `whatif/suggest` (`app/api/whatif/suggest/route.ts`) behoudt zijn
  bestaande fail-soft gedrag (lege suggesties, geen foutmelding) — dat is een
  bewuste UX-keuze voor een optionele functie, niet aangepast. De registratie
  via de universele middleware geldt daar wél.
