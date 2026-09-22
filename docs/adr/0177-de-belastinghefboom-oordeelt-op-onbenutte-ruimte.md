---
id: 0177-de-belastinghefboom-oordeelt-op-onbenutte-ruimte
title: 'De hefboom Belasting oordeelt op onbenutte fiscale ruimte, niet op de hoogte van de heffing'
status: aanvaard
date: 2026-09-22
elements: [as-belasting, as-budget]
---

De status van de hefboom Belasting was een vermogensmeter in absolute euro's: boven
€ 500.000 boven de heffingsvrije voet altijd rood, zonder bovengrens en zonder weg terug.
Vanaf nu meet hij hoeveel fiscale ruimte onbenut blijft, uitgedrukt als aandeel van de
eigen heffing over Box 1 en Box 3. Wie niets laat liggen staat groen, ongeacht de omvang
van zijn vermogen.

## Context

`box3TaxStatus` (`lib/box3-taxable-input.ts`) bepaalde de status uit één getal: het box
3-vermogen boven de heffingsvrije voet, in vaste euro-banden (€ 0 / € 100k / € 500k,
partner-afhankelijk). Voor 2026 (voet € 59.357) betekende dat: een alleenstaande staat
rood vanaf ongeveer € 159.000 box 3-vermogen, een stel vanaf ongeveer € 559.000.

Die status voedde zes oppervlakken: de hefboomtegel op /overzicht, de paginakop
(`HEFBOOM_OORDEELZIN`), de status-duiding-banner op /overzicht/belasting, de
sidebar-statusstip, het Box 3-kaartlabel (`box3StatusVerdict`) en de kop van
/overzicht/belasting/box3.

Gemeld door de eigenaar op 22 sep 2026: de status en de acties voelen te streng bij hoog
vermogen. Dat is geen rekenfout maar een ontwerpfout. De band is monotoon dalend in
vermogen en heeft geen plafond, dus "Risico" ging in de praktijk "veel vermogen"
betekenen. Er was geen handeling die de kleur groen kon maken behalve minder vermogen
bezitten, terwijl de heffing zelf geen tekortkoming van de gebruiker is maar de werking
van het stelsel.

Bij het zoeken naar een betere grondslag is eerst de effectieve druk
(`estimateBox3TaxDrag` = heffing / box 3-vermogen) overwogen. Die valt af om dezelfde
reden. Gemeten op de canonieke forfait-keten (`computeBox3Heffing`, solo, geen schulden,
2026):

| box 3-vermogen | 100% sparen | 100% beleggen |
|---|---|---|
| € 100k | 0,187% | 0,878% |
| € 500k | 0,406% | 1,904% |
| € 2M | 0,447% | 2,096% |
| € 20M | 0,459% | 2,154% |
| plafond | 0,461% | 2,160% |

De druk loopt monotoon op naar forfait x tarief. Die hele curve is niets anders dan de
vaste heffingsvrije voet die verwatert: bij € 100k dekt hij 59% van de grondslag, bij
€ 2M nog 3%. Er zit geen beoordeelbaar signaal in — alleen een plafond waar de oude
banden er geen hadden.

Wat in die tabel niet met vermogen meebeweegt is het verschil tussen de twee kolommen:
een factor van ongeveer 4,7 op elk vermogensniveau. Dat is samenstelling. Maar ook
samenstelling is op zichzelf geen oordeel: beleggen kost meer Box 3 en levert meer
rendement op, en de optimizer saldeert dat al (`netEffect`). "Veel beleggingen" is dus
geen tekortkoming.

Daarnaast bestond een tweede scheefheid. Bij hoog vermogen is de samenstelling-shift
vrijwel altijd netto verliesgevend — hij bespaart ruwweg 1,7% aan heffing en kost het
volle rendementsverschil — en valt daarmee weg onder de `netEffect > 0`-toelatingsregel
van `toTaxOpportunities`. Het resultaat op het scherm was een rood alarm naast een
vrijwel lege kansenlijst: een oordeel zonder handelingsperspectief.

## Besluit

**D1 — De grondslag is onbenutte ruimte, als aandeel van de eigen heffing.**

```
onbenutRatio = som van de netto besparing van openstaande posten
               ---------------------------------------------------
                            box1Tax + box3Tax
```

Teller en noemer schalen allebei mee met vermogen en inkomen, dus de uitkomst doet dat
niet. De noemer omvat Box 1 en Box 3: de hefboom heet Belasting, niet Box 3, en met de
jaarruimte-post erin zou een Box 3-only noemer een teller en noemer van verschillende
grondslag mengen.

