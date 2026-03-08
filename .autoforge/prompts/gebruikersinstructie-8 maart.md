# Gebruikersinstructie — Nieuwe features (8 maart 2026)

Dit document beschrijft alle nieuwe functionaliteiten die vandaag zijn aangemaakt, hoe je ze gebruikt en waar je ze vindt in de app.

---

## 1. Huishouden & Partner — Gedeelde vrijheidstijd

### Wat is het?
De app berekent nu **gecombineerde vrijheidstijd** voor je huishouden: hoeveel vrije tijd hebben jullie samen opgebouwd? Daarnaast zie je per partner een vergelijking.

### Hoe te gebruiken
1. **Dashboard** — Zet de perspectiefschakelaar (bovenin) op **Huishouden**. De hero toont nu de gecombineerde vrijheidstijd van het huishouden.
2. **Per-partner vergelijking** — Onder de hero verschijnt een vergelijking: hoeveel vrijheidstijd heeft elke partner individueel?
3. **De Kern** — Bij huishouden-perspectief toont de hero het gecombineerde netto vermogen met bijbehorende vrijheidsjaren.
4. **De Horizon** — Toont een gecombineerde FIRE-leeftijd en per-partner FIRE-vergelijking.
5. **Perspectief-wissel** — Bij het wisselen tussen Persoonlijk/Huishouden/Partner worden alle berekeningen automatisch herberekend.

---

## 2. Privacy-instellingen voor partners

### Wat is het?
Je kunt per financiële categorie instellen hoeveel je partner mag zien: **Volledig** (alle bedragen), **Totalen** (alleen totaalbedragen, geen details), of **Verborgen** (categorie helemaal niet zichtbaar).

### Hoe te gebruiken
1. Ga naar **Identiteit → Instellingen → Huishouden**
2. Onder **Privacy-instellingen** zie je categorieën: Inkomen, Spaargeld, Beleggingen, Schulden, Uitgaven
3. Kies per categorie het gewenste niveau:
   - **Volledig** — Partner ziet alle bedragen en transacties
   - **Totalen** — Partner ziet alleen totalen en trends (geen individuele bedragen)
   - **Verborgen** — Categorie verschijnt niet bij je partner
4. Standaard voor nieuwe huishoudens is **Totalen** — veilig beginpunt
5. Wijzigingen werken direct door (geen herstart nodig)

---

## 3. Gedeelde doelen en partner-acties

### Wat is het?
Maak financiële doelen aan die je deelt met je partner, en wijs acties toe aan je partner in De Wil.

### Hoe te gebruiken
1. **Gedeeld doel aanmaken** — Ga naar **De Wil → Doelen → Nieuw doel**. Kies **Gedeeld** bij eigendom. Beide partners zien het doel en de per-partner bijdrage.
2. **Actie toewijzen** — Bij een actie in De Wil kun je deze toewijzen aan je partner. Je partner ziet toegewezen acties in hun eigen De Wil overzicht.
3. **Filteren** — Gebruik het filter in De Wil om alleen gedeelde doelen te tonen.

---

## 4. Huishouden FIRE-projecties

### Wat is het?
De Horizon-module berekent nu FIRE-scenario's voor het huishouden: gecombineerd vermogen, gezamenlijke uitgaven, en per-partner trajecten.

### Hoe te gebruiken
1. Ga naar **De Horizon** en zet perspectief op **Huishouden**
2. De vermogensgrafiek toont nu het gecombineerde traject
3. De FIRE-leeftijd is berekend op basis van gezamenlijk vermogen en gedeelde uitgaven
4. Bij de scenario-builder kun je huishouden-parameters invoeren (gezamenlijk inkomen, gedeelde kosten)

---

## 5. Maandelijkse geldcheck-in (verbeterd)

### Wat is het?
Elke maand verschijnt een herinneringskaart op het dashboard om samen (of alleen) je financiën te evalueren. Na afronding verdwijnt de kaart automatisch tot de volgende maand.

