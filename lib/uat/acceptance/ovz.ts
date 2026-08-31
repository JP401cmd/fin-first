/**
 * Acceptatiecriteria — domein Overzicht-hub (WF-OVZ-01..22 / UAT-OVZ-01..16,19..22).
 *
 * Spiegelt exact de aanpak van `budget.ts`/`start.ts`/`will.ts`/`cash.ts`. Bron:
 * `docs/uat/uat-plan.md` Deel 1 (workflow-definities WF-OVZ-01..21) + Deel 2
 * §2.8 (UAT-OVZ-01..16, 19..21). WF-OVZ-22 (euro-weergave, wave 2/3) is NIEUW
 * t.o.v. het UAT-plan — toegevoegd voor de euro-weergave-uitrol (Notion-kaart
 * 39cf9e8d-568a-80fb-8a99-e090c080b964, brok H), spiegelt géén document-workflow.
 *
 * WF-OVZ-17 en WF-OVZ-18 hebben BEWUST GEEN eigen criterium hier — het UAT-plan
 * wijst ze door naar UAT-NAV-19 (huishoud-/partnerweergave) resp. UAT-NAV-10
 * (Eenvoudige weergave) ("Géén eigen scenario — steekproef-oppervlak"); de
 * catalogus bevat dan ook geen UAT-OVZ-17/18. OVZ is dus, net als SCHULD/TOEK/
 * WILL, NIET aaneengesloten op WF-nummer, maar WEL 1-op-1 met de 20
 * catalogus-scenario's (01..16, 19..22).
 *
 * OMGEKEERDE VERWIJZING (belangrijk): WF-WILL-21/22 wezen in `will.ts` door
 * naar UAT-OVZ-19/20/21 — dit bestand is dus de daadwerkelijke, volledige
 * uitwerking van de tips-/actiebeslissingen op /overzicht/tips; WILL levert
 * alleen de AI-context (aanbevelingen-generatie), OVZ toetst het volledige
 * beslis-/actiebeheer-gedrag.
 *
 * KERN-BEVINDING (bepaalt exact/oracle/direction/ui-only): de hub combineert
 * (1) volledig deterministische pure functies (statusdrempels, gezondheids-
 * pijler-formules, doel-percentages, Box 3-forfait, vrijheidsdagen-formule,
 * samengestelde-rente, postpone-termijnen) — 10 'exact' criteria; (2)
 * kernel-afhankelijke cijfers (freedomPct, simNetWorthRows/simRequiredPortfolio)
 * die de horizon-kernel-solver vereisen, niet met de hand na te rekenen — 2
 * 'oracle' criteria (verifieerbaar via `/beheer/horizon-tabellen-mij`, net als
 * TOEK); (3) een directioneel/backcast-criterium (vermogenshistorie-schatting)
 * — 1 'direction'; (4) config-/weergave-/print-/deel-workflows zonder eigen
 * berekening — 6 'ui-only'.
 *
 * NOG ÉÉN MIRROR met bronregel-verwijzing (client-inline constante — spiegelt
 * de mirrors in eerdere zones):
 *  - de postpone-termijn (POSTPONE_DAYS=14, `tips-lijst.tsx`/`action-board.tsx`,
 *    identiek aan de WILL-mirror)
 *
 * De `scoreDebtRatio`-mirror is bij UR2-10 vervallen: die curve is geëxporteerd
 * uit lib/financial-health.ts en wordt door de checks rechtstreeks aangeroepen —
 * dezelfde bron die sindsdien ook de Schulden-hefboom voedt.
 */

import type { AcceptanceCriterion, AcceptanceSet } from './types'

