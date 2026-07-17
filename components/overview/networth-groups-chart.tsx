'use client'

import { memo, useEffect, useId, useMemo, useState } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import type { WealthGroup } from '@/lib/wealth-composition'
import { WEALTH_GROUP_COLORS, WEALTH_GROUP_LABELS } from '@/lib/wealth-composition'
import type { DebtGroup } from '@/lib/debt-data'
import { DEBT_GROUP_LABELS, DEBT_TYPE_COLORS } from '@/lib/debt-data'

/**
 * NetworthGroupsChart — butterfly-modus voor het "Netto vermogen — verloop"-sheet.
 *
 * Toont het historische maandverloop als butterfly-grafiek:
 *  - Assetgroepen (spaargeld → beleggingen → pensioen → vastgoed → overig)
 *    gestapeld BOVEN de nulas, in de monochrome Kern-ladder (WEALTH_GROUP_COLORS).
 *  - Schuldgroepen (wonen → consumptief → overig) gestapeld ONDER de nulas, in
 *    de semantische schuld-rood-ladder (DEBT_TYPE_COLORS, per-groep tint).
 *  - De canonieke netto-lijn (`net`) als lijn-overlay er doorheen — met een GAT
 *    bij `null` (geen interpolatie, geen stille verbinding).
 *  - Een gelabelde restband ("Losse cash / niet-uitgesplitst") als BOVENSTE
 *    asset-band wanneer `rest > 0`, en als aparte band ONDER de schuldstapel
 *    wanneer `rest < 0`. Zo verdwijnt het verschil tussen de canonieke
 *    totaallijn en de som van de groepen nooit stilletjes.
 *
 * Herkomst (compliance): LOCF-banden ('doorgetrokken') worden gedimd én met een
 * diagonaal streep-patroon onderscheiden van 'gemeten' banden; LOCF-segmenten
 * van de netto-lijn zijn gestippeld; 'handmatige' netto-punten krijgen een ring-
 * marker. Een compacte legenda-regel toont alleen de herkomststaten die
 * daadwerkelijk voorkomen.
 *
 * Bewust een LOS component: de sheet (`networth-history-sheet.tsx`) integreert
 * deze grafiek in een latere brok. De kassabon-tabel in dat sheet is de
 * toegankelijke, hover-onafhankelijke databron — deze chart hoeft geen tabel
 * te leveren.
 */

// ── Props ────────────────────────────────────────────────────

type ProvenanceState = 'measured' | 'locf' | 'manual'

export interface NetworthGroupsChartProps {
  /** ISO-maanden ('YYYY-MM'), chronologisch oplopend (oud → nieuw). */
  months: string[]
  /** Per assetgroep de maandwaarden (>= 0), zelfde lengte/volgorde als `months`. */
  assetGroups: Record<WealthGroup, number[]>
  /** Per schuldgroep de POSITIEVE magnitudes; het component tekent ze negatief. */
  debtGroups: Record<DebtGroup, number[]>
  /** Niet-uitgesplitst restant per maand — positief (asset-kant), negatief
   *  (schuld-kant) of `null` (geen restant die maand). */
  rest: (number | null)[]
  /** Canonieke netto-lijn per maand; `null` = geen stand → gat in de lijn. */
  net: (number | null)[]
  /** Herkomst per serie per maand. Keys: `asset:<groep>` / `debt:<groep>` +
   *  `net`. Ontbrekende keys/indexen worden als 'measured' behandeld. */
  provenance: Record<string, ProvenanceState[]>
}

// ── Constants ────────────────────────────────────────────────

const ASSET_ORDER: WealthGroup[] = [
  'spaargeld',
  'beleggingen',
  'pensioen',
  'vastgoed',
  'overig',
]

const DEBT_ORDER: DebtGroup[] = ['wonen', 'consumptief', 'overig']

/**
 * Per-groep schuld-tint. Hergebruikt de canonieke DEBT_TYPE_COLORS-ladder
 * (representatief type per groep) i.p.v. losse hexen — één rood-ladder,
 * semantisch (negatief), volgt de accentkeuze bewust NIET.
 */
