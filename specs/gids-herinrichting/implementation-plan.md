# Implementation Plan: Gids Pagina Herinrichting

## Overview

Complete herstructurering van `app/(app)/identity/gids/page.tsx` (1100 regels) van een platte 19-accordion encyclopedie naar een reis-gebaseerde gids met geneste twee-niveaus onderwerpen. De bestaande componenten (ConceptFlipCards, GuideProgressBar, GuideFaq, GuideProTips, OntdekkenSection) blijven behouden.

---

## Phase 1: Nieuwe componenten

Maak de bouwstenen die de heringerichte pagina nodig heeft.

### Tasks

- [ ] Maak `GuideHowTo` component — genummerde stap-voor-stap instructies met optionele tip
- [ ] Maak `GuideTopicCard` component — twee-niveaus: beschrijving + "Hoe werkt het?" collapsible
- [ ] Maak `ReisStapSection` component — container per reis-stap met header, geneste topics, status en CTA
- [ ] Maak `OveralSection` component — grid van cross-cutting features (vereenvoudigde topic cards)

### Technical Details

**Bestanden aanmaken in `components/app/`:**

#### `guide-how-to.tsx`
```tsx
// Props
interface GuideHowToProps {
  steps: string[]
  tip?: string
}
// Genummerde stappen met modulekleur-accenten
// Tip in een subtle box onderaan
```

#### `guide-topic-card.tsx`
```tsx
// Props
interface GuideTopicCardProps {
  icon: LucideIcon
  title: string
  description: React.ReactNode  // waarde-eerst beschrijving
  howTo: {
    steps: string[]
    tip?: string
  }
  color: string  // module kleur
}
// State: open/dicht voor "Hoe werkt het?" dropdown
// Meerdere cards kunnen tegelijk open staan (eigen useState per card)
```

#### `reis-stap-section.tsx`
```tsx
// Props
interface ReisStapSectionProps {
  id: string                    // voor scroll-target
  icon: LucideIcon
  step: number                  // 1-5
  title: string
  color: string
  subtitle: string              // motiverende zin
  statusLines: string[]         // persoonlijke voortgang
  valueSentence: string         // italic waarde-zin
  ctaLabel: string
  ctaHref: string
  isComplete: boolean
  children: React.ReactNode     // GuideTopicCards
}
// Bevat: accent bar, header met stap-nummer, status box, geneste topics, CTA
// scroll-mt-24 voor sticky header offset
// id="guide-reis-{step}" voor voortgangsbalk linking
```

**Design tokens gebruiken:**
- `card-editorial` voor cards
- `var(--color-kern-400/500/700)`, `var(--color-wil-400/500/700)`, `var(--color-horizon-400/500/700)`
- `var(--ink)`, `var(--ink-2)`, `var(--ink-3)`, `var(--ink-4)` voor tekst
- `var(--border-ed)`, `var(--subtle)`, `var(--paper)` voor achtergronden
- `var(--r)`, `var(--r-sm)` voor border-radius
- `font-serif italic` voor waarde-zinnen
- `label-editorial` voor labels
- Minimum touch target: `min-h-[44px]`

---

## Phase 2: Content — Stap 1 "Weet waar je staat" [complex]

Schrijf alle content voor de 4 onderwerpen van reis-stap 1.

### Tasks

- [ ] Content: Cash rekeningen (beschrijving + 5 hoe-stappen)
- [ ] Content: Vermogensbeheer (beschrijving + 5 hoe-stappen)
- [ ] Content: Schuldenbeheer (beschrijving + 5 hoe-stappen)
- [ ] Content: Netto vermogen (beschrijving + 4 hoe-stappen)

### Technical Details

**Stap 1 header:**
- icon: `Landmark`
- color: `var(--color-kern-400)`
- title: "Weet waar je staat"
- subtitle: "Breng al je bezittingen, schulden en rekeningen samen op één plek"
- valueSentence: "Je ziet voor het eerst je complete financiële plaatje in vrijheidstijd."
- ctaLabel: "Bekijk je vermogen"
- ctaHref: "/core"

---

#### Cash rekeningen

**Beschrijving (niveau 1):**
> Verbind je betaal- en spaarrekeningen via een beveiligde banklink (TrueLayer, FCA-gereguleerd) of voeg ze handmatig toe. TriFinity haalt saldi en transacties automatisch op — elke rekening telt direct mee in je nettovermogen. Je ziet meteen hoeveel dagen vrijheid er op je rekeningen staan.
>
> Geen banklink? Importeer handmatig via MT940, CSV of OFX. Voor de grote Nederlandse banken (ABN AMRO, ING, Bunq, Wise) herkent TriFinity het formaat automatisch. Na import categoriseert de AI elke transactie op basis van 24 patronen met een betrouwbaarheidsscore. Maak regels aan voor vaste tegenpartijen zodat toekomstige imports vanzelf kloppen. Dubbele transacties worden automatisch herkend en interne overboekingen tellen niet mee als uitgaven.

**Hoe werkt het? (niveau 2):**
1. Ga naar De Kern → Cash
2. Tik op "+ Rekening" om een bankrekening toe te voegen, of kies "Import" voor een bestand
3. Bij import: kies je bank of sleep een MT940/CSV/OFX-bestand — het formaat wordt automatisch herkend
4. Controleer de AI-categorisatie per transactie en accepteer of corrigeer de suggesties
5. Maak categorieregels aan voor terugkerende tegenpartijen (bijv. "Albert Heijn" → Boodschappen)

**Tip:** Begin met je hoofdrekening en de afgelopen 3 maanden. De rest kun je later toevoegen.

---

#### Vermogensbeheer

**Beschrijving (niveau 1):**
> Registreer alles wat je bezit — van spaargeld en beleggingen tot je huis, auto, crypto en pensioen. TriFinity kent 13 vermogenstypes met elk hun eigen waarderingslogica en verwacht rendement. Per bezitting zie je niet alleen de huidige waarde, maar ook hoeveel vrijheidsdagen die vertegenwoordigt.
>
> Heb je beleggingen? De holdings-pagina volgt individuele posities met actuele koersen, rendement per periode (1 maand tot 10 jaar), benchmarkvergelijking, dividendhistorie en portfolio-allocatie. Bij herwaardering zie je direct het effect op je nettovermogen én je vrijheidstijd — elke stijging is letterlijk gewonnen tijd.