**D2 — Drie posten nu, de vierde gefaseerd.** Een post telt mee wanneer hij netto
positief is en de gebruiker hem daadwerkelijk kan benutten:

| post | box | bron |
|---|---|---|
| fiscale partnerverdeling niet optimaal | 3 | `optimizePartnerAllocation` -> `savingsVsEqual` |
| onbenutte jaarruimte | 1 | `computeJaarruimte` + `jaarruimteBesparing` |
| samenstelling-shift met positief netto effect | 3 | `buildOpportunities` -> `netEffect > 0` |

Zie D7 voor de vierde post (tegenbewijs).

**D3 — De banden.**

| `onbenutRatio` | status |
|---|---|
| geen fiscale data, of de bron faalde | neutral |
| < 5% | groen |
| 5% tot 15% | oranje |
| >= 15% | rood |

Guard: `box1Tax + box3Tax <= 0` telt als groen — er valt dan niets te besparen. Een
gefaalde kansen- of grondslag-bron levert `null` en moet expliciet als neutral lezen,
nooit als "niets te halen"; dat onderscheid is het verschil tussen "je bent in orde" en
"we weten het niet".

De ring/score volgt dezelfde grondslag: `100 - min(100, ratio * 400)`. De tax-lever
routeert zijn status bewust niet via `statusFromScore` — dat deed hij vóór dit besluit
ook al niet — zodat score en band niet uit elkaar kunnen lopen.

**D4 — Oranje en rood noemen de oorzaak.** `LeverageStatus` draagt alleen een niveau, en
een melding die alleen een niveau kent kan niet zeggen waaróm. De statusbron levert
daarom `{ status, ratio, posten }`, gesorteerd op besparing, en de status-duiding-melding
noemt de grootste post bij naam met zijn bedrag. `RouteCopy` krijgt daarvoor een
`byCause`-variant naast `warn`/`bad`; routes zonder die variant gedragen zich
ongewijzigd.

De copy blijft constaterend, nooit imperatief (Wft): "Je laat fiscale ruimte liggen:
onbenutte jaarruimte (ongeveer € X per jaar)." — niet "benut je jaarruimte".

**D5 — Eén pure kern, twee voedingspaden, geen extra query in het shell-pad.**
`loadLeverScores` draait in `app/(app)/layout.tsx` op élke route. `loadFiscaleKansen`
trekt `loadHorizonRaw` en `loadPerspectiveBox3` mee; die in het hefboompad hangen zou
elke pagina in de app de horizon-loader laten betalen — precies de regressie die ADR 0083
heeft opgeruimd.

Daarom: een pure kern `computeFiscaleRuimte(input)`. Het hefboompad levert wat
`loadLeverScores` al in handen heeft (assets, schulden, huishoudtype,
maandinkomen, marginaal tarief, factor A) en draait alleen pure engine-aanroepen
— geen enkele extra query.

**Eén producent, en dat blijft het voorlopig.** Een eerdere versie van dit besluit
beloofde hier twee invoerkanalen — het hefboompad én de belasting-hub via
`loadFiscaleKansen` — plus een pariteitstest daartussen. Dat is bij de levering
niet gebouwd, en de tekst is daarop teruggeschreven in plaats van de belofte te
laten staan: `computeFiscaleRuimte` heeft precies één aanroeper, het hefboompad.
Eén producent is veiliger dan twee, dus dit is geen tekortkoming — maar het is
wél iets anders dan er stond.

**Restpunt met een voorwaarde.** Krijgt de hub later zijn eigen aanroep, dan
lopen de twee paden per constructie uiteen op gedeeld bezit: de hub is
perspectief-gescoopt via `loadPerspectiveBox3`, het hefboompad leest de
RLS-brede rijen. Dat tweede kanaal mag er dus pas komen mét een pariteitstest, en
pas nadat beide paden dezelfde weging van `net_worth_inclusion_pct` hanteren.

Het hefboompad leest rauwe asset- en schuldrijen, terwijl de hub via
`loadPerspectiveBox3` loopt vanwege partner-privacy (ADR 0036). De pure kern geeft
daarom uitsluitend geaggregeerde scalars terug, nooit een per-partner-splitsing.

**D6 — `box3StatusVerdict` blijft, maar alleen als Box 3-kaartlabel.** "Ruim boven de
vrijstelling" is een feitelijke constatering over de grondslag en blijft bruikbaar op de
Box 3-kaart van de hub. Hij draagt niet langer het oordeel van de hefboom.

