'use client'

/**
 * DoorrekeningChart — visualisatie van de aggregatie-aanpak op de test-pagina
 * `/horizon/doorrekening-test/overzicht`.
 *
 * Plan-referentie: `doorrekening-overzicht-aggregatie.md` → "Stap 4 — Grafiek
 * met 4-mode toggle" (regel 198-232).
 *
 * ── Verantwoordelijkheid ────────────────────────────────────────────────
 * Rendert **twee curves** (opbouw-forward + required-backward) met een
 * segmented control bovenaan waarmee de gebruiker kiest welke curves
 * zichtbaar zijn. Zelfstandig component — geen gedeelde state met
 * {@link SimChart} (productie-chart op `/horizon`). Alle data komt via
 * props; geen settings-Context, geen server-calls.
 *
 * ── Waarom een eigen component en geen SimChart-extensie? ───────────────
 * SimChart verwerkt één `SimRow[]`-serie en splitst die op `fireAge` voor
 * twee-kleur rendering. De aggregatie-benadering heeft **twee onafhankelijke
 * curves** (opbouw + required) die elkaar kruisen — niet één curve met een
 * kleurswitch. Een uitbreiding van SimChart zou zijn API vervuilen. De
 * test-pagina mag bovendien visueel divergeren (per plan-paragraaf "4.
 * runSimulation blijft als verborgen referentie"): gebruikers moeten kunnen
 * zien dat dit een alternatieve engine is.
 *
 * ── Design language (TriFinity / Editorial Finance) ────────────────────
 *  - Horizon-kleur (`--color-horizon-700`) voor de opbouw-curve — matcht
 *    module-identiteit (`hor-t` fallback behouden voor legacy-tokens).
 *  - `--ink-2` voor required-curve: neutraal, accent ligt bij opbouw want
 *    die is de "mijn pad"-curve. Required is referentie.
 *  - Axis ticks in DM Mono (font-family monospace) met `tabular-nums`
 *    semantiek via `var(--font-dm-mono)` — kassabon-stijl.
 *  - Delta-modus: `--positive` (oklch groen) boven nul, `--negative`
 *    (oklch rood) onder nul, met 10-14% fill-opacity om de krant-esthetiek
 *    (inkt op papier, geen heldere blokken) te bewaren.
 *  - Scherpe hoeken conform UI-bible — SVG heeft geen rx-rounding;
 *    segmented buttons gebruiken strakke borders.
 *  - Motion: `useInViewAnimation({ duration: 1200 })` + `strokeDashoffset`-
 *    animatie identiek aan SimChart zodat beide charts hetzelfde "tekenen"-
 *    gevoel geven.
 *
 * ── Toegankelijkheid ───────────────────────────────────────────────────
 *  - Segmented = `role="tablist"` + per-knop `role="tab"` + `aria-selected`.
 *    Keyboard: Tab naar eerste knop, pijltoetsen wisselen tabs (arrow-key
 *    handler binnen tablist). `aria-controls` wijst naar de chart-regio,
 *    die `role="tabpanel"` en een bij-modus-wisselend `aria-label` krijgt.
 *  - SVG is puur decoratief-aanvullend (`aria-hidden`) — de drie kern-
 *    datapunten (kruispunt, AOW, eindvermogen) staan tekstueel in de
 *    info-regel onder de grafiek.
 *  - Info-regel `aria-live="polite"` — screenreader hoort de strategie-tekst
 *    wanneer de gebruiker van tab wisselt.
 *
 * ── Data-contract ──────────────────────────────────────────────────────
 * `opbouwRows` en `requiredSchedule` zijn verwacht uitgelijnd op
 * jaargrens (`age` in gehelen, één rij per jaar). Wanneer
 * `requiredPortfolio === null` (bv. pensioen pre-AOW) wordt dát punt
 * **niet gerenderd** in de required- en delta-curve — de lijn start later.
 *
 * ── Layout ─────────────────────────────────────────────────────────────
 * Responsive via SVG `viewBox` + `preserveAspectRatio="none"`. Container
 * heeft een ResizeObserver om `viewBox.width` bij te stellen voor crisp
 * tick-spacing. Default hoogte 320px (desktop) / 260px (mobiel < 640).
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { CHART_PAD } from '@/lib/chart-constants'
import { formatCurrency } from '@/lib/format'

// ── Types ───────────────────────────────────────────────────────────────

export type ChartMode =
  | 'opbouw_afbouw'
  | 'both'
  | 'current_only'
  | 'required_only'
  | 'delta'

/**
 * End-strategy zoals gemodelleerd op de test-pagina.
 *
 * Let op: dit is een **superset** van `FireEndStrategy` uit
 * `lib/fire-strategy.ts`. De test-pagina onderscheidt `'pensioen'`
 * expliciet omdat de required-curve dan pas op AOW-leeftijd start (plan
 * sectie "Stap 2 — Afbouw-backward-curve expliciet maken"). Productie
 * behandelt pensioen niet als separate strategie maar als planningMode.
 */
