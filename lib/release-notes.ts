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
    version: 'fin_prod_0.88',
    date: '2026-06-10',
    title: 'Beheerscherm heringedeeld: vier groepen, hub-startpagina en opschoning',
    sections: [
      {
        module: 'Platform',
        color: 'zinc',
        items: [
          {
            title: 'Hub-startpagina voor beheer',
            description:
              '/beheer is nu een startpagina met vier secties — Technisch beheer, Functioneel beheer, Test & ontwikkeling en Ter info — met per tool een kaart met omschrijving. De platte tabbalk met 27 tabs is vervangen door een twee-niveau navigatie: groepen boven, tools van de actieve groep eronder.',
          },
          {
            title: 'Eén bron voor de beheer-indeling',
            description:
              'Nieuwe lib/beheer-sections.ts voedt de startpagina, de navigatie, het command-palette en de regressietests — geen losse kopieën van de tablijst meer.',
          },
          {
            title: 'Acht verouderde pagina’s verwijderd',
            description:
              'De features- en tiers-redirects, het meldingen-plakkaat, test-deferred, de Will Avatar-showcase, de widgets-galerij, propositie en roadmap zijn opgeruimd. De inhoud blijft beschikbaar in de git-historie.',
          },
        ],
      },
    ],
  },
  {
    version: 'fin_prod_0.87',
    date: '2026-03-27',
    title:
      'Unified Projection Engine, fase-analyse met Monte Carlo, pensioen-modus, what-if scenario\'s & editorial design',
    sections: [
      {
        module: 'De Horizon — Unified Projection Engine',
        color: 'purple',
        items: [
          {
            title: 'Unified Projection Engine (Fase 0–6)',
            description:
              'Volledig nieuwe projectie-engine vervangt de oude simulatie. Per-asset rendement en Box 3-berekening per type per jaar, schuldaflossing per schuld, FIRE-detectie met onttrekkingsstrategieën (perpetual, legacy, deplete, pensioen), life events integratie en annuïteitsformules. Eén orchestratiefunctie (runUnifiedProjection) met volledige unit tests en parity tests tegen de oude engine.',
          },
          {
            title: 'Migratie naar unified engine',
            description:
              'useHorizonFireSim, vermogensopbouw grafiek en Kern vermogensprognose volledig gemigreerd naar de unified engine. HorizonPageData uitgebreid met box3Method en hasPartner. Deprecation wrapper voor achterwaartse compatibiliteit tijdens de overgang.',
          },
          {
            title: 'Waterfall withdrawal tracking',
            description:
              'Onttrekkingen worden nu per assetgroep bijgehouden in de juiste volgorde (spaargeld vóór beleggingen). Nieuwe netWorth-kolom, gewogen gemiddeld rendement herberekend bij FIRE-leeftijd, en startportfolio matched met kern net worth.',
          },
          {
            title: 'Guardrails & binary search',
            description:
              'FIRE-target met PV-annuïteitsformule voor deplete strategie. Binary search target behoudt koopkracht. Perpetual binary search correct op inflatie-gecorrigeerd doel. Guardrails verankerd voor pensioen high-portfolio scenario\'s.',
          },
        ],
      },
      {
        module: 'De Horizon — Fase-analyse & Monte Carlo',
        color: 'purple',
        items: [
          {
            title: 'PhaseBar & fase-modals',
            description:
              'Nieuwe proportionele fasebalk (PhaseBar) onder de grafiek, gesynchroniseerd met chart zoom viewport. Drie uitgebreide fase-modals: Opbouw (vermogensprognose, asset-type breakdown), Overgang (gap/tekort-analyse met deeltijdwerk), Onttrekking (kasstroomanalyse, inkomstenbronnen). Gedeelde PhaseDetailTable voor jaar-op-jaar detailweergave.',
          },
          {
            title: 'Monte Carlo simulaties per fase',
            description:
              'Elke fase-modal bevat nu Monte Carlo simulaties met mediaan eindvermogen, checkpoints op dynamische leeftijden relatief aan FIRE-leeftijd. Critical SWR berekening via iteratieve MC binary search. Stress tests met crisis-scenario\'s en combinatie-scenario.',
          },
          {
            title: 'Gevoeligheidsanalyses',
            description:
              'Spaarquote-gevoeligheid, koopkrachterosie (inflatiedaling over tijd), deeltijdwerk flex impact en inflatie-gevoeligheidstabel. SORR 1-jaar buffer optie met gepersonaliseerde fragiele decade. End of Life analyse met erfgenamen, partner-AOW en nabestaandenpensioen.',
          },
          {
            title: 'Data-driven editorial notes',
            description:
              'Alle fase-modals bevatten nu dynamische contextgebonden toelichtingen gebaseerd op de gebruikersdata. Inklapbare Aannames-secties tonen de gebruikte parameters per analyse.',
          },
        ],
      },
      {
        module: 'De Horizon — Pensioen-modus',
        color: 'purple',
        items: [
          {
            title: 'Pensioen als 4e strategie',
            description:
              'Nieuw FireEndStrategy type \'pensioen\' met vaste einddatum op AOW-leeftijd. Volledige integratie in SimChart, WealthComposition en IncomeExpense charts via planningMode prop. Vierde kaart in StrategieModal met AOW-preview.',
          },
          {
            title: 'Pensioen KPI\'s & simulatie',
            description:
              'KPI\'s Vermogen op AOW en Maandelijkse Onttrekking tonen werkelijk vermogen bij pensioen. Decumulatie start vanuit werkelijk portfolio. Simulatie loopt door tot leeftijd 90 met vaste pensioendatum. Pensioen-strategie opslaan via feature_preferences fallback.',
          },
        ],
      },
      {
        module: 'De Horizon — What-If Scenario\'s',
        color: 'purple',
        items: [
          {
            title: 'Scenario opslaan & vergelijken',
            description:
              'Scenario\'s opslaan, laden en vergelijken met kleurenpalet en colorIndex. Ghost-line overlay op IncomeExpenseChart toont baseline naast scenario. Scenario overlay picker dropdown voor snelle vergelijking. Extractie van override-logica naar gedeelde lib/whatif-overrides.ts.',
          },
          {
            title: 'AI-suggesties',
            description:
              'Nieuw AI suggestion API endpoint met significant-delta detectie en suggestion prompt builder. useWhatIfSuggestions hook met debounced fetch. Visuele suggestiekaarten in de what-if pagina en events panel. Scenario event markers op de EventsTimeline.',
          },
          {
            title: 'Chartweergaven & toggles',
            description:
              'Pad/Opbouw chart toggle, Lijnen/Bronnen view toggle als pill buttons. AOW-stop toggle en depletion warning. Welcome krant bij eerste bezoek. Regressietests voor scenario CRUD, isolatie en delta-detectie.',
          },
        ],
      },
      {
        module: 'De Kern — Mission Control Redesign',
        color: 'amber',
        items: [
          {
            title: 'Layout herstructurering',
            description:
              'Cash samengevoegd met Assets (Bezittingen). Nieuwe indeling: Vermogen+Schulden bovenaan, Budgets onderaan. Budget-kaart opgesplitst in twee kolommen: links Inkomen/Sparen/Schulden, rechts individuele Uitgaven. Budgets-kaart 50% hoger dan Vermogen/Schulden-rij.',
          },
          {
            title: 'Interactieve verbeteringen',
            description:
              'Inklapbare Vermogen & Schulden kaarten op desktop. Flash-animaties bij live waardeveranderingen. 3-koloms KPI layout met Dagelijkse Kosten kaart. FIRE voortgangsbalk vervangt dubbel netto vermogen. Mobiele optimalisatie met 44px touch targets.',
          },
        ],
      },
      {
        module: 'De Kern — Holdings Tracking',
        color: 'amber',
        items: [
          {
            title: 'Portfolio holdings tracking',
            description:
              'Nieuwe has_holdings_tracking toggle in profiel met pill badge. Portfolio Holdings verplaatst naar eigen full-width rij. Realtime subscription zorgt dat de kaart direct verdwijnt bij uitschakelen. Gids navigatie bijgewerkt voor holdings tracking.',
          },
        ],
      },
      {
        module: 'Dashboard — Widgets & Presets',
        color: 'blue',
        items: [
          {
            title: 'Widget preset systeem',
            description:
              'Volledig nieuw preset datamodel met beheer admin-pagina. Inline editing, drag-reorder en size selector per widget. API-endpoint voor preset CRUD. Preset dropdown met module-kleuren en bevestigingsdialoog. Vier voorgedefinieerde presets: Budgetteerder, FIRE Strijder, Pensioenplanner, Vermogensverdeler.',
          },
          {
            title: 'Widget formaten & resilience',
            description:
              'Alle widgets ondersteunen nu 4 formaten (mini, half, full, quarter). WidgetErrorBoundary en loading fallbacks voorkomen stille widget-failures. Horizontale layout voor half-size widgets benut extra breedte. Quarter-size geoptimaliseerd voor 160px hoogte. WidgetShell overflow safety.',
          },
          {
            title: 'Uitgaven heatmap widget',
            description:
              'Heatmap ondersteunt nu alle 4 widget-formaten. TreemapCell rendering, SVG viewBox en constanten schalen mee per formaat. Mini-mode toont compacte kleurblokken zonder tekst. Budgettype-headers groter dan items voor visuele hiërarchie.',
          },
        ],
      },
      {
        module: 'Dashboard — Levensgebeurtenissen',
        color: 'blue',
        items: [
          {
            title: 'Twee-koloms layout',
            description:
              'Levensgebeurtenissen widget met opbouwen/investeren twee-koloms indeling voor half en full sizes. Kolomheaders met titels, subtitels, totalen en emerald/rood kleurenschema. Classificatiehulpfuncties en terminologie-update naar "vrijheid opbouwen/investeren". Vriendelijke lege states en regressietests.',
          },
        ],
      },
      {
        module: 'Design — Editorial Finance',
        color: 'teal',
        items: [
          {
            title: 'fd.nl design language',
            description:
              'Semantische kleurtokens (text-positive/text-negative) vervangen hardcoded groen/rood. Nieuw SectionDivider component (lijn en asterisk varianten). FinTable gestandaardiseerd tabelcomponent. Krantstijl timestamp-formatting. Actieve navigatietab met border-top en achtergrondtint.',
          },
          {
            title: 'Typografie & mobiel',
            description:
              'Body text verhoogd naar text-base (16px) voor contentsecties. Mobiele bottom-nav met actieve tab-indicatie. Responsieve aanpassingen voor alle fase-modals (60vh hoogte, touch targets).',
          },
        ],
      },
      {
        module: 'Propositie — Persona\'s & Landing',
        color: 'zinc',
        items: [
          {
            title: 'Vier persona-kaarten',
            description:
              'Landing page uitgebreid met 4e persona-kaart en responsive 4-koloms grid. Persona-grid samenvattingstabel met feature tags. FIRE-strijder persona aangescherpt met tags. Pensioenplanner persona gefocust op pensioengat. Gestylede preset dropdown met module-kleuren.',
          },
        ],
      },
      {
        module: 'Testfase — Vragenlijsten',
        color: 'rose',
        items: [
          {
            title: 'Vragenlijst-systeem',
            description:
              'Volledige vragenlijst-module voor de testfase: database-tabellen, admin en user API routes, beheer-pagina\'s met CRUD voor vragen, gebruikers-invulflow met voortgangsindicatie. Multi-select ondersteuning voor meerkeuzevragen. Sessie verwijderen en gebruikersnaam in resultaten. Feedback CTA en beheer navigatietab.',
          },
        ],
      },
      {
        module: 'Platform & Testing',
        color: 'zinc',
        items: [
          {
            title: 'Regressietests',
            description:
              'Uitgebreide regressietest-suites voor fase-analyse, Monte Carlo checkpoints, gevoeligheidsanalyses, crisis-scenario\'s, design tokens, levensgebeurtenissen en heatmap-formaten. Persona seed data validatie voor unified engine compatibiliteit.',
          },
          {
            title: 'Beheer & infrastructuur',
            description:
              'Service-role admin API vervangt RPC voor test-users. What-if scenario sample data voor testpersona\'s Lisa en Willem. Roadmap-pagina met persistentie via app_settings. authenticatedFetch in alle testsuites.',
          },
        ],
      },
    ],
  },
  {
    version: 'fin_prod_0.86',
    date: '2026-03-19',
    title:
      'Vermogensopbouw, rebalancing, kostenanalyse (TER), hypotheek vs beleggen & FIRE voortgangsbalk',
    sections: [
      {
        module: 'De Horizon — Vermogensopbouw & Inkomen',
        color: 'purple',
        items: [
          {
            title: 'Inkomen & Uitgaven chart',
            description:
              'Nieuw dual-line area chart component (IncomeExpenseChart) toont bruto inkomen en bruto uitgaven over de simulatiehorizon. Inklapbare toggle op de horizon-pagina, bijbehorende guide-sectie en regressietests voor SimRow compatibiliteit.',
          },
          {
            title: 'Vermogensopbouw stacked bar chart',
            description:
              'Volledig nieuwe vermogensopbouw-weergave: wealth-composition.ts projectie-engine berekent vermogens­ratio\'s per assettype over tijd. WealthCompositionChart als gestapelde SVG-balkgrafiek met ~85% kolomvulling. Toggle tussen Vermogenspad en Vermogensopbouw view op de horizon-pagina.',
          },
          {
            title: 'Ratio-engine op basis van simulatie',
            description:
              'deriveWealthCompositionFromSim vervangt de oude projectWealthComposition — ratio\'s worden nu direct afgeleid uit de simulatieresultaten (single source of truth). Inclusief regressietests en persona seed-data validatie.',
          },
          {
            title: 'Compact chart mode',
            description:
              'Nieuwe compact/expanded toggle rechtsboven de horizon-charts. BucketProjectionChart UX-verbeteringen en responsive chart-hoogte (260px desktop, 220px mobiel).',
          },
          {
            title: 'Vermogensopbouw guide-sectie',
            description:
              'Uitgebreide uitleg bij de horizon-pagina met waterfall-uitleg en single source of truth principe. Inclusief inkomen & uitgaven guide-sectie met contextbeschrijvingen.',
          },
        ],
      },
      {
        module: 'De Kern — Rebalancing & Allocatie',
        color: 'amber',
        items: [
          {
            title: 'Rebalancing engine',
            description:
              'Nieuw lib/rebalancing.ts met drift-berekening per view (asset class, sector, geografie), trade-suggesties en Box 3-bewustzijn. API-endpoint /api/rebalancing/check retourneert driftanalyse met concrete herbalanceringsvoorstellen.',
          },
          {
            title: 'Rebalancing dashboard widget',
            description:
              'Nieuw widget met visuele drift-indicator per allocatiecategorie. Toont afwijking van doelallocatie met kleurgecodeerde balken en waarschuwingen bij overschrijding van de drempelwaarde.',
          },
          {
            title: 'Rebalancing notificaties',
            description:
              'Automatische alerts in het notificatiesysteem wanneer portfoliodrift de ingestelde drempel overschrijdt. Drempelwaarde wordt nu uit het gebruikersprofiel gelezen (rebalance_threshold) in plaats van alleen via query parameter.',
          },
          {
            title: 'Rebalancing guide & tests',
            description:
              'Nieuwe guide-sectie "Rebalancing & Allocatie" met uitleg over drift, kleuraanduiding en Box 3-tips. Regressietestsuite met 17 tests. Target allocations en rebalance threshold toegevoegd aan seed-persona\'s.',
          },
        ],
      },
      {
        module: 'De Kern — Kostenanalyse & TER',
        color: 'amber',
        items: [
          {
            title: 'TER-velden op holdings',
            description:
              'Databasemigratie voegt TER (Total Expense Ratio) toe aan holdings-tabel. API en TypeScript-types bijgewerkt. TER-invoerveld op create/edit-formulieren en detailpagina van holdings.',
          },
          {
            title: 'Fee Analyzer',
            description:
              'Nieuw lib/fee-analysis.ts berekent portfoliokosten en FIRE-impact van lopende kosten. Dashboard widget toont totale kostenratio, jaarlijkse kosten in euro\'s en het samengestelde effect op eindvermogen.',
          },
          {
            title: 'Fee detail BottomSheet',
            description:
              'Kassabon-stijl modal met per-holding kostenopsplitsing: TER-percentage, jaarlijkse kosten en aandeel in totale portfoliokosten.',
          },
          {
            title: 'Fondsalternatieven-database',
            description:
              '26 Nederlandse fondsmappings met goedkopere alternatieven (bijv. actief → indexfonds). Suggesties voor kostenverlaging bij dure fondsen.',
          },
          {
            title: 'Kostenanalyse guide & tests',
            description:
              'Guide-sectie "Beleggingskosten & TER" met compound cost-voorbeelden. Regressietestsuite met 23 tests. TER-waarden toegevoegd aan persona seed-data.',
          },
        ],
      },
      {
        module: 'De Kern — Hypotheek vs Beleggen',
        color: 'amber',
        items: [
          {
            title: 'Vergelijkingsengine',
            description:
              'Nieuw lib/hypotheek-vs-beleggen comparison engine berekent scenario\'s voor extra aflossen vs beleggen, rekening houdend met hypotheekrenteaftrek (marginaal tarief), Box 3-belasting en verwacht rendement. Marginaal_tarief veld toegevoegd aan profielen.',
          },
          {
            title: 'Hypotheek vs Beleggen modal & actieknop',
            description:
              'HypotheekVsBeleggenModal als BottomSheet met side-by-side vergelijking van aflossen vs beleggen over de looptijd. "Aflossen vs Beleggen"-knop op hypotheekkaarten in de schulden-pagina.',
          },
          {
            title: 'Dashboard widget & briefing',
            description:
              'Nieuw dashboard widget met hypotheek vs beleggen-samenvatting (met null-state voor gebruikers zonder hypotheek). Hypotheek vs beleggen context geïntegreerd in het AI-briefingsysteem.',
          },
          {
            title: 'Guide & tests',
            description:
              'Nieuwe guide topic card met uitleg over HRA, Box 3 en breakeven-punt. Regressietests en marginaal_tarief toegevoegd aan seed-persona\'s.',
          },
        ],
      },
      {
        module: 'Dashboard',
        color: 'blue',
        items: [
          {
            title: 'FIRE voortgangsbalk',
            description:
              'Nieuw FIRE progress bar component op het dashboard toont voortgang richting financiële onafhankelijkheid als percentage. Vervangt het dubbele netto-vermogen display door een FIRE-percentage indicator.',
          },
        ],
      },
      {
        module: 'Platform & Testing',
        color: 'zinc',
        items: [
          {
            title: 'Roadmap-pagina met persistentie',
            description:
              'Dynamische status en opmerkingen op de roadmap-pagina. Persistentie via app_settings fallback met graceful degradation bij ontbrekende database-kolommen.',
          },
          {
            title: 'Test runner role-switching',
            description:
              'Regressietest runner ondersteunt nu automatisch role-switching per test. Categorieën kunnen een defaultRole instellen (user/superadmin/any). De runner schakelt het testaccount-profiel automatisch om vóór elke test.',
          },
          {
            title: 'authenticatedFetch in testsuites',
            description:
              'Alle testsuites gebruiken nu authenticatedFetch in plaats van bare fetch(), waardoor base URL-configuratie correct wordt afgehandeld in alle omgevingen.',
          },
        ],
      },
    ],
  },
  {
    version: 'fin_prod_0.85',
    date: '2026-03-13',
    title:
      'Optionele budgettering, multi-view vermogensprognose, cash-overzicht & AI zonder budgetdata',
    sections: [
      {
        module: 'De Kern — Vermogen & Cash',
        color: 'amber',
        items: [
          {
            title: 'Budgettering aan/uit per rekening',
            description:
              'Nieuw toggle has_budget_tracking op elke cashrekening. Via het instellingenmenu kun je per rekening bepalen of transacties meetellen in budgetoverzichten. Bij uitschakelen van de laatste trackingrekening wordt automatisch budgeting_active=false gezet met bevestigingsdialoog.',
          },
          {
            title: 'Multi-view vermogensprognose',
            description:
              'De bucket projection chart heeft nu 4 switchbare views: Nominaal vs Reëel (netto vermogen in huidige euro\'s vs koopkracht), Opbouw (gestapeld per assettype), Inkomen & Spaarquote (projectie van inkomen en spaargedrag), en Box 3 Belasting (jaarlijkse belastingdruk nominaal en reëel). Smooth slide-animaties tussen views met contextberichten per view.',
          },
          {
            title: 'Nieuw cash-overzicht component',
            description:
              'Compleet herontworpen cash-overzicht met liquiditeitshero en vrijheidstijd-badge, rekeningengrid met saldobalken, maand-voor-maand geldstroomoverzicht met inkomen per rekening en uitgaven per budget, netto resultaat, en quick-action knoppen voor import, bankconnect en overboekingen. Kassabon-modals voor gedetailleerde inspectie.',
          },
          {
            title: 'Asset-instellingenmenu',
            description:
              'Gekoppelde assets hebben nu een instellingenmenu met directe bewerkingsmogelijkheden: naam, waarde, IBAN, bank, type, netto-vermogen inclusiepercentage, en de budget-tracking toggle.',
          },
          {
            title: 'Spaarquote-berekening gecorrigeerd',
            description:
              'Transacties gekoppeld aan spaardoelen (budget_type=savings) worden nu correct als sparen geteld in plaats van als uitgave. Doorwerking in dashboard, core-pagina, rapportages en widgets.',
          },
        ],
      },
      {
        module: 'De Wil — Acties & Aanbevelingen',
        color: 'teal',
        items: [
          {
            title: 'AI-context zonder budgetdata',
            description:
              'Wanneer budgettering uit staat, skippen buildWilContext en buildRecommendationContext alle budget-specifieke secties. Systeemprompts bevatten een GEEN BUDGETTERING-instructie: AI stelt geen budget-optimalisaties voor maar focust op vermogensgroei, schulden, spaarquote en beleggingen.',
          },
          {
            title: 'Profiel-schattingen als fallback',
            description:
              'Bij ontbrekende transactiedata gebruikt het systeem estimated_monthly_expenses uit het profiel voor NIBUD-benchmarks, pensioenberekeningen en AI-context.',
          },
        ],
      },
      {
        module: 'Onboarding',
        color: 'blue',
        items: [
          {
            title: 'Budgetteringskeuze bij onboarding',
            description:
              'Nieuwe stap: Wil je budgetten instellen? met opties Ja en Niet nu. Bij Niet nu wordt gevraagd naar geschatte maandelijkse uitgaven als fallback. budgeting_mode bepaalt welke features actief worden.',
          },
          {
            title: 'Redirect naar De Kern',
            description:
              'Na succesvolle onboarding wordt nu doorgestuurd naar /core in plaats van /will, zodat gebruikers direct hun complete financiële overzicht zien.',
          },
        ],
      },
      {
        module: 'Platform',
        color: 'zinc',
        items: [
          {
            title: 'Navigatie-activering met animatie',
            description:
              'Navigatie-items die requiresActivation zijn worden verborgen totdat de gebruiker features activeert. Bij activering verschijnen ze met een nav-reveal animatie. Respecteert prefers-reduced-motion.',
          },
          {
            title: 'Budgettering aan/uit architectuur',
            description:
              'Twee-laags systeem: gebruikersniveau (budgeting_active) en rekeningniveau (has_budget_tracking) met auto-sync bij opslaan of verwijderen van cash-assets. 18 budget-gerelateerde widgets worden automatisch verborgen wanneer budgettering uit staat.',
          },
          {
            title: 'Databasemigratie estimated_monthly_expenses',
            description:
              'Nieuwe kolom profiles.estimated_monthly_expenses (numeric, nullable) voor gebruikers zonder transactietracking. Rapportage-endpoint verbeterd met per-maand tracking van spaardoel-transacties en correcte spaarquote.',
          },
        ],
      },
    ],
  },
  {
    version: 'fin_prod_0.84',
    date: '2026-03-12',
    title:
      'Vermogensprognose per bucket, nieuwsarchief, eigen-overboekingenfilter & vereenvoudigde onboarding',
    sections: [
      {
        module: 'De Kern — Vermogen & Cash',
        color: 'amber',
        items: [
          {
            title: 'Vermogensprognose per vermogenscategorie met Box 3',
            description:
              'Nieuw gestapeld-areagrafiek op de Kern-pagina: vermogen uitgesplitst per assettype (spaargeld, beleggingen, vastgoed) met individuele rendementen, schuldaflosschema\'s en maandelijkse Box 3-belastingdruk. Inclusief detailtabel met aannames, kosten en mijlpalen.',
          },
          {
            title: 'Spaarquote kassabon met categorieën',
            description:
              'De spaarquote in de hero-sectie is nu klikbaar en opent een kassabon met uitsplitsing per budgettype (uitgaven, sparen, aflossingen) over 6 maanden, inclusief iconen en kleuren.',
          },
          {
            title: 'Eigen overboekingen uitgefilterd',
            description:
              'Transacties met type \'transfer\' of \'joint_transfer\' worden nu overal uitgefilterd uit inkomen/uitgaven-berekeningen: dashboard, budgetten, spaarquote, AI-context, notificaties en abonnementsherkenning.',
          },
          {
            title: 'Batch-beoordeling van overboekingen',
            description:
              'De TransferConfirmSheet verwerkt nu een lijst transacties achter elkaar. Nieuwe optie "Nee, echte uitgave" leidt naar budgetselectie met opslaan van categorisatieregel voor toekomstige transacties.',
          },
          {
            title: 'Automatische transfer-pair linking na import',
            description:
              'Na bankimport worden ongelinkte transfers automatisch gekoppeld op basis van bedrag (tegengesteld teken), datum (±1 dag) en IBAN-kruismatch.',
          },
          {
            title: 'Bankconnectiestatus per rekening',
            description:
              'Op de individuele rekeningpagina wordt de TrueLayer-connectiestatus nu gefilterd op de betreffende rekening. Niet-gekoppelde rekeningen tonen een duidelijke status met directe link naar Bank Connect.',
          },
          {
            title: 'Interactieve hover op missiekaarten',
            description:
              'De vier missiekaarten (budgetten, cash, assets, schulden) hebben nu klikbare regelitems met hover-feedback. Kaarten omgezet van button naar div voor correcte geneste klikacties.',
          },
        ],
      },
      {
        module: 'De Horizon — Projecties & Scenario\'s',
        color: 'purple',
        items: [
          {
            title: 'Realistischer What-If spaarmodel',
            description:
              'Het What-If-model werkt nu delta-gebaseerd: extra inkomen boven het basisinkomen gaat 1:1 naar sparen, terwijl de spaarquote-slider alleen de levensstandaard aanpast op het basisinkomen. Geeft realistischere scenario\'s bij parttime of loonsverhoging.',
          },
          {
            title: 'Bankrekeningen in Horizon-vermogen',
            description:
              'Ongelinkte bankrekeningen worden nu meegeteld in het totale vermogen op de Horizon-pagina, zodat cashposities niet meer ontbreken in FIRE-berekeningen.',
          },
          {
            title: 'Foutafhandeling levensgebeurtenissen',
            description:
              'Bij het opslaan, bijwerken of verwijderen van levensgebeurtenissen worden database-fouten nu afgevangen en als leesbare foutmelding in het formulier getoond.',
          },
          {
            title: 'Horizon-notificaties',
            description:
              'Drie FIRE-aandachtspunten als notificatie: ontbrekende geboortedatum, openstaande schulden en FIRE niet haalbaar bij huidige koers. Met directe links naar de relevante pagina.',
          },
        ],
      },
      {
        module: 'Berichten — Nieuwssysteem',
        color: 'rose',
        items: [
          {
            title: 'Progressieve nieuwsgeneratie',
            description:
              'De News API is omgebouwd naar streamObject met elementStream: artikelen verschijnen op het scherm zodra ze individueel klaar zijn via polling elke 2,5 seconde, met staggered reveal-animatie.',
          },
          {
            title: 'Nieuwsarchief met edities',
            description:
              'Bij elke verversing wordt de huidige editie gearchiveerd met editienummer en jaargang. Nieuwe tab "Archief" toont eerdere edities met overzichtskaart per editie.',
          },
          {
            title: 'Direct vs. relevant impacttype',
            description:
              'Nieuwsitems hebben nu een impactType-veld: \'direct\' voor artikelen met concrete euro-bedragen of vrijheidstijd, en \'relevant\' voor achtergrondartikelen. Direct-impact komt eerst.',
          },
          {
            title: 'Verversingslimieten',
            description:
              'Instelbaar maximum (standaard 3 per week) voor nieuwsverversingen. Resterende verversingen worden getoond naast de ververs-knop. Configureerbaar via beheer.',
          },
          {
            title: 'Deduplicatie van nieuwskoppen',
            description:
              'Koppen van de afgelopen 2 maanden worden meegegeven aan het AI-model om herhaling van dezelfde onderwerpen te voorkomen.',
          },
          {
            title: 'Masthead met jaargang en editienummer',
            description:
              'De krantenkop toont nu het werkelijke editienummer en jaargang uit de database. Nieuwscomponenten zijn opgesplitst in aparte bestanden (Masthead, Footer, HeroArticle, etc.).',
          },
        ],
      },
      {
        module: 'Dashboard — AI Briefing',
        color: 'blue',
        items: [
          {
            title: 'Briefing via achtergrondgeneratie',
            description:
              'De briefing compose API is omgebouwd van SSE-streaming naar fire-and-forget + polling. Kaarten verschijnen progressief via polling elke 2,5 seconde. Resilient tegen navigatie en verbindingsverlies.',
          },
          {
            title: 'Chat-deduplicatie bij navigatie',
            description:
              'Deduplicatiefilter op chatberichten voorkomt dat de useChat-store tijdelijke duplicaten toont bij snelle paginatransities.',
          },
        ],
      },
      {
        module: 'Platform — Instellingen & Onboarding',
        color: 'zinc',
        items: [
          {
            title: 'Box 3-berekeningsmethode als instelling',
            description:
              'Keuze tussen forfaitair rendement (wettelijk fictief) en werkelijk rendement per asset in Instellingen. Doorgespeeld naar FIRE-parameters en de vermogensprognose-engine.',
          },
          {
            title: 'Onboarding vereenvoudigd naar 1 stap',
            description:
              'Van 5 stappen naar 1: kies maximaal 2 focusgebieden (budgetten, vermogen, FIRE, doelen, of totaaloverzicht). Dashboard wordt automatisch samengesteld.',
          },
          {
            title: 'Admin-pagina voor AI Features',
            description:
              'Nieuwe beheer-sectie voor AI-instellingen zoals nieuwsverversingslimieten, bereikbaar via /beheer/ai-features.',
          },
          {
            title: 'Vijfde testpersona: Rashid "De Genieter"',
            description:
              'Nieuwe persona voor check-in gebaseerd gebruik. Alle persona\'s verrijkt met FIRE-parameters, widget-voorkeuren en realistischere transactiepatronen. Data-wissen handelt nu ook banksync-tabellen af.',
          },
        ],
      },
    ],
  },
  {
    version: 'fin_prod_0.83',
    date: '2026-03-11',
    title:
      'TrueLayer bankconnectie, dashboard-wizard, uitgebreide doelen, trend-widgets & data-architectuur',
    sections: [
      {
        module: 'Platform — TrueLayer Bankconnectie',
        color: 'rose',
        items: [
          {
            title: 'GoCardless vervangen door TrueLayer',
            description:
              'Volledige migratie van GoCardless naar TrueLayer als bankconnectie-provider. OAuth 2.0 flow met sandbox- en productie-ondersteuning.',
          },
          {
            title: 'Automatische transactiesynchronisatie',
            description:
              'Bankrekeningen worden automatisch gesynchroniseerd met deduplicatie, automatische categorisering en rate limiting (10 requests/dag per rekening).',
          },
          {
            title: 'Rekeningbeheer',
            description:
              'Gekoppelde rekeningen tonen syncstatus, laatste synchronisatietijd, dagelijkse requestteller en token-verloopwaarschuwing. Automatische asset-backfill voor nettovermogensberekening.',
          },
          {
            title: 'Beheer: bankconnectie-configuratie',
            description:
              'Nieuwe beheer-pagina voor TrueLayer-instellingen: aan/uit-schakelaar, client-credentials, omgeving-keuze en testverbinding.',
          },
        ],
      },
      {
        module: 'Dashboard — Wizard & Widgets',
        color: 'blue',
        items: [
          {
            title: 'Auto Dashboard Wizard',
            description:
              'Meerstappen-wizard om je dashboard te personaliseren: kies focusgebieden, modulevoorkeuren, gridformaat en detailniveau. Deterministische scoring rangschikt widgets op basis van je keuzes.',
          },
          {
            title: '4 trend-widgets',
            description:
              'Nieuwe sparkline-widgets voor inkomen, uitgaven, sparen en schulden. 6- en 12-maanden trendlijnen met maand-op-maand verandering, budgetlijn en voortschrijdend gemiddelde. Vrijheidstijd-omrekening bij volledig formaat.',
          },
          {
            title: '4 inzicht-widgets',
            description:
              'Beslissingspatronen, vrijheidsdagen deze maand, wilskracht-score en berichten als nieuwe dashboard-widgets. Elk met quarter/half/full formaten.',
          },
          {
            title: 'Widget grid verbeterd',
            description:
              'Inline groottekeuze per widget (vervangt cyclisch doorschakelen), drop-placeholder bij slepen, verberg/toevoeg-knoppen en wizard-knop. Budgetfavorieten worden apart opgeslagen.',
          },
          {
            title: 'Data loader extractie',
            description:
              'Dashboard- en De Wil data-ophalen geëxtraheerd naar dedicated loaders (dashboard-data-loader.ts, will-data-loader.ts). Schonere paginacomponenten en betere testbaarheid.',
          },
        ],
      },
      {
        module: 'De Wil — Doelen & Componentarchitectuur',
        color: 'teal',
        items: [
          {
            title: '6 nieuwe doeltypes',
            description:
              'Spaarquote, belegd vermogen, passief inkomen, noodfonds, salaris en vrij doel als nieuwe doeltypes. Elk met eigen metadata, icoon en geformateerde streefwaarde.',
          },
          {
            title: 'Compact actiebord',
            description:
              'Actiebord toont maximaal 5 acties met BottomSheet voor de volledige lijst. Editorial kolomstyling met icon-headers en count-badges.',
          },
          {
            title: 'Component-extractie',
            description:
              'De Wil volledig gemodulariseerd: will-hero, will-landing, action-center, module-side-bar en module-strip als losse componenten. Berichten-pagina refactored naar berichten-client.',
          },
        ],
      },
      {
        module: 'De Kern — Check-in & Herwaardering',
        color: 'amber',
        items: [
          {
            title: 'Herwaarderingsstappen in check-in',
            description:
              'Check-in wizard uitgebreid met bezittingen- en schulden-herwaardering. Bezittingen, schulden en losse doelen worden stap voor stap bijgewerkt met actuele waarden.',
          },
          {
            title: 'Levensgebeurtenissen widget herontworpen',
            description:
              'Volledig nieuwe visualisatie met vermogensprojectie-grafiek en event-markers. SVG-animaties tonen de impact van elke levensgebeurtenis op je vrijheidstijd.',
          },
          {
            title: 'Cash-module vernieuwd',
            description:
              'Kasoverzicht toont nu CashAccountView in plaats van redirect. Verbindingsflow gemigreerd naar TrueLayer OAuth met nieuwe callback- en succespagina\'s.',
          },
        ],
      },
      {
        module: 'De Horizon — Visualisaties',
        color: 'purple',
        items: [
          {
            title: 'Horizon pagina verbeterd',
            description:
              'Vernieuwde De Horizon overzichtspagina met verbeterde layout en datapresentatie.',
          },
          {
            title: 'Simulatiegrafiek updates',
            description:
              'SimChart en events-tijdlijn visueel verfijnd. Betere interpolatie en compacte valutalabels bij event-markers.',
          },
        ],
      },
      {
        module: 'Beheer — Nieuwe pagina\'s',
        color: 'zinc',
        items: [
          {
            title: 'AI Prompts inspectiepagina',
            description:
              'Alle systeemprompts in één overzicht: base, kern, wil, horizon, briefing, voorstellen en what-if. Met karaktertellingen, bronbestanden en gecombineerde preview.',
          },
          {
            title: 'Propositie-pagina',
            description:
              'Editorial narratief van de TriFinity-filosofie: "Geld is opgeslagen tijd". Waardepropositie, modulekaart, differentiatie en het aha-moment.',
          },
          {
            title: 'Check-in beheer',
            description:
              'Maandelijkse check-in snapshots bekijken en verwijderen via de beheerpagina.',
          },
        ],
      },
    ],
  },
  {
    version: 'fin_prod_0.82',
    date: '2026-03-08',
    title:
      'Huishouden & partner, levensgebeurtenissen, what-if scenario\'s, gids-pagina & De Wil editorial',
    sections: [
      {
        module: 'Platform — Huishouden & Partner',
        color: 'rose',
        items: [
          {
            title: 'Privacy-instellingen per partner',
            description:
              'Huishouden privacy-instellingen met database-schema en tweetalige API. Partners kiezen zelf welke financiële gegevens ze delen.',
          },
          {
            title: 'Perspectiefwisseling',
            description:
              'Dashboard, De Kern en De Horizon tonen gecombineerde huishoudcijfers wanneer het perspectief op "Huishouden" staat. Race conditions bij snel wisselen zijn opgelost.',
          },
          {
            title: 'Vrijheidstijd per partner',
            description:
              'Nieuw vergelijkingswidget toont de vrijheidstijd van beide partners naast elkaar. De Kern hero toont huishoud-vrijheidstijd in huishoudperspectief.',
          },
          {
            title: 'FIRE-vergelijking',
            description:
              'De Horizon toont een 3-weg FIRE-leeftijdvergelijking: Partner 1, Partner 2 en Gecombineerd. Huishouden FIRE gebruikt split_mode in plaats van gelijke verdeling.',
          },
          {
            title: 'Gedeelde doelen',
            description:
              'Partners kunnen financiële doelen delen met per-partner bijdrageverdeling. Filtertabs Alle/Persoonlijk/Gedeeld op de doelenpagina.',
          },
          {
            title: 'Partner-acties in De Wil',
            description:
              'Acties kunnen aan je partner worden toegewezen. De partner ziet toegewezen acties in een "Van je partner" sectie.',
          },
          {
            title: 'Maandelijkse check-in',
            description:
              'Check-in wizard met delta-tracking, gespreksstarters en aandachtspunten. Samenvatting wordt opgeslagen voor beide partners met geschiedenispagina.',
          },
          {
            title: 'Meldingen en activiteitenfeed',
            description:
              'Partner-notificatie-instellingen, transactiemeldingen en een gedeelde huishoudactiviteitenfeed.',
          },
          {
            title: 'Monte Carlo en Box 3 voor huishouden',
            description:
              'Monte Carlo simulatie gebruikt huishouddata. Box 3 partner-optimalisatie berekent de fiscaal voordeligste verdeling.',
          },
          {
            title: 'Graceful degradation solo-gebruikers',
            description:
              'Alle huishoudfuncties werken soepel voor solo-gebruikers. Uitnodigingsverlopen en opruiming na vertrek zijn geïmplementeerd.',
          },
        ],
      },
      {
        module: 'De Horizon — Levensgebeurtenissen',
        color: 'purple',
        items: [
          {
            title: 'Uitgebreid event-catalogus',
            description:
              'Gegroepeerde catalogus met beschrijvingen en impactranges. Nieuwe events: scheiding, werkloosheid, schenking, overlijden partner, sabbatical, wereldreis, auto kopen, verbouwing, huis kopen/verkopen, erfenis, kinderopvang, vroegpensioen, bijverdienste en meer.',
          },
          {
            title: 'Nederlandse belastingberekeningen',
            description:
              'Erfbelasting met breakdown card, schenkbelasting met belastingvrije bedragen, WW-uitkering met transitievergoeding, AOW-gap berekening met overbruggingskosten, en kosten koper bij huis kopen.',
          },
          {
            title: 'Slimme formulieren',
            description:
              'Event-formulieren met secties, dividers en financiële impact-samenvatting. Metadata-aware cashflows, NIBUD kinderkostenschaling, en pre-fill vanuit bestaande profieldata.',
          },
          {
            title: 'Vrijheidstijd per event',
            description:
              'Elke levensgebeurtenis toont het impact in vrijheidstijd-equivalent, consistent met de kernfilosofie.',
          },
          {
            title: 'Kinderen-event verrijkt',
            description:
              'Kinderopvangtoeslag en kinderbijslag verrekening. Babyuitzet-kosten meegenomen bij kinderen-event.',
          },
          {
            title: 'Pensioen verbeterd',
            description:
              'Standaard pensioenleeftijd 67, gesplitste Lijfrente/Banksparen opties. AOW leefsituatie met netto 2026 bedragen en opbouwcorrectie.',
          },
        ],
      },
      {
        module: 'De Horizon — What-If Scenario\'s',
        color: 'purple',
        items: [
          {
            title: 'Scenario opslaan en laden',
            description:
              'Sla tot 5 what-if scenario\'s op en laad ze later weer in. Vergelijk verschillende toekomstpaden naast elkaar.',
          },
          {
            title: 'Inline event bewerking',
            description:
              'Levensgebeurtenissen direct bewerken via een BottomSheet, zonder de scenario-flow te verlaten.',
          },
          {
            title: 'Reality-check planner',
            description:
              'Nieuw planner-modus in de what-if chat die scenario\'s toetst aan realistische aannames.',
          },
          {
            title: 'Verrijkte chat-context',
            description:
              'What-if chat ontvangt de volledige scenario-context: sliders, FIRE-delta en alle levensgebeurtenissen.',
          },
          {
            title: 'Actiekaarten met De Wil integratie',
            description:
              'What-if inzichten worden omgezet in actiekaarten die doorlinken naar De Wil. Profielgebaseerde parameters en duplicaat-event detectie.',
          },
          {
            title: 'Vermogensprojectie-visualisatie',
            description:
              'Verbeterde cashflow-annotaties op de vermogensprojectiegrafiek. Nieuwe events-tijdlijn visualisatie onder de grafiek.',
          },
        ],
      },
      {
        module: 'De Kern — Belasting',
        color: 'amber',
        items: [
          {
            title: 'Box 2 aanmerkelijk belang',
            description:
              'Volledige Box 2 belastingberekening-engine met API endpoint en integratie op de belastingpagina. Classificatielabel voor deelnemingen.',
          },
          {
            title: 'Nieuwe vermogenstypes',
            description:
              'Deelneming, levensverzekering en vordering als nieuwe asset-types met formuliervelden, migraties en Box 3 classificatie.',
          },
          {
            title: 'Nieuwe schuldtypes',
            description:
              'Belastingschuld (met subtypes en betalingsregeling), DGA-schuld (met deelneming-koppeling en Wet excessief lenen waarschuwing) en familielening als nieuwe schuldtypes.',
          },
          {
            title: 'Studieschuld in huishouden-FIRE',
            description:
              'Studieschuld wordt correct meegenomen in huishouden FIRE-berekening met per-schuld split overrides.',
          },
          {
            title: 'Hypotheek partner-split',
            description:
              'Per hypotheek instelbare partner-splitverdeling voor nauwkeurigere huishoudberekeningen.',
          },
        ],
      },
      {
        module: 'De Wil — Editorial Redesign',
        color: 'teal',
        items: [
          {
            title: 'Hero en lege staten',
            description:
              'Nieuwe editorial styling voor De Wil hero-sectie. Verbeterde lege-staat designs voor voorstellen en acties.',
          },
          {
            title: 'Recommendation en Action cards',
            description:
              'Volledig herontworpen kaarten met checkbox-strip layout, editorial finance stijl en summary bar conform het design language.',
          },
          {
            title: 'Interactie-verbeteringen',
            description:
              'Voorstellen count badge, vloeiende checkbox-animatie op acties, hover/long-press interacties. Opzegbrief-link is standaard verborgen en verschijnt bij hover.',
          },
          {
            title: 'Partner-acties compact',
            description:
              'Compacte weergave voor partner-acties. Afgeronde acties vervagen subtiel, uitgestelde acties krijgen een amber accent.',
          },
          {
            title: 'Skeleton loading',
            description:
              'Compacte skeleton loading states voor voorstellen, zodat de pagina minder springt tijdens het laden.',
          },
        ],
      },
      {
        module: 'Identiteit — Gids',
        color: 'blue',
        items: [
          {
            title: 'Nieuwe gids-pagina',
            description:
              'Volledig nieuwe /gids pagina met 5 reis-stappen die je door je financiële reis leiden, met progress tracker en geanimeerde voortgangsbalk.',
          },
          {
            title: 'Interactieve reis-stappen',
            description:
              'Stap 1-5 als interactieve kaarten: breng in kaart, maak een plan, neem actie, kijk vooruit, en droom & plan.',
          },
          {
            title: 'Ontdekken-sectie',
            description:
              'Toont onbezochte en coming-soon features. 18 ontdek-items met sovereignty-level filtering.',
          },
          {
            title: 'Conceptkaarten',
            description:
              'Interactieve flip-cards die kernconcepten uitleggen met gepersonaliseerde data van de gebruiker.',
          },
          {
            title: 'Pro-tips en FAQ',
            description:
              'Horizontaal scrollbare pro-tips carousel en FAQ-sectie met 8 inklapbare vragen.',
          },
          {
            title: 'Responsive editorial design',
            description:
              'Volledige responsive layout met Editorial Finance stijl, inclusief guide-progress API voor voortgangstracking.',
          },
        ],
      },
    ],
  },
  {
    version: 'fin_prod_0.81',
    date: '2026-03-07',
    title:
      'Privacy & AI veiligheid, Berichten-pagina, widget grid redesign & onboarding editorial',
    sections: [
      {
        module: 'Berichten — Nieuwspagina',
        color: 'blue',
        items: [
          {
            title: 'Berichten-pagina met nieuwsoverzicht',
            description:
              'Nieuwe /berichten pagina met redactioneel newspaper-design, masthead en sectie-navigatie. AI-gegenereerd financieel nieuws gepersonaliseerd op basis van je financiële situatie.',
          },
          {
            title: 'Hero-artikel en typografie',
            description:
              'Het belangrijkste nieuwsartikel wordt prominent getoond met hero-layout, dropcap, kolom-separators en impact-blocks.',
          },
          {
            title: 'Twee-koloms nieuwsgrid',
            description:
              'Nieuws wordt in een krant-achtig twee-koloms grid getoond op desktop, met single-column op mobiel.',
          },
          {
            title: 'On-demand nieuwsgeneratie',
            description:
              'Nieuws wordt on-demand gegenereerd met 7-dagen cache. Via de refresh-knop kun je nieuw nieuws opvragen.',
          },
          {
            title: 'Collapsible meldingen',
            description:
              'Meldingen zijn nu inklapbaar bovenaan de pagina, zodat nieuws de hoofdcontent is.',
          },
          {
            title: 'Bespreek met Will',
            description:
              'Elk nieuwsartikel heeft een "Bespreek met Will" knop om het artikel te bespreken met de AI-coach. Gelezen artikelen worden bijgehouden.',
          },
          {
            title: 'Scroll-navigatie',
            description:
              'Sectie-ankers maken het mogelijk om snel tussen nieuwscategorieën te navigeren.',
          },
          {
            title: 'Foutafhandeling en lege staat',
            description:
              'Verbeterde error UI met retry-knop en een editorial empty state wanneer er geen nieuws beschikbaar is.',
          },
        ],
      },
      {
        module: 'Platform — Privacy & AI Veiligheid',
        color: 'zinc',
        items: [
          {
            title: 'AI privacy-filter (sanitizeForAI)',
            description:
              'Nieuwe utility die persoonlijke gegevens automatisch anonimiseert voordat ze naar AI-providers worden gestuurd. Geïntegreerd in alle AI endpoints met unit tests.',
          },
          {
            title: 'PII output filter',
            description:
              'AI-antwoorden worden automatisch gefilterd op IBAN- en BSN-nummers, zodat deze nooit in de interface verschijnen.',
          },
          {
            title: 'AI opt-out en privacy-instellingen',
            description:
              'Nieuwe privacy-sectie in instellingen met AI opt-out toggle, standaard prompt preview, en een privacy statement modal.',
          },
          {
            title: 'AiPrivacyIndicator',
            description:
              'Nieuw ShieldCheck-icoon met tooltip bij alle AI-aangedreven features, zodat je altijd ziet dat privacy-bescherming actief is.',
          },
          {
            title: 'Fail-safe sanitization',
            description:
              'Wanneer de anonimisatie faalt, worden AI-calls geblokkeerd in plaats van onbeschermde data te versturen.',
          },
          {
            title: 'Graceful fallback zonder AI',
            description:
              '/berichten werkt correct zonder geconfigureerde AI-provider, met duidelijke feedback.',
          },
        ],
      },
      {
        module: 'DAIshboard — Widget Grid',
        color: 'purple',
        items: [
          {
            title: 'Nieuw grid formaat',
            description:
              'Widgets hebben een nieuw formaat-systeem: half-size widgets tonen in 2 kolommen / 1 rij, full-size in 2 kolommen / 2 rijen. Dit geeft een compacter en overzichtelijker dashboard.',
          },
          {
            title: 'Kern-widgets aangepast',
            description:
              'Alle kern-module widgets zijn aangepast voor de nieuwe grid formaten.',
          },
          {
            title: 'Widget resize in edit-mode',
            description:
              'In dashboard edit-mode kun je nu widgets verkleinen of vergroten met een resize-knop.',
          },
        ],
      },
      {
        module: 'Platform — Meldingen',
        color: 'zinc',
        items: [
          {
            title: '30-dagen meldingenhistorie',
            description:
              'Meldingen tonen nu tot 30 dagen historie met dag-groepering en verbeterde mobile touch targets.',
          },
          {
            title: 'Cross-links',
            description:
              'Meldingen-widget linkt door naar /berichten, en de notification-modal bevat directe links naar relevante pagina\u0027s.',
          },
        ],
      },
      {
        module: 'Identiteit — Onboarding',
        color: 'blue',
        items: [
          {
            title: 'Editorial redesign',
            description:
              'Onboarding intro- en success-stappen hebben een volledig nieuw editorial design met verbeterde whitespace en hiërarchie.',
          },
          {
            title: 'Monochroom design',
            description:
              'Kleurrijke gradiënten zijn vervangen door een strak monochroom ontwerp dat aansluit bij het editorial design language.',
          },
        ],
      },
      {
        module: 'Platform — Feature Gating',
        color: 'zinc',
        items: [
          {
            title: 'Standaard verborgen features',
            description:
              'FeatureGate toont vergrendelde features nu standaard niet meer (was: locked card). Dit geeft een schonere interface.',
          },
          {
            title: 'Widget-specifieke feature gates',
            description:
              'Widgets worden nu per feature-fase gegated, zodat alleen beschikbare widgets zichtbaar zijn in de selector en op het dashboard.',
          },
        ],
      },
      {
        module: 'Beheer',
        color: 'zinc',
        items: [
          {
            title: 'Widgets tab',
            description:
              'Nieuw tabblad in beheer met link naar /beheer/widgets-test.',
          },
          {
            title: 'Nieuws beheer',
            description:
              'Nieuw tabblad in beheer voor het beheren van nieuws system prompts.',
          },
        ],
      },
    ],
  },
  {
    version: 'fin_prod_0.80',
    date: '2026-03-04',
    title: 'Streaming AI briefing, dashboard-type switcher, briefing directives & nieuwe card types',
    sections: [
      {
        module: 'DAIshboard — AI Briefing',
        color: 'purple',
        items: [
          {
            title: 'Streaming briefing compositie',
            description:
              'De AI briefing wordt nu via Server-Sent Events (SSE) gestreamd in plaats van in één keer opgehaald. Cards verschijnen één voor één terwijl Will componeert, wat een snellere en meer interactieve ervaring geeft. De skeleton loader is vervangen door een compacte composing-indicator.',
          },
          {
            title: 'Nieuwe card types: Goal Progress & Budget Bar',
            description:
              'Twee nieuwe briefing card types: goalProgress toont doelvoortgang met mini-balk, deadline en on-track indicator. budgetBar toont een horizontale bar per budget met status (healthy/warning/over). Beide zijn beschikbaar als AI tools.',
          },
          {
            title: 'Slimmere AI-compositie',
            description:
              'Het briefingsysteem heeft nu fase-specifieke card emphasis, temporele guidance per maandperiode, verplichte href-navigatie op alle cards, en layout constraints (geen dubbele metrics naast elkaar, altijd eindigen met action/insight). Vorige maand-uitgaven en netto-vermogensdelta worden meegegeven voor vergelijkingen.',
          },
          {
            title: 'Briefing directives',
            description:
              'Nieuw admin-systeem voor redactionele en functionele briefing directives. Temporele directives activeren op specifieke periodes (bijv. belastingseizoen). Functionele directives sturen altijd mee. Beheerbaar via /beheer/briefing.',
          },
        ],
      },
      {
        module: 'Platform — Dashboard Type',
        color: 'zinc',
        items: [
          {
            title: 'Dashboard-type switcher',
            description:
              'Gebruikers kunnen kiezen tussen het widgets-dashboard en het AI briefing-dashboard als standaard. Instelbaar via Instellingen > Dashboard met een toggle. De keuze wordt opgeslagen in localStorage via een nieuwe DashboardTypeProvider.',
          },
          {
            title: 'Snelle dashboard-wissel in header',
            description:
              'Wanneer je op het dashboard bent, verschijnt een klein icoon naast de Dashboard-tab om snel te wisselen naar het andere dashboard-type (Sparkles voor AI, LayoutGrid voor widgets).',
          },
        ],
      },
      {
        module: 'Platform — Verbeteringen',
        color: 'zinc',
        items: [
          {
            title: 'Card animatie-vereenvoudiging',
            description:
              'De stagger-delay animatie op briefing cards is verwijderd. Cards animeren nu direct bij verschijning, wat beter past bij de streaming aanpak waar cards sowieso met vertraging binnenkomen.',
          },
          {
            title: 'Verbeterde card styling',
            description:
              'Diverse kleine verbeteringen: grotere pijl-iconen bij delta\'s en acties, line-clamp op alert berichten, verbeterde milestone progress bar met cubic-bezier easing, en module-kleuring op insight en milestone cards.',
          },
        ],
      },
    ],
  },
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
            description: 'Netto Vermogen, Cashflow Maand, Budgetten, Vermogen, Schulden, Beleggingen, Voorstellen, Acties, Doelen, FIRE Prognose, Monte Carlo, Levensgebeurtenissen, Spaarquote, Vrijheidsvoortgang, Abonnementen, Jouw Pad, Financiële Gezondheid, Box 3 Belasting, Vaste Lasten en NIBUD Benchmark.',
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
            title: 'Financiële gezondheid historiegrafiek',
            description: 'Lijndiagram dat je financiële gezondheidsscore over tijd toont met contextuele berichten over je voortgang.',
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
            title: 'Dynamische AI-context per module',
            description: 'ChatPanel detecteert de huidige module via het pad en past de context, kleuren, begroeting en placeholder aan. Will denkt mee vanuit het juiste perspectief (overzicht/teal, toekomst/paars) en elke module heeft een apart chatgesprek.',
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
