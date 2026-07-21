# Field-Level Encryptie — PR1 Status & Handoff

> ⚠️ **HISTORISCH / HANDOFF-AFGEROND** — de "je kunt deze PR nog mergen"-framing
> hieronder is achterhaald. De PR1-code **is** gemerged (commit `3532e91eb` —
> *"feat: field-level encryption infra + onboarding self-healing restore"*) en de
> migration `supabase/migrations/20260408000001_encrypt_bank_credentials.sql`
> staat in git. De 8 handmatige stappen en de PR2-checklist blijven bruikbaar als
> **ops-runbook voor activatie** (env-keys zetten, migration op remote toepassen,
> backfill, plaintext-drop), maar die ops-feiten zijn **niet uit de repo te
> verifiëren** — bevestig ze apart. Lees dit doc dus als activatie-runbook, niet
> als open merge-verzoek.

**Datum:** 2026-04-07 (code) · statusregel bijgewerkt 2026-07-21
**Status:** Code **gemerged** (commit `3532e91eb`) + migration in git
(`20260408000001_encrypt_bank_credentials.sql`). Env-keys / migration-op-remote /
PR2 (plaintext-kolommen droppen) = losse **OPS-status**, apart te verifiëren —
niet uit de repo af te lezen, dus hier bewust niet als "gedaan" geclaimd.
**Volledig plan:** `C:\Users\janpa\.claude\plans\groovy-wondering-peacock.md`

## TL;DR voor jou (de relevante beslissing nu)

Voor de testfase heb je bank-connect niet nodig. Daarom:

**Je kunt deze PR mergen zonder ook maar één van de 8 handmatige stappen te doen.** Niets breekt. Alle encryptie-code zit veilig in de codebase, draait niet aan, en wacht tot je hem activeert wanneer bank-connect wel relevant wordt (na de testfase).

