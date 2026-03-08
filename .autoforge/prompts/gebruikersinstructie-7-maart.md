# Gebruikersinstructie — Features van 7 maart 2026

Dit document beschrijft alle functionaliteiten die op 7 maart zijn aangemaakt (255 features, IDs 265-519), gegroepeerd per thema.

---

## 1. Dashboard widgets — Meerdere formaten per widget (IDs 265-335)

### Wat is het?
Elk dashboard-widget ondersteunt nu **drie formaten**: quarter (klein), half (medium) en full (groot). Elk formaat toont progressief meer informatie — van een compact getal tot een uitgebreide breakdown.

### Beschikbare widgets en hun formaten:

| Widget | Quarter (1×1) | Half (2×1) | Full (2×2) |
|--------|---------------|------------|------------|
| **Netto Vermogen** | Totaalbedrag + trend-indicator | + delta t.o.v. vorige maand | + vermogensopbouw breakdown per categorie |
| **Cashflow Maand** | Inkomsten vs uitgaven | + vergelijking vorige maand | + categorieën en maandvergelijking |
| **Budgetten** | Totaal budget-status | — | — |
| **Assets** | Totaal bezittingen | — | — |
| **Schulden** | Totaal schulden | + top schulden | + volledige breakdown per schuld |
| **Holdings** | Portfoliowaarde | + gewogen rendement | — |
| **Voorstellen** | Aantal voorstellen | + top-3 lijst | + uitgebreide lijst met details |
| **Acties** | Openstaande acties | — | — |
| **Doelen** | Actieve doelen | — | — |
| **FIRE Prognose** | FIRE-leeftijd | — | + mini vermogenspad grafiek |
| **Monte Carlo** | Slagingspercentage | + betrouwbaarheidsbanden | + uitgebreide simulatieresultaten |
| **Levensgebeurtenissen** | Aantal actieve events | + tijdlijn komende events | + volledige tijdlijn met impact |
| **Spaarquote** | Percentage | + maandvergelijking | + trend en NIBUD-benchmark |
| **Vrijheidsvoortgang** | Percentage naar FIRE | + delta en snelheid | + mijlpalen en groeisnelheid |
| **Abonnementen** | Maandtotaal | + top-3 bedragen | + volledige lijst met bedragen |
| **Jouw Pad** | Huidige fase | — | — |
| **Veerkracht Score** | Score-getal | + gauge SVG visualisatie | + details en verbeter-tips |
| **Belasting Box 3** | Belastingbedrag | + tarief en vrijheidsdagen | + breakdown tabel alle posten |
| **Terugkerende Transacties** | Totaal maandelijks | + top-5 en totaal | + volledige lijst |
| **NIBUD Benchmark** | Vergelijking indicator | + staafdiagram (nieuw) | + uitgebreide staafdiagrammen |
| **Vrijheidsscenarios** | Beste scenario | — | + visuele lijnen per scenario |
| **Sim Vermogenspad** | Eindvermogen | — | + labels en trajectlijnen |
| **Passief Inkomen** | Maandbedrag | — | + breakdown per bron (nieuw) |
| **Box 3 Belastingdrag** | Jaar-impact | — | + breakdown per asset (nieuw) |
| **Vrijheidsmijlpalen** | Volgende mijlpaal | — | — |
| **Backtesting Score** | Slagingspercentage | — | — |
| **Budget Favoriet** | — | Favoriete budget (nieuw) | + grafiek en trend (nieuw) |

### Hoe te gebruiken
1. Ga naar het **Dashboard**
2. Klik op het **potlood-icoon** (rechtsboven) om de bewerkingsmodus te openen
3. **Formaat aanpassen**: klik op een widget en kies quarter/half/full
4. **Widgets toevoegen/verwijderen**: via het widget-instellingenmenu
5. Sleep widgets naar de gewenste positie
6. Klik **Opslaan** om de indeling te bewaren

### Nieuwe widgets toegevoegd:
- **Meldingen** — Laatste meldingen (quarter/half/full)
- **Badges** — Behaalde badges (quarter/half/full)
- **Streaks** — Actieve streaks (quarter/half/full)
- **AI Inzicht** — Laatste inzicht van Will (quarter/half/full)
- **Volgende Stap** — Eerstvolgende aanbevolen actie (quarter/half/full)
- **Maandoverzicht** — Samenvatting lopende maand (quarter/half/full)
- **Financiële Agenda** — Komende financiële events (quarter/half/full)
- **Noodfonds** — Noodfonds-status en doelvoortgang (quarter/half/full)

