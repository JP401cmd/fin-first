'use client'

/**
 * Deel 3 — Alle stappen, tabellen en behandelingen: elke rekenstap als maandtabel
 * met een uitleg-blok. Jaar-sampling (verjaardagen) standaard; uitklap naar maanden
 * en "alle kolommen" op afroep, zodat de 1200 rijen × brede tabellen leesbaar blijven.
 */

import { useCallback, useEffect, useState } from 'react'
import { KERNEL_TABLES, type KernelTableId } from '@/lib/horizon-kernel-report/table-meta'
import { SectionCard, Kicker, StepExplainer, DataGrid, Spinner } from './ui'
import type { SerializedGridDTO, TableResponse } from './types'

type Modus = 'jaar' | 'maand'
type Kolommen = 'kern' | 'alle'

function ToggleGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-full border border-[var(--border-ed)]">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`px-4 py-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-horizon-500)] ${
            value === o.value
              ? 'bg-[var(--ink)] text-[var(--paper)] shadow-[inset_0_-2px_0_var(--color-horizon-400)]'
              : 'bg-[var(--paper)] text-[var(--ink-2)] hover:bg-[var(--subtle)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function TabStappen({ fireAge }: { fireAge: number }) {
  const [activeId, setActiveId] = useState<KernelTableId>('cf')
  const [modus, setModus] = useState<Modus>('jaar')
  const [kolommen, setKolommen] = useState<Kolommen>('kern')
  const [vanMaand, setVanMaand] = useState(0)

  const [grid, setGrid] = useState<SerializedGridDTO | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [err, setErr] = useState('')

  const meta = KERNEL_TABLES.find((t) => t.id === activeId)!
  const windowSize = kolommen === 'alle' ? 60 : 120

  const fetchGrid = useCallback(async () => {
    setState('loading')
    setErr('')
    const params = new URLSearchParams({
      tabel: activeId,
      fireAge: String(fireAge),
      modus,
      kolommen,
    })
    if (modus === 'maand') {
      params.set('van', String(vanMaand))
      params.set('tot', String(vanMaand + windowSize - 1))
    }
    try {
      const res = await fetch(`/api/horizon-kernel/tabel?${params.toString()}`)
      const json: TableResponse = await res.json()
      if (!res.ok || !json.ok || !json.grid) {
        setErr(json.reason ?? `Serverfout (${res.status}).`)
        setState('error')
        return
      }
      setGrid(json.grid)
      setState('ready')
    } catch {
      setErr('Kon de tabel niet ophalen.')
      setState('error')
    }
  }, [activeId, fireAge, modus, kolommen, vanMaand, windowSize])

  useEffect(() => {
    fetchGrid()
  }, [fetchGrid])

  return (
    <div className="space-y-5">
      <p className="max-w-3xl font-serif text-sm italic text-[var(--ink-3)]">
        Van ruwe invoer naar FIRE-leeftijd loopt de berekening door elf maandtabellen. Kies
        een stap, lees wat hij doet, en bekijk de cijfers per jaar — of klap uit naar
        maanden en alle kolommen.
      </p>

      {/* Stap-kiezer */}
      <div className="flex flex-wrap gap-2">
        {KERNEL_TABLES.map((t, i) => (
          <button
            key={t.id}
            onClick={() => {
              setActiveId(t.id)
              setVanMaand(0)
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              activeId === t.id
                ? 'border-[var(--color-horizon-500)] bg-[color-mix(in_oklch,var(--color-horizon-500)_14%,transparent)] text-[var(--color-horizon-700)]'
                : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-2)] hover:bg-[var(--subtle)]'
            }`}
          >
            <span className="font-mono text-[var(--ink-4)]">{i + 1}.</span> {t.naam}
          </button>
        ))}
      </div>

      <SectionCard>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Kicker>{meta.kicker}</Kicker>
            <h3 className="mt-2 font-serif text-xl font-bold text-[var(--ink)]">{meta.naam}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              value={modus}
              onChange={setModus}
              options={[
                { value: 'jaar', label: 'Per jaar' },
                { value: 'maand', label: 'Per maand' },
              ]}
            />
            <ToggleGroup
              value={kolommen}
              onChange={setKolommen}
              options={[
                { value: 'kern', label: 'Kernkolommen' },
                { value: 'alle', label: 'Alle kolommen' },
              ]}
            />
          </div>
        </div>

        <div className="mt-4">
          <StepExplainer uitleg={meta.uitleg} keuzes={meta.keuzes} doorstroom={meta.doorstroom} />
        </div>

        {modus === 'maand' && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-[var(--ink-3)]">Venster vanaf maand</span>
            <div className="inline-flex items-center gap-1">
              <button
                onClick={() => setVanMaand((v) => Math.max(0, v - windowSize))}
                disabled={vanMaand <= 0}
                className="rounded-md border border-[var(--border-ed)] px-3 py-2.5 font-mono text-xs transition-colors hover:bg-[var(--subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-horizon-500)] disabled:opacity-40 disabled:hover:bg-transparent"
              >
                ← vorige
              </button>
              <span className="rounded-md bg-[var(--subtle)] px-3 py-2.5 font-mono tabular-nums text-[var(--ink)]">
                {vanMaand}–{Math.min(1199, vanMaand + windowSize - 1)}
              </span>
              <button
                onClick={() => setVanMaand((v) => Math.min(1199 - windowSize + 1, v + windowSize))}
                disabled={vanMaand + windowSize >= 1200}
                className="rounded-md border border-[var(--border-ed)] px-3 py-2.5 font-mono text-xs transition-colors hover:bg-[var(--subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-horizon-500)] disabled:opacity-40 disabled:hover:bg-transparent"
              >
                volgende →
              </button>
            </div>
            <span className="text-xs text-[var(--ink-4)]">
              {windowSize} maanden per venster ({kolommen === 'alle' ? 'alle kolommen: kleiner venster' : 'kernkolommen'})
            </span>
          </div>
        )}

        <div className="mt-4">
          {state === 'loading' && <Spinner label="Tabel wordt berekend…" />}
          {state === 'error' && (
            <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-5 text-sm text-[var(--negative)]">
              {err}
            </div>
          )}
          {state === 'ready' && grid && (
            <>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ink-4)]">
                <span>
                  {grid.returnedRows} rijen · {grid.columns.length} kolommen ·{' '}
                  {modus === 'jaar' ? 'jaar-sampling (elke 12e maand)' : 'maandweergave'}
                </span>
                <span className="font-mono">tabel {meta.sheet} · {grid.totalMonths} maanden totaal</span>
              </div>
              <DataGrid columns={grid.columns} rows={grid.rows} showScrollHint={kolommen === 'alle'} />
            </>
          )}
        </div>
      </SectionCard>
    </div>
  )
}
