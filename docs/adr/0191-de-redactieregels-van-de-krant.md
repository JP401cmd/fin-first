---
id: 0191-de-redactieregels-van-de-krant
title: 'De redactieregels van de Krant: verandering is nieuws, het bericht past bij de lezer, de echte datum, Rijksoverheid als bron'
status: voorgesteld
date: 2026-09-29
elements: [as-nieuws, sp-nieuws, do-krant, t-supabase]
---

Aanvulling op ADR 0176 (wat is een artikel) en ADR 0172/0183 (de matcher en de tijdlijn).

## Aanleiding

Steekproef van de eigenaar op 29 sep 2026: van 17 beoordeelde berichten in de tijdlijn hadden er
maar 6 zonder voorbehoud impact. De rest faalde op vier punten, en geen daarvan is een fout van de
duiding. Het zijn redactionele beslissingen die de server kan nemen op wat hij al weet: de
bronsoort, de bronkop, het bronfragment en de herkomst van de datum. Daarom komen ze ná de duiding.
De duidingsprompt blijft ongewijzigd (een promptwijziging vraagt een nieuwe duiding van alle
artikelen en maakt de parity-poort rood), en de sjablooncatalogus en het attest ook.

## Besluit

### 1. Verandering is nieuws, de standaard niet

Een `web_pagina` is een vaste uitlegpagina die we in secties knippen. De sleutel is pagina + hash
van de sectietekst, dus een gewijzigde sectie geeft een nieuwe rij. De eerste keer dat we een
pagina zien, geeft óók elke sectie een rij. Die twee waren niet te onderscheiden, en zo stond
"Aftrekposten box 1" als Nieuw in de tijdlijn.

- De ingest legt het onderscheid vast in `news_articles.bron_wijziging` (alleen `web_pagina`):
  `basis` als er vóór deze run geen enkele `web_pagina`-rij van die pagina bestond, anders
  `gewijzigd`. Per pagina één bestaanscheck (`limit(1)`), geen `.in()` over alle rijen van alle
  pagina's: dat laatste kan op `max_rows` afkappen, en een afgekapte pagina zou stil "onbekend"
  en dus `basis` worden.
- Een kolom en geen afleiding: "is dit de eerste run van deze pagina" is achteraf alleen af te
  leiden zolang de rijen van die run bestaan. De bewaartermijn (120 dagen op `laatst_gezien_at`)
  kan ze wissen. De ingest weet het op het moment zelf zeker.
- Mislukt de check, dan raadt de ingest niet: de secties gaan die run niet de tabel in
  (`uitgesteld`) en komen de volgende run terug.
- Een eerste waarneming wordt afgemaakt. Valt een deel van de basissecties buiten het tijdbudget
  van de categorisatie terwijl een ander deel wél geschreven is, dan schrijft de ingest de rest
  meteen, zonder rubriek (de categorisatie-inhaalslag vult die later). Anders zou de volgende run
  de pagina al kennen en de rest als wijziging lezen.
- De matcher (v6): een basissectie is in geen van beide modi een item. Ze mag in Achtergrond en
  in het katern staan, maar achter al het nieuws. Ontbreekt de status op een `web_pagina`-rij, dan
  geldt de voorzichtige lezing: basis.
- Bekende beperking: een basissectie die een schrijffout kreeg (`skipped`, geteld en gelogd) komt
  de volgende run terug op een pagina die dan bekend is, dus als `gewijzigd`.
- Bekende beperking: een pagina met meer dan `MAX_SECTIES_PER_PAGINA` (12) secties. Verdwijnt er
  bovenaan een sectie, dan schuift sectie 13 in beeld en telt die als wijziging.
