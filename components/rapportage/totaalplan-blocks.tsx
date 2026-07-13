'use client'

/**
 * Totaalplan — projectie-, slagingskans- en inzichten-blokken.
 *
 * De drie blokken die het gecomponeerde `/rapportages/totaalplan`-rapport
 * bovenop de hergebruikte aannames-blokken (persoonlijk-plan-blocks) legt.
 * Pure presentatie — alle cijfers komen uit het `TotaalplanData`-payload
 * (CONSUME DON'T RECOMPUTE). Geen AI, geen eigen berekeningen.
 *
 * ## Grondslag-scheiding (CLAUDE.md harde regel)
 * Het vermogenspad én de doel-marker staan op grondslag `nettoVermogen`
 * (INCL. eigen woning). De liquide FIRE-pot (`fireLiquidePot`, excl. woning)
 * verschijnt uitsluitend als losse tekstduiding — NOOIT op dezelfde as/marker.
 *
 * De grafiek is een print-safe inline SVG (geen canvas/recharts): `viewBox`
 * + `max-width:100%` maken 'm print- én responsive-veilig. Kleuren via
 * `var(--module-active-*)` (in `.report-pdf-root[data-report-module="horizon"]`
 * overschreven naar print-vaste hexen).
 */

import { formatCurrency, formatWithFreedom } from '@/lib/format'
import { formatFireAge } from '@/lib/horizon-data'
import { STRATEGY_LABELS } from '@/lib/fire-strategy'
import { SectionLabel } from '@/components/editorial'
import { DefinitionRow } from '@/components/rapportage/persoonlijk-plan-blocks'
import type {
  ProjectieData,
  ProjectieVermogenspadPunt,
  SlagingskansData,
  InzichtItem,
} from '@/lib/totaalplan-data'

// ── Lege-staat-primitieven (spiegelt persoonlijk-plan's lege velden) ──

function ReportEmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-source-serif italic text-[13px] text-[var(--ink-3)]">
      {children}
    </p>
  )
}

// ── Vermogenspad-grafiek (print-safe inline SVG) ─────────────────────

const CHART = {
  width: 720,
  height: 260,
  padL: 10,
  padR: 10,
  padT: 18,
  padB: 30,
}

/** Lineaire interpolatie van het netto vermogen op een (fractionele) leeftijd. */
function interpolateNetWorth(pad: ProjectieVermogenspadPunt[], age: number): number {
  if (pad.length === 0) return 0
  if (age <= pad[0].age) return pad[0].nettoVermogen
  const last = pad[pad.length - 1]
  if (age >= last.age) return last.nettoVermogen
  for (let i = 0; i < pad.length - 1; i++) {
    const a = pad[i]
    const b = pad[i + 1]
    if (age >= a.age && age <= b.age) {
      const span = b.age - a.age
      if (span === 0) return a.nettoVermogen
      const t = (age - a.age) / span
      return a.nettoVermogen + t * (b.nettoVermogen - a.nettoVermogen)
    }
  }
  return last.nettoVermogen
}

