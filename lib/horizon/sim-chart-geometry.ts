/**
 * Pure geometrie-bouwer voor de Toekomst-vermogensgrafiek (`SimChart`).
 *
 * Alle HOVER-ONAFHANKELIJKE geometrie — punten, d-strings, Monte-Carlo-banden,
 * doellijn, ticks, schaal-functies en fase/FIRE/AOW-punten — wordt hier één
 * keer berekend en door de component in één `useMemo` geconsumeerd. Zolang de
 * geometrie-inputs gelijk blijven, hoeft een muisbeweging (die enkel
 * `hoveredAge` wijzigt) niets van dit rekenwerk te herhalen.
 *
 * Zuivere functie: geen React, geen DOM. Daardoor testbaar met snapshots én
 * bespioneerbaar met een render-teller (zie sim-chart.test.tsx).
 *
 * BELANGRIJK — byte-identieke output: deze module reproduceert exact de
 * berekeningen zoals ze eerder inline in `sim-chart.tsx` stonden. Wijzig hier
 * niets aan de formules zonder de snapshot-tests bij te werken.
 */
import type { SimRow } from '@/lib/fire-simulation'
import type { FireEndStrategy } from '@/lib/fire-strategy'
import type { ChartEventOverlay } from '@/lib/chart-event-overlay'
import { CHART_PAD } from '@/lib/chart-constants'
import { topPaddingFor, iconStackTopFloor } from '@/lib/horizon/chart-event-geometry'

// ── Overlay-types (publieke API — via sim-chart.tsx her-geëxporteerd) ────────

export type ScenarioOverlay = {
  name: string
  label: string
  color: string
  points: [number, number][]  // [age, netWorth]
  /** Fractionele FIRE-leeftijd (bv. 54.5). Alleen zinvol samen met
   *  `variant: 'scenario'`: plaatst een FIRE-stip op de wat-als-lijn (exact op
   *  de lijn via interpolatie, net als de hoofd-/household-lijn). */
  fireAgeFractional?: number | null
  /** Hoe de legenda `fireAgeFractional` benoemt: `'fire'` (default, huidig gedrag)
   *  toont "(57j)" — de gesolvede FIRE-leeftijd van de wat-als-run; `'stop'` toont
   *  "(stop 63)" — de lijn is dan het geforceerde stop-pad tot je gekozen
   *  stopleeftijd (ADR 0085). Geen geometrie-effect: puur legenda-vorm. */
  ageLabel?: 'stop' | 'fire'
  /** `'scenario'` = de live "wat-als"-lijn: zwaarder gestippeld, in inkt, met
   *  FIRE-stip en eigen legenda-/tooltip-presentatie. Zonder dit veld
   *  (undefined) rendert de overlay byte-identiek als de bestaande dunne
   *  saved-scenario-ghost. */
  variant?: 'scenario'
}

export type HouseholdPartnerOverlay = {
  name: string
  color: string
  points: [number, number][]  // [age, netWorth]
  fireAge: number | null
  /** Fractionele FIRE-leeftijd (bv. 52.7) — plaatst de FIRE-stip exact op de
   *  lijn i.p.v. op de afgeronde leeftijd, net als de hoofdlijn. */
  fireAgeFractional?: number | null
  /** If true, renders as dashed line (used for combined household line) */
  isDashed?: boolean
}

export type MonteCarloOverlay = {
  /** Percentile bands indexed by year offset (0 = current age) */
  p10: number[]
  p25: number[]
  p50: number[]
  p75: number[]
  p90: number[]
  startAge: number
}

// ── Input & output ───────────────────────────────────────────────────────────

export type SimChartGeometryInput = {
  rows: SimRow[]
  fireAge: number | null
  fireAgeFractional: number | null
  currentAge: number
  endAge: number
  fireTarget?: number
  /** Tweede FIRE-doel op de incl.-woning-grondslag (totaal netto vermogen bij
   *  FIRE, `requiredFireNetWorth`). Wanneer gezet tekent SimChart een TWEEDE
   *  horizontale doellijn op dit niveau (naast `fireTarget` = excl. woning /
   *  liquide). Alleen doorgegeven bij de dubbele-woning-grondslag; anders
   *  undefined → één doellijn zoals voorheen. */
  fireTargetInclHome?: number
  strategy?: FireEndStrategy
  targetEndPortfolio?: number
  baselineRows?: SimRow[]
  scenarioOverlays?: ScenarioOverlay[]
  monteCarloOverlay?: MonteCarloOverlay
  householdOverlays?: HouseholdPartnerOverlay[]
  mainLineColor?: string
  visibleMinAge?: number
  visibleMaxAge?: number
  aowAgeFractional?: number
  planningMode?: 'fire' | 'pensioen'
  eventOverlay?: ChartEventOverlay[]
  targetInflationFactors?: { age: number; factor: number }[]
  /**
   * Tweede vermogenslijn: het BESTEEDBARE (liquide) vermogen als `[leeftijd,
   * bedrag]`-punten, op dezelfde as-conventie als de hoofdlijn. Alleen gezet bij
   * de eigen-woningstrategieën waar totaal en besteedbaar blijvend uiteenlopen
   * (zie `lib/horizon/liquid-wealth-line.ts`); anders undefined → geen extra lijn
   * en byte-identieke uitvoer voor alle bestaande callers.
   */
  liquidPoints?: [number, number][]
  /** Gemeten containerbreedte (px, uit de ResizeObserver in de component). */
  containerW: number
}

