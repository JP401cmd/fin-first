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
<!-- productiecijfer-ok: fictief voorbeeldadres en -IBAN om een maskeerbug te tonen, geen echte gebruiker -->
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
  1×/24u *(herijkt naar de dagelijkse cadans — zie de aantekening onderaan:
  stiltevenster 20u, en dus niet langer gegarandeerd één per rollend etmaal)* via
  **dezelfde** `cron_alert_last_<job>`-sleutel als de bestaande mail,
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
  kwartier, zonder meldingsstorm. *(Zie de aantekening onderaan: de
  Vercel-cron draait sinds 11 aug 2026 dagelijks; een kwartier-cadans komt
  sindsdien uitsluitend van de externe pinger.)*
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

## Aantekening — 11 augustus 2026: de binnenwacht wordt een dagelijkse ronde

**Wat verandert.** `/api/cron/alerts-sweep` stond op `*/15 * * * *`. Het
Vercel-plan waarop dit project draait staat **één cron-uitvoering per dag** toe,
en dit was de enige cron die daarboven zat. Het schema is `0 19 * * *`. 19:00
valt ná de laatste dagelijkse taak (prijsverversing 18:00), zodat één ronde de
uitkomst van álle dagelijkse taken meeneemt.

**Alle tijden hier zijn UTC** — Vercel evalueert cron-expressies in UTC, niet in
de zone van de gebruiker. De sweep draait dus feitelijk 21:00 Amsterdamse tijd in
de zomer. De onderlinge ordening klopt hoe dan ook (álle crons lopen op dezelfde
klok), maar de *labels* schoven: de catalogus-teksten dragen sindsdien expliciet
"UTC", omdat "Dagelijks 05:00" naast een laatste run van 07:55 anders als drift
leest terwijl beide kloppen. Vensters zelf zijn zomer-/wintertijd-ongevoelig: ze
vergelijken absolute milliseconden.

**Wat dat betekent voor het besluit.** De opzet blijft buitenwacht + binnenwacht,
maar de rolverdeling verschuift wezenlijk: de Vercel-cron is nu een *vangnet met
een dagelijkse hartslag*, niet meer de motor van de detectie.

- **De externe dead man's switch wordt hiermee bélangrijker, niet minder.** Hij
  was al het enige dat "de crons draaien helemaal niet" kan zien. Hij is nu
  bovendien het enige dat sub-dagelijkse detectie levert: de pinger roept
  dezelfde route aan en is niet aan de planlimiet gebonden. Blijft de pinger weg,
  dan zakt de detectietijd van een nieuwe soort fout van een kwartier naar tot 24
  uur — zonder dat er iets zichtbaar stuk is. De inrichting uit het
  beheerders-runbook is daarmee geen "nice to have" meer maar de feitelijke
  cadans.
- **Cron-jitter is gemeten, niet aangenomen.** 13 opeenvolgende `news-ingest`-runs
  (`0 5 * * *`) startten 6,6 tot 55,1 minuten ná het hele uur. Vercel plant op
  **uur-granulariteit**; elk venster hieronder rekent daarom met een vol uur
  speling aan beide kanten, niet met seconden.
- **Drempels die op een kwartier-cadans waren geijkt, zijn herijkt.** Vier
  plekken waar het venster stilzwijgend aan de cadans hing:
  1. *Stiltevenster* (`THROTTLE_MS`, sweep.ts) 24u → **20u**. Een throttle gelijk
     aan de cadans laat de ronde van morgen op zijn eigen rand vallen, en met tot
     55 minuten jitter wordt die rand echt geraakt — dan valt er een dag uit. 20
     uur ligt onder de cadans en boven de grootste afstand binnen één etmaal
     tussen een taak en de sweep (snapshots 02:00 → sweep 19:00 = 17u), dus mail
     en push ontdubbelen op dezelfde dag nog steeds.
     **De belofte is daarmee bijgesteld:** "hoogstens één alarm per taak per 20
     uur", niet meer "per etmaal". Roept de externe pinger elk kwartier aan (wat
     het runbook voorschrijft), dan vuurt een blijvend falende taak op t=0, 20u,
     40u en bevat een rollend etmaal er twee. Bewuste ruil: af en toe één alarm
     te veel is goedkoper dan een dag die stilletjes wegvalt.
  2. *`maxAgeHours`* (job-catalog.ts): de regel is niet meer "schema + ruime
     marge" maar "tussen (gat + jitter) en (gat + 24u − jitter − looptijd)", met
     `gat` = sweeptijd − looptijdstip. De taken van 18:00 gaan daarom van 26 →
     **23**: met 26 blijft een gemiste dag onopgemerkt tot de dag daarna, en 24
     laat maar 11 minuten marge — te weinig, want `created_at` wordt pas bij het
     AFRONDEN geschreven en de prijsverversing doet een exchange- en wallet-sync.
     Afgedwongen in `lib/job-health.test.ts`, mét de jitter in de som.
  3. *Twee consumenten, twee banden.* `maxAgeHours` beantwoordt de vraag van de
     sweep (eenmalig, op één vast moment). `/beheer/jobs` stelt een andere vraag
     — "is deze taak bij?", op een willekeurig moment — en daar is diezelfde
     drempel te krap: twee gezonde runs kunnen 24u + jitter uit elkaar liggen, dus
     de kaart zou op ruwweg de helft van de dagen tot een uur lang ten onrechte
     rood staan. De pagina telt er een expliciete toeslag bij op
     (`PAGE_JITTER_MARGIN_HOURS`, lib/job-health.ts). Dat vals alarm dáár duurder
     is dan een oordeel dat later komt, volgt uit de rolverdeling: het alarm is de
     sweep, de pagina is het overzicht.
  4. *Leesvenster* (route.ts): de 500-rijencap was per kwartier (≈48.000/dag) en
     zou als daglimiet het watermerk structureel laten achterlopen; de ronde
     leest nu meerdere batches. Het terugkijkvenster voor gefaalde runs is 24u →
     26u, want een venster dat exact even lang is als de tussenpoos heeft geen
     overlap meer.
- **Onveranderd:** `lib/cron-alert.ts` houdt zijn eigen `THROTTLE_HOURS = 24`.
  Die meldt op het moment dat een taak faalt (niet op de sweep-cadans) en schrijft
  **dezelfde** `cron_alert_last_<job>`-sleutel als de sweep. Omdat het venster van
  de sweep korter is, bepaalt in de praktijk het kortste van de twee wanneer er
  weer een alarm mag: de sweep kan 20 uur na een mail opnieuw melden. De
  docblock-zin in dat bestand spreekt nog van "één alarm per etmaal" en hoort
  bijgewerkt te worden zodra het bestand vrij is (het staat nu onder handen in een
  parallelle sessie). Verder onveranderd: de payloadregel, de fingerprint-TTL (7
  dagen) en `maxAgeHours: null` voor de sweep zelf.
- **Open vraag (buiten deze wijziging):** of de planlimiet naast de frequentie
  óók het *aantal* crons begrenst. `vercel.json` bevat er acht; als het plan er
  minder toestaat, draait een deel niet — en dat is met "geen regel in
  `job_runs`" niet van "nog niet aan de beurt" te onderscheiden. Te verifiëren op
  het Vercel-dashboard.
