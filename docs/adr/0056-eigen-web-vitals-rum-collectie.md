---
status: accepted
date: 2026-07-20
elements: [t-platform, t-supabase, app-comp]
---

# 0056 — Eigen web-vitals/RUM-collectie naast Vercel Speed Insights

## Context

Speed Insights (t-platform) geeft geen ruwe, kruisbare RUM-data per route/segment; die zit alleen in het Vercel-dashboard en is niet via CLI/MCP op te vragen. We willen vitals per gescrubde route/device/metric kunnen aggregeren (feature 885). Een publiek schrijf-endpoint is nodig omdat RUM juist ook pre-auth pagina's meet.

## Besluit

- Nieuwe tabel `web_vitals`, RLS volledig dicht; schrijven én lezen via service-role (ADR 0006). `user_id` nullable (pre-auth heeft geen sessie), `on delete set null` (de-geïdentificeerde meetwaarde blijft behouden).
- Route Content-Type-agnostisch (sendBeacon): size-cap (4KB) → JSON.parse → zod-enum. Envelope via lib/api/respond.ts (ADR 0044).
- Route-paden worden server-side gescrubd (id/uuid/getal/token → [id], query weg); alleen grove context (device/viewport-bucket/effectiveType) — geen fingerprint/PII.
- Bescherming = size-cap + strikt schema + client sample-rate; bewust GEEN DB-per-IP-rate-limit op het hot path (edge/WAF is de plek voor flood-bescherming — expliciete config-afhankelijkheid vóór livegang).
- Config (endpoint, sample-rate, metric-set) in lib/web-vitals/config.ts.
- Internal observability: NIET in ArchiMate-topologie/HLD/Berekeningen; alleen ERD (gescand).

## Gevolgen

- Eigen kruisbare RUM-historie incl. pre-auth.
- Least-privilege (RLS dicht, geen anon-insert).
- Publiek schrijf-endpoint = extra (gemitigeerd) aanvalsoppervlak.
- High-write tabel → retentie/opschoon-job is een follow-up (nog geen job).
- Bewuste afwijking van `ai_token_usage`: geen own-select-policy.
