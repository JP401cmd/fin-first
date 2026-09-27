# /toekomst in drie katernen — kopij-toets fase 0

Datum: 26 september 2026 · Hoort bij: `2026-09-26-toekomst-drie-katernen-design.md` (§9 fase 0) en ADR 0179 · Toetsen: `merkstem` (toon, framing, ADR 0165) en `compliance-check` (Wft-grens: inzicht mag, advies niet)

Getoetst: kop, ankerregel, aannamesregel, katern-koppen, Lagen-menu, plus de meldingsregels en de uitkomstregel die in de mockup staan. Bron voor elke wijziging is een bestaande canonieke formulering in de code. Er is geen nieuwe tekst bedacht waar de app er al een heeft.

**Uitkomst compliance-check: goedkeuren na aanpassing.** Alles blijft inzicht: sommen op de eigen situatie, rendement en inflatie benoemd als aanname, geen product, geen aansporing tot een geldhandeling. Vier formuleringen moeten anders. Twee daarvan omdat ze een projectie als belofte lezen ("Vrij op 52,3", "Stoppen op 60"), één omdat hij feitelijk onjuist is (Marktcheck "driekwart") en één omdat hij het verkeerde gegeven noemt (AOW-melding). Escalatie via `legal-risk-assessment` is niet nodig: er is geen nieuwe claimcategorie.

## 1. Kop (oordeelzin)

| Concept (spec) | Besluit | Tekst |
|---|---|---|
| "Je toekomstplan is *haalbaar*." | **Goedkeuren** | Geconsumeerd uit `resolvePlanVerdictSentence` (`lib/horizon/plan-status.ts`): *haalbaar* · *haalbaar, je doel nog niet* · *nog niet haalbaar* · onder een vast anker *voor 96% gedekt*. Constaterend, geen imperatief, geen nieuwe tekst. |

## 2. Ankerregel

| Concept (spec) | Besluit | Tekst | Waarom |
|---|---|---|---|
| Gesolved: "Vrij op 52,3." | **Aanpassen** | "Vrij mogelijk vanaf je 52e." | (1) Precisiebesluit M5 (27 aug, `formatHeroFireAge`): het kopgetal is een heel jaar, de fractie staat alleen in de kassabon. "52,3" belooft een nauwkeurigheid van een tiende jaar over vijftien jaar. (2) "mogelijk" markeert de projectie; zonder dat woord leest de regel als belofte. (3) Het is de bestaande zin van `ankerVrijZin` (`lib/horizon/anker-copy.ts`), dus één formulering voor één gegeven. |
| Gesolved, onbereikbaar | **Toevoegen** (canoniek) | "De app vindt binnen dit plan nog geen leeftijd waarop je vermogen het zelf draagt." | Bestaande nul-tak van `ankerVrijZin`. |
| Vast anker: "Stoppen op 60 · voor 96% gedekt." | **Aanpassen** | "Je rekent met stoppen op 60." · nu-anker: "Je rekent alsof je nu stopt." | (1) Het percentage staat al in de oordeelzin ("…is voor 96% gedekt."), dus de ankerregel noemde het een tweede keer (regel 10). (2) Een kale "Stoppen op 60" leest als instructie. De anker-copy-regel is dat de app niet zegt dát je kunt stoppen, alleen hoe ver je vermogen reikt. (3) Het is de bestaande `ankerTitel`. |

**Gevolg voor KPI 1:** de cel toont `formatHeroFireAge`, dus "52" met onderschrift "jaar". De kassabon eronder toont 52,3. De wireframes in §4.3 en §4.4 met "52,3" in de KPI volgen dit besluit.

## 3. Aannamesregel (alleen in Plan)

| Concept (spec) | Besluit | Tekst |
|---|---|---|
| "Op basis van: zo vroeg mogelijk stoppen · tot je 90e · 2,0% inflatie · 3 gebeurtenissen  Aanpassen →" | **Aanpassen** | Volledig: "Op basis van: stopmoment zo vroeg mogelijk · plan tot je 90e · 2,0% inflatie · 5,0% rendement per jaar · 3 gebeurtenissen" + link "Naar instellingen →" |
| Eenvoudig (§4.7) | **Aanpassen** | "Op basis van: stopmoment zo vroeg mogelijk · plan tot je 90e · 3 gebeurtenissen" + dezelfde link |
| Vast anker | idem | "stopmoment 60" in plaats van "stopmoment zo vroeg mogelijk" |