function VermogenspadChart({ projectie }: { projectie: ProjectieData }) {
  const pad = projectie.vermogenspad
  if (pad.length < 2) {
    return (
      <ReportEmptyState>
        Onvoldoende projectie-punten om een vermogenspad te tekenen.
      </ReportEmptyState>
    )
  }

  const { width, height, padL, padR, padT, padB } = CHART
  const plotW = width - padL - padR
  const plotH = height - padT - padB

  const ages = pad.map((p) => p.age)
  const minAge = ages[0]
  const maxAge = ages[ages.length - 1]
  const ageSpan = maxAge - minAge || 1

  const values = pad.map((p) => p.nettoVermogen)
  const doel = projectie.doelbedragNettoVermogen
  const rawMax = Math.max(...values, doel ?? 0)
  const maxVal = rawMax > 0 ? rawMax * 1.06 : 1
  const minVal = Math.min(0, ...values)
  const valSpan = maxVal - minVal || 1

  const xScale = (age: number) => padL + ((age - minAge) / ageSpan) * plotW
  const yScale = (v: number) => padT + (1 - (v - minVal) / valSpan) * plotH

  const baselineY = yScale(minVal)

  const linePoints = pad.map((p) => `${xScale(p.age).toFixed(1)},${yScale(p.nettoVermogen).toFixed(1)}`).join(' ')
  const areaPoints = `${xScale(minAge).toFixed(1)},${baselineY.toFixed(1)} ${linePoints} ${xScale(maxAge).toFixed(1)},${baselineY.toFixed(1)}`

  const showDoel = doel != null && doel > minVal && doel <= maxVal
  const doelY = showDoel ? yScale(doel) : 0

  const fireAge = projectie.fireAgeFractional ?? projectie.fireAge
  const showFire =
    projectie.fireReachable && fireAge != null && fireAge >= minAge && fireAge <= maxAge
  const fireX = showFire ? xScale(fireAge as number) : 0
  const fireValueY = showFire ? yScale(interpolateNetWorth(pad, fireAge as number)) : 0

  const accent = 'var(--module-active-700)'
  const accentSoft = 'var(--module-active-500)'
  const areaFill = 'var(--module-active-200)'
  const rule = 'var(--rule-soft)'
  const ink3 = 'var(--ink-3)'

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Vermogenspad — netto vermogen inclusief eigen woning, met FIRE-leeftijd en doelbedrag"
      className="mt-1 block h-auto w-full"
      style={{ maxWidth: '100%' }}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* baseline */}
      <line
        x1={padL}
        y1={baselineY}
        x2={width - padR}
        y2={baselineY}
        style={{ stroke: rule }}
        strokeWidth={1}
      />

      {/* gebied onder de lijn */}
      <polygon points={areaPoints} style={{ fill: areaFill, opacity: 0.35 }} />

      {/* doel-lijn (netto vermogen incl. woning) */}
      {showDoel && (
        <>
          <line
            x1={padL}
            y1={doelY}
            x2={width - padR}
            y2={doelY}
            style={{ stroke: accentSoft }}
            strokeWidth={1}
            strokeDasharray="5 4"
          />
          <text
            x={width - padR}
            y={doelY - 5}
            textAnchor="end"
            style={{ fill: accentSoft, fontFamily: 'var(--font-dm-mono, monospace)', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase' }}
          >
            doel {formatCurrency(doel as number)}
          </text>
        </>
      )}

      {/* vermogenspad-lijn */}
      <polyline
        points={linePoints}
        fill="none"
        style={{ stroke: accent }}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* FIRE-marker */}
      {showFire && (
        <>
          <line
            x1={fireX}
            y1={padT}
            x2={fireX}
            y2={baselineY}
            style={{ stroke: accent }}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <circle cx={fireX} cy={fireValueY} r={4} style={{ fill: accent }} />
          <text
            x={fireX}
            y={padT - 6}
            textAnchor="middle"
            style={{ fill: accent, fontFamily: 'var(--font-dm-mono, monospace)', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase' }}
          >
            FIRE
          </text>
        </>
      )}

      {/* x-as leeftijd-labels */}
      <text
        x={padL}
        y={height - 10}
        textAnchor="start"
        style={{ fill: ink3, fontFamily: 'var(--font-dm-mono, monospace)', fontSize: '10px' }}
      >
        {minAge} jr
      </text>
      {showFire && (
        <text
          x={fireX}
          y={height - 10}
          textAnchor="middle"
          style={{ fill: accent, fontFamily: 'var(--font-dm-mono, monospace)', fontSize: '10px' }}
        >
          {Math.floor(fireAge as number)} jr
        </text>
      )}
      <text
        x={width - padR}
        y={height - 10}
        textAnchor="end"
        style={{ fill: ink3, fontFamily: 'var(--font-dm-mono, monospace)', fontSize: '10px' }}
      >
        {maxAge} jr
      </text>
    </svg>
  )
}

// ── ProjectieBlock ───────────────────────────────────────────────────

export function ProjectieBlock({
  projectie,
  dailyExpenseRate,
  num,
}: {
  projectie: ProjectieData
  dailyExpenseRate: number
  num?: string
}) {
  if (!projectie.ok) {
    return (
      <section className="report-section mb-6">
        <SectionLabel num={num}>Vermogensprojectie</SectionLabel>
        <ReportEmptyState>
          Nog geen projectie mogelijk — vul je geboortedatum en FIRE-parameters aan in
          Toekomst, dan verschijnt hier je vermogenspad naar volledige vrijheid.
          {projectie.reason ? ` (${projectie.reason})` : ''}
        </ReportEmptyState>
      </section>
    )
  }

  const strategyLabel = STRATEGY_LABELS[projectie.strategy]?.name ?? projectie.strategy
  const doel = projectie.doelbedragNettoVermogen

  return (
    <section className="report-section mb-6">
      <SectionLabel num={num}>Vermogensprojectie</SectionLabel>

      {/* Kerncijfers als definition-grid */}
      <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
        <DefinitionRow
          label="Vrijheidsleeftijd (FIRE)"
          value={projectie.fireReachable ? formatFireAge(projectie.fireAgeFractional ?? projectie.fireAge) : 'Niet binnen horizon'}
          sub={projectie.fireReachable && projectie.fireCalendarYear != null ? `in het jaar ${projectie.fireCalendarYear}` : undefined}
        />
        <DefinitionRow
          label="Eindstrategie"
          value={strategyLabel}
          sub={STRATEGY_LABELS[projectie.strategy]?.subtitle}
        />
        <DefinitionRow
          label="Doelbedrag — netto vermogen (incl. eigen woning)"
          value={doel != null ? formatCurrency(doel) : null}
          sub={doel != null ? `${formatWithFreedom(doel, dailyExpenseRate, { includeCurrency: false })} vrijheid` : undefined}
        />
        <DefinitionRow
          label="Eindwaarde netto vermogen"
          value={formatCurrency(projectie.eindwaardeNettoVermogen)}
          sub={`${formatWithFreedom(projectie.eindwaardeNettoVermogen, dailyExpenseRate, { includeCurrency: false })} vrijheid · op ${projectie.displayEndAge} jaar`}
        />
      </div>

      {/* Vermogenspad — grondslag expliciet benoemd */}
      <div className="mt-5 border border-[var(--border-ed)] p-3 sm:p-4">
        <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
          Vermogenspad — netto vermogen (inclusief eigen woning)
        </p>
        <VermogenspadChart projectie={projectie} />
      </div>

      {/* Liquide FIRE-pot — losse tekstduiding, bewust NIET op de as hierboven */}
      {projectie.fireLiquidePot > 0 && (
        <p
          className="mt-3 text-[12px] italic text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          Ter duiding: de <strong className="not-italic font-semibold text-[var(--ink-2)]">liquide FIRE-pot</strong> — je
          belegbare vermogen exclusief de eigen woning — is {formatCurrency(projectie.fireLiquidePot)} (
          {formatWithFreedom(projectie.fireLiquidePot, dailyExpenseRate, { includeCurrency: false })} vrijheid). Dat is een
          andere grootheid dan het netto vermogen hierboven en staat daarom bewust niet op dezelfde as.
        </p>
      )}
    </section>
  )
}

// ── SlagingskansBlock ────────────────────────────────────────────────

/** Gewone-taal-duiding bij een slaagkans (stoplicht-semantiek, geen module-accent). */
function slagingskansDuiding(p: number): { label: string; tone: 'positive' | 'neutral' | 'negative' } {
  if (p >= 0.85) return { label: 'Zeer waarschijnlijk', tone: 'positive' }
  if (p >= 0.7) return { label: 'Waarschijnlijk', tone: 'positive' }
  if (p >= 0.5) return { label: 'Onzeker — de marges zijn krap', tone: 'neutral' }
  return { label: 'Kwetsbaar — het plan houdt lang niet altijd stand', tone: 'negative' }
}

export function SlagingskansBlock({
  slagingskans,
  num,
}: {
  slagingskans: SlagingskansData
  num?: string
}) {
  const p = slagingskans.successProbability
  const hasValue = slagingskans.ok && p != null

  return (
    <section className="report-section mb-6">
      <SectionLabel num={num}>Slagingskans van je plan</SectionLabel>

      {!hasValue ? (
        <ReportEmptyState>
          Nog geen slagingskans te berekenen — die verschijnt zodra je projectie compleet is.
        </ReportEmptyState>
      ) : (
        <div className="border border-[var(--border-ed)] p-4">
          {(() => {
            const pct = Math.round((p as number) * 100)
            const duiding = slagingskansDuiding(p as number)
            const toneClass =
              duiding.tone === 'positive'
                ? 'text-[var(--positive)]'
                : duiding.tone === 'negative'
                  ? 'text-[var(--negative)]'
                  : 'text-[var(--ink)]'
            return (
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span
                  className={`font-playfair text-[40px] font-bold leading-none tabular-nums ${toneClass}`}
                  style={{ letterSpacing: '-0.02em' }}
                >
                  {pct}%
                </span>
                <span className="font-source-serif text-[15px] italic text-[var(--ink-2)]">
                  {duiding.label}
                </span>
              </div>
            )
          })()}
          <p className="mt-3 font-source-serif text-[13px] leading-snug text-[var(--ink-3)]">
            De kans dat je plan het over de volledige horizon volhoudt — gebaseerd op{' '}
            <span className="tabular-nums">{slagingskans.runs}</span> Monte-Carlo-simulaties die je rendement,
            inflatie en marktschommelingen laten variëren. Geen garantie, wel een eerlijke stresstest.
          </p>
        </div>
      )}
    </section>
  )
}

// ── InzichtenBlock ───────────────────────────────────────────────────

export function InzichtenBlock({
  inzichten,
  num,
}: {
  inzichten: InzichtItem[]
  num?: string
}) {
  return (
    <section className="report-section mb-6">
      <SectionLabel num={num}>Inzichten & kansen</SectionLabel>

      {inzichten.length === 0 ? (
        <ReportEmptyState>
          Geen directe verbeterpunten gevonden — je plan laat op dit moment geen laaghangend fruit zien.
        </ReportEmptyState>
      ) : (
        <ol className="space-y-2">
          {inzichten.map((item, idx) => {
            const days = Math.round(item.freedomDays)
            return (
              <li key={item.id} className="border border-[var(--border-ed)] p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-source-serif text-[14px] font-medium text-[var(--ink)]">
                    <span className="mr-2 font-playfair italic text-[var(--module-active-700)]" aria-hidden>
                      {idx + 1}.
                    </span>
                    {item.title}
                  </p>
                  {days > 0 && (
                    <span className="shrink-0 whitespace-nowrap font-dm-mono text-[12px] font-medium tabular-nums text-[var(--module-active-700)]">
                      ≈ {days} {days === 1 ? 'dag' : 'dagen'} vrijheid
                    </span>
                  )}
                </div>
                {item.detail && (
                  <p className="mt-1 font-source-serif text-[12px] leading-snug text-[var(--ink-3)]">
                    {item.detail}
                  </p>
                )}
                {item.savingsPerYear > 0 && (
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                    ~{formatCurrency(item.savingsPerYear)} per jaar
                  </p>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
