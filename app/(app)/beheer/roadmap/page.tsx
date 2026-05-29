'use client'

/* -----------------------------------------------------------------
   Roadmap & Feature Gap Analyse
   Vergelijking met 30+ budgeting & wealth management apps
   ----------------------------------------------------------------- */

import { useState, useEffect, useCallback, useRef } from 'react'

type Feature = {
  readonly nr: number
  readonly name: string
  readonly description: string
  readonly werking: string
  readonly afhankelijkheden: readonly string[]
  readonly technisch: string
  readonly waardeGebruiker: string
  readonly aandachtspunten: readonly string[]
  readonly competitors: string
  readonly priority: string
}

type RoadmapStatus = 'backlog' | 'in_ontwikkeling' | 'testen' | 'afgerond'

type RoadmapOverlay = {
  feature_nr: number
  fase: string
  status: RoadmapStatus
  opmerkingen: string | null
  updated_at: string
}

const FASE_A_FEATURES: readonly Feature[] = [
  {
    nr: 1,
    name: 'Gestapelde Inkomsten vs. Uitgaven Grafiek',
    description:
      'De bestaande SimChart op Toekomst toont het vermogenspad als lijn met markers voor AOW-leeftijd, pensioen, FIRE-leeftijd en levensgebeurtenissen (cashflow bands). Wat ontbreekt is een gestapelde kolomweergave die per jaar laat zien WAAR het inkomen vandaan komt in de afbouwfase. Boldin\u2019s \u201cLifetime Income Projection Chart\u201d is hun vlaggenschip \u2014 dit is de ontbrekende visualisatie in TriFinity. Daarnaast moet de bestaande vermogenslijn expliciet gemarkeerd worden met verticale annotaties voor sleutelmomenten: AOW-startmoment, pensioen-startmoment, FIRE-moment, onttrekkingsfase-start, en alle andere actieve levensgebeurtenissen. Deze markers laten zien WANNEER elke bron inschakelt.',
    werking:
      'Een gestapelde kolom-grafiek (stacked bar chart) die per jaar toont: Kolommen (gestapeld): eigen vermogen/onttrekking, AOW-uitkering, werkgeverspensioen, passief inkomen, deeltijds werk, overige inkomstenbronnen. Lijn: totale uitgaven (ge\u00efndexeerd voor inflatie). Visueel: als de kolommen hoger zijn dan de lijn = surplus; lager = deficit (rode zone). Integratie met de bestaande SimChart: kan als alternatieve weergavemodus (\u201cVermogenspad\u201d vs \u201cInkomstenbronnen\u201d) of als aanvullende grafiek eronder. De bestaande AOW/pensioen/life event markers uit SimChart worden hier vertaald naar gestapelde bronnen. Aanvullend: de bestaande vermogenslijn/SimChart krijgt verticale marker-lijnen en annotaties op de tijdas voor elk sleutelmoment \u2014 AOW-start (verticale lijn + label), pensioen-start (verticale lijn + label), FIRE-moment (prominente marker), onttrekkingsfase-start, en alle actieve levensgebeurtenissen (bijv. kind, huis, sabbatical). Elke marker toont het moment waarop een inkomstenbron of uitgavenpost activeert, zodat de gebruiker in \u00e9\u00e9n oogopslag ziet WANNEER en WAAROM het vermogenspad verandert.',
    afhankelijkheden: [
      'components/app/horizon/sim-chart.tsx (bestaande SimChart)',
      'lib/fire-simulation.ts (SimRow: withdrawal, cashflowNet)',
      'lib/horizon-data.ts (computeFireProjection)',
      'lib/fire-simulation.ts (lifeEventsToCashflows)',
      'app/api/pension/parse (UPO PDF parsing)',
      'profiles.fire_end_strategy',
      'profiles.expected_return',
      'profiles.inflation_rate',
    ],
    technisch:
      'Data grotendeels beschikbaar via SimRow (withdrawal, cashflowNet, savings, growth). Wat nodig is: cashflows opsplitsen per bron (nu opgeteld in cashflowNet), stacked bar chart component (Recharts of custom SVG zoals SimChart), weergave als toggle of tab op Toekomst. De bestaande levensgebeurtenissen (AOW, pensioen, erfenis, etc.) worden automatisch als inkomstenbronnen getoond.',
    waardeGebruiker:
      'Beantwoordt de #1 vraag: \u201cWaar komt mijn geld vandaan als ik stop met werken?\u201d De huidige SimChart toont WANNEER, deze grafiek toont HOEVEEL per bron.',
    aandachtspunten: [
      'Cashflows moeten per bron opgesplitst worden \u2014 nu opgeteld in cashflowNet.',
      'Werkgeverspensioen kan variabele opbouw hebben.',
      'Gebruikers zonder UPO upload moeten handmatig bedrag kunnen invoeren.',
      'AOW-leeftijd kan politiek wijzigen.',
      'Partnersituatie (AOW enkel vs samenwonend) moet correct meegenomen worden.',
      'Toggle/tab UX tussen Vermogenspad en Inkomstenbronnen weergave.',
    ],
    competitors:
      'Boldin (Lifetime Income Projection Chart \u2014 hun vlaggenschip), ProjectionLab (income streams)',
    priority: 'Hoog',
  },
  {
    nr: 2,
    name: 'Rebalancing Alerts & Advies',
    description:
      'De target_allocations tabel bestaat al in de database maar wordt nog niet actief gebruikt. Activeer dit: toon wanneer de portefeuille meer dan X% afwijkt van de target allocatie, en geef een concreet rebalancing advies (welke holdings kopen/verkopen). Integreer met de meldingen-widget.',
    werking:
      'Gebruiker stelt target allocatie in per asset class (bijv. 80% aandelen, 10% obligaties, 10% cash). Het systeem vergelijkt dit continu met de werkelijke allocatie uit de holdings. Bij afwijking > drempel (instelbaar, bijv. 5%) verschijnt een alert met concreet advies: \u201cVerkoop \u20acX aan [holding A] en koop \u20acY aan [holding B] om terug in balans te komen.\u201d Optioneel: rebalancing-reminder in de maandelijkse check-in.',
    afhankelijkheden: [
      'target_allocations tabel (bestaat in DB)',
      'components/app/portfolio-allocation-chart.tsx',
      'holdings tabel met asset_class/sector/geography velden',
      'lib/price-feed.ts (actuele waardes)',
      'app/api/notifications (meldingen-systeem)',
    ],
    technisch:
      'Nieuwe lib/rebalancing.ts module met: computeDrift(holdings, targets) \u2192 DriftResult[], suggestTrades(drift, constraints) \u2192 Trade[]. Drift berekening: werkelijke % per asset_class vs target %. Trade suggestie houdt rekening met minimale transactiegrootte en belastingimpact (Box 3 peildatum). Nieuwe widget rebalancing (half-size) met drift-visualisatie. Alert via bestaand notificatie-systeem. API route /api/rebalancing/check aangeroepen door cron of bij dashboard-load.',
    waardeGebruiker:
      'Voorkomt dat emotioneel beleggen (bijv. alles in tech na rally) de portefeuille uit balans brengt. Bespaart tijd en geld die anders naar een financieel adviseur gaat. Wetenschappelijk bewezen dat regelmatig rebalancen risico verlaagt zonder rendement significant te verlagen.',
    aandachtspunten: [
      'Box 3 peildatum (1 januari) be\u00efnvloedt timing van rebalancing \u2014 verkopen vlak voor peildatum kan belastingvoordeel opleveren.',
      'Transactiekosten meenemen in advies.',
      'Holdings zonder asset_class classificatie moeten eerst ingevuld worden.',
      'Niet alle gebruikers hebben target allocatie ingesteld \u2014 progressive disclosure nodig.',
    ],
    competitors:
      'Wealthfront (automatisch), Betterment (automatisch), Empower (Investment Checkup)',
    priority: 'Hoog',
  },
  {
    nr: 3,
    name: 'Fee Analyzer (TER Impact)',
    description:
      'Bereken de totale jaarlijkse kosten van de beleggingsportefeuille op basis van TER (Total Expense Ratio) per holding. Toon het effect op de FIRE-datum: \u201cJe betaalt \u20acX/jaar aan fondsbeheer \u2014 dit kost je Y maanden vrijheid over 20 jaar.\u201d Holdings data met ISIN/ticker is er al \u2014 koppel aan een TER database of laat gebruikers TER per holding invoeren.',
    werking:
      'Overzicht van alle beleggingskosten: TER per holding, gewogen gemiddelde TER van totale portefeuille, en \u2014 cruciaal \u2014 het effect op de FIRE-datum. \u201cJe portefeuille kost \u20ac1.847/jaar aan beheerkosten. Over 20 jaar is dit \u20ac48.000 aan gemist rendement \u2014 dat zijn 14 maanden extra werken.\u201d Vergelijking met goedkopere alternatieven (bijv. Vanguard FTSE All-World TER 0.22% vs actief fonds TER 1.5%).',
    afhankelijkheden: [
      'holdings tabel (ticker, ISIN, current_value)',
      'lib/price-feed.ts',
      'lib/horizon-data.ts (FIRE berekening voor impact)',
      'lib/format.ts (calculateFreedomTime voor vrijheidstijd-impact)',
      'lib/fire-simulation.ts (simulatie met/zonder fees)',
    ],
    technisch:
      'Nieuw veld ter (decimal) op holdings tabel (migratie nodig). Optioneel: auto-lookup via ISIN uit externe TER database (OpenFIGI of Morningstar API, of handmatig bijgehouden JSON). Nieuwe lib/fee-analysis.ts: computePortfolioFees(holdings) \u2192 { totalAnnualFee, weightedTER, feeImpactOnFire }. Fee impact = verschil in FIRE-datum tussen simulatie met en zonder fees. Nieuwe widget fee_analyzer (half-size). Detail modal met per-holding breakdown en goedkopere alternatieven.',
    waardeGebruiker:
      'De meeste beleggers weten niet hoeveel ze betalen aan fondsbeheer. Empower\u2019s Fee Analyzer is een van hun meest gewaardeerde features \u2014 het opent ogen. Voor FIRE-strijders is elk 0.1% TER reductie = maanden eerder vrij. Direct actionable: \u201cSwitch van fonds X naar Y en bespaar Z maanden.\u201d',
    aandachtspunten: [
      'TER data actueel houden is een uitdaging.',
      'Niet alle holdings hebben een ISIN (individuele aandelen bijv.).',
      'Tracking difference vs TER discussie \u2014 TER is niet de volledige kostenmaat.',
      'Alternatieven-suggestie moet voorzichtig (geen financieel advies, disclaimer).',
      'Sommige fondsen zijn niet vrij verhandelbaar (pensioen, verzekeringen).',
    ],
    competitors: 'Empower (Fee Analyzer \u2014 best-in-class), Wealthica (fee reporting)',
    priority: 'Hoog',
  },
  {
    nr: 4,
    name: 'Tijd-prijskaartje op Transacties',
    description:
      'De vrijheidstijd-filosofie (\u201cgeld is opgeslagen tijd\u201d) consequent doorvoeren naar individuele transacties. Elke transactie toont automatisch hoeveel uur/dagen werk het kostte, gebaseerd op het netto-uurloon. FreedomTimeBadge en calculateFreedomTime bestaan al \u2014 maar worden nog niet op transactieniveau getoond. Dit maakt de filosofie tastbaar in het dagelijks gebruik.',
    werking:
      'Elke transactie in het overzicht toont naast het eurobedrag een subtiel \u201ctijd-label\u201d: \u201c\u2615 \u20ac4,50 \u00b7 12 min\u201d of \u201c\ud83c\udfe0 \u20ac1.250 \u00b7 3,4 dagen\u201d. Gebaseerd op het netto-uurloon van de gebruiker (berekend uit maandelijks netto-inkomen / werkuren). In de transactie-detailview een uitgebreidere weergave: \u201cDeze Bol.com bestelling van \u20ac89 kostte je 4 uur en 12 minuten werk. Dat is 0,6% van je maandelijkse vrijheidstijd.\u201d',
    afhankelijkheden: [
      'lib/format.ts (calculateFreedomTime, formatFreedomTimeString \u2014 bestaan al)',
      'components/app/freedom-time-label.tsx (FreedomTimeBadge \u2014 bestaat al)',
      'profiles tabel (netto maandinkomen)',
      'transacties tabel',
      'budget categorie\u00ebn voor context',
    ],
    technisch:
      'Minimale technische impact. Bereken netto-uurloon: nettoInkomen / (werkdagen \u00d7 8) uit profiel data. Voeg <FreedomTimeBadge amount={transaction.amount} /> toe aan transactie-rijen in components/app/transaction-row.tsx en transaction detail view. Optioneel: groepeer per dag/week en toon \u201cDeze week werkte je effectief X uur voor je uitgaven.\u201d Geen nieuwe API nodig \u2014 puur frontend berekening.',
    waardeGebruiker:
      'Maakt de kernfilosofie van TriFinity (\u201cgeld is opgeslagen tijd\u201d) tastbaar in het dagelijks gebruik. Psychologisch krachtig: \u201cwil ik echt 45 minuten werken voor deze lunch?\u201d Onderzoek toont dat \u201ctime framing\u201d van geld leidt tot bewuster uitgavegedrag. Dit is TriFinity\u2019s meest onderscheidende feature \u2014 geen concurrent doet dit.',
    aandachtspunten: [
      'Niet iedereen heeft een vast uurloon (ZZP, parttimers, pensioen).',
      'Fallback nodig voor gebruikers zonder inkomendata.',
      'Kan confronterend overkomen \u2014 maak het subtiel en optioneel uitschakelbaar.',
      'Grote bedragen (huur, hypotheek) kunnen demotiverend werken \u2014 context toevoegen (\u201cdit is je woonlasten, een basisbehoefte\u201d).',
    ],
    competitors: 'Niemand \u2014 dit is uniek voor TriFinity',
    priority: 'Middel',
  },
  {
    nr: 5,
    name: 'Financi\u00eble Gezondheids-score',
    description:
      'Een samenvattend getal (0\u2013100) dat de complete financi\u00eble gezondheid weergeeft. Combineer: spaarquote, schuldratio, noodfonds-dekking, FIRE-voortgang, portefeuille-diversificatie, budget-discipline. De veerkracht_score widget bestaat al (0\u2013100 resilience) \u2014 maar een bredere \u201cfinancial health score\u201d die ook gedrag en planning meeneemt ontbreekt. Toon trend over tijd.',
    werking:
      'E\u00e9n getal van 0-100 dat de complete financi\u00eble gezondheid samenvat, opgebouwd uit 6 pilaren: (1) Spaarquote (hoe goed spaar je?), (2) Schuldratio (schulden vs vermogen), (3) Noodfonds (maanden dekking), (4) FIRE-voortgang (% van doel), (5) Diversificatie (portefeuille spreiding), (6) Budget-discipline (% binnen budget). Elke pilaar is een sub-score 0-100. Toon trend over maanden en vergelijk met vorige maand. Pilaar-drill-down toont wat de score omhoog kan brengen.',
    afhankelijkheden: [
      'lib/horizon-data.ts (computeResilienceScore \u2014 0-100, bestaat al maar meet alleen veerkracht)',
      'lib/core-metrics.ts (net worth, savings rate, freedom percentage)',
      'budget alerts systeem',
      'holdings voor diversificatie',
      'noodfonds widget logica',
      'net_worth_snapshots voor trend',
    ],
    technisch:
      'Nieuwe lib/financial-health.ts: computeHealthScore(data: DashboardData) \u2192 { total: number, pillars: Pillar[], trend: number[] }. Elke pilaar heeft eigen weging (bijv. spaarquote 25%, schuld 20%, noodfonds 15%, FIRE 20%, diversificatie 10%, budget 10%). Score-algoritme: per pilaar een curve (bijv. spaarquote 30%+ = score 100, 20% = 80, 10% = 50, 0% = 0). Totaalscore is gewogen gemiddelde. Nieuwe widget gezondheids_score (half-size) met radar/spider chart voor de 6 pilaren. Snapshot monthly via bestaand cron.',
    waardeGebruiker:
      'E\u00e9n blik vertelt je hoe je ervoor staat \u2014 geen 10 dashboards nodig. Gamification-element: score verbeteren is motiverend. De trend toont vooruitgang over tijd, zelfs als absolute getallen nog laag zijn. Beginner-vriendelijk: iemand met \u20ac500 spaargeld kan toch een score van 60 hebben als de ratio\u2019s goed zijn.',
    aandachtspunten: [
      'Weging van pilaren is subjectief \u2014 wat is \u201cgezond\u201d?',
      'Verschillende levensfasen hebben verschillende normen (student vs gezin vs pre-pensioen).',
      'Soevereiniteitsniveaus overlappen deels \u2014 onderscheid duidelijk maken.',
      'Score moet motiveren, niet ontmoedigen \u2014 framing als \u201cgroeipad\u201d niet als \u201crapport cijfer\u201d.',
      'NIBUD-normen als basis voor wat \u201cgezond\u201d is in NL context.',
    ],
    competitors:
      'Boldin (Financial Wellness Score \u2014 gelanceerd 2025), Credit Karma (credit score \u2014 anders)',
    priority: 'Hoog',
  },
  {
    nr: 6,
    name: 'Spending Guardrails (Dynamische Onttrekkingsstrategie)',
    description:
      'Hoeveel kan een pensioenado veilig uitgeven? De SWR Monitor widget bestaat al maar is statisch. Spending Guardrails geven dynamische uitgavenlimieten op basis van portefeuillewaarde, marktomstandigheden en persoonlijke situatie. Boldin biedt dit als \u201cSpending Guardrails Insight\u201d \u2014 dit ontbreekt in TriFinity.',
    werking:
      'Dynamische berekening van veilige uitgavenlimieten in de afbouwfase: (1) Guyton-Klinger guardrails: verhoog uitgaven als portefeuille stijgt, verlaag als portefeuille daalt. (2) Vloer en plafond: minimale en maximale jaaruitgaven. (3) CAPE-adjusted SWR: veilige onttrekking op basis van marktwaardering. (4) Variabele withdrawal rates per levensfase. (5) Dashboard: \u201cDit jaar kun je veilig \u20acX uitgeven. Je vloer is \u20acY, je plafond is \u20acZ.\u201d',
    afhankelijkheden: [
      'lib/fire-simulation.ts (runSimulation, SimRow)',
      'lib/horizon-data.ts (NL_SWR, computeFireProjection)',
      'components/widgets/widget-renderer.tsx (swr_monitor widget)',
      'profiles.fire_end_strategy',
      'profiles.expected_return',
    ],
    technisch:
      'Nieuwe lib/spending-guardrails.ts: computeGuardrails(portfolio, age, strategy, marketConditions) \u2192 { safeSpending: number, floor: number, ceiling: number, currentSWR: number, adjustment: \u2018increase\u2019 | \u2018decrease\u2019 | \u2018hold\u2019 }. Guyton-Klinger regels: als portefeuille > 120% van startwaarde \u2192 spending +10%, als < 80% \u2192 spending -10%. CAPE-based SWR: gebruik historische CAPE ratio\u2019s voor marktwaardering. Uitbreiding van bestaande swr_monitor widget of nieuwe widget spending_guardrails. Integratie met What-If scenario\u2019s.',
    waardeGebruiker:
      'De grootste angst van pensioenado\u2019s is \u201cte veel uitgeven en door je geld heen raken\u201d. Guardrails geven concrete, dynamische grenzen: \u201cdit jaar mag je X besteden\u201d. Vermindert angst en voorkomt zowel te zuinig als te royaal leven in pensioen.',
    aandachtspunten: [
      'Guyton-Klinger is Amerikaans model \u2014 NL-context (AOW als vloer) aanpassen.',
      'Marktwaardering (CAPE) data nodig \u2014 historische data of API.',
      'Te conservatieve guardrails leiden tot onnodig zuinig leven.',
      'Communicatie: \u201cdit is een richtlijn, geen garantie.\u201d',
      'Integratie met bestaande fire_end_strategy (perpetual/legacy/deplete).',
    ],
    competitors:
      'Boldin (Spending Guardrails Insight \u2014 2025), ProjectionLab (variable spending)',
    priority: 'Hoog',
  },
  {
    nr: 7,
    name: 'Gestapelde Vermogensgrafiek (Stacked Bar Chart)',
    description:
      'Boldin toont vermogensopbouw als gestapelde kolommen: beleggingen, pensioen, AOW, vastgoed, spaargeld als aparte lagen. TriFinity heeft nu alleen een lijngrafiek (SimChart) die het totale vermogenspad toont. Voeg een gestapelde kolomweergave toe die laat zien HOE het vermogen is opgebouwd per bron, niet alleen het totaal. Dit geeft de gebruiker inzicht in de samenstelling van het vermogen op elk moment in de toekomst.',
    werking:
      'Een gestapelde kolomgrafiek (stacked bar chart) die per jaar de vermogenssamenstelling toont als aparte lagen: beleggingen (ETF/aandelen), pensioenvermogen (werkgever + eigen opbouw), AOW-rechten (gekapitaliseerd), vastgoed (WOZ-waarde minus restschuld), spaargeld, crypto, overige bezittingen. De Y-as toont het totale vermogen, elke laag toont de bijdrage per bron. Hover-tooltip met absolute bedragen en percentages per laag. Tijdas loopt van nu tot beoogde FIRE-leeftijd + 30 jaar. Weergave als tab/toggle naast bestaande SimChart ("Vermogenspad" vs "Vermogensopbouw"). Schulden als negatieve laag onder de nullijn.',
    afhankelijkheden: [
      'components/app/horizon/sim-chart.tsx (bestaande SimChart)',
      'lib/fire-simulation.ts (SimRow data)',
      'lib/horizon-data.ts (computeFireProjection, vermogenscategorie\u00ebn)',
      'assets tabel (bezittingen per type)',
      'holdings tabel (beleggingsportefeuille)',
      'debts tabel (schulden als negatieve laag)',
    ],
    technisch:
      'Data deels beschikbaar via SimRow (savings, growth), maar vermogenscategorie\u00ebn moeten uitgesplitst worden. Nieuwe helper: splitVermogenPerBron(simRows, assets, holdings) \u2192 StackedRow[]. Stacked bar chart component (Recharts StackedBarChart of custom SVG). Integratie als toggle-modus op Toekomst naast bestaande SimChart. Categorie\u00ebn afleiden uit asset.type en holding.asset_class. Pensioen apart berekenen op basis van UPO-data of handmatige invoer. AOW gekapitaliseerd als contante waarde van toekomstige uitkeringen.',
    waardeGebruiker:
      'Beantwoordt de vraag: "Waaruit bestaat mijn vermogen straks?" De huidige lijngrafiek toont alleen het totaal \u2014 deze visualisatie laat zien dat bijv. 40% uit beleggingen komt, 30% uit pensioen, 20% uit vastgoed. Helpt bij diversificatie-beslissingen en geeft vertrouwen dat het vermogen over meerdere bronnen verspreid is.',
    aandachtspunten: [
      'Vermogenscategorie\u00ebn moeten consistent zijn met de assets-pagina classificatie.',
      'Pensioenwaarde is onzeker \u2014 duidelijk markeren als schatting.',
      'AOW kapitaliseren vereist een disconteringsvoet \u2014 maak aannames expliciet.',
      'Te veel categorie\u00ebn maken de grafiek onleesbaar \u2014 max 6-7 lagen.',
      'Vastgoedwaarde fluctueert \u2014 gebruik laatste check-in of WOZ.',
      'Kleurcodering consistent houden met de rest van de app (module kleuren).',
    ],
    competitors:
      'Boldin (Stacked Asset Allocation Charts \u2014 hun kernvisualitatie), ProjectionLab (portfolio composition over time)',
    priority: 'Hoog',
  },
  {
    nr: 8,
    name: 'Inkomsten vs. Uitgaven Projectie Chart',
    description:
      'Boldin toont verwachte jaarlijkse inkomsten (salaris, pensioen, AOW, beleggingsinkomen) vs. jaarlijkse uitgaven over de gehele levenslijn. Cruciaal inzicht: "wanneer overtreffen mijn passieve inkomsten mijn uitgaven?" Dit is de visuele representatie van het FIRE-kruispunt \u2014 het moment waarop je financieel vrij bent. TriFinity berekent dit al intern maar visualiseert het niet expliciet als inkomsten vs. uitgaven over tijd.',
    werking:
      'Twee-lagen grafiek die per jaar toont: (1) Gestapelde inkomstenbronnen als kolommen: salaris/freelance (zolang werkend), AOW-uitkering (vanaf AOW-leeftijd), werkgeverspensioen (vanaf pensioenleeftijd), beleggingsinkomen/onttrekking, passief inkomen (huur, dividend), overig. (2) Uitgavenlijn: totale jaarlijkse uitgaven ge\u00efndexeerd voor inflatie. Het FIRE-kruispunt is waar de inkomstenkolommen de uitgavenlijn overtreffen zonder salaris-component \u2014 visueel gemarkeerd met een prominente indicator. Hover per jaar toont: totale inkomsten, totale uitgaven, surplus/tekort, en samenstelling per bron als percentage.',
    afhankelijkheden: [
      'lib/fire-simulation.ts (SimRow: withdrawal, cashflowNet, savings)',
      'lib/horizon-data.ts (computeFireProjection, computeFireRange)',
      'lib/fire-simulation.ts (lifeEventsToCashflows \u2014 inkomensbronnen)',
      'profiles (pensioenleeftijd, AOW-leeftijd, salaris)',
      'budgets (huidige uitgaven als basis voor projectie)',
      'app/api/pension/parse (UPO PDF parsing voor pensioeninkomen)',
    ],
    technisch:
      'Cashflows moeten per bron opgesplitst worden \u2014 nu opgeteld in cashflowNet. Nieuwe helper: splitInkomstenPerBron(simRows, lifeEvents, profile) \u2192 IncomeBreakdownRow[]. Per bron-type: salary (tot FIRE/pensioen), aow (vanaf AOW-leeftijd), pension (vanaf pensioenleeftijd), withdrawal (onttrekking uit vermogen), passive (dividend, huur), other (levensgebeurtenissen). Uitgavenlijn: baseer op huidige jaaruitgaven \u00d7 (1 + inflatie)^n, aangepast voor levensgebeurtenissen (kind, hypotheekvrij). Chart als Recharts ComposedChart (StackedBar + Line) of custom SVG. FIRE-kruispunt markering: verticale lijn + label "Financieel vrij" op het jaar waar passieve inkomsten \u2265 uitgaven.',
    waardeGebruiker:
      'De meest intu\u00eftieve visualisatie van financi\u00eble vrijheid: "wanneer verdien ik genoeg zonder te werken?" Boldin beschouwt dit als hun vlaggenschip-grafiek. Geeft direct inzicht in de transitie van actief naar passief inkomen. Motiveert: je ziet de kruispunt-lijn dichterbij komen naarmate je spaart en belegt.',
    aandachtspunten: [
      'Cashflows moeten per bron opgesplitst worden \u2014 nu opgeteld in cashflowNet.',
      'Werkgeverspensioen kan variabele opbouw hebben (middelloon vs eindloon).',
      'Gebruikers zonder UPO upload moeten handmatig pensioenbedrag kunnen invoeren.',
      'AOW-leeftijd kan politiek wijzigen \u2014 actueel houden.',
      'Partnersituatie (AOW enkel vs samenwonend) correct meenemen.',
      'Inflatie-aanpassing van uitgaven is een aanname \u2014 maak expliciet.',
    ],
    competitors:
      'Boldin (Lifetime Income vs Expenses Projection \u2014 hun vlaggenschip), Empower (Cash Flow Planner)',
    priority: 'Hoog',
  },
]

