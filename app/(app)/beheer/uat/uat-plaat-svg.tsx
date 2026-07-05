'use client'

// Interactieve SVG-renderer van de UAT-procesplaat. De layout + resultaten
// komen als props binnen; zoom/pan zit in usePlaatZoomPan (pure wiskunde in
// lib/uat/plaat-transform.ts). Klik op een knoop opent het detailpaneel;
// dubbelklik op een zone zoomt-to-fit die zone. Stijl volgt /beheer/architectuur
// (papier --paper, inkt --ink), statuskleuren/-vormen uit lib/uat/status.ts.

import { useMemo } from 'react'
import { Maximize2 } from 'lucide-react'
import { nodeRadius, type PlaatLayout, type ZoneLayout } from '@/lib/uat/plaat-layout'
import type { UatScenario, UatZone } from '@/lib/uat/catalog'
import { buildKruisLinks, type KruisLink } from '@/lib/uat/kruis-links'
import {
  buildResultLookup,
  computeCoverage,
  deriveScenarioStatus,
  deriveZoneStatus,
  UAT_STATUS_VISUAL,
  type UatResultRow,
  type UatStatus,
} from '@/lib/uat/status'
import { usePlaatZoomPan } from '@/lib/hooks/use-plaat-zoom-pan'

interface PlaatProps {
  layout: PlaatLayout
  results: readonly UatResultRow[]
  selectedId: string | null
  onSelectScenario: (scenario: UatScenario) => void
  /**
   * Scenario-ID's met minstens één regressie (geslaagd→gefaald/geblokkeerd)
   * t.o.v. de vergeleken basisronde (Deel 3 §3.4). Ontbreekt of leeg =
   * geen vergelijking geselecteerd → normale weergave, geen markeringen.
   */
  regressionScenarioIds?: ReadonlySet<string>
  /** Scenario-ID's met minstens één herstel (gefaald/geblokkeerd→geslaagd). */
  herstelScenarioIds?: ReadonlySet<string>
  /**
   * Filterselectie (§3.3, brok 5): scenario-ID's die vol zichtbaar blijven.
   * `null`/ontbreekt = geen filter actief → niets dimt. Geldt voor gewone
   * zone-knopen én de KRUIS-verbindingsknoopjes (dezelfde catalogus-ID's).
   */
  visibleScenarioIds?: ReadonlySet<string> | null
  /**
   * Zones waarvoor een procesmodel (laag 2) bestaat — hun tegel krijgt een
   * klikbare titel-affordance (chevron). Ontbreekt/leeg = geen enkele zone
   * drilbaar (dan gedraagt de plaat zich exact als voorheen).
   */
  drillableZones?: ReadonlySet<UatZone>
  /** Titel-klik op een drilbare zone opent het procesmodel van die zone (laag 2). */
  onDrillZone?: (zone: UatZone) => void
}

// ── Vorm-primitieven ──────────────────────────────────────────────────────────

function StatusShape({ cx, cy, r, status }: { cx: number; cy: number; r: number; status: UatStatus }) {
  const v = UAT_STATUS_VISUAL[status]
  const d = r * 1.18
  if (v.shape === 'triangle') {
    const pts = `${cx},${cy - d} ${cx - d},${cy + d * 0.82} ${cx + d},${cy + d * 0.82}`
    return <polygon points={pts} fill={v.fill} stroke={v.stroke} strokeWidth={1.2} strokeLinejoin="round" />
  }
  if (v.shape === 'diamond') {
    const pts = `${cx},${cy - d} ${cx + d},${cy} ${cx},${cy + d} ${cx - d},${cy}`
    return <polygon points={pts} fill={v.fill} stroke={v.stroke} strokeWidth={1.2} strokeLinejoin="round" />
  }
  if (v.shape === 'circle-open') {
    return <circle cx={cx} cy={cy} r={r} fill="none" stroke={v.stroke} strokeWidth={1.3} strokeDasharray="2 2.4" />
  }
  return <circle cx={cx} cy={cy} r={r} fill={v.fill} stroke={v.stroke} strokeWidth={1.2} />
}

