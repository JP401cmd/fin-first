---
id: 0171-duiding-van-nieuwsartikelen-gesloten-schema-controles-in-code
title: 'Duiding van nieuwsartikelen: gesloten schema, controles in code, automatische vrijgave met terugtrekken'
status: aanvaard
date: 2026-09-21
elements: [as-nieuws]
---

Elk nieuw geïngest artikel wordt in de achterkant één keer door AI geduid naar een vaste set
parameters (soort, ingangsdatum, deadline, doelgroep, mechanisme, samenvatting, grond) volgens
een gesloten zod-schema in `lib/krant/`. Niet de prompt maar de code dwingt af: elk getal in
de params en in de samenvatting moet met dezelfde eenheid letterlijk in de brontekst staan,
drempels worden alleen bij naam genoemd (waarde uit `lib/box3-data.ts`, `lib/box1-tax.ts`,
`lib/constants.ts`) en elk mechanisme heeft harde plausibiliteitsgrenzen. Na die controles
gaat de duiding direct automatisch vrij (B4); beheer kan haar achteraf terugtrekken met een
reden. De artikelbak bewaart 120 dagen zonder grens op aantal. De duiding rekent en spreekt
uitsluitend in euro's (B2) — een bewuste uitzondering op de app-brede vrijheidstijd-regel.

# 0171 — Duiding van nieuwsartikelen: gesloten schema, controles in code

## Context

Het plan *De Krant op eigen benen* (21 sep 2026) brengt het nieuws uit zonder AI aan de kant
van de gebruiker. Nu schrijft een model per lezer de editie op basis van diens volledige
financiële context; in de Krant wordt elk bronartikel in de achterkant één keer geduid naar
parameters, en legt een pure matcher (1B) die op een licht profiel van dertien velden.

Het risico verhuist daarmee: een fout per lezer wordt een systemische fout — één verkeerde
parameter raakt iedereen in de doelgroep tegelijk. Dat is de reden dat de controles níet in
de prompt staan maar in code, met dezelfde les als `local-news-select.ts` en de nummer-guard
van ADR 0080: het model mag niet creatief zijn met cijfers.

Feiten bij de bouw (geverifieerd 21 sep 2026): `raw_content` is de RSS-teaser (gemiddeld
228 tekens), de bak stond met `MAX_STORED_ARTICLES = 100` op twee à drie dagen nieuws, en
de bestaande editie-paden lezen de bak al begrensd (venster 30 dagen + limit), zodat een
langere bewaartermijn hen niet raakt.

## Besluit

1. **Eén duidingsstap in `runNewsIngest`**, na de upsert, idempotent op `id` +
   `duiding_status IN ('wacht','mislukt')`, met een batch-cap (60 in de cron, 15 handmatig)
   en `maxDuration = 300` op de cron. Een mislukte duiding laat de ingest nooit falen. Het
   bestaande LLM-pad, het lokale pad (ADR 0080) en de privacy-poort blijven volledig intact
   (B10): er wordt naast gebouwd, niets verwijderd.
2. **Gesloten schema** (`lib/krant/duiding-schema.ts`, `DUIDING_VERSIE = 1`): soort,
   ingangsdatum, deadline, doelgroep (regels op de sleutels uit `profiel-velden.ts`),
   mechanisme (één uit de catalogus van twaalf in `mechanismen.ts`, met een gesloten
   params-schema per mechanisme en een eventuele drempel bij naam), samenvatting (B3) en
   grond (citaat per numerieke param). Rubriek is de bestaande kolom `category`, geen
   eigen veld (keuze 5).
3. **Controles in code** (`duiding-controles.ts`): schema → doelgroep-vocabulaire →
   gronding van de samenvatting → plausibiliteit en gronding van het mechanisme. De
   grondingstoets deelt zijn tokenizer en eenheidsregels met de lokale nummer-guard via de
   neutrale module `lib/nummer-grond.ts` (verhuisd met re-export, zodat het lokale pad niet
   breekt). Faalt alleen het mechanisme, dan blijft de duiding `geduid` mét
   `mechanisme: null` en een foutcode (keuze 7): het artikel blijft via zijn doelgroep
   relevant, zonder getal.
4. **Vrijgave automatisch, terugtrekken achteraf** (B4): geen `vrijgegeven_door`/
   `vrijgegeven_at`; `news_articles` krijgt `teruggetrokken_at`, `teruggetrokken_door` en
   `teruggetrokken_reden`. De K1-meting (twee weken nul foute getallen bij rekenende
   mechanismen) is het bewijs dat de controles volstaan.
5. **Volledige tekst alleen voor regelbronnen** (`regelbronnen.ts`), opgehaald om te duiden
   en niet bewaard (keuze 4); de citaten in `grond` zijn het bewijs.
6. **Bewaren op tijd**: `ARTICLE_RETENTION_DAYS = 120` vervangt de harde grens van 100 én
   het 90-dagen-vangnet; de titel-dedupe leest de laatste 30 dagen.
