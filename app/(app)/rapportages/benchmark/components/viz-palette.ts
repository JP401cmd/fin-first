/**
 * Benchmark editorial viz-palette — één gecureerde, VASTE kleurset voor de
 * data-visualisaties in de benchmark-spiegel.
 *
 * Bewust NIET de per-gebruiker module-accentkleur: deze rapportage is een
 * ontworpen redactionele spread (zelfde rationale als TriFinity-krant). Pagina-
 * achtergrond/ink blijven de bestaande tokens (`--paper`, `--ink`, `--ink-2/3/4`,
 * `--border-ed`); deze constante levert enkel de SVG-fills/strokes voor de viz.
 *
 * Spiegelt het `C`-object uit het bron-ontwerp (spiegel-benchmark.html).
 */
export const VIZ = {
  ink: '#1c1814',
  /** peer / gezondheids-ring */
  purple: '#5b4b8a',
  /** peer-marker */
  purpleSoft: '#8b7fb0',
  /** NL-gemiddeld */
  gold: '#c89b3c',
  /** wereld-% + tf-dot */
  accent: '#b5462f',
  brown: '#6b5640',
  muted: '#8a8068',
  line: '#cfc6b2',
  card: '#faf7ee',
} as const