### Hoe te gebruiken
1. **Dashboard** — De check-in kaart verschijnt automatisch aan het begin van elke maand
2. Klik **Start check-in** om de 5-stappen wizard te doorlopen:
   - **Terugblik** — Vermogensverandering, inkomen, uitgaven, sparen
   - **Doelen** — Voortgang van je financiële doelen
   - **Budget** — Budget-status en afwijkingen
   - **Vooruitblik** — Verwachte uitgaven komende maand
   - **Reflectie** — Schrijf je gedachten op (privé opgeslagen)
3. Na afronding verdwijnt de kaart van het dashboard tot de volgende maand
4. **Wegklikken** (X-knop) verbergt de kaart voor de rest van je sessie, maar hij komt terug bij een volgend bezoek als je de check-in nog niet hebt gedaan
5. **Uitschakelen** — Ga naar Identiteit → Instellingen om de check-in helemaal uit te zetten

### Voor huishoudens
- De check-in samenvatting wordt opgeslagen voor beide partners
- Urgente aandachtspunten (budget overschreden, doelen achter) worden automatisch uitgelicht
- AI-gegenereerde gespreksstarters helpen het gesprek over geld op gang te brengen

---

## 6. Levensgebeurtenissen — Verbeterde formulieren

### Wat is het?
Alle 17+ levensgebeurtenissen hebben nu contextspecifieke formulieren met Nederlandse data (NIBUD, Belastingdienst, AOW-bedragen) en automatische berekeningen.

### Per levensgebeurtenis — wat is nieuw:

| Gebeurtenis | Nieuwe velden / berekeningen |
|-------------|------------------------------|
| **AOW** | Keuze alleenstaand/samenwonend (€1.347 vs €928/mnd), opbouwpercentage, jaren buitenland correctie |
| **Aanvullend pensioen** | Maandbedrag, ingangsdatum, indexatie ja/nee |
| **Kinderen** | Aantal kinderen met geschaalde kosten, kinderopvang-kosten, kinderbijslag verrekening, eenmalige babyuitzet |
| **Huis kopen** | Aankoopprijs → automatische kosten koper (overdrachtsbelasting, notaris, makelaar), netto maandlasten (hypotheek minus huidige huur) |
| **Vervroegd pensioen** | AOW-gat berekening: hoeveel maanden zonder AOW, wat kost dat? |
| **Part-time werken** | Uren per week → pro rata inkomen, pensioenimpact |
| **Auto kopen** | Brandstoftype (elektrisch/benzine/diesel), totale maandkosten breakdown (verzekering, wegenbelasting, onderhoud, brandstof) |
| **Erfenis** | Relatie tot erflater → automatische erfbelasting berekening (tariefgroep 1/2) |
| **Sabbatical** | Doorbetalingspercentage werkgever, automatisch inkomensverlies |
| **Wereldreis** | Reisstijl presets (budget/comfort/luxe), toggle voor doorlopende vaste lasten thuis |
| **Verbouwing** | Type verbouwing (keuken/badkamer/aanbouw/dakkapel), waardevermeerdering berekening |
| **Studie** | Type opleiding (MBO/HBO/WO/cursus), verwacht inkomensrendement na afronding |
| **Carrièreswitch** | Huidige vs nieuw salaris, overgangsperiode zonder inkomen |
| **Trouwerij** | Budget-presets (eenvoudig/gemiddeld/uitgebreid), huwelijksreis optie |
| **Verhuizing** | Dubbele lasten periode, maandlastenverschil (oud vs nieuw) |
| **Bijverdienste** | Bruto → netto berekening, belastingwaarschuwing bij hoog bijverdieninkomen |

### Hoe te gebruiken
1. Ga naar **De Horizon** → klik op een levensgebeurtenis-knop onder de grafiek
2. Het formulier toont nu **contextspecifieke velden** — vul ze in
3. De **impact-samenvatting** onderaan toont het effect in vrijheidstijd (bijv. "−2,3 jaar vrijheid")
4. Velden worden waar mogelijk **pre-filled** uit je profiel (inkomen, leeftijd)
5. Klik opslaan → de grafiek past zich direct aan

