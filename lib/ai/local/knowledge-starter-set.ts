import type { LocalKnowledgeItem } from './knowledge-context'

/**
 * Gecureerde startset voor de kennisbank lokale AI (fase K1).
 *
 * Tien NL-uitleg-items die de bekende zwaktes van het kleine lokale model
 * (C1a) afdekken: fiscale begrippen (Box 1/2/3, jaarruimte), FIRE-concepten
 * (SWR, vrijheidstijd, spaarquote, noodbuffer, FIRE) en de vermogen-vs-liquide-
 * nuance. De beheerder laadt ze in de editor, reviewt en slaat zélf op.
 *
 * HARDE INHOUDSREGEL (Wft/correctheid): begrippen-uitleg, in je/jij-taal —
 * NUL cijfers, tarieven, bedragen of jaartallen. De enige toegestane "cijfers"
 * zijn de namen Box 1/2/3 (eigennamen, geen tarief). Voor getallen verwijst de
 * uitleg naar de app; die komen exclusief uit de rekenmotoren.
 *
 * Elk item volgt het template: titel = het begrip zoals een gebruiker het
 * noemt · tags = zoekwoorden en synoniemen waarop het item meegaat · tekst =
 * twee tot zes zinnen heldere uitleg.
 */

export interface KnowledgeStarterTemplate {
  titel: string
  tags: string[]
  tekst: string
}

