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
    terms: ['netto_vermogen', 'vrijheidstijd', 'spaarquote'],
    related: [
      { href: '/overzicht/cashflow', label: 'Cashflow — wat er in- en uitgaat' },
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
        title: 'Niet alles is even opneembaar',
        text: 'Je eigen huis en je pensioenpotten kun je niet zomaar aanspreken. In Toekomst leg je vast hoe ze meetellen in je vrijheidsberekening.',
      },
    ],
    terms: ['netto_vermogen', 'per_asset_rendement', 'asset_allocatie', 'liquiditeit'],
    related: [
      { href: '/overzicht/schulden', label: 'Schulden — de andere kant van de balans' },
      { href: '/rapportages/vermogen', label: 'Je vermogen tot in detail' },
      { href: '/toekomst/voorkeuren', label: 'Aannames achter de projectie' },
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
  '/overzicht/cashflow': {
    insight:
      'Wat er binnenkomt en wat eruit gaat. Het deel van je inkomen dat je opzij zet, bepaalt hoe snel je bij je vrijheidsmoment komt.',
    grip: 'Beheer hier je budgetten, je vaste lasten en je transacties.',
    werking: [
      {
        title: 'Budgetten',
        text: 'Een maandlimiet per categorie die meeloopt met je boekingen, zodat je halverwege de maand ziet hoeveel ruimte er nog is.',
      },
      {
        title: 'Vaste lasten',
        text: 'Je terugkerende kosten los van je losse uitgaven. Handig omdat juist dit deel van je maand al vastligt voordat hij begint.',
      },
      {
        title: 'Transacties',
        text: 'De losse boekingen achter de totalen. Hier corrigeer je een categorie of zoek je een bedrag terug.',
      },
      {
        title: 'Vooruitblik',
        text: 'Een rechttoe-rechtaan doortrekking van je huidige patroon over zes maanden — bedoeld als peiling, niet als scenario. Voor scenario’s ga je naar Toekomst.',
      },
    ],
    terms: ['spaarquote', 'vrijheidstijd'],
    related: [
      { href: '/overzicht/cashflow/forecast', label: 'Vooruitblik van zes maanden' },
      { href: '/rapportages/budget', label: 'Budgetrapport om af te drukken' },
    ],
  },
  '/overzicht/cashflow/budget': {
    insight:
      'Je maandbudgetten in beeld: hoe je inkomen is verdeeld over categorieën en waar nog ruimte zit.',
    grip:
      'Stel per categorie een limiet in en volg gedurende de maand hoeveel ruimte je nog hebt — wat je overhoudt, is vrijheid die je opbouwt.',
    werking: [
      {
        title: 'Limiet per categorie',
        text: 'Je stelt zelf een maandbedrag in. De balk vult zich met wat er tot nu toe geboekt is, zodat de resterende ruimte zichtbaar blijft in plaats van pas achteraf.',
      },
      {
        title: 'Automatische indeling',
        text: 'Nieuwe transacties krijgen zelf een categorie toegewezen. Klopt er een niet, dan pas je die aan bij de transactie; het budget rekent direct opnieuw.',
      },
      {
        title: 'Vier weergaven',
        text: 'Dezelfde cijfers in verschillende vormen — lijst, verdeling en verloop — voor wie liever ziet dan leest. De onderliggende bedragen veranderen niet mee.',
      },
      {
        title: 'Vrijheidsdagen per post',
        text: 'Achter elk budget staat wat het aan vrijheidstijd kost: het maandbedrag afgezet tegen je eigen dagelijkse uitgaven.',
      },
    ],
    terms: ['spaarquote', 'vrijheidstijd'],
    related: [
      { href: '/overzicht/cashflow/transacties', label: 'Transacties achter deze budgetten' },
      { href: '/rapportages/budget', label: 'Budget versus voornemen' },
    ],
  },
  '/overzicht/cashflow/transacties': {
    insight:
      'Alles wat er deze maand in en uit gaat, met je geldstroom per categorie en je spaarquote van de maand.',
    grip: 'Filter en doorzoek je boekingen, of koppel een rekening zodat nieuwe transacties automatisch binnenkomen. Deel je een huishouden, dan zet je een gedeelde boeking met één klik op jullie lijst "Te bespreken" — alleen boekingen die je partner ook ziet.',
    werking: [
      {
        title: 'Filteren en zoeken',
        text: 'Zoek op tekst, bedrag of periode, en beperk de lijst tot één categorie of rekening.',
      },
      {
        title: 'Categorie corrigeren',
        text: 'Open een boeking en kies een andere categorie. Je budgetten en je spaarquote rekenen meteen mee — je hoeft niets opnieuw te laden.',
      },
      {
        title: 'Rekening koppelen',
        text: 'Koppel je bank en nieuwe transacties komen vanzelf binnen. Handmatig invoeren blijft altijd mogelijk; een koppeling is nooit verplicht.',
      },
      {
        title: 'Bestand importeren',
        text: 'Een export van je bank (CSV, MT940 of OFX) lees je hier in. Boekingen die je al had worden herkend, ook als ze via een andere bron binnenkwamen.',
      },
    ],
    terms: ['spaarquote', 'psd2'],
    related: [
      { href: '/overzicht/cashflow/budget', label: 'Budgetten die hierop meelopen' },
      { href: '/mijn/koppelingen', label: 'Je koppelingen beheren' },
    ],
  },
  '/overzicht/cashflow/vaste-lasten': {
    insight:
      'Je abonnementen en terugkerende kosten op één plek, uitgedrukt in hoeveel vrijheidstijd ze je kosten. Elke euro minder vaste last is vrijheid die je terugkoopt.',
    grip:
      'In Volledig zie je je vaste-lastenquote — het aandeel van je inkomen, met Nibud-duiding — plus abonnementen-sluipverbruik ten opzichte van het gemiddelde, de samenstelling per categorie en wat opzeggen concreet oplevert.',
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
        text: 'Per post zie je wat stoppen oplevert in euro’s en in vrijheidstijd, met de gegevens die je voor de opzegging nodig hebt bij elkaar.',
      },
    ],
    terms: ['vrijheidstijd', 'spaarquote'],
    related: [
      { href: '/overzicht/cashflow/transacties', label: 'Transacties achter deze posten' },
      { href: '/overzicht/cashflow/budget', label: 'Budgetten per categorie' },
    ],
  },
  '/overzicht/cashflow/forecast': {
    insight:
      'Je spaarquote, maandelijks netto en uitgaventrend in één blik, met een vooruitblik van 6 maanden op basis van je baseline en vaste lasten.',
    grip:
      'Volg hoe je saldo zich naar verwachting ontwikkelt; deze blik is lineair — voor een scenario-diepere projectie ga je naar Toekomst.',
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
    terms: ['box_3', 'heffingsvrij_vermogen', 'pensioen'],
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
      'Sleep een gebeurtenis naar een ander jaar en zie meteen hoe je vrijheidsmoment verschuift; van hieruit open je doelen, gebeurtenissen en voorkeuren om de projectie bij te stellen.',
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
        text: 'Rendement, inflatie, je uitgaven na pensioen en je eindleeftijd bepalen samen de uitkomst. Je stelt ze zelf in bij Voorkeuren — een kleine bijstelling kan jaren schelen.',
      },
    ],
    terms: ['fire', 'vrijheidstijd', 'swr', 'inflatie'],
    related: [
      { href: '/toekomst/doelen', label: 'Je doelen beheren' },
      { href: '/toekomst/gebeurtenissen', label: 'Levensgebeurtenissen op je tijdas' },
      { href: '/toekomst/voorkeuren', label: 'Aannames achter de projectie' },
    ],
  },
  '/toekomst/whatif': {
    insight:
      'Voordat je een knoop doorhakt, wil je weten wat hij oplevert — dit is de plek om dat zonder risico uit te proberen.',
    grip:
      'Verander je sparen, rendement of pensioenleeftijd en zie direct hoeveel jaar of maanden vrijheid dat scheelt. Niets hiervan is een toezegging, je verkent alleen.',
    werking: [
      {
        title: 'Schuifjes',
        text: 'Verander je spaarbedrag, je verwachte rendement, je uitgaven of je pensioenleeftijd; de uitkomst beweegt onder je hand mee.',
      },
      {
        title: 'Naast je huidige pad',
        text: 'Het scenario wordt getekend náást je bestaande projectie. Je ziet daardoor het verschil, in plaats van twee losse getallen die je zelf moet aftrekken.',
      },
      {
        title: 'Bewaren en vergelijken',
        text: 'Bewaar een verkenning en leg hem als extra lijn over je pad. Je echte plan verandert er niet door — dat blijft staan tot je het zelf aanpast.',
      },
      {
        title: 'Wat het niet is',
        text: 'Een verkenning, geen voorspelling en geen toezegging. Markten bewegen anders dan een schuifje; de waarde zit in de richting, niet in de decimaal.',
      },
    ],
    terms: ['rendement', 'inflatie', 'fire'],
    related: [
      { href: '/toekomst/bibliotheek', label: 'Je bewaarde scenario’s' },
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
  '/toekomst/samengestelde-interest': {
    insight:
      'Rente-op-rente is de stille motor achter elke vrijheid: tijd doet het zware werk, niet alleen je inleg.',
    grip: 'Speel met inleg, rendement en horizon en zie hoe een euro van vandaag over 30 jaar kan uitgroeien tot tien euro.',
  },
  '/toekomst/doelen': {
    insight:
      'Elk doel hier is een stuk vrijheid dat je opbouwt — zie in één oogopslag hoeveel je al hebt, wat er nog te gaan is en of je op koers ligt, loopt achter of aandacht nodig hebt.',
    grip:
      'Voeg een doel toe als bedrag, of koppel het aan één of meer bezittingen en schulden zodat het netto meerekent met wat je opbouwt en aflost — of zet het op een kengetal dat de app al bijhoudt (spaarquote, netto vermogen, vrijheidsleeftijd, noodfonds, passief inkomen, belastingdruk, schuldenvrij-moment, eindkapitaal), dan werkt het vanzelf mee. Doelen van twee jaar of verder krijgen automatisch een seintje bij 25%, 50% en 75%; is een doel behaald, dan wordt dat gevierd en verhuist het naar het archief onderaan, met meteen een suggestie voor de volgende stap. Je eigen doelen staan bovenaan; doelen uit je doelsituatie pas je aan in het Toekomst-lab.',
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
      'Pensioen, AOW, een huis kopen of verkopen, een erfenis — elke levensgebeurtenis op je tijdas verschuift je vrijheidsmoment.',
    grip: 'Voeg een gebeurtenis toe of sleep ’m naar een ander jaar en zie meteen het effect op je pad naar vrijheid.',
  },
  '/toekomst/voorkeuren': {
    insight:
      'Achter elke projectie zitten aannames — verwacht rendement, inflatie, je uitgaven na pensioen, je eindleeftijd — en die bepalen samen hoeveel jaar vrijheid je berekening laat zien.',
    grip: 'Draai hier aan die knoppen; een kleine bijstelling kan je uitkomst met jaren verschuiven.',
  },
  '/toekomst/bibliotheek': {
    insight:
      'Verkenningen die je niet meteen weer kwijt wilt raken horen hier: je wat-als-scenario’s en berekeningen op één plek.',
    grip: 'Open een opgeslagen scenario om verder te bouwen, of leg het naast je huidige plan om te vergelijken.',
  },

  // ── Horizon-fallbacks (embedded /horizon-varianten) ─────────────────
  '/horizon': {
    insight:
      'Deze projectie laat zien wanneer je financieel vrij bent en hoe scenario’s en levensgebeurtenissen dat pad beïnvloeden.',
    grip: 'Voeg gebeurtenissen toe of pas parameters aan om je plan te verkennen.',
  },
  '/horizon/whatif': {
    insight: 'Kleine keuzes nu kunnen je vrijheidsdatum flink verschuiven — hier zie je precies hoeveel.',
    grip: 'Verschuif sliders voor spaarquote, rendement of extra inleg en vergelijk het resultaat direct naast je huidige pad.',
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
      { href: '/overzicht/cashflow/transacties', label: 'De transacties die binnenkomen' },
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
      'Kies per soort melding — budgetwaarschuwingen, partner-transacties, mijlpalen, herinneringen en tips — of en via welk kanaal je ’m ontvangt: in-app of e-mail.',
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
  },

  // ── Kern sub-pagina's (/core/**) ─────────────────────────────────────
  '/core': {
    insight:
      'Je financieel fundament in één overzicht: al je bezittingen en schulden, je netto vermogen, schuldgraad en FIRE-voortgang.',
    grip: 'Klik op een categorie om items toe te voegen of te beheren.',
  },
  '/core/budgets': {
    insight:
      'Je maandbudgetten per categorie: wat je hebt uitgegeven tegenover je limiet, en hoeveel vrijheidsdagen elke post kost.',
    grip: 'Klik op een budget om de bijbehorende transacties en trends te bekijken.',
  },
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
  '/core/belasting': {
    insight: 'Je Box 3-belastingdruk op basis van je bezittingen en schulden, volgens de actuele Belastingdienst-systematiek.',
    grip: 'Zie het verschil tussen je werkelijke en het fictieve rendement om te bepalen waar fiscale ruimte zit.',
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
        text: 'Je bank geeft toestemming voor 90 dagen. Daarna vraagt de app je opnieuw; tot die tijd blijft alles wat al binnenkwam gewoon staan.',
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
  },
  '/rapportages/benchmark': {
    insight:
      'Losse cijfers zeggen weinig zonder context; deze pagina zet jouw spaarquote, vermogen en woonlasten naast vergelijkbare huishoudens — als spiegel, niet als rapportcijfer.',
    grip:
      'Bekijk waar je afwijkt van het gemiddelde en gebruik dat als aanknopingspunt om elders in de app iets bij te stellen, niet als score om na te jagen.',
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