const FASE_B_FEATURES: readonly Feature[] = [
  {
    nr: 7,
    name: 'Vermogensaanwasbelasting 2027 Simulator',
    description:
      'Nederland schakelt per 2027 over van forfaitair rendement naar belasting op werkelijk rendement (vermogensaanwasbelasting). Geen enkele app of tool bereidt gebruikers hierop voor. Bouw een simulator die toont: \u201cOnder het huidige systeem betaal je \u20acX, onder het nieuwe systeem \u20acY \u2014 dit is het effect op je FIRE-datum.\u201d Dit is een first-mover kans met directe PR-waarde.',
    werking:
      'Side-by-side vergelijking van het huidige Box 3 systeem (forfaitair rendement) met het geplande nieuwe systeem (werkelijk rendement). Gebruiker ziet: \u201cIn 2026 betaal je \u20acX aan Box 3. Onder het nieuwe systeem zou je \u20acY betalen.\u201d Inclusief scenario\u2019s: bull market (hoog werkelijk rendement \u2192 meer belasting), bear market (laag/negatief rendement \u2192 minder belasting), en het effect op de FIRE-datum in elk scenario. Tijdlijn die toont wanneer het nieuwe systeem voordeliger is.',
    afhankelijkheden: [
      'lib/box3-data.ts (huidig Box 3 berekening \u2014 volledig)',
      'lib/box3-holdings.ts (Box 3 per portefeuille)',
      'holdings tabel (werkelijke rendementen)',
      'lib/fire-simulation.ts (FIRE impact)',
      'lib/horizon-data.ts (scenario berekeningen)',
      'net_worth_snapshots (historisch rendement als proxy)',
    ],
    technisch:
      'Nieuwe lib/box3-aanwas.ts met het nieuwe belastingmodel. Kernverschil: huidig systeem belast fictief rendement (sparen 0.36%, beleggen 6.04% in 2025), nieuw systeem belast werkelijk rendement tegen vast tarief (~36%). Nodig: computeAanwasBelasting(holdings, actualReturns) \u2192 number. Vergelijkingsmodule: compareBox3Systems(portfolio, scenarios) \u2192 Comparison. Nieuwe pagina /horizon/box3-2027 of modal op bestaande belasting pagina. Widget box3_2027 (quarter-size) met samenvatting.',
    waardeGebruiker:
      'Niemand bereidt gebruikers voor op deze grote belastingwijziging. Early adopters die dit begrijpen kunnen hun portefeuille optimaliseren (bijv. meer naar spaarrekening als rendement laag is). PR-waarde: \u201cTriFinity is de eerste app die je laat zien wat de vermogensaanwasbelasting voor jou betekent.\u201d Direct relevant voor 2M+ Nederlanders met Box 3 vermogen.',
    aandachtspunten: [
      'Wetgeving is nog niet definitief \u2014 disclaimer nodig.',
      'Werkelijk rendement tracking vereist betrouwbare historische data per holding.',
      'Politieke wijzigingen kunnen model invalideren.',
      'Complexiteit: ongerealiseerde winsten, verliesverrekening, overgangsrecht.',
      'Start simpel met grove berekening, verfijn later.',
    ],
    competitors: 'Niemand \u2014 er bestaan alleen basis webtools van de Belastingdienst',
    priority: 'Hoog',
  },
  {
    nr: 8,
    name: 'Hypotheek: Aflossen vs Beleggen',
    description:
      'De grootste financi\u00eble vraag voor Nederlandse huishoudens: \u201cmoet ik extra aflossen op mijn hypotheek of dat geld beleggen?\u201d Bouw een vergelijkingsmodule die beide scenario\u2019s doorrekent inclusief hypotheekrenteaftrek, Box 3 impact, risico, en effect op FIRE-datum. Schulden- en beleggingsmodule bestaan al \u2014 de vergelijking ontbreekt.',
    werking:
      'Interactieve vergelijking: \u201cIk heb \u20ac500/maand extra. Wat als ik dit gebruik om extra af te lossen op mijn hypotheek vs beleggen?\u201d Twee scenario\u2019s naast elkaar met dezelfde tijdshorizon. Toont: eindvermogen, risiconiveau, belastingeffect (hypotheekrenteaftrek verlies bij aflossing, Box 3 impact bij beleggen), totale rentekosten bespaard, en \u2014 cruciaal \u2014 het effect op de FIRE-datum. Sliders voor extra bedrag, rente, verwacht rendement.',
    afhankelijkheden: [
      'app/(app)/core/debts/page.tsx (schulden module \u2014 hypotheek type bestaat)',
      'lib/fire-simulation.ts',
      'lib/horizon-data.ts',
      'lib/box3-data.ts (Box 3 impact van extra beleggingen)',
      'profiles (huidige hypotheek rente, type: annu\u00efteit/lineair/aflossingsvrij)',
      'holdings module voor beleggingsscenario',
    ],
    technisch:
      'Nieuwe lib/mortgage-optimizer.ts: compareMortgageVsInvest(params) \u2192 { aflossing: Scenario, beleggen: Scenario, breakeven: number }. Aflossingsscenario: bereken restschuld, totale rente bespaard, verlies hypotheekrenteaftrek (marginaal tarief \u00d7 rente). Beleggingsscenario: bereken verwacht eindvermogen (Monte Carlo), Box 3 belasting over groei. Breakeven: bij welk rendement is beleggen voordeliger dan aflossen? Nieuwe pagina /horizon/hypotheek of modal in Toekomst. Integratie met What-If planner.',
    waardeGebruiker:
      'De #1 financi\u00eble vraag in Nederland \u2014 iedereen met een hypotheek worstelt hiermee. Adviseurs rekenen \u20ac200+ voor dit advies. TriFinity kan dit gratis bieden met de data die er al is. Direct actionable: \u201cBij jouw hypotheekrente van 3.2% en verwacht rendement van 7% is beleggen \u20acX voordeliger over 20 jaar.\u201d',
    aandachtspunten: [
      'Geen financieel advies \u2014 duidelijke disclaimer.',
      'Hypotheekrenteaftrek regels zijn complex (eigenwoningforfait, maximale aftrekperiode, Hillen-regeling uitfasering).',
      'Risicovergelijking is niet eerlijk: aflossen is risicovrij, beleggen niet.',
      'Emotionele factor: schuldvrij zijn heeft psychologische waarde die niet in euro\u2019s uit te drukken is.',
      'Partnersituatie (gezamenlijke hypotheek) meenemen.',
    ],
    competitors:
      'Boldin (real estate modeling), Wealthfront (home purchase planning), diverse NL hypotheek-vergelijkers (maar zonder FIRE-integratie)',
    priority: 'Hoog',
  },
  {
    nr: 9,
    name: 'Toeslagen Simulator',
    description:
      'Veel Nederlanders ontvangen huurtoeslag, zorgtoeslag of kindgebonden budget. Vermogensgroei kan leiden tot verlies van toeslagen \u2014 een verborgen \u201cbelasting\u201d die niemand berekent. Simuleer: \u201cBij \u20acX vermogen verlies je \u20acY aan toeslagen per jaar.\u201d Dit helpt gebruikers bij de timing van vermogensopbouw en de beslissing of snel sparen altijd slim is.',
    werking:
      'Simuleer het effect van vermogensgroei op toeslagen. Vier toeslagen gemodelleerd: zorgtoeslag, huurtoeslag, kindgebonden budget, kinderopvangtoeslag. Inputvelden: verwacht vermogen op peildatum, inkomen, gezinssituatie. Output: \u201cBij \u20acX vermogen verlies je \u20acY aan zorgtoeslag en \u20acZ aan huurtoeslag per jaar \u2014 netto-effect op je vrijheidstijd: A maanden.\u201d Waarschuwing wanneer vermogensdrempel genaderd wordt. Toon de \u201ctoeslagen-klif\u201d: het punt waarop \u20ac1 extra vermogen honderden euro\u2019s aan toeslagen kost.',
    afhankelijkheden: [
      'profiles tabel (huishoudtype, kinderen)',
      'lib/format.ts (formatCurrency, calculateFreedomTime)',
      'lib/fire-simulation.ts (integratie in FIRE-projectie)',
      'asset totalen uit dashboard data',
      'inkomen data uit budgets',
    ],
    technisch:
      'Nieuwe lib/toeslagen.ts met: berekenZorgtoeslag(inkomen, vermogen, partner) \u2192 number, berekenHuurtoeslag(inkomen, vermogen, huur, leeftijd, gezin) \u2192 number, berekenKindgebondenBudget(inkomen, kinderen) \u2192 number, berekenToeslagenKlif(currentVermogen, inkomen, gezin) \u2192 KlifAnalyse. Toeslagengrenzen als configureerbare constanten (jaarlijks bijwerken). Nieuwe pagina /core/belasting/toeslagen of sectie op bestaande belasting pagina. Widget toeslagen_impact (quarter-size).',
    waardeGebruiker:
      'Verborgen \u201cbelasting\u201d die de meeste mensen niet berekenen. Kan leiden tot onverwachte terugvorderingen. Vooral relevant voor starters en jonge gezinnen die net beginnen met vermogensopbouw. Helpt bij timing-beslissingen: \u201cIs het slim om dit jaar \u20ac5.000 extra te sparen als ik daardoor \u20ac2.000 aan toeslagen verlies?\u201d',
    aandachtspunten: [
      'Toeslagen-regels wijzigen jaarlijks \u2014 onderhoudslast.',
      'Vermogenstoets verschilt per toeslag.',
      'Huurtoeslag kent complexe regels (passend toewijzen, huurgrens).',
      'Niet iedereen ontvangt toeslagen \u2014 relevantie-check nodig.',
      'Politiek gevoelig onderwerp \u2014 neutraal presenteren.',
      'Disclaimer: \u201cDit is een indicatie, niet een offici\u00eble berekening.\u201d',
    ],
    competitors: 'Niemand \u2014 alleen losse webtools van toeslagen.nl',
    priority: 'Middel',
  },
  {
    nr: 10,
    name: 'Zorgkosten Planning',
    description:
      'NL-specifiek: eigen risico optimalisatie (\u20ac385 vs \u20ac885), aanvullende verzekering kosten-baten analyse, zorgtoeslag drempelberekening. Jaarlijks terugkerende keuze die veel Nederlanders verkeerd maken. Integreer met de budget-module (categorie zorg) en de check-in.',
    werking:
      'Jaarlijkse zorgverzekering-optimizer: (1) Eigen risico analyse \u2014 bij hoeveel zorggebruik is \u20ac885 eigen risico voordeliger dan \u20ac385? Breakeven-punt berekenen op basis van historisch zorggebruik. (2) Aanvullende verzekering kosten-baten \u2014 hoeveel kost de aanvullende per jaar vs verwachte claims. (3) Zorgtoeslag drempel \u2014 effect van inkomen/vermogen op recht op zorgtoeslag. (4) Maandelijkse premie vergelijking (integratie met budget-categorie zorg).',
    afhankelijkheden: [
      'budgets tabel (categorie zorg/gezondheid)',
      'transacties (historische zorguitgaven)',
      'lib/toeslagen.ts (als feature #8 gebouwd)',
      'profiles (leeftijd, gezinssituatie)',
      'check-in systeem (jaarlijkse reminder in november)',
    ],
    technisch:
      'Nieuwe lib/zorgkosten.ts: berekenEigenRisicoBreakeven(historischZorggebruik) \u2192 { breakeven: number, advies: \'laag\' | \'hoog\' }, analyseAanvullend(premie, verwachteClaims) \u2192 KostenBaten. Zorggebruik afleiden uit transacties met categorie \u201cgezondheid/zorg\u201d minus premie. Reminder-systeem: notificatie in november \u201cTijd om je zorgverzekering te reviewen \u2014 bekijk je analyse.\u201d Pagina /core/belasting/zorgkosten of sectie binnen instellingen.',
    waardeGebruiker:
      '85% van de Nederlanders maakt een suboptimale eigen-risico keuze (bron: Zorgwijzer). Gemiddelde besparing bij juiste keuze: \u20ac100-300/jaar. Jaarlijks terugkerende waarde \u2014 gebruiker komt elk jaar terug. Combineert goed met check-in systeem.',
    aandachtspunten: [
      'Historische zorguitgaven zijn privacygevoelig.',
      'Zorggebruik is onvoorspelbaar (ongeluk, ziekte).',
      'Premies vari\u00ebren per verzekeraar \u2014 geen vergelijker bouwen, alleen eigen keuze optimaliseren.',
      'Niet-medisch advies disclaimer.',
      'Collectieve verzekeringen via werkgever meenemen.',
    ],
    competitors:
      'Boldin (US healthcare/Medicare \u2014 niet NL), Financieel Fit (verzekeringsfocus maar geen planning)',
    priority: 'Middel',
  },
  {
    nr: 11,
    name: 'Box 2 \u2194 Box 3 Optimalisatie (DGA Planning)',
    description:
      'Voor DGA\u2019s/ondernemers: wanneer dividend uitkeren uit de BV? Hoeveel in Box 2 laten vs overhevelen naar priv\u00e9 (Box 3)? Optimale timing van BV-liquidatie bij FIRE. De Box 2 module bestaat al \u2014 maar de strategische planning \u201cwanneer en hoeveel\u201d ontbreekt. Relevant voor ~400.000 DGA\u2019s in Nederland.',
    werking:
      'Planning tool voor DGA\u2019s: \u201cIk heb \u20ac200.000 in mijn BV. Wanneer en hoeveel moet ik als dividend uitkeren?\u201d Simuleer meerdere strategie\u00ebn: (a) alles nu uitkeren, (b) gespreid over X jaar, (c) BV-liquidatie bij FIRE. Per strategie: Box 2 belasting, Box 3 impact na uitkering, DGA-lening impact (excessief lenen regeling), en netto-effect op FIRE-datum. Tijdlijn met optimale uitkeer-momenten.',
    afhankelijkheden: [
      'lib/box2-data.ts (Box 2 berekening \u2014 bestaat, dual bracket 24.5%/33%)',
      'lib/box3-data.ts (Box 3 impact na uitkering)',
      'assets tabel (type deelneming met subtypes BV/startup)',
      'lib/fire-simulation.ts (FIRE impact)',
      'schulden tabel (type dga_schuld)',
    ],
    technisch:
      'Nieuwe lib/dga-optimizer.ts: simulateDividendStrategy(bvVermogen, strategies, taxParams) \u2192 StrategyResult[]. Strategy types: lump_sum, annual_spread, fire_liquidation, minimal_salary. Per strategy berekenen: Box 2 belasting per jaar (24.5% tot \u20ac67.000, 33% daarboven), Box 3 impact van ontvangen vermogen, DGA-lening toets (max \u20ac500.000 norm 2024). Visualisatie: gestapeld staafdiagram per jaar met netto-ontvangst na belasting. Nieuwe pagina /horizon/dga of uitbreiding van bestaande Box 2 sectie.',
    waardeGebruiker:
      '~400.000 DGA\u2019s in Nederland hebben dit vraagstuk. Fiscalisten rekenen \u20ac200-500/uur voor dit advies. Een DGA met \u20ac500.000 in de BV kan \u20ac10.000-50.000 besparen door optimale timing. Extreem relevant voor FIRE-strijdende ondernemers.',
    aandachtspunten: [
      'Geen fiscaal advies \u2014 disclaimer essentieel.',
      'Regels wijzigen frequent (DGA-lening regeling, tarief wijzigingen).',
      'AB-verlies verrekening is complex.',
      'Gebruikersaantallen DGA\u2019s klein maar waarde per gebruiker hoog \u2014 overweeg als premium feature.',
      'BV kan ook andere activiteiten hebben (vastgoed, pensioen-BV) \u2014 vereenvoudigen tot vermogenscomponent.',
    ],
    competitors: 'Niemand \u2014 fiscalisten doen dit handmatig voor \u20ac200+/uur',
    priority: 'Middel',
  },
  {
    nr: 12,
    name: 'Vermogensopbouw per Bron (Area Chart)',
    description:
      'Gestapeld area chart dat toont hoe vermogen over tijd verschuift van arbeidsgerelateerd (spaargeld uit salaris) naar passief (beleggingsrendement, pensioen, AOW). Toont de "crossover" wanneer passief inkomen > actief inkomen. Boldin visualiseert dit als een vloeiend area chart \u2014 TriFinity mist deze "bron-transitie" visualisatie die laat zien hoe de samenstelling van vermogensgroei verandert naarmate je ouder wordt.',
    werking:
      'Gestapeld area chart (stacked area) met op de X-as de leeftijd/jaren en op de Y-as de cumulatieve vermogensgroei uitgesplitst per bron: (1) Arbeidsinleg: cumulatieve spaargeld uit netto-inkomen, (2) Beleggingsrendement: cumulatief rendement op portefeuille (compound growth), (3) Pensioenopbouw: geschatte pensioenwaarde over tijd, (4) Vastgoedwaardestijging: cumulatieve waardegroei van onroerend goed, (5) Overig: erfenissen, schenkingen, eenmalige inkomsten. Het crossover-punt \u2014 waar de passieve bronnen (rendement + pensioen + vastgoed) de actieve bron (arbeidsinleg) overtreffen \u2014 wordt prominent gemarkeerd. Dit laat visueel zien: "vanaf je 45e groeit je vermogen harder door rendement dan door sparen."',
    afhankelijkheden: [
      'lib/fire-simulation.ts (SimRow: savings, growth, cashflowNet)',
      'lib/horizon-data.ts (computeFireProjection)',
      'net_worth_snapshots (historische vermogensgroei)',
      'assets tabel (per type: belegging, vastgoed, pensioen)',
      'holdings tabel (rendement tracking)',
      'profiles (leeftijd, pensioenleeftijd)',
    ],
    technisch:
      'Nieuwe helper: computeVermogensgroeiPerBron(simRows, assets, profile) \u2192 AreaRow[]. Per jaar cumulatieve bijdrage per bron berekenen: arbeidsinleg = sum(netto savings), rendement = sum(portfolio growth), pensioen = sum(pension accrual), vastgoed = sum(property appreciation). Area chart component (Recharts AreaChart met stackId of custom SVG). Crossover-punt berekenen: het jaar waar passieve bronnen > arbeidsinleg. Hover-tooltip met absolute bedragen en percentages per bron. Integratie op Toekomst als extra tab/visualisatie.',
    waardeGebruiker:
      'Maakt het "sneeuwbaleffect" van compound interest visueel: je ziet hoe beleggingsrendement over tijd de dominante bron van vermogensgroei wordt. Motiveert langetermijnbeleggers \u2014 "elke euro die ik nu beleg, groeit over 20 jaar tot vier euro." Toont waarom vroeg beginnen zo belangrijk is.',
    aandachtspunten: [
      'Onderscheid arbeidsinleg vs rendement vereist tracking van stortingen vs groei \u2014 niet altijd beschikbaar.',
      'Pensioenopbouw is een schatting \u2014 markeer als zodanig.',
      'Vastgoedwaardestijging is onzeker \u2014 gebruik conservatieve aanname.',
      'Te veel bronnen maken het area chart onoverzichtelijk \u2014 max 5 lagen.',
      'Historische data (net_worth_snapshots) kan gaten bevatten bij nieuwe gebruikers.',
    ],
    competitors:
      'Boldin (Wealth Composition Area Chart), ProjectionLab (portfolio growth attribution)',
    priority: 'Middel',
  },
  {
    nr: 13,
    name: 'Withdrawal Strategy Visualisatie',
    description:
      'Boldin toont expliciet de onttrekkingsstrategie: uit welke bronnen wordt wanneer geput? Eerst eigen vermogen (bridge-periode), dan pensioen erbij, dan AOW erbij. TriFinity berekent dit al intern via fire_end_strategy en de SimChart, maar visualiseert niet expliciet welke pot je wanneer aanspreekt. Deze visualisatie geeft de gebruiker inzicht in de optimale volgorde van onttrekken.',
    werking:
      'Tijdlijn-visualisatie die per levensfase toont uit welke bronnen wordt geput: (1) Bridge-periode (FIRE \u2192 pensioenleeftijd): onttrekking uit eigen beleggingsportefeuille. (2) Pensioen-fase (pensioenleeftijd \u2192 AOW): beleggingen + werkgeverspensioen. (3) AOW-fase (vanaf AOW-leeftijd): beleggingen + pensioen + AOW. (4) Latere fase (80+): mogelijk uitputting, erfenis of aanpassing. Per fase: jaarlijkse onttrekking per bron als gestapelde balk, restant vermogen per pot, en uitputtingsdatum per bron. "Waterval" visualisatie: je ziet hoe elke nieuwe inkomstenbron het onttrekkingsbedrag uit beleggingen verlaagt. Waarschuwing als een pot eerder opraakt dan verwacht.',
    afhankelijkheden: [
      'lib/fire-simulation.ts (runSimulation, SimRow)',
      'lib/horizon-data.ts (computeFireProjection, computeFireRange)',
      'profiles.fire_end_strategy (perpetual/legacy/deplete)',
      'profiles.retirement_age, profiles.aow_age',
      'app/api/pension/parse (pensioeninkomen)',
      'lib/fire-simulation.ts (lifeEventsToCashflows)',
    ],
    technisch:
      'Nieuwe helper: computeWithdrawalStrategy(simRows, profile, pensionIncome, aowIncome) \u2192 WithdrawalPhase[]. Per fase: bronnen met bedragen, start/eindjaar, restant per pot. Visualisatie als horizontale tijdlijn met gestapelde bronnen per fase (Gantt-chart stijl). Alternatief: waterval-diagram dat toont hoe elke bron de druk op beleggingen verlaagt. Integratie op Toekomst, eventueel als onderdeel van het Onttrekkingsmodal (bestaand). SimRow bevat al withdrawal en cashflowNet \u2014 deze opsplitsen per bron voor de visualisatie.',
    waardeGebruiker:
      'Beantwoordt de cruciale vraag: "Hoe overleef ik de bridge-periode tussen FIRE en pensioen?" Laat zien dat FIRE niet betekent dat al het geld uit \u00e9\u00e9n pot komt \u2014 pensioen en AOW nemen het over. Vermindert angst: "Ik hoef niet alles zelf te hebben, want op mijn 67e komt AOW erbij." Helpt bij het bepalen van het optimale FIRE-moment.',
    aandachtspunten: [
      'Bridge-periode is het meest kwetsbare stuk \u2014 prominente waarschuwing als beleggingen te snel opraken.',
      'Pensioeninkomen is onzeker (indexatie, kortingen) \u2014 scenario-analyse nodig.',
      'AOW-leeftijd kan politiek wijzigen.',
      'Partnersituatie: dubbel AOW, gezamenlijk pensioen.',
      'fire_end_strategy (perpetual vs deplete) be\u00efnvloedt de visualisatie sterk.',
      'Niet alle gebruikers hebben pensioendata \u2014 graceful degradation naar schatting of handmatige invoer.',
    ],
    competitors:
      'Boldin (Withdrawal Strategy Planner \u2014 expliciet per bron), ProjectionLab (income source timeline)',
    priority: 'Middel',
  },
]

