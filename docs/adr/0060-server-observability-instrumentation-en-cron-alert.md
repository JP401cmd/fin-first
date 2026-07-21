---
status: accepted
date: 2026-07-21
elements: [t-platform, t-supabase, app-comp]
---

# 0060 — Server-observability: instrumentation.ts + onRequestError + global-error + cron-alert

## Context

De parallelle sessie (ADR 0056) landde CLIENT-observability (web-vitals/RUM). SERVER-observability had gaten: onafgevangen server-fouten (Server Components / Route Handlers / Server Actions die niet via `serverError()` lopen) landden alleen in Vercel-logs, een crash in de root `app/layout.tsx` viel terug op de blanco Next-default (route-segment `error.tsx` vangt die niet), en falende crons logden wél passief in `job_runs` (/beheer/jobs) maar duwden niets naar een beheerder. Vóór testers fouten gaan veroorzaken die niemand ziet, willen we lichte, proportionele server-observability — zonder nieuwe vendor.

## Besluit

- **Vendorkeuze = eigen infra, geen Sentry.** Consistent met de eigen-RUM-keuze (ADR 0056): hergebruik de bestaande `error_logs`-tabel + `logError()`, `job_runs` + `recordJobRun()`, en het Resend-mailtransport (`lib/email.ts`). Geen `@sentry/*`-dependency.
- **`instrumentation.ts` (root) met `register()` + `onRequestError`.** `register()` is bewust licht (no-op, gereserveerd). `onRequestError` persisteert onafgevangen server-fouten via `logError(getServiceClient(), …)` met grep-bare tag `onRequestError:<routeType>` → zichtbaar op /beheer/errors.
  - **Runtime-guard:** `onRequestError` draait ook op de edge-runtime; de service-role-client is een node-pad. De node-helper wordt daarom alleen dynamisch geladen als `NEXT_RUNTIME === 'nodejs'`. Best-effort, nooit throwen.
  - **Ruisfilter:** Next control-flow (`digest` `NEXT_REDIRECT` / `NEXT_NOT_FOUND` / `NEXT_HTTP_ERROR_FALLBACK`) wordt genegeerd.
  - **Persist-only, geen mail-per-request** (floodrisico); mail blijft voor crons.
  - Helper-logica staat in een sibling-module (`lib/observability/request-error.ts`), niet in `instrumentation.ts` — Next verbiedt niet-conventionele exports daaruit (71002) en de helper is zo unit-testbaar.
- **`app/global-error.tsx`** — de enige boundary die een root-layout-crash vangt; rendert eigen `<html>/<body>`, bewust self-contained met inline styles (geen provider-/Tailwind-garantie bij een layout-crash), filosofie-neutraal (geen module-accent), beacon naar `/api/log-error` (context `global-error`), toont `digest`.
- **Cron-alert (`lib/cron-alert.ts#alertCronFailure`)** — actieve admin-mail bij een HARDE cron-fout (`job_runs.status='error'`), aangehaakt in `recordJobRun`. Success-met-partiële-fouten (`status='success'` + fouttekst) alarmeert bewust NIET (geen dagelijkse ruis). Recipient uit `ALERT_EMAIL`/`OPS_EMAIL` (niet gezet → stille no-op). Per-taak dag-throttle (24u) via een `app_settings`-sleutel `cron_alert_last_<job>` tegen mailstorm. Alleen taak-label + fouttekst in de mail → geen PII.
- **Interne observability blijft buiten ArchiMate-topologie/HLD/Berekeningen** (precedent ADR 0056). Geen nieuwe tabel/FK → geen ERD-/`arch:diagram`-wijziging nodig.

## Gevolgen

- Onafgevangen server-fouten en layout-crashes worden nu vastgelegd i.p.v. verloren; falende crons pushen een melding.
- Geen nieuwe dependency; least-privilege (service-role node-only, RLS ongemoeid).
- **Prod-config-afhankelijkheden:** `RESEND_API_KEY` + `EMAIL_FROM` (al in gebruik) en een nieuw `ALERT_EMAIL`/`OPS_EMAIL`; de cron-alert vuurt pas als één daarvan gezet is. `CRON_SECRET` blijft het bestaande open infra-item.
- `global-error.tsx` rendert alleen in een productie-build (dev toont de Next-overlay); daarom self-contained getest via prod-build.
- Missed-run/staleness-detectie (cron draaide helemaal niet) is bewust buiten scope gelaten (optionele fase 2 als sweep/vlag op /beheer/jobs) om proportioneel te blijven.
