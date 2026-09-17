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
| bucket `user-report-screenshots` | 90 dgn | Schermafbeelding bij een melding — gevoeliger dan de tekst (kan saldi/namen tonen); triage gebeurt binnen dagen (ADR 0152) | `created_at` van het object (retentie-cron, `purgeUserScopedBuckets`); de melding zelf (`user_reports`) heeft geen termijn |
| `user_activity_days` / `user_activity_modules` | 400 dgn | Gebruiksdata zonder inhoud (ADR 0146/0147) | `day`-cutoff (retentie-cron) |
| `consent_events` | geen leeftijdspurge — zolang het account bestaat | AI-toestemmingsbewijs (ADR 0155): aantoonbaarheid art. 7 lid 1 AVG vereist dat élke keuze en omkering bewaard blijft zolang de verwerking kan plaatsvinden; behouden bij een data-reset (de keuze geldt voor het account, niet voor de cijfers) | `ON DELETE CASCADE` op `auth.users` bij accountverwijdering; eigen-rij SELECT (zelf-export), geen UPDATE/DELETE voor gebruikers |

## Wissing bij accountverwijdering vs. reset

- **Full account-delete** (AVG-wissing): álle persoonlijke tabellen + de retentie-/
  log-tabellen worden per gebruiker gewist (`deleteAllUserData(..., { service,
  fullErase: true })`), gevolgd door `auth.admin.deleteUser`. FK `ON DELETE
  CASCADE`/`SET NULL` (migratie `20260721140000`) is het DB-vangnet.
- **Reset** (opnieuw beginnen): persoonlijke/financiële data wordt gewist; de
  operationele/log-tabellen (`RETENTION_ALLOWLIST`) blijven staan en verlopen via
  de retentie-cron.

## Storage-buckets (geen FK-cascade)

`storage.objects` heeft geen foreign key naar `auth.users`; de cascade die bij
tabellen het vangnet is, bestaat voor buckets niet. Daarom (ADR 0152):

- **Wis:** `deleteAllUserData` wist als **eerste stap** de prefix `<user-id>/` in
  élke user-scoped bucket (`USER_SCOPED_BUCKETS` in `lib/user-data-buckets.ts`:
  `user-report-screenshots`, `pension-documents`) — bij reset én bij volledige
  verwijdering, via de service-client. Bewust **hard falend**: mislukt de wis,
  dan is er nog niets verwijderd en probeert de gebruiker het opnieuw.
- **Wezen:** de retentie-cron wist bovendien in élke user-scoped bucket de
  prefixen waarvan het account niet meer bestaat (vangnet voor uploads van vóór
  ADR 0152, een upload die tijdens de wis nog in-flight was, of een hersteld
  back-up-object). Bestaanscheck fail-closed: `profiles` (cascade) én
  bevestiging via `auth.admin.getUserById` — alleen een expliciet "niet
  gevonden" maakt een prefix tot wees.
- **Niet-persoonlijk:** `guide-help` bevat beheer-content per helpKey en valt
  buiten de wis (`NON_PERSONAL_BUCKETS`, met reden).
- **Dekking:** `lib/user-data-buckets.test.ts` scant migraties en code op
  bucket-id's; een nieuwe upload-bucket zonder indeling maakt de test rood.

## Huishouden-anonimisering

Onderlinge verrekeningen (`settlement_entries`) van een verwijderde gebruiker
worden **geanonimiseerd** (`from/to_user_id → NULL`), niet hard verwijderd: het
bedrag blijft voor het grootboek van de achterblijvende partner, de identifier
van de vertrokkene verdwijnt.

## Onderhoud

De verzameling user-scoped tabellen wordt bewaakt door
`lib/user-data-tables.test.ts`: voeg je een tabel met `user_id` toe, deel 'm dan
in (wissen of bewaren) — anders faalt de test. Zie `lib/user-data-tables.ts`.
