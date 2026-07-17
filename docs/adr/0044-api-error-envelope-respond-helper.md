---
id: 0044-api-error-envelope-respond-helper
title: 'Gedeelde API-error-envelope + respond-helper als single source voor de HTTP-foutvorm; zod-conventie op nieuwe mutatie-routes'
status: aanvaard
date: 2026-07-17
elements: [t-platform, t-supabase]
---

# 0044 — Gedeelde API-error-envelope + respond-helper

## Context

Over ~250 route-handlers onder `app/api/*` was er geen gedeelde foutvorm
(enterprise-architectuurreview 3 jul 2026, bevinding #9 · fase F4):

- **63 routebestanden** retourneerden een rauwe `error.message` in de
  response-body — meestal een Supabase-fout, waardoor DB-/driver-details naar de
  client lekken (beveiliging/AVG).
- 401-teksten bestonden in drie varianten (`'Niet ingelogd'`, `'Unauthorized'`,
  `'Unauthenticated'`).
- Response-vorm wisselde: `NextResponse.json`, `Response.json`, en handmatig
  `new Response(...)` (deels plain-text 401).
- Drie concrete bugs: `holdings` GET maskeerde een DB-fout als 200-met-lege-lijst;
  `ai/chat` gaf een plain-text 401; `admin/seed` een handgebouwde `new Response`.
- Slechts 19/250 routes valideerden input met zod.

De frontend leest `data.error` als **string** op ~59 plekken
(`data.error || 'fallback'`). De platte `{ error: string }`-envelope is dus al de
de-facto conventie.

## Besluit

1. **`lib/api/respond.ts`** is de single source voor de HTTP-foutvorm. Envelope is
   **plat**: `{ error: string }`, optioneel uitgebreid met een machine-leesbaar
   `code?`-veld (`{ error: string; code?: string }`) — additief, breekt de
   string-reads niet. Bewust **geen** geneste `{ ok, error: { code, message } }`.
   Helpers: `unauthorized()`, `forbidden()`, `badRequest(msg)`, `notFound()`,
   `conflict(msg)`, `serverError(err, tag)`.
2. **`serverError(err, tag)`** logt de echte fout server-side met een grep-bare tag
   en stuurt een generieke tekst naar de client — **nooit** de rauwe
   `error.message` of stack.
3. **Eén 401-tekst app-breed: `'Niet ingelogd'`** (meest voorkomend, NL-app).
4. **Zod-conventie**: nieuwe mutatie-routes (POST/PUT/PATCH/DELETE-met-body)
   valideren hun body met een zod-schema via `lib/api/parse-body.ts#parseBody`.
   Bestaande handlers worden niet massaal geretrofit (scope-bewaking) — zod komt
   erbij waar de migratie er toch al langskomt.
5. Migratie is mechanisch en incrementeel, per `app/api`-domeinmap.

## Gevolgen

- Geen route lekt nog een rauwe DB-boodschap; foutvorm is consistent en
  client-veilig.
- De F2-lintregel (`no-restricted-syntax` op `error.message` in responses) kan na
  de migratie zonder suppressions op `error` gezet worden.
- Consumers van `holdings` GET moeten een foutstate tonen i.p.v. "geen holdings"
  bij een storing (bewuste gedragswijziging).

Precedent: ADR 0038 (Button-primitive), ADR 0039 (overlay-standaard) — één
gedeelde primitive als single source.