Waarom: "zo vroeg mogelijk stoppen" leest als aansporing, "stopmoment zo vroeg mogelijk" als instelling, en dat laatste is het ook. "tot je 90e" wordt "plan tot je 90e", zodat het de eindleeftijd van het plan is en geen levensverwachting. Rendement staat alleen in Volledig en hoort in een rij die met "Op basis van" begint. Zo is het een benoemde, generieke aanname en geen voorspelling (compliance: grijze zone rendementsaannames). De link noemt zijn bestemming, want hij springt naar een ander katern: "Naar instellingen →". Dat past bij het bestaande patroon "Naar je AOW-strategie".

## 4. Katern-koppen

| Onderdeel | Concept (spec) | Besluit | Tekst |
|---|---|---|---|
| Labels | Plan · Doelen · Instellingen | **Goedkeuren** | Eigenaarsbesluit 26 sep; gewone taal. |
| Samenvatting Plan (inactief) | "vrij op 52,3" | **Aanpassen** | Gesolved: "61% van je doelbedrag" · vast anker: "reikt tot je 88e" |
| Samenvatting Doelen (inactief) | "stoppen op 58 · gedekt" | **Aanpassen** | "stopmoment 58 · gedekt". Zonder doelscenario: "nog geen doelscenario". Zonewoorden uit `LAB_COPY`: *gedekt*, *ruim gedekt*, *gedekt · krappe marge*, *reikt niet*. |
| Samenvatting Instellingen (inactief) | "nog 2 stappen · AOW mist" | **Aanpassen** | "nog 2 voorkeuren open · AOW ontbreekt" |
| Statuspunt | kleur = ernst | **Aanvullen** | Het punt krijgt een tekstlabel voor schermlezers ("Instellingen, melding: AOW ontbreekt"), want kleur alleen is geen informatie (WCAG 1.4.1). |

Waarom Plan: de samenvatting van Plan staat alleen op de schermen Doelen en Instellingen, en daar staat de kop ("Vrij mogelijk vanaf je 52e.") er al boven. "vrij op 52,3" zei dus hetzelfde getal twee keer op één scherm. De voortgang naar het doelbedrag staat daar nergens anders. Waarom Doelen: "stopmoment 58" beschrijft het scenario; "stoppen op 58" leest als opdracht. Waarom Instellingen: "mist" is spreektaal, en de bestaande melding heet "AOW ontbreekt". "nog 2 voorkeuren open" staat alleen op schermen waar de wizard-kaart niet staat, dus §4.9 ("4 van 6 alleen in de wizard-kaart") blijft gelden. **Besloten door de eigenaar (26 sep): met wizardstand.** De samenvatting blijft "nog 2 voorkeuren open · AOW ontbreekt" (`INSTELLINGEN_SAMENVATTING_TOONT_WIZARDSTAND = true` in `lib/horizon/katern-copy.ts`).

## 5. Lagen-menu

Kop: "Lagen op de grafiek". **Goedkeuren.**

| Laag (spec) | Besluit | Label · uitleg in het menu |
|---|---|---|
| Gebeurtenissen | Goedkeuren | **Gebeurtenissen** · "Wat je zelf op je tijdas zette, zoals een kind of een verhuizing." |
| Natuurlijke mijlpalen | **Aanpassen** | **Mijlpalen** · "Momenten die uit je plan volgen, zoals je AOW of een lege pensioenpot." ("natuurlijke" voegt niets toe; §4.2 zegt al "Mijlpalen".) |
| Doelen | Goedkeuren | **Doelen** · "Je vastgelegde doelen als punt op de lijn." |
| Doelscenario-lijn | **Aanpassen** | **Je doelscenario** · "De stippellijn: je plan met de knoppen uit Doelen." |
| Marktcheck, uitleg "driekwart van de doorgerekende markten" | **Aanpassen, feitelijk onjuist** | **Marktcheck** · "Je plan vaak opnieuw doorgerekend met een ander marktverloop. De band is de middelste helft van de uitkomsten, de lijn erin het midden. Geen voorspelling: het laat zien hoe gevoelig je plan is voor de markt." |
| Scenario's ±2pp | **Aanpassen** | **Rendement hoger en lager** · "Je vermogenspad bij een rendement van 2 procentpunt lager en 2 procentpunt hoger." |
| Met je huis | Goedkeuren | **Met je huis** · "Een tweede lijn met je huis erbij. De hoofdlijn is het deel waar je direct bij kunt." |
| Speel af | Goedkeuren | **Speel af** · "Loopt je plan jaar voor jaar door." |

