---
id: 0190-de-krant-met-ai-als-laag-op-de-tijdlijn
title: 'De Krant met AI als laag op de tijdlijn: dezelfde verversing, een toelichting per bericht, terugval per tekst'
status: voorgesteld
date: 2026-09-29
elements: [as-nieuws, do-krant, t-aigateway, sp-nieuws]
---

# 0190 — De Krant met AI als laag op de tijdlijn

De Krant met AI is sinds Krant 1E geen eigen editie meer. Het is dezelfde tijdlijnverversing als
de Krant zonder AI (ADR 0183), met één extra stap tussen de matcher en het schrijven: een model
schrijft per bericht een korte toelichting en mag hoogstens drie berichten toevoegen. De
standaard blijft zonder AI. Dit besluit legt de negen keuzes van de eigenaar van 29 september
2026 (K1–K9) vast.

> Nummer: de opdracht noemde 0189. Bij het schrijven bleek 0189 in een parallelle werkboom al
> geclaimd (`0189-het-beheerdashboard-ordent-op-beheervraag.md`, ongecommit in de hoofdcheckout);
> daarom 0190.

## Context

Tot 1E had /nieuws twee editiepaden: de oude AI-Krant (`/api/news`, één `streamObject` over 40
bronartikelen, cache in `app_settings`, archief in `news_editions`) en de tijdlijn zonder AI
(`krant_edities`, bron `tijdlijn`). Een lezer die de AI-Krant koos, verloor zijn tijdlijn
(`wisTijdlijn`) en kreeg een ander product met een ander archief, een eigen leesstatus en een
eigen quotum. Het model schreef daar de URL, de bron en de kop zelf, en rekende zelf bedragen en
vrijheidstijd uit — de nummer-guard draaide alleen op het lokale pad (ADR 0080).

## Besluit

1. **K1 — één verversing, één archief.** De Krant met AI is `ververs` met een AI-stap
   (`lib/krant/tijdlijn-ai.ts#maakAiStap`) en `krant_edities.met_ai = true`. `krant_variant = 'ai'`
   betekent voortaan "tijdlijn + AI-laag". De keuze **wist niets** (ook terug niet); /nieuws toont
   voor bron `ai` dezelfde `TijdlijnClient`. `/api/news`, `NieuwsOnlyClient` en de
   `news_cache:*`-sleutels blijven staan, gemarkeerd als *uitgefaseerd sinds 1E*.
2. **K2 — standaard zonder AI; met AI alleen na een keuze.** `bepaalKrantBron` kent nu vier
   uitkomsten: `tijdlijn` (standaard, ook met AI aan en een AI-abonnement), `ai` (tijdlijn + laag;
   alleen binnen de bèta, alleen na `krant_variant = 'ai'`, alleen met `aiKrantToegestaan`), `oud`
   (de oude Krant, alleen zolang de tijdlijn voor deze lezer dicht is) en `wacht`. Tot 1E deelden
   "bewuste AI-keuze" en "de oude Krant bij een dichte vlag" de waarde `ai`; dat kan niet meer. Een
   Krant-account krijgt nooit `ai` of `oud`, en de variantroute geeft hem 403 — ook via de API.
3. **K3 — wat het model krijgt en mag.** De matcherberichten van deze verversing plus hoogstens
   12 kandidaten die de matcher níet koos (`kiesAiKandidaten`: leescontract, niet al in de
   tijdlijn, niet elders in deze verversing, geen gedempte rubriek, alleen de soorten besloten,
   voorstel en achtergrond, op recency). Het model schrijft per matcherbericht hoogstens één
   toelichting en voegt hoogstens drie kandidaten toe; het laat niets weg en ordent niets. De
   uitvoer is per bericht een `artikelId` uit een zod-**enum van precies de aangeleverde set** plus
   tekst. Id, URL, bron, kop en datum komen altijd uit de bronrij (`toegevoegdItem`).
4. **K4 — alleen euro's, het model rekent niets.** Elke AI-tekst gaat langs `toetsAiTekst`: vorm
   (≤ 3 zinnen, ≤ 480 tekens), de Wft-woordenlijst (`vindWftOvertreding`, incl. de
   vrijheidstijd-woorden), de koopmetafoor (ADR 0165), geen assistentnaam, elke datum als datum in
   de grond, en elk getal in dezelfde eenheid in de grond (`lib/nummer-grond.ts`, `kaalStreng`).
   De grond is **per bericht**: de duiding van dat artikel, de (gesaneerde) matcherregel en
   samenvatting, en de gesaneerde lezerscontext. Faalt een tekst, dan vervalt alléén die tekst; de
   matcherregel blijft staan (een toegevoegd bericht zonder geldige tekst vervalt helemaal). Een
   schemabreuk kost niet het hele antwoord: de ruwe tekst gaat onderdeel voor onderdeel door
   `valideerAiUitvoer`.
5. **K5 — quotum en lege verversingen.** Hoogstens 5 modelcalls per lezer per 7 dagen, geteld in
   de database (`krant_edities.ai_uitkomst` ∈ {`met-ai`, `teruggevallen`}; ook een mislukte call
   telt). `news_max_refreshes_per_week` wordt bewust **niet** hergebruikt: die telt `news_editions`
   en telde lokale edities mee (ADR 0080, aanvaard neveneffect). Daarboven: dezelfde verversing
   zonder AI (`ai_uitkomst = 'quotum'`) met "Deze keer zonder AI" op het scherm. Een lege
   verversing (geen berichten én geen kandidaten) kost geen call; "niets nieuws" en de rem van tien
   minuten gaan er al aan vooraf.
