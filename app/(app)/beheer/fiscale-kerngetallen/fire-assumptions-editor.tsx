'use client'

import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, RefreshCw, Plus, Trash2, Save, Loader2, Check, AlertCircle, Pencil, X } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { computeEffectiveSwr } from '@/lib/fire-params'

/**
 * Beheer-CRUD voor de jaargelaagde FIRE-marktaannames (tabel fire_assumptions,
 * Optie 2: DB-override met TS-fallback). Spiegelt /beheer/aow-leeftijd.
 *
 * BELANGRIJK: SWR wordt NOOIT opgeslagen of ingevoerd. De SWR-kolom en de
 * formulier-preview zijn PUUR AFGELEID via de canonieke computeEffectiveSwr
 * (lib/fire-params.ts): rendement − Box 3-drag − inflatie. Consume, don't recompute.
 *
 * Invoer is in PROCENTEN (7 = 7%); de payload naar de API is in decimalen (0,07).
 */

interface FireAssumptionRow {
  year: number
  expected_return: number | string
  inflation: number | string
  volatility: number | string
  source: string | null
  is_definitive: boolean
  updated_at: string
}

interface FormData {
  year: number
  /** in procenten */
  expected_return: number
  inflation: number
  volatility: number
  source: string
  is_definitive: boolean
}

const emptyForm: FormData = {
  year: new Date().getFullYear(),
  expected_return: 7,
  inflation: 2,
  volatility: 15,
  source: '',
  is_definitive: false,
}

/** Formatteer een decimaal-fractie als NL-percentage ("0.0284" → "2,84%"). */
function pctStr(decimal: number): string {
  return `${(decimal * 100).toLocaleString('nl-NL', { maximumFractionDigits: 3 })}%`
}

