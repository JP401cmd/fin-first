---
id: 0179-toekomst-in-drie-katernen
title: '/toekomst in drie katernen: één canvas, drie routes (Plan, Doelen, Instellingen) en elke instelling op één plek'
status: aanvaard
date: 2026-09-26
elements: [fn-toekomstplannen, as-planning, app-comp]
---

# 0179 — /toekomst in drie katernen

/toekomst wordt één layout met kop, gedeeld grafiekcanvas en drie katern-koppen, met drie routes eronder: Plan (`/toekomst`), Doelen (`/toekomst/doelen`) en Instellingen (`/toekomst/instellingen`). Het canvas blijft gemonteerd; elk katern heeft één taak, elke instelling één plek.

Eigenaarsbesluiten van 26 september 2026 (spec `docs/superpowers/specs/2026-09-26-toekomst-drie-katernen-design.md`, §11). De spec draagt het onderzoek, de wireframes en de inventaris per functie; dit besluit legt de architectuur vast.

## Context

De pagina doet drie dingen tegelijk in één kaart: het resultaat van het plan tonen, een doelscenario verkennen en de instellingen voeden waar het plan op rust. Boven de grafiek staan zo'n 28 interactieve elementen (statuspunten, vier navkaarten met chevrons, tips, details, vier KPI's, tot zeven meldingen met eigen links, tot tien pills), er staan twee koppen boven elkaar, en het lab staat ín de resultaatkaart, tussen de fasebalk en de legenda's van de pills. De eigenaar ervaart de pagina als te druk.

De oorzaak is structureel:

- **God-component.** `components/app/horizon/horizon-client.tsx` telt 11.029 regels (`wc -l`, 26 sep 2026; het aandachtspunt `horizon-god-component` noemt nog 8.800). Alle drie de delen, alle modals en een legacy-gebeurtenisformulier zitten in één bestand; zeventien bron-scan-tests lezen het letterlijk. `loadData()` leest bij elke modal-sluiting ±10 tabellen client-side en houdt het bestand op de grandfather-allowlist van `check:client-reads` (ADR 0058).
- **Drie ingangen naar dezelfde instelling.** Stopmoment, onttrekking en woonstrategie zijn te bewerken via de Strategieën-modal, via /toekomst/voorkeuren en via de wizard. `WithdrawalModal` en het legacy-formulier zijn onbereikbaar maar bestaan nog.
- **Eén grootheid in drie rollen.** De uitgave na pensioen is KPI (resultaat), lab-knop (verkennen) en wizardstap (instellen).

## Besluit

**D1 — Eén layout, drie routes (model C).** Een route-groep `app/(app)/toekomst/(katern)/` met één server-layout houdt de kop, de state-provider, het canvas en de katern-koppen. Drie routes leveren het paneel eronder: **Plan** `/toekomst` (standaard), **Doelen** `/toekomst/doelen` en **Instellingen** `/toekomst/instellingen`. De labels Plan · Doelen · Instellingen zijn een eigenaarsbesluit. Het canvas blijft gemonteerd bij het wisselen van katern (geen herlaad, geen sprong); elk katern heeft een eigen URL, TopBar-titel en terugknop. `/toekomst/gebeurtenissen` en `/toekomst/voorkeuren` gaan samen op in Instellingen en redirecten met hash en query. Rekenhulp, bibliotheek en inflatie-koopkracht zijn gereedschap: ze vallen buiten de route-groep en laden de planbundel niet.

**D2 — De kop is oordeel plus anker.** De kop bestaat uit de oordeelzin (`resolvePlanVerdictSentence`, ADR 0174 D6 en 0175), één ankerregel en de i. De vrijheidsleeftijd staat twee keer per scherm: als tekst in de ankerregel en als eerste KPI in Plan, die de kassabon draagt. De duidingszin onder het kerngetal vervalt (zie de toets van ADR 0129 B10 hieronder). De paginakop draagt geen statuspunten meer.

