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
  emphasis: 'accumulation' | 'withdrawal' | 'fire' | null
  baselineEmphasis: 'ghost' | 'compare'
  showDepletionWarning?: boolean
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
}

/** Dim-contrast voor niet-benadrukte segmenten (uitleg-walkthrough). Bewust
 *  0.30 (niet lager): de gedimde segmenten blijven leesbaar zodat het verschil
 *  niet puur op kleur/contrast leunt (a11y). */
const DIMMED = 0.30

export function ChartStaticLayersInner({
  geometry,
  hasEntered,
  emphasis,
  baselineEmphasis,
  showDepletionWarning,
  eventOverlay,
  onEventClick,
  onEventDragEnd,
  onEventDragMove,
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
    baselinePath,
    accPath,
    decPath,
    bridgePath,
    withdrawalPath,
    allPath,
    scenarioPaths,
    householdPaths,
    mcPaths,
    depletion,
    iconClampTopY,
  } = geometry

  // Emphasis-afgeleide render-waarden (uitleg-walkthrough). Geen geometrie —
  // daarom hier, niet in de gememoiseerde geometry.
  const accOpacity = emphasis === null || emphasis === 'accumulation' || emphasis === 'fire' ? 1 : DIMMED
  const decOpacity = emphasis === null || emphasis === 'withdrawal' ? 1 : DIMMED

  // Bij de dubbele-woning-grondslag (fireTargetInclHome gezet) tekenen we ALLEEN
  // de incl.-woninglijn. De excl./liquide-lijn (`fireTarget` = requiredFirePortfolio)
  // valt weg: de hoofdlijn plot het totale netto vermogen (incl. huis), dus een
  // liquide-drempel op diezelfde as voegt niets toe en geeft alleen ruis. Het
  // excl.-getal blijft wél in het KPI-blok staan — enkel de grafiek-lijn verdwijnt.
  const showExclTargetLine = fireTargetInclHome == null || fireTargetInclHome <= 0

  return (
    <>
      {/* Grid lines */}
      {yTicks.map(({ val, y }) => (
        <line key={val} x1={PAD.left} x2={PAD.left + innerW} y1={y} y2={y}
          stroke="var(--border-ed)" strokeWidth={1} strokeDasharray="4 4" />
      ))}

      {/* Y-axis labels */}
      {yTicks.map(({ val, y }) => (
        <text key={val} x={PAD.left - 5} y={y + 4} textAnchor="end" fontSize={9}
          fill="var(--ink-4)" fontFamily="var(--font-dm-mono, monospace)">
          {val >= 1_000_000
            ? `€${(val / 1_000_000).toFixed(1)}M`
            : val >= 1_000
            ? `€${Math.round(val / 1_000)}k`
            : val > 0 ? `€${Math.round(val)}` : '€0'}
        </text>
      ))}

      {/* X-axis labels */}
      {xTickAges.map(age => (
        <text key={age} x={PAD.left + xScale(age)} y={H - 4} textAnchor="middle" fontSize={9}
          fill="var(--ink-4)" fontFamily="var(--font-dm-mono, monospace)">{age}</text>
      ))}

      {/* FIRE doelbedrag — horizontale dashed lijn (hidden in pensioen mode).
          Alleen in NIET-dual-modus: bij de dubbele-woning-grondslag vervalt deze
          liquide-lijn (zie `showExclTargetLine` hierboven) en blijft enkel de
          incl.-woninglijn over. */}
      {!isPensioenMode && showExclTargetLine && fireTarget != null && fireTarget > 0 && (
        <>
          <line
            x1={PAD.left} x2={PAD.left + innerW}
            y1={PAD.top + yScale(fireTarget)} y2={PAD.top + yScale(fireTarget)}
            stroke="var(--hor-t, #8a6e42)" strokeWidth={1.5} strokeDasharray="6 3" opacity={0.6}
          />
          <text
            x={PAD.left + innerW - 2} y={PAD.top + yScale(fireTarget) - 9}
            fontSize={8} fill="var(--hor-t, #8a6e42)" textAnchor="end"
            fontFamily="var(--font-inter, sans-serif)" fontWeight={600}
          >
            doel
          </text>
          <text
            x={PAD.left + innerW - 2} y={PAD.top + yScale(fireTarget) - 1}
            fontSize={7.5} fill="var(--hor-t, #8a6e42)" textAnchor="end"
            fontFamily="var(--font-dm-mono, monospace)"
          >
            {fireTarget >= 1_000_000
              ? `€${(fireTarget / 1_000_000).toFixed(2)}M`
              : `€${Math.round(fireTarget / 1000)}k`}
          </text>
        </>
      )}

      {/* FIRE-doel op de incl.-woning-grondslag (requiredFireNetWorth) — in de
          dubbele-woning-grondslag DE ENIGE doellijn (de excl./liquide-lijn
          vervalt). Zelfde stijl als de gewone doellijn; valt bij FIRE samen met
          de vermogenslijn (totaal netto vermogen). Anders undefined → geen lijn. */}
      {!isPensioenMode && fireTargetInclHome != null && fireTargetInclHome > 0 && (
        <>
          <line
            x1={PAD.left} x2={PAD.left + innerW}
            y1={PAD.top + yScale(fireTargetInclHome)} y2={PAD.top + yScale(fireTargetInclHome)}
            stroke="var(--hor-t, #8a6e42)" strokeWidth={1.5} strokeDasharray="6 3" opacity={0.6}
          />
          <text
            x={PAD.left + innerW - 2} y={PAD.top + yScale(fireTargetInclHome) - 9}
            fontSize={8} fill="var(--hor-t, #8a6e42)" textAnchor="end"
            fontFamily="var(--font-inter, sans-serif)" fontWeight={600}
          >
            doel incl. woning
          </text>
          <text
            x={PAD.left + innerW - 2} y={PAD.top + yScale(fireTargetInclHome) - 1}
            fontSize={7.5} fill="var(--hor-t, #8a6e42)" textAnchor="end"
            fontFamily="var(--font-dm-mono, monospace)"
          >
            {fireTargetInclHome >= 1_000_000
              ? `€${(fireTargetInclHome / 1_000_000).toFixed(2)}M`
              : `€${Math.round(fireTargetInclHome / 1000)}k`}
          </text>
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
              {strategy === 'perpetual' ? 'koopkracht' : 'erfenis'} {targetLine.labelVal >= 1_000_000
                ? `€${(targetLine.labelVal / 1_000_000).toFixed(1)}M`
                : `€${Math.round(targetLine.labelVal / 1000)}k`}
            </text>
            <text
              x={Math.max(PAD.left + 44, PAD.left + xScale(targetLine.labelAge) - 2)} y={Math.max(labelSafeTopY + 16, PAD.top + yScale(targetLine.labelVal) - 4)}
              fontSize={7} fill="var(--kern-t, #58362d)" textAnchor="end"
              fontFamily="var(--font-dm-mono, monospace)" opacity={0.85}
            >
              {targetLine.realTargetNow >= 1_000_000
                ? `€${(targetLine.realTargetNow / 1_000_000).toFixed(1)}M nu`
                : `€${Math.round(targetLine.realTargetNow / 1000)}k nu`}
            </text>
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
              {strategy === 'perpetual' ? 'koopkracht' : 'erfenis'} {targetEndPortfolio >= 1_000_000
                ? `€${(targetEndPortfolio / 1_000_000).toFixed(1)}M`
                : `€${Math.round(targetEndPortfolio / 1000)}k`}
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
          {/* Outermost band: p10-p90 — lightest layer */}
          {mcPaths.outermost && (
            <path d={mcPaths.outermost} fill="url(#mc-band-gradient-v)" opacity={0.5} />
          )}
          {/* Outer-mid band: p15-p85 — slightly denser */}
          {mcPaths.outerMid && (
            <path d={mcPaths.outerMid} fill="var(--color-horizon-600, #a07840)" opacity={0.06} />
          )}
          {/* Inner band: p25-p75 — medium density */}
          {mcPaths.inner && (
            <path d={mcPaths.inner} fill="var(--color-horizon-600, #a07840)" opacity={0.09} />
          )}
          {/* Inner-mid band: p35-p65 — densest fill near median */}
          {mcPaths.innerMid && (
            <path d={mcPaths.innerMid} fill="var(--color-horizon-600, #a07840)" opacity={0.1} />
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
            <g key={s.name}>
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
        />
      )}
    </>
  )
}

export const ChartStaticLayers = memo(ChartStaticLayersInner)
