'use client'

import { useId, useMemo, useState } from 'react'
import { ChevronDown, AlertTriangle } from 'lucide-react'
import {
  SectionLabel,
  RekeningTag,
  HighlightMark,
  FiguresStrip,
  type FigureProps,
} from '@/components/editorial'
import { useModalAnimation } from '@/lib/hooks/use-modal-animation'
import { JaarruimteCard } from '@/components/overview/jaarruimte-card'
import {
  JAARRUIMTE_TITLE,
  JAARRUIMTE_CAVEAT,
  NEGATIVE_HATCH_CSS,
  type Opportunity,
} from './optimizer-model'
import type { GoalSection, ShiftCurvePoint, TaxTrajectory } from '@/lib/tax-optimizer/types'
import type { TaxYear } from '@/lib/box3-data'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

function signed(value: number, fc: (v: number) => string): string {
  if (value === 0) return fc(0)
  return `${value > 0 ? '+ ' : '− '}${fc(Math.abs(value))}`
}

/** Eén rij van de accordeon: een kans, of de jaarruimte-kaart zonder cijfers. */
type DetailRow = {
  id: string
  title: string
  netEffect: number | null
  opportunity: Opportunity | null
}

/**
 * Katern III — "Inzoomen per kans". Detail op aanvraag: elke kans begint
 * ingeklapt, er staat er maximaal één tegelijk open. Box 3-kansen tonen een
 * kassabon (heffing nu → besparing → misgelopen rendement → netto effect); de
 * jaarruimte hergebruikt de bestaande `JaarruimteCard`.
 */
