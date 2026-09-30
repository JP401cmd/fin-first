---
id: 0192-aanmelden-en-onboarding-voor-de-krant
title: 'Aanmelden en onboarding voor de Krant: de preset in de auth-callback, vijf schermen, één profiel-body'
status: voorgesteld
date: 2026-09-30
elements: [as-nieuws, sp-nieuws, do-krant, t-supabase]
---

Vervolg op ADR 0184 (de productkeuze Krant ⇄ Geheel), ADR 0183 (de tijdlijn zonder AI), ADR 0187 (de native API) en ADR 0188 (de weg omhoog). Kaart: Krant 2C.

## Aanleiding

Iemand moet zich kunnen aanmelden voor alleen de Krant, in een paar minuten een nieuwsprofiel invullen en meteen een tijdlijn lezen — zonder AI. Tot nu toe kon een Krant-account alleen ontstaan door een bestaand account om te zetten (PUT /api/modules of beheer). Een Krant-account heeft geen andere gegevens in de app, dus de afleiding van het profiel (ADR 0173) vindt voor hem niets: zonder zelf invullen blijft zijn tijdlijn algemeen.

## Besluit

1. **De preset in de auth-callback** (besluit eigenaar 29 sep, keuze 1A). `/signup?product=krant` stuurt bij e-mail én Google `next=/onboarding/krant&product=krant` mee. De callback valideert `product` op de enum (`PRODUCTS`) en zet `PRODUCT_PRESETS.krant` (active_modules = ['nieuws'], home_screen = 'nieuws') **alleen** als het account vers is (`onboarding_completed = false`, als voorwaarde in de update zelf) én binnen de tijdlijn-bèta valt. Anders geen preset en de gewone landing. Het schrijfpad deelt de callback met PUT /api/modules (`lib/modules/product-preset.ts`). `ai_enabled` blijft uit; er is geen AI-toestemmingsstap.
2. **Twee omleidingen.** De app-layout en `/onboarding` sturen een Krant-account zonder afgeronde onboarding naar `/onboarding/krant`. Dezelfde toets (`onboardingPadVoor`) bepaalt de toegang van de Krant-onboarding zelf, dus een omleiding kan geen lus worden.
3. **Vijf schermen onder `/onboarding/krant`**, niet onder `/krant` (dat is van 2E en 2D): wie je bent · inkomen · wonen · geld opzij en schulden · pensioen en rubrieken. Elk scherm is over te slaan; "weet ik niet" is overal geldig. Alleen aangeraakte velden gaan mee, met herkomst `zelf` (ook null). De laatste stap is `POST /api/krant/onboarding/klaar`: `onboarding_completed = true`, `completed_onboarding_steps ∪ ['krant']` — nooit `'identity'` (2D leest die stap) — en de eerste verversing van de tijdlijn met de id uit de sessie.
4. **Eén profielroute, één bron.** `GET/PUT /api/krant/profiel` is de web-tegenhanger van `/api/v1/krant/profiel`: dezelfde helpers (`lib/krant/v1-profiel.ts`), hetzelfde strikte schema (`profielPutBodySchema`, rubrieken alleen uit NEWS_CATEGORIES, hoogstens 20), de cookie-sessie in plaats van een Bearer. Sessie-client, nooit service-role; de kolomgrant van migratie 20261004120000 laat `krant_variant`, `afgeleid_at` en `tijdlijn_vernieuwd_at` buiten bereik.
5. **Eén body, twee hosts.** `components/krant/profiel-body.tsx` rendert de velden voor de onboarding én voor `/mijn/nieuwsprofiel`, met per veld keuze · effect · waarom als `Record<ProfielVeld, …>`. Bandlabels komen uit de bandgrenzen van de matcher. Alleen euro's en banden (B2): `euro-only.test.ts` scant nu ook `components/krant` en de onboarding-route.
6. **Opslaan slaat alleen op** (besluit eigenaar, keuze 2A). Wat al in de tijdlijn staat blijft een momentopname (U12). Een aparte knop "Nu vernieuwen" gebruikt de bestaande vernieuwroute met zijn rem van tien minuten. Het acceptatiecriterium "opslaan rekent de lopende editie opnieuw" vervalt.
7. **Achter de gesloten vlag.** Geen tweede vlag: `lib/krant/aanmelden.ts` leest `inTijdlijnBeta` (en staat daarom op de importeurs-allowlist). Callback-preset, omleidingen, de onboarding, de profielroute, de klaar-route en `/mijn/nieuwsprofiel` werken alleen voor tijdlijnlezers; voor ieder ander een 404 of de gewone route. De allowlist voor aanmelden blijft dicht (K3, op uitnodiging).
8. **Krant-accounts tellen niet mee in de snapshots-cron.** Sinds deze onboarding ronden ze `onboarding_completed` af; zonder uitsluiting kregen ze dagelijkse balans-snapshots over een vermogen waar de Krant niets van weet (`receivesSnapshots`, net als `receivesBriefing`).

## Gevolgen

- **Privacy.** De privacyverklaring beschrijft het nieuwsprofiel nu als afgeleid. Met 2C vult een lezer het zelf in; die zin moet mee, net als de verwijzing naar de vrije financiële toelichting die met de opruiming van `financial_context` verdwijnt. De juridische brief staat op de kaart (optie A: beide zinnen in /privacy 2.5, samen met 1E). Geen lezer via de Krant-ingang vóór die wijziging live staat.
- **Security.** Een aparte run toetst de callback-preset, de profielroute, de klaar-route en de omleidingen. Bekend randpunt: `PUT /api/onboarding-steps` accepteert elke tekst, dus een lezer kan zelf `'identity'` zetten (schaadt alleen hemzelf).
- **Wat bewust niet.** `/mijn/nieuwsprofiel` staat niet in het menu zolang de bèta dicht is (alleen de titel in `EXTRA_ROUTE_TITLES`); een menu-ingang die voor bijna iedereen een 404 is, is erger dan geen ingang. De nieuws-wegwijzer uit `lib/briefing/module-guide-steps.ts` als rondleiding is niet gebouwd.
- **Poort van de kaart.** Te meten op een vers testaccount binnen de bèta: de doorlooptijd van de onboarding, welke velden het vaakst worden overgeslagen, of de eerste tijdlijn direct klaarstond, en dat er bij aanmelden en onboarding geen AI-route is aangeroepen (in de bron bewaakt door `lib/krant/aanmelden.geen-ai.test.ts`).
