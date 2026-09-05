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
2. **Eenvoudig snijdt de diepte, niet de drukte.** De reductie zit vrijwel volledig ónder de vouw (katernen, analyses, grafieken). De bovenkant van /overzicht is in beide modi bijna identiek: welkomstgids (5 schermen × 4 kaarten) + groet + 4 hefboomtegels + legenda + gezondheidsscore + vermogensgrafiek + briefing + 3 "alles bekijken"-links. Op mobiel is het **hele eerste scherm** welkomstgids. Daar ontstaat de overweldiging, niet in katern III van Box 3. *(Nagekomen, 28 aug 2026: de remedie hierop — APP-6 — was een halve. Comprimeren maakte de gids kleiner maar liet hem bóven de begroeting staan; H20/S13 verplaatst hem alsnog en maakt hem minimaliseerbaar. Zie de ADR 0026-aanvulling van 28 aug 2026.)* *(Nagekomen, 5 sep 2026: ook dát bleek een halve remedie — de gids bleef het eerste wat je zag. ADR 0130 haalt hem van /overzicht af: hij woont nu bij Fin, en het welkom is een korte rondleiding met eigen cijfers.)*
3. **De dekking is ongelijk.** /toekomst is het voorbeeld (3 platte kaarten, 3 KPI's, geen fasebalk/playback); Box 1/2/3 en transacties zijn goed gereduceerd. Maar /mijn (9 kaarten + duplicerende tabbalk), notificaties (8 typen + 4 partner-modi), doelen, forecast, de sidebar, de welkomstgids en de mobiele topbar (4 losse statuspunten) negeren de modus volledig.
4. **Jargon lekt door in Eenvoudig.** "Onzekerheid (P40–P60)", "YTD", "Verken je Box 3-positie", editienummers/jaargang in de krant-masthead. De doelgroep van Eenvoudig is precies wie dit afschrikt.
5. **Er zijn dubbele ingangen.** Tips & acties / Berichten / Nieuws / briefing = vier plekken voor "wat vraagt aandacht"; /mijn-tabbalk dupliceert het kaartengrid; RAPPORT-knop naast /rapportages; feedback via chat-megafoon én /mijn/feedback; onboarding vraagt bezittingen/schulden die de welkomstgids daarna nóg eens vraagt.
6. **Technisch dood hout.** `DepthSection` (inklappen-met-behoud, het oorspronkelijke ADR 0026-idee) wordt nergens gebruikt; alles is `HideInSimple` (hard weg). De ⌘K-omschrijving ("Diepte-secties standaard tonen of inklappen") beschrijft gedrag dat niet bestaat.

## 3 · Wat al goed staat (het patroon om te herhalen)

- **/toekomst in Eenvoudig** is de norm: compacte one-liner-kaarten (`leverage-card` met `compact`-prop), KPI's 4→3, bediening weg, detail achter kassabon-sheets.
- `FiguresStrip`-reductie (bezittingen 4→1, budget 4→2), pill-lijsten i.p.v. kaart-grids, budget geforceerd op pill-weergave, transacties-analyse van ~8 blokken naar gauge + tijdlijn, Box 3-katernen verborgen.
  *(Herzien 28 aug 2026 — S11: "bezittingen 4→1" hoorde hier niet. Het was géén `SIMPLE_MAX_FIGURES`-reductie maar een handgerolde call-site-ternary met twee losse arrays — het derde mechanisme dat ADR 0026 juist verbiedt — en de één cel die overbleef was niet gewogen: het eigen rendement viel weg terwijl de beheerkosten-teaser eronder bleef staan. Nu één array + `simpleFigures`, dus 4→2 conform de norm.)*
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
| APP-6b ★ | **Welkomstgids verpláátsen** (nágekomen, 28 aug 2026 — H20/S13): comprimeren behandelde de ómvang, niet de hiërarchie. De gids (en de check-in) zakken onder de begroeting, en het kruisje minimaliseert ze tot een knopje naast de pagina-`i` i.p.v. ze weg te gooien. Zie de ADR 0026-aanvulling van 28 aug 2026. *Afgesloten 5 sep 2026 door ADR 0130: de gids staat niet meer op /overzicht maar in de Fin-chat (APP-6 en APP-6b zijn daarmee vervallen als constraint).* | B |
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
| OVZ-2 ⟲ | Hefboomtegels in Eenvoudig zonder substatusregel en zonder "excl. eigen woning · €X" (hoofdcijfer + statuspunt volstaan; detail op de duwpagina) | B |
| OVZ-3 | De 3 "alles bekijken"-links onderaan → 0 in Eenvoudig (de nav heeft ze al) | D |
| OVZ-4 ★ | Grafieklegenda in Eenvoudig: "Historisch / Projectie / Onzekerheid (P40–P60) / Tot 90" → lijn + "bandbreedte"; "tot 90" naar de 'i' | E |
| OVZ-5 | Inspiratiekaarten (CompoundInsight/FeeImpact): max 1 tegelijk in Eenvoudig, met de bestaande verbergknop | C |
| OVZ-5b ★ | **OVZ-5 alsnog uitgevoerd, beperkt** (28 aug 2026 — S11, besluit eigenaar): de beheerkosten-simulator gaat naar Volledig, de samengestelde-rente-kaart blijft. Daarmee staat er in Eenvoudig hóógstens één inspiratiekaart, en pas ná de figures-strip. Niet uitgevoerd: verdere herordening of een tweede verbergknop | C |

> **⟲ OVZ-2 is op 28 aug 2026 gedeeltelijk teruggedraaid (kaart S1, release R5).**
> Richtingsbesluit van de eigenaar voor heel R5: **duiding boven reductie** —
> Eenvoudig moet niet mínder tonen maar begrijpelijker tonen. De substatusregel
> is dáárom terug, en zelfs primair: het oordeel in gewone taal ("Hoge
> schuldenlast") staat waar eerst het bedrag stond, het bedrag zakt naar een
> gedempte regel eronder. Aanleiding waren drie bevindingen die de
> oorspronkelijke rechtvaardiging ondergroeven: (a) "detail op de duwpagina"
> gold alléén bij warn/bad — `buildInfo()` geeft `null` bij good/neutral, dus
> positieve bevestiging was nérgens bereikbaar; (b) de status-dot was
> `aria-hidden` met een hover-only `title`, dus met de substatusregel weg was
> kleur het enige signaal — WCAG 2.2 §1.4.1, en op touch helemaal niets; (c) met
> privacy-masking erbovenop hield een tegel over: icoon + label + `••••` + een
> puntje.
> **Wat van OVZ-2 blijft staan:** de "excl. eigen woning · €X"-regel en de
> chevron/drill-down blijven in Eenvoudig weg — grondslag-detail respectievelijk
> diepte, geen oordeel.

### /overzicht/bezittingen & /overzicht/schulden

Al goed: strip-reductie + pill-lijst. Rest:

| # | Voorstel | Cat |
|---|---|---|
| BEZ-1 | "Herwaarderen"-knop alleen Volledig (beheer-diepte); "Bezitting toevoegen" blijft | A |
| BEZ-2 | Categoriefilter pas tonen vanaf ~8 items | C |
| BEZ-3 | Schulden-strip in Eenvoudig 3→2 (Totale schuld + Maandlasten; "Rente gewogen" → Volledig) — valt onder APP-7 | B |
| BEZ-4 | Verdiepings-tabs (`?tab=` aandelen-/crypto-holdings, verhuurrendement, hypotheekplanner) alleen Volledig; in Eenvoudig de gewone categorielijst — consistent met NAV-1. **Nazorg M41 (28 aug 2026):** BEZ-4 (aangenomen) en NAV-1 (afgewezen) botsten in combinatie — het Apps-blok bleef zichtbaar én linkte rechtstreeks naar de `?tab=`-deeplink, dus één klik in Eenvoudig landde alsnog in de verdiepingstab. Opgelost door de nav-hrefs kaal te maken (`OVERVIEW_APP_SUBROUTES.href`); de deeplink leeft nu apart als `tabHref` voor het commandopalet. Beide besluiten blijven overeind. | A |

### /overzicht/cashflow (hub)

Nu (Eenvoudig): 4 landing-cards met KPI + rekening-pills + maandbanner; geldstroomblok en snelle acties al verborgen.

| # | Voorstel | Cat |
|---|---|---|
| CF-1 ★ | ~~De 4 kaarten in Eenvoudig compact (one-liner, zoals /toekomst)~~ — **TERUGGEDRAAID 28 aug 2026 (S4).** De one-liner was reductie zónder duiding: de H1 vroeg "Hoeveel vrijheid zet je elke maand opzij?" en Eenvoudig antwoordde met drie kale navigatieknoppen — geen cijfer, geen oordeel, geen status-dot. Onder het R5-richtingsbesluit *duiding boven reductie* dragen de kaarten in Eenvoudig nu de `verdict`-variant van `LeverageCard`: oordeel primair, kerngetal mét venster secundair, status-dot terug. Volledig ongewijzigd | B |
| CF-2 ★ | ~~**Forecast-kaart in Eenvoudig verbergen** (4→3)~~ — **TERUGGEDRAAID 28 aug 2026 (S5).** Het argument was "Forecast is geen landingsbelofte", maar de schade was een kapotte verwijsketen: op mobiel is deze kaart de énige contextuele ingang naar /overzicht/cashflow/forecast — het `Cashflow`-item in `lib/nav-config.ts` heeft geen `children`, dus de NavMenuSheet toont de sub-pagina's niet. En sinds FC-1 (9 aug 2026) heeft die pagina een eigen Eenvoudig-vorm, dus verviel de reden om er niet naartoe te wijzen. Alle vier de kaarten staan nu in béide modi; de route is nooit verborgen geweest en blijft dat | A |
| CF-3 | Maandcijfers venster-labelen: "€ 0 ontvangen **in augustus tot nu toe**" — voorkomt verwarring naast de 30-dagen-cijfers op transacties (zelfde les als ADR 0073). **HERZIEN 28 aug 2026 (S4): weer in BEIDE modi, en in Eenvoudig verplicht op élke kaart.** De herziening van 10 aug ("alleen in Volledig") hing het venster aan het cijfer — *"in Eenvoudig draagt de compacte kaart sinds CF-1 géén cijfer meer, dus valt met het cijfer ook de reden voor het venster weg"* — en verviel toen S4 het cijfer terugbracht. Waar `card.kpiWindow` leeg is, levert de call-site een vaste venster-copy (budget: "nog te besteden deze maand"; vaste lasten: de quote als meetlat). Gating zit op de call-site (`cashflow-landing-cards.tsx`), niet in de gedeelde `LeverageCard` | E |
| CF-5 | **Nieuw 28 aug 2026 (S4).** Privacy-masking op het hub-kaartenpad — dat ontbrak volledig: `buildCashflowCards` formatteert de bedragen server-side tot strings, waar `MaskedAmount`/`formatMaskedCurrency` (die een `number` willen) niet bij kunnen. Opgelost met `maskCurrencyInText` (`lib/format.ts`) op KPI, meetlat, substext en drill-down, in béide modi. Zonder dit zouden de teruggezette cijfers zich óók met de privacy-toggle aan laten zien | E |
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
| TXN-1 ★ | **Herzien 28 aug 2026 (M40).** Actie-rij in Eenvoudig: de drie vul-routes staan in de rij ("Nieuwe transactie", "Importeer transacties", "Bank koppelen"); alleen "Zoeken en bulkbewerken" zit achter het "…"-menu. Koppel-banner blijft: alleen tonen zolang er 0 rekeningen gekoppeld zijn. — *Oorspronkelijk (9 aug 2026) precies omgekeerd: 1 primaire knop + importeer/bank-koppelen in het "…"-menu. M40 weerlegde de aanname "beheer-acties die je zelden doet": Eenvoudig is de default voor nieuwe accounts, en de KoppelRekeningBanner dekt alleen de 0-rekeningen-stand — juist ná de eerste rekening begint het vervolg-vullen. Zoeken en bulkbewerken is expertgereedschap en verhuisde daarom naar het menu.* | B |
| TXN-2 | Periode-tabs in Eenvoudig 4→3 (30 dagen / maand / jaar) — herzien 10 aug 2026 na melding testgebruiker: de reductie stond eerst op 2 (30 dagen / jaar), maar de kalendermaand is de eenheid waarin mensen hun uitgaven lezen én Eenvoudig is de standaard voor nieuwe profielen. Alleen kwartaal blijft Volledig-only. | B |
| TXN-3 | Grenzenpotten-periodetabs (maand/kwartaal/jaar) in Eenvoudig alleen maand | B |
| TXN-4 | Rekening-tabs: lange namen afkappen op korte labels | E |
| TXN-5 ★ | **Nieuw 28 aug 2026 (S3).** Met de zes analyseblokken verborgen was de `GeldstroomGauge` het enige duidingselement dat in Eenvoudig overbleef — een naald op een −100…+100-schaal, zonder trend of vergelijking eromheen die 'm leesbaar maakt. In Eenvoudig staat daar nu `GeldstroomZin`: dezelfde Inkomen/Uitgaven/Saldo-strip, duiding in woorden, en géén spaarquote zolang het venster loopt. In Volledig blijft de meter, mét een venster-onderschrift ("augustus tot nu toe") — die ontbrak, terwijl de status-melding erboven op een ánder venster draait (kalendermaand vs. het gekozen periodevenster). Bewust NIET meegenomen: het ongeclampte leescijfer en de 0%-bij-geen-inkomen — dat is bevinding C6 en moet in Volledig reproduceerbaar blijven | B |

### /overzicht/cashflow/vaste-lasten & /forecast

**Herzien 28 aug 2026 (S2).** Het oordeel "Vaste lasten al goed (kalender + insights
verborgen)" is ingetrokken. Verbergen wás hier geen winst: Eenvoudig hield het lángste
element over (de volle postenlijst) en verloor juist de korte blokken die er betekenis
aan gaven — de quote met Nibud-context en het abonnementen-sluipverbruik mét opzegknop.
Dat is precies de fout die het richtingsbesluit van R5 benoemt: **duiding boven
reductie**. Forecast: zie FC-1 (uitgevoerd) en S5.

| # | Voorstel | Cat |
|---|---|---|
| VL-1 ★ | **Nieuw 28 aug 2026 (S2).** Eenvoudig = oordeel vóór lijst: oordeelregel (feit + Nibud-norm, stoplichtwoord uit `LEVERAGE_STATUS_LABEL`) i.p.v. de compacte meter, dan quote-meter + sluipverbruik + top-5 grootste posten; de volle lijst achter DepthSection "Alle {n} posten". Volledig ongewijzigd. Copy-rollen gescheiden: deck = feit, `PageStatusBanner` = handeling | B |
| FC-1 | Forecast-pagina in Eenvoudig: 6-maands tabel → eindregel ("Over 6 maanden ± € X") + sparkline; tabel in Volledig | B |
| FC-2 | **Nieuw 28 aug 2026 (S5, V2).** `CashflowSection` (bovenaan /overzicht/cashflow/forecast) was het enige blok op die route dat de modus negeerde: drie kale KPI-kaarten met twee losse percentages. In Eenvoudig nu één kaart — het maandbedrag blijft (dát beantwoordt de pagina-vraag), de spaarquote en de uitgaventrend worden zinnen mét hun venster erin. Percentage en zin staan op één afleiding, zodat ze elkaar niet kunnen tegenspreken. Volledig ongewijzigd; `forecast-fallback.tsx` beweegt mee | B |

### /overzicht/belasting (+ boxen + optimizer)

Al goed: katernen III/IV/V verborgen, Box 1/2/3-detail grotendeels dicht.

| # | Voorstel | Cat |
|---|---|---|
| BEL-1 ★ | **Box 2-kaart alleen tonen bij aanmerkelijk belang** — voor álle modi; nu staat er permanent een kaart met "—" | D |
| BEL-2 | Optimizer-pagina in Eenvoudig: alleen katern II (de vergelijking op één as) + voetnoten; Standing/Details/Levenslang en de sorteermodus → Volledig. De "NIEUW"-badge op de hub-tegel vervalt na 1 kwartaal | B |
| BEL-3 | Hefboomtegel-substatus "Verken je Box 3-positie" → gewone taal ("Mogelijk betaal je meer dan nodig"). *Nagekomen (UR2-04, 31 aug 2026):* die zin gold voor good/warn/bad tegelijk, dus een groene Belasting-hefboom droeg de waarschuwing. Het oordeel volgt nu de status; de hedge blijft op `warn`. | E |
| BEL-4 | Box 1-strip in Eenvoudig 4→2 (effectief tarief + netto besteedbaar) — valt onder APP-7 | B |
| BEL-5 | *(nagekomen, S12 · 28 aug 2026)* De jaarruimte-rekensom stond **twee keer** op de pagina (uitlegblok + kaartvoet) en de Wft-regel drie keer. Formule + referentiewaarde-staart zijn uit de kaartvoet weg (Wft-regel blijft daar); de rekensom is nu modus-afhankelijk in `jaarruimte-rekensom.tsx`: Volledig inline, Eenvoudig één gewone zin + uitklap "Zo rekenen we je jaarruimte". Sectie IV blijft buiten `HideInSimple` — `#jaarruimte-uitleg` is een live deeplink-doel. | B/E |
| BEL-6 | *(nagekomen, S14 · 28 aug 2026)* De twee tariefcellen in **katern I van de hub** ("Effectief" / "Marginaal", `hub-totale-druk.tsx`) waren nooit een `FiguresStrip` geworden en bleven daarom buiten APP-7's bereik — de stripnorm kan een handgerolde cel-rij structureel niet zien. In Eenvoudig staat daar nu één beslisbare zin ("van elke euro die je extra verdient, houd je ongeveer N cent over"), met een verplicht null-pad zonder bekend inkomen. Volledig blijft ongewijzigd. Nieuwe primitive: `components/app/swap-in-simple.tsx` — het derde lid naast `HideInSimple` en `DepthSection`, zodat "toon A i.p.v. B" niet langer een onvindbare call-site-ternary is. **Bewust hub-only**: BEL-4 blijft staan op box1 (het marginale tarief blijft daar expert-diepte); de tegenspraak hub↔box1 is een eigenaarskeuze, geen omissie. | B/E |
| BEL-7 | *(nagekomen, S14 · 28 aug 2026)* Katern I maskeerde niet onder de privacymodus — het hero-bedrag en de euro-legenda van de verdeelstaaf stonden onder het oog-icoon gewoon in beeld terwijl `HubKansen` ernaast al maskeerde. Oorzaak structureel: beide waren server-components. Opgelost via `MaskedAmount` (hero) en door `verdeling-staaf.tsx` client te maken met `useMaskedAmounts()` (legenda + segment-tooltip); percentages en balkverhoudingen blijven zichtbaar. Werkt door op box3-mix en box3-opbouw, die dezelfde staaf gebruiken. | — |
| BEL-8 | *(nagekomen, UR2-16d · 31 aug 2026)* Binnen **box3-detail** was de katern-gating inconsistent: de HideInSimple-uitrol (b9ab63429) verborg 3.3 heffingsvrij, 3.4 mix, 3.5 peildatum, 3.10 stelsel-2028 en de partner-blokken, maar sloeg de tegenbewijs-simulator (3.2 ★) over — zonder dat dit ergens als curatiekeuze staat. Toch **niet** alsnog `HideInSimple`: de kaart is een bedieningsvlak (rendement-schuif + "Voeg toe als actie") en deze pagina is de enige ingang ervoor, dus ADR 0026 (aanvulling fase 3-5) wijst hier `DepthSection` aan. Nu ingeklapt-maar-bereikbaar in Eenvoudig via `SwapInSimple` + `DepthSection`; Volledig rendert exact de bestaande boom. De kaart kreeg daarvoor een `embedded`-vorm (geen eigen kop/rand als het omhulsel de kop al draagt). Bewaakt door `box3-tegenbewijs-card.test.tsx`. | B/E |

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
| **2 · Cashflow-gezin + cijfernormen** ✅ *opgeleverd 9 aug 2026* | APP-7 (incl. BEZ-3 + BEL-4), APP-5 *(zie §10)*, CF-1…4, BUD-1, BUD-2/3, TXN-1, TXN-2/3, TXN-4, FC-1 | P1 | [kaart](https://app.notion.com/p/3b7f9e8d568a817eb1a8f34bc77d272a) |
| **3 · Bezittingen, belasting & toekomst** ✅ *opgeleverd 9 aug 2026* | BEZ-2, BEZ-4, BEL-1 *(alle modi)*, BEL-2, BEL-3, TOE-2, TOE-3 | P2 | [kaart](https://app.notion.com/p/3b7f9e8d568a8129984bc17a469cb687) |
| **4 · Mijn, berichten & navigatie** ✅ *opgeleverd 9 aug 2026* | MIJN-1, MIJN-3, MIJN-4, NAV-2 ⚠, NAV-5 ⚠, NAV-6, BER-1, NWS-1 | P2 | [kaart](https://app.notion.com/p/3b7f9e8d568a81aaab9cf58222fa97b7) |
| **5 · Verkenningen + uitvoering besluit** ✅ *verkenning én implementatie opgeleverd 9 aug 2026* | NAV-4 ("Voor jou"-ingang) + BER-2 (één feedback-ingang) → voorstel + ADR → besluit → gebouwd | P3 | [kaart](https://app.notion.com/p/3b7f9e8d568a81ada57cd7194875b721) |

**Uitkomst fase 5, stap 1 (verkenning)** — twee verkenningen + twee concept-ADR's, beide voorgelegd als go/no-go.

**Uitkomst fase 5, stap 2 (besluit JP, 9 aug 2026)** — beide aanbevelingen gevolgd; ADR 0095 en 0096 staan op `aanvaard` en zijn dezelfde dag geïmplementeerd:

- **NAV-4** → `docs/verkenning-voor-jou-ingang.md` + `docs/adr/0095-voor-jou-ingang-tips-en-berichten.md`. Besluit: **niet samenvoegen**. De dubbeling bestaat alleen op de desktop-sidebar, er waren nooit twee badges (één getal + twee stipjes), en één "Voor jou · N" zou een afgeleide meldingstroom moeten optellen bij DB-rijen met een eigen levenscyclus. In plaats daarvan is het échte gat gerepareerd: **"Tips & acties" staat nu in `globalNav`** en is dus vindbaar in de mobiele nav-sheet. Tips & acties en Berichten blijven gescheiden ingangen; geen gedeelde badge. `/overzicht/tips` is uit `EXTRA_ROUTE_TITLES` gehaald (die map is voor routes búiten de nav-structuur) — de titel komt nu uit `globalNav`.
- **BER-2** → `docs/verkenning-een-feedback-ingang.md` + `docs/adr/0096-een-feedback-ingang.md`. Besluit: **doen**. `/mijn/feedback` is nu een **verwijspagina** met één primaire actie die de chat rechtstreeks in meldmodus opent (nieuwe `openMelding()` op de chat-context); `POST /api/feedback` antwoordt met **410 Gone** via de nieuwe `gone()`-helper in `lib/api/respond.ts` — bewust geen 404, dat leest als defect. Tabel `feedback` en `/beheer/feedback` blijven staan als **archief** (de tabel zit in de AVG-export en heeft geen eigen-rij DELETE-policy), inclusief een kop/omschrijving die dat zegt. Categorie-afbeelding `bug` → bug, `vraag` → vraag, `idee` → aanbeveling; **`overig` krijgt bewust geen opvolger**. Geen migratie.

~~**Restpunt fase 5:** `npm run arch:diagram` is niet gedraaid~~ — **gedaan** (9 aug 2026, commit `8a12ad0d3` "feiten opnieuw gescand na fase 2-5 en de twee nieuwe ADR's"). De ADR-frontmatter van 0095/0096 zit sindsdien als architectuurfeit in `docs/architecture/architecture.json`.

⚠ = raakt bestanden met ongecommit werk van de parallelle sessie (command-palette, sidebar) — eerst afstemmen.

**Afgevallen (bewust niet doen):** APP-4 (ontdek-voetregel; geen-hints-keuze uit ADR 0026 blijft), ~~OVZ-5~~ *(herzien 28 aug 2026 — S11: alsnog beperkt uitgevoerd, zie OVZ-5b. "Afgevallen" en de lof voor "bezittingen 4→1" stonden in twee losse secties en zijn nooit naast elkaar gelegd; samen leverden ze de inversie dat de hypothetische promo overleefde en het eigen cijfer niet)*, NAV-1 (APPS-blok blijft), NAV-3 (RAPPORT-knop blijft), BEZ-1 (herwaarderen blijft), TOE-1 (grafiek-chips blijven), MIJN-2 (Geavanceerd/Check-ins-kaarten blijven), ONB-1 (onboarding blijft), CMD-2 (uitloggen blijft in ⌘K).

## 9 · Technische kanttekeningen

1. ~~**DepthSection**: ongebruikt. Kies — inzetten voor alle C-voorstellen (inklappen-met-behoud, zoals ADR 0026 bedoelde) óf verwijderen. Niet laten liggen.~~ — **beslist: inzetten** (zie §9.7 hieronder en de derde aanvulling in ADR 0026). Drie oppervlakken draaien er sinds fase 2/4 op; het punt is hiermee gesloten.
2. ~~**ADR 0026 bijwerken** zodra APP-1/APP-4 landen~~ — **gedaan** (9 aug 2026): ADR 0026 heeft een aanvulling die de `/mijn/uiterlijk`-ingang vastlegt, het geen-hints-beleid bevestigt (APP-4 afgewezen) en het "mechanisme-only"-punt als achterhaald markeert.
3. **Geen nieuwe rekenpaden**: alle B-voorstellen zijn presentatie-reductie — consumeren uit dezelfde bundel/engine (consume, don't recompute); nergens een cijfer "vereenvoudigd herberekenen".
4. **Werkboom**: `command-palette`, `sidebar.tsx` en horizon-bestanden hebben ongecommitte wijzigingen van een parallelle sessie — voorstellen die die bestanden raken (CMD-2, NAV-*) pas na afstemming oppakken. *(9 aug 2026, fase 4: NAV-5 is als geïsoleerde diff van 4 regels bovenop het ongecommitte euro-weergave-werk in `sidebar.tsx` geland — geen overlap met dat blok.)*
5. **UAT**: fase 1-wijzigingen raken geteste zones (overzicht, cashflow, budget) → uat-docs-keeper meenemen in dezelfde PR's. *(Fase 4 heeft WF-MIJN-01/20/30 en WF-NAV-06/10 in dezelfde stap bijgewerkt.)*
6. **NAV-2 zat niet waar de audit 'm zocht** (9 aug 2026): de desktop-`Sidebar` klapte structureel al alleen de actieve module uit (`isActive && isEnabled`-gate op `SubTagStrip`; de `dimmed`-prop stond nergens op `true`). Waar élke tak wél altijd openstond is de **`NavMenuSheet`** — daar is de reductie geland. De sidebar-regel is vastgelegd met een regressietest i.p.v. met code die niets zou doen.
7. **DepthSection is niet meer ongebruikt** (punt 1 hierboven): fase 2 zette 'm in voor CF-4, fase 4 voor MIJN-3 (Alle meldingstypen) en MIJN-4 (AI-uitvoeringsgroepen). Het patroon staat: in Eenvoudig gemónt met titel + samenvatting, in Volledig rendert de bestaande boom onveranderd.

## 10 · Nazorg (11 aug 2026) — de drie halve items

De controle van 9-10 aug 2026 (artifact 9520032e, tegen commit `8a12ad0d3`) stelde vast dat alle 33 gekozen voorstellen zijn doorgevoerd en alle 9 afgevallen correct niet zijn aangeraakt. Drie voorstellen waren daarbij wél *geland* maar niet *afgerond*. Hun eindstand:

### APP-2 — afgemaakt

De weergavekeuze werd alleen genoemd in de welkomstgids op /overzicht (destijds `components/overview/welcome-guide-banner.tsx`; sinds ADR 0130 staat die zin in de gidsweergave in Fin, `components/app/chat/gids/gids-view.tsx`), niet op het onboarding-successcherm. Dat is nu wél zo: `components/onboarding/onboarding-success.tsx` draagt één regel onder de afsluiting van Fin — *"Rustig beginnen of meteen alle detail? Je weergave kies je later bij Mijn → Uiterlijk."*

Twee bewuste beperkingen op dat scherm, allebei technisch afgedwongen en niet cosmetisch:

- **Geen modus-afhankelijke tekst.** De `DisplayModeProvider` hangt uitsluitend in `app/(app)/layout.tsx`; het successcherm leeft in de `(onboarding)`-routegroep en zou daarbuiten stilzwijgend op de `'simple'`-fallback landen (de valkuil die ADR 0026 als waarschuwing vastlegt). De zin klopt daarom in beide standen.
- **Geen `<Link>`.** De CTA ernaast draait bewust `clearLocalStorage()` + een *harde* navigatie, omdat een soft-navigation vlak na het schrijven van `onboarding_completed` door de onboarding-poort teruggekaatst kan worden. Een klikbare route hiernaast zou die twee dingen omzeilen; een pad in tekst niet.

### APP-5 — bewust afgesloten, geen app-brede jargonregel

Fase 2 leverde twee call-site-fixes ("Onzekerheid (P40–P60)" → bandbreedte, "YTD" → dit jaar) maar géén vangrail zoals APP-7 die wél kreeg. Dat blijft zo, om twee redenen.

**De vangrail kan niet bestaan in de vorm die APP-7 wél had.** `SIMPLE_MAX_FIGURES` kon in de primitive omdat een `FiguresStrip` een geteld aantal cellen heeft. Jargon is vrije prose, verspreid over honderden componenten; de enige mechanische variant is een woordenlijst-grep, en die kan niet weten of een treffer in Eenvoudig *zichtbaar* is — dat hangt af van runtime-`HideInSimple`-nesting. Een gate die dat niet kan bepalen levert vals alarm op precies de plekken waar het jargon is toegestaan.

**En de twee resterende treffers staan buiten Eenvoudig.** Beide zijn nagelopen:

- De "Onzekerheid"-pil + `p25–p75`-tooltip staat op `/toekomst/whatif`. Die route zit in `SIMPLE_HIDDEN_NAV_HREFS` (`lib/nav-config.ts`) en is in Eenvoudig uit sidebar, nav-sheet én ⌘K gefilterd — een Volledig-oppervlak dus.
- `"(10e percentiel)"` in `components/app/horizon/phase-analysis/opbouw/monte-carlo-opbouw.tsx` zit in de fase-modal. De enige ingang daarheen is de `PhaseBar` in `horizon-client.tsx`, en die staat binnen `<HideInSimple>`. In Eenvoudig is het scherm dus onbereikbaar.

Het audit-voorstel zei zelf al "SWR/opnamerate blijft Volledig". Deze twee vallen in diezelfde categorie, en "Volledig blijft exact zoals het was" is een acceptatiecriterium. Ze worden dus **niet** herschreven. Komt er ooit percentiel-taal op een oppervlak dat in Eenvoudig wél zichtbaar is, dan is dat een gewone bevinding op dat oppervlak — niet het bewijs dat er een app-brede regel had moeten zijn.

#### Heropend voor de FISCALE scope (28 aug 2026, kaart S17)

De sluiting hierboven blijft staan voor wat ze bedoelde — **percentielen en afkortingen** — maar ze was daar ook op gescopet. Negen van de veertien jargonrijen die S17 aandroeg zijn *fiscaal* (vervreemdingswinst, tegenbewijs, heffingsvrij vermogen, forfaitair, aanmerkelijk belang, excessief lenen, jaarruimte/factor A, schuldgraad, inclusiepercentage) en zijn nooit gesweept — niet door APP-5 en niet daarna. Dat is een nooit-beoordeelde lacune, geen omkering.

**Wat is er wél gebouwd, en waarom in deze vorm.** Niet een verboden-termenlijst — het bezwaar hierboven staat onverkort overeind. Wel is het dode mechanisme in `lib/glossary-data.ts` levend gemaakt: `GlossaryEntry` draagt nu naast `alternative` (label-vorm) een optionele **`simpleLabel`**, en `components/editorial/glossary-term.tsx` is weergavemodus-bewust. In Eenvoudig vervangt `simpleLabel` het zichtbare jargon en verhuist de vakterm naar de kop van de popover; ontbreekt `simpleLabel` — de standaard, en bewust zo voor wettelijke termen als Box 3, tegenbewijs en heffingsvrij vermogen — dan is de render in beide modi identiek.

Daarmee is de vangrail een **datastructuur** in plaats van vrije prose: nieuw jargon komt alleen nog binnen via een `GlossaryEntry`, en `lib/glossary-data.test.ts` toetst die op volledigheid, hoofdletter-eenduidige sleutels (`SWR`/`swr` en `FIRE`/`fire` bestonden náást elkaar, met tegenstrijdige uitleg, en één bestand gebruikte beide) en op drie inhoudelijke grenzen: het inclusiepercentage weegt netto vermogen en géén "vrijheid", de tegenbewijs-uitleg blijft beschrijvend in plaats van gebiedend (Wft), en SWR blijft "wat je kúnt opnemen". Precies het onderscheid — datastructuur toetsbaar, prose niet — dat deze sectie als voorwaarde stelde.

**Nog open na S17:** de app-brede FIRE→"volledige vrijheid"-sweep (tientallen strings in widgets, rapportages en het huishouden-blok) is *niet* meegenomen; die raakt bestanden van vier parallelle werkstromen en is een eigen ronde. Jaarruimte/factor A, aanmerkelijk belang en "Bespreek met Fin" zijn door de eigenaar apart ingepland.

### APP-6 — claim rechtgezet, bewust geen constraint

De docblock van `welcome-guide-banner.tsx` beloofde "mobiel max ~⅓ viewport" alsof het een regel was; er stond geen `max-h`/`vh` omheen. De schermronde mat 282px op 390×844 = **33,4%**, dus de claim klopte feitelijk — hij was alleen verkeerd geformuleerd. De docblock zegt nu dat dit een *gemeten uitkomst* is en waarom er geen harde kap komt: die zou de afvinkregels of de sluit-/navigatieknoppen afsnijden zodra een scherm één stap meer draagt, en dan verliest de gebruiker functionaliteit in plaats van drukte. Groeit het aantal stappen, dan hermeten — niet afknippen.

### Documentatie-drift, dichtgezet

Vijf plekken beweerden iets dat het werk zelf onwaar had gemaakt: ADR 0026 (`DepthSection` "nooit ingehangen"), de comment bij `action:toggle-display-mode`, en `docs/uat/uat-plan.md` op zes plekken (HefbomenLegenda 2×, "géén toggle op /mijn/uiterlijk", UAT-NAV-10, WF-MIJN-22, UAT-CASH-22, plus een Onbevestigd-regel die inmiddels bevestigd feit was). Alle bijgewerkt; `lib/uat/acceptance/*` was al correct en bleef leidend. De zesde — de tegenstrijdige `subAmount`-comments in `cashflow-landing-cards.tsx` en `leverage-card.tsx` — was al opgelost in `153314dc9`.

### S6 — nagekomen: Eenvoudig mag geen bestemming verbergen waarnaar verwezen wordt

Nooit door deze audit beoordeeld (de /toekomst-sectie kende alleen TOE-1/2/3), maar wél
een gat: drie plekken droegen in **beide** weergavemodi een zichtbare opdracht waarvan de
bestemming in Eenvoudig hard verborgen was.

- **Box 1 → pensioen-strategie.** "Vul je factor A in bij je pensioen-strategie"
  (`box1/page.tsx` + `jaarruimte-card.tsx`) linkt naar
  `/toekomst/gebeurtenissen?strategie=pensioen`. De deeplink opende de modal wel, maar het
  strategieblok eromheen zat in `HideInSimple` — na sluiten was er geen ingang meer:
  een eenrichtingsdeeplink. Opgelost door in Eenvoudig alléén de Pensioen-kaart te
  renderen, mét duiding waaróm; AOW/Huis/Werk blijven Volledig-diepte.
- **Welkomstgids → wat-als.** `/toekomst?whatif=open` zette state op een sectie die in
  Eenvoudig zonder vastgelegd doel niet gemonteerd was; de scroll no-opte stil. De
  katern-II-gate kent nu een derde tak (`whatIfInlineOpen`), dus een expliciete deeplink
  opent 'm alsnog — precies het beginnersoppervlak waar Eenvoudig voor bedoeld is.
- **/mijn/profiel → NIBUD-benchmark.** De belofte "deze gegevens worden gebruikt voor je
  NIBUD Budget Gezondheidscheck" staat in beide modi; de sectie zelf zat in `HideInSimple`
  zónder deeplink of anker. De `CollapsibleSection` staat toch al dicht, dus de hard-hide
  is eraf: in Eenvoudig alleen de ingeklapte kop.

Onderliggende regel: **verwijst zichtbare tekst naar een bestemming, dan mag die
bestemming in die weergavemodus niet hard-hidden zijn** — voorwaardelijk renderen
(precedent `horizon-client.tsx`) i.p.v. `HideInSimple`. Het vastleggen van die regel als
ADR + lint-/testgate is bewust een **eigen kaart**, niet meegenomen in S6.

### MIJN-6 — /mijn-hub: disclosure in plaats van hard verbergen (S8, 28 aug 2026)

**MIJN-1** (duplicerende tabbalk op `/mijn`) is bevestigd geland — `hideOnBasePath` op
`ModuleNav`, in béíde modi, gedekt door `module-nav.test.tsx`. S8 herhaalde die eis; dat
deel is als done gesloten.

**MIJN-2** ("Geavanceerd/Check-ins alleen in Volledig, grid 9→7") was 9 aug bewust
afgevallen. MIJN-6 vervangt hem en herroept dat besluit niet stilzwijgend: waar MIJN-2
kaarten hárd wilde verbergen, vouwt MIJN-6 ze wég — `DepthSection`, kinderen gemount en
`inert`, één klik ertussen. Niets verdwijnt uit Eenvoudig; alleen de rangorde verandert.
Dat is materieel iets anders dan wat toen is afgewezen, en de eigenaar heeft het op S8
expliciet bevestigd (optie B, 26 aug 2026).

De premisse van de kaart was intussen verschoven: **het zijn zeven kaarten, geen negen.**
Bevinding M14 haalde Rapportages en Account uit het grid (elk al een vaste ingang elders).
De vier primaire kaarten van optie B worden daarmee **Profiel, Privacy, Koppelingen,
Uiterlijk** — Account is geen kaart meer om vooraan te zetten. Achter "Alle instellingen":
notificaties, check-ins, geavanceerd.

Twee keuzes die de moeite van het vastleggen waard zijn:
- **Uiterlijk staat vooraan.** Sinds APP-1 woont de weergavekeuze zélf daar. Wie in
  Eenvoudig staat en meer wil zien, moet die kaart kunnen vinden zónder eerst iets open
  te klappen — anders is de vluchtroute terug naar Volledig zelf weggevouwen.
- **Koppelingen staat vooraan** (het verschil tussen optie A en B). "Koppel je bank" is
  kernbelofte en heeft een eigen coach-suggestie die hierheen wijst.

Test-val die hierbij hoorde, en die is dichtgezet: de bestaande render-tests draaiden
**zonder** `DisplayModeProvider` en landden dus op de `'simple'`-fallback, terwijl
`DepthSection` zijn kinderen gemount houdt. `getByText(...)` en de href-lijst zouden dus
groen blijven óók als de reductie werkt. Alle tests dragen nu een expliciete provider, en
de curatie wordt gemeten aan `data-collapsed` en aan de plaats in de boom.

### RAPP-1 — /rapportages: gecureerd in plaats van verborgen (S9, 28 aug 2026)

§1 rekent rapportages tot "buiten de belofte … in Eenvoudig mogen ze standaard uit
beeld", maar er is nooit een RAPP-item van gemaakt en `/rapportages` staat niet in
`SIMPLE_HIDDEN_NAV_HREFS`. De uitspraak is dus nooit een plan geworden. Bij S9 heeft de
eigenaar dat alsnog beslecht — en **tegen de §1-lezing in**:

- **Niet verbergen (optie A afgewezen).** De landingsbelofte "je eerste Vrijheidsrapport
  in 5 minuten" (§1, r.19) wijst juist hierheen; de route verbergen voor precies de
  beginner die standaard in Eenvoudig landt, breekt die belofte. Bovendien verwijzen
  `lib/welcome-guide.ts` en `lib/next-steps/engine.ts` naar rapporten — hard verbergen
  zou de S6-fout herhalen (eenrichtingsdeeplink).
- **Wel cureren (optie B).** In Eenvoudig staan twee vormen vooraan — **balansstaat** en
  **persoonlijk plan**, de twee die gratis zijn én zonder invoer klaarstaan — met een
  duidingsregel die zegt wát ze zijn. De overige vijf zitten achter één `DepthSection`
  "Meer rapportvormen" met een samenvatting van wat erin zit. In Volledig staat die
  sectie open: alle zeven vormen zichtbaar. Weggevouwen, nooit weggehaald.

Onderliggende regel, aanvullend op S6: **reductie zonder duiding is geen vereenvoudiging.**
Waar iets naar de achtergrond gaat, hoort te staan wát daar staat en waarom het vooraan
gaande deel vooraan staat.

Bijvangst in dezelfde stap: de betaalpoort op het periodieke rapport gold het hele rapport
in plaats van alleen de AI-inleiding (H28, R1 — daar opgelost). S9 heeft de weergavekant
gedaan: een vergrendeling is nu vóór de klik zichtbaar mét reden, en verschijnt alleen als
de add-on daadwerkelijk te koop is (`ADDON_PLANS[…].available`) — een slot zonder kassa is
een muur zonder deur.

---

*Elke wijziging afzonderlijk klein houden: per voorstel één kaart, route via de kleine-aanpassing- of extend-feature-pijplijn; de Eenvoudig-varianten hergebruiken bestaande primitieven (`HideInSimple`, `compact`-prop van leverage-card, `FiguresStrip`-props, `DepthSection`).*
