---
id: 0051-getclaims-read-routes-revocatievenster
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