Waarom: de band is p25–p75. Dat is de middelste **helft**, zoals de bestaande uitleg in `horizon-client.tsx` (:7164) ook zegt, en geen driekwart. "±2pp" is een onverklaarde vakterm (DNA-TOON: vakterm uitleggen of vermijden). De zin "geen voorspelling" houdt de band aan de goede kant van de grens: hij laat gevoeligheid zien en belooft geen uitkomst. Eenvoudig toont alleen Gebeurtenissen, Mijlpalen, Doelen en Je doelscenario.

## 6. Meldingen en uitkomstregel (in de mockup)

| Concept (spec) | Besluit | Tekst |
|---|---|---|
| "Je plan leent in 2049 kort om een tekort te dekken. Instelling bekijken →" | **Aanpassen** | "Je plan dekt tussen je 61e en 64e een tekort met een lening." · "Naar de instelling →". /toekomst spreekt in leeftijden en niet in jaartallen (`buildDeficitLoanCopy`). "kort" is een oordeel dat de melding niet hoeft te vellen. |
| Plan niet haalbaar · "Verken je opties →" | Goedkeuren | De actie wijst naar de eigen verkenning in Doelen en niet naar een geldhandeling. |
| "Je doelscenario loopt achter op je plan." · Bijwerken | **Aanpassen** (canoniek) | Consumeer `doelenPlanGewijzigdMelding(n)` en `DOELEN_MELDING_ACTIES` uit `lib/horizon/anker-copy.ts`: "Je plan is veranderd. 1 doel uit het lab past er niet meer bij." · Bijwerken · Loslaten. De bestaande `LabPlanMelding` zegt dit al; een tweede formulering voor dezelfde toestand is drift. |
| "Je AOW-leeftijd ontbreekt nog. Toevoegen →" | **Aanpassen, feitelijk onjuist** | "Geen AOW op je tijdas" · "Naar je AOW-strategie →". Wat ontbreekt is de AOW-gebeurtenis en niet de leeftijd. De projectie rekent dan met € 0 AOW. Canoniek in `lib/horizon/aow-notice-minimize.ts`. |
| Uitkomstregel Doelen "stoppen op 58 · gedekt" | **Aanpassen** | "Stopmoment 58 · gedekt". Hetzelfde patroon als de samenvatting, met de zonewoorden uit `LAB_COPY`. |

## 7. Aanvulling: drie getallen onder de Marktcheck-band (spec §7.6)

| Concept (spec) | Besluit | Tekst |
|---|---|---|
| "als het tegenzit 55 · verwacht 52 · als het meezit 49" | **Aanpassen** | "als het tegenzit 55 · in het midden 52 · als het meezit 49" |

Waarom: "als het tegenzit" en "als het meezit" zijn scenario-namen die Nederlanders kennen van het pensioenoverzicht. Ze beschrijven een marktverloop, geen verwachting. "verwacht" doet dat wel, en botst met de uitleg van de laag ("Geen voorspelling"). Het middelste getal is de mediaan van de doorgerekende marktverlopen, dus "in het midden". De drie getallen komen uit dezelfde marktcheck-run; er komt geen motor bij.

**Aanvulling bij onbereikbaar (26 sep).** Is één stand onbereikbaar binnen de horizon (de kern geeft `null`), dan blijft de regel staan en krijgt die stand de woorden "niet binnen je plan", bijvoorbeeld "als het tegenzit niet binnen je plan · in het midden 58 · als het meezit 52". Een regel die verdwijnt zodra het tegenzit, verzwijgt juist de uitkomst die het meest zegt. Het is dezelfde betekenis als de nul-tak van `ankerVrijZin`, maar kort genoeg voor één regel. Zijn alle drie onbereikbaar, of staat er een vast stop-anker, dan is er geen regel. Beschrijvend, geen oordeel: compliance goedgekeurd.

