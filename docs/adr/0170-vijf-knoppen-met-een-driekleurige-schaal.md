---
id: 0170-vijf-knoppen-met-een-driekleurige-schaal
title: 'Het doelscenario is vijf knoppen met een driekleurige schaal: de grens staat op de knop, niet in een antwoordregel'
status: aanvaard
date: 2026-09-19
elements: [as-planning, fn-toekomstplannen, sp-plannen]
---

# 0170 — Vijf knoppen met een driekleurige schaal

## Context

Het doelscenario-lab onder de grafiek op /toekomst (katern II "Verken je aannames") is in
vijf rondes gegroeid: ADR 0129 (stop-anker × eind-vorm), ADR 0144 (het lab is de énige
wat-als-verkenning), ADR 0145 + D12 (dekking en eindvermogen als uitkomst onder een vast
anker), de spec *antwoorden-naast-sliders* (15 sep 2026) en ADR 0160 (de vierde knop). Elke
ronde was op zichzelf verdedigbaar; samen leverden ze één blok met twee genummerde stappen
("1 Waar draai je aan?" / "2 Reikt je plan?"), een driezone-marge-band met basis-, verwacht-
en laatst-markers, een koppel-checkbox, een dekkingsbalk met drie tegels, per-knop
antwoordregels met een "Reken hiermee"-knop, een "Wat hoort daarbij?"-blok, een
uitleg-disclosure van drie alinea's, een intro-alinea, een katern-leadtekst, een ingeklapte
samenvatting, een badge-rij en een concept-banner.

De eigenaar (19 sep 2026) noemt dat **te ingewikkeld**. De vraag die de gebruiker stelt is
er één: *haalt mijn plan het, en wat moet ik draaien om het te halen?* Dat antwoord stond
verspreid over drie duidingslagen die elk een ander deel van de waarheid droegen — en de
twee €-antwoorden claimden bovendien bewust géén uitkomst ("hoort bij een gedekt plan"),
omdat de maandhint (P!B96) over de maanden tot de eindleeftijd uitsmeert terwijl de
slider-hefbomen op het stopmoment stoppen. Gemeten gaf het gezette hint-bedrag 94 % resp.
87 % dekking, niet 100 % (ADR 0145 D10, eindreview I2). Een getal dat naast een knop staat
maar die knop niet dekkend maakt, is precies de complexiteit zonder de opbrengst.

## Besluit — de eigenaarskeuzes van 19 sep 2026

**B1 — Vijf knoppen, in vaste volgorde.** *Meer verdienen · Minder uitgeven · Uitgave na
pensioen · Nalatenschap · Stopleeftijd.* "Minder werken" (werkdagen) vervalt als knop:
rekenkundig dezelfde hefboom als salaris, en de knop die er niet is, hoeft niemand te
begrijpen. Marktbias (rendement per categorie) blijft, **ingeklapt** onder de knoppen en
zonder kleurschaal — het is een aanname over de markt, geen hefboom die de gebruiker zelf
in de hand heeft.

**B2 — De grens staat op de knop.** Elke knop draagt dezelfde driekleurige schaal: **rood**
je plan reikt niet · **oranje** gedekt, maar met minder dan 10 % marge · **groen** ruim
gedekt. De grens rood → oranje is de *berekende* grens: de waarde waarop het plan precies
gedekt is, met de andere vier knoppen op hun huidige stand. Beweegt één knop, dan verschuiven
de grenzen op **alle** knoppen mee — dat is de kern van het ontwerp: de schaal ís de duiding,
dus de antwoordregels, de marge-band en de tegels kunnen weg.

Op die grens staat een **merkteken** (eigenaarswens 20 sep 2026): dezelfde vorm als het
"nu"-streepje, maar in volle inkt en met het label "gedekt" — "nu" is waar je staat, dit is
waar je moet komen. Het schuift mee met dezelfde duur als de kleursegmenten, zodat merkteken
en kleurgrens één beweging zijn wanneer een andere knop de grens verschuift. Op de wijzer
steekt het aan de buitenkant van de band uit (het "nu"-streepje valt er juist binnen).
Ligt de grens buiten het bereik van de knop, dan staat er géén merkteken: een grens die je
niet kunt aanwijzen, wijs je niet aan — de regel eronder zegt dan waaróm.