---

## 7. Nieuwe levensgebeurtenissen

### 5 nieuwe event-types toegevoegd:

| Gebeurtenis | Wat het modelleert |
|-------------|-------------------|
| **Scheiding** | Vermogensverdeling (50/50 of anders), alimentatie (betalen/ontvangen), impact op huishouden-modus |
| **Werkloosheid / Ontslag** | WW-uitkering (70-75% laatstverdiende loon, max 24 maanden), transitievergoeding als eenmalig bedrag |
| **Huis verkopen** | Overwaarde-vrijval als eenmalige inkomst, wegvallen hypotheeklasten |
| **Overlijden partner** | Nabestaandenpensioen, Anw-uitkering, impact op woonlasten en gedeelde kosten |
| **Schenking aan kinderen** | Jaarlijkse vrijstelling (€6.633), eenmalig verhoogd, schenkbelasting berekening |

### Hoe te gebruiken
1. Ga naar **De Horizon** → klik **+ Gebeurtenis toevoegen**
2. De nieuwe types staan in de catalogus met beschrijving en geschatte impact
3. Vul het formulier in — de app berekent automatisch de financiële impact
4. De grafiek toont het effect op je vermogensverloop

---

## 8. What-If scenario's (verbeterd)

### Wat is het?
De What-If pagina (bereikbaar vanuit De Horizon) laat je experimenteren met levensgebeurtenissen in een sandbox-scenario.

### Verbeteringen:
- **Volledige context** — De AI-chat kent nu je huidige sliders, FIRE-delta, en actieve events
- **Scenario opslaan** — Sla een scenario op en laad het later opnieuw
- **Inline bewerken** — Bewerk events direct in de lijst zonder paginaverlating
- **Reality-check modus** — Vraag de chat "Hoe kom ik daar?" en hij schakelt van droomgids naar concrete planner met actie-kaarten
- **Meerdere events van hetzelfde type** — Voeg bijv. 2× "Kind" toe voor een groeiend gezin
- **Verbeterde grafiek** — Cashflow-annotaties en events-tijdlijn op de vermogensgrafiek
- **Profielparameters** — Rendement en inflatie laden automatisch uit je instellingen

### Hoe te gebruiken
1. Ga naar **De Horizon** → klik **What-if scenario**
2. Voeg events toe via de knoppen of via de chat (beschrijf je droom, de AI maakt er events van)
3. Vergelijk het scenario (stippellijn) met je huidige pad (doorgetrokken lijn)
4. Klik op een event om het inline te bewerken
5. Vraag de chat: *"Wat moet ik doen om dit waar te maken?"* voor een reality-check
6. Klik **Opslaan** om het scenario te bewaren

---

## 9. Nieuwe asset types

### 9a. Deelneming / Aanmerkelijk belang

**Wat is het?**
Voor DGA's en aandeelhouders met ≥5% belang in een BV/NV. Belast in Box 2 (niet Box 3).

**Hoe toe te voegen:**
1. Ga naar **De Kern → Bezittingen → + Toevoegen**
2. Kies type **Deelneming**
3. Kies subtype: Eigen holding BV, Familie-BV, Startup, of Overig
4. Vul in:
   - **Naam vennootschap** — bijv. "Janssen Holding BV"
   - **KvK-nummer** — 8-cijferig nummer
   - **Belang (%)** — je aandelenpercentage (bijv. 100%)
   - **Intrinsieke waarde** — de huidige waarde van je aandelen
   - **Jaarlijks dividend** — wat je jezelf jaarlijks uitkeert
5. De deelneming verschijnt op de **belasting-pagina** als "Uitgesloten (Box 2)"