6. **K6 — lokaal of privé = zonder AI.** De route toetst `isCloudAllowed(…, 'nieuws')` vóór de
   laag bestaat (kill-switch én uitvoerkeuze); bij "nee" gaat er niets naar een aanbieder en is het
   een gewone verversing (`ai_uitkomst = 'geweigerd'`), geen 403. Aanvulling op ADR 0080.
7. **De volgorde van de poorten** in de stap: leeg → privacy → `checkTierGate('ai')` → geen
   Krant-account → geen bezwaar (`profiles.krant_schaduw_bezwaar_at` stopt óók de laag) → quotum →
   maandtegoed (`checkCreditBudget`) → `sanitizeForAI` → `getModel(service, 'krant_ai', { userId })`
   → `generateObject` (enum-schema, json-tool, 45 s) → guards → `maskPIIInOutput` → schrijven met
   `met_ai` → `recordAiUsage`. Elke weigering of fout = dezelfde verversing zonder AI; de stap
   gooit nooit, en `ververs` vangt het toch af. Geen prompt-caching: de enum met de artikel-id's
   staat in de tool vóór de systeemprompt, dus de prefix verschilt per call, en de systeemprompt
   ligt onder het cacheminimum (zelfde reden als de ingest, ADR 0186).
8. **K7 — de oude AI-edities omzetten.** Migratie `20261008120000_krant_ai_laag` zet
   `news_editions` en de lopende `news_cache:*` om naar `krant_edities` (bron `tijdlijn`,
   `met_ai = true`, `ai_uitkomst` NULL) met items `vorm = 'ai'`, `article_id` NULL, `tijdlijn = true`,
   `tekst` leeg, `ai_tekst` = de oude `personalImpact`, en de momentopname uit het NewsItem.
   Herhaalbaar via `oud_ref = 'ai-oud:<user_id>:<md5 van de artikelen>'` (partieel uniek; dekt ook
   een cache die later alsnog in `news_editions` belandt), fail-closed (onbekende sleutel,
   ongeldige JSON, geen lijst of een niet-object bericht → EXCEPTION, hele transactie terug), alleen
   de afgelopen 120 dagen (de bewaartermijn van de tijdlijn) en alleen bestaande accounts. De oude
   tabel en sleutels blijven staan.
9. **K8 — opslag.** `krant_editie_items.ai_tekst text null`, `ai_toegevoegd boolean not null
   default false`, vorm-CHECK += `'ai'`; `krant_edities.ai_uitkomst` en `oud_ref`. CHECKs: een
   toevoeging heeft een tekst, vorm `ai` en AI-tekst alleen in de tijdlijn, `met_ai = (ai_uitkomst =
   'met-ai')`. Een toegevoegd bericht heeft wél een `article_id` en valt dus onder de partiële unieke
   index lezer + artikel. Schrijven alleen service-role (geen kolomgrant voor sessies).
10. **K9 — geen Fin.** Eén component; het label "met AI" per toelichting en "door AI toegevoegd"
    bij een toevoeging, met een gestippelde lijn naast de geattesteerde regel. Geen naam of avatar.

## Gevolgen

- **Nieuw:** `lib/krant/ai-laag.ts` (puur), `lib/krant/ai-laag-prompt.ts`, `lib/krant/tijdlijn-ai.ts`,
  de migratie en `scripts/verify-krant-ai-laag-rls.sql`. Feature `krant_ai` (token-labels,
  uitvoergroep `nieuws`, twee route-bindings), `krant` (gratis) in de feature-registry naast
  `ai_nieuws` (nu "Krant met AI").
- **Gewijzigd:** `bepaalKrantBron` (+ `oud`, `leestTijdlijn`), `zetKrantVariant` (wist niets),
  `ververs` (AI-stap, `hertoetsLezer`), de knop en de dagcron (privacy-poort per lezer, summary met
  AI-tellingen), `laadTijdlijn` (`aiTekst`, `aiToegevoegd`, `metAi`, `laatsteZonderAi`),
  `TijdlijnClient` ("Liever zonder AI", nieuwe bevestigingstekst). `TerugNaarTijdlijn` is vervallen.
- **Uitrol:** eerst `20261004120000`, dan `20261008120000` (elk in één transactie mét versie-INSERT),
  de twee verify-scripts groen, dan de code — de leesloader selecteert de nieuwe kolommen.
- **Wat de prompt belooft, dwingt de code af.** De prompt is een merkstem-oppervlak; een wijziging
  kan `merkstem:check` en `parity:check` rood maken. De eigenaar beslist over herattestatie.
- **Open (eigenaar):** /privacy moet de laag noemen (verwerker, gegevens, bewaartermijn) vóór de
  bèta opengaat; de dagcron kan in een week meer dan vijf keer willen draaien (dag 6 en 7 dan zonder
  AI); het quotum telt een race tussen knop en cron hoogstens één te veel.