---

## 2. Widget grid formaten (IDs 515-521)

### Wat is het?
De grid-layout is aangepast: **half** widgets nemen nu 2 kolommen × 1 rij in, **full** widgets nemen 2 kolommen × 2 rijen in. Dit geeft meer ruimte voor content.

### Hoe te gebruiken
- Werkt automatisch — de grid past zich aan op basis van het gekozen widgetformaat
- Op mobiel: widgets stapelen automatisch in een enkele kolom
- In edit-mode: sleep widgets en kies formaat met de grootte-knoppen

---

## 3. DAIshboard — AI briefing verbeteringen (IDs 336-373)

### Wat is het?
Het DAIshboard (de AI-gegenereerde briefing van Will) is uitgebreid met meer data-context, nieuwe card-types, en personalisatie.

### Nieuwe card-types in de briefing:
| Card type | Wat het toont |
|-----------|---------------|
| **showRecurring** | Terugkerende kosten-kaart met bedrag en frequentie |
| **showLifeEvent** | Levensgebeurtenis met financiële impact in vrijheidstijd |
| **showStreak** | Positieve streak vieren (bijv. "30 dagen binnen budget") |
| **showQuote** | Redactioneel citaat van Will — motiverend of reflectief |
| **showNextStep** | Eerstvolgende aanbevolen actie met dismiss-knop |
| **showDiscover** | Ontdek-suggestie met visited-tracking |

### Personalisatie-verbeteringen:
- **Progressie-detectie** — Will herkent wanneer je sovereignty level verandert en viert dat
- **Actie-opvolging** — Afgeronde acties worden meegenomen in de volgende briefing
- **Trend-herkenning** — Persoonlijke uitgavenpatronen worden gedetecteerd en benoemd
- **Fase-transitie** — Bij het bereiken van een nieuwe financiële fase krijg je een speciale briefing
- **Engagement tracking** — Klikken op cards helpen Will relevantere content te genereren
- **Feedback-gewogen prompting** — Thumbs up/down op cards stuurt toekomstige briefings
- **Module-voorkeur** — Will leert welke modules je het meest gebruikt
- **Briefing-frequentie** — Korte vs uitgebreide briefing op basis van je gebruik
- **Seizoensgeheugen** — Persoonlijke seizoenspatronen (vakantie-uitgaven, decembermaand)
- **Doel-coaching** — Actieve doelen worden proactief opvolgd
- **Advies-effectmeting** — Will meet of eerder gegeven suggesties effect hebben gehad

### Hoe te gebruiken
1. Ga naar het **DAIshboard** (via de knop op het Dashboard of via navigatie)
2. De briefing wordt automatisch gegenereerd op basis van je data
3. **Thumbs up/down** — Geef feedback op individuele cards
4. **Klik op cards** — Links in cards brengen je naar de relevante pagina
5. **Ververs** — Klik op de verversknop voor een nieuwe briefing
6. De briefing past zich aan op basis van je feedback en gebruikspatronen

### Nieuwe data in de briefing:
- Noodfonds-status
- Terugkerende transacties details
- Aanbevelingen details
- Levensgebeurtenissen context
- Maandoverzicht, streaks, notificaties, badges

---

## 4. Onboarding — Volledig herontworpen (IDs 374-431, 459-461)

### Wat is het?
De onboarding is volledig herontworpen in 5 stappen, zonder demo-data. Alles in Editorial Finance design met Will als begeleider.

### De 5 stappen:

**Stap 1: Welkom**
- Editorial welkomstscherm met trifinity. woordmerk
- Will's introductie — wie hij is en wat hij doet
- Geen demo-keuze of persona-selectie meer

**Stap 2: Profiel (Identiteit)**
- Persoonlijke gegevens: naam, geboortedatum
- Temporeel evenwicht (hoe verdeel je je tijd?)
- Uitlog-optie beschikbaar
- Will begeleidt met speech bubbles

