# TriFinity - Product Export Document

> Personal Finance Freedom Navigator

---

## 1. Filosofie & Ontwerpprincipes

### Kernidee

**Geld is opgeslagen tijd.**

TriFinity vertaalt financien naar tijd zodat gebruikers bewuste keuzes maken over hun leven. Waar traditionele financiele apps zeggen "Je hebt EUR 450.000 vermogen", zegt TriFinity: **"Je hebt 12 jaar en 4 maanden vrijgekocht."**

De inspiratie komt uit de film *In Time* (2011) -- tijd als zichtbare valuta, maar dan als bevrijding in plaats van beperking.

### Vijf designprincipes

| Principe | Betekenis |
|----------|-----------|
| **Tijd, geen euro's** | Toon bedragen als dagen/uren vrijheid. "Dit kost 19 dagen vrijheid" in plaats van "Dit kost EUR 500". |
| **Autonomie, geen schaarste** | Nooit "je mag nog EUR 50 uitgeven", maar "als je deze EUR 50 belegt, win je 2 dagen vrijheid". Kansen tonen, niet beperkingen. |
| **De sweetspot** | Niet losbandig, niet krenterig. Bewust genieten van wat waarde geeft, meedogenloos snoeien wat dat niet doet. |
| **Optimalisatie, geen deprivatie** | Bewuster genieten, niet minder genieten. |
| **Het oneindig-symbool** | Het ultieme doel: passief inkomen dekt permanent de uitgaven. Vrijheid als percentage dat groeit. |

### Toon & taalgebruik

- Empowerend, nooit veroordelend
- Framing als "tijd verdienen", niet "geld besparen"
- De gebruiker wordt gestimuleerd, niet beperkt

---

## 2. Architectuur op hoofdlijnen

### Drie domeinen

TriFinity is opgebouwd uit drie domeinen die samen het volledige financiele plaatje dekken:

| Module | Naam | Kleur | Avatar | Rol |
|--------|------|-------|--------|-----|
| **De Kern** | Assets & waarheid | Goud/Amber | FHIN | Centrum van opgeslagen levensenergie -- het fundament |
| **De Wil** | Actie & keuzes | Teal/Cyan | FINN | De spier: wilskracht om bewust te sturen |
| **De Horizon** | Vrijheid & toekomst | Paars | FFIN | Het uitzicht dat dichterbij komt naarmate je bewuster leeft |

Elke module heeft een eigen geanimeerde avatar, kleurpalet en AI-persoonlijkheid.

### Tech stack

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS v4
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions)
- **AI**: Anthropic Claude / OpenAI (configureerbaar), streaming responses
- **Import**: CSV, OFX, MT940 bankbestand-parsers

---

## 3. Functionaliteiten per module

---

### 3.1 Dashboard -- Het startpunt

Het dashboard toont drie klikbare domeinkaarten met realtime metrics en geanimeerde avatars. De gebruiker ziet direct:

- **Vrijheidspercentage**: hoeveel procent richting financiele onafhankelijkheid (FIRE)
- **FIRE-projectie**: verwachte datum, countdown, vermogen vs. doelbedrag
- **Snelle toegang** tot elk domein met kerngetallen

---

### 3.2 De Kern -- Financiele waarheid

De Kern is het financiele fundament: wat heb je, wat komt er binnen, wat gaat er uit?

#### 3.2.1 Kernoverzicht

**Hero-sectie met vrijheidstijdlijn**
- Groot vrijheidspercentage met voortgangsbalk
- Drie kernmetrics: vrijheidstijd (jaren/maanden), nettovermogen, verwachte FIRE-datum

**KPI-kaarten**
- Gewonnen dagen per maand
- Huidige spaarquote
- Vrije dagen per jaar (gedekt door passief inkomen)
- Autonomie-score (A+ tot E)

**Budgetwaarschuwingen**
- Realtime alerts wanneer budgetten drempelwaarden bereiken

**Nettovermogen-grafiek**
- Lijngrafiek: assets, schulden, nettovermogen over 24 maanden
- Handmatige snapshot-functie voor voortgang bijhouden

**Financiele kerncijfers**
- Geschat jaarinkomen (geextrapoleerd bij minder dan 12 maanden data)
- Jaarlijkse vaste lasten (som van essentiele budgetten)

---

#### 3.2.2 Budgetten

**Maandnavigatie**
- Schakel tussen maanden met driekoloms totalen: inkomsten, uitgaven, besparingen

**Vier weergavemodi**
1. **Boomweergave**: hierarchische ouder-kind budgetstructuur
2. **Lijstweergave**: platte lijst gegroepeerd op type
3. **Organisme-weergave**: organische bubbel-layout
4. **Donut-weergave**: cirkeldiagram