/** Klein bliksem-glyph voor rooktest-scenario's (rechtsboven de knoop). */
function Bolt({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <path
      d="M0.6,-4 L-2.4,1 L-0.2,1 L-1.4,4 L2.4,-1.1 L0.4,-1.1 Z"
      transform={`translate(${x},${y}) scale(${scale})`}
      fill="var(--ink)"
      stroke="var(--paper)"
      strokeWidth={0.5}
      className="pointer-events-none"
    />
  )
}

/** Dikke rode ring rond een knoop met een regressie (Deel 3 §3.4). */
function RegressionRing({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r + 5}
      fill="none"
      stroke="var(--negative)"
      strokeWidth={3}
      className="pointer-events-none"
    />
  )
}

/** "↓ regressie"-badge, klein rond glyph linksonder de knoop. */
function RegressionBadge({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`} className="pointer-events-none">
      <circle cx={0} cy={0} r={6} fill="var(--negative)" stroke="var(--paper)" strokeWidth={1} />
      <text x={0} y={0.5} textAnchor="middle" dominantBaseline="central" fontSize={7.5} fontWeight={700} fill="#ffffff">
        ↓
      </text>
    </g>
  )
}

/** Subtiel groen vinkje rechtsonder de knoop voor een herstelde regressie. */
function HerstelBadge({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`} className="pointer-events-none">
      <circle cx={0} cy={0} r={5} fill="var(--positive)" stroke="var(--paper)" strokeWidth={1} />
      <text x={0} y={0.5} textAnchor="middle" dominantBaseline="central" fontSize={6.5} fontWeight={700} fill="#ffffff">
        ✓
      </text>
    </g>
  )
}

function StatusGlyph({ cx, cy, r, status }: { cx: number; cy: number; r: number; status: UatStatus }) {
  const v = UAT_STATUS_VISUAL[status]
  if (!v.glyph || r < 6) return null
  return (
    <text
      x={cx}
      y={cy}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={r * 1.25}
      fontWeight={700}
      fill={v.glyphFill}
      className="pointer-events-none"
    >
      {v.glyph}
    </text>
  )
}

// ── Zone-tegel ────────────────────────────────────────────────────────────────

