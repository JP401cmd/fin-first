# /toekomst in drie katernen — onderzoek, advies en plan

Datum: 26 september 2026 · Status: **implementatie goedgekeurd door de eigenaar (26 sep, avond); fase 0 uitgevoerd.** Het architectuurbesluit staat in ADR 0179 (`docs/adr/0179-toekomst-in-drie-katernen.md`, met de amendementen die §8 mist: 0170 B7/B11/B12 en B9, en 0144 punt 2 en de plaatupdates per fase i.p.v. in fase 6), de letterlijke tekst in de kopij-toets (`2026-09-26-toekomst-drie-katernen-kopij.md`). Bij verschil met dit document zijn die twee leidend · Route: `/toekomst` (module Horizon)

Eigenaarsbesluiten van 26 sep: (1) drie routes met één gedeeld canvas, (2) Gebeurtenissen en Voorkeuren samen op `/toekomst/instellingen`, (3) het gezondheids- en FIRE-verloop gaat naar de gezondheidskassabon op /overzicht, niet op het hoofdscherm, (4) de vijf lab-weergaven blijven, met harp als standaard op desktop en rad op mobiel, (5) grafiek en doel-knoppen moeten op gangbare schermen samen in beeld staan, (6) het statuspunt van een melding staat op de katern-kop, (7) de vrijheidsleeftijd staat in de kop én als eerste KPI, de duidingszin vervalt, (8) labels Plan · Doelen · Instellingen, (9) canvas op Instellingen compact op desktop en alleen de kop op mobiel, (10) Monte Carlo-consolidatie als aparte kaart buiten deze herindeling, (11) inflatie-koopkracht gelinkt vanuit de inflatie-rij, (12) de visuele basis is de huidige app; de HTML-mockup telt alleen als structuurschets (§4.10), (13) dit document is voorlopig het eindproduct; de fasering in §9 is indicatief. De gepubliceerde mockup loopt achter op besluiten 4 t/m 7 en op de opschoning in §4.9.

## 1. Context

**Het probleem.** De pagina /toekomst doet drie dingen tegelijk: ze toont het resultaat van het hele plan (grafiek, Monte Carlo, in- en uitgavenstroom, oordeel), ze laat een doelscenario plannen (lab-knoppen, stippellijn, doelen) en ze bevat de instellingen richting de toekomst (gebeurtenissen, voorkeuren, wizard). Alles staat in één kaart, met de grafiek als middelpunt en zo'n dertig klikbare elementen erboven. De eigenaar ervaart de pagina als te druk en wil één basisindeling met de grafiek centraal en alle overige elementen opgeschoond in een driedeling.

**Wat dit document is.** Een onderzoeksadvies met een gefaseerd bouwplan. Het inventariseert alle functionaliteit, toetst de driedeling aan externe UX-richtlijnen en aan de eigen ontwerptaal (krant, "geld levert tijd op"), wijst elke functie een plek toe, en adviseert over de subpagina's en over betere ideeën (zoals het verloop van het gezondheidsgetal naar /overzicht). Gebruiksvriendelijkheid staat voorop; de bestaande conventies gelden als randvoorwaarde, niet als doel.

**Beoogd resultaat.** Een gebruiker die /toekomst opent ziet in één blik het oordeel en de grafiek, begrijpt daaronder dat er drie dingen te doen zijn, en vindt elke instelling op precies één plek. De code volgt die indeling, zodat het hoofdcomponent van 11.029 regels uiteenvalt in drie katernen plus één gedeeld canvas.

## 2. Diagnose: wat er nu staat

### 2.1 Opbouw in één oogopslag

Route `/toekomst` rendert, van boven naar beneden (`app/(app)/toekomst/page.tsx` → `components/app/horizon/horizon-client.tsx`):

