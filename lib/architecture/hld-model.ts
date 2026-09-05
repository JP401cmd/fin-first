// ── HLD-praatplaat vanuit gebruikersperspectief ──────────────────────────────
// Geen lagen of techniek — dit is het verhaal van de app in gewone taal, zodat
// een leek het begrijpt áls functionaliteiten ("dit kan de app voor je doen").
// Bedoeld als praatplaat om mee te presenteren.
//
// Volledig gecureerd (een verhaal valt niet te scannen). De enige uitzondering:
// de modules komen uit MODULE_CATALOG zodat "wat je kunt aanzetten" klopt met de
// code. Houd dit bij wanneer functionaliteit verschijnt, verdwijnt of van naam
// verandert — in dezelfde PR (laat de documentatie beter achter dan je 'm vond).

import { MODULE_CATALOG } from '@/lib/module-registry'

export type HldAccent = 'kern' | 'horizon' | 'wil' | 'ink'

/** Eén concrete functionaliteit in lekentaal */
export interface HldCapability {
  title: string
  desc: string
}

/** Een groep functionaliteiten rond één doel van de gebruiker */
export interface HldCapabilityGroup {
  id: string
  /** Het doel, in "ik"-taal */
  goal: string
  accent: HldAccent
  items: HldCapability[]
}

/** Eén stap in de reis van de gebruiker */
export interface HldStage {
  n: number
  title: string
  you: string
  app: string
}

/** Een soevereiniteitsfase, als motivatie (geen gating) */
export interface HldPhase {
  label: string
  meaning: string
}

export interface HldModule {
  id: string
  label: string
  description: string
  standalone: boolean
}

export interface HldModel {
  promise: { kicker: string; headline: string; emphasis: string; deck: string }
  journey: HldStage[]
  capabilityGroups: HldCapabilityGroup[]
  companion: { name: string; role: string; touches: string[] }
  phases: HldPhase[]
  modules: HldModule[]
  outcome: { title: string; desc: string }
}

