# AVG-bewaartermijnen (retentiebeleid)

Vastgelegd 2026-07-21 (Arch F3, ADR 0059). Grondslag: "niet langer bewaren dan
noodzakelijk". De termijnen zijn de **single source** `lib/retention.ts`; de
dagelijkse cron `GET /api/cron/retention` handhaaft ze.

| Tabel | Termijn | Grondslag / reden | Handhaving |
|---|---|---|---|
| `error_logs` | 12 mnd | Operationele foutdiagnose | `created_at`-cutoff (retentie-cron) |
| `mail_log` | 12 mnd | E-mail-deliverability/verzendlog | `created_at`-cutoff |
| `job_runs` | 6 mnd | Cron/job-historie (/beheer/jobs) | `created_at`-cutoff |
| `contract_events` | 24 mnd | Abonnement-/consent-events (deels consent-bewijs) | `created_at`-cutoff |
| `ai_token_usage` | 24 mnd | Kosten/facturatie-analyse | `created_at`-cutoff |
| `ai_usage` | 24 mnd | Legacy kosten-analyse | `created_at`-cutoff |
| `lead_intakes` | 90 dgn | Anonieme funnel-intake (ADR 0022) | `purge_expired_lead_intakes()` (expires_at) |
| `web_vitals` | 180 dgn | RUM-telemetrie | Aparte cron `/api/web-vitals/retention/cron` |

## Wissing bij accountverwijdering vs. reset

- **Full account-delete** (AVG-wissing): álle persoonlijke tabellen + de retentie-/
  log-tabellen worden per gebruiker gewist (`deleteAllUserData(..., { service,
  fullErase: true })`), gevolgd door `auth.admin.deleteUser`. FK `ON DELETE
  CASCADE`/`SET NULL` (migratie `20260721140000`) is het DB-vangnet.
- **Reset** (opnieuw beginnen): persoonlijke/financiële data wordt gewist; de
  operationele/log-tabellen (`RETENTION_ALLOWLIST`) blijven staan en verlopen via
  de retentie-cron.

## Huishouden-anonimisering

Onderlinge verrekeningen (`settlement_entries`) van een verwijderde gebruiker
worden **geanonimiseerd** (`from/to_user_id → NULL`), niet hard verwijderd: het
bedrag blijft voor het grootboek van de achterblijvende partner, de identifier
van de vertrokkene verdwijnt.

## Onderhoud

De verzameling user-scoped tabellen wordt bewaakt door
`lib/user-data-tables.test.ts`: voeg je een tabel met `user_id` toe, deel 'm dan
in (wissen of bewaren) — anders faalt de test. Zie `lib/user-data-tables.ts`.