7. **Alleen euro's** (B2): geen dagtarief, geen omrekening naar vrijheidstijd, geen
   uitgavenband in het profiel (dertien velden). Dit is een bewuste, gedocumenteerde
   uitzondering op de app-brede regel "elk bedrag boven €100 ook in vrijheidstijd".
8. **Eigen feature-sleutel `nieuws_duiding`** (scope `platform`, ADR 0079) zodat de
   kostenpost apart zichtbaar is; geen eigen route-binding omdat de registry uniek per
   routepad is en de cron/admin-route al een platform-binding dragen.
9. **Provider-aanname**: het gesloten schema gebruikt een `discriminatedUnion` over de
   mechanismen; de AI SDK zet dat om naar `oneOf`, dat de Anthropic-provider (het
   standaardmodel) als `anyOf` met native structured output aankan. OpenAI in strict-mode
   accepteert `oneOf` niet — wisselt de provider, dan hoort dit schema opnieuw getoetst.

## Gevolgen

- **Contract voor 1B**: `DuidingV1` + `duidingV1Schema`, `DOELGROEP_SLEUTELS`/`ProfielVeld`,
  `MECHANISMEN` (`vorm`/`rekent`/`leest`/params), `DREMPELS` bij naam, en het leescontract:
  alleen rijen met `duiding_status = 'geduid'`, `category` als rubriek, `fetched_at` binnen
  het editievenster of `deadline` in de toekomst. `herberekenNaTerugtrekking` is een stub.
- **Fail-closed drukt de dekking**: op teasers zullen rekenende mechanismen vaak ongegrond
  zijn. Dat is de bedoeling; de meting (`meta.brontekst` teaser vs volledig, `duiding_fout`)
  laat zien waar de catalogus of de bronkeuze moet groeien.
- **Prompt-injectie via artikeltekst**: gesloten schema + gronding + plausibiliteit sluiten
  een verzonnen bedrag uit. Het ergste geval is níet alleen een verkeerde doelgroep maar
  ook **ongegronde vrije tekst en datums** — daarom worden (security-run 21 sep 2026) ook de
  datums gegrond (jaar, en bij een deadline de dag), verwijzingen in de samenvatting (URL,
  `www.`, `@`) afgewezen, citaten letterlijk in de bron geëist en begrensd (300 tekens), en
  foutcodes zonder modelwaarde geschreven. Nog open vóór 1B/1C (dan pas leest iemand de
  samenvatting): de Wft-woordenlijst (aanbieders, gebiedende wijs) in code toetsen, niet
  alleen in de prompt. Terugtrekken vangt de rest.
- **De grondslag is échte brontekst**: `summary` (door `categorizeArticles` herschreven) en
  de `raw_content` van web-items (uit `extractNewsFromWebPage`) zijn modeltekst en tellen
  niet mee; een web-item zonder paginatekst in dezelfde run wordt overgeslagen, niet geduid.
  Anders zou een getal dat een eerdere modelstap verzon deze stap "gronden" en zou de
  K1-meting groen zijn over een gat.
- **Regelbron-fetch**: alleen `https`, alleen de acht domeinen (hostname-match). Nog open:
  `fetchWebContent` volgt redirects zonder hertoets van het eindadres en leest de volledige
  body vóór het afkappen — hardening in `lib/news-sources.ts` staat als aandachtspunt.
- **Wft/AVG**: geen persoonsgegevens in de prompt en geen gebruikersoppervlak in K1. De
  samenvatting en de prompt gaan vóór 1C door `compliance-check` en `merkstem`; `/wft` en
  `/privacy` veranderen pas bij 1C via de Grenswachter-route.
- **Vervolg**: fase 2 (`/beheer/nieuws` met grond, terugtrekken-route met audit, meting-
  paneel, paginering) en fase 3 (1B vult de herberekening). De beheerpagina zegt tot fase 2
  nog "maximaal 100 artikelen".

## Aanvulling 22 sep 2026 — fase 2: beheer ziet, trekt terug en meet

- **`/beheer/nieuws`** toont per artikel de duidingsstatus en, uitgeklapt, de duiding met per
  param de waarde naast het letterlijke grond-citaat, de doelgroep, de samenvatting en de
  brontekst-soort. De opgeslagen jsonb gaat alleen via `duidingWeergave`
  (`lib/krant/duiding-beheer.ts`, geparsed tegen `duidingV1Schema`) naar de client; een rij die
  het leescontract niet haalt wordt niet getoond, alleen gemeld. Alles rendert als platte
  tekst. `GET /api/admin/news-articles` pagineert (50 per pagina), filtert op status en op
  rekenende mechanismen, en maakt de zoekterm vrij van PostgREST-syntax.
