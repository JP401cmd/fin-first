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