## 8. Aanvulling: kopij uit de bouwstenen (26 sep)

Getoetst op de tekst die stroom C (`lib/horizon/katern-copy.ts`) en stroom M (`lib/horizon/katern-meldingen.ts`, `KATERN_MELDING_KOPIJ`) zelf moesten kiezen.

| Tekst | Besluit | Waarom |
|---|---|---|
| "Volgens je huidige cijfers kun je nu al stoppen met werken." (nu al genoeg, solved; letterlijk uit de huidige /toekomst) | **Aanpassen**: "Volgens je huidige cijfers draagt je vermogen je uitgaven nu al." | Botst met de toonregel in `anker-copy.ts`: de app zegt niet dát je kunt stoppen, alleen hoe ver je vermogen reikt. Zelfde begrip als de nul-tak van `ankerVrijZin`. Geldt vanaf het moment dat het meldingenslot de oude meldingen vervangt (fase 2). De AI-context (`lib/ai/context/shared-context.ts:105`) gebruikt dezelfde oude formulering; die loopt via `ai-gedrag`, niet hier. |
| Kort label "nu al genoeg" | **Aanpassen**: "nu al gedekt" | Sluit aan bij de dekkingswoorden (`LAB_COPY`). |
| "Naar je huis-strategie" | **Aanpassen**: "Naar je woonstrategie" | De app noemt het overal woonstrategie. |
| "Je plan dekt vanaf je 61e een tekort met een lening." (leenperiode zonder einde) | Goedkeuren | Beschrijvend, zelfde vorm als de variant met einde. |
| "doel achter op planning", "Naar je doelen", "Naar je profiel", "tekort-lening" | Goedkeuren | Bestaande labels of een bestemming, geen aansporing. |
| "stopmoment nu", "geen gebeurtenissen", "1 gebeurtenis", "1 voorkeur" | Goedkeuren | Instellingsnamen, geen oordeel. |
| Zonewoord groen = "ruim gedekt" (`labZoneWoord`) | Goedkeuren | De samenvatting consumeert de bron; het voorbeeld "stopmoment 58 · gedekt" in §4 was illustratief. |

## 9. Aanvulling: kopij uit de fixrondes (26 sep, avond)

Getoetst op merkstem en compliance. Alle teksten staan in `lib/horizon/katern-copy.ts`.

| Tekst | Besluit | Waarom |
|---|---|---|
| "Zo werkt je grafiek" (titel van de canvas-i) | Goedkeuren | Bestaande titel, één ingang (§4.9). |
| "Samenstelling en Geldstroom volgen je plan; je doelscenario zie je in Vermogen" | Goedkeuren | Letterlijk uit spec §4.5; beschrijvend. |
| "De marktcheck kon niet worden doorgerekend. Je planlijn klopt gewoon; zet de laag uit en weer aan om het opnieuw te proberen." | Goedkeuren | Volgt de bestaande foutuitleg van de marktcheck. De aansporing gaat over een knop, niet over een geldhandeling. |
| Huislaag: "Met je huis" · "Een tweede lijn met je huis erbij. De hoofdlijn is het deel waar je direct bij kunt." / "Zonder je huis" · "De lijn zonder je huis toont het deel van je vermogen waar je direct bij kunt. …" | Goedkeuren | De labels komen letterlijk uit `sim-chart.tsx` en de uitleg uit de bestaande grafiekuitleg. Label en uitleg volgen de hoofdlijn, zodat de laag zegt wat hij toont. |
| "Jaar-op-jaar-tabel →" | Goedkeuren | Letterlijk uit het wireframe (§4.3); de enige ingang naar de tabel. |
| "Niet verplaatst" · "Je kunt alleen gebeurtenissen verplaatsen die je zelf hebt toegevoegd. Deze staat weer op zijn oude plek." | Goedkeuren | Eerlijk en beschrijvend. Onthult niets over de partner: het zegt alleen dat de gebeurtenis niet van jou is. |
| Nav-naam voor schermlezers "Onderdelen van je toekomstplan"; i-tekst "Heeft Plan, Doelen of Instellingen een melding, …" | Aangepast (commit `4ee6a58ee`) | "katern" is intern vakjargon (DNA-toon: vakterm vermijden). |