Zie sectie [Mergen zonder bank-connect activatie](#mergen-zonder-bank-connect-activatie) hieronder voor de garanties en de ene regel die je in acht moet nemen.

## Doel (kort)

TrueLayer access/refresh tokens en IBANs versleutelen in `bank_connections`, `bank_accounts`, `bank_connection_accounts`, `assets` zodat een DB-dump waardeloos is voor het bank-toegang-deel. **Threat model:** DB-dump leak, SQL-injectie op die kolommen, operator/dev met alleen DB-toegang. **Niet** afgedekt: volledige server-compromise (key in Vercel env).

Geen UX-, AI- of berekeningsimpact in PR1. Volledige E2EE is een latere fase, niet hier.

## Wat is er gebouwd (in working tree, niet gecommit)

### Nieuwe files
- `lib/crypto/field-encryption.ts`
  - `encryptField(plaintext): string | null` — AES-256-GCM, output `v1:<base64(iv ‖ tag ‖ ciphertext)>`
  - `decryptField(ciphertext): string | null` — accepteert `v1:` prefix, throws op onbekend
  - `blindIndex(value): string` — HMAC-SHA256 met IBAN-normalisatie (lowercase, strip whitespace)
  - `isFieldEncryptionConfigured(): boolean` — voor opt-in code paths (gebruikt in seed-persona)
  - Lazy key load uit `process.env.ENCRYPTION_KEY_V1` en `process.env.IBAN_INDEX_KEY_V1`
- `lib/crypto/field-encryption.test.ts` — 20 unit tests, allemaal groen
- `supabase/migrations/20260408000001_encrypt_bank_credentials.sql` — additieve migration met `IF NOT EXISTS`, **geen** DROP COLUMN
- `scripts/encrypt-existing-bank-credentials.mjs` — backfill script (idempotent, batched, alleen `asset_type = 'cash'`)
- `env.example` — nieuwe entries `ENCRYPTION_KEY_V1` en `IBAN_INDEX_KEY_V1` met generatie-instructie

### Gewijzigde files
- `app/api/bank-connect/callback/route.ts` — dual-write tokens, blind-index lookup voor IBAN matching, dual-write IBAN/account_number op alle insert/update sites
- `app/api/bank-connect/sync/route.ts` — dual-read tokens (`decryptField(...) ?? plaintext`), dual-write na refresh
- `app/api/bank-connect/balances/route.ts` — idem
- `app/api/bank-connect/auth-link/route.ts` — schrijft `encryptField('')` als placeholder voor pending row
- `lib/seed-persona.ts` — opt-in encrypt via `isFieldEncryptionConfigured()` zodat dev-DB zonder keys niet breekt
- `lib/regression-tests/suites/security-privacy.ts` — 2 nieuwe checks (token round-trip + blind index stability)

### Belangrijk: dual-write + dual-read in dezelfde PR
Het oorspronkelijke plan beschreef fasen 4 en 6 apart (eerst dual-write, dan switchen). In PR1 zijn die gecollapsed: elke route schrijft naar **beide** kolommen én leest met prefer-encrypted-fallback-plaintext. Dat klopt — anders zou de tussenliggende staat nooit shippen.

## Verificatiestatus

| Check | Resultaat |
|---|---|
| `npx tsc --noEmit` | 0 nieuwe errors in scope |
| Lint op gewijzigde files | 0 nieuwe warnings |
| `field-encryption.test.ts` | 20/20 groen |
| Volledige vitest run | 1190 passing (was 1151), 16 failing (was 17). Alle failures in onverwante files |

## Mergen zonder bank-connect activatie

**Conclusie:** als je bank-connect niet gebruikt tijdens de testfase, kun je PR1 mergen + deployen zonder env-keys, zonder migration en zonder backfill. Niets breekt. Hieronder waarom, en de ene regel die je in acht moet nemen.

### Waarom het veilig is

De nieuwe encryptie-code wordt alleen geladen door 4 specifieke code paths, en die zijn allemaal of (a) niet aanwezig in de testfase of (b) inert zonder env-keys:

1. **De 4 bank-connect API routes** (`callback`, `sync`, `balances`, `auth-link`) — roepen `encryptField`/`decryptField`/`blindIndex` onvoorwaardelijk aan en zouden crashen zonder env-keys. Maar: ze worden alleen getriggerd via expliciete user-flow (zie cron-audit hieronder). Als jij bank-connect niet gebruikt, raken ze nooit aan.

2. **`lib/seed-persona.ts`** — gebruikt `isFieldEncryptionConfigured()` als gate. Zonder env-keys returnt die `false`, waarna de helper functies een leeg object spreaden. De seed-insert schrijft dan alleen de oude kolommen → geen "column does not exist" errors. Werkt onafhankelijk van of de migration is toegepast. Zie diff in `lib/seed-persona.ts:271-282`.

3. **`lib/regression-tests/suites/security-privacy.ts`** — de twee nieuwe tests injecteren hun eigen test-keys via `process.env` manipulation in een try/finally, en testen alleen het in-memory crypto-pad. Geen DB schema dependency. Werkt in CI zonder env of migration.

4. **`lib/crypto/field-encryption.test.ts`** — pure unit tests, in-memory, draaien in CI zonder enige externe afhankelijkheid.

De rest van de app (dashboard, FIRE, identity, onboarding, news, briefing, AI, asset/debt/transaction CRUD, household, life events, alles) importeert `lib/crypto/field-encryption.ts` nergens. Module wordt dus niet geladen → de lazy `loadKeyFromEnv` wordt nooit getriggerd → geen "missing env var" errors.

### Cron-audit: geen automatische callers gevonden

Doorzocht op alle plekken waar `/api/bank-connect/sync` of `/api/bank-connect/balances` automatisch zou kunnen worden aangeroepen:

| Bron | Resultaat |
|---|---|
| `vercel.json` crons | 3 jobs gevonden (`holdings/refresh-prices/cron`, `snapshots/cron`, `news-ingest/cron`) — **geen** raakt bank-connect |
| `.github/workflows/` | Directory bestaat niet → geen GitHub Actions cron |
| `supabase/functions/` | Directory bestaat niet → geen Supabase Edge Functions cron |
| `setInterval` / `setTimeout` op bank-connect endpoints | Niet gevonden |
| Middleware op bank-connect routes | Niet gevonden |
| Postgres triggers die HTTP-calls doen | Niet gevonden (de twee `auto_link_bank_account_asset` triggers doen alleen SQL, geen HTTP) |
| Code-references naar `/api/bank-connect/sync` | 2 plekken, beide user-triggered: `components/app/bank-connect/connected-account-card.tsx:50` (sync-knop in UI) en `app/(app)/core/cash/connect/success/page.tsx:45` (`handleSync` button-onClick na succesvolle koppeling) |
| Code-references naar `/api/bank-connect/balances` | Geen externe callers gevonden |
| Regression test suites (`kern-bank-connect-flow`, `bank-connectie-flow`) | Geregistreerd in `lib/regression-tests/test-registry.ts` maar **niet op een schedule** — alleen on-demand via `/api/regression/*` routes die jij handmatig triggert vanuit de regression UI |

**Conclusie:** zolang jij niet handmatig op de "Synchroniseer"-knop drukt of een regression run met de bank-connect categorie start, worden de endpoints niet aangeroepen. Geen verborgen automation.

### De ene regel: alles of niets

Het enige scenario waarin je code kapot maakt zonder bank-connect te gebruiken:

> **Zet de env-keys NIET zonder ook de migration toe te passen.**

Reden: zodra `ENCRYPTION_KEY_V1` en `IBAN_INDEX_KEY_V1` in de env staan, returnt `isFieldEncryptionConfigured()` true. Dat betekent dat seed-persona de nieuwe `iban_encrypted`, `iban_hash`, `account_number_encrypted`, `account_number_hash` kolommen probeert te schrijven. Als de migration niet is toegepast → `column "iban_encrypted" does not exist` op de eerstvolgende tester-seed → kapotte testfase.

Veilige combinaties:

| Env-keys | Migration | seed-persona | bank-connect (als je het ooit aanroept) | Gebruiksgeval |
|---|---|---|---|---|
| ❌ | ❌ | ✅ werkt | ❌ throws | **De testfase nu** |
| ❌ | ✅ | ✅ werkt | ❌ throws | OK maar zinloos — encryptie inert |
| ✅ | ✅ | ✅ werkt + encrypts | ✅ werkt | Volledige activatie (na testfase) |
| ✅ | ❌ | ❌ throws op insert | ❌ throws op SQL | **Vermijden** |

### Wanneer je bank-connect WEL wil aanzetten (post-testfase)

Doe dan in één keer alle stappen uit [Wat JIJ nog moet doen vóór PR1 in productie kan](#wat-jij-nog-moet-doen-vóór-pr1-in-productie-kan) hieronder. Volgorde:

1. Genereer beide keys (lokaal, één commando)
2. Backup beide keys in 1Password
3. Apply de migration in Supabase
4. Zet beide keys in Vercel env (preview + prod)
5. Run de backfill voor bestaande rijen (alleen relevant als je vóór die tijd al test-bank-connections in prod hebt staan — voor een verse activatie kan dit overgeslagen worden)
6. Smoketest met sandbox-bank
7. Monitor errors een week
8. Pas dan PR2 voorbereiden

## Wat JIJ nog moet doen vóór PR1 in productie kan

In deze volgorde:

1. **Genereer twee 32-byte hex keys** (apart per env aanbevolen):
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Eén voor `ENCRYPTION_KEY_V1`, één voor `IBAN_INDEX_KEY_V1`.

2. **Backup beide prod-keys** in 1Password / Bitwarden. **Verlies van prod `ENCRYPTION_KEY_V1` = permanent verlies van alle versleutelde bank-tokens.** Geen recovery mogelijk.

3. **Zet de keys in Vercel** voor preview én production environments.

4. **Voeg dezelfde keys toe aan `.env.local`** voor lokale tests.

5. **Apply de migration**:
   - Via Supabase SQL editor: paste de inhoud van `supabase/migrations/20260408000001_encrypt_bank_credentials.sql`
   - Of via CLI als jullie `db:push` workflow hebben

6. **Run het backfill script** lokaal tegen prod, met env vars gezet (`ENCRYPTION_KEY_V1`, `IBAN_INDEX_KEY_V1`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`):
   ```
   node scripts/encrypt-existing-bank-credentials.mjs
   ```
   Verwacht output zoals `bank_connections: encrypted X of X considered`.

7. **Smoketest in non-prod** vóór je traffic op prod toelaat:
   - Connect een nieuwe (sandbox) bank → check `bank_connections.access_token_encrypted IS NOT NULL` en begint met `v1:`, `bank_accounts.iban_hash` is 64-char hex
   - Run sync → moet transacties teruggeven (bewijst decrypt-pad werkt)
   - Run balance fetch → idem
   - Reconnect dezelfde IBAN → bestaande `bank_accounts` rij moet hergebruikt worden (bewijst blind-index werkt)

8. **Wacht ≥ 1 week** met productie-monitoring vóór je PR2 voorbereidt. Check op decrypt-errors in logs.

## PR2 — TODO (NIET nu doen)

Pas voorbereiden ná ≥ 1 week succesvolle PR1 in prod. Drie zaken die geblokkeerd zijn op refactor vóór de plaintext-kolommen gedropt kunnen worden:

### Blocker 1: Postgres trigger leest plaintext
- File: `supabase/migrations/20260407000001_create_auto_link_bank_account_asset_trigger.sql`
- Functie `fn_auto_link_bank_account_asset()` kopieert `NEW.iban` → `assets.account_number` (plaintext-kolom) bij elke `bank_accounts` insert
- **Optie A:** Trigger droppen, cash-asset insert verplaatsen naar de API-route (`callback/route.ts` doet het al voor nieuwe accounts; trigger is voor de auto-link-flow)
- **Optie B:** Trigger herschrijven om óók `account_number_encrypted` en `_hash` te zetten — vereist dat de Postgres-functie de encryptie kan doen, wat realistisch alleen kan met `pgcrypto` + key in DB → defeats the purpose. Dus optie A is de juiste.

### Blocker 2: Client-side IBAN writes
Browser kan onze Node-only crypto helpers niet draaien. Deze plekken moeten via een API-route gaan vóór de drop:
- `components/app/cash-account-view.tsx:824` — `supabase.from('bank_accounts').insert(...)` met IBAN
- `components/app/cash-account-view.tsx:868` — `supabase.from('bank_accounts').update(...)` met IBAN
- `components/core/assets-client.tsx:2463` — idem
- `components/core/assets-client.tsx:2475` — idem

Aanpak: nieuwe `app/api/bank-accounts/route.ts` (POST + PATCH) die server-side encrypt+blind-index doet. Components callen deze ipv direct Supabase.

### Blocker 3: Drop-plaintext migration
- File: `supabase/migrations/20260415000001_drop_plaintext_bank_credentials.sql` — **bestaat nog niet, NIET nu maken**
- Drops: `bank_connections.access_token`, `bank_connections.refresh_token`, `bank_accounts.iban`, `bank_connection_accounts.iban`, `assets.account_number`
- Pas mergen ná Blocker 1 + 2 + ≥ 1 week PR1 stabiel + bevestiging dat backfill volledig is (`SELECT count(*) WHERE *_encrypted IS NULL` op alle target-kolommen → 0)

### Code cleanup na PR2
Na de drop kunnen alle dual-write/dual-read fallback paden weg uit de 4 bank-connect routes en uit `seed-persona.ts`. `isFieldEncryptionConfigured()` mag dan ook weg of veranderen in een hard requirement.

## Andere uitgestelde items (uit PR1 plan, blijven uitgesteld)

Deze hebben **geen relatie** met de encryptie zelf maar zijn opgemerkt en moeten apart:

- **`bank_connections` tabel staat niet in `supabase/migrations/`** — die is op een eerder moment direct in Supabase aangemaakt. Voor encryptie niet blokkerend (`ALTER TABLE` werkt op de live tabel), maar een nieuwe omgeving kan niet vanaf scratch worden opgezet. Apart issue: `pg_dump --schema-only` en als baseline-migration toevoegen.
- **TrueLayer `client_id` / `client_secret` in `app_settings`** — die horen sowieso in env-vars, niet in DB. Aparte cleanup.
- **Hybride E2EE voor transactie-bedragen, omschrijvingen, life events, notities** — fase 2 als jullie verder willen met E2EE. Eigen plan.
- **AI-data-pad** — al sterk via `lib/ai/sanitize.ts`, geen wijziging nodig.
- **Key rotation / KMS / HSM** — volgende fase als sleutel-in-env onvoldoende blijkt.

## Hoe je hier verder mee gaat

1. Lees dit bestand
2. Lees `C:\Users\janpa\.claude\plans\groovy-wondering-peacock.md` voor het oorspronkelijke plan met threat model en alle context
3. `git status` om de PR1-wijzigingen te zien (allemaal in working tree, niet gecommit)
4. Kies: doorgaan met de 8 manual steps hierboven, of eerst de wijzigingen reviewen / aanpassen
5. Als je verder wil met PR2: begin met Blocker 1 + 2 vóór je überhaupt PR1 mergt — dan kunnen ze in dezelfde release