export type ScenarioPathGeometry = {
  name: string
  color: string
  d: string | null
  /** Alleen bij `variant: 'scenario'`: SVG-coördinaat voor de FIRE-stip
   *  (gestippelde ink-ring) op de fractionele FIRE-leeftijd. */
  fireDot?: { cx: number; cy: number } | null
  /** Doorgegeven vanaf de overlay zodat de render-laag de wat-als-lijn (inkt,
   *  zwaardere dash) van de ghost-lijnen onderscheidt. */
  variant?: 'scenario'
}

export type HouseholdPathGeometry = {
  name: string
  color: string
  isDashed: boolean
  d: string | null
  fireDot: { cx: number; cy: number } | null
}

/**
 * De getekende marktcheck-band. **p25–p75 is sinds 2026-08-09 de zichtbare band**;
 * p10–p90 wordt niet meer getekend (en bepaalt dus ook de Y-as niet meer).
 *
 * Waarom: p10–p90 op een 49-jaars decumulatie is zó breed dat de plan-lijn zelf
 * tot ~9% van de ashoogte werd platgedrukt (gemeten: 8,7% · 10,7% · 8,7% · 22,1%
 * over vier plannen). Op de p75-as wordt dat 19,1% · 23,2% · 19,3% · 45,4% —
 * ruwweg een verdubbeling, en de lijn waar het plan over gaat is weer leesbaar.
 * De veldnamen dragen daarom hun percentiel: geen `outermost`/`inner` meer die
 * suggereren dat er nog een rand omheen zit.
 */
export type MonteCarloPathGeometry = {
  /** p25–p75 — de zichtbare band (buitenrand van wat er getekend wordt). */
  band: string
  /** p35–p65 — extra vulling rond de mediaan, puur voor het verloop. */
  bandKern: string
  /** p50 — de mediaanlijn. */
  median: string
}

export type TargetLineGeometry = {
  d: string
  realTargetNow: number
  labelAge: number
  labelVal: number
}

export type SimChartGeometry = {
  // Afmetingen
  W: number
  H: number
  isDesktop: boolean
  PAD: { top: number; right: number; bottom: number; left: number }
  innerW: number
  innerH: number
  // Leeftijd-bereik
  minAge: number
  maxAge: number
  // Schaal-functies (voor crosshair-afgeleiden + event-markers)
  xScale: (age: number) => number
  yScale: (val: number) => number
  lineYAt: (age: number) => number | null
  // Ruwe hoofdlijn-punten (crosshair-y consumeert dit in de component)
  allPts: [number, number][]
  // Assen
  yTicks: { val: number; y: number }[]
  xTickAges: number[]
  yZero: number
  // Modus / FIRE / AOW
  isPensioenMode: boolean
  fireAge: number | null
  fireAgeFractional: number | null
  fireTarget?: number
  fireTargetInclHome?: number
  strategy?: FireEndStrategy
  targetEndPortfolio?: number
  aowAgeFractional?: number
  aowFractionalPt: [number, number] | null
  splitFractionalAge: number | null
  /** True in FIRE-modus zodra er een derde band bestaat (AOW ná FIRE): de afbouw
   *  is dan gesplitst in brug (FIRE→AOW) + onttrekking (AOW→eind). In alle andere
   *  gevallen false → de klassieke 2-segment-uitvoer (byte-identiek). */
  threeBandFire: boolean
  xFire: number | null
  yFireDot: number | null
  labelSafeTopY: number
  // Kleuren
  mainStrokeAcc: string
  mainStrokeDec: string
  /** Kleur van de derde band (Overgang FIRE→AOW): een horizon-tussentint die
   *  leesbaar afsteekt tegen de donkere opbouw- en afbouwlijnen op `--paper`. */
  bridgeStroke: string
  /** Kleur van de besteedbaar-lijn (zie `liquidPath`). */
  liquidStroke: string
  COLOR_OPBOUW: string
  COLOR_AFBOUW: string
  // Voorberekende paden (d-strings)
  baselinePath: string | null
  accPath: string | null
  decPath: string | null
  /** Overgang FIRE→AOW (alleen in `threeBandFire`; anders null). */
  bridgePath: string | null
  /** Onttrekking vanaf AOW (alleen in `threeBandFire`; anders null). */
  withdrawalPath: string | null
  /** Besteedbaar (liquide) vermogen — tweede grondslag naast de hoofdlijn.
   *  null zonder `liquidPoints` (byte-identiek voor bestaande callers). */
  liquidPath: string | null
  allPath: string | null
  scenarioPaths: ScenarioPathGeometry[]
  householdPaths: HouseholdPathGeometry[]
  mcPaths: MonteCarloPathGeometry | null
  targetLine: TargetLineGeometry | null
  depletion: { x1: number; x2: number } | null
  // Event-marker-verankering
  iconClampTopY: number
}

