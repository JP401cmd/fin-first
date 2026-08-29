'use client'

/**
 * Statische SVG-lagen van `SimChart` (grid → assen → doellijnen → projectie-
 * paden → Monte-Carlo-band → event-markers).
 *
 * Deze laag is HOVER-ONAFHANKELIJK: alle geometrie komt uit één voorberekend
 * `geometry`-object (zie `lib/horizon/sim-chart-geometry.ts`). Wanneer de
 * gebruiker over de grafiek beweegt re-rendert de parent (interne `hoveredAge`-
 * state), maar deze `React.memo`-child krijgt referentieel gelijke props en
 * bailt — alleen de losse crosshair-laag re-rendert dan. `hasEntered` (intreek-
 * animatie) en `emphasis` (walkthrough-dimming) zijn RENDER-props: als ze
 * wijzigen re-rendert deze laag éénmalig mee, zodat animatie en dimming intact
 * blijven.
 *
 * `ChartStaticLayersInner` (de ongememoiseerde functie) is apart geëxporteerd
 * zodat de render-teller-test 'm in een eigen memo-wrapper kan tellen.
 */
import { memo } from 'react'
import { ChartEventMarkers } from './chart-event-markers'
import type { ChartEventOverlay, ChartEventKind } from '@/lib/chart-event-overlay'
import type { SimChartGeometry } from '@/lib/horizon/sim-chart-geometry'

export type ChartStaticLayersProps = {
  geometry: SimChartGeometry
  hasEntered: boolean
  /** Bedragmaskering (ADR 0091). Komt uit `useMaskedAmounts()` in `SimChart` en
   *  reist als gewone prop hierheen, zodat de `React.memo`-vergelijking 'm
   *  meeneemt (geen stale maskering na een flip van de privacy-toggle).
   *  Geometrie blijft onder maskering identiek; alleen euro-LABELS verdwijnen. */
  masked: boolean
  emphasis: 'accumulation' | 'withdrawal' | 'fire' | null
  baselineEmphasis: 'ghost' | 'compare'
  showDepletionWarning?: boolean
  /** Wat-als-run loopt achter op de live input → de scenario-lijn wordt gedempt met puls. */
  scenarioPending?: boolean
  eventOverlay?: ChartEventOverlay[]
  onEventClick?: (id: string, kind: ChartEventKind, sourceId?: string) => void
  onEventDragEnd?: (
    id: string,
    sourceId: string | undefined,
    newAge: number,
    kind: ChartEventKind,
  ) => void
  onEventDragMove?: (
    id: string,
    sourceId: string | undefined,
    newAge: number,
    kind: ChartEventKind,
  ) => void
  /** M16 — doorgegeven aan ChartEventMarkers: opent de lijst achter een
   *  "+N"-clusterbadge. Zie `ChartEventMarkers.onClusterOpen`. */
  onClusterOpen?: (events: ChartEventOverlay[], centerAge: number) => void
}

/** Dim-contrast voor niet-benadrukte segmenten (uitleg-walkthrough). Bewust
 *  0.30 (niet lager): de gedimde segmenten blijven leesbaar zodat het verschil
 *  niet puur op kleur/contrast leunt (a11y). */
const DIMMED = 0.30

/** Bedrag-notatie van het erfenis-/koopkracht-doellijnLABEL: miljoenen met één
 *  decimaal, anders hele duizendtallen.
 *
 *  Bewust één functie voor het eindlabel én het "€… nu"-sublabel: de "toont de
 *  tweede regel hetzelfde getal?"-vraag hoort op het niveau te lopen waarop de
 *  gebruiker het verschil ziet — de GETOONDE tekst, niet de rauwe waarde.
 *  (De horizontale FIRE-doellijnen hierboven hebben hun eigen, fijnere
 *  M-notatie met twee decimalen en horen bewust niet bij dit paar.) */
function targetAmountLabel(val: number): string {
  return val >= 1_000_000
    ? `€${(val / 1_000_000).toFixed(1)}M`
    : `€${Math.round(val / 1000)}k`
}