**B3 — De 10 %-marge meet de uitkomstmaat van het plan.** Onder een **vast stopmoment**
(`aow`/`age`/`now`) is dat de **dekking**, uitgedrukt in tijd: het plan moet ook reiken tot
`eind + 10 % × (eind − planStop)` — bij stop 62 en eindleeftijd 90 dus tot ~93. Onder **"zo
vroeg als het kan"** (`solved`) is het de **vrijheidsleeftijd**: 10 % van de jaren tot je vrij
bent, dus wie op 40 vrij kan zijn op 55 zit tussen 55 en 56,5 in oranje. De span van de
marge hangt aan het **plan**, niet aan de stand van de stop-knop: anders verschuift de
definitie van "ruim" terwijl je aan die knop draait.

**B4 — "Minder uitgeven" staat in euro per maand**, met de spaarquote als detailregel
eronder. Onder de motorkap blijft het hetzelfde spaarquote-event (procentpunten) en hetzelfde
`savings_rate`-doel; alleen de eenheid op het scherm verandert, zodat de eerste twee knoppen
in dezelfde eenheid lezen.

**B5 — Eén lab voor alle plannen.** Dezelfde vijf knoppen en dezelfde schaal onder `solved`,
`aow`, `age` en `now`. De twee gezichten van sectie 2 (marge-band vs. dekkingsas, ADR 0145 D8)
vervallen; `Vrijheidsas`, `Dekkingsbalk` en `computeStopMarge` gaan mee.

**B6 — Strak onder de fasering.** De knoppen staan in de grafiekkaart, direct onder de
`PhaseBar`, met daaronder één opslaan-balk. Katern II als eigen inklapbare sectie vervalt;
alleen toelichting die iets toevoegt blijft staan.

**B7 — Twee vormen, de wijzer als standaard** (eigenaarskeuze 20 sep 2026). Dezelfde vijf
knoppen staan als **wijzer** (een halfronde meter, de vorm van de geldstroom-kaart op
/overzicht/budget/transacties) of als **balk**. De wijzers zijn smal en staan op een breed
scherm alle vijf naast elkaar, op de telefoon twee per rij; de balken vragen breedte om hun
schaal af te lezen en blijven één kolom op de telefoon, twee vanaf tablet. De keuze staat als
schakelaar in de kop en wordt server-side bewaard naast `showScenarioLine` — cross-device,
en bewust GÉÉN onderdeel van `ToekomstScenarioStand`: van vorm wisselen verandert je plan niet,
dus de opslaan-balk mag daar niets van zeggen.

De wijzer is niet zélf het besturingselement: er ligt een onzichtbare `<input type="range">`
overheen die de bediening en de toegankelijkheid draagt. Een zelfgebouwde sleep-interactie op
een boog moet pijltoetsen, `aria-valuetext` en de iOS-tik-afhandeling opnieuw uitvinden, en dat
zijn precies de drie waar zulke knoppen in de praktijk op stuklopen. In wijzer-vorm staan de
plan-acties ("Maak X mijn stopmoment", "Je plan-keuzes") onder het hele blok in plaats van onder
de stop-knop: de cel is daar te smal, en ze gaan over het plan als geheel.

Op de band zit wél een **greep**: een bolletje op de stand van de naald, om met de vinger aan te
draaien (eigenaarswens 20 sep 2026) — zonder zichtbaar handvat ziet een meter eruit als een
plaatje, niet als een knop. Dat is geen tweede schrijfpad: de greep sleept op **hoek** t.o.v. het
middelpunt (op een boog lopen hoek en x-positie uiteen, aan de uiteinden tot een tiende van het
bereik) en schrijft door dezelfde `onChange` als het invoerveld, dat de bediening voor muis en
toetsenbord én de toegankelijkheid blijft dragen. De greep ligt in een eigen laag ná dat
invoerveld, want aan de uiteinden van de boog dekt het 44 px-sleepvlak de band af; alleen het
bolletje vangt aanrakingen, zodat een veeg die elders op de meter begint gewoon de pagina scrollt.
Het aanraakvlak is een HTML-element met een vaste maat, géén SVG-cirkel: die schaalt mee met de
viewBox en zakt in het twee-koloms raster op een telefoon terug naar ~32 px — onder de norm, en
precies waar de vinger 'm nodig heeft. Dat de greep in een `aria-hidden`-boom hangt is hier
bewust: het invoerveld draagt de volwaardige bediening, dus een schermlezer hoort de knop één
keer. Dat is een toegevoegde laag voor wie kan slepen, geen tweede ingang — en nadrukkelijk geen
vrijbrief om elders interactie in een verborgen boom te hangen.