## 10. Aanvulling: kopij uit de laatste fixrondes (26–27 sep, nacht)

Getoetst op merkstem (constaterend, geen koop-/verkoopmetafoor, geen vakjargon) en compliance (inzicht, geen advies). De teksten komen uit stroom C1 (meldingen, kop, i-teksten), C3 (Plan), KK (kosten koper) en FX-D.

| Tekst | Besluit | Waarom |
|---|---|---|
| Tweede actie "Stopmoment" (bij "niet haalbaar" en een tekort onder een vast anker) | Goedkeuren | Een bestemming, geen aansporing. Hij wijst naar de ene plek waar het stopmoment wordt ingesteld (§4.2 regel 5). |
| Tweede actie "Bespreek met Fin" (bij tekort-lening en eindsituatie; eigenaarsbesluit 26 sep) | Goedkeuren | Knoplabel, net als "Aanpassen →" en "Bijwerken →": de regel "constaterend, geen imperatief" geldt voor oordeel- en statuszinnen, niet voor de naam van een knop. Het label bestond al in de app. Hij verschijnt alleen met AI-toegang en in de gespreksmodus (UAT TOEK-52/56). |
| "Nog 1 melding" / "Nog N meldingen" | Goedkeuren | Telling, geen oordeel. |
| Schermlezer na minimaliseren: "Melding geminimaliseerd. Het punt bij Plan onder de grafiek haalt de melding terug." (ook Doelen en Instellingen) | Goedkeuren | Beschrijft wat er gebeurde en waar de melding terugkomt, zonder het woord "katern". |
| Kop-link met melding: "Plan, melding: …" | Goedkeuren | Toegankelijke naam; eerder stond er twee keer "Plan". |
| KPI 1 bij een onbereikbaar plan: "Niet binnen je plan" | Goedkeuren | Dezelfde formule als de drie getallen onder de Marktcheck-band (§7). Zegt wat de som laat zien, zonder oordeel over de persoon. |
| "Opnamerate (ingesteld)" in de kassabon naast KPI 3 "Wat je plan onttrekt" (eigenaarsbesluit 26 sep) | Goedkeuren | Twee grootheden krijgen twee namen: wat je instelt, en wat je plan werkelijk onttrekt. Percentages in nl-NL (komma). |
| Doelbedrag-onderschrift onder een vast anker zonder eigen woning: "na schulden" (met woning blijft "zonder je huis") | Goedkeuren | Het onderschrift noemt je huis alleen als je er een hebt; anders zegt het wat er van het bedrag af gaat. |
| Aannamesregel onder "Mijn vermogen mag niet slinken": "je vermogen mag niet slinken", zonder eindleeftijd; onder een vast anker zonder stopmoment-segment | Goedkeuren | Een eeuwigdurend plan heeft geen eindleeftijd, en het stopmoment staat onder een vast anker al in de kop. Elk getal één keer per scherm (§4.2 regel 10). |
| i-teksten van Plan, Doelen en Instellingen (commit `d0f175e04`), o.a. "Je sleept een gebeurtenis naar een ander jaar en ziet meteen hoe je vrijheidsmoment verschuift." en "een kleine bijstelling kan jaren schelen" | Goedkeuren | Beschrijven de werking van het scherm. "Kan jaren schelen" is een mogelijkheid, geen belofte. |
| Catalogustip "Huis kopen": "Kosten koper: overdrachtsbelasting (2%; starters tot €555.000 vrijgesteld), notaris, taxatie, bankgarantie en eventueel NHG, plus ca. €2.750 voor hypotheekadvies en bemiddeling en ca. €3.500 als je een aankoopmakelaar neemt. Bij een koopsom van €250.000–€600.000 is dat samen ca. €5K–€21K. …" · bandbreedte "€5K–€21K kosten koper" | Goedkeuren | Feitelijke, generieke indicaties met bron en jaartal in `lib/constants.ts`. Ze gaan over kosten, niet over een product: geen advies (compliance-check, "feitelijke vergelijkingen zonder aanbeveling"). De makelaar is optioneel, geen aanrader. De bandbreedte is gepind tegen `computeKostenKoper`. |
| Kassabonregels "Hypotheekadvies + bemiddeling (indicatie)" en "Aankoopmakelaar, vast tarief (indicatie, optioneel)" | Goedkeuren | Het woord "indicatie" maakt de aard van het getal zichtbaar; de bron staat erbij. |