export function ChartStaticLayersInner({
  geometry,
  hasEntered,
  masked,
  emphasis,
  baselineEmphasis,
  showDepletionWarning,
  scenarioPending,
  eventOverlay,
  onEventClick,
  onEventDragEnd,
  onEventDragMove,
  onClusterOpen,
}: ChartStaticLayersProps) {
  const {
    PAD,
    innerW,
    innerH,
    H,
    minAge,
    maxAge,
    xScale,
    yScale,
    lineYAt,
    yTicks,
    xTickAges,
    yZero,
    isPensioenMode,
    fireTarget,
    fireTargetInclHome,
    strategy,
    targetEndPortfolio,
    targetLine,
    labelSafeTopY,
    xFire,
    fireAgeFractional,
    aowAgeFractional,
    aowFractionalPt,
    COLOR_OPBOUW,
    mainStrokeAcc,
    mainStrokeDec,
    bridgeStroke,
    secondaryStroke,
    baselinePath,
    accPath,
    decPath,
    bridgePath,
    withdrawalPath,
    primaryBasis,
    secondaryPath,
    secondaryBasis,
    allPath,
    scenarioPaths,
    householdPaths,
    mcPaths,
    depletion,
    iconClampTopY,
  } = geometry

  /**
   * Baseline-y van de EERSTE regel van een doellijn-label.
   *
   * De labels staan sinds M16 op 11px (waren 8 en 7,5px — onleesbaar op
   * mobiel). Twee dingen volgen daaruit:
   *
   *  - de regelafstand moest mee van 8 naar 13px, anders lopen de woordregel en
   *    de bedragregel door elkaar heen. De bedragregel is daarom `+ 13`;
   *  - grotere letters steken verder boven de lijn uit. Ligt de doellijn hoog in
   *    het plot, dan zou het label door de SVG-bovenrand zakken. De clamp op
   *    `PAD.top + 11` houdt de bovenste regel binnen beeld; het label schuift dan
   *    ten opzichte van zijn eigen lijn in plaats van weg te vallen.
   *
   * Onder maskering is er maar één regel (het bedrag vervalt), dus die staat
   * dichter op de lijn.
   */
  function targetLabelY(yInPlot: number, isMasked: boolean): number {
    return Math.max(PAD.top + 11, PAD.top + yInPlot - (isMasked ? 5 : 15))
  }

  // Emphasis-afgeleide render-waarden (uitleg-walkthrough). Geen geometrie —
  // daarom hier, niet in de gememoiseerde geometry.
  const accOpacity = emphasis === null || emphasis === 'accumulation' || emphasis === 'fire' ? 1 : DIMMED
  const decOpacity = emphasis === null || emphasis === 'withdrawal' ? 1 : DIMMED

  // Elke drempel hoort bij precies één GETEKENDE lijn — en sinds de primaire
  // lijn per woonstrategie van grondslag kan wisselen (ADR 0114) volgt die regel
  // uit de grondslagen die daadwerkelijk op het scherm staan, niet meer uit "is
  // er een besteedbaar-lijn".
  //
  // Welke grondslagen liggen er? De primaire lijn draagt `primaryBasis`, de
  // dunne tweede lijn `secondaryBasis` (null = geen tweede lijn).
  const heeftLiquideLijn = primaryBasis === 'liquid' || secondaryBasis === 'liquid'
  const heeftTotaalLijn = primaryBasis === 'total' || secondaryBasis === 'total'
  // De liquide drempel (`fireTarget` = requiredFirePortfolio, Prognose!J) hoort
  // bij een J-lijn. Staat die er niet, dan hoort de drempel bij geen enkele
  // getekende lijn en geeft hij alleen ruis — dan valt hij weg ten gunste van de
  // incl.-woningdrempel (`fireTargetInclHome`, Prognose!I). Onderdrukken we hem
  // wél terwijl er een J-lijn ligt, dan vergelijkt de gebruiker die lijn met de
  // enige zichtbare drempel (I) — precies de grondslagvermenging die CLAUDE.md
  // verbiedt, nu op de marker in plaats van op de as.
  const showExclTargetLine =
    fireTargetInclHome == null || fireTargetInclHome <= 0 || heeftLiquideLijn
  // Spiegelbeeld: de I-drempel hoort bij een I-lijn. Zonder totaallijn (de
  // "Uitsluiten"-modus met de tweede lijn uit) zou hij zwevend boven een
  // J-grafiek blijven hangen.
  const showInclTargetLine = heeftTotaalLijn
  // Zodra er twee lijnen op twee grondslagen staan is "doel" te vaag: benoem
  // expliciet bij welke lijn de drempel hoort, in hetzelfde woordpaar als de
  // legenda, de tooltip en de doel-KPI's ("met je huis" / "zonder je huis").
  // Eén lijn ⇒ één grondslag ⇒ het korte "doel" blijft.
  const toonBeideGrondslagen = secondaryBasis != null
  const exclTargetLabel = toonBeideGrondslagen ? 'doel zonder je huis' : 'doel'

  // Labelpaar van de meegroeiende erfenis/koopkracht-doellijn: het eindlabel
  // (nominale waarde op de laatste zichtbare leeftijd) en het "€… nu"-sublabel
  // (hetzelfde doel in geld van vandaag). Beide door dezelfde formatter, zodat
  // de onderdrukkingsconditie hieronder op de getoonde tekst kan vergelijken.
  const targetEndLabel = targetLine ? targetAmountLabel(targetLine.labelVal) : null
  const targetNowLabel = targetLine ? targetAmountLabel(targetLine.realTargetNow) : null

  return (
    <>
      {/* Grid lines */}
      {yTicks.map(({ val, y }) => (
        <line key={val} x1={PAD.left} x2={PAD.left + innerW} y1={y} y2={y}
          stroke="var(--border-ed)" strokeWidth={1} strokeDasharray="4 4" />
      ))}

      {/* Y-axis labels — onder maskering VOLLEDIG weg (ADR 0091: "bullets op een
          as zijn ruis, geen informatie"). De gridlijnen hierboven blijven staan,
          dus de verhoudingen in de grafiek blijven leesbaar; alleen de bedragen
          bij de as verdwijnen.

          fontSize 11 is de ondergrens uit bevinding M16 (was 9, op mobiel
          onleesbaar). Past binnen PAD.left (60) omdat het label rechts uitlijnt
          op PAD.left − 5: "€1.1M" is ~40px breed. */}
      {!masked && yTicks.map(({ val, y }) => (
        <text key={val} x={PAD.left - 5} y={y + 4} textAnchor="end" fontSize={11}
          fill="var(--ink-4)" fontFamily="var(--font-dm-mono, monospace)">
          {val >= 1_000_000
            ? `€${(val / 1_000_000).toFixed(1)}M`
            : val >= 1_000
            ? `€${Math.round(val / 1_000)}k`
            : val > 0 ? `€${Math.round(val)}` : '€0'}
        </text>
      ))}

      {/* X-axis labels — fontSize 11 (M16). De baseline op H − 4 laat binnen
          PAD.bottom (28) ruim genoeg staan voor de grotere letter. */}
      {xTickAges.map(age => (
        <text key={age} x={PAD.left + xScale(age)} y={H - 4} textAnchor="middle" fontSize={11}
          fill="var(--ink-4)" fontFamily="var(--font-dm-mono, monospace)">{age}</text>
      ))}

      {/* FIRE doelbedrag (liquide/besteedbaar, Prognose!J) — horizontale dashed
          lijn (hidden in pensioen mode). Verschijnt zodra er géén incl.-woning-
          drempel is, óf zodra de besteedbaar-lijn getekend wordt: die lijn heeft
          deze drempel nodig (zie `showExclTargetLine` hierboven). */}
      {!isPensioenMode && showExclTargetLine && fireTarget != null && fireTarget > 0 && (
        <>
          <line
            x1={PAD.left} x2={PAD.left + innerW}
            y1={PAD.top + yScale(fireTarget)} y2={PAD.top + yScale(fireTarget)}
            stroke="var(--hor-t, #8a6e42)" strokeWidth={1.5} strokeDasharray="6 3" opacity={0.6}
          />
          {/* Woordlabel blijft altijd staan (de lijn moet benoembaar blijven);
              onder maskering schuift 'ie in het lege bedrag-slot zodat er geen
              zwevend label boven de lijn hangt. */}
          {/* Doellabel — twee regels op 11px (M16: was 8 / 7,5px). De
              regelafstand groeide mee van 8 naar 13px, anders overlappen de
              letters elkaar: woordregel op −15, bedragregel op −2. */}
          <text
            x={PAD.left + innerW - 2} y={targetLabelY(yScale(fireTarget), masked)}
            fontSize={11} fill="var(--hor-t, #8a6e42)" textAnchor="end"
            fontFamily="var(--font-inter, sans-serif)" fontWeight={600}
          >
            {exclTargetLabel}
          </text>
          {!masked && (
            <text
              x={PAD.left + innerW - 2} y={targetLabelY(yScale(fireTarget), masked) + 13}
              fontSize={11} fill="var(--hor-t, #8a6e42)" textAnchor="end"
              fontFamily="var(--font-dm-mono, monospace)"
            >
              {fireTarget >= 1_000_000
                ? `€${(fireTarget / 1_000_000).toFixed(2)}M`
                : `€${Math.round(fireTarget / 1000)}k`}
            </text>
          )}
        </>
      )}

      {/* FIRE-doel op de incl.-woning-grondslag (requiredFireNetWorth). Zelfde
          stijl als de gewone doellijn; valt bij FIRE samen met de totaallijn.
          Alleen zolang er ook echt een I-lijn ligt (`showInclTargetLine`) — bij
          "Uitsluiten" met de totaallijn uit hoort deze drempel bij niets meer.
          Zonder `fireTargetInclHome` (geen dubbele grondslag) → geen lijn. */}
      {!isPensioenMode && showInclTargetLine && fireTargetInclHome != null && fireTargetInclHome > 0 && (
        <>
          <line
            x1={PAD.left} x2={PAD.left + innerW}
            y1={PAD.top + yScale(fireTargetInclHome)} y2={PAD.top + yScale(fireTargetInclHome)}
            stroke="var(--hor-t, #8a6e42)" strokeWidth={1.5} strokeDasharray="6 3" opacity={0.6}
          />
          {/* Zelfde 11px-typografie en regelafstand als de doellijn hierboven. */}
          <text
            x={PAD.left + innerW - 2} y={targetLabelY(yScale(fireTargetInclHome), masked)}
            fontSize={11} fill="var(--hor-t, #8a6e42)" textAnchor="end"
            fontFamily="var(--font-inter, sans-serif)" fontWeight={600}
          >
            doel met je huis
          </text>
          {!masked && (
            <text
              x={PAD.left + innerW - 2} y={targetLabelY(yScale(fireTargetInclHome), masked) + 13}
              fontSize={11} fill="var(--hor-t, #8a6e42)" textAnchor="end"
              fontFamily="var(--font-dm-mono, monospace)"
            >
              {fireTargetInclHome >= 1_000_000
                ? `€${(fireTargetInclHome / 1_000_000).toFixed(2)}M`
                : `€${Math.round(fireTargetInclHome / 1000)}k`}
            </text>
          )}
        </>
      )}

      {/* Legacy/Perpetual target — doellijn (hidden in pensioen mode).
          Met inflatie-factoren tekenen we de OPLOPENDE lijn (reëel doel-van-nu →
          nominale eindwaarde); zonder factoren valt 'ie terug op een vlakke lijn. */}
      {!isPensioenMode && (strategy === 'legacy' || strategy === 'perpetual') && targetEndPortfolio != null && targetEndPortfolio > 0 && (
        targetLine ? (
          <>
            <path
              d={targetLine.d}
              fill="none"
              stroke="var(--kern-t, #58362d)" strokeWidth={1.5} strokeDasharray="6 3" opacity={0.6}
              strokeLinecap="round" strokeLinejoin="round"
            />
            <text
              x={Math.max(PAD.left + 44, PAD.left + xScale(targetLine.labelAge) - 2)} y={Math.max(labelSafeTopY + 8, PAD.top + yScale(targetLine.labelVal) - 12)}
              fontSize={8} fill="var(--kern-t, #58362d)" textAnchor="end"
              fontFamily="var(--font-inter, sans-serif)" fontWeight={600}
            >
              {/* Woordlabel blijft, bedrag verdwijnt onder maskering. */}
              {strategy === 'perpetual' ? 'koopkracht' : 'erfenis'}{masked ? '' : ` ${targetEndLabel}`}
            </text>
            {/* Het "€… nu"-sublabel vertelt wat de nominale eindwaarde in geld
                van vandaag is. Twee gevallen waarin het niets toevoegt:
                  · maskering aan → het is een bedrag, dus het verdwijnt;
                  · het sublabel zou LETTERLIJK dezelfde tekst tonen als het
                    eindlabel erboven → een tweede "nu"-regel met exact hetzelfde
                    getal is ruis.
                De conditie loopt op de GETOONDE tekst, niet op de rauwe waarde:
                dat is precies wat de regel hierboven belooft, en €201.400 en
                €201.000 lezen allebei als "€201k". Bewust géén view-prop: zo
                blijft dit component euro-weergave-onwetend en verandert
                `SimChartProps` niet.

                BEWUSTE UITZONDERING — 0% inflatie. In huidige euro's levert de
                aanroeper een unit-factorlijst bij een al gedeflateerd doel (N2b),
                dus labelVal === realTargetNow en het sublabel valt weg. Een
                wat-als met inflatie 0% in TOEKOMSTIGE euro's levert exact
                dezelfde invoer (`inflationFactor = (1+0)^k = 1`, zie
                `lib/horizon-kernel/bridge.ts`) en dus ook geen sublabel. Dat
                onderscheid is per constructie niet te maken zonder de weergave
                hierheen te lekken — en het is inhoudelijk juist: zónder inflatie
                ís de eindwaarde het bedrag-van-nu, dus een tweede regel met
                hetzelfde getal voegt ook daar niets toe. */}
            {!masked && targetNowLabel !== targetEndLabel && (
              <text
                x={Math.max(PAD.left + 44, PAD.left + xScale(targetLine.labelAge) - 2)} y={Math.max(labelSafeTopY + 16, PAD.top + yScale(targetLine.labelVal) - 4)}
                fontSize={7} fill="var(--kern-t, #58362d)" textAnchor="end"
                fontFamily="var(--font-dm-mono, monospace)" opacity={0.85}
              >
                {`${targetNowLabel} nu`}
              </text>
            )}
          </>
        ) : (
          <>
            <line
              x1={PAD.left} x2={PAD.left + innerW}
              y1={PAD.top + yScale(targetEndPortfolio)} y2={PAD.top + yScale(targetEndPortfolio)}
              stroke="var(--kern-t, #58362d)" strokeWidth={1.5} strokeDasharray="6 3" opacity={0.6}
            />
            <text
              x={PAD.left + innerW - 2} y={PAD.top + yScale(targetEndPortfolio) - 4}
              fontSize={8} fill="var(--kern-t, #58362d)" textAnchor="end"
              fontFamily="var(--font-inter, sans-serif)" fontWeight={600}
            >
              {/* Zelfde labelfamilie als de meegroeiende variant hierboven —
                  dezelfde formatter, dus letterlijk dezelfde tekst. */}
              {strategy === 'perpetual' ? 'koopkracht' : 'erfenis'}{masked ? '' : ` ${targetAmountLabel(targetEndPortfolio)}`}
            </text>
          </>
        )
      )}

      {/* Zero baseline */}
      <line x1={PAD.left} x2={PAD.left + innerW} y1={yZero} y2={yZero}
        stroke="var(--border-md)" strokeWidth={1.5} />

      {/* Depletion zone — red tint when portfolio hits zero (AOW-stop mode) */}
      {showDepletionWarning && depletion && (
        <>
          <rect x={depletion.x1} y={PAD.top} width={Math.max(0, depletion.x2 - depletion.x1)} height={innerH}
            fill="var(--negative)" opacity={0.06} />
          <text x={depletion.x1 + 4} y={PAD.top + 14} fontSize={8}
            fill="var(--negative)" fontWeight={600}
            fontFamily="var(--font-inter, sans-serif)">
            Vermogen op
          </text>
        </>
      )}

      {/* FIRE dashed vertical (hidden in pensioen mode) */}
      {!isPensioenMode && xFire !== null && fireAgeFractional !== null && fireAgeFractional > minAge && fireAgeFractional < maxAge && (
        <line x1={xFire} x2={xFire} y1={PAD.top} y2={PAD.top + innerH}
          stroke={COLOR_OPBOUW} strokeWidth={1.5} strokeDasharray="4 2" opacity={0.85} />
      )}

      {/* AOW pensioenleeftijd dashed vertical (promoted in pensioen mode) */}
      {aowAgeFractional != null && aowAgeFractional > minAge && aowAgeFractional < maxAge && (
        <>
          <line
            x1={PAD.left + xScale(aowAgeFractional)}
            x2={PAD.left + xScale(aowAgeFractional)}
            y1={PAD.top} y2={PAD.top + innerH}
            stroke={isPensioenMode ? COLOR_OPBOUW : "var(--ink-3, #8a8680)"}
            strokeWidth={isPensioenMode ? 1.8 : 1.2}
            strokeDasharray={isPensioenMode ? "4 2" : "3 3"}
            opacity={isPensioenMode ? 0.85 : 0.6}
          />
          <text
            x={PAD.left + xScale(aowAgeFractional) - 4}
            y={PAD.top + 14}
            textAnchor="end"
            fontSize={8}
            fill="var(--ink-3, #8a8680)"
            fontFamily="var(--font-inter, sans-serif)"
            fontWeight={600}
          >
            AOW
          </text>
          <text
            x={PAD.left + xScale(aowAgeFractional) - 4}
            y={PAD.top + 23}
            textAnchor="end"
            fontSize={7}
            fill="var(--ink-4, #bbb8b0)"
            fontFamily="var(--font-dm-mono, monospace)"
          >
            {aowAgeFractional % 1 === 0
              ? `${aowAgeFractional}`
              : `${Math.floor(aowAgeFractional)}+${Math.round((aowAgeFractional % 1) * 12)}m`}
          </text>
          {/* AOW dot at junction point (pensioen mode only) */}
          {isPensioenMode && aowFractionalPt !== null && (
            <circle
              cx={PAD.left + xScale(aowFractionalPt[0])}
              cy={PAD.top + yScale(Math.max(aowFractionalPt[1], 0))}
              r={5}
              fill={COLOR_OPBOUW}
              stroke="var(--paper)"
              strokeWidth={1.5}
            />
          )}
        </>
      )}

      {/* Baseline reference line (what-if mode) — emphasis switches between
          faint ghost (no preset active) and solid compare (preset active). */}
      {baselinePath && (
        <path
          d={baselinePath}
          fill="none"
          stroke={baselineEmphasis === 'compare'
            ? 'var(--color-horizon-700, #8a6e42)'
            : 'var(--ink-4, #bbb8b0)'}
          strokeWidth={baselineEmphasis === 'compare' ? 2 : 2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={hasEntered ? 0 : 1}
          opacity={baselineEmphasis === 'compare' ? 0.85 : 0.55}
          style={{ transition: hasEntered ? 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)' : 'none' }}
        />
      )}

      {/* Monte Carlo gradient confidence band */}
      {mcPaths && (
        <g style={{
          opacity: hasEntered ? 1 : 0,
          transition: hasEntered ? 'opacity 0.8s ease 0.2s' : 'none',
        }}>
          {/* SVG gradient definition for confidence band fade */}
          <defs>
            <linearGradient id="mc-band-gradient-v" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-horizon-600, #a07840)" stopOpacity="0" />
              <stop offset="35%" stopColor="var(--color-horizon-600, #a07840)" stopOpacity="0.18" />
              <stop offset="50%" stopColor="var(--color-horizon-600, #a07840)" stopOpacity="0.25" />
              <stop offset="65%" stopColor="var(--color-horizon-600, #a07840)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--color-horizon-600, #a07840)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="mc-band-gradient-h" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--color-horizon-600, #a07840)" stopOpacity="0.8" />
              <stop offset="100%" stopColor="var(--color-horizon-600, #a07840)" stopOpacity="0.4" />
            </linearGradient>
          </defs>
          {/* Zichtbare band: p25–p75. p10–p90 wordt bewust NIET meer getekend —
              die rand drukte de plan-lijn tot ~9% van de ashoogte plat. De
              legenda en de Y-as (sim-chart-geometry: mcMax op p75) volgen dit. */}
          {mcPaths.band && (
            <path d={mcPaths.band} fill="url(#mc-band-gradient-v)" opacity={0.75} />
          )}
          {/* p35–p65 — dichter bij de mediaan, puur voor het verloop */}
          {mcPaths.bandKern && (
            <path d={mcPaths.bandKern} fill="var(--color-horizon-600, #a07840)" opacity={0.1} />
          )}
          {/* Median line: p50 — clear solid line */}
          {mcPaths.median && (
            <path d={mcPaths.median} fill="none"
              stroke="var(--color-horizon-600, #a07840)" strokeWidth={1.8}
              strokeLinecap="round" strokeLinejoin="round" opacity={0.7}
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={hasEntered ? 0 : 1}
              style={{ transition: hasEntered ? 'stroke-dashoffset 1s cubic-bezier(.22,1,.36,1) 0.3s' : 'none' }}
            />
          )}
        </g>
      )}

      {/* Scenario overlay paths (behind main line) */}
      {scenarioPaths.map((s, i) => {
        if (!s.d) return null
        // Live "wat-als"-lijn: bewust in inkt (geen module-accent/stoplicht),
        // zwaarder gestippeld dan de ghost-lijnen, met een FIRE-stip als
        // gestippelde ink-ring op de scenario-FIRE-leeftijd.
        // Reveal via opacity-fade i.p.v. het canonieke pathLength/strokeDasharray="1"-
        // reveal: dat kan niet samengaan met de zichtbare "6 4"-dash (één
        // strokeDasharray-attribuut kan niet én de reveal-lengte én het streepje zijn).
        if (s.variant === 'scenario') {
          return (
            <g key={s.name} className={scenarioPending && hasEntered ? 'animate-scenario-pending' : undefined}>
              <path
                d={s.d}
                fill="none"
                stroke="var(--ink-2)"
                strokeWidth={2.25}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="6 4"
                opacity={hasEntered ? 0.85 : 0}
                style={{ transition: hasEntered ? 'opacity 0.6s ease 0.3s' : 'none' }}
              />
              {s.fireDot && (
                <circle
                  cx={s.fireDot.cx}
                  cy={s.fireDot.cy}
                  r={4}
                  fill="var(--paper)"
                  stroke="var(--ink-2)"
                  strokeWidth={1.5}
                  strokeDasharray="2 1.5"
                  opacity={hasEntered ? 0.85 : 0}
                  style={{ transition: 'opacity 0.4s ease 0.9s' }}
                />
              )}
            </g>
          )
        }
        // Bestaand ghost-renderpad (saved scenario's) — letterlijk ongewijzigd.
        return (
          <path
            key={s.name}
            d={s.d}
            fill="none"
            stroke={s.color}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.45}
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={hasEntered ? 0 : 1}
            style={{ transition: hasEntered ? `stroke-dashoffset 1s cubic-bezier(.22,1,.36,1) ${0.3 + i * 0.1}s` : 'none' }}
          />
        )
      })}

      {/* Household partner overlay paths */}
      {householdPaths.map((hp, i) =>
        hp.d && (
          <g key={`hh-${hp.name}`}>
            <path
              d={hp.d}
              fill="none"
              stroke={hp.color}
              strokeWidth={hp.isDashed ? 2 : 1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={hp.isDashed ? '6 4' : 'none'}
              opacity={hp.isDashed ? 0.7 : 0.55}
              pathLength={1}
              style={{
                strokeDashoffset: hasEntered ? 0 : (hp.isDashed ? 0 : 1),
                transition: hasEntered ? `stroke-dashoffset 1s cubic-bezier(.22,1,.36,1) ${0.2 + i * 0.15}s` : 'none',
                ...(hp.isDashed ? {} : { strokeDasharray: '1', strokeDashoffset: hasEntered ? 0 : 1 }),
              }}
            />
            {/* Partner/gezamenlijk FIRE-punt — op de fractionele leeftijd zodat
                de stip exact op de lijn valt (geïnterpoleerde y), net als de hoofdlijn. */}
            {hp.fireDot && (
              <circle
                cx={hp.fireDot.cx}
                cy={hp.fireDot.cy}
                r={3}
                fill={hp.color}
                opacity={hasEntered ? 0.8 : 0}
                style={{ transition: 'opacity 0.4s ease 1s' }}
              />
            )}
          </g>
        )
      )}

      {/* De tweede grondslag — bij "Uitsluiten" de totaallijn (mét huis), anders
          het besteedbare vermogen (zonder huis). Welke van de twee zegt
          `secondaryBasis`; de vórm is in beide richtingen dezelfde, want de
          betekenis van deze lijn is "de andere grondslag".
          Bewust ACHTER de primaire lijn en dunner/gestippeld: de fasegekleurde
          lijn blijft de dominante.
          GESTIPPELD ("2 3"), niet gestreept: de horizontale doellijnen zijn óók
          bruin-gestreept ("6 3") en deze lijn loopt op het post-FIRE-plateau
          vlak, dus vlak langs die drempels. Een punt-ritme leest daar
          onmiskenbaar anders dan een streep-ritme, óók zonder kleurwaarneming.
          Reveal via opacity-fade i.p.v. het canonieke pathLength/strokeDasharray="1"-
          reveal: één strokeDasharray-attribuut kan niet én de reveal-lengte én het
          zichtbare stipje zijn (zelfde reden als de wat-als-lijn hierboven). */}
      {secondaryPath && (
        <path
          d={secondaryPath}
          fill="none"
          stroke={secondaryStroke}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="2 3"
          opacity={hasEntered ? 0.9 : 0}
          style={{ transition: hasEntered ? 'opacity 0.6s ease 0.3s' : 'none' }}
        />
      )}

      {/* Accumulation path — horizon goud */}
      {accPath && (
        <path
          d={accPath}
          fill="none"
          stroke={mainStrokeAcc}
          strokeWidth={emphasis === 'accumulation' ? 3.25 : 2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={hasEntered ? 0 : 1}
          opacity={accOpacity}
          style={{ transition: hasEntered ? 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1), opacity 0.4s ease' : 'opacity 0.4s ease' }}
        />
      )}

      {/* Decumulation path — kern bruin (or horizon goud for perpetual in fire mode) */}
      {decPath && (
        <path
          d={decPath}
          fill="none"
          stroke={mainStrokeDec}
          strokeWidth={emphasis === 'withdrawal' ? 3.25 : 2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={hasEntered ? 0 : 1}
          opacity={decOpacity}
          style={{ transition: hasEntered ? 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1) 0.15s, opacity 0.4s ease' : 'opacity 0.4s ease' }}
        />
      )}

      {/* Overgang FIRE→AOW — horizon-tussentint. Alleen in de derde-band-modus
          (decPath is dan null); vervangt samen met de onttrekkingslijn de
          doorlopende afbouwlijn. Dimt met de afbouw tijdens de walkthrough. */}
      {bridgePath && (
        <path
          d={bridgePath}
          fill="none"
          stroke={bridgeStroke}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={hasEntered ? 0 : 1}
          opacity={decOpacity}
          style={{ transition: hasEntered ? 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1) 0.15s, opacity 0.4s ease' : 'opacity 0.4s ease' }}
        />
      )}

      {/* Onttrekking vanaf AOW — kern bruin (derde band). */}
      {withdrawalPath && (
        <path
          d={withdrawalPath}
          fill="none"
          stroke={mainStrokeDec}
          strokeWidth={emphasis === 'withdrawal' ? 3.25 : 2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={hasEntered ? 0 : 1}
          opacity={decOpacity}
          style={{ transition: hasEntered ? 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1) 0.3s, opacity 0.4s ease' : 'opacity 0.4s ease' }}
        />
      )}

      {/* Path when FIRE not reachable — grey single line */}
      {allPath && (
        <path
          d={allPath}
          fill="none"
          stroke="var(--ink-3)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={hasEntered ? 0 : 1}
          style={{ transition: hasEntered ? 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)' : 'none' }}
        />
      )}

      {/* Event markers (life events + natural milestones) — rendered ABOVE the
          confidence band and projection lines so they are never hidden */}
      {eventOverlay && eventOverlay.length > 0 && (
        <ChartEventMarkers
          events={eventOverlay}
          xScale={xScale}
          padLeft={PAD.left}
          chartTopY={PAD.top}
          chartBottomY={PAD.top + innerH}
          iconClampTopY={iconClampTopY}
          lineYAt={lineYAt}
          visibleMinAge={minAge}
          visibleMaxAge={maxAge}
          onEventClick={onEventClick}
          onEventDragEnd={onEventDragEnd}
          onEventDragMove={onEventDragMove}
          onClusterOpen={onClusterOpen}
        />
      )}
    </>
  )
}

export const ChartStaticLayers = memo(ChartStaticLayersInner)
