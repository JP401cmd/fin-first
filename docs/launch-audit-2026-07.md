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
| **C / AC3** | E2e-smoke kernreizen op vers account | chrome-devtools MCP / playwright | ⏳-menselijk | **Bijgewerkt 2026-09-03.** Stapsgewijs uitvoeringsplan (met verwachte uitkomst per stap) klaar: `docs/smoke/2026-09-03-plan-vers-account.md`. **Correctie**: de eerder goedgekeurde snelkoppeling (account via `/api/admin/test-users/create`) blijkt bij broncode-verificatie de vijf publieke `@test.trifinity.nl`-testaccounts te (her)gebruiken met een hardcoded gedeeld wachtwoord — geen "vers" account, en exact het manco dat deze audit uitsluit. Vervolg ligt bij de eigenaar (wachten op SMTP voor een echte `/signup`-run, een nieuwe smalle admin-route voor één opgegeven adres, of de eigenaar voert de live-run zelf uit). De reload-tijdens-onboarding-regressie is al **statisch** gedekt en groen (`draft-restore-race.test.tsx` + `no-placeholder-assets.test.ts`, 16/16 tests). Nog geen live run tegen productie uitgevoerd — rij blijft ⏳. |
| **D / AC4** | Lighthouse landing / `/overzicht` / `/toekomst` | Lighthouse 13.4.1 CLI (lokale prod-build) | ✅-publiek / ⏳-ingelogd | **Bijgewerkt 2026-08-11.** Alle 7 publieke pagina's + landing desktop gemeten: **A11y 100 overal** (was 93–96) en **SEO 100** — op de bewuste `/login` 63 na (`robots.txt` `Disallow: /login`). Best practices 96 door één resterende audit `errors-in-console`, nog uitsluitend het localhost-artefact `/_vercel/speed-insights/script.js` (404); op Vercel hoort dat 100 te zijn. De vier a11y-bevindingen van juli (`color-contrast` op `--ink-4`, naamloze progressbar, `heading-order`, ontbrekende `<main>`) zijn gefixt. **Performance is bewust niet als drempel gebruikt**: twee runs van dezelfde dag verschilden 10–14 punten bij minder bytes en gelijke machine — localhost-lab is hiervoor niet betrouwbaar, dit hoort tegen productie + RUM (`web_vitals`, ADR 0063). Volledig verslag: `docs/lighthouse/2026-08-11-publieke-paginas.md`. `/overzicht` en `/toekomst` blijven open — vereisen geseed ingelogd account. |
| **E** | `error_logs` bestaat + RLS | supabase `execute_sql` | ✅ | Tabel bestaat, 8 kolommen, RLS aan, 2 policies. |
| **E** | `mail_log` bestaat + RLS | supabase `execute_sql` | ✅ | Tabel bestaat, 7 kolommen, RLS aan, 2 policies. |
| **E** | `job_runs` bestaat + RLS | supabase `execute_sql` | ✅ | Tabel bestaat, RLS aan, 1 policy. |
| **E** | Server-side foutlogging bedraad | Grep `logError`-callers | ⚠️ | **`lib/log-error.ts#logError` heeft NUL callers** → server-side 500's belanden níet in `error_logs`. Client-side capture is wél end-to-end bedraad (`components/app/error-reporter.tsx` in `app/(app)/layout.tsx` → `/api/log-error`). Silent-fail-risico: besluit vóór launch of server-side logging alsnog bedraad wordt. |
| **E** | Crons enabled + `CRON_SECRET`/env in Vercel | Vercel-dashboard | ⏳-menselijk | Niet vanuit code verifieerbaar; 3 crons + integraties-health-piggyback. |
| **E** | Auth-mail/SMTP productieklaar | Supabase hosted dashboard | ⏳-menselijk | **Grootste launch-risico.** *Bijgewerkt 2026-09-03:* de repo-kant is klaar — `supabase/config.toml` draagt `enable_confirmations=true`, rate-limit 30/uur, de redirect-lijst mét `fin-first.vercel.app` en de productie-SMTP (Resend) als `[remotes.production]`-override met `env(RESEND_SMTP_PASS)`; `env.example` en het runbook (E-mail → klikpad) beschrijven de handelingen. **Open (eigenaar, change-request):** Resend-domeinverificatie, API-keys, Supabase custom SMTP + rate-limit + URL-config, Vercel-env — volgorde en bewijs in `docs/beheerders-runbook.md` → "Auth-mail productieklaar maken". Live draait tot dan de ingebouwde dienst (2/uur). Besluit eigenaar 2 sep: eerst op `fin-first.vercel.app`, cutover naar `trifinity.app` later. |

---

## Wat menselijk / niet-nu-automatiseerbaar blijft (⏳)

1. **V1 — Keyrotatie** (AI-/TrueLayer-keys) in provider- + Vercel/Supabase-dashboards. Blokkerend: de sweep hoort de *eindtoestand* na rotatie te toetsen.
2. **E2e-smoke** op een vers geseed account (dev-server + auth + `persona:compleet`-seed).
3. ~~**Lighthouse** op landing (mobiel + desktop)~~ — **gedaan 2026-08-11**, zie D/AC4. Rest: `/overzicht` en `/toekomst` (geseed ingelogd account) én een herhaling tegen productie zodra `trifinity.app` gekoppeld is.
4. **Auth-mail/SMTP-productieconfig** + echte reset-mail-ontvangst.
5. **Vercel-cronstatus** (enabled + env-vars + 4 groene job-kaarten na eerste deploy).
6. **82 in-app regressiesuites** via de UI (geen headless-pad).
7. **Go/no-go-beslissing zelf.**

---

## Restpunten / kandidaat-kaarten (gebruiker beslist — géén kaarten aangemaakt)

- **[P1] Server-side foutlogging bedraden**: `logError` van callers voorzien in de belangrijke API-routes, anders zijn 500's onzichtbaar in `/beheer`.
- **[P2] Auth-mail/SMTP-hardening**: custom SMTP, `site_url`, redirect-URLs, `enable_confirmations` in hosted Supabase; reset-flow end-to-end testen. *(3 sep 2026: repo-kant gedaan; console-acties open — zie rij E.)*
- **[P2] Leaked-password-protection aanzetten** (HaveIBeenPwned) in Supabase Auth. *(Native toggle is Pro-only; op Free dekt ADR 0057 het UI-grade. Alleen aanzetten bij een Pro-upgrade.)*
- **[P3] Advisor-opschoning**: `search_path` fixen op 3 functies; heroverweeg `EXECUTE`-grants op de `security_definer`-RPC's die door `anon` aanroepbaar zijn (`is_superadmin`, `propose_budget_model`, `resolve_budget_model_proposal`, `user_household_id`, `user_owned_household_id`); `guide-help`-bucket listing-policy inperken.
- **[P3] Performance-advisors** als nulmeting draaien vóór launch.
- **[P3] Werkboom opruimen**: UAT-acceptance-werk committen/shippen + `.autoforge/*.bak-20260704`-back-ups verwijderen, zodat de launch-ref schoon is.
