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

Waarom Plan: de samenvatting van Plan staat alleen op de schermen Doelen en Instellingen, en daar staat de kop ("Vrij mogelijk vanaf je 52e.") er al boven. "vrij op 52,3" zei dus hetzelfde getal twee keer op één scherm. De voortgang naar het doelbedrag staat daar nergens anders. Waarom Doelen: "stopmoment 58" beschrijft het scenario; "stoppen op 58" leest als opdracht. Waarom Instellingen: "mist" is spreektaal, en de bestaande melding heet "AOW ontbreekt". "nog 2 voorkeuren open" staat alleen op schermen waar de wizard-kaart niet staat, dus §4.9 ("4 van 6 alleen in de wizard-kaart") blijft gelden. **Beslispunt eigenaar:** wil je de wizard-stand helemaal niet in een samenvatting, dan wordt het "AOW ontbreekt", en zonder melding blijft de regel leeg.

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
| "Je doelscenario loopt achter op je plan." · Bijwerken | Goedkeuren | Beschrijvend. |
| "Je AOW-leeftijd ontbreekt nog. Toevoegen →" | **Aanpassen, feitelijk onjuist** | "Geen AOW op je tijdas" · "Naar je AOW-strategie →". Wat ontbreekt is de AOW-gebeurtenis en niet de leeftijd. De projectie rekent dan met € 0 AOW. Canoniek in `lib/horizon/aow-notice-minimize.ts`. |
| Uitkomstregel Doelen "stoppen op 58 · gedekt" | **Aanpassen** | "Stopmoment 58 · gedekt". Hetzelfde patroon als de samenvatting, met de zonewoorden uit `LAB_COPY`. |

## Wat dit vraagt van de bouw (fase 1–2)

- Ankerregel: consumeer `ankerVrijZin` en `ankerTitel` uit `lib/horizon/anker-copy.ts` en schrijf geen nieuwe zinnen. KPI 1 via `formatHeroFireAge`.
- Lagen-menu: de uitlegteksten vervangen de `ChartOverlayExplainer`-teksten. Hou één bron per laag aan, niet een tweede exemplaar naast de oude.
- Meldingen: consumeer de bestaande kopijmodules (`deficit-loan-copy.ts`, `aow-notice-minimize.ts`). Alleen de actie-href verandert naar `/toekomst/instellingen?rij=…`.