De greep draagt de **module-accentkleur** van de balk-duim (`--module-active-500`, bij
vastpakken `-700` en groter — wat `.slider-module` met `scale(1,2)` doet). Twee vormen van
dezelfde bediening horen één kleurtaal te spreken; de driekleurige schaal eronder draagt de
semantiek, de greep zegt alleen "hier pak je 'm vast".

**B8 — De kleuren komen uit de score-ladder, niet uit de editorial value-change-tokens.**
`--positive`/`--warning`/`--negative` staan bewust op lage chroma (0,09–0,11): ze zijn gemaakt
om als tékst naast een bedrag te staan. Als vlak van 12 px leest dat als bruin–olijf–donkergroen
en verliest de schaal precies wat ze moet doen. `--score-bad/-warn/-good` (chroma 0,17–0,22)
zijn gedocumenteerd voor exact dit doel — "duidelijke band-kleuren in ring/balken" — en blijven
semantisch: de gebruiker kan ze niet instellen.

**B9 — De knoppen laten hun effect in de grafiek zien** (eigenaarskeuze 20 sep 2026). Zodra
er een verkenning ontstaat, verschijnt de gestippelde wat-als-lijn vanzelf: zonder die lijn
kleuren de knoppen wél, maar zie je niet wát er verandert, terwijl die lijn is waar de knoppen
over gaan. Alleen op de OVERGANG van "geen verkenning" naar "wel een verkenning", niet bij
elke knopbeweging — zet de gebruiker de lijn daarna bewust uit, dan blijft dat zo tot hij
terug naar basis gaat. Een ref houdt de vorige stand vast, zodat het laden van een bewaarde
verkenning een opgeslagen "uit" niet alsnog overschrijft.

Tussen de basislijn en de wat-als-lijn komt een **gearceerd verschilvlak**: groen waar de
wat-als hóger ligt (meer vermogen), rood waar hij láger ligt. Twee lijnen dicht bij elkaar
laten zien dát er verschil is, niet hoeveel en niet welke kant op; het vlak beantwoordt de
vraag die de knoppen stellen zonder dat de lezer twee curves met het oog hoeft af te trekken.

Drie regels daarbij. (1) **Op de kruising wisselt het vlak van kleur op het sníjpunt**, niet op
het eerstvolgende meetpunt — anders steekt er een rood driehoekje boven de basislijn uit en
zegt de kleur iets anders dan de lijnen. Het snijpunt wordt lineair geïnterpoleerd en zit in
béíde vlakken, zodat er geen gat of overlap ontstaat (`lib/horizon/scenario-diff-vlakken.ts`,
puur en apart getest). (2) **Één grondslag**: beide reeksen volgen dezelfde `primaryBasis`
(netto vermogen óf liquide) — een vlak tussen twee grondslagen toont een verschil dat er niet
is. (3) De kleuren zijn hier de **value-change-tokens** (`--positive`/`--negative`) op lage
dekking, niet de fellere score-ladder van de knoppen: een vlak op deze schaal moet de lijnen
ondersteunen, niet overstemmen. Alleen de LIVE wat-als krijgt een vlak; opgeslagen
ghost-scenario's niet, anders wordt de grafiek een lappendeken.

