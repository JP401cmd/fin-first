---
id: 0098-portefeuille-waardehistorie-prijsladder
title: 'Portefeuille-waardehistorie: een prijsladder in plaats van alleen marktkoersen'
status: aanvaard
date: 2026-08-10
elements: [as-vermogen, fn-aandelenregistratie]
---

# 0098 — Portefeuille-waardehistorie: een prijsladder

## Context

De holdings-pagina toonde geen enkel beeld van de waarde door de tijd. De
benchmarkgrafiek stond er wél, met AEX, MSCI World en S&P 500, maar meldde
eronder: *"Je eigen lijn ontbreekt nog. Voor je rendement over 1 jaar zijn
maandelijkse koerswaarderingen van je posities nodig."*

De bouwstenen leken aanwezig. `investment_holding_prices` bestaat, een dagelijkse
cron vult 'm, `lib/historical-prices.ts` kan bij Yahoo tot `max` terugvragen, en
de per-holding route `/api/holdings/[id]/value-history` replayt transacties al
naar een units-curve. Toch werkte het niet, om twee onafhankelijke redenen.

**Reden 1 — de benchmark las de verkeerde tabel.** `buildPortfolioHistory`
waardeerde uitsluitend op `valuations`. Op het referentie-account: 0 rijen, bij
109 posities. Elke maand kwam daardoor op `pricedFromHistory: false`,
`computeTwrSeries` gaf `null`, en de melding verscheen — terwijl de koersen wél
bestonden, alleen in een andere tabel.

**Reden 2 — het merendeel van een echte portefeuille noteert niet.** Van de 109
posities hadden er **14** een ticker die Yahoo kan oplossen (`MRVL`, `PLTR`,
`ADYEN.AS`, `VWRD.L`). De overige 95 dragen als "ticker" de brokeromschrijving:

```
AEX 485.9SPSOPENG
BNP GOUD TURBO LONG SL 2671.9407 STR 2619.5497 R 10
ADR ON BAIDU, INC. CLASS A
AEX-INDEX SL 247.00 HB 1.78 FN 239.1901 R 10.00 ING SPRINTER LONG
```

Dat zijn turbo's, sprinters, gedelistte namen en ADR's. Ze hebben allemaal een
ISIN, maar Yahoo indexeert niet op ISIN. Er komt dus nooit een marktkoers voor
die 95 — en dat zijn precies de **gesloten** posities, die de historie dragen.

## De keuze

Drie opties:

**A. Alleen echte koersen.** Zuiver: elke euro in de grafiek rust op een
waarneming. Maar 95 van de 109 posities vallen weg, dus de historische waarde
ligt structureel te laag — de curve zou suggereren dat de portefeuille jarenlang
vrijwel leeg was.

**B. Alleen transactieprijzen.** Snel te bouwen en volledig dekkend. Maar tussen
twee transacties beweegt de lijn niet mee met de markt; een positie die drie jaar
stil ligt tekent een vlakke lijn waar de koers verdubbelde. Dat is precies de
rechte-interpolatie die de bestaande code al als fout benoemt.

**C. Een prijsladder, met de dekking als onderdeel van het contract.**

## Besluit

We kiezen **C**. Eén plek beslist wat een positie op een peildatum waard was —
`lib/portfolio-value-history.ts` — in vaste volgorde van betrouwbaarheid:

| Trap | Bron | Wanneer |
|---|---|---|
| 1. `market` | slotkoers uit `investment_holding_prices`, datum ≤ peildatum | de ~14 noteerbare posities |
| 2. `transaction` | laatst bekende transactieprijs ≤ peildatum | turbo's, sprinters, delistings |
| 3. `cost` | gemiddelde kostprijs | positie zonder enige prijsobservatie |

Peildatums zijn de 1e van elke maand ná de eerste transactie, plus een slotpunt
op vandaag.