**DGA-lening koppelen:**
- Bij je deelneming kun je een gekoppelde DGA-lening zien
- Als je totale DGA-leningen >€400.000 bedragen, verschijnt een **oranje waarschuwing**
- Boven €500.000 verschijnt een **rode waarschuwing** (Wet excessief lenen: het bovenmatige deel wordt als fictief regulier voordeel belast in Box 2)

### 9b. Levensverzekering

**Wat is het?**
Kapitaalverzekeringen, uitvaartverzekeringen met opbouwwaarde, en gemengde polissen.

**Hoe toe te voegen:**
1. Ga naar **De Kern → Bezittingen → + Toevoegen**
2. Kies type **Levensverzekering**
3. Kies subtype: Kapitaalverzekering, Uitvaartverzekering, Gemengde polis, of Overig
4. Vul in:
   - **Verzekeraar** — bijv. "Nationale Nederlanden"
   - **Polisnummer** — je polisnummer
   - **Afkoopwaarde** — huidige waarde als je nu zou opzeggen
   - **Einddatum polis** — wanneer keert de polis uit?
   - **Maandelijkse premie** — wat je maandelijks betaalt
   - **Begunstigde** — wie ontvangt de uitkering?
5. De resterende looptijd wordt automatisch berekend (bijv. "Nog 8 jaar")
6. Valt onder **Box 3 beleggingen** (uitzondering: polissen van vóór 2001 kunnen vrijgesteld zijn onder overgangsrecht)

### 9c. Vordering / Lening u/g

**Wat is het?**
Geld dat je hebt uitgeleend aan anderen: aan derden, aan je eigen BV (DGA-lening), of aan familie.

**Hoe toe te voegen:**
1. Ga naar **De Kern → Bezittingen → + Toevoegen**
2. Kies type **Vordering / Lening u/g**
3. Kies subtype: Lening aan derden, DGA-lening aan eigen BV, Familielening, of Overig
4. Vul in:
   - **Debiteur / Tegenpartij** — aan wie heb je geleend?
   - **Oorspronkelijke hoofdsom** — het oorspronkelijke bedrag
   - **Huidig uitstaand bedrag** — wat staat er nu nog open?
   - **Rentepercentage** — afgesproken rente
   - **Einddatum lening** — wanneer moet het terugbetaald zijn?
5. Bij **DGA-lening**: koppel aan je deelneming via de dropdown. De Wet excessief lenen waarschuwing verschijnt automatisch bij >€500.000 totaal.
6. Valt onder **Box 3 beleggingen** (ook DGA-leningen!)

---

## 10. Box 2 belastingberekening

### Wat is het?
Naast de bestaande Box 3 berekening toont de belasting-pagina nu ook **Box 2** (aanmerkelijk belang) voor gebruikers met deelnemingen.

### Waar te vinden
1. Ga naar **De Kern → Belasting**
2. **Bovenaan**: nieuw gecombineerd overzicht met Box 1 + 2 + 3 totaal en gestapelde balk
3. **Box 2 sectie** (verschijnt alleen als je deelnemingen hebt):
   - Totaal Box 2 inkomen (dividend + vervreemdingswinst)
   - Staffelberekening: 24,5% tot €67.804, daarboven 33%
   - Per-deelneming breakdown
4. **Wet excessief lenen**: als je DGA-leningen >€500.000 hebt, wordt het bovenmatige deel automatisch als fictief regulier voordeel toegevoegd aan je Box 2 inkomen

### Belastingtarieven 2026
| Schijf | Tarief |
|--------|--------|
| Tot €67.804 | 24,5% |
| Boven €67.804 | 33% |

---

## 11. Nieuwe schuldentypen

### 11a. Belastingschuld

**Wat is het?**
Openstaande belastingaanslagen: inkomstenbelasting, voorlopige aanslag, Box 3 nabetaling, BTW.

