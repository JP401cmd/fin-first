/**
 * Glossary — één bron van waarheid voor alle financiële uitleg-teksten.
 *
 * Gebruikt door:
 * - `<GlossaryTerm>` component (tooltip-popover)
 * - glossary-popovers (GlossaryTerm)
 *
 * Elke entry heeft:
 * - `name`: korte weergavenaam (voor kaart-voorkant, tooltip-header)
 * - `explanation`: uitleg in maximaal 2 zinnen, begrijpelijk voor een leek
 *
 * Naamconventie keys: snake_case, lowercase, geen streepjes.
 * Gebruik dezelfde key als `id` in ConceptFlipCards en als `term` in GlossaryTerm.
 *
 * HARDE REGEL (S17): sleutels zijn UNIEK ONGEACHT HOOFDLETTERS. `SWR` naast
 * `swr` en `FIRE` naast `fire` bestonden allebei, met tegenstrijdige uitleg, en
 * één bestand (voorkeuren-view.tsx) gebruikte beide casings — twee verschillende
 * teksten voor hetzelfde begrip op één pagina. `glossary-data.test.ts` bewaakt
 * dit nu. Losse hoofdletter-sleutels die géén dubbel hebben (AOW, ETF, LTV,
 * SORR, Monte_Carlo) blijven bewust staan: dat zijn afkortingen die als naam
 * geschreven worden en op tientallen call-sites leven; hernoemen is geen
 * taalverbetering maar een refactor.
 */

import { formatCurrency } from '@/lib/format'
import { BOX3_PARAMS, CURRENT_TAX_YEAR } from '@/lib/box3-data'

export interface GlossaryEntry {
  /** Korte weergavenaam (bijv. "FIRE", "Vrijheidstijd"). Ook de kop van de popover. */
  name: string
  /** Toegankelijk alternatief voor het jargon — begrijpelijk zonder financiële voorkennis.
   *  Bijv. 'SWR' → 'Hoeveel je per jaar kunt opnemen'. Bedoeld als LABEL (kaart-
   *  voorkant, tooltip-header, keuzelijst), niet per se als inline zinsdeel. */
  alternative: string
  /**
   * Inline-veilig alternatief dat in de **Eenvoudige weergave** het zichtbare
   * woord VERVANGT (`GlossaryTerm`); de vakterm verhuist dan naar de popover-kop.
   *
   * AFWEZIG = de vakterm blijft in beide modi staan. Dat is de bewuste
   * standaard voor wettelijke/fiscale termen — de kaartregel luidt "wettelijke
   * termen mógen, mét uitleg ter plekke", dus Box 3, aanmerkelijk belang,
   * tegenbewijs en heffingsvrij vermogen houden hun naam en laten de
   * `explanation` het werk doen. Alleen afkortingen en merknamen krijgen een
   * `simpleLabel`.
   *
   * Schrijf 'm KLEIN en als zinsdeel ("duurste schuld eerst"), niet als titel:
   * `GlossaryTerm` matcht de hoofdletter van het oorspronkelijke woord.
   */
  simpleLabel?: string
  /** Uitleg in maximaal 2 zinnen, begrijpelijk voor een leek. */
  explanation: string
}

/**
 * Canonical glossary — alle financiële concepten die in de app worden uitgelegd.
 *
 * Sectie 1: Concepten die ook in ConceptFlipCards verschijnen (id ↔ key mapping).
 * Sectie 2: Aanvullende financiële termen (alleen tooltip, geen flip-kaart).
 */
