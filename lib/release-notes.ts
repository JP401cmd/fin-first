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