/**
 * Bouwt alle hover-onafhankelijke geometrie voor `SimChart`.
 *
 * De formules zijn 1-op-1 overgenomen uit de vorige inline-render-body van
 * `sim-chart.tsx` (bit-identieke SVG-output is een harde eis van deze refactor).
 */
/**
 * Zet een kernel-jaarreeks om naar chart-punten `[leeftijd, vermogen]`.
 *
 * TIJDSTIP-CONVENTIE (één plek, hier):
 * een `SimRow{age: N}` beschrijft het leeftijdsJAAR N, niet het tijdstip N.
 * `startPortfolio` is de stand ÓP N; `endPortfolio` de stand aan het EIND van dat
 * jaar — dus op leeftijd N + 1 (bridge: `endPortfolio → UnifiedProjectionRow
 * .netWorth`, "netto vermogen einde van jaar"). Een reeks is daarom een seed op de
 * beginleeftijd plus één punt per jaargrens.
 *
 * WAAROM GEDEELD: de hoofdlijn en de ghost-lijn hieronder deden dit al goed, maar
 * de overlay-reeksen in `horizon-client.tsx` (huishoud-partnerlijn, wat-als-
 * scenario's, doel-/wat-als-lijn) plotten `[r.age, r.endPortfolio]` — zonder de
 * `+ 1` en zonder seed. Die overlays liggen op DEZELFDE leeftijds-as als de
 * hoofdlijn, dus ze stonden er structureel één jaar links van: bij de
 * beginleeftijd begon de overlay al op de stand van een jaar later, en de
 * gestippelde wat-als-lijn kruiste de doellijn een jaar te vroeg. Eén conventie,
 * één huis — anders drift elke nieuwe overlay opnieuw weg.
 */
export function simRowsToChartPoints(
  rows: readonly Pick<SimRow, 'age' | 'startPortfolio' | 'endPortfolio'>[],
): [number, number][] {
  if (rows.length === 0) return []
  const pts: [number, number][] = [[rows[0].age, rows[0].startPortfolio]]
  for (const r of rows) pts.push([r.age + 1, r.endPortfolio])
  return pts
}