**D3 — Eén canvas, drie modi, één lagenmenu.** Het canvas heeft drie modi: het vermogenspad, de samenstelling en de geldstroom (in- en uitgaven, nu nog een uitklap, wordt een volwaardige modus). De modus-switch is een segmented control. De tien pills en de laaguitleg gaan op in één lagenmenu (popover op desktop, `ShellOverlay kind="sheet"` op mobiel). Modus en lagen horen bij het canvas, niet bij een katern: een keuze van de gebruiker blijft staan bij het wisselen, en per katern verschillen alleen de standaardstand en de vaste lagen. In Doelen zijn dat de doelscenario-lijn met verschilvlak en de doelmarkers; in Instellingen is het canvas compact op desktop en toont mobiel alleen de kop. Boven de grafiek staan hoogstens vijf interactieve elementen.

De doelscenario-lijn is de bestaande scenario-run (`selectDoelLijnBron`, ADR 0085 en 0170 B9); er komt geen run en geen motor bij. Tonen samenstelling en geldstroom in Doelen het doelscenario, dan alleen uit rijen van diezelfde run (een adaptervraag voor fase 1). Tot dan tonen die twee modi in Doelen het plan, met een regel die dat zegt. Een eigen samenstelling buiten de kernel komt er niet.

**D4 — Eén taak per katern, één plek per instelling.** Plan toont en duidt: KPI-strip van vier cellen, ankerdrieslag alleen onder een vast anker, voortgangsbalk, fasebalk, verdieping lazy. Doelen verkent en legt vast: het lab, de doelenlijst en de andere paden. Instellingen voedt het plan: de wizard-ingang, rijen met ✎ die de bestaande bodies openen, gebeurtenissen, levensstrategieën en marktaannames. Een instelling wordt alleen in Instellingen bewerkt; KPI's en meldingen linken naar de rij. De Strategieën-modal, `WithdrawalModal` en het legacy-gebeurtenisformulier verdwijnen. Elke editor toont een verschilregel uit `runRegelProjection` met `RegelSimOverride`, dezelfde override-run als de wizard, en nooit een eigen som. Er is één sheet tegelijk open.

**D5 — De aannamesregel staat alleen in Plan**, onder het canvas, met één link naar Instellingen. In Doelen staat op die plek de uitkomstregel van het doelscenario, in Instellingen niets.

**D6 — Meldingen wonen in hun katern.** Een melding staat bovenaan het katern waar ze over gaat, en haar vervolgactie wijst naar precies één rij of één blok. Het statuspunt (stoplichtkleur van de ernst) staat op de katern-kop van dat katern, niet in de paginakop en niet in de TopBar; badges zijn er niet. Per katern is hoogstens één melding uitgeklapt. Minimaliseren gebruikt de bestaande `status_banner_minimized`-pref per route; omdat elk katern een route is, vraagt dat geen schemawijziging. De katern-koppen zijn een nieuwe editorial primitive op het `CategoryTabs`-patroon, bewust geen segmented control (dat is de modus-switch; twee gelijke controls verwarren). Inactieve koppen dragen een samenvattingsregel; op mobiel tonen ze alleen label en punt en kleven ze zodra de grafiek uit beeld is. De toewijzing per melding staat in spec §4.8. *(Aangevuld 27 sep: de koppen zijn tabbladen met een accent per katern — zie addendum (h).)*

**D7 — In Doelen staan grafiek en knoppen samen in beeld (harde eis).** Op desktop wordt de canvas-rij twee kolommen, met de grafiek links en de harp rechts; kop plus canvas-rij blijven binnen 480 px, zodat ze op 1280×720 samen passen. Op mobiel is de grafiek `clamp(170px, 30vh, 230px)` hoog, staat het rad direct onder de klevende katern-koppen en is de opslaan-balk de action-bar van de shell; grafiek, rad en action-bar passen binnen 640 px onder de TopBar op 360×800 en 390×844. Alle vijf lab-weergaven blijven kiesbaar. De standaard is harp op desktop en rad op mobiel, en de keuze wordt per breekpunt onthouden: `knopWeergave` krijgt twee sleutels in de bestaande own-row JSONB-pref. Of dat zonder migratie kan, wordt in fase 4 nagegaan. *(Geamendeerd 27 sep: de harp bepaalt de hoogte, de acties staan in een rij onder grafiek en harp, en de 480 px-grens vervalt — zie addendum (d) en (f).)*

