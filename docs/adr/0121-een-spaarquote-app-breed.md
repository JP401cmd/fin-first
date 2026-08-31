---
id: 0121-een-spaarquote-app-breed
title: 'Eén spaarquote, app-breed: de effectieve quote is het getal, de 6-maands quote is een meting'
status: aanvaard
date: 2026-08-31
elements: [as-budget, as-transacties, fn-budgetteren]
---

# 0121 — Eén spaarquote, app-breed

## Context

Op een productie-account van de eigenaar (schermafdrukken 31-08-2026, grondslag
"uit je budgetten") toonden vier oppervlakken **drie verschillende percentages voor
één grootheid**:

| Oppervlak | Getal | Grondslag |
|---|---|---|
| `/overzicht/cashflow` instellingen-blok | 30 % | effectief ("uit je budgetten") |
| `/overzicht` hefboomkaart "Op koers met sparen" | 30 % | effectief |
| forecast-kaart "SPAARQUOTE (6m)" | 9,5 % | rauwe 6-maands transactiemeting |
| spaarquote-widget | 9,5 % (+ een €-bedrag op die meting) | rauwe meting |
| doelkaart "Spaarquote naar 10 %" | 5,8 % | **een vierde, eigen berekening** |

De forecast-pagina was daarbij intern tegenstrijdig: bovenaan stond het maandelijks
netto-overschot — een bedrag dat op datzelfde scherm neerkwam op ~30 % van het
inkomen — en twee kaarten verderop stond 9,5 %. Twee grondslagen, één rij, geen
enkel label dat het verschil benoemde.

De 5,8 % op de doelkaart was geen grondslagkwestie maar een **echte drift**.
`computeParameterSavingsRatePct` (`lib/goal-current-value.ts`) beloofde in zijn
docstring letterlijk "DEZELFDE grondslag als de spaarquote-widget", maar
**spiegelde** de loader-formule ("spiegelt `lib/horizon-data-loader.ts`") in plaats
van hem te consumeren. De kopie week op drie punten af: geen transfer-filter
(eigen-rekening-overboekingen telden mee in teller én noemer), geen extrapolatie
bij < 6 maanden historie, en geen profiel-/net-vermogen-delta-terugval.

ADR 0103 legde al vast dát de spaarquote de gekozen grondslag volgt. Wat het niet
vastlegde: **welk van de twee getallen een oppervlak toont**. Vier oppervlakken
kozen de meting, drie de effectieve quote, en één rekende zijn eigen.

## Besluit

De **effectieve, grondslag-geresolveerde spaarquote** —
`resolveSavingsSource(...).effectiveSavingsRatePct` — is **het** spaarquote-getal
op elk oppervlak van de app.

Een quote die als **meting** wordt getoond, mag blijven — maar uitsluitend waar
hij expliciet als meting gelabeld is, mét zijn venster in de tekst. Na dit besluit
zijn dat drie plekken:

1. de **transactie-kassabon** in het instellingenblok — daar verklaart de rauwe
   6-maands quote (`savingsRate6m`) de bedragen die eronder staan;
2. de **check-in-gespreksstarters** — elke zin draagt "6-maands" of "over zes
   maanden";
3. de **geldstroom-gauge** op `/overzicht/transacties`
   (`components/overview/transacties/geldstroom-gauge.tsx`, gemount via
   `transacties-analyse.tsx`) — die toont een **periode**-quote over het door de
   gebruiker gekozen venster (`summarizeFlow` in `lib/transaction-insights.ts`,
   `savingsRateFromAggregates(income, expense, 0)`; bewust zónder
   aflossingscorrectie, de ADR 0020-carve-out) en draagt zijn `windowLabel` op de
   kaart. Dat is een ander soort uitspraak dan "je spaarquote" — hij mag alleen
   nooit zónder dat venster-label verschijnen.

Elke andere weergave leest de effectieve quote.

