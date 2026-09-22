---
id: 0176-wat-is-een-artikel
title: 'Wat is een artikel: vaste bronsoort per bron, sleutel door de server, brontekst bewaard'
status: aanvaard
date: 2026-09-22
elements: [as-nieuws, sp-nieuws, do-krant, t-supabase]
---

Een artikel in `news_articles` is een item met een eigen, **server-bepaalde identiteit**, een
**bronkop** en een **bewaard bronfragment**. Elke bron heeft een vaste bronsoort: `rss` (elk
feed-item; sleutel = de feed-link), `web_lijst` (een link die letterlijk als `href` op de
overzichtspagina staat; sleutel = die href, kop = de linktekst) of `web_pagina` (een sectie van
een themapagina; sleutel = pagina + sha256 van de sectietekst, dus een ongewijzigde pagina geeft
geen nieuwe rijen). Een overzichtspagina is zelf geen artikel. Modeltekst is nooit sleutel, kop,
datum of grondslag. Eén ingest voedt beide edities (B25). **De duiding kent uitsluitend het eigen
fragment als grondslag** (fase 2, besluiten 12–18): faalt de tekstpoort, dan ziet de lezer de
bronkop en de link zonder samenvatting. Dit dekt fase 1 en fase 2 van Krant 1F.

## Context

Het 1F-onderzoek van 22-09-2026 bevestigde dat het defect vóór de duiding zit (ADR 0171): 155 van
de 192 rijen (81 %) waren fragment-items van twintig statische pagina's. De sleutel was `#tf-` +
djb2 van de **modelkop** (`ensureUniqueArticleUrl`), dus elke parafrase werd een nieuw artikel;
94 % van de fragment-items in stabiele runs kwam van een al geziene pagina. `published_at` was
modeltekst of de ophaaldag, en de RSS-tijd werd weggeknipt: 192/192 rijen op 00:00 — de oorzaak
van bugkaart P2 (het algemeen katern koos feitelijk op artikel-UUID). Negen model-URL's gaven een
404, `stripHtml` liet script/JSON-LD staan (tot 100 % van het modelvenster), de `inserted`-telling
telde `ignoreDuplicates`-no-ops mee, en de brongezondheid kon 404, NXDOMAIN en "leeg" niet
onderscheiden. 25 van de 26 RSS-feeds leverden niets (17× `feeds.rijksoverheid.nl` bestaat niet
meer).

## Besluit

1. **Vaste bronsoort per bron** (B24 d), bewerkbaar op `/beheer/nieuws`. De bronconfiguratie
   blijft in `app_settings` (`news_web_sources` met `soort`, `news_rss_feeds`); een oude webbron
   zonder soort leest als `web_pagina` (de veilige lezing). Het schrijfpad valideert met zod.
2. **De sleutel is `source_url` en de server leidt hem af**: de feed-link letterlijk (ook de
   `//press` van de ECB), de `href` van de pagina, of `pagina#tf-s-<sectiehash>`. Er komt geen
   nieuwe unieke index en geen nieuwe `onConflict`-target (geen 42P10-risico). Op een lijstpagina
   kiest het model alleen **welke** link (een index in de server-lijst); een index die niet
   bestaat, wordt geweigerd en geteld.
3. **Herkomst per rij** (migratie `20260922160000`): `bron_soort`, `bron_pagina_url`,
   `inhoud_hash` (sha256 van de genormaliseerde brontekst), `published_bron`
   (`feed` · `meta` · `eerste_gezien`), `bron_kop` (≤ 300 tekens), `bron_fragment`
   (≤ 8.000 tekens) en `laatst_gezien_at`. **Bewaren loopt op `laatst_gezien_at`**, niet
   op `fetched_at`: een sectie of link die nog op de bron staat, wordt bij "al bekend" als
   gezien gemarkeerd en dus niet na 120 dagen gewist om daarna als "nieuw" terug te komen.
   Een `web_pagina`-sectie wordt vóór het hashen ontdaan van kaarten en teasers (links met
   blokken, "Lees verder", een datum-tijd), omdat die per fetch wisselen.
   `title` = `bron_kop`; `raw_content` = `bron_fragment`; modeltekst mag alleen in `summary` en
   `potential_impact` (de AI-editie, B10).
4. **Datum uit de bron**: RSS-`pubDate` mét tijd, JSON-LD `dateModified`/`datePublished` of
   `article:*`-meta, anders het moment van eerste zien (mét tijd). Nooit een modeldatum.
