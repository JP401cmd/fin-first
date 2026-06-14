'use client'

/**
 * Horizon grootboek — gedeelde, pure presentatie-views.
 *
 * Hier wonen de FIRE-grafiek, de tabellen A–G, de "Opbouw per onderdeel"-view
 * en de v1↔v2-vergelijking, ALLEMAAL als pure componenten die een
 * `HorizonLedgerResult` (+ optioneel `aowAge`) als prop nemen. Geen state, geen
 * fetch, geen persona-logica — zo kunnen zowel de persona-inspector (synthetische
 * data) als de "mijn data"-pagina (echte data via de API) exact dezelfde weergave
 * tonen.
 *
 * Engine v2 · tabel-georiënteerd · reëel (koopkracht nu).
 */

import { useMemo, useState } from 'react'
import {
  Wallet,
  Scale,
  ArrowLeftRight,
  Landmark,
  TrendingDown,
  CalendarClock,
  PiggyBank,
  Layers,
  GitCompareArrows,
} from 'lucide-react'

import {
  buildChartSeries,
  keyAges,
  rollupByType,
  type HorizonLedgerResult,
  type LedgerRow,
  type TypeRollup,
} from '@/lib/horizon-engine'
import { ASSET_TYPE_LABELS, type AssetType } from '@/lib/asset-data'

export const DEFAULT_AOW_AGE = 67

// ── Formatters ───────────────────────────────────────────────────

const EUR = new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

export function eur(n: number): string {
  return EUR.format(Math.round(n))
}

/** Compacte as-/tick-notatie: €284k / €1,2M. */
export function eurShort(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e6) return `${sign}€${(abs / 1e6).toFixed(1).replace('.', ',')}M`
  if (abs >= 1000) return `${sign}€${Math.round(abs / 1000)}k`
  return `${sign}€${Math.round(abs)}`
}

// ── Shared small UI ──────────────────────────────────────────────

export function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-3.5 w-1 rounded-full bg-[var(--color-horizon-500)]" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-horizon-700)] font-mono">
        {children}
      </span>
    </div>
  )
}

// ── Chart ────────────────────────────────────────────────────────

const CHART_W = 720
const CHART_H = 360
const PAD = { top: 16, right: 20, bottom: 32, left: 64 }