const DEBT_GROUP_COLORS: Record<DebtGroup, string> = {
  wonen: DEBT_TYPE_COLORS.mortgage, // Klasse I — lange termijn / formeel
  consumptief: DEBT_TYPE_COLORS.personal_loan, // Klasse II — consumptief krediet
  overig: DEBT_TYPE_COLORS.other, // Klasse III — onderhands / overig
}

/** Neutrale ink-tint voor het niet-uitgesplitste restant (geen groep-identiteit). */
const REST_COLOR = 'var(--ink-4)'
const REST_LABEL = 'Losse cash / niet-uitgesplitst'
const NET_LABEL = 'Netto vermogen'

const PROVENANCE_LABELS: Record<ProvenanceState, string> = {
  measured: 'Gemeten',
  locf: 'Doorgetrokken',
  manual: 'Handmatig',
}

const MONTH_NAMES = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
]

const PAD = { top: 16, right: 14, bottom: 30, left: 56 }

// ── Helpers ──────────────────────────────────────────────────

function fmtEuroCompact(val: number): string {
  const abs = Math.abs(val)
  const sign = val < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}€${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}€${Math.round(abs / 1_000)}k`
  return `${sign}€${Math.round(abs)}`
}

/** 'YYYY-MM' → 'mrt' of "jan '25" (jaar erbij bij januari of eerste tick). */
function formatMonthLabel(iso: string, withYear: boolean): string {
  const [year, month] = iso.split('-')
  const idx = Number(month) - 1
  if (!year || idx < 0 || idx > 11 || Number.isNaN(idx)) return iso
  const base = MONTH_NAMES[idx]
  return withYear ? `${base} '${year.slice(2)}` : base
}

// ── Component ────────────────────────────────────────────────

