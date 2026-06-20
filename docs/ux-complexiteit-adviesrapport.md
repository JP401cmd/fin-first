# Adviesrapport — Complexiteit verlagen in TriFinity zonder functieverlies

**Opdracht:** de applicatie wordt door gebruikers als te complex en intimiderend ervaren, ondanks een bewuste 2-laags aanpak (simpele basis + detail-/finetune-laag). Doel: de *ervaren* complexiteit en cognitieve belasting drastisch verlagen — **zonder functionaliteit te verwijderen**.

**Context:** TriFinity is een Nederlandstalige persoonlijke-financiënapp ("Geld is opgeslagen tijd") voor particulieren die hun vermogen, budgetten, schulden, belasting en financiële onafhankelijkheid (FIRE) willen sturen. De doelgroep is breed: van iemand die net begint tot een power-user die scenario's doorrekent.

**Rol:** opgesteld vanuit Senior UX/UI-ontwerp en UX-research.

---

## Samenvatting (TL;DR)

De 2-laags aanpak is niet het probleem — de **uitvoering** ervan is inconsistent. Uit de codebase-analyse blijkt dat "de tweede laag" op minstens vier verschillende manieren wordt onthuld (modals, view-mode-toggles, collapsible secties, losse settings-routes) en dat de "eerste laag" zelf al te veel keuzes en getallen toont. De gebruiker krijgt daardoor geen rustige basis met optionele diepte, maar **een vlakke berg keuzemogelijkheden waar de hiërarchie ontbreekt**.

Belangrijkste bevindingen:
- **De Toekomst/Horizon-pagina** kent ~12 zichtbare bedieningselementen bij binnenkomst, 8+ modals, en een combinatorische explosie aan toestanden (chart-mode × 4 overlays × 2 toggles = 100+ mogelijke views).
- **Budgetten** opent met 3–4 KPI-cellen plus een view-toggle (boom/donut/heatmap) plus een periode-toggle — de gebruiker moet kiezen vóór hij iets begrijpt.
- **Progressive disclosure is geen fundament maar een uitzondering:** de `CollapsibleSection`-component wordt slechts op 2 pagina's gebruikt; de meeste diepte zit achter modals.
- **Onboarding is wél goed versimpeld** (5 stappen, alles behalve identiteit overslaanbaar via "Later invullen") — dit is het bewijs dat het team het kán; het patroon is alleen niet doorgetrokken naar de rest van de app.

De oplossing ligt in **één consistent disclosure-systeem**, een **rustigere basislaag** (minder gelijktijdige keuzes, slimmere defaults), en een **duidelijke mentale kapstok** (de drie modules + de "tijd"-filosofie) die als rode draad door elk scherm loopt.

---

## 1. Analyse van de huidige 2-laags aanpak

### 1.1 Waarom 2 lagen in theorie klopt
Het scheiden van een **eenvoudige basis** (snelle invoer, slimme defaults) en een **detaillaag** (finetunen) is een beproefd principe — het is in feite *progressive disclosure* op macroniveau. Het werkt omdat het de cognitieve belasting van de eerste kennismaking verlaagt: de gebruiker hoeft niet alles te begrijpen om te starten.

### 1.2 Waarom het in de praktijk alsnog complex voelt
Een 2-laags model faalt zelden omdat het concept verkeerd is. Het faalt op de **naden tussen de lagen** en op een **te drukke basislaag**. Toegepast op TriFinity:

**Valkuil A — De basislaag is geen basis, maar een dashboard.**
De "simpele" laag toont al te veel gelijktijdig. Voorbeelden uit de code:
- `/horizon` (Toekomst) toont bij binnenkomst 5–6 KPI-kaarten, een grote grafiek, 4 overlay-knoppen en een tijdlijn met 5–15 events — vóórdat de gebruiker iets gedaan heeft. (`components/app/horizon/horizon-client.tsx`)
- `/core/budgets` opent met een 2-koloms editorial header, een KPI-strip van 3–4 cellen, én twee toggles (view-mode + periode) die de gebruiker dwingen een presentatievorm te kiezen voordat hij de inhoud snapt. (`components/app/budgets-client.tsx:817–822`)

Een echte basislaag beantwoordt eerst één vraag ("hoe sta ik ervoor?") en pas daarna biedt hij keuzes.