**Stap 3: Financieel startpunt**
- Bankrekeningen toevoegen
- Bezittingen (assets) toevoegen via mini-formulieren
- Schulden toevoegen
- Will legt uit waarom elk onderdeel belangrijk is

**Stap 4: Budget**
- Keuze: **Wel** of **niet** budgetteren
- Bij "wel": kies uit budget-templates gebaseerd op je profiel (inkomen, huishouden)
- Of: handmatige budget-editor
- Skip-optie met uitleg

**Stap 5: Voorkeuren**
- "Wat vind jij belangrijk?" — selecteer onderwerpen
- Max 8 widgets kiezen voor je dashboard
- Voorkeuren worden omgezet naar widget_prefs
- Skip-optie met standaard instellingen

**Afsluiting:**
- Gecombineerde save-flow met voortgangsanimatie
- Successcherm met team-introductie (Will, de modules)
- Redirect naar je gepersonaliseerde dashboard

### Design:
- Mobile-first responsive layout
- Sticky navigatieknoppen op mobiel
- Stap-transitie animaties
- Keuzekaarten in responsive grid
- Consistent trifinity. logo (geen regenboog meer)
- Will's avatar als consistente begeleider
- Speech bubbles met contextuele uitleg per stap

---

## 5. Berichten-pagina — Financiële krant (IDs 462-500)

### Wat is het?
Een nieuwe pagina `/berichten` in krantstijl met twee secties: **Meldingen** (je persoonlijke notificaties) en **Nieuws** (AI-gegenereerde financiële nieuwsartikelen).

### Meldingen-sectie
- **30-dagen historie** — Alle meldingen van de afgelopen maand
- **Gegroepeerd per dag** — Inklapbare daggroepen
- **Gelezen/ongelezen** — Visueel onderscheid (vet = ongelezen)
- **Vraag Will** — Per melding een knop om Will erover te bevragen
- **Alles gelezen** — Markeer alle meldingen als gelezen

### Nieuws-sectie
- **AI-gegenereerd** — 5-10 nieuwsartikelen relevant voor jouw financiële situatie
- **Krantstijl** — Hero-artikel als voorpagina, overige in 2-koloms grid
- **Per artikel**:
  - Kop, lead-tekst, bron/datum
  - Categorie-tag (bijv. "Hypotheek", "Beleggen", "Belasting")
  - **"Impact voor jou"** blok — wat betekent dit nieuws voor jouw situatie?
  - **"Bespreek met Will"** knop — open een gesprek over het artikel
- **7-dagen cache** — Nieuws wordt opgeslagen en niet elke keer opnieuw gegenereerd
- **Handmatig verversen** — Knop om nieuw nieuws op te halen

### Hoe te bereiken
1. Klik op het **meldingen-icoon** in de navigatie → linkt naar `/berichten`
2. Of via het **DAIshboard** → link naar berichten-pagina
3. De briefing van Will kan ook naar `/berichten` linken

### Design
- Masthead in krantstijl
- Sectie-koppen met krantsectie-stijl scheiders
- Kolom-scheiders en typografische accenten
- Krant-footer met redactionele afsluiting
- Mobiel: meldingen compact, nieuws in single-column

---

## 6. AI Privacy & Beveiliging (IDs 501-513)

### Wat is het?
Een uitgebreid privacy-framework voor alle AI-functionaliteiten in de app.

### Technisch (onder de motorkap):
- **sanitizeForAI** — Utility-functie die persoonlijke data minimaliseert voordat het naar AI-modellen gaat
- **PII-detectie vangnet** — AI-output wordt gecheckt op mogelijk gelekte persoonlijke informatie
- **Privacy-protocol** — Alle AI system prompts bevatten nu expliciete privacy-instructies
- **Fail-safe** — Als sanitize faalt, wordt de AI-call geblokkeerd

### Voor de gebruiker:
1. Ga naar **Identiteit → Instellingen**
2. Nieuwe sectie: **Privacy**
   - **AI opt-out toggle** — Schakel alle AI-features uit (briefing, nieuws, What-If chat)
   - **Privacy-verklaring** — Modal met uitgebreide uitleg over dataverwerking
3. **Privacy-indicator** — Bij elke AI-feature zie je een klein schildje dat aangeeft dat je data beschermd wordt
4. **Landingspagina** — Privacy & vertrouwen sectie met trust badges