function ZoneTile({
  zone,
  lookup,
  selectedId,
  onSelectScenario,
  onZoomZone,
  hasDragged,
  regressionScenarioIds,
  herstelScenarioIds,
  visibleScenarioIds,
  drillableZones,
  onDrillZone,
}: {
  zone: ZoneLayout
  lookup: Map<string, UatResultRow>
  selectedId: string | null
  onSelectScenario: (s: UatScenario) => void
  onZoomZone: (z: ZoneLayout) => void
  hasDragged: () => boolean
  regressionScenarioIds: ReadonlySet<string>
  herstelScenarioIds: ReadonlySet<string>
  /** null = geen filter actief (niets dimt). */
  visibleScenarioIds: ReadonlySet<string> | null
  drillableZones: ReadonlySet<UatZone> | undefined
  onDrillZone: ((zone: UatZone) => void) | undefined
}) {
  const scenarios = zone.nodes.map((n) => n.scenario)
  const agg = deriveZoneStatus(scenarios, lookup)
  const cov = computeCoverage(scenarios, Array.from(lookup.values()))
  const v = UAT_STATUS_VISUAL[agg.status]

  const pad = 10
  const barY = zone.y + zone.headerH - 12
  const barW = zone.w - pad * 2
  const execFrac = cov.total > 0 ? cov.executed / cov.total : 0
  const rateLabel = cov.executed > 0 ? `${Math.round(cov.successRate * 100)}%` : '—'
  const dashed = agg.incompleet

  return (
    <g aria-label={`Zone ${zone.zone.zone}, ${zone.zone.naam}, status ${v.label}, succesrate ${rateLabel}, dekking ${cov.executed} van ${cov.total}`}>
      {/* achtergrond-rect: dubbelklik → zoom-to-fit deze zone */}
      <rect
        x={zone.x}
        y={zone.y}
        width={zone.w}
        height={zone.h}
        rx={6}
        fill="var(--paper)"
        stroke="var(--border-ed)"
        strokeWidth={1.2}
        strokeDasharray={dashed ? '4 3' : undefined}
        onDoubleClick={() => onZoomZone(zone)}
        className="cursor-zoom-in"
      >
        <title>{`${zone.zone.zone} — ${zone.zone.naam} (dubbelklik om in te zoomen)`}</title>
      </rect>
      {onDrillZone && drillableZones?.has(zone.zone.zone) ? (
        <g
          role="button"
          tabIndex={0}
          aria-label={`Procesmodel van ${zone.zone.naam} openen`}
          onClick={() => {
            if (hasDragged()) return
            onDrillZone(zone.zone.zone)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onDrillZone(zone.zone.zone)
            }
          }}
          className="cursor-pointer outline-none [&:focus-visible>rect.uat-drill-focus]:opacity-100"
        >
          <title>{`Procesmodel van ${zone.zone.naam} openen`}</title>
          {/* onzichtbaar hit-vlak zodat de hele titel-strook klikbaar is */}
          <rect x={zone.x + pad - 3} y={zone.y + 5} width={zone.w - pad * 2} height={16} fill="transparent" />
          {/* toetsenbord-focusring (mirror van de knoop-focusring) */}
          <rect
            className="uat-drill-focus"
            x={zone.x + pad - 4}
            y={zone.y + 4}
            width={zone.w - pad * 2 + 2}
            height={18}
            rx={3}
            fill="none"
            stroke="var(--ink)"
            strokeWidth={1.3}
            opacity={0}
          />
          <text
            x={zone.x + pad}
            y={zone.y + 16}
            fontSize={11.5}
            fontWeight={700}
            fill="var(--ink)"
            className="underline decoration-dotted underline-offset-2"
          >
            {'▸ '}
            {zone.zone.zone}
          </text>
        </g>
      ) : (
        <text x={zone.x + pad} y={zone.y + 16} fontSize={11.5} fontWeight={700} fill="var(--ink)" className="pointer-events-none">
          {zone.zone.zone}
        </text>
      )}
      <text x={zone.x + pad} y={zone.y + 28} fontSize={8.5} fill="var(--ink-3)" className="pointer-events-none">
        {rateLabel !== '—' ? `${rateLabel} geslaagd` : 'niet getest'}
      </text>
      <g transform={`translate(${zone.x + zone.w - 15}, ${zone.y + 15})`} className="pointer-events-none">
        <StatusShape cx={0} cy={0} r={7} status={agg.status} />
        <StatusGlyph cx={0} cy={0} r={7} status={agg.status} />
      </g>
      <rect x={zone.x + pad} y={barY} width={barW} height={4} rx={2} fill="var(--border-ed)" className="pointer-events-none" />
      {execFrac > 0 && (
        <rect
          x={zone.x + pad}
          y={barY}
          width={Math.max(2, barW * execFrac)}
          height={4}
          rx={2}
          fill={agg.status === 'grijs' ? 'var(--ink-4)' : v.fill}
          className="pointer-events-none"
        />
      )}
      {/* scenario-knopen — klik opent het detailpaneel (onderdrukt na een sleep) */}
      {zone.nodes.map((n) => {
        const st = deriveScenarioStatus(n.scenario, lookup).status
        const hasRegression = regressionScenarioIds.has(n.scenario.id)
        const hasHerstel = !hasRegression && herstelScenarioIds.has(n.scenario.id)
        const label = `${n.scenario.id}, ${n.scenario.naam}, status ${UAT_STATUS_VISUAL[st].label}${
          hasRegression ? ', regressie t.o.v. vergeleken ronde' : hasHerstel ? ', hersteld t.o.v. vergeleken ronde' : ''
        }`
        const isSel = n.scenario.id === selectedId
        const activate = () => {
          if (hasDragged()) return
          onSelectScenario(n.scenario)
        }
        const badgeScale = n.r > 8 ? 1 : 0.8
        const dimmed = visibleScenarioIds !== null && !visibleScenarioIds.has(n.scenario.id)
        return (
          <g
            key={n.scenario.id}
            role="button"
            tabIndex={0}
            aria-label={label}
            aria-pressed={isSel}
            onClick={activate}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelectScenario(n.scenario)
              }
            }}
            className="cursor-pointer outline-none transition-opacity duration-150 [&:focus-visible>circle.uat-focus]:opacity-100"
            style={{ opacity: dimmed ? 0.25 : 1 }}
          >
            <title>{label}</title>
            {/* onzichtbaar hit-target: vangt ook kliks binnen open (grijze) cirkels + kleine knopen.
                Gecapt op 12 (< CELL/2, met CELL=26 het knoop-raster): 2×12 < 26 → hit-vlakken van
                buurknopen overlappen NIET, zodat een klik altijd naar de dichtstbijzijnde knoop gaat
                i.p.v. naar de laatst-getekende buur. Kleinste knoop (r 5.5) groeit nog ruim 2×. */}
            <circle cx={n.cx} cy={n.cy} r={Math.min(n.r + 6, 12)} fill="transparent" />
            {/* onzichtbare focus/hit-uitbreiding + geselecteerde ring */}
            <circle
              className="uat-focus"
              cx={n.cx}
              cy={n.cy}
              r={n.r + 4}
              fill="none"
              stroke="var(--ink)"
              strokeWidth={1.4}
              opacity={isSel ? 1 : 0}
            />
            {hasRegression && <RegressionRing cx={n.cx} cy={n.cy} r={n.r} />}
            <StatusShape cx={n.cx} cy={n.cy} r={n.r} status={st} />
            <StatusGlyph cx={n.cx} cy={n.cy} r={n.r} status={st} />
            {n.scenario.rooktest && <Bolt x={n.cx + n.r * 0.95} y={n.cy - n.r * 0.95} scale={badgeScale} />}
            {hasRegression && (
              <RegressionBadge x={n.cx - n.r * 0.95} y={n.cy + n.r * 0.95} scale={badgeScale} />
            )}
            {hasHerstel && <HerstelBadge x={n.cx + n.r * 0.95} y={n.cy + n.r * 0.95} scale={badgeScale} />}
          </g>
        )
      })}
    </g>
  )
}

