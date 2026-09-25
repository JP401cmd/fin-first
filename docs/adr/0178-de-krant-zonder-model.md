---
id: 0178-de-krant-zonder-model
title: 'De Krant zonder model: verlies melden, deterministisch terugvallen, de lezer degraderen'
status: aanvaard
date: 2026-09-25
elements: [as-nieuws, sp-nieuws, do-krant, t-supabase]
---

Als het model wegvalt, blijven de AI-stappen van de Krant **niet-fataal** — dat blijft ongewijzigd
— maar drie dingen komen erbij. (1) Een run die liep zonder alles op te leveren meldt zich als
**`partial`**, niet als `success`. (2) Een lijstpagina valt **deterministisch terug** op de eerste
links die de server zelf las, in plaats van de hele bronklasse te laten verdwijnen. (3) De lezer
krijgt de **bronkoppen met hun links** in plaats van een lege Krant — het B26-patroon (ADR 0176)
één laag hoger. En (4) een **providerstoring kost een artikel geen duidingspoging**, want zij zegt
niets over dat artikel.

## Context

Op 24-09-2026 rond 18:00 liep het Anthropic-tegoed leeg. De bronlaag hield stand: `bron_kop`,
`bron_fragment` en `source_url` bleven geschreven, precies zoals ADR 0176 het bedoelde. Wat
daarboven zat, viel om — en viel *stil* om.

De cron-run van 25-09-2026 07:23 landde in `job_runs` als `status: 'success'`, `error: null`,
terwijl de summary zei: `duiding {geduid: 0, mislukt: 2}` en `perSoort.web_lijst: 0` — waar 24 sep
nog 33 stond. In `app_settings.news_source_health` stonden **alle zeven** `web_lijst`-bronnen (AFM
×2, CBS ×2, CPB ×2, ECB) op `oorzaak: model_fout, items: 0`. De pagina's waren gewoon opgehaald;
alleen het oordeel ontbrak. In `error_logs`: 8× `ai:nieuws_ingest` en 2× `ai:nieuws_duiding`,
allemaal *"Your credit balance is too low"*.

Drie gebreken, in drie verschillende lagen, met dezelfde vorm: **de bronlaag had genoeg om iets
te leveren, en er werd niets geleverd.** De eigenaar ontdekte het door de app te openen.

## Besluit

### 1. `job_runs` kent een derde uitkomst: `partial`

Migratie `20260925120000_job_runs_status_partial` verbreedt de CHECK naar
`('success', 'partial', 'error')`. `bepaalIngestUitkomst` (`lib/news-ingest.ts`) leidt de status
af **uit de weggeschreven uitkomst** (`summary` + `health`), niet uit een teller die tijdens de
run wordt opgehoogd — zo kan de status niet afwijken van wat er werkelijk gebeurde.

Drie triggers, bewust smal (een te brede poort wordt binnen een week genegeerd):

- **De duiding hield rijen in handen en duidde er niets van.** `pogingen = geduid + afgewezen +
  mislukt`. `overgeslagen` en `wacht` zijn **uitstel**, geen verlies: die rijen komen terug.
- **Een hele bronklasse viel weg.** Zijn bronnen van een soort bevraagd en leverden ze samen nul,
  dan is die klasse weg. Eén falende bron naast een werkende van dezelfde soort triggert niets.
- **Een bron leverde wél, maar zonder AI-oordeel** (`isTerugvalOorzaak`). Deze derde trigger is
  geen verfijning maar een noodzaak, en ze is er pas bij de eindreview van 25-09-2026 in gekomen:
  **maatregel 2 hieronder maakte de tweede trigger blind.** De terugval vult `items` op, dus "de
  klasse viel weg" vuurt niet meer. Valt `getModel` helemaal om (kill-switch, ontbrekende sleutel),
  dan is er geen duidingsmodel — nul pogingen, dus trigger 1 zwijgt — én geen keuzemodel —
  terugval, dus trigger 2 zwijgt. Zonder deze derde trigger meldde een run met **nul AI** zich
  groen: precies het defect waarvoor dit hele besluit bestaat, opnieuw ingebouwd door de
  maatregel ernaast. De les is algemener dan dit geval: twee maatregelen die op hetzelfde signaal
  aangrijpen moeten op hun *interactie* getoetst worden, niet alleen elk apart — beide waren
  afzonderlijk correct én getest.

`partial` **alarmeert bewust niet**: alleen `status: 'error'` vuurt `alertCronFailure`. Een poort
die elke geweigerde AI-call meldt, wordt genegeerd. De zichtbaarheid zit op `/beheer/jobs` (eigen
band met de verlies-regels) en `/beheer/nieuws`. `bank_sync_log` kende deze les al.

Gevolg voor de stiltebewaking: `loadLastSuccessByJob` en `lastSuccessAtFor` tellen `partial` mee
als "draaide". S2b meet of de taak nog loopt, niet of hij alles opleverde; die twee signalen door
elkaar laten lopen zou een taak die gewoon draaide als *achterstallig* melden.

