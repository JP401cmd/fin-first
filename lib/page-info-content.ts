/**
 * Page-info content — INZICHT + GRIP voor de "Wat zie ik hier?" info-knop.
 *
 * Elke hoofdpagina (en enkele widget-brede analyse-blokken) heeft twee korte
 * secties: INZICHT (waarom deze pagina/dit blok ertoe doet) en GRIP (wat je
 * er concreet mee kunt doen) — de twee kernwoorden uit de belofte "de
 * vrijheid om met inzicht en grip keuzes te maken voor nu en de toekomst".
 * Wordt getoond in de PageInfoButton-sheet.
 *
 * Gebruik `getPageInfo(key, fallbackKey?)` voor de lookup — nooit rechtstreeks
 * `PAGE_INFO[key]` met een handmatige `?? ''`-fallback, dat verliest het
 * insight/grip-onderscheid.
 */

/**
 * Eén WERKING-item: wat een functie op deze pagina dóet en wanneer je 'm inzet.
 *
 * Uitleggend, nooit normatief (Wft): "hier stel je een limiet in", niet "los
 * eerst je duurste schuld af".
 */
export interface PageInfoWerking {
  /** Korte functienaam, zoals de gebruiker 'm op het scherm terugziet. */
  title: string
  /** Wat het doet en wanneer je het gebruikt — 1-2 platte zinnen. */
  text: string
}

/** Eén VERDER-item: een verwante route binnen de app. */
export interface PageInfoRelated {
  /** Bestaande app-route, bv. '/toekomst/doelen'. */
  href: string
  /** Zichtbaar label, zonder "ga naar". */
  label: string
}

export interface PageInfoContent {
  /** INZICHT — waarom deze pagina/dit blok ertoe doet, 1-2 zinnen. */
  insight: string
  /** GRIP — wat je hier concreet kunt doen, 1-2 zinnen. */
  grip: string
  /**
   * WERKING — hoe de functies op deze pagina werken en wanneer je ze inzet.
   * Max 4 items; blijft leeg voor entries die geen bediening dragen.
   *
   * HARDE VORMEIS: array-van-objecten, **nooit** een object-map met string-keys.
   * `scripts/page-info/check-coverage.mjs` haalt PAGE_INFO-keys op met
   * `^\s*'([^']+)':\s*\{` op élke inspringing — geneste quoted keys zouden
   * daardoor als valse wees gemeld worden. Dat geldt ook voor `related`.
   */
  werking?: PageInfoWerking[]
  /** BEGRIPPEN — keys uit `lib/glossary-data.ts`; renderen als popover-chips. */
  terms?: string[]
  /** VERDER — verwante pagina's; de sheet sluit bij navigatie. */
  related?: PageInfoRelated[]
}