// ── KRUIS-verbindingslijnen (Deel 3 §3.2, brok 5) ──────────────────────────────
//
// Elk KRUIS-scenario met `kruisZones` wordt een lijn (of sterpatroon bij 3+
// zones) tussen de betrokken zone-tegels, met een klein knoopje op de hub dat
// hetzelfde detailpaneel opent als een gewone scenario-knoop. Ontwerpkeuze om
// de plaat leesbaar te houden: de lijnen zelf zijn subtiel en liggen ACHTER de
// zone-tegels (ze verdwijnen dus in het gat tussen tegels, niet er dwars
// doorheen); de hub-knoopjes liggen er weer BOVENOP zodat ze altijd zichtbaar
// en klikbaar blijven, ook als de centroïde toevallig binnen een niet-
// gerelateerde zonetegel valt. Grijze (nog niet uitgevoerde) verbindingen
// krijgen een dunnere, gestippelde lijn — net als de open cirkel bij een
// gewone GRIJS-knoop.

function KruisLinkLines({
  links,
  lookup,
  visibleScenarioIds,
}: {
  links: KruisLink[]
  lookup: Map<string, UatResultRow>
  visibleScenarioIds: ReadonlySet<string> | null
}) {
  return (
    <g aria-hidden="true" className="pointer-events-none">
      {links.map((link) => {
        const status = deriveScenarioStatus(link.scenario, lookup).status
        const v = UAT_STATUS_VISUAL[status]
        const stroke = status === 'grijs' ? v.stroke : v.fill
        const dimmed = visibleScenarioIds !== null && !visibleScenarioIds.has(link.scenario.id)
        const opacity = dimmed ? 0.12 : status === 'grijs' ? 0.3 : 0.5
        return (
          <g key={link.scenario.id} className="transition-opacity duration-150" style={{ opacity }}>
            {link.segments.map((s, i) => (
              <line
                key={i}
                x1={s.x1}
                y1={s.y1}
                x2={s.x2}
                y2={s.y2}
                stroke={stroke}
                strokeWidth={status === 'grijs' ? 1.2 : 2}
                strokeDasharray={status === 'grijs' ? '4 3' : undefined}
              />
            ))}
          </g>
        )
      })}
    </g>
  )
}

