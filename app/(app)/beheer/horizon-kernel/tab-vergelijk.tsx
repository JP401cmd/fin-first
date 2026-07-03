'use client'

/**
 * Deel 6 — Vergelijk: draait op de eigen data BEIDE FIRE-motoren (v2-grootboek ↔
 * horizon-kernel) en toont de verschillen feitelijk, zonder oordeel. Δ's zijn
 * bewust NEUTRAAL gekleurd (Horizon-accent, géén positief/negatief) — dit is een
 * verschil-meting, geen goed/fout.
 */

import { useEffect, useState } from 'react'
import { GitCompareArrows, ArrowRight } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { formatFireAge } from '@/lib/horizon-data'
import { SectionCard, Kicker, StatCard, Spinner, Notice, DataGrid } from './ui'
import type { VergelijkResponse } from '@/app/api/horizon-kernel/vergelijk/route'
import type { ColKind } from './types'

type Kental = NonNullable<VergelijkResponse['kentalDeltas']>[number]
type FlagKey = 'convergentie' | 'whatif' | 'household' | 'scalar'

const FLAG_LABELS: ReadonlyArray<{ id: FlagKey; label: string }> = [
  { id: 'convergentie', label: 'Convergentie-set (/overzicht + /toekomst + dashboard + AI)' },
  { id: 'whatif', label: 'What-if-scenario’s' },
  { id: 'household', label: 'Huishouden/partner-projecties' },
  { id: 'scalar', label: 'Scalar-helpers (mijlpalen, rapporten)' },
]

/** Één kental-waarde formatteren (leeftijd → "X jaar en Y mnd", euro → nl-NL). */
function fmtKental(v: number | null, kind: Kental['kind']): string {
  if (v === null) return '—'
  return kind === 'age' ? formatFireAge(v) : formatCurrency(Math.round(v))
}

/** Signed Δ tekst (leeftijd in jaren met 1 decimaal, euro met teken). */
function fmtDelta(v: number | null, kind: Kental['kind']): string {
  if (v === null) return '—'
  if (kind === 'age') {
    const j = v.toFixed(1).replace('.', ',')
    return `${v >= 0 ? '+' : ''}${j} jr`
  }
  return `${v >= 0 ? '+' : '−'}${formatCurrency(Math.abs(Math.round(v)))}`
}

function fmtPct(v: number | null): string {
  if (v === null) return ''
  return `${v >= 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')}%`
}

/** Neutrale Δ-chip: Horizon-accent, nooit stoplicht/positief-negatief. */
function DeltaCell({ absDelta, pctDelta, kind }: { absDelta: number | null; pctDelta: number | null; kind: Kental['kind'] }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="inline-flex items-center rounded-full border border-[var(--color-horizon-500)] bg-[color-mix(in_oklch,var(--color-horizon-500)_10%,transparent)] px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-[var(--ink)]">
        {fmtDelta(absDelta, kind)}
      </span>
      {pctDelta !== null && kind === 'eur' && (
        <span className="font-mono text-[10px] tabular-nums text-[var(--ink-4)]">{fmtPct(pctDelta)}</span>
      )}
    </div>
  )
}