export type DoorrekeningEndStrategy = 'perpetual' | 'pensioen' | 'legacy' | 'deplete'

export interface DoorrekeningChartProps {
  /** Jaarlijkse opbouw-rijen (`{ age, netWorth }`) — uit `computeOpbouwProjection()`. */
  opbouwRows: ReadonlyArray<{ age: number; netWorth: number }>
  /**
   * Jaarlijkse required-rijen (`{ age, requiredPortfolio }`) —
   * uit `computeAfbouwRequiredSchedule()`.
   * `null`-waarden (pensioen pre-AOW) worden niet gerenderd.
   */
  requiredSchedule: ReadonlyArray<{ age: number; requiredPortfolio: number | null }>
  /** Discrete kruispunt-leeftijd; `null` = geen kruising binnen bereik. */
  fireAge: number | null
  /** Fractionele variant voor gladde marker-positie (bv. 60.25). */
  fireAgeFractional: number | null
  /** Fractionele AOW-leeftijd (bv. 67.25) — altijd gerenderd als dashed verticaal. */
  aowAge: number
  /** Actieve eind-strategie — bepaalt info-regel onder chart. */
  endStrategy: DoorrekeningEndStrategy
  /** Laagste getoonde leeftijd (meestal `profile.age_current`). */
  currentAge: number
  /** Hoogste getoonde leeftijd (meestal `profile.life_end_age`). */
  endAge: number
  /**
   * Controlled mode (optioneel). Als niet doorgegeven, beheert het
   * component zijn eigen state met `'both'` als default.
   */
  mode?: ChartMode
  /** Callback bij mode-wissel (alleen zinvol in controlled-modus). */
  onModeChange?: (mode: ChartMode) => void
  /**
   * Optioneel — legacy-bedrag voor info-regel bij `endStrategy='legacy'`.
   * In huidige valuta; niet inflatie-gecorrigeerd (info-regel doet de
   * × inflatie-toelichting tekstueel).
   */
  legacyAmount?: number
  /**
   * Hybride jaarrijen — `netWorth` + `phase` per leeftijd. Aanwezigheid
   * activeert de `opbouw_afbouw`-modus: één continu netto-pad dat op
   * `fireAgeFractional` van opbouw-goud (`--hor-t`) naar afbouw-neutraal
   * (`--ink-2`) wisselt. Wanneer afwezig valt de component terug op de
   * originele vier modes met `'both'` als default.
   */
  hybridRows?: ReadonlyArray<{ age: number; netWorth: number; phase: 'opbouw' | 'afbouw' }>
}

// ── Constanten ─────────────────────────────────────────────────────────

/**
 * Volgorde van de segmented control. `opbouw_afbouw` staat bewust
 * eerst (meest linkse knop): wanneer de hybride-rijen beschikbaar zijn
 * is dit de default-weergave — één continu netto-pad met kleurwissel
 * op het FIRE-kruispunt dat de opbouw-naar-afbouw-overgang in één blik
 * zichtbaar maakt. De overige vier modes zijn analytische alternatieven
 * (required vs. current, delta) voor wie dieper wil graven.
 */
const MODES: { key: ChartMode; label: string; aria: string }[] = [
  { key: 'opbouw_afbouw', label: 'Opbouw\u2192Afbouw', aria: 'Toon netto-vermogen met kleurwissel op FIRE-kruispunt' },
  { key: 'both',          label: 'Beide',              aria: 'Toon zowel huidige portfolio als benodigd portfolio' },
  { key: 'current_only',  label: 'Alleen huidige',     aria: 'Toon alleen huidige portfolio-projectie' },
  { key: 'required_only', label: 'Alleen benodigd',    aria: 'Toon alleen benodigde portfolio-curve' },
  { key: 'delta',         label: 'Verschil',           aria: 'Toon verschil tussen huidig en benodigd' },
]

// Module-kleuren: opbouw in horizon-goud, required in neutraal ink-2.
// Delta-fills in semantische positive/negative tokens.
const COLOR_OPBOUW   = 'var(--hor-t, var(--color-horizon-700, #8a6e42))'
const COLOR_REQUIRED = 'var(--ink-2, #4a453d)'
const COLOR_POSITIVE = 'var(--positive, #3f8a66)'
const COLOR_NEGATIVE = 'var(--negative, #b5502f)'
const COLOR_AOW      = 'var(--ink-3, #8a8680)'

// ── Hulpfuncties ───────────────────────────────────────────────────────

/**
 * Formatteer Y-as-tick bedragen compact (`€1.2M`, `€850k`, `€0`).
 * Aparte helper om te voorkomen dat `formatCurrency` (twee decimalen + €)
 * de axis-labels te breed maakt.
 */