Plan met de gebeurtenissen en het verloop staan in §11; de instellingenrijen, Doelen op één scherm en het verloop (ronde 2) in §12.

## 11. Aanvulling: Plan met de gebeurtenissen en het verloop op /overzicht (27 sep)

Getoetst op merkstem en compliance. De teksten komen uit twee eigenaarsbesluiten van 26 sep. Het eerste zet de levensgebeurtenissen onder het plan in plaats van de strook en de radar (stroom NP). Het tweede zet het verloop in de gezondheidskassabon (stroom P5, fase 5).

| Tekst | Besluit | Waarom |
|---|---|---|
| Sectielabel op Plan: "Wat er in je leven gebeurt" | Goedkeuren | Zegt wat de lijst is, in gewone taal. Geen vakwoord. |
| Mobiele toggle: "Wat het betekent" | Goedkeuren | Bestaand sectielabel. Op mobiel is het een uitklapknop. |
| i-tekst `/toekomst`: "Onder je plan staan je levensgebeurtenissen: een kind, een erfenis, een verhuizing of minder werken, en de momenten die je plan zelf berekent, zoals het stoppen van een pensioenpot." · "…onder Plan voeg je een levensgebeurtenis toe en zie je meteen het effect op je pad naar vrijheid, in Doelen verken je met je doelscenario wat een andere keuze doet, en in Instellingen staan de aannames achter je plan." | Goedkeuren | Beschrijft het scherm. De drie delen heten zoals op de koppen; "katern" komt er niet in voor. |
| i-tekst `/toekomst/instellingen`: "Achter elke projectie zitten aannames — verwacht rendement, inflatie, je uitgaven na pensioen, je eindleeftijd. Samen met je levensgebeurtenissen bepalen ze hoeveel jaar vrijheid je berekening laat zien. …" | Goedkeuren | "Verwacht rendement" staat er als instelbare aanname, niet als voorspelling. Dat is de toegestane vorm uit de grijze zone van de compliance-check. |
| i-tekst `/overzicht`: "Het verloop van je gezondheidsgetal en van je vrijheidsleeftijd staat in de kassabon van je gezondheidsgetal." | Goedkeuren | Wijst de plek aan, zonder oordeel. |
| Kaart: "+N punten sinds vorige maand" · "−N punten sinds vorige maand" · "+1 punt sinds vorige maand" · "gelijk aan vorige maand" | Goedkeuren | Een telling. Verschijnt alleen als de rekenmethode gelijk is (`score_version`); anders staat er niets, zodat er geen schijnbeweging ontstaat. |
| Kassabon, sectie "Verloop": "De laatste stand van elke maand, over de laatste twaalf maanden." · reeksen "Gezondheidsgetal" en "Vrijheidsleeftijd" | Goedkeuren | Zegt precies wat de lijn is: één stand per maand. |
| Lege staat: "Er zijn nog geen maandstanden; het verloop groeit mee met elke maand." · één punt: "Eén maandstand tot nu toe: … van 100 in …" | Goedkeuren | Eerlijk over wat er (nog) niet is. |
| Versiewissel: "De rekenmethode van het gezondheidsgetal veranderde in …. Standen van daarvóór zijn niet met latere te vergelijken." · motorwissel: "Rekenwijze gewijzigd in … — een knik in de lijn kan daardoor komen." | Goedkeuren | Legt een knik uit in plaats van hem te verbergen. De lezer trekt geen conclusie uit een methodewissel. |
| Uitlegregel bij de FIRE-reeks: "Dit is de vrijheidsleeftijd zoals hij toen berekend werd, met de cijfers en aannames van dat moment. Je huidige vrijheidsleeftijd kan daarvan afwijken." | Goedkeuren | Historie, geen live getal en geen belofte. Dezelfde grens als het aandachtspunt over snapshot-`fire_age` (andere motor dan de live kernel). |
| Widgetlinks: "Bekijk volledige analyse en verloop" · "Bekijk details en verloop" | Goedkeuren | Linklabel, net als de bestaande "Bekijk details". Het label is een knopnaam, geen oordeelzin. |
| Praatplaat (HLD): "Terugzien hoe je gezondheid en je vrijheidsleeftijd bewegen" · "De lijst met je levensgebeurtenissen staat direct onder je plan, …" | Goedkeuren | Interne praatplaat in "ik wil"-taal. |

