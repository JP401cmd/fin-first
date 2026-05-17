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
    explanation:
      'Het aantal dagen, maanden of jaren dat je vermogen je levenskosten dekt — zonder te werken. Hoe meer vrijheidstijd, hoe dichter bij financiële onafhankelijkheid.',
  },
  kassabon: {
    name: 'Kassabon',
    explanation:
      'Tik op een getal in de app en je ziet de kassabon — een stapsgewijze berekening die laat zien hoe het bedrag is opgebouwd. Transparantie in elk cijfer.',
  },
  fire: {
    name: 'FIRE',
    explanation:
      'Financial Independence, Retire Early — het moment waarop je vermogen genoeg oplevert om je uitgaven te dekken. Werken wordt optioneel.',
  },
  soevereiniteit: {
    name: 'Soevereiniteit',
    explanation:
      'Je financiële zelfredzaamheid, gemeten in niveaus van Herstel tot Meesterschap. Elk niveau ontgrendelt nieuwe functies in de app.',
  },
  will: {
    name: 'Will',
    explanation:
      'Je persoonlijke financiële assistent. Will kent de context van elke pagina en vertaalt cijfers naar inzichten. Stel hem een vraag via de chatknop rechtsonder.',
  },
  per_asset_rendement: {
    name: 'Per-asset rendement',
    explanation:
      'Elke bezitting groeit met een eigen rendement. Spaargeld met de spaarrente, beleggingen met het beursrendement, pensioen met het pensioenrendement. De simulatie berekent groei per type apart — realistischer dan één uniform percentage.',
  },
  heffingsvrij_vermogen: {
    name: 'Heffingsvrij vermogen',
    explanation:
      'De eerste € 57.000 (of € 114.000 met partner) van je vermogen is vrijgesteld van Box 3 belasting. Dit bedrag wordt proportioneel verdeeld over je bezittingstypes. Spaargeld profiteert relatief meer omdat het forfaitair rendement lager is.',
  },

  // ── Sectie 2: Aanvullende financiële termen ──────────────────
  // Alleen beschikbaar via GlossaryTerm tooltip, geen flip-kaart.

  netto_vermogen: {
    name: 'Netto vermogen',
    explanation:
      'Alles wat je bezit (spaargeld, beleggingen, huis) min alles wat je schuldig bent (hypotheek, leningen). Het totaal dat overblijft is jouw netto vermogen.',
  },
  SWR: {
    name: 'SWR',
    explanation:
      'Safe Withdrawal Rate — het percentage van je vermogen dat je jaarlijks kunt opnemen zonder dat het opraakt. Vaak rond de 3-4%.',
  },
  FIRE: {
    name: 'FIRE',
    explanation:
      'Financial Independence, Retire Early — het punt waarop je genoeg vermogen hebt om van te leven zonder te hoeven werken.',
  },
  koopkracht: {
    name: 'Koopkracht',
    explanation:
      'De werkelijke waarde van je geld, gecorrigeerd voor inflatie. Door prijsstijgingen koop je over tijd minder met hetzelfde bedrag.',
  },
  inflatie: {
    name: 'Inflatie',
    explanation:
      'De jaarlijkse stijging van het algemene prijsniveau. Je geld wordt elk jaar iets minder waard als prijzen stijgen.',
  },
  schuldgraad: {
    name: 'Schuldgraad',
    explanation:
      'Het percentage van je bezittingen dat met schulden is gefinancierd. Lager is over het algemeen gezonder.',
  },
  spaarquote: {
    name: 'Spaarquote',
    explanation:
      'Het deel van je netto-inkomen dat je maandelijks overhoudt en spaart of belegt. Hoe hoger, hoe sneller je financiële vrijheid bereikt.',
  },
  box_3: {
    name: 'Box 3',
    explanation:
      'Het belastingvak voor vermogen in Nederland. Je betaalt belasting over een fictief rendement op je spaargeld en beleggingen boven de vrijstelling.',
  },
  rendement: {
    name: 'Rendement',
    explanation:
      'De opbrengst van je beleggingen, uitgedrukt als percentage per jaar. Kan positief (winst) of negatief (verlies) zijn.',
  },
  vermogensbelasting: {
    name: 'Vermogensbelasting',
    explanation:
      'De belasting die je betaalt over je vermogen in Box 3. Gebaseerd op een door de overheid vastgesteld fictief rendement.',
  },
  AOW: {
    name: 'AOW',
    explanation:
      'Algemene Ouderdomswet — het basispensioen van de overheid dat je ontvangt vanaf je AOW-leeftijd (momenteel rond 67 jaar).',
  },
  pensioen: {
    name: 'Pensioen',
    explanation:
      'Het inkomen dat je ontvangt na je werkzame leven, opgebouwd via je werkgever of zelf aangevuld met beleggingen.',
  },
  Monte_Carlo: {
    name: 'Monte Carlo',
    explanation:
      "Een simulatiemethode die duizenden mogelijke scenario's doorrekent met willekeurige rendementen. Geeft een kans van slagen in plaats van een enkel getal.",
  },
  SORR: {
    name: 'SORR',
    explanation:
      'Sequence of Returns Risk — het risico dat slechte rendementen vroeg in je pensioen je vermogen sneller uitputten dan gemiddelden suggereren.',
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
 * Flat map van alle glossary-teksten (key → explanation).
 * Drop-in vervanging voor de oude GLOSSARY record in glossary-term.tsx.
 */
export const GLOSSARY: Record<string, string> = Object.fromEntries(
  Object.entries(GLOSSARY_ENTRIES).map(([key, entry]) => [key, entry.explanation]),
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