**B10 — Het doelscenario staat ook in de eenvoudige weergave** (eigenaarskeuze 20 sep 2026). De
oude gate toonde het blok in Eenvoudig alleen bij een vastgelegd doel. Dat paste bij de vorm
van vóór dit besluit — twee genummerde panelen met duidingslagen — maar niet bij vijf knoppen
die zelf hun grens dragen: dat ís de eenvoudige vorm, en achterhouden verbergt de manier waaróp
je een doel maakt voor precies de lezer die Eenvoudig koos. `verkenSectieZichtbaar` hangt
daarmee nog alleen aan het perspectief (solo — op een partner-/huishoudlijn rekent het lab
niet). Twee dingen vielen daardoor weg: de sessie-vlag `doelLosgelatenDezeSessie`, die bestond
om te voorkomen dat "Doel loslaten" in Eenvoudig de enige weg terug meenam (melding B-031, nu
structureel opgelost), en de koppeling van katern III aan het in-/uitklappen van dit blok — dat
inklappen bestaat niet meer, en de koppeling hield "Wat het betekent" permanent verborgen.

**B11 — Een derde vorm: het rad** (eigenaarskeuze 20 sep 2026). Op een telefoon is verticale
ruimte het schaarse goed: vijf wijzers kosten ~600 px, vijf balken ~500. De rad-vorm is één
element van ~90 px: links een verticaal draairad (de kiezer van iOS — het gekozen onderwerp in
inkt in het midden, de buren gedempt erboven en eronder, en het woord rólt naar het volgende),
rechts één balk voor dat onderwerp. De balk is de bestaande `LabSlider` met verborgen label;
het rad is het label.

Wat het rad méér is dan een keuzemenu: naast elke naam staat een stoplichtpunt met de zone van
dát onderwerp, uit dezelfde `zoneVanWaarde`-afleiding als de knop zelf. De kern van dit ADR
(B2) is dat de grens op álle knoppen meebeweegt als je aan één draait; met één balk in beeld
zou dat inzicht verdwijnen. Vijf namen met vijf punten laten de hele stand zien, en een punt
dat verspringt terwijl je aan een andere knop draait laat de koppeling nog steeds zien.

Drie keuzes van de eigenaar. (1) **Bediening is vegen**, geen tik-op-een-rij: het rad is een
echte scroll-container met `scroll-snap` en `overscroll-behavior: contain`, zodat de browser
het snappen doet en een veeg voorbij het einde de pagina niet meetrekt; het toetsenbord (pijl
omhoog/omlaag) blijft als toegankelijkheid, niet als tweede bediening. (2) **Rad links, balk
rechts**: één rij; de balk krijgt ~60 % van de breedte, op 360 px zo'n 200 px. (3) **Een derde
keuze naast Wijzers en Balken**, geen automatische standaard op smal: de wijzer blijft overal
de standaard, `knopWeergave` krijgt de waarde `'rad'` erbij (zelfde pref, zelfde parser, geen
migratie). Welk onderwerp het rad toont is ephemeral — kijken is geen plan-keuze — en valt
terug op het eerste beschikbare onderwerp zodra het gekozen onderwerp verdwijnt. De plan-acties
staan in rad-vorm onder het blok, net als bij de wijzers: de stop-knop is niet altijd in beeld.

**B12 — Twee vormen die de koppeling tékenen: de harp (mobiel) en de vijfhoek (laptop)**
(eigenaarswens 20 sep 2026: "verras me in vorm, niet in functie"). Dezelfde vijf standen,
dezelfde grenzen, dezelfde `onChange` en dezelfde toegankelijkheid als de andere vormen; alleen
de tekening verschilt. Beide vormen zijn gekozen na een verkenning van gevestigde patronen
(radar met sleepbare hoekpunten, parallelle coördinaten, nomogram, faders, ringen,
kaartenstapel, 2D-pad, scrubbable getallen). Kaartenstapel, story-navigatie en 2D-pad vielen af
omdat ze de koppeling uit B2 niet kunnen tonen; concentrische ringen omdat vijf ringen op een
telefoon geen 44 px raakvlak halen; het nomogram omdat de relatie niet lineair is.