**Hoe werkt het? (niveau 2):**
1. Ga naar De Kern → Bezittingen en tik op "+ Bezitting"
2. Kies het type (spaargeld, belegging, eigen woning, crypto, pensioen, etc.) en vul de waarde in
3. Stel optioneel het verwacht rendement en maandelijkse inleg in voor projecties
4. Voor beleggingen: ga naar Holdings en voeg individuele posities toe (ticker, aantal, aankoopprijs)
5. Gebruik "Herwaarderen" om meerdere bezittingen tegelijk bij te werken — je ziet het vrijheidstijd-effect direct

**Tip:** Je hoeft niet alles in één keer toe te voegen. Begin met je grootste bezittingen — die hebben de meeste impact op je vrijheidstijd.

---

#### Schuldenbeheer

**Beschrijving (niveau 1):**
> Breng al je schulden in kaart — hypotheek, studielening, creditcard, persoonlijke lening, belastingschuld en meer. TriFinity kent 11 schuldtypes met elk hun eigen renteberekening, aflossingsschema en fiscale kenmerken. Je hypotheek kan NHG-gemarkeerd en belastingaftrekbaar zijn, je studielening volgt het juiste stelsel (oud/nieuw/SF35).
>
> Het krachtigste inzicht: de aflossingsstrategieën. Vergelijk sneeuwbal (kleinste schuld eerst) versus lawine (hoogste rente eerst) en zie hoeveel rente je bespaart. Simuleer extra aflossingen en ontdek hoeveel sneller je schuldenvrij bent — elke euro extra aflossen is vrijheidstijd die je terugkoopt.

**Hoe werkt het? (niveau 2):**
1. Ga naar De Kern → Schulden en tik op "+ Schuld"
2. Kies het type (hypotheek, studielening, creditcard, etc.) en vul saldo, rente en maandlast in
3. Stel het aflossingstype in (annuïteit, lineair of aflossingsvrij)
4. Vergelijk aflossingsstrategieën: wissel tussen sneeuwbal, lawine en huidig schema
5. Voer een extra maandbedrag in bij de simulator om het verschil in looptijd en rentekosten te zien

**Tip:** Focus eerst op schulden met de hoogste rente — die kosten je de meeste vrijheidstijd.

---

#### Netto vermogen

**Beschrijving (niveau 1):**
> Je nettovermogen is je totale bezittingen minus je schulden — het fundament van je financiële vrijheid. TriFinity maakt automatisch snapshots van je vermogensontwikkeling, zodat je over maanden en jaren kunt terugkijken hoe je groeit. Per snapshot zie je niet alleen het bedrag, maar ook je vrijheidspercentage, spaarquote, veerkrachtscore en geschatte FIRE-leeftijd.
>
> De compositie-analyse laat zien hoe je vermogen is opgebouwd: hoeveel zit in spaargeld versus beleggingen, hoeveel in vastgoed versus pensioen. Zo ontdek je of je vermogen goed gespreid is of te afhankelijk van één pijler.

**Hoe werkt het? (niveau 2):**
1. Je nettovermogen wordt automatisch berekend zodra je bezittingen en schulden hebt toegevoegd
2. Bij elke herwaardering maakt TriFinity een balanssnapshot per bezitting en schuld
3. Bekijk de vermogensgrafiek op De Kern voor je netto vermogen over tijd
4. Vergelijk periodes om trends te ontdekken in je vermogensgroei

**Tip:** De maandelijkse check-in is het ideale moment om je vermogen bij te werken en je voortgang te zien.

---

## Phase 3: Content — Stap 2 "Begrijp je patronen" [complex]

### Tasks

- [ ] Content: Budgetteren (beschrijving + 5 hoe-stappen)
- [ ] Content: Belasting (beschrijving + 5 hoe-stappen)

### Technical Details

**Stap 2 header:**
- icon: `Receipt`
- color: `var(--color-kern-400)`
- title: "Begrijp je patronen"
- subtitle: "Ontdek waar je geld naartoe gaat en hoeveel de belastingdienst meeneemt"
- valueSentence: "Ontdek waar je tijd weglekt zonder dat je het doorhebt."
- ctaLabel: "Bekijk je kas"
- ctaHref: "/core/cash"

---

#### Budgetteren

**Beschrijving (niveau 1):**
> Je budget is de kaart van je uitgaven — het laat zien waar je levenstijd naartoe gaat. TriFinity start met 6 hoofdcategorieën en 24 subcategorieën die je volledig kunt aanpassen. Elk budget heeft een type (inkomsten, uitgaven, sparen, schulden of verborgen) en elk is gemarkeerd als essentieel of niet-essentieel. Dat onderscheid is cruciaal: je FIRE-berekening gebruikt je essentiële uitgaven om te bepalen hoeveel vermogen je nodig hebt.
>
> Drie weergaven geven je inzicht: de boomweergave toont je hiërarchie met voortgangsbalken, de donutweergave je verdeling, en de sparklines tonen 6-maanden trends. Tik op een categorie voor de kassabon met dekkingsgraad, variantie-analyse en gezondheidsscore. Het maandrapport vat alles samen in gewonnen of verloren vrijheidsdagen. En het mooiste: budget is optioneel — vul alleen je geschatte maanduitgaven in en TriFinity doet de rest.

**Hoe werkt het? (niveau 2):**
1. Ga naar De Kern → Budgetten — je standaardplan staat klaar met 6 categorieën
2. Pas limieten aan per categorie en kies het interval (maand, kwartaal, jaar) en overschotgedrag (reset, doorschuiven of beleggen)
3. Markeer elke categorie als essentieel of niet-essentieel — dit beïnvloedt je FIRE-berekening direct
4. Na transactie-import worden uitgaven automatisch aan budgetten gekoppeld via AI-categorisatie
5. Bekijk je voortgang in boom-, donut- of sparkline-weergave en tik op een categorie voor de kassabon-details