### 2. Een lijstpagina valt deterministisch terug

`terugvalLinks(links, TERUGVAL_MAX_PER_LIJST)` neemt de eerste vier links in **paginavolgorde**.
`extractLinks` heeft dan al gefilterd: alleen de hoofdinhoud (nav/header/footer/aside/form
weggeknipt), alleen dezelfde site, linktekst ≥ 12 tekens, ontdubbeld. Een overzichtspagina zet
zijn nieuwste items bovenaan, dus "de eerste N" is de beste server-bepaalde benadering van "de
meest recente" die zonder model te maken is. Elke andere heuristiek (datum uit het fragment,
woorden in de linktekst) kan stil de verkeerde kant op vallen; deze niet.

Vier en niet acht (de modelcap): de terugval kan geen relevantie beoordelen, dus elke extra link
is een gok die de artikelbak vult. Zeven lijstbronnen × 4 = 28 rijen per dag tijdens een storing.

**ADR 0176 blijft onverkort.** Sleutel, kop en fragment komen uit de door de server gelezen link;
er komt geen modeltekst aan te pas. De terugval versterkt die garantie, ze verzwakt haar niet.

Wat ze wél wegneemt, is een **impliciete zeef**: het model koos niet alleen op relevantie, maar
bepaalde daarmee ook wélke same-site link werd opgeslagen. Die zeef is in de terugval weg. De
hostgrens houdt stand (`extractLinks` laat alleen http(s) op de host van de *geconfigureerde*
bron-URL door, en voor een `web_lijst` haalt de server de gekozen link nooit zelf op), maar een
**open redirector op het eigen domein** (`https://bron.nl/uit?url=https://elders`) zou gegarandeerd
bovenaan de paginavolgorde meegaan en via maatregel 3 zónder enig model ertussen als klikbare
bron bij de lezer komen. `terugvalLinks` weert daarom de doorstuur-**vorm** (`isDoorstuurVorm`):
een absolute URL in pad of query, ge-escaped of niet. Bewust een vormtoets en geen lijst van
parameternamen — de naam varieert, de vorm niet. Gevonden in de security-review van 25-09-2026.