**Het essentiële deel van dit besluit is niet de ladder maar wat we ermee doen.**
Elk punt draagt `pricedFromMarket`: het aandeel van de waarde dat op trap 1 rust.
Dat is een veld in het contract, geen presentatiedetail, en de grafiek toont het
in gewone taal ("78% van de waarde is gewaardeerd op marktkoersen; de rest op de
laatst bekende transactieprijs"). Trap 2 en 3 doen dus niet alsof ze een
marktkoers zijn. Zonder dat veld zou C een nettere versie van B zijn: een lijn
die er precies uitziet, met onbekende hardheid.

## Wat NIET is samengevoegd

`buildPortfolioHistory` (benchmark) en `buildPortfolioValueHistory` (waardecurve)
replayen allebei transacties. Ze zijn bewust **niet** samengevoegd: de eerste
draagt `netFlow` — de externe kasstroom per maand, die de tijdgewogen return
nodig heeft om inleg van rendement te scheiden. De waardecurve heeft dat niet
nodig, en samenvoegen zou het rendementscontract wijzigen om een structuurwens.

Wat wél gedeeld is, is de **koersbron**: `investment_holding_prices` is nu ook in
de benchmark de primaire waardering (`valuations` blijft terugval). Dat lost
reden 1 op zonder de TWR-semantiek aan te raken.

De units en de kostprijs komen in beide gevallen uit
`computePositionFromTransactions` (ADR-loos, maar vastgelegd in de calc
"holdings-positie-aggregatie"): er is geen derde replay geschreven.

## Gevolgen

- **Een verse portefeuille heeft nog geen historie.** De dagelijkse cron schrijft
  alleen de nu-actieve posities weg. `POST /api/holdings/backfill-history` haalt
  die alsnog op voor de oplosbare tickers (range `max`). Dat is een expliciete
  actie, geen automatisme — het zijn tientallen externe verzoeken per gebruiker.
- **De dekking groeit vanzelf.** Elke dag die de cron draait voegt een
  trap-1-observatie toe, dus `pricedFromMarket` loopt op zonder verdere ingreep.
- **Een negatieve nettopositie telt als 0.** Meer verkocht dan gekocht volgens de
  bekende historie is geen short maar een gat in de historie; `holdings-sync.ts`
  klemt om dezelfde reden bij het opslaan.
- **Restrisico:** trap 2 kan bij een lang stilliggende, niet-noteerbare positie
  ver van de werkelijkheid liggen. Dat is zichtbaar (het drukt
  `pricedFromMarket`), maar niet corrigeerbaar zonder een koersbron die voor die
  instrumenten niet bestaat.

## Aanvulling (aug 2026) — de uitsplitsing die er al was

De motor rekende de waarde per positie per peildatum al uit; alleen de som
verliet de functie. Sinds de maandbalken-weergave op `/core/assets/holdings`
draagt elk punt óók `byHolding: { id, value, tier }[]` — dezelfde `value` en
dezelfde `tier` die de som voedden, niet opnieuw berekend.

Drie dingen zijn hier expliciet vastgelegd, omdat ze alle drie stil kunnen
breken:

- **De prijsladder verandert niet.** Trap 1/2/3 en `pricedFromMarket` zijn
  ongewijzigd. `tier` per positie is precies de trap waarop díé positie stond;
  daarmee kan het maanddetail per regel tonen wat de waardering droeg, in plaats
  van alleen het gewogen gemiddelde over de hele portefeuille.
- **De delen tellen cent-exact op tot het geheel.** `Σ round(value×100)` per punt
  is gelijk aan `round(marketValue×100)`; het afrondingsresidu landt op de
  grootste positie. Een balk en zijn segmenten mogen niet uit twee verschillende
  optellingen komen — anders wijkt de kassabon een cent van de balkhoogte af en
  is er geen manier om te zien welke van de twee de waarheid is.
- **De cap zit in de route, niet in de motor.** `GET /api/holdings/value-history`
  levert de top-12 per punt plus een `rest`-bucket `{ count, value }`. Dat is een
  weergavegrens tegen een payload die met historie × posities groeit — geen
  rekenkeuze. De motor blijft volledig.

De id's staan daarmee wél in de respons, waar de oorspronkelijke route ze
bewust weglaat. Dat is geen versoepeling: het maanddetail linkt door naar de
positie, dus het id is functioneel nodig, en de query is en blijft
`.eq('user_id', claims.sub)` bovenop RLS.