5. **Ontdubbelen op sleutel en exacte inhoud**, niet op titelgelijkenis: de Jaccard-dedupe op
   koppen viel voor de ingest weg (hij gooide bv. "inflatie juli" weg naast "inflatie augustus").
   Alleen wat werkelijk nieuw is, gaat naar de categorisatie.
6. **Een run legt altijd iets vast**: categoriseren en schrijven gaan per brok van 20, met
   een tijdbudget (75 s) en twee parallelle calls; het eerste brok loopt altijd, na het budget
   start er geen nieuw, en het restant (`uitgesteld`) komt de volgende run — de sleutel is
   server-bepaald, dus dat is idempotent. Zonder dit kon de eerste run na de wis (~145
   kandidaten) over de `maxDuration` van 300 s gaan en niets vastleggen.
7. **Eerlijke terugkoppeling**: `inserted` = rijen die de database bij de upsert teruggaf,
   `alBekend` = sleutel bestond al; per bron een oorzaak (`ok` · `leeg` · `geen_feed` ·
   `http_fout` · `doorverwezen_naar_fout` · `doorverwezen` · `adres_geweigerd` · `dns` ·
   `timeout` · `netwerk` · `geen_model` · `model_fout`), met `afgekapt` bij elke expliciete
   cap en `geweigerd` bij linkkeuzes.
8. **Ophalen is SSRF-veilig** (`lib/safe-url.ts`, `isVeiligeBronUrl`): het schrijfpad en elke
   fetch-hop eisen https, een DNS-naam (geen IP-literal, geen localhost/.local/.internal),
   geen eigen poort en geen inloggegevens. Redirects gaan handmatig, hoogstens 3, elke hop
   hertoetst en binnen dezelfde site als de geconfigureerde URL; anders `doorverwezen` en
   wordt er niets gelezen. De body wordt met een bytecap (2 MB) gelezen en de HTML-lezing is
   lineair (geen luie regex over het document). Restrisico: een publieke DNS-naam die naar een
   privé-adres resolvet (DNS-rebinding) vangt dit niet — daarvoor is resolve-en-pin nodig
   (open punt). *(Fase 2 haalde het laatste fetch-pad uit de duidingsstap weg; zie besluit 12.)*
9. **Tiebreak**: `loadNewsSourceArticles` en het /check-rapport sorteren `published_at` met NULL
   achteraan, dan `fetched_at`, dan `source_url`; het algemeen katern van de matcher (ADR 0172)
   beslist bij gelijke datum op duidingssoort en kop, niet op id (`MATCHER_VERSIE` 2). Dit lost
   bugkaart P2 op.
10. **Bronnenlijst één keer grondig bijgewerkt** (B28): niet-werkende bronnen verwijderd zonder
   per feed een vervanger te zoeken; redirects vervangen door hun eindadres; AOW kwam terug
   onder `/themas/…`. Ook DNB Algemeen nieuws en DNB Publicaties zijn weg: hun lijst komt uit
   JavaScript (0 artikel-links in de server-HTML, als themapagina alleen "Niet gevonden wat u
   zocht?"). Een link naar dezelfde pagina met alleen een andere query (filters als CPB's
   `?facet_author=`) is nooit een artikel.
11. **De oude bak wordt gewist bij de omschakeling** (B29, migratie `20260922161000`, alleen
   rijen zonder `bron_soort` en zonder verwijzing uit een schaduweditie, in één transactie die
   terugrolt als er een oude rij overblijft), ná het vastleggen van de vier P1-regressiegevallen met hun
   opnieuw opgehaalde bronfragment in `lib/krant/__golden__/bron-*.json`.

## Fase 2 — de duiding op het eigen fragment (22-09-2026)

Fase 1 gaf elke rij een eigen `bron_kop` + `bron_fragment`, maar de duidingsstap gebruikte ze
nog niet. Fase 2 doet dat wél, en is tegelijk de **aanvulling op ADR 0171** (het duidingscontract).