function fmtAxisAmount(val: number): string {
  if (val === 0) return '€0'
  const abs = Math.abs(val)
  const sign = val < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}€${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}€${Math.round(abs / 1_000)}k`
  return `${sign}€${Math.round(abs)}`
}

/**
 * Build het SVG-path voor een reeks punten. Null-y-values ( bv. pensioen
 * required pre-AOW) breken het pad — na de null wordt een nieuw `M`
 * gestart zodat er geen lijn getrokken wordt door de gap heen.
 */
function pointsToPath(
  pts: ReadonlyArray<[number, number | null]>,
  xScale: (age: number) => number,
  yScale: (val: number) => number,
  padLeft: number,
  padTop: number,
): string {
  const segments: string[] = []
  let started = false
  for (const [age, val] of pts) {
    if (val === null) {
      started = false
      continue
    }
    const x = padLeft + xScale(age)
    const y = padTop + yScale(val)
    segments.push(`${started ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`)
    started = true
  }
  return segments.join(' ')
}

// ── Component ──────────────────────────────────────────────────────────

export const DoorrekeningChart = memo(function DoorrekeningChart({
  opbouwRows,
  requiredSchedule,
  fireAge,
  fireAgeFractional,
  aowAge,
  endStrategy,
  currentAge,
  endAge,
  mode: controlledMode,
  onModeChange,
  legacyAmount,
  hybridRows,
}: DoorrekeningChartProps) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 1200 })

  // ── Mode state (controlled of intern) ─────────────────────────────
  // Default-mode depends on props: wanneer hybridRows meegegeven is
  // valt de default op `opbouw_afbouw` — dat is de verhaalbare weergave
  // (één continu pad, kleurwissel op FIRE). Zonder hybridRows blijft
  // `both` de default om backwards-compat met de oude test-pagina
  // (pre-G3/G4) te bewaren.
  const hasHybridRows = hybridRows !== undefined && hybridRows.length > 0
  const defaultMode: ChartMode = hasHybridRows ? 'opbouw_afbouw' : 'both'
  const [internalMode, setInternalMode] = useState<ChartMode>(defaultMode)
  const mode = controlledMode ?? internalMode
  const setMode = useCallback((next: ChartMode) => {
    if (controlledMode === undefined) setInternalMode(next)
    onModeChange?.(next)
  }, [controlledMode, onModeChange])

  // ── Responsive container-width ────────────────────────────────────
  const [containerW, setContainerW] = useState(640)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setContainerW(Math.round(w))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  const isDesktop = containerW >= 768
  const W = containerW
  const H = isDesktop ? 320 : 260
  const PAD = CHART_PAD
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  // ── Keyboard handling voor segmented control ──────────────────────
  // Pijltoetsen binnen tablist: volgen WAI-ARIA Tabs Pattern.
  const tabsRef = useRef<Array<HTMLButtonElement | null>>([])
  const handleTabKeyDown = useCallback((e: React.KeyboardEvent, idx: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const last = MODES.length - 1
    let next = idx
    if (e.key === 'ArrowRight') next = idx === last ? 0 : idx + 1
    else if (e.key === 'ArrowLeft') next = idx === 0 ? last : idx - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = last
    setMode(MODES[next].key)
    tabsRef.current[next]?.focus()
  }, [setMode])

  // ── Data-voorbereiding ────────────────────────────────────────────
  // Een map voor snelle lookup van opbouw.netWorth per age (voor delta).
  const opbouwByAge = useMemo(() => {
    const m = new Map<number, number>()
    for (const r of opbouwRows) m.set(r.age, r.netWorth)
    return m
  }, [opbouwRows])

  const requiredByAge = useMemo(() => {
    const m = new Map<number, number | null>()
    for (const r of requiredSchedule) m.set(r.age, r.requiredPortfolio)
    return m
  }, [requiredSchedule])

  /** Opbouw-curve punten — nooit null. */
  const opbouwPts = useMemo<Array<[number, number]>>(() =>
    opbouwRows.map((r) => [r.age, r.netWorth]),
    [opbouwRows],
  )

  /** Required-curve punten — null wordt doorgelaten als path-break. */
  const requiredPts = useMemo<Array<[number, number | null]>>(() =>
    requiredSchedule.map((r) => [r.age, r.requiredPortfolio]),
    [requiredSchedule],
  )

  /** Delta-curve punten: `netWorth(age) − required(age)` met null-skip. */
  const deltaPts = useMemo<Array<[number, number | null]>>(() => {
    const result: Array<[number, number | null]> = []
    for (const r of opbouwRows) {
      const req = requiredByAge.get(r.age)
      if (req == null) {
        result.push([r.age, null])
      } else {
        result.push([r.age, r.netWorth - req])
      }
    }
    return result
  }, [opbouwRows, requiredByAge])

  /**
   * Hybride netto-pad punten — één rij per leeftijd ongeacht fase.
   * Wanneer geen hybridRows zijn meegegeven valt de opbouw-reeks in
   * als fallback (phase wordt dan 'opbouw' voor alle rijen).
   */
  const hybridPts = useMemo<Array<[number, number]>>(() => {
    if (hasHybridRows && hybridRows) {
      return hybridRows.map((r) => [r.age, r.netWorth])
    }
    return opbouwRows.map((r) => [r.age, r.netWorth])
  }, [hasHybridRows, hybridRows, opbouwRows])

  // ── Schaling ──────────────────────────────────────────────────────
  const minAge = currentAge
  const maxAge = endAge

  /**
   * Y-schaal hangt af van modus:
   *  - both / current_only / required_only: max van alle zichtbare waarden.
   *  - delta: symmetrisch rond 0 (−max..+max) zodat de nul-lijn in het
   *    verticale midden valt. Dit matcht de mentale model "surplus vs
   *    tekort" — een krantenpagina met kolom-symmetrie.
   */
  const { yMin, yMax } = useMemo(() => {
    if (mode === 'delta') {
      const vals = deltaPts
        .map(([, v]) => v)
        .filter((v): v is number => v !== null)
      if (vals.length === 0) return { yMin: -1, yMax: 1 }
      const absMax = Math.max(...vals.map(Math.abs), 1)
      return { yMin: -absMax * 1.1, yMax: absMax * 1.1 }
    }

    if (mode === 'opbouw_afbouw') {
      // Gebruik de hybrid netto-waarden — mag tot 0 dippen bij deplete.
      const vals = hybridPts.map(([, v]) => v)
      if (vals.length === 0) return { yMin: 0, yMax: 1 }
      const max = Math.max(...vals, 1) * 1.08
      const min = Math.min(...vals, 0)
      return { yMin: min < 0 ? min * 1.1 : 0, yMax: max }
    }

    const opbouwVals = (mode === 'required_only') ? [] : opbouwPts.map(([, v]) => v)
    const reqVals    = (mode === 'current_only')  ? [] : requiredPts
      .map(([, v]) => v)
      .filter((v): v is number => v !== null)

    const all = [...opbouwVals, ...reqVals]
    if (all.length === 0) return { yMin: 0, yMax: 1 }
    const max = Math.max(...all, 1) * 1.08
    return { yMin: 0, yMax: max }
  }, [mode, opbouwPts, requiredPts, deltaPts, hybridPts])

  const xScale = useCallback((age: number): number => {
    if (maxAge <= minAge) return 0
    return ((age - minAge) / (maxAge - minAge)) * innerW
  }, [minAge, maxAge, innerW])

  const yScale = useCallback((val: number): number => {
    if (yMax === yMin) return innerH / 2
    return innerH - ((val - yMin) / (yMax - yMin)) * innerH
  }, [yMin, yMax, innerH])

  // ── Axis ticks ────────────────────────────────────────────────────
  const yTicks = useMemo(() => {
    const steps = [0, 0.25, 0.5, 0.75, 1.0]
    return steps.map((f) => {
      const val = yMin + (yMax - yMin) * f
      return { val, y: PAD.top + yScale(val) }
    })
  }, [yMin, yMax, yScale, PAD.top])

  const xTickAges = useMemo(() => {
    const span = maxAge - minAge
    const step = span <= 10 ? 1 : span <= 20 ? 2 : span <= 40 ? 5 : 10
    const ages: number[] = []
    for (let a = Math.ceil(minAge / step) * step; a <= maxAge; a += step) {
      ages.push(a)
    }
    return ages
  }, [minAge, maxAge])

  // ── Markers ───────────────────────────────────────────────────────
  /**
   * FIRE-marker positie. In delta-modus zit de marker op y=0 (de zero-
   * crossing valt per definitie daar); in overige modes op de
   * geïnterpoleerde opbouw-waarde op `fireAgeFractional`.
   */
  const fireMarker = useMemo(() => {
    if (fireAge === null || fireAgeFractional === null) return null
    if (fireAgeFractional < minAge || fireAgeFractional > maxAge) return null

    const x = PAD.left + xScale(fireAgeFractional)

    if (mode === 'delta') {
      return { x, y: PAD.top + yScale(0) }
    }

    // Lineaire interpolatie op opbouwPts — dezelfde techniek als SimChart
    // r183-188 om de marker gladde op fractional-age te plaatsen.
    const floor = Math.floor(fireAgeFractional)
    const t = fireAgeFractional - floor
    const before = opbouwByAge.get(floor)
    const after = opbouwByAge.get(floor + 1)
    if (before == null || after == null) {
      // Marker op rand — val terug op bekende waarde.
      const val = before ?? after ?? 0
      return { x, y: PAD.top + yScale(val) }
    }
    const val = before + t * (after - before)
    return { x, y: PAD.top + yScale(val) }
  }, [fireAge, fireAgeFractional, minAge, maxAge, mode, opbouwByAge, xScale, yScale, PAD.left, PAD.top])

  const aowMarkerX = PAD.left + xScale(aowAge)
  const aowInRange = aowAge >= minAge && aowAge <= maxAge

  // ── Paths ─────────────────────────────────────────────────────────
  const opbouwPath = useMemo(
    () => pointsToPath(opbouwPts as Array<[number, number | null]>, xScale, yScale, PAD.left, PAD.top),
    [opbouwPts, xScale, yScale, PAD.left, PAD.top],
  )
  const requiredPath = useMemo(
    () => pointsToPath(requiredPts, xScale, yScale, PAD.left, PAD.top),
    [requiredPts, xScale, yScale, PAD.left, PAD.top],
  )
  const deltaPath = useMemo(
    () => pointsToPath(deltaPts, xScale, yScale, PAD.left, PAD.top),
    [deltaPts, xScale, yScale, PAD.left, PAD.top],
  )

  /**
   * Hybride pad — opgesplitst in twee segmenten op het FIRE-kruispunt.
   * We gebruiken geen clip-path maar twee echte paths met een gedeeld
   * overgangspunt (geïnterpoleerd op `fireAgeFractional`). Zo is het
   * kleur-verschil pixel-exact en werkt de stroke-dashoffset-animatie
   * per segment correct.
   *
   * Wanneer er geen crossover is (fireAgeFractional === null of buiten
   * bereik) valt alles in het opbouw-pad — net als pre-hybride gedrag.
   */
  const hybridPaths = useMemo(() => {
    if (hybridPts.length === 0) return { opbouw: '', afbouw: '' }

    // Zonder crossover: één pad in opbouw-kleur.
    if (
      fireAgeFractional === null ||
      fireAgeFractional < minAge ||
      fireAgeFractional > maxAge
    ) {
      return {
        opbouw: pointsToPath(
          hybridPts as Array<[number, number | null]>,
          xScale,
          yScale,
          PAD.left,
          PAD.top,
        ),
        afbouw: '',
      }
    }

    // Vind het punt direct links en rechts van het kruispunt — daar splitsen
    // we en voegen een geïnterpoleerd overgangspunt toe zodat beide paden
    // visueel sluiten.
    const crossover = fireAgeFractional
    let crossIdx = 0
    for (let i = 0; i < hybridPts.length; i++) {
      if (hybridPts[i][0] >= crossover) {
        crossIdx = i
        break
      }
      crossIdx = i
    }

    const prev = hybridPts[Math.max(0, crossIdx - 1)]
    const next = hybridPts[crossIdx]
    // Lineaire interpolatie voor het overgangspunt.
    const ageSpan = next[0] - prev[0]
    const t = ageSpan > 0 ? (crossover - prev[0]) / ageSpan : 0
    const crossValue = prev[1] + t * (next[1] - prev[1])
    const crossPoint: [number, number] = [crossover, crossValue]

    const opbouwPts: Array<[number, number]> = []
    const afbouwPts: Array<[number, number]> = []
    for (const p of hybridPts) {
      if (p[0] <= crossover) opbouwPts.push(p)
      if (p[0] >= crossover) afbouwPts.push(p)
    }
    // Forceer crossPoint als laatste in opbouw en eerste in afbouw zodat
    // beide paden elkaar precies raken.
    const opbouwEnds = opbouwPts[opbouwPts.length - 1]
    if (!opbouwEnds || opbouwEnds[0] !== crossover) {
      opbouwPts.push(crossPoint)
    }
    const afbouwStarts = afbouwPts[0]
    if (!afbouwStarts || afbouwStarts[0] !== crossover) {
      afbouwPts.unshift(crossPoint)
    }

    return {
      opbouw: pointsToPath(
        opbouwPts as Array<[number, number | null]>,
        xScale,
        yScale,
        PAD.left,
        PAD.top,
      ),
      afbouw: pointsToPath(
        afbouwPts as Array<[number, number | null]>,
        xScale,
        yScale,
        PAD.left,
        PAD.top,
      ),
    }
  }, [hybridPts, fireAgeFractional, minAge, maxAge, xScale, yScale, PAD.left, PAD.top])

  /**
   * Delta-fills: twee afzonderlijke polygons voor positief (boven nul) en
   * negatief (onder nul). We gebruiken clipPaths zodat de lijn-vorm
   * exact matcht en de fills niet de random aspect-zaagtand maken.
   */
  const deltaFills = useMemo(() => {
    if (mode !== 'delta') return null
    const positive: string[] = []
    const negative: string[] = []
    const yZero = PAD.top + yScale(0)

    // Polygon-builder: volg het pad, splits in positieve/negatieve runs op
    // basis van `val >= 0`. Elk segment eindigt op de zero-line zodat de
    // fill tot aan de nullijn reikt.
    type Point = [number, number]
    let currentBand: Point[] | null = null
    let currentSign: 'pos' | 'neg' | null = null

    const flush = () => {
      if (!currentBand || currentBand.length < 2 || !currentSign) {
        currentBand = null
        currentSign = null
        return
      }
      const first = currentBand[0]
      const last = currentBand[currentBand.length - 1]
      // Sluit de polygon via de nullijn.
      const poly = `M ${first[0].toFixed(1)} ${yZero.toFixed(1)} ` +
        currentBand.map(([x, y]) => `L ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') +
        ` L ${last[0].toFixed(1)} ${yZero.toFixed(1)} Z`
      if (currentSign === 'pos') positive.push(poly)
      else negative.push(poly)
      currentBand = null
      currentSign = null
    }

    for (const [age, val] of deltaPts) {
      if (val === null) {
        flush()
        continue
      }
      const x = PAD.left + xScale(age)
      const y = PAD.top + yScale(val)
      const sign: 'pos' | 'neg' = val >= 0 ? 'pos' : 'neg'

      const band = currentBand
      if (currentSign !== null && currentSign !== sign && band && band.length > 0) {
        // Overgang: voeg een punt exact op de nullijn toe zodat beide
        // polygons daar op elkaar aansluiten. Lineaire interpolatie tussen
        // het laatste punt en het huidige.
        const prev: Point = band[band.length - 1]
        const denom = (y - prev[1]) || 1
        const crossX: number = prev[0] + (yZero - prev[1]) * ((x - prev[0]) / denom)
        band.push([crossX, yZero])
        flush()
        currentBand = [[crossX, yZero]]
        currentSign = sign
      }

      if (currentBand === null) {
        currentBand = []
        currentSign = sign
      }
      currentBand.push([x, y])
    }
    flush()

    return { positive: positive.join(' '), negative: negative.join(' ') }
  }, [mode, deltaPts, xScale, yScale, PAD.left, PAD.top])

  // ── Info-regel copy ───────────────────────────────────────────────
  const infoText = useMemo(() => {
    switch (endStrategy) {
      case 'perpetual':
        return 'Eeuwigdurende strategie — benodigd = koopkracht-behoud.'
      case 'pensioen':
        return `Pensioen-strategie — kruising vastgezet op AOW (${aowAge.toFixed(1)}j).`
      case 'legacy': {
        const legacyLabel = legacyAmount != null && legacyAmount > 0
          ? `${formatCurrency(legacyAmount)} × inflatie`
          : 'legacy-bedrag × inflatie'
        return `Legacy-strategie — eindvermogen \u2248 ${legacyLabel}.`
      }
      case 'deplete':
        return `Deplete-strategie — vermogen teruggebracht naar nul op ${endAge}j.`
    }
  }, [endStrategy, aowAge, endAge, legacyAmount])

  // Zichtbaarheid per modus.
  const showHybrid = mode === 'opbouw_afbouw'
  const showOpbouw = mode === 'both' || mode === 'current_only'
  const showRequired = mode === 'both' || mode === 'required_only'
  const showDelta = mode === 'delta'
  // Kruispunt-marker bij alle modes waar dat betekenis heeft: opbouw_afbouw
  // (visueel onderstreept), both (kruising van twee curves), delta (zero-
  // crossing). Current_only en required_only verbergen de marker bewust —
  // daar is maar één curve dus geen 'snijpunt' te tonen.
  const showFireMarker =
    (mode === 'opbouw_afbouw' || mode === 'both' || mode === 'delta') &&
    fireMarker !== null

  // Verticale stippellijn op het kruispunt — zichtbaar in elke mode zodra
  // er een fireAgeFractional binnen bereik ligt. Label "Kruispunt" staat
  // klein boven de chart, krant-typografie (uppercase, ink-3, tracking).
  const crossoverX =
    fireAgeFractional !== null &&
    fireAgeFractional >= minAge &&
    fireAgeFractional <= maxAge
      ? PAD.left + xScale(fireAgeFractional)
      : null
  const showCrossoverLine = crossoverX !== null

  const yZero = PAD.top + yScale(0)
  const zeroLineVisible = yMin < 0 && yMax > 0

  const tabpanelLabel = useMemo(() => {
    const m = MODES.find((x) => x.key === mode)
    return m ? `Grafiek — ${m.label.toLowerCase()}` : 'Grafiek'
  }, [mode])

  return (
    <div className="w-full">
      {/* ── Segmented control ──────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="Weergave-modus"
        data-testid="segmented-control"
        className="mb-4 flex w-full flex-wrap gap-0 border border-[var(--border-ed)] bg-[var(--paper)]"
      >
        {MODES.map((m, idx) => {
          const active = mode === m.key
          return (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={m.aria}
              aria-controls="doorrekening-chart-panel"
              tabIndex={active ? 0 : -1}
              ref={(el) => { tabsRef.current[idx] = el }}
              onClick={() => setMode(m.key)}
              onKeyDown={(e) => handleTabKeyDown(e, idx)}
              data-testid={`segmented-tab-${m.key}`}
              className={[
                'flex-1 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors',
                'min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-horizon-600)] focus-visible:ring-inset',
                idx > 0 ? 'border-l border-[var(--border-ed)]' : '',
                active
                  ? 'bg-[var(--color-horizon-50)] text-[var(--color-horizon-900)]'
                  : 'bg-transparent text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink)]',
              ].join(' ')}
            >
              {m.label}
            </button>
          )
        })}
      </div>

      {/* ── Chart body ─────────────────────────────────────────── */}
      <div
        ref={ref}
        id="doorrekening-chart-panel"
        role="tabpanel"
        aria-label={tabpanelLabel}
        className="relative w-full"
        style={{ minHeight: H }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height: H }}
          aria-hidden="true"
          role="presentation"
        >
          {/* Horizontale grid-lines */}
          {yTicks.map(({ val, y }) => (
            <line
              key={val}
              x1={PAD.left}
              x2={PAD.left + innerW}
              y1={y}
              y2={y}
              stroke="var(--border-ed)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ))}

          {/* Y-axis labels */}
          {yTicks.map(({ val, y }) => (
            <text
              key={val}
              x={PAD.left - 6}
              y={y + 4}
              textAnchor="end"
              fontSize={9}
              fill="var(--ink-4)"
              fontFamily="var(--font-dm-mono, monospace)"
            >
              {fmtAxisAmount(val)}
            </text>
          ))}

          {/* X-axis labels */}
          {xTickAges.map((age) => (
            <text
              key={age}
              x={PAD.left + xScale(age)}
              y={H - 6}
              textAnchor="middle"
              fontSize={9}
              fill="var(--ink-4)"
              fontFamily="var(--font-dm-mono, monospace)"
            >
              {age}
            </text>
          ))}

          {/* Nullijn (delta-modus of als y-bereik door 0 gaat) */}
          {zeroLineVisible && (
            <line
              x1={PAD.left}
              x2={PAD.left + innerW}
              y1={yZero}
              y2={yZero}
              stroke="var(--border-md, var(--ink-3))"
              strokeWidth={1.2}
            />
          )}

          {/* AOW-marker: altijd zichtbaar, in elke modus */}
          {aowInRange && (
            <g data-testid="marker-aow">
              <line
                x1={aowMarkerX}
                x2={aowMarkerX}
                y1={PAD.top}
                y2={PAD.top + innerH}
                stroke={COLOR_AOW}
                strokeWidth={1.2}
                strokeDasharray="3 3"
                opacity={0.7}
              />
              <text
                x={aowMarkerX - 4}
                y={PAD.top + 12}
                textAnchor="end"
                fontSize={8}
                fontWeight={600}
                fill="var(--ink-3)"
                fontFamily="var(--font-inter, sans-serif)"
              >
                AOW
              </text>
              <text
                x={aowMarkerX - 4}
                y={PAD.top + 22}
                textAnchor="end"
                fontSize={7}
                fill="var(--ink-4)"
                fontFamily="var(--font-dm-mono, monospace)"
              >
                {aowAge.toFixed(1)}
              </text>
            </g>
          )}

          {/* ── Kruispunt-stippellijn ──────────────────────────────
              Verticale dashed-lijn op fireAgeFractional met klein label
              "Kruispunt" erboven. Altijd zichtbaar zodra er een crossover
              binnen het getoonde bereik zit — dus in elke mode. Kleur
              matcht krant-neutraal ink-3 zodat de opbouw-goud van de
              pad-kleur zelf domineert. Geplaatst VOOR de curves zodat de
              lijn achter de paden zit (de curves zijn het verhaal). */}
          {showCrossoverLine && crossoverX !== null && (
            <g data-testid="crossover-line">
              <line
                x1={crossoverX}
                x2={crossoverX}
                y1={PAD.top}
                y2={PAD.top + innerH}
                stroke="var(--ink-3)"
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.55}
              />
              <text
                x={crossoverX}
                y={PAD.top - 4}
                textAnchor="middle"
                fontSize={8}
                fontWeight={600}
                fill="var(--ink-3)"
                fontFamily="var(--font-inter, sans-serif)"
                style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}
              >
                Kruispunt
              </text>
            </g>
          )}

          {/* ── Opbouw→Afbouw hybride pad ──────────────────────────
              Twee losse paths met een gedeeld overgangspunt:
              pre-crossover in horizon-goud (het "mijn pad"-signaal),
              post-crossover in ink-2 zodat de afbouw-fase visueel
              kalmeert. Stroke-dashoffset-animatie per path voor het
              tekenen-effect; post-crossover krijgt een kleine delay zodat
              de opbouw "aankomt" vóór de afbouw begint te tekenen. */}
          {showHybrid && hybridPaths.opbouw && (
            <path
              data-testid="path-opbouw"
              d={hybridPaths.opbouw}
              fill="none"
              stroke={COLOR_OPBOUW}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={hasEntered ? 0 : 1}
              aria-label="Netto-vermogen opbouw-fase"
              style={{
                transition: hasEntered ? 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)' : 'none',
              }}
            />
          )}
          {showHybrid && hybridPaths.afbouw && (
            <path
              data-testid="path-afbouw"
              d={hybridPaths.afbouw}
              fill="none"
              stroke="var(--ink-2)"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={hasEntered ? 0 : 1}
              aria-label="Netto-vermogen afbouw-fase"
              style={{
                transition: hasEntered ? 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1) 0.4s' : 'none',
              }}
            />
          )}

          {/* Delta-fills (alleen in delta-modus, achter de lijn) */}
          {showDelta && deltaFills && (
            <g data-testid="delta-fills">
              {deltaFills.positive && (
                <path
                  d={deltaFills.positive}
                  fill={COLOR_POSITIVE}
                  fillOpacity={0.14}
                  stroke="none"
                  style={{
                    opacity: hasEntered ? 1 : 0,
                    transition: hasEntered ? 'opacity 0.6s ease 0.2s' : 'none',
                  }}
                />
              )}
              {deltaFills.negative && (
                <path
                  d={deltaFills.negative}
                  fill={COLOR_NEGATIVE}
                  fillOpacity={0.12}
                  stroke="none"
                  style={{
                    opacity: hasEntered ? 1 : 0,
                    transition: hasEntered ? 'opacity 0.6s ease 0.2s' : 'none',
                  }}
                />
              )}
            </g>
          )}

          {/* Required-curve — neutraal ink-2, dashed om te suggereren dat het een doel is */}
          {showRequired && requiredPath && (
            <path
              data-testid="curve-required"
              d={requiredPath}
              fill="none"
              stroke={COLOR_REQUIRED}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={hasEntered ? 0 : 1}
              opacity={0.85}
              aria-label="Benodigde portfolio-curve"
              style={{
                transition: hasEntered ? 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1) 0.1s' : 'none',
              }}
            />
          )}

          {/* Opbouw-curve — horizon-goud, doorgetrokken */}
          {showOpbouw && opbouwPath && (
            <path
              data-testid="curve-opbouw"
              d={opbouwPath}
              fill="none"
              stroke={COLOR_OPBOUW}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={hasEntered ? 0 : 1}
              aria-label="Huidige portfolio-projectie"
              style={{
                transition: hasEntered ? 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)' : 'none',
              }}
            />
          )}

          {/* Delta-curve — één lijn, gekleurd via positive/negative stroke.
              Omdat de lijn-kleur per segment verschilt zou normaal een split
              nodig zijn; we renderen hem hier neutraal (ink-2) zodat de
              fills onderliggend de kleur-informatie leveren. */}
          {showDelta && deltaPath && (
            <path
              data-testid="curve-delta"
              d={deltaPath}
              fill="none"
              stroke="var(--ink-2)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={hasEntered ? 0 : 1}
              aria-label="Verschil tussen huidig en benodigd"
              style={{
                transition: hasEntered ? 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)' : 'none',
              }}
            />
          )}

          {/* FIRE-marker (kruispunt) — alleen in 'both' en 'delta' */}
          {showFireMarker && fireMarker && (
            <g data-testid="marker-fire">
              <line
                x1={fireMarker.x}
                x2={fireMarker.x}
                y1={PAD.top}
                y2={PAD.top + innerH}
                stroke={COLOR_OPBOUW}
                strokeWidth={1.5}
                strokeDasharray="4 2"
                opacity={0.7}
              />
              <circle
                cx={fireMarker.x}
                cy={fireMarker.y}
                r={5}
                fill={COLOR_OPBOUW}
                stroke="var(--paper)"
                strokeWidth={1.5}
              />
              {fireAgeFractional !== null && (
                <text
                  x={fireMarker.x + 6}
                  y={PAD.top + 24}
                  fontSize={9}
                  fontWeight={700}
                  fill={COLOR_OPBOUW}
                  fontFamily="var(--font-inter, sans-serif)"
                >
                  FIRE {fireAgeFractional.toFixed(1)}
                </text>
              )}
            </g>
          )}
        </svg>
      </div>

      {/* ── Info-regel ─────────────────────────────────────────── */}
      <p
        className="mt-3 text-xs italic text-[var(--ink-3)] leading-relaxed"
        aria-live="polite"
        data-testid="chart-info-text"
      >
        {infoText}
      </p>
    </div>
  )
})