export const GLOSSARY_ENTRIES: Record<string, GlossaryEntry> = {
  // ── Sectie 1: ConceptFlipCards-concepten ──────────────────────
  // Keys komen overeen met ConceptCard.id in concept-flip-cards.tsx

  vrijheidstijd: {
    name: 'Vrijheidstijd',
    alternative: 'Vrije tijd dankzij vermogen',
    explanation:
      'Het aantal dagen, maanden of jaren dat je vermogen je levenskosten dekt — zonder te werken. Hoe meer vrijheidstijd, hoe dichter bij financiële onafhankelijkheid.',
  },
  kassabon: {
    name: 'Kassabon',
    alternative: 'Berekening stap voor stap',
    explanation:
      'Tik op een getal in de app en je ziet de kassabon — een stapsgewijze berekening die laat zien hoe het bedrag is opgebouwd. Transparantie in elk cijfer.',
  },
  // ÉÉN fire-entry (was: `fire` + `FIRE` met tegenstrijdige alternatives).
  // De zichtbare term is "volledige vrijheid" — de projectfilosofie in CLAUDE.md
  // schrijft die framing voor; FIRE blijft als vakterm in de popover-kop staan.
  fire: {
    name: 'FIRE',
    alternative: 'Volledige vrijheid',
    simpleLabel: 'volledige vrijheid',
    explanation:
      'Financial Independence, Retire Early — het punt waarop je vermogen genoeg oplevert om je uitgaven te dekken. Werken wordt vanaf dat moment optioneel: je hebt volledige vrijheid.',
  },
  soevereiniteit: {
    name: 'Soevereiniteit',
    alternative: 'Financiële zelfredzaamheid',
    explanation:
      'Je financiële zelfredzaamheid, gemeten in niveaus van Herstel tot Meesterschap. Elk niveau ontgrendelt nieuwe functies in de app.',
  },
  will: {
    name: 'Fin',
    alternative: 'Persoonlijke assistent',
    explanation:
      'Je persoonlijke financiële assistent. Fin kent de context van elke pagina en vertaalt cijfers naar inzichten. Stel hem een vraag via de chatknop rechtsonder.',
  },
  per_asset_rendement: {
    name: 'Per-asset rendement',
    alternative: 'Groei per bezittype',
    explanation:
      'Elke bezitting groeit met een eigen rendement. Spaargeld met de spaarrente, beleggingen met het beursrendement, pensioen met het pensioenrendement. De simulatie berekent groei per type apart — realistischer dan één uniform percentage.',
  },
  heffingsvrij_vermogen: {
    name: 'Heffingsvrij vermogen',
    alternative: 'Belastingvrije drempel',
    explanation:
      `De eerste ${formatCurrency(BOX3_PARAMS[CURRENT_TAX_YEAR].heffingsvrijSingle)} (of ${formatCurrency(BOX3_PARAMS[CURRENT_TAX_YEAR].heffingsvrijPartner)} met partner) van je vermogen is vrijgesteld van Box 3 belasting. Dit bedrag wordt proportioneel verdeeld over je bezittingstypes. Spaargeld profiteert relatief meer omdat het forfaitair rendement lager is.`,
  },

  // ── Sectie 2: Aanvullende financiële termen ──────────────────
  // Alleen beschikbaar via GlossaryTerm tooltip, geen flip-kaart.

  netto_vermogen: {
    name: 'Netto vermogen',
    alternative: 'Wat je bezit min wat je schuldig bent',
    explanation:
      'Alles wat je bezit (spaargeld, beleggingen, huis) min alles wat je schuldig bent (hypotheek, leningen). Het totaal dat overblijft is jouw netto vermogen.',
  },
  // `SWR` en `FIRE` (hoofdletter-sleutels) zijn opgeheven in `swr` resp. `fire`.
  koopkracht: {
    name: 'Koopkracht',
    alternative: 'Werkelijke waarde van je geld',
    explanation:
      'De werkelijke waarde van je geld, gecorrigeerd voor inflatie. Door prijsstijgingen koop je over tijd minder met hetzelfde bedrag.',
  },
  inflatie: {
    name: 'Inflatie',
    alternative: 'Prijsstijging',
    explanation:
      'De jaarlijkse stijging van het algemene prijsniveau. Je geld wordt elk jaar iets minder waard als prijzen stijgen.',
  },
  schuldgraad: {
    name: 'Schuldgraad',
    alternative: 'Schuld ten opzichte van wat je bezit',
    simpleLabel: 'schuldenlast ten opzichte van je bezit',
    explanation:
      'Het percentage van je bezittingen dat met schulden is gefinancierd. Lager is over het algemeen gezonder.',
  },
  spaarquote: {
    name: 'Spaarquote',
    alternative: 'Percentage dat je spaart',
    explanation:
      'Het deel van je netto-inkomen dat je maandelijks overhoudt en spaart of belegt. Hoe hoger, hoe sneller je financiële vrijheid bereikt.',
  },
  box_3: {
    name: 'Box 3',
    alternative: 'Vermogensbelasting',
    explanation:
      'Het belastingvak voor vermogen in Nederland. Je betaalt belasting over een fictief rendement op je spaargeld en beleggingen boven de vrijstelling.',
  },
  rendement: {
    name: 'Rendement',
    alternative: 'Opbrengst van beleggingen',
    explanation:
      'De opbrengst van je beleggingen, uitgedrukt als percentage per jaar. Kan positief (winst) of negatief (verlies) zijn.',
  },
  vermogensbelasting: {
    name: 'Vermogensbelasting',
    alternative: 'Belasting op je bezittingen',
    explanation:
      'De belasting die je betaalt over je vermogen in Box 3. Gebaseerd op een door de overheid vastgesteld fictief rendement.',
  },
  AOW: {
    name: 'AOW',
    alternative: 'Staatspensioen',
    explanation:
      'Algemene Ouderdomswet — het basispensioen van de overheid dat je ontvangt vanaf je AOW-leeftijd (momenteel rond 67 jaar).',
  },
  pensioen: {
    name: 'Pensioen',
    alternative: 'Inkomen na je werkende jaren',
    explanation:
      'Het inkomen dat je ontvangt na je werkzame leven, opgebouwd via je werkgever of zelf aangevuld met beleggingen.',
  },
  Monte_Carlo: {
    name: 'Monte Carlo',
    alternative: 'Marktcheck',
    explanation:
      'Een simulatiemethode die je plan een paar honderd keer opnieuw doorrekent, elke keer met een ander rendement. Geeft een kans van slagen in plaats van één enkel getal. De trekkingen liggen vast, dus dezelfde invoer geeft altijd dezelfde uitkomst.',
  },
  SORR: {
    name: 'SORR',
    alternative: 'Volgorderisico',
    explanation:
      'Sequence of Returns Risk — het risico dat slechte rendementen vroeg in je pensioen je vermogen sneller uitputten dan gemiddelden suggereren.',
  },

  // ── Sectie 3: Extra jargontermen voor vertaaltabel ───────────
  // Aanvullende financiële begrippen die in de app voorkomen.

  asset_allocatie: {
    name: 'Asset allocatie',
    alternative: 'Verdeling van je bezittingen',
    explanation:
      'De manier waarop je je vermogen verdeelt over verschillende categorieën zoals aandelen, obligaties en spaargeld. Spreiding verlaagt risico.',
  },
  diversificatie: {
    name: 'Diversificatie',
    alternative: 'Spreiding van risico',
    explanation:
      'Je geld verdelen over meerdere beleggingen zodat een tegenvaller in één hoek niet je hele vermogen raakt.',
  },
  forfaitair_rendement: {
    name: 'Forfaitair rendement',
    alternative: 'Door de overheid vastgesteld fictief rendement',
    explanation:
      'Het rendement dat de Belastingdienst aanneemt dat je hebt behaald, ongeacht je werkelijke resultaten. Hierover betaal je belasting in Box 3.',
  },
  liquiditeit: {
    name: 'Liquiditeit',
    alternative: 'Hoe snel je bij je geld kunt',
    explanation:
      'De mate waarin je bezittingen snel en zonder waardeverlies in contant geld kunt omzetten. Spaargeld is zeer liquide, een huis niet.',
  },
  compounding: {
    name: 'Compounding',
    alternative: 'Rente op rente',
    explanation:
      'Het effect waarbij je rendement ook weer rendement oplevert. Hoe langer je belegd blijft, hoe sterker dit sneeuwbaleffect groeit.',
  },
  passief_inkomen: {
    name: 'Passief inkomen',
    alternative: 'Inkomen zonder te werken',
    explanation:
      'Geld dat binnenkomt zonder dat je er actief voor hoeft te werken — bijvoorbeeld dividend, huurinkomsten of rente.',
  },
  expense_ratio: {
    name: 'Expense ratio',
    alternative: 'Fondskosten per jaar',
    explanation:
      'De jaarlijkse kosten die een beleggingsfonds in rekening brengt, uitgedrukt als percentage van je inleg. Lager is voordeliger.',
  },
  ETF: {
    name: 'ETF',
    alternative: 'Beursgenoteerd beleggingsfonds',
    explanation:
      'Exchange-Traded Fund — een fonds dat je op de beurs kunt kopen en verkopen, vaak met lage kosten en brede spreiding.',
  },
  dividend: {
    name: 'Dividend',
    alternative: 'Winstuitkering',
    explanation:
      'Een deel van de winst dat een bedrijf uitkeert aan aandeelhouders. Je ontvangt dit periodiek als je aandelen bezit.',
  },
  hypotheek: {
    name: 'Hypotheek',
    alternative: 'Lening voor je huis',
    explanation:
      'Een lening waarmee je een woning koopt, waarbij het huis als onderpand dient. Je betaalt maandelijks rente en eventueel aflossing.',
  },
  annuiteit: {
    name: 'Annuïteit',
    alternative: 'Gelijkblijvende maandlast',
    explanation:
      'Een aflosvorm waarbij je elke maand hetzelfde totaalbedrag betaalt. In het begin betaal je vooral rente, later vooral aflossing.',
  },
  LTV: {
    name: 'LTV',
    alternative: 'Schuld ten opzichte van woningwaarde',
    explanation:
      'Loan-to-Value — het percentage van de woningwaarde dat je hebt gefinancierd met een hypotheek. Onder de 100% betekent overwaarde.',
  },
  rebalancing: {
    name: 'Rebalancing',
    alternative: 'Herbalanceren van je beleggingen',
    explanation:
      'Het periodiek terugbrengen van je beleggingsmix naar de gewenste verdeling, bijvoorbeeld door winnaars te verkopen en achterblijvers bij te kopen.',
  },
  noodreserve: {
    name: 'Noodreserve',
    alternative: 'Spaarpot voor onverwachte uitgaven',
    explanation:
      'Een buffer van 3-6 maanden levenskosten op een spaarrekening, bedoeld voor onvoorziene situaties zoals baanverlies of een grote reparatie.',
  },
  guardrails: {
    name: 'Guardrails',
    alternative: 'Vangrails-strategie',
    explanation:
      'Een dynamische onttrekkings-strategie die je opname verlaagt na slechte beurs-jaren en verhoogt na goede. Floor en ceiling bepalen de min/max correctie t.o.v. je startopname.',
  },
  // ÉÉN swr-entry (was: `swr` + `SWR`). Bewust "kunt opnemen", niet "opneemt":
  // de motor onderscheidt de INGESTELDE opnamevoet van de IMPLICIETE, en bij een
  // teer-op-vermogen-scenario is er helemaal geen vaste voet. "Wat je jaarlijks
  // opneemt" zou dat onderscheid wegpoetsen en het label onwaar maken.
  swr: {
    name: 'SWR',
    alternative: 'Hoeveel je per jaar kunt opnemen',
    // Inline moet het een zelfstandig naamwoord zijn dat op de plek van "SWR"
    // past ("Klassiek opnamepercentage —", "Effectief opnamepercentage").
    // De volledige nuance staat in de uitleg, één tik verderop.
    simpleLabel: 'opnamepercentage',
    explanation:
      'Safe Withdrawal Rate — het percentage van je startvermogen dat je elk jaar kunt opnemen zonder voortijdig door je vermogen heen te zijn. Klassieke vuistregel: 4% bij 30 jaar horizon.',
  },
  vpw: {
    name: 'VPW',
    alternative: 'Leeftijd-afhankelijke opname',
    explanation:
      'Variable Percentage Withdrawal — je onttrekkings-percentage stijgt naarmate je ouder wordt, omdat je horizon korter wordt. Veerkrachtiger dan vast SWR bij lange/onzekere levensduur.',
  },
  bucket: {
    name: 'Bucket-strategie',
    alternative: 'Cash-buffer + lange termijn',
    explanation:
      'Je vermogen wordt verdeeld in pots: een cash-bucket voor 2-3 jaar uitgaven en een belegde bucket voor de rest. Bij beursdips put je uit cash, zodat je niet hoeft te verkopen op een laag punt.',
  },
  avalanche: {
    name: 'Avalanche-methode',
    alternative: 'Duurste schuld eerst',
    simpleLabel: 'duurste schuld eerst',
    explanation:
      'Schuldaflossings-strategie waarbij je extra aflossingen richt op de schuld met het hoogste rente-percentage. Wiskundig de goedkoopste route naar schuldvrij.',
  },
  ter: {
    name: 'TER',
    alternative: 'Beheerkosten van een fonds',
    explanation:
      'Total Expense Ratio — de jaarlijkse kosten van een beleggingsfonds als percentage van het belegd vermogen. Voor een wereldwijde index-ETF is 0.10-0.25% een goede richtwaarde.',
  },
  index_etf: {
    name: 'Index-ETF',
    alternative: 'Beursverhandelbaar indexfonds',
    explanation:
      'Een fonds dat een hele beursindex (bv. MSCI World) volgt en op de beurs wordt verhandeld als een aandeel. Lage kosten en breed gespreid — vandaar de aanbevolen keuze voor lange-termijn beleggers.',
  },

  // ── Sectie 3: koppelingen & weergave-begrippen (bevinding H19) ─────────
  // Jargon dat op beslismomenten in beeld komt (/toekomst-navkaart,
  // /mijn-koppelingen, de netto-vermogen-kassabon op /bezittingen) en tot
  // nu toe kaal werd getoond.

  psd2: {
    name: 'PSD2',
    alternative: 'Bank koppelen',
    explanation:
      'De Europese betaalrichtlijn die je het recht geeft je eigen bankgegevens te delen met een app die je zelf kiest. Je koppelt via de inlogpagina van je eigen bank, dus je wachtwoord komt hier nooit langs.',
  },
  upo: {
    name: 'UPO',
    alternative: 'Pensioenoverzicht',
    explanation:
      'Uniform Pensioenoverzicht — het jaarlijkse overzicht van je pensioenuitvoerder met wat je tot nu toe hebt opgebouwd en wat je op pensioenleeftijd mag verwachten. Je vindt het ook op mijnpensioenoverzicht.nl.',
  },
  // Bewust GEEN `simpleLabel`: het kaartvoorstel was "hoeveel hiervan meetelt
  // voor je vrijheid", en dat is een grondslagfout — dit percentage weegt het
  // NETTO VERMOGEN (incl. niet-liquide bezit), niet de FIRE-eligible/liquide pot.
  // CLAUDE.md verbiedt die menging expliciet. De duiding zit dus in de uitleg,
  // en die noemt de juiste grootheid.
  inclusiepercentage: {
    name: 'Inclusiepercentage',
    alternative: 'Hoeveel hiervan meetelt in je netto vermogen',
    explanation:
      'Het deel van een bezitting of schuld dat meetelt in je netto vermogen, in procenten. Deel je een rekening met iemand anders, dan zet je hem bijvoorbeeld op 50% zodat alleen jouw helft meetelt.',
  },

  // ── Sectie 4: fiscaal jargon (bevinding S17) ──────────────────────────
  // Nooit eerder gesweept: de eerdere jargon-ronde ging over percentielen en
  // afkortingen, niet over fiscale termen. Wettelijke termen BLIJVEN staan
  // (geen `simpleLabel`) — ze krijgen hun uitleg ter plekke.

  vervreemdingswinst: {
    name: 'Vervreemdingswinst',
    alternative: 'Winst bij verkoop van je aandeel',
    simpleLabel: 'winst bij verkoop van je aandeel',
    explanation:
      'De winst die je maakt als je je aandeel in een BV verkoopt: de verkoopprijs min wat je er ooit voor betaalde. Die winst wordt in Box 2 belast.',
  },
  tegenbewijs: {
    name: 'Tegenbewijs',
    alternative: 'Rekenen met je werkelijke rendement',
    // Bewust beschrijvend, geen gebiedende wijs. "Laat zien wat je écht
    // verdiende en betaal daarover" is een handelingsinstructie om een fiscale
    // regeling in te roepen — dat is advies, niet inzicht (Wft-grens).
    explanation:
      'Je mag laten zien wat je werkelijk aan rendement behaalde. Is dat lager dan het forfait dat de Belastingdienst aanneemt, dan wordt over dat werkelijke rendement geheven.',
  },
  // GEEN `excessief_lenen`-entry: die frase draagt op /overzicht/belasting/box2
  // al zijn uitleg via `BOX2_TOOLTIPS.wetExcessiefLenen` (die sinds S17 het
  // bedrag uit DGA_LENING_DREMPEL consumeert i.p.v. een letterlijke €500.000).
  // Een tweede uitleg-kanaal voor dezelfde zin op dezelfde kaart is duplicatie —
  // en een glossary-entry zonder consument is precies het dode mechanisme dat
  // deze kaart juist opruimt.

  // Eindstrategieën uit lib/fire-strategy.ts (STRATEGY_LABELS). De namen daar
  // zijn korte kaart-labels; hier staat de uitleg voor een leek. Keys volgen
  // `eindstrategie_<FireEndStrategy>` zodat de navkaart ze kan afleiden.
  eindstrategie_deplete: {
    name: 'Vermogen opeten',
    alternative: 'Je vermogen opmaken',
    explanation:
      'Je maakt je vermogen bewust op tot het rond je eindleeftijd op nul staat. Dat mag je meer per jaar laten opnemen dan wanneer je alles wilt bewaren.',
  },
  eindstrategie_legacy: {
    name: 'Nalatenschap',
    alternative: 'Een bedrag overhouden',
    explanation:
      'Je houdt aan het eind bewust een doelbedrag over, bijvoorbeeld om na te laten. Wat je daarvoor apart houdt, kun je onderweg niet opnemen.',
  },
  eindstrategie_perpetual: {
    name: 'Eeuwigdurend',
    alternative: 'Vermogen intact houden',
    explanation:
      'Je neemt alleen op wat je vermogen bovenop de inflatie oplevert, zodat de koopkracht van je vermogen intact blijft. De voorzichtigste variant, en dus de traagste weg naar vrijheid.',
  },
  // Overgangsvormen (F4 verwijdert ze): 'pensioen' en 'nu-stoppen' zijn sinds ADR 0129
  // geen eind-vormen meer maar STOP-ANKERS (zie `stopanker_aow` / `stopanker_now`).
  eindstrategie_pensioen: {
    name: 'Pensioenleeftijd',
    alternative: 'Stoppen op je AOW-leeftijd',
    explanation:
      'Oude naam voor het stopmoment "op mijn AOW-leeftijd": je werkt door tot je AOW ingaat en de app laat zien of je vermogen dan tot het einde van je plan reikt.',
  },
  'eindstrategie_nu-stoppen': {
    name: 'Nu stoppen',
    alternative: 'Werken stopt vandaag',
    explanation:
      'Oude naam voor het stopmoment "nu": het model rekent alsof je vandaag stopt met werken en laat zien tot welke leeftijd je liquide vermogen dan reikt.',
  },

  // ── Stopmoment en de vier ankers (ADR 0129) ─────────────────────────────
  // De plan-regel stelt twee vragen: WANNEER stop je (het stopmoment, vier
  // ankers) en WAT moet er aan het eind gelden (de eind-vorm hierboven).
  // Keys volgen `stopanker_<StopAnchorKind>`.
  stopmoment: {
    name: 'Stopmoment',
    alternative: 'Wanneer je stopt met werken',
    explanation:
      'Het moment waarop je in je plan stopt met werken en gaat leven van je vermogen. Je kiest het zelf (een leeftijd, je AOW-leeftijd of nu), of je laat de app uitrekenen wanneer het kan. Los daarvan kies je wat er aan het eind van je plan moet gelden.',
  },
  stopanker_solved: {
    name: 'Laat de app het uitrekenen',
    alternative: 'De app zoekt je vroegste stopmoment',
    explanation:
      'De app zoekt de vroegste leeftijd waarop je vermogen je plan draagt. Dat is je vrijheidsleeftijd: het moment waarop werken een keuze wordt.',
  },
  stopanker_aow: {
    name: 'Op mijn AOW-leeftijd',
    alternative: 'Doorwerken tot je AOW ingaat',
    explanation:
      'Je werkt door tot je AOW ingaat. De app laat zien of je vermogen dan tot het einde van je plan reikt, en vanaf welke leeftijd vrij al mogelijk was geweest.',
  },
  stopanker_age: {
    name: 'Op een leeftijd die ik kies',
    alternative: 'Zelf een stopleeftijd kiezen',
    explanation:
      'Jij kiest het moment, in halve jaren. De app laat zien hoe het dan loopt: tot welke leeftijd je liquide vermogen reikt en vanaf wanneer vrij al mogelijk was.',
  },
  stopanker_now: {
    name: 'Nu',
    alternative: 'Rekenen alsof je vandaag stopt',
    explanation:
      'Je rekent alsof je vandaag stopt. Er is dan geen doelbedrag: de vraag is tot welke leeftijd je liquide vermogen reikt, niet hoeveel je nog moet opbouwen.',
  },
}