export function LedgerChart({ result }: { result: HorizonLedgerResult }) {
  const series = useMemo(() => buildChartSeries(result), [result])
  const { ages, vOp, netto, vNodig, fireAge, fireAgeFractional } = series

  const innerW = CHART_W - PAD.left - PAD.right
  const innerH = CHART_H - PAD.top - PAD.bottom

  const minAge = ages[0] ?? 0
  const maxAge = ages[ages.length - 1] ?? 1
  const ageSpan = Math.max(1, maxAge - minAge)

  const allY = [...vOp, ...netto, ...vNodig]
  const maxY = Math.max(1, ...allY)
  const minY = Math.min(0, ...allY)
  const ySpan = Math.max(1, maxY - minY)

  const xAt = (age: number) => PAD.left + ((age - minAge) / ageSpan) * innerW
  const yAt = (v: number) => PAD.top + innerH - ((v - minY) / ySpan) * innerH

  function pathFor(values: number[]): string {
    return values
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(ages[i]).toFixed(1)} ${yAt(v).toFixed(1)}`)
      .join(' ')
  }

  const yTicks = Array.from({ length: 5 }, (_, i) => minY + (ySpan * i) / 4)
  const xTicks: number[] = []
  for (let a = minAge; a <= maxAge; a += 5) xTicks.push(a)
  if (xTicks[xTicks.length - 1] !== maxAge) xTicks.push(maxAge)

  const fireX = fireAgeFractional != null ? xAt(fireAgeFractional) : null
  const fireDotY =
    fireAge != null
      ? (() => {
          const idx = ages.findIndex((a) => a >= fireAge)
          const v = idx >= 0 ? vOp[idx] : vOp[vOp.length - 1]
          return yAt(v)
        })()
      : null

  return (
    <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
      {/* Legend */}
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[var(--ink-2)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-horizon-600)]" />
          V_op (liquide)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--ink-3)]" />
          Netto incl. huis
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-kern-600)]" />
          V_nodig (benodigd)
        </span>
      </div>

      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" role="img" aria-label="FIRE-projectie grafiek">
        {/* Gridlines + y labels */}
        {yTicks.map((t, i) => {
          const y = yAt(t)
          return (
            <g key={`y-${i}`}>
              <line
                x1={PAD.left}
                y1={y}
                x2={CHART_W - PAD.right}
                y2={y}
                stroke="var(--rule-soft)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y + 3}
                textAnchor="end"
                className="font-mono"
                fontSize={10}
                fill="var(--ink-3)"
              >
                {eurShort(t)}
              </text>
            </g>
          )
        })}

        {/* x labels */}
        {xTicks.map((a, i) => (
          <text
            key={`x-${i}`}
            x={xAt(a)}
            y={CHART_H - PAD.bottom + 18}
            textAnchor="middle"
            className="font-mono"
            fontSize={10}
            fill="var(--ink-3)"
          >
            {a}
          </text>
        ))}
        <text
          x={PAD.left + innerW / 2}
          y={CHART_H - 2}
          textAnchor="middle"
          fontSize={10}
          fill="var(--ink-4)"
        >
          leeftijd
        </text>

        {/* Netto (dashed) */}
        <path d={pathFor(netto)} fill="none" stroke="var(--ink-3)" strokeWidth={1.4} strokeDasharray="3 3" />
        {/* V_nodig (declining) */}
        <path d={pathFor(vNodig)} fill="none" stroke="var(--color-kern-600)" strokeWidth={2.5} />
        {/* V_op (rising) */}
        <path d={pathFor(vOp)} fill="none" stroke="var(--color-horizon-600)" strokeWidth={2.5} />

        {/* FIRE marker */}
        {fireX != null && fireAge != null ? (
          <g>
            <line
              x1={fireX}
              y1={PAD.top}
              x2={fireX}
              y2={CHART_H - PAD.bottom}
              stroke="var(--color-horizon-700)"
              strokeWidth={1.25}
              strokeDasharray="4 3"
            />
            {fireDotY != null && (
              <circle cx={fireX} cy={fireDotY} r={4.5} fill="var(--color-horizon-700)" />
            )}
            <text
              x={Math.min(fireX + 6, CHART_W - PAD.right - 60)}
              y={PAD.top + 12}
              className="font-mono"
              fontSize={11}
              fontWeight={700}
              fill="var(--color-horizon-700)"
            >
              FIRE {fireAge}
            </text>
          </g>
        ) : (
          <text
            x={PAD.left + 8}
            y={PAD.top + 14}
            className="font-mono"
            fontSize={11}
            fontWeight={700}
            fill="var(--color-kern-600)"
          >
            FIRE niet bereikt
          </text>
        )}
      </svg>

      <p className="mt-2 text-xs text-[var(--ink-3)] italic">
        De V_nodig-lijn wordt achterwaarts berekend vanaf de eindleeftijd ({result.displayEndAge})
        en daalt daarom: hoe dichter bij het einde, hoe minder vermogen je nog nodig hebt. FIRE = het
        snijpunt waar je liquide vermogen (V_op) de V_nodig-lijn raakt.
      </p>
    </div>
  )
}

// ── Table helpers ────────────────────────────────────────────────

function useTableRows(result: HorizonLedgerResult, allYears: boolean, aowAge: number): LedgerRow[] {
  return useMemo(() => {
    const ages = keyAges(result, { allYears, aowAge })
    return result.rows.filter((r) => ages.has(r.leeftijd))
  }, [result, allYears, aowAge])
}

function Num({ value, signColor = true }: { value: number; signColor?: boolean }) {
  const neg = value < 0
  return (
    <span
      className="font-mono tabular-nums"
      style={signColor && neg ? { color: 'var(--negative)' } : undefined}
    >
      {eur(value)}
    </span>
  )
}

function rowClass(row: LedgerRow, fireAge: number | null, aowAge: number): string {
  if (fireAge != null && row.leeftijd === fireAge) {
    return 'bg-[color-mix(in_oklch,var(--color-horizon-500)_18%,transparent)]'
  }
  if (row.leeftijd === aowAge) return 'bg-[var(--subtle)]'
  return ''
}

const TH = 'px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] font-mono whitespace-nowrap'
const TD = 'px-3 py-1.5 text-sm text-[var(--ink)] whitespace-nowrap'
const TDNUM = `${TD} text-right`

function TableShell({
  head,
  children,
  note,
}: {
  head: React.ReactNode
  children: React.ReactNode
  note?: string
}) {
  return (
    <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--subtle)]">
            <tr className="text-left border-b border-[var(--border-ed)]">{head}</tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {note && <p className="px-3 py-2 text-xs italic text-[var(--ink-3)] border-t border-[var(--border-ed)]">{note}</p>}
    </div>
  )
}

// ── Tables A–G ───────────────────────────────────────────────────

function TableA({ rows, fireAge, aowAge }: { rows: LedgerRow[]; fireAge: number | null; aowAge: number }) {
  return (
    <TableShell
      head={
        <>
          <th className={TH}>Leeftijd</th>
          <th className={`${TH} text-right`}>Salaris</th>
          <th className={`${TH} text-right`}>AOW + pensioen</th>
          <th className={`${TH} text-right`}>Leefuitgaven</th>
          <th className={`${TH} text-right`}>Woonkosten</th>
          <th className={`${TH} text-right`}>Events</th>
          <th className={`${TH} text-right`}>Cashflow netto</th>
        </>
      }
    >
      {rows.map((r) => (
        <tr key={r.jaar} className={`border-b border-[var(--border-ed)] hover:bg-[var(--subtle)] ${rowClass(r, fireAge, aowAge)}`}>
          <td className={`${TD} font-mono tabular-nums`}>{r.leeftijd}</td>
          <td className={TDNUM}><Num value={r.salaris} /></td>
          <td className={TDNUM}><Num value={r.aowEnPensioen} /></td>
          <td className={TDNUM}><Num value={r.leefuitgaven} /></td>
          <td className={TDNUM}><Num value={r.woonkosten} /></td>
          <td className={TDNUM}><Num value={r.eventsUitgave} /></td>
          <td className={TDNUM}><Num value={r.cashflowNetto} /></td>
        </tr>
      ))}
    </TableShell>
  )
}

function TableB({
  rows,
  fireAge,
  aowAge,
  presentAssetTypes,
}: {
  rows: LedgerRow[]
  fireAge: number | null
  aowAge: number
  presentAssetTypes: AssetType[]
}) {
  return (
    <TableShell
      head={
        <>
          <th className={TH}>Leeftijd</th>
          {presentAssetTypes.map((t) => (
            <th key={t} className={`${TH} text-right`}>{ASSET_TYPE_LABELS[t]}</th>
          ))}
          <th className={`${TH} text-right`}>Schuld</th>
          <th className={`${TH} text-right`}>Netto vermogen</th>
          <th className={`${TH} text-right`}>Liquide (V_op)</th>
          <th className={`${TH} text-right`}>V_nodig</th>
          <th className={`${TH} text-right`}>Dekking Δ</th>
        </>
      }
    >
      {rows.map((r) => {
        const byType = new Map<AssetType, TypeRollup>(rollupByType(r).map((g) => [g.type, g]))
        return (
        <tr key={r.jaar} className={`border-b border-[var(--border-ed)] hover:bg-[var(--subtle)] ${rowClass(r, fireAge, aowAge)}`}>
          <td className={`${TD} font-mono tabular-nums`}>{r.leeftijd}</td>
          {presentAssetTypes.map((t) => (
            <td key={t} className={TDNUM}><Num value={byType.get(t)?.eind ?? 0} /></td>
          ))}
          <td className={TDNUM}><Num value={-r.totaalSchuld} /></td>
          <td className={TDNUM}><Num value={r.nettoVermogen} /></td>
          <td className={TDNUM}><Num value={r.liquideVermogen} /></td>
          <td className={TDNUM}><Num value={r.vNodig} /></td>
          <td className={TDNUM}>
            <span
              className="font-mono tabular-nums"
              style={{ color: r.dekking >= 0 ? 'var(--color-horizon-700)' : 'var(--negative)' }}
            >
              {eur(r.dekking)}
            </span>
          </td>
        </tr>
        )
      })}
    </TableShell>
  )
}

function TableC({
  rows,
  fireAge,
  aowAge,
  assetOptions,
  selected,
  onSelect,
}: {
  rows: LedgerRow[]
  fireAge: number | null
  aowAge: number
  assetOptions: { id: string; naam: string; type: AssetType }[]
  selected: string
  onSelect: (id: string) => void
}) {
  const selectedAsset = assetOptions.find((a) => a.id === selected) ?? assetOptions[0]
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--ink-2)]">Bezitting</span>
        <select
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
          className="rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1.5 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--color-horizon-600)]"
        >
          {assetOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.naam} · {ASSET_TYPE_LABELS[a.type]}
            </option>
          ))}
        </select>
      </div>
      {selectedAsset && (
        <div className="text-sm font-semibold text-[var(--ink)]">{selectedAsset.naam}</div>
      )}
      <TableShell
        head={
          <>
            <th className={TH}>Leeftijd</th>
            <th className={`${TH} text-right`}>Begin</th>
            <th className={`${TH} text-right`}>Rendement</th>
            <th className={`${TH} text-right`}>Instroom</th>
            <th className={`${TH} text-right`}>Uitstroom</th>
            <th className={`${TH} text-right`}>Box 3</th>
            <th className={`${TH} text-right`}>Eind</th>
          </>
        }
      >
        {rows.map((r) => {
          const a = r.assets.find((x) => x.id === selected)
          return (
            <tr key={r.jaar} className={`border-b border-[var(--border-ed)] hover:bg-[var(--subtle)] ${rowClass(r, fireAge, aowAge)}`}>
              <td className={`${TD} font-mono tabular-nums`}>{r.leeftijd}</td>
              <td className={TDNUM}><Num value={a?.begin ?? 0} /></td>
              <td className={TDNUM}><Num value={a?.rendement ?? 0} /></td>
              <td className={TDNUM}><Num value={a?.instroom ?? 0} /></td>
              <td className={TDNUM}><Num value={a?.uitstroom ?? 0} /></td>
              <td className={TDNUM}><Num value={a?.box3 ?? 0} /></td>
              <td className={TDNUM}><Num value={a?.eind ?? 0} /></td>
            </tr>
          )
        })}
      </TableShell>
    </div>
  )
}

function TableD({ rows, fireAge, aowAge }: { rows: LedgerRow[]; fireAge: number | null; aowAge: number }) {
  return (
    <TableShell
      note="Belasting in de projectie = uitsluitend Box 3 (forfaitaire vermogensrendementsheffing per asset). HRA en loonheffing zitten al verwerkt in de spaarquote resp. de netto AOW/pensioen-cashflows."
      head={
        <>
          <th className={TH}>Leeftijd</th>
          <th className={`${TH} text-right`}>Box 3-grondslag</th>
          <th className={`${TH} text-right`}>Box 3</th>
        </>
      }
    >
      {rows.map((r) => (
        <tr key={r.jaar} className={`border-b border-[var(--border-ed)] hover:bg-[var(--subtle)] ${rowClass(r, fireAge, aowAge)}`}>
          <td className={`${TD} font-mono tabular-nums`}>{r.leeftijd}</td>
          <td className={TDNUM}><Num value={r.box3Grondslag} /></td>
          <td className={TDNUM}><Num value={r.box3} /></td>
        </tr>
      ))}
    </TableShell>
  )
}

function TableE({ rows, fireAge, aowAge }: { rows: LedgerRow[]; fireAge: number | null; aowAge: number }) {
  return (
    <TableShell
      note="V_nodig wordt achterwaarts opgebouwd: het netto-tekort (uitgaven − AOW/pensioen) plus de restbehoefte van latere jaren, contant gemaakt naar nu."
      head={
        <>
          <th className={TH}>Leeftijd</th>
          <th className={`${TH} text-right`}>Totale uitgaven</th>
          <th className={`${TH} text-right`}>AOW + pensioen</th>
          <th className={`${TH} text-right`}>Netto tekort</th>
          <th className={`${TH} text-right`}>V_nodig</th>
          <th className={`${TH} text-right`}>Liquide (V_op)</th>
          <th className={`${TH} text-center`}>Dekking</th>
        </>
      }
    >
      {rows.map((r) => {
        const tekort = r.totaleUitgaven - r.aowEnPensioen
        const dekt = r.dekking >= 0
        return (
          <tr key={r.jaar} className={`border-b border-[var(--border-ed)] hover:bg-[var(--subtle)] ${rowClass(r, fireAge, aowAge)}`}>
            <td className={`${TD} font-mono tabular-nums`}>{r.leeftijd}</td>
            <td className={TDNUM}><Num value={r.totaleUitgaven} /></td>
            <td className={TDNUM}><Num value={r.aowEnPensioen} /></td>
            <td className={TDNUM}><Num value={tekort} /></td>
            <td className={TDNUM}><Num value={r.vNodig} /></td>
            <td className={TDNUM}><Num value={r.liquideVermogen} /></td>
            <td className={`${TD} text-center`}>
              <span style={{ color: dekt ? 'var(--color-horizon-700)' : 'var(--ink-4)' }}>
                {dekt ? '✓' : '—'}
              </span>
            </td>
          </tr>
        )
      })}
    </TableShell>
  )
}

function TableF({ result, fireAge, aowAge }: { result: HorizonLedgerResult; fireAge: number | null; aowAge: number }) {
  const eventRows = result.rows.filter((r) => r.events.length > 0)
  if (eventRows.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-6 text-sm text-[var(--ink-3)]">
        Geen gebeurtenissen in deze projectie.
      </div>
    )
  }
  return (
    <TableShell
      head={
        <>
          <th className={TH}>Leeftijd</th>
          <th className={TH}>Gebeurtenis</th>
          <th className={`${TH} text-right`}>Bedrag</th>
          <th className={TH}>Richting</th>
        </>
      }
    >
      {eventRows.flatMap((r) =>
        r.events.map((ev, i) => (
          <tr
            key={`${r.jaar}-${ev.id}-${i}`}
            className={`border-b border-[var(--border-ed)] hover:bg-[var(--subtle)] ${rowClass(r, fireAge, aowAge)}`}
          >
            {i === 0 ? (
              <td className={`${TD} font-mono tabular-nums`} rowSpan={r.events.length}>{r.leeftijd}</td>
            ) : null}
            <td className={TD}>{ev.naam}</td>
            <td className={TDNUM}>
              <span
                className="font-mono tabular-nums"
                style={{ color: ev.richting === 'expense' ? 'var(--negative)' : 'var(--color-horizon-700)' }}
              >
                {eur(ev.bedrag)}
              </span>
            </td>
            <td className={TD}>
              <span className="text-xs text-[var(--ink-2)]">
                {ev.richting === 'expense' ? 'Uitgave' : 'Inkomen'}
              </span>
            </td>
          </tr>
        )),
      )}
    </TableShell>
  )
}

function TableG({
  rows,
  fireAge,
  aowAge,
  presentAssetTypes,
}: {
  rows: LedgerRow[]
  fireAge: number | null
  aowAge: number
  presentAssetTypes: AssetType[]
}) {
  const onttrekRows = rows.filter((r) => r.fase !== 'opbouw')
  const rollupCache = new Map<number, Map<AssetType, TypeRollup>>()
  const rollupFor = (r: LedgerRow): Map<AssetType, TypeRollup> => {
    let m = rollupCache.get(r.jaar)
    if (!m) {
      m = new Map(rollupByType(r).map((g) => [g.type, g]))
      rollupCache.set(r.jaar, m)
    }
    return m
  }
  const withdrawTypes = presentAssetTypes.filter((t) =>
    onttrekRows.some((r) => (rollupFor(r).get(t)?.uitstroom ?? 0) > 0),
  )
  if (onttrekRows.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-6 text-sm text-[var(--ink-3)]">
        Nog geen onttrekkingsjaren in de geselecteerde rijen.
      </div>
    )
  }
  return (
    <TableShell
      note="Onbedekt = het deel van de uitgaven dat dit jaar niet uit liquide vermogen of inkomen kon worden gedekt (liquide raakte op)."
      head={
        <>
          <th className={TH}>Leeftijd</th>
          <th className={`${TH} text-right`}>Totale uitgaven</th>
          <th className={`${TH} text-right`}>AOW + pensioen</th>
          {withdrawTypes.map((t) => (
            <th key={t} className={`${TH} text-right`}>{ASSET_TYPE_LABELS[t]} ↓</th>
          ))}
          <th className={`${TH} text-right`}>Onbedekt</th>
        </>
      }
    >
      {onttrekRows.map((r) => {
        const byType = rollupFor(r)
        const totaalUitstroom = withdrawTypes.reduce((s, t) => s + (byType.get(t)?.uitstroom ?? 0), 0)
        const onbedekt = Math.max(0, r.totaleUitgaven - r.aowEnPensioen - r.salaris - totaalUitstroom)
        return (
          <tr key={r.jaar} className={`border-b border-[var(--border-ed)] hover:bg-[var(--subtle)] ${rowClass(r, fireAge, aowAge)}`}>
            <td className={`${TD} font-mono tabular-nums`}>{r.leeftijd}</td>
            <td className={TDNUM}><Num value={r.totaleUitgaven} /></td>
            <td className={TDNUM}><Num value={r.aowEnPensioen} /></td>
            {withdrawTypes.map((t) => (
              <td key={t} className={TDNUM}><Num value={byType.get(t)?.uitstroom ?? 0} /></td>
            ))}
            <td className={TDNUM}>
              {onbedekt > 0 ? (
                <span className="font-mono tabular-nums" style={{ color: 'var(--negative)' }}>{eur(onbedekt)}</span>
              ) : (
                <span className="font-mono tabular-nums text-[var(--ink-4)]">—</span>
              )}
            </td>
          </tr>
        )
      })}
    </TableShell>
  )
}

// ── H · Opbouw per onderdeel ─────────────────────────────────────

/** Onderscheidende tinten per individueel asset (cyclisch). Illiquide
 *  (eigen huis / voertuig) krijgt een eigen, herkenbaar palet. */
const ASSET_TINTS = [
  'var(--color-horizon-600)',
  'var(--color-horizon-400)',
  'oklch(0.62 0.13 200)',
  'oklch(0.68 0.12 160)',
  'oklch(0.70 0.13 95)',
  'oklch(0.64 0.12 280)',
  'oklch(0.66 0.11 320)',
]
const ILLIQUID_TINT = 'var(--color-kern-400)' // eigen huis
const VEHICLE_TINT = 'oklch(0.58 0.07 60)' // voertuig
const DEBT_TINTS = [
  'oklch(0.58 0.16 25)',
  'oklch(0.66 0.15 30)',
  'oklch(0.50 0.14 20)',
  'oklch(0.62 0.13 15)',
]

function assetTint(type: AssetType, idx: number): string {
  if (type === 'eigen_huis') return ILLIQUID_TINT
  if (type === 'vehicle') return VEHICLE_TINT
  return ASSET_TINTS[idx % ASSET_TINTS.length]
}

interface CompositionEntry {
  id: string
  naam: string
  tint: string
}

function BreakdownView({
  result,
  allYears,
  aowAge,
}: {
  result: HorizonLedgerResult
  allYears: boolean
  aowAge: number
}) {
  const rows = useTableRows(result, allYears, aowAge)

  // Stable ordering of assets/debts across all years (use union, first-seen order).
  const { assetEntries, debtEntries } = useMemo(() => {
    const aMap = new Map<string, { naam: string; type: AssetType }>()
    const dMap = new Map<string, string>()
    for (const r of result.rows) {
      for (const a of r.assets) if (!aMap.has(a.id)) aMap.set(a.id, { naam: a.naam, type: a.type })
      for (const d of r.schulden) if (!dMap.has(d.id)) dMap.set(d.id, d.naam)
    }
    let ai = 0
    const assetEntries: (CompositionEntry & { type: AssetType })[] = [...aMap.entries()].map(([id, v]) => ({
      id,
      naam: v.naam,
      type: v.type,
      tint: assetTint(v.type, ai++),
    }))
    const debtEntries: CompositionEntry[] = [...dMap.entries()].map(([id, naam], i) => ({
      id,
      naam,
      tint: DEBT_TINTS[i % DEBT_TINTS.length],
    }))
    return { assetEntries, debtEntries }
  }, [result])

  // Per displayed row: positive (asset eind) + negative (debt eind) stacks.
  const bars = useMemo(
    () =>
      rows.map((r) => {
        const assetById = new Map(r.assets.map((a) => [a.id, a.eind]))
        const debtById = new Map(r.schulden.map((d) => [d.id, d.eind]))
        const posTotal = assetEntries.reduce((s, e) => s + Math.max(0, assetById.get(e.id) ?? 0), 0)
        const negTotal = debtEntries.reduce((s, e) => s + Math.max(0, debtById.get(e.id) ?? 0), 0)
        // bewegingen dit jaar
        const sparen = r.assets.reduce((s, a) => s + a.instroom, 0)
        const rendement = r.assets.reduce((s, a) => s + a.rendement, 0)
        const belasting = r.assets.reduce((s, a) => s + a.box3, 0)
        const onttrekking = r.assets.reduce((s, a) => s + a.uitstroom, 0)
        return {
          leeftijd: r.leeftijd,
          jaar: r.jaar,
          fase: r.fase,
          assetById,
          debtById,
          posTotal,
          negTotal,
          sparen,
          rendement,
          belasting,
          onttrekking,
        }
      }),
    [rows, assetEntries, debtEntries],
  )

  const maxPos = Math.max(1, ...bars.map((b) => b.posTotal))
  const maxNeg = Math.max(0, ...bars.map((b) => b.negTotal))

  // SVG layout
  const BAR_W = 26
  const GAP = 10
  const POS_H = 220
  const NEG_H = maxNeg > 0 ? 90 : 0
  const AXIS_H = 26
  const innerW = bars.length * (BAR_W + GAP) + GAP
  const W = Math.max(innerW, 320)
  const H = POS_H + NEG_H + AXIS_H
  const zeroY = POS_H

  const fireAge = result.fireAge

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
        <Kicker>Opbouw per onderdeel</Kicker>
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-[var(--ink-2)]">
          Elke staaf is één projectiejaar. Boven de nullijn elk individueel bezit als eigen laag
          (eigen woning en voertuig apart herkenbaar), onder de nullijn elke individuele schuld in
          rood. De tabel eronder laat zien waar de opbouw dit jaar vandaan komt: vermogen groeit met
          sparen + rendement, en daalt met belasting (Box 3) + onttrekking.
        </p>

        <div className="mt-4 overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="min-w-full" style={{ minWidth: innerW }} role="img" aria-label="Opbouw per onderdeel per jaar">
            {/* zero line */}
            <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="var(--border-ed)" strokeWidth={1} />
            {bars.map((b, i) => {
              const x = GAP + i * (BAR_W + GAP)
              const isFire = fireAge != null && b.leeftijd === fireAge
              // positive stack (assets), bottom-up
              let yAcc = zeroY
              const posRects = assetEntries.map((e) => {
                const v = Math.max(0, b.assetById.get(e.id) ?? 0)
                const h = (v / maxPos) * POS_H
                yAcc -= h
                return v > 0 ? { e, y: yAcc, h, v } : null
              })
              // negative stack (debts), top-down
              let yNeg = zeroY
              const negRects = debtEntries.map((e) => {
                const v = Math.max(0, b.debtById.get(e.id) ?? 0)
                const h = NEG_H > 0 ? (v / Math.max(1, maxNeg)) * NEG_H : 0
                const rect = v > 0 ? { e, y: yNeg, h, v } : null
                yNeg += h
                return rect
              })
              return (
                <g key={b.jaar}>
                  {isFire && (
                    <rect
                      x={x - GAP / 2}
                      y={0}
                      width={BAR_W + GAP}
                      height={POS_H + NEG_H}
                      fill="color-mix(in oklch, var(--color-horizon-500) 12%, transparent)"
                    />
                  )}
                  {posRects.map((r, j) =>
                    r ? (
                      <rect key={`p-${j}`} x={x} y={r.y} width={BAR_W} height={r.h} fill={r.e.tint}>
                        <title>{`${r.e.naam} · ${eur(r.v)} (leeftijd ${b.leeftijd})`}</title>
                      </rect>
                    ) : null,
                  )}
                  {negRects.map((r, j) =>
                    r ? (
                      <rect key={`n-${j}`} x={x} y={r.y} width={BAR_W} height={r.h} fill={r.e.tint}>
                        <title>{`${r.e.naam} · −${eur(r.v)} (leeftijd ${b.leeftijd})`}</title>
                      </rect>
                    ) : null,
                  )}
                  <text
                    x={x + BAR_W / 2}
                    y={POS_H + NEG_H + 16}
                    textAnchor="middle"
                    className="font-mono"
                    fontSize={9}
                    fill={isFire ? 'var(--color-horizon-700)' : 'var(--ink-3)'}
                    fontWeight={isFire ? 700 : 400}
                  >
                    {b.leeftijd}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--ink-2)]">
          {assetEntries.map((e) => (
            <span key={e.id} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: e.tint }} />
              {e.naam}
            </span>
          ))}
          {debtEntries.map((e) => (
            <span key={e.id} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: e.tint }} />
              {e.naam} (schuld)
            </span>
          ))}
        </div>
      </div>

      {/* Bewegingen dit jaar */}
      <TableShell
        note="Vermogensmutatie = sparen + rendement − belasting (Box 3) − onttrekking. Zo wordt zichtbaar waar de opbouw (of afbouw) per jaar vandaan komt."
        head={
          <>
            <th className={TH}>Leeftijd</th>
            <th className={TH}>Fase</th>
            <th className={`${TH} text-right`}>Sparen</th>
            <th className={`${TH} text-right`}>Rendement</th>
            <th className={`${TH} text-right`}>Belasting (Box 3)</th>
            <th className={`${TH} text-right`}>Onttrekking</th>
            <th className={`${TH} text-right`}>Netto mutatie</th>
          </>
        }
      >
        {bars.map((b) => {
          const mutatie = b.sparen + b.rendement - b.belasting - b.onttrekking
          const isFire = fireAge != null && b.leeftijd === fireAge
          return (
            <tr
              key={b.jaar}
              className={`border-b border-[var(--border-ed)] hover:bg-[var(--subtle)] ${
                isFire ? 'bg-[color-mix(in_oklch,var(--color-horizon-500)_18%,transparent)]' : ''
              }`}
            >
              <td className={`${TD} font-mono tabular-nums`}>{b.leeftijd}</td>
              <td className={`${TD} text-xs capitalize text-[var(--ink-2)]`}>{b.fase}</td>
              <td className={TDNUM}><span className="font-mono tabular-nums" style={{ color: b.sparen > 0 ? 'var(--color-horizon-700)' : undefined }}>{eur(b.sparen)}</span></td>
              <td className={TDNUM}><Num value={b.rendement} /></td>
              <td className={TDNUM}><span className="font-mono tabular-nums" style={{ color: b.belasting > 0 ? 'var(--negative)' : undefined }}>−{eur(b.belasting)}</span></td>
              <td className={TDNUM}><span className="font-mono tabular-nums" style={{ color: b.onttrekking > 0 ? 'var(--negative)' : undefined }}>−{eur(b.onttrekking)}</span></td>
              <td className={TDNUM}><Num value={mutatie} /></td>
            </tr>
          )
        })}
      </TableShell>
    </div>
  )
}

// ── Tabs (gedeeld) ───────────────────────────────────────────────

export type LedgerTabId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H'

const LEDGER_TABS: { id: LedgerTabId; label: string; icon: typeof Wallet }[] = [
  { id: 'A', label: 'A · Cashflow', icon: Wallet },
  { id: 'B', label: 'B · Balans', icon: Scale },
  { id: 'C', label: 'C · Bewegingen', icon: ArrowLeftRight },
  { id: 'D', label: 'D · Belasting', icon: Landmark },
  { id: 'E', label: 'E · V_nodig', icon: TrendingDown },
  { id: 'F', label: 'F · Events', icon: CalendarClock },
  { id: 'G', label: 'G · Onttrekking', icon: PiggyBank },
  { id: 'H', label: 'H · Opbouw per onderdeel', icon: Layers },
]

/**
 * De gedeelde tabel-set (A–H) op een `HorizonLedgerResult`. Bevat de eigen
 * tab-strip, jaar-densiteit-toggle en de asset-selector voor tabel C. Volledig
 * zelfstandig — geeft op beide pagina's exact dezelfde weergave.
 */
export function LedgerTabs({
  result,
  aowAge = DEFAULT_AOW_AGE,
}: {
  result: HorizonLedgerResult
  aowAge?: number
}) {
  const [tab, setTab] = useState<LedgerTabId>('A')
  const [allYears, setAllYears] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null)

  const rows = useTableRows(result, allYears, aowAge)
  const fireAge = result.fireAge

  const presentAssetTypes = useMemo<AssetType[]>(() => {
    const set = new Set<AssetType>()
    for (const r of result.rows) {
      for (const g of rollupByType(r)) set.add(g.type)
    }
    return Array.from(set)
  }, [result])

  const assetOptions = useMemo<{ id: string; naam: string; type: AssetType }[]>(
    () => (result.rows[0]?.assets ?? []).map((a) => ({ id: a.id, naam: a.naam, type: a.type })),
    [result],
  )

  const activeAsset: string =
    selectedAsset && assetOptions.some((a) => a.id === selectedAsset)
      ? selectedAsset
      : assetOptions[0]?.id ?? ''

  return (
    <div className="space-y-4">
      {/* Tab strip + density toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-ed)] pb-px">
        <div className="flex flex-wrap gap-1.5">
          {LEDGER_TABS.map((t) => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-[var(--paper)] text-[var(--color-horizon-700)] border border-b-0 border-[var(--border-ed)] -mb-px'
                    : 'text-[var(--ink-3)] hover:bg-[var(--subtle)]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-xs text-[var(--ink-2)]">
          <input
            type="checkbox"
            checked={allYears}
            onChange={(e) => setAllYears(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-horizon-600)]"
          />
          Alle jaren
        </label>
      </div>

      <div>
        {tab === 'A' && <TableA rows={rows} fireAge={fireAge} aowAge={aowAge} />}
        {tab === 'B' && <TableB rows={rows} fireAge={fireAge} aowAge={aowAge} presentAssetTypes={presentAssetTypes} />}
        {tab === 'C' && (
          <TableC
            rows={rows}
            fireAge={fireAge}
            aowAge={aowAge}
            assetOptions={assetOptions}
            selected={activeAsset}
            onSelect={setSelectedAsset}
          />
        )}
        {tab === 'D' && <TableD rows={rows} fireAge={fireAge} aowAge={aowAge} />}
        {tab === 'E' && <TableE rows={rows} fireAge={fireAge} aowAge={aowAge} />}
        {tab === 'F' && <TableF result={result} fireAge={fireAge} aowAge={aowAge} />}
        {tab === 'G' && <TableG rows={rows} fireAge={fireAge} aowAge={aowAge} presentAssetTypes={presentAssetTypes} />}
        {tab === 'H' && <BreakdownView result={result} allYears={allYears} aowAge={aowAge} />}
      </div>
    </div>
  )
}