export const KNOWLEDGE_STARTER_SET: KnowledgeStarterTemplate[] = [
  {
    titel: 'Box 1',
    tags: ['box 1', 'inkomen', 'werk', 'loon', 'inkomstenbelasting', 'eigen woning', 'hypotheekrente'],
    tekst:
      'Box 1 is het deel van de inkomstenbelasting dat gaat over je inkomen uit werk en woning. Denk aan je loon, je winst als ondernemer, je pensioen en een uitkering. Ook je eigen woning valt hieronder: de bijtelling en de aftrek van hypotheekrente lopen via Box 1. Hoe meer je hier verdient, hoe zwaarder dit inkomen wordt belast. Wat het precies voor jou betekent, reken je in de app uit.',
  },
  {
    titel: 'Box 2',
    tags: ['box 2', 'aanmerkelijk belang', 'dga', 'aandelen', 'bv', 'dividend', 'winstuitkering'],
    tekst:
      'Box 2 gaat over een aanmerkelijk belang: je hebt een flink deel van de aandelen in een bv, meestal als directeur-grootaandeelhouder. Je betaalt hier belasting over het voordeel dat je uit die aandelen haalt, zoals dividend of winst bij verkoop. Zolang de winst in de bv blijft, betaal je in Box 2 nog niets; pas als je geld naar privé haalt, telt het mee. Het idee is dat ondernemen via een bv anders wordt belast dan gewoon spaargeld. De precieze grenzen zie je in de app.',
  },
  {
    titel: 'Box 3',
    tags: ['box 3', 'vermogen', 'sparen', 'beleggen', 'spaargeld', 'forfaitair rendement', 'tegenbewijs'],
    tekst:
      'Box 3 is de belasting over je vermogen: spaargeld, beleggingen en bijvoorbeeld een tweede woning. De Belastingdienst gaat niet uit van je werkelijke opbrengst, maar rekent met een verondersteld rendement — dat heet het forfaitaire rendement. Omdat dat forfait soms hoger uitpakt dan wat je echt verdiende, mag je met de tegenbewijsregeling laten zien dat je werkelijke rendement lager was en zo minder betalen. Je betaalt dus belasting over een schatting, tenzij je aantoont dat het in jouw geval lager ligt. De bedragen en het forfait zelf komen uit de rekenmotor van de app.',
  },
  {
    titel: 'Jaarruimte',
    tags: ['jaarruimte', 'pensioen', 'lijfrente', 'aftrek', 'pensioengat', 'oudedag'],
    tekst:
      'Jaarruimte is de ruimte die je in een jaar hebt om fiscaal voordelig extra pensioen op te bouwen, bijvoorbeeld met een lijfrente. Bouw je via je werk weinig pensioen op, dan ontstaat er ruimte die je zelf mag benutten. Wat je binnen die ruimte inlegt, mag je aftrekken van je inkomen, waardoor je nu minder belasting betaalt. Later, als je het als aanvulling ontvangt, reken je alsnog af — vaak tegen een lager tarief. Hoeveel jaarruimte er voor jou is, zie je in de app.',
  },
  {
    titel: 'Veilig onttrekkingspercentage',
    tags: ['swr', 'onttrekking', 'opnemen', 'veilig opnemen', 'safe withdrawal rate', 'onttrekkingspercentage'],
    tekst:
      'Je veilige onttrekkingspercentage gaat over hoeveel je elk jaar uit je vermogen kunt halen zonder dat het opraakt. Een bekende vuistregel noemt een vast percentage voor iedereen, maar dat is te simpel: hoe lang je nog te gaan hebt, hoe je belegt en hoe de markten meezitten bepalen samen wat veilig is. Daarom rekent de app een percentage uit dat bij jouw situatie past, in plaats van één vaste regel te volgen. Zo weet je hoeveel vrijheid je vermogen echt kan dragen. Het getal zelf komt uit de rekenmotor.',
  },
  {
    titel: 'Vrijheidstijd',
    tags: ['vrijheid', 'vrijheidstijd', 'tijd', 'opgeslagen tijd', 'geld is tijd', 'levenstijd'],
    tekst:
      'Vrijheidstijd is de kern van deze app: geld is opgeslagen tijd. Elke euro die je hebt, staat voor een stukje levenstijd waarin je niet hoeft te werken om je uitgaven te dekken. Daarom vertaalt de app je vermogen en uitgaven naar tijd — dagen, maanden en jaren vrijheid — in plaats van alleen naar bedragen. Zo zie je niet hoeveel je hebt, maar hoeveel vrije tijd het je oplevert. De omrekening naar tijd doet de rekenmotor voor je.',
  },
  {
    titel: 'Spaarquote',
    tags: ['spaarquote', 'sparen', 'spaarpercentage', 'overhouden', 'sparen per maand'],
    tekst:
      'Je spaarquote is het deel van je inkomen dat je overhoudt en opzijzet in plaats van uitgeeft. Het is een van de krachtigste knoppen aan je vrijheid: hoe meer je structureel spaart, hoe sneller je vermogen groeit én hoe minder je maandelijks nodig hebt. Daardoor werkt een hogere spaarquote twee kanten op tegelijk. De app berekent je spaarquote uit je inkomsten en uitgaven, zodat je ziet hoe je ervoor staat. Het percentage zelf komt uit de rekenmotor.',
  },
  {
    titel: 'Noodbuffer',
    tags: ['noodbuffer', 'buffer', 'spaarpotje', 'appeltje voor de dorst', 'onvoorzien', 'reserve'],
    tekst:
      'Een noodbuffer is een potje geld dat je apart houdt voor onverwachte tegenvallers, zoals een kapotte wasmachine of tijdelijk minder inkomen. Het staat los van beleggen: je wilt er zó bij kunnen, zonder iets te hoeven verkopen op een slecht moment. Een goede buffer zorgt dat één tegenslag je plannen niet omgooit en geeft rust om verstandige keuzes te maken. Zonder buffer moet je bij elke tegenvaller schulden maken of beleggingen aanspreken. Of jouw buffer op peil is, zie je in de app.',
  },
  {
    titel: 'FIRE',
    tags: ['fire', 'financieel vrij', 'financiële onafhankelijkheid', 'eerder stoppen', 'rentenieren'],
    tekst:
      'FIRE staat voor financiële onafhankelijkheid: het punt waarop je vermogen genoeg oplevert om je uitgaven te dekken, zodat werken een keuze wordt in plaats van een moeten. Je bereikt het door bewust te sparen en te beleggen, tot je vermogen op een dag het werk van je salaris overneemt. Het gaat niet per se over nooit meer werken, maar over de vrijheid om zelf te kiezen. De app laat zien hoe ver je van dat punt af staat en wat je eraan kunt doen. De onderliggende berekening komt uit de rekenmotor.',
  },
  {
    titel: 'Vermogen versus liquide vermogen',
    tags: ['vermogen', 'netto vermogen', 'liquide', 'liquide vermogen', 'beschikbaar', 'huis', 'niet-liquide'],
    tekst:
      'Je nettovermogen is alles wat je bezit min je schulden, inclusief zaken die je niet zomaar kunt uitgeven, zoals je huis of je pensioen. Je liquide vermogen is het deel dat je wél snel beschikbaar hebt, zoals spaargeld en vrij verhandelbare beleggingen. Voor je vrijheid telt vooral dat liquide deel: daarvan kun je echt leven zonder eerst je huis te verkopen. Haal die twee daarom nooit door elkaar — een groot vermogen op papier betekent niet dat je er ook van rond kunt komen. De app houdt beide grootheden apart.',
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
  }))
}
