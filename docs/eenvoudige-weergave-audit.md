# Eenvoudige weergave — audit & voorstellen per pagina

*8 augustus 2026 · onderzoek op basis van code-inventarisatie (drie sweeps) + schermronde met chromedev in beide modi (desktop 1920px + mobiel 390px, testaccount met volledige data). Kader: ADR 0026 (weergavemodus), de landingsbelofte als meetlat.*

*Besluiten verwerkt op 9 augustus 2026 (keuzerondes JP): 33 voorstellen gekozen, 9 afgevallen — zie §8 voor het faseplan; per fase vastgelegd als kaart in de Notion-werkqueue (🧩 Trifinity, CC-actie "Backlog").*

---

## 1 · De meetlat: wat beloven we op de landingspagina?

De landing belooft vier pijlers plus één filosofie:

| Pijler | Belofte (letterlijk) | Dragende schermen |
|---|---|---|
| **Inzicht** | "Inzicht in elke euro" — transacties automatisch gecategoriseerd, budgetten die meebewegen, je vermogen in één rustig beeld, groei in euro's én vrijheidsdagen | /overzicht, bezittingen, transacties, budget |
| **Grip** | "Grip zonder spreadsheet-avonden" — Fin let mee, constateringen, suggesties, nieuws over jouw situatie, notificaties | briefing, tips, berichten, nieuws, Fin-chat |
| **Nu** | "Het nu scherp in beeld" — bezittingen en schulden, cashflow, abonnementen en vaste lasten | bezittingen, schulden, cashflow, vaste lasten |
| **Toekomst** | "De toekomst eerlijk doorgerekend" — projectie met bandbreedte, wensen en levensgebeurtenissen op je tijdas, end-of-life voorkeuren | /toekomst |
| Filosofie | "Geld is opgeslagen tijd" + "je eerste Vrijheidsrapport in 5 minuten" | overal / onboarding |

**Buiten de belofte** (nergens op de landing): fiscale optimizer, rekenhulp + publieke bibliotheek, verdiepings-apps (aandelen-/crypto-holdings, verhuurrendement, hypotheekplanner), rapportages, check-ins, Box 2, forecast als aparte pagina, backtesting/Monte-Carlo-bediening. Dit zijn legitieme **Volledig**-functies — maar in Eenvoudig mogen ze standaard uit beeld. Dat is de kern van dit document.

## 2 · Hoofdbevindingen