/**
 * Platte lookup: term-key → explanation string.
 * Handig voor GlossaryTerm die alleen de tekst nodig heeft.
 */
export function getGlossaryExplanation(term: string): string | undefined {
  return GLOSSARY_ENTRIES[term]?.explanation
}

/**
 * Platte lookup: term-key → toegankelijk alternatief.
 * Handig om in labels het jargon te vervangen door een begrijpelijke term.
 */
export function getGlossaryAlternative(term: string): string | undefined {
  return GLOSSARY_ENTRIES[term]?.alternative
}

/**
 * Flat map van alle glossary-teksten (key → explanation).
 * Drop-in vervanging voor de oude GLOSSARY record in glossary-term.tsx.
 */
export const GLOSSARY: Record<string, string> = Object.fromEntries(
  Object.entries(GLOSSARY_ENTRIES).map(([key, entry]) => [key, entry.explanation]),
)

/**
 * Jargon vertaaltabel — koppelt financieel vakjargon aan toegankelijke alternatieven.
 *
 * Gebruik: `JARGON_VERTAALTABEL['swr']` → `'Hoeveel je per jaar kunt opnemen'`
 *
 * Dient als bron voor GlossaryTerm tooltip-headers en label-alternatieven
 * op plekken waar het publiek geen financiële voorkennis heeft.
 */
export const JARGON_VERTAALTABEL: Record<string, string> = Object.fromEntries(
  Object.entries(GLOSSARY_ENTRIES).map(([key, entry]) => [key, entry.alternative]),
)

/**
 * Keys van entries die in de ConceptFlipCards verschijnen.
 * Gebruikt door ConceptFlipCards om de GLOSSARY_ENTRIES subset op te halen.
 */
export const CONCEPT_CARD_KEYS = [
  'vrijheidstijd',
  'kassabon',
  'fire',
  'soevereiniteit',
  'will',
  'per_asset_rendement',
  'heffingsvrij_vermogen',
] as const

export type ConceptCardKey = (typeof CONCEPT_CARD_KEYS)[number]
