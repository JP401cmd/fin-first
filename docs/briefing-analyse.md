# Briefing-analyse — vulling, AI-prompt en architectuur

*Datum: 2026-06-11 · Scope: volledige briefing-functionaliteit (engine, prompt, data, kaarttypes, levering, beheer)*

> **Status: verbeterplan volledig geïmplementeerd op 2026-06-11** — zie ADR
> [`0007-briefing-een-engine`](adr/0007-briefing-een-engine.md). Systeem B is
> verwijderd, de directives sturen nu de AI-redactielaag (`lib/briefing/redactie.ts`,
> nummer-guard), de vulling is verbreed (aandachtspunten-bus, noodfonds, vaste
> lasten, Box 3, fondskosten, hypotheek-vs-beleggen, check-in-reflectie,
> goal-bedragen, domein-spreiding), en er is week-historie + een freshness-signaal.
> De beschrijving hieronder documenteert de situatie **vóór** die ingreep.

## 0. Kernbevinding: de "samenvoeging" van twee engines is nooit afgerond

Er leven **twee volledig gescheiden briefing-systemen** in de codebase:

| | **Systeem A — wekelijkse overzicht-briefing (LIVE)** | **Systeem B — AI-DAIshboard-briefing (DOOD)** |
|---|---|---|
| Surface | `/overzicht` via `BriefingPanel` | `DAIshboard` — nergens meer bereikbaar |
| Generatie | Pure regelengine `buildBriefingEntries` (`lib/briefing/engine.ts:181`), géén LLM | `streamText` + 18 kaart-tools (`app/api/briefing/compose/route.ts:266`) |
| AI-gebruik | Alleen 1 kop-zin bij handmatige refresh (`refresh/route.ts:23`) | Volledige compositie door LLM (`lib/ai/dna/briefing.ts`) |
| Output | `BriefingEntry[]` — max 6, 6 categorieën | `BriefingCardSpec[]` — 21 types, 18 AI-kiesbaar |
| Opslag | `profiles.briefing_snapshot` (jsonb, ISO-week bevroren) | In-memory Map + localStorage + verweesde `briefing_history`-tabel |
| Datavulling | Dunne selectie (~12 signalen) | Zeer rijk (`lib/briefing/condense.ts`, vrijwel alle `DashboardData`) |
| Beheer-sturing | Geen | Directives via `/beheer/briefing` |

**Bewijs dat Systeem B dood is** (zelf geverifieerd): de enige live mount van `DraggableWidgetGrid` is `components/overview/hero-widget-rail.tsx:112`, die `showDashboardTypeToggle` niet doorgeeft (default `false` → geen briefing-toggle → DAIshboard onbereikbaar). `app/(app)/dashboard/page.tsx` is een pure `redirect('/overzicht')`. `/will` bestaat niet meer.

Gevolg: alles wat "AI-briefing vanuit de hele app" zou moeten doen — de rijke datacondensatie, de uitgebreide prompt, de 18 kaarttypes, de redactionele directives, de gebruikersvoorkeuren-leerloop — **draait niet**. Wat gebruikers zien is de deterministische week-briefing met een dunne datavulling.

---

## 1. Validatie van de huidige (live) functionaliteit

### Wat Systeem A doet
1. `/overzicht` (server component) laadt `loadDashboardData` + `loadWillData` + `loadHorizonData` parallel.
2. `composeOverviewBriefing` (`lib/briefing/overview-briefing.ts:94`) bouwt de engine-input en roept `buildBriefingEntries` aan.
3. De engine genereert entries uit 5 kernbronnen + 8 finance-generatoren, weegt ze op een vaste rang (`briefingRank`, `engine.ts:575`) en capt op 6.
4. `getOrCreateWeeklySnapshot` (`snapshot.ts:246`) bevriest de entries per ISO-week (Amsterdam). Handmatige refresh max 1×/dag (`canRefreshToday`), inclusief AI-kop-zin met deterministische fallback.

