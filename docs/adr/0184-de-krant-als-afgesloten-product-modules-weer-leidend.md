---
id: 0184-de-krant-als-afgesloten-product-modules-weer-leidend
title: 'De Krant als afgesloten product: modules weer leidend, de keuze is een product'
status: voorgesteld
date: 2026-09-29
elements: [app-comp, fn-nieuws, as-nieuws, do-meta, t-supabase]
---

# 0184 — De Krant als afgesloten product: modules weer leidend, de keuze is een product

`profiles.active_modules` bepaalt weer wat een account is. Eén pure helper (`resolveActiveModules`) is de enige lezing van de kolom. Een account wisselt tussen twee producten, **Krant** (alleen `nieuws`) en **Geheel** (alle modules), en dat gaat uitsluitend via `PUT /api/modules` met `{ product }`. De server kiest de preset. `profiles.home_screen` kent daarvoor de waarde `'nieuws'`. Die waarde kan worden opgeslagen, maar een gebruiker kan hem niet kiezen. Krant 2B (de productgrens) bouwt hierop voort. Dit is het eerste vastgelegde besluit over het modulemechanisme.

## Context

De app-shell negeerde `active_modules` jarenlang (`const activeModules = [...ALL_MODULES]`). De AI-context las de kolom met een eigen `?? ALL_MODULES`. Dat de "module-toggle is verwijderd" stond alleen in een layout-commentaar en is nooit als besluit vastgelegd. Voor de Krant als zelfstandig product (plan "Krant op eigen benen", fase K1) moet één kolom op elk oppervlak hetzelfde betekenen. Er moet ook één schrijfpad komen dat een account van het Geheel naar de Krant en terug zet.

Gemeten op productie (read-only SELECT, 28-09-2026): 29 profielen. `active_modules`: 26 × alle zes, 3 × `null`, 0 × alleen `nieuws`. `home_screen`: 29 × `'overzicht'`. `profiles_home_screen_check` was `CHECK (home_screen IN ('overzicht','budget'))`. Op `profiles` staat RLS aan met precies één policy, "Users can manage own profile" (FOR ALL, `USING ((select auth.uid()) = id)`, geen eigen WITH CHECK). De enige niet-interne trigger, `trg_guard_profiles_role`, blokkeert voor authenticated/anon alleen `role`, `commercial_tier` en `active_subscriptions`.

## Besluit

**1. Modules zijn weer leidend (fase 1, live sinds 21 sep).** `lib/modules/resolve.ts#resolveActiveModules` is de enige lezing. De helper is puur en edge-veilig. `null`, geen array, een lege set of alleen onbekende ids geven alle modules. Dat is fail-open en behoudt het gedrag. De uitvoer staat altijd in catalogusvolgorde. De layout, de proxy en de AI-contextbouwer lezen via de helper. `resolveHomeHref` laat de productgrens winnen van de voorkeur: een account met alleen `nieuws` landt op /nieuws. Een bron-scan (`lib/modules/readers.source.test.ts`) bewaakt dat niemand de kolom buiten de helper leest.

**2. De keuze is een product, geen modulelijst (keuze 2A).** `PUT /api/modules` accepteert `z.strictObject({ product: z.enum(['krant','geheel']) })`. De server mapt naar `PRODUCT_PRESETS` (`lib/modules/resolve.ts`, pure en bevroren data):

| product | `active_modules` | `home_screen` |
|---|---|---|
| `krant` | `['nieuws']` | `'nieuws'` |
| `geheel` | alle modules (catalogusvolgorde) | `'overzicht'` |

`validateModules` controleert als guard of de preset zelf klopt. Een kapotte preset geeft een 500 en geen 400. De update is own-row (`.eq('id', user.id)`) via de sessieclient met RLS en gebruikt nooit de service-role. De response is `{ ok: true, modules, homeScreen }`. Van Geheel naar Krant verwijdert **geen** data: alleen de twee profielkolommen veranderen. Via deze route zijn er precies twee modulesets, en een "zes knoppen terug"-oppervlak bestaat niet. **Invariant:** de database dwingt dat niet af — met zijn eigen JWT kan elke gebruiker `active_modules` en `home_screen` ook direct via PostgREST zetten (own-row FOR ALL-policy; de guard-trigger bewaakt deze kolommen niet). Dat is aanvaard zolang de kolom uitsluitend **beperkt en nooit toekent**. Een betaalde of beperkte productset vereist eerst dat de kolom in `guard_profiles_role` komt, plus een entitlement-check in `PUT /api/modules` (security-run 29 sep). Een derde ingang (bijvoorbeeld de Budget-ingang uit het GTM-plan) kost later één regel in `PRODUCT_PRESETS`.

**3. `'nieuws'` wordt nu al een waarde van `home_screen` (keuze 1A).** Migratie `20261006120000_profiles_home_screen_nieuws.sql` verruimt de CHECK naar `('overzicht','budget','nieuws')`. Die migratie doet geen backfill en geen UPDATE, en wijzigt geen policy. Daardoor gaan de client-side home-navigaties (top-bar ←, long-press op de waffle, `useHomeScreen().homeHref`) direct naar /nieuws, zonder omweg via een redirect uit 2B. Het schema wordt zo in de schaduw getest.

