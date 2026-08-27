---
id: 0108-box3-indeling-is-een-afleiding-met-een-overschrijving
title: De Box 3-indeling is één afleiding met één overschrijving
status: aanvaard
date: 2026-08-27
elements: [as-belasting]
---

De vraag "valt deze bezitting in Box 3?" werd op **drie** plekken onafhankelijk
beantwoord, en de antwoorden spraken elkaar tegen. `classifyAsset`
(`lib/box3-data.ts`) voedde de Box 3-pagina, de FIRE-projectie en de
huishoudbelasting; `BOX3_ASSET_TYPES` (`lib/box3-taxable-input.ts`) voedde de
sidebar-status en de Belasting-landingskaart; een derde verzameling in
`buildTaxData` (`lib/health-score-input.ts`) voedde de snapshot-routes en het
kans-inzicht. Op dezelfde persona gaven ze **€84.500 / €71.500 / €55.200**, en
ze weken op 5 van de 13 assettypen af in **béide** richtingen: `deelneming` zat
wél in de sidebar-set terwijl een aanmerkelijk belang in Box 2 valt, en de derde
set bevatte `'checking'` — geen geldig `AssetType`, dus een dode entry die
suggereerde dat betaalrekeningen apart gedekt waren.

Erger dan de spreiding was de vorm van de canonieke bron zelf. `classifyAsset`
was een `if`-keten die eindigde op **"alles overige is een belegging"**. Die
fall-through is geen conservatieve keuze maar een stille fiscale aanname: hij
zette roerende zaken voor eigen gebruik — auto, sieraden, inboedel, boot — op het
6%-forfait, terwijl art. 5.3 lid 2 Wet IB 2001 ze juist buiten de grondslag
houdt. En hij zou élk nieuw assettype hetzelfde aandoen, zonder dat iemand de
vraag ooit gesteld kreeg.

## Besluit

**Eén afleiding, exhaustief.** `classifyAsset` is een `switch` over `AssetType`
met een `never`-afsluiter. Een nieuw assettype geeft een **compile-fout** in
plaats van een stilzwijgend forfait; dat is de hele winst van de vorm. De
afleiding is subtype-bewust waar de wet dat is: `physical/sieraden` en
`physical/inboedel` vallen erbuiten, `physical/kunst` en `physical/verzameling`
blijven erin omdat je die vaker hoofdzakelijk ter belegging houdt. Een
`asset_type` buiten de union — de kolom is vrije tekst — valt met een expliciete
reden buiten Box 3: een onbekend type een heffing opleggen is een verzonnen
getal, en dat is precies wat we hier repareren.

**Een pensioen is een pensioen.** `retirement` valt voortaan altijd in Box 1, óók
zonder de `tax_benefit`-vink. Die vink staat in het formulier op `false` tot de
gebruiker hem aanraakt, dus `false` droeg geen informatie; 2 van de 4
productie-pensioenrijen misten hem. Op €200.000 pensioenvermogen scheelde dat
ruim €4.000 fantoomheffing per jaar. Ontbreekt de vlag, dan zegt het scherm dat
we het aannemen — een zichtbare aanname is iets anders dan een stille.

**De twee andere lijsten zijn opgeheven** en consumeren nu
`classifyAsset(...).category !== null`. De volgorde was bindend: éérst de
fiscale correctie, dán samenvoegen. `box3-taxable-input.test.ts` legde namelijk
de fiscaal *juiste* uitkomst (een auto telt niet mee) groen vast op de
*niet-canonieke* lijst; naïef collapsen zou die test rood maken en de bug de
sidebar in importeren.

**Eén as als overschrijving, geen box-kolom.** `assets.box3_vrijgesteld`
(+ `box3_vrijstelling_reden`) overschrijft de afleiding: `NULL` = afleiden,
`TRUE` = eruit, `FALSE` = erin. Bewust géén handmatige "box 1 / box 2 / box 3"-
keuze: box 1 volgt al uit `eigen_huis` en de pensioen-tak, box 2 uit
`deelneming` — een boxkolom zou die dupliceren en een tweede waarheid maken.
Wat ontbrak was uitsluitend de as *vrijgesteld ja/nee*. De kolom is nullable
zonder default; een `DEFAULT false` zou elke bestaande rij op "expliciet niet
vrijgesteld" zetten en daarmee de nieuwe afleiding voor het hele bestand
uitschakelen.

**De uitleg wordt getoond, niet weggegooid.** `exclusionReason` en `note` werden
al door de motor gevuld en hadden nul render-consumenten. Ze staan nu in de
indelingslijst, de uitgesloten-regels zijn doorklikbaar, en die lijst valt
bewust buiten `HideInSimple` — juist wie de Eenvoudige weergave gebruikt zag de
berekeningsstappen toch al niet, en had dan geen enkele manier om de indeling te
controleren.

## Gevolgen

De heffing beweegt twee kanten op: de vrijstellingen verlagen hem, de
niet-aftrekbare belastingschuld verhoogt hem. Op de persona waarop de bevinding
is gereproduceerd gaat hij van €246,38 naar €31,68.

**De FIRE-projectie verschuift.** `lib/bucket-projection.ts` en
`lib/horizon-kernel/adapter/potten.ts` leiden hun Box 3-drag per pot uit dezelfde
functie af; een vrijgestelde auto draagt terecht geen drag meer. De
oracle-parity blijft byte-groen omdat de fixtures hun eigen `assetPotten` bouwen
in `lib/horizon-kernel/input-from-fixture.ts` — het parity-pad raakt
`classifyAsset` niet.

**Nog open.** Het invoerveld voor de overschrijving zit nog niet in het
asset-formulier: dat is een client-directe insert zonder API/zod (ADR 0058) en
een nieuw veld zou die bugklasse erven. De overschrijving wordt vandaag dus wel
door de motor en de leeslaag gedragen, maar is nog niet door de gebruiker te
zetten. Ook de groen-beleggen-vrijstelling (€26.715 / €53.430) staat nog
hardcoded buiten `BOX3_PARAMS` en is daarmee jaar-blind.