function NetworthGroupsChartComponent({
  months,
  assetGroups,
  debtGroups,
  rest,
  net,
  provenance,
}: NetworthGroupsChartProps) {
  const { masked } = useMaskedAmounts()
  const { ref, hasEntered } = useInViewAnimation({ duration: 900, forModal: true })
  const uid = useId()
  const locfPatternId = `${uid}-locf`

  const [hovered, setHovered] = useState<number | null>(null)

  // Responsieve breedte (zelfde ResizeObserver-idioom als wealth-composition-chart).
  const [containerW, setContainerW] = useState(560)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setContainerW(Math.round(w))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  const n = months.length
  const isDesktop = containerW >= 768

  // ── Geometrie + afgeleide reeksen (puur op de data-props) ──────────────
  const geo = useMemo(() => {
    const W = containerW
    const H = isDesktop ? 260 : 200
    const innerW = W - PAD.left - PAD.right
    const innerH = H - PAD.top - PAD.bottom

    const prov = (key: string, i: number): ProvenanceState =>
      provenance[key]?.[i] ?? 'measured'

    const assetSumAt = (i: number) =>
      ASSET_ORDER.reduce((s, g) => s + Math.max(0, assetGroups[g]?.[i] ?? 0), 0)
    const debtSumAt = (i: number) =>
      DEBT_ORDER.reduce((s, g) => s + Math.max(0, debtGroups[g]?.[i] ?? 0), 0)
    const restPosAt = (i: number) => {
      const r = rest[i]
      return r != null && r > 0 ? r : 0
    }
    const restNegAt = (i: number) => {
      const r = rest[i]
      return r != null && r < 0 ? -r : 0
    }

    // Y-bereik: positieve top (assets + rest⁺) en negatieve bodem (schulden +
    // rest⁻), plus de netto-lijn zelf (valt hier normaal binnen, maar we nemen
    // 'm mee als vangnet).
    let yMax = 0
    let yMin = 0
    for (let i = 0; i < n; i++) {
      const posTop = assetSumAt(i) + restPosAt(i)
      const negBot = -(debtSumAt(i) + restNegAt(i))
      if (posTop > yMax) yMax = posTop
      if (negBot < yMin) yMin = negBot
      const v = net[i]
      if (v != null) {
        if (v > yMax) yMax = v
        if (v < yMin) yMin = v
      }
    }
    yMax = Math.max(yMax, 1) * 1.08
    yMin = yMin < 0 ? yMin * 1.08 : 0
    const yRange = yMax - yMin

    const xStep = innerW / Math.max(n, 1)
    const barWidth = Math.max(2, xStep * (isDesktop ? 0.62 : 0.7))
    const xAt = (i: number) => PAD.left + xStep * (i + 0.5)
    const yAt = (v: number) => PAD.top + ((yMax - v) / yRange) * innerH
    const yZero = yAt(0)

    // ── Banden per maand ──
    interface Band {
      key: string
      mi: number
      cx: number
      testid: string
      side: 'asset' | 'debt'
      color: string
      yTop: number
      yBottom: number
      state: ProvenanceState
      isRest: boolean
    }
    const bands: Band[] = []
    for (let i = 0; i < n; i++) {
      const cx = xAt(i)
      // Positieve stapel (assets, van nul omhoog) + rest⁺ als bovenste band.
      let cumPos = 0
      for (const g of ASSET_ORDER) {
        const v = Math.max(0, assetGroups[g]?.[i] ?? 0)
        if (v <= 0) continue
        const bottomVal = cumPos
        const topVal = cumPos + v
        cumPos = topVal
        bands.push({
          key: `a-${g}-${i}`,
          mi: i,
          cx,
          testid: `asset-band-${g}`,
          side: 'asset',
          color: WEALTH_GROUP_COLORS[g],
          yTop: yAt(topVal),
          yBottom: yAt(bottomVal),
          state: prov(`asset:${g}`, i),
          isRest: false,
        })
      }
      const rPos = restPosAt(i)
      if (rPos > 0) {
        const bottomVal = cumPos
        const topVal = cumPos + rPos
        bands.push({
          key: `rest-pos-${i}`,
          mi: i,
          cx,
          testid: 'rest-band-positive',
          side: 'asset',
          color: REST_COLOR,
          yTop: yAt(topVal),
          yBottom: yAt(bottomVal),
          state: 'measured',
          isRest: true,
        })
      }

      // Negatieve stapel (schulden, van nul omlaag) + rest⁻ als onderste band.
      let cumNeg = 0
      for (const g of DEBT_ORDER) {
        const v = Math.max(0, debtGroups[g]?.[i] ?? 0)
        if (v <= 0) continue
        const topVal = -cumNeg
        const bottomVal = -(cumNeg + v)
        cumNeg += v
        bands.push({
          key: `d-${g}-${i}`,
          mi: i,
          cx,
          testid: `debt-band-${g}`,
          side: 'debt',
          color: DEBT_GROUP_COLORS[g],
          yTop: yAt(topVal),
          yBottom: yAt(bottomVal),
          state: prov(`debt:${g}`, i),
          isRest: false,
        })
      }
      const rNeg = restNegAt(i)
      if (rNeg > 0) {
        const topVal = -cumNeg
        const bottomVal = -(cumNeg + rNeg)
        bands.push({
          key: `rest-neg-${i}`,
          mi: i,
          cx,
          testid: 'rest-band-negative',
          side: 'debt',
          color: REST_COLOR,
          yTop: yAt(topVal),
          yBottom: yAt(bottomVal),
          state: 'measured',
          isRest: true,
        })
      }
    }

    // ── Netto-lijn: contiguë runs (gebroken op null), per run gesplitst op
    // herkomst (measured → doorlopend, locf → gestippeld). ──
    interface NetPoint { i: number; x: number; y: number; state: ProvenanceState }
    interface NetSegment { d: string; state: ProvenanceState }
    const runs: NetPoint[][] = []
    let current: NetPoint[] = []
    for (let i = 0; i < n; i++) {
      const v = net[i]
      if (v == null) {
        if (current.length) runs.push(current)
        current = []
        continue
      }
      current.push({ i, x: xAt(i), y: yAt(v), state: prov('net', i) })
    }
    if (current.length) runs.push(current)

    const segments: NetSegment[] = []
    for (const run of runs) {
      for (let k = 0; k < run.length - 1; k++) {
        const a = run[k]
        const b = run[k + 1]
        // Een stukje is 'doorgetrokken' (locf) zodra één van beide eindpunten
        // dat is — het overbrugt dan geschatte data.
        const state: ProvenanceState =
          a.state === 'locf' || b.state === 'locf' ? 'locf' : 'measured'
        segments.push({
          d: `M${a.x.toFixed(1)},${a.y.toFixed(1)} L${b.x.toFixed(1)},${b.y.toFixed(1)}`,
          state,
        })
      }
    }

    const allNetPoints: NetPoint[] = runs.flat()
    const manualPoints = allNetPoints.filter((p) => p.state === 'manual')
    // Losse (single-point) runs: rendert een dot zodat een geïsoleerde stand
    // niet onzichtbaar wordt (een run van 1 punt levert geen segment).
    const soloPoints = runs.filter((r) => r.length === 1).map((r) => r[0])

    // ── Y-gridlijnen ──
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
      const val = yMin + yRange * (1 - f)
      return { val, y: PAD.top + innerH * f }
    })

    // ── X-tick-indexen (subset zodat labels niet botsen) ──
    const maxTicks = isDesktop ? 12 : 6
    const tickStep = Math.max(1, Math.ceil(n / maxTicks))
    const xTickIdx: number[] = []
    for (let i = 0; i < n; i += tickStep) xTickIdx.push(i)
    if (n > 0 && xTickIdx[xTickIdx.length - 1] !== n - 1) xTickIdx.push(n - 1)

    return {
      W, H, innerW, innerH, xStep, barWidth,
      yMin, yMax, yZero, yAt, xAt,
      bands, segments, manualPoints, soloPoints, yTicks, xTickIdx,
      assetSumAt, debtSumAt, restPosAt, restNegAt,
    }
  }, [containerW, isDesktop, n, assetGroups, debtGroups, rest, net, provenance])

  // ── Welke groepen/staten komen daadwerkelijk voor (legenda) ──
  const presence = useMemo(() => {
    const assetPresent = ASSET_ORDER.filter((g) =>
      (assetGroups[g] ?? []).some((v) => v > 0),
    )
    const debtPresent = DEBT_ORDER.filter((g) =>
      (debtGroups[g] ?? []).some((v) => v > 0),
    )
    const hasRest = rest.some((r) => r != null && Math.abs(r) > 0.5)
    const states = new Set<ProvenanceState>()
    for (const arr of Object.values(provenance)) {
      for (const s of arr) states.add(s)
    }
    // 'measured' impliciet aanwezig zodra er banden/lijn zijn.
    if (n > 0) states.add('measured')
    const statesPresent = (['measured', 'locf', 'manual'] as ProvenanceState[]).filter(
      (s) => states.has(s),
    )
    return { assetPresent, debtPresent, hasRest, statesPresent }
  }, [assetGroups, debtGroups, rest, provenance, n])

  // Lege reeks → niets renderen (na alle hooks; rules-of-hooks).
  if (n === 0) return null

  const {
    W, H, xStep, barWidth, yZero, xAt,
    bands, segments, manualPoints, soloPoints, yTicks, xTickIdx,
    assetSumAt, debtSumAt, restPosAt, restNegAt,
  } = geo

  const prog = hasEntered ? 1 : 0

  // ── Tooltip-data voor de gehoverde maand ──
  const t = hovered != null && hovered >= 0 && hovered < n ? hovered : null
  const tip =
    t != null
      ? (() => {
          const bezittingen = assetSumAt(t) + restPosAt(t)
          const schulden = debtSumAt(t) + restNegAt(t)
          const netto = net[t]
          const prevNetto = t > 0 ? net[t - 1] : null
          const delta =
            netto != null && prevNetto != null ? netto - prevNetto : null
          return { bezittingen, schulden, netto, delta, month: months[t] }
        })()
      : null

  return (
    <div ref={ref}>
      {/* Hover/tap-info-strip — vaste positie BOVEN de chart zodat ze het
          klikgebied nooit overlapt. Toont totaal bezittingen/schulden, netto en
          de maand-op-maand-delta; nooit entiteitsnamen of per-groep-bedragen.
          `min-height` voorkomt layout-shift bij hover-toggle. */}
      <div
        className="mb-2 min-h-[52px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2"
        role="status"
        aria-live="polite"
      >
        {tip ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-serif text-[13px] font-semibold text-[var(--ink)]">
                {formatMonthLabel(tip.month, true)}
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                  Netto
                </span>
                <span className="font-mono text-[14px] font-semibold tabular-nums text-[var(--ink)]">
                  {tip.netto != null ? formatMaskedCurrency(tip.netto, masked) : '—'}
                </span>
                {tip.delta != null && (
                  <span
                    className={`font-mono text-[11px] tabular-nums ${
                      tip.delta >= 0 ? 'text-positive' : 'text-negative'
                    }`}
                  >
                    {tip.delta >= 0 ? '+' : ''}
                    {formatMaskedCurrency(tip.delta, masked)}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-[var(--ink-2)]">
              <span className="inline-flex items-center gap-1.5">
                Bezittingen
                <span className="font-mono tabular-nums text-[var(--ink-3)]">
                  {formatMaskedCurrency(tip.bezittingen, masked)}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                Schulden
                <span className="font-mono tabular-nums text-[var(--ink-3)]">
                  {formatMaskedCurrency(tip.schulden, masked)}
                </span>
              </span>
            </div>
          </>
        ) : (
          <p className="py-1.5 text-center font-serif text-[11px] italic text-[var(--ink-4)]">
            Beweeg over een maand — of tik — voor bezittingen, schulden en netto
          </p>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Netto vermogen door de tijd — bezittingen boven de nullijn, schulden eronder, met de netto-lijn erdoorheen"
      >
        <defs>
          {/* Diagonaal streep-patroon voor 'doorgetrokken' (LOCF) banden —
              papier-kleurige strepen wassen de band zichtbaar uit. */}
          <pattern
            id={locfPatternId}
            patternUnits="userSpaceOnUse"
            width="4"
            height="4"
            patternTransform="rotate(45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="4"
              stroke="var(--paper)"
              strokeWidth="1.4"
              opacity="0.65"
            />
          </pattern>
        </defs>

        {/* Y-gridlijnen */}
        {yTicks.map(({ val, y }) => (
          <line
            key={`grid-${val}`}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y}
            y2={y}
            stroke="var(--border-ed)"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        ))}

        {/* Y-as-labels (verborgen bij privacy-masking — bedragen) */}
        {!masked &&
          yTicks.map(({ val, y }) => (
            <text
              key={`ylab-${val}`}
              x={PAD.left - 5}
              y={y + 4}
              textAnchor="end"
              fontSize={9}
              fill="var(--ink-4)"
              fontFamily="var(--font-dm-mono, monospace)"
            >
              {fmtEuroCompact(val)}
            </text>
          ))}

        {/* Nul-as (benadrukt) */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={yZero}
          y2={yZero}
          stroke="var(--border-md)"
          strokeWidth={1.5}
        />

        {/* Banden */}
        {bands.map((band) => {
          const y = yZero - (yZero - band.yTop) * prog
          const height = Math.max(0, (band.yBottom - band.yTop) * prog)
          const isHovered = t === band.mi
          const x = band.cx - barWidth / 2
          return (
            <g key={band.key}>
              <rect
                data-testid={band.testid}
                data-provenance={band.state}
                data-side={band.side}
                x={x}
                y={y}
                width={barWidth}
                height={height}
                fill={band.color}
                opacity={band.state === 'locf' ? 0.45 : isHovered ? 1 : 0.85}
                style={{
                  transition: 'opacity 150ms ease, y 0.7s cubic-bezier(.22,1,.36,1), height 0.7s cubic-bezier(.22,1,.36,1)',
                }}
              />
              {/* LOCF-textuur-overlay — 'niet alleen kleur' */}
              {band.state === 'locf' && height > 0 && (
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={height}
                  fill={`url(#${locfPatternId})`}
                  pointerEvents="none"
                />
              )}
            </g>
          )
        })}

        {/* Netto-lijn — per herkomst-segment; GAT bij null (geen bridging) */}
        {segments.map((seg, k) => (
          <path
            key={`net-${k}`}
            data-testid="net-segment"
            data-provenance={seg.state}
            d={seg.d}
            fill="none"
            stroke="var(--ink)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={seg.state === 'locf' ? '3 3' : undefined}
            opacity={hasEntered ? (seg.state === 'locf' ? 0.7 : 0.95) : 0}
            style={{ transition: 'opacity 0.5s ease' }}
          />
        ))}

        {/* Geïsoleerde standen (single-point runs) als dot zichtbaar houden */}
        {soloPoints.map((p) => (
          <circle
            key={`solo-${p.i}`}
            cx={p.x}
            cy={p.y}
            r={2.5}
            fill="var(--ink)"
            opacity={hasEntered ? 0.9 : 0}
            style={{ transition: 'opacity 0.5s ease' }}
          />
        ))}

        {/* Handmatige netto-punten — ring-marker (zoals het sheet handmatige
            standen markeert) */}
        {manualPoints.map((p) => (
          <circle
            key={`manual-${p.i}`}
            data-testid="net-manual-marker"
            cx={p.x}
            cy={p.y}
            r={3.5}
            fill="var(--paper)"
            stroke="var(--ink)"
            strokeWidth={1.75}
            opacity={hasEntered ? 1 : 0}
            style={{ transition: 'opacity 0.5s ease' }}
          />
        ))}

        {/* X-as-labels (maanden, subset) */}
        {xTickIdx.map((i, k) => {
          const iso = months[i]
          const [, mm] = iso.split('-')
          const withYear = k === 0 || mm === '01'
          return (
            <text
              key={`xlab-${i}`}
              x={xAt(i)}
              y={H - 6}
              textAnchor="middle"
              fontSize={9}
              fill="var(--ink-4)"
              fontFamily="var(--font-dm-mono, monospace)"
            >
              {formatMonthLabel(iso, withYear)}
            </text>
          )
        })}

        {/* Transparante hover/tap-zones per maand (volle hoogte) */}
        {months.map((_, i) => (
          <rect
            key={`hit-${i}`}
            data-testid="month-hit"
            data-month-index={i}
            x={PAD.left + xStep * i}
            y={PAD.top}
            width={xStep}
            height={H - PAD.top - PAD.bottom}
            fill="transparent"
            aria-hidden="true"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => setHovered((prev) => (prev === i ? null : i))}
            style={{ cursor: 'pointer', touchAction: 'manipulation' }}
          />
        ))}
      </svg>

      {/* Legenda — groepen die daadwerkelijk voorkomen */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 px-2">
        {presence.assetPresent.map((g) => (
          <LegendSwatch
            key={`la-${g}`}
            color={WEALTH_GROUP_COLORS[g]}
            label={WEALTH_GROUP_LABELS[g]}
          />
        ))}
        {presence.debtPresent.map((g) => (
          <LegendSwatch
            key={`ld-${g}`}
            color={DEBT_GROUP_COLORS[g]}
            label={DEBT_GROUP_LABELS[g]}
          />
        ))}
        {presence.hasRest && <LegendSwatch color={REST_COLOR} label={REST_LABEL} />}
        <span className="inline-flex items-center gap-1.5">
          <svg width="16" height="2" aria-hidden="true">
            <line x1="0" y1="1" x2="16" y2="1" stroke="var(--ink)" strokeWidth="2" />
          </svg>
          <span className="text-[10px] font-medium text-[var(--ink-3)]">{NET_LABEL}</span>
        </span>
      </div>

      {/* Herkomst-legenda — alleen de staten die daadwerkelijk voorkomen */}
      {presence.statesPresent.length > 1 && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1 px-2">
          {presence.statesPresent.map((s) => (
            <span
              key={`prov-${s}`}
              className="inline-flex items-center gap-1.5 text-[10px] text-[var(--ink-3)]"
            >
              {s === 'manual' ? (
                <svg width="10" height="10" aria-hidden="true">
                  <circle
                    cx="5"
                    cy="5"
                    r="3"
                    fill="var(--paper)"
                    stroke="var(--ink)"
                    strokeWidth="1.5"
                  />
                </svg>
              ) : (
                <svg width="16" height="4" aria-hidden="true">
                  <line
                    x1="0"
                    y1="2"
                    x2="16"
                    y2="2"
                    stroke="var(--ink)"
                    strokeWidth="2"
                    strokeDasharray={s === 'locf' ? '3 3' : undefined}
                    opacity={s === 'locf' ? 0.7 : 1}
                  />
                </svg>
              )}
              {PROVENANCE_LABELS[s]}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sub-helpers ──────────────────────────────────────────────

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
        style={{ backgroundColor: color }}
      />
      <span className="text-[10px] font-medium text-[var(--ink-3)]">{label}</span>
    </span>
  )
}

// memo(): de chart re-rendert alleen bij daadwerkelijk gewijzigde props.
export const NetworthGroupsChart = memo(NetworthGroupsChartComponent)