**Budgetbeheer**
- Ouder-budgetten met kind-subbudgetten
- Drie types: inkomsten, uitgaven, besparingen
- Iconen, limieten, intervallen (maandelijks/per kwartaal/jaarlijks)
- Rollover-ondersteuning: reset, overdragen, beleggen-sweep
- Alertdrempels (zachte/harde limieten)
- Prioriteitsscores (1-5)
- Essentieel vs. niet-essentieel tagging
- Inflatie-indexering toggle
- Effectieve maandselector (voor limietwijzigingen met terugwerkende kracht)

**Budgetdetail**
- Huidige besteding vs. limiet met voortgangsbalk
- Overgedragen bedrag
- Kind-budget breakdown
- Transactielijst voor de maand
- 12-maanden bestedingsgeschiedenis (staafdiagram)

---

#### 3.2.3 Kas / Transacties

**Rekeningbeheer**
- Meerdere bankrekeningen (IBAN, banknaam, rekeningtype)
- Saldo per rekening

**Transactiebeheer**
- Maandoverzicht: inkomsten, uitgaven, netto
- Transactielijst gegroepeerd op datum
- Per transactie: budget-icoon, omschrijving, tegenpartij, bedrag (kleurgecodeerd)
- Formulier: datum, bedrag, omschrijving, budgetcategorie, tegenpartij, notities
- Markeren als terugkerend (maakt template)

**Terugkerende transacties**
- Overzicht actieve terugkerende boekingen
- Frequentielabels: wekelijks, maandelijks, per kwartaal, jaarlijks
- Verwacht maandelijks totaal en volgende datum

**Sankey-diagram**
- Visuele geldstroom: inkomstenbronnen -> uitgavecategorieen -> subcategorieen
- Klikbare nodes navigeren naar budgetdetail

**Transactie-import**
- Bestandsupload: CSV (diverse bankformaten), OFX, MT940 (SWIFT)
- AI-gestuurde automatische categorisering
- Preview-tabel voor import
- Handmatige categorie-override
- Duplicaatdetectie

---

#### 3.2.4 Bezittingen (Assets)

**Overzicht**
- Totale waarde, maandelijkse bijdrage, totaalrendement, geprojecteerde waarde (10 jaar)
- Allocatie-cirkeldiagram per assettype
- Projectiegrafiek met instelbare tijdlijn (5/10/20/30 jaar)

**Zeven assettypen** (elk met type-specifieke velden)

| Type | Bijzonderheden |
|------|----------------|
| Spaargeld | Basisspaarrekening |
| Aandelen | Ticker/ISIN, risicoprofiel, liquiditeit |
| Obligaties | Vastrentend, einddatum |
| Crypto | Ticker, hoog risico |
| Vastgoed | Adres, WOZ-waarde, huurinkomsten |
| Pensioen | Pensioenuitvoerder, belastingvoordeel, niet liquide |
| Eigen huis | Adres, WOZ-lookup, gekoppelde hypotheek, overwaarde berekening |

**WOZ-lookup**
- Externe API-integratie via Supabase Edge Function
- Retourneert historische WOZ-waarden met peildatum
- Vult automatisch WOZ-waarde in

**Waarderingsgeschiedenis**
- Herwaardeer-interface met datum, nieuwe waarde en notities
- Bijhouding van waarderingshistorie per asset

---

#### 3.2.5 Schulden

**Overzicht**
- Totale schuld, maandbetalingen, afgelost bedrag, voortgangspercentage
- Voortgangsbalk aflossing

**Aflosstrategie-simulator**
- Drie strategieen:
  1. **Avalanche**: hoogste rente eerst
  2. **Snowball**: kleinste balans eerst
  3. **Huidig**: huidige betalingen handhaven
- Extra maandbetaling-slider
- Resultaten: schuldenvrij-datum, totale rente, bespaarde rente, bespaarde maanden
- Gestapelde vlakgrafiek: schuldafbouw over tijd

**Vijf schuldtypen**

| Type | Bijzonderheden |
|------|----------------|
| Hypotheek | Annuitair/lineair/aflossingsvrij, NHG, aftrekbaar, rentevast-einddatum, gekoppeld vastgoed |
| Persoonlijke lening | Standaard leningvelden |
| Creditcard | Kredietlimiet |
| Studielening | Draagkrachtmeting-datum, aflostype |
| Overig | Generiek |

---

### 3.3 De Wil -- Actie & optimalisatie

De Wil is de motor: hier worden inzichten omgezet in actie.

#### 3.3.1 Wiloverzicht

