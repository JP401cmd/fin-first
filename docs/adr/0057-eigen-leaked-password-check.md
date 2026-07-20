---
id: 0057-eigen-leaked-password-check
title: Eigen leaked-password-protection via HaveIBeenPwned k-anonimiteit (gratis, UI-grade)
status: aanvaard
date: 2026-07-20
elements: [t-supabase, app-comp]
---

De drie auth-flows (signup, reset-password, account-wachtwoord) controleren een
gekozen wachtwoord tegen de HaveIBeenPwned "Pwned Passwords"-range-API vóór de
`supabase.auth.*`-call. De check draait via **k-anonimiteit**: de browser hasht het
wachtwoord lokaal (SHA-1), stuurt alléén de 5-tekens-prefix naar een eigen
proxy-route, en matcht de suffix lokaal. Plaintext én volledige hash verlaten de
browser nooit. De check is **fail-open** (blokkeert nooit bij een storing) en
**UI-grade** (geen harde serverpoort — die zou het Supabase Pro-plan vereisen).

## Context

- Supabase's **native** leaked-password-protection vereist het **Pro-plan**; dit
  project draait Free. De launch-audit noemde een gratis alternatief al als [P2].
- Het reële risico is credential stuffing: een gebruiker (her)gebruikt een
  wachtwoord dat al in een publiek datalek staat. Dit beschermt de accounthouder
  tegen zichzelf.
- HaveIBeenPwned biedt de "Pwned Passwords"-range-API gratis, publiek en zonder
  key, ontworpen op **k-anonimiteit** (`/range/{PREFIX}`).

## Besluit

### Privacy-model — k-anonimiteit (plaintext verlaat de browser NOOIT)

1. De client hasht het wachtwoord lokaal met `crypto.subtle.digest('SHA-1', …)`
   → 40 hex-tekens uppercase.
2. De client stuurt **alleen de eerste 5 hex-tekens** (de prefix) naar onze eigen
   route `/api/auth/password-check?prefix=XXXXX`.
3. De route proxyt naar `https://api.pwnedpasswords.com/range/{PREFIX}` met header
   `Add-Padding: true` (HIBP-privacy-padding) en een korte AbortController-timeout
   (~2500 ms), en geeft de rauwe range-tekst terug (lijst `SUFFIX:COUNT`-regels).
4. De client vergelijkt lokaal of de resterende 35 hex-tekens (de suffix) in die
   lijst staan; zo ja én `COUNT > 0` → gelekt (padding-regels hebben `COUNT 0`).

Onze server ziet zo nooit het plaintext-wachtwoord én nooit de volledige hash —
alleen de prefix, precies zoals HIBP zelf. Reden voor een eigen proxy i.p.v. de
browser direct naar HIBP: CSP/one-origin-hygiëne, centrale fail-open + timeout,
en de app-conventie dat externe calls server-side lopen (blauwdruk:
`lib/nibud/api-client.ts`).

### Fail-open (hard)

Élke storing — HIBP down, timeout, non-200, parse-fout, `crypto.subtle`
onbeschikbaar — wordt behandeld als "niet gelekt". De check blokkeert de
registratie/wijziging **nooit**. Een beveiligingscheck die de gebruiker
buitensluit bij een externe storing is erger dan de check missen. De route geeft
bij een upstream-fout een **lege 200-body** terug (geen 5xx), zodat de client-check
sowieso fail-open gaat.

### UI-grade, geen harde serverpoort (bewuste keuze)

De drie flows roepen `supabase.auth.*` **client-side** aan; onze check zit ervóór
in de UI. Een directe API-caller (buiten onze UI om, rechtstreeks tegen GoTrue)
kan de check omzeilen. Dat is een geaccepteerde grens, omdat:

- Dit type bescherming beschermt de **accounthouder tegen zichzelf**, niet tegen
  een kwaadwillende derde. Wie bewust de UI omzeilt om een gelekt wachtwoord te
  zetten, benadeelt alleen het eigen account.
- **Harde afdwinging** zou ofwel de Supabase **Pro-toggle** (native
  leaked-password-protection) vereisen, ofwel een GoTrue **password-strength/
  before-hook** die Supabase niet als vrij configureerbaar hook-punt aanbiedt op
  Free. Beide vallen buiten scope.

**Upgrade-pad:** zodra het project naar Pro gaat, kan de native
leaked-password-protection worden aangezet als harde serverpoort; deze UI-check
blijft dan waardevol als directe, inline feedback (snellere UX, geen ronde langs
GoTrue's generieke foutmelding). De twee bijten elkaar niet.

### Route

`app/api/auth/password-check` — **publiek** (signup gebeurt uitgelogd, dus géén
`unauthorized()`-gate), maar strak gevalideerd op **exact 5 hex-tekens** via een
zod-schema; bij mismatch een **400 in de platte error-envelope** (ADR 0044). Geen
rauwe upstream-details naar de client; upstream-fouten worden server-side gelogd
met de grep-bare tag `[auth:password-check]`.

**Misbruik-overweging:** de publieke prefix-proxy is laag-risico. HIBP is zelf een
publieke, key-loze API en de prefix onthult niets over een specifiek wachtwoord.
Er is bewust **geen rate-limiting-infra** voor gebouwd (scope); komt dat later
alsnog nodig, dan kan er een generieke rate-guard voor.

### Eén bron voor de melding

De NL-copy (`LEAKED_PASSWORD_MESSAGE`, coach-stem, vrijheids-neutraal) en de
gedeelde `MIN_PASSWORD_LENGTH` staan in `lib/password-policy.ts` — niet driemaal
hardcoded in de flows.

## Scope

- **In:** HIBP k-anonimiteit-check, server-geproxyd, ingehaakt op signup + reset +
  account-wachtwoord; fail-open; één bron voor de melding; route + lib-helper +
  tests.
- **Uit:** min-wachtwoordlengte NIET verhoogd (blijft 6, aparte productbeslissing);
  geen migratie/tabel/dataobject/RLS/rekenmotor; geen harde serverpoort; geen
  rate-limiting-infra; Google-OAuth-signup (geen wachtwoord) en de
  forgot-password-mailstap (zet geen wachtwoord) niet geraakt; admin-testuser-
  wachtwoord-zetten niet geraakt.

## Gevolgen

- **Positief:** gratis bescherming tegen bekend-gelekte wachtwoorden op alle drie
  de wachtwoord-zet-momenten; privacy-veilig (k-anonimiteit); geen storing-risico
  (fail-open); geen backend-datamodel of migratie nodig.
- **Concessie:** UI-grade — omzeilbaar door de UI over te slaan (bewust, zie boven).
  De check voegt één korte, fail-open netwerkrondje toe vóór de wachtwoord-zet-call.

## Platen-impact

- **ArchiMate:** géén nieuw topologie-element. De check is een interne helper +
  auth-route en hoort bij het bestaande `t-supabase` (Supabase Auth) / `app-comp`;
  dit ADR hangt eraan via `elements`. Geen nieuw element voor een dunne UI-check.
- **ERD / Berekeningen / HLD:** nee (geen tabel, geen rekenmotor, geen nieuwe
  gebruikers-capability van betekenis — bestaande wachtwoord-flows worden veiliger).
