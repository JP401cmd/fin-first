---
id: 0187-api-v1-met-bearer
title: 'API v1 met Bearer: een native ingang naar de Krant, als de lezer onder RLS, met het contract als bron'
status: voorgesteld
date: 2026-09-29
elements: [as-nieuws, do-krant, app-comp, t-supabase, t-platform, ext-supabase]
---

De Krant krijgt een eigen app (Krant 3B, Expo; B16/B17). Die app heeft geen cookies: hij logt
in bij Supabase Auth met een e-mailcode (B19) en stuurt daarna het access token mee als
`Authorization: Bearer <jwt>`. Tot nu toe kende de server alleen cookie-auth
(`lib/supabase/server.ts`, de proxy in `lib/supabase/proxy.ts`, ADR 0052); `Authorization`
werd alleen voor `CRON_SECRET` gelezen. Dit besluit legt fase 1 van Krant 3A vast: de ingang
zelf, `config`, `profiel` en `feedback`. Het bouwt op ADR 0044 (foutvorm), ADR 0052
(getClaims/getUser), ADR 0058 (datapad) en ADR 0183 (de tijdlijn en haar kolomgrant).

## Besluiten

1. **Een Bearer-token wordt een anon-client met die token als header — nooit service-role.**
   `lib/supabase/bearer.ts` maakt `createClient(url, anonKey, { global: { headers: {
   Authorization } }, auth: { persistSession: false, autoRefreshToken: false,
   detectSessionInUrl: false } })`. PostgREST ziet `auth.uid()` = de lezer, dus RLS blijft de
   beveiligingsgrens (own-row), precies als op het web. Een bron-scan
   (`app/api/v1/service-role.gate.test.ts`) verbiedt `getServiceClient`, `lib/supabase/service`,
   de cookie-client en `next/headers` — transitief over de hele importgraaf vanaf de v1-routes,
   de helper, `lib/krant/v1-*.ts` en `lib/krant/contract*.ts`, met een allowlist voor
   `lib/api/respond.ts` en `lib/observability/server-error-log.ts` — en eist dat elke handler
   (in elke exportvorm) eerst `vereisBearer` aanroept.

2. **Lezen verifieert lokaal, muteren bij de auth-server.** Lezen: `getClaims(jwt)` (JWKS,
   geen roundtrip; een ingetrokken sessie leeft tot `exp`, ≤ 1 uur). Muteren: `getUser(jwt)`
   (roundtrip; een uitgelogde of ingetrokken sessie wordt direct geweigerd). Zelfde verdeling als
   ADR 0052 voor het web. Alleen een echte gebruikerssessie telt: `role = authenticated`, een
   `sub`, en geen anonieme login — de anon-key zelf of een anonieme sessie geeft 401.
   **Foutindeling** (gemeten tegen auth-js 2.110.7): een token dat geen leesbare JWT is (header
   of payload geen JSON-object, `alg` buiten ES256/RS256/HS256) laat auth-js gooien; dat vangt
   `leesBearerToken` vooraf af → 401 zonder log. Een onbereikbare JWKS/auth-server retourneert
   een `AuthRetryableFetchError` → **503** (opnieuw proberen, niet uitloggen). Elke andere
   auth-fout → 401; een onverwachte throw daarna → 500.

3. **Daarna de modulepoort: `nieuws` vereist en niet geblokkeerd, anders 403.**
   `resolveActiveModules` op de eigen `profiles`-rij (`.eq('id', sub)`), plus `blocked_at`
   (zoals de app-shell een geblokkeerd account uitlogt). Een ontbrekende rij is hier
   **fail-closed** (403), anders dan in de shell, die op alle modules terugvalt: een
   geverifieerd token zonder profiel is een anomalie, geen lezer. `PUT profiel` vraagt
   daarbovenop dat de lezer de tijdlijn leest (`krantBronVoor` → `'tijdlijn'`, zoals
   `PUT /api/krant/tijdlijn/gelezen`); inzage (GET) blijft open.

4. **Een eigen tak in de proxy, vóór de cookie-client.** Onder `/api/v1/` maakt de proxy geen
   `createServerClient` (geen cookie-refresh, geen sessie-lookup). Zonder
   `Authorization: Bearer …` antwoordt hij 401 met dezelfde envelope als `unauthorized()`;
   met die header gaat het request door naar de handler, die de token echt verifieert. Een
   cookie zonder Bearer is onder v1 dus altijd 401 — er bestaat geen ambient credential, en
   daarmee geen CSRF.

5. **Geen CORS; een mutatie met een `Origin`-header is 403.** Een native app stuurt geen
   `Origin` en geen preflight; een browser wel. Er komen geen `Access-Control-Allow-*`-headers,
   dus een preflight faalt. De Origin-weigering staat in de proxy én in `vereisBearer` (twee
   lagen, zoals bij de dev-only-paden).

6. **Ook `config` vraagt Bearer + module.** De app logt in bij Supabase Auth, niet bij ons, dus
   een te oude app kan altijd nog inloggen en leert daarna uit `GET config` dat hij moet
   updaten (`minAppVersie`). Zo blijft er onder `/api/v1/` geen enkel pad zonder token en heeft
   de proxy-tak geen uitzonderingen.

7. **Het contract is de bron; OpenAPI volgt.** `lib/krant/contract.ts` (puur zod, geen
   server-imports) beschrijft elke request- en responsvorm. `npm run krant:openapi` schrijft
   daaruit `docs/api/krant-v1.json` (OpenAPI 3.1 via `z.toJSONSchema`); de app-repo leest dat
   bestand (B17). Een drifttest wordt rood zodra contract en gecommitte JSON uiteenlopen. De
   routes valideren bodies met `parseBody` + `z.strictObject`; de routetests parsen elke respons
   tegen het responsschema.