**Valkuil B — De tweede laag wordt op vier manieren onthuld.**
Er is geen consistent mentaal model voor "waar zit de diepte". De diepte zit verspreid over:
1. **Modals/sheets** — 8+ lazy-loaded modals op Horizon alleen (Scenarios, Simulations, Withdrawal, Backtesting, Strategie, EventPane, 3× Phase-modals).
2. **View-mode-toggles** — budgetten (boom/donut/heatmap), grafiekmodi.
3. **Collapsible secties** — slechts 2 pagina's (`collapsible-section.tsx`).
4. **Losse settings-routes** — 9 aparte `/mijn/*`-pagina's.

Omdat dezelfde "ga dieper"-intentie elke keer een ander gebaar vereist, kan de gebruiker geen verwachting opbouwen. Onvoorspelbaarheid voelt als complexiteit.

**Valkuil C — Combinatorische explosie van toestanden.**
Horizon: chart-mode (2) × overlays (4 binair) × view-toggles (2) = honderden mogelijke schermtoestanden, elk met eigen interne sliders. De gebruiker kan letterlijk niet overzien "in welke toestand" hij zit. Dit is de stilste maar dodelijkste complexiteitsbron: niet de hoeveelheid functies, maar de hoeveelheid **gelijktijdig actieve, onafhankelijke keuzes**.

**Valkuil D — Uitgestelde complexiteit is verplaatste complexiteit.**
Onboarding laat velden overslaan ("Later invullen"), maar elk uitgesteld veld komt terug als coach-bubble-suggestie ná onboarding (`onboarding/page.tsx:1172–1240`). De last wordt verschoven, niet verlaagd. Goed bedoeld, maar de gebruiker houdt een onzichtbare to-do-lijst.

**Valkuil E — Geen onderscheid tussen "beginner" en "power-user".**
Module-activatie gebeurt vroeg in onboarding met **alle modules standaard AAN** (`onboarding/page.tsx:237`). Daarna is toegang puur tier-/abonnementsgebaseerd, niet vaardigheidsgebaseerd. Een beginner krijgt dus dezelfde dichtheid als een gevorderde. Er is geen "rustige modus" om in te groeien.

### 1.3 Wat al goed gaat (behouden!)
- **Onboarding (5 stappen, alles overslaanbaar)** is een schoolvoorbeeld van een goede basislaag — dit patroon is de blauwdruk voor de rest.
- **Settings opgesplitst in 9 gefocuste routes** i.p.v. één monolithisch formulier (was 2459 regels) — uitstekend, dit is het tegenovergestelde van een god-form.
- **Het ontwerptaal-fundament is sterk:** krant-esthetiek, typografische hiërarchie, "elk getal is klikbaar" (kassabon-patroon). Dit zijn precies de bouwstenen waarmee je complexiteit kunt *verbergen* in plaats van *verwijderen*.

---

## 2. Marktonderzoek & best practices

Hoe verbergen succesvolle apps extreme complexiteit zonder functies te schrappen? Vijf voorbeelden, telkens met het concrete UX-patroon én de vertaling naar TriFinity.

### 2.1 TurboTax / Intuit — *"Interview, geen formulier"*
Belastingaangifte is intrinsiek loodzwaar. TurboTax verbergt dit door de complexe data nooit als formulier te tonen, maar als **lineair gesprek**: één vraag per scherm, in gewone taal ("Heb je dit jaar een huis gekocht?"). Achterliggende velden vullen zichzelf op basis van antwoorden.
- **Patronen:** one-question-per-screen, conditionele logica (irrelevante secties verschijnen nooit), voortgangsindicator, "we hebben X voor je ingevuld"-bevestigingen.
- **Naar TriFinity:** de check-in- en jaaroverzicht-flows (Type 7 wizard) zijn hier ideaal voor. Belasting (Box 3) kan van "calculator met alle parameters zichtbaar" naar "interview dat de parameters afleidt en de uitkomst als kassabon toont".

