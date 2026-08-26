---
id: 0106-hypotheekrenteaftrek-loopt-over-het-netto-eigenwoningsaldo
title: De tariefsaanpassing eigen woning loopt over het netto eigenwoningsaldo
status: aanvaard
date: 2026-08-26
elements: [as-belasting]
---

De Box 1-motor verlaagde met de hypotheekrenteaftrek uitsluitend de **grondslag**.
Daardoor werkte de aftrek automatisch door tegen het schijftarief waarin hij landt
— 49,50% in de topschijf — terwijl de wet dat effect sinds 2014 maximeert op het
**aftrektarief** (37,56% in 2026). De **tariefsaanpassing aftrekbare kosten eigen
woning** (art. 2.10 lid 2 Wet IB 2001) bestond nergens in de rekenkern. Besluit:
de correctie wordt gebouwd, en haar grondslag is het **netto eigenwoningsaldo**
(rente − forfait − Hillen), niet de bruto rente.

## Context

Bevinding H25 uit het onafhankelijke UX-testpanel (24 aug 2026) mat op
`/overzicht/belasting/box1` een verrekentarief van **49,5%** over de netto
aftrekpost. Exact gereproduceerd tegen de motor: bruto € 95.000, WOZ € 385.000,
rente € 10.150 → heffingsdelta € 4.357 op een aftrekpost van € 8.802,50 =
49,50%. Het voordeel van de eigen woning werd daarmee met **± € 1.051 per jaar
overschat**, systematisch en in dezelfde richting, voor precies de kerndoelgroep:
iedereen met een hypotheek en een inkomen boven de topschijfgrens.

Pijnlijk detail: de constante bestond al en klopte.
`Box1Params.hypotheekAftrekMaxTarief` (0,3748 voor 2025, 0,3756 voor 2026) had
**nul rekenconsumenten**; de enige call-site zette hem als "HRA-maxtarief 37,56%"
op het scherm. De app toonde de gebruiker het juiste tarief en rekende met een
ander.

Twee oppervlakken droegen dezelfde wortel, elk met een eigen getal:

- de eigen-woning-kaart rekende `|saldo| × marginalRate` (56,01%) en toonde
  € 4.930 — hoger dan zowel de motor (€ 4.357) als de fiscale werkelijkheid
  (€ 3.306);
- `lib/hypotheek-vs-beleggen.ts` waardeerde het verlies aan hypotheekrenteaftrek
  bij extra aflossen tegen het marginale tarief, wat dat verlies met 11,94
  procentpunt **over**schatte en aflossen structureel minder aantrekkelijk maakte
  dan het is — tegengesteld van teken, dezelfde fout.

## Besluit

**1. De correctie is een additieve post op de heffing, geen grondslagtruc.**
`heffingVoorKortingen` = schijventarief + tariefsaanpassing. Art. 2.10 lid 2
verhóógt de belasting op het belastbare inkomen; de heffingskortingen (hoofdstuk
8) komen daar pas ná. Zou de correctie ná de kortingen worden opgeteld, dan zou
de kortingen-cap op een te lage heffing worden gelegd.

**2. De grondslag is het NETTO eigenwoningsaldo (optie A).** Basis =
`max(0, −eigenwoningSaldo)`, dus rente verminderd met het eigenwoningforfait en
de Wet Hillen-aftrek. Overwogen alternatief (optie B): de bruto rente, met het
forfait apart tegen het marginale tarief — dat is letterlijk wat de bevinding
voorschreef en levert € 1.212 in plaats van € 1.051. Verschil € 161/jaar op het
referentiegeval.

Gekozen voor A omdat:

- het aansluit op de wettekst "aftrekbare kosten … verminderd met de voordelen
  uit eigen woning";
- het de rekensom is waarmee de bevinding zelf is gemeten (€ 4.357 ÷ € 8.803),
  zodat de fix toetsbaar blijft tegen het bewijsmateriaal;
- het **Wet Hillen gratis correct afhandelt**: forfait > rente → saldo positief →
  basis 0 → geen correctie. Bij optie B moet dat randgeval expliciet worden
  afgevangen, wat een tweede plek is waar de regel kan gaan afwijken.

Beide opties zijn een verbetering van ± € 1.000/jaar ten opzichte van de situatie
ervóór; de keuze mocht de fix niet blokkeren.

**3. Geen nieuwe constante.** Percentage én drempel zijn **afgeleid** uit de
bestaande jaartabel `BOX1_PARAMS`:

```
tariefsaanpassingPct = topschijftarief − hypotheekAftrekMaxTarief
drempel              = schijven[schijven.length − 2].tot
```

Dat is aantoonbaar juist voor beide jaren die de tabel dekt: 2026 geeft
49,50% − 37,56% = **11,94%** en drempel **€ 78.426**; 2025 geeft
49,50% − 37,48% = **12,02%** en drempel **€ 76.817** — beide gelijk aan de
gepubliceerde waarden. Een losse `TARIEFSAANPASSING_2026 = 0.1194` zou een vierde
plek zijn waar hetzelfde feit staat en zou stil uit de pas lopen zodra er een
belastingjaar bij komt.