**Hoe toe te voegen:**
1. Ga naar **De Kern → Schulden → + Toevoegen**
2. Kies type **Belastingschuld**
3. Kies subtype: Inkomstenbelasting, Voorlopige aanslag, Box 3 nabetaling, BTW, of Overig
4. Vul in:
   - **Belastingjaar** — bijv. 2025
   - **Openstaand bedrag** — het te betalen bedrag
   - **Betalingsregeling** — toggle aan als je een betalingsregeling hebt
   - Bij betalingsregeling: vul maandbedrag en einddatum in
5. Crediteur wordt automatisch ingevuld als "Belastingdienst"
6. Valt onder **Box 3 schulden** (boven de schuldendrempel)
7. Verschijnt in het schuldenoverzicht met belastingjaar als subtitle (bijv. "IB 2025")

### 11b. DGA-schuld aan eigen BV

**Wat is het?**
De privé-kant van een lening van je eigen BV. De spiegelzijde van de DGA-vordering (die als asset geregistreerd staat).

**Hoe toe te voegen:**
1. Ga naar **De Kern → Schulden → + Toevoegen**
2. Kies type **DGA-schuld aan eigen BV**
3. **Koppel aan deelneming** — verplichte dropdown die je deelneming-assets toont
4. Vul in: bedrag, rente, aflossingsschema
5. De Wet excessief lenen waarschuwing verschijnt automatisch:
   - **Oranje** bij >€400.000 totaal DGA-leningen
   - **Rood** bij >€500.000 — het bovenmatige deel wordt als fictief regulier voordeel in Box 2 belast
6. Valt onder **Box 3 schulden**
7. Op het deelneming-detailscherm zie je de gekoppelde DGA-schulden terug

**Let op:** De app telt DGA-vorderingen (assets) en DGA-schulden (debts) samen voor de Wet excessief lenen berekening op de belasting-pagina.

### 11c. Familielening

**Wat is het?**
Een lening van ouders, familie, of vrienden. Vaak informeel, maar fiscaal belangrijk.

**Hoe toe te voegen:**
1. Ga naar **De Kern → Schulden → + Toevoegen**
2. Kies type **Familielening**
3. Kies subtype: Van ouders, Van familie, Van vrienden, of Overig
4. Vul in:
   - **Naam uitlener** — bijv. "Ouders"
   - **Bedrag** — oorspronkelijk en huidig
   - **Rente** — kan 0% zijn, maar let op de fiscale waarschuwing
   - **Aflossingsschema** — vaak informeel
   - **Schriftelijke overeenkomst** — toggle: heb je een schriftelijke overeenkomst?
5. **Fiscale waarschuwingen:**
   - Bij **0% rente**: "Bij 0% rente kan de Belastingdienst dit als schenking aanmerken"
   - Bij **geen schriftelijke overeenkomst**: "Een schriftelijke overeenkomst is aan te raden voor fiscale zekerheid"
6. Valt onder **Box 3 schulden** (boven de schuldendrempel)

---

## Samenvatting: waar vind je alles?

| Feature | Locatie in de app |
|---------|-------------------|
| Huishouden vrijheidstijd | Dashboard, De Kern, De Horizon (perspectief: Huishouden) |
| Privacy-instellingen | Identiteit → Instellingen → Huishouden |
| Gedeelde doelen | De Wil → Doelen |
| Partner-acties | De Wil → Acties |
| FIRE huishouden | De Horizon (perspectief: Huishouden) |
| Maandelijkse check-in | Dashboard (kaart) → /core/checkin |
| Levensgebeurtenissen | De Horizon → knoppen onder grafiek |
| What-If scenario's | De Horizon → What-if scenario |
| Deelneming | De Kern → Bezittingen → + Toevoegen |
| Levensverzekering | De Kern → Bezittingen → + Toevoegen |
| Vordering | De Kern → Bezittingen → + Toevoegen |
| Box 2 belasting | De Kern → Belasting |
| Belastingschuld | De Kern → Schulden → + Toevoegen |
| DGA-schuld | De Kern → Schulden → + Toevoegen |
| Familielening | De Kern → Schulden → + Toevoegen |
