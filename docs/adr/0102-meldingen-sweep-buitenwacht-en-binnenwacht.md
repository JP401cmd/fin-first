---
status: accepted
date: 2026-08-11
elements: [t-platform, t-supabase, app-comp]
---

# 0102 — Meldingen naar de telefoon: buitenwacht + binnenwacht

## Context

Detectie van storingen was **pull**-gebaseerd: `/beheer/errors` en `/beheer/jobs`
tonen fouten pas als iemand ze opent. Eén duw-kanaal bestond al — de cron-mail
uit ADR 0060 — maar die is stil zolang `ALERT_EMAIL`/`OPS_EMAIL` niet gezet is,
en dekt alleen een cron die faalde met een `job_runs`-rij.

Twee gaten maakten dat onvoldoende:

- **Melden bij nieuwe fouten bestond niet.** ADR 0060 koos bewust "persist-only,
  geen mail-per-request" wegens floodrisico. Dat floodrisico is echt, maar de
  conclusie "dan maar niets" liet de app dertien dagen ongemerkt kapot staan.
- **De wachter mocht niet draaien op wat hij bewaakt.** Elke cron-route toetst
  `CRON_SECRET` **vóór** `recordJobRun`. Ontbreekt het secret, dan is er een 500
  en géén `job_runs`-rij — hetzelfde beeld als "nog niet aan de beurt". Zo bleef
  het uitvallen van álle crons (29 juli – 11 augustus 2026) onopgemerkt. Een
  sweep-cron óp Vercel ziet een Vercel-cron-storing dus per definitie niet.

## Besluit

**Buitenwacht + binnenwacht.**

