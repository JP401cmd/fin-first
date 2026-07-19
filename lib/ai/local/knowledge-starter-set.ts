import type { LocalKnowledgeItem } from './knowledge-context'

/**
 * Gecureerde startset voor de kennisbank lokale AI (fase K1 / K1.1 / K1.2).
 *
 * V1 (fase K1) dekte tien kernbegrippen die de bekende zwaktes van het kleine
 * lokale model (C1a) afdekken: fiscale begrippen (Box 1/2/3, jaarruimte),
 * FIRE-concepten (SWR, vrijheidstijd, spaarquote, noodbuffer, FIRE) en de
 * vermogen-vs-liquide-nuance.
 *
 * K1.1 breidt dit uit tot een brede kennisbank over 11 categorieën
 * ({@link KNOWLEDGE_CATEGORIES}): Belastingen, Pensioen, Wonen & hypotheek,
 * Beleggen, Sparen & budgetteren, Schulden, FIRE & vrijheid, Gedrag &
 * mindset, TriFinity-begrippen, Verzekeren & risico, en Algemene financiële
 * basis — onderzocht (web + codebase voor de app-eigen begrippen) en
 * adversarieel geverifieerd op de harde inhoudsregel en actualiteit.
 *
 * K1.2 verdiept twee categorieën verder: TriFinity-begrippen (+10, codebase-
 * gegrond: dagtarief, sleepmodus, levensgebeurtenissen, fase-analyses,
 * vrijheidspercentage, actiepunten-vs-aandachtspunten, weergavemodus,
 * privémodus, de krant, welkomstgids) en Beleggen (+8: obligaties, vastgoed/
 * REITs, cryptovaluta, duurzaam beleggen, actief-vs-passief, beleggingshorizon
 * en risicoprofiel, valutarisico, periodiek inleggen) — 89 begrippen totaal.
 *
 * De beheerder laadt begrippen (alles of per categorie) in de editor, reviewt
 * en slaat zélf op — dit bestand levert alleen het concept.
 *
 * HARDE INHOUDSREGEL (Wft/correctheid): begrippen-uitleg, in je/jij-taal —
 * NUL cijfers, tarieven, bedragen of jaartallen. De enige toegestane "cijfers"
 * zijn de namen Box 1/2/3 (eigennamen, geen tarief). Voor getallen verwijst de
 * uitleg naar de app; die komen exclusief uit de rekenmotoren.
 *
 * Elk item volgt het template: titel = het begrip zoals een gebruiker het
 * noemt · tags = zoekwoorden en synoniemen waarop het item meegaat · categorie
 * = groepeer-veld voor het beheerscherm · tekst = twee tot zes zinnen heldere
 * uitleg · controleerVoor (optioneel) = ISO-datum voor onderwerpen die aan
 * wetgeving hangen die op afzienbare termijn structureel kan wijzigen.
 */

export interface KnowledgeStarterTemplate {
  titel: string
  tags: string[]
  tekst: string
  /** Groepeer-veld voor het beheerscherm, bv. "Belastingen" of "Pensioen". */
  categorie: string
  /**
   * ISO-datum waarop dit item herzien moet worden, of ontbrekend voor een
   * evergreen begrip. Alleen gezet op items die aan wetgeving/mechaniek
   * hangen die structureel kan wijzigen.
   */
  controleerVoor?: string
}

/**
 * Categorieën voor de kennisbank — single source voor zowel de curatie hier
 * als de groepering in de beheer-UI. Nieuwe items horen in één van deze
 * categorieën; een nieuwe categorie hier toevoegen is de manier om een nieuwe
 * groep te introduceren.
 */
export const KNOWLEDGE_CATEGORIES = [
  'Belastingen',
  'Pensioen',
  'Wonen & hypotheek',
  'Beleggen',
  'Sparen & budgetteren',
  'Schulden',
  'FIRE & vrijheid',
  'Gedrag & mindset',
  'TriFinity-begrippen',
  'Verzekeren & risico',
  'Algemene financiële basis',
] as const

