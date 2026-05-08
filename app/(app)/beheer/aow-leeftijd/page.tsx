'use client'

import { useState, useEffect, useCallback } from 'react'
import { Landmark, RefreshCw, Plus, Trash2, Save, Loader2, Check, AlertCircle, Pencil, X } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'

interface AowRow {
  id: string
  birth_date_from: string
  birth_date_through: string
  aow_years: number
  aow_months: number
  is_definitive: boolean
  source: string
  updated_at: string
}

type FormData = Omit<AowRow, 'id' | 'updated_at'>

const emptyForm: FormData = {
  birth_date_from: '',
  birth_date_through: '',
  aow_years: 67,
  aow_months: 0,
  is_definitive: false,
  source: 'SVB',
}

function formatDate(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatAowAge(years: number, months: number) {
  if (months === 0) return `${years} jaar`
  return `${years} jaar + ${months} mnd`
}

export default function AowLeeftijdPage() {
  const [rows, setRows] = useState<AowRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Form state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)

  const fetchRows = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/aow-leeftijd')
      if (!res.ok) throw new Error('Ophalen mislukt')
      const data = await res.json()
      setRows(data)
    } catch {
      setMessage({ type: 'error', text: 'Kon AOW-tabel niet ophalen' })
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
    setEditingId(null)
    setForm(emptyForm)
    setSheetOpen(true)
  }

  function openEdit(row: AowRow) {
    setEditingId(row.id)
    setForm({
      birth_date_from: row.birth_date_from,
      birth_date_through: row.birth_date_through,
      aow_years: row.aow_years,
      aow_months: row.aow_months,
      is_definitive: row.is_definitive,
      source: row.source,
    })
    setSheetOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const method = editingId ? 'PUT' : 'POST'
      const body = editingId ? { id: editingId, ...form } : form
      const res = await fetch('/api/admin/aow-leeftijd', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Opslaan mislukt')
      }
      setMessage({ type: 'success', text: editingId ? 'Rij bijgewerkt' : 'Rij toegevoegd' })
      setSheetOpen(false)
      await fetchRows()
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Opslaan mislukt' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      const res = await fetch('/api/admin/aow-leeftijd', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('Verwijderen mislukt')
      setMessage({ type: 'success', text: 'Rij verwijderd' })
      await fetchRows()
    } catch {
      setMessage({ type: 'error', text: 'Kon rij niet verwijderen' })
    } finally {
      setDeleting(null)
    }
  }

  const lastUpdated = rows.length > 0
    ? new Date(Math.max(...rows.map(r => new Date(r.updated_at).getTime())))
    : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-[var(--ink-3)]" />
            <h2 className="text-xl font-bold text-[var(--ink)]">AOW-leeftijd</h2>
          </div>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            Referentietabel AOW-leeftijd per geboortedatum. Bron: SVB / CBS.
          </p>
          {lastUpdated && (
            <p className="mt-0.5 text-xs text-[var(--ink-4)]">
              Laatst bijgewerkt: {lastUpdated.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Verversen
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Rij toevoegen
          </button>
        </div>
      </div>

      {/* Status message */}
      {message && (
        <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
          message.type === 'success'
            ? 'border-green-200 bg-green-50 text-green-800'
            : 'border-red-200 bg-red-50 text-red-800'
        }`}>
          {message.type === 'success' ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      {/* Info banner */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>Let op:</strong> De AOW-leeftijd wordt jaarlijks herzien door het CBS op basis van levensverwachting.
        Verwachte (niet-definitieve) leeftijden kunnen wijzigen. Controleer jaarlijks op{' '}
        <a
          href="https://www.svb.nl/nl/aow/aow-leeftijd/uw-aow-leeftijd"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-amber-900"
        >
          svb.nl
        </a>.
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--ink-3)]" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-8 text-center text-sm text-[var(--ink-3)]">
          Geen AOW-leeftijden gevonden. Voer de migratie uit of voeg rijen toe.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-ed)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--subtle)] text-left text-xs font-medium uppercase tracking-wider text-[var(--ink-3)]">
                <th className="px-4 py-3">Geboortedatum van</th>
                <th className="px-4 py-3">Geboortedatum t/m</th>
                <th className="px-4 py-3">AOW-leeftijd</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Bron</th>
                <th className="px-4 py-3 text-right">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-ed)]">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-[var(--subtle)] transition-colors">
                  <td className="px-4 py-3 font-mono tabular-nums">{formatDate(row.birth_date_from)}</td>
                  <td className="px-4 py-3 font-mono tabular-nums">{formatDate(row.birth_date_through)}</td>
                  <td className="px-4 py-3 font-medium text-[var(--ink)]">
                    {formatAowAge(row.aow_years, row.aow_months)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      row.is_definitive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {row.is_definitive ? 'Definitief' : 'Verwacht'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--ink-3)]">{row.source}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(row)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink)] transition-colors"
                        title="Bewerken"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(row.id)}
                        disabled={!!deleting}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-3)] hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                        title="Verwijderen"
                      >
                        {deleting === row.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Samenvatting */}
      {!loading && rows.length > 0 && (
        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
          <h3 className="text-sm font-medium text-[var(--ink-2)] mb-2">Samenvatting</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-[var(--ink)]">{rows.length}</div>
              <div className="text-xs text-[var(--ink-3)]">Rijen totaal</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">{rows.filter(r => r.is_definitive).length}</div>
              <div className="text-xs text-[var(--ink-3)]">Definitief</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-600">{rows.filter(r => !r.is_definitive).length}</div>
              <div className="text-xs text-[var(--ink-3)]">Verwacht</div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit BottomSheet */}
      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editingId ? 'AOW-rij bewerken' : 'Nieuwe AOW-rij'}
        size="md"
      >
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--ink-2)]">Geboortedatum van</label>
              <input
                type="date"
                value={form.birth_date_from}
                onChange={e => setForm(f => ({ ...f, birth_date_from: e.target.value }))}
                className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--ink-2)]">Geboortedatum t/m</label>
              <input
                type="date"
                value={form.birth_date_through}
                onChange={e => setForm(f => ({ ...f, birth_date_through: e.target.value }))}
                className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--ink-2)]">AOW-leeftijd (jaren)</label>
              <input
                type="number"
                min={60}
                max={75}
                value={form.aow_years}
                onChange={e => setForm(f => ({ ...f, aow_years: parseInt(e.target.value) || 67 }))}
                className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--ink-2)]">Extra maanden</label>
              <select
                value={form.aow_months}
                onChange={e => setForm(f => ({ ...f, aow_months: parseInt(e.target.value) }))}
                className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)]"
              >
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(m => (
                  <option key={m} value={m}>{m} maanden</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--ink-2)]">Bron</label>
            <input
              type="text"
              value={form.source}
              onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
              placeholder="SVB 2026"
              className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)]"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_definitive}
              onChange={e => setForm(f => ({ ...f, is_definitive: e.target.checked }))}
              className="h-4 w-4 rounded border-[var(--border-md)] text-green-600"
            />
            <span className="text-sm font-medium text-[var(--ink-2)]">Definitief vastgesteld (wettelijk)</span>
          </label>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving || !form.birth_date_from || !form.birth_date_through}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saving ? 'Opslaan...' : editingId ? 'Opslaan' : 'Toevoegen'}
            </button>
            <button
              onClick={() => setSheetOpen(false)}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-md)] px-4 py-2.5 text-sm text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Annuleren
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}