**Tip:** Begin simpel — pas alleen de limieten aan van je top-5 uitgavencategorieën. De rest verfijn je later.

---

#### Belasting

**Beschrijving (niveau 1):**
> TriFinity berekent automatisch je Box 3 vermogensrendementsheffing op basis van je bezittingen en schulden. De berekening kent het verschil tussen spaargeld (lager forfait) en beleggingen (hoger forfait), en welke bezittingen zijn vrijgesteld (eigen woning, pensioen, levensverzekering). Schulden worden verrekend boven de drempelwaarde.
>
> Heb je een partner? De partneroptimalisatie berekent de fiscaal voordeligste verdeling van jullie gezamenlijke grondslag — dat kan honderden euro's schelen. Vergelijk twee belastingjaren naast elkaar en gebruik het scenariomodel om te zien wat er verandert als je vermogen groeit. Heb je een aanmerkelijk belang (5%+ deelneming)? Box 2 wordt apart berekend met dividend- en vervreemdingswinst per deelneming.

**Hoe werkt het? (niveau 2):**
1. Ga naar De Kern → Belasting — je Box 3 wordt automatisch berekend op basis van je geregistreerde bezittingen en schulden
2. Controleer de classificatie: spaargeld, beleggingen en vrijgestelde bezittingen worden automatisch ingedeeld
3. Wissel tussen belastingjaren (2025/2026) om het verschil te zien
4. Activeer "Partner" om de optimale verdeling van de grondslag te berekenen
5. Open het scenariomodel om te simuleren wat er verandert bij meer spaargeld, meer beleggingen of hogere schulden

**Tip:** Check je belastingpagina na elke grote vermogenswijziging — een verschuiving van spaargeld naar beleggingen kan je belastingdruk flink veranderen.

---

## Phase 4: Content — Stap 3 "Onderneem actie" [complex]

### Tasks

- [ ] Content: Voorstellen (beschrijving + 4 hoe-stappen)
- [ ] Content: Acties (beschrijving + 5 hoe-stappen)
- [ ] Content: Doelen (beschrijving + 5 hoe-stappen)
- [ ] Content: Abonnementen (beschrijving + 4 hoe-stappen)

### Technical Details

**Stap 3 header:**
- icon: `Zap`
- color: `var(--color-wil-400)`
- title: "Onderneem actie"
- subtitle: "Van inzicht naar actie — elke stap brengt je dichter bij financiële vrijheid"
- valueSentence: "Elke afgeronde actie is een gewonnen vrijheidsdag."
- ctaLabel: "Bekijk aanbevelingen"
- ctaHref: "/will"

---

#### Voorstellen

**Beschrijving (niveau 1):**
> Will analyseert je financiële situatie en genereert persoonlijke aanbevelingen in vijf categorieën: bespaartips, schuld-optimalisatie, beleggingskansen, inkomensmogelijkheden en gedragsaanpassingen. Elke aanbeveling toont de geschatte impact in vrijheidsdagen per jaar — zo weet je precies wat het je oplevert.
>
> Voorstellen komen binnen als inzichten die je kunt accepteren (wordt een actie), uitstellen (bewaar voor later) of afwijzen. De prioriteitsscore bepaalt welke bovenaan staan: voorstellen met de hoogste vrijheidstijd-impact verschijnen eerst. Naarmate je meer gegevens toevoegt, worden de aanbevelingen specifieker en waardevoller.

**Hoe werkt het? (niveau 2):**
1. Ga naar De Wil — je voorstellen staan in de kolom "Inzicht"
2. Tik op "+ Analyseren" om Will nieuwe aanbevelingen te laten genereren op basis van je huidige data
3. Bekijk per voorstel de vrijheidsdagen-impact en de onderbouwing
4. Kies: accepteren (wordt actie), uitstellen (komt later terug) of afwijzen (verdwijnt)

**Tip:** Accepteer eerst de voorstellen met de hoogste vrijheidsdagen-impact — die leveren het snelst resultaat op.

---

#### Acties

**Beschrijving (niveau 1):**
> Je persoonlijke actiebord werkt als een kanban: drie kolommen — open, uitgesteld en voltooid. Acties komen binnen via geaccepteerde voorstellen of je maakt ze zelf aan. Elke actie heeft een vrijheidsdagen-impact, een bron (Will, check-in of handmatig) en optioneel een deadline.
>
> Het afronden van acties is waar de magie zit: elke voltooide actie levert vrijheidsdagen op die meetellen in je totaal. Je ziet je gewonnen dagen oplopen en je FIRE-datum verschuiven. Het is gamification met echte impact — niet voor punten, maar voor je toekomst.

**Hoe werkt het? (niveau 2):**
1. Ga naar De Wil — je acties staan in de middelste kolom "Actie"
2. Tik op een actie voor details, vrijheidsdagen-impact en instructies
3. Markeer een actie als voltooid wanneer je hem hebt uitgevoerd
4. Maak handmatige acties aan met "+ Nieuwe actie" voor eigen financiële stappen
5. Uitgestelde acties verplaats je terug naar open wanneer je eraan toe bent

**Tip:** Plan elke week één actie in. Consistent kleine stappen > af en toe een sprint.

---

#### Doelen

**Beschrijving (niveau 1):**
> Stel concrete financiële doelen met een doelbedrag en einddatum. TriFinity kent 10 doeltypes: spaardoel, schuldaflossing, nettovermogen, vrijheidsdagen, spaarquote, belegd vermogen, passief inkomen, noodfonds, salaris en vrij. Koppel een doel aan een bezitting of schuld en de voortgang wordt automatisch bijgehouden.
>
> Per doel zie je hoeveel je al hebt bereikt, of je op schema ligt, en wat de verwachte einddatum is bij het huidige tempo. Doelen zijn persoonlijk of gedeeld met je huishouden — zo werken jullie samen aan een gezamenlijke toekomst.