| # | Blok | Aard | Deel |
|---|---|---|---|
| 1 | Oordeelzin "Je toekomstplan is *haalbaar*" + statuspunten + i | kop | 1 |
| 2 | Deck "Je tijdas met doelen, gebeurtenissen en voorkeuren…" | statische tekst | — |
| 3 | Vier navigatiekaarten (Doelen · Gebeurtenissen · Voorkeuren · Rekenhulp), elk met chevron-drilldown | navigatie | 2/3/gereedschap |
| 4 | Tweede kop "Horizon · jouw vrijheidshorizon" met Tips-knop (standaard aan bij eerste bezoek) | kop | — |
| 5 | Hero-kaart: Details-pill, KPI-strip (4 kassabon-knoppen), ankerdrieslag, duidingszin, voortgangsbalk | resultaat | 1 |
| 6 | Tot zeven meldingen (niet haalbaar, tekort-lening, AOW ontbreekt, eindsituatie, huis nooit verkocht, …) met vijf of meer links | duiding + CTA's naar instellingen | 1 → 3 |
| 7 | Tien pills (Scenario's, Marktcheck, Doellijn, Met/zonder huis, Gebeurtenissen, Doelen, Mijlpalen, Speel af, Pad/Opbouw) + ChartTips | grafiekbediening | 1 (doellijn = 2) |
| 8 | De grafiek: SimChart (Pad) of WealthCompositionChart (Opbouw), zoom, tips-overlay | resultaat | 1 |
| 9 | Uitklap "Inkomen & Uitgaven" met IncomeExpenseChart (standaard dicht) | resultaat | 1 |
| 10 | Events-tijdlijn (slepen schrijft direct naar `life_events`) | invoer op een as | 3 |
| 11 | Fasebalk Opbouw / Overgang / Onttrekking (fase-panes) | resultaat | 1 |
| 12 | **Doelscenario**: lab met vijf knoppen, haalbaarheidsschaal, weergave-switch, marktaannames, opslaan-balk | plannen | 2 |
| 13 | Legenda's Scenario's / Marktcheck (ver onder hun pills), voetnoot, "Stopmoment wijzigen →" | resultaat / instelling | 1 / 3 |
| 14 | Katern III "Wat het betekent": levensinkomen-strook, dekkingsradar, scenario's naast elkaar | resultaat (volgt het doelscenario) | 1/2 |
| 15 | Huishoud-FIRE-sectie (partners) | resultaat | 1 |
| 16 | Gezondheids- en FIRE-verloop (`HorizonTrendGrid`) | heden en verleden | hoort op /overzicht |
| 17 | Geplande acties (komend jaar) | acties | hoort bij Tips & acties |

Subpagina's: `/toekomst/doelen` (scenariodoel + vrije doelen), `/toekomst/gebeurtenissen` (tijdlijn met kernelmomenten, toevoegen via catalogus), `/toekomst/voorkeuren` (plan-regels, levensstrategieën, marktaannames, Box 3), `/toekomst/rekenhulp` + `/bibliotheek` (eigen en publieke rekenhulpen), `/toekomst/inflatie-koopkracht` (zonder enige ingang). De wizard "Je voorkeuren voor je plan instellen" is een pane op /toekomst (`?planreview=open`).

### 2.2 De drukte in cijfers

- Vóór de grafiek staan 25 tot 30 interactieve elementen: i + tot 3 statuspunten, 4 kaarten + 4 chevrons, Tips-knop, Details-pill, 4 KPI-knoppen, CTA "Vul profiel aan", tot 7 meldingen met 5+ links, tot 10 pills + ChartTips.
- Twee koppen boven elkaar (paginakop met oordeel, sectiekop "Horizon · jouw vrijheidshorizon").
- Het doelscenario (deel 2) staat *binnen* de resultaatkaart, tussen de fasebalk en de legenda's; de legenda's staan daardoor ver onder de pills waar ze bij horen.
- De katernnummering springt van I naar III (katern II is sinds ADR 0170 opgegaan in de kaart).
- TTFB op /toekomst is 3,1 s en de mobiele layoutverschuiving komt uit de 2×2-KPI-strip (`docs/superpowers/plans/2026-09-26-ttfb-oorzaak-en-plan.md`).

### 2.3 Structurele oorzaken

1. **God-component.** `horizon-client.tsx` telt 11.029 regels (het aandachtspunt `horizon-god-component` in `lib/architecture/archimate-concerns.ts` noemt nog 8.800, gemeten 8 aug). Alle drie de delen, alle modals en een legacy-formulier van ±2.230 regels zitten in één bestand. Zeventien bron-scan-tests lezen dit bestand letterlijk.
2. **Drie ingangen naar dezelfde instelling.** Eindstrategie/stopmoment, onttrekking en woonstrategie zijn te bewerken via de Strategieën-modal (3 tabs), via /toekomst/voorkeuren én via de wizard, met dezelfde body-componenten (`StopPlanVragen`, `HousingStrategySection`, `REGEL_BODIES`). De tekort-lening-melding linkt zelfs naar twee van die plekken. Een vierde ingang (`WithdrawalModal`) en het legacy-eventformulier zijn onbereikbaar.
3. **Zes plekken voor scenario's en Monte Carlo, met verschillende motoren:** Marktcheck-pill (kernel-worker), `SimulationsModal` (eigen `runMonteCarlo`), Monte Carlo per fase, Scenario's-pill (±2pp) + `ScenariosModal`, `ScenarioKaarten`, Backtesting. De copy zegt "vijf paden", het component "zes scenario's", er zijn zeven preset-id's.
4. **Eén grootheid in drie rollen:** "uitgave na pensioen" is KPI 4 (resultaat, maar de klik opent een instelling), knop 3 in het lab (deel 2) en stap "uitgaven" in de wizard (deel 3).
5. **Client-side herladen.** `loadData()` in horizon-client leest bij elke modal-sluiting ±10 tabellen opnieuw uit de browser; het bestand staat daarom op de grandfather-allowlist van `check:client-reads`. Nieuwe client-bestanden mogen die reads niet erven (ADR 0058).

### 2.4 Wat niet bij de toekomst hoort

- **Gezondheidsverloop en FIRE-verloop** gaan over heden en verleden. De data (`resilienceSnapshots` uit `HorizonPageData`) wordt op /overzicht al geladen in blok 1. De leesquery is vermoedelijk defect: `order(asc).limit(60)` zonder datumvenster op een tabel met één rij per dag geeft de oudste 60 dagen (zie §7.1).
- **Geplande acties** zijn Wil-acties; hun huis is `/overzicht/tips`.
- **Rekenhulp, bibliotheek en inflatie-koopkracht** zijn gereedschap en educatie, geen onderdeel van het plan.

### 2.5 Dode en losse delen (opruimen kan altijd)

- `WithdrawalModal` en het Event Form Modal (`?modal=withdrawal`, `?modal=life_events`) hebben geen trigger op de pagina.
- `HorizonPage embedded=false` (eigen h1 en i-knop) is dood; de h1 staat daardoor onnodig op de RESIDUE-lijst van `check:headings`.
- `/toekomst/inflatie-koopkracht` heeft geen enkele ingang. De widget `surplus_gap` linkt naar `/toekomst#vermogensstromen`, een anker dat niet bestaat. Een natuurlijke mijlpaal linkt naar `/core/debts` en `/core/assets` (legacy). De bibliotheek linkt terug via `/toekomst?tab=rekenhulp` (extra redirect).
- `?strategie=open` (StrategieModal op /toekomst) en `?strategie=aow` (editor op /voorkeuren) zijn dezelfde key met twee betekenissen; `horizonSetup` in `lib/navigation.ts` is dood.
- Mobiele bottom-tabs (`bottom-nav-tabs.tsx`) zijn dode code; `/toekomst` vraagt nog `bottomBar: tabs` aan zonder effect.
- PAGE_INFO loopt achter op vier punten (groen/oranje-fasen, slepen op /gebeurtenissen, bibliotheek als "bewaarde scenario's", Gebeurtenissen-tab).

## 3. Onderzoek: richtlijnen en markt

Extern onderzoek (26 sep 2026), samengevat op wat het voor /toekomst betekent. Bronnen zijn gelezen tenzij gemarkeerd.

### 3.1 Richtlijnen die de indeling dragen

| # | Richtlijn | Bron | Betekenis voor /toekomst |
|---|---|---|---|
| 1 | Overzicht eerst, dan inzoomen en filteren, details op verzoek; elke aanpassing direct zichtbaar | Shneiderman 1996 (cs.umd.edu/~ben/papers/Shneiderman1996eyes.pdf); dynamic queries (hcil 91-11) | Oordeel + grafiek = overzicht; modus en lagen = inzoomen; kassabon en aannames = details; een planwijziging verandert de lijn meteen |
| 2 | Toon vooraf alleen wat vaak nodig is, maximaal twee niveaus diep; wat bovenaan staat lijkt belangrijk | NN/g progressive disclosure; NN/g "defer secondary content for mobile" | Geen tien pills en zeven meldingen boven de vouw; lagen achter één knop; verdieping één niveau dieper |
| 3 | De kern past in één scherm; de rest is een "gateway"; 57% van de kijktijd zit boven de vouw, 74% in de eerste twee schermen | Stephen Few, *Common Pitfalls* valkuil 1; NN/g scrolling & attention | Oordeel en grafiek samen in het eerste telefoonscherm; de driedeling begint direct daaronder |
| 4 | Geef een maat altijd context: doel, historie en een snel kwalitatief signaal (goed/matig/slecht) | Few valkuil 2 | Onderbouwt het stoplicht, de doel-stippellijn en een verloop op /overzicht |
| 5 | Tabs zijn voor wisselende weergaven van dezelfde inhoud, niet als gebruikers meerdere tabs tegelijk nodig hebben; op mobiel werken ingeklapte secties beter dan tabs; content achter horizontale tabs en subpagina's wordt gemist | NN/g tabs-used-right, accordions-on-desktop, mobile-accordions; Baymard "avoid horizontal tabs", "avoid using subpages" | **Spanning met een route-indeling.** Oplossing in §4.1: het canvas blijft op alle drie de routes staan, de katern-koppen staan altijd zichtbaar onder de grafiek mét samenvatting, en dezelfde componenten kunnen gestapeld worden als testen uitwijst dat mensen katernen missen |
| 6 | Een segmented control is voor nauw verwante weergaven van hetzelfde object (zelfstandige naamwoorden, ≤5, geen acties); voor aparte onderdelen gebruik je navigatie | Apple HIG segmented controls; Material 3 segmented buttons | De modus-switch (Vermogen · Samenstelling · Geldstroom) is een segmented control; **de katernen zijn géén segmenten** maar drie katern-koppen met samenvatting |
| 7 | Aannames horen op het scherm dat ze beïnvloeden, niet in de algemene instellingen; een samenvattingsregel met Wijzig-link per regel; na wijzigen keer je terug op dezelfde plek | Apple HIG settings; Android settings-patterns; GOV.UK summary list & check-answers; NN/g calculators ("tuning a guitar") | De aannamesregel onder het canvas; katern Instellingen als lijst met ✎ per regel; profiel/notificaties blijven op /mijn |
| 8 | Bewerken in een paneel dat de context zichtbaar laat; één sheet tegelijk, nooit stapelen; modals ongeschikt voor beslissingen die extra informatie vragen | Apple HIG sheets (medium detent); NN/g bottom sheet, modal/nonmodal; Material side sheet ("not for narrow screens") | Desktop: slide-in pane naast de grafiek (bestaat). Mobiel: stack-push verbergt de grafiek, dus elke editor toont een **verschilregel** ("Vrij op 52,3 → 51,8") uit dezelfde override-run als de wizard |
| 9 | Een waaier communiceert verwachting én onzekerheid het best; Nederlandse gebruikers kennen de drie bedragen "als het tegenzit · verwacht · als het meezit" | Bank of England working paper 2026; mijnpensioenoverzicht (ABP-uitleg) | Marktcheck-band blijft; eronder drie getallen in plaats van percentielen |
| 10 | Doelen als dunne laag plus een lijst; weinig markeringen; op mobiel labels onder de grafiek; tikdoelen ≥ 1 cm | Wealthfront (stippellijn), ProjectionLab (iconen boven het plotvlak), Datawrapper annotaties, NN/g touch targets | Eén doel-stippellijn; markers zonder label op mobiel; de lijst in katern Doelen draagt de namen |
| 11 | Een wizard is voor instap of herijking, niet de enige bewerkroute; daarna een overzichtslijst | NN/g wizards; GOV.UK one-thing-per-page + check-answers; ProjectionLab (wizard, daarna inline onder de grafiek) | Wizard blijft als begeleide ingang bovenaan katern Instellingen, met "Opnieuw doorlopen"; de rijen zijn de dagelijkse route |
| 12 | Een score: het verschil bij het oordeel, de historie één laag dieper of als optionele laag | Credit Karma, Experian, ProjectionLab Progress, Boldin Planner Score | Op /overzicht: "sinds vorige maand +3" op de gezondheidskaart, het verloop in de kassabon die bij een klik opent (§7.1) |
| 13 | Pin op mobiel niet de hele grafiek; geen scroll-effecten; hooguit een compacte balk die terugkomt bij omhoog scrollen | NN/g sticky headers, scrolljacking-101; The Pudding responsive scrollytelling | Alleen de katern-koppen kleven op mobiel; de grafiek scrolt gewoon mee |

### 3.2 Wat vergelijkbare producten doen

Gelezen: ProjectionLab, Boldin, Monarch (Forecasting, apr 2026), Empower, Betterment, Wealthfront Path, Copilot, YNAB, Fidelity PGC (2017), Rabo Financieel Plan, Brand New Day, Knab (2012), Semmie/Dexxi, Meesman, mijnpensioenoverzicht. Niet inzichtbaar: ING, ABN AMRO, Vanguard (fouten of adviestraject).

Vijf gemene delers:
1. **Aannames staan nooit tussen de resultaten en nooit in de accountinstellingen**: zijbalk (Monarch "Assumptions Sidebar"), planinvoer onder de grafiek (ProjectionLab), invoer met Optimistic/Average/Pessimistic (Boldin), instellingentab per doel (Betterment).
2. **Doelen staan dubbel**: compact op of boven de grafiek (iconen, stippellijn, tijdlijn) én als lijst met status (ProjectionLab, Monarch, Wealthfront, Rabo).
3. **Vast scenario en kans worden gescheiden**: aparte tab (ProjectionLab Plan vs Chance of Success), schakelaar (Boldin), drie zekerheidsniveaus (Fidelity).
4. **Vergelijken gebeurt als overlay op één grafiek**: What-If als stippellijn over het origineel (ProjectionLab), twee scenario's op één grafiek (Monarch).
5. **De rijkste planners zijn web-first**; wie mobiel-first werkt vereenvoudigt tot één scherm per doel met status (Wealthfront, Betterment, Semmie, Rabo). Monarch Forecasting is alleen op web.

### 3.3 Drie anti-patronen

1. **De dashboardmuur**: grafiek, stroomgrafiek, KPI-tegels, lijsten en wizardkaart even prominent op één lange pagina (Few valkuil 10; NN/g "nobody will read anything"). Dit is de huidige pagina.
2. **Verstoppertje**: plan en instellingen achter horizontale tabs of subpagina's zonder zichtbare ingang, of grafiekaannames in het algemene instellingenmenu (Baymard; Apple).
3. **Gepinde grafiek, gestapelde sheets en scroll-effecten op mobiel** (NN/g; Apple "one sheet at a time").

### 3.4 Wat het onderzoek aan het ontwerp veranderde

- De katern-schakelaar is geen segmented control maar **drie katern-koppen met samenvatting**, altijd zichtbaar onder het canvas (§4.2 regel 4).
- Elke editor krijgt een **verschilregel** uit de override-run (§4.2 regel 8).
- Onder de Marktcheck-band komen **drie getallen** (tegenzit · verwacht · meezit) in plaats van percentielen (§7.6).
- De **gestapelde variant** (drie secties op één route) is als terugvaloptie beschreven, met dezelfde componenten (§4.1).

## 4. Advies: de basisindeling

### 4.1 Drie benaderingen, één aanbeveling

| | A. Drie tabs boven de grafiek (of drie losse pagina's) | B. Eén pagina, katernen via `?katern=` | **C. Gedeeld canvas + drie route-katernen (aanbevolen)** |
|---|---|---|---|
| Idee | Resultaat · Doelen · Instellingen als tabbladen; de grafiek hoort bij het tabblad | Alles op `/toekomst`, een client-side schakelaar wisselt het paneel onder de grafiek | Eén layout houdt kop, meldingenslot, canvas en schakelaar; drie routes leveren het paneel eronder |
| Voor | Bekend patroon, weinig verbouwing | Grafiek altijd aanwezig, één bundel | Grafiek blijft gemonteerd bij het wisselen (Next.js-layout), lab-knop verandert de lijn live, elke katern heeft een URL, TopBar-titel en terugknop; Rekenhulp valt buiten de route-groep en laadt de zware bundel niet |
| Tegen | Tabs zijn bedoeld voor wisselende weergaven van dezelfde inhoud, niet voor drie taken; op Instellingen verlies je de grafiek als feedback, op Doelen moet je 'm dupliceren | Geen eigen URL per katern; de eigenaar koos in juni bewust voor echte routes; het god-component blijft één bundel | Meer verbouwing: route-groep, state-provider, decompositie van het hoofdcomponent |

Keuze: **C**. De grafiek is het gedeelde canvas waar alle drie de taken op uitkomen; wat wisselt is wat je eronder doet. Dat is het ontwerpprincipe *overzicht eerst, dan inzoomen, details op verzoek*: de grafiek plus het oordeel zijn het overzicht, de katern is het inzoomen, de kassabons en panes zijn de details.

**De spanning met het onderzoek, en hoe die is opgelost.** Baymard en NN/g waarschuwen dat content achter tabs en subpagina's wordt gemist (§3.1 regel 5). Drie dingen vangen dat op: (1) het canvas blijft op alle drie de routes staan, dus geen katern verbergt de grafiek; (2) de drie katern-koppen staan altijd direct onder het canvas, mét samenvatting ("Doelen · 2 doelen, 1 op koers"), zodat de inhoud zichtbaar is vóór je klikt; (3) de aannamesregel linkt vanuit Plan rechtstreeks naar Instellingen. Mocht een gebruikerstest alsnog uitwijzen dat mensen katernen missen, dan is er een **variant C′**: dezelfde drie katern-componenten gestapeld op één route (desktop open, mobiel ingeklapt met klevende koppen). De decompositie is identiek; alleen de dunne presentatielaag (routes of secties) verschilt. C′ is dus een terugvaloptie zonder herbouw, niet een tweede ontwerp.

### 4.2 De regels van de indeling

1. **Kop = oordeelzin + ankerregel + i.** "Je toekomstplan is *haalbaar*." met eronder één ankerregel die elk getal maar één keer zegt: onder een gesolved anker "Vrij op 52,3.", onder een vast anker "Stoppen op 60 · voor 96% gedekt." (de drieslag staat in het Plan-paneel). Geen kicker: de zin draagt het onderwerp al. De ankerregel is tekst; de kassabon achter het getal zit onder de eerste KPI in het Plan-paneel (eigenaarsbesluit 26 sep: kop én eerste KPI, de duidingszin vervalt). **Meldingen staan niet onder de kop** maar bovenaan het katern waar ze over gaan, en hun statuspunt staat op de katern-kop van dat katern (§4.8). De paginakop houdt alleen de i.
2. **Canvas = één grafiek, drie modi, één Lagen-knop.** Modi: Vermogen · Samenstelling · Geldstroom (de in- en uitgavenstroom wordt volwaardig). Lagen (alleen in Vermogen): Gebeurtenissen, Mijlpalen, Doelen, Marktcheck, Scenario's ±2pp, Met je huis, Speel af. Uitleg per laag zit in het Lagen-menu; "Zo werkt je grafiek" achter de i.
3. **Aannamesregel onder het canvas, alleen in Plan**: waar de grafiek op rust, met één link naar Instellingen. In Doelen staat op die plek de uitkomstregel van het doelscenario; in Instellingen ben je er al.
4. **Drie katern-koppen onder het canvas**: Plan · Doelen · Instellingen als navigatie naar drie routes. De **inactieve** koppen dragen een samenvattingsregel; de actieve niet, want zijn inhoud staat eronder. Een katern met een open of geminimaliseerde melding draagt op zijn kop het statuspunt in de kleur van de ernst. Bewust géén segmented control (dat is de modus-switch boven de grafiek; twee gelijke controls zouden verwarren): kicker-stijl met bovenstreep (patroon `CategoryTabs`, `pattern="tabs"`, één nieuwe primitive in `components/editorial/`). Op mobiel tonen ze alleen het label plus eventueel het statuspunt, geen badge en geen samenvatting, en kleven ze bovenaan zodra de grafiek uit beeld scrolt.
5. **Eén taak per katern.** Plan toont en duidt; Doelen verkent en legt vast; Instellingen voedt het plan. Een instelling wordt op precies één plek bewerkt; KPI's en meldingen linken daarnaartoe.
6. **Verdieping lazy en op mobiel ingeklapt**, zichtbaarheidsgates (radar, presets) verhuizen mee.
7. **Boven de grafiek van ±28 naar ≤5 interactieve elementen**: de i, de modus-switch, Lagen en zoom; de katern-koppen staan eronder.
8. **Elke editor toont het effect.** Op desktop blijft de grafiek naast de slide-in pane zichtbaar; op mobiel is een pane een stack-push en verdwijnt de grafiek. Daarom draagt elke editor een **verschilregel** ("Vrij op 52,3 → 51,8 · gedekt blijft") uit dezelfde override-run die de wizard al gebruikt (`runRegelProjection` + `RegelSimOverride`), nooit een eigen som. Eén sheet tegelijk; een gebeurtenis bewerken vervangt de inhoud, opent geen tweede sheet.

9. **Grafiek en doel-knoppen op één scherm (harde eis, eigenaar 26 sep).** Een wijziging aan een knop in Doelen moet zichtbaar zijn zonder te scrollen. Desktop (≥ lg): de canvas-rij wordt in Doelen twee kolommen, links de grafiek, rechts de **harp** met de vijf knoppen, de uitkomstregel erboven en de opslaan-balk eronder; kop plus canvas-rij ≤ 480 px, zodat op 1280×720 grafiek en harp samen in beeld staan. Mobiel (< lg): grafiek `clamp(170px, 30vh, 230px)` hoog, geen aannamesregel, legenda hoogstens één regel, en direct onder de klevende katern-koppen het **rad**; de opslaan-balk is de action-bar van de shell. Doel: grafiek, rad en action-bar binnen 640 px onder de TopBar, op 360×800 én 390×844. **Alle vijf lab-weergaven blijven** (balk, wijzer, rad, harp, vijfhoek); de standaard is harp op desktop en rad op mobiel, en de keuze wordt per breakpoint onthouden (`knopWeergave` krijgt twee sleutels, desktop en mobiel; geen migratie zolang de pref JSONB is, te verifiëren).
10. **Elk getal en elke actie één keer per scherm.** Wat de kop zegt, zegt het paneel niet nog eens; wat het lab zegt, zegt de doelenlijst niet nog eens; één ingang per actie. De opschoonlijst staat in §4.9.

> De gepubliceerde mockup (26 sep, versie 1) loopt op drie punten achter op deze regels: balkweergave in het lab, statuspunten in de paginakop, en de aannamesregel en duidingszin op alle katernen. Deze tekst is leidend; de mockup wordt pas bijgewerkt na het beraad.

### 4.3 Wireframes desktop (≥ lg)

**Katern Plan — `/toekomst` (standaard)**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                        (i)  │  ← alleen de i; statuspunten staan op de katern-koppen
│  Je toekomstplan is haalbaar.                                                │
│  Vrij op 52,3.                                                               │  ← ankerregel (tekst; de kassabon zit onder KPI 1)
├──────────────────────────────────────────────────────────────────────────────┤
│  Vermogen │ Samenstelling │ Geldstroom                Lagen ▾   ⊕ ⊖ ↺   (i)  │  ← canvas-kop
│                                                                              │
│           ╭─╮                                                                │
│         ╱     ╲╲╲            ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ marktcheck p25–p75 (laag)     │
│       ╱          ╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲                                           │
│     ╱                        ╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲                                 │
│   ╱   ● kind 2028      ● huis 2041      ● AOW 67       ╲╲╲╲╲╲╲╲╲╲╲╲          │
│  ╱───────────────────────────────────────────────────────────────────────    │
│  35        45        55        65        75        85        90              │
│                                                                              │
│  Op basis van: zo vroeg mogelijk stoppen · tot je 90e · 2,0% inflatie ·      │
│  3 gebeurtenissen                                              Aanpassen →   │  ← aannamesregel (alleen in Plan)
├──────────────────────────────────────────────────────────────────────────────┤
│  ━━━━━━━━━━━━━━━━━━━━━━━━━                                                   │
│  PLAN ▲                   DOELEN ▪                  INSTELLINGEN ▲           │  ← katern-koppen (routes); punt = melding
│                           stoppen op 58 · gedekt    nog 2 stappen · AOW mist │     samenvatting alleen bij inactieve koppen
├──────────────────────────────────────────────────────────────────────────────┤
│  ▲ Je plan leent in 2049 kort om een tekort te dekken.  Instelling bekijken → ─│  ← melding van dít katern
│                                                                              │
│  I · WAAR JE STAAT                                                           │
│  ┌───────────────┬───────────────┬───────────────┬───────────────┐           │
│  │ Vrijheids-    │ Doelbedrag    │ Onttrekking   │ Na pensioen   │           │  ← vier cellen; KPI 1 draagt
│  │ leeftijd      │               │               │               │           │     de kassabon van het getal
│  │ 52,3          │ € 812.000     │ 3,4 %         │ € 3.150 /mnd  │           │     uit de kop
│  │ ↳ kassabon    │ ↳ kassabon    │ ↳ kassabon    │ ↳ instelling  │           │
│  └───────────────┴───────────────┴───────────────┴───────────────┘           │
│  ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░ 61% van je doelbedrag                                  │  ← voortgangsbalk; de duidingszin vervalt
│                                                                              │
│  OPBOUW ─────────────────── OVERGANG ───── ONTTREKKING ──────────────        │  ← fasebalk, klik = fase-pane
│                                                                              │
│  II · WAT HET BETEKENT                                                       │
│  ┌── Levensinkomen per leeftijd ──┐  ┌── Dekkingsradar ──┐  ┌── Huishouden ─┐│
│  │ ▁▂▃▅▆▇█████▇▆▅                 │  │      ╱╲            │  │ jij · partner ││
│  └────────────────────────────────┘  └────────────────────┘  └───────────────┘│
│                                                                              │
│  Jaar-op-jaar tabel →                                                        │  ← "Zo werkt je grafiek" heeft één ingang: de canvas-i
│                                                                              │
│                          Trifinity ✦ Toekomst ✦ 26 september 2026            │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Katern Doelen — `/toekomst/doelen`** (zelfde kop; de canvas-rij wordt twee kolommen, grafiek links en harp rechts, zodat een knop en zijn effect samen in beeld staan)

```
├──────────────────────────────────────────────┬───────────────────────────────┤
│  Vermogen │ Samenstelling │ Geldstroom Lagen▾│  JE DOELSCENARIO              │
│                                              │  stoppen op 58 · gedekt       │  ← uitkomstregel (één keer)
│        ╭─╮        ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄     │                               │
│      ╱     ╲╲╲  ░░░░░░░░░░░░░░░░░░░░░╲╲╲     │   ┃    ┃    ┃    ┃    ┃      │  ← harp: vijf snaren,
│    ╱   ░░░░░░░░░░░░░░ verschilvlak ░░░░░╲╲   │   ┃    ●    ┃    ┃    ┃      │     één greep per knop
│  ╱   ● kind    ● huis     ● AOW          ╲◉  │   ●    ┃    ┃    ┃    ●      │
│ ╱────────────────────────────────────────    │   ┃    ┃    ●    ┃    ┃      │
│ 35     45     55     65     75     85    90  │   ┃    ┃    ┃    ●    ┃      │
│ ─ plan   ┄ doelscenario                      │  +250 −100 3000   0   58     │  ← waarde onder elke snaar
│                                              │  meer  minder na    nala- stop│
│                                              │  verd. uitg.  pens. tensch.   │
│                                              │  ▮▮▮▮▮▮▯▯▯ haalbaarheid       │  ← driekleurige schaal
│                                              │  [ Doel vastleggen ]          │  ← opslaan-balk
│                                              │  [ Maak 58 mijn stopmoment ]  │
│                                              │  Herstel · weergave ▾         │  ← balk · wijzer · rad · harp · vijfhoek
├──────────────────────────────────────────────┴───────────────────────────────┤
│  PLAN                     DOELEN ▪                  INSTELLINGEN ▲           │
│  vrij op 52,3             ━━━━━━━━━━━━━━━━━━━━━━━━━ nog 2 stappen · AOW mist │
├──────────────────────────────────────────────────────────────────────────────┤
│  ▪ Je doelscenario loopt achter op je plan.                    Bijwerken → ─ │  ← melding van dít katern
│                                                                              │
│  II · JE DOELEN                                                              │
│  ● Scenariodoel · stoppen op 58                                          ✎   │  ← uitkomst en acties staan al in het lab en de melding
│  ○ Noodbuffer € 15.000 ················ 72 % · op koers                      │
│  ○ Hypotheek extra aflossen € 20.000 ·· 35 % · aandacht                      │
│  + Doel toevoegen                                             Behaald (3) ▸  │
│                                                                              │
│  III · ANDERE PADEN NAAST JE DOELSCENARIO                                    │
│  [ Meer sparen ]  [ Later stoppen ]  [ Huis verkopen ]  [ Minder rendement ] │  ← scenario-kaarten, lazy
```

**Katern Instellingen — `/toekomst/instellingen`** (canvas compact: alleen de hoofdlijn plus het effect; gebeurtenis-markers benadrukt)

```
├──────────────────────────────────────────────────────────────────────────────┤
│  Vermogen │ Samenstelling │ Geldstroom                              ⤢ vergroot│
│  ╭─╮╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲╲ │
│  (alleen de lijn; het getal staat al in de kop erboven)                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                     ━━━━━━━━━━━━━━━━━━━━━━━  │
│  PLAN                     DOELEN ▪                  INSTELLINGEN ▲           │
│  vrij op 52,3             stoppen op 58 · gedekt                             │
├──────────────────────────────────────────────────────────────────────────────┤
│  ▲ Je AOW-leeftijd ontbreekt nog.                              Toevoegen → ─ │  ← melding van dít katern
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ ✓ Loop je voorkeuren door · 4 van 6 stappen                Verder →   │  │  ← wizard-ingang (pane)
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  I · JE PLAN                                                                 │
│  Stopmoment ································ zo vroeg mogelijk          ✎   │  ← zonder het getal: dat staat in de kop
│  Tot welke leeftijd, en wat blijft over ···· 90 · niets                  ✎   │
│  Onttrekking ······························· vast bedrag · 3,4 %         ✎   │
│  Uitgave na pensioen ······················· € 3.150 /mnd (80 %)         ✎   │
│  Geen tekort-lening ························ aan                         ✎   │
│                                                                              │
│  II · GEBEURTENISSEN                                          + Toevoegen    │
│  2028   Kind ······························· − € 600 /mnd · tot 2046     ✎   │
│  2041   Huis verkopen ······················ + € 320.000                 ✎   │
│  2043   AOW ································ + € 1.450 /mnd              ✎   │
│  ○ 2049 Pensioenpot leeg · volgt uit je plan                                 │  ← kernelmoment, niet bewerkbaar
│                                                                              │
│  III · LEVENSSTRATEGIEËN                                                     │
│  AOW · Pensioen · Werk · Eigen woning                                    ✎   │
│                                                                              │
│  IV · MARKTAANNAMES  (alleen Volledig)                                       │
│  Inflatie 2,0 % · Rendement 5,0 % · Box 3 werkelijk rendement            ✎   │
│  ↳ Wat doet inflatie met je plan?                                            │
```

Elke ✎ opent dezelfde body als de wizard gebruikt (`ShellOverlay kind="pane"` of `"sheet"`, zoals nu op /toekomst/voorkeuren). Het canvas toont het effect van een opgeslagen wijziging direct.

### 4.4 Wireframes mobiel (< lg)

```
 Katern Plan                         Katern Doelen
┌───────────────────────────┐      ┌───────────────────────────┐
│ ‹  Toekomst               │      │ ‹  Doelen                 │  ← TopBar (shell): alleen de naam
├───────────────────────────┤      ├───────────────────────────┤
│ Je toekomstplan is   (i)  │      │ Je toekomstplan is   (i)  │  ← kop met alleen de i
│ haalbaar.                 │      │ haalbaar.                 │
│ Vrij op 52,3.             │      │ Vrij op 52,3.             │  ← ankerregel, klikbaar
├───────────────────────────┤      ├───────────────────────────┤
│ Vermogen ▾        Lagen ▾ │      │ Vermogen ▾        Lagen ▾ │
│    ╭╮                     │      │   ╭╮ ┄┄┄┄┄┄┄┄┄┄┄┄┄       │  ← grafiek 170–230 px hoog
│   ╱  ╲╲╲╲                 │      │  ╱  ╲░░░░░░░░░░░░╲       │
│  ╱  ●    ╲╲╲╲╲            │      │ ╱  ●    ╲╲╲╲╲╲╲╲╲ ◉      │
│ ╱────────────────────     │      │ 35   50   65   80   90    │
│ 35   50   65   80   90    │      ├───────────────────────────┤
│ Op basis van: zo vroeg    │      │ PLAN   DOELEN▪  INSTELL.▲ │  ← kleeft; punt = melding
│ mogelijk stoppen · tot je │      ├───────────────────────────┤
│ 90e · 3 gebeurt. Aanpassen│      │ ▪ Scenario loopt achter → │  ← melding: één regel
├───────────────────────────┤      │ stoppen op 58 · gedekt    │  ← uitkomstregel
│ PLAN▲  DOELEN▪  INSTELL.▲ │      │        ╭───────╮          │
├───────────────────────────┤      │     ╭──╯ stop ╰──╮       │  ← rad: één knop tegelijk;
│ ▲ Plan leent kort in 2049→│      │    │    58    ●   │      │     draaien = waarde,
│ I · WAAR JE STAAT         │      │     ╰──╮  ●  ╭──╯       │     tik op segment =
│ ┌───────────┬───────────┐ │      │        ╰───────╯          │     volgende knop
│ │Vrijheids- │Doelbedrag │ │      │ ◀ minder uitgeven ▶       │
│ │leeftijd   │           │ │      │ ▮▮▮▮▮▮▮▮▯ haalbaarheid    │
│ │52,3       │€ 812.000  │ │      ├───────────────────────────┤
│ ├───────────┼───────────┤ │      │ [ Herstel ][Doel vastleg.]│  ← action-bar (shell)
│ │Onttrekking│Na pensioen│ │      └───────────────────────────┘
│ │3,4 %      │€ 3.150/mnd│ │
│ └───────────┴───────────┘ │
│ ▓▓▓▓▓▓░░░░ 61% doelbedrag │
│ OPBOUW ── OVERG ── ONTTR  │
│ ▸ Wat het betekent        │  ← verdieping ingeklapt
└───────────────────────────┘
```

Begroting mobiel Doelen (390×844, Safari): TopBar 48 + kop 90 + canvas-kop 36 + grafiek 200 + legenda 18 + katern-koppen 40 + melding 32 + uitkomstregel 24 + rad 210 + action-bar 56 ≈ 754 px, binnen de ±760 px die overblijven. Op 360×800 krimpt de grafiek naar 170 px en start de melding geminimaliseerd (punt op de kop), zodat het rad in beeld blijft.

Op mobiel toont katern Instellingen geen grafiek; het effect van een wijziging staat in de kop ("Vrij op 52,3.") en verandert mee na opslaan. De katern-koppen tonen op mobiel alleen het label, plus het statuspunt van een katern met een melding; geen badges en geen samenvattingsregel. Een melding is op mobiel één regel (titel en actie); de uitleg komt na een tik. In Doelen is de aannamesregel weg en staat het rad direct onder de koppen, zodat grafiek, rad en action-bar samen in beeld staan.

**Het Lagen-menu** (`ShellOverlay kind="sheet"` op mobiel, popover op desktop):

```
LAGEN OP DE GRAFIEK
☑ Gebeurtenissen        ☑ Natuurlijke mijlpalen     ☐ Doelen
☐ Doelscenario-lijn     ☐ Marktcheck                ☐ Scenario's ±2pp
☐ Met je huis           ☐ Speel af
De marktcheck toont de band waar driekwart van de doorgerekende markten binnen valt.
```

In Eenvoudig toont het menu Gebeurtenissen, Mijlpalen, Doelen en de doelscenario-lijn. De uitleg per laag staat in het menu zelf; "Zo werkt je grafiek" heeft één ingang, de canvas-i, en staat dus niet ook hier.

### 4.5 Wat het canvas per katern doet

De modi (Vermogen · Samenstelling · Geldstroom) en de lagen zijn **geen onderdeel van de driedeling**. Het zijn weergaven van hetzelfde resultaat en horen bij het canvas dat de drie katernen delen; de modus-switch staat dus op Plan én op Doelen. Wat per katern verschilt is de standaardstand en wat vast aan staat. Een keuze die de gebruiker zelf maakt (modus, lagen) blijft staan bij het wisselen van katern; alleen de vaste lagen van een katern komen erbij en verdwijnen weer bij het verlaten.

| | Plan | Doelen | Instellingen |
|---|---|---|---|
| Modi | alle drie, standaard Vermogen; keuze onthouden | alle drie, standaard Vermogen; in Samenstelling en Geldstroom tonen de balken het **doelscenario** zodra dat van het plan afwijkt (label "je doelscenario"), anders het plan | alleen Vermogen, compact (desktop); op mobiel één effectregel |
| Hoofdlijn (plan) | ja | ja, als referentie in gedempte inkt | ja |
| Vaste lagen | geen | doelscenario (stippellijn + verschilvlak) en doelmarkers | gebeurtenis-markers |
| Lagen-knop | ja, vrije keuze; standaard Gebeurtenissen en Mijlpalen aan | ja; de vaste lagen staan als "vast" in het menu | geen |
| Marktcheck / Scenario's ±2pp | naar keuze; drie getallen onder de band | standaard uit; de vergelijking plan ↔ doelscenario is hier het verhaal | uit |
| Speel af | in Vermogen | in Vermogen | uit |
| Sub-toggle Geldstroom (Lijnen / Bronnen) | in de canvas-kop zodra Geldstroom actief is | idem | n.v.t. |
| Legenda | onder het canvas, alleen actieve lagen | idem, plus "plan / doelscenario" | geen |
| Aannamesregel | ja, met Aanpassen → | nee; hier staat de uitkomstregel van het doelscenario | nee (je bent er) |
| Fasebalk | in het paneel Plan | nee | nee |
| Lab-weergave (balk · wijzer · rad · harp · vijfhoek, alle vijf kiesbaar) | — | standaard **harp** op desktop (rechterkolom naast de grafiek), **rad** op mobiel (onder de koppen); keuze per breekpunt onthouden | — |

**De stippellijn bestaat al; het plan verplaatst hem.** De doelscenario-lijn is een bestaande overlay (`scenarioLineOverlay`, horizon-client `:3645`) met punten uit een volledige kernel-run: `selectDoelLijnBron` kiest het geforceerde stop-pad of de gesolvede scenario-run (ADR 0085, ADR 0170 B9), en bij een actief scenario voeden diezelfde rijen nu al de levensinkomen-strook en de dekkingsradar (`:2992-2995`), terwijl KPI-strip, fasebalk en hero op het plan blijven. In katern Doelen wordt die lijn een vaste laag, in Plan een keuze in het Lagen-menu. Geen nieuwe run, geen nieuwe motor.

**Het enige controlepunt.** Geldstroom leest uit `displayUnifiedRows` + `displaySimRows` (het plan, `:3612-3615`) en Samenstelling uit de grootboekrijen van het plan. Om die twee modi in Doelen het doelscenario te laten tonen, moet de bestaande scenario-run ook de grootboekrijen (vermogenssamenstelling per categorie, in- en uitgaven per jaar) opleveren die deze grafieken lezen, of moeten de grafieken de `SimRow`-velden van `doelLijnBron.rows` kunnen gebruiken. Dat is een adapter-vraag, geen rekenvraag; verifieer in fase 1. Tot die tijd tonen die twee modi in Doelen het plan met de regel "Samenstelling en Geldstroom volgen je plan; je doelscenario zie je in Vermogen". Nooit een eigen samenstelling afleiden buiten de kernel.

### 4.6 Wat het oplevert

- Eén blik: oordeel, ankergetal, grafiek. Daarna één keuze uit drie.
- Elke instelling op één plek; drie modals en een legacy-formulier verdwijnen.
- De code volgt de indeling: `components/toekomst/canvas/*`, `resultaat/*`, `doelscenario/*`, `instellingen/*` plus één state-provider, in plaats van één bestand van 11.029 regels.
- Prestatie: de KPI-strip verlaat de plek boven de vouw (de bron van de mobiele layoutverschuiving), de zware katernen laden alleen op hun route, Rekenhulp laadt de bundel niet meer.

### 4.7 Eenvoudig en Volledig per onderdeel

Uitgangspunt uit de eenvoudige-weergave-audit (aug 2026): *Eenvoudig snijdt de diepte, niet de drukte*. De herindeling haalt de drukte weg voor iedereen; Eenvoudig haalt daarbovenop de diepte weg. De schakelaar blijft waar hij staat (⌘K en /mijn/uiterlijk), nooit per sectie (ADR 0026). Techniek: `HideInSimple` voor diepte-blokken, `DepthSection` voor bedieningsvlakken, `FiguresStrip` toont in Eenvoudig hoogstens twee cellen en de call-site kiest welke. De toedeling hieronder volgt de huidige `HideInSimple`-stand waar die bestaat; ★ markeert een nieuwe keuze.

| Onderdeel | Eenvoudig | Volledig |
|---|---|---|
| **Kop**: oordeelzin, ankerregel, meldingenslot, statuspunten, i | ja | ja |
| **Katern-koppen** met samenvatting | ja | ja |
| **Canvas · modi** Vermogen · Samenstelling · Geldstroom | alle drie (weergave, geen diepte; Opbouw en Inkomen & Uitgaven zijn nu ook in Eenvoudig) | alle drie |
| Canvas · sub-toggle Geldstroom Lijnen / Bronnen | alleen Lijnen ★ | beide |
| Canvas · lagen | Gebeurtenissen, Mijlpalen, Doelen (menu met drie regels) | + Marktcheck, Scenario's ±2pp, Met je huis, Speel af |
| Canvas · drie getallen onder de Marktcheck-band | nee (laag bestaat niet) | ja |
| Canvas · `LifelineReadout` | nee | ja (desktop) |
| Canvas · zoom, tips-i, "Zo werkt je grafiek" | ja | ja |
| Canvas · aannamesregel (alleen in Plan) | korte vorm: stopmoment · eindleeftijd · gebeurtenissen ★ | volledige vorm incl. inflatie en rendement |
| **Plan** · KPI-strip | twee cellen: Vrijheidsleeftijd en Na pensioen ★ (nu drie: KPI 3 verborgen) | vier cellen |
| Plan · ankerdrieslag (alleen vast anker), voortgangsbalk | ja | ja |
| Plan · duidingszin "Werken wordt een keuze rond je 52e" | vervalt ★ (de oordeelzin draagt de modus; ADR 0129 B10 toetsen) | vervalt ★ |
| Plan · fasebalk + fase-panes | nee | ja |
| Plan · verdieping (levensinkomen, dekkingsradar, huishouden, afbouwoverzicht) | nee | ja, lazy |
| Plan · jaar-op-jaar tabel | ja (Details-modal is nu ook in Eenvoudig) | ja |
| **Doelen** · lab met vijf knoppen en schaal | ja, alleen solo (ADR 0170 B10) | ja, alleen solo |
| Doelen · weergave-switch balk/wijzer/rad/harp/vijfhoek | alle vijf kiesbaar; standaard harp (desktop) en rad (mobiel) | idem |
| Doelen · marktaannames voor dit scenario | nee | ja, ingeklapt |
| Doelen · opslaan-balk (vastleggen, stopmoment, herstel) | ja | ja |
| Doelen · doelenlijst | één lijst, archief ingeklapt (TOE-2) | lijst + archief + viering |
| Doelen · andere paden (scenario-kaarten) | nee | ja, lazy |
| **Instellingen** · wizard-ingang "N van M" | ja | ja |
| Instellingen · Je plan: stopmoment, eindleeftijd, onttrekking, uitgave na pensioen | ja | ja |
| Instellingen · Je plan: geen tekort-lening | nee ★ | ja |
| Instellingen · Gebeurtenissen (lijst, toevoegen, kernelmomenten) | ja | ja |
| Instellingen · Levensstrategieën AOW/Pensioen/Werk/Huis | ja (UAT-TOEK-42: beide modi) | ja |
| Instellingen · Marktaannames, Box 3-methode, Pot-regels | nee (`DepthSection`, TOE-3) | ja |
| **Buiten de katernen** · Rekenhulp, bibliotheek | niet in het menu (`SIMPLE_HIDDEN_NAV_HREFS`), route blijft | ja |
| Huishoud-FIRE-sectie | nee (wordt niet gemount, schrijft dan ook niet) | ja bij partner |

Wat dit betekent per katern in Eenvoudig: **Plan** = kop, canvas, twee KPI's, voortgangsbalk en één link; **Doelen** = canvas met stippellijn, vijf knoppen (harp of rad), opslaan-balk, één doelenlijst; **Instellingen** = wizard-ingang, vier planregels, gebeurtenissen, levensstrategieën. Alles wat in Eenvoudig wegvalt is diepte die de uitkomst niet verandert; de uitkomst zelf (oordeel, vrijheidsleeftijd, dekking) is in beide modi identiek.

### 4.8 Meldingen per katern

Een melding staat bovenaan het katern waar ze over gaat, niet onder de paginakop. Zo leest de gebruiker de melding op de plek waar hij er iets mee kan, en blijft de kop een oordeel. **Het statuspunt staat op de katern-kop** van het katern met de melding (kleur = ernst), niet in de paginakop en niet in de TopBar: één signaal, op de plek waar de melding woont. Klik op de kop opent dat katern met de melding uitgeklapt. Per katern is hoogstens één melding uitgeklapt (de hoogste ernst); zijn er meer, dan staat het aantal bij het punt. Op mobiel is een melding één regel (titel en actie), de uitleg komt na een tik; in Doelen start ze op kleine schermen geminimaliseerd zodat grafiek en rad samen in beeld blijven. Minimaliseren werkt zoals nu (server-side, per route, heropent bij escalatie); omdat elk katern een route is, past de bestaande `status_banner_minimized`-pref (route → niveau) zonder wijziging.

| Melding (bron nu) | Katern | Ernst | Vervolgactie |
|---|---|---|---|
| Plan niet haalbaar / tekort onder een vast anker, met de €/mnd-hint (`kernelStatus`) | Plan | rood of oranje | "Verken je opties →" naar Doelen; "Stopmoment →" naar Instellingen |
| "Je hebt nu al genoeg" | Plan | groen, informatief | geen; eenmalig te minimaliseren |
| Tekort-lening: het plan leent kort om een tekort te dekken (`deficitLoanCopy`) | Plan | oranje | "Instelling bekijken →" naar Instellingen · Geen tekort-lening |
| Eindsituatie: vermogen op vóór de eindleeftijd, of nalatenschap (`detectEindsituatie`) | Plan | oranje of informatief | "Eindleeftijd →" naar Instellingen · Je plan |
| Doelscenario loopt achter op het plan (`LabPlanMelding`, "Plan gedekt" volgt het plan) | Doelen | informatief | Bijwerken · Loslaten |
| Een doel loopt achter op koers | Doelen | oranje | naar het doel in de lijst |
| AOW ontbreekt (`aowOntbreekt`) | Plan *(was Instellingen; de levensstrategieën staan sinds 27 sep op Plan — ADR 0179 addendum (e))* | oranje | Toevoegen → levensstrategie AOW |
| Je huis wordt nooit verkocht (`housingHeldNotice`) | Plan *(idem)* | informatief | Eigen woning ✎ |
| Ontbrekende gegevens ("Vul profiel aan", outcome-guards) | Instellingen | oranje | naar /mijn/profiel |
| Wizard niet afgerond (N van M) | Instellingen | geen melding; staat in de wizard-ingang zelf | Verder → |

Wat níét meer bestaat: de zeven losse meldingen boven de grafiek en de CTA-links die vanuit één melding naar twee verschillende bewerkplekken wezen. Elke vervolgactie wijst naar precies één rij in Instellingen of één blok in Doelen.

### 4.10 Visuele basis: de huidige app, niet de mockup (bevestigd 26 sep)

Uitgangspunt voor alles wat je ziet is de bestaande ontwerptaal van de app. Concreet: de tokens uit `app/globals.css` (`--bg #f5efe2`, `--paper #fbf7ec`, `--subtle #f3ead9`, `--border-ed #e3dac8`, `--ink #1a1916`, `--ink-2 #4a4840`, `--ink-3 #6e685a`), de fonts via `--font-playfair`, `--font-source-serif` en `--font-dm-mono`, het door de gebruiker gekozen horizon-accent via `--module-active-*` (dus geen vaste kleur), de stoplichtkleuren voor status, en de editorial componenten die er al zijn: `PageVerdictOpening`, `EditorialDeck`, `FiguresStrip`, `SectionLabel`/`RomanSection`, `CategoryTabs`, `LeverageCard`, `OrnamentColophon`, `ShellOverlay`, `BottomSheet`, `SlideInPane`, plus de mobiele shell (TopBar, FloatingNavButton, NavMenuSheet, action-bar). De herindeling verandert waar dingen staan, niet hoe ze eruitzien.

De mockup van 26 sep is een **structuurschets**, geen vormgevingsvoorstel: losse HTML met benaderde kleuren die koeler en grijzer uitvallen dan de app (papier `#FBF8F3` tegenover `#fbf7ec`, achtergrond `#F3EEE6` tegenover `#f5efe2`, borders `#DDD5C8` tegenover `#e3dac8`), een vast violet als horizon-accent, nagebouwde kaarten en knoppen, en een eigen mobiel frame in plaats van de echte shell. Daardoor voelt hij anders dan de app. Wat eruit wordt overgenomen is uitsluitend de indeling: canvas, katern-koppen, panelen, meldingen per katern. Niets van de vormgeving.

Consequentie voor fase 0: de bijgewerkte mockup wordt niet opnieuw als losse HTML gebouwd, maar met de echte componenten en tokens in de app zelf, met voorbeelddata, bijvoorbeeld in de bestaande sandbox of als tijdelijke superadmin-route onder `/beheer/…`. Dan kloppen look en feel per definitie en gaat de review alleen nog over de indeling. Terugvaloptie als een route te zwaar is: een HTML-pagina die `app/globals.css` letterlijk meeneemt en de bestaande editorial-klassen gebruikt.

### 4.9 Dubbelingen en overbodige informatie

Opschoonronde op de eigen wireframes en mockup van 26 sep. Regel: elk getal, elk signaal en elke actie één keer per scherm. Wat wegvalt, was op dat scherm al ergens anders te lezen.

| Wat | Waar het dubbel stond | Besluit |
|---|---|---|
| Vrijheidsleeftijd (52,3) | ankerregel in de kop, samenvatting op de Plan-kop, KPI 1, duidingszin ("rond je 52e"), sam-regel op mobiel | **Twee keer** (eigenaarsbesluit 26 sep): als tekst in de ankerregel en als eerste KPI met de kassabon. De duidingszin vervalt; de actieve katern-kop draagt geen samenvatting; de mobiele sam-regel vervalt |
| Dekking of vrijheids-% | ankerregel, voortgangsbalk met getal, katern-samenvatting | Onder een vast anker zegt de kop het percentage en toont de balk alleen de vulling; onder een gesolved anker zegt de kop niets en draagt de balk het vrijheids-% naar het doelbedrag |
| "tot je 90e" | ankerregel, aannamesregel, fasebalk, rij Eindleeftijd | Kop zegt het niet meer; aannamesregel (Plan, lezen) en rij (Instellingen, instellen) blijven, dat zijn twee rollen; fasebalk-leeftijden alleen op desktop |
| Statussignalen | drie punten in de paginakop, TopBar-stip, badges op de katern-koppen, wizard "4/6" in de samenvatting | **Alleen het statuspunt op de katern-kop.** TopBar-stip en badges weg; "4 van 6" staat alleen in de wizard-kaart, zonder aparte voortgangsbalk |
| Uitkomst van het doelscenario ("stoppen op 58 · gedekt") | lab-uitkomstregel, sectiekop rechts, doelenlijst-rij, melding | Eén uitkomstregel boven de harp of het rad; de lijstrij toont naam en status-punt zonder de uitkomst te herhalen |
| Bijwerken en Loslaten | melding, lijstrij, opslaan-balk | De melding draagt de actie; de opslaan-balk toont één knop naar staat ("Vastleggen" of "Bijwerken"); de lijstrij heeft een ✎ |
| "Zo werkt je grafiek" | canvas-i, Lagen-menu, links-rij in Plan | Alleen de canvas-i; de links-rij houdt de jaartabel |
| Legenda | altijd zichtbaar, ook met alleen de planlijn plus markers | Alleen bij twee of meer reeksen (doelscenario, marktcheck, scenario's, met je huis); markers hebben labels en tooltips en geen legenda-item; het jargon "p25–p75" verhuist naar de uitleg in het Lagen-menu |
| Aannamesregel | op alle drie de katernen | Alleen in Plan; in Doelen staat daar de uitkomstregel, in Instellingen niets |
| Perspectief-label "persoonlijk" | sectiekop Plan | Alleen bij een huishouden |
| Getal in de rij Stopmoment "(52,3)" | Instellingen | Vervalt; de kop draagt het getal |
| Melding-uitleg op mobiel | volledige tekst boven het paneel | Één regel; uitleg na een tik |
| Samenvattingsregel op de actieve katern-kop | herhaalde de kop of het paneel | Alleen inactieve koppen dragen een samenvatting |

Netto-effect boven de vouw op desktop: van ±28 klikbare elementen naar 4 (i, modus-switch, Lagen, zoom; de katern-koppen staan eronder), en van vijf herhalingen van hetzelfde getal naar twee (kop en KPI 1).

## 5. Inventaris → plek en weergave

Legenda: **1** Resultaat · **2** Doelscenario · **3** Instellingen · **G** Gereedschap · **O** /overzicht · **T** Tips & acties · **✕** verwijderen.

| Functie (nu) | Nu | Voorstel | Weergave |
|---|---|---|---|
| Oordeelzin plan-stoplicht | kop | **1** kop, op alle drie de routes | `PageVerdictOpening`, ongewijzigd (ADR 0174/0175) |
| Statuspunten + i | kop rechts | alleen de i blijft in de kop; het statuspunt verhuist naar de katern-kop van het katern met de melding (§4.8) | één signaal per katern, geen TopBar-stip, geen badges |
| Deck "Je tijdas met…" | onder kop | **1** wordt de ankerregel met elk getal één keer: gesolved "Vrij op 52,3.", vast anker "Stoppen op 60 · voor 96% gedekt." | `EditorialDeck` met cijfers uit `heroFireAge`/`resolvePlanStatus`; consumeren, niet rekenen |
| Vier navkaarten | boven grafiek | **✕** vervangen door de katern-schakelaar onder de grafiek | segmented control (3), route-gestuurd |
| Sectiekop "Horizon · jouw vrijheidshorizon" + Tips-knop | boven hero | **✕** dubbele kop weg; tips worden de i-knop op het canvas, niet standaard aan | één `ChartTips`-i |
| KPI-strip (4) + kassabons | boven grafiek | **1** vier cellen onder de grafiek; KPI 1 (Vrijheidsleeftijd) draagt de kassabon van het getal dat ook in de kop staat | `FiguresStrip cols=4` (mobiel 2×2; Eenvoudig: Vrijheidsleeftijd en Na pensioen); klik = kassabon (blijft) |
| Ankerdrieslag, duidingszin, voortgangsbalk | hero | **1** drieslag alleen onder een vast anker; voortgangsbalk blijft; de duidingszin vervalt (de oordeelzin draagt de modus, ADR 0129 B10 toetsen) | compacter, elk getal één keer (§4.9) |
| Zeven meldingen | boven grafiek | **per katern**, bovenaan het paneel waar de melding over gaat (§4.8); in de kop één statuspunt per katern met een open melding | bestaande minimaliseer-conventie per katern-route; klik op het punt = naar het katern met de melding uitgeklapt; elke vervolgactie wijst naar één rij |
| CTA "Vul profiel aan" | hero | onderdeel van het meldingenslot | — |
| Tien pills + ChartTips | boven grafiek | **1** grafiekmodus (3) rechtsboven het canvas + één "Lagen"-knop (popover op desktop, sheet op mobiel); de doellijn-pill vervalt (staat aan in katern 2) | segmented(3) + `ShellOverlay kind="sheet"` |
| `ChartOverlayExplainer` ×5 | onder pills | uitleg per laag in het Lagen-menu | — |
| `LifelineReadout` | boven grafiek | **1** bij het canvas in modus Vermogen (desktop); mobiel in de tooltip | — |
| SimChart (Pad) | hero | **canvas**, modus "Vermogen" | blijft |
| WealthCompositionChart (Opbouw) | hero via pill | **canvas**, modus "Samenstelling" | blijft |
| IncomeExpenseChart (uitklap) | onder grafiek | **canvas**, modus "Geldstroom" — volwaardige derde modus | barchart, niet meer weggeklapt |
| Zoom + tips-overlay | grafiek | blijven; overlay via de i | — |
| Events-tijdlijn onder de grafiek | onder grafiek | **3** de bewerk-lijst; de markers blijven als laag "Gebeurtenissen" op het canvas en slepen blijft op de grafiek | — |
| Fasebalk + fase-panes | onder grafiek | **1** onder de KPI-strip | blijft |
| Lab: vijf knoppen, schaal, weergave-switch | in hero-kaart | **2** op desktop náást de grafiek in de canvas-rij (harp, rechterkolom), op mobiel direct onder de klevende koppen (rad); alle vijf weergaven kiesbaar, standaard per breekpunt | ADR 0170 B1/B7; stippellijn + verschilvlak aan; grafiek en knoppen op één scherm (§4.2 regel 9) |
| `WhatIfMarketAssumptions` | lab | **2** ingeklapt "Marktaannames voor dit scenario" | — |
| Opslaan-balk / indicatieregel | lab | **2** sticky onderin op mobiel | `PageActionBar`-patroon |
| Legenda's Scenario's/Marktcheck | onder lab | direct onder het canvas, alleen bij twee of meer reeksen; markers zonder legenda-item; "p25–p75" alleen in de uitleg | — |
| Voetnoot "strategie · weergave t/m" | hero | wordt de **aannamesregel** onder het canvas: "Op basis van: stoppen op 60 · opmaken tot 90 · 2% inflatie · 3 gebeurtenissen — Aanpassen →" | nieuw patroon, link naar katern 3 |
| "Stopmoment wijzigen →" | hero | **3** rij Stopmoment; in **2** blijft "Maak X mijn stopmoment" | — |
| Levensinkomen-strook, dekkingsradar | katern III | **1** verdieping | blijven, lazy |
| Scenario's naast elkaar (`ScenarioKaarten`) | katern III | **2** "Andere paden naast je doelscenario" | blijft, lazy; zichtbaarheidsgate verhuist mee (ADR 0145 D7a) |
| Huishoud-FIRE-sectie | onder katern III | **1** verdieping, alleen bij partner; blijft de schrijver van `combined_fire_summary` (ADR 0168) | blijft |
| `HorizonTrendGrid` (gezondheid + FIRE-verloop) | onderaan | **O** in de gezondheidskassabon op /overzicht, niet op het hoofdscherm (§7.1) | sectie "Verloop" in `HealthScoreReceipt`; trend op datum, niet op index |
| Geplande acties | onderaan | **T** `/overzicht/tips`; op /toekomst hooguit een regel met link | — |
| Details-modal (walkthrough + jaartabel) | pill | blijft; één ingang voor "Zo werkt je grafiek" (de canvas-i) en één voor de jaartabel (link in het Plan-paneel); niet ook in het Lagen-menu | `ShellOverlay sheet full` |
| `ScenariosModal`, `SimulationsModal`, `BacktestingModal` | legenda's, trend | verdieping vanuit 1/2; Backtesting vanuit het verloop op /overzicht | panes blijven |
| `StrategieModal` (3 tabs) | lab, hints, meldingen | **✕** opheffen: elke tab wordt een rij in katern 3 met dezelfde body (ADR 0129 B13: Voorkeuren is al de bron) | één ingang per instelling |
| `WithdrawalModal` | `?modal=withdrawal` | **✕** onbereikbaar; body via de rij Onttrekking | — |
| Legacy Event Form Modal (±2.230 regels) | `?modal=life_events` | **✕** `EventPane` is de vervanger; deeplink → `?event=new` | — |
| `UitgavenPane` (uitgave na pensioen) | KPI 4-klik | **3** rij; KPI 4 blijft klikbaar en opent dezelfde rij-editor | één body (ADR 0160) |
| Wizard plan-review | pane via kaart | **3** bovenaan als begeleide ingang "Loop je voorkeuren door · N van M"; pane blijft | ADR 0142 D5 amenderen |
| `/toekomst/doelen` (`DoelenView`) | subpagina | **2** onder het lab: scenariodoel + vrije doelen + archief | route blijft, wordt katern 2 |
| `/toekomst/gebeurtenissen` | subpagina | **3** sectie Gebeurtenissen (lijst met kernelmomenten, toevoegen) | route → redirect met hash |
| `/toekomst/voorkeuren` | subpagina | **3** secties Plan-regels · Levensstrategieën · Marktaannames · Box 3 | route → redirect met hash + query |
| `AfbouwOverzichtCard` | voorkeuren | **1** verdieping (het is resultaat; nu uit een andere loader) | — |
| `/toekomst/rekenhulp` + `/bibliotheek` | subpagina's | **G** blijven; buiten de katernen; nav-item blijft (verborgen in Eenvoudig) | — |
| `/toekomst/inflatie-koopkracht` | wees | **G** link vanuit de inflatie-rij in katern 3 ("wat doet inflatie met je plan?"), anders verwijderen | — |

Eenvoudig-weergave: dezelfde `HideInSimple`-toedeling als nu (KPI 3, fasebalk, verdieping, huishouden weg; Lagen-menu toont alleen Gebeurtenissen en Mijlpalen; katern 3 verbergt Marktaannames en Pot-regels via `DepthSection`). Het doelscenario blijft ook in Eenvoudig, alleen solo (ADR 0170 B10).

## 6. Subpagina's

| Route nu | Advies | Waarom |
|---|---|---|
| `/toekomst` | Katern 1 **Plan** (resultaat), standaard | De hub ís het resultaat; de grafiek staat hier centraal. |
| `/toekomst/doelen` | Katern 2 **Doelen** (doelscenario + doelenlijst) | Het lab en de doelen zijn al gekoppeld (een vastgelegd doel is een `goals`-rij met `parameters.fire`); twee plekken voor één concept is de huidige verwarring. Route en label blijven. |
| `/toekomst/gebeurtenissen` + `/toekomst/voorkeuren` | Samen katern 3 **Instellingen** op `/toekomst/instellingen` met secties (wizard-ingang · Gebeurtenissen · Plan-regels · Levensstrategieën · Marktaannames) | Alles wat het plan voedt op één plek; de vier levensstrategieën verhuisden op 17 sep al van Gebeurtenissen naar Voorkeuren, de scheiding was al zoek. Oude routes redirecten met hash en query (`?strategie=`, `?regel=` blijven werken). |
| `/toekomst/rekenhulp`, `/toekomst/bibliotheek(/[id])` | Blijven als **Gereedschap**, buiten de katernen | Geen plan-onderdeel; verborgen in Eenvoudig zoals nu. Terugweg-link corrigeren (`?tab=rekenhulp` → `/toekomst/rekenhulp`). |
| `/toekomst/inflatie-koopkracht` | Alleen bereikbaar vanuit de inflatie-rij in katern 3, of verwijderen | Nul ingangen sinds UR3-26. |
| Wizard (pane, geen route) | Blijft een pane; ingang bovenaan katern 3 en via ⌘K | ADR 0142 D5 aanpassen (kaart → katern). |
| Legacy `/horizon/**`, `/toekomst/strategie`, `/toekomst/whatif` | Redirects blijven; `?whatif=open` en `#verken-je-aannames` gaan naar `/toekomst/doelen`; `?strategie=open` en `?modal=strategie|withdrawal` gaan naar `/toekomst/instellingen?rij=…` | Deeplinks uit briefing, Fin-acties en widgets blijven werken. |

Navigatie (`lib/nav-config.ts`): sub-items onder De toekomst worden **Doelen · Instellingen · Rekenhulp** (Gebeurtenissen en Voorkeuren vervallen als items). De menu-stip blijft het plan-stoplicht. ⌘K krijgt "Instellingen" en behoudt de wizard-ingang.

## 7. Betere ideeën

### 7.1 Verloop in de gezondheidskassabon op /overzicht (eigenaarsbesluit 26 sep)

Eén mentaal model voor de twee hoofdpagina's: **/overzicht = hoe je er nu voor staat en hoe je hier kwam; /toekomst = waar je heen gaat.** Het gezondheids- en FIRE-verloop (`HorizonTrendGrid`) verhuist daarom naar /overzicht, maar **niet op het hoofdscherm**: het komt in de kassabon die opent als je op de gezondheidskaart klikt (`HealthScoreReceipt`, `components/app/horizon/health-score-receipt.tsx`, geopend vanuit `components/overview/overzicht-hero.tsx:248-257`). Dat volgt het patroon uit het onderzoek (Credit Karma, Experian, Boldin): de stand en het verschil op het hoofdniveau, de historie één laag dieper. De hub zelf verandert niet van indeling, dus de grendels op blokvolgorde, streaming en rondleiding blijven onaangeraakt.

Vorm in de kassabon: op de kaart zelf blijft de stand met eronder "sinds vorige maand +3" (de `computeHealthScoreWithTrend`-delta, die de hub nu niet doorgeeft). In de kassabon komt onder de pijleruitsplitsing een sectie **"Verloop"** met twee kleine grafieken naast elkaar zoals nu op /toekomst: gezondheidsgetal en vrijheidsleeftijd, op datum, met de `score_version`-markering, en de bestaande link "Bekijk volledige backtesting →". De sectie laadt lazy zodra de kassabon open is; de data (`resilienceSnapshots` uit `HorizonPageData`) wordt op de hub al in blok 1 geladen, dus er komt geen query bij.

Wat eerst moet, in deze volgorde:
1. **Leesquery repareren.** `lib/horizon/raw-data-loader.ts:547-551` en `lib/server-data/base.ts:354-361` lezen `net_worth_snapshots` oplopend met `limit(60)`/`limit(12)` zonder datumvenster, terwijl `GET /api/snapshots/auto` sinds de dag-gate één rij per dag schrijft. Dedupe per maand zoals `app/api/snapshots/month-dedupe.ts` en `group-history`; plotten op datum, niet op index (`horizon-helpers.tsx:403`). Eerst met data verifiëren.
2. **Onbekend-maanden** dragen nu een partiële score (ADR 0131; aandachtspunt `snapshot-resilience-score-bij-onbekend-inkomen`). Markeer ze of laat ze weg.
3. **Methodewissels markeren**: `score_version` (v1→v2) staat al; de grondslagbreuk van 30 aug (budgetdiscipline) niet.
4. Alleen persoonlijk tonen; de kassabon draait al in de eigen blik.
5. Widget `gezondheids_score` opent dezelfde kassabon of linkt naar `/overzicht` in plaats van `/toekomst`; UAT-TOEK-32 verhuist naar de OVZ-zone.

Aandachtspunt dat blijft staan: de FIRE-verloop-reeks komt uit `net_worth_snapshots.fire_age`, een andere motor dan het live getal (`fire-historie-uit-een-andere-motor-dan-het-live-getal`). In de kassabon hoort daar één regel uitleg bij, zoals nu bij de methodewissel.

Bijvangst: de briefingregel "score steeg met X punten" (`lib/briefing/engine.ts:343-349`) krijgt een score zonder trend en kan dus nooit verschijnen; hij gaat pas werken zodra de gerepareerde historie wordt doorgegeven.

### 7.2 Geldstroom als derde grafiekmodus

De in- en uitgavenstroom-barchart staat nu weggeklapt onder de grafiek. Als derde modus naast Vermogen en Samenstelling krijgt hij een gelijkwaardige plek: één canvas, drie blikken op hetzelfde resultaat. De lagen (Marktcheck, Scenario's, Gebeurtenissen, Mijlpalen, Huis) gelden alleen in Vermogen.

### 7.3 De aannamesregel onder het canvas

Eén regel die zegt waar de grafiek op rust: "Op basis van: stoppen op 60 · opmaken tot 90 · 2% inflatie · 3 gebeurtenissen — Aanpassen →". De gebruiker ziet de instellingen zonder ze op de resultaatpagina te hoeven bedienen, en de link brengt hem naar de juiste rij in katern 3. Dit vervangt de voetnoot, de "Stopmoment wijzigen"-hint en de CTA's die nu in zeven meldingen verstopt zitten.

### 7.4 Eén Monte Carlo

Zes plekken met verschillende motoren zijn er vijf te veel. De Marktcheck-laag (kernel-worker) is de canonieke; `SimulationsModal` met eigen `runMonteCarlo` wordt een verdieping op dezelfde run of verdwijnt. Dit is rekenmotorwerk (`calc-engine-specialist`) en hoort niet in deze herindeling, maar de herindeling maakt de dubbeling zichtbaar. Voorstel: aparte kaart.

### 7.5 Eén ingang per instelling

Katern 3 wordt de enige plek waar een instelling bewerkt wordt, met de wizard als begeleide route erlangs (één body, twee hosts blijft). De Strategieën-modal, de opnamestrategie-modal en het legacy-eventformulier verdwijnen. KPI 4 en de meldingen linken naar de rij, niet naar een eigen modal. Dat scheelt ±4.000 regels en drie manieren om hetzelfde te doen.

### 7.6 Drie getallen onder de waaier

De Marktcheck-band (p25–p75) blijft, maar de percentielen verdwijnen uit de tekst. Eronder komen drie vrijheidsleeftijden in de taal die Nederlanders van mijnpensioenoverzicht kennen: "als het tegenzit 55 · verwacht 52 · als het meezit 49". Geconsumeerd uit dezelfde kernel-run (`runMarktcheckAsync`), geen nieuwe motor.

### 7.7 De verschilregel in elke editor

Zie §4.2 regel 8. De wizard toont al een live effect per stap; de losse editors in katern Instellingen krijgen diezelfde regel, zodat het effect ook op mobiel zichtbaar is waar de grafiek achter de pane verdwijnt.

## 8. Randvoorwaarden en amendementen

Wat blijft staan (uit ADR's en gates):

- Oordeel geconsumeerd via `resolvePlanStatus`/`resolvePlanVerdictSentence`, nooit herberekend (ADR 0174/0175). Kop = `PageVerdictOpening` (h2); de shell draagt de enige h1 (ADR 0110).
- Eén wat-als: het inline doelscenario (ADR 0144). `resolveLabUitkomst` en `standGedekt` zijn de enige uitkomst- en haalbaarheidsbron (ADR 0145/0160/0170/0175).
- Eén body, twee hosts voor elke instelling; veld-register per schrijfroute in dezelfde PR (ADR 0142 D6–D8; `lib/plan-review/veld-register.test.ts`).
- Voorkeuren is de bron van de plankeuzes, verkennen wijzigt het plan nooit (ADR 0129 B13). Plan-mutaties via `/api/fire-settings` met bevestiging.
- Euro-weergave: deflatie exact één keer aan één render-grens per bestand, kernelfactor, `InEuroView<T>` (ADR 0090/0093). Nieuwe bestanden met bedragen krijgen een eigen grens + bron-test, óf ontvangen al gedeflateerde `view*`-feeds.
- Vrijheidsgetal en -leeftijd uit `computeHorizonFireSim`; worker + fallback; zichtbaarheidsgates verhuizen mee met de blokken (ADR 0054/0107/0145 D7a).
- Datapad: lezen via loader, schrijven via API; nieuwe client-bestanden zonder `.from().select()` (ADR 0058, `check:client-reads`). De `loadData()`-herlaadlus moet dus vóór de decompositie naar `router.refresh()` + loader.
- Eenvoudig/Volledig via `HideInSimple` en `DepthSection`, geen ternary op de modus (ADR 0026).
- Overlays via `ShellOverlay` (ADR 0039); RESIDUE-lijsten mogen alleen krimpen; tap-targets; page-info-dekking; merkstem en compliance vóór release.
- Taal: "geld levert tijd op", "opgebouwd", nooit koop-/verkoopmetafoor (ADR 0165); geen imperatief in de kop.
- De Huishoud-FIRE-sectie blijft gemount op de hub-route: ze schrijft `households.combined_fire_summary` voor /overzicht (ADR 0168).
- Deeplinks blijven werken: `?tab=`, `?modal=…`, `?strategie=open`, `?uitgaven=open`, `?event=`, `?whatif=open`, `?planreview=open`, widget-hrefs, `next.config.ts`-redirects.

Wat een amendement vraagt (nieuwe ADR "Toekomst in drie katernen" + addenda):

| ADR | Punt | Amendement |
|---|---|---|
| 0170 B6 | Lab-knoppen ín de grafiekkaart onder de fasebalk | Knoppen direct onder het canvas in katern Doelen; het canvas is hetzelfde, de stippellijn en het verschilvlak blijven (B9). De fasebalk gaat naar katern Plan. |
| 0142 D5 | Wizard-ingang = Voorkeuren-kaart op /toekomst + knop op /voorkeuren + ⌘K | Ingang = kop van katern Instellingen (met "N van M") + ⌘K; de kaart bestaat niet meer. |
| 0129 B13 | Strategie-modal spiegelt Voorkeuren | De modal verdwijnt; Voorkeuren (katern 3) is de enige bewerkplek. Versterkt B13. |
| 0162 | Doelen wonen op `/toekomst/doelen` | Ongewijzigd; de route wordt katern 2. |
| spec 1 jun 2026 | Tijdas-landing + vier navkaarten | Vervangen door dit ontwerp; expliciet vastleggen in de nieuwe ADR. |

## 9. Fasering (indicatief, pas na eigenaarsbesluit uit te voeren)

Elke fase is los te releasen en eindigt groen en gecommit (eigenaarsnorm "per fase groen + commit"). Fase 0–2 samen vormen de **basisindeling**; 3–6 zijn vervolgkaarten. Skill-route per fase staat erbij; het agent-budget volgt de skill. De eigenaar koos op 26 sep om eerst te beraden; bij hervatten start fase 0 met de ADR en de klikbare mockup.

### Fase 0 — Besluit vastleggen (`architect` + eigenaar, klein)

- Nieuwe ADR `docs/adr/NNNN-toekomst-in-drie-katernen.md`: het canvas-met-drie-katernen-model, de amendementen op 0170 B6, 0142 D5 en 0129 B13, en het vervangen van de spec van 1 jun 2026. `elements: [fn-toekomstplannen, as-planning, app-comp]`.
- Klikbare mockup van §4.3/4.4 **in de app zelf**, met de echte tokens en editorial componenten en voorbeelddata (bestaande sandbox of tijdelijke superadmin-route), ter goedkeuring van de indeling; één iteratie. De losse HTML-mockup van 26 sep is daarmee afgedaan (§4.10).
- Kopij van kop, ankerregel, aannamesregel, katern-koppen en Lagen-menu langs `merkstem` en `compliance-check` (constaterend, geen imperatief, ADR 0165).

### Fase 1 — Fundament: drie routes, één canvas, blokken verplaatst zoals ze zijn (`refactor`)

Doel: de structuur staat, zonder zichtbare herontwerp-stappen behalve het weglaten van de navkaarten en de dubbele kop. Alles wat vandaag werkt, werkt na deze fase op dezelfde manier op een andere plek.

Nieuw:
- `app/(app)/toekomst/(katern)/layout.tsx` — server; laadt `loadHorizonData`, `loadFinData`, `loadPlanVerdictSentence`, meldingen- en plan-review-state (nu in `toekomst/page.tsx:196-282`); rendert kop (`PageVerdictOpening`, uit `components/future/toekomst-subpage-shell.tsx`), meldingenslot, `<ToekomstStateProvider>`, `<ToekomstCanvas/>`, `<KaternKoppen/>`, `{children}`. Rekenhulp, bibliotheek en inflatie-koopkracht blijven buiten de groep en laden de bundel niet.
- `app/(app)/toekomst/(katern)/page.tsx` (Plan), `(katern)/doelen/page.tsx`, `(katern)/instellingen/page.tsx` — elk met eigen `NavStackMeta` en `loading.tsx`.
- `components/toekomst/state/toekomst-state-provider.tsx` — de state uit `horizon-client.tsx` (±regels 798–5800): `useHorizonFireSim`, scenario-prefs (`toekomstScenarioPrefs`), laag-prefs, perspectief, en **de ene euro-render-grens** die `InEuroView<T>`-feeds via context uitdeelt (ADR 0093; bron-test verhuist mee).
- `components/toekomst/canvas/toekomst-canvas.tsx` — hergebruikt `sim-chart.tsx`, `wealth-composition-chart.tsx`, `income-expense-chart.tsx`, `chart-static-layers.tsx`, `chart-event-markers.tsx`, `lifeline-readout`, `zoomable-chart-container`, `events-timeline.tsx`, legenda's, voetnoot.
- `components/toekomst/plan/*` — KPI-strip, `anker-drieslag.tsx`, duiding, voortgangsbalk, `PhaseBar` + fase-panes, `levensinkomen-strook`, `dekkingsradar`, `HouseholdFireSection`, `AfbouwOverzichtCard`.
- `components/toekomst/doelen/*` — `lab-knoppen.tsx`, `lab-opslaan-balk.tsx`, `WhatIfMarketAssumptions`, `doel-vastleg-sheet`, `stop-plan-confirm`, en de bestaande `components/future/doelen-view.tsx` eronder.
- `components/toekomst/instellingen/*` — in deze fase: de bestaande `voorkeuren-view.tsx` en `gebeurtenissen-view.tsx` gestapeld, met de wizard-ingang erboven (`plan-review-provider.tsx`).
- `components/editorial/katern-koppen.tsx` — nieuwe primitive op het `CategoryTabs`-patroon.

Gewijzigd:
- `loadData()` (horizon-client `:1434`, ±10 tabellen client-side) wordt `router.refresh()`; vereist door `check:client-reads` vóór er nieuwe client-bestanden zijn. Meet de layout-herrender (TTFB-plan van 26 sep).
- `next.config.ts`: `/toekomst/gebeurtenissen` → `/toekomst/instellingen#gebeurtenissen` (query mee: `?strategie=`, `?nieuw=`); `/toekomst/voorkeuren` → `/toekomst/instellingen` (`?regel=`, `?strategie=` mee); `?whatif=open` en `#verken-je-aannames` → `/toekomst/doelen`; `?modal=strategie|withdrawal|life_events` en `?strategie=open` → `/toekomst/instellingen?rij=…` resp. `/toekomst?event=new`. Redirect-guard in de layout voor `?tab=`.
- `lib/nav-config.ts`: sub-items Doelen · Instellingen · Rekenhulp; `EXTRA_ROUTE_TITLES`; `lib/command-palette/navigation-index.ts`; `lib/widget-catalog.ts` hrefs; `lib/page-info-content.ts` (nieuwe sleutel `/toekomst/instellingen`, de vier verouderde teksten uit §2.5).
- `lib/horizon/deeplink-cleanup.ts` en `lib/navigation.ts` (`horizonSetup` weg).

Verwijderd: `horizon-client.tsx` (na extractie), `toekomst-nav-cards.tsx`, het legacy Event Form Modal (`?modal=life_events` → `?event=new`), `horizon/layout.tsx` + `loading.tsx` (dood), RESIDUE-entry in `scripts/check-heading-levels.mjs` (de h1 verdwijnt) en de ALLOWLIST-entry in `scripts/check-client-data-reads.mjs`.

Tests: de 17 bron-scan-tests `horizon-client.*.test.ts` verhuizen elk naar het bestand waar de invariant nu woont (één invariant, één bestand); `tekort-lening` wordt volgorde-onafhankelijk; `vrij-mogelijk-vanaf` hangt aan de zichtbaarheid van het Plan-paneel; `redirect-guard.test.ts`, `next.config.test.ts`, `nav-config*.test.ts`, `tab-root-topbar-title.test.ts`, `page-info-content.test.ts`, `deeplink-cleanup.test.ts`. UAT via `uat-docs-keeper`: TOEK-28 (koppen i.p.v. kaarten), TOEK-17/24/25/26 (routes), TOEK-30 (deeplinks).

Werkwijze: subagent-driven per katern (canvas → plan → doelen → instellingen), elk met een groene tussenstand. Aparte `security-specialist`-run (nieuwe routes, redirects met query-passthrough, verwijderde client-reads). Gebundelde eindreview via `senior-developer`.

### Fase 2 — Canvas en kop opschonen (`extend-feature`)

- Modus-switch Vermogen · Samenstelling · Geldstroom (de uitklap van `IncomeExpenseChart` verdwijnt).
- Lagen-menu (`ShellOverlay kind="sheet"` op mobiel, popover op desktop) met uitleg per laag; de tien pills en `ChartOverlayExplainer` gaan erin op; de Tips-ballonnen achter de i, niet standaard aan.
- Meldingen per katern (§4.8): één provider met een katern-toewijzing en ernst per melding (bestaande `Deficit`/`Aow`/`Eindsituatie`-providers samengevoegd); per katern hoogstens één uitgeklapt; de kop toont per katern een statuspunt; minimaliseren via de bestaande `status_banner_minimized`-pref per katern-route; vervolgacties wijzen naar `/toekomst/instellingen?rij=…` of `/toekomst/doelen`.
- KPI-strip als `FiguresStrip cols=4` onder het canvas in Plan; ankerregel in de deck; aannamesregel onder het canvas; voetnoot en "Stopmoment wijzigen"-hint vervallen.
- Drie getallen onder de Marktcheck-band (§7.6).
- Opschoning §4.9: KPI-strip blijft vier cellen (kassabon onder KPI 1), duidingszin weg, legenda alleen bij twee of meer reeksen, statuspunt op de katern-kop, aannamesregel alleen in Plan, "Zo werkt je grafiek" alleen via de canvas-i.
- Tests: `lab-knoppen` (volgorde), `sim-chart`, `income-expense-chart`, nieuwe tests voor Lagen-menu en meldingenslot; UAT TOEK-03/04/08/41/52/56.
- Meting: TTFB en CLS op /toekomst tegen de baseline van 26 sep (3,1 s; CLS 0,40 mobiel).

### Fase 3 — Katern Instellingen: één ingang per instelling (`extend-feature`)

- Rijen met ✎ die de bestaande bodies openen (`REGEL_BODIES`, `StopPlanVragen`, `HousingStrategySection`, `VoorkeurBewerkenBody`, `Box3MethodeBody`, uitgaven-body); `?rij=` als deeplink-key.
- Verschilregel in elke editor via `runRegelProjection` + `RegelSimOverride` (§7.7).
- `strategie-modal.tsx`, `withdrawal-modal.tsx` verwijderd; KPI 4 en meldingen linken naar rijen; `StrategieEditors` (AOW/Pensioen/Werk/Huis) als sectie Levensstrategieën.
- Gebeurtenissenlijst met kernelmomenten (uit `gebeurtenissen-view.tsx`) als sectie, "Toevoegen" via `EventPane` catalogus.
- ADR-addenda 0142 D5 en 0129 B13; `veld-register.test.ts` blijft groen (geen nieuwe velden).
- UAT TOEK-13/14/17/18–21/24/25/26/38/42/44/47/48/51.

### Fase 4 — Katern Doelen samensmelten (`extend-feature`)

- `DoelenView` onder het lab (scenariodoel, vrije doelen, archief, viering); `LabPlanMelding` versimpelt (de doelen staan er nu naast).
- `ScenarioKaarten` naar Doelen als "Andere paden naast je doelscenario"; de preset-batch-gate `duidingInView` hecht aan dit paneel (ADR 0145 D7a).
- Stippellijn + verschilvlak en doelmarkers standaard aan in dit katern; op mobiel markers zonder label.
- Eén scherm (§4.2 regel 9): canvas-rij in Doelen als twee kolommen op desktop met de harp rechts; op mobiel het rad direct onder de koppen, grafiek `clamp(170px, 30vh, 230px)`, geen aannamesregel, melding één regel. `knopWeergave` per breekpunt (desktop/mobiel), standaard harp/rad; alle vijf weergaven blijven kiesbaar (`lab-harp.tsx`, `lab-rad.tsx`, `lab-wijzer.tsx`, `lab-vijfhoek.tsx`, `lab-slider.tsx`).
- Uitkomstregel één keer boven het lab; opslaan-balk met één knop naar staat (Vastleggen of Bijwerken); lijstrij zonder herhaalde uitkomst.
- UAT TOEK-10/11/22/23/35/39/40/43/46/49/50/57/58.

### Fase 5 — Verloop naar /overzicht (`bug-fix` voor de query, dan `extend-feature`)

- Eerst met data verifiëren: aantal rijen per gebruiker per maand in `net_worth_snapshots`. Dan de leesqueries repareren (`lib/horizon/raw-data-loader.ts:547-551`, `lib/server-data/base.ts:354-361`): datumvenster + dedupe per maand (`app/api/snapshots/month-dedupe.ts`); plotten op datum.
- `HorizonTrendGrid` → sectie "Verloop" in `components/app/horizon/health-score-receipt.tsx` (lazy zodra de kassabon open is), twee reeksen (gezondheid, vrijheidsleeftijd), `score_version`-markering, uitlegregel bij de FIRE-reeks; "sinds vorige maand" op `HealthScoreCard` (de hub geeft de trend-delta nu niet door).
- Geplande acties uit /toekomst; `/overzicht/tips` is het huis.
- Widget `gezondheids_score` opent de kassabon of linkt naar `/overzicht`; UAT TOEK-32 → OVZ. De hub-indeling verandert niet, dus `overzicht-hero.block-order.test.ts`, `overzicht-streaming.test.tsx` en `lib/rondleiding/targets.source.test.ts` blijven ongemoeid; wel `health-score-receipt.test.tsx` uitbreiden.

### Fase 6 — Nazorg (`kleine-aanpassing` / doc-sync)

- `npm run arch:diagram`; aandachtspunt `horizon-god-component` sluiten of herformuleren; `lib/architecture/hld-model.ts`, `archimate-flows.ts` (stroom Toekomst); org-site `node site/build.mjs`.
- `info-knoppen-actueel`; dode ingangen (§2.5); `/toekomst/inflatie-koopkracht` linken of verwijderen.
- `release`-skill per fase.

## 10. Verificatie

- **Typen en tests**: `npx tsc --noEmit`; vitest via PowerShell op `components/toekomst`, `components/app/horizon`, `components/future`, `app/(app)/toekomst`, `lib/nav-config*.test.ts`, `lib/uat/**toek*`, `lib/plan-review/*.test.ts`, `lib/horizon/deeplink-cleanup.test.ts`, `next.config.test.ts`, en bij fase 5 `components/overview/*.test.ts*`.
- **Gates**: `npm run check:headings` (RESIDUE krimpt), `check:client-reads` (ALLOWLIST krimpt, geen nieuwe reads), `check:overlays`, `check:tap-targets`, page-info-dekking, `merkstem:scan`, `npm run uat:stale --base=origin/master`.
- **Visueel** (chrome-devtools op de dev-server, 390 px en 1280 px): /toekomst, /toekomst/doelen, /toekomst/instellingen; tel de interactieve elementen boven de grafiek (≤ 6); controleer de één-scherm-eis in Doelen op 1280×720, 1440×900, 390×844 en 360×800 (grafiek en alle vijf knoppen zichtbaar zonder scrollen, en een knopwijziging verandert de stippellijn in beeld); tel per scherm hoe vaak de vrijheidsleeftijd staat (twee keer: kop en KPI 1, nergens anders); wissel katernen en controleer dat de grafiek gemonteerd blijft (geen herlaad, geen sprong); Eenvoudig en Volledig; euro-weergave aan en uit (bedragen één keer gedeeld); alle deeplinks uit §8 landen goed; de opslaan-balk in Doelen staat boven de nav-pill.
- **Prestatie**: TTFB en CLS via `vercel metrics`/Speed Insights vóór en na fase 2; de KPI-strip staat niet meer boven de vouw.
- **Data (fase 5)**: leesquery levert de laatste 12 maanden, één punt per maand, geen partiële score bij "onbekend".
- **Regressiebewijs**: de bron-scan-invarianten (één beslisser KPI 1, grondslag KPI 2, één lab-uitkomst, deflatie één keer, plan-anker uit kernel-echo) bestaan na fase 1 nog steeds, elk in precies één bestand.

## 11. Beslispunten voor de eigenaar

| # | Vraag | Aanbeveling | Besluit 26 sep |
|---|---|---|---|
| 1 | Katernen als drie routes met gedeeld canvas (C) of als drie secties op één route (C′)? | C; C′ blijft terugvaloptie zonder herbouw | **C** |
| 2 | Gebeurtenissen en Voorkeuren samen op `/toekomst/instellingen`, of twee routes behouden? | Samen; oude routes redirecten met hash en query | **Samen** |
| 3 | Labels: Plan · Doelen · Instellingen, of Resultaat · Doelscenario · Instellingen? | Plan · Doelen · Instellingen (gewone taal, MERKTAAL-lijn); paneelkoppen mogen rijker zijn | **Plan · Doelen · Instellingen** |
| 4 | Canvas in katern Instellingen: compact (desktop) + regel (mobiel), of volledig? | Compact + regel | **Compact op desktop, alleen de kop op mobiel** |
| 5 | Eerste oplevering: fase 0–2 (basisindeling) of direct t/m fase 4? | Fase 0–2, daarna per kaart | **Nog niet plannen; eerst beraad** |
| 6 | Verloop naar /overzicht inclusief queryfix, en Geplande acties naar Tips? | Ja, als fase 5 | **Ja, maar in de gezondheidskassabon, niet op het hoofdscherm** |
| 7 | Monte Carlo-consolidatie (zes plekken, meerdere motoren)? | Aparte kaart, buiten deze scope | **Aparte kaart; de herindeling verplaatst de ingangen, raakt de motoren niet** |
| 8 | `/toekomst/inflatie-koopkracht`: linken vanuit de inflatie-rij of verwijderen? | Linken | **Linken vanuit de inflatie-rij in Instellingen** |
| 9 | Lab-weergaven: alle vijf houden, of terug naar één? | Alle vijf houden; standaard harp (desktop) en rad (mobiel), keuze per breekpunt | **Alle vijf; harp/rad als standaard** |
| 10 | Grafiek en doel-knoppen op één scherm als harde eis? | Ja: canvas-rij in twee kolommen op desktop, rad direct onder de koppen op mobiel (§4.2 regel 9) | **Ja, harde eis** |
| 11 | Statuspunt op de katern-kop in plaats van in de paginakop (en geen TopBar-stip of badges)? | Ja (§4.8, §4.9) | **Ja, op de katern-kop** |
| 12 | Vrijheidsleeftijd alleen in de kop (KPI 1 en duidingszin vervallen), KPI-strip drie cellen? | Ja (§4.9); ADR 0129 B10 toetsen voor de duidingszin | **Kop én eerste KPI (vier cellen blijven); de duidingszin vervalt, ADR 0129 B10 toetsen** |
