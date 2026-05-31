/**
 * Registry van de vijf "Regels op de hele tijdas" (/toekomst → Voorkeuren).
 *
 * Pure metadata + copy (geen JSX), zodat de gedeelde RegelBewerkenPane generiek
 * blijft en de body-componenten alleen hun eigen instellingen + impact regelen.
 *
 * - `live-sim`    : regel stuurt de FIRE-simulatie aan → échte impact-grafiek
 *                   (baseline vs. kandidaat via runRegelProjection).
 * - `illustratief`: regel bepaalt pot-volgorde/-verdeling → illustratieve
 *                   pot-flow-weergave (geen volledige hersimulatie in de editor).
 */

export type RegelId =
  | 'eindstrategie'
  | 'onttrekkingsstrategie'
  | 'onttrekkingsvolgorde'
  | 'verdeling-toename'
  | 'onttrekking-afname'

export type RegelImpactKind = 'live-sim' | 'illustratief'

export interface RegelMeta {
  id: RegelId
  /** Korte titel in de pane-header en op de card. */
  title: string
  /** Kicker boven de titel in het bewerkscherm. */
  kicker: string
  /** Eén à twee zinnen uitleg — wat doet deze regel en waarom kies je hier iets. */
  intro: string
  /** Bepaalt of de body een live-sim-grafiek of een illustratieve weergave toont. */
  impactKind: RegelImpactKind
}

export const REGEL_META: Record<RegelId, RegelMeta> = {
  eindstrategie: {
    id: 'eindstrategie',
    title: 'Eindstrategie',
    kicker: 'Regel · hele tijdas',
    intro:
      'Wat gebeurt er met je vermogen aan het einde van de rit? Eet je het volledig op, ' +
      'laat je een bedrag na, of houd je je koopkracht eeuwig intact? Deze keuze bepaalt hoeveel ' +
      'je nodig hebt om vrij te zijn — en wanneer.',
    impactKind: 'live-sim',
  },
  onttrekkingsstrategie: {
    id: 'onttrekkingsstrategie',
    title: 'Onttrekkingsstrategie',
    kicker: 'Regel · hele tijdas',
    intro:
      'Hoeveel haal je elk jaar uit je vermogen tijdens je vrije jaren? Een vast bedrag (de 4%-regel), ' +
      'of dynamisch meebewegend met de markt? Dynamische strategieën beschermen je tegen slechte beursjaren, ' +
      'maar maken je jaarlijkse budget minder voorspelbaar.',
    impactKind: 'live-sim',
  },
  onttrekkingsvolgorde: {
    id: 'onttrekkingsvolgorde',
    title: 'Onttrekkingsvolgorde',
    kicker: 'Regel · potten',
    intro:
      'Uit welke pot haal je geld als eerste tijdens de afbouw? De volgorde — cash, beleggingen, ' +
      'pensioen, vastgoed — bepaalt je liquiditeit, hoe lang je rendement blijft renderen, en je Box 3-last.',
    impactKind: 'illustratief',
  },
  'verdeling-toename': {
    id: 'verdeling-toename',
    title: 'Verdeling bij toename',
    kicker: 'Regel · potten',
    intro:
      'Waar gaat extra geld heen — een maandelijks overschot, een bonus of een erfenis? Naar je ' +
      'lange-termijn portfolio (meer rendement), je cash-buffer (meer rust), of het aflossen van schulden.',
    impactKind: 'illustratief',
  },
  'onttrekking-afname': {
    id: 'onttrekking-afname',
    title: 'Onttrekking bij afname',
    kicker: 'Regel · potten',
    intro:
      'Waar haal je geld vandaan bij een grote eenmalige uitgave of een tegenvaller? Eerst uit de ' +
      'liquide pot (beschermt je beleggingen) of proportioneel uit alles (houdt je verdeling in balans).',
    impactKind: 'illustratief',
  },
}

export const REGEL_ORDER: RegelId[] = [
  'eindstrategie',
  'onttrekkingsstrategie',
  'onttrekkingsvolgorde',
  'verdeling-toename',
  'onttrekking-afname',
]
