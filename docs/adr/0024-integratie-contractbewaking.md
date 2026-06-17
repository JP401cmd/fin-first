---
id: 0024-integratie-contractbewaking
title: Integratie-inventaris, liveness-probes en contractbewaking
status: accepted
date: 2026-06-17
elements: [as-import, t-marktdata, t-bankimport, do-contract-events, app-comp]
---

De app ondersteunt 14 externe koppelingen en uploads (brokers, exchanges, PSD2, marktdata,
bestandsformaten). Dit besluit verankert de zelfactualiserende beheer-laag die die koppelingen
bewaakt: een gecureerde inventaris (`lib/architecture/integrations-model.ts`), publieke
liveness-probes (`lib/integrations/health-probe.ts`), formaat-contracten met fingerprint
(`lib/parsers/format-contracts.ts`) en runtime zod-canary's op API-responses — alle
contractschendingen geschreven naar de nieuwe operator-tabel `contract_events`.

## Context

Externe koppelingen veranderen buiten onze invloed: Bitvavo voegt velden toe aan een
response-body, een bank wijzigt de kolomvolgorde in haar CSV-export, mijnpensioenoverzicht.nl
hernoemd een JSON-sleutel. Zonder gestructureerde bewaking merkt de applicatie dit pas als een
parse-fout een gebruikersfunctie kapotmaakt.

Tegelijk is er geen centraal overzicht: welke van de 14 koppelingen is actief, welke
API-versie is gepind, reageren de publiek-probebare endpoints nog? Een admin moet dit nu zelf
bijhouden in hoofd of losse notities.

Drie bestaande patronen in de codebase sturen de oplossing:

- `/beheer/architectuur` en `/beheer/development`: *feiten gescand, betekenis gecureerd,
  zelf-actualiserend* — de genereer-scanner levert de feiten, een gecureerd model levert de
  betekenis, de pagina combineert beide.
- `job_runs`: operator-telemetrie-tabel voor dagelijkse cron-resultaten, geen user_id,
  superadmin-only SELECT, service-role INSERT.
- `lead_intakes` privacy-patroon: alleen structurele namen (kolom, header), nooit
  transactiewaarden in de DB opslaan.

## Besluit

**1. Zelfactualiserende inventaris (scan + curatie)**
`scripts/architecture/generate.mjs` scant `lib/integrations/`, `lib/parsers/`, `lib/truelayer/`
en `lib/nibud/` naar `architecture.json.integrationClients`. Het gecureerde model
`lib/architecture/integrations-model.ts` (14 entries, gespiegeld aan `development-model.ts`)
bevat auth, versie, probe-descriptor en formaat-contract per koppeling. De
drift-guard-test (`integrations-model.test.ts`) bewaakt de sync: elke client op schijf hoort
een curatie-entry te hebben.

**2. Publieke health-probes (géén creds)**
`lib/integrations/health-probe.ts` voert `fetch(url, {signal: AbortSignal.timeout(5000)})`
uit op de publieke endpoints van de 6 probebare koppelingen (Bitvavo, Kraken, Coinbase,
CoinGecko, Blockchair, TrueLayer-admin-test). Trading 212, FMP en NIBUD zijn niet publiek
probebaar en krijgen de badge "creds vereist". De probe raakt nooit opgeslagen credentials.

**3. `contract_events` als platform-brede operator-telemetrie**
Tabel `contract_events` (migratie `20260617190000_create_contract_events.sql`):

- Geen `user_id` — dit is operator-telemetrie, niet per-gebruiker.
- `fingerprint` = structurele hash van kolom/header-namen; `diff` = jsonb met uitsluitend
  kolom/header-NAMEN. Nooit transactiewaarden of financiële data.
- Unieke index op `(kind, surface, fingerprint)` → upsert-or-increment = ingebouwde anti-spam.
- RLS aan; SELECT uitsluitend superadmin; INSERT/UPDATE via `increment_contract_event` RPC
  (SECURITY DEFINER, REVOKE voor `anon`/`authenticated`).