/** De klikbare hub-knoopjes van de KRUIS-verbindingen — zelfde interactiepatroon als een gewone scenario-knoop. */
function KruisLinkHubs({
  links,
  lookup,
  selectedId,
  onSelectScenario,
  hasDragged,
  regressionScenarioIds,
  herstelScenarioIds,
  visibleScenarioIds,
}: {
  links: KruisLink[]
  lookup: Map<string, UatResultRow>
  selectedId: string | null
  onSelectScenario: (s: UatScenario) => void
  hasDragged: () => boolean
  regressionScenarioIds: ReadonlySet<string>
  herstelScenarioIds: ReadonlySet<string>
  visibleScenarioIds: ReadonlySet<string> | null
}) {
  return (
    <>
      {links.map((link) => {
        const scenario = link.scenario
        const st = deriveScenarioStatus(scenario, lookup).status
        const r = nodeRadius(scenario.kriticiteit)
        const hasRegression = regressionScenarioIds.has(scenario.id)
        const hasHerstel = !hasRegression && herstelScenarioIds.has(scenario.id)
        const isSel = scenario.id === selectedId
        const dimmed = visibleScenarioIds !== null && !visibleScenarioIds.has(scenario.id)
        const label = `${scenario.id}, ${scenario.naam}, kruisverbinding tussen ${link.zones.join(', ')}, status ${
          UAT_STATUS_VISUAL[st].label
        }${hasRegression ? ', regressie t.o.v. vergeleken ronde' : hasHerstel ? ', hersteld t.o.v. vergeleken ronde' : ''}`

        return (
          <g
            key={scenario.id}
            role="button"
            tabIndex={0}
            aria-label={label}
            aria-pressed={isSel}
            onClick={() => {
              if (hasDragged()) return
              onSelectScenario(scenario)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelectScenario(scenario)
              }
            }}
            className="cursor-pointer outline-none transition-opacity duration-150 [&:focus-visible>circle.uat-focus]:opacity-100"
            style={{ opacity: dimmed ? 0.3 : 1 }}
          >
            <title>{label}</title>
            {/* onzichtbaar hit-target: hubs zijn centroïden (geen raster, ver uit elkaar), dus
                geen overlap-risico zoals bij de tegel-knopen — hier mag het vlak ruim (min. 16). */}
            <circle cx={link.hub.x} cy={link.hub.y} r={Math.max(r + 6, 16)} fill="transparent" />
            <circle
              className="uat-focus"
              cx={link.hub.x}
              cy={link.hub.y}
              r={r + 4}
              fill="none"
              stroke="var(--ink)"
              strokeWidth={1.4}
              opacity={isSel ? 1 : 0}
            />
            {/* grondplaat: geeft het knoopje een eigen basis, los van wat er visueel onder ligt */}
            <circle cx={link.hub.x} cy={link.hub.y} r={r + 3} fill="var(--paper)" stroke="var(--border-ed)" strokeWidth={1} />
            {hasRegression && <RegressionRing cx={link.hub.x} cy={link.hub.y} r={r} />}
            <StatusShape cx={link.hub.x} cy={link.hub.y} r={r} status={st} />
            <StatusGlyph cx={link.hub.x} cy={link.hub.y} r={r} status={st} />
            {scenario.rooktest && <Bolt x={link.hub.x + r * 0.95} y={link.hub.y - r * 0.95} scale={1} />}
            {hasRegression && <RegressionBadge x={link.hub.x - r * 0.95} y={link.hub.y + r * 0.95} scale={1} />}
            {hasHerstel && <HerstelBadge x={link.hub.x + r * 0.95} y={link.hub.y + r * 0.95} scale={1} />}
          </g>
        )
      })}
    </>
  )
}