export function buildHldModel(): HldModel {
  return {
    promise: {
      kicker: 'De belofte',
      headline: 'Geld is opgeslagen',
      emphasis: 'tijd',
      deck: 'Elke euro die je hebt, is vrije tijd die je hebt teruggekocht. TriFinity vertaalt je geld naar tijd — en helpt je die tijd te vergroten. Hieronder: wat de app concreet voor je doet.',
    },

    // De reis als korte verhaallijn rond de functionaliteiten.
    journey: [
      { n: 1, title: 'Beginnen', you: 'Je vertelt waar je naartoe wilt — en wanneer je wilt stoppen met werken.', app: 'We zetten alleen de onderdelen aan die jij nodig hebt en rekenen vanaf dag één met jouw plan.' },
      { n: 2, title: 'Vastleggen', you: 'Je koppelt je bank of importeert je gegevens.', app: 'Inkomsten, uitgaven en bezittingen staan overzichtelijk bij elkaar.' },
      { n: 3, title: 'Begrijpen', you: 'Je ziet in één oogopslag hoe je ervoor staat.', app: 'Fin, je coach, legt uit wat opvalt en wat je nú kunt doen.' },
      { n: 4, title: 'Vooruitkijken', you: 'Je rekent je toekomst door.', app: 'Je ziet wanneer je financieel vrij bent — of, als je je stopmoment al kent, of je geld tot het einde van je plan reikt — en wat keuzes daaraan veranderen.' },
      { n: 5, title: 'Samen groeien', you: 'Je deelt met je partner en bouwt verder.', app: 'Eén beeld voor het hele huishouden; je groeit van herstel naar meesterschap.' },
    ],

    // Het hart van de praatplaat: functionaliteiten in lekentaal, per doel.
    capabilityGroups: [
      {
        id: 'grip',
        goal: 'Ik wil grip op mijn geld vandaag',
        accent: 'kern',
        items: [
          { title: 'Gratis weten waar je staat vóór je een account maakt', desc: 'Doe de Vrijheidscheck: een paar vragen en je krijgt meteen je vrijheidsrapport — pas daarna kies je of je een account aanmaakt.' },
          { title: 'Je bank koppelen of een bestand importeren', desc: 'Transacties komen automatisch binnen — geen handwerk.' },
          { title: 'Een rekening opruimen die je niet meer gebruikt', desc: 'Verwijder een oude of dubbele rekening en kies zelf wat er met je boekingen gebeurt: bewaren — dan blijven je historie en budgetten van eerdere maanden precies kloppen — of definitief wissen. Een bankkoppeling wordt vanzelf verbroken.' },
          { title: 'Al je uitgaven en inkomsten op een rij', desc: 'Overzichtelijk, met categorieën en grootste posten.' },
          { title: 'Budgetten maken en bewaken', desc: 'Zie per categorie hoeveel je deze maand nog hebt — en als je een transactie tijdens het slepen nergens kwijt kunt, maak je meteen een nieuw budget aan, zonder de sleepmodus te verlaten.' },
          { title: 'Jezelf een grens stellen op één categorie of winkel', desc: 'Zet een Grenzenpot op een budget of een tegenpartij — bijvoorbeeld maximaal €50 per maand aan tanken, of per kwartaal of jaar als dat beter past. Je ziet per periode hoeveel eroverheen ging, hoeveel ruimte je nog hebt, en hoeveel periodes op rij je binnen je eigen grens bleef — en zie hoe je het doet, ook op je startscherm, met een seintje als je eroverheen gaat. Wil je het liever "Schaamtepot" noemen? Dat kies je zelf. Geen spaardoel, alleen jouw grens.' },
          { title: 'Zien hoe goed je je aan je eigen grens houdt', desc: 'Eén cijfer van 0 tot 100 vat samen hoe vaak je binnen je grens bleef, hoe lang je huidige reeks is en welke kant het op gaat. Het verschijnt pas als je drie periodes achter de rug hebt sinds je de pot maakte — daarvoor zou het een mooi cijfer zijn dat niets betekent.' },
          { title: 'Zien wélke boekingen in een periode meetelden', desc: 'Klik een periode aan en je ziet niet alleen op welk budget of bij welke winkel het bedrag zat, maar ook de losse boekingen eronder: datum, omschrijving en bedrag.' },
          { title: 'Een weggeklikte tegel weer terugzetten', desc: 'Heb je de tegel van een Grenzenpot van je startscherm gehaald en wil je hem terug? Dat zet je aan in de pot zelf — je hoeft de pot niet weg te gooien en opnieuw te maken.' },
          { title: 'Een boeking terugvinden uit je hele geschiedenis', desc: 'Zoek op omschrijving of tegenpartij over al je transacties, niet alleen het afgelopen jaar — ook die ene aankoop van drie jaar geleden vind je terug.' },
          { title: 'Tientallen boekingen in één keer op het juiste budget zetten — of definitief opruimen', desc: 'Selecteer honderden of duizenden transacties uit je zoekresultaat en koppel ze in één keer aan een budget, of verwijder ze. Verwijderen kan niet ongedaan gemaakt worden — er is bewust geen prullenbak — dus je ziet vooraf precies hoeveel transacties en welk bedrag het raakt, en moet dat bij een grote selectie expliciet bevestigen.' },
          { title: 'Zien hoeveel je overhoudt', desc: 'Je spaarquote: welk deel van je inkomen je spaart.' },
          { title: 'Je bezittingen en schulden bijhouden', desc: 'Van spaargeld tot huis en hypotheek — je netto vermogen in beeld.' },
          { title: 'Zelf kiezen welke bezittingen en schulden in één tegel meetellen', desc: 'Stel je eigen groep samen — bijvoorbeeld wél aandelen en je bankrekening, niet je crypto of eigen huis — en zie het totaal met verloop, apart van je volledige netto vermogen.' },
          { title: 'Je broker koppelen of je portefeuille importeren', desc: 'Trading 212 koppelen of een bestand inladen — je aandelen en fondsen kloppen automatisch, net als bij je crypto.' },
          { title: 'Zien wat je beleggingen je hebben opgeleverd', desc: 'Per belegging je totale opbrengst — koerswinst, dividend én verkochte (gesloten) posities samen — afgeleid uit je eigen transacties.' },
          { title: 'Jezelf spiegelen aan Nederland en de wereld', desc: 'Zie hoe je gezondheid, spaarquote, vermogen en vrijheidsleeftijd zich verhouden tot een vergelijkbare doelgroep — en waar je staat wereldwijd.' },
          { title: 'Meteen begrijpen waaróm iets je aandacht vraagt en wat je kunt doen', desc: 'Als een overzichtspagina oranje of rood kleurt, legt een banner in gewone taal uit wat er speelt en wat je concreet kunt aanpakken — met een directe link naar de juiste plek of een gesprek met Fin.' },
          { title: 'Zelf kiezen waar de app voor je opent', desc: 'Je Overzicht of meteen je budgetten — jouw startscherm. Je kiest het in het zoekscherm (⌘K) of bij Mijn → Uiterlijk; op mobiel houd je de middelste navigatieknop een seconde ingedrukt om er direct heen te gaan.' },
          { title: 'Zelf bepalen waar de AI draait: op je eigen apparaat of in de cloud', desc: 'Kies het in één keer voor alles, of per onderdeel — je gesprek met Fin, je transacties, je briefing, je tips, je rapporten, je documenten en je nieuws. Kies je lokaal, dan gaan die gegevens niet naar een AI-leverancier; de app zegt er eerlijk bij wat je inlevert (het lokale model is eenvoudiger en trager, werkt alleen op een desktop met geschikte videokaart) en wat er dan níet kan. Kan iets lokaal niet, dan blokkeren we het met uitleg in plaats van het stilletjes tóch via de cloud te doen.' },
          { title: 'Financieel nieuws lezen dat om jouw cijfers draait', desc: 'Zet de nieuwsmodule aan voor gepersonaliseerd nieuws — alleen artikelen die daadwerkelijk raken aan jouw bezittingen, categorieën of doelen, geen ruis.' },
        ],
      },
      {
        id: 'vrijheid',
        goal: 'Ik wil weten wanneer ik vrij ben',
        accent: 'horizon',
        items: [
          { title: 'Uitrekenen wanneer je niet meer hoeft te werken', desc: 'Je FIRE-datum: het moment dat werken een keuze wordt.' },
          { title: 'Zelf kiezen wanneer je stopt en zien of het reikt', desc: 'Twee vragen, al bij het aanmelden en later bij Voorkeuren: wanneer wil je stoppen met werken — zo vroeg als het kan, op je AOW-leeftijd of op een leeftijd die jij kiest — en tot welke leeftijd moet je geld reiken en wat moet er dan nog over zijn: niets, een bedrag voor later of voor anderen, of je vermogen mag niet slinken. Kies je een vast stopmoment, dan rekent de app niet uit wánneer je vrij bent, maar of je geld tot het einde van je plan reikt — en vanaf welke leeftijd vrij al mogelijk was geweest.' },
          { title: '“Wat als”-scenario\'s doorrekenen', desc: 'Meer sparen, eerder stoppen, anders beleggen — zie het effect direct.' },
          { title: 'Grote gebeurtenissen meenemen', desc: 'Huis kopen, pensioen, kinderen — alles op je tijdlijn.' },
          { title: 'Je doelen terugzien op je tijdlijn', desc: 'Een doel met een streefdatum krijgt een eigen markering op je tijdas, op de leeftijd die bij die datum hoort — zodat het scherm dat over je toekomst gaat laat zien waar je naartoe spaart. Is de streefdatum al voorbij en het doel nog open, dan blijft de markering staan bij vandaag.' },
          { title: 'Een doel vastknopen aan wat je al hebt', desc: 'Koppel er één of meer bezittingen aan, of juist schulden die je wilt afbouwen — dan telt de voortgang mee met wat je aflost. Koppel je allebei, dan rekent het doel netto: je bezittingen min wat er nog openstaat. Je hoeft zo\'n doel nooit met de hand bij te werken.' },
          { title: 'Een doel zelf afronden', desc: 'Open het doel en markeer het als behaald wanneer jij vindt dat het klaar is — ook als het getal er nog niet helemaal is, of als het doel meeloopt en er dus niets in te vullen valt. Van gedachten veranderd? Je zet het net zo makkelijk weer open vanuit het Bereikt-archief.' },
          { title: 'Een doel stellen op een cijfer dat de app al bijhoudt', desc: 'Niet alleen op een bedrag, maar ook op je spaarquote, je netto vermogen, de leeftijd waarop je vrij bent, je noodfonds in maanden, je passieve inkomen, je belastingdruk, wanneer je schuldenvrij bent of wat er aan het eind van je plan overblijft. Zulke doelen lopen mee met dezelfde cijfers die je elders in de app ziet, en melden zichzelf zodra je ze haalt.' },
          { title: 'Je vermogen jaren vooruit zien groeien', desc: 'Simulaties en een toets tegen echte beurshistorie.' },
          { title: 'Snappen hoe je vrijheidsgrafiek is opgebouwd', desc: 'In vier stappen met je eigen cijfers: opbouw, benodigd vermogen, het vrijheidsmoment en onttrekking.' },
          { title: 'Je loopbaan en inkomen meenemen', desc: 'Salarisgroei, een plafond of minder werken — zie wat het met je vrijheidsdatum doet.' },
          { title: 'Zien hoe stevig je plan staat, op elk front', desc: 'Een radar met vier sterktepunten — de brug tot je AOW, je pensioeninkomen, wonen en wat er aan het eind van je plan over moet zijn — die rekent op het stopmoment dat jij kiest.' },
          { title: 'Kant-en-klare paden naast elkaar zien', desc: 'Zes voorgerekende scenario\'s naast je basispad — waaronder "nu stoppen" — met een seintje bij het pad dat de minste buffer overhoudt.' },
          { title: 'Zien tot welke leeftijd je vermogen reikt als je vandaag stopt', desc: 'Een zin die meebeweegt met je cijfers: hoeveel maanden of tot welke leeftijd je toekomt als je nu met werken stopt — inclusief rendement, AOW en belasting. Wil je dat plan echt maken, dan kies je bij Voorkeuren "Nu" als je stopmoment; de app rekent dan je hele plan vanaf vandaag door.' },
          { title: 'Mijn doorgerekende toekomst vastleggen als doel', desc: 'Sta je op een "wat als"-stand die klopt? Maak er met één klik je doelsituatie van — spaarquote, salaris, rendement en vrijheidsleeftijd worden echte doelen die meegroeien met je cijfers, terug te vinden bij je doelen.' },
          { title: 'Je hele plan als één deelbaar document', desc: 'Het totaalplan bundelt je aannames, je vermogensprojectie naar volledige vrijheid, de slagingskans onder marktschommelingen en concrete inzichten in één rapport — deelbaar als PDF met je partner of adviseur, met alle cijfers uit dezelfde rekenmotor als Toekomst en Overzicht.' },
          { title: 'Zien wat een toekomstig bedrag vandaag waard is', desc: 'Zet je grafiek op /overzicht en /toekomst om naar wat de bedragen vandaag waard zijn; wat je al hebt of al hebt uitgegeven verandert niet mee.' },
          { title: 'Merken wanneer je een mijlpaal passeert', desc: 'Ga je door €100.000 of door de helft van je vrijheid, dan zegt de app dat één keer — met wat het in vrijheidstijd betekent. Daarna staat het in je geschiedenis, met de datum erbij.' },
          { title: 'Je jaar in vrijheid teruglezen', desc: 'Eén pagina over jouw jaar: hoeveel vrijheidsdagen je won, hoe je vermogen groeide, je beste maand en hoeveel dichter je bij je vrijheidsdoel kwam.' },
        ],
      },
      {
        id: 'belasting',
        goal: 'Ik wil slim omgaan met belasting',
        accent: 'wil',
        items: [
          { title: 'Begrijpen wat je betaalt', desc: 'Box 1, 2 en 3 in gewone taal, met je eigen cijfers.' },
          { title: 'Zien hoeveel je mag inleggen voor je pensioen', desc: 'Je jaarruimte, nauwkeurig berekend — inclusief je eigen UPO-factor A (werkgeverspensioen) als je dat invult.' },
          { title: 'Checken of de tegenbewijsregeling gunstiger is', desc: 'Werkelijk rendement versus het forfait in box 3.' },
          { title: 'Je fiscale kansen doorgerekend zien', desc: 'De fiscale optimizer zet je mogelijkheden onder elkaar — de mix sparen/beleggen in box 3, de verdeling met je fiscale partner en je jaarruimte — in euro\'s én vrijheidsdagen. Een indicatie, geen advies.' },
          { title: 'Zien wat de plek van je pensioenpot kost', desc: 'Je pensioen wordt belast als inkomen, je spaargeld en beleggingen via box 3. De optimizer vergelijkt drie plekken voor je pensioenpot in je opnamevolgorde — je huidige volgorde, pensioen zo laat mogelijk en pensioen vroeg — op wat het je over je hele leven aan belasting kost, in euro\'s én vrijheidstijd.' },
        ],
      },
      {
        id: 'begeleiding',
        goal: 'Ik wil begeleiding, geen spreadsheet',
        accent: 'wil',
        items: [
          { title: 'Een coach die je cijfers uitlegt', desc: 'Fin vertaalt data naar wat het voor jóu betekent.' },
          { title: 'Een korte wekelijkse update', desc: 'De briefing: wat veranderde, waar je op kunt letten — desgewenst ook wekelijks in je mailbox (zelf aan te zetten).' },
          { title: 'Tips op het juiste moment', desc: 'Aandachtspunten die je met één tik tot actie maakt.' },
          { title: 'Een korte rondleiding bij je eerste bezoek', desc: 'Na het onboarden loopt Fin in een paar minuten met je door je Overzicht — je vier hefbomen, je gezondheidsscore, de vermogensgrafiek, zoeken en het menu — met jouw eigen cijfers. Later opnieuw te starten vanuit Fin of de i op je Overzicht.' },
          { title: 'Een gids die met je meeloopt', desc: 'Je welkomstgids woont bij Fin: de volgende stappen op een rij, en Fin wijst je er op het juiste scherm op — hooguit één keer per dag.' },
          { title: 'Je vragen beantwoorden', desc: 'Vraag Fin alles over je eigen situatie.' },
          { title: 'Je dagelijkse gesprek met Fin, ook privé', desc: 'Zet je privacy-modus aan, dan beantwoordt Fin je vragen met een AI die lokaal op je toestel draait — dezelfde chat, maar je vraag en je cijfers verlaten het toestel niet. Experimenteel en alleen op desktop.' },
          { title: 'Iets melden vanuit je gesprek met Fin', desc: 'Een bug, een vraag of een idee — meteen vanuit de chat, desgewenst met een screenshot. Komt direct bij ons team terecht.' },
        ],
      },
      {
        id: 'samen',
        goal: 'Ik wil het samen doen',
        accent: 'ink',
        items: [
          { title: 'Je financiën delen in één huishouden', desc: 'Veilig gekoppeld met je partner.' },
          { title: 'Drie perspectieven', desc: 'Kijk vanuit jezelf, vanuit het huishouden, of vanuit je partner.' },
          { title: 'Samen budgetteren in één huishoudbudget', desc: 'Dubbele categorieën samenvoegen tot gezamenlijke potten — alleen als jullie het allebei willen.' },
          { title: 'Een boeking markeren om samen te bespreken', desc: 'Zet een gedeelde boeking op jullie "Te bespreken"-lijst, met een korte notitie waarom. Alleen op boekingen die je partner ook ziet.' },
        ],
      },
    ],

    companion: {
      name: 'Fin',
      role: 'Je financiële metgezel — door de hele reis heen',
      touches: ['legt je cijfers uit', 'maakt een wekelijkse briefing', 'let op aandachtspunten', 'beantwoordt je vragen'],
    },

    // Soevereiniteit als motivatie (niet als gating — zie ADR 0001).
    phases: [
      { label: 'Herstel', meaning: 'Je krijgt de basis op orde en rust in je geld.' },
      { label: 'Stabiliteit', meaning: 'Je hebt grip; een buffer groeit.' },
      { label: 'Momentum', meaning: 'Je vermogen werkt voor je; je versnelt.' },
      { label: 'Meesterschap', meaning: 'Vrijheid is in zicht of bereikt; je optimaliseert.' },
    ],

    // Synced met de code: dit zijn de onderdelen die je kunt aanzetten.
    modules: MODULE_CATALOG.map((m) => ({
      id: m.id,
      label: m.label,
      description: m.description,
      standalone: m.standalone,
    })),

    outcome: {
      title: 'Volledige vrijheid',
      desc: 'Een datum waarop werken een keuze wordt, geen verplichting.',
    },
  }
}

/** Lichte bewaking dat de praatplaat coherent en in sync met de code blijft. */
export function validateHldModel(model: HldModel): string[] {
  const errors: string[] = []
  if (model.phases.length !== 4) errors.push(`verwacht 4 soevereiniteitsfasen, kreeg ${model.phases.length}`)
  if (model.modules.length !== MODULE_CATALOG.length) {
    errors.push(`modules niet in sync met MODULE_CATALOG (${model.modules.length} vs ${MODULE_CATALOG.length})`)
  }
  if (model.journey.length < 3) errors.push('de reis heeft te weinig stappen voor een verhaal')
  if (model.capabilityGroups.length === 0) errors.push('geen functionaliteit-groepen')
  for (const g of model.capabilityGroups) {
    if (g.items.length === 0) errors.push(`groep ${g.id} heeft geen functionaliteiten`)
  }
  return errors
}