export const PAGE_INFO: Record<string, PageInfoContent> = {
  // ── Overzicht (Kern) ───────────────────────────────────────────────
  '/overzicht': {
    insight:
      'Hoe je ervoor staat in één blik: vier hefbomen — bezittingen, schulden, cashflow, belasting — naast je financiële gezondheidsscore en de voortgang op je doelen. De vermogensgrafiek loopt van je verleden tot je vrijheidsmoment (of, als je dat al haalde, tot je eindleeftijd), met een band eromheen die de bandbreedte toont: de marge waarbinnen je vermogen zich waarschijnlijk beweegt.',
    grip:
      'Klik op een hefboom voor verdieping — het stipje erop is een stoplicht: groen is op koers, oranje vraagt aandacht, rood vraagt actie. Lees de wekelijkse briefing van Fin voor duiding bij de cijfers.',
    werking: [
      {
        // Samengevoegd met het losse item "Het stoplicht op een tegel" (ADR
        // 0130): de WERKING-lijst telt maximaal vier items, en de rondleiding
        // verdient er een. Het stoplicht hoort inhoudelijk bij de tegel waar het
        // op staat, dus die twee gaan samen; er gaat geen uitleg verloren.
        title: 'De vier hefbomen',
        text: 'Bezittingen, schulden, cashflow en belasting zijn de vier plekken waar je iets kunt veranderen. Elke tegel opent de pagina waar je die hefboom beheert. Het stipje erop kleurt op basis van je eigen cijfers, niet op basis van een norm van buiten.',
      },
      {
        title: 'De vermogensgrafiek',
        text: 'Links staat je vastgelegde historie, rechts de projectie. De band eromheen is geen ruis maar bandbreedte: de marge waarbinnen je vermogen zich waarschijnlijk beweegt.',
      },
      {
        title: 'De wekelijkse briefing',
        text: 'Fin leest je cijfers van de afgelopen week en zet ze in gewone taal onder elkaar. Hij verschijnt vanzelf; je hoeft niets te starten.',
      },
      {
        title: 'De rondleiding',
        text: 'Bij je eerste bezoek loopt Fin in twee minuten met je langs de blokken op deze pagina en vertelt wat je cijfers betekenen. Je kunt hem hieronder opnieuw starten, of vanuit de gids in Fin.',
      },
    ],
    terms: ['gezondheidsscore', 'netto_vermogen', 'vrijheidstijd', 'spaarquote', 'bandbreedte', 'kassabon'],
    related: [
      { href: '/overzicht/budget', label: 'Budget — wat er in- en uitgaat' },
      { href: '/toekomst', label: 'Toekomst — je pad naar vrijheid' },
      { href: '/mijn/mijlpalen', label: 'Mijlpalen die je al passeerde' },
    ],
  },
  '/overzicht/bezittingen': {
    insight:
      'Wat er voor je groeit: cash, beleggingen, eigen huis en pensioen, elk met hun eigen waardeontwikkeling en rendement.',
    grip: 'Klik op een bezitting voor het detail, of voeg er een nieuwe toe.',
    werking: [
      {
        title: 'Bezitting toevoegen',
        text: 'Kies een type — spaargeld, beleggingen, vastgoed, pensioen, crypto — en leg de waarde vast. Vanaf dat moment telt hij mee in je vermogen én in je projectie.',
      },
      {
        title: 'Herwaarderen',
        text: 'Werk de actuele waarde bij zodra die verandert. De oude waarde blijft bewaard, zodat verloop en rendement zichtbaar blijven in plaats van te verspringen.',
      },
      {
        title: 'Detail per bezitting',
        text: 'Klik een bezitting open voor de waardeontwikkeling, het rendement en — bij beleggingen — de losse posities eronder.',
      },
      {
        // Samengevoegd met de uitleg over het inclusiepercentage, die tot F3
        // (ADR 0174 D6) in de deck van de pagina stond: de deck is sindsdien
        // twee korte zinnen, en de WERKING-lijst telt maximaal vier items. Beide
        // gaan over hetzelfde: hoe een bezitting meetelt.
        title: 'Hoe je bezittingen meetellen',
        text: 'Het totaal op deze pagina telt elke bezitting voor zijn volle waarde. Je netto vermogen weegt ze naar hun inclusiepercentage en valt daardoor anders uit. Je eigen huis en je pensioenpotten kun je bovendien niet zomaar aanspreken; in Toekomst leg je vast hoe ze meetellen in je vrijheidsberekening.',
      },
    ],
    terms: ['netto_vermogen', 'per_asset_rendement', 'asset_allocatie', 'liquiditeit', 'inclusiepercentage'],
    related: [
      { href: '/overzicht/schulden', label: 'Schulden — de andere kant van de balans' },
      { href: '/rapportages/vermogen', label: 'Je vermogen tot in detail' },
      { href: '/toekomst/voorkeuren', label: 'Aannames achter de projectie' },
    ],
  },

  // Categorie-detail onder /overzicht/bezittingen/[type]. De categoriepagina
  // zoekt op de volledige pathname en valt terug op '/overzicht/bezittingen';
  // een type zonder eigen entry krijgt dus automatisch de overzichtstekst.
  // Alleen de types met eigen jargon staan hier — dat is precies waar de
  // eerste-run-testers op vastliepen.
  '/overzicht/bezittingen/investment': {
    insight:
      'Je beleggingen: wat je inlegde, wat het nu waard is en wat het verschil je aan vrijheidstijd oplevert.',
    grip: 'Open een positie voor het verloop, of werk de waarde bij zodat je rendement blijft kloppen.',
    werking: [
      {
        title: 'Positie of totaalbedrag',
        text: 'Je kunt één bedrag per rekening bijhouden, of de losse posities eronder. Met posities erbij kan de app ook je spreiding en je kosten laten zien.',
      },
      {
        title: 'Rendement per bezitting',
        text: 'Het rendement wordt berekend uit je eigen inleg en waardeverloop, niet uit een marktgemiddelde. Daarom kan het afwijken van wat je broker toont.',
      },
    ],
    terms: ['per_asset_rendement', 'asset_allocatie', 'diversificatie', 'index_etf', 'expense_ratio', 'dividend', 'ETF', 'ter', 'ISIN', 'rebalancing'],
    related: [{ href: '/overzicht/bezittingen', label: 'Al je bezittingen bij elkaar' }],
  },
  '/overzicht/bezittingen/eigen_huis': {
    insight:
      'Je eigen woning telt mee in je vermogen, maar je kunt hem niet zomaar opeten. Daarom krijgt hij in de projectie een eigen behandeling.',
    grip: 'Werk de waarde bij, en leg in Toekomst vast of het huis meetelt, wordt verkocht of wordt opgegeten.',
    werking: [
      {
        title: 'Waarde bijwerken',
        text: 'Zet er de WOZ-waarde of een taxatie in. De oude waarde blijft bewaard, zodat je verloop een lijn blijft in plaats van een sprong.',
      },
      {
        title: 'De hypotheek staat apart',
        text: 'De woning staat bij je bezittingen, de hypotheek bij je schulden. Je overwaarde is het verschil tussen die twee.',
      },
      {
        title: 'Meetellen of niet',
        text: 'In Toekomst kies je hoe het huis in je vrijheidsberekening meetelt. Die keuze verandert je vrijheidsmoment, dus hij hoort bewust gemaakt te worden.',
      },
    ],
    terms: ['netto_vermogen', 'liquiditeit', 'LTV', 'hypotheek'],
    related: [
      { href: '/overzicht/schulden/mortgage', label: 'De hypotheek ernaast' },
      { href: '/toekomst/voorkeuren', label: 'Hoe je huis meetelt in de projectie' },
    ],
  },
  '/overzicht/bezittingen/retirement': {
    insight:
      'Wat er via je werkgever en de AOW voor je klaarstaat. Dat geld komt later, maar het bepaalt nu al hoeveel je zelf nog opzij moet zetten.',
    grip: 'Leg per regeling vast wat je verwacht en vanaf welke leeftijd, dan rekent de projectie het mee.',
    werking: [
      {
        title: 'Uit je pensioenoverzicht',
        text: 'De bedragen op mijnpensioenoverzicht.nl (het UPO) kun je hier overnemen. Verwacht bedrag en ingangsleeftijd zijn de twee die het meeste uitmaken.',
      },
      {
        title: 'Later beschikbaar',
        text: 'Pensioen kun je niet vervroegd aanspreken. In de projectie telt het daarom pas mee vanaf de leeftijd die je invult — de jaren daarvóór moet je zelf overbruggen.',
      },
      {
        title: 'Ruimte om zelf bij te leggen',
        text: 'Bouw je minder op dan fiscaal mag, dan is er jaarruimte. Wat dat voor jou betekent, zie je bij je belastingoverzicht.',
      },
    ],
    terms: ['pensioen', 'upo', 'jaarruimte', 'franchise', 'middelloon', 'AOW'],
    related: [
      { href: '/overzicht/belasting/box1', label: 'Wat pensioen fiscaal doet' },
      { href: '/toekomst', label: 'Je pad tot aan de pensioenleeftijd' },
    ],
  },
  '/overzicht/schulden': {
    insight:
      'Wat je nog terugbetaalt — hypotheek, leningen, studieschuld. Schuld verkort je vrijheid; elke aflossing verlengt hem weer.',
    grip: 'Bekijk je aflossingsplan en heroverweeg het waar het sneller of slimmer kan.',
    werking: [
      {
        title: 'Schuld toevoegen',
        text: 'Leg restschuld, rente en maandlast vast. De app leidt daar zelf uit af wanneer de schuld bij dit tempo op nul staat.',
      },
      {
        title: 'Aflosplan',
        text: 'Per schuld zie je het verloop tot nul, en wat een extra aflossing met die einddatum doet — vóór je hem overmaakt.',
      },
      {
        title: 'Strategieën naast elkaar',
        text: 'Twee bekende volgordes — hoogste rente eerst, of kleinste schuld eerst — worden op jouw schulden doorgerekend. Je ziet het verschil in plaats van erover te lezen; de keuze blijft van jou.',
      },
      {
        title: 'Wat een aflossing teruggeeft',
        text: 'Elke afgeloste euro verlaagt je maandlasten en verkort daarmee de tijd tot je vrijheidsmoment. Dat effect staat naast het bedrag.',
      },
    ],
    terms: ['schuldgraad', 'annuiteit', 'avalanche', 'hypotheek', 'LTV'],
    related: [
      { href: '/overzicht/bezittingen', label: 'Bezittingen — de andere kant van de balans' },
      { href: '/rapportages/balans', label: 'Balans op één peildatum' },
    ],
  },

  // Categorie-detail onder /overzicht/schulden/[type] — zelfde
  // pathname-met-terugval-mechanisme als bij bezittingen. De hypotheek krijgt
  // een eigen entry omdat juist daar de meeste onbekende woorden staan.
  '/overzicht/schulden/mortgage': {
    insight:
      'Je hypotheek is meestal je grootste schuld én je langste. Elke euro rente is tijd die je aan de bank betaalt in plaats van aan jezelf.',
    grip: 'Bekijk het verloop tot nul, en zie wat extra aflossen doet vóór je het overmaakt.',
    werking: [
      {
        title: 'Aflosvorm',
        text: 'Bij een annuïteit blijft je maandbedrag gelijk en verschuift de verhouding rente-aflossing. Bij aflossingsvrij betaal je alleen rente en blijft de schuld staan tot het einde van de looptijd.',
      },
      {
        title: 'Rentevastperiode',
        text: 'Je rente staat vast tot een afgesproken datum. Daarna wordt hij opnieuw bepaald, en verandert je maandlast mee. Leg die datum vast, dan kan de projectie er rekening mee houden.',
      },
      {
        title: 'Schuld tegenover waarde',
        text: 'De verhouding tussen je restschuld en de waarde van je woning heet de LTV. Hoe lager die wordt, hoe gunstiger je rente bij een volgende herziening meestal uitvalt.',
      },
      {
        title: 'Wat extra aflossen teruggeeft',
        text: 'Extra aflossen verlaagt je maandlast en daarmee het bedrag dat je nodig hebt om vrij te zijn. Dat effect staat naast het bedrag, in tijd.',
      },
    ],
    terms: ['hypotheek', 'annuiteit', 'LTV', 'schuldgraad'],
    related: [
      { href: '/overzicht/bezittingen/eigen_huis', label: 'De woning ernaast' },
      { href: '/overzicht/schulden', label: 'Al je schulden bij elkaar' },
    ],
  },
  // Eén entry voor de Budget-hefboom. Hier stonden er twee — de cashflow-hub en
  // de budgetpagina eronder — die na de verhuizing (UR3-28) dezelfde route
  // beschreven. Samengevoegd in plaats van er één te laten winnen: de pagina is
  // nu allebei, de hefboom én de plek waar je je budgetten beheert.
  '/overzicht/budget': {
    insight:
      'Wat er binnenkomt en wat eruit gaat. Het deel van je inkomen dat je opzij zet, bepaalt hoe snel je bij je vrijheidsmoment komt.',
    grip:
      'Stel per categorie een limiet in en volg gedurende de maand hoeveel ruimte je nog hebt — wat je overhoudt, is vrijheid die je opbouwt. Je transacties, vaste lasten en vooruitblik staan bovenaan.',
    werking: [
      {
        title: 'Limiet per categorie',
        text: 'Je stelt zelf een maandbedrag in. De balk vult zich met wat er tot nu toe geboekt is, zodat de resterende ruimte zichtbaar blijft in plaats van pas achteraf.',
      },
      {
        title: 'Automatisch categoriseren',
        text: 'Categoriseren is elke transactie bij het juiste budget zetten — zo zie je per budget wat erin en eruit gaat. Nieuwe transacties categoriseert de app zelf. Klopt er een niet, dan pas je die aan bij de transactie; het budget rekent direct opnieuw.',
      },
      {
        title: 'Vrijheidsdagen per post',
        text: 'Achter elk budget staat wat het aan vrijheidstijd kost: het maandbedrag afgezet tegen je eigen dagelijkse uitgaven. Dezelfde cijfers staan in meerdere vormen — lijst, verdeling en verloop — voor wie liever ziet dan leest.',
      },
      {
        title: 'Vier tegels bovenaan',
        text: 'Transacties zijn de losse boekingen achter de totalen, vaste lasten je terugkerende kosten, en de vooruitblik trekt je huidige patroon zes maanden door — als peiling, niet als scenario. Voor scenario’s ga je naar Toekomst. De vierde tegel is Instellingen: daar staat je schatting van inkomen, uitgaven en spaarquote, en kies je welke rekeningen meelopen.',
      },
    ],
    terms: ['spaarquote', 'vrijheidstijd'],
    related: [
      { href: '/overzicht/budget/transacties', label: 'Transacties achter deze budgetten' },
      { href: '/overzicht/budget/forecast', label: 'Vooruitblik van zes maanden' },
      { href: '/overzicht/budget/instellingen', label: 'Waar je cijfers op rusten' },
      { href: '/rapportages/budget', label: 'Budgetrapport om af te drukken' },
    ],
  },
  '/overzicht/budget/instellingen': {
    insight:
      'Twee knoppen bepalen wat je overal elders ziet: waar je schatting van inkomen en uitgaven op rust, en welke rekeningen meelopen. Klopt dit niet, dan klopt je spaarquote en je vrijheidsmoment ook niet.',
    grip:
      'Kies of je cijfers op je transacties rusten of op je eigen schatting, en vink aan welke betaal- en spaarrekeningen meetellen. Beide werken direct door in je budgetten, je geldstroom en je horizon.',
    werking: [
      {
        title: 'Grondslag per post',
        text: 'Inkomen, uitgaven en spaarquote kunnen elk op iets anders rusten: je gemeten transacties, je budgetten, of een bedrag dat je zelf invult. Bij elke post staat waar het getal vandaan komt, zodat je nooit een cijfer ziet zonder herkomst.',
      },
      {
        title: 'Rekeningen die meelopen',
        text: 'Alleen transacties van aangevinkte rekeningen tellen mee. Dezelfde vinkjes staan per rekening bij je bezittingen — het is één keuze, dus je kunt ze niet uit elkaar laten lopen. Zet je de laatste rekening uit, dan valt budgetteren stil; daar vragen we eerst om bevestiging.',
      },
      {
        title: 'Onderlinge overboekingen',
        text: 'Laat je twee eigen rekeningen meelopen, dan verschijnt een overboeking daartussen twee keer: als afboeking én als bijboeking. Boek die op de post "Eigen rekening" — daar verschuift het geld wel, maar telt het niet als uitgave of inkomst. Doe je dat niet, dan lijkt je maand duurder én rijker dan hij was en zakt je spaarquote ten onrechte.',
      },
      {
        title: 'Wat we zelf herkennen',
        text: 'Een overboeking naar een rekening waarvan we het rekeningnummer kennen, boeken we automatisch op "Eigen rekening". Twee bedragen die alleen toevallig spiegelen — zelfde bedrag, tegengesteld teken, binnen twee dagen — leggen we aan je voor in plaats van ze stil te verplaatsen; een echte uitgave en een toevallige ontvangst zien er namelijk hetzelfde uit.',
      },
    ],
    terms: ['spaarquote', 'vrijheidstijd'],
    related: [
      { href: '/overzicht/budget', label: 'Terug naar je budgetten' },
      { href: '/overzicht/budget/transacties', label: 'Transacties categoriseren' },
      { href: '/overzicht/bezittingen', label: 'Je rekeningen bij Bezittingen' },
    ],
  },
  '/overzicht/budget/transacties': {
    insight:
      'Alles wat er deze maand in en uit gaat, met je geldstroom per categorie en je spaarquote van de maand. Elke transactie kost of levert tijd op — daarom staat er bij bedragen ook wat ze aan vrijheidstijd betekenen.',
    grip: 'Filter en doorzoek je boekingen, of koppel een rekening zodat nieuwe transacties automatisch binnenkomen. Deel je een huishouden, dan zet je een gedeelde boeking met één klik op jullie lijst "Te bespreken" — alleen boekingen die je partner ook ziet.',
    werking: [
      {
        // Draagt wat de pagina-aanhef sinds de kop-herziening (sep 2026) niet
        // meer kwijt kan: de drempels achter het oordeel in de titel, en waarom
        // dat oordeel halverwege de maand kan uitblijven.
        title: 'Het oordeel in de titel',
        text: 'De titel toont je spaarquote-oordeel over de lopende kalendermaand: vanaf 20% ben je goed op koers, tussen 0% en 20% is het krap, daaronder is er een tekort. Is je inkomen deze maand nog niet binnen, dan blijft het oordeel uit in plaats van een tekort te melden dat er aan het eind van de maand niet is.',
      },
      {
        title: 'Filteren en zoeken',
        text: 'Zoek op tekst, bedrag of periode, en beperk de lijst tot één categorie of rekening.',
      },
      {
        title: 'Categorie corrigeren',
        text: 'Open een boeking en kies een andere categorie. Je budgetten en je spaarquote rekenen meteen mee — je hoeft niets opnieuw te laden.',
      },
      {
        // Koppelen en importeren samengevoegd: de WERKING-lijst telt maximaal
        // vier items, en het oordeel-item hierboven draagt sinds de
        // kop-herziening de uitleg die de pagina-aanhef niet meer kwijt kan.
        // Beide gaan over hetzelfde: transacties de app in krijgen.
        title: 'Transacties binnenkrijgen',
        text: 'Koppel je bank en nieuwe transacties komen vanzelf binnen. Of lees een export van je bank in (CSV, MT940 of OFX) — boekingen die je al had worden herkend, ook als ze via een andere bron binnenkwamen. Handmatig invoeren blijft altijd mogelijk; een koppeling is nooit verplicht.',
      },
    ],
    terms: ['spaarquote', 'psd2'],
    related: [
      { href: '/overzicht/budget', label: 'Budgetten die hierop meelopen' },
      { href: '/mijn/koppelingen', label: 'Je koppelingen beheren' },
    ],
  },
  '/overzicht/budget/vaste-lasten': {
    insight:
      'Je abonnementen en terugkerende kosten op één plek, uitgedrukt in hoeveel vrijheidstijd ze je kosten. Elke euro minder vaste last levert tijd op.',
    grip:
      'Onder de lijst staat je vaste-lastenquote — het aandeel van je inkomen, met Nibud-duiding — en je abonnementen-sluipverbruik ten opzichte van het gemiddelde. In Volledig zie je ook de samenstelling per categorie.',
    werking: [
      {
        title: 'Herkende abonnementen',
        text: 'Terugkerende afschrijvingen worden uit je transacties gehaald en als vaste last gegroepeerd. Mist er een, of hoort er een niet thuis, dan pas je dat hier aan.',
      },
      {
        title: 'Vaste-lastenquote',
        text: 'Het deel van je inkomen dat elke maand al vastligt voordat je iets uitgeeft. De Nibud-duiding ernaast is een spiegel, geen norm waar je aan moet voldoen.',
      },
      {
        title: 'Sluipverbruik',
        text: 'Abonnementen waarvan het bedrag ongemerkt is opgelopen, of die boven het gemiddelde uitkomen, worden apart gezet.',
      },
      {
        title: 'Opzeghulp',
        text: 'Bij een abonnement dat je wilt stoppen staan de gegevens die je voor de opzegging nodig hebt bij elkaar, met een opzegbrief die je meteen kunt gebruiken.',
      },
    ],
    terms: ['vrijheidstijd', 'spaarquote'],
    related: [
      { href: '/overzicht/budget/transacties', label: 'Transacties achter deze posten' },
      { href: '/overzicht/budget', label: 'Budgetten per categorie' },
    ],
  },
  '/overzicht/budget/forecast': {
    insight:
      'Je spaarquote, maandelijks netto en uitgaventrend in één blik, met een vooruitblik van 6 maanden op basis van je baseline en vaste lasten.',
    grip:
      'Volg hoe je saldo zich naar verwachting ontwikkelt; deze blik is lineair — voor een scenario-diepere projectie ga je naar Toekomst.',
    // 'forecast' staat hier bewust als begrip, terwijl de pagina zelf
    // "Vooruitblik" heet (UR3-13 F2, optie C): wie het Engelse woord elders
    // tegenkomt, vindt hier waar het bij ons over gaat.
    terms: ['forecast', 'spaarquote', 'vrijheidstijd'],
  },
  '/overzicht/belasting': {
    insight:
      'Wat je betaalt over inkomen (Box 1), aanmerkelijk belang (Box 2) en vermogen (Box 3) — en waar slim verdelen over de bakjes je geld per jaar kan schelen.',
    grip: 'Klik een box aan voor de berekening en de besparingskansen die daarbij horen.',
    werking: [
      {
        title: 'Drie boxen, apart gerekend',
        text: 'Box 1 (werk en woning), Box 2 (aanmerkelijk belang) en Box 3 (vermogen) hebben elk hun eigen regels. Klik een box open voor de opbouw op jouw gegevens.',
      },
      {
        title: 'Kassabon achter elk bedrag',
        text: 'Elk belastingbedrag is uit te klappen tot de stappen waaruit het is opgebouwd, met de tarieven en grenzen van het lopende belastingjaar erbij.',
      },
      {
        title: 'Kansen',
        text: 'De optimizer zet fiscale keuzes die op jouw situatie van toepassing zijn onder elkaar, doorgerekend in euro’s. Een indicatie om mee te denken, geen advies.',
      },
    ],
    terms: ['box_3', 'vermogensbelasting', 'heffingsvrij_vermogen', 'forfaitair_rendement'],
    related: [
      { href: '/overzicht/belasting/box3', label: 'Box 3 in detail' },
      { href: '/overzicht/belasting/optimizer', label: 'Fiscale kansen doorgerekend' },
    ],
  },
  '/overzicht/belasting/box1': {
    insight:
      'Box 1 belast inkomen uit werk en woning. TriFinity laat een orde-grootte-schatting van je Box 1-druk zien.',
    grip:
      'Bekijk je onbenutte jaarruimte — de pensioen-aftrekruimte waarmee je via een lijfrente-inleg belasting kunt besparen.',
  },
  '/overzicht/belasting/box2': {
    insight:
      'Box 2 belast inkomen uit aanmerkelijk belang: dividend en vervreemdingswinst voor wie 5% of meer van de aandelen in een vennootschap bezit, bijvoorbeeld een eigen bv.',
    grip: 'Heb je een deelneming? Voeg die toe als bezitting, dan rekent TriFinity Box 2 automatisch voor je uit.',
    terms: ['aanmerkelijk_belang', 'dividend', 'vervreemdingswinst'],
  },
  '/overzicht/belasting/box3': {
    insight:
      'Box 3 belast je vermogen — sparen en beleggen — via een forfaitair (fictief) rendement boven je heffingsvrije vermogen.',
    grip:
      'Zie in één oogopslag hoe vrijstelling, partner-verdeling en je mix spaargeld/beleggingen samen je jaarlijkse heffing bepalen.',
    werking: [
      {
        title: 'Heffingsvrij vermogen',
        text: 'Een deel van je vermogen blijft buiten de heffing. Alleen wat daarboven uitkomt, telt mee in de berekening.',
      },
      {
        title: 'Forfaitair rendement',
        text: 'De Belastingdienst rekent met een verondersteld rendement per soort bezitting — voor spaargeld anders dan voor beleggingen — niet met wat jij werkelijk hebt verdiend.',
      },
      {
        title: 'Verdeling met een fiscaal partner',
        text: 'Samen mag je de gezamenlijke grondslag verdelen. De pagina laat zien wat een andere verdeling met de heffing doet; de aangifte doe je zelf.',
      },
      {
        title: 'Tegenbewijs',
        text: 'Was je werkelijke rendement lager dan het forfait, dan kun je dat onder voorwaarden aantonen. De pagina zet beide bedragen naast elkaar zodat je ziet of het scheelt.',
      },
    ],
    terms: ['box_3', 'heffingsvrij_vermogen', 'forfaitair_rendement', 'tegenbewijs'],
    related: [
      { href: '/overzicht/belasting/optimizer', label: 'Fiscale kansen doorgerekend' },
      { href: '/overzicht/bezittingen', label: 'De bezittingen waar dit op rust' },
    ],
  },
  '/overzicht/belasting/optimizer': {
    insight:
      'Al je fiscale doelen onder elkaar, doorgerekend op je eigen gegevens: Box 3-scenario’s (de mix sparen/beleggen en, met een fiscaal partner, de optimale verdeling) en je Box 1-jaarruimte.',
    grip:
      'Vergelijk de scenario’s naast elkaar in euro’s en vrijheidsdagen om te kiezen waarop je stuurt — het blijft een indicatie, geen advies.',
    werking: [
      {
        title: 'Doorgerekend op je eigen cijfers',
        text: 'Elke kans rekent met jouw bezittingen, schulden en inkomen — niet met een voorbeeldhuishouden. Verandert er iets in je gegevens, dan schuift de uitkomst mee.',
      },
      {
        title: 'Euro’s én vrijheidstijd',
        text: 'Naast het jaarbedrag staat wat de keuze aan vrijheidstijd scheelt. Daardoor worden kansen van heel verschillende omvang toch vergelijkbaar.',
      },
      {
        title: 'Onbenutte jaarruimte',
        text: 'De aftrekruimte voor pensioenopbouw die je dit jaar nog niet hebt gebruikt, afgeleid uit je inkomen en je bestaande opbouw.',
      },
      {
        title: 'Waar de app ophoudt',
        text: 'TriFinity rekent voor en legt uit; de keuze en de aangifte blijven van jou. Voor persoonlijk advies is een adviseur met vergunning nodig.',
      },
    ],
    terms: ['box_3', 'heffingsvrij_vermogen', 'pensioen', 'jaarruimte', 'optimizer'],
    related: [
      { href: '/overzicht/belasting/box3', label: 'Box 3 in detail' },
      { href: '/overzicht/belasting/box1', label: 'Box 1 en je jaarruimte' },
    ],
  },
  '/overzicht/tips': {
    insight:
      'Suggesties van Fin, gebaseerd op je chat of analyse van je cijfers: toptips bovenaan, openstaande acties eronder.',
    grip: 'Beslis per tip met Doe nu, Later of Negeren — accepteer je er een, dan landt hij automatisch op je actielijst.',
  },

  // ── Toekomst (Horizon) ───────────────────────────────────────────────
  '/toekomst': {
    insight:
      'Deze tijdas laat zien waar je financieel heen gaat: de opbouwjaren (groen) en de afbouwjaren (oranje) tot je gekozen eindleeftijd, met doelen, levensgebeurtenissen en voorkeuren die samen je route bepalen.',
    grip:
      'Sleep een gebeurtenis naar een ander jaar en zie meteen hoe je vrijheidsmoment verschuift; van hieruit open je doelen, gebeurtenissen en voorkeuren om de projectie bij te stellen. Heet de Voorkeuren-kaart "Je voorkeuren voor je plan instellen", dan loop je daar stap voor stap na waar de app mee rekent en wat een andere keuze doet.',
    werking: [
      {
        title: 'De tijdas lezen',
        text: 'Groen zijn de jaren waarin je opbouwt, oranje de jaren waarin je afbouwt. Het omslagpunt is het moment waarop je vermogen je uitgaven kan dragen.',
      },
      {
        title: 'Gebeurtenissen slepen',
        text: 'Sleep pensioen, een verhuizing of een erfenis naar een ander jaar; de projectie rekent direct opnieuw. Je verandert alleen het plan, niet je vastgelegde gegevens.',
      },
      {
        title: 'Doelen op de as',
        text: 'Elk doel verschijnt op het jaar waarin het valt, zodat zichtbaar wordt of doelen elkaar in de weg zitten of juist versterken.',
      },
      {
        title: 'Aannames erachter',
        text: 'Rendement, inflatie, je uitgaven na pensioen en je eindleeftijd bepalen samen de uitkomst. Je stelt ze zelf in bij Voorkeuren — een kleine bijstelling kan jaren schelen. Onder de grafiek staat je doelscenario: vijf knoppen — meer verdienen, minder uitgeven, je uitgave na pensioen, je nalatenschap en je stopleeftijd — waaraan je draait zonder je plan te wijzigen. Elke knop kleurt rood, oranje of groen: rood betekent dat je plan het niet haalt, oranje dat het net haalt, groen dat er ruim marge in zit. De regel onder een knop zegt vanaf welke stand die grens ligt, en zodra je één knop verschuift, bewegen de grenzen op de andere knoppen mee — ze hangen immers van elkaar af. Onderaan staat of je verkenning al als doel is opgeslagen. Je AOW telt alleen mee als er een actieve AOW-gebeurtenis op je tijdas staat; ontbreekt die, dan rekent de projectie met €0 AOW en zegt een melding boven de grafiek dat. Standaard rekent je plan zonder blijvende tekort-lening: je vrijheidsleeftijd is het vroegste moment waarop je zonder zo’n lening rondkomt. Kies je een vast stopmoment en is je vermogen onderweg op, dan overbrugt de projectie het gat met een tekort-lening en meldt dat boven de grafiek; bij Voorkeuren stel je in of je plan zo’n lening mag gebruiken. Blijft er aan het eind van je plan veel meer over dan je gekozen eind-vorm doet verwachten, dan legt een melding boven de grafiek uit welke regels dat in deze berekening veroorzaken.',
      },
    ],
    terms: ['fire', 'vrijheidstijd', 'swr', 'inflatie', 'omslagpunt', 'stopmoment', 'bandbreedte', 'tekort_lening'],
    related: [
      { href: '/toekomst/doelen', label: 'Je doelen beheren' },
      { href: '/toekomst/gebeurtenissen', label: 'Levensgebeurtenissen op je tijdas' },
      { href: '/toekomst/voorkeuren', label: 'Aannames achter de projectie' },
    ],
  },

  // NB: /toekomst/strategie en /toekomst/uitgaven-na-pensioen hadden hier een
  // entry, maar renderen sinds de React #310-opruiming (11 aug 2026) geen
  // pagina meer — ze redirecten op de routing-laag (next.config.ts) naar de
  // Gebeurtenissen-tab resp. de uitgaven-pane op /toekomst. De `i` van die
  // oppervlakken hoort bij hun eigen route, niet bij een dood adres.

  '/toekomst/inflatie-koopkracht': {
    insight:
      'Inflatie knaagt onopgemerkt aan je vermogen — in stille jaren zonder dat je het voelt, terwijl het je vrijheidsdoel wel degelijk verder weg duwt.',
    grip:
      'Bekijk hoe €100 van vandaag aanvoelt over 10, 20 of 30 jaar en reken je doel om in koopkracht in plaats van kale euro’s.',
  },
  // '/toekomst/samengestelde-interest' stond hier tot UR3-26. De losse
  // calculator had nul ingangen en redirect nu naar de rekenhulp-bibliotheek;
  // de rente-op-rente-uitleg zelf staat op de compound-insight-kaart bij de
  // bezittingen. Een info-tekst voor een dood adres hoort hier niet.
  '/toekomst/doelen': {
    insight:
      'Elk doel hier is een stuk vrijheid dat je opbouwt — zie in één oogopslag hoeveel je al hebt, wat er nog te gaan is en of je op koers ligt, loopt achter of aandacht nodig hebt.',
    grip:
      'Voeg een doel toe als bedrag, of koppel het aan één of meer bezittingen en schulden zodat het netto meerekent met wat je opbouwt en aflost — of zet het op een kengetal dat de app al bijhoudt (spaarquote, netto vermogen, vrijheidsleeftijd, noodfonds, passief inkomen, belastingdruk, schuldenvrij-moment, eindkapitaal), dan werkt het vanzelf mee. Doelen van twee jaar of verder krijgen automatisch een seintje bij 25%, 50% en 75%; is een doel behaald, dan wordt dat gevierd en verhuist het naar het archief onderaan, met meteen een suggestie voor de volgende stap. Je eigen doelen staan bovenaan; doelen uit je doelsituatie pas je aan in het Toekomst-lab. Ligt je stopmoment vast, dan volgt het doel "Plan gedekt" daar of je plan tot je eindleeftijd reikt. Verandert je plan zó dat een doel uit het lab er niet meer bij past, dan zie je dat bovenaan in één regel — bijwerken of loslaten, niets verdwijnt vanzelf.',
    werking: [
      {
        title: 'Doel als bedrag',
        text: 'Leg een streefbedrag en een datum vast. De voortgang loopt daarna mee met wat je opbouwt, zonder dat je hem bijhoudt.',
      },
      {
        title: 'Doel gekoppeld aan bezittingen',
        text: 'Koppel bezittingen en schulden aan een doel, dan telt de voortgang nétto mee: wat je opbouwt minus wat er nog openstaat.',
      },
      {
        title: 'Doel op een kengetal',
        text: 'Kies een getal dat de app al bijhoudt — spaarquote, netto vermogen, vrijheidsleeftijd, noodfonds, passief inkomen, belastingdruk, schuldenvrij-moment of eindkapitaal — dan werkt het doel vanzelf mee.',
      },
      {
        title: 'Seintjes en archief',
        text: 'Doelen van twee jaar of verder geven een seintje bij 25, 50 en 75 procent. Behaalde doelen worden gevierd en verhuizen naar het archief onderaan.',
      },
    ],
    terms: ['spaarquote', 'netto_vermogen', 'noodfonds', 'passief_inkomen'],
    related: [
      { href: '/toekomst', label: 'Je doelen op de tijdas' },
      { href: '/mijn/mijlpalen', label: 'Mijlpalen die je al passeerde' },
    ],
  },
  '/toekomst/gebeurtenissen': {
    insight:
      'Een kind, een erfenis, een verhuizing of minder werken — elke levensgebeurtenis op je tijdas verschuift je vrijheidsmoment. Ook momenten die je plan zelf berekent, zoals het stoppen van een pensioenpot, staan hier.',
    grip: 'Voeg een gebeurtenis toe of sleep ’m naar een ander jaar en zie meteen het effect op je pad naar vrijheid. Je AOW, pensioen, huis en werk stel je in bij Voorkeuren.',
  },
  '/toekomst/voorkeuren': {
    insight:
      'Achter elke projectie zitten aannames — verwacht rendement, inflatie, je uitgaven na pensioen, je eindleeftijd — en die bepalen samen hoeveel jaar vrijheid je berekening laat zien.',
    grip: 'Draai hier aan die knoppen; een kleine bijstelling kan je uitkomst met jaren verschuiven. Ook je AOW-, pensioen-, huis- en werkstrategie stel je hier in. Liever stap voor stap? "Je voorkeuren voor je plan instellen" zet de belangrijkste keuzes met hun effect op een rij.',
    // De plan-regel (ADR 0129) is hier twee vragen: wanneer stop je, en wat moet
    // er aan het eind gelden. De opties van die twee vragen zijn precies deze
    // begrippen — als radio-label kunnen ze geen popover dragen, dus staan ze
    // als chip op de `i` van de pagina waar je ze kiest.
    terms: [
      'stopmoment',
      'stopanker_solved',
      'stopanker_aow',
      'stopanker_age',
      'stopanker_now',
      'eindstrategie_deplete',
      'eindstrategie_legacy',
      'eindstrategie_perpetual',
      'tekort_lening',
    ],
  },
  '/toekomst/bibliotheek': {
    insight:
      'Verkenningen die je niet meteen weer kwijt wilt raken horen hier: je wat-als-scenario’s en berekeningen op één plek.',
    grip: 'Open een opgeslagen scenario om verder te bouwen, of leg het naast je huidige plan om te vergelijken.',
  },
  '/toekomst/rekenhulp': {
    insight:
      'Een keuze kost of levert tijd. Hier reken je er één door — huren of kopen, extra aflossen, een auto vervangen — en zie je wat hij met je vrijheid doet.',
    grip: 'Vul een rekenhulp met je eigen cijfers, of laat Fin er een maken en bewaar hem voor later.',
    werking: [
      {
        title: 'Vooringevuld met jouw cijfers',
        text: 'Bedragen die de app al kent — inkomen, uitgaven, vermogen, rente — staan alvast ingevuld. Je overschrijft ze gerust; dat verandert niets aan je echte gegevens.',
      },
      {
        title: 'Zelf een rekenhulp laten maken',
        text: 'Beschrijf de vraag in gewone taal en Fin bouwt de bijbehorende berekening. Je ziet de formule, dus je kunt hem controleren voor je erop leunt.',
      },
      {
        title: 'Bewaren en delen',
        text: 'Een rekenhulp die je vaker gebruikt bewaar je onder je eigen naam. Publiceren mag ook; dan kunnen anderen hem kopiëren en aanpassen.',
      },
      {
        title: 'Een verkenning, geen advies',
        text: 'De uitkomst is een doorrekening van wat jij invult. Wat je met die uitkomst doet, blijft jouw keuze.',
      },
    ],
    terms: ['vrijheidstijd', 'compounding', 'annuiteit'],
    related: [
      { href: '/toekomst', label: 'Wat-als op je hele plan' },
      { href: '/toekomst/bibliotheek', label: 'Wat je eerder bewaarde' },
    ],
  },

  // ── Horizon-fallbacks (embedded /horizon-varianten) ─────────────────
  '/horizon': {
    insight:
      'Deze projectie laat zien wanneer je financieel vrij bent en hoe scenario’s en levensgebeurtenissen dat pad beïnvloeden.',
    grip: 'Voeg gebeurtenissen toe of pas parameters aan om je plan te verkennen.',
  },

  // ── Toekomst — fase-analyse-modals (widget-brede uitleg, geen route) ─
  '/toekomst/fase-opbouw/intro': {
    insight:
      'De opbouwfase loopt van nu tot je FIRE-leeftijd: de jaren waarin je actief vermogen opbouwt en waarin elke keuze het meeste hefboom heeft.',
    grip:
      'Bekijk hieronder hoe inleg, rendement en Box 3-belasting je vermogen vormen, en welke keuzes — extra sparen, schulden aflossen, hypotheek versus beleggen — je vrijheid versnellen.',
  },
  '/toekomst/fase-opbouw/hefbomen': {
    insight:
      'Niet elke knop weegt even zwaar — in de opbouwfase wordt je vrijheid vooral bepaald door je spaarquote, je rendement en hoe laag je kosten zijn.',
    grip:
      'Lees de balklengte als relatief gewicht, geen euro’s: hoe langer de balk, hoe zwaarder die hefboom meetelt. Alleen het rendement is een concreet getal (jouw eigen verwachting); de rest lees je kwalitatief.',
  },
  '/toekomst/fase-overgang/intro': {
    insight:
      'Vallen stoppen met werken en je AOW niet samen, dan ontstaat een brug die je zelf moet financieren — de overgangsfase draait om hoe stevig die brug is.',
    grip:
      'Bekijk de kassabon van die jaren, een Monte Carlo-simulatie van het risico, strategie-opties, de impact van deeltijdwerk en wat nodig is om eerder te stoppen.',
  },
  '/toekomst/fase-overgang/dekking': {
    insight:
      'In de brugjaren komt je inkomen niet vanzelf binnen — deze radar laat zien waar de dekking van je uitgaven vandaan moet komen.',
    grip:
      'Lees de balk als relatief gewicht ten opzichte van de zwaarste bron: vermogen is het bruggeld dat je onttrekt, AOW en pensioen komen exact uit je projectie. Draagt AOW nog niets bij, dan rust het gewicht volledig op je vermogen.',
  },
  '/toekomst/fase-onttrekking/intro': {
    insight:
      'Eenmaal gestopt draait alles om hoelang je vermogen meegaat en welke risico’s die afbouwfase kunnen ondermijnen.',
    grip:
      'Bekijk de Monte Carlo-slagingskans, het volgorde-risico van de eerste jaren, koopkrachterosie door inflatie, de keuze om je huis te behouden of verkopen, en wat je nalaat aan het einde.',
    terms: ['SORR', 'Monte_Carlo', 'inflatie'],
  },
  '/toekomst/fase-onttrekking/inkomen': {
    insight: 'Hoe je jaarinkomen in de afbouwfase is samengesteld, bepaalt hoeveel druk er op je vermogen staat.',
    grip:
      'Lees de balk als relatief gewicht per bron: AOW en pensioen zijn vast, de rest onttrek je aan je vermogen. De cijfers komen exact uit je projectie — hoe meer vaste inkomsten, hoe minder je vermogen hoeft te dragen.',
  },

  // ── Mijn (Wil) + Berichten + Nieuws ──────────────────────────────────
  '/mijn': {
    insight:
      'Alles wat je gegevens en voorkeuren bepaalt staat hier verzameld, gescheiden per onderwerp in plaats van in één lange lijst.',
    grip:
      'Beheer profiel, partner, privacy en koppelingen, stel voorkeuren in voor notificaties, uiterlijk en de personalisatie van je Overzicht, en exporteer rapportages.',
    terms: ['soevereiniteit'],
  },
  '/mijn/profiel': {
    insight:
      'Je naam, geboortedatum, partnerstatus en kinderen vormen de basis waarop elke berekening in de app rust — klein draaien hier verschuift je hele projectie.',
    grip: 'Werk je persoonlijke gegevens en huishoudsamenstelling hier bij zodra ze veranderen.',
  },
  '/mijn/privacy': {
    insight:
      'Grip begint bij inzicht in wat er over je wordt opgeslagen — per data-categorie leggen we hier helder uit wat we bewaren, waar en waarom. Geen juridische verplichting, maar een merkpijler.',
    grip: 'Verberg je bedragen met de schakelaar bovenaan, of vraag direct een export van je data op (JSON), of verwijder je account, rechtstreeks vanaf deze pagina.',
    werking: [
      {
        title: 'Fin en je gegevens: jouw keuze',
        text: 'AI staat pas aan nadat jij daar ja tegen hebt gezegd — dat vragen we de eerste keer dat je een AI-functie opent. Hier zie je wanneer je koos en zet je die keuze op elk moment om. Elke keuze wordt vastgelegd; zeg je nee, dan gaat er niets meer naar een AI-aanbieder en werkt de app als financieel dagblad zonder Fin.',
      },
      {
        title: 'Bedragen verbergen',
        text: 'Toont overal •••• in plaats van bedragen — handig op een trein of in een openbare ruimte. Geldt voor dit apparaat, niet voor je account; op een ander apparaat zet je hem apart aan. Snel wisselen kan ook met het zoekscherm (⌘K).',
      },
    ],
  },
  '/mijn/koppelingen': {
    insight:
      'Hoe minder je handmatig hoeft in te voeren, hoe actueler en betrouwbaarder je cijfers — automatische koppelingen schelen telkens een import.',
    grip: 'Koppel of ontkoppel per dienst: PSD2-bank, UPO-pensioenoverzicht en crypto-brokerage.',
    werking: [
      {
        title: 'Bankkoppeling',
        text: 'Via de wettelijk geregelde PSD2-route haalt de app je transacties op. Je geeft per bank toestemming, en die toestemming verloopt na verloop van tijd — verlengen doe je hier.',
      },
      {
        title: 'Pensioenoverzicht',
        text: 'Lees je UPO in, dan rekent de projectie met je werkelijke opbouw in plaats van met een schatting.',
      },
      {
        title: 'Beleggingen en crypto',
        text: 'Koppel een beleggingsrekening of wallet zodat posities en koersen meelopen zonder dat je ze handmatig bijwerkt.',
      },
      {
        title: 'Altijd terug te draaien',
        text: 'Ontkoppelen kan hier op elk moment, per dienst. Een koppeling is nooit verplicht: alles in de app werkt ook met handmatige invoer.',
      },
    ],
    terms: ['psd2', 'upo'],
    related: [
      { href: '/mijn/privacy', label: 'Wat we bewaren, en waarom' },
      { href: '/overzicht/budget/transacties', label: 'De transacties die binnenkomen' },
    ],
  },
  '/mijn/jaaroverzicht': {
    insight:
      'Eén afgelopen jaar, gemeten in tijd: gewonnen vrijheidsdagen per maand, je vermogen van begin tot eind en de rekening eronder — wat er binnenkwam, wat eruit ging en wat er overbleef. Bijna alles hier is historie; alleen het vrijheidsdoel in het laatste katern rust op je persoonlijke opnamepercentage en je huidige essentiële budgetten.',
    grip: 'Bekijk je beste en zwakste spaarmaand terug en zie in één oogopslag hoe het jaar je vermogen en vrijheid heeft bewogen.',
  },
  '/mijn/mijlpalen': {
    insight:
      'Elke drempel die je passeerde — vermogen, vrijheidspercentage, schuldenvrij, noodfonds en je eigen doelen — staat hier vastgelegd met datum, per jaar gegroepeerd, en verdwijnt niet meer, ook niet als je er later weer onder zakt.',
    grip:
      'Bekijk je mijlpalen terug; bij "omstreeks" is de datum afgeleid uit je maandelijkse vermogenssnapshots in plaats van verzonnen, en een mijlpaal die niet te dateren was staat eerlijk onder "Zonder datum". Wat nog vóór je ligt, met een verwachte datum, vind je op Toekomst.',
  },
  '/mijn/account': {
    insight:
      'Je abonnement en accountstatus in één overzicht, inclusief welke add-ons (AI, Connected) actief zijn.',
    grip: 'Wijzig je e-mail of wachtwoord, log overal uit, of verwijder je account definitief in de danger zone.',
  },
  '/mijn/notificaties': {
    insight:
      'Alleen meldingen die er voor jou toe doen houden je scherp — te veel ruis en je mist het signaal dat wél belangrijk is.',
    grip:
      'Kies per soort melding — budgetwaarschuwingen, partner-transacties, mijlpalen, herinneringen en tips — of en via welk kanaal je ’m ontvangt: in-app of e-mail. Hier zet je ook uit dat Fin uit zichzelf een tip laat zien; vragen om een tip kan dan nog steeds.',
  },
  '/nieuws': {
    insight:
      'Financieel nieuws wordt pas nuttig als het relevant is voor jouw situatie — artikelen worden daarom gescoord op je profiel en doelen, niet zomaar chronologisch getoond.',
    grip: 'Sla items op voor later of markeer ze als gelezen.',
  },
  '/berichten': {
    insight:
      'Alle meldingen die je ontvangt komen hier samen — budgetwaarschuwingen, partner-transacties, mijlpalen, herinneringen en tips — zodat je niets hoeft te missen tussen losse kanalen.',
    grip:
      'Filter op ongelezen en markeer berichten als gelezen. Het financiële nieuws vind je in De Krant, je wekelijkse briefing op het Overzicht.',
    terms: ['will'],
  },

  // ── Kern sub-pagina's (/core/**) ─────────────────────────────────────
  // '/core', '/core/budgets' en '/core/belasting' stonden hier tot UR3-26.
  // Die drie pagina's zijn met de dode-broncode-opruiming verdwenen: hun URL
  // redirect al sinds de nav-migratie naar /overzicht, /overzicht/budget resp.
  // /overzicht/belasting, en die canonieke routes dragen hun eigen entry.
  '/core/assets': {
    insight:
      'Al je bezittingen gegroepeerd per type — spaargeld, beleggingen, vastgoed, crypto en meer — met de totale waarde en verdeling.',
    grip: 'Voeg bezittingen toe of herwaardeer bestaande items.',
  },
  '/core/debts': {
    insight:
      'Al je schulden op een rij: hypotheek, leningen en overige verplichtingen, met resterende schuld, maandlasten en aflossingstempo.',
    grip: 'Voeg schulden toe of bekijk mogelijke aflosstrategieën.',
  },
  '/core/cash/connect': {
    insight:
      'Een bankkoppeling haalt je transacties zelf op, zodat je cijfers actueel blijven zonder dat je elke maand een bestand hoeft te uploaden. Je logt in bij je eigen bank; je wachtwoord komt hier nooit langs.',
    grip: 'Kies je bank, bevestig bij je bank zelf, en zie je rekeningen binnenkomen. Ontkoppelen kan altijd via Mijn · Koppelingen.',
    werking: [
      {
        title: 'Alleen meelezen',
        text: 'De koppeling geeft leesrechten op saldi en transacties. Betalen kan de app niet — die rechten vraagt hij niet aan.',
      },
      {
        title: 'Toestemming verloopt',
        text: 'Je bank geeft toestemming voor uiterlijk 180 dagen (PSD2). Daarna vraagt de app je opnieuw; tot die tijd blijft alles wat al binnenkwam gewoon staan.',
      },
      {
        title: 'Handmatig blijft mogelijk',
        text: 'Wil je niet koppelen, dan werkt alles ook met een bestand uit je bank (CSV, MT940 of OFX) of met handmatige invoer.',
      },
    ],
    terms: ['psd2'],
    related: [
      { href: '/mijn/koppelingen', label: 'Je koppelingen beheren' },
      // Binnen de app het in-app transparantie-overzicht; de publieke /privacy
      // heeft geen PAGE_INFO-sleutel (en is hier ook niet nodig — wie hier komt
      // is voorbij de onboarding-redirect van WF-START-11).
      { href: '/mijn/privacy', label: 'Wat we bewaren, en waarom' },
    ],
  },
  '/core/checkin': {
    insight: 'Je maandelijkse check-in bouwt een betrouwbare tijdlijn op van je financiële voortgang.',
    grip: 'Registreer je actuele vermogens- en inkomenscijfers; eerdere check-ins vind je terug in de historie.',
  },
  '/core/checkin/historie': {
    insight: 'Al je maandelijkse geldcheck-ins terug in beeld: een tijdlijn van je vermogen, sparen en reflecties.',
    grip: 'Bekijk bovenaan de trend en wanneer je volgende check-in klaarstaat, en klik een maand open voor de details.',
  },

  // ── Rapportages ────────────────────────────────────────────────────
  '/rapportages': {
    insight:
      'Je rapportages verzamelen wat Kern en Horizon al berekenen tot één overzicht — balans, budget en vermogensverloop naast elkaar, zodat je niet per module hoeft te puzzelen.',
    grip: 'Kies een periode of bekijk de trend over tijd, en exporteer elk rapport als PDF voor je eigen administratie.',
  },
  '/rapportages/balans': {
    insight:
      'Een balans op één peildatum laat in één oogopslag zien hoe activa en passiva zich tot elkaar verhouden — niet alleen wat je hebt, maar hoe solide dat staat.',
    grip:
      'Lees activa links en passiva rechts, met eigen vermogen als sluitstuk en kengetallen als solvabiliteit en liquiditeit, plus de vertaling naar vrijheidstijd; druk de balans af als PDF voor je administratie.',
  },
  '/rapportages/vermogen': {
    insight:
      'Deze pagina telt op wat losse widgets apart tonen: elke bezitting en schuld in één inventaris, zodat je het totaalbeeld ziet in plaats van fragmenten.',
    grip:
      'Blader per categorie en duik dieper in holdings, woonbalans, verhuur en hypotheek; onderaan lees je je netto vermogen omgerekend naar vrijheidstijd.',
  },
  '/rapportages/budget': {
    insight:
      'Hier zie je niet alleen wát je uitgaf, maar of dat klopt met wat je jezelf had voorgenomen — en wat het verschil doet met de vrijheid die je opbouwt.',
    grip: 'Vergelijk per categorie waar je onder of over budget zit en wat dat betekent voor je spaarquote; druk het rapport af als PDF.',
    terms: ['kassabon', 'spaarquote'],
  },
  '/rapportages/benchmark': {
    insight:
      'Losse cijfers zeggen weinig zonder context; deze pagina zet jouw spaarquote, vermogen en woonlasten naast vergelijkbare huishoudens — als spiegel, niet als rapportcijfer.',
    grip:
      'Bekijk waar je afwijkt van het gemiddelde en gebruik dat als aanknopingspunt om elders in de app iets bij te stellen, niet als score om na te jagen.',
    terms: ['YTD', 'spaarquote'],
  },
  '/rapportages/persoonlijk-plan': {
    insight:
      'Je plan staat verspreid over losse pagina’s; dit document trekt het samen tot één leesbaar verhaal — waar je staat, waar je heen wilt en wat de route ertussen is.',
    grip:
      'Lees je doelen, projectie en keuzes in samenhang terug, druk het plan af of houd het bij de hand voor het moment dat je een beslissing moet nemen.',
  },
  '/rapportages/totaalplan': {
    insight:
      'Dit is je plan in de vorm die je kunt delen — met dezelfde aannames en dezelfde rekenmotor als Toekomst en Overzicht, dus wat je hier leest is precies wat de app ook elders laat zien.',
    grip:
      'Bekijk de aannames, je vermogensprojectie naar volledige vrijheid en de slagingskans onder marktschommelingen, en druk het geheel af als PDF om te bespreken met je partner of adviseur.',
  },

  // ── Beheer ───────────────────────────────────────────────────────────
  '/beheer/gebruik': {
    insight:
      'Hoe de app gebruikt wordt, zonder één persoon te zien: per waardestroom en app-deel, van actieve dag naar actieve dag, en of mensen binnen het ritme van een stroom terugkomen. Zo zie je waar nieuwe gebruikers afhaken en later of een verbetering werkt.',
    grip:
      'Kies bovenaan een band (laatste 30 dagen, 30–89 of 90–364 dagen geleden; ze overlappen bewust niet), en of je externe of juist alleen interne accounts (test, superadmin, demo) wilt zien. Lees elk getal met zijn n erbij; “< 5” en “verborgen” betekenen dat de groep te klein is om te tonen.',
    werking: [
      {
        title: 'Onderdrukking',
        text: 'Elke groep van 1 tot en met 4 gebruikers toont als “< 5”. Soms wordt een extra cel verborgen, zodat je een kleine groep niet kunt terugrekenen uit het totaal.',
      },
      {
        title: 'Wat er gemeten wordt',
        text: 'Alleen op welke dag iemand welk app-deel gebruikte, sinds half september 2026. Geen routes, tijdstippen, kliks of inhoud; klikgedrag en schermvolgorde komen pas in fase 2.',
      },
      {
        title: 'Van dag tot dag',
        text: 'De Sankey volgt mensen over hun eerste vier actieve dagen in de periode: in welke waardestroom ze die dag zaten en wie daarna stopte. Dagen, geen schermen. Een overgang met een te kleine groep gaat als geheel dicht.',
      },
      {
        title: 'Waardestromen',
        text: 'De indeling in stromen komt van Waardestromen. Wijzig je die daar, dan telt deze pagina meteen volgens de nieuwe indeling.',
      },
    ],
  },
  '/beheer/versie': {
    insight:
      'Alleen-lezen overzicht van je git-, deploy- en migratiestaat: waar localhost staat ten opzichte van master en productie.',
    grip:
      'Zie welke werkboom je open hebt, of er ongecommit of ongepusht werk ligt en of alle Supabase-migraties zijn toegepast; onderaan staat een spiekbrief over hoe committen, branches, pushen en worktrees samenhangen.',
  },
}

const EMPTY_PAGE_INFO: PageInfoContent = { insight: '', grip: '' }

/**
 * Centrale lookup voor PAGE_INFO. `fallbackKey` dekt embedded/hergebruikte
 * client-componenten die op meerdere routes kunnen renderen (bv. AssetsPage
 * onder zowel /core/assets als /overzicht/bezittingen).
 */
export function getPageInfo(key: string | null | undefined, fallbackKey?: string): PageInfoContent {
  if (key && PAGE_INFO[key]) return PAGE_INFO[key]
  if (fallbackKey && PAGE_INFO[fallbackKey]) return PAGE_INFO[fallbackKey]
  return EMPTY_PAGE_INFO
}

/**
 * Heeft deze entry íets te tonen? Gebruik dit als render-guard rond een
 * `PageInfoButton` — nooit een handmatige `insight || grip`-check: die laat een
 * entry die alléén WERKING/BEGRIPPEN/VERDER draagt stilletjes zonder knop.
 */
export function hasPageInfo(content: PageInfoContent): boolean {
  return Boolean(
    content.insight ||
      content.grip ||
      content.werking?.length ||
      content.terms?.length ||
      content.related?.length,
  )
}