**D8 — Terugvaloptie C′ zonder herbouw.** Wijst een gebruikerstest uit dat mensen katernen missen, dan komen dezelfde drie katern-componenten gestapeld op één route (desktop open, mobiel ingeklapt met klevende koppen). Om dat goedkoop te houden geldt vanaf fase 1: een katern-component haalt zijn data uit de provider of uit props en leest nooit de route (`usePathname`, `params`). Routing zit alleen in de layout en de katern-koppen.

**D9 — Het verloop hoort bij /overzicht.** Het gezondheids- en FIRE-verloop (`HorizonTrendGrid`) verhuist naar de gezondheidskassabon op /overzicht, één laag onder de kaart en niet op het hoofdscherm; geplande acties gaan naar `/overzicht/tips`. Eerst wordt de leesquery op `net_worth_snapshots` gerepareerd (datumvenster, één punt per maand). De Monte Carlo-consolidatie is een aparte kaart: deze herindeling verplaatst ingangen en raakt geen motor.

De letterlijke kopij van kop, ankerregel, aannamesregel, samenvattingsregels, lagenmenu en verschilregel ligt niet in dit besluit; die gaat in een aparte ronde langs `merkstem` en `compliance-check` (constaterend, geen imperatief, ADR 0165).

## Wat blijft staan

- Het oordeel komt uit `resolvePlanStatus` en `resolvePlanVerdictSentence` en wordt nooit herberekend (ADR 0174, 0175). De kop is `PageVerdictOpening` (h2); de shell draagt de enige h1 (ADR 0110).
- Er is één wat-als: het doelscenario-lab. `resolveLabUitkomst` en `standGedekt` zijn de enige uitkomst- en haalbaarheidsbron (ADR 0144, 0145, 0160, 0170, 0175).
- Eén body, twee hosts voor elke instelling; het veld-register per schrijfroute beweegt in dezelfde PR mee (ADR 0142 D6–D8).
- Instellingen (voorheen Voorkeuren) is de bron van de plankeuzes; verkennen wijzigt het plan nooit (ADR 0129 B13). Plan-mutaties lopen via `/api/fire-settings` met bevestiging.
- Euro-weergave: precies één render-grens, in de state-provider, die `InEuroView<T>`-feeds uitdeelt; de bron-test verhuist mee (ADR 0090, 0093).
- Vrijheidsgetal en -leeftijd komen uit `computeHorizonFireSim`, met worker en fallback; zichtbaarheidsgates verhuizen mee met hun blok (ADR 0054, 0107, 0145 D7a).
- Datapad: `loadData()` wordt `router.refresh()` plus loader vóór de decompositie; nieuwe client-bestanden lezen niet zelf (ADR 0058).
- Eenvoudig en Volledig via `HideInSimple` en `DepthSection`, nooit per sectie en nooit als ternary (ADR 0026). Het doelscenario blijft in Eenvoudig, alleen solo (ADR 0170 B10).
- Overlays via `ShellOverlay` (ADR 0039); RESIDUE- en ALLOWLIST-lijsten krimpen alleen.
- De Huishoud-FIRE-sectie blijft gemount in Plan: ze schrijft `households.combined_fire_summary` (ADR 0168).
- Taal: geld levert tijd op, geen koop-/verkoopmetafoor (ADR 0165).
- Deeplinks blijven werken (`?tab=`, `?modal=…`, `?strategie=`, `?uitgaven=open`, `?event=`, `?whatif=open`, `?planreview=open`, widget-hrefs). Oude redirects wijzen rechtstreeks naar het katern, zonder dubbele hop.

## Amendementen