*Opruimkandidaat, niet verwijderd:* `components/overview/transacties-geldstroom.tsx`
bevat een tweede, **ongemounte** variant van die gauge — alleen zijn eigen test
verwijst er nog naar. Buiten de scope van dit besluit; genoteerd zodat hij bij een
volgende opruimronde niet als "vierde meting-oppervlak" wordt aangezien. Bij een kaart hoort ook het
bijbehorende bedrag: `effectiveMonthlySavings` = `baseAnnualSavings / 12`, dus
exact de €-stroom waarmee de FIRE-prognose rekent — daarmee geldt op elke kaart
`bedrag / inkomen == quote`.

### Elke kaart benoemt zijn grondslag

De harde voorwaarde uit ADR 0103 geldt onverkort en wordt hier uitgebreid: een
oppervlak dat de spaarquote toont, toont ook wáár hij op rust. Die woorden wonen in
`lib/budget-basis.ts`, in **twee vormen**, omdat één vorm niet volstond:

| Vorm | Voorbeeld | Waarvoor |
|---|---|---|
| `BASIS_LABEL` / `savingsRateBasisLabel` | "uit je budgetten" | losse aanduiding onder een cijfer |
| `BASIS_PHRASE` / `savingsRateBasisPhrase` | "volgens je budgetten" | in een lopende zin |

Dat onderscheid is geen cosmetiek. De losse vorm ingeplakt in een zin loopt goed af
voor de budget- en transactievariant, maar gaf voor `manual` "Van je inkomen eigen
invoer hou je 30 % over" en voor een gemengde grondslag hetzelfde probleem — twee
van de vijf mogelijke waarden kapot, en de één die getest werd was toevallig de één
die goed las.

Het label geldt ook in **huishoud**-perspectief: die quote Ís sinds dit besluit de
effectieve quote van de gebruiker zelf en rust dus op dezelfde grondslag. Alleen
het **partner**-perspectief blijft er zonder — dat getal komt uit de partner-RPC en
niet uit deze grondslagkeuze, dus een label over ónze grondslag zou daar misleiden.

Gevolg voor de forecast-kaart: het label **"(6m)" vervalt**. Het cijfer is geen
zes-maands gemiddelde meer, dus een venster-label zou het verkeerd duiden.

### "Geschat" gaat over de meting, niet over de keuze

`savingsRateIsEstimate` zegt dat de 6-maands **aggregaatformule** nul gaf en er is
teruggevallen op een profiel- of net-vermogen-delta-schatting. Dat zegt alleen iets
over het getoonde getal wanneer dat getal *is* de meting. De widget markeert
"geschat" daarom alleen nog als `savingsRateFollowsTransactions(...)` waar is; bij
een budget- of handmatige grondslag komt de quote uit een keuze van de gebruiker
en zou de markering liegen.

## Aanvaarde gevolgen

- **Het doel "Spaarquote naar 10 %" staat op behaald** bij een effectieve quote van
  30 %. Expliciet geaccepteerd door de eigenaar: dat is het juiste antwoord op de
  vraag die het doel stelt, en het oude 5,8 % was hoe dan ook fout.
- **Een eenmalige sprong** op de spaarquote-widget, de forecast-kaart en de
  doelkaart voor iedereen die niet op de transactiegrondslag staat. Geen
  gebeurtenis in hun geld — een correctie van welk getal er stond.
- **De huishoud-override is geen mengvorm meer.** Die legde de spaarbudget-/
  aflossingscorrectie — die uitsluitend bij een rúwe transactiesom hoort — over
  effectieve bedragen heen; op een budget- of handmatige grondslag telde dat
  hetzelfde spaargeld twee keer (dezelfde fout die op 29 jul 2026 een ingevoerde
  30 % tot 37,2 % opblies). De override consumeert nu het eigen effectieve paar.
  Dat is inhoudelijk juist: de partner-RPC levert alleen bezittingen en schulden,
  dus `monthlyIncome`/`monthlyExpenses` in die override *zijn* de eigen effectieve
  bedragen — er valt niets huishoud-breeds te meten.
- **Het spaarquote-doel kost meer I/O** wanneer er verder niets op de pagina
  draait: drie eigen queries werden één `loadForecastSectionData`-aanroep met acht
  `cache()`-gedeelde fetches. Op /overzicht en de doelenpagina overlappen die
  volledig met wat er toch al laadt. Bewust betaald voor één getal in plaats van
  drie.