export default function TabVergelijk() {
  const [data, setData] = useState<VergelijkResponse | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/horizon-kernel/vergelijk')
        const json: VergelijkResponse = await res.json()
        if (cancelled) return
        if (!res.ok || !json.ok) {
          setErr(json.reason ?? (res.status === 403 ? 'Geen toegang (superadmin vereist).' : `Serverfout (${res.status}).`))
          setState('error')
          return
        }
        setData(json)
        setState('ready')
      } catch {
        if (!cancelled) {
          setErr('Kon de vergelijking niet ophalen.')
          setState('error')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (state === 'loading') return <Spinner label="Beide motoren draaien op je data…" />
  if (state === 'error' || !data || !data.ok) {
    return (
      <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-5 text-sm text-[var(--ink-2)]">
        {err || data?.reason || 'Vergelijken is niet mogelijk.'}
      </div>
    )
  }

  const { kentalDeltas, reeks, reeksDeltas, badge, kernel, flags, meta, eindLeeftijd } = data

  // ── Reeks → DataGrid (nominaal, per leeftijd; Δ = kernel − v2) ──────────────
  const reeksColumns: ReadonlyArray<{ letter: string; label: string; kind: ColKind }> = [
    { letter: 'lft', label: 'Leeftijd', kind: 'idx' },
    { letter: 'v2', label: 'Vermogen v2', kind: 'eur' },
    { letter: 'kern', label: 'Vermogen kernel', kind: 'eur' },
    { letter: 'Δ', label: 'Δ vermogen', kind: 'eur' },
    { letter: 'v2', label: 'Liquide v2', kind: 'eur' },
    { letter: 'kern', label: 'Liquide kernel', kind: 'eur' },
    { letter: 'Δ', label: 'Δ liquide', kind: 'eur' },
  ]
  const reeksRows = (reeks ?? []).map((p) => [
    p.age,
    p.v2Vermogen,
    p.kernelVermogen,
    p.kernelVermogen - p.v2Vermogen,
    p.v2Liquide,
    p.kernelLiquide,
    p.kernelLiquide - p.v2Liquide,
  ])

  return (
    <div className="space-y-6">
      <p className="max-w-3xl font-serif text-sm italic text-[var(--ink-3)]">
        Beide FIRE-motoren, op jouw eigen gegevens, naast elkaar: de bestaande v2-grootboek-engine
        en de nieuwe horizon-kernel. Alle bedragen zijn nominaal. De verschillen staan er feitelijk
        bij — dit is een verschil-meting, geen goed of fout.
      </p>

      {/* Samenvattende badge */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--color-horizon-500)] bg-[color-mix(in_oklch,var(--color-horizon-500)_7%,transparent)] px-4 py-3 text-sm text-[var(--ink)]">
        <GitCompareArrows className="h-4 w-4 shrink-0 text-[var(--color-horizon-600)]" />
        <span className="font-medium">
          FIRE-leeftijd verschilt{' '}
          <span className="font-mono tabular-nums">
            {badge?.fireLeeftijdDeltaJaar !== null && badge?.fireLeeftijdDeltaJaar !== undefined
              ? `${Math.abs(badge.fireLeeftijdDeltaJaar).toFixed(1).replace('.', ',')} jaar`
              : '—'}
          </span>
        </span>
        <span className="text-[var(--ink-4)]">·</span>
        <span className="font-medium">
          eindvermogen Δ{' '}
          <span className="font-mono tabular-nums">
            {badge ? fmtDelta(badge.eindVermogenAbs, 'eur') : '—'}
          </span>
          {badge?.eindVermogenPct !== null && badge?.eindVermogenPct !== undefined && (
            <span className="text-[var(--ink-3)]"> ({fmtPct(badge.eindVermogenPct)})</span>
          )}
        </span>
      </div>

      {/* Kernel-only status-strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Kernel solver-status" value={STATUS_LABEL[kernel!.solverStatus ?? 'reached_at']} sub="P!B93" />
        <StatCard label="Kernel tekort-lening-piek" value={formatCurrency(kernel?.tekortLeningPiek ?? 0)} sub="alleen kernel · P!B99" />
        <StatCard label="v2-eindstrategie" value={meta?.v2Strategy ?? '—'} sub={`horizon t/m leeftijd ${meta?.v2EndAge ?? '—'}`} />
        <StatCard label="Vergelijkings-eindleeftijd" value={String(eindLeeftijd ?? '—')} sub="laatste gedeelde jaar" />
      </div>

      {/* Kerngetallen-vergelijktabel */}
      <SectionCard>
        <Kicker>Kerngetallen · v2 ↔ kernel</Kicker>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">
                <th scope="col" className="px-2 py-2 text-left font-medium">Kerngetal</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Motor v2</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Kernel</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Δ (kernel − v2)</th>
              </tr>
            </thead>
            <tbody>
              {(kentalDeltas ?? []).map((d) => (
                <tr key={d.key} className="border-t border-[var(--border-ed)]">
                  <td className="px-2 py-2.5 text-[var(--ink-2)]">{d.label}</td>
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums text-[var(--ink)]">{fmtKental(d.v2, d.kind)}</td>
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums text-[var(--ink)]">{fmtKental(d.kernel, d.kind)}</td>
                  <td className="px-2 py-2.5">
                    <DeltaCell absDelta={d.absDelta} pctDelta={d.pctDelta} kind={d.kind} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Reeks per leeftijd */}
      <SectionCard>
        <Kicker>Vermogenspad per leeftijd (nominaal)</Kicker>
        <p className="mt-1 mb-3 text-xs text-[var(--ink-3)]">
          Netto vermogen en netto-liquide per jaar voor beide motoren, met het verschil (Δ = kernel − v2).
        </p>
        <div className="mb-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(reeksDeltas ?? []).map((r) => (
            <StatCard
              key={r.key}
              label={`${r.label} · max |Δ|`}
              value={formatCurrency(r.maxAbsDelta)}
              sub={`op leeftijd ${r.ageAtMax} · gemiddeld ${formatCurrency(r.meanAbsDelta)}`}
            />
          ))}
        </div>
        <DataGrid columns={reeksColumns} rows={reeksRows} emptyRows showScrollHint />
      </SectionCard>

      {/* Duiding — waarom verschillen ze? */}
      <SectionCard>
        <Kicker>Waarom verschillen ze?</Kicker>
        <div className="mt-3 space-y-3 text-sm text-[var(--ink-2)]">
          <p className="font-serif leading-relaxed">
            Beide motoren beantwoorden dezelfde vraag — wanneer kun je stoppen en hoe groeit je
            vermogen — maar rekenen op een net andere manier. De belangrijkste redenen dat de
            uitkomsten uiteenlopen:
          </p>
          <ul className="space-y-2">
            {DUIDING.map((d) => (
              <li key={d.titel} className="flex gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-horizon-500)]" />
                <span>
                  <span className="font-semibold text-[var(--ink)]">{d.titel}</span> — {d.tekst}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-4">
          <Notice tone="info">
            De horizon-kernel is de <span className="font-semibold">Excel-bewezen</span> motor: op het
            tabblad <span className="font-semibold">Verificatie</span> ligt elke maandtabel cel-voor-cel
            binnen één eurocent van het bron-Excel. Voor de rekenprincipes en de bewuste besluiten, zie
            het tabblad <span className="font-semibold">Technisch rapport</span>.
          </Notice>
        </div>
      </SectionCard>

      {/* Vlag-stand per oppervlak */}
      <SectionCard>
        <Kicker>Wat rekent nu al met de kernel?</Kicker>
        <p className="mt-1 mb-3 text-xs text-[var(--ink-3)]">
          De cutover-vlaggen op jouw account. Een oppervlak met de vlag AAN gebruikt op productie
          de kernel; UIT betekent dat het (nog) de v2-grootboek-engine gebruikt.
        </p>
        <ul className="divide-y divide-[var(--border-ed)] rounded-xl border border-[var(--border-ed)]">
          {FLAG_LABELS.map((row) => {
            const on = flags?.[row.id] ?? false
            return (
              <li key={row.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-sm text-[var(--ink-2)]">{row.label}</span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide ${
                    on
                      ? 'border border-[var(--color-horizon-500)] bg-[color-mix(in_oklch,var(--color-horizon-500)_12%,transparent)] text-[var(--color-horizon-700)]'
                      : 'border border-[var(--border-ed)] bg-[var(--subtle)] text-[var(--ink-4)]'
                  }`}
                >
                  {on ? 'kernel' : 'v2'}
                  {on && <ArrowRight className="h-3 w-3" />}
                </span>
              </li>
            )
          })}
        </ul>
      </SectionCard>
    </div>
  )
}

const STATUS_LABEL: Record<NonNullable<VergelijkResponse['kernel']>['solverStatus'] & string, string> = {
  reached_now: 'Nu al bereikt',
  reached_at: 'Bereikt op leeftijd',
  unreachable_within_horizon: 'Niet binnen horizon',
  pension_shortfall: 'Pensioen-tekort',
}

const DUIDING: ReadonlyArray<{ titel: string; tekst: string }> = [
  {
    titel: 'Maand- vs. jaarbasis',
    tekst:
      'de kernel rekent per maand (1200 maanden tot leeftijd 100), de v2-engine per jaar. Rente, inleg en onttrekking worden daardoor op een andere periode samengesteld — dat schuift bedragen licht.',
  },
  {
    titel: 'Box 3 via cashflow vs. vermogens-drag',
    tekst:
      'de kernel betaalt de vermogensbelasting als een uitgave in de cashflow, de v2-engine trekt ze rechtstreeks van de vermogenspot af. Dezelfde belasting, maar een ander aangrijppunt in het model.',
  },
  {
    titel: 'Behoefte-gebaseerde onttrekking',
    tekst:
      'in de FIRE-fase onttrekt de kernel precies je behoefte en verdeelt die over de potten; de v2-engine volgt zijn eigen onttrekkings- en verdelingslogica. Bij dezelfde uitgaven kan het pad er net anders uitzien.',
  },
  {
    titel: 'Structurele één-maand-lag',
    tekst:
      'de kernel geeft sommige waarden (met name de Box 3-heffing) bewust met één maand vertraging door — exact zoals het bron-Excel — terwijl de v2-engine binnen het jaar rekent.',
  },
]
