---
id: 0058-datapad-conventie-lezen-muteren-client-direct
title: Datapad-conventie — lezen via loader/bundel, muteren via API-route, client-direct afgebakend
status: aanvaard
date: 2026-07-21
elements: [app-comp, t-supabase, data-cont]
---

De frontend leest weergavedata voortaan **alléén** via een server-loader
(`lib/*-data-loader.ts` → `DashboardData`-bundel → props) en muteert **alléén** via
een API-route met de error-envelope (ADR 0044) + zod (`parseBody`). Rechtstreeks de
browser-client (`lib/supabase/client`) gebruiken in een `'use client'`-bestand blijft
toegestaan, maar afgebakend tot drie gevallen: eigen-rij preferences (own-row RMW via
de anon-RLS-client, spiegel `app/api/appearance`), auth (`supabase.auth.*`), en
realtime (`.channel()`/`postgres_changes`; de initiële load blijft via loader/API). Een
lint-gate (`scripts/check-client-data-reads.mjs`) bewaakt de regel: nieuwe
`.from(...).select(...)`-reads-for-display in client-code buiten de allowlist worden
rood. Dit is **Slice 0 / Fase a** — het vastleggen van de conventie en de meetlat; de
per-domein migratie van de ~47 bestaande lezers (Fase b) is expliciet later, per-domein
af te tekenen werk dat samenloopt met de god-component-decompositie.

## Context

De enterprise-architectuurreview (3 jul 2026, bevinding #11) constateerde drie
datatoegangspatronen die naast elkaar bestonden zonder regel:

1. **Server-first** (het bedoelde patroon): pagina → loader (`lib/*-data-loader.ts`) →
   `DashboardData`-bundel → props → widget.
2. **Client-direct**: client-componenten importeren `lib/supabase/client` en queryen
   zelf. Werkt dankzij RLS, maar omzeilt de bundel, dupliceert queries, jaagt egress op
   en verspreidt loading/error-state.
3. **API-fetch**: componenten fetchen `/api/*` met handgerolde loading/error-state,
   zonder gedeelde hook of cache.

RLS beperkt het *veiligheids*risico van client-direct lezen, maar consistentie, caching
en egress lijden eronder, en er was geen norm die vertelt wanneer welk pad hoort.

Meting op HEAD (21 jul 2026): **79** client-bestanden importeren `lib/supabase/client`;
daarvan doen er **47** minstens één read-for-display (`.from(...).select(...)` die geen
`insert/update/upsert/delete`-returning is). De overige ~32 gebruiken de client uitsluitend
voor mutatie, auth of realtime. De server-loaders (`lib/dashboard-data-loader.ts`,
`lib/core-data-loader.ts`) + `DashboardData`-bundel bestaan al als het bedoelde patroon;
`/api/perspective` en `/api/appearance` tonen het API- resp. eigen-rij-pref-model.

## Besluit

**De driedeling (canoniek):**

- **Lezen (weergavedata) = server-loader/bundel.** Server-page → loader
  (`lib/*-data-loader.ts`) → `DashboardData`-bundel → props naar het client-component.
  Geen `createClient()` + `.from().select()` in `'use client'` voor weergavedata.
- **Muteren = API-route** met de error-envelope (ADR 0044) + zod (`parseBody`,
  ADR 0044-conventie). Client doet `fetch('/api/...')`; **geen** directe
  `.insert/.update/.delete/.upsert` uit de browser-client.
- **Client-direct toegestaan, afgebakend tot drie gevallen:**
  1. **Eigen-rij preferences** (profiles/appearance/widget-prefs) — own-row
     read-modify-write via de anon-RLS-client, spiegel `app/api/appearance`.
  2. **Auth** (`supabase.auth.*`) — moet client-side.
  3. **Realtime** (`.channel()`/`postgres_changes`) — client-side; de **initiële** load
     blijft via loader/API.

Voor lezen dat écht on-demand/lazy client-side moet (modals, tab-lazy) is het toekomstige
fundament één gedeelde `useApiQuery`-hook naar een API-route (TTL-cache, refetch-on-focus
uit) — hergebruik van de egress-lessen (poll 60s→10min + TTL-cache). Belangrijk:
`.insert().select('id')` returning is **geen** read-for-display en telt niet mee in de
meetlat.

**Handhaving (lint-gate):** `scripts/check-client-data-reads.mjs` (mirror van de
allowlist-gedachte uit ADR 0047) scant `'use client'`-bestanden die `lib/supabase/client`
importeren op read-for-display-patronen en flagt elk bestand dat **niet** op de
grandfather-allowlist staat. De ~47 bestaande lezers staan op die allowlist, zodat alleen
**nieuwe** overtredingen rood worden. Fase b faseert de allowlist-entries per domein uit.

## Gevolgen

- **Nieuwe code** volgt de norm vanaf nu; de gate maakt overtredingen zichtbaar bij
  `npm run check:client-reads` en in de pre-push-hook.
- **Bestaande ~47 lezers** blijven werken (grandfathered) en worden per domein-slice
  gemigreerd (Fase b): assets → budgets → cash → horizon/toekomst → debts/belasting →
  beheer/rapportages/onboarding. Elke slice combineert met de god-component-decompositie
  (zelfde bestanden: `assets-client`, `budgets-client`, `horizon-client`) en meet egress
  vóór/na.
- **Risico's:** god-components verweven reads met UI-state/optimistic updates — per read
  kiezen tussen loader (statische initial data) en API-route (on-demand/na-mutatie
  refetch), niet naïef verplaatsen. Elke nieuwe API-route moet zélf auth+ownership checken
  (RLS was de enige poort bij client-direct). Realtime en eigen-rij-prefs niet
  over-migreren. Egress-winst niet aannemen zonder caching — per slice meten.

## Losse observatie (buiten scope)

Er bestaan twee `0056-*.md`-ADR's (`0056-chat-transport-*` en `0056-eigen-web-vitals-*`) —
dubbele nummering. Niet in deze kaart opgelost; benoemd zodat het niet verdwijnt.