**Hero-sectie**
- Groot getal: totaal gewonnen vrijheidsdagen
- Voortgangsbalk: actie-voltooiingsratio
- Drie metrics: voltooide acties, open potentieel (dagen), beslissnelheid (gem. dagen)

**KPI-kaarten**
- Voltooide acties: aantal en percentage
- Open potentieel: vrijheidsdagen van lopende aanbevelingen
- Doelvoortgang: gemiddelde voortgang over actieve doelen
- Wilskrachtscore: A-E rating op basis van voltooiingsratio

**Alerts**
- Verlopen acties (deadline gepasseerd)
- Gereactiveerde aanbevelingen (uitgestelde items nu beschikbaar)
- Achterblijvende doelen

---

#### 3.3.2 AI-aanbevelingen

**Vijf aanbevelingstypen**
1. Budgetoptimalisatie
2. Asset-herallocatie
3. Schuldversnelling
4. Inkomstenverhoging
5. Spaarboost

**Per aanbeveling**
- Titel, beschrijving, type-badge
- Euro-impact (maandelijks/jaarlijks)
- Vrijheidsdagen per jaar impact
- Huidige vs. voorgestelde waarde
- Prioriteitsscore (1-5 sterren)
- Voorgestelde actiestappen

**Gebruikersacties**
- Accepteren (genereert acties op het actiebord)
- Uitstellen (met datumkiezer)
- Afwijzen

**Genereren**
- "Genereer nieuwe suggesties" knop
- AI analyseert volledige financiele context en genereert 3 gerichte aanbevelingen

---

#### 3.3.3 Actiebord

**Kanban-layout met drie kolommen**
- **Open**: te ondernemen acties
- **Uitgesteld**: geparkeerde acties
- **Voltooid**: afgeronde acties

**Per actiekaart**
- Titel, beschrijving
- Vrijheidsdagen-impact
- Gerelateerde aanbeveling
- Deadline / geplande week
- Prioriteitsscore

**Bewerken**
- Titel, beschrijving, euro-impact, vrijheidsdagen
- Status wijzigen, prioriteit, deadline
- Week plannen (voor tijdlijnplanning)

---

#### 3.3.4 Doelen

**Doeltypen**
- Bedrag sparen
- Schuld aflossen
- Inkomen opbouwen
- Asset kopen
- Aangepast

**Per doel**
- Naam, beschrijving, icoon, kleur
- Doelbedrag, doeldatum
- Gekoppelde asset of schuld (optioneel)
- Huidige voortgang, maandelijkse bijdrage
- Voortgangsbalk (kleurgecodeerd)
- "Achter op schema" waarschuwing

**Beslispatronen-grafiek**
- Horizontaal staafdiagram: gewonnen vrijheidsdagen per aanbevelingstype
- Visuele analyse van welke acties de meeste impact hebben

---

### 3.4 De Horizon -- Vrijheid & toekomst

De Horizon toont waar je naartoe groeit: wanneer bereik je financiele vrijheid?

#### 3.4.1 Horizonoverzicht

**Hero-sectie**
- Groot getal: verwachte FIRE-leeftijd (of vrijheidspercentage)
- Voortgangsbalk: pad naar FIRE-doel
- Drie metrics: countdown (dagen), vrijheidstijd, verwachte FIRE-datum

**KPI-kaarten**
- FIRE-leeftijd: verwacht met optimistisch/pessimistisch bereik
- Countdown: dagen tot FIRE
- Vrijheidspercentage: voortgang richting FIRE
- Veerkrachtscore: 0-100 (componenten: runway, diversiteit, inkomensstabiliteit)

**Alerts**
- Ontbrekende geboortedatum-waarschuwing
- FIRE niet bereikbaar (negatieve spaarquote)
- Schuldvertraging-waarschuwing

---

#### 3.4.2 Verkenningskaarten (vier deep-dives)

**1. Projecties**
- FIRE-berekeningsbreakdown
- Uitleg 4%-regel
- Aannames en variabelen

**2. Scenario's**
- Drie paden vergeleken:
  - **Drifter**: huidige koers zonder wijzigingen
  - **Koers**: gebalanceerde aanpak
  - **Optimizer**: agressieve optimalisatie
- Impact-vergelijking per scenario

**3. Simulaties**
- Monte Carlo-simulatie (1.000 runs)
- Slagingspercentage-distributie
- Onzekerheidsanalyse

**4. Onttrekkingsstrategieen**
- Vier strategieen uitgelegd:
  1. 4%-regel (vast percentage)
  2. Dynamisch uitgeven (variabel)
  3. Vloer-plafond (bandbreedte)
  4. Bucket-strategie (korte/middellange/lange termijn)