const FASE_C_FEATURES: readonly Feature[] = [
  {
    nr: 11,
    name: 'Cashflow Forecasting (30/60/90 dagen)',
    description:
      'Vooruitkijkend saldo: wanneer worden welke rekeningen afgeschreven, wanneer komt salaris, wat is het verwachte saldo over 30/60/90 dagen? Gebruik recurring transaction detection (bestaat al) om een voorspelling te bouwen. Waarschuw bij verwachte negatieve saldi. Monarch en Simplifi bieden dit \u2014 het is een \u201csticky\u201d feature die dagelijks gebruik stimuleert.',
    werking:
      'Visueel overzicht van verwachte inkomsten en uitgaven voor de komende 30, 60 en 90 dagen. Tijdlijn toont: verwacht saldo per dag, geplande afschrijvingen (huur, hypotheek, verzekeringen, abonnementen), verwachte inkomsten (salaris, toeslagen), en eenmalige geplande uitgaven. Waarschuwing bij verwacht negatief saldo: \u201cOp 15 maart zakt je saldo naar -\u20ac200 \u2014 plan nu een buffer.\u201d',
    afhankelijkheden: [
      'lib/recurring-detection.ts (bestaat \u2014 detecteert terugkerende patronen)',
      'lib/budget-forecast.ts (bestaat \u2014 budget voorspelling)',
      'transacties tabel (historische patronen)',
      'bank_accounts (huidige saldi)',
      'lib/spending-patterns.ts (seizoenspatronen)',
    ],
    technisch:
      'Nieuwe lib/cashflow-forecast.ts: forecastCashflow(accounts, recurring, scheduled, days) \u2192 ForecastDay[]. Per dag: opening saldo + verwachte inkomsten \u2212 verwachte uitgaven = closing saldo. Recurring items uit recurring-detection.ts met confidence > 0.7. Aanvullen met handmatig geplande items (life events, eenmalige uitgaven). Visualisatie: lijn/area chart met saldo over tijd, rode zone bij negatief. Nieuwe widget cashflow_forecast (half-size). Integratie met meldingen: alert bij verwacht negatief saldo.',
    waardeGebruiker:
      'Voorkomt roodstaan en onverwachte tekorten. \u201cSticky\u201d feature die dagelijks gebruik stimuleert. Monarch Money noemt dit hun meest gebruikte feature na de basis budgetting. Vooral waardevol voor huishoudens met variabel inkomen (ZZP, freelance).',
    aandachtspunten: [
      'Nauwkeurigheid hangt af van kwaliteit recurring detection.',
      'Variabele bedragen (energierekening, boodschappen) zijn lastig te voorspellen \u2014 gebruik ranges/confidence.',
      'Eenmalige grote uitgaven (vakantie, reparatie) verstoren het model \u2014 handmatige invoer nodig.',
      'Salarisdatum kan verschuiven (weekend, feestdag).',
      'Performance: forecast berekening moet snel zijn (<100ms).',
    ],
    competitors:
      'Monarch Money (cashflow forecasting), Simplifi (12-maanden forecast), PocketGuard (bill calendar)',
    priority: 'Hoog',
  },
  {
    nr: 12,
    name: 'Besteedbaar Inkomen (\u201cHoeveel kan ik uitgeven?\u201d)',
    description:
      'Een groot getal bovenaan: \u201cJe kunt vandaag nog \u20acX vrij besteden.\u201d Berekend uit: saldo \u2212 gereserveerd voor vaste lasten \u2212 spaardoelen \u2212 buffer. PocketGuard noemt dit \u201cIn My Pocket\u201d en het is hun meest geliefde feature. Simpel maar krachtig \u2014 beantwoordt de #1 vraag die mensen aan hun budget-app stellen.',
    werking:
      'E\u00e9n prominent getal op het dashboard: \u201cJe kunt vandaag nog \u20ac847 vrij besteden deze maand.\u201d Berekening: maandelijks netto-inkomen \u2212 vaste lasten (huur, hypotheek, verzekeringen, abonnementen) \u2212 spaardoelen \u2212 al gedane variabele uitgaven deze maand = vrij besteedbaar. Dagelijkse update. Optioneel: \u201cper dag\u201d weergave: \u201cJe hebt nog \u20ac47/dag tot einde maand.\u201d Kleur-indicatie: groen (>30% budget over), oranje (10-30%), rood (<10%).',
    afhankelijkheden: [
      'lib/budget-forecast.ts (budgetberekeningen)',
      'lib/recurring-detection.ts (vaste lasten detectie)',
      'budgets tabel (maandelijkse limieten)',
      'transacties (al gedane uitgaven)',
      'goals (spaardoelen met maandelijkse target)',
      'bank_accounts (saldi)',
    ],
    technisch:
      'Nieuwe lib/besteedbaar.ts: berekenBesteedbaar(inkomen, vasteLasten, spaardoelen, uitgavenDezeMaand, dagenResterend) \u2192 { bedrag: number, perDag: number, status: \'groen\'|\'oranje\'|\'rood\' }. Vaste lasten = recurring met categorie-hint \'rent\', \'mortgage\', \'insurance\', \'subscription\' + budget-categorie \'vaste lasten\'. Spaardoelen = actieve goals met maandelijkse contribution. Nieuwe widget besteedbaar (mini of quarter-size) \u2014 prominent op dashboard. Optioneel integreren in bestaande quick_glance of netto_resultaat widget.',
    waardeGebruiker:
      'Beantwoordt de #1 vraag die mensen stellen: \u201cHoeveel kan ik uitgeven?\u201d PocketGuard\u2019s \u201cIn My Pocket\u201d is hun meest geliefde feature. Reduceert budget-stress door \u00e9\u00e9n duidelijk getal. Stimuleert bewust uitgeven zonder constant het budget te hoeven checken.',
    aandachtspunten: [
      'Definitie \u201cvrij besteedbaar\u201d is persoonlijk \u2014 wat is een vaste last?',
      'Gebruikers met meerdere rekeningen: optellen of per rekening?',
      'Onregelmatig inkomen (ZZP) maakt berekening lastiger \u2014 gebruik gemiddelde of laat gebruiker invoeren.',
      'Geplande maar nog niet afgeschreven vaste lasten meetellen.',
      'Credit card uitgaven die later afgeschreven worden.',
    ],
    competitors:
      'PocketGuard (\u201cIn My Pocket\u201d / \u201cLeftover\u201d), Simplifi (Spending Plan daily available)',
    priority: 'Hoog',
  },
  {
    nr: 13,
    name: 'Spending Patterns AI',
    description:
      'Machine learning die patronen herkent in uitgaven: seizoenseffecten, lifestyle inflation, categorie-verschuivingen, anomalie\u00ebn. \u201cJe besteedt 30% meer aan boodschappen dan 3 maanden geleden\u201d of \u201cJe horeca-uitgaven stijgen elk kwartaal.\u201d Spending patterns lib bestaat al (lib/spending-patterns.ts) \u2014 activeren en uitbreiden met AI.',
    werking:
      'AI-gestuurde analyse die patronen ontdekt in uitgavengedrag: (1) Seizoenseffecten: \u201cDecember kost je historisch 40% meer \u2014 wil je een reservering instellen?\u201d (2) Lifestyle inflation: \u201cJe variabele uitgaven zijn de afgelopen 6 maanden met 12% gestegen.\u201d (3) Anomalie\u00ebn: \u201cJe boodschappenuitgaven waren deze week \u20ac85 hoger dan gemiddeld.\u201d (4) Categorie-trends: \u201cHoreca +23% vs vorig kwartaal.\u201d (5) Merchant-patronen: \u201cJe besteedt \u20ac180/maand bij Albert Heijn \u2014 dat is meer dan 80% van vergelijkbare huishoudens.\u201d',
    afhankelijkheden: [
      'lib/spending-patterns.ts (bestaat \u2014 basispatronen)',
      'lib/recurring-detection.ts (frequentie-analyse)',
      'transacties (6+ maanden historie nodig)',
      'app/api/ai/chat (AI chat systeem)',
      'briefing systeem (patronen \u2192 briefing cards)',
      'lib/nibud/reference-data.ts (benchmark data)',
    ],
    technisch:
      'Uitbreiden lib/spending-patterns.ts met: detectSeasonality(transactions, months) \u2192 SeasonalPattern[], detectLifestyleInflation(transactions, window) \u2192 InflationTrend, detectAnomalies(transactions, category, sigma) \u2192 Anomaly[]. AI-laag: feed patronen aan Will voor menselijke uitleg en aanbevelingen. Integratie met briefing: patronen als briefing cards (type: \'insight\'). Integratie met voorstellen-systeem: \u201cStel een seizoensbudget in voor december.\u201d Minimum data-vereiste: 3 maanden voor basis, 12 maanden voor seizoenspatronen.',
    waardeGebruiker:
      'Maakt onbewust gedrag zichtbaar. Lifestyle inflation is de grootste vijand van FIRE \u2014 als je het niet meet, kun je het niet stoppen. Seizoensadviezen voorkomen budget-overschrijdingen. Anomalie-detectie vangt fouten op (dubbele afschrijvingen, fraude).',
    aandachtspunten: [
      'Minimaal 3-6 maanden data nodig \u2014 nieuwe gebruikers zien weinig.',
      'False positives bij anomalie\u00ebn (vakantie is geen anomalie).',
      'Privacy: merchant-level analyse alleen lokaal, niet naar AI sturen.',
      'Performance: patronen berekenen over grote transactie-sets kan traag zijn \u2014 cache/batch verwerking.',
      'Niet te veel meldingen genereren \u2014 \u201cnotification fatigue\u201d voorkomen.',
    ],
    competitors: 'Copilot Money (per-user ML model \u2014 best-in-class), Monarch (AI insights)',
    priority: 'Middel',
  },
  {
    nr: 14,
    name: 'Financieel Rapport PDF Export',
    description:
      'Genereer een professioneel PDF-rapport met vermogensoverzicht, budget performance, FIRE-voortgang, en trends. Bruikbaar voor: hypotheekadviseur, financieel planner, partner, of eigen archief. Rapportages module bestaat al \u2014 PDF export toevoegen.',
    werking:
      'Genereer een professioneel PDF-rapport met: (1) Samenvatting: netto vermogen, spaarquote, FIRE-voortgang, gezondheids-score. (2) Vermogensoverzicht: bezittingen, schulden, netto vermogen trend. (3) Budget performance: per categorie, vs vorige periode, vs NIBUD norm. (4) Beleggingsoverzicht: portefeuille allocatie, rendement, kosten. (5) FIRE-projectie: scenario\u2019s, vrijheidstijdlijn, mijlpalen. Beschikbaar als maand-, kwartaal- en jaarrapport. Geoptimaliseerd voor printen en delen.',
    afhankelijkheden: [
      'app/(app)/rapportages/ (rapportages module \u2014 bestaat)',
      'app/api/report/ (balans en budget reports \u2014 bestaan)',
      'alle dashboard data (DashboardData type)',
      'lib/format.ts (formattering)',
      'lib/core-metrics.ts (kerngetallen)',
    ],
    technisch:
      'Twee opties: (a) Server-side PDF generatie met @react-pdf/renderer \u2014 React components die direct PDF renderen. (b) Client-side met html2canvas + jsPDF \u2014 screenshot van bestaande rapportage-pagina\u2019s. Optie (a) is professioneler maar meer werk. Nieuwe API route /api/report/pdf die rapport-data bundelt en PDF streamt. Template in TriFinity huisstijl: editorial design, fonts, module kleuren. Pagina-indeling: cover page, inhoudsopgave, secties met page breaks. Nieuwe knop \u201cDownload PDF\u201d op rapportages pagina.',
    waardeGebruiker:
      'Hypotheekaanvraag: adviseur vraagt om financieel overzicht \u2014 druk af als PDF. Partner overtuigen: \u201cKijk, zo staan we ervoor.\u201d Eigen archief: jaarlijks rapport voor de administratie. Financieel planner: deel je situatie professioneel. Vergroot het \u201cserieuze\u201d gevoel van de app.',
    aandachtspunten: [
      'PDF generatie kan traag zijn \u2014 async verwerken met progress indicator.',
      'Privacy: welke data staat in het PDF? Gebruiker moet kunnen kiezen (zonder schulden, zonder beleggingsdetail etc.).',
      'Bestandsgrootte beperken (<5MB).',
      'Charts moeten als vectorafbeeldingen (SVG) in PDF \u2014 niet als pixels.',
      'Localisatie: alle bedragen in NL notatie.',
      'Watermark met datum/tijd voor versioning.',
    ],
    competitors:
      'Simplifi (tax reports), Boldin (comprehensive reports), Kubera (Excel/ZIP export)',
    priority: 'Middel',
  },
  {
    nr: 15,
    name: 'Community Benchmarks (Anoniem)',
    description:
      'Anonieme, privacy-first vergelijking: \u201cHoe doe ik het vergeleken met andere FIRE-strijders in mijn leeftijdscategorie?\u201d Vergelijk op basis van: spaarquote, FIRE-voortgang, portefeuille-allocatie. NIBUD benchmark bestaat al voor budgetten \u2014 dit is de FIRE-equivalent. Kan starten met aggregated data, geen individuele gegevens delen.',
    werking:
      'Anonieme vergelijking met andere TriFinity-gebruikers in dezelfde levensfase. Benchmarks op: (1) Spaarquote (percentiel: \u201cJe spaarquote van 34% is hoger dan 78% van gebruikers in jouw leeftijdscategorie\u201d), (2) FIRE-voortgang (% van doel), (3) Portefeuille-allocatie (gemiddelde verdeling), (4) Budget-discipline (% binnen budget), (5) Schuldniveau. Cohorten op basis van leeftijd + huishoudtype + inkomenscategorie. Geen individuele data \u2014 alleen aggregates (mediaan, percentielen).',
    afhankelijkheden: [
      'lib/nibud/reference-data.ts (bestaande NIBUD benchmark \u2014 model hiervoor)',
      'profiles (leeftijd, huishoudtype)',
      'lib/core-metrics.ts (kerngetallen)',
      'net_worth_snapshots (voor trends)',
      'Supabase (aggregatie queries)',
    ],
    technisch:
      'Twee fasen: Fase 1 \u2014 statische benchmarks op basis van NIBUD data en FIRE-community gemiddelden (CBS data). Fase 2 \u2014 echte aggregatie uit TriFinity data (vereist voldoende gebruikers, minimaal ~100 per cohort). Nieuwe lib/community-benchmarks.ts: getPercentile(metric, value, cohort) \u2192 number. Supabase edge function voor privacy-veilige aggregatie: SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY savings_rate) FROM snapshots WHERE age_group = $1. Nieuwe widget community_benchmark (half-size). Privacyprotocol: k-anonymiteit (minimaal 20 gebruikers per cohort), geen individuele data opvraagbaar, opt-in.',
    waardeGebruiker:
      'Sociale vergelijking is een krachtige motivator. \u201cBen ik normaal?\u201d is een universele vraag. NIBUD benchmark bestaat al voor budgetten \u2014 dit is de FIRE-equivalent. Gamification: stijgen in percentiel voelt als progressie.',
    aandachtspunten: [
      'Privacy is kritiek \u2014 GDPR-compliant, opt-in, k-anonymiteit.',
      'Te weinig gebruikers in beginfase \u2014 start met statische benchmarks.',
      'Vergelijking kan demotiveren (\u201cik sta er slechter voor dan gemiddeld\u201d) \u2014 framing als \u201cgroeikans\u201d niet als \u201cranking\u201d.',
      'Niet vergelijken op absolute bedragen (inkomensverschillen) maar op ratio\u2019s.',
      'Manipulation: gebruikers die extreme data invoeren verstoren aggregaten \u2014 outlier detection nodig.',
    ],
    competitors:
      'Niemand doet dit goed \u2014 Boldin heeft een PeerScore maar beperkt',
    priority: 'Laag',
  },
  {
    nr: 16,
    name: 'Levensfase Inkomsten Breakdown',
    description:
      'Per levensfase (werkend \u2192 FIRE \u2192 AOW-leeftijd \u2192 80+) een breakdown van inkomstenbronnen als percentage. Laat zien hoe de inkomstenmix verschuift over de tijd. In de werkfase komt 90% uit salaris, na FIRE verschuift dit naar onttrekking uit vermogen, later komt pensioen en AOW erbij. Boldin toont dit als een compact overzicht per levensfase \u2014 TriFinity mist deze samenvatting.',
    werking:
      'Overzichtelijke weergave per levensfase met procentuele verdeling van inkomstenbronnen: (1) Werkfase (nu \u2192 FIRE): salaris 80-90%, beleggingsinkomen 5-10%, overig 5%. (2) Bridge-fase (FIRE \u2192 pensioenleeftijd): onttrekking uit vermogen 70-90%, passief inkomen 10-30%. (3) Pensioen-fase (pensioenleeftijd \u2192 AOW): onttrekking 40-60%, werkgeverspensioen 30-40%, passief inkomen 10-20%. (4) AOW-fase (vanaf AOW-leeftijd): AOW 30-40%, pensioen 25-35%, onttrekking 20-30%, passief inkomen 10%. (5) Late fase (80+): AOW + pensioen dominant, onttrekking minimaal. Per fase: horizontale gestapelde balk met kleuren per bron, absolute bedragen per jaar, en percentage van totaal. Compact overzicht dat in \u00e9\u00e9n oogopslag de transitie laat zien.',
    afhankelijkheden: [
      'lib/fire-simulation.ts (SimRow, runSimulation)',
      'lib/horizon-data.ts (computeFireProjection)',
      'profiles (leeftijd, pensioenleeftijd, AOW-leeftijd, fire_end_strategy)',
      'app/api/pension/parse (pensioeninkomen)',
      'lib/fire-simulation.ts (lifeEventsToCashflows)',
      'budgets (huidige uitgaven als basis)',
    ],
    technisch:
      'Nieuwe helper: computeLevensfaseBreakdown(simRows, profile, pensionIncome, aowIncome) \u2192 LevensfaseRow[]. Per fase: faseLidwoord, startJaar, eindJaar, bronnen: { label, bedrag, percentage, kleur }[]. Levensfasen afleiden uit profile: werkfase (nu \u2192 FIRE), bridge (FIRE \u2192 pensioen), pensioen (pensioen \u2192 AOW), AOW (AOW \u2192 eindleeftijd), laat (80+). Visualisatie als horizontale gestapelde balken per fase, compact onder elkaar. Kan als sectie op Toekomst of als onderdeel van het rapportage-systeem. Relatief simpel te bouwen op basis van bestaande SimRow data \u2014 voornamelijk een presentatie-laag.',
    waardeGebruiker:
      'Geeft in \u00e9\u00e9n oogopslag het "grote plaatje" van je financi\u00eble levenslijn. Maakt abstract plannen concreet: "Na mijn 67e komt 35% van mijn inkomen uit AOW." Helpt bij het identificeren van kwetsbare fasen: als de bridge-periode bijna volledig afhankelijk is van onttrekking, is dat een risico. Ideaal voor rapportages en delen met partner.',
    aandachtspunten: [
      'Levensfasen moeten dynamisch zijn \u2014 niet iedereen heeft dezelfde FIRE/pensioen/AOW-leeftijd.',
      'Gebruikers zonder pensioendata zien onvolledige breakdown \u2014 graceful degradation.',
      'Percentages moeten optellen tot 100% per fase \u2014 afrondingsverschillen oplossen.',
      'Te veel bronnen per fase maakt het onoverzichtelijk \u2014 groepeer kleine bronnen als "overig".',
      'Partnersituatie: gezamenlijke breakdown of per persoon?',
    ],
    competitors:
      'Boldin (Income by Life Phase breakdown), ProjectionLab (income source timeline per period)',
    priority: 'Laag',
  },
]