- **Terugtrekken** (`POST /api/admin/news-duiding/terugtrekken`): superadmin-gate op de
  ingelogde client, zod via `parseBody`, één geconditioneerde UPDATE (`id` + status `geduid`)
  die status, `teruggetrokken_at`, `teruggetrokken_door` en `teruggetrokken_reden` samen
  schrijft — de audit van B4 staat op de rij zelf. Daarnaast `admin_actions_log`
  (`nieuws.duiding.terugtrekken`, met een optionele toelichting die bij reden *anders*
  verplicht is). Idempotent: al teruggetrokken → 200 zonder tweede audit; elke andere status
  → 409. De duiding-jsonb blijft staan (de meting leest er het mechanisme van). Daarna
  `herberekenNaTerugtrekking` (1B) op de service-role; die geeft beheer alleen een aantal
  edities terug. Faalt hij, dan blijft de terugtrekking staan.
- **Geen terugweg naar `geduid`.** De analyse legt die niet, en een knop terug zou de enige
  menselijke beslissing in de keten (B4) omkeerbaar maken zonder spoor. Ook een versie-bump
  laat `teruggetrokken` bewust staan (`lib/krant/duiding.ts`); een foute terugtrekking herstel
  je dus alleen met een bewuste SQL-correctie. Een herhaalde terugtrek-klik is idempotent
  (geen tweede audit) maar draait de herberekening wél opnieuw, zodat een time-out of een
  mislukte herberekening zich laat herstellen. Wel: **Opnieuw
  duiden** (`POST /api/admin/news-duiding/opnieuw`) zet een `afgewezen`/`mislukt` rij terug op
  `wacht` met `duiding_pogingen = 0` (en `geduid_at`/`duiding_versie` leeg); de volgende
  ingest-run duidt hem. Ook gelogd.
- **Verwijderen** (`DELETE /api/admin/news-articles`) weigert sinds deze fase een `geduid` of
  `teruggetrokken` artikel (409): verwijderen omzeilde de terugtrek-audit, liet een fout getal
  uit de meting verdwijnen, liet een gat in de schaduweditie, en de ingest haalde het artikel
  de volgende dag terug op `wacht` — een stille reset. Elke verwijdering gaat via zod en
  `admin_actions_log` (`nieuws.artikel.verwijderen`).
- **Meting** (`GET /api/admin/news-duiding/meting`, paneel *Meting duiding*): per Amsterdamse
  ISO-week, cohort op `fetched_at`, afgeleid bij elke lezing (`bouwDuidingMeting`) uit
  `duiding_status`, `duiding_fout`, `teruggetrokken_reden`, `category` en de mechanisme-soort/
  brontekst uit de jsonb. Of een soort rekent komt uit `MECHANISMEN` in code, nooit uit de
  modeluitvoer. De poortmaat is *teruggetrokken met reden fout-getal bij een rekenend
  mechanisme*. De route pagineert over de PostgREST-cap (`max_rows`) met de exacte telling als
  stopcriterium en ontdubbelt op id; zonder dat zou de dekking na drie weken stil te laag
  uitvallen. `category` is een dimensie (door de ingest-categorisatie toegekend, keuze 5),
  geen controle-uitkomst.
- **ADR 0146**: `news_articles` blijft op `VRIJ_LEESBAAR`, nu mét expliciete reden in
  `lib/beheer/geen-inhoud.test.ts`. De per-lezer-tabellen van 1B blijven op de strenge regel.
- **Duidingsbudget cron 180 s → 150 s** (release-review 0.92.0, L3): het budget stopt alleen
  het oppakken; de uitlopende calls hielden de cron op ~275–285 s van 300.
- **Niet-numerieke beweringen — de beslissing staat in ADR 0176, besluit 16.** Bugkaart
  *Krant 1A · Samenvattingen: getal gegrond op token* eiste die beslissing hier, in 0171.
  Ze is genomen, maar landde één ADR verder omdat 1F fase 2 de hele grondslag verving:
  **G6** toetst doelgroep en domeinkwalificaties tegen een gesloten lexicon
  (`lib/krant/doelgroep-lexicon.ts`), waarvan een test volledige dekking afdwingt. Een
  bewering zonder getal wordt dus niet meer ongetoetst doorgelaten — punt 3 hierboven
  ("relevant, zonder getal") beschrijft alleen wat er met het *mechanisme* gebeurt, niet
  met de tekst. Regressiebewijs: `lib/krant/__golden__/bron-7ce838c7.json` (de
  woninghuur-bewering "geldt voor zowel de sociale als de vrije sector") valt onder beide
  grondslagen op G6. Wat bewust open blijft, staat in 0176: een geïnjecteerde zin zónder
  getal, URL, meta-patroon of lexiconwoord passeert de poort nog steeds.
- **Nog open** (buiten fase 2): de Wft-woordenlijst in code, de redirect-hertoets en
  body-cap in `fetchWebContent`, `/nieuws` in `protectedPrefixes` van de proxy, een
  `revoke all … from anon` op `news_articles` (alleen RLS keert anon nu), de toelichting bij
  reden *anders* staat alleen in het best-effort-auditlog (niet op de rij), en de CHECK dwingt
  `teruggetrokken_door` niet af (botst met de FK `on delete set null`).
