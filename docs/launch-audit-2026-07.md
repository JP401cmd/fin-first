# Launch-gereedheidscheck — go/no-go (juli 2026)

> **Voorlopig oordeel: NO-GO tot de menselijk-gated poorten (V1 keyrotatie, Auth-mail/SMTP-productieconfig, e2e-smoke op live account, Lighthouse) zijn afgerond.** De automatiseerbare poorten (AC1 code-kwaliteit + AC2 security-statisch + operationele tabellen) staan **groen** en vormen géén blocker.

Bron-ref van deze meting: `master` @ `8bc9acbe3` (julibatch geshipt). Datum meting: 2026-07-06.
Deze audit verving de kaart-aanname "417 dirty files (4 jul)" door de **feitelijke** werkboom-staat (zie V2).

---

## Werkboom-staat (V2 — correctie op het draaiboek)

De "417 dirty files" uit het draaiboek zijn achterhaald: de julibatch (Arch-F4 harness-removal, `ci.yml`, in-flight kaarten) is inmiddels naar `master` geshipt als commit `8bc9acbe3`. De huidige werkboom is **klein en coherent**:

- **9 gewijzigde bestanden**: UAT-acceptance-werk (`app/(app)/beheer/uat/*`, `lib/uat/acceptance/types.ts`, `lib/regression-tests/test-registry.ts`), aandachtspunten-loader (`lib/aandachtspunten*.ts` + tests), en `.claude/agents/senior-developer.md`.
- **Untracked**: nieuwe UAT-suites (`lib/uat/acceptance/{schuld,toek}*`, `lib/regression-tests/suites/uat-*`, `test/uat-*`), `app/api/admin/uat/latest/`, en drie `.autoforge/features.db*.bak-20260704` back-ups.
- **Géén horizon-kernel mid-migratie in de tree; `tsc` is schoon (exit 0).**

Dit is *niet* een schone/gecommitte staat, maar wel een reproduceerbare, klein-scope staat waartegen de audit betrouwbaar draait. De UAT-tree-wijzigingen zijn additief en breken tsc/vitest niet.

---

## Poorten A–E