### Oordeel
- **Technisch robuust.** Harde drempels, deling-door-nul-guards (o.a. de bewuste "income=0 ⇒ geen 100%-spaarquote"-guard, `engine.ts:426-432`), sanitering van oude snapshots, graceful degradation bij ontbrekende kolom, refresh-poort vóór het dure werk. De maandgrens-constructie in `dashboard-data-loader.ts:142-148` is gecontroleerd en **veilig** (`Date.UTC` + `toISOString` schuift niet; vals alarm).
- **Inhoudelijk dun.** Max 6 entries, budgetdruk en spaarquote sluiten elkaar uit, slechts de eerste 2 recommendations worden gebruikt, goal-entries negeren de beschikbare bedragen (`current`/`target` zitten in het type maar worden niet verwerkt). Het resultaat is eerder "te plat" dan "te ruisig".
- **Onafgemaakt.** `buildBriefingNarrative` (`engine.ts:729-801`) is getest maar nergens live aangeroepen; de header-documentatie over volgorde en de `market`-categorie is achterhaald.

### Sluit de output aan op het doel?
Deels. Het doel — *meerdere meldingen in verschillende categorieën op basis van alle beschikbare data* — wordt qua vorm gehaald (6 categorieën, max 6 meldingen), maar qua **datadekking niet**: zie §3.

---

## 2. Analyse van categorieën

### Systeem A: 6 entry-categorieën
`observation` · `tip` · `upcoming` · `heads_up` · `milestone` · `market` (kleur-rail + icoon in `briefing-panel.tsx:83-93`).

Beoordeling:
- **Logisch en onderscheidend als redactionele assen** (constatering / advies / agenda / waarschuwing / viering / buitenwereld). Dit is een sterke, compacte taxonomie.
- **`market` is dun**: read-only top-item uit de nieuws-cache (`news-market.ts:52-96`); vuurt alleen als er een 'direct'-impact-item gecachet is.
- **Geen domein-dimensie.** De categorieën zeggen *hoe* een melding bedoeld is, niet *waarover* (vermogen/budget/belasting/toekomst). Voor filtering, dedupe en spreiding over domeinen ontbreekt die tweede as.
- Ontbrekende kandidaten: een belasting-/deadline-categorie is niet per se nodig (past in `upcoming`/`heads_up`), maar **spreiding over domeinen wordt nu nergens afgedwongen** — drie van de zes briefjes kunnen over hetzelfde domein gaan.

### Systeem B: 21 kaarttypes — te veel en deels kapot
- 18 AI-kiesbaar, 2 client-only (`moduleGuide`, `goalGuide` — laatste effectief dood), en **2 dode kaarten met live tools**: `showDecisionPatterns` en `showFreedomDaysTrend` zijn volledig bedraad (tool, mapping, span-tabel, prompt-defaults) maar `briefing-card-grid.tsx:47-69` heeft **geen render-case** → lege grid-cellen als de AI ze kiest.
- **Veel conceptuele overlap**: `insight`/`action`/`nextStep`/`alert` (allemaal "doe dit"-boodschappen), `metric`/`progressRing`/`sparkline`/`comparison` (vier vormen voor één getal), `milestone`/`goalProgress`. Dit maakt de AI-typekeuze diffuus en de output minder voorspelbaar.
- Zou bij herbestemming geconsolideerd moeten worden naar ±8-10 types.

---

## 3. Data en input — de vulling van de briefjes (kernvraag)

### Wat de live briefing WEL gebruikt (engine-input, `overview-briefing.ts:52-91`)
Recommendations[0..1], zwakste health-pillar (<50) + pillar-trend (≥5), slechtste off-track-doel + behaald doel, eerstvolgende life event (≤90 d), netto-vermogensdelta (≥ €250), spaarquote XOR budgetdruk (>90%), cash-drag (≥ €10k), open acties + vrijheidsdagen, backtest-weerbaarheid, top-marktnieuws uit cache, seizoensregels (Box 3-peildatum, aangifte, vakantiegeld, jaarruimte).

