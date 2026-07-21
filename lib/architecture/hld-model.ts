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
      { n: 1, title: 'Beginnen', you: 'Je vertelt waar je naartoe wilt.', app: 'We zetten alleen de onderdelen aan die jij nodig hebt.' },
      { n: 2, title: 'Vastleggen', you: 'Je koppelt je bank of importeert je gegevens.', app: 'Inkomsten, uitgaven en bezittingen staan overzichtelijk bij elkaar.' },
      { n: 3, title: 'Begrijpen', you: 'Je ziet in één oogopslag hoe je ervoor staat.', app: 'Fin, je coach, legt uit wat opvalt en wat je nú kunt doen.' },
      { n: 4, title: 'Vooruitkijken', you: 'Je rekent je toekomst door.', app: 'Je ziet wanneer je financieel vrij bent — en wat keuzes daaraan veranderen.' },
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
          { title: 'Al je uitgaven en inkomsten op een rij', desc: 'Overzichtelijk, met categorieën en grootste posten.' },
          { title: 'Budgetten maken en bewaken', desc: 'Zie per categorie hoeveel je deze maand nog hebt.' },
          { title: 'Zien hoeveel je overhoudt', desc: 'Je spaarquote: welk deel van je inkomen je spaart.' },
          { title: 'Je bezittingen en schulden bijhouden', desc: 'Van spaargeld tot huis en hypotheek — je netto vermogen in beeld.' },
          { title: 'Je broker koppelen of je portefeuille importeren', desc: 'Trading 212 koppelen of een bestand inladen — je aandelen en fondsen kloppen automatisch, net als bij je crypto.' },
          { title: 'Zien wat je beleggingen je hebben opgeleverd', desc: 'Per belegging je totale opbrengst — koerswinst, dividend én verkochte (gesloten) posities samen — afgeleid uit je eigen transacties.' },
          { title: 'Jezelf spiegelen aan Nederland en de wereld', desc: 'Zie hoe je gezondheid, spaarquote, vermogen en vrijheidsleeftijd zich verhouden tot een vergelijkbare doelgroep — en waar je staat wereldwijd.' },
          { title: 'Meteen begrijpen waaróm iets je aandacht vraagt en wat je kunt doen', desc: 'Als een overzichtspagina oranje of rood kleurt, legt een banner in gewone taal uit wat er speelt en wat je concreet kunt aanpakken — met een directe link naar de juiste plek of een gesprek met Fin.' },
          { title: 'Transacties lokaal laten categoriseren, zonder dat je gegevens je toestel verlaten', desc: 'Experimenteel en alleen op desktop: zet je AI-categorisatie lokaal aan en je transactiegegevens gaan niet naar een cloud-AI-provider — elk voorstel controleer je zelf voor je het overneemt.' },
          { title: 'Financieel nieuws lezen dat om jouw cijfers draait', desc: 'Zet de nieuwsmodule aan voor gepersonaliseerd nieuws — alleen artikelen die daadwerkelijk raken aan jouw bezittingen, categorieën of doelen, geen ruis.' },
        ],
      },
      {
        id: 'vrijheid',
        goal: 'Ik wil weten wanneer ik vrij ben',
        accent: 'horizon',
        items: [
          { title: 'Uitrekenen wanneer je niet meer hoeft te werken', desc: 'Je FIRE-datum: het moment dat werken een keuze wordt.' },
          { title: '“Wat als”-scenario\'s doorrekenen', desc: 'Meer sparen, eerder stoppen, anders beleggen — zie het effect direct.' },
          { title: 'Grote gebeurtenissen meenemen', desc: 'Huis kopen, pensioen, kinderen — alles op je tijdlijn.' },
          { title: 'Je vermogen jaren vooruit zien groeien', desc: 'Simulaties en een toets tegen echte beurshistorie.' },
          { title: 'Snappen hoe je vrijheidsgrafiek is opgebouwd', desc: 'In vier stappen met je eigen cijfers: opbouw, benodigd vermogen, het vrijheidsmoment en onttrekking.' },
          { title: 'Je loopbaan en inkomen meenemen', desc: 'Salarisgroei, een plafond of minder werken — zie wat het met je vrijheidsdatum doet.' },
          { title: 'Zien hoe stevig je plan staat, op elk front', desc: 'Een radar met vijf sterktepunten — de brug tot je AOW, je pensioeninkomen, wonen, marktrisico en je eindstrategie — die meebeweegt met de stopleeftijd die jij kiest.' },
          { title: 'Kant-en-klare paden naast elkaar zien', desc: 'Vijf voorgerekende scenario\'s naast je basispad, met een seintje bij het pad dat de minste buffer overhoudt.' },
          { title: 'Mijn doorgerekende toekomst vastleggen als doel', desc: 'Sta je op een "wat als"-stand die klopt? Maak er met één klik je doelsituatie van — spaarquote, salaris, rendement en vrijheidsleeftijd worden echte doelen die meegroeien met je cijfers, terug te vinden bij je doelen.' },
          { title: 'Je hele plan als één deelbaar document', desc: 'Het totaalplan bundelt je aannames, je vermogensprojectie naar volledige vrijheid, de slagingskans onder marktschommelingen en concrete inzichten in één rapport — deelbaar als PDF met je partner of adviseur, met alle cijfers uit dezelfde rekenmotor als Toekomst en Overzicht.' },
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
          { title: 'Je vragen beantwoorden', desc: 'Vraag Fin alles over je eigen situatie.' },
          { title: 'Je dagelijkse gesprek met Fin, ook privé', desc: 'Zet je privacy-modus aan, dan beantwoordt Fin je vragen met een AI die lokaal op je toestel draait — dezelfde chat, maar je vraag en je cijfers verlaten het toestel niet. Experimenteel en alleen op desktop.' },
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