- Een gewijzigde sectie draagt de datum van de hele pagina uit de metadata, niet de datum van de
  wijziging (gemeten op 30 sep: de twee Belastingdienst-pagina's dragen 3 februari en 14 april).
  Voor zo'n sectie geldt die datum daarom niet als echte publicatiedatum
  (`heeftEchteArtikelDatum`): de lezer ziet "gezien op", en de regel "ouder dan 45 dagen" geldt
  niet; het venster op de ophaaldatum beslist. Zonder deze uitzondering viel een echte wijziging
  stil weg als oud nieuws.
- Nog niet opgelost: verandert het sjabloon van een site of onze extractor, dan wordt elke sectie
  van een bekende pagina `gewijzigd` (tot 12 per pagina). Een drempel ("meer dan de helft nieuw
  in één run is basis") is een vervolgpunt.

**Naslaglijsten.** Een uitlegpagina komt niet alleen als sectie binnen. De lijstbron
"Belastingdienst — Box 3" levert links naar pagina's die zelf uitleg zijn ("Kijk hoe wij uw box
3-inkomen in 2021 berekend hebben"). Na de eerste versie van deze regel bestond de tijdlijn van
een spaarder uit 8 van die pagina's, alle 8 als Nieuw (live-run 30 sep 2026).

- `NASLAG_LIJSTEN` in `lib/krant/redactie.ts` noemt de lijstbronnen die naslag verzamelen, op het
  adres van de lijstpagina. Een link van zo'n lijst is de stand van zaken: geen bericht, wel
  Achtergrond, achter al het nieuws. Ook geen kandidaat voor het AI-model.
- Draagt de pagina zelf een echte publicatiedatum, dan is het een bericht met een datum. Het
  venster en de regel "ouder dan 45 dagen" beslissen dan.
- Een nieuwslijst (AFM, CPB, de ministeries, de Kamerbrieven) staat er niet in, ook niet als haar
  berichten geen datum dragen.
- In code en niet in de bronnenlijst van /beheer/nieuws, zoals `LIJST_PAD_FILTER`: de regel geldt
  ook als de beheerder de lijst opslaat. Een vlag per bron in beheer is een vervolgpunt.
- Geen kolom en geen migratie: de matcher leest het adres dat de ingest al bewaart
  (`bron_pagina_url`).

### 2. Het bericht past bij de lezer

**2a. Caribisch Nederland.** Het nieuwsprofiel kent geen woonplaats en alle lezers wonen in
Europees Nederland. Een bericht over Caribisch Nederland of de landen Aruba, Curaçao en Sint
Maarten haalt het leescontract niet: het komt in geen enkele tijdlijn, niet in Achtergrond en niet
in het katern. De drempel is een treffer in de **kop**, of minstens **twee vermeldingen** in de
**aanhef** (de eerste 600 tekens van het fragment). Een bericht dat over Caribisch Nederland gaat,
zegt dat in de kop of komt er in de aanhef op terug. Een Nederlands bericht dat het gebied één
keer noemt (of diep in de tekst) blijft staan. Treffers binnen 80 tekens van elkaar zijn één
vermelding: "Caribisch Nederland (BES)", een opsomming van de drie eilanden en de vaste
voorbehoudzin van een overheidspagina ("Woont u in Caribisch Nederland (Bonaire, Sint Eustatius of
Saba)?") tellen dus één keer. Woordgrenzen: "Sint Maartensdijk" en "WolBES" zijn geen treffer, en
"BES" telt alleen als hoofdletterwoord.

Nagelopen in de artikelvoorraad van 30 sep 2026 (243 artikelen): de kopregel vangt alle vier de Caribische
berichten. De aanhefregel vangt er op dit moment geen extra; hij is er voor een bericht met een
neutrale kop.

**2b. Spaarbuffer.** Het thema `sparen-rente` raakt spaarders vanaf € 5.000. Een bericht over een
kleine of ontbrekende buffer ("Blog: betaal jezelf eerst: spaarbuffer", huishoudens met minder dan
€ 1.000) raakt juist de andere groep. Er komt geen nieuw thema bij dat het model moet toekennen.
Wat verandert is alleen de koppeling thema → lezer, deterministisch op kop en aanhef
(`isBufferBericht`):
- noemt de kop *rente*, dan is het een rentebericht;
- noemt de kop een buffer, dan is het een bufferbericht;
- anders beslist een vaste bufferformulering in de aanhef ("spaarbuffer", "financiële buffer",
  "geen spaargeld", "minder dan € 1.000 spaargeld").

Een bufferbericht raakt `spaargeld hoogstens tot-5k`, zonder zichtbare reden-zin: "heb je weinig
spaargeld" is een gevoelige reden, net als inkomen en krediet. De catalogus krijgt geen tekst
bij. In `waarom` staat `redactie:spaarbuffer`, voor beheer en de meting.

De lezer ziet die code niet. Onder "Waarom zie ik dit?" stonden tot deze release de codes van de
matcher letterlijk (`thema:sparen-rente`, `impact:ontbreekt`). Dat is hersteld in het leespad
(`leesbaarWaarom` en `leesbaarWatMist` in `lib/krant/tijdlijn-lezen.ts`): de lezer ziet alleen de
redenen, als zin uit de geattesteerde catalogus, en de namen van de velden die ontbreken. De
gevoelige redenen (inkomen, uitkering, krediet) staan daar wel, achter de klik, zoals
compliance-keuze 4 bedoelde. De catalogus is niet gewijzigd.

**2c. Landelijke cijfers.** Cijfers, verwachtingen en marktbewegingen zonder rekenregel kwamen al
nooit als "Over jouw situatie" of als persoonlijk bericht in de tijdlijn, en ook niet in
Achtergrond (ADR 0183, eindreview H1). Het gedrag verandert niet. Een test pint het nu vast: ook
met een thema dat raakt, een rubriekvoorkeur én een deadline blijven ze in het katern.

### 3. De echte datum

- `published_bron` krijgt de waarde `pagina`: geen metadata, wel een zichtbare datum vlak bij de
  kop in de artikeltekst. Per host staat één expliciet patroon (`PAGINA_DATUM_PATRONEN`): AFM
  "Nieuws 24/08/26", CPB "15 september 2026" op een eigen regel en Rijksoverheid "Nieuwsbericht
  29-09-2026". Alleen de aanhef (400 tekens) telt, alleen een bestaande kalenderdag, niet na de dag
  van de run en niet meer dan 730 dagen ervoor. CBS heeft geen datum in de tekst, wel Dublin
  Core-metadata (`DCTERMS.modified`). Die leest `extractBronDatums` nu als laatste terugval.
- Metadata gaat voor, een feeddatum wint altijd.
- De duiding behandelt `pagina` als een onbekende datum: alleen `feed` en `meta` gaan als "Datum:"
  de prompt in. Zo verandert er aan de duidingsinvoer niets en hoeft er niets opnieuw geduid te
  worden.
- Zonder echte datum toont de lezer nooit een publicatiedatum maar "gezien op <datum>", in de
  tijdlijn, in Achtergrond en in het katern (`lezersDatum`; het snapshot draagt `gezienOp`).
- De regel "ouder dan 45 dagen telt niet als nieuw" (v5) werkt alleen op een echte datum. Zonder
  echte datum beslist het venster op de ophaaldatum, zoals voorheen. Een basissectie is dan al
  uitgesloten door regel 1.

### 4. Nieuws van de Rijksoverheid

Gemeten op 29 sep 2026. De oude feed `feeds.rijksoverheid.nl` bestaat niet meer (DNS), en
`/actueel/nieuws` bouwt zijn lijst in de browser op (0 links in de HTML). De ministeriepagina's
zetten hun laatste nieuws wél in de HTML. Erbij als `web_lijst`:

- Rijksoverheid: de pagina's van Financiën, SZW en Algemene Zaken (3 à 4 artikel-links per pagina);
- Tweede Kamer: de Kamerbrieven van de regering bij de commissies Financiën en SZW (15 per pagina).
  Hier stond "Voorstellen op box 3, koopkracht werkenden en sociale zekerheid", het bericht dat de
  eigenaar miste.

`LIJST_PAD_FILTER` (per host, in code) laat van zo'n lijstpagina alleen artikel-links door. Anders
kiest de terugval zonder model de thema- en bewindspersoontegels. Een link die een kaart is, krijgt
de kop van die kaart als kop, en niet de hele kaarttekst met teaser.

`DETAIL_HOSTS` krijgt `www.rijksoverheid.nl` met twee paden: `/actueel/nieuws/` en
`/documenten/`. De structuur wordt meerdere paden per host. De veiligheidstoetsen blijven gelijk:
exacte hostnaam, geen doorstuurvorm, `isVeiligeBronUrl`, content-type vóór de body en de cap van
4.000 tekens. Een ander pad op rijksoverheid.nl wordt niet bewaard: ook het adres waar een
doorverwijzing eindigt, moet op een toegestaan pad en de exacte host liggen, anders is het een
terugval (`doorverwezen`). De Tweede Kamer staat bewust níet in `DETAIL_HOSTS`: een nieuwe host is
een eigen besluit, dus alleen de kop en de tekst van de lijstregel.

Bekend van de eerste meting (30 sep 2026): Algemene Zaken levert vooral niet-financieel nieuws, en
de Kamerbrieven hebben geen datum in de lijst. De eerste run haalt brieven van ongeveer twee weken
oud binnen; die tonen "gezien op". Twaalf webbronnen op rijksoverheid.nl tegelijk kan een 429
geven; dat volgen we op /beheer/nieuws.

### De Krant met AI volgt dezelfde regels

Wat de matcher buiten houdt, mag het model niet binnenhalen (ADR 0190). Een basissectie is geen
kandidaat voor een toevoeging, een bufferbericht (thema `sparen-rente`) alleen voor de laagste
spaarband, en Caribisch Nederland zit al in het leescontract. Een bericht dat het model toevoegt,
toont alleen een echte publicatiedatum, anders "gezien op". De volgorde van de kandidaten volgt de
datum die de lezer ziet.

## Gevolgen

- Migratie `20261009120000_news_articles_redactieregels` (één transactie, herhaalbaar). Die voegt
  de kolom en de CHECK's toe, verruimt de CHECK op `published_bron`, en doet drie backfills:
  basis/gewijzigd per pagina op de eerste `fetched_at`, de datum uit het bewaarde fragment en de
  momentopnamen (`gezienOp`). **Migratie vóór de code**: de loader leest `bron_wijziging`. Het
  schrijven van nieuwe rijen overleeft de omgekeerde volgorde (PGRST204/23514 → de vorm van vóór
  de migratie); het bijwerken van bestaande rijen met een datum uit de pagina niet, dat telt dan
  als fout en komt de volgende run terug.
- **De migratie draait twee keer**: vóór de deploy, en direct erna nog een keer. Wat de oude code
  tussen de migratie en de deploy schreef (een sectie zonder `bron_wijziging`, een momentopname
  zonder `gezienOp`) wordt anders nooit hersteld. De migratie is herhaalbaar; de tweede run raakt
  alleen die rijen.
- Bij de uitrol staat de registratie in `schema_migrations` vóór `commit;`, in dezelfde
  transactie.
- `MATCHER_VERSIE` 6. De goldens veranderden alleen van versie en kregen het veld `gezienOp`. De
  selectie is gelijk, want de fixtures dragen een feeddatum en zijn nieuwsberichten.
- De ingest haalt per run vijf pagina's meer op. Er komen hooguit een paar Rijksoverheid-
  detailpagina's per dag bij, en die blijven binnen `MAX_DETAILS_PER_RUN` (24) en het budget van
  25 s: per host 1 fetch per seconde, hosts parallel.
- Het blok Achtergrond kan basissecties dragen. Die staan dan achter al het nieuws en zijn één
  week zichtbaar (het venster van `fetched_at`).

## Niet in scope

"Het echte nieuws is het verband" (spaarrente tegenover beleggingsrendement na box 3): dat raakt
de grens van advies en volgt apart. Verder de duidingsprompt en de sjabloonteksten.

## Aanvulling 30 sep 2026: de Tweede Kamer wordt géén detailhost

**Vraag.** De Kamerbrieven staan in de Krant zonder samenvatting (`samenvatting-leeg:model`): de
enige grondslag is de titel. Kan `www.tweedekamer.nl` met het pad
`/kamerstukken/brieven_regering/detail` in `DETAIL_HOSTS`, zodat de ingest de briefpagina ophaalt?

**Gemeten (30 sep 2026, vier briefpagina's: drie bij Financiën, één bij SZW).**

- De pagina antwoordt `200`, `text/html; charset=UTF-8`, zonder doorverwijzing. De
  veiligheidstoetsen zouden hem dus doorlaten.
- **De brieftekst staat niet in de HTML.** De pagina draagt de titel, de indieners, de
  activiteiten waar de brief bij hoort en een knop "Download kamerstuk". Die knop wijst naar
  `/downloads/document?id=…` en levert een Word-bestand
  (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`). Dat bestand haalt
  `fetchDetailPagina` terecht niet op: de content-type-toets weigert het vóór de body.
- `artikelTekst` levert 138 tot 510 tekens: "Brief regering : <titel>", "Delen Delen", de
  indieners en de activiteiten. Onder de 200 tekens is dat een terugval (`leeg`). Erboven is het
  `gelezen`, en dan wordt paginachrome als grondslag bewaard. Daarin staat een datum van een
  **komend** debat ("1 okt 2026 … Plenair debat"), die de duiding voor de brief kan aanzien.
- Geen datum in de metadata: `extractBronDatums` geeft niets. De zichtbare "Datum: 30 september
  2026" staat in een lijst buiten de artikeltekst.
- Traag en kwetsbaar: een briefpagina die niet in de cache van de site staat, deed er 13 tot
  49 s over, ruim boven `FETCH_TIMEOUT_MS` (10 s). Twee verzoeken tegelijk gaven een `503`. Uit de
  cache komt dezelfde pagina binnen 0,2 s.

**Besluit.** De Tweede Kamer komt niet in `DETAIL_HOSTS`. Er valt niets op te halen dat de duiding
helpt, en wat er wél staat is chrome met een misleidende datum. Er komt ook geen host-specifiek
extractiemaatwerk: je kunt geen tekst uitsnijden die niet in de HTML staat. De Kamerbrieven houden
alleen de kop en de lijstregel.

**Als dit later toch moet**, dan niet via deze pagina. Er zijn twee routes, allebei een eigen besluit
met een eigen host en een eigen securityreview. De eerste is de HTML-versie op
`zoek.officielebekendmakingen.nl`, die er pas dagen na de brief is. De tweede is de open-data-API
van de Kamer (`gegevensmagazijn.tweedekamer.nl`). Het Word-bestand zelf lezen valt buiten de scope
van de detailpagina's (geen kantoorbestanden, zie `DOCUMENT_PAD`).

## Aanvulling 30 sep 2026: matcher v7 — het onderwerp en de spreiding over uitgevers

**Aanleiding.** Op de Krant van de eigenaar (30 sep) stond bij "Aftrekposten box 1" (thema's
inkomstenbelasting, eigen-woning) "Dit bericht gaat over de eigen woning en de hypotheek", en bij
"Prinsjesdag 2026 in begrijpelijke taal" (box 3, huis kopen, toeslagen) "gaat over toeslagen". De
matcher noemde het thema dat bij het profiel paste. Daarnaast kwamen zes van de acht berichten in
Achtergrond en "Ook in het nieuws" van de Tweede Kamer, verdeeld over twee bronlabels.

**Besluit (matcher v7).**
- "Dit bericht gaat over …" noemt het **eerste thema van de duiding**. De duidingsprompt legt niet vast
  dat het eerste thema het hoofdonderwerp is, en de gronding kan het eerste thema laten vallen; het is
  dus een goede benadering, geen afspraak met het model. Een vervolgkaart via `ai-gedrag` legt die
  afspraak vast in de prompt (met een `DUIDING_VERSIE`-bump).
- De zichtbare reden ("Volgens je profiel …") komt alleen nog van een doelgroepregel of van dat eerste
  thema. De reden van een bijthema staat alleen onder "Waarom zie ik dit?": naast een ander onderwerp
  leest hij als verband ("koopwoning … gaat over box 3"), de fout uit de compliance-check van B37. De
  catalogus en het attest veranderen niet.
- Achtergrond en katern tonen **samen** hoogstens twee berichten per **uitgever**: het deel van het
  bronlabel vóór " — " ("Tweede Kamer — Kamerbrieven SZW" → "Tweede Kamer"). Eén telling over beide
  blokken, Achtergrond kiest eerst.

Berichten in een tijdlijn zijn momentopnamen: dit geldt voor nieuwe verversingen.