- Voor- en nadelen per strategie

---

#### 3.4.3 Tijdlijn

**Logaritmische visuele tijdlijn**
- Huidige leeftijd-marker
- Basis FIRE-leeftijd marker
- Aangepaste FIRE-leeftijd (inclusief levensgebeurtenissen)
- Levensgebeurtenis-markers met iconen (gepositioneerd op doelleeftijd)
- Geplande actie-markers (komende 12 maanden)
- Hover-tooltips op markers

**FIRE-vergelijking**
- Basis FIRE-leeftijd vs. aangepaste FIRE-leeftijd
- Impact-totaal: maanden vertraging door levensgebeurtenissen

---

#### 3.4.4 Levensgebeurtenissen

**Beheer**
- Lijst van geplande levensgebeurtenissen met impactberekeningen
- Per gebeurtenis: icoon, naam, doelleeftijd, duur
- Eenmalige kosten, maandelijkse kostenwijziging, inkomenswijziging
- Impactsamenvatting: FIRE-vertraging (maanden), totale kosten, verloren vrijheidsdagen

**Catalogus met voorgedefinieerde gebeurtenissen**
- Pensioen, sabbatical, bruiloft, kind, huisaankoop, autoaankoop, wereldreis, opleiding, carrierewisseling, erfenis, bijbaan, gezondheid, aangepast

**Per gebeurtenis berekend**
- FIRE-vertraging in maanden
- Totale kosten over de looptijd
- Verloren vrijheidsdagen

---

#### 3.4.5 Projectiegrafiek

- Lijngrafiek: nettovermogen over 30 jaar (360 maanden)
- FIRE-doellijn (stippellijn)
- Leeftijdslabels op X-as (indien geboortedatum ingesteld)

**Samenvattingskaarten**
- Opgebouwde vrijheidstijd: jaren en maanden
- Passief inkomen vs. uitgaven: dekkingspercentage

---

### 3.5 Identiteit & Voorkeuren

#### Persoonlijke gegevens
- Volledige naam, geboortedatum, land
- Huishoudtype: solo, samen, gezin

#### De Temporale Balans-slider
Vijf niveaus die bepalen hoe de app adviseert:

| Niveau | Naam | Betekenis |
|--------|------|-----------|
| 1 | De Hedonist | Brand helder nu -- geniet maximaal van het heden |
| 2 | De Voyager | Geniet van de reis -- balans met lichte toekomstfocus |
| 3 | De Architect | Bouw met balans -- gelijk verdeeld heden en toekomst |
| 4 | De Stoic | Discipline is vrijheid -- sterke toekomstfocus |
| 5 | De Essentialist | Pure focus -- maximale optimalisatie |

Live voorbeeldkaart met icoon, naam, tagline en beschrijving.

#### De Chronologieschaal
Visuele tijdlijn met 9 niveaus over 4 fasen:

| Fase | Niveaus | Focus |
|------|---------|-------|
| Herstel | Time Deficit, Time Drag, The Reset | Uit de schulden, stabiliteit vinden |
| Stabiliteit | The Anchor, Time Shield | Buffer opbouwen, vaste lasten dekken |
| Momentum | Velocity, Autonomous | Vermogensgroei, passief inkomen starten |
| Meesterschap | Sovereign, Timeless | Volledige onafhankelijkheid, nalatenschap |

---

### 3.6 AI-chatfunctionaliteit

**Domein-specifieke AI-assistenten**
- Drie avatars (FHIN/FINN/FFIN) met eigen persoonlijkheid en expertise
- Schuifpaneel aan de rechterkant
- Domeinschakelaar om tussen assistenten te wisselen

**Context-aware**
- AI heeft toegang tot volledige financiele context:
  - Profiel en identiteitsgegevens
  - Rekeningen, transacties, assets, schulden, budgetten
  - Doelen, acties, aanbevelingen
  - FIRE-projecties, veerkrachtscore

**Tools beschikbaar voor AI**
- `freedomCalc`: vertaal eurobedragen naar vrijheidsdagen
- `lookup`: bevraag financiele data

**Configureerbaar**
- Anthropic Claude of OpenAI (instelbaar via admin)
- Model-ID per provider
- Optionele systeemprompt-override

---

### 3.7 Admin & testdata

**AI-instellingen**
- Provider selectie (Anthropic/OpenAI)
- Model-ID en API-sleutel beheer
- Systeemprompt override

**Testdata-persona's**
Vijf voorgedefinieerde persona's om de app te testen:

| Persona | Profiel | Nettovermogen |
|---------|---------|---------------|
| Pieter Drifter | Negatief vermogen, hoge uitgaven | Negatief |
| Linda Koers | Gebalanceerd, op koers | Gemiddeld |
| Marco Optimizer | Hoog vermogen, agressief | Hoog |
| Sarah Starter | Starter, laag inkomen | Laag |
| + superadmin persona's | Extra testprofielen | Varierend |

- Streamende seed-operatie met voortgangsbalk
- Samenvattingstabel met ingevoegde records per tabel

---

## 4. Datamodel

### Databasetabellen

| Tabel | Doel |
|-------|------|
| `profiles` | Gebruikersprofiel (naam, geboortedatum, land, huishoudtype, temporale balans) |
| `bank_accounts` | Bankrekeningen (naam, IBAN, bank, type, saldo) |
| `transactions` | Alle transacties (datum, bedrag, omschrijving, tegenpartij, budget, categoriebron) |
| `recurring_transactions` | Terugkerende boekingstemplates (frequentie, startdatum) |
| `budgets` | Budgetdefinities (naam, icoon, limiet, interval, type, ouder, rollover, prioriteit) |
| `budget_amounts` | Periode-specifieke limiet-overrides |
| `budget_rollovers` | Maandelijkse rollover-bedragen |
| `assets` | Bezittingen (7 types met type-specifieke velden) |
| `debts` | Schulden (5 types met type-specifieke velden) |
| `valuations` | Waarderingsgeschiedenis (voor assets en schulden) |
| `net_worth_snapshots` | Handmatige nettovermogen-snapshots |
| `goals` | Financiele doelen (type, doelbedrag, voortgang, koppeling) |
| `recommendations` | AI-gegenereerde aanbevelingen (type, impact, status) |
| `recommendation_feedback` | Gebruikersfeedback op aanbevelingen |
| `actions` | Concrete actiepunten (status, prioriteit, planning) |
| `life_events` | Geplande levensgebeurtenissen (kosten, impact, duur) |
| `admin_settings` | Applicatie-instellingen (AI-configuratie) |

---

## 5. Authenticatie & beveiliging

- Email/wachtwoord authenticatie via Supabase Auth
- Cookie-based sessies met `@supabase/ssr`
- Middleware vernieuwt sessies bij elk verzoek
- Ongeauthenticeerde gebruikers worden doorgestuurd naar `/login`
- Row-Level Security (RLS) op PostgreSQL-niveau
- Publieke paden: landing, login, signup, wachtwoord-reset

---

## 6. Visualisaties overzicht

| Visualisatie | Locatie | Doel |
|-------------|---------|------|
| Domeinkaarten met avatars | Dashboard | Snelle toegang tot drie modules |
| Nettovermogen lijngrafiek | Kern overzicht | 24-maanden vermogensverloop |
| Budget boomweergave | Budgetten | Hierarchische structuur |
| Budget organisme/bubbels | Budgetten | Organische weergave van verhoudingen |
| Budget donut-diagram | Budgetten | Cirkeldiagram verdeling |
| Sankey-diagram | Kas | Geldstroom van inkomsten naar uitgaven |
| Bestedingshistorie staafdiagram | Budgetdetail | 12-maanden per budget |
| Allocatie cirkeldiagram | Bezittingen | Verdeling per assettype |
| Projectiegrafiek (lijngrafiek) | Bezittingen + Horizon | Vermogensgroei 5-30 jaar |
| Schuldafbouw vlakgrafiek | Schulden | Payoff-simulatie over tijd |
| Kanban-bord | De Wil | Acties in Open/Uitgesteld/Voltooid |
| Beslispatronen staafdiagram | De Wil | Impact per aanbevelingstype |
| Logaritmische tijdlijn | De Horizon | Levenslijn met FIRE en events |
| Monte Carlo distributie | Horizon simulaties | Onzekerheidsanalyse |
| Temporale Balans-slider | Identiteit | Persoonlijkheidsselectie |
| Chronologieschaal | Identiteit | Financiele reisniveau |

---

## 7. Import & integraties

| Functie | Details |
|---------|---------|
| CSV-import | Diverse Nederlandse bankformaten |
| OFX-import | Open Financial Exchange standaard |
| MT940-import | SWIFT-formaat voor Europese banken |
| AI-categorisering | Automatische budgettoewijzing bij import |
| WOZ-lookup | Externe API voor Nederlandse vastgoedwaardering |
| AI-chat (streaming) | Anthropic Claude of OpenAI |
| AI-aanbevelingen | Gestructureerde optimalisatiesuggesties |

---

*Document gegenereerd op 12 februari 2026*
*TriFinity -- Geld is opgeslagen tijd.*