8. **Binnen v1 alleen toevoegen.** Een nieuw optioneel veld of een nieuwe route mag in v1 (de
   minor van `contractVersie` gaat omhoog). Iets weghalen, hernoemen of strenger maken is
   `/api/v2`. `minAppVersie` in `GET config` dwingt een update af als de server een oudere app
   niet meer kan bedienen.

9. **Het profiel schrijft alleen profielvelden.** `PUT profiel` zet de meegegeven velden en
   markeert ze als `zelf` in `herkomst`, zodat de weekafleiding ze niet overschrijft; `null` is
   bewust "weet ik niet". Het schema is strikt: `krant_variant`, `afgeleid_at`,
   `tijdlijn_vernieuwd_at`, `tijdlijn_gelezen_tot`, `herkomst`, `versie` en elke onbekende sleutel
   zijn een 400. De kolomgrant van migratie `20261004120000` houdt ze daarna alsnog tegen.
   De meerkeuzelijsten zijn begrensd en zonder dubbelen (werk ≤ 6, schulden ≤ 5,
   beleggingen-vorm ≤ 4, rubrieken ≤ 20 = de DB-CHECK), vóór de eerste publicatie van het
   contract — strenger maken kan binnen v1 daarna niet meer.

10. **`/api/news/read` gaat mee in v1** (besluit eigenaar 29-09, afwijkend van het advies): de
    oude leesstatus in `app_settings` krijgt een v1-equivalent (`GET/POST
    /api/v1/krant/news-read`) naast `tijdlijn_gelezen_tot`. Het contract definieert het nu; de
    route volgt in fase 2, samen met `tijdlijn`, `archief` en `gelezen` (`x-fase: 2` in de
    OpenAPI). Die worden dunne adapters over de 1C-leesloader (`lib/krant/tijdlijn-lezen.ts`),
    geen eigen query; `contract.test.ts` pint dat de schema's exact de TS-vorm van die loader
    hebben.

11. **Rate-limit en e-mailcode zijn change-requests, geen code.** Rate-limit: beide lagen
    (besluit eigenaar) — in fase 1 een Vercel-firewallregel per IP op `/api/v1/*`, in fase 2 een
    atomaire RPC per gebruiker op `auth.uid()` (patroon ADR 0076). E-mailcode: 10 minuten, 6
    cijfers — Dashboard + `supabase/config.toml` (`otp_expiry = 600`). Beide staan als ☐-rij in
    `docs/beheerders-runbook.md`.

## Gevolgen

- De allowlist van de besloten testfase geldt ook voor de app: hij wordt afgedwongen in de
  GoTrue-hook `before_user_created` (`public.hook_restrict_signup_by_allowlist`, migratie
  `20260717140000`), niet in de web-callback. Een e-mailcode-aanmelding voor een onbekend adres
  maakt dus geen gebruiker aan. Op 29-09 is de functie op productie direct aangeroepen (alleen
  lezend): een onbekend en een leeg adres geven de weigering (`http_code 403`,
  `TRIFINITY_NOT_INVITED`), een geseed adres `{}`. Dat de hook in GoTrue ook **aanstaat** is
  niet in de repo vastgelegd (de koppeling staat in het Dashboard), maar wel aantoonbaar actief:
  de auth_logs tonen `action: run_hook` "Hook ran successfully" op `/signup` (14-09) en
  `/callback` (16-09). Het `/otp`-pad (de e-mailcode van de app) is nog niet in de logs
  gezien → een smoke door de eigenaar met een onbekend adres (verwacht: geweigerd, geen
  gebruiker).
- `lib/api/respond.ts` importeert transitief de foutlogging, die met de service-role naar
  `error_logs` schrijft. Dat is bewust (ADR 0044) en raakt geen lezersdata; de bron-scan kijkt
  daarom naar directe imports.
- De proxy-tak bouwt zijn envelope inline in plaats van via `respond.ts`, om de service-client
  niet de proxy-bundel in te trekken. `proxy.v1.test.ts` pint dat de vorm gelijk blijft.
- Pushtokens, export en wissen (fase 3) vragen een migratie (`krant_pushtokens`, own-row RLS) en
  een regel in het verwerkersregister (Expo, B18); niet in dit besluit.
- Twee gelijktijdige `PUT profiel`-verzoeken van dezelfde lezer kunnen elkaars
  `herkomst`-samenvoeging overschrijven (read-modify-write zonder vergrendeling). Hetzelfde geldt
  voor de weekcron (afleiding) tegenover een PUT: wie het laatst schrijft, wint de
  `herkomst`-kolom; in het ergste geval staat een net ingevuld veld een week als `afgeleid`
  en overschrijft de volgende run het. Eén lezer, één rij, zeldzame race: aanvaard.
- Een ingetrokken token (uitgelogd, wachtwoord gewijzigd) blijft voor **lezen** geldig tot zijn
  `exp` — de `jwt_expiry` van het project (standaard 3600 s) — omdat `getClaims` lokaal
  verifieert. Muteren gaat via `getUser` en weigert direct.
- De modulepoort (en de tijdlijnpoort op `PUT profiel`) is een **productpoort**, geen
  toegangsgrens: wat een lezer mag zien en schrijven, bepaalt RLS (own-row) en de kolomgrant.
- Vervolg (latere migratie, niet nu): DB-CHECKs op de lengte en uniciteit van `werk`,
  `schulden` en `beleggingen_vorm` naast de bestaande op `rubrieken`.