De **harp** (`lab-harp.tsx`, mobiel, ~270 px): vijf stroken van 44 px onder elkaar, elk met de
bestaande band, het "nu"-streepje en het gedekt-merk, en dwars door alle vijf twee lijnen —
doorgetrokken door de duimen (jouw plan als één vorm, module-accent) en gestreept door de
gedekt-merken (de grens als één vorm, inkt). Draai je aan één strook, dan knikt de gestreepte
lijn op de andere vier: de koppeling staat letterlijk in beeld. De gestreepte lijn breekt waar
een grens buiten bereik ligt (dezelfde regel als het merkteken). Elke strook is een echte
`<input type="range">` op de band; er is géén eigen sleep-handler — de browser doet de
gesture-arbitrage, dus geen scrollconflict. De lijnen zijn één `aria-hidden` SVG-laag met
`pointer-events: none` en EXPLICIETE breedte/hoogte (een absoluut gepositioneerde SVG neemt bij
`auto` zijn intrinsieke maat, niet top/bottom — daar liep de eerste versie op stuk).
Normalisatie: elke strook loopt 0–100 % van zijn eigen bereik en het echte getal staat rechts;
anders domineert de nalatenschap alles. Onder de figuur staat één grensregel, van de laatst
aangeraakte strook; elke strook heeft daarnaast een sr-only regel voor `aria-describedby`.

De **vijfhoek** (`lab-vijfhoek.tsx`, laptop, ~400 px hoog): één pentagram met per spaak de
driekleurige band, jouw stand als sleepbaar hoekpunt en de vijf gedekt-merken verbonden tot een
gestreepte "gedekte" vijfhoek. De vraag "haalt mijn plan het?" wordt één blik: ligt mijn
vijfhoek buiten de gedekte? Drie regels tegen de bekende radar-vertekening: géén gevuld vlak
(oppervlak groeit kwadratisch), vaste as-volgorde (B1), en het getal staat altijd in cijfers in
de legenda — de vijfhoek is de bediening, het getal is de waarheid. Bediening is grof + fijn
(NN/g): grof door het hoekpunt te slepen (44 px HTML-greep in een laag ná de inputs, projectie
van de cursor op de spaak, `standUitVinger` tegen verspringen bij vastpakken — de constructie
van de wijzer), fijn door horizontaal over een legenda-regel te slepen: daar ligt de echte
`<input type="range">` (het Figma-patroon van het scrubbable getal), die óók pijltoetsen en
`aria-valuetext` draagt.

Beide zijn keuzes in de schakelaar (`knopWeergave`: `harp`, `vijfhoek`), geen standaard; de
lijst `KNOP_WEERGAVEN` is één bron voor type, parser en schakelaar. Open punt uit de
verkenning, bewust niet in deze ronde: bij een sleep verschuift de grens ónder de
knop-in-je-hand mee (target escape) — de grens van de actieve knop bevriezen tijdens de sleep
en alleen de vier andere animeren zou de "ripple" leesbaarder maken. Dat raakt alle vormen en
de grenzen-batch, en is een eigen besluit.

In harp en vijfhoek geldt, net als op het rad, dat een onderwerp dat er niet is gewoon niet op
de figuur staat: de nalatenschap-notitie ("je plan houdt je vermogen in stand") hoort bij de
losse knop-cel van balk en wijzer en verschijnt in de drie figuur-vormen niet. Op de vijfhoek
geldt "verder naar buiten = beter" op álle spaken: bij een dalende knop (uitgave na pensioen,
nalatenschap) wordt de positie gespiegeld (`opSpaak`), anders zeggen drie assen "buiten =
gedekt" en twee "binnen = gedekt" en houdt de één-blik-lezing niet stand terwijl elke spaak
apart wél goed kleurt. De harp houdt bewust de richting van de balk (links = minimum): daar is
de belofte niet "rechts = beter" maar "één lijn door de duimen, één door de merken". In de
vijfhoek-legenda ligt het invoerveld alleen over het getal, niet over de hele rij: het element
springt native naar de klikpositie, en een klik op het label zou de stand anders naar het
minimum zetten.