const FASE_D_FEATURES: readonly Feature[] = [
  {
    nr: 16,
    name: 'Document Vault / Financi\u00eble Kluis',
    description:
      'Alle financi\u00eble documenten op \u00e9\u00e9n plek: polissen, testamenten, contracten, jaaropgaves, belastingaangiftes. Pensioen PDF opslag bestaat al via Supabase Storage \u2014 uitbreiden naar een volledige kluis met categorisatie, vervaldatum-alerts, en delen met partner. Kubera vraagt $249/jaar voor vergelijkbare functionaliteit.',
    werking:
      'Beveiligde opslagplaats voor alle financi\u00eble documenten, georganiseerd per categorie: polissen (zorg, inboedel, aansprakelijkheid, overlijden), contracten (hypotheek, huur, arbeidsovereenkomst), belasting (aangiftes, aanslagen, jaaropgaves), pensioen (UPO\u2019s, pensioenoverzichten), testament/notarieel, overig. Per document: upload, titel, categorie, vervaldatum, notities. Automatische reminder bij naderende vervaldatum. Delen met partner (huishouden-integratie). Zoekfunctie over document-titels.',
    afhankelijkheden: [
      'Supabase Storage (bucket pension_documents bestaat al \u2014 uitbreiden)',
      'app/api/household/ (huishouden-systeem)',
      'meldingen-systeem (vervaldatum alerts)',
      'profiles (partner-koppeling)',
    ],
    technisch:
      'Nieuw Supabase Storage bucket financial_documents met RLS policies. Nieuwe tabel documents: id, user_id, title, category, file_path, mime_type, size_bytes, expiry_date, notes, shared_with_partner, created_at. Categorie\u00ebn als enum. API routes: /api/documents (CRUD), /api/documents/[id]/download. Max bestandsgrootte: 10MB per document, 100MB per gebruiker. Encryptie: Supabase storage is al encrypted at rest. Nieuwe pagina /identity/kluis of /core/documenten. RLS: gebruiker ziet alleen eigen documenten + gedeelde partner-documenten.',
    waardeGebruiker:
      '\u201cWaar is mijn polis?\u201d \u2014 universeel probleem. Kubera vraagt $249/jaar voor vergelijkbare functionaliteit. Vervaldatum-alerts voorkomen onbewust onverzekerd zijn. Compleet financieel overzicht: niet alleen cijfers maar ook de onderliggende documenten. Bij overlijden: partner heeft direct toegang tot alle documenten.',
    aandachtspunten: [
      'Privacy en security zijn kritiek \u2014 financi\u00eble documenten zijn zeer gevoelig.',
      'Supabase Storage encryptie is voldoende maar communiceer dit duidelijk.',
      'Bestandsformaten: PDF, JPG, PNG als minimum \u2014 geen executables.',
      'Virus scanning overwegen.',
      'Storage kosten bij schaling.',
      'GDPR: recht op verwijdering moet alle documenten includeren.',
      'Backups: documenten moeten mee in data export.',
    ],
    competitors: 'Kubera (encrypted document vault \u2014 premium feature)',
    priority: 'Middel',
  },
  {
    nr: 17,
    name: 'Nalatenschapsplanning (\u201cDead Man\u2019s Switch\u201d)',
    description:
      'Bij langdurige inactiviteit automatisch een vertrouwenspersoon informeren. Stel in: \u201cAls ik 30 dagen niet inlog, stuur een email naar [partner] met toegang tot mijn financieel overzicht.\u201d Inclusief: wie krijgt wat, waar staan de documenten, contactgegevens adviseurs. Huishouden-systeem en delen-functionaliteit bestaan al \u2014 uitbreiden met inactiviteit-detectie.',
    werking:
      'Configureerbaar inactiviteits-detectiesysteem: (1) Stel een vertrouwenspersoon in (naam, email, relatie). (2) Kies inactiviteitsperiode (14/30/60/90 dagen). (3) Na de inactiviteitsperiode: eerst een reeks herinneringen aan de gebruiker (\u201cBen je er nog?\u201d). (4) Als geen reactie: email naar vertrouwenspersoon met een beveiligde link naar een beperkt financieel overzicht. (5) Overzicht bevat: netto vermogen samenvatting, lijst van rekeningen/instellingen, contactgegevens adviseurs, link naar document vault.',
    afhankelijkheden: [
      'Supabase Auth (laatste login tracking)',
      'app/api/household/ (huishouden-systeem)',
      'app/(app)/identity/delen/ (delen-functionaliteit)',
      'document vault (feature #16, optioneel)',
      'meldingen-systeem',
      'email systeem (Supabase of externe provider)',
    ],
    technisch:
      'Nieuwe tabel beneficiary_settings: id, user_id, contact_name, contact_email, contact_relation, inactivity_days, is_active, last_check_at, status (active|warning|triggered). Cron job (dagelijks): check profiles.last_sign_in_at vs inactivity_days. Escalatie: dag 1-3 na trigger \u2192 email naar gebruiker (\u201cJe bent X dagen niet ingelogd\u201d). Dag 4+ \u2192 email naar vertrouwenspersoon met secure token. Secure overzicht: tijdelijke pagina /share/beneficiary/[token] met beperkte data (netto vermogen, rekeningen-lijst, geen transactiedetail). Token verloopt na 30 dagen. API: /api/beneficiary (CRUD settings), /api/beneficiary/verify (token verificatie).',
    waardeGebruiker:
      'Kubera\u2019s \u201cLife Beat\u201d is hun meest genoemde differentiator. Psychologische rust: \u201cAls mij iets overkomt, weet mijn partner waar alles staat.\u201d Relevant voor: alleenstaanden, oudere gebruikers, mensen met complex financieel leven. Combinatie met document vault maakt het compleet.',
    aandachtspunten: [
      'False positives: vakantie zonder internet \u2260 overlijden \u2014 daarom eerst herinneringen aan gebruiker.',
      'Email deliverability: vertrouwenspersoon email moet aankomen (SPF/DKIM).',
      'Beveiligde link moet echt veilig zijn \u2014 rate limiting, IP logging.',
      'Ethische overwegingen: hoe communiceer je dit feature tactful? Niet \u201cals je doodgaat\u201d maar \u201cvoor je gemoedsrust\u201d.',
      'GDPR: vertrouwenspersoon data verwerking.',
      'Periodieke test: laat gebruiker een test-email versturen.',
    ],
    competitors:
      'Kubera (\u201cLife Beat\u201d / Dead Man\u2019s Switch \u2014 hun meest onderscheidende feature)',
    priority: 'Middel',
  },
  {
    nr: 18,
    name: 'Internationale Belasting Vergelijking',
    description:
      'Voor FIRE-emigranten: vergelijk je belastingdruk in NL vs Portugal vs Spanje vs Belgi\u00eb vs Duitsland. Hoeveel sneller bereik je FIRE in een ander land? Box 3 engine bestaat \u2014 bouw vergelijkbare engines voor populaire FIRE-bestemmingen. Relevant voor de groeiende groep digital nomads en FIRE-emigranten.',
    werking:
      'Vergelijk je belastingdruk als FIRE-emigrant in populaire bestemmingen: Nederland, Portugal, Spanje, Belgi\u00eb, Duitsland, Griekenland, Itali\u00eb. Per land: vermogensbelasting equivalent, inkomstenbelasting op onttrekkingen, totale jaarlijkse belastingdruk, en het effect op je FIRE-datum/benodigde vermogen. \u201cIn Portugal bereik je FIRE 3 jaar eerder door het NHR-regime\u201d of \u201cBelgi\u00eb heeft geen vermogensbelasting \u2014 je bespaart \u20acX/jaar.\u201d',
    afhankelijkheden: [
      'lib/box3-data.ts (NL belasting als baseline)',
      'lib/fire-simulation.ts (FIRE berekening per land)',
      'lib/horizon-data.ts (scenario berekeningen)',
    ],
    technisch:
      'Nieuwe lib/international-tax/ directory met per-land modules: portugal.ts, spain.ts, belgium.ts, germany.ts, greece.ts, italy.ts. Elk module: computeAnnualTax(portfolio, withdrawals, income) \u2192 TaxResult. Hoofd-module: lib/international-tax/compare.ts: compareTaxRegimes(profile, countries) \u2192 CountryComparison[]. Focus op vermogensbelasting + onttrekkingsbelasting (de twee grootste posten voor FIRE). Vereenvoudigd model \u2014 geen volledige belastingaangifte-simulatie. Nieuwe pagina /horizon/emigratie met kaart/tabel vergelijking.',
    waardeGebruiker:
      'Groeiende trend van FIRE-emigratie (Portugal, Griekenland populair). Belasting is vaak de #1 factor in landkeuze. Huidige informatie is verspreid over blogs en forums \u2014 geen tool die het doorrekent. Kan duizenden euro\u2019s per jaar verschil maken.',
    aandachtspunten: [
      'Belastingwetgeving wijzigt constant per land \u2014 onderhoudslast is hoog.',
      'Portugal NHR-regime is afgeschaft/gewijzigd \u2014 actueel houden.',
      'Sociale premies, zorgkosten en levenskosten zijn ook factoren \u2014 niet alleen belasting.',
      'Geen emigratie-advies \u2014 disclaimer.',
      'Dubbele belastingverdragen zijn complex.',
      'Start met 3-4 landen, breid later uit.',
      'Model moet vereenvoudigd maar niet misleidend zijn.',
    ],
    competitors:
      'Niemand \u2014 ProjectionLab heeft tax presets voor enkele landen maar geen vergelijking',
    priority: 'Laag',
  },
  {
    nr: 19,
    name: 'API voor Derden',
    description:
      'Open API waarmee power users en developers eigen integraties kunnen bouwen: spreadsheet-koppelingen, custom dashboards, automatiseringen. YNAB\u2019s API is een van hun meest gewaardeerde features bij de tech-savvy FIRE-community. Start met read-only endpoints voor saldi, transacties, en FIRE-metrics.',
    werking:
      'RESTful API waarmee geauthenticeerde gebruikers hun eigen financi\u00eble data kunnen opvragen: saldi, transacties, netto vermogen, FIRE-metrics, budget status. Use cases: Google Sheets integratie, Home Assistant dashboard, custom scripts, Zapier/Make automations. Read-only in eerste fase. API key per gebruiker, rate limited, HTTPS only.',
    afhankelijkheden: [
      'Supabase Auth (token verificatie)',
      'alle bestaande API routes (intern hergebruik)',
      'profiles tabel (API key storage)',
    ],
    technisch:
      'Nieuwe API namespace: /api/v1/ met routes: /accounts, /transactions, /net-worth, /fire-metrics, /budgets, /holdings. Authenticatie: Bearer token (API key). Nieuwe tabel api_keys: id, user_id, key_hash, name, created_at, last_used_at, rate_limit. Rate limiting: 100 requests/uur default. Response format: JSON met paginatie. Versioning: /api/v1/ prefix. Documentatie: auto-generated OpenAPI spec. Middleware: lib/api/auth.ts voor API key validatie. Swagger UI op /api/docs.',
    waardeGebruiker:
      'YNAB\u2019s API is een van hun meest gewaardeerde features bij de tech-savvy FIRE-community. Power users bouwen eigen dashboards, spreadsheets, en automatiseringen. Community-effect: developers bouwen integraties die TriFinity waardevoller maken voor iedereen. Spreadsheet-coupling is de #1 requested feature bij finance apps.',
    aandachtspunten: [
      'Security: API keys moeten gehasht opgeslagen worden.',
      'Rate limiting voorkomt misbruik.',
      'Scope: welke data is toegankelijk? Geen schrijf-operaties in V1.',
      'GDPR: data portabiliteit is een recht \u2014 API faciliteert dit.',
      'Versioning: backward compatibility bewaken.',
      'Documentatie-onderhoud.',
      'Performance: voorkom dat API-gebruikers de database overbelasten.',
    ],
    competitors:
      'YNAB (public API), Kubera (first-party API), Wealthica (developer API + add-ons), Actual Budget (local API)',
    priority: 'Laag',
  },
  {
    nr: 20,
    name: 'Schenkbelasting Planner',
    description:
      'Optimale timing en strategie voor schenken aan kinderen of familie. Jaarlijkse vrijstellingen, eenmalig verhoogde vrijstelling, effect op eigen FIRE-datum vs voordeel voor ontvanger. Life events module heeft al schenkbelasting calculator \u2014 uitbreiden naar een volledige planner met meerjarenadvies.',
    werking:
      'Meerjarenplanner voor schenkingen aan kinderen of familie: (1) Overzicht jaarlijkse vrijstellingen per relatie (kind, kleinkind, overig). (2) Eenmalig verhoogde vrijstelling (waar nog van toepassing). (3) Schenking-scenario\u2019s: \u201cAls je 10 jaar lang \u20ac6.035/jaar schenkt aan elk kind, bespaar je \u20acX aan erfbelasting en het kost je Y maanden FIRE-tijd.\u201d (4) Effect op eigen FIRE-datum vs voordeel voor ontvanger. (5) Optimale timing: wanneer beginnen met schenken?',
    afhankelijkheden: [
      'lib/horizon-data.ts (LIFE_EVENT_CATALOG \u2014 schenkbelasting calculator bestaat al)',
      'lib/fire-simulation.ts (FIRE impact)',
      'profiles (kinderen data uit huishouden)',
      'lib/format.ts (formattering)',
    ],
    technisch:
      'Uitbreiden bestaande schenkbelasting calculator in lib/horizon-data.ts. Nieuwe lib/schenk-planner.ts: planSchenkingen(kinderen, vrijstellingen, horizon, eigenVermogen) \u2192 SchenkPlan. SchenkPlan bevat per jaar: schenking per kind, totale schenking, schenkbelasting, eigen vermogen na schenking, FIRE-datum impact. Vergelijk strategie\u00ebn: (a) niet schenken (meer erfbelasting later), (b) jaarlijks maximaal vrijgesteld, (c) eenmalig groot (met belasting). Erfbelasting-besparing berekenen: berekenErfbelasting(nalatenschap, relatie) \u2192 number. Nieuwe pagina /horizon/schenken of modal in life events.',
    waardeGebruiker:
      'Erfbelasting in NL is 10-40% \u2014 optimaal schenken kan tienduizenden euro\u2019s besparen. Fiscalisten rekenen \u20ac200+/uur voor schenkingsadvies. Emotioneel beladen onderwerp: \u201cHoeveel kan ik weggeven zonder mijn eigen FIRE in gevaar te brengen?\u201d TriFinity beantwoordt dit data-driven.',
    aandachtspunten: [
      'Vrijstellingsbedragen wijzigen jaarlijks \u2014 onderhoud nodig.',
      'Jubelton is afgeschaft \u2014 niet meer aanbieden.',
      'Fiscale partnersituatie be\u00efnvloedt vrijstellingen.',
      'Schenkingen uit voorgaande jaren tellen mee bij erfbelasting \u2014 complexe verrekening.',
      'Niet-financieel advies disclaimer.',
      'Overgangsrecht en anti-misbruikbepalingen.',
      'Schenking kan ongedaan gemaakt worden door schuldeisers \u2014 waarschuwing.',
    ],
    competitors: 'Niemand \u2014 fiscalisten bieden dit als betaalde dienst',
    priority: 'Laag',
  },
]