### Wat ONTBREEKT in de live briefing (terwijl de data al bestaat)
| Domein | Status | Data bestaat al in |
|---|---|---|
| Schulden-detail (aflosstrategie, rente, hypotheek-vs-beleggen) | **Afwezig** (alleen indirect via netto vermogen/pillar) | `DashboardData.hvbSummary`, `debt-data` |
| Belasting-cijfers (box 1/2/3, tegenbewijs, jaarruimte-bedragen) | **Zeer dun** (alleen kalenderzinnen) | `box3Tax`, `lib/tax-overview.ts`, `lib/tax-calendar.ts` |
| Terugkerende kosten / vaste lasten | **Afwezig** | `topRecurringTransactions`, `lib/vaste-lasten-summary.ts` |
| Fee-erosie / fonds-alternatieven | **Afwezig** | `feeAnalysis`, `lib/fund-alternatives.ts` |
| FIRE-scenario's / unified projection / fases | **Gedeeltelijk** (alleen freedomPct + backtest) | `runUnifiedProjection`, `fireRange`, `lib/phase-analysis.ts` |
| Huishouden/partner-perspectief | **Afwezig** — entries blijven personal; snapshot alleen bij `perspective === 'personal'` (`overzicht/page.tsx:175`) | perspectief-loaders, `household-data` |
| Check-ins (reflecties, gespreksstarters) | **Afwezig** | `lib/checkin/*` |
| Aandachtspunten-bus | **Afwezig in beide systemen** | `lib/aandachtspunten.ts` (voedt wél de Will-chat) |
| Notificaties | **Afwezig in A** | `DashboardData.notifications` |
| Transactie-inzichten (tegenpartijen, nieuwe abonnementen, uitschieters) | **Afwezig** | `lib/transaction-insights.ts` |
| Emergency fund / maandoverzicht | **Afwezig in A** | `emergencyFund`, `monthSummary` |
| Recommendations 3..n | Vallen weg (alleen [0] en [1] worden entries, `engine.ts:186-211`) | `willData.recommendations` |

De rijke vulling bestaat dus al — `lib/briefing/condense.ts` (Systeem B) verwerkt vrijwel al deze velden tot een prompt-summary — maar die pijplijn is afgekoppeld. **De gap zit niet in de data-laag maar in de selectie** (`buildOverviewBriefingInput` pakt een fractie van wat de drie loaders al ophalen).

### Datakwaliteit-issues in de (dode maar herbestembare) berekeningen
- `computeBudgetDisciplineScore` geeft **100% bij geen budgetten** (`trends.ts:127,152`) — misleidende default.
- `net_worth_ath` is geen echte all-time-high maar "hoger dan vorige briefing" (`progression.ts:156-163`).
- `expenseTrend` kan huidige maand met historische maanden vergelijken zonder guard (`trends.ts:68`).
- `seasonal.ts`/`progression.ts`/`engagement.ts` zijn **localStorage-only** → per-device, niet per-account; als briefing-bron onbetrouwbaar.
- Twee vrijheidsdagen-dagbases naast elkaar: `monthlyExpenses/30` (`engine.ts:366`) vs `calculateFreedomTime` elders.
- Drie parallelle seizoenslogica's (`engine.ts` SEASONAL_RULES, `temporal.ts`, `seasonal.ts`) en twee `daysUntilSalary`-implementaties (beide hardcoded de 25e).

---

## 4. AI-besluitvorming — compleetheid van de prompt (kernvraag)

### Wat de prompt (Systeem B, `lib/ai/dna/briefing.ts:34-199`) goed doet
Rol + filosofie ("Geld is opgeslagen tijd", vrijheidstijd verplicht bij > €100), tools-only-opdracht, kaartaantal per bezoekfrequentie (5-10), vaste CTA-mapping per onderwerp, route-whitelist ("verzin GEEN eigen routes"), layout-regels, temporeel bewustzijn (dag/maand/belastingseizoen), fase-emphasis per sovereignty-fase, doel-coaching, actie-opvolging ("stel NOOIT afgewezen acties voor"), toon-regels, privacy-protocol. Plus serverside PII-sanitering (fail-safe: blokkeert bij sanitisatie-fout, `compose/route.ts:241`).

Dit is een **uitzonderlijk complete prompt qua instructie-dekking** — het probleem is niet wat erin staat, maar (a) dat hij niet draait, en (b) de volgende structurele gaten:

### Gaten in besluitvorming en betrouwbaarheid
1. **Selectiecriteria zijn vaag.** "Kies bewust: wat is nu het belangrijkst?" (`briefing.ts:52`) zonder prioriteringsmatrix. De enige scherpe sturing zijn de functionele directives, waarvan condities serverside vooraf worden geëvalueerd (`[ACTIEF]`/`[INACTIEF]`, `directives.ts:429`) — dat patroon is goed en verdient uitbreiding.
2. **Geen numerieke validatie.** Tool-schema's accepteren vrije strings (`value: z.string()`, `freedomStr`); niets checkt of getoonde bedragen/vrijheidstijden in de bron-summary voorkomen. Hallucinatie van cijfers is het grootste betrouwbaarheidsgat.
3. **Geen dedupe** over kaarten; "varieer t.o.v. vorige briefing" is een zachte hint op basis van localStorage (per-device).
4. **Kaartaantal alleen tekstueel** gestuurd; `toolChoice: 'required'` garandeert slechts ≥1 kaart.
5. **"DAIshboard"-jargon lekt** drie keer letterlijk de system-prompt in (`briefing.ts:354/361/369`).
6. **Promptvulling mist domeinen** die ook in condense ontbreken: aandachtspunten-bus, check-ins, huishouden-perspectief, transactie-inzichten, nieuws (Systeem A heeft nieuws wél, B niet — omgekeerde gaps).

### Systeem A's "besluitvorming"
Deterministisch en scherp (vaste drempels), dus voorspelbaar en hallucinatievrij — maar star: de rang-volgorde is hardcoded, er is geen persoonlijke weging, geen leer-loop, en de AI-kop-zin bij refresh gebruikt een eigen hardcoded prompt zonder directives.

---

## 5. Validatie van output

- **`validateBriefingLayout`** (`validate-layout.ts:29-47`): rij-vulling (greedy, kan AI-volgorde fors herordenen), milestone naar het midden, geen twee identieke 1-koloms naast elkaar, eindkaart moet action/insight/quote zijn. **Dwingt NIET af**: min/max-aantal, dedupe, verplichte opening, schema-hervalidatie (`toolCallToCardSpec` doet een blinde cast, `compose/route.ts:24-67`).
- **`validateCardHrefs`** (`validate-hrefs.ts:106-132`): whitelist nieuwe IA + alias-correctie legacy-routes + prefix-match; ongeldige href wordt verwijderd (kaart blijft, onklikbaar). Goed onderhouden.
- **Href-lek buiten de validator**: `insight-card.tsx:22-33,52` (`KEYWORD_CTA_MAP`) kent client-side uitsluitend **legacy-routes** toe (`/core/debts`, `/horizon`, `/will#cashflow`, default `/core/assets`) wanneer de AI geen CTA meegaf — ná de server-validatie, dus ongecontroleerd.
- **Fallback is dode code**: `composeBriefingFallback` (`fallback.ts:9`, ~200 regels, nieuwe-IA-hrefs, degelijke regels) wordt **nergens aangeroepen** — bij AI-falen krijgt de gebruiker een error-state in plaats van deterministische kaarten (`compose/route.ts:293-298`). De robuustheid die de bestandsheader belooft bestaat niet.
- **Engine A linkt nog naar `?tab=`-deeplinks** (`/toekomst?tab=doelen`, `engine.ts:245/264`) — werkt via redirect-shim, maar inconsistent met de nieuwe subroutes die de B-prompt wél gebruikt.
- **Feedback-loop (B)** werkt technisch (thumbs → localStorage → voorkeursblok in prompt vanaf 10 datapunten) maar is per-device, een zachte hint, en uiteraard dood met het systeem mee.

### Levering en cyclus (A) — grotendeels gezond
ISO-week-freeze + 1×/dag-refresh is logisch en race-vrij (idempotente week-write tijdens RSC-render, bewust gedocumenteerd). UX-zwaktes: geen freshness-signaal binnen de week (cijfers kunnen wijzigen zonder enige hint), refresh-no-op is stil (knop disabled zonder uitleg), `/overzicht` blokkeert op drie loaders zonder Suspense rond de briefing. De wekelijkse notificatie (`notifications/route.ts:386-415`) is correct: zelfde week-key, pref-gating, deeplink `/overzicht#briefing` matcht het anker.

### Historie — verweesd
`briefing_history`-tabel + 3 API-routes + `BriefingHistory`-component horen bij het dode systeem; het levende systeem schrijft én toont geen historie. Geen retentielimiet in de DB. Zelfs binnen het dode systeem was de server-sync half af (`syncFromServer` telt maar fetcht nooit).