Het onderscheid dat de hele terugval draagt: **`ok: true` met een lege keuze is een oordeel** ("geen
van deze links is een artikel") en wordt gerespecteerd. Alleen `ok: false` en "geen model" vallen
terug. Twee nieuwe oorzaak-codes — `terugval_geen_model` en `terugval_model_fout` — houden dat op
`/beheer/nieuws` zichtbaar; zonder die codes leest een gedegradeerde run als een gewone.

### 3. De lezer krijgt bronkoppen, geen lege Krant

`bronkoppenEditie` (`lib/news-item.ts`) bouwt uit de al geladen bronartikelen een editie van kop +
link: **geen `summary`, geen `personalImpact`**, `impactType: 'relevant'`, `impactScore: 1`. Beide
lege velden zijn het eerlijke antwoord — tekst zou een bewering zijn die niemand deed en die niet
op de bron te gronden is. `RelevanceBlock` en de samenvattingsalinea's renderen niet bij lege
tekst, zodat er geen kader met een kop boven een lege alinea blijft staan.

Dit is **precies het B26-patroon** (ADR 0176: de tekstpoort degradeert lezerstekst naar bronkop +
link, en dat is een geldige uitkomst, geen storing), met dit verschil dat de degradatie hier niet
per artikel maar voor de hele editie geldt.

De noodeditie wordt **niet gecached** — niet server-side (`setCachedNews`), niet in de
browsercache — en `recordAiUsage`/`markUsedArticles` blijven achterwege. Het is een noodeditie,
geen editie: het eerstvolgende bezoek probeert gewoon weer een echte generatie. De lezer ziet één
regel uitleg, want een onverklaarde kale koppenlijst leest als een kwaliteitsval.

Alleen als er géén bronartikelen zijn, blijft de foutstaat het eerlijke antwoord.

### 4. Een providerstoring kost geen duidingspoging

`duiding_status = 'mislukt'` werd al automatisch opnieuw geprobeerd — `WACHTENDE_STATUSSEN =
['wacht', 'mislukt']`, tot `DUIDING_MAX_POGINGEN = 3`. Het gebrek zat elders: de storing van 24
sep zette twee rijen op poging 1, en elke volgende run zou op hetzelfde lege tegoed stuiten. Na
drie runs stonden die artikelen **permanent op `afgewezen`** — weggegooid om een oorzaak die niets
met het artikel te maken had, en niet terug te draaien zonder handmatige actie.

De pogingenteller bestaat om een rij te stoppen die het model structureel niet aankan. Daarom:
`isProviderStoring(err)` leest `classifyProviderError` (ADR 0132) terug en laat de teller staan bij
`refused` (tegoed op, sleutel ongeldig) en `transient` (rate limit, 5xx, netwerk, time-out). De
rij krijgt `duiding_fout: 'provider'` en wordt nooit afgewezen. `unknown` telt bewust **wél** als
poging: een niet-herkende fout kán aan het artikel liggen, en de teller is het vangnet daarvoor.

**De coulance is begrensd in tijd, niet in aantal.** `classifyProviderError` geeft `refused` voor
élke niet-retrybare `APICallError` — dus ook voor een 400 die door de payload van díe ene rij komt
(een contentfilter-weigering). Zonder grens zou zo'n rij eeuwig herhaald worden, want haar teller
loopt nooit op. Splitsen op statuscode kán niet: de tegoedstoring van 24 sep **was zelf een 400**
("Your credit balance is too low"), dus "400 telt als poging" zou het oorspronkelijke defect
terugbouwen. Daarom `PROVIDER_COULANCE_DAGEN = 30`, gemeten vanaf `fetched_at`: een echte storing
duurt uren tot dagen en valt daar ruim binnen, terwijl een rij die na een maand nóg op
providerfouten stuit geen storingsslachtoffer is — en dan bovendien buiten het editievenster valt,
dus geen lezerswaarde meer heeft. Zo loopt de wachtrij gegarandeerd leeg. Beide reviews van
25-09-2026 wezen dit gat aan.

## Gevolgen

- **Restrisico, bewust aanvaard:** houdt een providerweigering weken aan, dan groeit de
  duidingswachtrij in plaats van leeg te lopen — tot `PROVIDER_COULANCE_DAGEN` de rijen alsnog
  laat uitlopen. Dat is de juiste ruil — die rijen zijn herstelbaar zodra het tegoed terug is —
  en het is zichtbaar, want zo'n run landt als `partial`.
- **De noodeditie voedt geen lus en stelt geen vraag die niemand kan beantwoorden.** Op een
  bronkop-bericht (`BRONKOP_ITEM_PREFIX`) verbergt de lezer-UI twee acties. "Minder hierover" zou
  een échte stem leggen op de rubriek, terwijl die bij een ongecategoriseerd artikel de terugval
  `'macro'` is; die stem demoot `'macro'` daarna acht weken in de *echte* edities — een
  gebruikersoordeel dat de gebruiker nooit gaf. "Bespreek met Fin" zou een prompt met een lege
  samenvatting sturen, en juist in de situatie die deze editie veroorzaakt is Fin zelf
  onbereikbaar. "Gelezen" blijft wél staan: dat gaat over dít bericht, niet over een rubriek.
- **De terugval haalt links binnen die het model zou hebben overgeslagen.** Dat is de prijs voor
  een bronklasse die blijft leven. De duidingspoort en de editie-selectie filteren daarna alsnog
  op inhoud, en een `web_lijst`-fragment is vaak één regel linktekst — dus G1 degradeert die items
  vaak naar bronkop + link. Dat sluit aan op het restrisico dat ADR 0176 al benoemt, en 1F fase 3
  (de detailpagina per item ophalen) is ook hier de echte oplossing.
- **Volgorde bij de deploy is hard:** migratie `20260925120000` moet vóór de code live staan.
  Zonder verbrede CHECK faalt elke `partial`-insert. Let op de precieze faalvorm, want die is
  erger dan ze lijkt: **supabase-js werpt niet bij een DB-fout, hij geeft `{ error }` terug**, dus
  een `try/catch` rond de insert vangt een 23514 níet en de eerste versie van `recordJobRun` las
  dat retourobject helemaal niet. Je verloor dan niet de statuswaarde maar de **hele `job_runs`-
  regel** — `/beheer/jobs` ziet niets, `loadLastSuccessByJob` vindt niets, en de stilte-sweep meldt
  na `maxAgeHours` een uitgebleven taak die gewoon draaide. Precies het onware signaal dat dit
  besluit wegneemt. Daarom leest `recordJobRun` de fout nu, logt hem, en valt bij een mislukte
  `partial`-insert één keer terug op `status: 'success'` mét de reden in `error` — een in deze
  tabel bestaande, bewust niet-alarmerende vorm. De nuance gaat dan verloren, de regel niet.
  De leeskant is in beide richtingen veilig: `.in('status', ['success','partial'])` matcht niets
  extra zolang er geen partial-rijen zijn, dus "migratie toepassen, daarna deployen" volstaat en
  een code-rollback is niet nodig.
- **Voor de meting van B30** (Krant K1) betekent 25 sep geen reset maar een gat in de reeks: ADR
  0176 leest "twee weken op rij" als twee weken in de *gemeten* reeks.
- Verwant: ADR 0132 (provider-foutclassificatie), 0171 (duiding), 0176 (wat is een artikel), 0060
  (cron-bewaking).