**D7 — Tegenbewijs is fase 2 en vereist eerst persistentie.** Werkelijk rendement onder
het omslagpunt (`compareForfaitairVsWerkelijk` -> `besparing`, met `omslagRendementPct`
als canoniek omslagpunt) is de enige post die bij hoog en belegd vermogen structureel
geld oplevert, en hij is scale-free. De eigenaar koos op 22 sep 2026 variant (c): meetellen,
maar uitsluitend op een rendement dat de gebruiker zélf heeft bevestigd — niet op de
profielverwachting `expected_return`, die zelden wordt bijgewerkt en een verwachting is,
geen realisatie.

Die variant is vandaag niet te bouwen. `Box3TegenbewijsCard`
(`components/overview/belasting/box3-tegenbewijs-card.tsx`) is een stateless what-if: het
rendement staat in `useState`, initialiseert bewust óp het omslagpunt zodat er nooit
ongevraagd een besparings-CTA klaarstaat, en wordt nergens opgeslagen. Er bestaat geen
kolom, route of veld met een werkelijk rendement.

Fase 2 vraagt daarom: een per-gebruiker, per-belastingjaar opgeslagen werkelijk rendement
(migratie + RLS), een mutatie-route met zod en de error-envelope, en een wijziging van de
tegenbewijs-kaart van verkenning naar een bevestigde invoer. Dat laatste is geen
implementatiedetail: een opgeslagen "mijn werkelijk rendement was X%" die vervolgens een
oranje of rood stoplicht aanstuurt, is een sterkere uitspraak dan een schuifje, en hoort
langs de juridische toets. Tot die tijd telt de post niet mee. Het oordeel is daardoor
iets milder dan de eindvorm — de richting die dit besluit sowieso op wil.

## Gevolgen

- Wie zijn partnerverdeling optimaal heeft en zijn jaarruimte benut, staat groen bij
  elk vermogensniveau. Een alleenstaande met € 2 miljoen belegd en niets te optimaliseren
  gaat van rood naar groen; een stel met € 700.000 en € 400 per jaar aan
  partnerverdeling-winst gaat van rood naar groen (ratio 1,1%).
- Omgekeerd kan een bescheiden vermogen nu oranje of rood staan: € 180.000 met € 8.000
  onbenutte jaarruimte geeft een ratio van ongeveer 20%. Dat is bedoeld — daar ligt echt
  geld.
- Status en kansenlijst meten nu hetzelfde begrip (onbenutte, netto-positieve ruimte),
  waar de status eerder de hóógte van de heffing mat en de kansenlijst de ruimte. Het
  rode alarm naast een lege kansenlijst wordt daarmee veel onwaarschijnlijker. Het is
  níét onmogelijk: de twee lijsten hebben andere invoer (het hefboompad leest RLS-brede
  rauwe rijen, de kansenlijst loopt perspectief-gescoopt via `loadPerspectiveBox3`), dus
  ze kunnen op gedeeld bezit uiteenlopen. Een eerdere versie van dit besluit claimde hier
  "per constructie onmogelijk"; dat was te sterk.
- De euro-banden € 100.000 / € 500.000 verdwijnen, inclusief hun tests in
  `lib/box3-taxable-input.test.ts`. `computeBox3TaxableInput` blijft bestaan: dat is de
  Box 3-grondslag en die wordt breder gebruikt.
- Met de banden verdwijnt ook de scheefheid dat `computeBox3TaxableInput` altijd de
  enkelvoudige heffingsvrije voet gebruikte terwijl de band partners een ruwe € 100.000
  toekende in plaats van de werkelijke € 59.357 extra. De grondslag kende die
  onnauwkeurigheid alleen omdat de status hem als band gebruikte.
- Box 1 telt voortaan mee in het oordeel van de hefboom. `box1JaarruimteVerdict` kon geen
  rood produceren, waardoor de `bad`-copy voor /overzicht/belasting/box1 onbereikbaar was;
  die tak krijgt met dit besluit een echte bron of verdwijnt.
- De status-duiding-melding kent voor het eerst een oorzaak-specifieke tekst. Dat is een
  uitbreiding van `RouteCopy`, niet een wijziging van bestaande routes.
- Geen migratie, geen nieuwe route, geen wijziging in datatoegang — fase 1 raakt geen
  auth, RLS of partnerdata. Fase 2 (D7) doet dat wel en loopt daarom langs de
  schemawijziging-route met een eigen security-toets.