- Kind-enum: `format_drift` (CSV/JSON-headers verschoven), `contract_violation`
  (zod-schending API-response), `version_watch` (versie-aankondiging).
- De helper `lib/contract-events.ts` slikt fouten (`try/catch` rondom de RPC-aanroep) zodat
  een drift-log nooit een upload of sync breekt.

**4. Runtime zod-canary's op API-responses**
Bestaande response-interfaces worden gepromoveerd naar zod-schema's, co-located in de client.
Na `res.json()`: `safeParse` → succes door; falen → `recordContractEvent('contract_violation')`
met `error.issues`-paden (uitsluitend veldnamen), dan permissieve cast (sync blijft werken).
Prioriteit: Bitvavo (meeste cron-verkeer), daarna Trading 212 en TrueLayer.

**5. Formaat-contracten met fingerprint (bestanden)**
`lib/parsers/format-contracts.ts` declareert `requiredHeaders`/`detectMarkers` + golden hash
per bank- en broker-CSV-formaat. Bij upload vergelijken de import-routes de live fingerprint
met de gedeclareerde; mismatch → `recordContractEvent('format_drift')`.

**6. Versieregister (low-tech, eerlijk)**
`lib/integrations/version-registry.ts` registreert `pinnedApiVersion`, `docsUrl`,
`changelogUrl`, `statusPageUrl` en `lastCheckedAt` per koppeling. Dit maakt "heeft iemand de
Bitvavo-changelog dit kwartaal bekeken?" een gedateerd artefact, niet een mentale herinnering.
De runtime zod-canary (besluit 4) is het echte automatische vangnet voor breaking changes.

**BEWUST GÉÉN HTML-changelog/status-page-poller.** HTML-paginapollers genereren ~100% false
positives (opmaakwijzigingen), leiden tot alert-moeheid en zijn nauwelijks betrouwbaarder dan
de canary. Uitzondering: als een provider een machine-leesbare `info.version`-resource
(OpenAPI/RSS) blootstelt, alleen dán bouwen na verificatie dat het endpoint beschikbaar is.

## Alternatieven

- **HTML-changelog-poller.** Verworpen: vrijwel alle wijzigingen in een HTML-pagina zijn
  opmaak/navigatie, niet API-breaking. Zo'n poller alarmeert vrijwel altijd vals en kweekt
  alert-moeheid — het ergste geval: de canary wordt genegeerd op het moment dat het ertoe doet.
- **Aparte schema-validatie-service.** Verworpen: co-located zod-schema's in de bestaande
  clients zijn idiomatischer, en de tabel-dedup is de natural sampler.
- **JSON-diff in `contract_events.diff`.** Verworpen voor waarden (privacy); alleen
  kolom/veldnamen zijn toegestaan conform het `lead_intakes`-privacypatroon.

## Gevolgen

- De 14 koppelingen zijn voortaan transparant zichtbaar op `/beheer/integraties` met
  health-status, versieregister en drift-events.
- Toekomstige wijzigingen aan `lib/integrations/`, `lib/parsers/` of `lib/truelayer/` die
  een nieuwe client of parser toevoegen of verwijderen, zijn een compile/test-fout tot de
  curatie in `integrations-model.ts` mee is bijgewerkt.
- `contract_events` is het eerste operator-telemetrie-oppervlak zonder `user_id` — vergelijkbaar
  met `job_runs`, maar breder (import-paden en API-clients).
- Privacy by construction: alleen structurele metadata (namen, hashes) land in de DB.
  Financiële waarden of transactierijen worden nooit gelogd.
- De dagelijkse health-probe lift mee op de bestaande `refresh-prices`-cron (18:00, dub1-regio)
  of krijgt een eigen dagelijkse cron-slot (abonnement limiteert tot dagelijkse frequentie).
