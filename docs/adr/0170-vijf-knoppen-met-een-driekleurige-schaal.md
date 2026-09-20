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
hangt zou een grens laten staan die niet meer klopt. De batch draait in een eigen worker-lane (`'grenzen'`, één in-flight +
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