**4. De "voor zover"-begrenzing wordt expliciet gemodelleerd.** Alleen het deel
van de aftrek dat het inkomen ónder de topschijfgrens duwt is tegen 49,50%
vergolden: `min(aftrekpost, max(0, bruto − drempel))`. Bij € 85.000 is dat
€ 6.574 van de € 8.802,50 → correctie € 785, niet € 1.051. Een naïeve
implementatie die de hele aftrekpost corrigeert faalt hier.

**5. De correctie wordt NIET afgeleid uit een heffingsdelta.** De verleiding is
"verschil ÷ aftrekpost boven het maxtarief", maar die delta bevat óók het terecht
**herlevende** deel van de algemene heffingskorting (bij € 85.000: € 143, omdat
de aftrek het belastbaar inkomen en dus de afbouw verlaagt). Dat effect is
fiscaal juist en mag niet worden weggerekend. De statutaire correctie is een
aparte, additieve post; de heffingsdelta is een aparte grootheid.

**6. Één bron voor "wat levert een euro hypotheekrenteaftrek op".** Twee nieuwe
publieke velden op `Box1Result` en één helper:

- `tariefsaanpassing` — het correctiebedrag, apart leesbaar voor het scherm maar
  al verwerkt in `heffingVoorKortingen` en `tax`;
- `eigenwoningBelastingEffect` — het **werkelijke** belastingeffect van de eigen
  woning (heffing zonder − heffing met), inclusief tariefsaanpassing én
  korting-herleving. Dit is de enige eerlijke "wat levert mijn woning fiscaal
  op", en vervangt de eigen som `|saldo| × marginalRate` op de eigen-woning-kaart;
- `hraAftrekTarief(marginaalTarief, year)` = `min(marginaal, maxAftrektarief)` —
  de vuistregel-variant voor motoren die alleen een marginaal tarief kennen. In
  `lib/hypotheek-vs-beleggen.ts` wordt hij binnen de engine toegepast, zodat de
  drie call-sites hem erven zonder de regel te kopiëren. Onder de topschijf
  verandert de `min()` niets, dus laag-inkomen-scenario's blijven byte-identiek.

## Gevolgen

- **De heffing stijgt** voor iedereen met een hypotheek boven de topschijfgrens.
  De app was te optimistisch; de richting van de correctie is consequent.
  Stroomafwaarts geraakt: de belasting-hub, de optimizer-katernen, de AI-tax-context
  en `lib/tax-lifetime/**` (waar de correctie over de hele looptijd cumuleert).
- **De acceptatietest WF-BELAST-07 is herijkt**, bewust en zichtbaar: bij bruto
  € 160.658 gaat tax € 65.790 → **€ 66.675**, effectief 41,0% → **41,5%**, netto
  besteedbaar € 94.868 → **€ 93.983**. Het `expected`-veld draagt nu ook
  `tariefsaanpassing=885`, zodat de post zelf geborgd is en niet alleen haar
  saldo-effect.
- **Het marginale tarief verandert niet.** `marginalRateAt` draait zijn ±1-probes
  zonder eigenwoning-invoer, dus de correctie is er in beide probes nul. Dat is
  correct: de tariefsaanpassing is een bijtelling op de heffing, geen schijf.
- **Aflossen wordt aantrekkelijker** in `hypotheek-vs-beleggen` voor topschijf-
  inkomens, met ± 11,94 procentpunt minder HRA-verlies over de rentebesparing.
- **Onder de drempel verandert er niets.** Bij bruto € 60.000 is de correctie 0
  en is de uitkomst identiek aan die van vóór deze wijziging — vastgelegd als
  regressie-anker in `lib/box1-tax.test.ts`.
- `jaarruimteBesparing` is **niet** geraakt: die rekent op bruto-grondslag zonder
  eigen woning, en lijfrentepremie valt buiten de tariefsaanpassing. Wordt er ooit
  `wozValue`/`hypotheekRente` aan dat pad toegevoegd, dan moet de correctie in
  beide motoraanroepen constant blijven — behalve wanneer de inleg het inkomen
  ónder de topschijfgrens duwt; dán hoort hij te verschillen.
- **Bewust buiten scope:** de bevinding beveelt ook aan "toon beide tarieven op de
  kaart". Er zijn in deze module drie tariefbegrippen (heuristiek 35,75/49,50% ·
  echte marginale druk 56,01% · aftrektarief 37,56%); die op het scherm
  uiteenrafelen is hetzelfde werk als bevinding C9 en hoort daar te landen, niet
  twee keer.

## Alternatieven

- **Optie B (bruto rente, forfait apart).** Afgewezen om de drie redenen onder
  besluit 2. Blijft heroverweegbaar als de wettekst of het Belastingdienst-
  rekenblad de andere kant op wijst; het verschil is € 161/jaar en de wijziging
  zou lokaal zijn (`computeTariefsaanpassing`, één functie).
- **De correctie in de grondslag verwerken** (aftrek beperken tot een fictief
  bedrag). Afgewezen: dat verschuift het belastbaar inkomen en daarmee de afbouw
  van de heffingskortingen, wat fiscaal onjuist is — de wet corrigeert de
  belasting, niet de grondslag.
- **Een eigen constante per jaar.** Afgewezen; zie besluit 3.
