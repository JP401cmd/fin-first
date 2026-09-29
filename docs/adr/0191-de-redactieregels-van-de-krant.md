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

### 2. Het bericht past bij de lezer

**2a. Caribisch Nederland.** Het nieuwsprofiel kent geen woonplaats en alle lezers wonen in
Europees Nederland. Een bericht over Caribisch Nederland of de landen Aruba, Curaçao en Sint
Maarten haalt het leescontract niet: het komt in geen enkele tijdlijn, niet in Achtergrond en niet
in het katern. De drempel is een treffer in de **kop**, of minstens **twee** treffers in de
**aanhef** (de eerste 600 tekens van het fragment). Een bericht dat over Caribisch Nederland gaat,
zegt dat in de kop of noemt het in de aanhef meer dan eens. Een Nederlands bericht dat Bonaire
terloops noemt (één keer, of diep in de tekst) blijft staan. Woordgrenzen: "Sint Maartensdijk" en
"WolBES" zijn geen treffer, en "BES" telt alleen als hoofdletterwoord.

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
bij. In `waarom` staat `redactie:spaarbuffer`.

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
4.000 tekens. Een ander pad op rijksoverheid.nl wordt niet opgehaald. De Tweede Kamer staat bewust
níet in `DETAIL_HOSTS`: een nieuwe host is een eigen besluit, dus alleen de kop.

## Gevolgen

- Migratie `20261009120000_news_articles_redactieregels` (één transactie, herhaalbaar). Die voegt
  de kolom en de CHECK's toe, verruimt de CHECK op `published_bron`, en doet drie backfills:
  basis/gewijzigd per pagina op de eerste `fetched_at`, de datum uit het bewaarde fragment en de
  momentopnamen (`gezienOp`). **Migratie vóór de code**: de loader leest `bron_wijziging`. De
  ingest overleeft de omgekeerde volgorde wel (PGRST204/23514 → de vorm van vóór de migratie).
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