**Hoe werkt het? (niveau 2):**
1. Ga naar De Wil → Resultaat kolom en tik op "+ Nieuw doel"
2. Kies het doeltype (spaardoel, schuldaflossing, nettovermogen, etc.)
3. Vul het doelbedrag en de gewenste einddatum in
4. Koppel optioneel aan een bezitting (bijv. je spaarrekening) of schuld (bijv. je studielening) voor automatische voortgang
5. Bekijk je voortgang op het doelen-dashboard — de on-track indicator toont of je op schema ligt

**Tip:** Eén helder doel werkt beter dan vijf vage. Begin met je noodfonds of je grootste schuld.

---

#### Abonnementen

**Beschrijving (niveau 1):**
> TriFinity scant automatisch 12 maanden transactiegeschiedenis op terugkerende patronen. Abonnementen, lidmaatschappen en vaste lasten worden gedetecteerd met een betrouwbaarheidsniveau (hoog, middel, laag) en frequentie (wekelijks, maandelijks, per kwartaal, jaarlijks). Je ziet het totale maandbedrag aan abonnementen en hoeveel vrijheidsdagen die je per jaar kosten.
>
> Het opzegadvies toont welke abonnementen je het minst gebruikt of de slechtste prijs-kwaliteitverhouding hebben. Soms is het schrappen van twee vergeten abonnementen genoeg om een halve vrijheidsdag per maand te winnen.

**Hoe werkt het? (niveau 2):**
1. Importeer minimaal 3 maanden transacties — hoe meer, hoe beter de detectie
2. Ga naar De Wil — je abonnementen staan onderaan de pagina
3. Bekijk de gedetecteerde abonnementen met frequentie en maandbedrag
4. Tik op een abonnement voor de opzegflow met details en vrijheidsdagen-impact

**Tip:** Check je abonnementen elk kwartaal. Vergeten streamingdiensten en ongebruikte sportschoolpassen zijn de meest voorkomende tijdlekken.

---

## Phase 5: Content — Stap 4 "Kijk vooruit" [complex]

### Tasks

- [ ] Content: FIRE-projectie (beschrijving + 5 hoe-stappen)
- [ ] Content: Levensgebeurtenissen (beschrijving + 5 hoe-stappen)
- [ ] Content: Monte Carlo & backtesting (beschrijving + 4 hoe-stappen)
- [ ] Content: Onttrekkingsstrategie (beschrijving + 4 hoe-stappen)

### Technical Details

**Stap 4 header:**
- icon: `Compass`
- color: `var(--color-horizon-400)`
- title: "Kijk vooruit"
- subtitle: "Bereken wanneer werken optioneel wordt en hoe robuust je plan is"
- valueSentence: "Zie je toekomst in drie scenario's — en kies welk pad je wilt bewandelen."
- ctaLabel: "Bekijk je prognose"
- ctaHref: "/horizon"

---

#### FIRE-projectie

**Beschrijving (niveau 1):**
> De FIRE-berekening beantwoordt de belangrijkste vraag: wanneer dekt je vermogen je uitgaven voor altijd? TriFinity berekent drie scenario's — pessimistisch, verwacht en optimistisch — op basis van je huidige vermogen, spaarquote, verwacht rendement en uitgavenpatroon. Je ziet je verwachte FIRE-leeftijd, de countdown in jaren/maanden/dagen, en het vermogenspad over 30+ jaar.
>
> De berekening is volledig configureerbaar: stel je eigen verwacht rendement en inflatiepercentage in via Instellingen. Kies je FIRE-eindstrategie: perpetueel (eeuwig leven van je vermogen), legacy (nalaten aan erfgenamen) of deplete (alles opmaken voor een bepaalde leeftijd). Box 3 belasting wordt automatisch meegerekend in de simulatie.

**Hoe werkt het? (niveau 2):**
1. Ga naar De Horizon — je FIRE-prognose wordt automatisch berekend zodra je vermogen en uitgaven hebt ingevuld
2. Bekijk de drie scenario's (pessimistisch/verwacht/optimistisch) met elk een FIRE-leeftijd en vermogenspad
3. Pas je verwacht rendement en inflatie aan via Identiteit → Instellingen → FIRE Instellingen
4. Kies je eindstrategie: perpetueel, legacy of deplete — elk verandert je benodigd vermogen
5. Bekijk de countdown: hoeveel jaar, maanden en dagen tot je FIRE-datum

**Tip:** Je FIRE-leeftijd is geen lot — het is een kompas. Elke verhoging van je spaarquote met 1% verschuift de datum.

---

#### Levensgebeurtenissen

**Beschrijving (niveau 1):**
> Het leven verloopt niet in een rechte lijn — en je financiën ook niet. Voeg toekomstige gebeurtenissen toe die je financiële pad beïnvloeden: kinderen krijgen, verhuizen, trouwen, studie betalen, eerder stoppen met werken, een wereldreis maken, een erfenis ontvangen. TriFinity heeft een catalogus van 50+ voorgedefinieerde events met realistische cashflow-schattingen.
>
> Elke levensgebeurtenis verschuift je FIRE-datum. Je ziet het cumulatieve effect: als je over 3 jaar een kind krijgt en over 5 jaar een huis koopt, wat doet dat met je prognose? Zo maak je bewuste keuzes over je toekomst in plaats van verrassingen.

**Hoe werkt het? (niveau 2):**
1. Ga naar De Horizon en scroll naar levensgebeurtenissen
2. Tik op "+ Event" en kies uit de catalogus of maak een eigen gebeurtenis
3. Stel de verwachte datum en het financiële effect in (eenmalig bedrag, maandelijkse kosten of inkomsten)
4. Bekijk direct het effect op je FIRE-datum en vermogenspad
5. Versleep events in de tijd of schakel ze uit om scenario's te vergelijken

**Tip:** Voeg ook positieve events toe — een salarisverhoging, een erfenis of een zijproject. Het gaat niet alleen om kosten.

---

#### Monte Carlo & backtesting

