---
id: 0107-de-fire-loader-is-geknipt-in-rauw-en-afgeleid
title: 'De FIRE-loader is geknipt in een rauwe en een afgeleide laag, en de FIRE-run kent het perspectief'
status: aanvaard
date: 2026-08-27
elements: [as-planning, as-vermogen, fn-toekomstplannen]
---

Een testpanel legde `/overzicht` en `/toekomst` naast elkaar en kreeg op dezelfde
vraag verschillende antwoorden: een andere vrijheidsleeftijd per scherm, en op
`/toekomst` stond "NETTO VERMOGEN €1.731.640" vijf regels boven "€1.619.700 netto
vermogen". Drie losse oorzaken onder één klacht.

## Wat er speelde

**Twee noemers voor één metriek.** De canonieke FIRE-run
(`computeHorizonFireSim`) haalde zijn invoer uit `loadHorizonData`. Diezelfde
loader moest óók `freedomPct` en de vrijheids-pijler van het gezondheidsgetal
opleveren — maar kón de kernel niet aanroepen, want dat is oneindige recursie.
De uitweg die ooit gekozen is, was een tweede, closed-form benadering:
`computeFireTarget` + `inclHomeTargetFromScalar`. Die stond niet naast de kernel
in een vergeten hoekje; ze voedde de `/overzicht`-hero, het gezondheidsgetal, de
score-modal en de gezondheidsbadge op `/toekomst`, terwijl de widget-rail, de
`/toekomst`-hero, de Kern en beide Fins op de kernel zaten. De gemeten afstand
tussen die twee noemers stond al in de rekenmotor-catalogus: ~€108k op het
FIRE-doel en 8,6 procentpunt op het vrijheids-%.

Dat is geen weergavefoutje. Twee motoren die dezelfde vraag beantwoorden zijn
per definitie toekomstige drift, en hier was die drift binnen één scherm
zichtbaar.

**Een peilmoment dat niet benoemd werd.** De kassabon boven de tijdas las
`row.netWorth` — per contract de EINDstand van een projectieblok — onder een
label dat het huidige kalenderjaar noemde. De zin eronder las het netto vermogen
van vandaag. Op blok k=0 scheelt dat precies één jaar rendement en inleg: +6,9%.
De inflatiefactor is bij k=0 exact 1,0, dus de deflator verhulde het verschil in
plaats van het te veroorzaken.

**Een badge zonder eenheid.** Naast de Marktcheck-pil stond `4,1%`. Dat is geen
kans maar een RENDEMENT-MARGE: 4,1 procentpunt per jaar speling voordat het plan
omvalt. Naast een widget die "99% succeskans" zegt, leest hetzelfde teken als een
catastrofale slaagkans terwijl het juist een gezonde marge is — de betekenis
draait 180 graden. Het label "Marktcheck" was bovendien `hidden sm:inline`, dus
op een smal scherm bleef een kaal getal over.

## Het besluit

**De loader wordt geknipt, de benadering vervalt.** `lib/horizon-data-loader.ts`
splitst in twee lagen:

```
lib/horizon/raw-data-loader.ts   queries + rauwe afleidingen, roept de kernel NIET aan
        ↑                                        ↑
lib/fire-target-shared.ts                 lib/horizon-data-loader.ts
(computeHorizonFireSim)                   (raw + kernel = afgeleide bundel)
        ↑________________________________________|
```

Eén richting, geen module-cyclus. De recursie is daarmee structureel weg, niet
omzeild. Het importpad voor consumenten blijft `@/lib/horizon-data-loader`; de
rauwe laag is een implementatiedetail dat via een doorgeef-luik beschikbaar
blijft voor wie de kernel-cijfers niet nodig heeft.

De closed-form benadering verdwijnt niet, maar zakt naar de plek waar ze hoort:
`freedomBasis.scalarRequiredPortfolioExclHome`, uitsluitend de terugval voor de
tak waarin de kernel NIET KÁN draaien — geen geboortedatum, negatief vermogen,
mislukte run. Zolang de kernel een doel oplevert, wint de kernel. Dat is exact de
gate die `dashboard-data-loader.ts` al hanteerde, zodat beide bundels per
constructie dezelfde noemer dragen. `HorizonPageData.fireEngine` maakt zichtbaar
welke tak gedraaid heeft.

**De FIRE-run wordt perspectief-bewust.** `computeHorizonFireSim(supabase,
perspective)` keyt zijn `cache()` op het perspectief. Dat is meer dan een
doorgeef-argument: de kernel rekent per ASSET-RIJ, niet op
`effectiveInput.totalAssets`. Zonder perspectief-rijen zou een huishoud-run stil
op de persoonlijke potten draaien en dus hetzelfde antwoord geven als de eigen
blik. De rauwe laag levert daarom `fireAssets`/`fireDebts`: de perspectief-rijen
met het huishoud-aandeel toegepast op `current_value` en
`monthly_contribution`. `net_worth_inclusion_pct` blijft ongemoeid — dat past de
adapter zelf toe.

**De run weigert rijen die hij niet kan modelleren.** Staat het privacyniveau van
de partner op "totalen", dan levert `household_partner_items` één synthetische
aggregaatrij met alleen een naam en een totaalbedrag — geen `asset_type`, geen
rendement, geen inclusion-percentage. Voor een SOM is dat prima (zo werkte de
benadering), maar de kernel rekent per pot: hij zou dat bedrag in een
willekeurige categorie met een verzonnen rendement laten landen en er een
FIRE-leeftijd op bouwen. Liever geen kernelantwoord dan een plausibel ogend
verzonnen antwoord: de rauwe laag markeert dit met `fireRowsComplete: false`, de
run geeft `null` terug, en de afgeleide laag valt terug op de benadering op de
perspectief-totalen — zichtbaar via `fireEngine: 'scalar'`.

