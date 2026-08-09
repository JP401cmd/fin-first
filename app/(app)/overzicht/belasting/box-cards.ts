import type { BelastingBoxCard } from '@/components/overview/belasting-box-cards'
import type { LeverageStatus } from '@/lib/leverage-status'

/**
 * Presentatie-model van de box-kaarten op /overzicht/belasting.
 *
 * Puur en synchroon: alle cijfers en statussen komen KANT-EN-KLAAR binnen uit
 * `page.tsx` (die ze op zijn beurt uit `loadFiscaleKansen` / de canonieke Box 3-
 * motor haalt). Hier wordt niets berekend en niets opgehaald — dit bestand
 * bepaalt alléén WELKE kaarten er zijn en hoe ze heten, zodat die regel
 * testbaar is zonder de hele server-pagina met loaders na te bootsen.
 *
 * BEL-1 — de Box 2-kaart verschijnt ALLEEN bij aanmerkelijk belang (alle
 * weergavemodi, dus niet modus-afhankelijk). Voorheen stond er permanent een
 * derde kaart met KPI "—" en de statustekst "Geen aanmerkelijk belang": voor de
 * ~99% niet-DGA's een blijvend leeg vak dat de twee kaarten die er wél toe doen
 * naar de zijkant duwde. De route /overzicht/belasting/box2 blijft gewoon
 * bereikbaar (via de nav en direct); alleen de tegel verdwijnt.
 *
 * De relevantie zelf komt uit `hasBox2Relevance` (lib/box2-relevance.ts) — de
 * ENIGE detectie, gedeeld met /api/household/box2. Dit bestand krijgt die
 * uitkomst als boolean binnen en voegt er geen tweede detectie aan toe.
 */
export type BelastingBoxCardsInput = {
  /** Box 1-heffing per jaar (canoniek uit `loadFiscaleKansen`). null = onbekend. */
  box1Tax: number | null
  box1Status: LeverageStatus
  box1StatusText: string
  /** Box 3-heffing per jaar (perspectief-correct). null = onbekend. */
  box3Tax: number | null
  box3Status: LeverageStatus
  box3StatusText: string | null
  /** Uitkomst van `hasBox2Relevance` — deelneming, DGA-vordering of DGA-schuld. */
  hasAanmerkelijkBelang: boolean
}

export function buildBelastingBoxCards({
  box1Tax,
  box1Status,
  box1StatusText,
  box3Tax,
  box3Status,
  box3StatusText,
  hasAanmerkelijkBelang,
}: BelastingBoxCardsInput): BelastingBoxCard[] {
  return [
    {
      number: '1',
      label: 'Werk + woning',
      href: '/overzicht/belasting/box1',
      tax: box1Tax,
      status: box1Status,
      statusText: box1StatusText,
      subtitle: 'Loon, ondernemerswinst en eigen huis.',
    },
    // BEL-1: geen aanmerkelijk belang → geen kaart. De "Geen aanmerkelijk
    // belang"-statustekst bestaat daarmee niet meer als kaart-inhoud.
    ...(hasAanmerkelijkBelang
      ? ([
          {
            number: '2',
            label: 'Aanmerkelijk belang',
            href: '/overzicht/belasting/box2',
            // Bewust null: de hub rekent Box 2 niet door (per-persoon, eigen
            // berekening). De box2-subpagina toont het echte bedrag.
            tax: null,
            status: 'neutral',
            // Bewust GEEN substatus. Vóór BEL-1 droeg dit veld de enige
            // informatie die de kaart had ("Geen aanmerkelijk belang" vs.
            // "Aanmerkelijk belang"), omdat de kaart er altijd stond. Nu de
            // kaart uitsluitend bij aanmerkelijk belang verschijnt, is haar
            // aanwezigheid zélf het signaal en zou een substatus alleen het
            // label eronder herhalen — dezelfde tekst twee keer op één tegel.
            statusText: null,
            subtitle: 'DGA / aandeelhouder ≥ 5%.',
          },
        ] satisfies BelastingBoxCard[])
      : []),
    {
      number: '3',
      label: 'Sparen + beleggen',
      href: '/overzicht/belasting/box3',
      tax: box3Tax,
      status: box3Status,
      statusText: box3StatusText,
      subtitle: 'Cash, beleggingen en crypto — forfaitair.',
    },
  ]
}