### 2.2 Stripe — *"Sane defaults + zichtbare diepte op aanvraag"*
Stripe's dashboard is bedrieglijk simpel terwijl er een enorme API onder zit. De truc: **elke instelling heeft een verstandige default**, en geavanceerde opties zitten consequent achter een herkenbare "Advanced options"-disclosure — altijd op dezelfde plek, altijd dezelfde vorm.
- **Patronen:** consistente "Advanced"-collapse, defaults die 80% van de gevallen dekken, inline contextuele uitleg naast (niet in plaats van) het veld.
- **Naar TriFinity:** dit is het directe medicijn tegen Valkuil B. Eén disclosure-component (`CollapsibleSection`) als *standaard* voor alle "tweede laag", op een vaste positie en met vaste copy ("Meer opties" / "Toon detail").

### 2.3 Linear — *"Progressive disclosure via command palette"*
Linear oogt minimalistisch maar bevat honderden functies. Die zijn niet weggehaald — ze zitten in een **command palette (⌘K)** en in contextuele acties die pas verschijnen bij hover/selectie. De interface toont alleen wat *nu* relevant is.
- **Patronen:** command palette als "tweede laag voor alles", contextuele acties (geen permanente knoppenbalk), keyboard-first voor power-users zonder de UI te belasten.
- **Naar TriFinity:** er is al een command-palette-infrastructuur (`z-[60]`, peer van de FloatingNavButton). Die kan de thuisbasis worden voor zelden-gebruikte acties die nu als permanente knoppen op Horizon staan — power-functies bereikbaar, basislaag rustig.

### 2.4 Shopify — *"Eén taak, één scherm, duidelijke volgende stap"*
Shopify bedient miljoenen niet-technische ondernemers. Het versimpelt door **taakgerichte schermen** met een onmiskenbare primaire actie en een "wat nu?"-vervolg. Setup gebeurt via een **checklist die meegroeit**: je ziet nooit alles tegelijk, alleen de volgende logische stap.
- **Patronen:** outcome-gemodelleerde CTA's, setup-checklist die complexiteit faseert, empty states die de eerste actie zíjn (niet een dood scherm).
- **Naar TriFinity:** sluit naadloos aan op de bestaande "Happy Flow"-conventie (elke succes-actie beantwoordt "gelukt? / wat nu? / wat als fout?"). De setup-checklist is bovendien het betere alternatief voor de coach-bubble-suggesties uit Valkuil D — zichtbaar, één plek, afvinkbaar i.p.v. een onzichtbare to-do.

### 2.5 Apple Photos / Foto-editors — *"Auto eerst, handmatig daaronder"*
Foto-editors verbergen tientallen schuifregelaars achter één "Auto"-knop. De app maakt eerst een goede gok; wie wil finetunet daarna. De **default is een resultaat, geen leeg canvas**.
- **Patronen:** auto-enhance als startpunt, regelaars gegroepeerd en samengevouwen, niet-destructief (altijd terug naar default).
- **Naar TriFinity:** scenario-/what-if-tools (Horizon) moeten openen met een *berekende, ingevulde* basisprojectie — niet met lege sliders die de gebruiker moet begrijpen. De sliders zijn de tweede laag; de uitkomst is de eerste.

### Rode draad uit het marktonderzoek
Alle vijf doen hetzelfde: **ze tonen een uitkomst of een gesprek, niet een gereedschapskist.** Functies verdwijnen nooit — ze verhuizen naar een consistente, voorspelbare tweede laag, en de eerste laag wordt teruggebracht tot "één vraag / één uitkomst / één volgende stap".

---

## 3. Strategieën voor versimpeling (zonder functieverlies)

Zeven direct toepasbare principes, elk met een concreet TriFinity-voorbeeld.