**B13 — De stop-knop loopt tien jaar naar beide kanten** (eigenaarskeuze 20 sep 2026). De
schaal van de stopleeftijd is `basis ± 10` jaar rond waar het plan mee rekent, hard geklemd op
de huidige leeftijd en de eindleeftijd (`stopKnopBereik` in `lib/scenario-events.ts`, naast de
andere knopbereiken). Daarvóór liep hij van de huidige leeftijd tot voorbij de eindleeftijd —
op een band van 60 jaar is een halve stap nauwelijks zichtbaar. Gevolg dat erbij hoort: de
bisectie zoekt de grens bínnen dit venster. Ligt de gedekt-leeftijd verder dan tien jaar van
het plan (plan 62, pas gedekt op 75), dan zegt de knop "over het hele bereik niet gedekt" waar
hij vroeger het merkteken op 75 toonde. Dat is consistent met B2 (de schaal ís het bereik van
de knop) en met de regel dat een grens die je niet kunt aanwijzen niet wordt aangewezen. Een
bewaarde stand buiten het venster blijft aanwijsbaar (de schaal rekt tot en met de stand),
nooit voorbij de twee harde grenzen.

## Wat dit vervangt

- **ADR 0145 D8–D10** (de dekkingsas, de drie draaiknoppen, de antwoorden naast de knoppen).
  D1–D7 en D11–D12 blijven: `resolveLabUitkomst` blijft de ene uitkomst-switch en de
  promotie-gate, en de doeltypen `plan_coverage`/`end_balance` blijven wat ze zijn.
- **ADR 0160 onderdeel 3** (de vierde draaiknop mét antwoordregel). De rekenmotor
  `solveHaalbareUitgave` en de duidingsregel in de KPI-tegel "Na pensioen" blijven ongewijzigd;
  de knop zelf gaat op in de vijf van B1 en krijgt zijn grens uit de nieuwe batch.
- De spec *antwoorden-naast-sliders* in haar geheel: `lib/horizon/lab-antwoorden.ts`,
  `SliderAntwoordRegel`, "Reken hiermee"/"Reken met maximum" en de sluitregel verdwijnen.
  De compliance-zin "Indicatie, geen advies — …" blijft, één keer, onder de opslaan-balk.

## Rekenwerk — `lib/horizon/lab-grenzen.ts`

**Eén predicaat overal.** `gedekt(input, S)` = `solveFire({ ...kernelInput, stopAnker:
{ soort: 'leeftijd', leeftijd: S } }).status ∉ {anchor_shortfall, stop_now_shortfall,
pension_shortfall}` — dezelfde set als `lib/horizon/haalbare-uitgave.ts`, en dus de kernel z'n
eigen oordeel in plaats van een herhaalde formule. Het `stopAnker` gaat op de **KernelInput**,
niet via een profielrij-patch; onder een vast anker kortsluit `solveFire` dan tot één
engine-run.

*Waarom niet "solved fireAge ≤ S"?* Omdat die twee niet equivalent zijn. De solved-bisectie
toetst `isToereikend` (gap ≥ 0 plus geen blijvende tekort-lening), terwijl de vast-anker-toets
élke piek-tekortlening tot de eindleeftijd meetelt plus de `doelbedrag < 0`-regel. Anchored-
gedekt impliceert dus wel `fireAge ≤ S`, maar niet omgekeerd (een tijdelijke tekort-episode).
Bovendien zet `evaluateFireAt` — het bestaande stop-pad — géén `stopAnker`, waardoor de
shortfall-set daar een tekort zou missen. Eén predicaat voor `huidig` én voor elke grens is de
enige manier waarop de gekleurde schaal en het zone-woord elkaar niet kunnen tegenspreken.

**Het ruim-predicaat** is hetzelfde oordeel op een gestreste invoer: onder een vast anker een
profielrij-patch `fire_end_age = min(100, eind + 0,1 × (eind − planStop))` (werkt omdat
`buildEindstrategie` beide eindleeftijden uit `plan.endAge` leest); onder `solved` een anker op
`S′ = (S + 0,1 × nu) / 1,1`, want `S ≥ vrij + 0,1 × (vrij − nu) ⟺ vrij ≤ S′`. Onder eind-vorm
`perpetual` bestaat er geen eindleeftijd om op te rekken. De engine zet `ruim` daar gelijk aan
`gedekt` (niet `null`): de band loopt dan rood → groen met een lege oranje zone, en dat is
precies wat `huidig.ruim = huidig.gedekt` zegt. Met `null` zou de band oranje doorlopen tot het
einde terwijl het zone-woord "ruim gedekt" zei — twee uitspraken die elkaar tegenspreken. De
grensregel noemt de grens dan één keer (`labGrensRegel` laat een samenvallende `ruim` weg).

