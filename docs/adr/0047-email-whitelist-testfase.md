---
id: 0047-email-whitelist-testfase
title: Registratie-allowlist voor besloten testfase via before_user_created auth-hook
status: aanvaard
date: 2026-07-17
elements: [t-supabase, app-comp]
---

Tijdens de besloten testfase mag alleen wie is uitgenodigd een account aanmaken.
Elke nieuwe registratie (e-mail/wachtwoord én Google-OAuth) wordt geweigerd tenzij
het genormaliseerde adres (`lower(trim(email))`, exacte match) op `public.signup_email_allowlist`
staat. Bestaande accounts, admin-aangemaakte testgebruikers en seed-migraties blijven
ongemoeid. Afgedwongen op GoTrue-niveau met de Supabase **`before_user_created`**-auth-hook
(Postgres-functie), niet met een `BEFORE INSERT`-trigger op `auth.users`.

## Context

- **Doel (features #879 + #880):** een harde poort op accountaanmaak voor een besloten
  testfase, met een nette NL-melding op `/signup` en `/login`, geen enumeratie-lek, en
  een superadmin-beheer-UI met audit-log. De poort moet later **zonder migratieteruggraaf**
  weer uit kunnen.
- **Randvoorwaarden:**
  1. Weiger e-mail/wachtwoord- én Google-OAuth-signups voor niet-gelijste adressen.
  2. Bestaande accounts inloggen ongestoord.
  3. Admin-pad (`service.auth.admin.createUser`, testpersona's) blijft werken (AC6).
  4. Seed-migraties (directe `INSERT INTO auth.users` als `postgres`-rol) blijven werken (AC7).
  5. De allowlist-tabel is **niet client-leesbaar**.
  6. `supabase config push` is in dit project bewust verboden wegens drift
     (ADR 0045) — het mechanisme mag niet op config-push leunen.

Twee kandidaten zijn tegen de Supabase-docs geverifieerd.

### Optie A — `before_user_created`-auth-hook (gekozen)

Een `public.<fn>(event jsonb) returns jsonb`-functie die GoTrue **vóór** de insert aanroept.
Geverifieerd in de Supabase-docs (`auth/auth-hooks` + `auth/auth-hooks/before-user-created-hook`):

- **Vuurt voor e-mail- én OAuth-signups.** De docs tonen expliciet een "Block by OAuth
  Provider"-voorbeeld dat leest uit `event->'user'->'app_metadata'->>'provider'`; het
  e-mailpad heeft `provider: "email"`. Eén whitelist-check dekt beide paden.
- **Kan weigeren met eigen melding + status:** `return jsonb_build_object('error',
  jsonb_build_object('message', '…', 'http_code', 403))`. De docs: *"propagates the error
  message to the client that attempted signup."* Dus de melding komt bruikbaar bij de client.
- **Raakt directe SQL-inserts NIET.** De hook is een GoTrue-applicatiehook, geen DB-trigger;
  een `INSERT INTO auth.users` in een seed-migratie gaat niet door GoTrue en vuurt de hook
  dus niet. **AC7 is hiermee gratis geborgd.**
- **Aanzetten:** functie via migratie (repo-tracked); inschakelen via Dashboard →
  Authentication → Hooks op de hosted-omgeving (Free + Pro). Draait als `supabase_auth_admin`,
  in een transactie met een config-timeout.

### Optie B — `BEFORE INSERT`-trigger op `auth.users` (afgewezen)

Volledig in een migratie (geen dashboard-stap) — dat is de enige winst. Afgewezen omdat:

- **De foutmelding sneuvelt.** GoTrue vertaalt een trigger-`RAISE EXCEPTION` naar een
  generieke `"Database error saving new user"` (500). De client kan niet onderscheiden dat
  het de allowlist was — funest voor de nette NL-melding, en helemaal in de OAuth-callback
  waar we de reden niet kunnen inspecteren. Dit is de hoofdreden van afwijzing.
- **Hij vuurt óók voor seeds en admin-createUser** (beide inserts landen in `auth.users`):
  seed-SQL als `postgres`, admin-API als `supabase_auth_admin`. Dat vereist fragiele
  rol-exempties (`session_user`-checks) om AC6/AC7 overeind te houden.
- **Exit vereist een migratie** om de trigger te droppen → migratiechurn + risico op het
  drift-hek (ADR 0045). Optie A gaat uit met één dashboard-toggle.

### Hybride (precheck-API) — bewust uitgesteld

De hook levert de melding al bij `/signup` (submit) en `/login` (OAuth-callback). Een aparte
server-side precheck-route (instant inline-validatie vóór submit) voegt een tweede leespad op
de allowlist en een endpoint-oppervlak toe zonder de correctheid te verbeteren, en helpt het
OAuth-pad niet (het e-mailadres is pas ná Google bekend). Uitgesteld; optioneel later toe te
voegen als rate-limited service-role-route.

## Besluit

**Optie A: de `before_user_created`-hook is de enige harde poort.** Onderbouwing: het is het
mechanisme dat Supabase hiervoor levert, het dekt e-mail én OAuth in één check, het geeft een
propagerende eigen foutmelding (kernvereiste), het laat seeds en directe SQL met rust, en de
exit is één dashboard-toggle.

### Datamodel — `public.signup_email_allowlist`

| kolom | type | opmerking |
| --- | --- | --- |
| `id` | `uuid pk default gen_random_uuid()` | |
| `email_normalized` | `text not null unique` | match-sleutel = `lower(trim(email))` |
| `label` | `text` | notitie/wie/waarom |
| `created_by` | `uuid references auth.users(id) on delete set null` | provenance, geen ownership |
| `created_at` | `timestamptz not null default now()` | |

- **RLS aan, geen anon/authenticated-policy** → niet client-leesbaar (randvoorwaarde 5).
- **`grant select` + een `for select to supabase_auth_admin`-policy** zodat de hook de tabel
  mag lezen (de docs: *"alter your RLS policies to allow the `supabase_auth_admin` role"*).
- **Beheer leest/schrijft via `getServiceClient` (BYPASSRLS), conform ADR 0006** — geen
  brede authenticated-policy nodig.
- Domein-indeling: **platform/beheer-control-plane** (zoals `admin_actions_log` /
  `app_settings`), geen module-tabel.

### Hook-functie

`public.<fn>(event jsonb) returns jsonb`, eigenaar `postgres`, **geen** `security definer`,
draait als `supabase_auth_admin`. Logica: normaliseer `event->'user'->>'email'`; staat het op
`signup_email_allowlist` → `return '{}'::jsonb` (toestaan); anders → `error`-object met
`http_code 403` en een stabiele NL-sentinelmelding. Grants: `grant execute … to
supabase_auth_admin; revoke … from anon, authenticated, public`.

### Borging admin- en seed-paden (AC6/AC7)

- **Seed-SQL (AC7):** structureel geborgd — directe `INSERT INTO auth.users` omzeilt GoTrue,
  dus de hook vuurt niet. Geen actie nodig.
- **Admin-`createUser` (AC6):** de docs bevestigen niet of de hook hier vuurt. Ontworpen om
  dat moot te maken: de admin-testgebruikers-route (`app/api/admin/test-users/create`,
  service-role) **upsert elk `@test.trifinity.nl`-adres in de allowlist vóór aanmaak**; de
  initiële set wordt óók in de allowlist-migratie geseed. Vuurt de hook wél → whitelisted →
  toegestaan; vuurt hij niet → sowieso ongemoeid. Geen brede domein-carve-out in de hook
  (die zou publieke self-signup op het testdomein openzetten).
- **Vrijheidscheck (ADR 0022/0025) & household-invitations:** de uiteindelijke
  accountaanmaak valt óók onder de allowlist. Bewuste testfase-beperking: een
  Vrijheidscheck-completer of uitgenodigd huishoudlid moet op de lijst staan (admin zet 'm
  erop); niet auto-whitelisted in v1. De publieke intake zelf blijft werken.

### API-oppervlak

- `app/api/admin/signup-allowlist/route.ts` — GET (lijst), POST (toevoegen), DELETE
  (verwijderen op `id`). Superadmin-gate (`isSuperAdmin`), service-role (`getServiceClient`),
  zod via `parseBody`, `respond.ts`-helpers, en `logAdminAction` met nieuwe codes
  `allowlist.add` / `allowlist.remove`. Normaliseert het adres server-side identiek aan de hook.
- Precheck-route: bewust niet in v1.

### Foutpad-flow

- **`/signup` (e-mail):** `signUp()` geeft `{ error }` met de hook-melding. Een nieuwe tak in
  `lib/auth-errors.ts#translateAuthError` herkent de sentinel en geeft de NL-copy ("TriFinity
  is in besloten testfase — je adres staat nog niet op de uitnodigingslijst."). Ordening: de
  allowlist-weigering staat los van de anti-enumeratie-afhandeling; onder *gelijste* adressen
  blijft "al geregistreerd" identiek aan succes (ADR-loos bestaand gedrag) → geen
  account-enumeratie-lek. De allowlist-membership-signalering is bedoeld en is géén
  account-enumeratie.
- **`/login` (Google-OAuth):** in het PKCE-pad redirect GoTrue bij weigering naar
  `app/auth/callback` met `?error=…&error_description=<hook-melding>`. De bestaande
  `oauthError`-tak wordt verfijnd: bevat `error_description` de sentinel → redirect
  `/login?not_invited=1`; anders het huidige kale-`/login`-gedrag. Defensief wordt ook een
  eventuele `exchangeCodeForSession`-fout op dezelfde sentinel gecontroleerd. `/login` toont
  bij `not_invited=1` de besloten-testfase-banner (naast het bestaande `confirm_error=1`).

### Platen-impact

- **ERD:** de tabel verschijnt automatisch na `npm run arch:diagram` (scan).
- **ArchiMate:** géén nieuw topologie-element. De poort hoort bij het bestaande `t-supabase`
  (Supabase Auth); dit ADR hangt eraan via `elements`. Bewust geen nieuw element voor een
  tijdelijke maatregel (anders liegt de plaat na verwijdering).
- **HLD/Praatplaat & Berekeningen:** nee (beheer-intern, geen capability, geen rekenmotor).
- **Aandachtspunt:** wél één toevoegen op `t-supabase` — "registratie-allowlist actief
  (besloten testfase), moet vóór publieke lancering uit" — zodat de exit-verplichting op de
  plaat zichtbaar staat en automatisch verdwijnt zodra de poort uit is.

## Gevolgen

- **Positief:** één check dekt e-mail + OAuth; nette propagerende foutmelding; seeds en
  directe SQL onaangeroerd; exit = één dashboard-toggle; geen nieuw parallel auth-pad.
- **Concessie:** de *ingeschakelde staat* van de hook is een dashboard-stap (niet
  repo-config-tracked). De functie + tabel + seed zijn dat wél (migratie). `config.toml` houdt
  het `before_user_created`-blok bewust **uitgecommentarieerd** zodat een eventuele
  config-push de poort nooit toggelt. Lokale dev is standaard ongegate; de poort geldt op de
  hosted testfase-omgeving waar testers registreren.
- **Exit-strategie:** poort uit = hook uitzetten in Dashboard → Authentication → Hooks.
  Geen migratieteruggraaf, geen datamutatie. Tabel/functie/API blijven daarna inert; een
  latere opruimmigratie kan ze droppen. Zodra de poort uit is: het aandachtspunt verwijderen
  en dit ADR op `status: vervangen` zetten.
