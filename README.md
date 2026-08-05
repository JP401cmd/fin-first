# TriFinity

TriFinity is een Nederlandstalige personal-finance-app rond het idee **"Geld is
opgeslagen tijd"** — het vertaalt financiële cijfers (vermogen, budget, schulden,
belasting, FIRE) naar *vrijheidstijd*: dagen, maanden en jaren van financiële
onafhankelijkheid.

## Stack

- **Frontend:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4
- **Backend:** Next.js route handlers (`app/api/*`) · Supabase / PostgreSQL 17 (RLS als beveiligingsgrens)
- **Auth:** Supabase Auth (e-mail/wachtwoord + JWT)
- **AI:** Vercel AI SDK, multi-provider (Anthropic standaard, ook OpenAI/Mistral/Ollama)

## Vereisten

- **Node.js 24** (zie `.nvmrc`; ook de runtime op Vercel) en npm
- **Supabase CLI** (`npx supabase …` werkt zonder globale install)
- Een **Supabase-project** (cloud) *of* een lokale stack via `npx supabase start` (vereist Docker)

## Opzetten (van kloon tot draaiende app)

### 1. Installeren

```bash
git clone <repo-url> fin
cd fin
npm install
```

`postinstall` en `predev` kopiëren automatisch de benodigde assets (pdf.js-worker,
LiteRT-wasm) naar `public/` — daar hoef je niks voor te doen.

### 2. Omgevingsvariabelen

```bash
cp env.example .env.local
```

Vul `.env.local` in. Zie `env.example` voor de volledige, gedocumenteerde lijst
en waar je elke sleutel vandaan haalt. Het minimum om lokaal te draaien:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API)
- `ANTHROPIC_API_KEY` (voor de AI-functies)
- `ENCRYPTION_KEY_V1` en `IBAN_INDEX_KEY_V1` (twee verschillende hex-sleutels van 32 bytes)

De hex-sleutels genereer je met:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Database (migraties)

De 150+ migraties staan in `supabase/migrations/`.

**Tegen een cloud-project:**

```bash
npx supabase link --project-ref <project-ref>
npm run db:push        # = supabase db push (past migraties toe op remote)
```

**Volledig lokaal (Docker):**

```bash
npx supabase start
npx supabase db reset  # bouwt een verse lokale DB op uit de migraties
```

Handige db-scripts: `npm run db:status` (migratielijst), `npm run db:diff`
(schemadrift), `npm run db:new <naam>` (nieuwe migratie), `npm run db:pull`.

### 4. Seed / testdata

- **Prefab-rekenhulpen** (o.a. voorgeconfigureerde referentiedata) worden via een
  gecommitte migratie geladen — je krijgt ze dus vanzelf mee met de migraties.
  Opnieuw genereren kan met: `npx tsx scripts/generate-prefab-seed-sql.ts`.
- **Testaccount:** maak een account aan via de gewone signup in de app, óf gebruik
  `/api/dev-login` (alleen actief wanneer `NODE_ENV !== 'production'`).

> Let op: `supabase/config.toml` verwijst naar een `seed.sql` die (bewust) niet
> bestaat — er is géén los seed-bestand; seeding loopt via de migraties hierboven.

### 5. Starten

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Supabase-config (auth-providers, SMTP) — optioneel

`supabase/config.toml` bevat de configuratie voor auth (Google/Apple-login),
uitgaande auth-mail (SMTP) en storage. Geheimen daarin lopen via `env()`-substitutie
en horen **niet** in `.env.local` (dat is de Next.js-runtime), maar in de omgeving
waarin je `npx supabase config push` draait — bijv. `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`,
`SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`, `RESEND_SMTP_PASS`. Voor een standaard
lokale dev-omgeving zijn deze niet nodig.

## Handige scripts

| Script | Doel |
| --- | --- |
| `npm run dev` | Dev-server (Next.js) |
| `npm run build` | Productie-build (incl. service worker via Serwist) |
| `npm run lint` | ESLint |
| `npm run test` / `npm run test:run` | Vitest (watch / eenmalig) |
| `npm run test:e2e` | Playwright end-to-end-tests |
| `npm run arch:diagram` | Regenereert de zelf-documenterende architectuurplaat (`/beheer/architectuur`) |
| `npm run arch:check` | Faalt als de architectuurdata verouderd is |
| `npm run check:client-reads` | Lint-gate: geen directe client-reads van weergavedata |
| `npm run db:push` / `db:status` / `db:diff` / `db:new` / `db:pull` | Supabase-migraties |

## Architectuur

De app documenteert zichzelf: `/beheer/architectuur` heeft vier views (Praatplaat,
ArchiMate, Database/ERD, Berekeningen). De curatie staat in `lib/architecture/*`
en wordt gevoed door `npm run arch:diagram`. Zie `CLAUDE.md` voor de conventies die
deze documentatie in sync houden met de code.