| ADR | Punt | Wordt |
|---|---|---|
| 0170 | B6: knoppen in de grafiekkaart, onder de `PhaseBar` | De knoppen staan in katern Doelen: op desktop naast de grafiek in de canvas-rij, op mobiel direct onder de katern-koppen. De fasebalk gaat naar Plan. De opslaan-balk blijft onder de knoppen; op mobiel is hij de action-bar. |
| 0170 | B7, B11 (3), B12: de wijzer als standaard, geen standaard op smal | Standaard per breekpunt: harp op desktop, rad op mobiel. Alle vijf vormen blijven kiesbaar (D7). |
| 0170 | B9: de lijn verschijnt vanzelf bij de eerste verkenning en "uit" wordt onthouden | In Doelen zijn lijn en verschilvlak een vaste laag, in Plan een keuze in het lagenmenu. De drie vlakregels van B9 blijven. |
| 0142 | D5: ingang is de Voorkeuren-kaart op /toekomst, plus de knop op /voorkeuren en ⌘K | Ingang is de wizard-kaart bovenaan Instellingen, met de stapvoortgang in de kaart zelf, plus ⌘K. Kaart en knop vervallen. Een onvoltooide review is geen melding en geeft geen statuspunt. |
| 0129 | B13: de strategie-modal spiegelt Voorkeuren | De modal verdwijnt; Instellingen is de enige bewerkplek. Dit versterkt B13. |
| 0144 | Punt 2: het lab op /toekomst, redirects naar `/toekomst?whatif=open` | Het principe (één wat-als) blijft. Het lab woont op `/toekomst/doelen`, en de redirects gaan daar rechtstreeks heen. |
| 0162 | Doelen wonen op `/toekomst/doelen` | Ongewijzigd; de route wordt katern Doelen. |
| spec 1 jun 2026 | Tijdas-landing met vier navkaarten | Vervangen door dit besluit. |

De amendementen op 0170 B7/B11/B12 en B9 en op 0144 staan niet in de amendementenlijst van de spec (§8). Ze volgen uit de eigenaarsbesluiten 4 en 9 en uit de verhuizing van het lab naar een eigen route, en staan hier zodat geen ADR iets anders zegt dan de app.