---

## 7. Beheer-pagina uitbreidingen (IDs 452, 494-497, 514)

### Wat is het?
Het beheerderspaneel (`/beheer`) heeft nieuwe tabs en functionaliteiten.

### Nieuwe tabs:
- **Widgets** — Link naar `/beheer/widgets-test` voor het testen van alle widget-formaten
- **Nieuws** — Beheer de AI-prompt voor nieuwsgeneratie:
  - Bewerkbare textarea voor het nieuws-systeemprompt
  - Opslaan en terugzetten naar default
  - Preview van actieve vs standaard prompt

### Hoe te gebruiken
1. Ga naar `/beheer` (alleen voor admins)
2. Klik op de **Widgets** tab om widget-formaten te testen
3. Klik op de **Nieuws** tab om de nieuwsprompt aan te passen

---

## 8. Feature-gating systeem (IDs 432-458)

### Wat is het?
Een verbeterd systeem dat bepaalt welke features zichtbaar zijn op basis van het voortgangsniveau van de gebruiker. Features die nog niet beschikbaar zijn, worden nu **volledig verborgen** in plaats van als "vergrendeld" getoond.

### Wat verandert voor de gebruiker:
- **Geen vergrendelde kaarten meer** — Features die je nog niet hebt ontgrendeld, zijn onzichtbaar (niet grijs)
- **Geleidelijke ontdekking** — Naarmate je de app meer gebruikt, verschijnen nieuwe features
- **Widget-gating** — Widgets die nog niet beschikbaar zijn, verschijnen niet in de widget-selector
- **NewFeatureSpotlight** — Wanneer een feature beschikbaar wordt, krijg je een spotlight-melding

### Hoe het werkt (onder de motorkap):
- Elke feature heeft een minimaal niveau in de feature-fase matrix
- Widgets zijn gekoppeld via `WIDGET_FEATURE_MAP`
- De `FeatureGate` component verbergt content in plaats van een locked-state te tonen
- Specifieke secties op modulepagina's (vermogensverloop, snapshot-vergelijking, cashflow Sankey, etc.) zijn individueel gegated

---

## 9. Volgende Stap & Ontdek → naar briefing (IDs 402-418)

### Wat is het?
De "Volgende Stap" suggesties en "Ontdek" carrousel zijn verplaatst van de individuele modulepagina's naar de **DAIshboard briefing**. Will integreert ze nu in zijn dagelijkse briefing.

### Wat verandert:
- **Modulepagina's** — NextStepSection en DiscoverCarousel zijn verwijderd van alle pagina's
- **DAIshboard** — Will toont nu `showNextStep` en `showDiscover` cards in de briefing
- **Dismiss** — Je kunt een "Volgende Stap" card wegklikken (dismiss)
- **Visited tracking** — Ontdek-suggesties markeren als "bezocht" wanneer je erop klikt

### Instellingen:
1. Ga naar **DAIshboard → Instellingen** (tandwiel-icoon)
2. Nieuwe toggles: **Volgende stappen** en **Ontdek-suggesties** aan/uit
3. Je voorkeuren worden meegenomen in het briefing system prompt

---

## Samenvatting: waar vind je alles?

| Feature | Locatie |
|---------|---------|
| Widget-formaten (quarter/half/full) | Dashboard → bewerkingsmodus (potlood) |
| 8 nieuwe widgets | Dashboard → widget-instellingen → toevoegen |
| DAIshboard verbeteringen | DAIshboard (via Dashboard-knop) |
| Nieuwe briefing cards | DAIshboard (automatisch) |
| Briefing feedback | DAIshboard → thumbs up/down op cards |
| Onboarding | Eerste login / nieuw account |
| Berichten & Nieuws | /berichten (via meldingen-icoon) |
| Privacy-instellingen | Identiteit → Instellingen → Privacy |
| AI opt-out | Identiteit → Instellingen → Privacy |
| Feature-gating | Automatisch (onzichtbaar voor gebruiker) |
| Beheer: Widgets testen | /beheer → Widgets tab |
| Beheer: Nieuws-prompt | /beheer → Nieuws tab |
| Volgende Stap / Ontdek | DAIshboard briefing (niet meer op modulepagina's) |