**Per knop** grijpt de variatie aan op de plek waar de app dat al doet: *verdienen* en
*uitgeven* via `buildSliderEvent`/`applySliderEvent` (de engine bouwt de slider-events zélf uit
de vijf standen, zodat `huidig` en de bisectie één parameterisatie delen), *uitgave na pensioen*
via de `custom_amount`-patch van `haalbare-uitgave.ts#inputMet`, *nalatenschap* via
`patchNalatenschap`, en *stopleeftijd* via `S` zelf.

**`patchNalatenschap` (`lib/horizon/kernel-profile-basis.ts`) is bewust een helper en geen
inline spread.** Een kale `{ fire_end_strategy: 'legacy', fire_legacy_amount }` is onveilig:
(a) `feature_preferences.fire_strategy_override` wordt éérst opgelost en overschrijft
`fire_end_strategy`, en (b) een oud ankerlabel `'pensioen'`/`'nu-stoppen'` in die kolom draagt
het stop-anker (ADR 0129 D2) — overschrijven laat het anker stil terugvallen op
`fire_stop_anchor`. De helper stript de override en houdt het anker in stand. Dezelfde helper
gebruikt de scenario-run in `use-horizon-fire-sim.ts`, zodat de wat-als-lijn en de gekleurde
schaal op dezelfde stand rekenen.

**Kosten en pacing.** Alle runs zijn geankerd (13–25 ms per run in de worker, gemeten
`run-in-worker.ts`). Een volledige batch is ~90 runs (5 knoppen × 2 predicaten × bracket +
⌈log2(n)⌉ + vangrail), gemeten 58 runs in ~0,9 s op een persona waar drie knoppen op de
bracket kortsluiten. De engine cachet de probes BÍNNEN één bisectie; een cache per knop over
batches heen (zodat één sleep-beweging alleen de vier ándere knoppen herrekent) is bewust NIET
gebouwd — de gemeten tijd bleef binnen de debounce, en een cache die op de verkeerde sleutel
hangt zou een grens laten staan die niet meer klopt. De batch draait in een eigen worker-lane
(`'grenzen'`, één in-flight +
één gequeued, nieuwer verdringt) met 300 ms debounce, zodat de hoofdrun, de scenario-run en de
presets-batch niet wachten. Tijdens het rekenen blijven de vorige grenzen zichtbaar op halve
dekking — geen layoutsprong, en geen lege schaal.

**Monotonie-vangrail.** Zoals `haalbare-uitgave.ts` al doet: één rasterstap aan de verkeerde
kant van de gevonden grens moet ongedekt zijn. Is dat niet zo (een discontinuïteit door een
woningverkoop of een potregel), dan zegt de grens niets en levert de knop `null` — een grijze
schaal zonder grensregel. Liever geen grens dan een grens die niet klopt.

## Prefs en doelen

`ToekomstScenarioStand` krijgt `uitgaveNaPensioen` (€/jaar) en `nalatenschap` (€), zodat alle
vijf knoppen een herlaad overleven en "Herstel mijn doel" ze terugzet; `stopKoppel`/`stopMarge`
verdwijnen uit type en parser (oude prefs dragen ze nog, de parser negeert ze en schrijft ze
nooit terug), en `sliders.workdays` gaat de weg van `sliders.income`: tolerant gelezen, niet
vergeleken, niet geschreven. Geen migratie: het is één own-row JSONB-kolom, en de zod-laag
valideert de stand als `z.record` met de pref-parser als poort.