/* -- Helper: composite key for overlay map ---------------------- */
function statusKey(fase: string, nr: number): string {
  return `${fase}:${nr}`
}

/* -- Status configuration --------------------------------------- */
const STATUS_CONFIG: Record<RoadmapStatus, { label: string; color: string; bg: string; border: string }> = {
  backlog: { label: 'Backlog', color: 'text-zinc-500', bg: 'bg-zinc-100', border: 'border-zinc-200' },
  in_ontwikkeling: { label: 'In ontwikkeling', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  testen: { label: 'Testen', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  afgerond: { label: 'Afgerond', color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
}

/* -- Priority badge colors -------------------------------------- */
function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    Hoog: 'bg-red-50 text-red-700 border-red-200',
    Middel: 'bg-amber-50 text-amber-700 border-amber-200',
    Laag: 'bg-zinc-100 text-zinc-500 border-zinc-200',
  }
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-[0.06em] ${styles[priority] ?? styles.Middel}`}
    >
      {priority}
    </span>
  )
}

/* -- Feature card (collapsible details) ------------------------- */
function FeatureCard({
  nr,
  name,
  description,
  werking,
  afhankelijkheden,
  technisch,
  waardeGebruiker,
  aandachtspunten,
  competitors,
  priority,
  fase,
  status,
  opmerkingen,
  onStatusChange,
  onOpmerkingenChange,
}: Feature & {
  fase: string
  status: RoadmapStatus
  opmerkingen: string | null
  onStatusChange: (status: RoadmapStatus) => void
  onOpmerkingenChange: (opmerkingen: string) => void
}) {
  return (
    <details className="group rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] transition-colors hover:bg-[var(--subtle)]">
      {/* Collapsed summary: number, name, priority, status */}
      <summary className="flex cursor-pointer select-none items-center gap-4 p-4">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--subtle)] font-mono text-sm font-bold tabular-nums text-[var(--ink-2)]">
          {nr}
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <p className="font-display text-sm font-bold text-[var(--ink)]">{name}</p>
          <PriorityBadge priority={priority} />
          <span className={`inline-block rounded-full border px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-[0.06em] ${STATUS_CONFIG[status].bg} ${STATUS_CONFIG[status].color} ${STATUS_CONFIG[status].border}`}>
            {STATUS_CONFIG[status].label}
          </span>
        </div>
        <span className="flex-shrink-0 text-[var(--ink-4)] transition-transform group-open:rotate-90">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </summary>

      {/* Expanded detail sections */}
      <div className="space-y-5 border-t border-[var(--border-ed)] px-4 pb-5 pt-4">
        {/* Status selector + Opmerkingen */}
        <div className="mb-4 space-y-3">
          <div>
            <p className="mb-1.5 font-sans text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">Status</p>
            <div className="flex gap-1">
              {(['backlog', 'in_ontwikkeling', 'testen', 'afgerond'] as const).map((s) => {
                const cfg = STATUS_CONFIG[s]
                const isActive = status === s
                return (
                  <button
                    key={s}
                    onClick={(e) => { e.stopPropagation(); onStatusChange(s); }}
                    className={`rounded-full border px-2.5 py-1 font-sans text-[11px] font-medium transition-colors ${
                      isActive ? `${cfg.bg} ${cfg.color} ${cfg.border}` : 'border-transparent text-[var(--ink-4)] hover:bg-[var(--subtle)]'
                    }`}
                  >
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <p className="mb-1.5 font-sans text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">Opmerkingen</p>
            <textarea
              value={opmerkingen ?? ''}
              onChange={(e) => onOpmerkingenChange(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="Notities over deze feature..."
              rows={2}
              className="w-full resize-y rounded-md border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 font-serif text-[13px] text-[var(--ink-2)] placeholder:text-[var(--ink-4)] focus:border-[var(--ink-3)] focus:outline-none"
            />
          </div>
        </div>

        {/* Description */}
        <p className="font-serif text-[13px] leading-relaxed text-[var(--ink-2)]">
          {description}
        </p>

        {/* Werking */}
        <div>
          <p className="mb-1.5 font-sans text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Werking
          </p>
          <p className="font-serif text-[13px] leading-relaxed text-[var(--ink-2)]">
            {werking}
          </p>
        </div>

        {/* Afhankelijkheden */}
        <div>
          <p className="mb-1.5 font-sans text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Afhankelijkheden
          </p>
          <div className="flex flex-wrap gap-1.5">
            {afhankelijkheden.map((dep) => (
              <span
                key={dep}
                className="rounded bg-[var(--subtle)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--ink-2)]"
              >
                {dep}
              </span>
            ))}
          </div>
        </div>

        {/* Technisch */}
        <div>
          <p className="mb-1.5 font-sans text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Technisch
          </p>
          <p className="font-serif text-[13px] leading-relaxed text-[var(--ink-2)]">
            {technisch}
          </p>
        </div>

        {/* Waarde gebruiker */}
        <div>
          <p className="mb-1.5 font-sans text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Waarde gebruiker
          </p>
          <p className="font-serif text-[13px] leading-relaxed text-[var(--ink-2)]">
            {waardeGebruiker}
          </p>
        </div>

        {/* Aandachtspunten */}
        <div>
          <p className="mb-1.5 font-sans text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Aandachtspunten
          </p>
          <ul className="list-inside list-disc space-y-0.5">
            {aandachtspunten.map((punt) => (
              <li
                key={punt}
                className="font-serif text-[13px] leading-relaxed text-[var(--ink-3)]"
              >
                {punt}
              </li>
            ))}
          </ul>
        </div>

        {/* Wie heeft het */}
        <div>
          <p className="mb-1.5 font-sans text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Wie heeft het
          </p>
          <p className="font-serif text-[13px] leading-relaxed text-[var(--ink-2)]">
            {competitors}
          </p>
        </div>
      </div>
    </details>
  )
}

/* -- Phase section ---------------------------------------------- */
function PhaseSection({
  id,
  title,
  subtitle,
  accentColor,
  accentBg,
  features,
  fase,
  overlayMap,
  onStatusChange,
  onOpmerkingenChange,
}: {
  id: string
  title: string
  subtitle: string
  accentColor: string
  accentBg: string
  features: readonly Feature[]
  fase: string
  overlayMap: Map<string, RoadmapOverlay>
  onStatusChange: (fase: string, nr: number, status: RoadmapStatus) => void
  onOpmerkingenChange: (fase: string, nr: number, opmerkingen: string) => void
}) {
  const total = features.length
  const afgerond = features.filter(f => (overlayMap.get(statusKey(fase, f.nr))?.status ?? 'backlog') === 'afgerond').length
  const percentage = total > 0 ? Math.round((afgerond / total) * 100) : 0

  return (
    <section
      className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6"
      style={{ borderLeftWidth: '3px', borderLeftColor: accentColor }}
    >
      <div className="mb-5">
        <div className="mb-1 flex items-center gap-2">
          <span
            className="rounded-full px-2.5 py-0.5 font-sans text-[10px] font-bold uppercase tracking-[0.1em]"
            style={{ backgroundColor: accentBg, color: accentColor }}
          >
            {id}
          </span>
          <p className="font-display text-lg font-bold text-[var(--ink)]">{title}</p>
        </div>
        <p className="font-serif text-sm italic text-[var(--ink-3)]">{subtitle}</p>

        {/* Progress bar */}
        <div className="mt-3 mb-1">
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-[11px] tabular-nums text-[var(--ink-4)]">{afgerond}/{total} afgerond</span>
            <span className="font-mono text-[11px] tabular-nums text-[var(--ink-4)]">{percentage}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--subtle)]">
            <div className="h-1.5 rounded-full bg-green-500 transition-all duration-300" style={{ width: `${percentage}%` }} />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {features.map((f) => {
          const key = statusKey(fase, f.nr)
          const overlay = overlayMap.get(key)
          return (
            <FeatureCard
              key={f.nr}
              {...f}
              fase={fase}
              status={overlay?.status ?? 'backlog'}
              opmerkingen={overlay?.opmerkingen ?? null}
              onStatusChange={(s) => onStatusChange(fase, f.nr, s)}
              onOpmerkingenChange={(o) => onOpmerkingenChange(fase, f.nr, o)}
            />
          )
        })}
      </div>
    </section>
  )
}

/* -- Competitor group ------------------------------------------- */
function CompetitorGroup({ title, apps }: { title: string; apps: string[] }) {
  return (
    <div>
      <p className="mb-2 font-sans text-xs font-bold uppercase tracking-[0.08em] text-[var(--ink-2)]">
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {apps.map((app) => (
          <span
            key={app}
            className="rounded-full border border-[var(--border-ed)] bg-[var(--subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink-2)]"
          >
            {app}
          </span>
        ))}
      </div>
    </div>
  )
}

/* -- Productie Readiness features ------------------------------- */
const PRODUCTIE_FEATURES: readonly Feature[] = [
  {
    nr: 1,
    name: 'Security Headers & Middleware',
    description: 'HTTP security headers (CSP, X-Frame-Options, HSTS) toevoegen aan alle responses en middleware implementeren voor CSRF-bescherming en globale rate limiting. Momenteel ontbreekt een middleware.ts volledig en heeft next.config.ts geen security headers.',
    werking: 'Security headers worden in next.config.ts geconfigureerd via de headers() functie. Een nieuwe middleware.ts op root-niveau handelt CSRF-token validatie af voor alle muterende endpoints (POST/PUT/DELETE). Rate limiting wordt geïmplementeerd als in-memory store (of Redis bij schaling) in de middleware, met configureerbare limieten per endpoint-groep (auth: strikt, API: normaal, static: geen).',
    afhankelijkheden: [
      'next.config.ts (headers configuratie)',
      'middleware.ts (nieuw — CSRF + rate limiting)',
      'app/api/* (alle muterende routes)',
      'lib/supabase/server.ts (auth context)',
    ],
    technisch: 'next.config.ts: headers() met Content-Security-Policy, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Strict-Transport-Security, Referrer-Policy. middleware.ts: CSRF via double-submit cookie pattern (geen extra state nodig), rate limiter met sliding window counter per IP+userId. Aparte limieten voor /api/auth (5/min), /api/chat (20/min), overige API (60/min). CORS configuratie voor productie domein.',
    waardeGebruiker: 'Beschermt gebruikers tegen cross-site attacks, clickjacking, en brute-force aanvallen. Essentieel voor een financiële applicatie die gevoelige vermogensdata bevat.',
    aandachtspunten: [
      'CSP moet AI SDK externe calls (api.anthropic.com, api.openai.com) whitelisten.',
      'Rate limiting moet household-members als aparte users tellen.',
      'CSRF tokens moeten werken met Supabase auth flow.',
      'Vercel Edge Functions hebben beperkingen voor stateful middleware.',
    ],
    competitors: 'Industriestandaard — alle productie-apps hebben dit.',
    priority: 'Hoog',
  },
  {
    nr: 2,
    name: 'Error Tracking & Monitoring',
    description: 'Sentry integreren voor gecentraliseerde error tracking, performance monitoring (APM), en alerting. Momenteel worden errors alleen client-side gevangen door error.tsx boundaries maar niet gerapporteerd naar een centraal systeem.',
    werking: 'Sentry SDK wordt geïnstalleerd voor zowel client (React) als server (Node). Alle unhandled exceptions, API fouten, en performance metrics worden automatisch gerapporteerd. Custom breadcrumbs voor financiële operaties (transacties, simulaties). Alert rules voor kritieke flows: auth failures, data corruption, FIRE berekening errors.',
    afhankelijkheden: [
      'app/error.tsx (bestaande error boundary)',
      'app/(app)/error.tsx (app error boundary)',
      'app/api/* (server-side error handling)',
      'package.json (@sentry/nextjs)',
      'next.config.ts (Sentry webpack plugin)',
    ],
    technisch: 'npm install @sentry/nextjs. sentry.client.config.ts + sentry.server.config.ts + sentry.edge.config.ts. Instrumentation via next.config.ts withSentryConfig wrapper. Custom Sentry.captureException calls in kritieke API routes. Performance tracing voor dashboard load, FIRE simulatie, en AI chat. Source maps uploaden naar Sentry voor readable stack traces. Environment tagging (development/staging/production).',
    waardeGebruiker: 'Problemen worden proactief ontdekt en opgelost voordat gebruikers ze melden. Snellere bugfixes door complete context (browser, OS, user actions) bij elke error.',
    aandachtspunten: [
      'PII moet gefilterd worden uit Sentry events (IBAN, BSN, bedragen).',
      'Sentry free tier: 5K errors/maand — voldoende voor launch.',
      'Source maps moeten NIET publiek toegankelijk zijn.',
      'Performance sampling rate: 10% in productie om kosten te beperken.',
    ],
    competitors: 'Industriestandaard — Sentry, DataDog, of equivalent.',
    priority: 'Hoog',
  },
  {
    nr: 3,
    name: 'CI/CD Pipeline',
    description: 'GitHub Actions workflows opzetten voor automatische tests, linting, type checking, en deployment. Momenteel ontbreekt CI/CD volledig — er is geen .github/workflows directory.',
    werking: 'Drie workflows: (1) PR Check — runt bij elke pull request: vitest, eslint, tsc --noEmit, next build. (2) Deploy — runt bij merge naar main: Vercel deployment + smoke tests. (3) Nightly — dagelijkse regressietests en dependency vulnerability scan.',
    afhankelijkheden: [
      '.github/workflows/ (nieuw)',
      'package.json (test/lint scripts)',
      'vitest.config.ts (bestaand)',
      'vercel.json (deployment config)',
    ],
    technisch: 'PR workflow: checkout → setup-node → npm ci → parallel jobs (vitest, eslint, tsc, next build). Deploy workflow: Vercel CLI deployment + curl health check + basis smoke test. Nightly workflow: volledige regressie suite + npm audit + Dependabot alerts check. Secrets: VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID. Cache: node_modules via actions/cache voor snellere runs.',
    waardeGebruiker: 'Voorkomt dat bugs in productie terechtkomen. Elke code-wijziging wordt automatisch gevalideerd voordat het live gaat.',
    aandachtspunten: [
      'GitHub Actions free tier: 2000 min/maand — ruim voldoende.',
      'Vercel preview deployments voor PR review.',
      'next build kan lang duren (300+ paginas) — overweeg turbo cache.',
      'Supabase test database nodig voor integratietests in CI.',
    ],
    competitors: 'Industriestandaard — alle professionele projecten hebben CI/CD.',
    priority: 'Hoog',
  },
  {
    nr: 4,
    name: 'Privacy, AVG & Juridisch',
    description: 'Privacy policy, algemene voorwaarden, cookiebeleid, en AVG-compliance documenten opstellen en implementeren. Cookie consent banner toevoegen. Momenteel ontbreken alle juridische paginas.',
    werking: 'Juridische paginas als statische routes: /privacy, /voorwaarden, /cookies. Cookie consent banner (client-side) die verschijnt bij eerste bezoek en keuze opslaat in localStorage + cookie. AVG-compliant data export (bestaand via /api/export) en account deletion (bestaand via /api/account/delete) worden gedocumenteerd. Verwerkersovereenkomsten afsluiten met Supabase, Anthropic, OpenAI.',
    afhankelijkheden: [
      'app/privacy/page.tsx (nieuw)',
      'app/voorwaarden/page.tsx (nieuw)',
      'components/cookie-consent.tsx (nieuw)',
      'app/api/export (bestaand — data portability)',
      'app/api/account/delete (bestaand — right to erasure)',
    ],
    technisch: 'Statische paginas met juridische tekst (door jurist te reviewen). Cookie consent component: localStorage voor snelle check, cookie voor server-side aware. Categorieën: noodzakelijk (altijd aan), analytisch (opt-in), marketing (opt-in — momenteel niet gebruikt). AVG register: documentatie van alle verwerkingen, rechtsgronden, bewaartermijnen. Footer links naar alle juridische paginas.',
    waardeGebruiker: 'Vertrouwen en transparantie. Wettelijk verplicht onder de AVG voor elke app die persoonsgegevens verwerkt. Zonder dit mag de app niet live.',
    aandachtspunten: [
      'Juridische teksten moeten door een jurist gereviewed worden.',
      'Verwerkersovereenkomsten met AI providers (Anthropic, OpenAI) zijn complex.',
      'Data bewaartermijnen moeten per categorie vastgesteld worden.',
      'Cookie consent moet "reject all" even prominent tonen als "accept all".',
      'Supabase data regio (EU) is cruciaal voor AVG compliance.',
    ],
    competitors: 'Wettelijke verplichting — geen keuze.',
    priority: 'Hoog',
  },
  {
    nr: 5,
    name: 'Performance Optimalisatie',
    description: 'Bundle analyse, Core Web Vitals monitoring, database query optimalisatie, en caching strategie implementeren. Vercel Speed Insights is geïnstalleerd maar er is geen actief performance budget of monitoring.',
    werking: 'Bundle analyzer toevoegen voor inzicht in JavaScript payload. Lighthouse CI in GitHub Actions voor performance regressie detectie. Database indexen reviewen en optimaliseren voor veelgebruikte queries (dashboard load, holdings lijst, transactie historie). ISR/SSG overwegen voor semi-statische paginas. Lazy loading voor zware componenten (grafieken, AI chat).',
    afhankelijkheden: [
      'next.config.ts (bundle analyzer)',
      'package.json (@next/bundle-analyzer)',
      'vercel.json (caching headers)',
      'supabase/migrations (indexen)',
      'components/widgets/* (lazy loading)',
    ],
    technisch: 'npm install @next/bundle-analyzer. ANALYZE=true next build voor bundle rapport. Performance budget: First Load JS < 150kB per route. Database: EXPLAIN ANALYZE op dashboard query, holdings lijst, transactie queries. Indexen op: holdings(user_id, ticker), transactions(holding_id, date), snapshots(user_id, month). next/dynamic voor Chart componenten en AI chat. Image optimization: next/image met sizes prop op alle afbeeldingen.',
    waardeGebruiker: 'Snellere app = betere ervaring. Mobiele gebruikers met langzame verbindingen merken het verschil direct. Google rankt snellere sites hoger.',
    aandachtspunten: [
      'Turbopack is uitgeschakeld wegens Windows cache corruptie — kan performance in dev beïnvloeden.',
      '10+ AI SDKs in dependencies — niet allemaal nodig op elke pagina.',
      'Dashboard laadt veel data server-side — monitoren of dit bottleneck wordt.',
      'Vercel Serverless Function size limits (50MB) — AI SDKs zijn groot.',
    ],
    competitors: 'ProjectionLab (snelle client-side berekeningen), YNAB (geoptimaliseerde web app).',
    priority: 'Middel',
  },
  {
    nr: 6,
    name: 'E2E Testing & Load Testing',
    description: 'Playwright opzetten voor end-to-end tests van kritieke user flows en k6 voor load testing. Momenteel zijn er uitgebreide regressietests en unit tests, maar geen browser-gebaseerde E2E tests.',
    werking: 'Playwright test suite voor de 5 kritiekste flows: (1) Registratie → onboarding → eerste dashboard, (2) Holding toevoegen → transactie boeken → portfolio update, (3) Budget aanmaken → uitgave categoriseren → maandoverzicht, (4) FIRE simulatie → parameters wijzigen → herberekening, (5) Check-in flow → snapshot → trend vergelijking. Load test met k6: 50 concurrent users op dashboard en API endpoints.',
    afhankelijkheden: [
      'playwright.config.ts (nieuw)',
      'tests/e2e/ (nieuw)',
      'k6/ (nieuw)',
      'lib/regression-tests/ (bestaande test suites als referentie)',
      '.github/workflows/ (CI integratie)',
    ],
    technisch: 'npm install -D @playwright/test. Playwright config: chromium + firefox, base URL configureerbaar. Test helpers voor auth (herbruikbare login state via storageState). k6 scripts met ramping VUs: 10 → 50 → 100 over 5 minuten. Dashboard load test target: p95 < 2s bij 50 users. API stress test: /api/dashboard, /api/holdings, /api/fire-simulation. CI: Playwright op PR (headless), k6 nightly.',
    waardeGebruiker: 'Zekerheid dat de app werkt zoals verwacht na elke wijziging. Load tests voorkomen dat de app crasht bij groei.',
    aandachtspunten: [
      'E2E tests hebben een test Supabase project nodig met seed data.',
      'Playwright tests zijn langzamer dan unit tests — selectief draaien op PR.',
      'Load testing tegen productie is risicovol — staging environment nodig.',
      'Test data cleanup na elke E2E run.',
    ],
    competitors: 'Industriestandaard voor productie-apps.',
    priority: 'Middel',
  },
  {
    nr: 7,
    name: 'Staging Environment & Deployment Runbook',
    description: 'Staging omgeving opzetten als exact spiegelbeeld van productie, plus een deployment runbook met stapsgewijze instructies voor releases, rollbacks, en incident response.',
    werking: 'Vercel preview branch "staging" als permanente staging omgeving met eigen Supabase project. Deployment checklist: (1) alle CI checks groen, (2) staging deployment + smoke test, (3) productie deployment, (4) post-deploy health check, (5) rollback procedure bij issues. Runbook als intern document met contactpersonen en escalatiepaden.',
    afhankelijkheden: [
      'vercel.json (staging branch config)',
      'Supabase staging project (nieuw)',
      '.env.staging (nieuw)',
      'docs/deployment-runbook.md (nieuw)',
    ],
    technisch: 'Vercel: staging branch auto-deploy naar staging.[domain]. Supabase: apart project met zelfde migraties (supabase db push). Environment variabelen per omgeving: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AI API keys (aparte keys voor staging). Rollback: Vercel instant rollback via dashboard of CLI (vercel rollback). Database rollback: migratie rollback scripts (handmatig — Supabase heeft geen auto-rollback).',
    waardeGebruiker: 'Voorkomt dat bugs direct bij gebruikers terechtkomen. Elke release wordt eerst getest in een productie-identieke omgeving.',
    aandachtspunten: [
      'Supabase free tier: 2 projecten — staging kost extra (Pro plan $25/maand).',
      'Staging data moet realistisch maar niet echt zijn (geen echte gebruikersdata).',
      'AI API costs verdubbelen met staging (aparte API keys met spending limits).',
      'Database migraties moeten altijd forward-compatible zijn (geen breaking changes).',
    ],
    competitors: 'Industriestandaard voor professionele deployments.',
    priority: 'Middel',
  },
  {
    nr: 8,
    name: 'Uptime Monitoring & Backup Verificatie',
    description: 'Externe uptime monitoring instellen die alert bij downtime, plus geautomatiseerde verificatie dat database backups daadwerkelijk werkend zijn. Momenteel is er een /api/health endpoint maar geen externe monitoring.',
    werking: 'Externe uptime monitor (BetterUptime, UptimeRobot, of Vercel) pingt elke 5 minuten /api/health. Bij 2 opeenvolgende failures: email + Slack alert. Maandelijkse backup restore test: Supabase point-in-time recovery testen naar een test database en verificatie dat data intact is. Status page voor gebruikers bij gepland onderhoud.',
    afhankelijkheden: [
      'app/api/health/route.ts (bestaand)',
      'Externe monitoring service (nieuw)',
      'Supabase backup configuratie',
      'Status page (optioneel — Instatus/Statuspage)',
    ],
    technisch: 'UptimeRobot free tier: 50 monitors, 5 min interval. Monitor: GET /api/health — verwacht 200 + {"status":"ok"}. Slack webhook voor alerts. Backup verificatie script: supabase db dump → restore naar test project → SELECT count(*) op kritieke tabellen → vergelijk met bron. Cron: maandelijks via GitHub Actions. Status page: simpele statische pagina op status.[domain] of Instatus free tier.',
    waardeGebruiker: 'Zekerheid dat de app beschikbaar is en dat data veilig is. Bij een incident worden gebruikers geïnformeerd via de status page.',
    aandachtspunten: [
      'Health check moet database connectiviteit testen (niet alleen HTTP 200).',
      'Supabase Pro plan heeft dagelijkse backups + point-in-time recovery.',
      'Backup restore test mag NOOIT tegen productie draaien.',
      'Alert fatigue voorkomen — alleen alerten bij echte issues.',
    ],
    competitors: 'Industriestandaard — elke SaaS heeft uptime monitoring.',
    priority: 'Middel',
  },
]

/* -- Phase config for rendering --------------------------------- */
const PHASE_CONFIG = [
  { id: 'Fase A', fase: 'a', title: 'De Brug', subtitle: 'Bouw voort op wat er al is \u2014 maximaliseer waarde van bestaande data', accentColor: 'var(--kern-500)', accentBg: 'var(--kern-l, #fef3c7)', features: FASE_A_FEATURES },
  { id: 'Fase B', fase: 'b', title: 'Nederland-proof', subtitle: 'Onverslaanbare NL-positie \u2014 geen concurrent raakt hier aan', accentColor: 'var(--horizon-500)', accentBg: 'var(--horizon-l, #f3e8ff)', features: FASE_B_FEATURES },
  { id: 'Fase C', fase: 'c', title: 'Groei', subtitle: 'Features die nieuwe gebruikers aantrekken', accentColor: 'var(--wil-500)', accentBg: 'var(--wil-l, #ccfbf1)', features: FASE_C_FEATURES },
  { id: 'Fase D', fase: 'd', title: 'Premium', subtitle: 'Waarde waarvoor gebruikers willen betalen', accentColor: 'var(--ink-3)', accentBg: 'var(--subtle)', features: FASE_D_FEATURES },
] as const

/* -- Page ------------------------------------------------------- */
export default function RoadmapPage() {
  const [overlayMap, setOverlayMap] = useState<Map<string, RoadmapOverlay>>(new Map())
  const [statusFilter, setStatusFilter] = useState<RoadmapStatus | 'alle'>('alle')
  const [loading, setLoading] = useState(true)
  const debounceTimers = useRef<Map<string, NodeJS.Timeout>>(new Map())

  // Load overlay data on mount
  useEffect(() => {
    fetch('/api/roadmap')
      .then(r => {
        if (r.ok) return r.json()
        // API returns empty array gracefully when table is missing
        return []
      })
      .then((data: RoadmapOverlay[]) => {
        if (Array.isArray(data) && data.length === 0) {
          // Could be empty table OR missing table — check via a test PUT
          // Just show the page with default statuses
        }
        const map = new Map<string, RoadmapOverlay>()
        for (const d of data) map.set(statusKey(d.fase, d.feature_nr), d)
        setOverlayMap(map)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Optimistic status change + PUT
  const handleStatusChange = useCallback((fase: string, nr: number, status: RoadmapStatus) => {
    const key = statusKey(fase, nr)
    setOverlayMap(prev => {
      const next = new Map(prev)
      next.set(key, {
        ...prev.get(key),
        feature_nr: nr,
        fase,
        status,
        opmerkingen: prev.get(key)?.opmerkingen ?? null,
        updated_at: new Date().toISOString(),
      })
      return next
    })
    fetch('/api/roadmap', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature_nr: nr, fase, status }),
    }).catch(() => {})
  }, [])

  // Debounced opmerkingen change (optimistic + PUT after 1s)
  const handleOpmerkingenChange = useCallback((fase: string, nr: number, opmerkingen: string) => {
    const key = statusKey(fase, nr)
    setOverlayMap(prev => {
      const next = new Map(prev)
      next.set(key, {
        ...prev.get(key),
        feature_nr: nr,
        fase,
        opmerkingen: opmerkingen || null,
        status: prev.get(key)?.status ?? 'backlog',
        updated_at: new Date().toISOString(),
      })
      return next
    })
    // Debounce the API call
    const existing = debounceTimers.current.get(key)
    if (existing) clearTimeout(existing)
    debounceTimers.current.set(key, setTimeout(() => {
      fetch('/api/roadmap', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature_nr: nr, fase, opmerkingen: opmerkingen || null }),
      }).catch(() => {})
    }, 1000))
  }, [])

  // Filter features per phase based on statusFilter
  function getFilteredFeatures(fase: string, features: readonly Feature[]): readonly Feature[] {
    if (statusFilter === 'alle') return features
    return features.filter(f => {
      const s = overlayMap.get(statusKey(fase, f.nr))?.status ?? 'backlog'
      return s === statusFilter
    })
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <header>
        <p className="mb-2 font-mono text-[11px] tabular-nums text-[var(--ink-4)]">
          Laatst bijgewerkt: maart 2026
        </p>
        <h2 className="font-display text-xl font-bold text-[var(--ink)]">
          Roadmap &amp; Feature Gap Analyse
        </h2>
        <p className="mt-1 font-serif text-sm text-[var(--ink-3)]">
          Vergelijking met 30+ budgeting &amp; wealth management apps &mdash; maart 2026
        </p>
      </header>

      {/* --- Section 1: Concurrentiepositionering --- */}
      <section className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
        <p className="label-editorial mb-3 text-[var(--ink-4)]">Concurrentiepositionering</p>
        <p className="font-serif text-sm leading-relaxed text-[var(--ink-2)]">
          TriFinity combineert budgeting (YNAB-niveau), FIRE-planning (ProjectionLab-niveau) en
          NL-specifieke belastingkennis (Box&nbsp;3/AOW) met een AI-coach en
          vrijheidstijd-filosofie. Geen enkele concurrent biedt dit geheel. De app bevat 46+
          widgets, 60+ pagina&apos;s, 80+ API routes en volledige huishouden-ondersteuning.
        </p>
      </section>

      {/* --- Section 2: Onderzochte concurrenten --- */}
      <section className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
        <p className="label-editorial mb-4 text-[var(--ink-4)]">Onderzochte concurrenten</p>
        <div className="grid gap-6 sm:grid-cols-2">
          <CompetitorGroup
            title="Budgeting Apps (10)"
            apps={[
              'YNAB',
              'Monarch Money',
              'Copilot Money',
              'Simplifi (Quicken)',
              'PocketGuard',
              'Goodbudget',
              'EveryDollar',
              'Actual Budget',
              'Honeydue',
              'Tiller Money',
            ]}
          />
          <CompetitorGroup
            title="Wealth Management Tools (10)"
            apps={[
              'Empower',
              'Wealthfront',
              'Betterment',
              'Fidelity Full View',
              'Kubera',
              'ProjectionLab',
              'Boldin',
              'Delta (eToro)',
              'Stock Events',
              'Wealthica',
            ]}
          />
          <CompetitorGroup
            title="Nederlandse Markt (5)"
            apps={['MijnGeldzaken', 'Dyme', 'Grassfeld', 'Grip (gestopt)', 'Financieel Fit']}
          />
        </div>
      </section>

      {/* --- Section 3: Feature Gaps --- */}
      <div>
        <p className="label-editorial mb-4 text-[var(--ink-4)]">
          Feature Gaps &mdash; Geprioriteerd
        </p>

        {/* Filter + Progress */}
        <div className="space-y-4 mb-6">
          {/* Overall progress */}
          {(() => {
            const allFeatures = [
              ...FASE_A_FEATURES.map(f => ({ ...f, fase: 'a' })),
              ...FASE_B_FEATURES.map(f => ({ ...f, fase: 'b' })),
              ...FASE_C_FEATURES.map(f => ({ ...f, fase: 'c' })),
              ...FASE_D_FEATURES.map(f => ({ ...f, fase: 'd' })),
            ]
            const total = allFeatures.length
            const counts = { backlog: 0, in_ontwikkeling: 0, testen: 0, afgerond: 0 }
            for (const f of allFeatures) {
              const s = overlayMap.get(statusKey(f.fase, f.nr))?.status ?? 'backlog'
              counts[s]++
            }
            return (
              <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
                <p className="label-editorial mb-3 text-[var(--ink-4)]">Voortgang</p>
                <div className="flex gap-4 mb-3">
                  {(Object.entries(counts) as [RoadmapStatus, number][]).map(([s, c]) => (
                    <div key={s} className="text-center">
                      <p className={`font-mono text-lg font-bold tabular-nums ${STATUS_CONFIG[s].color}`}>{c}</p>
                      <p className="font-sans text-[10px] uppercase tracking-[0.06em] text-[var(--ink-4)]">{STATUS_CONFIG[s].label}</p>
                    </div>
                  ))}
                  <div className="text-center">
                    <p className="font-mono text-lg font-bold tabular-nums text-[var(--ink)]">{total}</p>
                    <p className="font-sans text-[10px] uppercase tracking-[0.06em] text-[var(--ink-4)]">Totaal</p>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-[var(--subtle)] overflow-hidden flex">
                  <div className="h-2 bg-green-500 transition-all" style={{ width: `${(counts.afgerond / total) * 100}%` }} />
                  <div className="h-2 bg-amber-400 transition-all" style={{ width: `${(counts.testen / total) * 100}%` }} />
                  <div className="h-2 bg-blue-400 transition-all" style={{ width: `${(counts.in_ontwikkeling / total) * 100}%` }} />
                </div>
              </div>
            )
          })()}

          {/* Status filter */}
          <div className="flex items-center gap-2">
            <span className="font-sans text-[11px] font-medium text-[var(--ink-3)]">Filter:</span>
            {(['alle', 'backlog', 'in_ontwikkeling', 'testen', 'afgerond'] as const).map((f) => {
              const isActive = statusFilter === f
              const cfg = f === 'alle' ? null : STATUS_CONFIG[f]
              return (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`rounded-full border px-2.5 py-1 font-sans text-[11px] font-medium transition-colors ${
                    isActive
                      ? f === 'alle'
                        ? 'border-[var(--ink-3)] bg-[var(--ink)] text-[var(--paper)]'
                        : `${cfg!.bg} ${cfg!.color} ${cfg!.border}`
                      : 'border-transparent text-[var(--ink-4)] hover:bg-[var(--subtle)]'
                  }`}
                >
                  {f === 'alle' ? 'Alle' : STATUS_CONFIG[f].label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-6">
          {PHASE_CONFIG.map((phase) => {
            const filtered = getFilteredFeatures(phase.fase, phase.features)
            // Hide empty sections when filtering
            if (statusFilter !== 'alle' && filtered.length === 0) return null
            return (
              <PhaseSection
                key={phase.fase}
                id={phase.id}
                title={phase.title}
                subtitle={phase.subtitle}
                accentColor={phase.accentColor}
                accentBg={phase.accentBg}
                features={filtered}
                fase={phase.fase}
                overlayMap={overlayMap}
                onStatusChange={handleStatusChange}
                onOpmerkingenChange={handleOpmerkingenChange}
              />
            )
          })}
        </div>
      </div>

      {/* --- Section 4: Productie Readiness --- */}
      <div>
        <div className="flex items-center gap-4 mb-6">
          <div className="h-px flex-1 bg-[var(--border-ed)]" />
          <p className="font-display text-sm font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
            Productie Readiness
          </p>
          <div className="h-px flex-1 bg-[var(--border-ed)]" />
        </div>

        {/* Production progress */}
        {(() => {
          const total = PRODUCTIE_FEATURES.length
          const counts = { backlog: 0, in_ontwikkeling: 0, testen: 0, afgerond: 0 }
          for (const f of PRODUCTIE_FEATURES) {
            const s = overlayMap.get(statusKey('p', f.nr))?.status ?? 'backlog'
            counts[s]++
          }
          return (
            <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 mb-6">
              <p className="label-editorial mb-3 text-[var(--ink-4)]">Voortgang</p>
              <div className="flex gap-4 mb-3">
                {(Object.entries(counts) as [RoadmapStatus, number][]).map(([s, c]) => (
                  <div key={s} className="text-center">
                    <p className={`font-mono text-lg font-bold tabular-nums ${STATUS_CONFIG[s].color}`}>{c}</p>
                    <p className="font-sans text-[10px] uppercase tracking-[0.06em] text-[var(--ink-4)]">{STATUS_CONFIG[s].label}</p>
                  </div>
                ))}
                <div className="text-center">
                  <p className="font-mono text-lg font-bold tabular-nums text-[var(--ink)]">{total}</p>
                  <p className="font-sans text-[10px] uppercase tracking-[0.06em] text-[var(--ink-4)]">Totaal</p>
                </div>
              </div>
              <div className="h-2 w-full rounded-full bg-[var(--subtle)] overflow-hidden flex">
                <div className="h-2 bg-green-500 transition-all" style={{ width: `${(counts.afgerond / total) * 100}%` }} />
                <div className="h-2 bg-amber-400 transition-all" style={{ width: `${(counts.testen / total) * 100}%` }} />
                <div className="h-2 bg-blue-400 transition-all" style={{ width: `${(counts.in_ontwikkeling / total) * 100}%` }} />
              </div>
            </div>
          )
        })()}

        <PhaseSection
          id="Productie"
          title="Launch Readiness"
          subtitle="Non-functionele vereisten voor een veilige, betrouwbare productie-release"
          accentColor="#dc2626"
          accentBg="#fef2f2"
          features={PRODUCTIE_FEATURES}
          fase="p"
          overlayMap={overlayMap}
          onStatusChange={handleStatusChange}
          onOpmerkingenChange={handleOpmerkingenChange}
        />
      </div>

      {/* --- Section 5: Bronnen & Methodologie --- */}
      <details className="group rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]">
        <summary className="cursor-pointer select-none px-6 py-4 font-display text-sm font-bold text-[var(--ink)] transition-colors hover:bg-[var(--subtle)]">
          Bronnen &amp; Methodologie
        </summary>
        <div className="border-t border-[var(--border-ed)] px-6 py-5">
          <p className="mb-4 font-serif text-[13px] leading-relaxed text-[var(--ink-2)]">
            Dit onderzoek is uitgevoerd in maart 2026 door analyse van de volledige TriFinity
            codebase (60+ pagina&apos;s, 80+ API routes, 46 widgets) en vergelijking met 30+
            concurrenten:
          </p>
          <div className="space-y-4">
            <div>
              <p className="mb-1 font-sans text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Budgeting (10)
              </p>
              <p className="font-serif text-[12px] leading-relaxed text-[var(--ink-2)]">
                YNAB, Monarch Money, Copilot Money, Simplifi, PocketGuard, Goodbudget,
                EveryDollar, Actual Budget, Honeydue, Tiller Money
              </p>
            </div>
            <div>
              <p className="mb-1 font-sans text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Wealth Management (10)
              </p>
              <p className="font-serif text-[12px] leading-relaxed text-[var(--ink-2)]">
                Empower, Wealthfront, Betterment, Fidelity Full View, Kubera, ProjectionLab,
                Boldin, Delta, Stock Events, Wealthica
              </p>
            </div>
            <div>
              <p className="mb-1 font-sans text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Nederlands/Europees (8)
              </p>
              <p className="font-serif text-[12px] leading-relaxed text-[var(--ink-2)]">
                MijnGeldzaken, Dyme, Grassfeld, Grip, Financieel Fit, Spendee, BudgetBakers
                Wallet, Toshl Finance, Emma
              </p>
            </div>
          </div>
        </div>
      </details>
    </div>
  )
}