**Beschrijving (niveau 1):**
> Één prognose is een gok — duizend prognoses zijn een strategie. De Monte Carlo simulatie draait 1.000 willekeurige marktscenario's en toont hoe robuust je plan is. Je ziet het slagingspercentage (in hoeveel scenario's haal je FIRE), de spreiding van mogelijke FIRE-leeftijden (p10, p25, p50, p75, p90) en het vermogenspad per percentiel.
>
> De backtesting voegt historische realiteit toe: hoe zou je plan het hebben gedaan tijdens de dotcom-crash, de financiële crisis van 2008 of de COVID-dip? De backtestscore geeft je een concreet getal: het percentage historische crisisperiodes waarin je plan overeind bleef.

**Hoe werkt het? (niveau 2):**
1. Ga naar De Horizon — de Monte Carlo simulatie draait automatisch op basis van je huidige data
2. Bekijk het slagingspercentage en de spreiding van FIRE-leeftijden
3. De backtestscore toont hoe je plan presteert onder historische crises
4. Pas je rendementsverwachting of spaarquote aan en zie het effect op de slaagkans direct veranderen

**Tip:** Een slaagkans boven 80% is solide. Onder 60% wil je je plan aanpassen — meer sparen, langer werken of zuiniger leven na FIRE.

---

#### Onttrekkingsstrategie

**Beschrijving (niveau 1):**
> Je hebt FIRE bereikt — en dan? Je onttrekkingsstrategie bepaalt hoe je je vermogen opneemt zonder dat het opraakt. TriFinity biedt vier methoden: de klassieke 4%-regel (vast percentage per jaar), dynamische onttrekking (past mee met marktprestaties), de vloer-plafondmethode (minimum gegarandeerd, extra in goede jaren) en de bucket-strategie (drie emmers: cash voor nu, obligaties voor 5 jaar, aandelen voor de lange termijn).
>
> Elke strategie toont hoelang je vermogen meegaat, hoeveel flexibiliteit je hebt in slechte marktjaren, en wat je jaarlijkse inkomen wordt. Zo kies je niet op gevoel maar op basis van simulatie.

**Hoe werkt het? (niveau 2):**
1. Ga naar De Horizon → Onttrekkingsstrategie
2. Vergelijk de vier methoden naast elkaar met je eigen vermogen en uitgaven
3. Bekijk per strategie het gesimuleerde vermogensverloop en jaarlijkse inkomen
4. Kies de strategie die past bij je risicoprofiel — conservatief (bucket), flexibel (dynamisch) of eenvoudig (4%-regel)

**Tip:** De bucket-strategie is het meest intuïtief: je hebt altijd 2-3 jaar cash bij de hand, ongeacht wat de markt doet.

---

## Phase 6: Content — Stap 5 "Droom en plan" [complex]

### Tasks

- [ ] Content: Droomscenario / What-If (beschrijving + 5 hoe-stappen)
- [ ] Content: Will AI-chat (beschrijving + 4 hoe-stappen)

### Technical Details

**Stap 5 header:**
- icon: `MessageSquare`
- color: `var(--color-horizon-400)`
- title: "Droom en plan"
- subtitle: "Verken alternatieve toekomsten en vertaal dromen naar concrete plannen"
- valueSentence: "Je dromen verdienen een reality-check — en een routekaart."
- ctaLabel: "Start een scenario"
- ctaHref: "/horizon/whatif"

---

#### Droomscenario / What-If

**Beschrijving (niveau 1):**
> Wat als je 20% meer zou verdienen? Wat als je over 3 jaar parttime gaat werken? Wat als je emigreert naar Portugal? De What-If builder laat je experimenteren met alternatieve toekomsten via vijf schuifbalken: inkomen, werkdagen, spaarquote, rendement en uitgaven. Kies een snelpreset (optimistisch, verwacht, pessimistisch) of stel alles handmatig in.
>
> Je ziet direct het effect op je FIRE-datum, vermogenspad en slaagkans. Voeg levensgebeurtenissen toe aan je scenario en vergelijk het naast je huidige baseline in een split-view. De SimChart toont beide paden met percentiellijnen, zodat je niet alleen het verwachte maar ook het beste en slechtste geval ziet — inclusief partnerperspectief bij een huishouden.

**Hoe werkt het? (niveau 2):**
1. Ga naar De Horizon → What-If
2. Versleep de schuifbalken voor inkomen, werkdagen, spaarquote, rendement en uitgaven
3. Of kies een snelpreset (optimist, koershouder, zuinig) als startpunt
4. Voeg levensgebeurtenissen toe aan je scenario om hun impact te zien
5. Open de vergelijkingsmodal om je scenario naast je huidige situatie te leggen

**Tip:** Probeer: "Wat als ik mijn spaarquote met 10% verhoog en over 5 jaar een kind krijg?" — de combinatie geeft het eerlijkste beeld.

---

#### Will AI-chat

**Beschrijving (niveau 1):**
> Will is je persoonlijke financiële gesprekspartner met drie persoonlijkheden. FHIN (De Kern) analyseert je data en beantwoordt vragen over je vermogen en uitgaven. FINN (De Wil) zet je aan tot actie met concrete aanbevelingen. FFIN (De Horizon) helpt je dromen vertalen naar financiële plannen — beschrijf je ideale toekomst en hij berekent wat het kost en wanneer het haalbaar is.
>
> Will is context-aware: hij weet altijd op welke pagina je bent en welke data relevant is. Open de chat rechtsonder voor hulp die past bij wat je aan het doen bent. In een What-If scenario kan Will je droom direct omzetten naar levensgebeurtenissen met FIRE-impact. Je privacy is gewaarborgd — gevoelige gegevens worden gemaskeerd in alle communicatie.

**Hoe werkt het? (niveau 2):**
1. Tik op het chat-icoon rechtsonder op elke pagina
2. Stel een vraag of beschrijf een situatie — Will past zich aan op de context van de pagina
3. In een What-If: beschrijf je droom ("Ik wil over 5 jaar een huis kopen") en Will vertaalt het naar events
4. Vraag om een reality-check: "Is mijn plan realistisch?" — Will analyseert je data en geeft eerlijk antwoord

**Tip:** Will wordt slimmer naarmate je meer data hebt. Begin met een eenvoudige vraag: "Wat is het belangrijkste dat ik nu kan doen?"

---

## Phase 7: Content — "Overal" sectie [complex]