**Welke doelen het lab schrijft verandert niet.** `spaarquote` (uit Minder uitgeven),
`rendement` (uit Marktbias) en het uitkomstdoel per anker — `fire_age`, `plan_coverage` of
`end_balance` volgens `resolveLabUitkomst.promotie` (ADR 0145 D6/D12). Uitgave na pensioen en
nalatenschap zijn **plan**parameters, geen doeltypen: ze reizen mee in `doel.stand` voor
herstel, en het plan zelf wijzigt alleen via de plan-keuzes of "Maak dit mijn plan". Ze een
doeltype geven zou het veld-register van de plan-review raken en is een aparte keuze.

## Opslaan-balk

Eén rij onder de knoppen vervangt de concept-banner én de kop-actieknoppen, met vier
toestanden: *niets verschoven* ("Verschuif een knop om een doel te maken") · *nog niet
opgeslagen* (Maak dit mijn doel · Terug naar basis) · *opgeslagen als je doel op {datum}*
(Doel loslaten) · *gewijzigd t.o.v. je doel* (Doel bijwerken · Herstel mijn doel · Doel
loslaten). Onder het `now`-anker legt het lab geen doel vast (ADR 0145 D6) en zegt de balk dat.
"Doel loslaten" blijft in élke toestand beschikbaar.

## Gevolgen

- **Verwijderd**: `components/app/horizon/vrijheidsas.tsx`, `dekkingsbalk.tsx`,
  `whatif-sliders.tsx`, `verwachtingsband.ts`, `lib/horizon/lab-antwoorden.ts`,
  `lib/horizon/stop-marge.ts` (+ hun tests). `formatAge` verhuisde naar
  `lib/horizon/fire-format.ts`, `WhatIfOverrides` wordt uit `lib/types/horizon-whatif`
  geïmporteerd.
- **Nieuw**: `lib/horizon/lab-grenzen.ts` + `lab-grenzen-types.ts` (het worker-veilige
  contract), `components/app/horizon/lab-slider.tsx`, `lab-knoppen.tsx`,
  `lab-opslaan-balk.tsx`, en een `'grenzen'`-kind in het kernel-worker-protocol.
- **Curatie**: `lib/architecture/calculations.ts` (nieuwe rekenmotor, `lab-antwoorden` en
  `computeStopMarge` eruit), `lib/architecture/hld-model.ts`, `lib/page-info-content.ts`,
  UAT WF-TOEK-49/57 herschreven en WF-TOEK-58 nieuw.
- **Kopij**: alle nieuwe zinnen in `lib/horizon/anker-copy.ts` (`LAB_COPY`), met de bestaande
  toon-invarianten: beschrijvend, nooit "je moet" of "je kunt stoppen", geen "AOW" in een
  tekortzin, geen koop-/verkoop-metafoor (ADR 0165). De compliance-poort en de merkstem-toets
  lopen vóór release.
- **Geen productiecijfers in deze ADR** (ADR 0111, publieke repo).

## Verworpen alternatieven

- **De marge-band laten staan en alleen de antwoorden weghalen.** Verworpen: de band meet de
  afstand tot een verwacht-streep, en die streep bestaat onder een vast stopmoment niet — dat
  was precies de reden dat sectie 2 twee gezichten kreeg. Eén schaal per knop zegt hetzelfde
  voor beide ankers.
- **De 10 %-marge als stress-toets op de uitgaven** ("gedekt bij 10 % hogere uitgaven").
  Verworpen door de eigenaar: de marge hoort de uitkomstmaat te meten die op het scherm staat
  (dekking resp. vrijheidsleeftijd), niet een tweede grootheid die de gebruiker nergens ziet.
- **De grenzen uit een lineaire benadering rond de huidige stand.** Verworpen: goedkoop, maar
  de dekking is niet lineair in de hefbomen (woningverkoop, potregels, AOW-instap), en een
  grens die er net naast ligt kleurt een stand groen die het niet is.
- **`solveFireAgeWithoutAnchor` als grens voor de stop-knop.** Verworpen: die functie
  beantwoordt een andere vraag (de solved-bisectie), waardoor de stop-grens en het zone-woord
  van de huidige stand elkaar konden tegenspreken. Hij blijft wél de seed voor het bracket.