const EMPTY_SET: ReadonlySet<string> = new Set()

// ── Plaat ─────────────────────────────────────────────────────────────────────

export function UatPlaatSvg({
  layout,
  results,
  selectedId,
  onSelectScenario,
  regressionScenarioIds,
  herstelScenarioIds,
  visibleScenarioIds,
  drillableZones,
  onDrillZone,
}: PlaatProps) {
  const lookup = useMemo(() => buildResultLookup(results), [results])
  const regressionIds = regressionScenarioIds ?? EMPTY_SET
  const herstelIds = herstelScenarioIds ?? EMPTY_SET
  const visibleIds = visibleScenarioIds ?? null
  const kruisLinks = useMemo(() => buildKruisLinks(layout), [layout])
  const { transform, svgRef, svgHandlers, reset, fitBox, hasDragged } = usePlaatZoomPan({
    viewW: layout.width,
    viewH: layout.height,
    minScale: 0.5,
    maxScale: 6,
  })

  const onZoomZone = (z: ZoneLayout) => fitBox({ x: z.x, y: z.y, w: z.w, h: z.h })

  return (
    <div className="relative">
      {/* Overzicht-knop (fit-to-screen); toets 0 doet hetzelfde via de container */}
      <button
        type="button"
        onClick={reset}
        className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-md border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink-2)] shadow-[var(--s1)] hover:bg-[var(--subtle)]"
        aria-label="Terug naar overzicht (fit-to-screen)"
      >
        <Maximize2 className="h-3.5 w-3.5" />
        Overzicht
      </button>

      <div
        tabIndex={0}
        role="application"
        aria-roledescription="zoombare procesplaat"
        aria-label="UAT-procesplaat — scrollwiel of pinch zoomt, slepen pant, dubbelklik op een zone zoomt in, toets 0 voor overzicht"
        onKeyDown={(e) => {
          if (e.key === '0') {
            e.preventDefault()
            reset()
          }
        }}
        className="aspect-[1240/1292] w-full overflow-hidden rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-active-500)]"
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="block h-full w-full"
          role="group"
          aria-label="UAT-procesplaat — reis-banden met deelgebied-zones en scenario-knopen"
          {...svgHandlers}
        >
          <g transform={`translate(${transform.tx}, ${transform.ty}) scale(${transform.scale})`}>
            {/* bandlabels */}
            {layout.bands.map((band) => (
              <text
                key={band.id}
                x={band.x}
                y={band.y + 15}
                fontSize={11}
                fontWeight={700}
                letterSpacing="0.12em"
                fill="var(--ink-3)"
                className="pointer-events-none"
              >
                {band.label.toUpperCase()}
              </text>
            ))}
            {/* KRUIS-verbindingslijnen — subtiel, achter de zone-tegels */}
            <KruisLinkLines links={kruisLinks} lookup={lookup} visibleScenarioIds={visibleIds} />
            {/* zone-tegels */}
            {layout.zones.map((zone) => (
              <ZoneTile
                key={zone.zone.zone}
                zone={zone}
                lookup={lookup}
                selectedId={selectedId}
                onSelectScenario={onSelectScenario}
                onZoomZone={onZoomZone}
                hasDragged={hasDragged}
                regressionScenarioIds={regressionIds}
                herstelScenarioIds={herstelIds}
                visibleScenarioIds={visibleIds}
                drillableZones={drillableZones}
                onDrillZone={onDrillZone}
              />
            ))}
            {/* KRUIS-knoopjes — boven de tegels, altijd zichtbaar en klikbaar */}
            <KruisLinkHubs
              links={kruisLinks}
              lookup={lookup}
              selectedId={selectedId}
              onSelectScenario={onSelectScenario}
              hasDragged={hasDragged}
              regressionScenarioIds={regressionIds}
              herstelScenarioIds={herstelIds}
              visibleScenarioIds={visibleIds}
            />
          </g>
        </svg>
      </div>
    </div>
  )
}