Cross-cutting features die niet aan één reis-stap hangen.

### Tasks

- [ ] Content: Dashboard & Widgets (beschrijving + 4 hoe-stappen)
- [ ] Content: DAIshboard / Briefing (beschrijving + 3 hoe-stappen)
- [ ] Content: Check-in (beschrijving + 5 hoe-stappen)
- [ ] Content: Meldingen (beschrijving + 3 hoe-stappen)
- [ ] Content: Rapporten (beschrijving + 4 hoe-stappen)
- [ ] Content: Profiel & Instellingen (beschrijving + 4 hoe-stappen)
- [ ] Content: Huishouden & Partner (beschrijving + 5 hoe-stappen)
- [ ] Content: Mobiel (beschrijving + 3 hoe-stappen)

### Technical Details

**Sectie header:**
- label: "Overal in TriFinity"
- Geen reis-stap, maar een grid van compactere topic cards
- Layout: `grid grid-cols-1 lg:grid-cols-2 gap-3`

---

#### Dashboard & Widgets

**Beschrijving (niveau 1):**
> Je dashboard is je persoonlijke cockpit — meer dan 26 widgets geven je in één oogopslag inzicht in je vermogen, budget, acties, FIRE-prognose en voortgang. Widgets variëren in grootte (mini tot volledig) en ontgrendelen progressief naarmate je soevereiniteitsniveau stijgt. Sleep ze in de volgorde die voor jou werkt, schakel uit wat je niet nodig hebt, en ontdek nieuwe widgets zodra je een niveau stijgt.

**Hoe werkt het? (niveau 2):**
1. Je dashboard is je startpagina na inloggen
2. Ga naar Identiteit → Instellingen → Widgets om widgets aan/uit te zetten en de volgorde aan te passen
3. Nieuwe widgets ontgrendelen automatisch bij een hoger soevereiniteitsniveau
4. Sleep widgets naar een andere positie op het dashboard zelf

**Tip:** Begin met de standaard 7 widgets. Voeg pas meer toe als je weet welke inzichten je dagelijks wilt zien.

---

#### DAIshboard / Briefing

**Beschrijving (niveau 1):**
> Schakel over naar de DAIshboard-modus en je dashboard transformeert in een AI-samengestelde briefing. Will analyseert je financiële data en componeert een persoonlijk overzicht met tot 23 verschillende kaarttypes: metrics, sparklines, mijlpalen, inzichten, checklists, vergelijkingen, doelvoortgang, budgetbalken en meer. De briefing wordt progressief geladen — kaarten verschijnen zodra ze klaar zijn.
>
> Elke briefing is tijdsbewust: 's ochtends focus op de dag, aan het einde van de maand op je maandresultaat. De briefing onthoudt wat je eerder hebt gezien en varieert de inhoud. Na 24 uur verschijnt een stale-banner zodat je weet dat de data niet meer actueel is.

**Hoe werkt het? (niveau 2):**
1. Op je dashboard: wissel naar DAIshboard-modus via de toggle bovenaan
2. De briefing genereert automatisch — kaarten verschijnen progressief
3. Scroll door je persoonlijke briefing en tik op kaarten voor meer detail

**Tip:** Check je briefing elke ochtend als financiële routine — het kost 30 seconden en houdt je scherp.

---

#### Check-in

**Beschrijving (niveau 1):**
> Eén keer per maand neem je 10 minuten voor je financiële gezondheid. De check-in is een 7-stappen wizard: terugblik op vorige maand (vermogenswijziging, inkomsten, uitgaven, gewonnen vrijheidsdagen), bezittingen bijwerken, schulden bijwerken, doelen checken, budgetten evalueren, vooruitblik op komende maand, en een moment voor reflectie met vrije notities.
>
> Will bereidt gespreksstarters voor op basis van je recente financiële veranderingen — ideaal als startpunt voor reflectie of een gesprek met je partner. Je kunt eerdere check-ins terugbladeren om je groei over maanden te zien.

**Hoe werkt het? (niveau 2):**
1. Ga naar De Kern → Check-in (of volg de herinnering in je meldingen)
2. Stap 1: Bekijk de terugblik — vergelijk vorige maand met nu
3. Stap 2-5: Werk bezittingen, schulden, doelen en budgetten bij
4. Stap 6: Bekijk de vooruitblik met komende rekeningen en events
5. Stap 7: Schrijf een korte reflectie — wat ging goed, wat kan beter?

**Tip:** Plan je check-in op een vaste dag (bijv. de eerste zondag van de maand). Routine maakt het moeiteloos.

---

#### Meldingen

**Beschrijving (niveau 1):**
> TriFinity stuurt je meldingen wanneer het ertoe doet: budgetgrenzen die naderen, ongebruikelijke transacties, vermogensmijlpalen die je bereikt, level-ups in je soevereiniteit, en aanbevelingen die klaarstaan. Urgente alerts verschijnen bovenaan, dagelijkse meldingen daaronder, en eerdere meldingen zijn per dag terug te bladeren. Per type kun je meldingen aan of uitzetten.

**Hoe werkt het? (niveau 2):**
1. Meldingen verschijnen via het bel-icoon in de navigatiebalk
2. Tik op een melding om naar het relevante onderdeel te gaan
3. Beheer je meldingsvoorkeuren via Identiteit → Instellingen → Notificaties

**Tip:** Laat budgetalerts en mijlpalen aan staan — ze houden je gemotiveerd zonder overweldigd te raken.

---

#### Rapporten

**Beschrijving (niveau 1):**
> Drie rapporttypes geven je het complete plaatje. Het perioderapport (maand, kwartaal of jaar) analyseert je inkomsten, uitgaven, FIRE-voortgang en vergelijkt met eerdere periodes. Het balansrapport maakt een foto van je bezittingen en schulden op een peildatum. Het budgetrapport toont je budgetprestaties met trends en vrijheidsdagen-impact. Elk rapport kan optioneel een AI-geschreven inleiding bevatten die de belangrijkste inzichten samenvat.