- **Buitenwacht (extern, dead man's switch).** Een externe pinger roept elk
  kwartier `/api/cron/alerts-sweep` aan en **slaat zelf alarm als die aanroep
  uitblijft of faalt**. Dit is het enige onderdeel dat "de crons draaien
  helemaal niet" kan zien; zonder dit is de rest schijnzekerheid. Inrichting
  staat in `docs/beheerders-runbook.md` — het is bewust géén repo-artefact,
  want een wachter binnen de bewaakte omgeving is geen wachter.
- **Binnenwacht (`app/api/cron/alerts-sweep`).** Eén route, drie signalen,
  hoogstens één gebundelde melding per signaalsoort per venster:
  - **S1 nieuwe fouten** — `error_logs` sinds een watermerk, gegroepeerd op
    fingerprint (hash over `context` + genormaliseerde `message`: ids, bedragen,
    datums, URL's en e-mailadressen gemaskeerd). Meldt alleen **nieuwe** soorten;
    her-alarm bij 10× volume-escalatie van een al gemeld type.
  - **S2a gefaalde taak** — `job_runs.status='error'`.
  - **S2b uitgebleven taak** (nieuw) — geen geslaagde run binnen `maxAgeHours`.
    Dit sluit fase 2 van ADR 0060.
- **Kanaal = ntfy** (privétopic + access token, self-hostbaar), env-gedreven.
  Afgewogen tegen Web Push/VAPID, Pushover/Telegram en "alleen de bestaande
  mail". Doorslaggevend: een alarmkanaal moet **losstaan van de stack die het
  bewaakt** en mag **niet stil falen**. Web Push faalt juist stil (verlopen
  subscription, op iOS alleen bij een geïnstalleerde PWA) en kost een
  abonnementstabel + VAPID-sleutelbeheer. Web Push blijft de eindvorm zodra we
  push naar **eindgebruikers** willen — dat is een productfeature, niet dit
  ops-alarm, en gaat niet in dezelfde stap.
- **Payloadregel (hard, AVG).** Een melding draagt uitsluitend tellingen,
  taak-labels, een **herkende** `context`-tag en een deeplink. **Nooit**
  `message`, `stack`, `url` of `job_runs.error`. Reden: het kanaal loopt buiten
  onze stack. Strenger dan het cron-mail-precedent (label + fouttekst), bewust:
  mail gaat naar onze eigen ops-mailbox, dit niet.
- **`safeContextTag()` is een allowlist, geen knijpfilter.** `error_logs.context`
  wordt via `/api/log-error` **ongefilterd door de client** aangeleverd (200
  tekens vrije tekst). De eerste opzet knipte alleen het alfabet bij en kapte op
  40 tekens; de security-review toonde aan dat dat leestekens verwijdert en geen
  persoonsgegevens — `NL91ABNA0417164300` bleef intact en
  `jan.smit@trifinity.nl` werd `jan.smit-trifinity.nl`. Alleen onze eigen tags
  (`global-error`, `window.onerror`, `unhandledrejection`, `error-boundary`,
  `onRequestError:<routeType>`) passeren; al het andere wordt `'onbekend'`. De
  melding verliest daar niets mee: de tag bestond om ónze categorieën te tonen,
  de details staan achter de deeplink.
- **Fingerprints zijn een HMAC, geen kale hash.** Ze liggen in `app_settings`,
  dat voor elke ingelogde gebruiker leesbaar is, en `normalizeMessage` maakt de
  zoekruimte juist klein — een kale SHA-256 zou dus een goedkoop orakel op
  interne foutmeldingen zijn. Sleutel is server-only (`CRON_SECRET`).
- **De route staat in de middleware-allowlist.** `/api/` is een protected
  prefix, dus zonder entry in `CRON_PUBLIC_PATHS` (`lib/supabase/proxy.ts`) 401't
  de middleware de cron **vóór** zijn eigen `CRON_SECRET`-check — de taak draait
  dan nooit en laat géén `job_runs`-spoor na, dus `/beheer/jobs` toont hetzelfde
  beeld als "nog niet aan de beurt". Die sync tussen allowlist en `vercel.json`
  stond er alleen als comment en werd bij deze kaart prompt gebroken; ze is nu
  een test (`lib/supabase/proxy.cron-paths.test.ts`).
- **Ontdubbeling.** Venster 15 min · per fingerprint max 1×/24u · per taak max
  1×/24u via **dezelfde** `cron_alert_last_<job>`-sleutel als de bestaande mail,
  zodat mail, directe push en sweep samen hoogstens één alarm per taak per
  etmaal geven. Nachtstilte bewust niet in v1.
- **Geen configuratie → stille no-op.** Zonder `NTFY_TOPIC` slaat de route álle
  IO over en blijft de cron groen; de staat schuift dan ook niet door, zodat de
  eerste echte melding zijn geschiedenis niet mist.
- **Geen nieuwe tabel.** De staat leeft in `app_settings`
  (`alerts_error_watermark`, `alerts_fingerprints`, `alerts_stale_last_<job>`),
  precedent `cron_alert_last_<job>` uit ADR 0060. Alleen afgeleide data —
  hashes, tellingen, tijdstempels — want `app_settings` is voor elke ingelogde
  gebruiker leesbaar; schrijven kan alleen service-role/superadmin.
- **Eén taakcatalogus.** `lib/job-catalog.ts` wordt de single source voor label,
  schema, pad, omschrijving én `maxAgeHours`. Label en catalogus leefden eerst
  los van elkaar (`JOB_LABELS` in cron-alert.ts naast `JOB_CATALOG` in de
  beheerpagina). Als `Record<JobKey, …>` compileert een nieuwe taak rood tot hij
  is ingedeeld.
- **Interne observability blijft buiten ArchiMate/HLD/Berekeningen** (precedent
  ADR 0060/0063). Geen nieuwe tabel/FK → geen ERD- of `arch:diagram`-wijziging.

## Gevolgen

- Een nieuwe soort fout of een stille cron bereikt de beheerder binnen een
  kwartier, zonder meldingsstorm.
- **Prod-config (change-request-werk, niet in de PR-diff):** `NTFY_TOPIC` (+
  `NTFY_TOKEN`) in Vercel, de externe pinger op `/api/cron/alerts-sweep`, en —
  blijvende randvoorwaarde — `CRON_SECRET`. Zonder die drie is de feature een
  stille no-op. `ALERT_EMAIL` zetten geeft ook zonder push al directe waarde.
- **Bekende grens:** de normalisatie maskeert geen korte niet-numerieke slugs,
  dus een foutmelding met hoge kardinaliteit levert veel fingerprints op. Dat
  kost hooguit één extra gebundelde melding per venster; de state blijft
  begrensd door een TTL van 7 dagen en een cap van 500 types.
- **Buiten scope, aparte kaart:** `serverError()` (`lib/api/respond.ts`) doet
  alleen `console.error`, dus afgevangen API-500's komen nooit in `error_logs`.
  S1 is daar per definitie blind voor tot `serverError` ook `logError` aanroept.
- **Open, uit de security-review (aparte kaarten):**
  1. De SELECT-policy op `app_settings` laat elke ingelogde gebruiker de
     `alerts_*`- en `cron_alert_*`-sleutels lezen (tellingen en tijdstempels —
     geen inhoud, en met de HMAC geen orakel meer, maar wel operationele
     metadata). Aan te scherpen met dezelfde `key !~~ …`-uitsluiting die live al
     voor `notion\_%` bestaat. Bewust niet in deze PR: de live policy is
     gedrift t.o.v. het migratiebestand, en een policy herschrijven op een
     tweedehands lezing is precies de gok die je bij RLS niet maakt.
  2. `/api/log-error` kent geen rate limit. Wie duurzaam meer dan ~2.000
     foutrijen per uur post, laat het watermerk achterlopen en vertraagt echte
     meldingen. De sweep meldt zijn achterstand nu wel in `job_runs.summary`
     (`backlog: true`), maar de limiet zelf hoort op de log-route.
- De sweep bewaakt zijn eigen stilte niet (`maxAgeHours: null`) — dat kán hij
  niet; daar is de buitenwacht voor.