export function FireAssumptionsEditor() {
  const [rows, setRows] = useState<FireAssumptionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingYear, setEditingYear] = useState<number | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)

  const fetchRows = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/fire-assumptions')
      if (!res.ok) throw new Error('Ophalen mislukt')
      const data = await res.json()
      setRows(Array.isArray(data) ? data : [])
    } catch {
      setMessage({ type: 'error', text: 'Kon FIRE-aannames niet ophalen' })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [message])

  function handleRefresh() {
    setRefreshing(true)
    fetchRows()
  }

  function openAdd() {
    setEditingYear(null)
    setForm(emptyForm)
    setSheetOpen(true)
  }

  function openEdit(row: FireAssumptionRow) {
    setEditingYear(row.year)
    setForm({
      year: row.year,
      expected_return: Number(row.expected_return) * 100,
      inflation: Number(row.inflation) * 100,
      volatility: Number(row.volatility) * 100,
      source: row.source ?? '',
      is_definitive: row.is_definitive,
    })
    setSheetOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      // Procenten → decimalen voor de API (die decimalen valideert, 0..1).
      const body = {
        year: form.year,
        expected_return: form.expected_return / 100,
        inflation: form.inflation / 100,
        volatility: form.volatility / 100,
        source: form.source.trim() || null,
        is_definitive: form.is_definitive,
      }
      const res = await fetch('/api/admin/fire-assumptions', {
        method: editingYear ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Opslaan mislukt')
      }
      setMessage({ type: 'success', text: editingYear ? `Jaar ${form.year} bijgewerkt` : `Jaar ${form.year} toegevoegd` })
      setSheetOpen(false)
      await fetchRows()
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Opslaan mislukt' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(year: number) {
    setDeleting(year)
    try {
      const res = await fetch('/api/admin/fire-assumptions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year }),
      })
      if (!res.ok) throw new Error('Verwijderen mislukt')
      setMessage({ type: 'success', text: `Jaar ${year} verwijderd` })
      await fetchRows()
    } catch {
      setMessage({ type: 'error', text: 'Kon jaar niet verwijderen' })
    } finally {
      setDeleting(null)
    }
  }

  // Live afgeleide SWR-preview voor het formulier (consume, don't recompute).
  const previewSwr = computeEffectiveSwr(form.expected_return / 100, form.inflation / 100)

  return (
    <section className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-ed)] p-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[var(--ink-3)]" />
            <h3 className="text-base font-bold text-[var(--ink)]">FIRE-marktaannames — jaarlagen bewerken</h3>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-[var(--ink-3)]">
            Verwacht rendement, inflatie en volatiliteit per jaar. Ontbreekt een jaarlaag, dan vallen de
            rekenmotoren terug op de defaults in <span className="font-mono text-xs">lib/constants.ts</span>.
            Een gebruiker die zelf rendement/inflatie invult, overschrijft deze markt-default.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Verversen
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            <Plus className="h-3.5 w-3.5" />
            Jaar toevoegen
          </button>
        </div>
      </div>

      {/* SWR-formule-uitleg */}
      <div className="border-b border-[var(--border-ed)] bg-[var(--subtle)] px-4 py-3 text-sm text-[var(--ink-2)]">
        <strong className="text-[var(--ink)]">SWR = rendement − Box 3-drag − inflatie</strong>{' '}
        <span className="text-[var(--ink-3)]">(afgeleid, beweegt met alle drie).</span>{' '}
        De veilige onttrekkingsvoet wordt <em>nooit</em> apart opgeslagen — hij volgt automatisch uit deze drie
        aannames via <span className="font-mono text-xs">computeEffectiveSwr</span>.
      </div>

      {/* Status message */}
      {message && (
        <div className={`mx-4 mt-4 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
          message.type === 'success'
            ? 'border-green-200 bg-green-50 text-green-800'
            : 'border-red-200 bg-red-50 text-red-800'
        }`}>
          {message.type === 'success' ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      {/* Tabel */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--ink-3)]" />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-[var(--ink-3)]">
          Geen jaarlagen. De rekenmotoren gebruiken de TS-defaults (lib/constants.ts). Voer de migratie uit of voeg een jaar toe.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--subtle)] text-left text-xs font-medium uppercase tracking-wider text-[var(--ink-3)]">
                <th className="px-4 py-3">Jaar</th>
                <th className="px-4 py-3 text-right">Rendement</th>
                <th className="px-4 py-3 text-right">Inflatie</th>
                <th className="px-4 py-3 text-right">Volatiliteit</th>
                <th className="px-4 py-3 text-right">SWR (afgeleid)</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Bron</th>
                <th className="px-4 py-3 text-right">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-ed)]">
              {rows.map((row) => {
                const er = Number(row.expected_return)
                const inf = Number(row.inflation)
                const vol = Number(row.volatility)
                const swr = computeEffectiveSwr(er, inf)
                return (
                  <tr key={row.year} className="transition-colors hover:bg-[var(--subtle)]">
                    <td className="px-4 py-3 font-semibold tabular-nums text-[var(--ink)]">{row.year}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--ink)]">{pctStr(er)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--ink)]">{pctStr(inf)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--ink)]">{pctStr(vol)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--ink-3)]">{pctStr(swr)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.is_definitive ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {row.is_definitive ? 'Definitief' : 'Aanname'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--ink-3)]">{row.source ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(row)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink)]"
                          title="Bewerken"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(row.year)}
                          disabled={deleting != null}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-3)] transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          title="Verwijderen"
                        >
                          {deleting === row.year ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit BottomSheet */}
      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editingYear ? `FIRE-aannames ${editingYear} bewerken` : 'Nieuwe FIRE-jaarlaag'}
        size="md"
        footerSlot={
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saving ? 'Opslaan...' : editingYear ? 'Opslaan' : 'Toevoegen'}
            </button>
            <button
              onClick={() => setSheetOpen(false)}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-md)] px-4 py-2.5 text-sm text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
            >
              <X className="h-3.5 w-3.5" />
              Annuleren
            </button>
          </div>
        }
      >
        <div className="space-y-4 p-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--ink-2)]">Jaar</label>
            <input
              type="number"
              min={2000}
              max={2100}
              value={form.year}
              disabled={editingYear != null}
              onChange={e => setForm(f => ({ ...f, year: parseInt(e.target.value) || f.year }))}
              className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)] disabled:opacity-60"
            />
            {editingYear != null && (
              <p className="mt-1 text-xs text-[var(--ink-4)]">Het jaar is de sleutel en kan niet worden gewijzigd. Verwijder de rij om een ander jaar te gebruiken.</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--ink-2)]">Rendement (%)</label>
              <input
                type="number"
                step="0.1"
                value={form.expected_return}
                onChange={e => setForm(f => ({ ...f, expected_return: parseFloat(e.target.value) || 0 }))}
                className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--ink-2)]">Inflatie (%)</label>
              <input
                type="number"
                step="0.1"
                value={form.inflation}
                onChange={e => setForm(f => ({ ...f, inflation: parseFloat(e.target.value) || 0 }))}
                className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--ink-2)]">Volatiliteit (%)</label>
              <input
                type="number"
                step="0.1"
                value={form.volatility}
                onChange={e => setForm(f => ({ ...f, volatility: parseFloat(e.target.value) || 0 }))}
                className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)]"
              />
            </div>
          </div>

          {/* Afgeleide SWR-preview — read-only, nooit invoerbaar */}
          <div className="flex items-center justify-between rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] px-4 py-3">
            <span className="text-sm text-[var(--ink-2)]">
              SWR (afgeleid: rendement − Box 3-drag − inflatie)
            </span>
            <span className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">{pctStr(previewSwr)}</span>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--ink-2)]">Bron / toelichting</label>
            <input
              type="text"
              value={form.source}
              onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
              placeholder="bv. TriFinity model-aanname 2026"
              className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)]"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_definitive}
              onChange={e => setForm(f => ({ ...f, is_definitive: e.target.checked }))}
              className="h-4 w-4 rounded border-[var(--border-md)] text-green-600"
            />
            <span className="text-sm font-medium text-[var(--ink-2)]">Definitief vastgesteld (niet langer een voorlopige aanname)</span>
          </label>
        </div>
      </BottomSheet>
    </section>
  )
}