**Addendum (26 sep 2026): drie getallen onder de band.** Spec §7.6 vroeg een uitkomst die de marktcheck nog niet had: drie vrijheidsleeftijden. Die komen uit de kern en niet uit de UI, want een eigen som in de UI is verboden (consume, don't recompute). `MarktcheckOutcome.vrijheidsleeftijden` wordt berekend uit dezelfde runs als de band. De runs worden gerangschikt op hun gap op de live FIRE-leeftijd, en `solveFire` lost alleen de run op p25, p50 en p75 op. Dat kost +15% rekenwerk, en de uitkomst is gemeten gelijk aan het oplossen van elke run. De band, de marge en de oracle-velden blijven byte-gelijk, dus D9 geldt in deze zin: geen bestaande motor verandert van gedrag. De Monte Carlo-consolidatie blijft een aparte kaart (eigenaarsbesluit 10). Onder een vast stop-anker is het veld `null` en toont de component geen regel. Berekeningen: `marktcheck-vrijheidsleeftijden`.

## Addendum 26 sep — Plan toont de gebeurtenissen; verloop naar /overzicht

Eigenaarsbesluit van 26 september 2026 (laat), letterlijk: "Wil je onder het plan de inkomensstrook en de dekkingsradar verwijderen. Graag daar de levensgebeurtenissen zetten die nu onder instellingen staat."

**(a) Plan toont de levensgebeurtenissen.** Onder de KPI-strip, de voortgangsbalk en de fasebalk van Plan staat de lijst met levensgebeurtenissen en kernelmomenten, met de toevoegknop: dezelfde `GebeurtenissenView` (via `GebeurtenissenMetHoofdrun`, besluit Q8) die tot dan in Instellingen stond, met het anker `#gebeurtenissen`, in Eenvoudig én Volledig. Er is geen tweede lijst en geen tweede toevoegmechanisme. De props bouwt de katern-layout server-side uit de bundel die hij al laadt (`bouwGebeurtenissenBron`) en geeft ze via de state-provider door; het Plan-paneel leest de route niet (D8). De levensinkomenstrook en de dekkingsradar zijn verwijderd, met hun componenten, `lib/horizon/dekkingsradar.ts` en de scenario-chip. Instellingen is voortaan de wizard-ingang plus Voorkeuren.

Dit amendeert de katern-inhoud van D1 en D4, spec §4.4 en §6, en fase 3 (de gebeurtenissen-sectie in Instellingen vervalt). "Wat het betekent" houdt alleen de scenario's naast elkaar, met de zichtbaarheidsgate van ADR 0145 D7a; op mobiel staat het standaard ingeklapt (spec §4.3), en de gate is dan "in beeld én open". Waarom: de invoer van het plan hoort onder het plan, en Plan krijgt minder duidingslagen.

Deeplinks: `/toekomst/gebeurtenissen` en `?tab=gebeurtenissen` landen op `/toekomst#gebeurtenissen` (met een levensstrategie-sleutel nog op Instellingen, waar die editors wonen); een oude bladwijzer `/toekomst/instellingen#gebeurtenissen` stuurt de Instellingen-page door. Er is één manier om via een link een gebeurtenis toe te voegen: `?event=new`, geopend door de provider op elk katern; `?nieuw=1` is daarvan een alias.

**(b) Fase 5 naar voren.** Het verloop van gezondheid en vrijheidsleeftijd (`HorizonTrendGrid`) staat in de gezondheidskassabon op /overzicht, de geplande acties op `/overzicht/tips` (D9). Plan toont ze niet meer; het `/toekomst`-sheet "Financiële Gezondheid", waarvan het verloop-grid de enige opener was, is weg.

## Addendum 27 sep — Fase 3, 4 en 5 uitgevoerd

**(a) Fase 3: Instellingen.** Katern Instellingen is de wizard-ingang met drie secties rijen: Je plan · Levensstrategieën · Marktaannames. Elke instelling is één rij met de waarde waarmee de app nu rekent en één potlood-ingang. `?rij=` is de deeplink naar een rij; `?regel=` en `?strategie=` blijven werken als aliassen. Een wijziging toont vóór Opslaan een verschilregel, berekend met `runRegelProjection` + `RegelSimOverride` (uitgebreid met de sleutel `potRules`): dezelfde kern als de wizard, geen eigen som. De Strategieën-modal en de UitgavenPane zijn opgeheven, na een dekkingstest die aantoont dat elke keuze uit die vensters een rij heeft. De profielvergelijking uit de modal staat in de onttrekkingsbody. KPI 4 ("Na pensioen") op Plan wijst naar de rij "Uitgave na pensioen". Het afbouwoverzicht staat in de Plan-verdieping en rekent op de hoofdrun. De autosave van de modal (B-057/B1) vervalt ten gunste van Opslaan plus de verschilregel. In Eenvoudig klappen tekort-lening, pot-regels en marktaannames in via `DepthSection` (ADR 0026); ze tellen gewoon mee.

**(b) Fase 4: Doelen.** D7 is gehaald zonder migratie: de knopvorm per breekpunt staat in twee sleutels van de bestaande jsonb-pref. De adaptervraag uit D3 is beantwoord met leveren: Samenstelling en Geldstroom tonen in Doelen het doelscenario, uit de rijen van dezelfde run. De zijkolom naast de grafiek is een slot uit de layout, zodat het Doelen-paneel de route niet leest (D8). Op mobiel wordt de opslaan-actie de action-bar van de shell en wijkt de navigatieknop zolang die staat (besluit orchestrator). Doelen toont geen cijferbalk en geen tijdlijn; de hoofdlijn staat er gedempt als referentie. `ScenarioKaarten` verhuisde naar Doelen als "Andere paden naast je doelscenario", met de zichtbaarheidsgate van ADR 0145 D7a. Eén scherm is gemeten: desktop 1280×720, canvas-rij 192–677 px; 390×844, rad 542–663; 360×800, rad 556–676. De compacte klassen komen uit een servermodule, niet uit een `'use client'`-bestand (bbd72897d).

**(c) Fase 5: het verloop op /overzicht.** De historie is een reeks van 12 maanden, één punt per maand en per gebruiker. Het verloop van het gezondheidsgetal en de vrijheidsleeftijd staat in de gezondheidskassabon; het punt van de lopende maand is de live canonieke stand. De snapshot-writers schrijven via `computeSnapshotHealthScore`, met de budgetteer-vlag uit `budgetingActiveFromProfile`: dezelfde regel als live (ADR 0008). Bij een onbekend oordeel is de score `null`, geen partieel getal (ADR 0131). De grondslagbreuk van de budgetdiscipline (30 aug 2026) is gemarkeerd in het verloop; er is geen backfill. De briefingregel "score steeg met X punten" gebruikt de echte maandverandering.

## Addendum 27 sep (middag) — opstelling, tabbladen en Instellingen als checklist

Eigenaarsbesluiten van 27 september 2026, na de eerste ronde op mobiel en desktop.

**(d) Doelen, desktop: de harp is de maat.** De harp is de standaardweergave en bepaalt de hoogte van de canvas-rij: de grafiek groeit mee met de natuurlijke hoogte van de lab-kolom (gemeten, geklemd op 220–560 px, startwaarde 240 zolang er geen meting is) en onthoudt die hoogte op canvasniveau. De acties — stopmoment, plan-keuzes en de opslaan-balk — staan in een eigen rij over de volle breedte onder grafiek en harp: een tweede layout-slot (`CanvasActierij`) met dezelfde D8-redenering als de kolom. Dit vervangt de eis uit fase 4 dat kop plus canvas-rij binnen 480 px blijven.

**(e) Plan, desktop: dezelfde canvas-rij.** Plan krijgt dezelfde rij als Doelen, met in de kolom de levensgebeurtenissen en de levensstrategieën (AOW, pensioen, werk, woning — van Instellingen hierheen verhuisd). Zo blijft de grafiek bij een wissel Plan ↔ Doelen op dezelfde plek en in dezelfde maat. De kolom rekt de rij niet op: een lange lijst scrolt in de kolom. Op mobiel staan ze op de Plan-pagina. Oude links naar `/toekomst/instellingen?rij=aow|pensioen|werk|huis` en `?strategie=pensioen` sturen door naar Plan.

**(f) Doelen, mobiel: één plek per actie.** Is er iets op te slaan, dan staan álle lab-acties in de action-bar van de shell: primair en secundair, plus één rij met stopmoment, plan-keuzes en Loslaten. Staan stopmoment én Loslaten er, dan valt de plan-keuzes-link weg, zodat de rij op 360 px op één regel blijft. Is er niets op te slaan, dan staat alles op de pagina en blijft de navigatieknop staan. `BottomBarConfig['action-bar']` kreeg daarvoor een optionele `extra`. De één-scherm-eis blijft: Samenstelling past zich op mobiel in Doelen aan de hoogte van Vermogen aan.

**(g) Samenstelling is de basisweergave** van het canvas in alle drie de katernen. Instellingen volgt de keuze van het canvas en toont daarvoor de modus-switch; het blijft compact en alleen op desktop, zonder lagen, fasebalk of aannamesregel.

**(h) De katern-koppen zijn tabbladen, elk met een eigen accent.** Het accent komt uit Fins drie kleuren: Plan = kern, Doelen = wil, Instellingen = horizon (één constante, `KATERN_ACCENT`). Het accent is geen achtergrond: binnen het katern, en in de canvas-slots van dat katern, zet `KaternAccentScope` (`display: contents`) `--module-active-*` op het accent van de tab, zodat kickers, links en de opslaan-balk de tabkleur dragen. De route-regel "/toekomst = horizon" geldt daarmee voor de kop en het canvas, niet meer voor de katern-inhoud. Stoplicht-, fase- en boxkleuren staan op eigen tokens en veranderen niet mee. D6 blijft staan: een tabblad opent een eigen route en is geen segmented control.

**(i) Instellingen als checklist van je plan** (richting R1 uit het UX-onderzoek van 27 sep). Secties: Je plan · Hoe je potten meebewegen (ook in Volledig ingeklapt) · Marktaannames. De waarden staan in één kolom; standaard, ingesteld en ontbreekt zijn van elkaar te onderscheiden. Bij een plan dat niet (volledig) haalbaar is staat bovenaan één duidingsregel uit dezelfde bron als de melding op Plan: inzicht, geen advies en geen eigen rangorde. De rij Opnamerate verviel — het is een uitkomst, geen instelling. De verschilregel toont bij een plan zonder vrijheidsleeftijd "wordt haalbaar: vrij op X" of het tekort per maand vóór en ná, uit dezelfde override-run.

## Toets: raakt het vervallen van de duidingszin ADR 0129 B10?

B10 regelt de naamgeving van de modi: vanuit de vraag die het scherm beantwoordt, geen systeemlabel. Drie feiten:

1. **De drager van B10 is `ankerVraag`** (`lib/horizon/anker-copy.ts`), niet de duidingszin. De duidingszin komt uit `buildVrijheidsleeftijdZin` en vertaalt het kerngetal naar een moment; onder een vast anker is het de bereikzin uit de bijlage van ADR 0129 (`ankerZin`).
2. **De vraag als paginakop rendert op de live pagina al niet meer.** Die tak staat alleen in de weergave `embedded=false`, die /toekomst niet gebruikt; sinds ADR 0174 D6 is de kop een oordeelzin. `ankerVraag` leeft wél voort als kop van het lab (`LabKnoppen`, prop `vraag`) en verhuist daarmee mee naar Doelen.
3. **Na de herindeling blijft de modus zichtbaar zonder systeemlabel.** De oordeelzin onderscheidt haalbaarheid onder `solved` van dekking onder een vast anker (`resolvePlanVerdictSentence`). De ankerregel noemt onder `solved` de vrijheidsleeftijd en onder een vast anker het stopmoment. De ankerdrieslag staat alleen onder een vast anker. Wat de duidingszin onder een vast anker zei, blijft op het scherm: het bereik in de tegel "reikt tot", de opgeloste leeftijd in tegel 1 (ADR 0129 B9), het tekort in de melding van Plan. De bereikzin zelf blijft in gebruik in de statusbanner onder een vast stopmoment (`anchoredBannerCopy`, `lib/page-status/copy.ts`).

**Uitkomst:** het vervallen van de duidingszin raakt B10 niet. B10 blijft ongewijzigd en krijgt geen amendement. Er gelden twee voorwaarden: de kop van het lab in Doelen blijft `ankerVraag`, en de ankerregel onderscheidt de modi zonder systeemlabel. De definitieve zinnen lopen via `merkstem`, zoals B10 al voorschrijft.

## Gevolgen

- **Wat het oplevert.** Overzicht eerst: boven de grafiek zakt het aantal interactieve elementen van zo'n 28 naar hoogstens vijf. Elke instelling heeft één ingang; twee modals en het legacy-formulier (samen ±4.000 regels) verdwijnen. De code volgt de indeling (`components/toekomst/{state,canvas,plan,doelen,instellingen}`) in plaats van één bestand, en de zware katernen laden alleen op hun eigen route.
- **Risico: gemiste katernen.** Content achter routes wordt gemist. Dat vangen drie dingen op: het canvas op alle routes, koppen met samenvatting, en de aannamesregel met link. Helpt dat niet, dan geldt C′ (D8).
- **Risico: de state-provider wordt de nieuwe god-component.** Hij erft de state van ±5.000 regels. Regel: de provider draagt state, afgeleide feeds en de euro-render-grens, geen JSX-blokken. Groeit hij, dan splitst hij per concern (sim, scenario, lagen, perspectief). Het aandachtspunt `horizon-god-component` gaat daarom pas dicht als geen opvolgbestand de rol overneemt; anders verhuist het naar de provider.
- **Risico: de kosten van `router.refresh()`** op een layout die de horizon-loaders draagt. Die worden gemeten tegen de TTFB-baseline in `docs/superpowers/plans/2026-09-26-ttfb-oorzaak-en-plan.md`.
- **Risico: dubbele deflatie** als een katern-component zelf deflateert. Er is één grens, in de provider. Katernen krijgen `view*`-feeds, of een eigen grens met bron-test.
- **Regressiebewijs.** De zeventien bron-scan-tests verhuizen elk naar het bestand waar hun invariant woont: één invariant, één bestand.
- **Prijs.** Route-groep, provider en decompositie zijn meer verbouwing dan tabs (A) of een `?katern=`-schakelaar (B). Dat is de prijs van een gemonteerd canvas plus een URL per katern.
- **Topologie.** Geen nieuw domein, geen nieuwe applicatiedienst, geen nieuw data-object, geen rekenmotor: dit is presentatie binnen `app-comp` op `fn-toekomstplannen` en `as-planning`. Er is geen migratie voorzien; `knopWeergave` en `status_banner_minimized` worden in hun fase nagegaan.

## Platen en views per fase

Een plaat beweegt mee in de fase die hem onwaar maakt, niet in een nazorgfase. Fase 6 regenereert alleen de gescande feiten.

| Fase | View | Wat meebeweegt |
|---|---|---|
| 0 | ADR's | Dit besluit en de addenda in 0170, 0142 en 0129; de spec van 1 jun gemarkeerd als vervangen. Geen topologiewijziging. |
| 1 | Berekeningen | `lib/architecture/calculations.ts`: vijf `files[]`-verwijzingen naar `horizon-client.tsx` en één naar `app/(app)/toekomst/gebeurtenissen/page.tsx` wijzen naar het opvolgbestand; anders wordt `calculations.test.ts` rood op bestandsexistentie en op functions-in-files. Routenamen `/toekomst/voorkeuren` en "navkaart" worden `/toekomst/instellingen` en katern-kop. |
| 1 | Plaat | `lib/architecture/archimate-model.ts`: `sp-plannen.items` (de drie katernen plus Rekenhulp) en de lead van `as-planning` (het lab op `/toekomst/doelen`). De routenaam in het aandachtspunt over de profielsnapshot. |
| 1 | Aandachtspunten | `horizon-god-component`: dicht zodra `horizon-client.tsx` weg is, of herformuleerd naar de state-provider als die de rol overneemt (zie Gevolgen). |
| 1 | Praatplaat | `lib/architecture/hld-model.ts`: de Voorkeuren-kaart op Toekomst en "bij Voorkeuren" worden katern Instellingen. |
| 2 | Praatplaat | De geldstroom als modus, de lagen en de drie getallen onder de waaier, als capability-tekst. |
| 3 | Praatplaat, Berekeningen | Eén ingang per instelling en de verschilregel; de editors als nieuwe lezers van `runRegelProjection`. |
| 5 | Stromen, Praatplaat | `lib/architecture/archimate-flows.ts`: de stroom `snapshot-trend` eindigt in de gezondheidskassabon op /overzicht; het verloop verlaat de Toekomst-capabilities. |
| 6 | Feiten | `npm run arch:diagram` (ADR-scan, churn, datatoegang) en de org-site; niets handmatig. |

`archimate-flows.ts` kent geen stroom "Toekomst", en er komt er geen: de driedeling is presentatie, geen nieuwe waardeketen. De stroom `transactie-naar-vrijheid` eindigt op `fn-toekomstplannen` en blijft kloppen.

## Verworpen alternatieven

- **A. Drie tabs boven de grafiek, of drie losse pagina's.** Tabs zijn voor wisselende weergaven van dezelfde inhoud, niet voor drie taken. In Instellingen verlies je de grafiek als feedback, in Doelen moet ze gedupliceerd worden.
- **B. Eén route met een `?katern=`-schakelaar.** Dan heeft geen katern een eigen URL, terwijl de eigenaar in juni bewust voor echte routes koos, en blijft het god-component één bundel.
- **De katernen als segmented control.** Verworpen: dat is de modus-switch boven de grafiek, en twee gelijke controls verwarren.
- **De vrijheidsleeftijd alleen in de kop, met een KPI-strip van drie cellen.** Verworpen door de eigenaar: de kassabon hoort onder het getal, dus de leeftijd staat in de kop én als eerste KPI.

## Verwant

ADR 0170 (B6, B7/B11/B12, B9 — geamendeerd), ADR 0142 (D5 — geamendeerd), ADR 0129 (B13 — geamendeerd; B10 getoetst, ongewijzigd), ADR 0144 (punt 2 — locatie geamendeerd), ADR 0162 (ongewijzigd), ADR 0174 en 0175 (oordeelzin), ADR 0110 (h1), ADR 0058 (datapad), ADR 0090 en 0093 (euro-weergave), ADR 0145 D7a, ADR 0168, ADR 0026, ADR 0039. Vervangen: `docs/superpowers/specs/2026-06-01-toekomst-tijdas-landing-navkaarten-design.md`.
