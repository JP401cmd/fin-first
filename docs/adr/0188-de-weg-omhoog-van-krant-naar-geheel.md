---
id: 0188-de-weg-omhoog-van-krant-naar-geheel
title: 'De weg omhoog van de Krant naar het Geheel (fase 1)'
status: voorgesteld
date: 2026-09-29
elements: [app-comp, sp-nieuws, as-nieuws, do-meta, t-supabase]
---

# 0188 — De weg omhoog van de Krant naar het Geheel (fase 1)

Krant 2D fase 1 (besluit B12) geeft een Krant-account een ingang om zelf naar het volledige TriFinity over te stappen, en geeft beheer een ingang om het product van een account allebei de kanten op te zetten. Beide lopen over dezelfde schrijfweg als ADR 0184: er komt geen derde preset, geen nieuwe kolom en geen nieuwe schrijfroute voor de kern-mutatie zelf.

## Context

ADR 0184 (Krant 2A fase 2 / 2B) legde `PUT /api/modules` vast als de enige schrijfweg tussen de twee producten (`krant` = alleen `nieuws`, `geheel` = alle modules) en zette `/krant/meer` en `/mijn/nieuwsprofiel` alvast op de Krant-allowlist (`KRANT_ROUTES`), hoewel de pagina's nog niet bestonden. Fase 1 van 2D bouwt het scherm achter die alvast-gereserveerde route en de bijbehorende beheer-actie:

- **`/krant/meer`** — een leesbare pagina die uitlegt wat het volledige TriFinity laat zien (vermogen, budget, box 3, een plan in de tijd), met voor een Krant-account één knop "Meer TriFinity".
- **De kaart "Meer TriFinity" op `/mijn/account`** — de ingang naar die pagina, alleen zichtbaar voor een Krant-account (dezelfde `useNavSurface().isKrant` als de rest van de productgrens).
- **`POST /api/admin/users/product`** — een beheer-actie die het product van een willekeurig account omzet, met knoppen "Zet op Krant"/"Zet op Geheel" op `/beheer/gebruikers`.

## Besluit

**1. Eén knop, één bevestiging, één harde navigatie.** De knop "Meer TriFinity" opent `<ShellOverlay kind="confirm">`; pas "Aanzetten" roept `PUT /api/modules` aan met `{ product: 'geheel' }` en navigeert daarna met `window.location.assign('/overzicht')` — bewust geen `router.push`. De gedeelde `(app)`-layout houdt de moduleset in de `FeatureAccessProvider` vast en her-rendert niet bij een client-navigatie; een soft-push zou `KrantRouteGuard` nog het oude product laten zien en meteen terugsturen naar `/nieuws`. Een fout laat de bevestiging open met de melding staan; er wordt dan niet genavigeerd.

**2. Fase 1 is het scherm en de omzetting, niet de onboarding erna.** Wat hier bewust NIET gebeurt: geen Geheel-onboarding voor een account dat die nooit deed, geen voorvullen uit het nieuwsprofiel, geen omzetting van de herkomst. Dat is Krant 2C. `PUT /api/modules` blijft in fase 1 exact wat ADR 0184 vastlegde: twee profielkolommen, verder niets. Een latere 2C-beslissing (eigenaar, 29 sep, keuze 1) is dat de weg omhoog `onboarding_completed` terugzet op false voor een account zonder de stap `'identity'`, zodat de layout vanzelf naar `/onboarding` stuurt — deze route hoeft daar dan niet voor te veranderen.

**3. Terug naar alleen de Krant heeft bewust geen knop voor de lezer.** Dat voorkomt dat iemand zijn eigen product per ongeluk terugzet. De weg terug die we aanbieden is `POST /api/admin/users/product`, achter de superadmin-poort, met dezelfde `PRODUCT_PRESETS` als `PUT /api/modules` — geen tweede preset-definitie. Technisch kan een lezer het ook zelf: `PUT /api/modules` accepteert `product: 'krant'` van elke ingelogde gebruiker, en de eigen-rij-policy op `profiles` laat dezelfde update via PostgREST toe (ADR 0184 §2). Dat is aanvaard omdat het alleen beperkt: er wordt niets gewist, de lezer raakt alleen zijn eigen rij en kan via /krant/meer terug. "Geen knop" is dus een keuze in het scherm, geen afdwinging (security-run R2, 29-09-2026).

