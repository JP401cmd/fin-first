/**
 * Glossary — één bron van waarheid voor alle financiële uitleg-teksten.
 *
 * Gebruikt door:
 * - `<GlossaryTerm>` component (tooltip-popover)
 * - `ConceptFlipCards` in /identity/gids (flip-kaart achterkant)
 *
 * Elke entry heeft:
 * - `name`: korte weergavenaam (voor kaart-voorkant, tooltip-header)
 * - `explanation`: uitleg in maximaal 2 zinnen, begrijpelijk voor een leek
 *
 * Naamconventie keys: snake_case, lowercase, geen streepjes.
 * Gebruik dezelfde key als `id` in ConceptFlipCards en als `term` in GlossaryTerm.
 */

export interface GlossaryEntry {
  /** Korte weergavenaam (bijv. "FIRE", "Vrijheidstijd"). */
  name: string
  /** Toegankelijk alternatief voor het jargon — begrijpelijk zonder financiële voorkennis.
   *  Bijv. 'SWR' → 'Opnamestrategie', 'FIRE' → 'Financiële vrijheid'. */
  alternative: string
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
  fire: {
    name: 'FIRE',
    alternative: 'Financiële vrijheid',
    explanation:
      'Financial Independence, Retire Early — het moment waarop je vermogen genoeg oplevert om je uitgaven te dekken. Werken wordt optioneel.',
  },
  soevereiniteit: {
    name: 'Soevereiniteit',
    alternative: 'Financiële zelfredzaamheid',
    explanation:
      'Je financiële zelfredzaamheid, gemeten in niveaus van Herstel tot Meesterschap. Elk niveau ontgrendelt nieuwe functies in de app.',
  },
  will: {
    name: 'Will',
    alternative: 'Persoonlijke assistent',
    explanation:
      'Je persoonlijke financiële assistent. Will kent de context van elke pagina en vertaalt cijfers naar inzichten. Stel hem een vraag via de chatknop rechtsonder.',
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
      'De eerste € 57.000 (of € 114.000 met partner) van je vermogen is vrijgesteld van Box 3 belasting. Dit bedrag wordt proportioneel verdeeld over je bezittingstypes. Spaargeld profiteert relatief meer omdat het forfaitair rendement lager is.',
  },

  // ── Sectie 2: Aanvullende financiële termen ──────────────────
  // Alleen beschikbaar via GlossaryTerm tooltip, geen flip-kaart.

  netto_vermogen: {
    name: 'Netto vermogen',
    alternative: 'Wat je bezit min wat je schuldig bent',
    explanation:
      'Alles wat je bezit (spaargeld, beleggingen, huis) min alles wat je schuldig bent (hypotheek, leningen). Het totaal dat overblijft is jouw netto vermogen.',
  },
  SWR: {
    name: 'SWR',
    alternative: 'Opnamestrategie',
    explanation:
      'Safe Withdrawal Rate — het percentage van je vermogen dat je jaarlijks kunt opnemen zonder dat het opraakt. Vaak rond de 3-4%.',
  },
  FIRE: {
    name: 'FIRE',
    alternative: 'Financiële onafhankelijkheid',
    explanation:
      'Financial Independence, Retire Early — het punt waarop je genoeg vermogen hebt om van te leven zonder te hoeven werken.',
  },
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
    alternative: 'Schulden ten opzichte van bezittingen',
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
    alternative: 'Kanssimulatie',
    explanation:
      "Een simulatiemethode die duizenden mogelijke scenario's doorrekent met willekeurige rendementen. Geeft een kans van slagen in plaats van een enkel getal.",
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
  swr: {
    name: 'SWR',
    alternative: 'Veilig opname-percentage',
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
    alternative: 'Hoogste rente eerst',
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
 * Gebruik: `JARGON_VERTAALTABEL['SWR']` → `'Opnamestrategie'`
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
