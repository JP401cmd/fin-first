---
id: 0052-getclaims-read-routes-revocatievenster
title: 'getClaims() voor read-routes: lokale JWT-verificatie met geaccepteerd revocatievenster'
status: aanvaard
date: 2026-07-19
elements: [t-supabase]
---

# 0051 — getClaims() voor read-routes (RF-008/C2)

## Context

Alle ~220 API-routes deden per request een `auth.getUser()`-roundtrip naar de
Supabase Auth-server, puur om de identiteit vast te stellen. `getClaims()`
verifieert het JWT lokaal en elimineert die roundtrip. Bevestigd op prod
(19 jul 2026): de JWT's zijn asymmetrisch getekend (`alg: ES256` + `kid`),
dus de lokale verificatie is actief — géén stille terugval op `getUser()`
(die terugval treedt alleen op bij HS*-algoritmen of ontbrekende `kid`).

## Besluit

- **Pure read-GET's** gebruiken `getAuthClaims()` (`lib/supabase/server.ts`):
  lokale verificatie, identiteit uit `claims.sub`. RLS blijft de echte
  autorisatiegrens (queries lopen via de RLS-client, gescoped op `auth.uid()`).
- **Mutaties, admin-/account-routes, service-role-paden en
  revocatie-gevoelige flows behouden `getUser()`** (server-side check).

## Geaccepteerd risico (het revocatievenster)

Een server-side ingetrokken sessie (uitloggen op een ander apparaat,
wachtwoordwijziging, ban) blijft op read-routes geldig tot de JWT-expiry —
maximaal `jwt_expiry` = 3600 s (≈ 1 uur; prod-waarde dashboard-beheerd).
Blast-radius: de ingetrokken sessie kan uitsluitend de EIGEN data nog lezen
(RLS scoped op `sub`); geen cross-user-toegang, geen schrijfmogelijkheid.
Dat venster accepteren we bewust in ruil voor het schrappen van een
auth-roundtrip per API-call app-breed.

## Kanttekeningen

- Op het asymmetrische pad kan een JWKS-netwerkfout (koude lambda) een
  niet-AuthError-throw geven vóór het envelope-pad — zeldzaam (JWKS is
  module-globaal gecachet) en symmetrisch met het oude gedrag qua plaatsing.
- Wie de signing-modus ooit terugzet naar symmetrisch, maakt de hele
  migratie een stille no-op — bij zo'n wijziging deze ADR herzien.

## Aanvulling (27 sep 2026, Snelheid B2) — het RSC-leespad

`getCachedUser` (`lib/supabase/cached-user.ts`) valt voortaan onder de lees-regel van
dit besluit: hij verifieert via `getClaims()` en levert een smal `CachedUser`
(`id`, `email`, `app_metadata`, `user_metadata` — alleen wat het JWT draagt).
Daarmee verdwijnt de `/auth/v1/user`-ronde uit de app-shell-layout, de pagina's
en alle server-loaders; de proxy verifieerde datzelfde token al lokaal.

- **Mutaties** die de gebruiker via deze module resolven, gebruiken `getVerifiedUser`
  (`auth.getUser()`). `lib/supabase/cached-user.test.ts` scant `app/api/**/route.ts`
  en faalt op elke exported POST/PUT/PATCH/DELETE die `getCachedUser` aanroept.
  Hij dekt níét: `getAuthClaims`/`auth.getClaims` direct in een mutatie-handler
  (daar staan nog bestaande gevallen, o.a. `beta/addon` POST met een service-role-RPC),
  helpers buiten het exported blok en `'use server'`-bestanden.
- **Revocatievenster** blijft zoals hierboven: een ingetrokken sessie of verwijderd
  account kan tot de JWT-expiry de app-shell renderen, met uitsluitend de eigen
  (bij verwijdering: lege) data via RLS. Blokkeren trok nooit een sessie in en
  verandert hierdoor niet: de layout toetst `profiles.blocked_at` alleen bij een
  harde render, en die vlag is (bekend, los van B2) nog door de eigen rij te wijzigen.
- **Precondities** ongewijzigd: asymmetrische signing (JWKS 27 sep: één ES256-sleutel)
  en de module-globale JWKS-cache van auth-js (TTL 10 min).