1. **De keuze bestaat, maar niemand kan hem vinden.** `display_mode` ('simple' default voor nieuwe accounts) is uitsluitend via ⌘K te schakelen. Geen instelling op /mijn, geen woord in de onboarding, geen hint in de app (`components/app/hide-in-simple.tsx` sluit dat bewust uit). Wie eenvoudig start weet niet dat er meer is; wie volledig staat (alle bestaande accounts, via de backfill) weet niet dat het rustiger kan.
2. **Eenvoudig snijdt de diepte, niet de drukte.** De reductie zit vrijwel volledig ónder de vouw (katernen, analyses, grafieken). De bovenkant van /overzicht is in beide modi bijna identiek: welkomstgids (5 schermen × 4 kaarten) + groet + 4 hefboomtegels + legenda + gezondheidsscore + vermogensgrafiek + briefing + 3 "alles bekijken"-links. Op mobiel is het **hele eerste scherm** welkomstgids. Daar ontstaat de overweldiging, niet in katern III van Box 3.
3. **De dekking is ongelijk.** /toekomst is het voorbeeld (3 platte kaarten, 3 KPI's, geen fasebalk/playback); Box 1/2/3 en transacties zijn goed gereduceerd. Maar /mijn (9 kaarten + duplicerende tabbalk), notificaties (8 typen + 4 partner-modi), doelen, forecast, de sidebar, de welkomstgids en de mobiele topbar (4 losse statuspunten) negeren de modus volledig.
4. **Jargon lekt door in Eenvoudig.** "Onzekerheid (P40–P60)", "YTD", "Verken je Box 3-positie", editienummers/jaargang in de krant-masthead. De doelgroep van Eenvoudig is precies wie dit afschrikt.
5. **Er zijn dubbele ingangen.** Tips & acties / Berichten / Nieuws / briefing = vier plekken voor "wat vraagt aandacht"; /mijn-tabbalk dupliceert het kaartengrid; RAPPORT-knop naast /rapportages; feedback via chat-megafoon én /mijn/feedback; onboarding vraagt bezittingen/schulden die de welkomstgids daarna nóg eens vraagt.
6. **Technisch dood hout.** `DepthSection` (inklappen-met-behoud, het oorspronkelijke ADR 0026-idee) wordt nergens gebruikt; alles is `HideInSimple` (hard weg). De ⌘K-omschrijving ("Diepte-secties standaard tonen of inklappen") beschrijft gedrag dat niet bestaat.

## 3 · Wat al goed staat (het patroon om te herhalen)

- **/toekomst in Eenvoudig** is de norm: compacte one-liner-kaarten (`leverage-card` met `compact`-prop), KPI's 4→3, bediening weg, detail achter kassabon-sheets.
- `FiguresStrip`-reductie (bezittingen 4→1, budget 4→2), pill-lijsten i.p.v. kaart-grids, budget geforceerd op pill-weergave, transacties-analyse van ~8 blokken naar gauge + tijdlijn, Box 3-katernen verborgen.
- Kassabon/ShellOverlay-deep-dives: detail verhuist naar een klik, verdwijnt niet.

De voorstellen hieronder passen dat bestaande patroon toe op de plekken die het nog niet volgen.

## 4 · Categorieën

| Cat | Betekenis |
|---|---|
| **A** | Verbergen in Eenvoudig (blijft in Volledig; route blijft bereikbaar) |
| **B** | Gegevens/opties verminderen in Eenvoudig (het horizon-hoofdkaarten-patroon) |
| **C** | Standaard inklappen, detail op klik (DepthSection / disclosure) |
| **D** | Samenvoegen of schrappen — voor álle modi (dubbelingen weg) |
| **E** | Taal & duiding (jargon → gewone taal, vensters labelen) |
| **F** | Vindbaarheid & standaardkeuze van de weergave zelf |

★ = quick win (klein, geen besluit nodig).

## 5 · App-brede voorstellen

| # | Voorstel | Cat |
|---|---|---|
| APP-1 ★ | **Weergavekeuze naar /mijn/uiterlijk** als eerste blok: "Eenvoudig — de kern" / "Volledig — alle detail", schrijft via bestaande `PUT /api/display-mode`; ⌘K blijft snelkoppeling | F |
| APP-2 ★ | **Onboarding-succes + welkomstgids noemen de weergave** in één zin: "Je start eenvoudig — meer detail zet je aan bij Mijn → Uiterlijk" | F |
| APP-3 ★ | **⌘K-copy repareren**: "Diepte-secties standaard tonen of inklappen" → "Meer/minder detail op elke pagina" (huidige tekst beschrijft niet-bestaand gedrag) | E |
| APP-4 | **Eén ontdek-voetregel** op de zwaarst gereduceerde pagina's (Box 3, transacties, tijdas): "Je kijkt eenvoudig — meer detail in de volledige weergave →". Herziet de bewuste geen-hints-keuze in `hide-in-simple.tsx` → ADR 0026-aanvulling | F |
| APP-5 | **Jargonregel voor Eenvoudig**: geen percentielen/afkortingen in beeld — "Onzekerheid (P40–P60)" → "bandbreedte", "YTD" → "dit jaar"; SWR/opnamerate blijft Volledig | E |
| APP-6 ★ | **Welkomstgids comprimeren**: 4 grote kaarten → één kaart met 4 afvinkregels; "SCHERM 1 VAN 5" → stappen-dots; mobiel max ~⅓ viewport i.p.v. het hele eerste scherm | B |
| APP-7 ★ | **Stripnorm**: in Eenvoudig max 2 cellen per `FiguresStrip`, app-breed. Vangt de achterblijvers (Box 1 toont nu nog 4 KPI's in Eenvoudig, schulden 3) met één regel | B |

## 6 · Navigatie, sidebar & mobiel

Nu: sidebar toont in beide modi 2 weergave-toggles + 2 modules met uitgeklapte sub-items + APPS-blok + € 1,1M-badge + 4 "overige"-items + BEHEER/MIJN/UITLOGGEN + SYNC NU + RAPPORT. Mobiele topbar: 4 losse statuspunten + oog + krant + bel + avatar.

| # | Voorstel | Cat |
|---|---|---|
| NAV-1 ★ | APPS-blok (Aandelen holdings, Hypotheekplanner) in Eenvoudig uit de sidebar en nav-sheet — zelfde mechanisme als `SIMPLE_HIDDEN_NAV_HREFS` | A |
| NAV-2 | In Eenvoudig alleen de sub-items van de **actieve** hoofdpagina uitklappen; de rest één regel | B |
| NAV-3 ★ | RAPPORT-knop onderin de sidebar weg (dubbelt met Rapportages-item erboven) — minstens in Eenvoudig | D |
| NAV-4 | "Tips & acties" + "Berichten" samenvoegen tot één ingang "Voor jou · N" (tips als tab in het berichtencentrum); Nieuws blijft apart. Raakt de IA → apart besluit | D |
| NAV-5 | € 1,1M-badge naast "Het Overzicht" in Eenvoudig weg (cijfer zonder context; staat 2× op de pagina zelf) | B |
| NAV-6 | Mobiele topbar in Eenvoudig: de 4 naamloze statuspunten vervangen door het bestaande éne `PageStatusDot`-patroon | E |

## 7 · Voorstellen per pagina

### /overzicht

Nu (Eenvoudig): welkomstgids + groet + 4 hefboomtegels mét €-KPI en substatusregel + statuslegenda + gezondheidsscore + vermogensgrafiek (4-delige legenda) + briefing (3) + 3 "alles bekijken"-links.

| # | Voorstel | Cat |
|---|---|---|
| OVZ-1 ★ | `HefbomenLegenda` (3 statuslabels) in Eenvoudig weg — de uitleg hoort eenmalig in de pagina-'i' | B |
| OVZ-2 | Hefboomtegels in Eenvoudig zonder substatusregel en zonder "excl. eigen woning · €X" (hoofdcijfer + statuspunt volstaan; detail op de duwpagina) | B |
| OVZ-3 | De 3 "alles bekijken"-links onderaan → 0 in Eenvoudig (de nav heeft ze al) | D |
| OVZ-4 ★ | Grafieklegenda in Eenvoudig: "Historisch / Projectie / Onzekerheid (P40–P60) / Tot 90" → lijn + "bandbreedte"; "tot 90" naar de 'i' | E |
| OVZ-5 | Inspiratiekaarten (CompoundInsight/FeeImpact): max 1 tegelijk in Eenvoudig, met de bestaande verbergknop | C |

### /overzicht/bezittingen & /overzicht/schulden

Al goed: strip-reductie + pill-lijst. Rest:

| # | Voorstel | Cat |
|---|---|---|
| BEZ-1 | "Herwaarderen"-knop alleen Volledig (beheer-diepte); "Bezitting toevoegen" blijft | A |
| BEZ-2 | Categoriefilter pas tonen vanaf ~8 items | C |
| BEZ-3 | Schulden-strip in Eenvoudig 3→2 (Totale schuld + Maandlasten; "Rente gewogen" → Volledig) — valt onder APP-7 | B |
| BEZ-4 | Verdiepings-tabs (`?tab=` aandelen-/crypto-holdings, verhuurrendement, hypotheekplanner) alleen Volledig; in Eenvoudig de gewone categorielijst — consistent met NAV-1 | A |

### /overzicht/cashflow (hub)

Nu (Eenvoudig): 4 landing-cards met KPI + rekening-pills + maandbanner; geldstroomblok en snelle acties al verborgen.

| # | Voorstel | Cat |
|---|---|---|
| CF-1 ★ | De 4 kaarten in Eenvoudig compact (one-liner, zoals /toekomst) — nu is alleen de chevron weg | B |
| CF-2 ★ | **Forecast-kaart in Eenvoudig verbergen** (4→3); route blijft bereikbaar. Forecast is geen landingsbelofte — de toekomst leeft op /toekomst | A |
| CF-3 | Maandcijfers venster-labelen: "€ 0 ontvangen **in augustus tot nu toe**" — voorkomt verwarring naast de 30-dagen-cijfers op transacties (zelfde les als ADR 0073) | E |
| CF-4 | Instellingenblok als disclosure, standaard dicht | C |

### /overzicht/cashflow/budget

Al goed: strip 4→2, pill-weergave geforceerd, partner-potten en Nibud verborgen.

| # | Voorstel | Cat |
|---|---|---|
| BUD-1 ★ | Periodeschakel in Eenvoudig alleen MAAND (YTD / 12 MND → Volledig) | B |
| BUD-2 | "Kopieer vorige maand" + "Rapport" alleen Volledig | A |
| BUD-3 | BudgetHub-samenvatting in Eenvoudig terug tot één regel ("1 bijna vol, € 2.540 te verdelen") + disclosure; overige hub-blokken (alerts, dekkingsgraad, inzichten) op klik | C |

### /overzicht/cashflow/transacties (+ grenzenpotten)

Al goed: 6 analyseblokken verborgen. Maar vóór de inhoud staan nog: koppel-banner (ook als alles al gekoppeld is) + 3 actieknoppen + 4 periode-tabs.

| # | Voorstel | Cat |
|---|---|---|
| TXN-1 ★ | Actie-rij in Eenvoudig: 1 primaire knop ("Nieuwe transactie") + "…"-menu (importeer, bank koppelen); koppel-banner alleen tonen zolang er 0 rekeningen gekoppeld zijn | B |
| TXN-2 | Periode-tabs in Eenvoudig 4→2 (30 dagen / jaar) | B |
| TXN-3 | Grenzenpotten-periodetabs (maand/kwartaal/jaar) in Eenvoudig alleen maand | B |
| TXN-4 | Rekening-tabs: lange namen afkappen op korte labels | E |

### /overzicht/cashflow/vaste-lasten & /forecast

Vaste lasten al goed (kalender + insights verborgen). Forecast heeft geen enkele Eenvoudig-reductie.

| # | Voorstel | Cat |
|---|---|---|
| FC-1 | Forecast-pagina in Eenvoudig: 6-maands tabel → eindregel ("Over 6 maanden ± € X") + sparkline; tabel in Volledig | B |

### /overzicht/belasting (+ boxen + optimizer)

Al goed: katernen III/IV/V verborgen, Box 1/2/3-detail grotendeels dicht.

| # | Voorstel | Cat |
|---|---|---|
| BEL-1 ★ | **Box 2-kaart alleen tonen bij aanmerkelijk belang** — voor álle modi; nu staat er permanent een kaart met "—" | D |
| BEL-2 | Optimizer-pagina in Eenvoudig: alleen katern II (de vergelijking op één as) + voetnoten; Standing/Details/Levenslang en de sorteermodus → Volledig. De "NIEUW"-badge op de hub-tegel vervalt na 1 kwartaal | B |
| BEL-3 | Hefboomtegel-substatus "Verken je Box 3-positie" → gewone taal ("Mogelijk betaal je meer dan nodig") | E |
| BEL-4 | Box 1-strip in Eenvoudig 4→2 (effectief tarief + netto besteedbaar) — valt onder APP-7 | B |

### /toekomst (+ subpagina's)

Het voorbeeld. Restpunten:

| # | Voorstel | Cat |
|---|---|---|
| TOE-1 | Chips-rij boven de grafiek in Eenvoudig: alleen "Levensgebeurtenissen · N" (Wat-als/mijlpalen/Pad-toggle → Volledig) | B |
| TOE-2 | /toekomst/doelen: de tweedeling "Jouw doelsituatie" vs "Handmatige doelen" in Eenvoudig als één lijst "Je doelen" (de technische herkomst interesseert de gebruiker niet) | E |
| TOE-3 | /toekomst/voorkeuren in Eenvoudig: 5 regels → 2 (eindstrategie + onttrekkingsstrategie); verdeel-/afbouwregels → Volledig | B |

### /berichten & /nieuws

Negeren de modus; zijn al relatief kalm.

| # | Voorstel | Cat |
|---|---|---|
| BER-1 | Dichtheids-toggle (ruim/compact) alleen Volledig | B |
| BER-2 | Feedback-ingang kiezen: chat-megafoon ("melden vanuit je gesprek") als enige route; /mijn/feedback verwijst ernaar | D |
| NWS-1 | Krant-masthead in Eenvoudig: alleen datum + "N artikelen" (editienummer, jaargang, "N bronartikelen" → Volledig) | B |

### /mijn (+ subpagina's)

| # | Voorstel | Cat |
|---|---|---|
| MIJN-1 ★ | Subnav-tabbalk **niet op de hub** tonen (dupliceert het kaartengrid exact); op subpagina's blijft hij | D |
| MIJN-2 | Kaarten "Geavanceerd" en "Check-ins" alleen Volledig (grid 9→7) | A |
| MIJN-3 | /mijn/notificaties in Eenvoudig: 3 hoofdschakelaars (briefing-mail, meldingen in app, e-mail) + "Alle meldingstypen"-disclosure; partner-blok alleen bij huishouden | B |
| MIJN-4 | /mijn/privacy: de 7 AI-uitvoeringsgroepen in Eenvoudig standaard ingeklapt achter één samenvattende regel | C |
| MIJN-5 | Weergavekeuze-blok toevoegen → APP-1 | F |

### /onboarding

13 stappen / 8 groepen, inclusief bezittingen-loop, schulden-loop en UPO-parse — terwijl de welkomstgids in de app daarna hetzélfde nog eens vraagt, en de landing "je eerste Vrijheidsrapport in 5 minuten" belooft.

| # | Voorstel | Cat |
|---|---|---|
| ONB-1 | Onboarding inkorten tot ±5 vragen (naam, geboortedatum, inkomen, uitgaven, spaardoel/eindstrategie) → direct de app in; bezittingen/schulden/pensioen doet de welkomstgids (die bestaat al en doet dit beter, in context). Groot besluit → business-owner + ADR | D |

### Command palette

| # | Voorstel | Cat |
|---|---|---|
| CMD-1 ★ | Copy-fix → APP-3 | E |
| CMD-2 | "Uitloggen" uit de acties (staat al in sidebar én accountmenu) zodat alle resterende acties binnen de zichtbaarheids-cap van 5 vallen. **Let op:** de werkboom bevat hier al ongecommitte wijzigingen van de parallelle sessie — eerst afstemmen | D |

## 8 · Besloten faseplan (9 aug 2026)

Per fase één kaart in de Notion-werkqueue (🧩 Trifinity), status **Backlog** — zet de CC-actie op "3. Implementatie akkoord" om een fase door de queue te laten oppakken.

| Fase | Inhoud | Prio | Notion |
|---|---|---|---|
| **1 · Keuze vindbaar + eerste scherm** ✅ *opgeleverd 9 aug 2026* | APP-1, APP-2 *(in bestáánd welkomstscherm)*, APP-3 ⚠, APP-6, OVZ-1, OVZ-2, OVZ-3, OVZ-4 | P1 | [kaart](https://app.notion.com/p/3b7f9e8d568a819c8c39f9a8acf8d350) |
| **2 · Cashflow-gezin + cijfernormen** | APP-7 (incl. BEZ-3 + BEL-4), APP-5, CF-1…4, BUD-1, BUD-2/3, TXN-1, TXN-2/3, TXN-4, FC-1 | P1 | [kaart](https://app.notion.com/p/3b7f9e8d568a817eb1a8f34bc77d272a) |
| **3 · Bezittingen, belasting & toekomst** ✅ *opgeleverd 9 aug 2026* | BEZ-2, BEZ-4, BEL-1 *(alle modi)*, BEL-2, BEL-3, TOE-2, TOE-3 | P2 | [kaart](https://app.notion.com/p/3b7f9e8d568a8129984bc17a469cb687) |
| **4 · Mijn, berichten & navigatie** ✅ *opgeleverd 9 aug 2026* | MIJN-1, MIJN-3, MIJN-4, NAV-2 ⚠, NAV-5 ⚠, NAV-6, BER-1, NWS-1 | P2 | [kaart](https://app.notion.com/p/3b7f9e8d568a81aaab9cf58222fa97b7) |
| **5 · Verkenningen + uitvoering besluit** ✅ *verkenning én implementatie opgeleverd 9 aug 2026* | NAV-4 ("Voor jou"-ingang) + BER-2 (één feedback-ingang) → voorstel + ADR → besluit → gebouwd | P3 | [kaart](https://app.notion.com/p/3b7f9e8d568a81ada57cd7194875b721) |

**Uitkomst fase 5, stap 1 (verkenning)** — twee verkenningen + twee concept-ADR's, beide voorgelegd als go/no-go.

**Uitkomst fase 5, stap 2 (besluit JP, 9 aug 2026)** — beide aanbevelingen gevolgd; ADR 0095 en 0096 staan op `aanvaard` en zijn dezelfde dag geïmplementeerd:

- **NAV-4** → `docs/verkenning-voor-jou-ingang.md` + `docs/adr/0095-voor-jou-ingang-tips-en-berichten.md`. Besluit: **niet samenvoegen**. De dubbeling bestaat alleen op de desktop-sidebar, er waren nooit twee badges (één getal + twee stipjes), en één "Voor jou · N" zou een afgeleide meldingstroom moeten optellen bij DB-rijen met een eigen levenscyclus. In plaats daarvan is het échte gat gerepareerd: **"Tips & acties" staat nu in `globalNav`** en is dus vindbaar in de mobiele nav-sheet. Tips & acties en Berichten blijven gescheiden ingangen; geen gedeelde badge. `/overzicht/tips` is uit `EXTRA_ROUTE_TITLES` gehaald (die map is voor routes búiten de nav-structuur) — de titel komt nu uit `globalNav`.
- **BER-2** → `docs/verkenning-een-feedback-ingang.md` + `docs/adr/0096-een-feedback-ingang.md`. Besluit: **doen**. `/mijn/feedback` is nu een **verwijspagina** met één primaire actie die de chat rechtstreeks in meldmodus opent (nieuwe `openMelding()` op de chat-context); `POST /api/feedback` antwoordt met **410 Gone** via de nieuwe `gone()`-helper in `lib/api/respond.ts` — bewust geen 404, dat leest als defect. Tabel `feedback` en `/beheer/feedback` blijven staan als **archief** (de tabel zit in de AVG-export en heeft geen eigen-rij DELETE-policy), inclusief een kop/omschrijving die dat zegt. Categorie-afbeelding `bug` → bug, `vraag` → vraag, `idee` → aanbeveling; **`overig` krijgt bewust geen opvolger**. Geen migratie.

**Restpunt fase 5:** `npm run arch:diagram` is niet gedraaid — `docs/architecture/architecture.json` draagt ongecommitte wijzigingen van de parallelle sessie. Draaien op een schone tree bij de release-stap; de ADR-frontmatter van 0095/0096 wordt dan als architectuurfeit opgepikt.

⚠ = raakt bestanden met ongecommit werk van de parallelle sessie (command-palette, sidebar) — eerst afstemmen.

**Afgevallen (bewust niet doen):** APP-4 (ontdek-voetregel; geen-hints-keuze uit ADR 0026 blijft), OVZ-5, NAV-1 (APPS-blok blijft), NAV-3 (RAPPORT-knop blijft), BEZ-1 (herwaarderen blijft), TOE-1 (grafiek-chips blijven), MIJN-2 (Geavanceerd/Check-ins-kaarten blijven), ONB-1 (onboarding blijft), CMD-2 (uitloggen blijft in ⌘K).

## 9 · Technische kanttekeningen

1. **DepthSection**: ongebruikt. Kies — inzetten voor alle C-voorstellen (inklappen-met-behoud, zoals ADR 0026 bedoelde) óf verwijderen. Niet laten liggen.
2. ~~**ADR 0026 bijwerken** zodra APP-1/APP-4 landen~~ — **gedaan** (9 aug 2026): ADR 0026 heeft een aanvulling die de `/mijn/uiterlijk`-ingang vastlegt, het geen-hints-beleid bevestigt (APP-4 afgewezen) en het "mechanisme-only"-punt als achterhaald markeert.
3. **Geen nieuwe rekenpaden**: alle B-voorstellen zijn presentatie-reductie — consumeren uit dezelfde bundel/engine (consume, don't recompute); nergens een cijfer "vereenvoudigd herberekenen".
4. **Werkboom**: `command-palette`, `sidebar.tsx` en horizon-bestanden hebben ongecommitte wijzigingen van een parallelle sessie — voorstellen die die bestanden raken (CMD-2, NAV-*) pas na afstemming oppakken. *(9 aug 2026, fase 4: NAV-5 is als geïsoleerde diff van 4 regels bovenop het ongecommitte euro-weergave-werk in `sidebar.tsx` geland — geen overlap met dat blok.)*
5. **UAT**: fase 1-wijzigingen raken geteste zones (overzicht, cashflow, budget) → uat-docs-keeper meenemen in dezelfde PR's. *(Fase 4 heeft WF-MIJN-01/20/30 en WF-NAV-06/10 in dezelfde stap bijgewerkt.)*
6. **NAV-2 zat niet waar de audit 'm zocht** (9 aug 2026): de desktop-`Sidebar` klapte structureel al alleen de actieve module uit (`isActive && isEnabled`-gate op `SubTagStrip`; de `dimmed`-prop stond nergens op `true`). Waar élke tak wél altijd openstond is de **`NavMenuSheet`** — daar is de reductie geland. De sidebar-regel is vastgelegd met een regressietest i.p.v. met code die niets zou doen.
7. **DepthSection is niet meer ongebruikt** (punt 1 hierboven): fase 2 zette 'm in voor CF-4, fase 4 voor MIJN-3 (Alle meldingstypen) en MIJN-4 (AI-uitvoeringsgroepen). Het patroon staat: in Eenvoudig gemónt met titel + samenvatting, in Volledig rendert de bestaande boom onveranderd.

---

*Elke wijziging afzonderlijk klein houden: per voorstel één kaart, route via de kleine-aanpassing- of extend-feature-pijplijn; de Eenvoudig-varianten hergebruiken bestaande primitieven (`HideInSimple`, `compact`-prop van leverage-card, `FiguresStrip`-props, `DepthSection`).*