## 12. Aanvulling: Instellingen op rijen, Doelen op één scherm, verloop ronde 2 (27 sep)

Getoetst op merkstem (constaterend, je/jij, geen koop-/verkoopmetafoor, geen "katern") en compliance (inzicht, geen advies). De teksten komen uit stroom F3 (fase 3), F4 (fase 4) en P5 (fase 5, tweede ronde).

| Tekst | Besluit | Waarom |
|---|---|---|
| Sectiekoppen met deck: "Je plan" — "Wanneer je stopt, tot wanneer je geld moet reiken en hoe je het opneemt." · "Levensstrategieën" — "Wat er later binnenkomt of vrijkomt: je AOW, je pensioen, je werk en je huis." · "Marktaannames" — "De aannames over prijzen, rendement en belasting waar je hele plan mee rekent." | Goedkeuren | Zeggen wat eronder staat. "Aannames" maakt het karakter van de getallen zichtbaar. |
| Rijlabels (Stopmoment · Tot welke leeftijd, en wat blijft over · Onttrekking · Uitgave na pensioen · Geen tekort-lening · Onttrekkingsvolgorde · Verdeling bij toename · Onttrekking bij afname · AOW · Pensioen · Werk · Eigen woning · Inflatie · Rendement · Box 3), "Meer over je plan", "Opnamerate (afgeleid)" met "volgt uit rendement, inflatie en Box 3" | Goedkeuren | Instellingsnamen, geen oordeel. "(afgeleid)" onderscheidt de leesrij van een instelling. |
| Rijwaarde stopmoment "op mijn AOW-leeftijd" | **Aangepast**: "op je AOW-leeftijd" (commit `49704e767`) | De optienaam is een keuze in ik-vorm; de samenvattingsrij spreekt in je-vorm, net als "tot je 90e" en "je vermogen mag niet slinken". De editor houdt de optienaam. |
| Overige rijwaarden ("zo vroeg als het kan", "tot je 90e · niets over", "je vermogen mag niet slinken", "vast bedrag", "guardrails · vloer 80% · plafond 120%", "je essentiële budgetten · € … per jaar", "aan", "uit · rente 5,0%", "spaargeld → beleggingen → …", "schulden aflossen", "niet op je tijdas", "1 pensioenpot", "2,0% per jaar", "forfaitair", "werkelijk rendement") | Goedkeuren | Een samenvatting van wat de gebruiker zelf instelde. "Schulden aflossen" is de naam van zijn eigen regel, geen aansporing. |
| Marktnoot: "Het rendement per bezitting stel je in bij je bezittingen en gaat vóór; het rendement hier geldt voor bezittingen zonder eigen rendement." | Goedkeuren | Legt de voorrang uit, zonder rendementsbelofte. |
| Profielvergelijking: "Vergelijk de vier profielen" · "Je plan vier keer doorgerekend, één keer per profiel. De rest van je plan blijft gelijk. Kiezen en bewaren doe je hierboven." · "Een doorrekening van je eigen cijfers, geen advies. Wat er werkelijk gebeurt, kan afwijken." · "Je onttrekking beweegt tussen € … en € … per maand." | Goedkeuren | Een wat-als op eigen data is inzicht. Er is geen "beste" of "aanbevolen" (gecontroleerd in de bron). De keuze blijft bij de gebruiker en de disclaimer staat erbij. De vergelijking eindigt dus niet in "kies dit" (compliance-check, grijze zone onttrekking: als concept, niet als instructie). |
| "Vul je geboortedatum, je vermogen en je uitgaven in bij Overzicht, dan kan de app de profielen doorrekenen." | Goedkeuren | Een aanwijzing over ontbrekende invoer, geen financiële handeling. |
| Uitgaven-pane: "Alle bedragen hier zijn in prijspeil van vandaag. Inflatie rekent je projectie apart mee." | Goedkeuren | Maakt de euro-grondslag expliciet (ADR 0090). |
| Footerknop "Huis-strategie opslaan" | **Aangepast**: "Woonstrategie opslaan" (commit `49704e767`) | De app noemt het overal woonstrategie (§8). |
| Link in de tekort-lening-uitleg: "Rente tekort-lening aanpassen in je instellingen" · ⌘K-sublabel "Stopmoment, onttrekking, strategieën, inflatie en rendement" | Goedkeuren | Een linklabel naar een bestemming en een zoekhulp. |
| Doelen: "Je doelscenario" (label bij Samenstelling en Geldstroom en in de legenda) · "Je plan" (legenda) · "Andere paden naast je doelscenario" · "Je doelen" · sr-label "Vorm van de knoppen" · "Weergave van de grafiek" | Goedkeuren | "Doelscenario" vervangt het verouderde "wat-als" (ADR 0144/0145); de legenda volgt het wireframe (§4.3). |
| Sleep-hint: "Kijk naar de gestippelde lijn in de grafiek ↑ — dat is je doelscenario." | Goedkeuren | Een bedieningsaanwijzing bij een gebaar, geen oordeel of geldhandeling. |
| Verloop, ronde 2: ondertitel "De laatste stand van elke maand over de laatste twaalf maanden; voor deze maand je huidige stand." · markering "budgettelling aangepast" · uitleg "Op 30 augustus 2026 veranderde hoe het budgetdeel van het gezondheidsgetal je uitgaven telt: inkomsten en overboekingen tussen je eigen rekeningen tellen sindsdien niet meer mee. Een knik rond die datum kan daardoor komen." | Goedkeuren | Legt een methodewissel uit in plaats van hem te verbergen. De lezer trekt dan geen conclusie uit een knik die geen gedrag is. |
| Briefing: "Je gezondheidsscore steeg met X punten deze maand." (bestond al, verschijnt nu echt) | Goedkeuren | Een telling, alleen bij een stijging van minstens 5 punten binnen dezelfde rekenmethode. |