export function OptimizerDetails({
  opportunities,
  jaarruimteSection,
  openId,
  onToggle,
  fc,
  year,
}: {
  /** In de volgorde van de vergelijking. */
  opportunities: Opportunity[]
  jaarruimteSection?: Extract<GoalSection, { kind: 'jaarruimte' }>
  openId: string | null
  onToggle: (id: string) => void
  fc: (v: number) => string
  year: TaxYear
}) {
  const rows: DetailRow[] = opportunities.map((o) => ({
    id: o.id,
    title: o.title,
    netEffect: o.netEffect,
    opportunity: o,
  }))

  // De jaarruimte-kaart blijft bereikbaar wanneer er (nog) geen doorgerekende
  // besparing is — de kaart toont dan zelf de "vul je inkomen aan"-melding.
  const hasJaarruimteRow = rows.some((r) => r.opportunity?.kind === 'jaarruimte')
  if (jaarruimteSection && !hasJaarruimteRow) {
    rows.push({
      id: 'jaarruimte-maximaal',
      title: JAARRUIMTE_TITLE,
      netEffect: null,
      opportunity: null,
    })
  }

  if (rows.length === 0) return null

  return (
    <section id="optimizer-uitwerking" className="scroll-mt-24">
      <SectionLabel num="III">De uitwerking</SectionLabel>
      <div className="-mt-3 mb-4">
        <h2
          className="text-[22px] sm:text-[26px] font-black leading-tight tracking-[-0.02em] text-[var(--ink)]"
          style={{ fontFamily: PLAYFAIR }}
        >
          Inzoomen per{' '}
          <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
            kans
          </em>
        </h2>
        <p
          className="mt-1.5 max-w-[64ch] text-sm italic leading-snug text-[var(--ink-2)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          Eén kans tegelijk uitgeklapt, de rest compact. Elke uitwerking volgt dezelfde opbouw:
          de rekening, de aannames en de kanttekening.
        </p>
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const open = openId === row.id
          return (
            <div
              key={row.id}
              id={`optimizer-detail-${row.id}`}
              className={`scroll-mt-24 bg-[var(--paper)] ${
                open ? 'border border-[var(--ink)]' : 'border border-[var(--border-ed)]'
              }`}
            >
              <button
                type="button"
                onClick={() => onToggle(row.id)}
                aria-expanded={open}
                aria-controls={`optimizer-detail-body-${row.id}`}
                className="flex min-h-[44px] w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              >
                <span className="text-[13.5px] font-semibold leading-snug text-[var(--ink)]">
                  {row.title}
                </span>
                <span className="ml-auto flex items-baseline gap-3">
                  {row.netEffect !== null && (
                    <span className="whitespace-nowrap font-mono text-[12px] tabular-nums text-[var(--ink-3)]">
                      netto{' '}
                      <span
                        style={{
                          color:
                            row.netEffect > 0
                              ? 'var(--positive)'
                              : row.netEffect < 0
                                ? 'var(--negative)'
                                : 'var(--ink-2)',
                        }}
                      >
                        {signed(row.netEffect, fc)}/jr
                      </span>
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    {open ? 'Verberg' : 'Toon uitwerking'}
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </span>
                </span>
              </button>

              {open && (
                <div
                  id={`optimizer-detail-body-${row.id}`}
                  className="border-t border-dotted border-[var(--rule-soft)] px-4 pb-5 pt-4 sm:px-5"
                >
                  {row.opportunity && row.opportunity.kind === 'box3' ? (
                    <Box3Uitwerking opportunity={row.opportunity} fc={fc} />
                  ) : (
                    jaarruimteSection && (
                      <div>
                        <JaarruimteCard
                          grossYearlyIncome={jaarruimteSection.grossYearlyIncome}
                          pensioenAangroei={jaarruimteSection.pensionFactorA}
                          year={year}
                          dailyExpenses={jaarruimteSection.dailyExpenses}
                        />
                        <Caveat text={JAARRUIMTE_CAVEAT} />
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** Kassabon + verdict + uitlegbaarheid voor één Box 3-scenario. */
function Box3Uitwerking({
  opportunity,
  fc,
}: {
  opportunity: Opportunity
  fc: (v: number) => string
}) {
  const s = opportunity.strategy
  if (!s) return null
  const negative = opportunity.netEffect < 0
  // Een verkenner heeft pas betekenis vanaf twee doorgerekende punten.
  const curve =
    opportunity.shiftCurve && opportunity.shiftCurve.length > 1 ? opportunity.shiftCurve : null

  return (
    <div>
      <p
        className="mb-4 max-w-[62ch] text-sm italic leading-snug text-[var(--ink-2)]"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        {opportunity.description}
      </p>

      {opportunity.trajectory && <VerloopStrip trajectory={opportunity.trajectory} fc={fc} />}

      <div className={curve ? 'grid items-start gap-6 lg:grid-cols-2' : undefined}>
        <div>
          {curve && (
            <p className="mb-3 max-w-[52ch] font-mono text-[10px] leading-relaxed text-[var(--ink-3)]">
              De verkenner verkent tussenstanden; de rekening en de vergelijking in katern II
              rekenen met de volledige verschuiving.
            </p>
          )}
          <RekeningTag label="rekening">
            <ReceiptRow
              label={`Heffing ${s.currentLabel.toLowerCase()} (referentie)`}
              amount={`${fc(s.currentTax)}/jr`}
            />
            <ReceiptRow
              label="Belastingbesparing in dit scenario"
              amount={`− ${fc(opportunity.savings)}`}
              color="var(--positive)"
            />
            {opportunity.returnCostEur > 0 && (
              <ReceiptRow
                label="Verwacht misgelopen rendement"
                amount={`+ ${fc(opportunity.returnCostEur)}`}
                color="var(--negative)"
              />
            )}
            <ReceiptRow
              label="Netto effect per jaar"
              amount={`${signed(opportunity.netEffect, fc)}/jr`}
              color={negative ? 'var(--negative)' : 'var(--positive)'}
              total
            />
            <p
              className="mt-2.5 text-[11.5px] italic leading-snug text-[var(--ink-3)]"
              style={{ fontFamily: SOURCE_SERIF }}
            >
              {opportunity.netFreedomDays > 0
                ? `Per saldo koop je hiermee ongeveer ${opportunity.netFreedomDays} vrijheidsdagen per jaar terug.`
                : 'Per saldo koop je hiermee geen vrijheidsdagen terug.'}
            </p>
          </RekeningTag>
        </div>

        {curve && <ShiftVerkenner points={curve} fc={fc} />}
      </div>

      {negative && (
        <div
          className="mt-4 px-3.5 py-2.5 text-[13px] leading-snug text-[var(--ink-2)]"
          style={{
            borderLeft: '3px solid var(--negative)',
            background: 'color-mix(in srgb, var(--negative) 6%, var(--paper))',
          }}
        >
          Per saldo <strong style={{ color: 'var(--negative)' }}>kost dit scenario je geld</strong>.
          Het staat in de vergelijking omdat het je heffing wél verlaagt — tegen deze aannames koop
          je er geen vrijheid mee terug.
        </div>
      )}

      {opportunity.detail.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
          {opportunity.detail.map((d, i) => (
            <li key={i} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-3)]">
              <span aria-hidden className="inline-block h-1 w-1 rounded-full bg-[var(--ink-4)]" />
              {d}
            </li>
          ))}
        </ul>
      )}

      {opportunity.caveat && <Caveat text={opportunity.caveat} />}
    </div>
  )
}

function ReceiptRow({
  label,
  amount,
  color,
  total = false,
}: {
  label: string
  amount: string
  color?: string
  total?: boolean
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-2 ${
        total
          ? 'border-b-4 border-double border-[var(--ink)] font-bold'
          : 'border-b border-dotted border-[var(--rule-soft)]'
      }`}
    >
      <span className="text-[13px] text-[var(--ink-2)]" style={{ fontFamily: SOURCE_SERIF }}>
        {label}
      </span>
      <span
        className="whitespace-nowrap font-mono text-[13px] tabular-nums"
        style={{ color: color ?? 'var(--ink)' }}
      >
        {/* Sluitrij = hoofduitkomst van de kassabon → verplichte
            highlight-marker (quality-checklist: één per sectie). */}
        {total ? <HighlightMark>{amount}</HighlightMark> : amount}
      </span>
    </div>
  )
}

/**
 * Verloop-strip: de heffing over de jaren voor déze kans. Alle drie de waarden
 * komen uit het GELEVERDE `trajectory` — geen indexatie of extrapolatie hier.
 * Een jaar zonder waarde toont een em-streepje.
 */
function VerloopStrip({
  trajectory,
  fc,
}: {
  trajectory: TaxTrajectory
  fc: (v: number) => string
}) {
  const figures: FigureProps[] = [
    {
      kicker: '2025',
      amount: trajectory.tax2025 === null ? '—' : `${fc(trajectory.tax2025)}/jr`,
      sub: 'heffing',
    },
    { kicker: '2026', amount: `${fc(trajectory.tax2026)}/jr`, sub: 'heffing' },
    {
      kicker: '2028',
      amount:
        trajectory.tax2028Indicatie === null
          ? '—'
          : `≈ ${fc(trajectory.tax2028Indicatie)}/jr`,
      sub: 'indicatie beoogd stelsel',
    },
  ]
  return (
    <div>
      <div className="font-mono text-[9.5px] uppercase tracking-[0.20em] text-[var(--ink-3)]">
        Heffing over de jaren
      </div>
      <FiguresStrip cols={3} figures={figures} />
    </div>
  )
}

// ── Verkenner: de doorgerekende shift-curve ──────────────────────
//
// Chart-geometrie in viewBox-eenheden; het SVG schaalt mee met zijn kolom.
const CHART_W = 320
const CHART_H = 150
const PLOT_L = 6
const PLOT_R = 6
const PLOT_T = 10
/** y van de nul-as. */
const PLOT_B = 118
const PLOT_W = CHART_W - PLOT_L - PLOT_R
const PLOT_H = PLOT_B - PLOT_T

// Gearceerd negatief-patroon: één gedeeld recept (optimizer-model.ts) voor
// legenda, katern II-balken én de SVG-pattern hieronder.

/**
 * De shift-curve als verkenning: per verschoven bedrag de GELEVERDE besparing
 * en de GELEVERDE verwachte rendementskosten. De slider snapt op de punten zelf
 * (index-based) — er wordt niet geïnterpoleerd en er wordt hier geen enkele
 * belasting- of rendementssom gemaakt.
 *
 * Beide series zijn ≥ 0, dus één schaal vanaf de nul-as volstaat; het netto
 * effect is de verticale afstand tussen de lijnen en staat numeriek in de
 * uitlezing. De kosten-serie draagt zijn negatieve karakter via het gearceerde
 * vlak (zelfde patroon als katern II) i.p.v. een dash-stroke, zodat de lijn de
 * canonieke `pathLength`-tekenanimatie kan gebruiken.
 */
function ShiftVerkenner({
  points,
  fc,
}: {
  points: ShiftCurvePoint[]
  fc: (v: number) => string
}) {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, '')
  const sliderId = `shift-slider-${rawId}`
  const hatchId = `shift-hatch-${rawId}`

  // Het paneel mount pas bij het openklappen en is dan direct zichtbaar →
  // mount-getriggerde animatie, niet de scroll-observer.
  const { hasEntered } = useModalAnimation({ duration: 780 })

  // Default-stand: het punt met het hoogste netto effect; is alles ≤ 0, dan de
  // kleinste verschuiving (index 0).
  const bestIndex = useMemo(() => {
    let idx = 0
    let best = -Infinity
    points.forEach((p, i) => {
      if (p.netEffect > best) {
        best = p.netEffect
        idx = i
      }
    })
    return best > 0 ? idx : 0
  }, [points])
  const [index, setIndex] = useState(bestIndex)

  const last = points.length - 1
  const i = Math.min(Math.max(index, 0), last)
  const selected = points[i]

  const maxY = Math.max(...points.map((p) => Math.max(p.savings, p.returnCostEur)), 1)
  const px = (n: number) => PLOT_L + (n / last) * PLOT_W
  const py = (v: number) => PLOT_B - (Math.max(v, 0) / maxY) * PLOT_H

  const linePath = (pick: (p: ShiftCurvePoint) => number) =>
    points
      .map((p, n) => `${n === 0 ? 'M' : 'L'}${px(n).toFixed(1)},${py(pick(p)).toFixed(1)}`)
      .join(' ')

  const savingsPath = linePath((p) => p.savings)
  const costPath = linePath((p) => p.returnCostEur)
  const costArea = `${costPath} L${px(last).toFixed(1)},${PLOT_B} L${px(0).toFixed(1)},${PLOT_B} Z`

  /** Canonieke lijn-teken-animatie: 700ms, `.22,1,.36,1`, 80ms stagger per lijn. */
  const draw = (delayMs: number): React.CSSProperties => ({
    strokeDashoffset: hasEntered ? 0 : 1,
    transition: hasEntered
      ? `stroke-dashoffset 700ms cubic-bezier(.22,1,.36,1) ${delayMs}ms`
      : 'none',
  })

  return (
    <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.20em] text-[var(--ink-3)]">
        Verkenning
      </div>
      <p
        className="mt-1 mb-3 max-w-[48ch] text-[12px] italic leading-snug text-[var(--ink-2)]"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        Elk punt op deze curve is apart doorgerekend. Schuif om te zien waar de besparing en de
        verwachte rendementskosten elkaar naderen.
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-[2px] w-4"
            style={{ background: 'var(--color-box3-600)' }}
          />
          besparing
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-4"
            style={{ backgroundImage: NEGATIVE_HATCH_CSS }}
          />
          rendementskosten
        </span>
      </div>

      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Doorgerekende verschuiving van ${fc(points[0].shifted)} tot ${fc(
          points[last].shifted,
        )}: besparing tegenover verwachte rendementskosten per jaar.`}
      >
        <defs>
          {/* Zelfde dichtheid als NEGATIVE_HATCH_CSS: 5px-tegel = 2px streep +
              3px 30%-tint — legenda en vulling lezen identiek. */}
          <pattern
            id={hatchId}
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect
              width="5"
              height="5"
              fill="color-mix(in srgb, var(--negative) 30%, transparent)"
            />
            <line x1="1" y1="0" x2="1" y2="5" stroke="var(--negative)" strokeWidth="2" />
          </pattern>
        </defs>

        <line
          x1={PLOT_L}
          y1={PLOT_B}
          x2={PLOT_L + PLOT_W}
          y2={PLOT_B}
          stroke="var(--ink)"
          strokeWidth="1"
        />

        {/* Gekozen punt: hairline over de volle plothoogte. */}
        <line
          x1={px(i)}
          y1={PLOT_T}
          x2={px(i)}
          y2={PLOT_B}
          stroke="var(--ink)"
          strokeWidth="1"
          strokeDasharray="2 3"
          opacity="0.5"
        />

        <path
          d={costArea}
          fill={`url(#${hatchId})`}
          opacity={hasEntered ? 1 : 0}
          style={{ transition: hasEntered ? 'opacity 250ms ease-out 455ms' : 'none' }}
        />
        <path
          d={costPath}
          fill="none"
          stroke="var(--negative)"
          strokeWidth="1.5"
          pathLength={1}
          strokeDasharray="1"
          style={draw(80)}
        />
        <path
          d={savingsPath}
          fill="none"
          stroke="var(--color-box3-600)"
          strokeWidth="2"
          pathLength={1}
          strokeDasharray="1"
          style={draw(0)}
        />

        <circle
          cx={px(i)}
          cy={py(selected.returnCostEur)}
          r="3"
          fill="var(--paper)"
          stroke="var(--negative)"
          strokeWidth="1.5"
        />
        <circle
          cx={px(i)}
          cy={py(selected.savings)}
          r="3.5"
          fill="var(--paper)"
          stroke="var(--color-box3-600)"
          strokeWidth="2"
        />

        <text
          x={PLOT_L}
          y={CHART_H - 8}
          textAnchor="start"
          fontSize="9"
          className="fill-[var(--ink-4)] font-mono"
        >
          {fc(points[0].shifted)}
        </text>
        <text
          x={PLOT_L + PLOT_W}
          y={CHART_H - 8}
          textAnchor="end"
          fontSize="9"
          className="fill-[var(--ink-4)] font-mono"
        >
          {fc(points[last].shifted)}
        </text>
      </svg>

      <label
        htmlFor={sliderId}
        className="mt-3 block font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]"
      >
        Hoeveel verschuiven?
      </label>
      <div className="flex min-h-[44px] items-center">
        <input
          id={sliderId}
          type="range"
          min={0}
          max={last}
          step={1}
          value={i}
          onChange={(e) => setIndex(Number(e.target.value))}
          className="slider-module w-full"
          aria-valuetext={`${fc(selected.shifted)} verschoven — netto ${signed(
            selected.netEffect,
            fc,
          )} per jaar`}
        />
      </div>

      <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-dotted border-[var(--rule-soft)] pt-3">
        <VerkendCijfer label="Verschoven" value={fc(selected.shifted)} />
        <VerkendCijfer
          label="Besparing"
          value={`${fc(selected.savings)}/jr`}
          color="var(--color-box3-700)"
        />
        <VerkendCijfer
          label="Rendementskosten"
          value={selected.returnCostEur > 0 ? `− ${fc(selected.returnCostEur)}/jr` : fc(0)}
          color={selected.returnCostEur > 0 ? 'var(--negative)' : undefined}
        />
        <VerkendCijfer
          label="Netto effect"
          value={`${signed(selected.netEffect, fc)}/jr`}
          color={
            selected.netEffect > 0
              ? 'var(--positive)'
              : selected.netEffect < 0
                ? 'var(--negative)'
                : undefined
          }
        />
      </dl>
    </div>
  )
}

function VerkendCijfer({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div>
      <dt className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[var(--ink-3)]">
        {label}
      </dt>
      <dd
        className="mt-0.5 font-mono text-[13px] tabular-nums"
        style={{ color: color ?? 'var(--ink)' }}
      >
        {value}
      </dd>
    </div>
  )
}

function Caveat({ text }: { text: string }) {
  return (
    <div className="mt-3 flex items-start gap-2 border-t border-[var(--rule-soft)] pt-3">
      <AlertTriangle
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]"
        aria-hidden="true"
      />
      <p className="max-w-[62ch] text-xs leading-snug text-[var(--ink-2)]">{text}</p>
    </div>
  )
}
