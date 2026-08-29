'use client'

/**
 * VermogenSelectieSheet — bewerk-sheet voor de widget "Vermogen — eigen
 * selectie" (ADR 0120).
 *
 * ── Datapad (ADR 0058) ───────────────────────────────────────────────────
 * De keuzelijst is bewust NIET in de dashboard-bundel gepropt: hij is alleen
 * nodig zodra iemand de sheet opent. Lezen gaat daarom lazy via
 * `GET /api/wealth-selection` (server-side gescoped op de eigen rijen), muteren
 * via `PUT` op dezelfde route. Geen directe Supabase-client in dit bestand.
 *
 * ── Overlay ──────────────────────────────────────────────────────────────
 * `<ShellOverlay kind="sheet">` — "even iets snel doen, terug naar dezelfde
 * context". Opslaan/Annuleren staan in de `footer`-prop (sticky, niet-
 * meescrollend), conform de driewegregel in CLAUDE.md.
 *
 * ── Foutpad ──────────────────────────────────────────────────────────────
 * De API-envelope is plat (`{ error: string }`). Die tekst tonen we letterlijk;
 * niets wegmoffelen achter een generieke "er ging iets mis".
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import { MaskedAmount } from '@/components/app/masked-amount'
import { ASSET_TYPE_LABELS, type AssetType } from '@/lib/asset-data'
import { DEBT_TYPE_LABELS, type DebtType } from '@/lib/debt-data'

interface SelectableRow {
  id: string
  name: string
  type: string
  value: number
}

interface Props {
  open: boolean
  onClose: () => void
}

const FALLBACK_ERROR = 'Kon je bezittingen en schulden niet laden.'

function assetTypeLabel(type: string): string {
  return ASSET_TYPE_LABELS[type as AssetType] ?? type
}

function debtTypeLabel(type: string): string {
  return DEBT_TYPE_LABELS[type as DebtType] ?? type
}

export function VermogenSelectieSheet({ open, onClose }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [assets, setAssets] = useState<SelectableRow[]>([])
  const [debts, setDebts] = useState<SelectableRow[]>([])
  const [assetIds, setAssetIds] = useState<string[]>([])
  const [debtIds, setDebtIds] = useState<string[]>([])
  // Opslaan mag pas ná een gelukte load: na een mislukte GET staan de lijsten
  // leeg en zou Opslaan de bestaande selectie stil wissen (review 🟡2).
  const [loaded, setLoaded] = useState(false)

  // Lazy laden bij openen — niet bij mount, zodat een dichte sheet geen
  // netwerkverkeer kost op een dashboard vol widgets.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setLoaded(false)
    void (async () => {
      try {
        const res = await fetch('/api/wealth-selection')
        const json = (await res.json().catch(() => null)) as
          | {
              error?: string
              selection?: { assetIds: string[]; debtIds: string[] } | null
              available?: { assets?: SelectableRow[]; debts?: SelectableRow[] }
            }
          | null
        if (!res.ok) throw new Error(json?.error ?? FALLBACK_ERROR)
        if (cancelled) return
        setAssets(json?.available?.assets ?? [])
        setDebts(json?.available?.debts ?? [])
        setAssetIds(json?.selection?.assetIds ?? [])
        setDebtIds(json?.selection?.debtIds ?? [])
        setLoaded(true)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : FALLBACK_ERROR)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  const toggleAsset = useCallback((id: string) => {
    setAssetIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }, [])

  const toggleDebt = useCallback((id: string) => {
    setDebtIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }, [])

  const save = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/wealth-selection', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetIds, debtIds }),
      })
      const json = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(json?.error ?? 'Opslaan is niet gelukt.')
      onClose()
      // De bundel draagt het widget-veld: pas na een refresh klopt de tegel.
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan is niet gelukt.')
    } finally {
      setSaving(false)
    }
  }, [assetIds, debtIds, onClose, router])

  const totalSelected = assetIds.length + debtIds.length

  return (
    <ShellOverlay
      open={open}
      onClose={onClose}
      kind="sheet"
      size="lg"
      title="Selectie bewerken"
      footer={
        <ModalFooter
          layout="stacked"
          primary={{
            label: 'Opslaan',
            onClick: () => void save(),
            loading: saving,
            disabled: loading || saving || !loaded,
          }}
          secondary={{ label: 'Annuleren', onClick: onClose, disabled: saving }}
        />
      }
    >
      <div className="space-y-5">
        <p className="font-serif italic text-[13px] leading-relaxed text-[var(--ink-2)]">
          Kies welke bezittingen en schulden meetellen in deze tegel. De weging
          per post volgt je eigen instelling; wat je hier kiest verandert niets
          aan je netto vermogen.
        </p>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 border border-negative/40 bg-negative/10 px-3 py-2"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-negative" aria-hidden="true" />
            <p className="text-[13px] text-[var(--ink)]">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-11 animate-pulse border border-[var(--border-ed)] bg-[var(--subtle)]/40"
              />
            ))}
          </div>
        ) : (
          <>
            <Section
              title="Bezittingen"
              rows={assets}
              selectedIds={assetIds}
              onToggle={toggleAsset}
              labelFor={assetTypeLabel}
              emptyText="Je hebt nog geen bezittingen geregistreerd."
            />
            <Section
              title="Schulden"
              rows={debts}
              selectedIds={debtIds}
              onToggle={toggleDebt}
              labelFor={debtTypeLabel}
              emptyText="Je hebt nog geen schulden geregistreerd."
            />
            <p className="text-[12px] text-[var(--ink-3)]">
              {totalSelected === 0
                ? 'Nog niets geselecteerd — de tegel blijft dan leeg.'
                : `${totalSelected} ${totalSelected === 1 ? 'post' : 'posten'} geselecteerd.`}
            </p>
          </>
        )}
      </div>
    </ShellOverlay>
  )
}

function Section({
  title,
  rows,
  selectedIds,
  onToggle,
  labelFor,
  emptyText,
}: {
  title: string
  rows: SelectableRow[]
  selectedIds: string[]
  onToggle: (id: string) => void
  labelFor: (type: string) => string
  emptyText: string
}) {
  return (
    <section>
      <h4 className="label-editorial mb-2 text-[var(--ink-3)]">{title}</h4>
      {rows.length === 0 ? (
        <p className="font-serif italic text-[13px] text-[var(--ink-3)]">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map(row => {
            const selected = selectedIds.includes(row.id)
            return (
              <li key={row.id}>
                <label
                  className={`flex min-h-11 cursor-pointer items-center gap-3 border px-3 py-2 transition-colors ${
                    selected
                      ? 'border-[var(--ink)] bg-[var(--paper)]'
                      : 'border-[var(--border-ed)] bg-[var(--paper)] hover:bg-[var(--subtle)]/40'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggle(row.id)}
                    className="h-4 w-4 accent-[var(--ink)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-[var(--ink)]">{row.name}</span>
                    <span className="block truncate text-[11px] text-[var(--ink-3)]">
                      {labelFor(row.type)}
                    </span>
                  </span>
                  <MaskedAmount value={row.value} tone="kern" className="text-[12px] text-[var(--ink-3)]" />
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
