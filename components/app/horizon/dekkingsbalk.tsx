'use client'

import { ankerReachesAge, DEKKINGSAS_COPY, eindvermogenTegelCaption, type AnkerReach } from '@/lib/horizon/anker-copy'
import { leeftijdJaar } from '@/lib/horizon/leeftijd-jaar'
import { formatCurrency } from '@/lib/format'

/**
 * De DEKKINGSAS (spec lab-haalbaarheid §1, 15 sep 2026): één horizontale schaal van het
 * stopmoment van het plan tot de eindleeftijd, gevuld tot waar het plan reikt; de
 * wat-als-run en het verkende stopmoment zetten extra markeringen. Puur presentational —
 * elke waarde komt uit `resolveLabUitkomst` (ADR 0145), hier wordt niets herrekend.
 * Stoplichtkleur op de vulling (tekort = warning, gedekt = positive), nooit een module-accent.
 */
export interface DekkingsasData {
  /** Het stopmoment van het plan als leeftijd (`now` → huidige leeftijd); `null` = onbekend. */
  stopAge: number | null
  /** Eindleeftijd van het plan (`displayEndAge`). */
  eindAge: number | null
  basisReach: AnkerReach
  basisPct: number | null
  /** Wat-als-run; `null` zonder scenario. */
  scenarioReach: AnkerReach | null
  scenarioPct: number | null
  /** Verkend stopmoment (stop-pad); `null` zonder stopkeuze. */
  verkendReach: AnkerReach | null
  verkendStopAge: number | null
  /**
   * EINDVERMOGEN op de eindleeftijd (ADR 0145 D12) — in euro's van nu, GEDEFLATEERD DOOR DE
   * AANROEPER. Dit component formatteert alleen; het kent de euro-weergave niet en deelt
   * nooit zelf door een inflatiefactor (ADR 0090/0093: één omzetting, in de render-grens van
   * horizon-client). `null` = niets te tonen — óók de privacy-weergave levert `null`, zodat
   * er geen tweede maskeer-pad naast de bestaande ontstaat.
   */
  basisEindvermogen: number | null
  /** Idem voor de wat-als-run; `null` zonder scenario (of gemaskeerd). */
  scenarioEindvermogen: number | null
}

function posOf(reach: AnkerReach, stopAge: number, eindAge: number): number {
  if (reach.kind === 'gedekt') return 100
  if (reach.kind === 'nu-op') return 0
  const age = ankerReachesAge(reach)
  if (age == null) return 0
  const clamped = Math.max(stopAge, Math.min(eindAge, age))
  return ((clamped - stopAge) / (eindAge - stopAge)) * 100
}

/** Posities (0–100 %) op de as stop→eind; `null` zonder bruikbare as. */
export function dekkingsbalkPosities(d: DekkingsasData): { basisPct: number; scenarioPct: number | null; verkendPct: number | null } | null {
  if (d.stopAge == null || d.eindAge == null || !(d.eindAge > d.stopAge)) return null
  return {
    basisPct: posOf(d.basisReach, d.stopAge, d.eindAge),
    scenarioPct: d.scenarioReach ? posOf(d.scenarioReach, d.stopAge, d.eindAge) : null,
    verkendPct: d.verkendReach ? posOf(d.verkendReach, d.stopAge, d.eindAge) : null,
  }
}

function reachLabel(reach: AnkerReach | null, eindAge: number | null): string {
  if (!reach) return '—'
  switch (reach.kind) {
    case 'gedekt': return eindAge != null ? `voorbij ${leeftijdJaar(eindAge)}` : 'einde plan'
    case 'reikt-tot': return String(leeftijdJaar(reach.age))
    case 'nu-op': return 'nu'
    case 'onbekend': return '—'
  }
}

/** Zelfde afrondingsregel als `fmtPct` in anker-copy.ts: nooit "100%" bij een tekort. */
function pctLabel(pct: number | null): string {
  if (pct == null) return '—'
  return `${pct >= 100 ? 100 : Math.min(99, Math.round(pct))}%`
}

