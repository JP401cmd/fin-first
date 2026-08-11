---
id: 0099-benchmark-meet-het-waarneembare-mandje
title: 'Benchmarkrendement: meet het waarneembare mandje, niet alles of niets'
status: aanvaard
date: 2026-08-11
elements: [as-vermogen, sp-vermogen]
---

# 0099 — Het benchmarkrendement meet het waarneembare mandje

## Context

ADR 0098 maakte `investment_holding_prices` de primaire koersbron van
`buildPortfolioHistory`. Daarmee was de oorzaak weg die de benchmarkgrafiek leeg
hield — dacht iedereen. De feature bleef leeg.

De reden staat één regel verderop, in `computeTwrSeries`:

```ts
if (!snapshots.every(s => s.pricedFromHistory)) return null
```

`pricedFromHistory` is waar zodra **élke bijdragende positie** die maand een
koersobservatie had. Eén positie zonder koersbron zet de vlag op false, en één
zulke maand zet het complete venster op `null`.

Dat is precies één positie te streng. De meting tegen productie, 11 aug 2026:

| Gebruiker | Open posities | Mét koersbron | Waarde zónder koersbron |
|---|---|---|---|
| referentie-account | 14 | 13 | **€ 289** van € 27.925 |
| tweede account | 3 | 2 | € 40.000 van € 134.245 |
| drie overige | 1–2 | 0 | alles |

Op het referentie-account blankte dus **1% van de waarde** het rendement van de
andere 99%. En dit is geen aanloopprobleem dat vanzelf overgaat: de posities
zonder koersbron zijn turbo's, sprinters, ADR's en gedelistte namen die als
"ticker" de brokeromschrijving dragen (`AEX 485.9SPSOPENG`). Yahoo indexeert niet
op ISIN — er komt voor die instrumenten nooit een marktkoers. De alles-of-niets-regel
betekende in de praktijk: nooit een rendement, voor niemand.

## De keuze

**A. Alles-of-niets houden.** Zuiver, en de feature blijft permanent leeg. De
eerlijkheid is echte eerlijkheid, maar over een leeg scherm valt niets te leren.

**B. Onnoteerbare posities meewaarderen tegen een stand-in koers** (laatste
transactieprijs of kostprijs, de prijsladder van ADR 0098), met de dekking
erbij vermeld. Dekkend, en consistent met de waardecurve. Maar een stand-in
koers beweegt niet: die posities liggen elke maand vlak en **verdunnen** het
rendement richting nul. Op het tweede account (30% van de waarde zonder
koersbron) scheelt dat een derde van het getal. Dat is een fout getal met een
geruststellend bijschrift — slechter dan géén getal, want een leeg vak liegt niet.

**C. Meet het waarneembare mandje.**

## Besluit

We kiezen **C**. De tijdgewogen return rekent uitsluitend over de posities die
in díé maand een echte koersobservatie hadden:

```
r_t = O_t / (O_{t−1} + G_t) − 1
```

`O` is de waarde van het waarneembare deel, `G` zijn netto externe kasstroom.
Dat is geen benadering van het portefeuillerendement maar het **exacte**
rendement van een scherp afgebakend mandje — een echt getal over een echt deel.

Het scharnier zit in `G`. Naast de gewone aan- en verkopen boekt hij ook de
posities die het mandje **in- of uitstappen**: wordt een positie voor het eerst
waarneembaar (de cron pikt haar op, of `current_price` geldt in de lopende maand
als observatie), dan komt haar volledige waarde erbij als instroom; valt de
koersbron weg of wordt de positie verkocht, dan gaat haar vorige waarde eraf.
Zonder die twee boekingen zou het aangroeien van de koersdekking zich voordoen
als koerswinst — exact de fout (inleg gelezen als rendement) die deze module
oorspronkelijk moest repareren.

De hardheid reist mee als contract, net als `pricedFromMarket` in ADR 0098:
`observedShare` is het **laagste** aandeel van de waarde dat in enige gemeten
maand op een echte koers rustte. Bewust de zwakste maand en niet de laatste: een
TWR is het product van zijn segmenten, dus één dunne maand maakt de hele keten
zo hard als díé maand. De laatste maand meten zou bovendien altijd ~100%
opleveren, omdat `current_price` daar als observatie geldt.

## Twee regels die er meteen bij moesten

Zodra de motor weer getallen geeft, worden twee randgevallen zichtbaar die
daarvóór achter de lege staat schuilgingen. Ze zijn hier meegenomen omdat
"geen rendement" vervangen door "verkeerd rendement" erger is dan de bug zelf.

- **Een volledig verkochte maand telde niet mee.** Zo'n maand levert
  `totalValue = 0` én `totalCost = 0` op en werd niet als snapshot gepusht —
  inclusief haar negatieve kasstroom. De keten knoopte de maand vóór de verkoop
  rechtstreeks aan de herkoop, met de verkoop buiten de noemer: bij een
  constante koers las dat als **−50%**. De reeks loopt nu door zodra hij begonnen
  is, en een maand zonder kapitaal onder risico is 0% (basis 0 én eindwaarde 0),
  niet −100%.
- **Een opname groter dan de startwaarde** (`basis < 0`) blijft onmeetbaar, maar
  met een eigen reden (`unmeasurable_window`) in plaats van dezelfde melding als
  ontbrekende koershistorie. De gebruiker kreeg anders het advies koersdata op te
  halen voor een probleem dat daar niet aan lag.

## Waar de meting begint

De TWR start bij de eerste maand met een waarneming; alles daarvóór is een
blinde vlek, geen 0%-rendement. Ligt die start ná de gekozen periode — de
dagelijkse cron schrijft pas sinds mei 2026 — dan schuift het **hele** venster
mee, inclusief de indices (`windowClipped`). Anders staat een index van twaalf
maanden naast een portfolio van drie en heet het verschil "alpha": dezelfde
vensterfout die deze module oorspronkelijk repareerde, langs een nieuwe weg.

Om diezelfde reden delen de API-route en de motor nu één
`resolveComparisonWindow`. De route haalde de indexreeks op vanaf de
periodestart, terwijl de motor bij te weinig snapshots terugviel op de volledige
historie; dat verruimde venster knipte daarna niets meer weg.

## Gevolgen

- **Vier van de vijf productieaccounts kunnen weer een rendement tonen** zodra er
  twee maanden koershistorie zijn. Het vijfde (geen enkele positie met koersbron)
  blijft leeg, en terecht.
- **Het getal draagt een dekkingspercentage.** Op het tweede account zal dat
  rond de 70% liggen. Dat is geen disclaimer maar de kern van de mededeling.
- **De dekking groeit vanzelf** met elke dag dat de cron draait, en sprongsgewijs
  na `POST /api/holdings/backfill-history`.
- **Restrisico:** een mandje van 13 posities kan een ander rendement laten zien
  dan de portefeuille als geheel voelt. Dat is zichtbaar gemaakt, niet opgelost —
  oplossen vraagt een koersbron voor instrumenten die er geen hebben.
- **Nog niet gerepareerd:** `portfolio-summary.tsx` herberekent het eurobedrag
  lokaal uit het tijdgewogen percentage maal de huidige waarde, en toont op
  "Alles" een geldgewogen getal onder hetzelfde label. Beide worden zichtbaar
  nu er weer percentages verschijnen; ze staan als vervolgronde geregistreerd.