const criteria: AcceptanceCriterion[] = [
  {
    workflow: 'WF-OVZ-01',
    scenarioId: 'UAT-OVZ-01',
    titel: 'Dagelijkse stand opnemen op de Overzicht-hub',
    kriticiteit: 'KERN',
    given: 'Persona Willem Jansen: totalAssets €1.619.700, totalDebts €0 → netto vermogen is een directe optelsom. Voor de Box 3-toets een schone, hand-narekenbare synthetische invoer (single, geen fiscaal partner, alléén spaargeld €100.000 — géén beleggingen, zodat het effectief rendement exact het spaargeld-forfait is, geen blend): 2026-forfait spaargeld 1,28%, heffingsvrij (single) €59.357.',
    when: 'De gebruiker opent /overzicht; netto vermogen en de Box 3-belasting worden berekend.',
    then: 'BOVENAAN STAAT HET ANTWOORD, NIET DE VRAAG (H20/S13): het eerste blok is de begroeting; de welkomstgids en de maand-check-in staan er ONÉÉR (het `banners`-slot van `OverzichtHeroPrimary`, tussen begroeting en hefbomen-kompas), in béíde weergaven — de positie is geen modus-keuze. De begroeting, de vier hefboomtegels (incl. netto vermogen en de Box 3-hefboom) ÉN de gezondheidskaart verschijnen DIRECT bij het openen (`OverzichtHeroPrimary`, blok 1 — sinds de kaart "gezondheid & netto vermogen los laden van widgets" hangt de gezondheidskaart niet meer op de zware widget-bundel). Twee losse Suspense-stromen komen daarna in: de mini-vermogen-grafiek (`heroChart`, two-staps: eerst het Vandaag-anker met het al-bekende netto vermogen, dan de volle projectie/historie) en de widget-rail/briefing/snelkoppelingen (`secondary`, editorial skeleton op vaste hoogtes tegen CLS) — zelfde inhoud, gefaseerde verschijning, dezelfde cijfers. Netto vermogen = totalAssets (€1.619.700) − totalDebts (€0) = €1.619.700. Box 3 (synthetisch): grondslagSparen = 100.000 − 59.357 = €40.643; effectiefRendement = forfaitairSpaargeld/rendementsgrondslag = 1.280/100.000 = 1,28% (enige categorie, dus geen blend); box3Income = 40.643 × 0,0128 = €520,23; tax = 520,23 × 0,36 ≈ €187,28. In de Eenvoudige weergave is de hub verder ontdaan van bijzaak (fase 1): de drie "alles bekijken"-links onder de briefing vervallen (de navigatie draagt ze al, OVZ-3) en de legenda van de vermogensgrafiek valt terug op "Verloop" + "Bandbreedte" zonder percentiel-notatie of kaal leeftijdsgetal (OVZ-4) — de uitleg daarvan staat in de pagina-\'i\', samen met de betekenis van de stoplicht-stippen (OVZ-1). De CIJFERS zijn in beide modi identiek; het is uitsluitend presentatie-reductie.',
    assertion: {
      kind: 'exact',
      expected: 'nettoVermogen=1619700; box3Tax=187.28',
      source: 'lib/box3-data.ts#calculateBox3 (échte productiefunctie, 2026-parameters) + directe optelsom (netto vermogen) — zie ovz-checks.ts',
    },
  },
  {
    workflow: 'WF-OVZ-02',
    scenarioId: 'UAT-OVZ-02',
    titel: 'Via een hefboomkaart doorklikken en drill-down uitklappen',
    kriticiteit: 'BELANGRIJK',
    given: 'Persona Daan Bakker: totalAssets €9.700, totalDebts €13.900.',
    when: 'De schuldratio-pijlerscore (`rawValue`) voor het detailpaneel wordt berekend.',
    then: 'Schuldratio = 13.900/9.700 = 1,433 (143%) ≥ 1 → pijlerscore 0 → statuskleur rood (via `pillarStatus`, <50 → bad). In de Eenvoudige weergave draagt elke tegel het OORDEEL in gewone taal als primaire regel ("Hoge schuldenlast"; voor Daan op de Belasting-tegel "Belastingdruk beperkt" — hij zit onder de heffingsvrije voet; zonder gegevens "Nog geen gegevens") met het bedrag gedempt eronder — S1, richtingsbesluit R5 "duiding boven reductie". Dat vervangt de eerdere OVZ-2-reductie (alleen hoofdcijfer + statuspunt), die de status voor screenreader- en touch-gebruikers onbereikbaar maakte. Wél nog steeds weg in Eenvoudig: de chevron/drill-down en de "excl. eigen woning · €X"-regel. In Volledig zijn de tegels ongewijzigd, met één uitzondering: het schulden-oordeel bij warn is gewone taal ("Schuldenlast vraagt aandacht") i.p.v. "Schuldratio {rawValue}" — het ratiogetal staat in de drill-down. Sinds UR2-04 volgt óók het Belasting-oordeel zijn eigen status ("Belastingdruk beperkt" / "Mogelijk betaal je meer dan nodig" / "Hoge belastingdruk") i.p.v. één vaste waarschuwingszin voor alle drie de statussen, en leest het kompas in de shell hetzelfde generieke statuswoord als de kaart-dot (LEVERAGE_STATUS_LABEL). Sinds UR2-10 geldt bovendien: op een account waar NIETS geregistreerd staat (geen vermogen én geen schuld) is de Schulden-tegel neutraal — dus "Nog geen gegevens" in Eenvoudig en géén oordeelregel in Volledig, in plaats van de eerdere waarschuwing "Schuldenlast vraagt aandacht". Schuldenvrij MÉT vermogen blijft groen.',
    assertion: {
      kind: 'exact',
      expected: 'schuldratioScore=0; status=bad',
      source: 'lib/financial-health.ts#scoreDebtRatio + lib/leverage-status.ts#pillarStatus (beide échte productiefuncties) — zie ovz-checks.ts',
    },
  },
  {
    workflow: 'WF-OVZ-03',
    scenarioId: 'UAT-OVZ-03',
    titel: 'Gezondheidsscore bekijken en de onderverdeling (kassabon) openen',
    kriticiteit: 'KERN',
    given: 'Persona Willem Jansen: schuldratio 0 (geen schulden), DSTI 0%, grootste asset-type-aandeel (excl. eigen huis) = DEGIRO €570.000 / (€1.619.700 − €650.000) = 58,8%.',
    when: 'De pijlerscores voor schuldratio, DSTI en vermogensconcentratie worden berekend.',
    then: 'Schuldratio-score = 100 (ratio 0). DSTI-score = 100 (dstiPercent 0 ≤ 20). Concentratie-score: 58,8% valt in de 40–70%-band → round(100 − ((58,8−40)/30)×60) = round(100−37,6) = 62.',
    assertion: {
      kind: 'exact',
      expected: 'schuldratioScore=100; dstiScore=100; concentratieScore=62',
      source: 'lib/financial-health.ts#scoreDSTI + scoreAssetConcentration + scoreDebtRatio (échte productiefuncties) — zie ovz-checks.ts',
    },
  },
  {
    workflow: 'WF-OVZ-04',
    scenarioId: 'UAT-OVZ-04',
    titel: 'Vermogensverloop bekijken en historie tot 24 maanden terug invoeren',
    kriticiteit: 'KERN',
    given: 'Ankerwaarde €1.483.000 (14 maanden geleden, oudste echte snapshot), spaarritme €2.500/maand.',
    when: 'Het geschatte back-cast-punt voor 15 maanden geleden wordt berekend (buiten de 15 echte snapshots).',
    then: 'Geschatte waarde(15) = ankerwaarde − spaarritme×(15−14) = 1.483.000 − 2.500 = €1.480.500 — een DIRECTIONELE verwachting (dalende lijn, stappen van €2.500); de exacte serverimplementatie van het 24-maands-venster is niet 100% bevestigd identiek aan de mini-grafiek-backcast-formule (expliciete plan-notitie).',
    assertion: {
      kind: 'direction',
      source: 'components/overview/mini-networth-chart.tsx r214-227 (backcast-formule, gemirrord) — richting + stapgrootte getoetst, geen exact bevestigd servergetal',
    },
  },
  {
    workflow: 'WF-OVZ-05',
    scenarioId: 'UAT-OVZ-05',
    titel: 'Toekomstprojectie vanaf de hub verkennen',
    kriticiteit: 'KERN',
    given: 'Persona Willem Jansen; `simNetWorthRows`/`simRequiredPortfolio` komen uit de horizon-kernel-solver.',
    when: 'De projectielijn en het vrijheidsdoel-label op de hub worden vergeleken met de oracle.',
    then: 'Kernel-cijfers zijn NIET handmatig narekenbaar (solver, geen gesloten formule) — verifieer 1-op-1 tegen `/beheer/horizon-tabellen-mij` voor persona Willem: eindmarker-label, exact vrijheidsdoel-bedrag (`simRequiredPortfolio`) en eindleeftijd. De hub-cijfers moeten exact overeenkomen met /toekomst (zelfde simulatiebron).',
    assertion: {
      kind: 'oracle',
      source: '`/beheer/horizon-tabellen-mij` (persona Willem) — horizon-kernel-solver, geen pure vitest-toets mogelijk',
    },
  },
  {
    workflow: 'WF-OVZ-06',
    scenarioId: 'UAT-OVZ-06',
    titel: 'Voortgang van doelen volgen',
    kriticiteit: 'BELANGRIJK',
    given: 'Doel "Eerste 10K belegd": current €2.350, target €10.000. Doel "Noodfonds 5.000": current €2.000, target €5.000.',
    when: '`computeGoalProgress` berekent het percentage per doel.',
    then: 'Eerste 10K belegd: round(2.350/10.000×100) = 24%. Noodfonds 5.000: round(2.000/5.000×100) = 40%. Sortering "achterlopende eerst" → 24% vóór 40%.',
    assertion: {
      kind: 'exact',
      expected: 'pct1=24; pct2=40',
      source: 'lib/goal-data.ts#computeGoalProgress — échte productiefunctie, geen mirror',
    },
  },
  {
    workflow: 'WF-OVZ-07',
    scenarioId: 'UAT-OVZ-07',
    titel: 'Vrijheidsstrip: voortgang naar vrijheid zien',
    kriticiteit: 'KERN',
    given: 'Persona Willem Jansen; freedomPct komt uit `computeFreedomProgress` (FIRE-eligible netto vermogen ÷ requiredPortfolio, horizon-kernel-afhankelijk).',
    when: 'Het percentage en de aftelling in de vrijheidsstrip worden geverifieerd.',
    then: 'NIET handmatig narekenbaar (kernel-solver) — verifieer via `/beheer/horizon-tabellen-mij` voor Willem; verwacht orde van grootte 60–95% (persona "Bijna binnen"), geen 100%.',
    assertion: {
      kind: 'oracle',
      source: '`/beheer/horizon-tabellen-mij` (persona Willem) — horizon-kernel-solver, geen pure vitest-toets mogelijk',
    },
  },
  {
    workflow: 'WF-OVZ-08',
    scenarioId: 'UAT-OVZ-08',
    titel: 'Hero-widgets samenstellen (partial- vs. replace-save, dynamische widgets nooit stil verloren)',
    kriticiteit: 'BELANGRIJK',
    given: 'Persona Daan Bakker met 8 actieve widgets in de hero-rail, waaronder minstens één dynamische widget (`spend_limit:*`/`holding_fav:*`/`budget_fav:*` — buiten `WIDGET_CATALOG`).',
    when: 'De gebruiker voegt een widget toe, sleept, wijzigt formaat, verwijdert een widget en slaat op (debounced of via de "Gereed"-knop); en apart: gebruikt een vervang-actie ("Alles leegmaken", "Vul dashboard", een preset of "Automatisch samenstellen").',
    then: 'De nieuwe indeling is server-side opgeslagen (PUT /api/widgets) en overleeft een herlaad; "alles leegmaken" herstelt de defaults (Voortgang doelen + Vrijheidsstrip). Puur een configuratie-workflow, geen eigen berekening. Save-modus (bugfix Notion 2026-08-09-testbug-03b440 "Grenzenpot"): resize/reorder/hide/add zijn `partial` — alleen id\'s die de gebruiker in déze sessie zelf uitzette (`deactivatedIds`) gaan op `enabled:false`; een dynamische widget die de server ná mount injecteerde (net aangemaakte grenzenpot/favoriet, nog niet in de lazy `useState`-seed) of die tijdelijk buiten beeld viel (`isWidgetVisible`-filter) gaat ONGEWIJZIGD mee terug — eerder wiste elke losse resize zo\'n widget stilzwijgend, onherstelbaar via de UI (de picker toont `spend_limit:*` bewust niet, ADR 0092 besluit 1). "Alles leegmaken"/"Vul dashboard"/preset/"Automatisch samenstellen" zijn `replace` — alles wat niet in de nieuwe lijst zit gaat bewust uit. "Vul dashboard" en "Automatisch samenstellen" nemen dynamische widgets nu uit `allPrefs` (de server-lijst), niet alleen uit de lokale `activeWidgets`, zodat een net-server-geïnjecteerde pot/favoriet niet alsnog verdwijnt. Let op (widget-gated berekenen): de widget-exclusieve data (week-overzicht, heatmap, huishoud-activiteit) wordt alleen berekend zolang die widget actief is — een NÉT aangezette week-/heatmap-/huishouden-widget kan tot de eerstvolgende data-refresh leeg zijn; briefing-voedende motoren (backtest/kosten/hvb) blijven altijd draaien. Reverse-sync bij favoriet-widgets: het verwijderen van een `holding_fav:*`/`budget_fav:*`-widget zet ook de favorietstatus van de onderliggende holding/budget terug (PATCH /api/holdings/[id] resp. PUT /api/budgets/favorites, gevolgd door router.refresh) — favoriet- en widgetweergave lopen nooit uit de pas. Onderaan de grid staat in bewerkmodus een tweede "Gereed"-knop die dezelfde afsluit-flow aanroept als de knop bovenaan (hero-rail), zodat afsluiten niet terugscrollen vereist.',
    assertion: {
      kind: 'ui-only',
      source: 'components/widgets/draggable-widget-grid.tsx#mergeWidgetPrefsForSave/performSave (partial vs. replace) + lib/widget-catalog.ts + app/api/widgets/route.ts — configuratie-workflow, geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-OVZ-09',
    scenarioId: 'UAT-OVZ-09',
    titel: 'Vrijheidstijd-totaal + week-delta (kop-zin en briefing-mail)',
    kriticiteit: 'KERN',
    given: 'Persona Willem (netto vermogen €1.619.700, begrote maanduitgaven €1.495) en persona Daan (netto vermogen −€4.200). Plus een week-over-week-scenario op één account: week 1 wordt bevroren terwijl de transactiehistorie nog half geïmporteerd is (€120.000 netto vermogen bij een kunstmatig lage €200/mnd → ±18.250 vrijheidsdagen), week 2 draait op de realistische €3.000/mnd (±1.217 dagen).',
    when: '`computeFreedomTotal` berekent de vrijheidsdagen voor beide persona\'s; `computeFreedomDelta` bepaalt daarna de week-over-week delta inclusief plausibiliteitsgrens.',
    then: 'Willem: dailyExpenses = 1.495×12/365 = €49,15/dag; totalDays ≈ 32.957 (positief, isDeficit=false). Daan: netto vermogen −4.200 → isDeficit=true (geen gevierde dagen-teller, "Je schulden zijn nu groter dan je bezittingen — elke afgeloste euro telt" i.p.v. een positief getal; sinds kaart H15 benoemt die regel de stand en niet de gebruiker — een tekort is geen beginner). De totaal-formule is ongewijzigd; de week-overzichtdata wordt sinds fase 2 alleen berekend zolang de "deze week"-widget actief is (widget-gated) — bij een net aangezette widget kan de kaart tot de eerstvolgende refresh nog leeg zijn. WEEK-OVER-WEEK (guard, bug "−3788 dagen minder"): het ruwe verschil van ±−17.033 dagen is géén weekbeweging maar een datacorrectie; het valt buiten de plausibele bandbreedte — |delta| ≥ 365 dagen (FREEDOM_DELTA_MIN_DAYS) ÉN > 25% van het huidige totaal (FREEDOM_DELTA_MAX_SHARE) — en wordt onderdrukt: deltaDays=null + isImplausibleDelta=true, waarna het vrijheidsblok van de briefing-mail het totaal zonder weekverschil toont. Een normale week (€2.500 gespaard bij €3.000/mnd) geeft gewoon +25 dagen; een grote absolute beweging op een grote portefeuille (bv. 1.500 dagen op 32.000) blijft óók zichtbaar — beide voorwaarden moeten gelden. IN-APP SURFACE VERVALLEN (UR2-09, eigenaar-besluit 31 aug 2026): het blok "Jouw vrijheid deze week" op /overzicht is verwijderd — een week bevroren getal naast live-herrekenende kerngetallen liet dezelfde vrijheidstijd binnen vijf minuten drie waarden aannemen (113 jaar bevroren, 0% op-weg-balk, 0 dagen na weergave-wissel) en de Ververs-knop raakte het niet. De week-delta leeft nog uitsluitend in de briefing-e-mail (lib/briefing/email-template.ts). Op /overzicht blijft alleen de kop-zin naast de masthead, en die rekent LIVE uit `computeFreedomTotal` van het request (`buildBriefingHeadline`, zonder weekverschil) — bij een ontbrekende geloofwaardige uitgavenbasis of een tekort valt hij weg i.p.v. een becijferde claim te doen.',
    assertion: {
      kind: 'exact',
      expected: 'willemIsDeficit=false; willemTotalDaysPositief=true; daanIsDeficit=true; opgeblazenDelta=onderdrukt; opgeblazenImplausibel=true; normaleDelta=25',
      source: 'lib/briefing/overview-briefing.ts#computeFreedomTotal + #computeFreedomDelta — échte productiefuncties, geen mirror',
    },
  },
  {
    workflow: 'WF-OVZ-10',
    scenarioId: 'UAT-OVZ-10',
    titel: 'Wekelijkse briefing lezen, doorklikken en verversen',
    kriticiteit: 'BELANGRIJK',
    given: 'Aanbeveling "Verlaag je uitgavenratio naar 80%": `freedom_days_per_year=45`, `euro_impact_monthly=340`.',
    when: 'Het impact-badge op het briefing-tipkaartje wordt gerenderd.',
    then: 'Badge toont "+45 dagen vrijheid/jr" en "+€4.080/jr" (= €340×12) — directe 1-op-1 passthrough van de recommendation-data, geen afgeleide berekening.',
    assertion: {
      kind: 'exact',
      expected: 'freedomDaysPerYear=45; euroImpactYearly=4080',
      source: 'lib/recommendation-data.ts (directe passthrough, gemirrord: euroImpactYearly = euro_impact_monthly×12) — zie ovz-checks.ts',
    },
  },
  {
    workflow: 'WF-OVZ-11',
    scenarioId: 'UAT-OVZ-11',
    titel: 'Vrijheidsweek delen',
    kriticiteit: 'OVERIG',
    given: 'De deelbare vrijheidskaart toont vrijheids-%/gewonnen dagen/FIRE-aftelling, server-side samengesteld.',
    when: 'De gebruiker klikt "Deel" in de briefing-kop; de deel-sheet opent met drie inzichts-standen (Weinig/Gemiddeld/Veel) en een live kaart-voorbeeld; hij kiest een stand en daarna een deel-optie.',
    then: 'De sheet toont per stand een voorbeeld dat exact is wat gedeeld wordt (Weinig: alleen vrijheidstijd — geen %, naam of bedragen; Veel pas na expliciete bevestiging, ook bij een onthouden voorkeur). De cijfers op de kaart sporen met de hub-waarden (OVZ-07/OVZ-09); kaart, colofon-uitnodiging (<host>/check) en deel-mechaniek (afbeelding/link/native share) zijn een presentatie-/trackinglaag zonder eigen berekening; de deel-link wijst naar /check, niet naar de ingelogde app.',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/deel-kaart-sheet.tsx + freedom-card.tsx + share-dialog.tsx — presentatielaag, geen eigen cijfermatige uitkomst hier getoetst; Weinig-grens bewaakt door freedom-card.weinig.test.tsx + deel-kaart-sheet.test.tsx',
    },
  },
  {
    workflow: 'WF-OVZ-12',
    scenarioId: 'UAT-OVZ-12',
    titel: 'Status-/vrijheidsmelding minimaliseren en heropenen',
    kriticiteit: 'BELANGRIJK',
    given: 'Persona Marijke Vermeer (financieel vrij/pensioen), banner-niveau altijd \'info\'.',
    when: 'De gebruiker minimaliseert de banner en heropent op een ander apparaat.',
    then: 'De banner consumeert alleen de bestaande vrijheidsvlag (`isFinanciallyFree`) — er wordt niets herberekend; de voorkeur is server-side cross-device bewaard (`profiles.status_banner_minimized`). Niveau \'info\' heropent nooit automatisch (escalatie geldt alleen op de deelroutes).',
    assertion: {
      kind: 'ui-only',
      source: 'components/app/page-status-provider.tsx + lib/page-status/freedom.ts — consumeert een bestaande vlag, geen eigen berekening',
    },
  },
  {
    workflow: 'WF-OVZ-13',
    scenarioId: 'UAT-OVZ-13',
    titel: 'Maand-check-in starten vanaf de hub',
    kriticiteit: 'BELANGRIJK',
    given: 'Persona Daan Bakker, dag 1–7 van de maand, check-in nog niet gedaan.',
    when: 'De gebruiker opent /overzicht en klikt "Start" of sluit de banner.',
    then: 'Banner-ingang navigeert naar /core/checkin resp. verbergt zichzelf voor deze sessie/maand (sessionStorage). De check-in-flow zelf valt buiten deze scope (vervolg: UAT-MIJN-26).',
    assertion: {
      kind: 'ui-only',
      source: 'components/overview/checkin-banner.tsx — banner-ingang zonder eigen berekening',
    },
  },
  {
    workflow: 'WF-OVZ-14',
    scenarioId: 'UAT-OVZ-14',
    titel: 'Welkomstgids doorlopen (eerste gebruik)',
    kriticiteit: 'BELANGRIJK',
    given: 'Persona Daan Bakker (nieuwe gebruiker), gids nog niet gesloten.',
    when: 'De gebruiker vinkt stappen af, navigeert door schermen en sluit de gids — in Eenvoudige én in Volledige weergave.',
    then: 'DE GIDS STAAT NÁ DE BEGROETING (H20/S13), in beide weergaven — nooit erboven. Het kruisje (en "Gids inklappen" / "Nee, klap in") MINIMALISEERT de gids direct, zonder tussenvraag (L11), tot een klein knopje naast de pagina-\'i\'; één klik daarop zet hem terug op hetzelfde scherm. Die stand wordt server-side onthouden (`profiles.module_guide_state[\'welcome:guide\'].minimized`) en geldt dus ook op een ander apparaat. "Verberg de gids voorgoed" is de aparte, secundaire link: die haalt óók het knopje weg (nooit meer terug, ook niet na uit-/inloggen). VOORTGANG IS AFGELEID (M1): stappen waarvan de app het antwoord al kent — bezittingen, schulden, budget, gekoppelde rekening, doelen, grafiek-instellingen — staan afgevinkt zónder handmatige klik, en "heb je hier al gekeken"-stappen volgen het bezoekregister (user_feature_visits). Afgeleide vinkjes worden NOOIT naar completedStepIds geschreven en zijn niet klikbaar; niet-van-toepassing-stappen vallen buiten de noemer (0/4 wordt dan bv. 3/3 · 1 n.v.t.). In Eenvoudig is de gids gecomprimeerd (APP-6): de stappen staan als afvinkregels onder elkaar i.p.v. als grote proceskaarten, zonder stapomschrijvingen en zonder "Scherm N van M"-teller (de stippen naast de kicker dragen de positie) — op mobiel (390px) beslaat de gids daarmee hooguit ~⅓ van het eerste scherm. In Volledig is de gids ongewijzigd. In BEIDE modi sluit de gids af met één regel die de weergavekeuze noemt en naar /mijn/uiterlijk linkt (APP-2).',
    assertion: {
      kind: 'exact',
      expected: 'gevuld=4/4; leeg=0/4; nvt=3/3+1; partner=0/4',
      source: 'lib/welcome-guide.ts#deriveGuideStates + #countScreenProgress — échte productiefuncties op deterministische feiten',
    },
  },
  {
    workflow: 'WF-OVZ-15',
    scenarioId: 'UAT-OVZ-15',
    titel: 'Samengestelde-rente-inzicht verkennen (spaargeld vs. beleggen)',
    kriticiteit: 'BELANGRIJK',
    given: 'Persona Willem Jansen: liquide cash €57.700 (ruim boven de €10.000-drempel), 30 jaar, 0,5% vs. 7%, slider €0 en €500/mnd.',
    when: '`compareCompound` berekent beide scenario\'s.',
    then: 'Bij €0/mnd: conservatief ≈ €67.013, ambitieus ≈ €439.227, verschil ≈ €372.214, multiplier 6,55 ≥ 1,05 → kaart terecht zichtbaar (`hasDramaticDelta=true`). Bij €500/mnd: conservatief ≈ €260.693, ambitieus ≈ €1.005.992.',
    assertion: {
      kind: 'exact',
      expected: 'cons0=67013; amb0=439227; hasDramaticDelta=true; cons500=260693; amb500=1005992',
      source: 'lib/compound-projection.ts#compareCompound — échte productiefunctie, geen mirror',
    },
  },
  {
    workflow: 'WF-OVZ-16',
    scenarioId: 'UAT-OVZ-16',
    titel: 'Overzicht afdrukken of als PDF opslaan',
    kriticiteit: 'OVERIG',
    given: 'De hub-pagina met print-CSS (`print:hidden`-classes).',
    when: 'De gebruiker klikt de printer-knop.',
    then: 'De browser-printdialoog opent; navigatie/knoppen/chat/"Vorige weken"-disclosure zijn verborgen op de afdruk. Zuiver een presentatie-laag, geen eigen berekening.',
    assertion: {
      kind: 'ui-only',
      source: 'components/overview/print-overzicht-button.tsx (window.print) — geen cijfermatige uitkomst',
    },
  },
  {
    workflow: 'WF-OVZ-19',
    scenarioId: 'UAT-OVZ-19',
    titel: 'Tips van Fin beoordelen: Doe nu / Later / Negeren',
    kriticiteit: 'KERN',
    given: 'Twee seed-aanbevelingen: (1) "Verlaag je uitgavenratio naar 80%" — prioriteit 5, +45 dagen/jr, €340/mnd; (2) "Overweeg zakelijke uitgaven via werkgever" — prioriteit 3, +10 dagen/jr, €75/mnd. "Nu" = 5 juli 2026.',
    when: 'De tips worden gesorteerd op `priority_score` en de gebruiker kiest "Later" op tip 2.',
    then: 'Sortering: tip 1 (prio 5) staat boven tip 2 (prio 3). Bij "Later": `postponed_until` = 5 juli + 14 dagen = 19 juli 2026 (POSTPONE_DAYS=14, identiek aan de WILL-mirror). Bij "Doe nu" op tip 1 krijgt de nieuwe actie freedom-days-impact 45 en €-impact €340/mnd (1-op-1 uit de brontip).',
    assertion: {
      kind: 'exact',
      expected: 'sortering=[prio5,prio3]; postponedUntil=2026-07-19; actieFreedomDays=45; actieEuroImpact=340',
      source: 'components/overview/tips-lijst.tsx r37/79 (POSTPONE_DAYS=14, gemirrord) + directe priority_score-sortering + 1-op-1 impact-passthrough — zie ovz-checks.ts',
    },
  },
  {
    workflow: 'WF-OVZ-20',
    scenarioId: 'UAT-OVZ-20',
    titel: 'Handmatig een actie toevoegen',
    kriticiteit: 'KERN',
    given: 'Twee bestaande seed-acties met freedom_days_impact 45 en 10 (totaal open vrijheidsdagen = 55); nieuwe handmatige actie met freedom_days_impact 20.',
    when: 'De gebruiker slaat de nieuwe actie op.',
    then: 'De totale "open vrijheidsdagen"-teller stijgt met exact 20 (van 55 naar 75); de nieuwe actie komt bovenaan de lijst met bron-label "handmatig".',
    assertion: {
      kind: 'exact',
      expected: 'totaalVoor=55; totaalNa=75; delta=20',
      source: 'lib/dashboard-data-loader.ts (totalFreedomDaysOpen, directe som-mirror op synthetische actielijst) — zie ovz-checks.ts',
    },
  },
  {
    workflow: 'WF-OVZ-21',
    scenarioId: 'UAT-OVZ-21',
    titel: 'Open acties beheren: afronden, uitstellen, afwijzen, bewerken, toewijzen',
    kriticiteit: 'KERN',
    given: 'Seed-actie "Mail HR over vergoedingen" wordt 2 weken uitgesteld op 5 juli 2026; 7 open/uitgestelde acties (cap = 5 zichtbaar).',
    when: 'De uitstel-datum wordt berekend en de cap-op-5-sortering wordt toegepast.',
    then: 'Uitgesteld-tot = 5 juli + 2×7 dagen = 19 juli 2026 (`action-board.tsx` r114-119). Met 7 acties: slechts de top 5 (gesorteerd op `priority_score`, dan `sort_order`) zijn zichtbaar in het blok; de knop "Bekijk alle N" toont N=7.',
    assertion: {
      kind: 'exact',
      expected: 'uitgesteldTot=2026-07-19; zichtbaarAantal=5; totaalN=7',
      source: 'components/app/action-board.tsx r114-119 (uitstel-datum-mirror, identiek patroon aan WILL/CASH) + priority_score/sort_order-sortering — zie ovz-checks.ts',
    },
  },
  {
    workflow: 'WF-OVZ-22',
    scenarioId: 'UAT-OVZ-22',
    titel: "Overzicht-widgets en de mini-vermogensgrafiek volgen de euro-weergave, naad zonder knik",
    kriticiteit: 'BELANGRIJK',
    given: "`buildSimNetWorthRows` levert per jaar het geprojecteerde volledige netto vermogen (nominaal, D7); synthetische kernelrijen waarvan de euro-inflatie exact de portefeuillegroei opheft (leeftijd 60→factor 1/€500.000, 61→2/€1.000.000, 62→4/€2.000.000 — machten van 2, exact deelbaar in IEEE-754) — zo blijft het REËLE netto vermogen op elke leeftijd €500.000, precies gelijk aan `currentNetWorth`.",
    when: "De mini-vermogensgrafiek/widgets deflateren het projectiedeel via `deflate()` op de rij-eigen `inflationFactor` (die sinds brok E op elke `buildSimNetWorthRows`-uitvoerrij meereist), NA de bestaande reconcile-offset (D7 — de offset blijft nominaal, deflatie gebeurt pas op het resultaat).",
    then: 'Jaar 0 (huidige leeftijd, factor 1.0) gedeflateerd is exact gelijk aan `currentNetWorth` — geen knik op de naad tussen historie en projectie. Elke volgende leeftijd deflateert met zíjn eigen factor, niet met een globale/vaste factor. Dit is de kern-eis van AC-F1/T11: de rij-eigen factor (`buildSimNetWorthRows` + `deflate`) i.p.v. een geherimplementeerde deflatie op de widget zelf.',
    assertion: {
      kind: 'exact',
      expected: 'real60=500000; real61=500000; real62=500000; jaar0GelijkAanCurrentNetWorth=true',
      source: 'lib/horizon/networth-rows.ts#buildSimNetWorthRows + lib/euro-display.ts#deflate — échte productiefuncties, synthetische kernelrijen (geen mirror) — zie ovz-checks.ts',
    },
  },
  {
    workflow: 'WF-OVZ-23',
    scenarioId: 'UAT-OVZ-23',
    titel: 'Vermogens-widget met eigen selectie: gewogen som, verloop en stale filtering (ADR 0120)',
    kriticiteit: 'KERN',
    given: "Selectie {assetIds:[a1,a2,verwijderde-id], debtIds:[d1,verwijderde-id]}: a1 DEGIRO €200.000 (net_worth_inclusion_pct 100), a2 spaarrekening €50.000 (pct 50 → gewogen €25.000), d1 hypotheek €30.000 (pct 100). Twee historie-scenario's op hetzelfde 12-maands venster: (kort) alleen a1 heeft één maandmeting → minder dan de vereiste 2 echte maanden; (lang) a1/a2/d1 hebben elk twee maandmetingen, al gewogen door de aanroeper (zoals `loadEntitySparklines` levert).",
    when: "`buildWealthSelectionWidgetData` bouwt het widget-bundelveld uit selectie + rijen + historie-input, voor beide historie-scenario's.",
    then: "Gewogen som: assetsTotal = 200.000 + (50.000×0,5) = €225.000; debtsTotal = 30.000 (schulden verlagen het totaal) → total = €195.000. De twee verwijderde id's in de selectie tellen niet mee — niet in de som, niet in `count` (2 bezittingen, 1 schuld i.p.v. 3/2) — stale id's verdwijnen stil (ADR 0120 besluit 5). Historie kort: onder de 2-maanden-drempel → `history=[]`, de widget toont \"Nog geen verloop\" i.p.v. een verzonnen lijn (ADR 0120 gevolgen). Historie lang: de reeks is de SOM van de gewogen per-entiteit-reeksen per maand (180.000+22.500−28.000=€174.500, dan 200.000+25.000−30.000=€195.000), rechts uitgelijnd op de laatste twee maandsleutels van het venster — het laatste punt (€195.000) is exact gelijk aan het actuele `total`, dus geen knik op de naad historie↔actueel (zelfde eis als de euro-weergave-ADR's 0090/0093 elders afdwingen).",
    assertion: {
      kind: 'exact',
      expected: 'total=195000; count=2a/1d; kortHistorie=leeg; langHistorieLengte=2; langLaatstePunt=195000',
      source: 'lib/wealth-selection.ts#buildWealthSelectionWidgetData (échte productiefunctie, ook getest in lib/wealth-selection.test.ts) — zie ovz-checks.ts',
    },
  },
  {
    workflow: 'WF-OVZ-24',
    scenarioId: 'UAT-OVZ-24',
    titel: 'Vermogens-widget met eigen selectie: bewerk-sheet, privacy-modus, perspectief en lege staat (ADR 0120)',
    kriticiteit: 'BELANGRIJK',
    given: "Widget `vermogen_selectie` staat standaard UIT (geen default-aanwezigheid in de hero-rail). GET /api/wealth-selection levert de keuzelijst en filtert hard op `user_id` (de assets-SELECT-policy is huishoud-gedeeld, dit filter is de enige scoping die dat corrigeert). PUT /api/wealth-selection schrijft alleen de eigen `wealth_widget_selection`-sleutel — een id van een andere gebruiker (partner) in de PUT-body valt stil af (`route.test.ts`: \"slaat alleen EIGEN, bestaande id's op — een id van een andere gebruiker valt stil af\"). Perspectief-provider staat op een niet-personal perspectief (huishouden/partner); privacy-modus (`useMaskedAmounts`) staat aan.",
    when: 'De gebruiker klikt het bewerk-potlood op de widget (buiten de globale grid-edit-modus) → de ShellOverlay-sheet opent, kiest bezittingen/schulden en slaat op; apart: de gebruiker heeft nog geen selectie; apart: de gebruiker wisselt perspectief; apart: de gebruiker zet privacy-modus aan.',
    then: 'De keuzelijst in de sheet toont uitsluitend eigen bezittingen/schulden — nooit de posten van de partner, ondanks de huishoud-gedeelde SELECT-policy op `assets`. Opslaan muteert uitsluitend `profiles.feature_preferences.wealth_widget_selection`; een meegestuurd partner-id wordt server-side genegeerd, niet opgeslagen (route.test.ts-fixture dekt dit). Bij géén selectie toont de widget een empty state met CTA "Kies bezittingen" (full/quarter-varianten hebben elk hun eigen compacte empty-view) en telt de widget niet mee als default-aanwezige widget. Bij een ander perspectief dan personal toont de widget het label "Persoonlijk" (`showPersonalTag`) — de widget blijft altijd op eigen data, `balance_snapshots` kent geen huishoud-model (ADR 0120 besluit 4). Bij privacy-modus maskeren alle bedragen, INCLUSIEF het SVG-tekstlabel (`spark.firstValue` via `formatMaskedCurrency(…, masked)`) — niet alleen de HTML-bedragen via `MaskedAmount`. Dit laatste (SVG-maskering) is een VISUELE render-eis zonder geautomatiseerde test op dit moment — markeer als handmatige check bij een live UAT-run.',
    assertion: {
      kind: 'ui-only',
      source: "app/api/wealth-selection/route.ts (GET/PUT, own-row filter) + app/api/wealth-selection/route.test.ts (partner-id-fixture) + components/widgets/vermogen-selectie-widget.tsx (personalTag/empty-state/SVG-maskering) — configuratie-/weergave-workflow zonder eigen berekening; de SVG-maskering is een niet-geautomatiseerde visuele check (handmatig te toetsen)",
    },
  },
  {
    workflow: 'WF-OVZ-25',
    scenarioId: 'UAT-OVZ-25',
    titel: 'Mijlpaal gepasseerd: eenmalige viering, briefing boven de vouw, melding (ADR 0123)',
    kriticiteit: 'BELANGRIJK',
    given: 'Een gebruiker (eigen perspectief) wiens motor eerder is geseed (`profiles.milestones_seeded_at` gezet) en wiens canonieke netto vermogen sindsdien een drempel passeerde (bv. €98k → €101k, drempel €100k). De detectie draait in-band bij de /overzicht-load (OverzichtSecondaryLoader), consume-don\'t-recompute op de bundelwaarden.',
    when: 'De gebruiker opent /overzicht; apart (b): sluit de viering (of laat \'m auto-dismissen) en opent /overzicht op een tweede apparaat; apart (c): herlaadt /overzicht meermaals in dezelfde staat.',
    then: 'a) Er verschijnt precies één `achieved_milestones`-rij (sleutel `vermogen-100k`) en de krant-stijl viering (MilestoneCelebration via de host, geen confetti/emoji — W4.5) toont de mijlpaal mét vrijheidstijd-vertaling en een "Deel dit"-aanbod; de briefing draagt de entry `milestone:fresh:<key>` boven de vouw (positioneel vooraan geïnjecteerd ná de week-freeze, <48u; daarna verdwijnt de entry — hij wordt nooit in de snapshot teruggeschreven) en /berichten bevat een melding van het type `milestone` (seed- en doel-rijen geven géén melding). b) Elke dismiss-route bevestigt server-side (`acknowledged_at` via POST /api/milestones/acknowledge); daarna viert géén enkel apparaat de mijlpaal opnieuw (cross-device once-guard, geen localStorage). c) Herlaad voegt geen tweede rij toe (UNIQUE user_id+milestone_key) en een drempel die na een dip opnieuw gepasseerd wordt viert niet opnieuw. Randgeval: bij de allereerste run (seed) wordt niets gevierd — reeds gepasseerde drempels landen stil met `source=\'seed\'`. Checkpoints op verre doelen (≥2 jaar looptijd; sleutels `doel-checkpoint:<id>:25/50/75`, plan 3c) tellen als lichtste mijlpaalsoort mee: gevierd mét doelnaam, maar een zwaardere drempel in dezelfde run wint en passeren meerdere drempels tegelijk dan viert alleen de zwaarste (regen-rem).',
    assertion: {
      kind: 'ui-only',
      source: 'lib/milestones/{detect,run}.ts (idempotentie + seed getest in run.test.ts/detect.test.ts) + lib/briefing/milestone-entry.ts (rang/48u getest) + components/app/milestone-celebration-host.tsx (acknowledge getest) + supabase/migrations/20260831160000 (UNIQUE + RLS, leaktest scripts/verify-achieved-milestones-rls.sql bij apply) — de live cross-device-toets (b) is een handmatige check in de UAT-run',
    },
  },
]

export const OVZ_ACCEPTANCE: AcceptanceSet = {
  zone: 'OVZ',
  criteria,
}