/**
 * Het eindvermogen als tegelwaarde. `null` (geen run, of de privacy-weergave) geeft de
 * drie puntjes — bewust geen "—": daar leest een lezer "niet van toepassing", terwijl het
 * hier "niet getoond/nog niet bekend" is.
 */
const GEEN_BEDRAG = '···'
function euroLabel(value: number | null): string {
  return value == null ? GEEN_BEDRAG : formatCurrency(value)
}

function Tegel({ kicker, value, testId, sub }: { kicker: string; value: string; testId: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">{kicker}</div>
      <div data-testid={testId} className="mt-0.5 font-mono text-sm tabular-nums text-[var(--ink)]">{value}</div>
      {sub && <p className="mt-0.5 font-sans text-[10px] leading-snug text-[var(--ink-4)]">{sub}</p>}
    </div>
  )
}

export function Dekkingsbalk({ data }: { data: DekkingsasData }) {
  const pos = dekkingsbalkPosities(data)
  const gedekt = data.basisReach.kind === 'gedekt'
  const vulling = gedekt ? 'bg-positive' : 'bg-warning'
  const basisPctNum = data.basisPct == null ? 0 : Math.max(0, Math.min(100, Math.round(data.basisPct)))
  const arrow = (a: string, b: string | null) => (b != null && b !== a ? `${a} → ${b}` : a)

  return (
    <div>
      <div
        role="meter"
        aria-label="Dekking van je plan"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={basisPctNum}
        className="relative mt-6 h-2.5 overflow-hidden rounded-full bg-[var(--border-ed)]"
      >
        {pos && (
          <>
            <div data-testid="dekkingsbalk-vulling" className={`h-full ${vulling}`} style={{ width: `${pos.basisPct}%` }} />
            {pos.scenarioPct != null && (
              <div aria-hidden className="absolute -top-1 h-[18px] w-px -translate-x-1/2 bg-[var(--ink)]" style={{ left: `${pos.scenarioPct}%` }} />
            )}
            {pos.verkendPct != null && (
              <div aria-hidden className="absolute -top-1 h-[18px] w-px -translate-x-1/2 border-l border-dashed border-[var(--ink-3)]" style={{ left: `${pos.verkendPct}%` }} />
            )}
          </>
        )}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--ink-4)]">
        <span>{data.stopAge != null ? `stop ${leeftijdJaar(data.stopAge)}` : 'stop'}</span>
        <span>{data.eindAge != null ? `plan tot ${leeftijdJaar(data.eindAge)}` : 'eind'}</span>
      </div>
      {/* Drie verandercomponenten, basis → wat-als (spec antwoorden-naast-sliders §4):
          Gedekt · Reikt tot · Eindvermogen — de uitkomst eerst, dan waar het reikt, dan
          wat er over is. */}
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--border-ed)] pt-4">
        <Tegel kicker={DEKKINGSAS_COPY.tegelGedekt} testId="dekkingsbalk-gedekt" value={arrow(pctLabel(data.basisPct), data.scenarioPct != null ? pctLabel(data.scenarioPct) : null)} />
        <Tegel kicker={DEKKINGSAS_COPY.tegelReikt} testId="dekkingsbalk-reikt" value={arrow(reachLabel(data.basisReach, data.eindAge), data.scenarioReach ? reachLabel(data.scenarioReach, data.eindAge) : null)} />
        {/* ADR 0145 D12 — wat er op de eindleeftijd over is. Staat waar "Plan tot" stond; die
            eindleeftijd noemt de as onder de balk al ("plan tot 90"). Het sub-label hoort bij
            déze tegel, dus staat het eronder i.p.v. onder de hele rij. */}
        <Tegel
          kicker={DEKKINGSAS_COPY.tegelEindvermogen}
          testId="dekkingsbalk-eindvermogen"
          value={arrow(
            euroLabel(data.basisEindvermogen),
            data.scenarioEindvermogen != null ? euroLabel(data.scenarioEindvermogen) : null,
          )}
          sub={eindvermogenTegelCaption(data.eindAge)}
        />
      </div>
    </div>
  )
}