12. **De grondslag is uitsluitend `bron_kop` + `bron_fragment`** van de eigen rij. Nooit de hele
    pagina, nooit `raw_content`, nooit `summary` of `title`, nooit eerdere modeluitvoer. Daarmee
    vervallen de opties `runTekstByPaginaUrl` / `webPaginaUrls` / `haalVolledigeTekst` en het
    regelbron-ophaalpad. `lib/krant/regelbronnen.ts` is verwijderd, en in dezelfde fase óók
    `fetchWebContent` / `webTekstVoorDuiding` / `WEB_TEKST_MAX_TEKENS` uit `lib/news-sources.ts`:
    die hadden geen aanroeper meer, en een geëxporteerde fetch-helper met "gebruikt door de
    duidingsstap" in zijn commentaar is de kortste weg terug naar het pad dat deze fase juist
    sloot (security-review bevinding 4). **De duidingsstap doet daarmee zelf geen HTTP meer**;
    fase 3 bouwt zijn eigen helper op `fetchWebPage`. De kaart vroeg om `isWebItem` op `bron_soort` in plaats
    van op het URL-patroon; omdat de grondslag nu voor élke bronsoort dezelfde twee kolommen
    leest, **vervalt het onderscheid volledig** — dat is sterker dan de gevraagde variant en
    wordt door een bron-scan-test vastgelegd (`lib/krant/duiding.grondslag.test.ts`) in plaats
    van door een runtime-tak. Rijen zonder `bron_soort` (legacy) worden niet geduid; ze worden
    bij de omschakeling gewist (besluit 11). Het per-item ophalen van een detailpagina komt
    terug in fase 3, achter een security-run.
13. **`Datum:` komt alleen uit bronmetadata.** De prompt draagt een datum alleen wanneer
    `published_bron` `feed` of `meta` is; bij `eerste_gezien` staat er `Datum: onbekend`. Dit was
    de directe oorzaak van het P1-geval `bf458a7b`: het model zag `Datum: 2026-01-01` uit een door
    de web-extractie verzonnen `published_at` en schreef "op 1 januari 2026 gepubliceerd",
    terwijl de bronpagina nergens "januari" bevat.
14. **De samenvatting is nullable** (B27). Een lege samenvatting is een geldige uitkomst — "niets
    te melden" is een eerlijker antwoord dan een verplichte parafrase. De verplichte 2–3 zinnen
    waren de oorzaak van het meta-commentaar: het model beschreef zijn eigen invoer (~31/58
    samenvattingen bij handlezing). De kop die de lezer ziet is **altijd** de bronkop; het model
    levert geen kop meer, waarmee G4 structureel is opgelost in plaats van gecontroleerd.
15. **De tekstpoort (B26) scheidt lezerstekst van mechanisme.** Faalt een controle op de
    lezerstekst, dan blijft de rij `geduid` en wordt `samenvatting` `null`: de lezer krijgt
    **bronkop + link, zonder samenvatting**. Voor **mechanisme-params verandert er niets** — die
    degraderen zoals in ADR 0171 naar `mechanisme: null` + `duiding_fout`, los van de tekstpoort.
    - **Hard afgewezen** (de rij verdwijnt): schema, ongeldige/ongegronde ingangsdatum of
      deadline, een structureel ongeldige doelgroep, en **G6 op de doelgroep**
      (`doelgroep:ongegrond:<veld>`). Dat laatste is bewust fail-closed: een verzonnen doelgroep
      stuurt het item naar de verkeerde lezer, en de regel weggooien zou de doelgroep juist
      verbréden (leeg = iedereen).
    - **Gedegradeerd** (samenvatting weg, rij blijft): **G1** `g1:ongegrond-getal` /
      `g1:verwijzing`, **G2** `g2:datum`, **G3** `g3:meta`, **G6-samenvatting** `g6:lexicon`.
    - Levert het model zélf `null`, dan is de poort groen: dat is geen degradatie.
16. **De controles G1–G6.** G1 toetst elk getal in de samenvatting tegen het fragment, nu met een
    strengere kale-getalregel (een kale claim gront alleen op een kaal brongetal of een jaartal,
    niet meer op een €- of %-token). G2 toetst datums **als geheel** in plaats van losse cijfers,
    en eist dat een datum naast een publicatiewerkwoord gelijk is aan de bron-publicatiedatum.
    G3 is een gesloten patroonlijst tegen meta-commentaar (de brede lijst uit het 1F-onderzoek:
    28/58 met 0 vals-positieven). G6 toetst doelgroep en domeinkwalificaties tegen een **gesloten
    lexicon** naast `lib/krant/profiel-velden.ts` (`lib/krant/doelgroep-lexicon.ts`), waarvan een
    test volledige dekking afdwingt — een nieuwe doelgroepsleutel of -waarde zonder lexicon-ingang
    maakt de suite rood in plaats van stil ongepolicied door te glippen.
    `lib/nummer-grond.ts` is **uitgebreid, niet gewijzigd**: de strengere kale-getalmodus is
    opt-in, zodat de tweede consument (`lib/ai/local/local-news-guard.ts`, ADR 0080/B10)
    ongewijzigd blijft.