- **Geen backfill van snapshots.** `net_worth_snapshots.savings_rate` werd door alle
  drie de schrijvers al vastgelegd als de effectieve quote, dus de historische
  reeks stond er al goed op — het waren de *live* oppervlakken die eruit liepen.
  De sparkline in de spaarquote-widget droeg daardoor twee grondslagen op één as
  (snapshots effectief, "nu"-anker de meting), met een maand-op-maand-delta die
  een sprong toonde zonder financiële gebeurtenis. Dat is nu opgelost bij de bron
  en hoeft dus niet gemarkeerd te worden.

### Twee correcties die uit de review kwamen

- **De forecast-kaart kon geen schatting markeren.** `CashflowSectionScalars` droeg
  `savingsRateIsEstimate` niet, dus bij een leeg 6-maands venster zei de kaart
  "volgens je transacties" terwijl er een profiel- of vermogensdelta-schatting
  onder lag. De vlag zit nu in de scalars (en daarmee in de parity-suite) en de
  kaart markeert 'm volgens dezelfde regel als de widget.
- **`loadCoreData` rondde te vroeg af.** Die loader gaf zijn 6-maands meting
  *afgerond* (1 decimaal) door aan `resolveSavingsSource`, terwijl de dashboard- en
  horizon-loader hun onafgeronde waarde doorgeven en pas bij teruggeven afronden.
  Op de tak waar beide grondslagen `transaction` zijn is de effectieve quote
  letterlijk die invoer, dus die volgorde-fout gaf tot 0,05 pp verschil tussen wat
  Fin citeert en wat de widget toont. Afronden gebeurt nu alleen nog bij teruggeven.

  Wat daarmee **niet** is opgelost: `loadCoreData` draait nog een eigen inline
  6-maands keten met een bewust afwijkende spaarbudget-grondslag (Σ|ALLE| mét
  eigen-rekening-transfers, waar de gedeelde helper Σ|NEGATIEVE| zónder transfers
  telt). Dat verschil staat gemarkeerd bij de bron en is een eigen gedragswijziging
  met eigen regressiepas. Het is ook de reden dat die loader **niet** als derde pad
  in `cashflow-kpis.forecast-parity.test.ts` staat: een parity-assertie zou daar
  rood worden op een geaccepteerde carve-out in plaats van op drift. De AI-context
  claimt daarom niet langer onvoorwaardelijk "exact hetzelfde getal" voor de widget
  en de hefboomkaart; voor het instellingenblok wél, want dat leest dezelfde loader.

## Wat expliciet niet gebeurt

- De **kernformule verandert niet.** `savingsRateFromAggregates`,
  `computeSavingsRate6m` en `savingsRateWindow` blijven de canonieke meting; dit
  besluit gaat over welke waarde de oppervlakken *tonen*.
- De **6-maands meting verdwijnt niet uit de bundel.** Ze blijft als
  `savingsRate6m` bestaan, omdat de transactie-kassabon haar verklaart en de
  parity-suite (`lib/cashflow-kpis.forecast-parity.test.ts`) haar veld-voor-veld
  tegen de slanke forecast-laag vergrendelt. Sinds dit besluit vergrendelt die
  suite **beide** quotes.
- De **check-in-gespreksstarters** blijven op de meting. Ze zetten het percentage
  steeds naast een gemeten maandbedrag en dragen hun venster in de zin; dat is de
  toegestane vorm. Wel zijn de twee zinnen die het venster nog niet noemden
  aangevuld.

## Vergrendeling

`lib/spaarquote-eenduidige-grondslag.test.tsx` draait één fixture end-to-end door
de echte loaders (fake-Supabase, geen stubs op de rekenlaag) waarin de twee
grondslagen aantoonbaar uiteenlopen — 30,0 % effectief tegen 9,5 % gemeten — en
eist dat de bundel, de spaarquote-widget, de forecast-laag, de forecast-kaart én
het spaarquote-doel hetzelfde getal opleveren. De vergelijkingen zijn **exact**
(`toBe`), niet toleranter: het gaat om één getal dat via verschillende assemblages
bij de gebruiker komt, en een tolerantie zou precies de drift verbergen die deze
suite bewaakt.