**4. Beheer leest gebruik, geen inhoud (ADR 0146) — ook hier.** De nieuwe route leest van `profiles` alleen `id` + `full_name` (bestaanscontrole + auditlabel); de huidige moduleset staat niet op de beheer-leeslijst (`lib/beheer/geen-inhoud.test.ts`) en wordt bewust niet gelezen. De knoppen "Zet op Krant"/"Zet op Geheel" tonen daarom geen huidige staat — de productkeuze op `/beheer/gebruikers` is een ACTIE ("zet op…"), geen weergave. Het auditlog krijgt een `user.product`-regel met alleen het doel (`to: product`), geen "van"-waarde.

**5. Niets wordt gewist, in beide richtingen.** Zowel de knop als de beheer-route raken uitsluitend `active_modules` en `home_screen`. Bezittingen, budgetten, transacties en het nieuwsprofiel blijven ongemoeid — bewaakt door een bronscan die elke `delete`/`insert`/`upsert` in `app/api/admin/users/product/route.ts` verbiedt.

## Gevolgen / open

- **`active_modules` blijft een zelf-schrijfbare kolom (aanvaard risico, zie ADR 0184).** De security-run bij 2D bevestigde dat dit vandaag onschadelijk is: de Krant is alleen een beperking, AI hangt aan de bewaakte `active_subscriptions`/`ai_enabled`, en 0 policies/functies lezen `active_modules`. Wordt het Geheel (of een losse ingang zoals Budget) ooit betaald, dan is `active_modules` een discriminator die een gebruiker zelf kan zetten om een betaalmuur te omzeilen — dan hoort de kolom onder dezelfde soort guard als `role` (`guard_profiles_role`), of het schrijfpad moet volledig naar een service-role-schrijver zoals `POST /api/admin/users/product` al is. Vastgelegd als aandachtspunt `active-modules-zelf-schrijfbaar-geen-betaalmuur-guard` in `lib/architecture/archimate-concerns.ts`. Open tot een van beide is opgelost of een eigenaarsbesluit vastlegt dat geen enkel modulelidmaatschap ooit betaald wordt.
- **De route `POST /api/admin/users/product` heeft een eigen `route.test.ts`** (toegevoegd na de eerste oplevering van fase 1), naast de bronscan (geen delete/insert/upsert) en de componenttoets (`product-keuze.test.tsx`). Zie WF-KRANT-15.
- **Uitrolvolgorde: migratie 20261006120000 (Krant 2B, de `home_screen`-CHECK met `'nieuws'`) moet vóór deze deploy live staan.** Zonder die migratie geeft een `product: 'krant'`-schrijfactie (via beide routes) een 23514/500 in plaats van een 400/succes.
- **Security: GO onder voorwaarde** (2D-review) — de voorwaarde is de migratievolgorde hierboven, niet een codewijziging.
- **Architectuurplaat.** Geen nieuw element: beide routes hangen aan bestaande diensten (`as-nieuws`/`sp-nieuws` voor de Krant-kant, `do-meta` voor `profiles`). De HLD-praatplaat kreeg één nieuwe functionaliteit ("Vanuit de Krant het volledige TriFinity ernaast zetten") in de groep "Ik wil grip op mijn geld vandaag".

## Vervolg: Krant 2C

2C bouwt de Geheel-onboarding na de overstap, het voorvullen uit het nieuwsprofiel en de omzetting van de herkomst. Deze route en deze knop hoeven daar niet voor te veranderen — 2C hangt zijn logica aan hetzelfde `PUT /api/modules`-schrijfmoment.