export function buildSimChartGeometry(input: SimChartGeometryInput): SimChartGeometry {
  const {
    rows,
    fireAge,
    fireAgeFractional,
    currentAge,
    endAge,
    fireTarget,
    fireTargetInclHome,
    strategy,
    targetEndPortfolio,
    baselineRows,
    scenarioOverlays,
    monteCarloOverlay,
    householdOverlays,
    mainLineColor,
    visibleMinAge,
    visibleMaxAge,
    aowAgeFractional,
    planningMode = 'fire',
    eventOverlay,
    targetInflationFactors,
    liquidPoints,
    containerW,
  } = input

  const W = containerW
  const isDesktop = containerW >= 768

  // Dynamic padding for event markers. Markers now anchor INSIDE the plot,
  // stacked upward just above the wealth line — so we only need head-room at
  // the top (for a stack that sits near the chart's upper edge) and no extra
  // bottom gutter. We size the top padding to the largest stack that can occur
  // at a single age, capped at MAX_STACK_VISIBLE, so icons never clip the top.
  const maxStackAtAge = eventOverlay && eventOverlay.length > 0
    ? Math.max(
        ...Object.values(
          eventOverlay.reduce<Record<number, number>>((acc, e) => {
            const a = Math.floor(e.age)
            acc[a] = (acc[a] ?? 0) + 1
            return acc
          }, {}),
        ),
      )
    : 0
  const extraTop = topPaddingFor(maxStackAtAge)
  const extraBottom = 0
  const PAD = {
    top: CHART_PAD.top + extraTop,
    right: CHART_PAD.right,
    bottom: CHART_PAD.bottom + extraBottom,
    left: CHART_PAD.left,
  }
  const H = (isDesktop ? 260 : 220) + extraTop + extraBottom
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const minAge = visibleMinAge ?? currentAge
  const maxAge = visibleMaxAge ?? endAge

  // Build all path points from rows (tijdstip-conventie: zie simRowsToChartPoints)
  const allPts: [number, number][] = simRowsToChartPoints(rows)

  // Build baseline ghost-line points (what-if mode)
  const baselinePts: [number, number][] = simRowsToChartPoints(baselineRows ?? [])

  // Filter points to visible range for Y-axis rescaling
  const inRange = ([age]: [number, number]) => age >= minAge - 1 && age <= maxAge + 1
  const visibleAllPts = allPts.filter(inRange)
  const visibleBaselinePts = baselinePts.filter(inRange)

  const baselineMax = visibleBaselinePts.length > 0
    ? Math.max(...visibleBaselinePts.map(([, v]) => v))
    : 0
  const overlayMax = scenarioOverlays?.length
    ? Math.max(...scenarioOverlays.flatMap(o => o.points.filter(inRange).map(([, v]) => v)))
    : 0
  // Y-as volgt de GETEKENDE band. Dat is sinds 2026-08-09 p25–p75, niet meer
  // p90: een percentiel dat niet getekend wordt mag de schaal niet bepalen —
  // anders drukt een onzichtbare rand de plan-lijn plat (zie
  // `MonteCarloPathGeometry` voor de gemeten ashoogte-aandelen).
  const mcMax = monteCarloOverlay
    ? Math.max(...monteCarloOverlay.p75.filter((_, i) => {
        const age = monteCarloOverlay.startAge + i
        return age >= minAge && age <= maxAge
      }))
    : 0
  const hhMax = householdOverlays?.length
    ? Math.max(...householdOverlays.flatMap(o => o.points.filter(inRange).map(([, v]) => v)))
    : 0
  // De besteedbaar-lijn ligt normaal ónder de totaallijn, maar telt hier tóch mee
  // in de schaal zodat de y-as beide lijnen hoe dan ook omvat (0 = geen lijn →
  // geen effect op de bestaande schaal).
  const visibleLiquidPts = (liquidPoints ?? []).filter(inRange)
  const liquidMax = visibleLiquidPts.length > 0
    ? Math.max(...visibleLiquidPts.map(([, v]) => v))
    : 0
  const rawMax = visibleAllPts.length > 0
    ? Math.max(...visibleAllPts.map(([, v]) => v), fireTarget ?? 0, fireTargetInclHome ?? 0, baselineMax, overlayMax, mcMax, hhMax, liquidMax)
    : Math.max(1, overlayMax, mcMax, hhMax, liquidMax)
  const maxVal = Math.max(rawMax, 1) * 1.08

  const xScale = (age: number) =>
    maxAge > minAge ? ((age - minAge) / (maxAge - minAge)) * innerW : 0
  const yScale = (val: number) => innerH - (val / maxVal) * innerH

  function pointsToPath(pts: [number, number][]): string {
    return pts
      .map(([age, val], i) => {
        const x = PAD.left + xScale(age)
        const y = PAD.top + yScale(Math.max(val, 0))
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ')
  }

  // Build fractional FIRE junction point via linear interpolation.
  // The engine now prorates savings in the FIRE year, so the data naturally
  // reflects the correct portfolio value — no snapping to fireTarget needed.
  let fireFractionalPt: [number, number] | null = null
  if (fireAge !== null && fireAgeFractional !== null) {
    if (fireAge > currentAge) {
      const t = fireAgeFractional - (fireAge - 1)
      const ptBefore = allPts.find(([a]) => a === fireAge - 1)?.[1] ?? 0
      const ptAfter  = allPts.find(([a]) => a === fireAge)?.[1] ?? 0
      fireFractionalPt = [fireAgeFractional, ptBefore + t * (ptAfter - ptBefore)]
    } else {
      // Already at FIRE at currentAge
      fireFractionalPt = [currentAge, allPts[0]?.[1] ?? 0]
    }
  }

  // AOW junction point for path splitting. Berekend zodra een AOW-leeftijd bekend
  // is — in pensioen-modus als hoofd-split, in FIRE-modus voor de derde band
  // (Overgang FIRE→AOW). Formule identiek aan voorheen (byte-identiek voor pensioen).
  const isPensioenMode = planningMode === 'pensioen'
  let aowFractionalPt: [number, number] | null = null
  if (aowAgeFractional != null) {
    const aowFloor = Math.floor(aowAgeFractional)
    if (aowFloor > currentAge) {
      const t = aowAgeFractional - aowFloor
      const ptBefore = allPts.find(([a]) => a === aowFloor)?.[1] ?? 0
      const ptAfter  = allPts.find(([a]) => a === aowFloor + 1)?.[1] ?? 0
      aowFractionalPt = [aowAgeFractional, ptBefore + t * (ptAfter - ptBefore)]
    } else {
      aowFractionalPt = [currentAge, allPts[0]?.[1] ?? 0]
    }
  }

  // Determine split point: AOW age in pensioen mode, FIRE fractional age otherwise.
  // Using fireAgeFractional (e.g. 60.2) ensures the gold→brown colour transition
  // aligns with the FIRE marker, preventing the visual artifact where the gold path
  // continues past FIRE because the integer fireAge (61) is 1 year later.
  const splitAge = isPensioenMode
    ? (aowAgeFractional != null ? Math.ceil(aowAgeFractional) : null)
    : (fireAgeFractional ?? fireAge)
  const splitFractionalPt = isPensioenMode ? aowFractionalPt : fireFractionalPt
  const splitFractionalAge = isPensioenMode ? aowAgeFractional ?? null : fireAgeFractional

  // Split at fractional point for two-colour rendering (opbouw = acc, pensioen/afbouw = dec)
  const accPts: [number, number][] = splitFractionalPt !== null && splitAge !== null
    ? [...allPts.filter(([age]) => age < splitAge), splitFractionalPt]
    : splitAge !== null
    ? allPts.filter(([age]) => age <= splitAge)
    : allPts
  // Build decumulation path starting from the FIRE junction point.
  // The engine prorates savings in the FIRE year, so data naturally reflects
  // correct values — no clamping needed.
  const decPts: [number, number][] = splitFractionalPt !== null && splitAge !== null
    ? [splitFractionalPt, ...allPts.filter(([age]) => age >= Math.ceil(splitAge))]
    : splitAge !== null
    ? allPts.filter(([age]) => age >= splitAge)
    : []

  // Derde band (FIRE-modus): zodra de AOW ná FIRE valt, splitsen we de afbouw op de
  // AOW-leeftijd in een BRUG (FIRE→AOW) en ONTTREKKING (AOW→eind). Guard (hard):
  // pensioen-modus, geen AOW, of AOW ≤ FIRE → géén derde band → exact de bestaande
  // 2-segment-uitvoer (accPts/decPts ongemoeid, byte-identiek).
  const threeBandFire =
    !isPensioenMode &&
    aowAgeFractional != null &&
    fireAgeFractional !== null &&
    aowAgeFractional > fireAgeFractional &&
    fireFractionalPt !== null &&
    aowFractionalPt !== null
  let bridgePts: [number, number][] = []
  let withdrawalPts: [number, number][] = []
  if (threeBandFire) {
    const fireSplit = Math.ceil(fireAgeFractional as number)
    const aowSplit = Math.ceil(aowAgeFractional as number)
    // Brug: van de FIRE-junction, langs de hele jaren tot AOW, eindigend op de
    // AOW-junction (spiegelt de decPts-opbouw + de pensioen-modus-split).
    bridgePts = [
      fireFractionalPt as [number, number],
      ...allPts.filter(([age]) => age >= fireSplit && age < aowSplit),
      aowFractionalPt as [number, number],
    ]
    // Onttrekking: van de AOW-junction tot het einde.
    withdrawalPts = [
      aowFractionalPt as [number, number],
      ...allPts.filter(([age]) => age >= aowSplit),
    ]
  }

  // Use fractional position for the FIRE vertical line
  const xFire = fireAgeFractional !== null ? PAD.left + xScale(fireAgeFractional) : null
  const yZero = PAD.top + yScale(0)

  // SVG y-coördinaat van de hoofdlijn (vermogen) op een gegeven leeftijd.
  // De event-iconen ankeren hierop: ze zweven vlak boven de lijn op het
  // gebeurtenis-jaar. Lineaire interpolatie over `allPts` (= de getekende
  // hoofdlijn) zodat ook fractionele leeftijden een correcte y krijgen.
  const lineYAt = (age: number): number | null => {
    if (allPts.length === 0) return null
    if (age <= allPts[0][0]) return PAD.top + yScale(Math.max(allPts[0][1], 0))
    const last = allPts[allPts.length - 1]
    if (age >= last[0]) return PAD.top + yScale(Math.max(last[1], 0))
    for (let i = 0; i < allPts.length - 1; i++) {
      const [a0, v0] = allPts[i]
      const [a1, v1] = allPts[i + 1]
      if (age >= a0 && age <= a1) {
        const t = a1 === a0 ? 0 : (age - a0) / (a1 - a0)
        const v = v0 + t * (v1 - v0)
        return PAD.top + yScale(Math.max(v, 0))
      }
    }
    return null
  }

  // Module-kleuren: Horizon goud voor opbouw/inkomen, Kern bruin voor afbouw/uitgaven
  const COLOR_OPBOUW = 'var(--hor-t, #8a6e42)'
  const COLOR_AFBOUW = 'var(--kern-t, #58362d)'
  // Optionele hoofdlijn-kleur-override (bv. partner-projectie = teal, gelijk aan de
  // partner-event-markers). Raakt alleen de hoofdlijn + FIRE-stip + legenda-swatch;
  // cashflow-/event-markers houden hun eigen kleur.
  const mainStrokeAcc = mainLineColor ?? COLOR_OPBOUW
  const mainStrokeDec = mainLineColor ?? (!isPensioenMode && strategy === 'perpetual' ? COLOR_OPBOUW : COLOR_AFBOUW)
  // Overgangsband (FIRE→AOW): horizon mid-tint (horizon-600). Lichter dan de donkere
  // opbouwlijn (horizon-700 = --hor-t) én een andere hue dan de bruine onttrekking
  // (kern-700), in lijn met PhaseBar (overgang = lichtere horizon dan opbouw).
  // Leesbaar op --paper: als LIJN haalt horizon-600 3,2:1 (≥3:1-grafiekdrempel voor
  // niet-tekst) — horizon-500 haalde maar 2,3:1. Het OVERGANG-tekstlabel heeft een
  // hógere drempel (4,5:1) en gebruikt daarom apart horizon-700 (zie sim-chart.tsx).
  const bridgeStroke = 'var(--color-horizon-600, #ab8449)'
  // Besteedbaar (liquide) vermogen: één grootheid, twee grondslagen — dus bewust
  // dezelfde horizon-familie als de hoofdlijn, één tint lichter (horizon-600, als
  // LIJN 3,2:1 op --paper → boven de 3:1-grafiekdrempel). Het ONDERSCHEID leunt
  // niet op kleur maar op de streepstijl + dunnere lijn (zie chart-static-layers),
  // zodat de lijn ook zonder kleurwaarneming te herkennen is. Deelt de tint met
  // `bridgeStroke`; die is altijd doorgetrokken en dikker, en zit bovendien in het
  // verlengde van de hoofdlijn — vandaar geen verwarring.
  const liquidStroke = 'var(--color-horizon-600, #ab8449)'

  // Veilige bovengrens voor in-plot labels (doellijn-/FIRE-label) zodat ze niet
  // omhoog in de gereserveerde icoon-marge boven het plot kruipen en daar met de
  // (bij een hoge lijn naar boven uitwijkende) event-iconen botsen. Net ónder de
  // plot-bovenrand; bij events laten we extra ruimte voor de onderste icoon-rij
  // die — wanneer geclampt — vlak boven de plot-rand kan eindigen.
  const labelSafeTopY = PAD.top + (extraTop > 0 ? 14 : 2)

  const yTicks = [0, 0.33, 0.66, 1.0].map(f => ({
    val: maxVal * f,
    y: PAD.top + yScale(maxVal * f),
  }))

  const totalAgeSpan = maxAge - minAge
  const xStep = totalAgeSpan <= 10 ? 1 : totalAgeSpan <= 20 ? 2 : totalAgeSpan <= 40 ? 5 : 10
  const xTickAges: number[] = []
  for (let a = Math.ceil(minAge / xStep) * xStep; a <= maxAge; a += xStep) {
    xTickAges.push(a)
  }

  const yFireDot = fireFractionalPt !== null ? PAD.top + yScale(Math.max(fireFractionalPt[1], 0)) : null

  // Meegroeiende erfenis/koopkracht-doellijn (legacy/perpetual). `targetEndPortfolio`
  // is de NOMINALE eindwaarde op eindleeftijd; gedeeld door de inflatie-indexfactor
  // op die leeftijd geeft het REËLE doel-van-nu (bv. €200k i.p.v. €497k). Per
  // leeftijd: nominaal doel = reëelDoel × factor(leeftijd). We tekenen een polyline
  // over de zichtbare reeks i.p.v. één vlakke lijn, zodat zichtbaar is dat het doel
  // een bedrag-van-nu is dat met inflatie meegroeit. Consume-only: alle factoren
  // komen uit `targetInflationFactors` (afgeleid van `unifiedRows`), geen eigen
  // inflatie-aanname hier. Zonder de prop (bv. standalone widget) blijft de lijn vlak.
  const targetLine: TargetLineGeometry | null = (() => {
    if (targetEndPortfolio == null || targetEndPortfolio <= 0) return null
    if (!(strategy === 'legacy' || strategy === 'perpetual')) return null
    const factors = targetInflationFactors
    if (!factors || factors.length === 0) return null
    const byAge = new Map(factors.map((f) => [f.age, f.factor]))
    // Factor op de laatste leeftijd ↔ waar targetEndPortfolio (nominaal) op slaat.
    const lastAge = Math.max(...factors.map((f) => f.age))
    const endFactor = byAge.get(lastAge) ?? 1
    if (!(endFactor > 0)) return null
    const realTargetNow = targetEndPortfolio / endFactor
    // Punten over de zichtbare leeftijdsreeks; interpoleer factor lineair tussen
    // bekende jaren waar nodig (factoren zijn per heel jaar gegeven).
    const factorAt = (age: number): number => {
      const exact = byAge.get(age)
      if (exact != null) return exact
      const lo = Math.floor(age)
      const hi = Math.ceil(age)
      const fLo = byAge.get(lo)
      const fHi = byAge.get(hi)
      if (fLo != null && fHi != null && hi !== lo) return fLo + (fHi - fLo) * (age - lo)
      return fLo ?? fHi ?? endFactor
    }
    const pts: [number, number][] = []
    for (const f of factors) {
      if (f.age < minAge - 1 || f.age > maxAge + 1) continue
      pts.push([f.age, realTargetNow * f.factor])
    }
    if (pts.length < 2) return null
    return {
      d: pointsToPath(pts),
      realTargetNow,
      // Y voor het eindlabel = de nominale waarde op de laatste zichtbare leeftijd.
      labelAge: pts[pts.length - 1][0],
      labelVal: realTargetNow * factorAt(pts[pts.length - 1][0]),
    }
  })()

  // Pre-compute Monte Carlo band SVG paths (gradient confidence band)
  const mcPaths: MonteCarloPathGeometry | null = monteCarloOverlay ? (() => {
    const mc = monteCarloOverlay
    function bandPath(upper: number[], lower: number[]): string {
      const fwd: string[] = []
      const bwd: string[] = []
      for (let i = 0; i < upper.length; i++) {
        const age = mc.startAge + i
        if (age < minAge || age > maxAge) continue
        const x = PAD.left + xScale(age)
        fwd.push(`${x.toFixed(1)},${(PAD.top + yScale(Math.max(upper[i], 0))).toFixed(1)}`)
        bwd.unshift(`${x.toFixed(1)},${(PAD.top + yScale(Math.max(lower[i], 0))).toFixed(1)}`)
      }
      if (fwd.length < 2) return ''
      return `M ${fwd[0]} ${fwd.slice(1).map(p => `L ${p}`).join(' ')} L ${bwd.join(' L ')} Z`
    }
    function linePath(values: number[]): string {
      let first = true
      return values.map((val, i) => {
        const age = mc.startAge + i
        if (age < minAge || age > maxAge) return null
        const x = PAD.left + xScale(age)
        const y = PAD.top + yScale(Math.max(val, 0))
        const cmd = first ? 'M' : 'L'
        first = false
        return `${cmd} ${x.toFixed(1)} ${y.toFixed(1)}`
      }).filter(Boolean).join(' ')
    }
    // Eén extra tussenband voor het verloop naar de mediaan. p15/p85 (uit p10/p90)
    // zijn vervallen: die lagen buiten de zichtbare p25–p75-band en zouden er als
    // losse rand overheen steken.
    function interpolatePercentile(a: readonly number[], b: readonly number[], t: number): number[] {
      return a.map((v, i) => v + (b[i] - v) * t)
    }
    const p35 = interpolatePercentile(mc.p25, mc.p50, 0.5)
    const p65 = interpolatePercentile(mc.p50, mc.p75, 0.5)
    return {
      band: bandPath(mc.p75, mc.p25), // p25–p75: de zichtbare band
      bandKern: bandPath(p65, p35), // p35–p65: dichter bij de mediaan
      median: linePath(mc.p50),
    }
  })() : null

  // Scenario-overlay-paden (achter de hoofdlijn). Index-volgorde blijft gelijk
  // aan `scenarioOverlays` zodat de intreek-animatie-vertraging (`i * 0.1s`) in
  // de render-laag identiek blijft.
  const scenarioPaths: ScenarioPathGeometry[] = (scenarioOverlays ?? []).map(overlay => {
    const base = {
      name: overlay.name,
      color: overlay.color,
      d: overlay.points.length > 1 ? pointsToPath(overlay.points) : null,
    }
    // Ghost-overlays (saved scenario's) blijven exact het oude shape houden —
    // geen extra velden → snapshots byte-identiek. Alleen de wat-als-lijn krijgt
    // een FIRE-stip, geïnterpoleerd op de fractionele leeftijd (spiegelt de
    // householdPaths-stip hieronder).
    if (overlay.variant !== 'scenario') return base
    let fireDot: { cx: number; cy: number } | null = null
    const fa = overlay.fireAgeFractional
    if (fa != null && fa >= currentAge && fa <= endAge) {
      const lo = Math.floor(fa)
      const hi = Math.ceil(fa)
      const frac = fa - lo
      const yLo = overlay.points.find(([a]) => a === lo)?.[1]
      const yHi = overlay.points.find(([a]) => a === hi)?.[1]
      const yVal = yLo != null && yHi != null
        ? yLo + frac * (yHi - yLo)
        : (overlay.points.find(([a]) => Math.abs(a - fa) < 1)?.[1] ?? 0)
      fireDot = { cx: PAD.left + xScale(fa), cy: PAD.top + yScale(yVal) }
    }
    return { ...base, fireDot, variant: 'scenario' as const }
  })

  // Household-partner-overlay-paden + FIRE-stip. De stip valt op de fractionele
  // leeftijd (geïnterpoleerde y), net als de hoofdlijn.
  const householdPaths: HouseholdPathGeometry[] = (householdOverlays ?? []).map(overlay => {
    let fireDot: { cx: number; cy: number } | null = null
    const fa = overlay.fireAgeFractional ?? overlay.fireAge
    if (fa !== null && fa >= currentAge && fa <= endAge) {
      const lo = Math.floor(fa)
      const hi = Math.ceil(fa)
      const frac = fa - lo
      const yLo = overlay.points.find(([a]) => a === lo)?.[1]
      const yHi = overlay.points.find(([a]) => a === hi)?.[1]
      const yVal = yLo != null && yHi != null
        ? yLo + frac * (yHi - yLo)
        : (overlay.points.find(([a]) => Math.abs(a - fa) < 1)?.[1] ?? 0)
      fireDot = { cx: PAD.left + xScale(fa), cy: PAD.top + yScale(yVal) }
    }
    return {
      name: overlay.name,
      color: overlay.color,
      isDashed: !!overlay.isDashed,
      d: overlay.points.length > 1 ? pointsToPath(overlay.points) : null,
      fireDot,
    }
  })

  const baselinePath = baselinePts.length > 1 ? pointsToPath(baselinePts) : null
  const accPath = accPts.length > 1 ? pointsToPath(accPts) : null
  // In de derde-band-modus vervalt de doorlopende afbouwlijn (decPath) — die wordt
  // vervangen door brug + onttrekking. In alle andere gevallen ongewijzigd.
  const decPath = !threeBandFire && decPts.length > 1 ? pointsToPath(decPts) : null
  const bridgePath = threeBandFire && bridgePts.length > 1 ? pointsToPath(bridgePts) : null
  const withdrawalPath = threeBandFire && withdrawalPts.length > 1 ? pointsToPath(withdrawalPts) : null
  const liquidPath = (liquidPoints?.length ?? 0) > 1 ? pointsToPath(liquidPoints!) : null
  const allPath = fireAge === null && allPts.length > 1 ? pointsToPath(allPts) : null

  // Depletion-zone (AOW-stop-modus): eerste leeftijd waarop het portfolio ≤ 0.
  const depletion: { x1: number; x2: number } | null = (() => {
    const depletionPt = allPts.find(([, v]) => v <= 0)
    if (!depletionPt || depletionPt[0] >= maxAge || depletionPt[0] <= minAge) return null
    return {
      x1: PAD.left + xScale(depletionPt[0]),
      x2: PAD.left + xScale(maxAge),
    }
  })()

  const iconClampTopY = iconStackTopFloor(maxStackAtAge, CHART_PAD.top)

  return {
    W,
    H,
    isDesktop,
    PAD,
    innerW,
    innerH,
    minAge,
    maxAge,
    xScale,
    yScale,
    lineYAt,
    allPts,
    yTicks,
    xTickAges,
    yZero,
    isPensioenMode,
    fireAge,
    fireAgeFractional,
    fireTarget,
    fireTargetInclHome,
    strategy,
    targetEndPortfolio,
    aowAgeFractional,
    aowFractionalPt,
    splitFractionalAge,
    threeBandFire,
    xFire,
    yFireDot,
    labelSafeTopY,
    mainStrokeAcc,
    mainStrokeDec,
    bridgeStroke,
    liquidStroke,
    COLOR_OPBOUW,
    COLOR_AFBOUW,
    baselinePath,
    accPath,
    decPath,
    bridgePath,
    withdrawalPath,
    liquidPath,
    allPath,
    scenarioPaths,
    householdPaths,
    mcPaths,
    targetLine,
    depletion,
    iconClampTopY,
  }
}