### Beheer — stuurt een spook
`/beheer/briefing` (volwaardig scherm: temporele + functionele directives, prompt-preview, actief-vandaag-paneel) injecteert uitsluitend in de **dode** compose-route. **Een beheerder die hier richtlijnen instelt verandert niets aan wat gebruikers zien.** Stille faalmodus.

---

## 6. Uitbreidingsmogelijkheden

### Direct haalbaar (geen herschrijf)
1. **Vulling verbreden in `buildOverviewBriefingInput`** — de loaders halen de data al op; nieuwe generatoren in `engine.ts` voor: terugkerende-kosten-stijging, fee-erosie, box 3-cijfer i.p.v. alleen kalenderzin, emergency-fund-dekking, hypotheek-vs-beleggen-moment. Patroon (drempel → entry) bestaat al.
2. **Aandachtspunten-bus als bron** — `lib/aandachtspunten.ts` levert al geprioriteerde, gededupliceerde punten (voedt de Will-chat); een adapter naar `BriefingEntry` is klein en geeft direct kwalitatieve `heads_up`-briefjes.
3. **Domein-spreiding afdwingen** — een `domain`-veld op `BriefingEntry` + max 2 entries per domein in `mergeRankedEntries`.
4. **Goal-entries concretiseren** — `current`/`target`/`eta` zitten al in het type; bedragen in de tekst verwerken.
5. **Refresh-AI-kop koppelen aan directives** — het enige levende AI-aanknopingspunt; geeft `/beheer/briefing` weer een bestaansrecht zonder grote bouw.

### Sterk waardeverhogend (korte termijn)
6. **AI-redactielaag bovenop deterministische feiten** — laat de engine kandidaat-entries (met geverifieerde cijfers) genereren en de LLM alleen *selecteren, herschrijven en verbinden* (het patroon van de kop-zin, uitgebreid naar de hele briefing). Dit combineert B's taalkwaliteit met A's cijfer-betrouwbaarheid en elimineert het hallucinatiegat structureel: de AI mag geen getallen produceren, alleen formuleren.
7. **Huishouden-perspectief in de briefing** — perspectief-bewuste input (de page berekent overrides al voor de hero) of expliciete partner-briefjes ("samen +X dagen").
8. **Freshness-signaal** binnen de week (delta tussen snapshot en live cijfers is server-side triviaal).
9. **Echte historie voor het levende systeem** — week-snapshots zijn er al; een lijstweergave van voorbije weken is vooral UI.

### Structureler (toekomst)
10. **Eén engine-convergentie**: B's goede onderdelen (directives-patroon, condense-domeindekking, feedback-loop, fallback-regels) herbestemmen naar A; de rest opruimen.
11. **Account-gebonden voorkeursleren** (server-side i.p.v. localStorage) zodra er weer een leerloop is.
12. **Check-in- en gedragscontext** als bron ("je gaf bij je check-in aan dat…").

---

## 7. Risico's en beperkingen