| Poort | Criterium | Meetmethode | Status | Bewijs / bevinding |
|---|---|---|---|---|
| **A / AC1** | `tsc --noEmit` schoon | `npx tsc --noEmit` | ✅ | Exit 0, geen fouten. |
| **A / AC1** | Volledige vitest groen | `npm run test:run` | ✅ | **390 files pass / 2 skip (392)**; **5832 tests pass / 4 skip (5836)**; exit 0; duur ~248s. Inclusief horizon-kernel Excel-oracle-parity. |
| **A** | 82 in-app regressiesuites | `/beheer/regressietest` (UI, dev-server) | ⏳-menselijk | Geen headless-pad; vereist draaiende dev-server + `REGRESSION_TEST_*`-login. Niet in deze run gedraaid. |
| **B / AC2** | Dev/test-verificatieroutes weg uit prod | `find app` op `/test-*`, `/api/verify-*`, `/api/test-*` | ✅ | Harness-routes weg. Resterende `test-*` = legitieme admin-routes (`admin/test-users`, `admin/bank-connect/test-connection`), alle superadmin-guarded → 403. |
| **B / AC2** | `/api/regression/*` prod-onbereikbaar | Code-inspectie | ✅ | Beide routes (`run`, `categories`) hebben `NODE_ENV !== 'development'` → 403. |
| **B / AC2** | Geen secrets/JWT in diff | `git diff` regex-scan | ✅ | Geen `sk-ant`/`eyJ`/service-role-key/api-key in de werkboom-diff. |
| **B / AC2** | Supabase security-advisors | `mcp__supabase__get_advisors(security)` | ⚠️ | **Geen ERROR-level.** WARN/INFO: leaked-password-protection uit; `function_search_path_mutable` (3 functies); `security_definer`-functies anon/authed-callable (household/budget-helpers, bewust — ADR 0006-patroon); `error_logs`/`mail_log` INSERT `WITH CHECK (true)` (bewust: elke ingelogde mag loggen); public bucket `guide-help` listing; INFO `rls_enabled_no_policy` op `intake_rate_limit`, `lead_intakes`, `uat_results`, `uat_rounds` (RLS-aan-zonder-policy = deny-all voor non-service-role, bewust). Geen launch-blocker; wél opschoonlijst (zie restpunten). |
| **B / AC2** | Supabase performance-advisors | Niet gedraaid deze run | ⏳ | Aanbevolen vóór launch als nulmeting (geen blocker). |
| **C / AC3** | E2e-smoke kernreizen op vers account | chrome-devtools MCP / playwright | ⏳-menselijk | Vereist dev-server + seed (`POST /api/admin/seed {persona:compleet}`) + login (`daan@test.trifinity.nl`). Reis: `/onboarding` → `/core/cash/import` → `/overzicht` → `/toekomst` → `/berichten`. Niet nu gedraaid. |
| **D / AC4** | Lighthouse landing / `/overzicht` / `/toekomst` | chrome-devtools `lighthouse_audit` | ⚠️-deels | **Landing gemeten 2026-07-28** (lokale prod-build): desktop én mobiel **A11y 96 · Best Practices 96 · SEO 100**; failed audits: `errors-in-console`, `color-contrast` (rapporten in `docs/lighthouse/landing-*.html`). `/overzicht` en `/toekomst` nog open — vereisen geseed ingelogd account (performance via aparte trace). |
| **E** | `error_logs` bestaat + RLS | supabase `execute_sql` | ✅ | Tabel bestaat, 8 kolommen, RLS aan, 2 policies. |
| **E** | `mail_log` bestaat + RLS | supabase `execute_sql` | ✅ | Tabel bestaat, 7 kolommen, RLS aan, 2 policies. |
| **E** | `job_runs` bestaat + RLS | supabase `execute_sql` | ✅ | Tabel bestaat, RLS aan, 1 policy. |
| **E** | Server-side foutlogging bedraad | Grep `logError`-callers | ⚠️ | **`lib/log-error.ts#logError` heeft NUL callers** → server-side 500's belanden níet in `error_logs`. Client-side capture is wél end-to-end bedraad (`components/app/error-reporter.tsx` in `app/(app)/layout.tsx` → `/api/log-error`). Silent-fail-risico: besluit vóór launch of server-side logging alsnog bedraad wordt. |
| **E** | Crons enabled + `CRON_SECRET`/env in Vercel | Vercel-dashboard | ⏳-menselijk | Niet vanuit code verifieerbaar; 3 crons + integraties-health-piggyback. |
| **E** | Auth-mail/SMTP productieklaar | Supabase hosted dashboard | ⏳-menselijk | **Grootste launch-risico.** `config.toml` = default SMTP (2 mails/uur), `site_url=localhost`, `enable_confirmations=false`. Custom SMTP + `site_url` + redirect-URLs moeten in het hosted dashboard; reset-mail handmatig testen. |

---

## Wat menselijk / niet-nu-automatiseerbaar blijft (⏳)

1. **V1 — Keyrotatie** (AI-/TrueLayer-keys) in provider- + Vercel/Supabase-dashboards. Blokkerend: de sweep hoort de *eindtoestand* na rotatie te toetsen.
2. **E2e-smoke** op een vers geseed account (dev-server + auth + `persona:compleet`-seed).
3. **Lighthouse** op landing / `/overzicht` / `/toekomst` (mobiel + desktop), scores als nulmeting.
4. **Auth-mail/SMTP-productieconfig** + echte reset-mail-ontvangst.
5. **Vercel-cronstatus** (enabled + env-vars + 4 groene job-kaarten na eerste deploy).
6. **82 in-app regressiesuites** via de UI (geen headless-pad).
7. **Go/no-go-beslissing zelf.**

---

## Restpunten / kandidaat-kaarten (gebruiker beslist — géén kaarten aangemaakt)

- **[P1] Server-side foutlogging bedraden**: `logError` van callers voorzien in de belangrijke API-routes, anders zijn 500's onzichtbaar in `/beheer`.
- **[P2] Auth-mail/SMTP-hardening**: custom SMTP, `site_url`, redirect-URLs, `enable_confirmations` in hosted Supabase; reset-flow end-to-end testen.
- **[P2] Leaked-password-protection aanzetten** (HaveIBeenPwned) in Supabase Auth.
- **[P3] Advisor-opschoning**: `search_path` fixen op 3 functies; heroverweeg `EXECUTE`-grants op de `security_definer`-RPC's die door `anon` aanroepbaar zijn (`is_superadmin`, `propose_budget_model`, `resolve_budget_model_proposal`, `user_household_id`, `user_owned_household_id`); `guide-help`-bucket listing-policy inperken.
- **[P3] Performance-advisors** als nulmeting draaien vóór launch.
- **[P3] Werkboom opruimen**: UAT-acceptance-werk committen/shippen + `.autoforge/*.bak-20260704`-back-ups verwijderen, zodat de launch-ref schoon is.
