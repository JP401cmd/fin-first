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