17. **De gebruikte grondslag wordt bewaard en gemeten.** `duiding.meta` draagt `grondslag`
    (`fragment` · `kop`, de vervanger van `brontekst`), `grondslagSha256`, `kopBron: 'bron'`,
    `modeltekst: false` en `poort` (`{ status, reden }`). **G1–G5 zijn daarmee bij elke lezing
    deterministisch af te leiden** op het meting-paneel van `/beheer/nieuws` — geen tellers
    (importtoets 3). **G7** (de wekelijkse steekproef van 20, poort ≤ 1 per 20, twee weken op rij)
    is géén berekening maar een registratie: hij staat in `app_settings` onder
    `krant_poort_steekproef` en wordt geschreven via `POST /api/admin/news-duiding/steekproef`
    (superadmin, zod, error-envelope). `app_settings` en `news_articles` stonden al op
    `VRIJ_LEESBAAR`, dus de ADR 0146-gate is **niet** verruimd.
18. **Geen migratie.** `duiding` is `jsonb` zonder shape-CHECK en de enige relevante constraint is
    `duiding_status <> 'geduid' or duiding is not null` — een gedegradeerde rij blijft gewoon
    `geduid` mét jsonb. `DUIDING_VERSIE` gaat naar 2; de bestaande versie-bump duidt v1-rijen
    opnieuw (herleiden, niet ophogen).

## Gevolgen

- Minder, maar echte artikelen; de LLM-editie op /nieuws verliest de parafrase-dubbels, de
  ongetoetste modelkoppen en de 404-links (het "lek op /nieuws" uit de besluiten).
- Een `web_pagina` levert bij de eerste run na de omschakeling één keer zijn huidige secties
  (hoogstens 12 per pagina), daarna alleen bij een gewijzigde sectie.
- Een `web_lijst`-item draagt in fase 1 de lijstregel als fragment en `eerste_gezien` als datum;
  de detailpagina ophalen (met zijn eigen `datePublished`) is fase 3, na de redirect-hertoets en
  een security-run.
- Fase 2 is gebouwd (besluiten 12–18) en getoetst op de vier vastgelegde P1-gevallen. Precies
  wat de regressietest bewijst, en niet meer: **twee van de vier tonen echte grondslag-winst**
  (`059ba103` en `41ed4267` kwamen er met de hele pagina dóór en vallen met het eigen fragment op
  G1), en **twee tonen een nieuwe controle** — `bf458a7b` valt onder beide grondslagen al op G3
  (meta-commentaar) en onder de eigen grondslag bovendien op G2; `7ce838c7` wordt onder beide
  afgewezen op G6, omdat die fout niet-numeriek is. De test assert dat onderscheid expliciet in
  plaats van het te verbergen achter een gelijke eindstatus.
- Deze fase **versmalt** de P1-klasse, ze sluit hem niet volledig. Wat dicht is: de grondslag is
  per rij afgebakend en draagt geen modeltekst. Wat open blijft: bij platte markup kan het
  fragment van een `web_lijst`-item de staarttekst van de vórige lijstregel bevatten
  (`extractLinks` begrenst aan de bovenkant op het einde van de vorige `</a>`, niet op het begin
  van dit item). Eén richting, één buur, en niet aangetoond op een echte bronpagina — maar het is
  dezelfde vorm, en fase 3 (de detailpagina per item) is ook hiervan de echte oplossing.
- Twee verwachte, bewust aanvaarde kosten van de poort, zodat de meting niet verkeerd wordt
  gelezen: G6 matcht op deelstring, dus een verbuiging ("aandeel" in de bron, "aandelen" in de
  samenvatting) degradeert — dat is `g6:lexicon` en géén verzonnen doelgroep. En "twee weken op
  rij" bij G7 betekent twee weken in de **gemeten reeks**: een week zonder artikelen staat niet in
  die reeks en overbrugt dus een kalendergat.
- De Krant wordt hierdoor dunner vóór ze dikker wordt: een `web_lijst`-fragment is vaak één regel
  linktekst, dus G1 degradeert daar vaker de samenvatting. Dat is eerlijk maar zichtbaar voor de
  lezer, en het is precies wat fase 3 (de detailpagina ophalen) repareert. Het aandachtspunt in
  `lib/architecture/archimate-concerns.ts` is daarom niet geschrapt maar herschreven naar dat
  restrisico, met een meetbare uitgang.
- De duidingsstap doet zelf geen HTTP meer. Het enige fetch-oppervlak van de Krant zit nu in de
  ingest; fase 3 voegt er één pad aan toe en gaat dáárom pas na een security-run.
- Verwant: ADR 0171 (duiding), 0172 (matcher en katern), 0173 (schaduweditie).