### 3.1 Eén disclosure-systeem (consolideer de "tweede laag")
**Principe:** kies één gebaar voor "ga dieper" en gebruik dat overal. Inconsistentie is de grootste bron van ervaren complexiteit (Valkuil B).
**Voorbeeld:** maak `CollapsibleSection` (of de `ShellOverlay kind="pane"` voor echt grote diepte) de *standaard*. Vervang de 8 losse Horizon-modals door één pane met interne tabs (Scenario's / Simulaties / Opname / Backtest). De gebruiker leert één keer "diepte = sectie uitvouwen / pane openen" en weet het daarna overal.

### 3.2 Rustige basislaag: maximaal 1 hoofdcijfer + 1 volgende stap per scherm
**Principe:** de eerste laag beantwoordt één vraag. Defaults bepalen de presentatie; de gebruiker hoeft niet te kiezen om te begrijpen.
**Voorbeeld:** `/core/budgets` opent in boom-weergave, maand-periode, zónder de toggles prominent te tonen. Eén hoofdcijfer ("Nog te verdelen deze maand: €X = Y dagen vrijheid") met highlight-marker. De view-toggle (donut/heatmap) en periode-toggle verhuizen naar een onopvallende control-rij of achter "Andere weergave".

### 3.3 Slimme defaults i.p.v. keuzes (auto-eerst)
**Principe:** toon een berekend resultaat, geen leeg canvas. Laat de app de eerste gok doen.
**Voorbeeld:** Horizon's what-if opent met de huidige projectie al ingevuld en zichtbaar; sliders staan eronder, default op de werkelijke waarden. Box 3 toont eerst de berekende belastingdruk (kassabon), parameters klappen daaronder open voor wie wil corrigeren.

### 3.4 Contextual onboarding & de meegroeiende checklist
**Principe:** leer functies op het moment dat ze relevant zijn, niet vooraf. Vervang de onzichtbare "uitgestelde velden"-last door een zichtbare checklist.
**Voorbeeld:** in plaats van coach-bubbles die uitgestelde velden terugbrengen (Valkuil D), één "Maak je profiel compleet"-checklist op het dashboard (3/5 gedaan), Shopify-stijl. Empty states zijn meteen het leermoment ("Nog geen budget — voeg je eerste toe", met directe CTA via `?new=true`).

### 3.5 Microcopy: tijd-framing als cognitieve hulp, niet als decoratie
**Principe:** taal die de betekenis draagt, verlaagt belasting. De "Geld = tijd"-filosofie is hier een troef: een tijdsbedrag is intuïtiever dan een abstract eurobedrag of percentage.
**Voorbeeld:** consequent "€X = Y maanden vrijheid" naast elk bedrag >€100, en labels die framen ("vrijheid opbouwen" i.p.v. "sparen", "vrijheid die je terugkoopt" i.p.v. "schuld aflossen"). Dit maakt de app niet alleen filosofisch consistent maar ook *begrijpelijker* — één mentale eenheid (tijd) i.p.v. drie (euro's, procenten, jaren).

### 3.6 Chunking & visuele hiërarchie: de drie modules als kapstok
**Principe:** groepeer in 5–9 brokken (Miller), en laat hiërarchie de aandacht sturen (F-patroon: kritieke data linksboven).
**Voorbeeld:** de drie modules (Kern/Wil/Horizon = Overzicht/Will/Toekomst) zijn al een sterke mentale kapstok — gebruik die strenger. Elk scherm hoort onmiskenbaar bij één module (kleuraccent via `--module-active-*`), en binnen een scherm nooit meer dan ~5 elementen boven de vouw. De krant-esthetiek (kicker → kop → hoofdcijfer → meta) is al een hiërarchie-machine; pas die consequent toe.

### 3.7 Een "Rustige modus" (groeipad voor dichtheid)
**Principe:** geef gebruikers controle over dichtheid i.p.v. iedereen de maximale dichtheid te geven (Valkuil E). Geen functieverlies — een instelling.
**Voorbeeld:** een "Eenvoudig / Volledig"-schakelaar in `/mijn/uiterlijk` (of een eerste-run-default op "Eenvoudig"). Eenvoudig verbergt de minst-gebruikte overlays/toggles en toont per pagina alleen de kernweergave; Volledig ontgrendelt alles. Dit is precies hoe foto-editors en pro-tools het doen — de power-user verliest niets, de nieuwkomer wordt niet overweldigd.

---

## 4. Actieplan voor de redesign

Een gefaseerd stappenplan voor het team, van diagnose naar herbouw. Elke fase is een paar dagen tot weken werk; de volgorde is bewust (eerst meten en consolideren, dan herbouwen).

### Fase 0 — Meten & afspreken (begin hier)
1. **Inventariseer elke "tweede laag".** Maak een lijst: welk scherm onthult diepte via modal / view-toggle / collapsible / route? Dit legt de inconsistentie (Valkuil B) hard op tafel.
2. **Tel de gelijktijdige keuzes per scherm.** Voor de top-10 pagina's: hoeveel onafhankelijke toggles/controls zijn boven de vouw zichtbaar? Alles boven ~5 is een kandidaat voor disclosure.
3. **Kies het ene disclosure-systeem.** Leg vast: collapsible voor binnen-pagina-diepte, `ShellOverlay kind="pane"` voor grote diepte, command-palette voor zeldzame acties. Verbied nieuwe ad-hoc modals.
4. **Definieer "Fase-1-light".** Spreek per page-type af wat de *minimale* basislaag is (1 hoofdcijfer + 1 volgende stap).

### Fase 1 — De basislaag kalmeren (hoogste impact, laagste risico)
5. Per scherm: bepaal het ene hoofdcijfer, geef het tijd-framing + highlight-marker, en duw alle secundaire controls naar een control-rij of disclosure.
6. Zet niet-essentiële toggles default uit/verborgen (Horizon-overlays, budget-view-modi).
7. Vervang lege schermen door empty states die de eerste actie zíjn.

### Fase 2 — De tweede laag consolideren
8. Migreer Horizon's 8 modals naar één pane met tabs.
9. Maak `CollapsibleSection` de standaard "Meer opties"-disclosure overal, op een vaste positie met vaste copy.
10. Verhuis zeldzame acties naar de command-palette.

### Fase 3 — Groeipad & contextuele begeleiding
11. Introduceer de "Eenvoudig/Volledig"-modus; default nieuwe gebruikers op Eenvoudig.
12. Vervang uitgestelde-veld-coachbubbles door één meegroeiende setup-checklist.
13. Voeg contextuele uitleg toe op het moment van eerste gebruik (niet vooraf).

### Fase 4 — Valideren
14. Hertest met 5 gebruikers (nieuw + bestaand) op de kerntaken; meet *time-to-first-insight* en zelfgerapporteerde overweldiging vóór/na.
15. Itereer op de schermen die nog steeds >5 gelijktijdige keuzes tonen.

---

### UX-checklist — stel jezelf deze vragen bij ELK scherm

Loop deze lijst af voor elk scherm dat je reviewt of herbouwt:

**Focus & hiërarchie**
- [ ] Wat is het **ene** hoofdcijfer / de ene vraag van dit scherm? Is dat onmiskenbaar het visuele zwaartepunt?
- [ ] Hoeveel **onafhankelijke keuzes** (toggles, modi, overlays) zijn boven de vouw zichtbaar? Is dat ≤ 5?
- [ ] Kan de gebruiker dit scherm begrijpen **zonder eerst iets te kiezen**?

**De twee lagen**
- [ ] Wat is hier de basislaag en wat de tweede laag — en is dat onderscheid zichtbaar?
- [ ] Wordt de tweede laag onthuld via het **afgesproken, consistente** gebaar (geen nieuwe ad-hoc modal)?
- [ ] Heeft elke instelling een **verstandige default**, zodat niets-doen al een goed resultaat geeft?

**Begrijpelijkheid & taal**
- [ ] Toont elk bedrag >€100 ook zijn **tijd-equivalent** (vrijheidstijd)?
- [ ] Is de copy in actieve "je"-vorm, plain language, één idee per zin?
- [ ] Hoort het scherm onmiskenbaar bij **één module** (kleuraccent correct)?

**Volgende stap & flow**
- [ ] Is er een duidelijke **primaire, voorwaartse** actie ("wat nu?") — geen kale "OK/Sluiten"?
- [ ] Wat ziet een gebruiker hier bij **lege** data, en is dat meteen een eerste-actie i.p.v. een dood scherm?
- [ ] Wat gebeurt er **na succes** — een toast/banner op de bestemming, niet vastzitten in een modal?

**Dichtheid & groei**
- [ ] Zou een beginner dit scherm anders moeten zien dan een power-user? Zo ja, respecteert het de "Eenvoudig/Volledig"-modus?
- [ ] Verbergt dit scherm complexiteit, of **verplaatst** het die alleen naar later (onzichtbare to-do)?

**Toegankelijkheid (minimumeisen)**
- [ ] Contrast ≥ 4.5:1, touch-targets ≥ 44px, zichtbare focus-ring, logische tab-volgorde?

---

### Eén zin om te onthouden
> Versimpelen is geen functies weghalen — het is **de juiste functie op het juiste moment tonen** en de rest voorspelbaar uit het zicht parkeren.

*Trifinity ✦ UX-advies ✦ 2026-06-20*
