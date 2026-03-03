/**
 * Release notes for TriFinity.
 * Add new releases at the TOP of the array (newest first).
 *
 * To add a new release:
 * 1. Copy the template below
 * 2. Fill in version, date, and sections
 * 3. Place it at index 0 of RELEASE_NOTES
 *
 * Template:
 * {
 *   version: 'fin_prod_X.Y',
 *   date: 'YYYY-MM-DD',
 *   title: 'Korte titel',
 *   sections: [
 *     {
 *       module: 'De Kern' | 'De Wil' | 'De Horizon' | 'Identiteit' | 'Platform',
 *       color: 'amber' | 'teal' | 'purple' | 'zinc' | 'blue',
 *       items: [
 *         { title: 'Feature naam', description: 'Korte omschrijving' },
 *       ],
 *     },
 *   ],
 * }
 */

export type ReleaseItem = {
  title: string
  description: string
}

export type ReleaseSection = {
  module: string
  color: 'amber' | 'teal' | 'purple' | 'zinc' | 'blue' | 'rose'
  items: ReleaseItem[]
}

export type ReleaseNote = {
  version: string
  date: string
  title: string
  sections: ReleaseSection[]
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: 'fin_prod_0.79',
    date: '2026-03-03',
    title: 'Vermogensbalans, cash-as-asset, balance snapshots & grote refactoring',
    sections: [
      {
        module: 'Rapportages — Vermogensbalans',
        color: 'amber',
        items: [
          {
            title: 'Persoonlijke balans rapportage',
            description:
              'Nieuwe rapportagepagina /rapportages/balans met een volwaardige vermogensbalans in scontrovorm (twee-kolom layout). Activa links (vaste activa, vlottende activa, liquide middelen), passiva rechts (eigen vermogen, lang en kort vreemd vermogen). Balansequilibrium is altijd in evenwicht.',
          },
          {
            title: 'Kengetallen en ratio\'s',
            description:
              'Solvabiliteitsratio, schuldgraad en liquiditeitsratio (current ratio) worden automatisch berekend en getoond met visuele balken en tooltip-formules. Sub-groepering per asset/debt type binnen elke categorie.',
          },
          {
            title: 'Kassabon-stijl met vrijheidstijd',
            description:
              'Netto vermogen toont het vrijheidstijd-equivalent volgens de TriFinity-filosofie. De balans volgt het editorial design language met scontrovorm layout.',
          },
        ],
      },
      {
        module: 'De Kern — Cash-as-Asset',
        color: 'amber',
        items: [
          {
            title: 'Bankrekeningen als assets',
            description:
              'Bankrekeningen zijn nu volledig geintegreerd in het assetsysteem. Cash verschijnt als eigen categorie op /core/assets met type-specifieke subtypes (betaal, spaar, gezamenlijk, zakelijk), iconen en kleuren. /core/cash verwijst door naar /core/assets.',
          },
          {
            title: 'Diepe database-integratie',
            description:
              'Nieuwe linked_asset_id FK op bank_accounts en has_budget_tracking op assets. Bestaande bankrekeningen worden automatisch gemigreerd naar cash asset records. Netto-vermogensberekening voorkomt dubbeltelling van gelinkte rekeningen.',
          },
          {
            title: 'GoCardless sync uitgebreid',
            description:
              'Saldo-synchronisatie via GoCardless werkt nu het gelinkte asset bij. Callback maakt automatisch een asset + bank_account aan bij nieuwe koppelingen.',
          },
        ],
      },
      {
        module: 'Platform — Balance Snapshots',
        color: 'zinc',
        items: [
          {
            title: 'Per-entiteit balanshistorie',
            description:
              'Nieuwe balance_snapshots tabel met RLS en indexen voor het bijhouden van individuele asset- en schuldbalansen per maandelijks snapshot-punt. Maakt composition-over-time analyse mogelijk (welke rekeningen groeien/krimpen).',
          },
          {
            title: 'Snapshot API\'s uitgebreid',
            description:
              'POST, auto- en cron-snapshot routes vangen nu per-entiteit balansen op via captureBalanceSnapshots(). Nieuwe /api/snapshots/balances endpoint en BalanceHistoryChart component voor visualisatie.',
          },
        ],
      },
      {
        module: 'Platform — Refactoring',
        color: 'zinc',
        items: [
          {
            title: 'FIRE-berekeningen geconsolideerd (RF-001)',
            description:
              'fireTarget, freedomPercentage, freedomTime, savingsRate en effectiveExpenses geextraheerd naar lib/core-metrics.ts als pure functies. 19 unit tests. Elimineert subtiele inconsistenties tussen pagina\'s.',
          },
          {
            title: 'SWR-gebruik gestandaardiseerd (RF-002)',
            description:
              'Alle hardcoded SWR = 0.04 vervangen door NL Box 3-gecorrigeerde SWR (2,88%). resolveFireParams() is nu de enige bron voor SWR-resolutie in de hele codebase.',
          },
          {
            title: 'FinancialInput/FinancialMetrics scheiding (RF-003)',
            description:
              'CoreData/HorizonInput vervangen door een helder onderscheid: FinancialInput (ruwe DB-data) vs FinancialMetrics (berekende waarden). 28 bestanden bijgewerkt. lib/mock-data.ts verwijderd.',
          },
          {
            title: 'Variabelenamen gestandaardiseerd (RF-005)',
            description:
              'Naamgevingsconventie: Engels voor alle code-identifiers, Nederlands alleen voor UI-strings en officiele Box 3-termen. 22 bestanden bijgewerkt (vrijheidsdagen → freedomDays, belasting → tax, etc.).',
          },
          {
            title: 'Gedupliceerde functies verwijderd (RF-006)',
            description:
              'Lokale formatEur() vervangen door de canonieke formatCurrency(). Inline vrijheidstijd-berekeningen vervangen door calculateFreedomTime() voor consistente edge-case afhandeling.',
          },
          {
            title: 'Financiele constanten gecentraliseerd (RF-007)',
            description:
              'Nieuwe lib/constants.ts als single source of truth voor SWR, rendement, inflatie, Box 3-parameters en AOW-waarden. Dubbele definities uit 10+ bestanden verwijderd.',
          },
          {
            title: 'DB→Frontend type mapper',
            description:
              'Nieuwe lib/db-mapper.ts voor automatische snake_case naar camelCase conversie van database-types naar frontend-types.',
          },
        ],
      },
      {
        module: 'De Horizon — Droomtransitie',
        color: 'purple',
        items: [
          {
            title: 'Droomachtige paginaovergang',
            description:
              'Naadloze, droomachtige transitie tussen /horizon en /horizon/whatif via een persistent gouden sluier-overlay. Drie fasen: content dissolve (400ms), gouden drempel (800ms) en onthulling (1200ms). prefers-reduced-motion support.',
          },
        ],
      },
      {
        module: 'De Kern — UX-verbeteringen',
        color: 'amber',
        items: [
          {
            title: 'Bestedingstrend stippellijn',
            description:
              'De budget-sparkline toont nu de huidige (onvolledige) maand als stippellijn, zodat je direct ziet dat het een voorlopig bedrag is.',
          },
          {
            title: 'Inklapbare voorspelling in budget modal',
            description:
              'De "voorspelling volgende maand" sectie in de budget detail modal is nu inklapbaar, zodat de focus op de huidige maand ligt.',
          },
        ],
      },
      {
        module: 'Platform — Overig',
        color: 'zinc',
        items: [
          {
            title: 'Vercel Speed Insights',
            description:
              'Web Vitals monitoring via @vercel/speed-insights voor real-time performance-inzichten in productie.',
          },
          {
            title: 'Sovereignty level alignment',
            description:
              'Fix: sovereignty level berekening is nu consistent tussen /dashboard en /identity pagina.',
          },
          {
            title: 'Monte Carlo & toekomstpaden fixes',
            description:
              'Monte Carlo detail modal data komt nu overeen met de chart overlay. Toekomstpaden details zijn consistent gemaakt met de grafiekdata.',
          },
          {
            title: 'Testdata uitgebreid naar 15 maanden',
            description:
              'Persona testdata (Lisa, Daan) uitgebreid naar 15 maanden transactiehistorie met seizoenscorrecties en realistische fluctuaties. Holdings data toegevoegd voor Lisa.',
          },
        ],
      },
    ],
  },
  {
    version: 'fin_prod_0.78',
    date: '2026-03-01',
    title: 'What-If Net Worth Planner, droomscenario chat & identity restructure',
    sections: [
      {
        module: 'De Horizon — What-If Planner',
        color: 'purple',
        items: [
          {
            title: 'What-If Net Worth Planner',
            description:
              'Volledig nieuwe pagina /horizon/whatif met interactieve sliders voor leeftijd, rendement, spaarquote en uitgaven. Real-time SimChart visualisatie toont het effect van aanpassingen op je vermogenspad en FIRE-leeftijd.',
          },
          {
            title: 'Levensgebeurtenissen integratie',
            description:
              'Voeg levensgebeurtenissen toe aan je What-If scenario (huis kopen, kinderen, carrierewisseling, erfenis). Elk event verschijnt als marker op de tijdlijn en beinvloedt de simulatie.',
          },
          {
            title: 'Scenario-acties en samenvatting',
            description:
              'Actieknoppen voor scenario-management: opslaan, vergelijken, resetten. Samenvatting toont delta-impact op FIRE-leeftijd en eindvermogen ten opzichte van je basisscenario.',
          },
          {
            title: 'Scenario presets',
            description:
              'Voorgedefinieerde scenario\'s als snelstartpunt: "Agressief sparen", "Sabbatical nemen", "Deeltijd werken", "Huis kopen". Een klik laadt alle sliders en events in.',
          },
          {
            title: 'Droomscenario AI-chat',
            description:
              'De Wil-persoonlijkheid helpt je dromen vertalen naar concrete levensgebeurtenissen via de nieuwe suggestLifeEvent tool. Beschrijf je droom ("ik wil een jaar door Azie reizen") en de AI stelt een passend event voor dat direct in je scenario wordt geladen.',
          },
          {
            title: 'FIRE-age delta-annotatie',
            description:
              'SimChart toont nu een delta-annotatie die het verschil in FIRE-leeftijd toont ten opzichte van je basisscenario (bijv. "+2,3 jaar" of "-1,8 jaar").',
          },
        ],
      },
      {
        module: 'Identiteit — Restructure',
        color: 'rose',
        items: [
          {
            title: 'Instellingen hub',
            description:
              'Nieuwe geconsolideerde instellingenpagina /identity/instellingen met vijf secties: Notificaties, Widgets, FIRE-parameters, Weergave en Gegevens. Widgets- en parameters-pagina\'s verwijzen door naar deze hub.',
          },
          {
            title: 'FIRE berekeningsparameters',
            description:
              'Verwacht rendement en inflatiepercentage zijn nu instelbaar via de instellingenpagina. resolveFireParams() verwerkt de waarden en wired ze door naar /core, /dashboard, /horizon en de use-horizon-fire-sim hook.',
          },
          {
            title: 'Profiel vereenvoudigd',
            description:
              'De profielpagina bevat nu alleen persoonlijke informatie en huishoudsamenstelling. FIRE- en kleurinstellingen zijn verplaatst naar /identity/instellingen.',
          },
          {
            title: '"Zo werkt TriFinity" gids',
            description:
              'Nieuwe gebruikersinstructies op de identity overzichtspagina die uitleggen hoe TriFinity werkt, wat de drie modules zijn en hoe de filosofie "Geld is opgeslagen tijd" wordt toegepast.',
          },
        ],
      },
      {
        module: 'De Kern — Budget UX',
        color: 'amber',
        items: [
          {
            title: 'Budget blob v2',
            description:
              'Vernieuwde watercolor-rendering met multi-layer effecten. Biologische animaties (cell-breathe, nucleus-pulse, membrane-breathe, organelle-drift) geven budgetten een organisch, levend gevoel. prefers-reduced-motion support.',
          },
          {
            title: 'Budget donut semantische kleuren',
            description:
              'De budget donut gebruikt nu semantische typeColors en childTypeColors in plaats van index-gebaseerde kleurtoewijzing, waardoor categorieën consistent dezelfde kleur behouden.',
          },
        ],
      },
      {
        module: 'Platform',
        color: 'zinc',
        items: [
          {
            title: 'FIRE simulatie-fixes',
            description:
              'Eenmalige levensgebeurtenissen geven nu het bedrag direct door (niet /12). deriveCountdown() voor consistente FIRE-countdown vanuit fireAgeFractional. computeFireRange gebruikt het gebruikersrendement voor scenario-offsets.',
          },
          {
            title: 'AI chat-context voor scenario\'s',
            description:
              'De globale chat FAB ontvangt nu scenario-context van de What-If pagina, zodat de AI-persoonlijkheden op de hoogte zijn van je actieve scenario bij het geven van advies.',
          },
          {
            title: 'TypeScript 5.9.3 vastgezet',
            description:
              'TypeScript versie vastgezet op 5.9.3 in package.json om consistentie tussen ontwikkelomgevingen te garanderen.',
          },
        ],
      },
    ],
  },
  {
    version: 'fin_prod_0.77',
    date: '2026-02-27',
    title: 'Simulatie-engine, 6 nieuwe horizon-widgets & AOW/pensioen',
    sections: [
      {
        module: 'De Horizon — Simulatie-engine',
        color: 'purple',
        items: [
          {
            title: 'Nieuwe FIRE simulatie-engine',
            description:
              'lib/fire-simulation.ts: volledig nieuwe pure-function simulatie-engine met runSimulation(), lifeEventsToCashflows() en SimResult type. Ondersteunt opbouw- en pensioenfase, Box 3-belastingdrag, inflatiecorrectie, en combineert levensgebeurtenissen (AOW, pensioen) als cashflows. Single source of truth voor /horizon, /core en /dashboard.',
          },
          {
            title: 'AOW & aanvullend pensioen als levensgebeurtenissen',
            description:
              'LIFE_EVENT_CATALOG in horizon-data.ts uitgebreid met AOW (inkomen vanaf AOW-leeftijd) en aanvullend pensioen. Worden automatisch meegenomen in de simulatie via lifeEventsToCashflows(). Gebruikers kunnen bedragen en startleeftijd aanpassen.',
          },
          {
            title: 'Horizon pagina grote UX-herwerking',
            description:
              'De /horizon pagina is grondig herschreven: nieuwe hero met simulatieresultaten, verbeterde KPI-kaarten met FIRE-leeftijd (fractioneel), portfoliowaarde bij FIRE, en impliciete onttrekkingsratio. Simulatie-engine vervangt de oude computeFireProjection voor de hoofdberekening.',
          },
          {
            title: 'useHorizonFireSim hook',
            description:
              'Nieuwe gedeelde hook lib/hooks/use-horizon-fire-sim.ts bundelt het laden van profiel, vermogen, budgetten en levensgebeurtenissen en roept runSimulation() aan. Gebruikt door /horizon, /core en /dashboard voor consistente FIRE-berekeningen.',
          },
        ],
      },
      {
        module: 'De Horizon — Widgets',
        color: 'purple',
        items: [
          {
            title: '6 nieuwe dashboard-widgets',
            description:
              'Zes horizon-widgets toegevoegd aan het widget-systeem: Vrijheidsscenario\'s (optimistisch/basis/conservatief FIRE-leeftijd), Vermogenspad (mini sim-chart met opbouw→pensioen), Passief Inkomen (SWR-gebaseerde maandelijkse schatting), Box 3-belastingdrag (jaarlijkse Box 3-last), Vrijheidsmijlpalen (Coast/Barista/Lean/Full FIRE), en Historische Weerbaarheid (backtesting successcore).',
          },
          {
            title: 'Sim-chart component & widget',
            description:
              'Nieuw SimChart (components/app/horizon/sim-chart.tsx) met SVG-area chart die opbouw- en pensioenfase visualiseert, inclusief FIRE-marker en leeftijdslabels. SimChartWidget wrapper voor gebruik in het dashboard-grid.',
          },
          {
            title: 'Widget-catalog uitgebreid',
            description:
              'lib/widget-catalog.ts bevat nu 6 nieuwe catalog-entries met beschrijvingen, standaard-grootte en hrefs naar /horizon. WIDGET_MIN_LEVEL gating toegevoegd voor elk nieuw widget.',
          },
        ],
      },
      {
        module: 'Platform',
        color: 'zinc',
        items: [
          {
            title: 'FIRE-sim tool pagina',
            description:
              'Nieuwe interactieve pagina /tools/fire-sim met sliders voor leeftijd, vermogen, inkomen, uitgaven en rendement. Toont real-time simulatieresultaten met de sim-chart en gedetailleerde jaarlijkse tabel.',
          },
          {
            title: 'FireMethod vereenvoudigd',
            description:
              'useFireMethod hook vereenvoudigd: gebruikt nu altijd de NL-SWR methode. Verwijdert complexiteit van meerdere berekeningsmethoden.',
          },
          {
            title: 'DashboardData uitgebreid',
            description:
              'DashboardData type en server-side data-bundel uitgebreid met fireAgeFractional (sub-jaar precisie), fireRange (optimistisch/basis/conservatief), simRows (simulatiepad), backtestSuccessRate en backtestNamedPaths voor de nieuwe widgets.',
          },
        ],
      },
    ],
  },
  {
    version: 'fin_prod_0.76',
    date: '2026-02-26',
    title: 'Tiers-systeem, backtesting, landing redesign & grote UX-batch',
    sections: [
      {
        module: 'Platform — Tiers',
        color: 'zinc',
        items: [
          {
            title: 'Commercieel tier-systeem',
            description:
              'Nieuw tier-configuratiesysteem (lib/tier-config.ts) met drie niveaus: Gratis, Connected en AI. Bevat een feature-matrix die per tier bepaalt welke functies beschikbaar zijn. Los van het sovereignty-level featuregating-systeem.',
          },
          {
            title: 'Beheer/tiers admin pagina',
            description:
              'Nieuwe admin-pagina /beheer/tiers met overzicht van alle tiers, hun features, en de mogelijkheid om gebruikers aan een tier toe te wijzen. Inclusief tier-assign en tier-config API-routes.',
          },
          {
            title: 'Subscription AI-detectie',
            description:
              'Nieuwe API-route /api/subscriptions/detect-ai voor automatische detectie van AI-gerelateerde abonnementen in transactiedata. Helpt bij het categoriseren van AI-uitgaven.',
          },
        ],
      },
      {
        module: 'De Horizon — Backtesting',
        color: 'purple',
        items: [
          {
            title: 'Backtesting modal met MSCI-data',
            description:
              'Nieuwe backtesting-modal op /horizon met historische MSCI World-rendementen (lib/msci-data.ts). Simuleert de FIRE-strategie over alle mogelijke historische perioden en toont succespercentage, worst/best case en pad-visualisaties.',
          },
          {
            title: 'Projections modal uitgebreid',
            description:
              'De projecties-modal op /horizon is grondig uitgebreid met meer scenario\'s, verbeterde grafieken en gedetailleerdere breakdown van de FIRE-projectie.',
          },
          {
            title: 'Log-timeline verbeterd',
            description:
              'De log-timeline component is visueel en functioneel verbeterd met betere animaties en duidelijkere tijdlijnweergave.',
          },
        ],
      },
      {
        module: 'Landing',
        color: 'blue',
        items: [
          {
            title: 'Volledige landing page redesign',
            description:
              'Hero, features-sectie, header en footer volledig herschreven in het editorial design language. Nieuwe feature-showcase met interactieve module-tabs (Kern, Wil, Horizon), verbeterde typografie en responsive layout.',
          },
        ],
      },
      {
        module: 'De Kern',
        color: 'amber',
        items: [
          {
            title: 'Box 3 belasting pagina groot uitgebreid',
            description:
              'De /core/belasting pagina is grondig uitgebreid met gedetailleerde Box 3-berekeningen, vermogenscategorieën (spaargeld, beleggingen, schulden), forfaitaire rendementen en heffingsvrij vermogen. Inclusief kassabon-breakdowns.',
          },
          {
            title: 'Budgets loading state',
            description:
              'Nieuwe loading.tsx voor /core/budgets met skeleton-states die het editorial design volgen.',
          },
          {
            title: 'Handmatige overboekingen',
            description:
              'Nieuwe ManualTransferSheet component voor het handmatig invoeren van overboekingen tussen eigen rekeningen, zodat deze niet als uitgave/inkomen worden geteld.',
          },
        ],
      },
      {
        module: 'Dashboard — Widgets',
        color: 'blue',
        items: [
          {
            title: 'Netto vermogen widget verbeterd',
            description:
              'Netto-vermogen-widget uitgebreid met sparkline-grafiek, delta-indicator (maandelijkse verandering), en verbeterde vrijheidstijd-weergave.',
          },
          {
            title: 'Doelen widget verbeterd',
            description:
              'Doelen-widget grondig verbeterd met voortgangsbalken, deadline-indicatoren, en compactere layout voor meerdere doelen.',
          },
          {
            title: 'Assets & holdings widgets verbeterd',
            description:
              'Assets- en holdings-widgets uitgebreid met betere allocatie-visualisatie, rendementsindicatoren en compactere dataweergave.',
          },
          {
            title: 'Acties & vrijheidsvoortgang widgets',
            description:
              'Acties-widget uitgebreid met prioriteitsindicatoren en impact-scores. Vrijheidsvoortgang-widget verbeterd met duidelijkere voortgangsbalk en mijlpalen.',
          },
        ],
      },
      {
        module: 'Identiteit',
        color: 'rose',
        items: [
          {
            title: 'Profiel pagina uitgebreid',
            description:
              'De /identity/profiel pagina is grondig uitgebreid met meer persoonlijke financiële gegevens, FIRE-instellingen, huishoudsamenstelling en pensioengegevens.',
          },
        ],
      },
      {
        module: 'Platform — AI',
        color: 'zinc',
        items: [
          {
            title: 'AI-context verbeterd',
            description:
              'Shared-, wil- en budget-insights context modules uitgebreid met betere data-bundeling. Freedom-calc tool verbeterd met nauwkeurigere berekeningen. AI-recommendations DNA verfijnd.',
          },
          {
            title: 'useModalAnimation hook',
            description:
              'Nieuwe hook lib/hooks/use-modal-animation.ts specifiek voor mount-based animaties in BottomSheet-modals (100ms setTimeout trigger). Vervangt useInViewAnimation voor modal-context.',
          },
          {
            title: 'ModuleColorProvider',
            description:
              'Nieuwe React context provider die de huidige module-kleur (kern/wil/horizon) beschikbaar maakt voor child-componenten. Voorkomt prop-drilling van module-kleuren.',
          },
        ],
      },
    ],
  },
  {
    version: 'fin_prod_0.75',
    date: '2026-02-25',
    title: 'Grafiek-animaties, kassabon forecasts & Will insights',
    sections: [
      {
        module: 'Platform — Animaties',
        color: 'zinc',
        items: [
          {
            title: 'useInViewAnimation hook',
            description: 'Nieuwe hook lib/hooks/use-in-view-animation.ts met IntersectionObserver (once: true), hasEntered + animationComplete flags en ingebouwde prefers-reduced-motion ondersteuning. Alle grafiek-componenten gebruiken deze hook voor consistente viewport-triggered build-animaties.',
          },
          {
            title: 'Nieuwe CSS keyframes: drawPath & fadeInFill',
            description: 'globals.css bevat twee nieuwe keyframes: drawPath voor SVG-lijn draw-animaties (strokeDashoffset 1→0) en fadeInFill voor fill-areas (opacity 0→target). Worden gebruikt door alle grafiek-componenten en sparklines.',
          },
          {
            title: 'Lijn- en staafgrafieken animeren bij viewport-entry',
            description: 'BudgetSparkline (400ms pathLength draw), TrendChart (700ms lijn, 455ms fill, 40ms/kolom stagger voor balken), NetWorthProjectionChart (700ms lijn, 455ms fill, 650ms dots), CashFlowForecastChart (700ms + projected + red-zone), BenchmarkComparisonChart (800ms lijnen, 520ms fill) en FreedomDaysMonthlyTrend (bars met 35ms/bar stagger) trekken hun lijnen en balken visueel op bij het betreden van de viewport.',
          },
          {
            title: 'Horizon modal-animaties (mount-based)',
            description: 'Alle Horizon-modals gebruiken mount-based animaties (100ms setTimeout) in plaats van IntersectionObserver, omdat BottomSheet-content altijd in-viewport staat. ProjectionsModal (ThreeLineChart), SimulationsModal (ConeChart + HistogramChart met 20ms/bar stagger), ScenariosModal (DivergingPathsChart met 100ms inter-lijn stagger), WithdrawalModal (DrawdownChart) en LogTimeline animeren bij modal-opening.',
          },
          {
            title: 'Overige SVG-componenten met viewport-animatie',
            description: 'GoalProgressTimeline (hoofdlijn draw + fill), SankeyDiagram (fade-in bij viewport), BudgetBlob (fade-in), BillCalendar sparkline (draw), BudgetDonut en PortfolioAllocationChart.',
          },
          {
            title: 'Budgetten-widget & jouw-pad-widget animaties',
            description: 'budgetten-widget en jouw-pad-widget-wrapper zijn omgezet naar \'use client\' met useInViewAnimation: begrotingsbalken animeren 0→target bij viewport-entry, fase-balk animeert met 150ms delay.',
          },
          {
            title: 'BudgetSparkline bugfixes',
            description: 'rootMargin ingesteld op \'0px\' zodat de draw-animatie ook correct vuurt vanuit BottomSheet-modals. Fill-opacity bug opgelost: fadeInFill keyframe overschreef inline opacity 0.12 — nu via CSS transition afgehandeld.',
          },
          {
            title: 'AnimatedProgressBar prefers-reduced-motion fix',
            description: 'AnimatedProgressBar animeerde altijd, ook als prefers-reduced-motion actief was. Bugfix zorgt dat de balk direct op de doelwaarde staat voor gebruikers die animaties uitzetten.',
          },
        ],
      },
      {
        module: 'De Kern — Budgetten',
        color: 'amber',
        items: [
          {
            title: 'G1: Forecast kassabon modal',
            description: 'Het forecast-bedrag in het budget-detailpaneel is nu klikbaar. Opent een BottomSheet met een kassabon (KassabonShell): maandwaarden × gewichten, statistieken, totaalregel, freedom badge, limietvergelijking, formule en betrouwbaarheidsscore.',
          },
          {
            title: 'G3: Will AI budget insights kaart',
            description: 'Nieuwe AI-inzichtenkaart tussen de KPI-sectie en de weergave-toggle op /core/budgets. Toont conditioneel maximaal 2 overschreden of bijna-volle budgetten, met een "Vraag Will →" link naar de chat. Gebruikt het editorial card-patroon (accent bar + neutrale border).',
          },
        ],
      },
    ],
  },
  {
    version: 'fin_prod_0.74',
    date: '2026-02-23',
    title: 'Opruimen badges/streaks & UX verbeteringen',
    sections: [
      {
        module: 'Platform — Opruimen',
        color: 'zinc',
        items: [
          {
            title: 'Badges & streaks systeem verwijderd',
            description: 'Het gehele badges- en streakssysteem is uit de codebase verwijderd: lib/badges.ts, badge-evaluator, badge-grid, badge-notifier, badge-grid, streak-indicator, streak-records, streak-break-warning, toast-provider en de bijbehorende hooks (use-badge-evaluation, use-unnotified-badges). Het systeem was nog niet productierijp en creëerde onnodig technische schuld.',
          },
          {
            title: 'Verify API-routes verwijderd',
            description: 'Alle verify-* API-routes (verify-badge-grid, verify-badge-idempotency, verify-badge-schema, verify-badge-share, verify-badge-toast, verify-empty-badge-eval, verify-streak-*) zijn verwijderd. Deze routes werden alleen gebruikt voor feature-verificatie, niet door de productie-app.',
          },
          {
            title: 'Test-pagina\'s opgeruimd',
            description: 'Meer dan 15 losstaande /test-* pagina\'s (test-badge-*, test-streak-*, test-fire-scenarios, test-debt-payoff, test-portfolio-projection) zijn verwijderd. Ze bevinden zich niet meer in de Next.js app router en worden dus ook niet meer gebundeld.',
          },
          {
            title: 'Action board vereenvoudigd',
            description: 'components/app/action-board.tsx bijgewerkt: streakIndicator en badgeNotifier imports en rendering verwijderd. Cleaner component zonder ongebruikte dependencies.',
          },
        ],
      },
    ],
  },
  {
    version: 'fin_prod_0.73',
    date: '2026-02-22',
    title: 'Widget dashboard, AI-categorisatie & transactiescope',
    sections: [
      {
        module: 'Platform — Dashboard',
        color: 'zinc',
        items: [
          {
            title: 'Modulair widget dashboard',
            description: '20 onafhankelijke widgets verdeeld over De Kern, De Wil, De Horizon en Cross-module. Elk widget is in- of uitschakelbaar, heeft een half/full breedte en een volgorde die per gebruiker wordt opgeslagen in de database. Widgets zijn gated op sovereignty level.',
          },
          {
            title: 'Draggable widget grid',
            description: 'Nieuwe DraggableWidgetGrid component toont actieve widgets in een responsief 2-koloms raster. Instellingenknop opent widgetbeheer waarmee je de samenstelling van je dashboard kunt aanpassen zonder de pagina te verlaten.',
          },
          {
            title: 'Widget API & persistentie',
            description: 'Nieuw /api/widgets endpoint slaat widget-voorkeuren op in de widget_prefs kolom van het gebruikersprofiel. mergeWidgetPrefs() voegt nieuwe widgets automatisch toe en verwijdert verouderde entries.',
          },
          {
            title: '20 widget-componenten',
            description: 'Netto Vermogen, Cashflow Maand, Budgetten, Vermogen, Schulden, Beleggingen, Voorstellen, Acties, Doelen, FIRE Prognose, Monte Carlo, Levensgebeurtenissen, Spaarquote, Vrijheidsvoortgang, Abonnementen, Jouw Pad, Veerkracht Score, Box 3 Belasting, Vaste Lasten en NIBUD Benchmark.',
          },
          {
            title: 'Deep-link modals vanuit widgets',
            description: 'Widget-knoppen navigeren direct naar de juiste modulepagina én openen automatisch de bijbehorende modal via een ?modal= URL-parameter. Ondersteunde targets: projections, scenarios, simulations, withdrawal (Horizon) en subscriptions (Wil).',
          },
          {
            title: 'Dashboard hernoemd naar Vrijheids Dashboard',
            description: 'Dateline en koptegel bijgewerkt van "Persoonlijk Financieel Dagblad" naar "Vrijheids Dashboard" om de filosofische focus te versterken. Dashboard berekent budgetlimiet en besteding per type (income, expense, savings, debt) voor de widgets.',
          },
        ],
      },
      {
        module: 'De Kern — Import',
        color: 'amber',
        items: [
          {
            title: 'AI-categorisatie bij import ("Vraag Will")',
            description: 'Nieuwe Sparkles-knop in stap 3 van de importflow stuurt ongecategoriseerde transacties (vertrouwen < 70%) in batches van 20 naar /api/ai/categorize. Will geeft per rij een voorstel met redenering en betrouwbaarheidsscore. Accepteer alles met één klik of keur individueel goed via de inline "OK?"-knop.',
          },
          {
            title: 'Verbeterde duplicaatdetectie via datumbereik',
            description: 'Duplicaatcontrole gebruikt nu een efficiënte range-query (gte/lte op datum) in plaats van een fragiele hash-lookup. Normaliseert bedragen via parseFloat zodat "8.10" en "8.1" correct als hetzelfde worden herkend. Binnenbestand-duplicaten worden in een aparte pas gedetecteerd.',
          },
          {
            title: 'Bulk-apply prompt bij categoriseren',
            description: 'Wanneer je een transactie van tegenpartij X een budget geeft, verschijnt een banner met het aantal andere transacties van dezelfde tegenpartij in het importbestand. Met één klik pas je de categorie op alle toe.',
          },
          {
            title: 'Eigen overboeking instellen via dropdown',
            description: 'In de categorisatietabel kun je nu handmatig "↔ Eigen overboeking" kiezen voor elke rij. Zo markeer je overboekingen die niet automatisch zijn herkend zonder het formulier te verlaten.',
          },
          {
            title: 'Importflow herzien: stap 2 & 3 samengevoegd',
            description: 'De vorige drie-stappen flow is stroomlijnd: duplicaatdetectie loopt nu op de achtergrond terwijl de categorisatietabel direct zichtbaar is. Overgeslagen transacties (duplicaten, eigen overboekingen) worden verborgen in de tabel.',
          },
        ],
      },
      {
        module: 'De Kern — Cash',
        color: 'amber',
        items: [
          {
            title: 'Ongecategoriseerde transacties banner',
            description: 'Nieuwe UncategorizedTransactionsBanner op de cash-pagina toont het aantal en totaalbedrag van transacties zonder budgetkoppeling. Klikken opent de AI Categorize Sheet direct vanuit het transactieoverzicht.',
          },
          {
            title: 'AI Categorize Sheet op cash-pagina',
            description: 'Nieuwe AICategorizeSheet laat je ongecategoriseerde transacties vanuit het overzicht in bulk categoriseren met AI-hulp, los van de importflow.',
          },
          {
            title: 'import_hash toegevoegd aan transacties',
            description: 'Transactiemodel bevat nu import_hash als veld zodat AI-categorisatieresultaten per transactie bijgehouden kunnen worden.',
          },
        ],
      },
      {
        module: 'De Kern — Transacties',
        color: 'amber',
        items: [
          {
            title: 'Transactiescope bij budgetwijziging',
            description: 'Wanneer je het budget van een bestaande transactie aanpast, onderbreekt het formulier en vraagt: wil je alleen deze transactie wijzigen, alle toekomstige van dezelfde tegenpartij, of alle transacties ooit? De keuze bepaalt de reikwijdte van de bulk-update.',
          },
          {
            title: 'Automatische categorisatieregel bij bulk-update',
            description: 'Bij een scope-keuze van "toekomstig" of "alles" wordt automatisch een category_correction regel aangemaakt (of overschreven) zodat volgende imports deze tegenpartij direct correct categoriseren.',
          },
        ],
      },
    ],
  },
  {
    version: 'fin_prod_0.72',
    date: '2026-02-21',
    title: 'Budgetmodule & terugkerende transacties',
    sections: [
      {
        module: 'De Kern — Budgetten',
        color: 'amber',
        items: [
          {
            title: 'Beschikbaar per envelop',
            description: 'Elke budgetregel toont hoeveel er daadwerkelijk beschikbaar is: het effectieve limiet (inclusief rollover-carry en periode-overschrijvingen) minus wat al is uitgegeven. Zichtbaar in horizon-goud onder de voortgangsbalk. Bij overschrijding verdwijnt het label en neemt de bestaande markering het over.',
          },
          {
            title: 'Inkomstendekking',
            description: 'Banner bovenaan de budgetpagina toont welk percentage van de budgetten door verwacht inkomen wordt gedekt. Bij meer dan 100% verschijnt een waarschuwing.',
          },
          {
            title: 'Ongecategoriseerde transacties',
            description: 'Nieuwe banner telt alle transacties zonder budgetkoppeling en toont het totaalbedrag. Klikken navigeert direct naar de gefilterde transactielijst op de cash-pagina.',
          },
          {
            title: 'Doeltype-uitleg in budgetformulier',
            description: 'Het budgetformulier legt per doeltype (sparen, schuld, vaste last, etc.) uit wat het betekent en hoe de voortgang wordt berekend.',
          },
        ],
      },
      {
        module: 'De Kern — Cash',
        color: 'amber',
        items: [
          {
            title: 'Facturenkalender',
            description: 'Nieuwe kalenderweergave op de cash-pagina (derde tab). Toont terugkerende en geplande transacties per maand in een kalenderraster zodat je ziet wanneer welke lasten verwacht worden.',
          },
          {
            title: 'Terugkerende transacties beheer',
            description: 'Elke terugkerende boeking heeft een bewerkknop die een volledig formulier opent: naam, bedrag, type, frequentie, dag, budgetkoppeling, einddatum en actief-toggle. Deactiveren vraagt om bevestiging.',
          },
          {
            title: 'Patroondetectie',
            description: 'De Sparkles-knop in de terugkerende sectie analyseert de transactiegeschiedenis en detecteert automatisch patronen (maandelijks, wekelijks, kwartaal, jaarlijks). Gevonden patronen kunnen met één klik worden toegevoegd als terugkerende boeking.',
          },
          {
            title: 'Categorisatieregels',
            description: 'Nieuwe beheerinterface (Tag-knop) voor de categorisatieregels. Regels koppelen een tegenpartijnaam of omschrijving automatisch aan een budgetcategorie bij nieuwe transacties. Aanmaken, verwijderen en auto-apply toggle.',
          },
        ],
      },
    ],
  },
  {
    version: 'fin_prod_0.71',
    date: '2026-02-20',
    title: 'Abonnementen, eigen overboekingen & kleurpersonalisatie',
    sections: [
      {
        module: 'De Wil',
        color: 'teal',
        items: [
          {
            title: 'Abonnementendetectie & overzicht',
            description: 'Automatische herkenning van terugkerende abonnementen uit je transacties. Nieuwe KPI-kaart toont aantal actieve abonnementen en maandelijkse kosten met kassabon-breakdown.',
          },
          {
            title: 'AI-abonnementsadvies van Will',
            description: 'Vraag Will om elk abonnement te beoordelen: nuttig, overlappend of niet relevant. Toont besparingspotentieel in euro\'s en vrijheidsdagen met concrete opzegacties.',
          },
          {
            title: 'Opzegbrief-generator',
            description: 'Genereer en verstuur opzegbrieven direct vanuit de app. Actiekaarten met type "abonnement opzeggen" tonen een snelkoppeling naar de opzegmodal.',
          },
          {
            title: '12-maanden abonnementsanalyse in AI-context',
            description: 'AI-aanbevelingen houden nu rekening met een volledig jaar abonnementsdata: categorieën (streaming, muziek, sport, software, gaming), overlap-detectie en vrijheidsdagen-per-jaar berekening.',
          },
        ],
      },
      {
        module: 'De Kern',
        color: 'amber',
        items: [
          {
            title: 'Eigen-rekeningoverboekingen herkennen',
            description: 'Transacties tussen je eigen rekeningen worden automatisch herkend en uitgesloten van inkomsten/uitgaven-totalen en Sankey-diagrammen. Visueel onderscheiden met overboeking-icoon en badge.',
          },
          {
            title: 'Eigen IBAN-registratie',
            description: 'Registreer IBAN\'s van je andere bankrekeningen zodat overboekingen correct worden gedetecteerd, ook tussen verschillende banken.',
          },
          {
            title: 'Overboekingsdetectie bij import',
            description: 'CSV-import herkent nu automatisch eigen overboekingen, slaat budgetcategorisatie over en toont een informatieve banner. Handmatig overschrijven met "Toch als uitgave?" mogelijk.',
          },
          {
            title: 'Bevestigingsstroom voor onzekere overboekingen',
            description: 'Onbevestigde eigen overboekingen tonen een gouden "Controleer"-badge. Review en bevestig ze via een bottom sheet met één klik.',
          },
        ],
      },
      {
        module: 'Identiteit',
        color: 'blue',
        items: [
          {
            title: 'Budgetcategorie-kleuren aanpasbaar',
            description: 'Kies op je profielpagina een eigen kleur per budgettype (inkomen, uitgaven, sparen, schuld, overig). Het systeem genereert automatisch een volledig kleurenpalet per categorie.',
          },
          {
            title: 'Sovereignty-fasekleuren aanpasbaar',
            description: 'Personaliseer de kleuren van de vier sovereignty-fasen (Herstel, Stabiliteit, Momentum, Meesterschap) met live preview en persistentie.',
          },
        ],
      },
      {
        module: 'Platform',
        color: 'zinc',
        items: [
          {
            title: 'Uitgebreid kleursysteem (132 CSS-variabelen)',
            description: 'Drie onafhankelijke kleurlagen: module-kleuren, budgettype-kleuren en fasekleuren. Elk genereert 11 tinten via OKLCH, volledig geïntegreerd met Tailwind utilities.',
          },
          {
            title: 'Rapportages: historische vergelijking',
            description: 'Rapporten tonen nu een vergelijkingstabel met de twee voorgaande perioden: vermogen, inkomen, uitgaven, spaarquote en vrijheidspercentage met delta-pijlen.',
          },
          {
            title: 'Rapportages: optionele AI-inleiding',
            description: 'Kies bij het genereren van een rapport voor "Standaard" (direct) of "Met AI-inleiding" (+5-10 sec). Will schrijft een persoonlijke editorial over je financiële maand.',
          },
          {
            title: 'Rapportcaching',
            description: 'Gegenereerde rapporten worden opgeslagen in de database. Herladen van hetzelfde rapport is direct, zonder herberekening.',
          },
          {
            title: 'Duplicaat-rapportpreventie',
            description: 'Bij het aanmaken van een rapport wordt gecontroleerd of er al een bestaat voor dezelfde periode. Zo ja, navigeer direct naar het bestaande rapport.',
          },
          {
            title: 'Notificatiesysteem redesign',
            description: 'Volledig herontworpen notificatiepaneel in redactionele stijl: urgente meldingen bovenaan, "Vandaag"-sectie, en inklapbare "Eerder"-secties per dag. Nieuwe notificatietypes voor sync-waarschuwingen en level-up meldingen.',
          },
          {
            title: 'Dashboard editorial styling',
            description: 'Dashboard met verbeterde typografie: Playfair Display kop met persoonlijke naam, Source Serif ondertitel, streak-indicator in de dateline en module-gekleurde avatars.',
          },
        ],
      },
    ],
  },
  {
    version: 'fin_prod_0.7',
    date: '2026-02-19',
    title: 'Identiteit, bankkoppeling & dynamische kleuren',
    sections: [
      {
        module: 'Identiteit',
        color: 'teal',
        items: [
          {
            title: 'Identiteit-module compleet herontworpen',
            description: 'Nieuwe modulehub met subpagina\'s voor Profiel, Voortgang, Delen en Instellingen. Inclusief module-navigatie en breadcrumbs.',
          },
          {
            title: 'Profielpagina met huishoudprofiel',
            description: 'Beheer je persoonlijke gegevens (naam, geboortedatum, land), huishoudtype en NIBUD-profiel (kinderen, woningtype, energielabel, auto, netto inkomen).',
          },
          {
            title: 'Voortgang: streaks, badges & prestaties',
            description: 'Overzicht van je actiestreaks, verdiende badges en sovereignty-voortgang op een centrale voortgangspagina.',
          },
          {
            title: 'Delen: vrijheidskaart & jaaroverzicht',
            description: 'Deel je financiële vrijheidsvoortgang via een visuele kaart of bekijk je jaaroverzicht.',
          },
          {
            title: 'Instellingen: notificatievoorkeuren & databeheer',
            description: 'Toggle notificaties per type (budget, streaks, syncs, aanbevelingen, inzichten, badges, level-ups). Reset-knop om alle data te wissen.',
          },
          {
            title: 'Vrije kleurenwaaier per module',
            description: 'Kies op de profielpagina een eigen accentkleur per module. Het systeem genereert automatisch een 11-staps kleurenpalet via OKLCH met live preview.',
          },
        ],
      },
      {
        module: 'De Kern',
        color: 'amber',
        items: [
          {
            title: 'GoCardless automatische bankkoppeling',
            description: 'Koppel je Nederlandse bankrekening via GoCardless. Selecteer je bank, doorloop de OAuth-autorisatie en importeer transacties automatisch met deduplicatie.',
          },
          {
            title: 'Verbonden rekeningen met sync-status',
            description: 'Overzicht van gekoppelde bankrekeningen met laatste sync-tijd, dagelijks quotum (10/dag), herautoresatie-waarschuwingen en sync/ontkoppel-acties.',
          },
          {
            title: 'Kassabon-modals voor KPI-berekeningen',
            description: 'Klikbare KPI-kaarten openen kassabon-breakdowns voor Geschat Jaarinkomen, Must Uitgaven, Spaarquote en FIRE-bedrag met formules en regelitems.',
          },
        ],
      },
      {
        module: 'De Wil',
        color: 'teal',
        items: [
          {
            title: 'Slimmere AI-aanbevelingen zonder duplicaten',
            description: 'AI controleert nu actief op bestaande acties (open, afgerond, afgewezen) en aanbevelingen voordat het nieuwe suggesties doet. Voorkomt dubbele aanbevelingen.',
          },
          {
            title: 'Chat standaard op De Wil',
            description: 'De AI-chat opent nu standaard in De Wil-context in plaats van De Kern, passend bij de coachende rol van de module.',
          },
        ],
      },
      {
        module: 'Platform',
        color: 'zinc',
        items: [
          {
            title: 'Dynamisch kleursysteem',
            description: 'Alle 80+ bestanden omgezet van hardcoded amber/teal/purple naar semantische tokens (kern-*, wil-*, horizon-*). Ondersteunt alle Tailwind utilities inclusief opacity-modifiers.',
          },
          {
            title: 'OKLCH palette generator',
            description: 'Pure TypeScript kleurengenerator (~170 regels, nul dependencies) die vanuit één hex-kleur alle 11 tinten berekent met correcte lightness-curve, chroma bell-curve en sRGB gamut clamping.',
          },
          {
            title: 'Server-side kleurinjectie (flash-preventie)',
            description: 'Module-kleuren worden server-side opgehaald en als inline CSS-variabelen geïnjecteerd. Juiste kleuren direct zichtbaar bij eerste render.',
          },
          {
            title: 'Notificatie-API',
            description: 'Centrale notificatie-endpoint die budget-alerts, streak-waarschuwingen, badge-notificaties, sync-updates en aanbevelingen aggregeert met leesmarkering en voorkeuren.',
          },
          {
            title: 'GoCardless beheer-paneel',
            description: 'Admin-pagina voor GoCardless-configuratie: API-credentials, sandbox/productie-omgeving, feature toggle en verbindingstest.',
          },
          {
            title: 'Nieuwe standaardkleuren',
            description: 'Bruin (#6b4339) voor De Kern, paars (#3d3048) voor De Wil en zandgoud (#c4a06b) voor De Horizon — gekozen voor aarde, daadkracht en licht.',
          },
        ],
      },
    ],
  },
  {
    version: 'fin_prod_0.6',
    date: '2026-02-18',
    title: 'Voorspellingen, trendgrafieken & holdings-beheer',
    sections: [
      {
        module: 'De Kern',
        color: 'amber',
        items: [
          {
            title: 'Netto-vermogen groeiprojectie',
            description: 'Interactieve 1-5 jaar grafiek op de Kern-pagina die je verwachte vermogensgroei visualiseert op basis van huidige spaarquote en rendement.',
          },
          {
            title: 'Cashflow-prognose 3-6 maanden',
            description: 'Area chart met verwachte inkomsten en uitgaven voor de komende 3-6 maanden. Waarschuwt automatisch bij verwacht laag saldo.',
          },
          {
            title: 'Budgetvoorspelling volgende maand',
            description: 'AI-voorspelling van budgetbesteding voor de komende maand op basis van historische patronen en seizoenstrends.',
          },
          {
            title: '12-maanden budget sparklines',
            description: 'Compacte trendlijnen per budgetcategorie die in een oogopslag de bestedingstrend over het afgelopen jaar tonen.',
          },
          {
            title: 'Mini sparklines op schuldkaarten',
            description: 'Elke schuldkaart toont nu een mini-trendlijn van het aflosverloop. Waarderingen worden in bulk geladen voor snellere weergave.',
          },
          {
            title: 'Holdings CRUD-beheer',
            description: 'Volledige CRUD-operaties voor holdings op de asset-detailpagina: toevoegen, bewerken en verwijderen van posities binnen een beleggingsaccount.',
          },
          {
            title: 'Transactielog per holding met P&L',
            description: 'Elke holding heeft nu een transactielogboek met koop-/verkooptransacties en een lopende winst-en-verliesberekening.',
          },
        ],
      },
      {
        module: 'De Wil',
        color: 'teal',
        items: [
          {
            title: 'AI-bestedingspatroonherkenning',
            description: 'AI analyseert je transactiegeschiedenis en detecteert terugkerende patronen, seizoenstrends en ongebruikelijke uitgaven met concrete bespaarsuggesties.',
          },
          {
            title: 'Vrijheidsdagen maandtrend',
            description: 'Staafdiagram op De Wil dat per maand toont hoeveel vrijheidsdagen je netto hebt opgebouwd of verbruikt.',
          },
          {
            title: 'Doelvoortgang tijdlijn',
            description: 'Tijdlijngrafiek per doel met deadlinemarkers en tempoberichten die aangeven of je op schema ligt, voorloopt of achterloopt.',
          },
        ],
      },
      {
        module: 'De Horizon',
        color: 'purple',
        items: [
          {
            title: 'FIRE-leeftijd historie',
            description: 'Grafiek die bijhoudt hoe je berekende FIRE-leeftijd over tijd verandert — zie direct het effect van financiele beslissingen op je vrijheidsdatum.',
          },
          {
            title: 'Portfolioprojectie geactiveerd',
            description: 'De portfolioprojectie op De Horizon toont nu een contextueel bericht bij de verwachte groei van je beleggingsportefeuille.',
          },
          {
            title: 'Schuldaflos-trajectgrafiek',
            description: 'Vergelijk snowball- en avalanche-strategieen visueel: twee lijnen tonen het aflosverloop en de totale rentekosten per methode.',
          },
          {
            title: 'Vrijheidspercentage mijlpaalvoorspelling',
            description: 'Het Jouw Pad-widget voorspelt wanneer je de volgende vrijheidsmijlpaal bereikt (25%, 50%, 75%, 100%) op basis van je huidige tempo.',
          },
        ],
      },
      {
        module: 'Identiteit',
        color: 'blue',
        items: [
          {
            title: 'Veerkrachtscore historiegrafiek',
            description: 'Lijndiagram dat je financiele veerkrachtscore over tijd toont met contextuele berichten over je voortgang.',
          },
          {
            title: 'Netto-vermogen mijlpaalmarkers',
            description: 'Belangrijke vermogensmijlpalen worden als markers op de vermogensgrafiek getoond zodat je groei tastbaar wordt.',
          },
        ],
      },
    ],
  },
  {
    version: 'fin_prod_0.5',
    date: '2026-02-15',
    title: 'Beveiliging, gamificatie & data-integriteit',
    sections: [
      {
        module: 'De Kern',
        color: 'amber',
        items: [
          {
            title: 'Wachtwoord-reset volledig in het Nederlands',
            description: 'Wachtwoord vergeten- en resetpagina\'s vertaald naar het Nederlands. Succesmelding met automatische redirect naar dashboard, wachtwoordvalidatie en "Terug naar inloggen" link.',
          },
          {
            title: 'Budget-transactie kruiscontrole',
            description: 'Nieuw /api/verify-budget-spending endpoint voor server-side verificatie dat budgetbestedingen overeenkomen met de werkelijke transactiesommen per categorie.',
          },
          {
            title: 'Netto-vermogen snapshots API',
            description: 'GET/POST /api/snapshots endpoint dat verrijkte snapshots retourneert met freedom_percentage en net_worth_matches verificatieveld. Snapshots worden berekend op basis van echte asset- en schulddata.',
          },
          {
            title: 'Automatische waarderingen',
            description: 'Bij elke wijziging van een asset- of schuldwaarde wordt automatisch een valuatie-record aangemaakt. Nieuwe /api/valuations endpoint voor het opvragen van waardehistorie.',
          },
          {
            title: 'Holdings verwijderen geverifieerd',
            description: 'CRUD-operaties voor holdings bevestigd met correcte user-scoping en database-verwijdering.',
          },
          {
            title: 'Lege-staat berichten',
            description: 'Informatieve lege-staat berichten voor de assets- en cashpagina wanneer er nog geen data is ingevoerd.',
          },
          {
            title: 'Box 3 link en Escape-toets',
            description: 'Box 3 Belasting-link toegevoegd aan het De Kern-overzicht. BottomSheet modals sluiten nu ook met de Escape-toets.',
          },
        ],
      },
      {
        module: 'De Wil',
        color: 'teal',
        items: [
          {
            title: 'Data-aware volgende stappen',
            description: 'De next-steps API bevraagt nu 7 database-tabellen parallel (transacties, budgetten, assets, schulden, snapshots, profielen, doelen) en sluit reeds voltooide stappen automatisch uit.',
          },
          {
            title: 'Dynamische AI-persoonlijkheid per module',
            description: 'ChatPanel detecteert de huidige module via het pad en past avatar, kleuren, begroeting en placeholder aan: FHIN (kern/amber), Will (wil/teal), FFIN (horizon/paars). Elk module heeft een apart chatgesprek.',
          },
        ],
      },
      {
        module: 'Identiteit',
        color: 'blue',
        items: [
          {
            title: 'Badge-systeem',
            description: '30 badges verdeeld over 8 categorieën met API endpoint en detailmodal op de Identity-pagina. Badges worden verdiend op basis van app-gebruik en financiële mijlpalen.',
          },
          {
            title: 'Login-streak tracking',
            description: 'Dagelijkse check-in via /api/streaks/checkin houdt je huidige en langste streak bij. Streak wordt gereset na een gemiste dag en opgehoogd bij opeenvolgende logins.',
          },
          {
            title: 'Feature-bezoeken bijhouden',
            description: 'Feature-bezoeken worden gesynchroniseerd naar de database via /api/feature-visits met dual opslag (localStorage + Supabase) voor snelle weergave en persistentie.',
          },
        ],
      },
      {
        module: 'Platform',
        color: 'zinc',
        items: [
          {
            title: 'User-scoped API-routes (RLS)',
            description: 'Alle API-endpoints (transacties, budgetten, vermogen, assets, schulden, doelen, aanbevelingen, acties) bevatten nu user_id-filtering zodat gebruikers alleen hun eigen data kunnen benaderen.',
          },
          {
            title: 'Admin-endpoint bescherming',
            description: 'Dubbele-slash bug in proxy path-matching opgelost. /beheer en admin API\'s zijn nu correct afgeschermd: ongeauthenticeerd geeft redirect naar /login, niet-admin geeft redirect naar /dashboard of 403.',
          },
          {
            title: 'JWT-sessie en token-rotatie',
            description: 'Sessie-expiry bevestigd op 3600 seconden met refresh-token rotatie en 10 seconden hergebruikinterval. Nieuw /api/session-info endpoint voor JWT-inspectie.',
          },
          {
            title: 'Route-bescherming en 404-pagina\'s',
            description: 'Custom 404-pagina\'s voor onbekende routes. Ongeauthenticeerde gebruikers worden doorgestuurd naar /login met post-login redirect terug naar de oorspronkelijke pagina.',
          },
          {
            title: 'Breadcrumb-navigatie',
            description: 'Correcte hiërarchie voor alle core-subpagina\'s (De Kern > Budgetten, De Kern > Cash > Importeren). Alle oudersegmenten zijn klikbare links.',
          },
          {
            title: 'Alle navigatie-items zichtbaar',
            description: 'Navigatie toont nu alle items ongeacht sovereignty level, zodat gebruikers functies kunnen ontdekken. Vergrendelde items tonen een slot-icoon.',
          },
          {
            title: 'Vergrendelde functies footer',
            description: '"X meer functies beschikbaar" footer onderaan elke modulepagina met BottomSheet-overzicht van vergrendelde functies gegroepeerd per ontgrendelingsfase.',
          },
          {
            title: 'LockedFeatureCard verbeterd',
            description: 'Vergrendelde functiekaarten tonen nu een fase-badge en mini-voortgangsbalk die aangeeft hoe dicht de gebruiker bij ontgrendeling is.',
          },
          {
            title: 'Fase-overgang modal CTA',
            description: 'De call-to-action in de fase-overgangmodal navigeert naar de meest relevante pagina op basis van nieuw ontgrendelde functies.',
          },
          {
            title: 'Landing page en auth-redirect',
            description: 'Landingspagina geverifieerd voor ongeauthenticeerde bezoekers. Ingelogde gebruikers worden automatisch doorgestuurd naar het dashboard.',
          },
          {
            title: 'Geen mock data',
            description: 'Alle API-routes bevestigd op echte Supabase-data. Geen hardcoded testdata meer in productie-endpoints.',
          },
          {
            title: 'Turbopack Windows-fix',
            description: 'Cache-corruptie in Turbopack op Windows opgelost met aangepaste dev-scripts en cache-management.',
          },
        ],
      },
    ],
  },
  {
    version: 'fin_prod_0.4',
    date: '2026-02-14',
    title: 'Configureerbare parameters & database migraties in git',
    sections: [
      {
        module: 'De Horizon',
        color: 'purple',
        items: [
          {
            title: 'SWR en inflatie doorverbonden in projecties',
            description: 'De SWR- en inflatiesliders in de FIRE-projectiemodal werden niet doorgegeven aan de berekening. Nu veranderen de FIRE-datum, het doelvermogen en de projectiegrafiek direct mee wanneer je deze parameters aanpast.',
          },
          {
            title: 'Monte Carlo simulatie-instellingen',
            description: 'Nieuw inklapbaar instellingenpaneel in de simulatiemodal. Kies het aantal simulaties (100-5.000) en de projectiehorizon (10-60 jaar) via sliders. Dynamische tekst toont het ingestelde aantal paden.',
          },
          {
            title: 'Vangrails-strategie configureerbaar',
            description: 'Bij de Guyton-Klinger opnamestrategie zijn nu vier parameters instelbaar: vloer (50-100%), plafond (100-150%), verhogingsstap (+5-20%) en verlagingsstap (-5-20%). Verschijnt als inklapbare sectie wanneer de vangrails-strategie actief is.',
          },
          {
            title: 'Bucket-strategie configureerbaar',
            description: 'Bij de bucket-opnamestrategie stel je de allocatie in (cash/obligaties/aandelen met auto-balancering), het obligatierendement (1-6%) en de cash buffer (1-5 jaar). Drie-koloms allocatieweergave toont de verdeling in real-time.',
          },
          {
            title: 'Inflatiecorrectie in FIRE-berekening',
            description: 'De FIRE-projectie gebruikt nu het reele rendement (nominaal gecorrigeerd voor inflatie) in plaats van alleen het nominale rendement. Dit geeft een realistischere schatting van de FIRE-datum.',
          },
        ],
      },
      {
        module: 'De Kern',
        color: 'amber',
        items: [
          {
            title: 'Test-IBAN verwijderd',
            description: 'De hardcoded testrekening (NL91ABNA0417164300) wordt niet meer automatisch aangemaakt. Bij eerste bezoek opent direct het rekeningformulier zodat je je eigen gegevens invoert.',
          },
        ],
      },
      {
        module: 'Platform',
        color: 'zinc',
        items: [
          {
            title: 'Database migraties in git',
            description: 'Supabase CLI toegevoegd als devDependency met 5 npm scripts: db:pull, db:push, db:diff, db:new en db:status. Migratiebestanden worden nu bijgehouden in supabase/migrations/ zodat het schema reproduceerbaar is vanuit code.',
          },
          {
            title: 'Berekeningslaag uitgebreid',
            description: 'Alle Horizon-functies (computeFireProjection, computeFireRange, projectForward, runMonteCarlo, computeWithdrawal) accepteren nu optionele configuratieparameters. GuardrailsConfig en BucketConfig types toegevoegd met standaardwaarden identiek aan de vorige hardcoded waarden.',
          },
        ],
      },
    ],
  },
  {
    version: 'fin_prod_0.3',
    date: '2026-02-14',
    title: 'Mobile preview met echte viewport & PWA-basis',
    sections: [
      {
        module: 'Beheer',
        color: 'rose',
        items: [
          {
            title: 'iframe-gebaseerde mobile preview',
            description: 'De mobile preview gebruikt nu een iframe in plaats van een smalle div. Hierdoor reageren CSS media queries (md:, sm:) op de iframe-viewport — de preview toont nu daadwerkelijk de mobile layout met BottomNav, verborgen desktop-nav en mobile spacing.',
          },
          {
            title: 'Navigatie in preview-toolbar',
            description: 'Nieuwe routeknoppen (Dashboard, Kern, Wil, Horizon) in de preview-toolbar om snel tussen pagina\'s te wisselen zonder de preview te verlaten.',
          },
          {
            title: 'Responsive phone bezel',
            description: 'De phone bezel schaalt nu dynamisch mee bij venstergrootte-wijzigingen via een resize listener, in plaats van eenmalige berekening bij render.',
          },
        ],
      },
      {
        module: 'Platform',
        color: 'zinc',
        items: [
          {
            title: 'PWA manifest',
            description: 'Nieuw manifest.json voor Progressive Web App ondersteuning — installeerbaar op mobiele apparaten met app-icoon en standalone modus.',
          },
          {
            title: 'BottomNav component',
            description: 'Nieuwe mobiele navigatiebalk (md:hidden) met iconen voor Dashboard, Kern, Wil en Horizon — zichtbaar op kleine schermen en in de mobile preview.',
          },
          {
            title: 'Bottom sheet component',
            description: 'Herbruikbaar bottom-sheet component voor mobiele modals met swipe-to-dismiss en backdrop.',
          },
        ],
      },
    ],
  },
  {
    version: 'fin_prod_0.2',
    date: '2026-02-13',
    title: 'Onboarding, fase-systeem & activatieflow',
    sections: [
      {
        module: 'Platform',
        color: 'zinc',
        items: [
          {
            title: 'Onboarding wizard',
            description: 'Nieuwe gebruikers doorlopen een stapsgewijze wizard met drie paden: leeg starten, een testpersona laden, of een volledig profiel laten genereren door AI op basis van vrije tekstbeschrijvingen.',
          },
          {
            title: 'AI-gegenereerde profielen',
            description: 'AI genereert in 4 stappen een compleet financieel profiel: bankrekeningen, bezittingen, schulden, 6 maanden transactiehistorie, doelen, levensgebeurtenissen en aanbevelingen.',
          },
          {
            title: 'Fase-systeem (Sovereignty Levels)',
            description: 'Gebruikers doorlopen 4 fasen — Herstel, Stabiliteit, Momentum, Meesterschap — berekend op basis van netto vermogen, maandlasten en schulden. Elke fase ontgrendelt nieuwe functies.',
          },
          {
            title: 'Feature gating',
            description: 'Geavanceerde functies zoals Box 3-berekeningen, Monte Carlo-simulaties en partneroptimalisatie worden pas zichtbaar wanneer de gebruiker de juiste fase bereikt.',
          },
          {
            title: 'Fase-overgang celebratie',
            description: 'Bij opwaartse faseovergang verschijnt een modal met de nieuwe fase, kleurgecodeerde gradient en een overzicht van nieuw ontgrendelde functies.',
          },
          {
            title: '"Klaar voor actie" activatieknop',
            description: 'Zwevende paarse FAB naast de chat die nieuwe gebruikers hun startpositie toont (vermogen, vrijheid%, maandlasten, vrijgekochte tijd) en fase-tracking expliciet activeert.',
          },
          {
            title: 'Module-vergrendeling voor activatie',
            description: 'De Wil en De Horizon zijn verborgen in navigatie en dashboard totdat de gebruiker op "Activeer mijn routekaart" klikt. Alleen De Kern is direct toegankelijk.',
          },
        ],
      },
      {
        module: 'De Kern',
        color: 'amber',
        items: [
          {
            title: 'Box 3 vermogensbelasting',
            description: 'Berekent Nederlandse Box 3-belasting op basis van spaargeld, beleggingen en schulden. Toont belastingdruk in euro\'s en vrijheidsdagen, met what-if scenario\'s en partneroptimalisatie.',
          },
          {
            title: 'Budgetpagina compacter',
            description: 'Budgetoverzicht met donut-chart en verbeterde weergave van budget alerts en type-specifieke meldingen.',
          },
          {
            title: 'Cash-pagina importflow',
            description: 'Verbeterde transactiepagina met directe link naar CSV-import vanuit het overzicht.',
          },
        ],
      },
      {
        module: 'De Wil',
        color: 'teal',
        items: [
          {
            title: 'NIBUD-benchmark',
            description: 'Vergelijkt uitgaven met NIBUD-richtlijnen voor het huishoudtype. Toont categorieen boven de norm en berekent potentiele vrijheidsdagen bij afstemming.',
          },
          {
            title: 'AI suggest-action tool',
            description: 'Nieuwe AI-tool die contextbewuste actiesuggesties genereert op basis van aanbevelingen, doelen en de huidige financiele situatie.',
          },
          {
            title: 'Verrijkte AI-context',
            description: 'Wil- en aanbevelingscontext uitgebreid met diepere financiele data voor preciezere AI-adviezen.',
          },
        ],
      },
      {
        module: 'De Horizon',
        color: 'purple',
        items: [
          {
            title: 'Projectiemodal verbeterd',
            description: 'FIRE-projectiemodal met extra validatie en verbeterde weergave van scenario-resultaten.',
          },
        ],
      },
      {
        module: 'Identiteit',
        color: 'blue',
        items: [
          {
            title: 'Identiteitspagina uitgebreid',
            description: 'Verrijkte identiteitspagina met fase-informatie, sovereignity level visualisatie en persoonlijke financiele identiteitskaart.',
          },
        ],
      },
      {
        module: 'Beheer',
        color: 'rose',
        items: [
          {
            title: 'Beheer-dashboard',
            description: 'Nieuw superadmin-paneel met subnav: AI-configuratie, feature-fasematrix, meldingenoverzicht, release notes en testdata.',
          },
          {
            title: 'Feature-fasematrix editor',
            description: 'Visuele editor om per feature in te stellen in welke fase deze beschikbaar wordt.',
          },
          {
            title: 'Testdata met persona\'s',
            description: 'Laad volledige testprofielen via streaming met voortgangsbalk en samenvatting per tabel.',
          },
          {
            title: 'Fase-overgang tester',
            description: 'Simuleer faseovergangen en reset activatie vanuit het beheer-paneel om de celebratiemodal en activatieflow te testen.',
          },
        ],
      },
    ],
  },
  {
    version: 'fin_prod_0.1',
    date: '2026-02-13',
    title: 'Feature completeness & AI op echte data',
    sections: [
      {
        module: 'De Kern',
        color: 'amber',
        items: [
          {
            title: 'WOZ-waarde ophalen via PDOK',
            description: 'Nieuwe Edge Function woz-lookup die de PDOK Locatieserver + WOZ API raadpleegt. Voer postcode + huisnummer in bij een eigen_huis-asset en krijg officiele WOZ-waarden terug.',
          },
          {
            title: 'Waardehistorie sparkline',
            description: 'Asset-detailmodal toont een SVG-trendlijn boven de waardehistorie-lijst met kleurcodering (groen/rood) en datumbereik.',
          },
          {
            title: 'Netto-vermogen snapshot vergelijking',
            description: 'Kern-pagina toont delta tussen laatste twee snapshots (vermogen, assets, schulden) met kleurgecodeerde pijlen.',
          },
          {
            title: 'CSV-import uitgebreid',
            description: 'Nieuwe kolomkoppelingen voor IBAN tegenpartij en Referentie. Alle bankpresets (ING, Rabobank, ABN AMRO) bijgewerkt.',
          },
          {
            title: 'Data-export uitgebreid',
            description: '6 exporttypes: Transacties, Budgetten, Vermogen, Assets, Schulden en Doelen als CSV met Nederlandse kolomnamen.',
          },
          {
            title: 'Budget limiethistorie',
            description: 'Budgetdetailmodal toont "Limiet wijzigingen" met datum, bedrag en delta per wijziging.',
          },
        ],
      },
      {
        module: 'De Wil',
        color: 'teal',
        items: [
          {
            title: 'AI-chat met identiteitscontext',
            description: 'Chat kent nu je naam, leeftijd, huishoudtype en Temporal Balance-niveau voor persoonlijkere aanbevelingen.',
          },
          {
            title: 'AI-context op echte data',
            description: 'Wil-context en lookup-tool draaien volledig op Supabase-data in plaats van mock-data. Doelen, aanbevelingen en acties komen real-time uit de database.',
          },
          {
            title: 'AI-provider foutafhandeling',
            description: 'Duidelijke Nederlandse foutmelding wanneer API-sleutel ontbreekt of provider niet bereikbaar is.',
          },
          {
            title: 'Aanbevelingen feedback verrijkt',
            description: 'AI-context splitst feedback in "eerder afgewezen" en "eerder geaccepteerd" secties voor betere aanbevelingen.',
          },
          {
            title: 'Doelen: bijdragen bijhouden',
            description: 'Doelkaarten hebben een uitklapbare sectie om bijdragen toe te voegen (bedrag + notitie). Voortgang wordt automatisch bijgewerkt.',
          },
          {
            title: 'Doelen: auto-link met assets/schulden',
            description: 'Gekoppelde doelen tonen automatisch de huidige waarde van het gelinkte asset of de restschuld.',
          },
          {
            title: 'Categorisatie feedback loop',
            description: 'Hercategorisaties tijdens import worden opgeslagen en automatisch toegepast bij volgende imports. De app leert van je gedrag.',
          },
        ],
      },
      {
        module: 'De Horizon',
        color: 'purple',
        items: [
          {
            title: 'Levensgebeurtenissen uitgebreid',
            description: '4 nieuwe templates: Huis kopen, Auto kopen, Erfenis ontvangen, Bijverdienste starten. Alle templates hebben realistische standaardwaarden voor inkomenswijziging.',
          },
          {
            title: 'Contextuele tips per template',
            description: 'Elk evenement-template toont een relevante tip in het formulier ("Kosten koper ca. 5-6%...", "Let op erfbelasting").',
          },
        ],
      },
      {
        module: 'Identiteit',
        color: 'blue',
        items: [
          {
            title: 'Chronologieschaal versterkt',
            description: 'Horizontale voortgangsbalk met gekleurde fasesegmenten (Recovery/Stability/Momentum/Mastery) en "Volgende mijlpaal" kaart.',
          },
        ],
      },
      {
        module: 'Platform',
        color: 'zinc',
        items: [
          {
            title: 'Database: 3 nieuwe migraties',
            description: 'goal_contributions (doelbijdragen), category_corrections (hercategorisatie), en uitgebreide life_events constraint.',
          },
          {
            title: 'Edge Function: woz-lookup',
            description: 'Supabase Edge Function voor WOZ-waarde ophalen via PDOK (JWT-verificatie aan).',
          },
        ],
      },
    ],
  },
]