**4. Persisteerbaar ≠ kiesbaar.** `lib/home-screen.ts` splitst de waarden:
- `HOME_SCREEN_VALUES = ['overzicht','budget','nieuws']` spiegelt de CHECK en dient voor lezen en valideren. Een test vergelijkt de lijst met de migratie.
- `HOME_SCREEN_PICKABLE = ['overzicht','budget']` dient voor elk schrijfpad vanuit de client en elke keuzelijst. `PUT /api/home-screen` valideert hiertegen, dus een Geheel-gebruiker krijgt een 400 als hij `'nieuws'` kiest. De picker (`components/mijn/home-screen-picker.tsx`) is getypt op `Record<PickableHomeScreen, …>` en toont nooit "Nieuws". `useHomeScreen().setHomeScreen` accepteert alleen kiesbare waarden. `toggle` vanaf `'nieuws'` schrijft `'overzicht'`.
- De fail-closed beheer-zod (`lib/beheer/gebruik-analyse/schema.ts`) volgt `HOME_SCREEN_VALUES`. Zo breekt het eerste Krant-profiel `/beheer/gebruik` niet.

**5. Aantekening bij keuze 3B: de `isNewsOnly`-tak en `financial_context` blijven voorlopig staan.** `app/api/onboarding/save-own-data/route.ts` heeft een eigen tak voor een account met alleen `nieuws` (extractie naar `profiles.financial_context`), en `lib/ai/context/shared-context.ts` leest die sectie. Beide blijven ongewijzigd tot Krant 2C/2D, de kaarten die de Krant-onboarding bouwen. Daar vervalt de tak, met een eigen migratie die de kolom dropt. Tot dan is de code dood: geen account heeft `['nieuws']` en de onboarding-client stuurt altijd alle modules. Opruimen in 2A zou vijf bestanden, een kolom-drop en de AI-context raken, terwijl 2A "niets zichtbaars" mag veranderen.

## Gevolgen

- **Toegang.** Er komt geen nieuw escalatiepad bij. `active_modules` en `home_screen` vallen onder dezelfde own-row-policy als de rest van de profielrij en buiten de guard-trigger. Dat is terecht, want modules zijn geen betaalrecht: betaalde functies lopen via abonnementen, los van de moduleset. Wie via een eigen PUT de Krant kiest, ziet minder en krijgt niets extra's.
- **Uitrol: eerst de migratie.** De migratie moet live staan vóór de deploy van `PUT /api/modules`. Tegen de oude CHECK faalt de Krant-update met 23514 en krijgt de client een 500. Omgekeerd is het veilig: de huidige code schrijft alleen `overzicht`/`budget`. Handmatig uitrollen gaat met `execute_sql` binnen één `begin; … commit;`, met de expliciete versie-INSERT `('20261006120000','profiles_home_screen_nieuws')` in `supabase_migrations.schema_migrations`.
- **Terugweg.** Draai eerst de code terug. Zet daarna in één transactie `home_screen = 'overzicht' where home_screen = 'nieuws'` en herstel de oude CHECK. Voor een Krant-account verandert dat niets zichtbaars, omdat de home uit `active_modules` volgt.
- **De productgrens komt in dezelfde release (2B, hieronder).** De enige UI die `PUT /api/modules` aanroept is de knop op /krant/meer (2D, "de weg omhoog naar het Geheel", ADR 0188); die is in dezelfde release meegekomen.
- **Architectuurplaat.** Er komt geen nieuw element bij: de helper is geen dienst. De ERD blijft gelijk, want een CHECK wordt niet gescand.

## Vervolg: Krant 2B bouwt hierop

2B trekt de productgrens die dit besluit alleen mogelijk maakt. **Gebouwd in dezelfde branch (29 sep).** De routegrens is een eigen allowlist in `lib/modules/krant-grens.ts` (`isKrantRoute`, `krantRedirect`), niet `isRouteAccessible` (die kent alleen oude /core-routes). De proxy geeft het pad door als request-header `x-tf-pathname` (overschrijft een clientwaarde); de layout redirect server-side, `KrantRouteGuard` vangt client-navigatie af; zonder header fail-closed naar /nieuws. De grens is **UX, geen security**: de API blijft door RLS beschermd en de grens voegt alleen weigeringen toe. Voorlopige besluiten: `/mijn/notificaties` i.p.v. `/mijn/meldingen`; `/beheer` blijft open voor een superadmin; de Mijn-ingang van een Krant-account is `/mijn/account`. De AI-poort is `checkTierGate(…, 'ai')` in `lib/require-tier.ts` (weigert een Krant-account ook mét AI-abonnement, `reason: 'krant'`); de add-on-route (ADR 0157) weigert `active: true`. Fin gaat uit voor de Krant-set. AI-routes weigeren aan de serverkant een account zonder de modules die de vraag vereist. Alerts worden gegate, zodat een Krant-account bijvoorbeeld geen horizon-alerts krijgt. De dode `active_modules`-select in `app/api/notifications/route.ts` en de `[...ALL_MODULES]` in `lib/core-data-loader.ts` en `lib/dashboard-data-loader.ts` sluiten dan aan op de helper. Alle vier lezen `resolveActiveModules` en `PRODUCT_PRESETS`. Geen van hen hoort een eigen moduledefinitie te krijgen.
