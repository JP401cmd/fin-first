import Link from 'next/link'

/**
 * ScenarioChip — kleine pill met een gestippelde ink-swatch, die de duidingsblokken
 * (levensinkomenstrook, dekkingsradar) markeert zodra ze de scenario-
 * cijfers tonen i.p.v. de basis. Klik gaat naar het doelscenario-lab in katern Doelen
 * (ADR 0179 fase 1 stap 16, GW3c: het lab staat niet meer op Plan, dus scrollen naar
 * het anker op dezelfde pagina deed niets meer). Puur presentational; de swatch spiegelt de wat-als-lijn in de grafiek
 * (ink-2, dash "6 4"). De tekst volgt dezelfde drieslag als de doellijn-pill
 * (`doelLijnLabel` in horizon-client): vastgelegd doel → "Jouw doel", live wat-als →
 * "Jouw wat-als", alléén een gekozen stopleeftijd → "Jouw stopkeuze".
 *
 * Bewust géén `hasDoelLijn`-koppeling: de grafiek-pill beschrijft wat de grafiek TEKENT
 * (met 0,5-jaar-ruisdrempel en pensioenmodus-onderdrukking, doel-lijn-bron.ts); deze chip
 * beschrijft wat de DUIDING toont — en duidingUnifiedRows gebruikt het stop-pad óók onder
 * die drempel. Trek ze niet "gelijk".
 */

/** Anchor-id van de sectie "Verken je aannames" (slider-lab). */
export const VERKEN_SECTION_ID = 'verken-je-aannames'

export function ScenarioChip({
  className = '',
  doelActief = false,
  hasScenario = true,
}: {
  className?: string
  doelActief?: boolean
  /** Is er een live wat-als (sliders/rendement-delta's)? `false` + geen doel ⇒ de
   *  duiding rekent op alléén een gekozen stopleeftijd → label "Jouw stopkeuze".
   *  Geef 'm bij elke callsite expliciet mee: op de default vertrouwen laat een
   *  stop-only-situatie stilzwijgend "Jouw wat-als" liegen. */
  hasScenario?: boolean
}) {
  const label = doelActief ? 'Jouw doel' : hasScenario ? 'Jouw wat-als' : 'Jouw stopkeuze'

  return (
    <Link
      href={`/toekomst/doelen#${VERKEN_SECTION_ID}`}
      aria-label={
        doelActief
          ? 'Toont je vastgelegde doel — ga naar Jouw doelsituatie'
          : hasScenario
            ? 'Toont je wat-als-scenario — ga naar Verken je aannames'
            : 'Toont je gekozen stopleeftijd — ga naar Verken je aannames'
      }
      className={`inline-flex items-center gap-1.5 rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-0.5 font-mono text-[10px] font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--ink-3)] ${className}`}
    >
      <svg width="20" height="8" viewBox="0 0 20 8" aria-hidden className="shrink-0">
        <line
          x1="0"
          y1="4"
          x2="20"
          y2="4"
          stroke="var(--ink-2)"
          strokeWidth="2"
          strokeDasharray="6 4"
        />
      </svg>
      {label}
    </Link>
  )
}