**Hoe werkt het? (niveau 2):**
1. Ga naar Rapportages (via het profielmenu in de navigatie)
2. Kies het rapporttype: periode, balans of budget
3. Selecteer de periode of peildatum en schakel optioneel de AI-inleiding in
4. Bekijk of download het rapport — eerdere rapporten blijven bewaard

**Tip:** Genereer aan het einde van elk jaar een jaarrapport met AI-inleiding — het is je financiële jaaroverzicht in 2 minuten.

---

#### Profiel & Instellingen

**Beschrijving (niveau 1):**
> Je profiel bevat de basis voor alle berekeningen: naam, geboortedatum, inkomen en huishoudsamenstelling. Je soevereiniteitsniveau (van Herstel tot Meesterschap) wordt automatisch berekend en ontgrendelt progressief nieuwe functies. In Instellingen beheer je alles vanuit één hub: notificatievoorkeuren, widget-selectie, FIRE-parameters (verwacht rendement, inflatie, eindstrategie), weergaveopties (typografie, modulekleuren) en gegevensbeheer (export, verwijdering).

**Hoe werkt het? (niveau 2):**
1. Ga naar Identiteit → Profiel voor je persoonlijke gegevens en huishoudprofiel
2. Ga naar Identiteit → Instellingen voor alle app-instellingen op één plek
3. Sectie C (FIRE) is het belangrijkst: stel hier je verwacht rendement, inflatie en eindstrategie in
4. Sectie D (Weergave) laat je de app personaliseren met eigen kleuren

**Tip:** Controleer je FIRE-parameters minstens jaarlijks — je verwacht rendement kan veranderen met je beleggingsstrategie.

---

#### Huishouden & Partner

**Beschrijving (niveau 1):**
> Nodig je partner uit voor een gedeeld huishouden en beheer samen je financiën met respect voor individuele privacy. Per categorie (vermogen, schulden, inkomsten) kies je het zichtbaarheidsniveau: volledig (alles delen), totalen (alleen bedragen, geen details) of verborgen. De kostenverdeling is configureerbaar: gelijk of naar rato, met een primaire betaler voor gezamenlijke lasten.
>
> Gedeelde doelen, gezamenlijke FIRE-berekeningen en huishoudperspectief op je dashboard maken financieel samenwerken concreet. Wissel op elke pagina tussen je persoonlijke en huishoudperspectief.

**Hoe werkt het? (niveau 2):**
1. Ga naar Identiteit → Delen en nodig je partner uit via e-mailadres
2. Je partner ontvangt een uitnodigingslink en maakt een eigen account aan
3. Stel de kostenverdeling in (50/50 of aangepast percentage) en kies de primaire betaler
4. Configureer per categorie het privacyniveau: volledig, totalen of verborgen
5. Wissel op elke pagina tussen persoonlijk en huishoudperspectief via de toggle

**Tip:** Bespreek samen welk privacyniveau jullie prettig vinden voordat je het instelt. Financieel vertrouwen groeit geleidelijk.

---

#### Mobiel

**Beschrijving (niveau 1):**
> TriFinity is volledig geoptimaliseerd voor je telefoon. De bottom navigation geeft je met één tik toegang tot De Kern, De Wil en De Horizon — kleurgecodeerd per module. Alle touch targets zijn minimaal 44px, modals schuiven als BottomSheets van onderen omhoog en kunnen worden weggeveegd. Widgets passen zich automatisch aan het kleinere scherm aan en tab-gebaseerde layouts houden de navigatie overzichtelijk.

**Hoe werkt het? (niveau 2):**
1. Open TriFinity in je mobiele browser — de app past zich automatisch aan
2. Gebruik de bottom navigation onderaan om tussen modules te wisselen
3. Veeg BottomSheets naar beneden om ze te sluiten

**Tip:** Voeg TriFinity toe aan je startscherm voor een app-achtige ervaring zonder download.

---

## Phase 8: Pagina-assemblage [complex]

Bouw de nieuwe pagina samen met alle componenten en content.

### Tasks

- [ ] Herschrijf `gids/page.tsx` met nieuwe paginaflow [complex]
  - [ ] Hero sectie (kort, persoonlijk met naam, filosofie-quote geïntegreerd, module-pijlers als visueel accent)
  - [ ] Voortgangsbalk met klikbare segmenten die scrollen naar reis-stappen
  - [ ] Reis-stap 1: "Weet waar je staat" met 4 geneste GuideTopicCards
  - [ ] Reis-stap 2: "Begrijp je patronen" met 2 geneste GuideTopicCards
  - [ ] Reis-stap 3: "Onderneem actie" met 4 geneste GuideTopicCards
  - [ ] Reis-stap 4: "Kijk vooruit" met 4 geneste GuideTopicCards
  - [ ] Reis-stap 5: "Droom en plan" met 2 geneste GuideTopicCards
  - [ ] ConceptFlipCards (bestaand, behouden)
  - [ ] "Overal in TriFinity" sectie met 8 GuideTopicCards in grid
  - [ ] GuideFaq (bestaand, behouden)
  - [ ] OntdekkenSection (bestaand, behouden)
  - [ ] GuideProTips (bestaand, behouden)
- [ ] Verwijder oude GuideAccordion component en alle 19 accordion-instanties
- [ ] Verwijder oude GuideFeature component
- [ ] Verwijder `guideSection` useState (single-accordion state) — elke topic card beheert eigen open/dicht state
- [ ] Update GuideProgressBar: maak segmenten klikbaar met smooth scroll naar `#guide-reis-{step}`
- [ ] Verwijder drie "Overig — binnenkort meer" placeholder secties

### Technical Details

**Bestandswijzigingen:**
- `app/(app)/identity/gids/page.tsx` — volledig herschrijven
- `components/app/guide-how-to.tsx` — nieuw
- `components/app/guide-topic-card.tsx` — nieuw
- `components/app/reis-stap-section.tsx` — nieuw
- `components/app/guide-progress-bar.tsx` — kleine update (klikbare segmenten)

