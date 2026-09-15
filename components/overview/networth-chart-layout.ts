/**
 * Gedeelde layout-recepten voor de netto-vermogen-grafiekcel op /overzicht:
 * de volle grafiek (`MiniNetWorthChart`) én de Suspense-fallback
 * (`MiniNetWorthChartAnchor`) lezen dezelfde classes, zodat de swap trap 1 →
 * trap 2 geen layout-shift geeft. Eén bron, geen twee kopieën die uit elkaar
 * lopen.
 *
 * ── HET GRID ────────────────────────────────────────────────────────────────
 * Alles is een DIRECT grid-item van één wrapper met drie kolommen. Omdat de
 * tekstblokken, de twee grafiekdelen en de legenda in hetzelfde grid staan,
 * delen ze automatisch hun rijen: de grafiekrij begint in beide kaarten op
 * exact dezelfde hoogte en is exact even hoog — dáárdoor valt de lijn aan beide
 * kanten van de naad op dezelfde y, zonder te meten.
 *
 *  - <lg: één kaart (de wrapper draagt rand + papier). Rij 1 = verleden-tekst,
 *    rij 2 = toekomst-tekst (beide volle breedte: 1/3 van 400px is te smal voor
 *    bedragen), rij 3 = grafiek (verleden 1 kolom = 1/3, toekomst 2 kolommen =
 *    2/3, gap 0 → de twee svg's sluiten naadloos), rij 4 = legenda.
 *  - lg+: twee kaarten. De wrapper verliest rand/papier; de twee klikdoelen
 *    (knop links, link rechts) spannen elk hun kolommen over alle drie de rijen
 *    en dragen zelf rand + papier. `gap-x-3` (12px) is gelijk aan de gap van de
 *    hefbomen-rij (`sm:gap-3`) en van de hero-rij (`lg:gap-3`) in
 *    `overzicht-hero.tsx`: dezelfde `<section>`-breedte, dezelfde vier kolommen,
 *    dus de kaartranden lopen pixel-gelijk met Bezittingen | Schulden | Budget |
 *    Belasting en de naad valt op de grens Schulden | Budget.
 *
 * ── DE NAAD ─────────────────────────────────────────────────────────────────
 * `--nw-seam-gap` is de breedte van de tussenruimte (0 op mobiel, 0.75rem op
 * lg). De Vandaag-stip, de verticale naadlijn en de brug over de gap zijn
 * HTML-elementen in het toekomst-grafiekdeel met `left: calc(var(--nw-seam-gap)
 * / -2)`: op mobiel precies op de 1/3-grens, op lg precies midden in de gap —
 * op élke breedte, want de positie komt uit CSS en niet uit een vaste fractie
 * van een `preserveAspectRatio="none"`-viewBox.
 */

export const NW_SEAM_LEFT = 'calc(var(--nw-seam-gap) / -2)'

// PLAATSING: elk item zet `grid-column` én `grid-row` in één keer via de
// shorthand (`col-[1/span_3]`, `row-[1/span_3]`). Combinaties als
// `row-start-1 lg:row-span-3` botsen: `row-span-*` is zelf een `grid-row`-
// shorthand en wist de start, waarna het item auto-geplaatst wordt.
export const NW_LAYOUT = {
  wrapper:
    'relative grid h-full grid-cols-3 grid-rows-[auto_auto_minmax(170px,1fr)_auto] rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 sm:p-4 [--nw-seam-gap:0px] lg:grid-rows-[auto_minmax(250px,1fr)_auto] lg:gap-x-3 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:[--nw-seam-gap:0.75rem]',
  /** Klikdoel/frame verleden. <lg: tik-zone over rij 1; lg: de hele linkerkaart. */
  pastFrame:
    'relative z-0 col-[1/span_3] row-[1/span_1] -m-1 block rounded-lg text-left lg:m-0 lg:col-[1/span_1] lg:row-[1/span_3] lg:rounded-2xl lg:border lg:border-[var(--border-ed)] lg:bg-[var(--paper)]',
  /** Klikdoel/frame toekomst. <lg: tik-zone over rij 2; lg: de hele rechterkaart. */
  futureFrame:
    'relative z-0 col-[1/span_3] row-[2/span_1] -mx-1 -mb-1 mt-2 block rounded-lg lg:m-0 lg:col-[2/span_2] lg:row-[1/span_3] lg:rounded-2xl lg:border lg:border-[var(--border-ed)] lg:bg-[var(--paper)]',
  /** Hover/focus-affordance voor een interactief frame — zelfde familie als de hefboomkaarten. */
  frameInteractive:
    'cursor-pointer transition-all hover:bg-[var(--subtle)]/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] lg:hover:bg-[var(--paper)] lg:hover:border-[var(--ink-3)] lg:hover:shadow-sm',
  pastText:
    'pointer-events-none relative z-10 col-[1/span_3] row-[1/span_1] min-w-0 lg:col-[1/span_1] lg:px-4 lg:pt-4',
  futureText:
    'pointer-events-none relative z-10 col-[1/span_3] row-[2/span_1] mt-3 min-w-0 border-t border-[var(--rule-soft)] pt-3 lg:col-[2/span_2] lg:row-[1/span_1] lg:mt-0 lg:border-0 lg:px-4 lg:pt-4',
  /**
   * Bedragen + dekking onder de toekomst-kop. Reserveert twee regels in trap 1
   * én trap 2, zodat een vast stopanker ("dekt Y%") of een omslaande
   * incl./excl.-regel de grafiekrij niet laat verspringen bij de swap.
   */
  futureMeta: 'mt-1 min-h-[2.25rem]',
  pastPlot:
    'pointer-events-none relative z-10 col-[1/span_1] row-[3/span_1] mt-3 lg:row-[2/span_1] lg:mt-2',
  futurePlot:
    'pointer-events-none relative z-10 col-[2/span_2] row-[3/span_1] mt-3 lg:row-[2/span_1] lg:mt-2',
  /** Mobiele tik-zones over de twee grafiekdelen (aria-hidden duplicaten van de frames). */
  pastPlotZone:
    'relative z-20 col-[1/span_1] row-[3/span_1] mt-3 block cursor-pointer transition-colors hover:bg-[var(--subtle)]/50 lg:hidden',
  futurePlotZone:
    'relative z-20 col-[2/span_2] row-[3/span_1] mt-3 block cursor-pointer transition-colors hover:bg-[var(--subtle)]/50 lg:hidden',
  legend:
    'relative z-10 col-[1/span_3] row-[4/span_1] mt-2 min-h-[16px] lg:pointer-events-none lg:col-[2/span_2] lg:row-[3/span_1] lg:mt-1 lg:px-4 lg:pb-3',
  /** Tekenvlak binnen een grafiekdeel: vrij van de 16px-labelstrook onderin. */
  drawing: 'absolute inset-x-0 top-0 bottom-4',
  kicker: 'text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]',
} as const

/** viewBox-eenheden (0..100 in beide assen) — gedeeld door grafiek en anker. */
export const NW_PLOT = {
  /** Ruimte bovenin het tekenvlak voor het eindmarker-label. */
  PAD_TOP: 14,
  /** De x-as-vloer (net boven de onderrand zodat de basislijn niet half wegvalt). */
  FLOOR: 98,
  /** Linkermarge van het verleden-deel (oudste punt). */
  PAST_PAD_LEFT: 5,
  /** Rechtermarge van het toekomst-deel (eindmarker). */
  FUTURE_PAD_RIGHT: 4,
} as const