**Grens die bewust blijft staan.** De uitgavenkant blijft in huishoud- en
partnerblik persoonlijk: `monthlyExpenses` en `yearlyMustExpenses` komen uit de
eigen transacties en budgetten. Dat was óók de grondslag van de benadering die
hier vervangen wordt, dus de scheefheid is geërfd, niet geïntroduceerd — ze is nu
alleen exact in plaats van benaderd. `loadDashboardData` (widget-rail, briefing,
deelbare vrijheidskaart) blijft in zijn geheel persoonlijk; er een
perspectief-FIRE-doel in mengen zou een huishoud-noemer onder een persoonlijke
teller zetten, wat erger is dan het huidige verschil. En `/toekomst` blijft
end-to-end persoonlijk: de client-run haalt zijn eigen asset-rijen op, dus de
pagina géén perspectief meegeven is hier de consistente keuze — anders zou de
server-hero huishoud zijn en de curve eronder persoonlijk. Huishoud-uitgaven en
de perspectief-wiring van `/toekomst` zijn belegd bij de vervolgkaarten.

**De first paint van `/toekomst` komt uit dezelfde motor.** De voorlopige
vrijheidsleeftijd kwam uit `net_worth_snapshots.fire_age`, in de code omschreven
als "het laatst weggeschreven kernel-antwoord". Dat klopte niet: die kolom wordt
geschreven met de rauwe scalar-lus. De eerste paint toonde dus stelselmatig een
andere leeftijd dan de worker die erna landde. De voorlopige bron is nu de
server-kernelrun (`HorizonPageData.fireAgeFractional`); de bron heet daarom
`server-kernel` in plaats van `snapshot`. De status blijft "voorlopig" — de
client-run met verse rijen en actieve schuifjes kán er nog van afwijken, maar
niet meer omdat er een andere rekenwijze onder ligt.

**De snapshots worden niet gebackfilld** (eigenaar-besluit 26-08-2026). Historie
herschrijven met aannames die op die datum niet golden is erger dan een
zichtbare breuk. Overweeg in plaats daarvan een `engine_version`-kolom op
`net_worth_snapshots`, zoals `score_version` bij de resilience-score, zodat de
trendlijn de breuk kán benoemen. Dat is een aparte kaart.

**Eén peilmoment op de kassabon.** De bar leest nu `row.startNetWorth` — de stand
ÓP die leeftijd, het begin van het blok. Daarmee klopt het bedrag per constructie
met het leeftijd- en jaarlabel ernaast, en is k=0 letterlijk het bedrag van
vandaag: hetzelfde getal als de zin eronder. Het peilmoment staat er bovendien
bij ("nu" / "begin 2031") in plaats van impliciet te zijn.

**Elke marge draagt haar eenheid.** `margeKort` geeft `4,1 %pt/jr` in plaats van
`4,1%`, en de eenheid zit ín de functie zodat er geen weergaveplek bestaat waar
hij weg kan vallen. Het pil-label blijft staan zolang de datawaarde er staat. De
metriek-woordenschat is vastgelegd in `lib/horizon/marktcheck-copy.ts`:
kans-metrieken dragen het woord "kans" en een kaal procentteken, marge-metrieken
dragen `%pt/jr`. De zinnen blijven bewust jargonvrij — die dragen hun eigen
context.

**De huishoudroute rekent per gebruiker.** `app/api/household/fire-projections`
draaide op `computeFireProjection` zonder parameters, dus op de constanten
`DEFAULT_RETURN` en `NL_SWR`, ongeacht wat de gebruiker zelf had ingesteld: een
tweede motor én een vaste financiële aanname buiten de params-laag. De route
draait nu op `computeScalarFireRange` met `resolveFireParamsWithAssumptions` per
profiel, en de projectie is de "verwachte" tak ván de band — één run in plaats
van twee sommen die uit elkaar kunnen lopen.

## Wat dit kost

Het gezondheidsgetal verschuift zichtbaar voor iedereen met een eigen woning: de
vrijheids-pijler stapt van de benadering naar de kernelnoemer. Dat is precies het
effect dat de rekenmotor-catalogus bij ADR 0034 al beschreef. Communiceerbaar,
maar het is een sprong — geen stille correctie.

Elk oppervlak dat `loadHorizonData` aanroept betaalt nu één kernel-solve, waar
dat er nul waren. Op `/overzicht` is dat gratis: de run wordt daar toch al
gedeeld met de bundel. Op de belasting-, bezittingen- en bibliotheekpagina's is
het nieuw. Wie daar geen kernel-cijfers nodig heeft, kan `loadHorizonRaw`
rechtstreeks gebruiken.

## Wat hard bleef

De oracle-pariteit. Deze wijziging raakt invoer-assemblage en consumptie, geen
bestand onder `lib/horizon-kernel/{tables,engine,solver,gap,wrappers}`.
`test/horizon-oracle` en `lib/horizon-kernel/parity` draaien byte-groen (21
bestanden, 736 tests). Wordt een van die suites rood, dan is er per ongeluk in de
kern gesneden en moet de wijziging terug.