**Imports die blijven:**
```tsx
import ConceptFlipCards from '@/components/app/concept-flip-cards'
import { OntdekkenSection } from '@/components/app/ontdekken-section'
import { GuideProgressBar } from '@/components/app/guide-progress-bar'
import GuideFaq from '@/components/app/guide-faq'
import GuideProTips from '@/components/app/guide-pro-tips'
```

**Imports die vervallen:**
- `ChevronDown` (niet meer nodig op paginaniveau — topic cards beheren eigen chevron)
- Alle accordion-gerelateerde logic

**Imports die nieuw zijn:**
```tsx
import { ReisStapSection } from '@/components/app/reis-stap-section'
import { GuideTopicCard } from '@/components/app/guide-topic-card'
```

**State wijzigingen:**
```tsx
// VERWIJDER:
const [guideSection, setGuideSection] = useState<string | null>(null)

// BEHOUD:
const [fullName, setFullName] = useState<string | null>(null)
const [loading, setLoading] = useState(true)
const [progress, setProgress] = useState<GuideProgress | null>(null)
```

**Nieuwe paginastructuur (pseudo-JSX):**
```tsx
<div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
  {/* 1. Hero */}
  <section className="card-editorial overflow-hidden mb-6 sm:mb-8">
    {/* Tri-color accent bar */}
    {/* Titel + welkomsboodschap + filosofie-quote */}
  </section>

  {/* 2. Voortgangsbalk */}
  <GuideProgressBar />

  {/* 3. Je reis label */}
  <p className="label-editorial text-[var(--ink-3)] mb-3">Je reis</p>

  {/* Stap 1 */}
  <ReisStapSection id="guide-reis-1" step={1} icon={Landmark} title="Weet waar je staat" color="var(--color-kern-400)" ...>
    <GuideTopicCard icon={Wallet} title="Cash rekeningen" color="var(--color-kern-400)" description={...} howTo={...} />
    <GuideTopicCard icon={TrendingUp} title="Vermogensbeheer" ... />
    <GuideTopicCard icon={CreditCard} title="Schuldenbeheer" ... />
    <GuideTopicCard icon={BarChart3} title="Netto vermogen" ... />
  </ReisStapSection>

  {/* Stap 2 */}
  <ReisStapSection id="guide-reis-2" step={2} ...>
    <GuideTopicCard title="Budgetteren" ... />
    <GuideTopicCard title="Belasting" ... />
  </ReisStapSection>

  {/* Stap 3 */}
  <ReisStapSection id="guide-reis-3" step={3} ...>
    <GuideTopicCard title="Voorstellen" ... />
    <GuideTopicCard title="Acties" ... />
    <GuideTopicCard title="Doelen" ... />
    <GuideTopicCard title="Abonnementen" ... />
  </ReisStapSection>

  {/* Stap 4 */}
  <ReisStapSection id="guide-reis-4" step={4} ...>
    <GuideTopicCard title="FIRE-projectie" ... />
    <GuideTopicCard title="Levensgebeurtenissen" ... />
    <GuideTopicCard title="Monte Carlo & backtesting" ... />
    <GuideTopicCard title="Onttrekkingsstrategie" ... />
  </ReisStapSection>

  {/* Stap 5 */}
  <ReisStapSection id="guide-reis-5" step={5} ...>
    <GuideTopicCard title="Droomscenario / What-If" ... />
    <GuideTopicCard title="Will AI-chat" ... />
  </ReisStapSection>

  {/* 4. Concepten */}
  <ConceptFlipCards />

  {/* 5. Overal in TriFinity */}
  <p className="label-editorial text-[var(--ink-3)] mb-3">Overal in TriFinity</p>
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6 sm:mb-8">
    <GuideTopicCard title="Dashboard & Widgets" ... />
    <GuideTopicCard title="DAIshboard / Briefing" ... />
    <GuideTopicCard title="Check-in" ... />
    <GuideTopicCard title="Meldingen" ... />
    <GuideTopicCard title="Rapporten" ... />
    <GuideTopicCard title="Profiel & Instellingen" ... />
    <GuideTopicCard title="Huishouden & Partner" ... />
    <GuideTopicCard title="Mobiel" ... />
  </div>

  {/* 6-8. Bestaande componenten */}
  <GuideFaq />
  <OntdekkenSection />
  <GuideProTips />
</div>
```

**Voortgangsbalk klikbaar maken:**
In `guide-progress-bar.tsx`, voeg onClick handler toe per segment:
```tsx
onClick={() => {
  const el = document.getElementById(`guide-reis-${stepNumber}`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}}
```

---

## Phase 9: Polish en verificatie

### Tasks

- [ ] Verificeer dat alle bestaande componenten correct renderen (ConceptFlipCards, GuideFaq, GuideProTips, OntdekkenSection)
- [ ] Test responsive layout op mobile (375px) en desktop (1280px)
- [ ] Verificeer smooth scroll vanuit voortgangsbalk naar alle 5 reis-stappen
- [ ] Verificeer dat meerdere "Hoe werkt het?" dropdowns tegelijk open kunnen staan
- [ ] Test alle interne links (ctaHref's) naar juiste pagina's
- [ ] Controleer dat progress/status data correct wordt doorgegeven aan ReisStapSections
- [ ] Controleer touch targets ≥ 44px op alle interactieve elementen
- [ ] Verifieer animaties bij openen/sluiten van dropdowns

### Technical Details

**Verwachte bestandsgrootte na herstructurering:**
- `page.tsx`: ~600-800 regels (content is lang maar structuur is eenvoudiger)
- Alternatief: extraheer content naar `lib/guide-content.ts` als data-objecten om de pagina leesbaar te houden

**Content extractie optie (aanbevolen bij >700 regels):**
```tsx
// lib/guide-content.ts
export const REIS_STAPPEN = [
  {
    id: 'guide-reis-1',
    step: 1,
    icon: 'Landmark',
    title: 'Weet waar je staat',
    color: 'var(--color-kern-400)',
    subtitle: '...',
    topics: [
      {
        icon: 'Wallet',
        title: 'Cash rekeningen',
        description: '...',
        howTo: { steps: [...], tip: '...' }
      },
      // ...
    ]
  },
  // ...
]

export const OVERAL_TOPICS = [...]
```