| Risico | Waar | Ernst |
|---|---|---|
| Beheer-scherm zonder effect (directives → dood systeem) | `/beheer/briefing` | Hoog (stil, misleidend) |
| Cijfer-hallucinatie bij eventuele herleving van B | tool-schema's, geen numerieke validatie | Hoog (alleen relevant bij herleving) |
| Dode-code-massa wekt onderhouds- en beveiligingslast (compose-route + history-API's zijn publiek bereikbare endpoints van een dood systeem) | `api/briefing/compose`, `api/briefing/history`, DAIshboard-keten | Middel |
| Informatie-dunte: 6 briefjes, deels generiek, domein-clustering mogelijk | engine-caps | Middel |
| Legacy-hrefs buiten validator | `insight-card.tsx:22-33` (dood pad), `engine.ts:245/264` (`?tab=`-shim) | Laag |
| Per-device "geheugen" (progressie/seizoen/feedback) | localStorage-modules | Laag (dood pad) |
| In-memory compositie-state (restart/multi-instance) | `compose/route.ts:79` | Laag (dood pad) |
| Misleidende defaults (`budgetDiscipline=100`, pseudo-ATH) | `trends.ts`, `progression.ts` | Laag (dood pad) |

Informatie-overload is géén actueel risico (cap 6 + week-freeze beschermen); duplicatie evenmin (deterministische generatoren vuren elk max 1×). Bias-risico is beperkt tot de hardcoded rang-volgorde (recommendations altijd bovenaan).

---

## 8. Aanbevolen verbeterplan

### Niveau 1 — direct valideren/corrigeren
1. **Beslis over Systeem B** (de belangrijkste beslissing van dit rapport): opruimen óf herbestemmen. Niets ertussenin — de huidige limbo kost onderhoud en misleidt beheer. Opruimkandidaten: `components/dashboard/{daishboard,briefing-history,briefing-stale-banner,briefing-footer,briefing-skeleton,briefing-header,briefing-card}.tsx`, `components/will/will-landing.tsx`, `app/api/briefing/{compose,history}`, tabel `briefing_history`, testpagina's `app/test-briefing-{history,toggles}`. Check de `onboarding/reset`-afhankelijkheid op compose. Herbestembare onderdelen vóór verwijdering oogsten: directives-patroon, condense-domeinlijst, fallback-regels, href-aliasmap.
2. **`/beheer/briefing` koppelen of verwijderen** — minimaal de refresh-kop aan directives hangen, anders het scherm weg.
3. **Dode code in het levende pad opruimen**: `buildBriefingNarrative` (`engine.ts:729-801`), achterhaalde header-docs, `?tab=`-hrefs → subroutes.
4. **Vrijheidsdagen-dagbasis unificeren** (`/30` vs `calculateFreedomTime`).

### Niveau 2 — korte termijn uitbreiden
5. Vulling verbreden (punten 1-4 uit §6): aandachtspunten-bus, terugkerende kosten, belasting-cijfers, fee-erosie, goal-bedragen, domein-spreiding.
6. AI-redactielaag over deterministische entries (punt 6 uit §6) — de slimste uitbreidingsrichting.
7. Huishouden-perspectief + freshness-signaal.

### Niveau 3 — toekomst
8. Week-historie-UI, account-gebonden voorkeursleren, check-in-context, kaarttype-consolidatie (alleen relevant als er ooit weer visuele kaartvariatie komt).

### Eerst te testen aannames
- **Wordt de wekelijkse cadans + 6-entry-cap door gebruikers als "genoeg" ervaren, of als mager?** Bepaalt of Niveau 2-verbreding prioriteit verdient.
- **Heeft iemand `/beheer/briefing` ooit gebruikt in de veronderstelling dat het werkt?** (directives in `app_settings` checken.)
- **Gebruikt `onboarding/reset` de compose-route functioneel of alleen als cleanup?**
- **Is er behoefte aan visuele kaartvariatie (B's grid) of volstaat het editorial tekstformaat (A)?** Bepaalt hoeveel van B herbestemd wordt.

---

## 9. Eindconclusie

**Hoe goed werkt de huidige briefing?** Het levende systeem is technisch solide — voorspelbaar, hallucinatievrij, goed bevroren per week, nette fallbacks — maar inhoudelijk dun: het benut hooguit een kwart van de data die de app al per request ophaalt, en mist hele domeinen (schulden-detail, belastingcijfers, terugkerende kosten, huishouden, check-ins, aandachtspunten).

**Wat kan inhoudelijk beter?** De vulling, niet de vorm. De categorieën-taxonomie is goed; de selectie-laag (`buildOverviewBriefingInput`) is de bottleneck. Daarnaast is de grootste organisatorische schuld dat een complete tweede AI-briefing-infrastructuur (prompt, directives, beheer, historie, feedback-loop) dood maar onopgeruimd in de codebase ligt en een beheerscherm voedt dat niets doet.

**Slimste uitbreidingsrichting?** Niet het oude AI-systeem reanimeren, maar convergeren: de deterministische engine als feiten-ruggengraat verbreden met de domeinen die B's condense al kende, en de LLM inzetten als *redacteur* over geverifieerde cijfers (uitbreiding van het bestaande kop-zin-patroon) — met de directives uit `/beheer/briefing` als sturing. Dat geeft de taalkwaliteit en personalisatie van de AI-briefing zónder het hallucinatie- en betrouwbaarheidsrisico, en maakt het beheerscherm weer betekenisvol.