## 13. Aanvulling: teksten uit de eindreview-fixes (27 sep)

Getoetst op merkstem en compliance. Ze komen uit de fix van eindreview-🔴 R1: "sinds vorige maand" rekent de vorige maand nu met dezelfde functie als het live getal, en het live getal staat los van de opgeslagen lijn. De rest komt uit 🟡 Y1: de profielvergelijking volgt de euro-weergave.

| Tekst | Besluit | Waarom |
|---|---|---|
| Verloop, ondertitel met live stand: "De lijn toont de laatste stand van elke afgesloten maand zoals die toen berekend werd, over de laatste twaalf maanden. De losse stip ‘nu’ is je huidige stand; die wordt anders berekend en staat daarom niet op de lijn." · label "nu" | Goedkeuren | Zegt eerlijk dat de opgeslagen standen en het live getal niet op dezelfde manier berekend zijn. De lezer ziet daardoor geen stijging die er niet is. Geen oordeel, geen belofte. |
| Alleen een live stand: "Nog geen afgesloten maandstand. Nu: {score} van 100." | Goedkeuren | Telling en stand, zonder aansporing. |
| Onder een vast stopmoment: géén regel "sinds vorige maand" en geen briefingmijlpaal | Goedkeuren (weglaten is de tekst) | Een vergelijking die niet sluitend is, hoort er niet te staan (compliance: geen schijnprecisie). Het aandachtspunt `fire-historie-uit-een-andere-motor-dan-het-live-getal` beschrijft de weg terug. |
| Profielvergelijking: "Bedragen in huidige euro's." / "Bedragen in toekomstige euro's." | Goedkeuren | Maakt de euro-grondslag van de getoonde bedragen zichtbaar (ADR 0090), in de woorden van `euroViewLabel`. |

## Wat dit vraagt van de bouw (fase 1–2)

- Ankerregel: consumeer `ankerVrijZin` en `ankerTitel` uit `lib/horizon/anker-copy.ts` en schrijf geen nieuwe zinnen. KPI 1 via `formatHeroFireAge`.
- Lagen-menu: de uitlegteksten vervangen de `ChartOverlayExplainer`-teksten. Hou één bron per laag aan, niet een tweede exemplaar naast de oude.
- Meldingen: consumeer de bestaande kopijmodules (`deficit-loan-copy.ts`, `aow-notice-minimize.ts`). Alleen de actie-href verandert naar `/toekomst/instellingen?rij=…`.