export const KNOWLEDGE_STARTER_SET: KnowledgeStarterTemplate[] = [
  {
    titel: 'Box 1',
    tags: ['box 1', 'inkomen', 'werk', 'loon', 'inkomstenbelasting', 'eigen woning', 'hypotheekrente'],
    categorie: 'Belastingen',
    tekst:
      'Box 1 is het deel van de inkomstenbelasting dat gaat over je inkomen uit werk en woning. Denk aan je loon, je winst als ondernemer, je pensioen en een uitkering. Ook je eigen woning valt hieronder: de bijtelling en de aftrek van hypotheekrente lopen via Box 1. Hoe meer je hier verdient, hoe zwaarder dit inkomen wordt belast. Wat het precies voor jou betekent, reken je in de app uit.',
  },
  {
    titel: 'Box 2',
    tags: ['box 2', 'aanmerkelijk belang', 'dga', 'aandelen', 'bv', 'dividend', 'winstuitkering'],
    categorie: 'Belastingen',
    tekst:
      'Box 2 gaat over een aanmerkelijk belang: je hebt een flink deel van de aandelen in een bv, meestal als directeur-grootaandeelhouder. Je betaalt hier belasting over het voordeel dat je uit die aandelen haalt, zoals dividend of winst bij verkoop. Zolang de winst in de bv blijft, betaal je in Box 2 nog niets; pas als je geld naar privé haalt, telt het mee. Het idee is dat ondernemen via een bv anders wordt belast dan gewoon spaargeld. De precieze grenzen zie je in de app.',
  },
  {
    titel: 'Box 3',
    tags: ['box 3', 'vermogen', 'sparen', 'beleggen', 'spaargeld', 'forfaitair rendement', 'tegenbewijs'],
    categorie: 'Belastingen',
    // Wetsvoorstel "Wet werkelijk rendement box 3" — aangenomen door de Tweede
    // Kamer (12 feb 2026), ligt bij de Eerste Kamer, wordt via een novelle nog
    // aangepast (Prinsjesdag 2026); beoogde ingangsdatum 1 januari 2028. Het
    // forfait/tegenbewijs-mechanisme hieronder kan dan structureel wijzigen.
    controleerVoor: '2027-10-01',
    tekst:
      'Box 3 is de belasting over je vermogen: spaargeld, beleggingen en bijvoorbeeld een tweede woning. De Belastingdienst gaat niet uit van je werkelijke opbrengst, maar rekent met een verondersteld rendement — dat heet het forfaitaire rendement. Omdat dat forfait soms hoger uitpakt dan wat je echt verdiende, mag je met de tegenbewijsregeling laten zien dat je werkelijke rendement lager was en zo minder betalen. Je betaalt dus belasting over een schatting, tenzij je aantoont dat het in jouw geval lager ligt. De bedragen en het forfait zelf komen uit de rekenmotor van de app.',
  },
  {
    titel: 'Jaarruimte',
    tags: ['jaarruimte', 'pensioen', 'lijfrente', 'aftrek', 'pensioengat', 'oudedag'],
    categorie: 'Pensioen',
    tekst:
      'Jaarruimte is de ruimte die je in een jaar hebt om fiscaal voordelig extra pensioen op te bouwen, bijvoorbeeld met een lijfrente. Bouw je via je werk weinig pensioen op, dan ontstaat er ruimte die je zelf mag benutten. Wat je binnen die ruimte inlegt, mag je aftrekken van je inkomen, waardoor je nu minder belasting betaalt. Later, als je het als aanvulling ontvangt, reken je alsnog af — vaak tegen een lager tarief. Hoeveel jaarruimte er voor jou is, zie je in de app.',
  },
  {
    titel: 'Veilig onttrekkingspercentage',
    tags: ['swr', 'onttrekking', 'opnemen', 'veilig opnemen', 'safe withdrawal rate', 'onttrekkingspercentage'],
    categorie: 'FIRE & vrijheid',
    tekst:
      'Je veilige onttrekkingspercentage gaat over hoeveel je elk jaar uit je vermogen kunt halen zonder dat het opraakt. Een bekende vuistregel noemt een vast percentage voor iedereen, maar dat is te simpel: hoe lang je nog te gaan hebt, hoe je belegt en hoe de markten meezitten bepalen samen wat veilig is. Daarom rekent de app een percentage uit dat bij jouw situatie past, in plaats van één vaste regel te volgen. Zo weet je hoeveel vrijheid je vermogen echt kan dragen. Het getal zelf komt uit de rekenmotor.',
  },
  {
    titel: 'Vrijheidstijd',
    tags: ['vrijheid', 'vrijheidstijd', 'tijd', 'opgeslagen tijd', 'geld is tijd', 'levenstijd'],
    categorie: 'FIRE & vrijheid',
    tekst:
      'Vrijheidstijd is de kern van deze app: geld is opgeslagen tijd. Elke euro die je hebt, staat voor een stukje levenstijd waarin je niet hoeft te werken om je uitgaven te dekken. Daarom vertaalt de app je vermogen en uitgaven naar tijd — dagen, maanden en jaren vrijheid — in plaats van alleen naar bedragen. Zo zie je niet hoeveel je hebt, maar hoeveel vrije tijd het je oplevert. De omrekening naar tijd doet de rekenmotor voor je.',
  },
  {
    titel: 'Spaarquote',
    tags: ['spaarquote', 'sparen', 'spaarpercentage', 'overhouden', 'sparen per maand'],
    categorie: 'Sparen & budgetteren',
    tekst:
      'Je spaarquote is het deel van je inkomen dat je overhoudt en opzijzet in plaats van uitgeeft. Het is een van de krachtigste knoppen aan je vrijheid: hoe meer je structureel spaart, hoe sneller je vermogen groeit én hoe minder je maandelijks nodig hebt. Daardoor werkt een hogere spaarquote twee kanten op tegelijk. De app berekent je spaarquote uit je inkomsten en uitgaven, zodat je ziet hoe je ervoor staat. Het percentage zelf komt uit de rekenmotor.',
  },
  {
    titel: 'Noodbuffer',
    tags: ['noodbuffer', 'buffer', 'spaarpotje', 'appeltje voor de dorst', 'onvoorzien', 'reserve'],
    categorie: 'Sparen & budgetteren',
    tekst:
      'Een noodbuffer is een potje geld dat je apart houdt voor onverwachte tegenvallers, zoals een kapotte wasmachine of tijdelijk minder inkomen. Het staat los van beleggen: je wilt er zó bij kunnen, zonder iets te hoeven verkopen op een slecht moment. Een goede buffer zorgt dat één tegenslag je plannen niet omgooit en geeft rust om verstandige keuzes te maken. Zonder buffer moet je bij elke tegenvaller schulden maken of beleggingen aanspreken. Of jouw buffer op peil is, zie je in de app.',
  },
  {
    titel: 'FIRE',
    tags: ['fire', 'financieel vrij', 'financiële onafhankelijkheid', 'eerder stoppen', 'rentenieren'],
    categorie: 'FIRE & vrijheid',
    tekst:
      'FIRE staat voor financiële onafhankelijkheid: het punt waarop je vermogen genoeg oplevert om je uitgaven te dekken, zodat werken een keuze wordt in plaats van een moeten. Je bereikt het door bewust te sparen en te beleggen, tot je vermogen op een dag het werk van je salaris overneemt. Het gaat niet per se over nooit meer werken, maar over de vrijheid om zelf te kiezen. De app laat zien hoe ver je van dat punt af staat en wat je eraan kunt doen. De onderliggende berekening komt uit de rekenmotor.',
  },
  {
    titel: 'Vermogen versus liquide vermogen',
    tags: ['vermogen', 'netto vermogen', 'liquide', 'liquide vermogen', 'beschikbaar', 'huis', 'niet-liquide'],
    categorie: 'FIRE & vrijheid',
    tekst:
      'Je nettovermogen is alles wat je bezit min je schulden, inclusief zaken die je niet zomaar kunt uitgeven, zoals je huis of je pensioen. Je liquide vermogen is het deel dat je wél snel beschikbaar hebt, zoals spaargeld en vrij verhandelbare beleggingen. Voor je vrijheid telt vooral dat liquide deel: daarvan kun je echt leven zonder eerst je huis te verkopen. Haal die twee daarom nooit door elkaar — een groot vermogen op papier betekent niet dat je er ook van rond kunt komen. De app houdt beide grootheden apart.',
  },

  // --- K1.1-uitbreiding (19 jul 2026): 61 nieuwe begrippen, onderzocht +
  // adversarieel geverifieerd op de harde inhoudsregel en actualiteit. ---

  // Belastingen (+5)
  {
    titel: 'Heffingskortingen',
    tags: ['heffingskorting', 'algemene heffingskorting', 'arbeidskorting', 'belastingvermindering', 'inkomstenbelasting', 'korting op belasting'],
    categorie: 'Belastingen',
    controleerVoor: '2026-09-30',
    tekst:
      "Een heffingskorting is een korting op de inkomstenbelasting die je moet betalen, geen aftrekpost op je inkomen maar een vermindering van het uiteindelijke belastingbedrag. De bekendste zijn de algemene heffingskorting, waar in principe iedereen recht op heeft, en de arbeidskorting, die gekoppeld is aan inkomen uit werk. Beide kortingen zijn niet vast: ze lopen eerst op naarmate je inkomen stijgt, maar bouwen daarna bij een hoger inkomen juist weer af. Een heffingskorting kun je bovendien alleen verzilveren tot het bedrag aan belasting dat je daadwerkelijk verschuldigd bent — heb je weinig of geen belastbaar inkomen, dan kan een deel van de korting onbenut blijven. De exacte hoogte, de inkomensgrenzen waarop kortingen op- en afbouwen en wat dit voor jouw situatie betekent, berekent de app voor je op basis van je actuele gegevens.",
  },
  {
    titel: 'Toeslagen',
    tags: ['toeslagen', 'zorgtoeslag', 'huurtoeslag', 'kindgebonden budget', 'vermogenstoets', 'afbouw toeslag', 'inkomensgrens'],
    categorie: 'Belastingen',
    controleerVoor: '2026-09-30',
    tekst:
      "Toeslagen zoals zorgtoeslag, huurtoeslag en kindgebonden budget zijn inkomensafhankelijk: hoe hoger je (gezamenlijke) inkomen, hoe geleidelijk lager het bedrag dat je krijgt, tot de toeslag bij een bepaald inkomen helemaal wegvalt. Naast inkomen speelt ook je vermogen een rol via de zogeheten vermogenstoets, en die werkt heel anders dan de inkomensafbouw: heb je meer vermogen dan de voor jou geldende grens, dan vervalt de toeslag in één keer helemaal, in plaats van geleidelijk af te nemen. Dat maakt vermogen fiscaal gezien een ander soort drempel dan inkomen — een klein beetje vermogen boven de grens kan een toeslag in zijn geheel laten wegvallen, terwijl een beetje meer inkomen de toeslag maar een klein stukje verlaagt. Omdat de regels rond toeslagen en hun grenzen regelmatig door de wetgever worden bijgesteld, kunnen de precieze mechanismen wijzigen; de app rekent altijd met de actuele regels en grenzen.",
  },
  {
    titel: 'Schenkbelasting',
    tags: ['schenkbelasting', 'schenken', 'schenkingsvrijstelling', 'jubelton', 'belasting over schenking', 'vrijstelling schenken'],
    categorie: 'Belastingen',
    controleerVoor: '2026-09-30',
    tekst:
      "Schenkbelasting betaal je over geld of goederen die je tijdens iemands leven van diegene cadeau krijgt, voor zover dat boven de voor jou geldende vrijgestelde grens uitkomt. Hoeveel je belastingvrij mag ontvangen, hangt af van je relatie met de schenker: ouders mogen hun kinderen jaarlijks meer belastingvrij schenken dan bijvoorbeeld grootouders of mensen zonder familieband, en kinderen hebben daarnaast recht op een eenmalige, verhoogde vrijstelling die vrij besteedbaar is. Let op: de vroegere, nóg grotere eenmalige vrijstelling die specifiek aan de eigen woning gekoppeld was — in de volksmond de 'jubelton' — bestaat niet meer; die regeling is afgeschaft. Boven de vrijstelling die voor jou geldt, betaal je schenkbelasting volgens een tarief dat oploopt naarmate het geschonken bedrag hoger is en de familieband met de schenker verder weg staat. De precieze vrijstellingsbedragen en tariefgrenzen berekent de app voor je, omdat die jaarlijks worden aangepast.",
  },
  {
    titel: 'Erfbelasting',
    tags: ['erfbelasting', 'erven', 'nalatenschap', 'vrijstelling erfenis', 'erfgenaam', 'successierecht'],
    categorie: 'Belastingen',
    controleerVoor: '2026-09-30',
    tekst:
      "Erfbelasting is de belasting die je betaalt over wat je erft van iemand die is overleden, voor zover dat boven de voor jou geldende vrijstelling uitkomt. Zowel de hoogte van die vrijstelling als het belastingtarief hangen af van je relatie tot de overledene: een partner of kind krijgt fiscaal doorgaans een gunstigere behandeling dan bijvoorbeeld een broer, zus, ver familielid of iemand zonder familieband. De gedachte daarachter is dat de wetgever een nauwe persoonlijke en financiële band zwaarder laat wegen, terwijl een verdere of ontbrekende verwantschap juist zwaarder wordt belast. Ook de omvang van de erfenis zelf speelt mee: naarmate je meer erft, kan een hoger tarief van toepassing worden binnen jouw tariefgroep. Rond erfbelasting bestaan bovendien bijzondere regelingen, bijvoorbeeld voor het overnemen van een bedrijf, en de wetgever past vrijstellingen, tarieven en zulke regelingen regelmatig aan, dus de precieze spelregels kunnen op onderdelen weer verschuiven.",
  },
  {
    titel: 'Fiscaal partnerschap',
    tags: ['fiscaal partner', 'fiscaal partnerschap', 'gezamenlijke aangifte', 'toerekening inkomsten', 'aftrekposten verdelen', 'belastingaangifte partners'],
    categorie: 'Belastingen',
    controleerVoor: '2026-09-30',
    tekst:
      "Ben je fiscaal partner van iemand — bijvoorbeeld je echtgenoot, geregistreerd partner, of een samenwonende partner die aan de voorwaarden voldoet — dan kunnen jullie samen één belastingaangifte doen in plaats van twee losse aangiftes. Het belangrijkste voordeel is de vrije toerekening: bepaalde gezamenlijke inkomsten en aftrekposten, zoals inkomen uit spaargeld en beleggingen of de rente over de eigen woning, mogen jullie onderling verdelen zoals jullie zelf willen, ongeacht wie het bedrag feitelijk heeft ontvangen of betaald. Welke verdeling jullie daarbij kiezen, kan van invloed zijn op het totale bedrag aan belasting dat jullie samen betalen. Fiscaal partnerschap regelt uitsluitend hoe de belastingaangifte wordt ingevuld; het zegt op zichzelf niets over de juridische of relationele status van jullie relatie.",
  },

  // Pensioen (+6)
  {
    titel: 'AOW',
    tags: ['AOW', 'AOW-leeftijd', 'basispensioen', 'overheidspensioen', 'levensverwachting'],
    categorie: 'Pensioen',
    tekst:
      "De AOW is het basispensioen dat je van de overheid ontvangt zodra je de AOW-leeftijd bereikt, opgebouwd over de jaren dat je in Nederland hebt gewoond of gewerkt — niet gekoppeld aan een specifieke werkgever of loopbaan, zoals bij het werknemerspensioen wel het geval is. Het vormt de bodem waarop je eventuele werknemerspensioen en eigen vermogen aanvullen. Een belangrijk kenmerk is dat de AOW-leeftijd niet vaststaat: die beweegt mee met de gemiddelde levensverwachting in Nederland, zodat het stelsel houdbaar blijft nu mensen gemiddeld ouder worden. Het kabinet maakt jouw persoonlijke AOW-leeftijd daarom altijd geruime tijd van tevoren bekend, op basis van cijfers van het Centraal Bureau voor de Statistiek. In de app wordt met jouw eigen AOW-leeftijd gerekend, zodat die goed doorwerkt in je vrijheidsberekening.",
  },
  {
    titel: 'Werknemerspensioen',
    tags: ['werknemerspensioen', 'pensioenfonds', 'pensioenopbouw', 'werkgeverspensioen', 'aanvullend pensioen'],
    categorie: 'Pensioen',
    tekst:
      "Naast de AOW bouw je vaak een aanvullend pensioen op via je werkgever: het werknemerspensioen. Een deel van je salaris — vaak aangevuld door je werkgever — wordt ondergebracht bij een pensioenfonds of pensioenverzekeraar, die dit geld beheert en belegt tot je met pensioen gaat. Zodra je stopt met werken, ontvang je hieruit een periodieke uitkering naast je AOW. Hoeveel je opbouwt, hangt af van je loon, hoelang je in dienst was en welke pensioenregeling je werkgever(s) aanboden. In de app kun je je opgebouwde werknemerspensioen meenemen, zodat het samen met je AOW en eigen vermogen een compleet beeld geeft van je toekomstige vrijheid.",
  },
  {
    titel: 'Pensioenknip',
    tags: ['pensioenknip', 'vast pensioen', 'variabel pensioen', 'pensioendatum', 'renterisico'],
    categorie: 'Pensioen',
    controleerVoor: '2027-10-01',
    tekst:
      "De pensioenknip was een regeling waarmee je de aankoop van je levenslange pensioenuitkering niet in één keer, maar in twee stappen kon doen, zodat je niet volledig afhankelijk was van de rentestand op precies één dag. Dit was bedoeld om het renterisico rond je pensioendatum te verkleinen. De regeling is uiteindelijk niet blijvend gebleken en is inmiddels vervangen door een andere vorm van keuzevrijheid: bij pensionering kun je nu kiezen tussen een vaste uitkering, die een gelijkblijvend bedrag per periode geeft op basis van de rentestand bij aanvang, of een variabele uitkering, waarbij je kapitaal doorbelegd blijft en de uitkering kan meebewegen met het beleggingsrendement. Kom je de term pensioenknip nog tegen, dan gaat het dus om een ouder mechanisme dat is opgevolgd door deze vaste-of-variabele keuze.",
  },
  {
    titel: 'Wet toekomst pensioenen',
    tags: ['Wet toekomst pensioenen', 'Wtp', 'nieuwe pensioenwet', 'premieregeling', 'pensioenstelsel', 'invaren'],
    categorie: 'Pensioen',
    controleerVoor: '2027-10-01',
    tekst:
      "De Wet toekomst pensioenen verandert de manier waarop werknemerspensioen wordt opgebouwd: bijna alle pensioenregelingen gaan over van een systeem met een vooraf beloofd pensioenbedrag naar een premieregeling, waarbij de ingelegde premie en het beleggingsrendement samen je persoonlijke pensioenkapitaal vormen. Pensioenfondsen en werkgevers zijn op dit moment bezig met die overstap, en bestaande pensioenaanspraken kunnen daarbij worden 'ingevaren' in de nieuwe regeling. Voor deze transitie geldt een wettelijk vastgestelde einddatum waarop alle regelingen moeten zijn overgestapt; die datum is door de wetgever al eens naar achteren geschoven om pensioenfondsen meer tijd te geven. Voor jou als deelnemer betekent het vooral dat je pensioen directer gaat meebewegen met beleggingsresultaten dan voorheen, en dat de informatie die je van je pensioenfonds krijgt de komende tijd kan veranderen van vorm. Je pensioenfonds of pensioenverzekeraar informeert je zelf over het moment waarop jouw regeling overstapt en wat dat voor je pensioen betekent.",
  },
  {
    titel: 'Pensioengat',
    tags: ['pensioengat', 'pensioentekort', 'pensioenkloof', 'pensioenopbouw'],
    categorie: 'Pensioen',
    tekst:
      "Een pensioengat is het verschil tussen het pensioen dat je naar verwachting later ontvangt — AOW plus eventueel werknemerspensioen — en het inkomen dat je denkt nodig te hebben om je levensstijl na je pensionering vol te houden. Zo'n gat kan ontstaan doordat je een deel van je loopbaan geen of minder pensioen hebt opgebouwd, bijvoorbeeld door zelfstandig ondernemerschap, deeltijdwerk, een carrièreswitch of werk in het buitenland. Ook versobering van pensioenregelingen, een scheiding of een partner zonder eigen pensioenopbouw kunnen aan een pensioengat bijdragen. Het gat wordt vaak pas zichtbaar wanneer je de losse onderdelen — AOW, werknemerspensioen en eigen vermogen — naast elkaar legt in plaats van los te bekijken. De app brengt deze onderdelen voor je samen, zodat zichtbaar wordt of er een verschil ontstaat tussen wat je opbouwt en wat je nodig denkt te hebben.",
  },
  {
    titel: 'DGA-pensioen (pensioen in eigen beheer)',
    tags: ['DGA-pensioen', 'pensioen in eigen beheer', 'directeur-grootaandeelhouder', 'oudedagsverplichting'],
    categorie: 'Pensioen',
    tekst:
      "Vroeger konden directeur-grootaandeelhouders (DGA's) hun pensioen in eigen beheer opbouwen: de eigen bv reserveerde en beheerde dan zelf het pensioenkapitaal, in plaats van dat premies naar een extern pensioenfonds of verzekeraar gingen. Deze mogelijkheid is afgeschaft en er kan geen nieuw pensioen in eigen beheer meer worden opgebouwd. DGA's met een bestaand pensioen in eigen beheer konden destijds kiezen om dit af te kopen, om te zetten in een oudedagsverplichting — een soort spaarvariant binnen de bv — of ongewijzigd, premievrij, te laten staan. Die keuzeperiode is intussen gesloten: er kan nu geen nieuwe keuze in pensioen in eigen beheer meer worden gemaakt, al loopt een eerder gekozen oudedagsverplichting gewoon door tot de uitkeringsfase. Heb je in het verleden pensioen in eigen beheer opgebouwd, dan vind je dat vermogen nu terug als oudedagsverplichting binnen je bv of als destijds afgekocht kapitaal, niet meer als 'pensioen in eigen beheer' zelf.",
  },

  // Wonen & hypotheek (+6)
  {
    titel: 'Hypotheekvormen: annuïtair, lineair en aflossingsvrij',
    tags: ['hypotheekvorm', 'annuïteitenhypotheek', 'lineaire hypotheek', 'aflossingsvrije hypotheek', 'aflossen', 'hypotheek'],
    categorie: 'Wonen & hypotheek',
    controleerVoor: '2027-01-01',
    tekst:
      "Een hypotheek kun je op verschillende manieren aflossen, en dat bepaalt hoe je maandlasten zich in de tijd ontwikkelen. Bij een annuïteitenhypotheek betaal je elke maand hetzelfde brutobedrag: in het begin bestaat dat vooral uit rente, en naarmate de looptijd vordert verschuift de verhouding steeds meer naar aflossing. Bij een lineaire hypotheek los je elke maand een gelijk deel van de schuld af, waardoor het rentedeel geleidelijk kleiner wordt en je bruto maandlast dus daalt naarmate je verder in de looptijd zit. Bij een aflossingsvrije hypotheek betaal je alleen rente en bouw je via de hypotheek zelf geen vermogen op om de schuld te verminderen — die schuld blijft in principe volledig openstaan tot het einde van de looptijd, tenzij je op een andere manier aflost, bijvoorbeeld bij verkoop van de woning. Voor nieuwe hypotheken geldt bovendien doorgaans dat je alleen recht hebt op renteaftrek als je annuïtair of lineair aflost; een aflossingsvrij deel kan wel als aanvulling naast een aflossend deel bestaan.",
  },
  {
    titel: 'Nationale Hypotheek Garantie (NHG)',
    tags: ['NHG', 'Nationale Hypotheek Garantie', 'hypotheekgarantie', 'restschuld', 'waarborgfonds', 'hypotheek'],
    categorie: 'Wonen & hypotheek',
    controleerVoor: '2027-01-01',
    tekst:
      "De Nationale Hypotheek Garantie is een vangnet rond je hypotheek: als je door onvoorziene omstandigheden — zoals onvrijwillige werkloosheid, arbeidsongeschiktheid of een scheiding — je woning gedwongen met verlies moet verkopen, kan een eventuele restschuld onder voorwaarden worden overgenomen door het waarborgfonds. Om in aanmerking te komen moet de hypotheeksom onder een grens blijven die jaarlijks opnieuw wordt vastgesteld. Omdat de geldverstrekker met NHG minder risico loopt, bieden veel aanbieders voor zo'n hypotheek een iets gunstiger rentetarief aan dan zonder de garantie. Voor de garantie zelf betaal je eenmalig een premie over de hypotheeksom.",
  },
  {
    titel: 'Overwaarde',
    tags: ['overwaarde', 'woningwaarde', 'restschuld', 'eigen vermogen woning', 'hypotheekschuld'],
    categorie: 'Wonen & hypotheek',
    tekst:
      "Overwaarde is het verschil tussen de waarde van je woning en de hypotheekschuld die daar nog op rust. Stijgt de woningwaarde harder dan je schuld daalt — bijvoorbeeld door prijsstijgingen in de markt of doordat je aflost — dan groeit je overwaarde. Die overwaarde is vermogen dat vastzit in stenen: je kunt het meestal pas echt benutten als je verhuist, de woning verkoopt of een aanvullende financiering op de woning afsluit. Andersom kan het verschil ook negatief zijn — dan spreek je van een restschuld, omdat de woning minder waard is dan de openstaande hypotheek.",
  },
  {
    titel: 'Eigenwoningforfait',
    tags: ['eigenwoningforfait', 'Box 1', 'eigen woning', 'bijtelling', 'Wet Hillen', 'renteaftrek'],
    categorie: 'Wonen & hypotheek',
    controleerVoor: '2027-01-01',
    tekst:
      "Het eigenwoningforfait is een bijtelling bij je inkomen in Box 1 voor het woongenot van je eigen woning: de fiscus telt een deel van de waarde van je huis op bij je belastbaar inkomen, ook al ontvang je daar zelf geen geld voor. Tegenover dit forfait staat doorgaans de aftrek van de hypotheekrente die je betaalt, waardoor het saldo voor de meeste huizenbezitters met een lopende hypotheek beperkt blijft. Heb je geen of een kleine hypotheekschuld, dan bestaat er een aparte regeling (de zogeheten Wet Hillen) die het verschil tussen forfait en renteaftrek deels compenseert — maar deze compensatie wordt jaarlijks stapsgewijs afgebouwd en verdwijnt op termijn helemaal. Zowel het forfaitpercentage als het afbouwtempo van die compensatie kunnen van jaar tot jaar wijzigen.",
  },
  {
    titel: 'Verhuizen of downsizen als financiële hefboom',
    tags: ['downsizen', 'verhuizen', 'overwaarde vrijmaken', 'kleiner wonen', 'vrijheid', 'woonlasten verlagen'],
    categorie: 'Wonen & hypotheek',
    tekst:
      "Verhuizen naar een kleinere of goedkopere woning kan overwaarde omzetten in direct beschikbaar vermogen: het verschil tussen de verkoopprijs van je huidige huis en de aankoopprijs van de nieuwe woning komt vrij, na aflossing van de bestaande hypotheek. Dat vrijgekomen vermogen kun je bijvoorbeeld gebruiken om (extra) af te lossen, te beleggen, of als aanvulling op je inkomen in te zetten. Tegelijk verlaagt een kleinere of goedkopere woning vaak ook je structurele woonlasten, zoals hypotheeklasten en vaste kosten voor onderhoud en energie. Zo kan downsizen op twee manieren vrijheid opleveren: eenmalig door het vrijgekomen vermogen, en doorlopend door lagere maandelijkse lasten. Let erop dat vrijgekomen vermogen dat je niet in een nieuwe woning steekt, meestal in Box 3 terechtkomt in plaats van in Box 1.",
  },
  {
    titel: 'Aflossen versus beleggen bij je hypotheek',
    tags: ['aflossen', 'beleggen', 'hypotheek', 'rendement', 'risico', 'vermogensopbouw', 'Box 3'],
    categorie: 'Wonen & hypotheek',
    controleerVoor: '2027-01-01',
    tekst:
      "Heb je een vrij te besteden bedrag naast je hypotheek, dan heb je in grote lijnen twee keuzes: extra aflossen op je hypotheekschuld, of datzelfde bedrag beleggen. Extra aflossen levert een zeker voordeel op — je bespaart gegarandeerd de rente die je anders over dat bedrag had betaald, en je hypotheekschuld daalt direct en blijvend. Beleggen kent geen garantie: het potentiële rendement kan hoger uitpakken, maar er is ook kans op verlies, en de waarde van beleggingen (doorgaans belast in Box 3) schommelt mee met de markt. Een ander verschil is liquiditeit: vermogen dat in de stenen van je huis zit, krijg je meestal pas terug bij verkoop of herfinanciering, terwijl een beleggingsportefeuille doorgaans makkelijker om te zetten is in geld. Welke afweging het zwaarst weegt, hangt af van hoeveel zekerheid, tijdshorizon en risico bij je passen — de app kan dit voor jouw situatie inzichtelijk maken.",
  },

  // Beleggen (+8)
  {
    titel: 'Diversificatie',
    tags: ['diversificatie', 'spreiding', 'risico spreiden', 'beleggingsmix', 'portefeuille spreiden'],
    categorie: 'Beleggen',
    tekst:
      "Diversificatie betekent dat je je geld verdeelt over verschillende beleggingen in plaats van alles in één bedrijf, sector of land te stoppen. Het idee erachter is dat niet alle beleggingen tegelijk slecht presteren: gaat het mis met de ene positie, dan kunnen andere dat gedeeltelijk opvangen. Je kunt spreiden binnen een beleggingscategorie, bijvoorbeeld door in veel verschillende aandelen te beleggen, maar ook tussen categorieën zoals aandelen, obligaties en vastgoed. Diversificatie vermindert het risico dat één tegenvaller je hele portefeuille raakt, maar sluit verlies nooit helemaal uit — het beperkt vooral de impact van pech bij één specifieke belegging.",
  },
  {
    titel: 'Risico versus rendement',
    tags: ['risico en rendement', 'risico-rendementverhouding', 'verwacht rendement', 'risicopremie', 'volatiliteit'],
    categorie: 'Beleggen',
    tekst:
      "Beleggingen met een hoger verwacht rendement brengen vrijwel altijd meer onzekerheid met zich mee, ook wel de risico-rendementverhouding genoemd. De reden is dat beleggers een vergoeding willen voor het risico dat ze lopen: zonder kans op een tegenvaller zou niemand een hoger rendement eisen dan bij een veiligere optie. Een belegging die veel oplevert zonder enig risico bestaat in de praktijk niet; als iets te mooi klinkt om waar te zijn, zit het risico meestal ergens verstopt. Meer risico betekent ook dat de waarde van je belegging tussentijds sterker kan schommelen, zowel naar boven als naar beneden.",
  },
  {
    titel: 'Rente-op-rente',
    tags: ['rente-op-rente', 'samengestelde groei', 'compound interest', 'sneeuwbaleffect', 'vroeg beginnen met beleggen'],
    categorie: 'Beleggen',
    tekst:
      "Rente-op-rente betekent dat het rendement dat je al hebt opgebouwd, meegroeit met je belegging en vervolgens zelf ook weer rendement oplevert. Daardoor groeit je vermogen niet gelijkmatig maar steeds sneller naarmate de tijd verstrijkt, een soort sneeuwbaleffect. Dit maakt de tijd dat je belegd bent minstens zo belangrijk als het bedrag dat je inlegt: hoe eerder dit effect begint te werken, hoe langer het kan doorwerken. Onderbrekingen of het tussentijds opnemen van rendement remmen dit proces af, omdat er dan minder overblijft om verder mee te laten groeien.",
  },
  {
    titel: 'ETF versus los aandeel',
    tags: ['ETF', 'indexfonds', 'los aandeel', 'tracker', 'mandje beleggen', 'individuele aandelen'],
    categorie: 'Beleggen',
    tekst:
      "Een los aandeel is een belang in één specifiek bedrijf: het resultaat hangt volledig af van hoe dat ene bedrijf het doet. Een ETF (exchange traded fund) is een verzamelbelegging die in één keer een heel mandje van meerdere aandelen of obligaties volgt, vaak gekoppeld aan een index. Daardoor loop je met een ETF minder risico op één tegenvallend bedrijf, omdat winst en verlies van de onderliggende beleggingen elkaar deels compenseren. Bij losse aandelen zorgt de belegger zelf voor spreiding door in meerdere bedrijven te beleggen; een ETF regelt die spreiding al in één product.",
  },
  {
    titel: 'Kosten van beleggen',
    tags: ['beleggingskosten', 'lopende kosten', 'fondskosten', 'transactiekosten', 'kostenimpact rendement'],
    categorie: 'Beleggen',
    tekst:
      "Beleggen brengt verschillende soorten kosten met zich mee, zoals transactiekosten bij aan- en verkoop en lopende beheerkosten van een fonds of ETF. Omdat lopende kosten elk jaar opnieuw van je rendement worden afgetrokken, tellen ze door het rente-op-rente-effect over een lange periode harder op dan je op het eerste gezicht zou denken. Beleggingen met een vergelijkbaar bruto rendement kunnen daardoor op lange termijn een heel ander netto resultaat opleveren, puur door het verschil in kosten. Naast het verwachte rendement is de hoogte van de kosten dus een relevante factor om te kennen — de app kan dit voor jouw beleggingen inzichtelijk maken.",
  },
  {
    titel: 'Dividend',
    tags: ['dividend', 'winstuitkering', 'aandeelhoudersvergoeding', 'dividendrendement', 'herbeleggen dividend'],
    categorie: 'Beleggen',
    tekst:
      "Dividend is het deel van de winst dat een bedrijf uitkeert aan zijn aandeelhouders, als vergoeding voor het feit dat zij mede-eigenaar zijn. Niet elk bedrijf keert dividend uit: sommige bedrijven herinvesteren hun winst liever in verdere groei in plaats van die uit te keren. Dividend kan periodiek worden uitgekeerd en je kunt het vaak automatisch laten herbeleggen, waardoor het via rente-op-rente ook weer meegroeit. Het al dan niet uitkeren van dividend zegt op zichzelf niets over hoe goed of slecht een belegging is — het is één van de manieren waarop een belegging rendement kan opleveren, naast waardestijging van de koers.",
  },
  {
    titel: 'Herbalanceren',
    tags: ['herbalanceren', 'rebalancing', 'portefeuille in balans', 'gewenste verhouding', 'risicoprofiel bewaken'],
    categorie: 'Beleggen',
    tekst:
      "Herbalanceren betekent dat je je portefeuille periodiek terugbrengt naar de verhouding tussen beleggingscategorieën die je oorspronkelijk voor ogen had. Omdat verschillende beleggingen in waarde stijgen of dalen, verschuift die verhouding vanzelf: presteert de ene categorie beter, dan neemt die geleidelijk een groter deel van je portefeuille in dan bedoeld was. Door te herbalanceren verkoop je een deel van wat relatief is gegroeid en koop je bij van wat relatief is achtergebleven, zodat het risico van je portefeuille weer aansluit bij de oorspronkelijke verhouding. Dit gebeurt meestal op vaste momenten of wanneer de verhouding te ver is afgeweken, niet naar aanleiding van korte-termijnbewegingen in de markt.",
  },
  {
    titel: 'Tijd in de markt versus market timing',
    tags: ['tijd in de markt', 'market timing', 'consistent beleggen', 'instapmoment', 'beleggingshorizon'],
    categorie: 'Beleggen',
    tekst:
      "Market timing is het proberen te voorspellen wanneer een markt laag staat om in te stappen en wanneer die hoog staat om weer uit te stappen. Dit blijkt in de praktijk erg lastig, omdat koersbewegingen op korte termijn grillig en moeilijk te voorspellen zijn, ook voor professionele beleggers. 'Tijd in de markt' verwijst naar het consistent belegd blijven over een langere periode, in plaats van tijdelijk aan de zijlijn te gaan staan in een poging het perfecte moment te raden. Onderzoek naar beleggingsgedrag laat zien dat het missen van slechts een paar sterke beursdagen — bijvoorbeeld doordat je er tijdelijk tussenuit stapte — al een aanzienlijk effect kan hebben op het uiteindelijke rendement.",
  },

  // Sparen & budgetteren (+4)
  {
    titel: 'Potjesmethode',
    tags: ['potjesmethode', 'sinking funds', 'spaarpotjes', 'sparen voor uitgaven', 'vooruit sparen', 'grote uitgaven', 'buffer per doel'],
    categorie: 'Sparen & budgetteren',
    tekst:
      "Bij de potjesmethode zet je apart geld opzij voor specifieke toekomstige uitgaven, verdeeld over meerdere virtuele 'potjes' met elk een eigen doel, zoals onderhoud, verzekeringspremies, cadeaus of vakantie. Omdat je vooraf en geleidelijk spaart, voelt zo'n uitgave niet als een plotselinge tegenvaller maar als iets waar al voor is gereserveerd. Dit voorkomt dat voorspelbare maar onregelmatige kosten je lopende maandbudget verstoren of dat je daarvoor je noodbuffer moet aanspreken. In de app kun je dit soort doelen vastleggen, zodat je per potje ziet hoeveel je al hebt opgebouwd en hoe dicht je bij het gewenste niveau zit.",
  },
  {
    titel: 'Vaste lasten versus vrij besteedbaar',
    tags: ['vaste lasten', 'vrij besteedbaar', 'budgetteren', 'vaste kosten', 'flexibele uitgaven', 'grip op je geld'],
    categorie: 'Sparen & budgetteren',
    tekst:
      "Vaste lasten zijn terugkerende verplichtingen zoals huur of hypotheek, verzekeringen en abonnementen, die maandelijks ongeveer gelijk blijven en waar je in het dagelijks leven weinig keuzevrijheid over hebt. Vrij besteedbaar is het deel van je inkomen dat overblijft nadat vaste lasten en sparen zijn verrekend, en waarover jij dag in dag uit keuzes maakt, zoals boodschappen of uitjes. Dit onderscheid helpt bij grip op je geld omdat het laat zien waar je daadwerkelijk stuurruimte hebt: bijsturen op vaste lasten vraagt meestal een eenmalige bewuste stap, zoals een contract vergelijken of opzeggen, terwijl vrij besteedbaar zich dagelijks laat bijsturen. De app splitst je uitgaven op deze manier, zodat je in één oogopslag ziet hoeveel ruimte je feitelijk hebt.",
  },
  {
    titel: 'Automatisch sparen',
    tags: ['automatisch sparen', 'pay yourself first', 'spaardoel', 'automatische overschrijving', 'wilskracht', 'gedragspatroon'],
    categorie: 'Sparen & budgetteren',
    tekst:
      "Bij automatisch sparen stel je een vaste overschrijving naar een spaarrekening in die direct plaatsvindt zodra je inkomen binnenkomt, vaak aangeduid als 'pay yourself first'. Zo hoef je niet elke maand opnieuw de bewuste keuze te maken om te sparen: het gedrag verplaatst van een herhaalde wilskrachtbeslissing, die kan verwateren onder verleiding of vermoeidheid, naar een eenmalige instelling die daarna vanzelf doorloopt. Omdat het sparen al is gebeurd voordat je de rest van je geld ziet als 'te besteden', voelt het minder als een offer en blijft het makkelijker vol te houden. In de app leg je zo'n spaardoel vast, zodat je de voortgang blijft volgen terwijl het automatisch sparen zelf op de achtergrond bij je bank doorloopt.",
  },
  {
    titel: 'Noodbuffer eerst, dan pas beleggen',
    tags: ['noodbuffer', 'buffer eerst beleggen', 'spaarbuffer', 'volgorde sparen en beleggen', 'financiële veiligheid', 'liquiditeit'],
    categorie: 'Sparen & budgetteren',
    tekst:
      "Een noodbuffer is direct opneembaar spaargeld dat onverwachte tegenslagen, zoals een kapot apparaat, baanverlies of onverwachte kosten, kan opvangen zonder dat je daarvoor hoeft te lenen of beleggingen gedwongen moet verkopen. Beleggingen kunnen op korte termijn flink in waarde schommelen, en geld dat je mogelijk op korte termijn nodig hebt hoort daarom niet in beleggingen te zitten waar een ongunstig verkoopmoment je kan worden opgedrongen. Door eerst een buffer op te bouwen voordat je begint met beleggen, voorkom je dat een tegenvaller je dwingt om beleggingen vroegtijdig te liquideren, en geef je belegd vermogen de tijd om koersschommelingen uit te zitten. De app laat zien hoe je buffer zich verhoudt tot je uitgavenpatroon, als naslag naast keuzes rond beleggen.",
  },

  // Schulden (+5)
  {
    titel: 'Sneeuwbalmethode versus lawinemethode',
    tags: ['sneeuwbalmethode', 'lawinemethode', 'schulden aflossen', 'aflosstrategie', 'motivatie'],
    categorie: 'Schulden',
    tekst:
      "Bij de sneeuwbalmethode los je eerst je kleinste schuld volledig af, ongeacht de rente die daarop staat, terwijl je op de overige schulden alleen het minimum blijft betalen. Zodra die kleinste schuld weg is, gebruik je het vrijgekomen aflosbedrag om de volgende schuld (op grootte) aan te pakken — zo groeit je aflossing steeds verder, vandaar de naam. Het voordeel is vooral psychologisch: je boekt snel zichtbare successen, wat motiverend werkt om vol te houden. Bij de lawinemethode los je juist eerst de schuld met de hoogste rente af, ook al is die niet per se de kleinste, omdat dat rekenkundig het meeste rente bespaart over de hele looptijd. Beide methodes draaien om dezelfde truc — extra aflossen op één schuld terwijl je de rest op het minimum houdt — maar verschillen in de volgorde waarin je dat doet.",
  },
  {
    titel: 'Hypotheek versus consumptief krediet',
    tags: ['hypotheek', 'consumptief krediet', 'persoonlijke lening', 'doorlopend krediet', 'onderpand', 'zekerheid'],
    categorie: 'Schulden',
    controleerVoor: '2027-01-01',
    tekst:
      "Een hypotheek is een lening waarbij je woning dient als onderpand: de kredietverstrekker heeft daardoor zekerheid, wat doorgaans zorgt voor een lagere rente dan bij andere leenvormen. Consumptief krediet — zoals een persoonlijke lening, een doorlopend krediet of een creditcardschuld — kent geen onderpand en is bedoeld voor consumptie in plaats van voor de aankoop van een bezit dat in waarde kan blijven staan; het risico voor de verstrekker is hoger, en dat vertaalt zich meestal in een hogere rente. Bij een hypotheek loop je bij aanhoudende betalingsproblemen het risico dat de woning gedwongen verkocht wordt; bij consumptief krediet ontbreekt dat onderpand, maar volgt bij achterstand wel een incassotraject en een registratie bij het kredietregistratiesysteem. Onder voorwaarden is de rente over een hypotheek voor je eigen woning deels aftrekbaar in Box 1, terwijl de rente over consumptief krediet fiscaal niet aftrekbaar is. Dat maakt een hypotheek in de praktijk een andere categorie lening dan consumptief krediet: gericht op het financieren van een bezit, met meer zekerheid en doorgaans lagere kosten.",
  },
  {
    titel: 'BKR-registratie',
    tags: ['BKR', 'kredietregistratie', 'Bureau Krediet Registratie', 'CKI', 'betalingsachterstand', 'negatieve registratie'],
    categorie: 'Schulden',
    controleerVoor: '2027-02-01',
    tekst:
      "BKR (voluit Bureau Krediet Registratie, tegenwoordig Stichting BKR) houdt een centraal systeem bij waarin leningen en kredietvormen worden geregistreerd zodra ze een bepaalde omvang en looptijd hebben — denk aan een persoonlijke lening, een doorlopend krediet, een creditcard of soms een telefoonabonnement met toestel. Kredietverstrekkers zijn verplicht dit register te raadplegen voordat ze een nieuwe lening verstrekken, zodat ze zien welke leenverplichtingen je al hebt en overkreditering wordt voorkomen. Een registratie is in principe neutraal tot positief zolang je netjes aflost; ontstaat er een betalingsachterstand, dan volgt een negatieve registratie, die het voor een tijd lastiger kan maken om een nieuwe lening, hypotheek of soms een huurwoning te krijgen. Op dit moment werkt dit kredietregistratiestelsel nog vooral op basis van eigen reglementen van BKR; er ligt een wetsvoorstel dat dit stelsel voor het eerst wettelijk zou gaan regelen, met onder meer een kortere bewaartermijn voor kredietgegevens en het recht om sneller geïnformeerd te worden zodra een achterstand wordt geregistreerd, maar dat moet nog door het parlement worden afgerond. De app kan je BKR-status niet inzien; daarvoor kun je terecht bij BKR zelf.",
  },
  {
    titel: 'Studieschuld (DUO)',
    tags: ['studieschuld', 'DUO', 'leenstelsel', 'basisbeurs', 'aanvullende beurs', 'studielening'],
    categorie: 'Schulden',
    controleerVoor: '2027-09-01',
    tekst:
      "Studiefinanciering van DUO bestaat tegenwoordig weer uit een combinatie van een basisbeurs en, voor wie ouders een lager inkomen hebben, een aanvullende beurs — voor de meeste opleidingen als prestatiebeurs, wat betekent dat die na het (op tijd) halen van je diploma definitief in een gift wordt omgezet. Daarnaast kun je een rentedragende lening en een collegegeldkrediet opnemen om de rest van je studiekosten te dekken; dat is het deel dat je zelf, met rente, moet terugbetalen. Terugbetalen begint pas een tijd na het einde van je studie en is inkomensafhankelijk: hoeveel je per maand aflost hangt af van wat je verdient, met bescherming voor wie weinig verdient. De rente op de lening staat voor een bepaalde periode vast en wordt daarna door de overheid opnieuw vastgesteld. Een studieschuld en het bijbehorende aflospatroon tellen ook mee bij een latere hypotheekaanvraag, omdat ze invloed hebben op hoeveel je kunt lenen.",
  },
  {
    titel: 'Vervroegd aflossen: de afweging',
    tags: ['vervroegd aflossen', 'extra aflossen', 'rendement', 'rente besparen', 'opportuniteitskosten', 'financiële buffer'],
    categorie: 'Schulden',
    tekst:
      "Vervroegd aflossen betekent dat je meer terugbetaalt op een lening dan strikt verplicht is, waardoor je over het resterende bedrag minder rente hoeft te betalen — het rendement daarvan is in feite gelijk aan de rente die je bespaart. Of dat aantrekkelijker is dan hetzelfde geld ergens anders inzetten (bijvoorbeeld beleggen of op een spaarrekening zetten) hangt af van hoe die bespaarde rente zich verhoudt tot het verwachte rendement van het alternatief, en of er fiscale aspecten meespelen — bij een eigenwoningschuld is de hypotheekrente bijvoorbeeld onder voorwaarden deels aftrekbaar in Box 1, wat het werkelijke voordeel van aflossen verkleint. Geld dat in een aflossing gaat zit vast: het is niet zomaar weer opneembaar als je het onverwacht nodig hebt, dus vervroegd aflossen gaat ten koste van je financiële flexibiliteit op korte termijn. Sommige leningen kennen bovendien een boeterente of specifieke voorwaarden bij vervroegde aflossing, waardoor het niet altijd kosteloos is. Deze afweging — rente besparen versus rendement en flexibiliteit elders — is dan ook een kwestie van prioriteiten, niet van een universeel juiste keuze.",
  },

  // FIRE & vrijheid (+5)
  {
    titel: 'Coast FIRE',
    tags: ['Coast FIRE', 'rente op rente', 'vermogen laten groeien', 'pensioenopbouw', 'FIRE-varianten', 'vrijheid'],
    categorie: 'FIRE & vrijheid',
    tekst:
      "Coast FIRE beschrijft het punt waarop je al genoeg vermogen hebt opgebouwd om — zonder dat je er verder geld aan toevoegt — door het effect van rente-op-rente vanzelf door te groeien tot een volwaardig pensioen. Vanaf dat moment hoef je in theorie niet meer te sparen voor je oudedag; je huidige inkomen hoeft dan alleen nog je lopende uitgaven te dekken, niet meer je toekomstige vrijheid. Dat kan ruimte geven om ander werk te kiezen, minder uren te draaien of een rustiger tempo aan te houden, omdat de opbouw voor later al op de automatische piloot staat. Hoeveel vermogen daarvoor nodig is, hangt af van de tijd tot je pensioenmoment en het verwachte rendement — de app rekent dit voor jouw situatie door. Coast FIRE is dus geen moment van stoppen met werken, maar een verschuiving in waarom je nog werkt.",
  },
  {
    titel: 'Barista FIRE',
    tags: ['Barista FIRE', 'parttime werken', 'FIRE-varianten', 'gedeeltelijke vrijheid', 'vermogen aanvullen', 'werk en vrijheid'],
    categorie: 'FIRE & vrijheid',
    tekst:
      "Barista FIRE is de naam voor een tussenvorm van financiële onafhankelijkheid: je stopt niet volledig met werken, maar bouwt je uren af naar een lichter, vaak leuker parttime baan naast een al opgebouwd vermogen. Het parttime inkomen dekt een deel van je uitgaven, terwijl het vermogen de rest aanvult. De keuze om te blijven werken is vaak niet alleen financieel: sociale contacten, dagstructuur en het laten doorlopen van pensioenopbouw via een werkgever spelen vaak ook mee. Omdat je minder afhankelijk bent van je inkomen om rond te komen, ontstaat er meer ruimte om werk te kiezen op basis van plezier in plaats van noodzaak. De naam verwijst naar het idee van een relaxter bijbaantje naast een deels opgebouwd vermogen, al is de invulling in de praktijk net zo divers als bij volledig werken.",
  },
  {
    titel: 'Sabbatical',
    tags: ['Sabbatical', 'tussentijdse vrijheid', 'onbetaald verlof', 'verlofsparen', 'pauze nemen', 'career break'],
    categorie: 'FIRE & vrijheid',
    controleerVoor: '2027-07-01',
    tekst:
      "Een sabbatical is een langere aaneengesloten periode waarin je tijdelijk stopt met werken, zonder dat dit een definitief afscheid van je baan of loopbaan is — anders dan volledige FIRE is het doel een pauze, geen permanent stoppen. Zo'n periode overbrug je meestal met een gespaarde buffer, met onbetaald verlof via je werkgever, of met verlofsparen: in Nederland kun je bovenwettelijke vakantie-uren via de werkgever fiscaalvriendelijk opsparen om ze later achter elkaar op te nemen, bijvoorbeeld voor een sabbatical. Zo'n periode heeft wel gevolgen voor de langere termijn: tijdens onbetaald verlof loopt de opbouw van aanvullend pensioen bij je werkgever meestal niet door, en als je die periode in het buitenland doorbrengt, kan dat ook invloed hebben op de opbouw van AOW-rechten. Een sabbatical vraagt dus niet per se een volledig FIRE-vermogen, maar wel een buffer die is afgestemd op de duur van de pauze plus de tijd om daarna weer op gang te komen.",
  },
  {
    titel: 'Lean FIRE',
    tags: ['Lean FIRE', 'sober leven', 'minimalistisch leven', 'FIRE-varianten', 'lager uitgavenniveau', 'vrijheid'],
    categorie: 'FIRE & vrijheid',
    tekst:
      "Lean FIRE is een variant van financiële onafhankelijkheid waarbij je bewust kiest voor een sober en eenvoudig uitgavenpatroon nadat je bent gestopt met werken. Omdat je met minder uitgaven toekunt, is er een kleiner opgebouwd vermogen nodig om hetzelfde gevoel van vrijheid te bereiken dan bij een ruimere leefstijl. Het draait dus niet om zo weinig mogelijk geld hebben, maar om bewust kiezen voor eenvoud, zodat vrijheid eerder binnen bereik komt. Het tegenovergestelde van Lean FIRE is Fat FIRE, waarbij juist een ruimer uitgavenniveau het uitgangspunt is. Welk uitgavenniveau bij jou past, hangt af van wat voor jou als 'genoeg' voelt — de app laat op basis van jouw cijfers zien wat de verschillende niveaus voor jouw situatie betekenen.",
  },
  {
    titel: 'Fat FIRE',
    tags: ['Fat FIRE', 'ruimer leven', 'comfortabel leven', 'FIRE-varianten', 'hoger uitgavenniveau', 'vrijheid'],
    categorie: 'FIRE & vrijheid',
    tekst:
      "Fat FIRE is een variant van financiële onafhankelijkheid waarbij je na het stoppen met werken een ruimer en comfortabeler leven wilt blijven leiden, met bijvoorbeeld meer budget voor reizen, wonen of andere wensen. Omdat de gewenste uitgaven hoger liggen, is er een groter opgebouwd vermogen nodig om hetzelfde gevoel van vrijheid te bereiken dan bij een sobere leefstijl. Het verschil met de klassieke invulling van FIRE zit dus niet in de mechaniek van sparen en beleggen, maar in het gewenste comfortniveau na het stoppen met werken. Het tegenovergestelde van Fat FIRE is Lean FIRE, waarbij juist een soberder uitgavenniveau volstaat. Welke balans tussen minder werken en meer besteden bij jou past, kan de app op basis van jouw cijfers concreet laten zien.",
  },

  // Gedrag & mindset (+6)
  {
    titel: 'Mentale potjes',
    tags: ['mentale potjes', 'mental accounting', 'potjes-denken', 'geld labelen', 'psychologie van geld'],
    categorie: 'Gedrag & mindset',
    tekst:
      "Je verdeelt geld vaak niet als één neutrale hoeveelheid, maar mentaal in aparte 'potjes' — afhankelijk van waar het vandaan komt (salaris, bonus, cadeau) of waar het voor bedoeld is (boodschappen, vakantie, sparen). Dat potjes-denken geeft overzicht en houvast, maar kan ook tot inconsistent gedrag leiden: geld dat als 'meevaller' aanvoelt, geef je vaak makkelijker uit dan hard verdiend salaris, terwijl het exact dezelfde euro is. Het kan er ook toe leiden dat je tegelijk spaart in het ene potje en leent in het andere, terwijl die twee bedragen elkaar op papier zouden kunnen compenseren. Dit mechanisme wordt vaak zichtbaar zodra je geld uit verschillende bronnen of met verschillende doelen naast elkaar bekijkt.",
  },
  {
    titel: 'Lifestyle-inflatie',
    tags: ['lifestyle inflatie', 'levensstijlinflatie', 'uitgavenpatroon', 'inkomensgroei', 'vrijheid opbouwen'],
    categorie: 'Gedrag & mindset',
    tekst:
      "Lifestyle-inflatie is het verschijnsel dat je uitgaven vaak meegroeien zodra je inkomen stijgt: een hoger salaris vertaalt zich al snel in een groter huis, een duurdere auto of meer consumptie, in plaats van in extra ruimte om vermogen of vrijheid op te bouwen. Doordat inkomen en uitgavenpatroon gelijk opschuiven, kan de afstand tot financiële onafhankelijkheid in de tijd gelijk blijven, ook al stijgt het inkomen. Dit proces verloopt meestal geleidelijk en onbewust: nieuwe uitgaven worden al snel het nieuwe 'normaal' en vormen op hun beurt weer het referentiepunt voor de volgende vergelijking. Het mechanisme verklaart waarom een hoger inkomen niet vanzelf tot meer financiële ruimte leidt.",
  },
  {
    titel: 'Uitgestelde bevrediging',
    tags: ['uitgestelde bevrediging', 'delayed gratification', 'zelfbeheersing', 'impulsaankopen', 'lange termijn denken'],
    categorie: 'Gedrag & mindset',
    tekst:
      "Uitgestelde bevrediging is het vermogen om een directe wens opzij te zetten in ruil voor een grotere opbrengst op een later moment — bijvoorbeeld een aankoop uitstellen ten gunste van meer ruimte voor vrijheid in de toekomst. Dit is een bekende uitdaging omdat je brein een beloning die nu beschikbaar is doorgaans zwaarder laat wegen dan een grotere beloning die pas later volgt, ook al is die laatste rationeel gezien voordeliger. De afweging tussen 'nu' en 'later' verschilt van persoon tot persoon en kan ook per situatie wisselen, afhankelijk van stress, gewoonte en de directe omgeving. Het concept verklaart waarom sparen en beleggen voor de langere termijn voor de meeste mensen een vorm van zelfdiscipline blijft vragen, ook wanneer de rationele voordelen duidelijk zijn.",
  },
  {
    titel: 'Geldstress',
    tags: ['geldstress', 'financiële stress', 'stress en beslissingen', 'geldzorgen', 'cognitieve belasting'],
    categorie: 'Gedrag & mindset',
    tekst:
      "Geldstress ontstaat wanneer zorgen over geld — bijvoorbeeld door schulden, een krappe maand of onzekerheid over de toekomst — voortdurend aandacht opeisen. Onderzoek laat zien dat aanhoudende geldstress de mentale ruimte die overblijft voor andere beslissingen kan verkleinen, waardoor het maken van weloverwogen financiële keuzes juist lastiger kan worden. Dat kan een zichzelf versterkend patroon in stand houden: stress leidt tot minder doordachte beslissingen, wat vervolgens weer kan bijdragen aan meer stress. Dit mechanisme laat zien waarom geldzorgen niet alleen de portemonnee raken, maar ook het denkvermogen dat nodig is om er weloverwogen mee om te gaan.",
  },
  {
    titel: 'Sociale vergelijking',
    tags: ['sociale vergelijking', 'keeping up with the joneses', 'vergelijken met anderen', 'sociale druk', 'uitgavenpatroon'],
    categorie: 'Gedrag & mindset',
    tekst:
      "Sociale vergelijking is de neiging om je eigen financiële situatie en uitgavenpatroon af te zetten tegen dat van anderen, zoals buren, collega's, familie of mensen op sociale media. Hierdoor kunnen je uitgaven meer gestuurd worden door wat anderen doen of laten zien, dan door wat aansluit bij je eigen doelen of situatie. Sociale media versterkt dit effect vaak, omdat vooral de zichtbare en positieve kant van andermans financiële leven wordt getoond, zonder de schulden, leningen of keuzes die daar mogelijk aan ten grondslag liggen. Het mechanisme verklaart waarom uitgavenpatronen soms meer een reactie op de omgeving zijn dan een uitkomst van eigen afwegingen.",
  },
  {
    titel: 'Geldscripts',
    tags: ['geldscripts', 'money scripts', 'opvoeding en geld', 'onbewuste overtuigingen', 'geldgedrag'],
    categorie: 'Gedrag & mindset',
    tekst:
      "Geldscripts zijn onbewuste overtuigingen over geld die je vaak al vroeg in je leven meekrijgt, gevormd door de manier waarop in je opvoeding met geld werd omgegaan of erover werd gesproken. Voorbeelden zijn de overtuiging dat praten over geld ongepast is, dat sparen op zichzelf al een deugd is, of juist dat geld er is om direct te gebruiken zodra het beschikbaar is. Deze scripts werken vaak op de achtergrond door in hoe je nu beslissingen neemt, zonder dat je je daar actief van bewust bent, en kunnen soms haaks staan op de doelen die je voor jezelf hebt. Ze herkennen helpt om onderscheid te maken tussen gedrag dat voortkomt uit een bewuste keuze en gedrag dat eigenlijk een overgenomen patroon uit het verleden is.",
  },

  // TriFinity-begrippen (+8)
  {
    titel: 'Gezondheidsgetal',
    tags: ['gezondheidsscore', 'financiële gezondheid', 'gezondheidsindicator', 'hoe sta ik ervoor', 'pijlers'],
    categorie: 'TriFinity-begrippen',
    tekst:
      "Het gezondheidsgetal is één samengesteld cijfer dat de app berekent uit een set indicatoren, verdeeld over vier gedragspijler-groepen: Rondkomen, Buffer, Schuld en Vrijheid. Denk aan je spaarquote en budgetdiscipline (rondkomen), je noodfondsdekking (buffer), de verhouding tussen schulden en maandlasten (schuld), en je voortgang richting financiële vrijheid en spreiding van je vermogen (vrijheid). Elke indicator krijgt een deelscore en een gewicht; is een indicator niet actief (bijvoorbeeld omdat je nog geen budgetten hebt ingesteld), dan wordt het gewicht herverdeeld over de overige indicatoren zodat het getal toch een eerlijk beeld blijft geven. Dezelfde berekening voedt zowel het live cijfer op je overzichtspagina als de historische trendlijn, zodat je huidige stand en je verleden altijd consistent zijn. Het getal is bedoeld als kompas, niet als eindoordeel — het laat zien waar je aandacht het meest oplevert.",
  },
  {
    titel: 'Hefboom / stoplicht-status',
    tags: ['hefboom', 'stoplicht', 'statuspunt', 'op koers', 'aandacht', 'risico', 'leverage-status'],
    categorie: 'TriFinity-begrippen',
    tekst:
      "Een hefboom is de app-term voor een van de knoppen waaraan je kunt draaien om je financiële situatie te verbeteren — denk aan cashflow, schulden of bezittingen. Bij elke hefboom hoort een stoplicht-status: 'Goed op koers' (groen), 'Aandacht' (oranje) of 'Risico' (rood), afgeleid van de onderliggende deelscore van die hefboom. Deze status is bewust losgekoppeld van de kleur die je zelf als persoonlijk accent instelt in de app — stoplichtkleuren blijven altijd hetzelfde, ongeacht je thema, omdat ze een betekenis (status) uitdrukken en geen identiteit. Je vindt dezelfde statuspunten terug op meerdere plekken in de app (zoals de hefbomen-rij en het lever-kompas), zodat je in één oogopslag ziet welke hefboom nu je aandacht vraagt.",
  },
  {
    titel: 'Soevereiniteitsfases',
    tags: ['soevereiniteit', 'Recovery', 'Stability', 'Momentum', 'Mastery', 'jouw pad', 'niveau'],
    categorie: 'TriFinity-begrippen',
    tekst:
      "De soevereiniteitsfases (Recovery, Stability, Momentum, Mastery) beschrijven waar je ongeveer staat op je reis naar financiële vrijheid, gebaseerd op signalen als je vermogen, je buffer in maanden en je vrijheidspercentage. Dit is uitdrukkelijk een duidings- en motivatielaag, geen toegangspoort: geen enkele functie in de app wordt verborgen of vergrendeld op basis van je fase. Wat je in de app kunt zien en gebruiken, hangt af van de modules die je hebt aangezet en het abonnement-onderdeel dat je gebruikt — nooit van je soevereiniteitsniveau. De fase-teksten zijn bewust geformuleerd als betekenisvolle mijlpalen op de weg naar vrijheid ('geld is opgeslagen tijd'), niet als 'ontgrendel functie X'. Zo krijg je duiding en motivatie zonder dat je ooit het gevoel hebt dat de app iets voor je achterhoudt vanwege waar je in je reis staat.",
  },
  {
    titel: "Wat-als-scenario's",
    tags: ['wat-als', 'scenario', 'simulatie', 'toekomst', 'projectie', 'wat als ik'],
    categorie: 'TriFinity-begrippen',
    tekst:
      "Met een wat-als-scenario in de Toekomst-module kun je op een aparte pagina de knoppen van je financiële toekomst verschuiven — bijvoorbeeld je verwachte rendement, je uitgavenpatroon, een woningstrategie of een levensgebeurtenis — en meteen zien wat dat betekent voor je projectie, zonder dat dit je echte, opgeslagen gegevens aanpast. Achter de schermen rekent één en dezelfde rekenmotor zowel je 'gewone' toekomstprojectie als elk wat-als-scenario door, zodat de vergelijking eerlijk is: je ziet het verschil dat ontstaat door de aanpassing zelf, niet door een ander rekenpad. Ontbreekt er cruciale invoer (zoals je geboortedatum), dan krijg je een duidelijke melding in plaats van een stil, mogelijk onjuist resultaat. Zo kun je vrij verkennen 'wat als ik dit anders zou doen' voordat je een echte keuze maakt.",
  },
  {
    titel: 'Huishouden-perspectieven',
    tags: ['perspectief', 'eigen', 'partner', 'gezamenlijk', 'huishouden', 'perspectiefwissel'],
    categorie: 'TriFinity-begrippen',
    tekst:
      "Wanneer je een huishouden deelt met een partner, kun je in de app schakelen tussen drie perspectieven: eigen (alleen jouw cijfers), partner (de cijfers van je partner) en huishouden (het gezamenlijke totaal). De app onthoudt van elk item of het van jou, je partner, of gezamenlijk bezit is, en telt gedeelde kosten en schulden naar rato mee volgens de verdeelafspraak die jullie hebben ingesteld (bijvoorbeeld gelijk verdeeld, naar inkomensverhouding, of één partner die alles draagt). Overal waar je niet in je eigen perspectief kijkt, toont de app een duidelijk label zodat je nooit per ongeluk denkt dat getallen van je partner of het huishouden je eigen cijfers zijn. Zo krijg je zowel je persoonlijke beeld als het volledige gezinsplaatje, zonder dat de twee door elkaar lopen.",
  },
  {
    titel: 'Benchmark-vergelijking',
    tags: ['benchmark', 'vergelijking', 'CBS', 'leeftijdsgenoten', 'referentiegroep', 'hoe sta ik ervoor vergeleken'],
    categorie: 'TriFinity-begrippen',
    controleerVoor: '2027-06-01',
    tekst:
      "De benchmark-vergelijking spiegelt jouw cijfers aan een referentiegroep van vergelijkbare Nederlandse huishoudens, gebaseerd op gepubliceerde CBS-statistieken over vermogen en besteedbaar inkomen naar leeftijd, gecorrigeerd voor huishoudtype. Voor grootheden die geen officiële statistiek kent — zoals het gezondheidsgetal of je vrijheidsleeftijd — bouwt de app een gemodelleerde 'typische peer' op basis van de mediane CBS-cijfers voor jouw leeftijdsgroep, en rekent die peer door dezelfde rekenmotoren als die je eigen cijfers doorrekenen. Zo blijft de vergelijking appels-met-appels: geen losse, eigen som, maar dezelfde formules aan beide kanten. Elke vergelijking toont ook de vrijheidstijd-duiding van het verschil, en de app is transparant over welke onderdelen gemeten CBS-cijfers zijn en welke onderdelen een geraamd model betreffen.",
  },
  {
    titel: 'Aandachtspunten',
    tags: ['aandachtspunten', 'signalen', 'belasting', 'budget', 'schulden', 'bezittingen', 'actiepunten'],
    categorie: 'TriFinity-begrippen',
    tekst:
      "Aandachtspunten zijn signalen die de app automatisch afleidt uit je belasting-, budget-, schuld- en bezittingengegevens: denk aan een fiscale kans die dit jaar nog benut kan worden, een budgetcategorie die structureel boven de gangbare NIBUD-norm uitkomt, een schuld met een rentepercentage dat versneld aflossen de moeite waard maakt, of vermogen dat weinig rendeert terwijl er ruimte is om het te laten werken. Elk aandachtspunt toont het geschatte besparingspotentieel, zowel in euro's als in vrijheidsdagen, zodat je de impact meteen in tijd kunt duiden. Vanuit een aandachtspunt kun je met één klik een concrete actie aanmaken; heb je een aandachtspunt al opgepakt of recent afgerond, dan onderdrukt de app het een tijd lang zodat je niet herhaaldelijk dezelfde suggestie krijgt — tot het moment dat een jaarlijks terugkerende kans weer relevant wordt. Dezelfde signalen voeden ook het gesprek met Will, je coach, zodat inzicht en gesprek op elkaar aansluiten.",
  },
  {
    titel: 'Briefing / weekoverzicht',
    tags: ['briefing', 'weekoverzicht', 'samenvatting', 'overzicht', 'wat is er gebeurd'],
    categorie: 'TriFinity-begrippen',
    tekst:
      "De briefing is het periodieke overzicht dat de app voor je samenstelt op basis van wat er recent is gebeurd in je financiën: opvallende observaties, tips, aankomende gebeurtenissen, punten die aandacht vragen, behaalde mijlpalen en relevant marktnieuws. Elk briefje wordt automatisch gegenereerd uit je actuele gegevens — de app verzint geen cijfers, maar leest ze uit dezelfde bronnen als de rest van de app (aanbevelingen, gezondheidspijlers, doelvoortgang, levensgebeurtenissen). Een aparte redactielaag kan de formulering van een briefje verzorgen, maar raakt nooit de onderliggende cijfers aan. Je kunt de briefing zowel op je overzichtspagina bekijken als, indien ingesteld, periodiek als e-mail ontvangen, zodat je ook zonder in te loggen een samenvatting krijgt van hoe je ervoor staat.",
  },

  // Verzekeren & risico (+3)
  {
    titel: "Arbeidsongeschiktheidsverzekering (AOV) voor zzp'ers",
    tags: ['AOV', 'arbeidsongeschiktheid', 'zzp', 'zelfstandigen', 'inkomensverzekering', 'Wet BAZ'],
    categorie: 'Verzekeren & risico',
    controleerVoor: '2027-01-01',
    tekst:
      "Als zzp'er bouw je geen loondoorbetaling bij ziekte op zoals een werknemer, en je valt ook niet automatisch onder de WIA — raak je arbeidsongeschikt, dan valt je inkomen in principe grotendeels weg terwijl vaste lasten gewoon doorlopen. Een arbeidsongeschiktheidsverzekering (AOV) keert een periodieke uitkering uit zodra je volgens de polisvoorwaarden arbeidsongeschikt raakt, zodat je financiële ademruimte houdt om te herstellen of je werk aan te passen. Zo voorkom je dat je bij ziekte meteen moet interen op de vrijheid die je hebt opgebouwd. Op dit moment is een AOV voor zelfstandigen nog vrijwillig, maar er ligt een wetsvoorstel dat op termijn een vorm van verplichte basisdekking voor zelfstandigen wil invoeren — de precieze regels en ingangstermijn staan nog niet vast.",
  },
  {
    titel: 'Overlijdensrisicoverzekering (ORV)',
    tags: ['ORV', 'overlijdensrisicoverzekering', 'hypotheek', 'levensverzekering', 'nabestaanden', 'risicoverzekering'],
    categorie: 'Verzekeren & risico',
    tekst:
      "Een overlijdensrisicoverzekering (ORV) is een levensverzekering die uitsluitend uitkeert als je overlijdt binnen de looptijd van de polis — je bouwt er zelf geen waarde mee op, het is puur een risicodekking. De uitkering wordt vaak gekoppeld aan een hypotheek: zonder ORV zouden je partner of andere nabestaanden bij overlijden de volledige hypotheekschuld alleen moeten dragen, terwijl het huishoudinkomen wegvalt. Dit mechanisme speelt vooral een rol bij een hypotheek in combinatie met een partner of kinderen die financieel afhankelijk zijn van dat inkomen, of bij andere schulden die anders op nabestaanden zouden drukken. Ontbreekt die afhankelijkheid — bijvoorbeeld bij een alleenstaande zonder schulden — dan is de functie van een ORV doorgaans kleiner.",
  },
  {
    titel: 'Eigen risico zorgverzekering',
    tags: ['eigen risico', 'zorgverzekering', 'basisverzekering', 'zorgkosten', 'zorgverzekeringswet', 'vrijwillig eigen risico'],
    categorie: 'Verzekeren & risico',
    controleerVoor: '2026-11-01',
    tekst:
      "Het eigen risico is het bedrag dat je bij zorgkosten uit de basisverzekering eerst zelf betaalt, voordat je zorgverzekeraar de rest vergoedt — het geldt per kalenderjaar en begint elk jaar opnieuw. Niet alle zorg valt eronder: huisartsenzorg, verloskundige zorg en kraamzorg zijn bijvoorbeeld uitgezonderd van het verplichte eigen risico. Naast dit verplichte deel kun je vrijwillig een hoger eigen risico kiezen in ruil voor een lagere premie — een afweging tussen maandelijkse zekerheid en het risico van hogere kosten als je onverwacht zorg nodig hebt. De hoogte en toekomst van het verplichte eigen risico staan regelmatig ter discussie in de politiek, dus de regels kunnen de komende tijd wijzigen.",
  },

  // Algemene financiële basis (+5)
  {
    titel: 'Inflatie',
    tags: ['inflatie', 'koopkracht', 'waardevermindering', 'prijsstijging', 'koopkrachtverlies', 'geldwaarde'],
    categorie: 'Algemene financiële basis',
    tekst:
      "Inflatie betekent dat geld geleidelijk minder waard wordt, omdat je met hetzelfde bedrag na verloop van tijd minder kunt kopen dan nu. Dit gebeurt doordat de prijzen van goederen en diensten in de economie over het geheel genomen doorgaans stijgen. Voor je spaargeld betekent dit dat een bedrag dat nu op je rekening staat, in de toekomst een kleinere hoeveelheid koopkracht vertegenwoordigt, tenzij het rendement dat je maakt de inflatie bijhoudt. Omdat geld in deze app wordt gezien als opgeslagen tijd, is inflatie in feite de kracht die maakt dat diezelfde euro's later voor minder van je levenstijd kunnen worden ingewisseld. De app houdt hier rekening mee wanneer het je vermogen vertaalt naar vrijheidstijd.",
  },
  {
    titel: 'Reëel versus nominaal rendement',
    tags: ['reëel rendement', 'nominaal rendement', 'rendement na inflatie', 'koopkrachtrendement', 'rente', 'beleggingsrendement'],
    categorie: 'Algemene financiële basis',
    tekst:
      "Nominaal rendement is het rendement dat je op papier op je spaargeld of beleggingen behaalt, zonder rekening te houden met inflatie. Reëel rendement is dat rendement gecorrigeerd voor inflatie en laat zien hoeveel koopkracht je werkelijk hebt gewonnen of verloren. Als je nominale rendement lager is dan de inflatie, groeit je vermogen in euro's wel, maar krimpt het in koopkracht, waardoor je er uiteindelijk minder mee kunt kopen dan voorheen. Dit onderscheid is belangrijk, omdat een op het eerste gezicht positief rendement soms toch een verlies aan koopkracht verbergt. Vanuit de filosofie van opgeslagen tijd bepaalt vooral het reële rendement hoeveel vrijheidstijd je vermogen je werkelijk oplevert.",
  },
  {
    titel: 'Netto versus bruto',
    tags: ['netto', 'bruto', 'nettoloon', 'brutoloon', 'loonheffing', 'verschil netto bruto', 'inhoudingen'],
    categorie: 'Algemene financiële basis',
    tekst:
      "Bruto is een bedrag vóórdat er iets vanaf gaat, zoals belasting, premies of andere inhoudingen; netto is wat er overblijft nadat die inhoudingen zijn verrekend. Bij salaris zie je bijvoorbeeld een brutoloon op papier, terwijl het bedrag dat daadwerkelijk op je rekening wordt gestort het nettoloon is, na aftrek van loonheffing en premies. Dit verschil kan verwarrend zijn, omdat arbeidsvoorwaarden, cao's en advertenties vaak in brutobedragen worden uitgedrukt, terwijl je in het dagelijks leven met je nettobedrag rekent. Ook bij andere geldstromen, zoals rendement op beleggingen of huurinkomsten, kan een vergelijkbaar verschil bestaan tussen het bedrag vóór en na aftrekposten. Een bedrag dat als bruto wordt genoemd is dus niet zomaar vergelijkbaar met een nettobedrag, en dat verschil verklaart waarom hetzelfde bedrag in verschillende situaties anders kan aanvoelen.",
  },
  {
    titel: 'Opportunity cost',
    tags: ['opportunity cost', 'alternatieve-aanwendingskosten', 'keuzekosten', 'wat je opgeeft', 'afweging', 'kosten van een keuze'],
    categorie: 'Algemene financiële basis',
    tekst:
      "Opportunity cost, ofwel alternatieve-aanwendingskosten, is de waarde van de beste andere optie die je misloopt op het moment dat je voor iets kiest. Elke keer dat je geld of tijd aan het ene besteedt, kun je het niet tegelijk aan iets anders besteden, en die gemiste mogelijkheid is de opportunity cost van je keuze. Dit geldt niet alleen voor geld: ook tijd en aandacht kennen een opportunity cost, omdat een uur besteed aan de ene activiteit een uur is dat niet aan een andere activiteit kan worden besteed. Binnen de filosofie van geld als opgeslagen tijd maakt dit begrip zichtbaar dat elke financiële keuze impliciet ook een keuze is over hoeveel toekomstige vrijheidstijd je opgeeft of wint. Deze onzichtbare kosten spelen vaak mee in financiële keuzes, ook al staan ze nergens als apart bedrag op een rekening.",
  },
  {
    titel: 'Liquiditeit',
    tags: ['liquiditeit', 'liquide middelen', 'snel geld vrijmaken', 'verhandelbaarheid', 'illiquide', 'vermogen omzetten'],
    categorie: 'Algemene financiële basis',
    tekst:
      "Liquiditeit geeft aan hoe snel en hoe eenvoudig je een bezitting kunt omzetten in geld, zonder dat je daarbij waarde verliest. Contant geld en het saldo op een betaalrekening zijn zeer liquide: je kunt er direct mee betalen of ze meteen opnemen. Beleggingen zoals aandelen zijn doorgaans minder liquide dan spaargeld, maar wel meer liquide dan bijvoorbeeld een huis, waarvoor verkoop tijd kost en waarvan de opbrengst kan afwijken van de verwachte waarde. Bezittingen met een lage liquiditeit, zoals vastgoed of een aandeel in een niet-beursgenoteerd bedrijf, kun je niet zomaar snel te gelde maken zonder concessies aan prijs of voorwaarden. Liquiditeit speelt daarom een rol in de afweging tussen bezittingen die je snel inzetbaar wilt houden en bezittingen die vooral bedoeld zijn om op langere termijn te groeien.",
  },

  // --- K1.2-verdieping (19 jul 2026): TriFinity-begrippen (+10) + Beleggen (+8) ---

  // TriFinity-begrippen (+10)
  {
    titel: 'Dagtarief',
    tags: ['dagtarief', 'geld is opgeslagen tijd', 'euro naar tijd', 'dagelijkse uitgaven', 'vrijheidstijd per dag'],
    categorie: 'TriFinity-begrippen',
    tekst:
      "Het dagtarief rekent een bedrag om naar de tijd die het kost of oplevert, in lijn met de gedachte dat geld opgeslagen tijd is. De app bepaalt dit tarief door je werkelijke uitgaven te middelen over een voortschrijdende periode van meerdere maanden, zodat een toevallig dure of goedkope maand het beeld niet vertekent. Voor de omrekening naar een dagbedrag gaat de app uit van een jaargemiddelde in plaats van een vereenvoudigde maandbenadering, zodat hetzelfde dagtarief overal in de app op dezelfde manier wordt berekend. Dit dagtarief is de bouwsteen achter de meeste tijd-vertalingen die je in de app tegenkomt, van een los bedrag tot je vrijheidstijd.",
  },
  {
    titel: 'Sleepmodus',
    tags: ['sleepmodus', 'drag and drop', 'transacties toewijzen', 'budget toewijzen', 'slepen'],
    categorie: 'TriFinity-begrippen',
    tekst:
      "Sleepmodus is een sleep-gebaseerde manier om nog niet-toegewezen transacties één voor één aan een budget te koppelen. Steeds staat er één transactie in het midden van het scherm, terwijl je budgetten er als bollen omheen hangen; je sleept (of tikt) de transactie naar het juiste budget om hem toe te wijzen. De app gloeit alvast een voorstel op, gebaseerd op je bestaande regels en eerdere keuzes voor vergelijkbare tegenpartijen, en herkent transacties die op elkaar lijken zodat je ze in één beweging samen kunt toewijzen. Een toewijzing wordt pas definitief weggeschreven nadat je hem hebt bevestigd — de app verandert dus nooit alvast iets voordat jij het besluit hebt genomen.",
  },
  {
    titel: 'Levensgebeurtenissen',
    tags: ['levensgebeurtenissen', 'life events', 'toekomst-tijdas', 'verhuizen', 'pensioen', 'AOW'],
    categorie: 'TriFinity-begrippen',
    tekst:
      "Levensgebeurtenissen zijn gebeurtenissen die je zelf inplant op je Toekomst-tijdas, zoals verhuizen, met pensioen gaan, een kind krijgen of een erfenis ontvangen. Voor elke gebeurtenis geef je aan wat hij eenmalig kost, en/of hoe je maandelijkse inkomsten of uitgaven erdoor veranderen en voor hoe lang — de app rekent dat mee in je projectie naar financiële vrijheid. Gebeurtenissen zijn ingedeeld in herkenbare groepen, zoals wonen, werk en inkomen, en pensioen en uitkering, zodat je overzicht houdt. Bij elke gebeurtenis toont de app een indicatie of hij je richting vrijheid helpt of juist tijd kost, zodat je kunt zien welke gebeurtenissen het meeste gewicht in de schaal leggen.",
  },
  {
    titel: 'Fase-analyses',
    tags: ['fase-analyse', 'opbouwfase', 'overgangsfase', 'onttrekkingsfase', 'bespreek met will'],
    categorie: 'TriFinity-begrippen',
    tekst:
      "Fase-analyses zijn de inklapbare verdiepingsblokken binnen de fase-vensters van je Toekomst-projectie — bijvoorbeeld rond de opbouwfase, de overgangsfase naar pensioen, of de onttrekkingsfase daarna. Elk blok zoomt in op wat er in díe specifieke levensfase gebeurt, zoals welke levensgebeurtenissen erin vallen en wat hun impact op die periode is. De blokken staan standaard dicht en klap je zelf open wanneer je de details wilt zien. Bij een fase-analyse kun je met één klik doorschakelen naar Will om de precieze cijfers uit dat blok te bespreken.",
  },
  {
    titel: 'Vrijheidspercentage',
    tags: ['vrijheidspercentage', 'voortgang naar vrijheid', 'FIRE-voortgang', 'vrijheidsbalk', 'verschil met vrijheidstijd'],
    categorie: 'TriFinity-begrippen',
    tekst:
      "Het vrijheidspercentage laat zien hoe ver je route naar volledige financiële vrijheid al gevorderd is, als een voortgangsbalk die volloopt naarmate je dichter bij je doel komt. De app berekent dit door je huidige, voor vrijheid meetellende vermogen af te zetten tegen het vermogen dat je projectie als benodigd aangeeft — sta je op of boven dat benodigde niveau, dan staat de balk op het maximum. Dit is een ander begrip dan vrijheidstijd: vrijheidstijd vertaalt een los bedrag naar de tijd die het je oplevert of kost, terwijl het vrijheidspercentage specifiek de voortgangsbalk richting je vrijheidsdoel is. Teller en noemer van dit percentage staan altijd op dezelfde grondslag — bijvoorbeeld wel of niet inclusief je eigen woning — zodat de balk nooit een vertekend beeld geeft.",
  },
  {
    titel: 'Actiepunten versus aandachtspunten',
    tags: ['aandachtspunten', 'actiepunten', 'signalen', 'acties aanmaken', 'will-context'],
    categorie: 'TriFinity-begrippen',
    tekst:
      "Een aandachtspunt is een signaal dat de app zelf opmerkt door je gegevens te analyseren, bijvoorbeeld rond belasting, budget, schulden of bezittingen — het is een constatering, geen taak. Diezelfde aandachtspunten voeden ook het gesprek met Will, die ze als context gebruikt om je gericht te kunnen helpen. Een actiepunt is iets anders: dat maak je zelf bewust aan, eventueel met één klik vanuit een aandachtspunt, als een concreet item met een titel en eventueel een deadline dat je wilt bijhouden of afvinken. Kortom: het aandachtspunt is wat de app opmerkt, het actiepunt is wat jij ervan besluit te maken.",
  },
  {
    titel: 'Weergavemodus',
    tags: ['weergavemodus', 'eenvoudig', 'volledig', 'detailniveau', 'instellingen'],
    categorie: 'TriFinity-begrippen',
    tekst:
      "De weergavemodus is de schakelaar waarmee je bepaalt hoeveel detail de app standaard toont: \"eenvoudig\" houdt verdiepende detailblokken dichtgeklapt, \"volledig\" klapt ze juist open. Het is één voorkeur voor de hele app, niet iets dat je per pagina apart instelt. Omdat de instelling aan je profiel hangt in plaats van aan je apparaat, neem je hem mee naar elk apparaat waarop je inlogt. Je kunt altijd zelf een dichtgeklapt blok openklappen, ook in de eenvoudige modus — de schakelaar bepaalt alleen de standaardstand, niet wat je kunt zien.",
  },
  {
    titel: 'Privémodus',
    tags: ['privémodus', 'privacy mode', 'lokale categorisatie', 'on-device verwerking', 'gevoelige gegevens'],
    categorie: 'TriFinity-begrippen',
    tekst:
      "Privémodus is de instelling waarmee je ervoor kiest dat gevoelige verwerking, zoals het automatisch categoriseren van je transacties, lokaal op je eigen apparaat blijft in plaats van naar een AI in de cloud te gaan. Jij bepaalt zelf of je dit aan- of uitzet; uitzetten kan altijd, aanzetten kan afhankelijk zijn van je abonnementsvorm. De instelling geldt voor jouw eigen account en wordt alleen door jouzelf gelezen en aangepast. Zo houd je zeggenschap over waar je financiële details verwerkt worden, zonder dat je de functionaliteit van automatische categorisatie hoeft te missen.",
  },
  {
    titel: 'De krant / persoonlijk nieuws',
    tags: ['de krant', 'persoonlijk nieuws', 'geen impact geen nieuws', 'financieel nieuws', 'nieuwsberichten'],
    categorie: 'TriFinity-begrippen',
    tekst:
      "De krant is de persoonlijke nieuwspagina van de app, gebouwd rond het principe \"geen impact, geen nieuws\": alleen nieuws dat daadwerkelijk relevant is voor jouw eigen financiële situatie krijgt een plek, in plaats van algemeen financieel nieuws. Bronartikelen over bijvoorbeeld rente, belasting, de woningmarkt of beleggen worden eerst getoetst op relevantie voor jouw profiel voordat er een bericht van gemaakt wordt. Sommige berichten krijgen een concrete, op jouw situatie gebaseerde vertaling naar euro's of vrijheidstijd; andere zijn wel relevant voor jouw situatie maar zonder dat daar een concreet bedrag aan te koppelen is. Heeft niets voldoende impact of relevantie, dan kan je editie op een dag ook gewoon dun of leeg zijn — dat is een bewuste keuze, geen fout.",
  },
  {
    titel: 'Welkomstgids',
    tags: ['welkomstgids', 'onboarding', 'introductie', 'wegwijs maken', 'checklist'],
    categorie: 'TriFinity-begrippen',
    tekst:
      "De welkomstgids is de introductiekaart die na het onboarden bovenaan je overzichtspagina verschijnt en je in een aantal schermen wegwijs maakt in de app. Elk scherm bestaat uit een klein aantal stappen die je zelf kunt afvinken, bijvoorbeeld het invullen van je bezittingen en schulden, het instellen van je toekomstvoorkeuren, of het uitproberen van de AI en het persoonlijke nieuws. De eerste schermen zijn altijd zichtbaar; verdere, meer verdiepende schermen ontgrendel je naarmate je verder komt. Je kunt de gids op elk moment verbergen als je er niet (meer) mee aan de slag wilt.",
  },

  // Beleggen (+8)
  {
    titel: 'Obligaties',
    tags: ['obligatie', 'obligaties', 'lening', 'vastrentende waarden', 'staatsobligatie', 'bedrijfsobligatie', 'coupon'],
    categorie: 'Beleggen',
    tekst:
      "Een obligatie is in de kern een lening: jij leent geld aan een overheid of aan een bedrijf, en die belooft je periodiek rente te betalen en aan het einde van de looptijd het geleende bedrag terug te storten. Dat maakt een obligatie fundamenteel anders dan een aandeel: als aandeelhouder ben je mede-eigenaar van een bedrijf en deel je in de winst én het verlies, terwijl je als obligatiehouder een schuldeiser bent met een vooraf afgesproken vergoeding. Daardoor gedraagt een obligatie zich doorgaans stabieler dan een aandeel, al kan de waarde ervan tussentijds toch schommelen — bijvoorbeeld doordat de marktrente verandert of doordat twijfel ontstaat over de kredietwaardigheid van de lener. Gaat de lener failliet, dan hebben obligatiehouders doorgaans voorrang op aandeelhouders bij wat er nog te verdelen valt.",
  },
  {
    titel: 'Vastgoed en REITs',
    tags: ['vastgoed', 'REIT', 'vastgoedfonds', 'indirect vastgoed', 'beursgenoteerd vastgoed', 'vastgoedaandeel'],
    categorie: 'Beleggen',
    tekst:
      "Naast het kopen van een eigen pand kun je ook indirect in vastgoed beleggen, bijvoorbeeld via een beursgenoteerd vastgoedfonds of REIT (real estate investment trust). Zo'n fonds bundelt geld van veel beleggers om er woningen, kantoren, winkels of bedrijfshallen mee te kopen en te verhuren, en de huurinkomsten en waardeontwikkeling komen zo ten goede aan de aandeelhouders. Het voordeel is spreiding over meerdere panden, locaties en huurders zonder dat je zelf een pand hoeft te kopen, te onderhouden of te verhuren — en de aandelen zijn, anders dan een fysiek pand, meestal gewoon dagelijks verhandelbaar op de beurs. Daar staat tegenover dat de koers van een vastgoedfonds op korte termijn kan meebewegen met de aandelenmarkt in het algemeen, terwijl de waarde van een fysiek pand doorgaans minder vaak wordt vastgesteld.",
  },
  {
    titel: 'Cryptovaluta',
    tags: ['crypto', 'cryptovaluta', 'bitcoin', 'digitale munten', 'blockchain', 'MiCA'],
    categorie: 'Beleggen',
    controleerVoor: '2027-01-01',
    tekst:
      "Cryptovaluta zijn digitale munten of activa die niet door een centrale bank worden uitgegeven, maar bestaan op basis van blockchain-technologie: een gedeeld, versleuteld grootboek dat transacties vastlegt zonder tussenkomst van een bank. De waarde ervan wordt volledig bepaald door vraag en aanbod, en er zit geen onderliggende kasstroom zoals huur, dividend of rente aan vast. Dat maakt cryptovaluta een beleggingscategorie die als zeer risicovol geldt: de koers kan in korte tijd sterk stijgen of dalen, en de bescherming van beleggers verschilt sterk van die bij traditionele financiële producten. Sinds de Europese MiCA-verordening moeten aanbieders van cryptodiensten aan regels rond vergunning, transparantie en bewaring van klanttegoeden voldoen, al neemt dat het koersrisico zelf niet weg. De app doet geen uitspraak over of cryptovaluta bij jouw situatie past — dat is een afweging die je zelf, eventueel met onafhankelijk advies, maakt.",
  },
  {
    titel: 'Duurzaam beleggen (ESG)',
    tags: ['ESG', 'duurzaam beleggen', 'impact beleggen', 'milieu sociaal bestuur', 'groene fondsen', 'SFDR'],
    categorie: 'Beleggen',
    controleerVoor: '2027-01-01',
    tekst:
      "Duurzaam beleggen, ook wel ESG genoemd naar environment, social en governance, betekent dat je naast het financiële rendement ook kijkt naar hoe een bedrijf omgaat met het milieu, met mensen en met goed bestuur. In de praktijk bestaan er fondsen die expliciet duurzame kenmerken promoten, fondsen die een concreet meetbaar duurzaamheidsdoel nastreven, en fondsen die dat niet doen — Europese regels verplichten aanbieders om aan te geven in welke categorie een fonds valt, zodat je dat als belegger kunt vergelijken. Duurzaam wil niet automatisch zeggen dat het rendement hoger of het risico lager is: het is een extra lens op je beleggingskeuze, geen garantie. Ook is \"duurzaam\" geen vastomlijnd begrip — aanbieders kunnen andere definities en wegingen hanteren, dus loont het te kijken wat een fonds concreet onder duurzaamheid verstaat.",
  },
  {
    titel: 'Actief versus passief beheer',
    tags: ['actief beleggen', 'passief beleggen', 'indexfonds', 'fondsbeheerder', 'marktrendement verslaan', 'tracker'],
    categorie: 'Beleggen',
    tekst:
      "Bij actief beheer selecteert een fondsbeheerder zelf aandelen, obligaties of andere beleggingen en probeert die zo te combineren en te timen dat het fonds een bepaalde index verslaat. Bij passief beheer volgt een fonds simpelweg een bestaande index — bijvoorbeeld een brede aandelenindex — en probeert het rendement daarvan zo nauwkeurig mogelijk na te bootsen, zonder actieve keuzes te maken. Omdat passief beheer minder onderzoek en handelen vergt, liggen de kosten doorgaans lager dan bij actief beheer. Onderzoek over lange periodes laat structureel zien dat het merendeel van de actieve fondsbeheerders er niet in slaagt de eigen index na kosten te verslaan, al zijn er uitzonderingen en verschilt dat per marktsegment.",
  },
  {
    titel: 'Beleggingshorizon en risicoprofiel',
    tags: ['beleggingshorizon', 'risicoprofiel', 'beleggingstermijn', 'risicobereidheid', 'tijdshorizon'],
    categorie: 'Beleggen',
    tekst:
      "Je beleggingshorizon is de tijd tot het moment waarop je het belegde geld weer nodig denkt te hebben. Hoe langer die horizon, hoe meer tijd er is om een tussentijdse koersdaling te laten herstellen, wat vaak ruimte geeft voor een groter aandeel in risicovollere beleggingen zoals aandelen. Heb je het geld naar verwachting binnen afzienbare tijd nodig, dan is er minder tijd om een daling goed te maken, wat vaak pleit voor stabielere beleggingen. Je risicoprofiel voegt daar een tweede dimensie aan toe: hoeveel risico je financieel kunt dragen en hoeveel risico je emotioneel prettig vindt, spelen samen met je horizon een rol bij de vraag welke mix van beleggingen bij je past.",
  },
  {
    titel: 'Valutarisico',
    tags: ['valutarisico', 'wisselkoers', 'vreemde valuta', 'dollarrisico', 'koersrisico valuta', 'hedged'],
    categorie: 'Beleggen',
    tekst:
      "Als je belegt in iets dat noteert in een andere valuta dan de euro — bijvoorbeeld Amerikaanse aandelen in dollars — hangt jouw uiteindelijke rendement niet alleen af van de koers van die belegging zelf, maar ook van de wisselkoers tussen die valuta en de euro. Stijgt de onderliggende belegging in waarde, maar verzwakt de vreemde valuta tegelijk tegenover de euro, dan kan dat een deel van je rendement — of zelfs het hele rendement — tenietdoen; verstevigt die valuta juist, dan werkt dat in jouw voordeel. Sommige fondsen dekken dit valutarisico af (vaak \"hedged\" genoemd), zodat wisselkoersschommelingen minder doorwerken in het rendement, terwijl andere fondsen dat risico bewust open laten staan. Afdekken kost doorgaans iets aan extra kosten en heft het valutarisico niet per definitie volledig op.",
  },
  {
    titel: 'Periodiek inleggen (dollar-cost averaging)',
    tags: ['periodiek inleggen', 'dollar-cost averaging', 'spaarplan beleggen', 'instapmoment', 'gemiddeld aankopen'],
    categorie: 'Beleggen',
    tekst:
      "Periodiek inleggen, ook wel dollar-cost averaging genoemd, betekent dat je een vast bedrag op vaste momenten belegt — bijvoorbeeld elke maand — in plaats van je hele inleg in één keer op één moment te beleggen. Omdat je op verschillende momenten instapt, koop je automatisch meer eenheden wanneer de koers laag staat en minder wanneer de koers hoog staat, waardoor je gemiddelde aankoopprijs over de tijd wordt uitgemiddeld. Dat verzacht de discussie over hét juiste instapmoment, omdat je niet langer afhankelijk bent van één beslissing op één tijdstip. Het sluit het risico van een langdurig dalende markt niet uit en garandeert geen beter resultaat dan in één keer inleggen — het is vooral een manier om het instapmoment te spreiden in plaats van te voorspellen.",
  },
]

/**
 * Materialiseer de startset-templates naar volledige {@link LocalKnowledgeItem}s
 * met een verse id, `actief: true`, oplopende volgorde (vanaf `startVolgorde`) en
 * de huidige tijd als `bijgewerkt`. Puur (op de client-uuid na) zodat de beheer-
 * UI én de test dezelfde items produceren.
 */
export function buildStarterItems(startVolgorde = 0): LocalKnowledgeItem[] {
  const now = new Date().toISOString()
  return KNOWLEDGE_STARTER_SET.map((template, index) => ({
    id: crypto.randomUUID(),
    titel: template.titel,
    tekst: template.tekst,
    tags: template.tags,
    actief: true,
    volgorde: startVolgorde + index,
    bijgewerkt: now,
    categorie: template.categorie,
    laatstGecontroleerd: now,
    controleerVoor: template.controleerVoor ?? null,
  }))
}
