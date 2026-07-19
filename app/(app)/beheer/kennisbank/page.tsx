'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2, ArrowUp, ArrowDown, AlertTriangle, Gauge, Sparkles, X, BookOpen } from 'lucide-react'
import {
  buildKnowledgeContext,
  LOCAL_KNOWLEDGE_TOKEN_BUDGET,
  type LocalKnowledgeItem,
} from '@/lib/ai/local/knowledge-context'
import { KNOWLEDGE_STARTER_SET, buildStarterItems } from '@/lib/ai/local/knowledge-starter-set'

/**
 * /beheer/kennisbank — beheer van de kennisbank lokale AI (fase K1).
 *
 * Een gecureerde uitleg-laag die later (C1b) binnen een token-budget in de
 * systeemprompt van de lokale Will-chat wordt geïnjecteerd. Deze pagina is puur
 * beheer: toevoegen, bewerken, aan/uit, verwijderen en volgorde. Er is nog geen
 * consument aan gebruikerskant.
 */

type EditableField = 'titel' | 'tekst' | 'actief'

function nowIso(): string {
  return new Date().toISOString()
}

export default function BeheerKennisbankPage() {
  const [items, setItems] = useState<LocalKnowledgeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  // Rij die op "Zeker weten?" staat bij verwijderen (twee-staps, inline).
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const confirmRef = useRef<HTMLDivElement | null>(null)

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/local-knowledge')
      if (!res.ok) {
        setMessage({ type: 'error', text: 'Kon de kennisbank niet laden (geen toegang?)' })
        return
      }
      const data = await res.json()
      setItems(data.items ?? [])
    } catch {
      setMessage({ type: 'error', text: 'Kon de kennisbank niet laden' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [message])

  // Twee-staps verwijderen: de "Zeker weten?"-staat vervalt automatisch na ~4 s
  // en zodra er buiten de bevestig-knoppen wordt geklikt. Bewust geen overlay —
  // dit is lichte lijst-editing in beheer.
  useEffect(() => {
    if (!confirmDeleteId) return
    const timer = setTimeout(() => setConfirmDeleteId(null), 4000)
    const onDocMouseDown = (e: MouseEvent) => {
      if (confirmRef.current && !confirmRef.current.contains(e.target as Node)) {
        setConfirmDeleteId(null)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', onDocMouseDown)
    }
  }, [confirmDeleteId])

  function updateItem(id: string, field: EditableField, value: string | boolean) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: value, bijgewerkt: nowIso() } : it)),
    )
    setDirty(true)
  }

  function updateTags(id: string, raw: string) {
    const tags = raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, tags, bijgewerkt: nowIso() } : it)),
    )
    setDirty(true)
  }

  function addItem() {
    const item: LocalKnowledgeItem = {
      id: crypto.randomUUID(),
      titel: '',
      tekst: '',
      tags: [],
      actief: true,
      volgorde: items.length,
      bijgewerkt: nowIso(),
    }
    setItems((prev) => [...prev, item])
    setDirty(true)
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id))
    setConfirmDeleteId(null)
    setDirty(true)
  }

  /**
   * Laad de gecureerde startset in de editor. Overschrijft niets stilzwijgend:
   * bij bestaande items eerst bevestigen, en items met een titel die er al is
   * worden overgeslagen. De beheerder reviewt en slaat zelf op.
   */
  function loadStarterSet() {
    if (items.length > 0) {
      const doorgaan = window.confirm(
        'Er staan al kennisitems. De startset wordt eronder toegevoegd (bestaande items blijven staan). Doorgaan?',
      )
      if (!doorgaan) return
    }
    const bestaandeTitels = new Set(items.map((it) => it.titel.trim().toLowerCase()))
    const nieuw = buildStarterItems(items.length).filter(
      (it) => !bestaandeTitels.has(it.titel.trim().toLowerCase()),
    )
    if (nieuw.length === 0) {
      setMessage({ type: 'success', text: 'Alle startset-begrippen staan er al.' })
      return
    }
    setItems((prev) => [...prev, ...nieuw])
    setDirty(true)
    setMessage({
      type: 'success',
      text: `${nieuw.length} startset-begrippen toegevoegd. Bekijk ze en sla op.`,
    })
  }

  function move(id: string, dir: 'up' | 'down') {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.id === id)
      if (idx < 0) return prev
      const target = dir === 'up' ? idx - 1 : idx + 1
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
    setDirty(true)
  }

  async function handleSave() {
    // Client-side minimumcheck (de route valideert opnieuw met zod).
    const invalid = items.find((it) => !it.titel.trim() || !it.tekst.trim())
    if (invalid) {
      setMessage({ type: 'error', text: 'Elk item heeft een titel én uitleg nodig.' })
      return
    }
    setSaving(true)
    try {
      // Volgorde canoniek uit de arrayvolgorde; velden getrimd.
      const payload = items.map((it, i) => ({
        ...it,
        volgorde: i,
        titel: it.titel.trim(),
        tekst: it.tekst.trim(),
      }))
      const res = await fetch('/api/admin/local-knowledge', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      })
      if (res.ok) {
        setItems(payload)
        setDirty(false)
        setMessage({ type: 'success', text: 'Kennisbank opgeslagen' })
      } else {
        setMessage({ type: 'error', text: 'Opslaan mislukt' })
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-md)] border-t-[var(--ink-2)]" />
      </div>
    )
  }

  // Voorbeeld van wat er straks (C1b) daadwerkelijk wordt geïnjecteerd — de
  // canonieke helper is de single source, hier niet nagerekend.
  const preview = buildKnowledgeContext(items)
  const activeCount = items.filter((it) => it.actief).length
  const overBudget = activeCount > preview.includedIds.length

  const confirmingItem = confirmDeleteId ? items.find((it) => it.id === confirmDeleteId) : null
  const confirmingTitle = confirmingItem?.titel.trim() || 'Naamloos item'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-inter)] text-lg font-bold text-[var(--ink)]">
          Kennisbank lokale AI
        </h2>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Beheer de uitleg-items die de lokale Will straks meekrijgt in haar systeemprompt. Je voegt
          begrippen toe, zet ze aan of uit en bepaalt de volgorde. De items worden binnen een
          token-budget in volgorde opgenomen — wat niet past, valt af.
        </p>
      </div>

      {/* Harde inhoudsregel (Wft/correctheid) — prominent */}
      <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="space-y-1 text-sm text-amber-900">
          <p className="font-semibold">Alleen uitleg en begrippen — nooit cijfers.</p>
          <p>
            Zet hier uitsluitend uitleg neer (bijvoorbeeld &ldquo;wat is Box 3&rdquo; of &ldquo;hoe
            werkt jaarruimte&rdquo;). <strong>Nooit</strong> cijfers, tarieven of rekentabellen:
            bedragen en percentages komen altijd uit de rekenmotoren. Zo blijft de lokale Will
            correct en Wft-veilig.
          </p>
        </div>
      </div>

      {/* Item-template + startset */}
      <div className="space-y-3 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[var(--ink)]">Zo maak je een vindbaar item</h3>
          <button
            type="button"
            onClick={loadStarterSet}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-md)] px-3 py-1.5 text-sm font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--ink-3)] hover:bg-[var(--subtle)]"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Startset laden ({KNOWLEDGE_STARTER_SET.length} begrippen)
          </button>
        </div>
        <ul className="space-y-1.5 text-sm text-[var(--ink-2)]">
          <li>
            <strong>Titel</strong> — het begrip zoals een gebruiker het noemt, bijvoorbeeld{' '}
            <em>Jaarruimte</em>.
          </li>
          <li>
            <strong>Trefwoorden</strong> — zoekwoorden en synoniemen waarop dit item meegaat,
            bijvoorbeeld <em>pensioen, lijfrente, aftrek, jaarruimte</em>. Hierop matcht de lokale
            chat straks de vraag.
          </li>
          <li>
            <strong>Uitleg</strong> — twee tot zes zinnen in je/jij-taal. Leg het begrip uit,
            zónder cijfers of tarieven; verwijs voor getallen naar de app.
          </li>
        </ul>
        <div className="rounded-lg bg-[var(--subtle)]/50 px-3 py-2 text-xs text-[var(--ink-3)]">
          <span className="font-medium text-[var(--ink-2)]">Voorbeeld — </span>
          Titel: <em>Jaarruimte</em> · Trefwoorden: <em>pensioen, lijfrente, aftrek</em> · Uitleg:
          &ldquo;Jaarruimte is de ruimte om fiscaal voordelig extra pensioen op te bouwen, bijvoorbeeld
          met een lijfrente…&rdquo;
        </div>
      </div>

      {/* Budget-indicatie op basis van de canonieke injectie-helper */}
      <div className="flex items-center gap-3 rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)]/40 px-5 py-3 text-sm text-[var(--ink-2)]">
        <Gauge className="h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
        <span>
          {preview.includedIds.length} van {activeCount} actieve items passen — geschat{' '}
          <strong>{preview.estTokens}</strong> / {LOCAL_KNOWLEDGE_TOKEN_BUDGET} tokens.
          {overBudget && (
            <span className="text-amber-700">
              {' '}
              Enkele items vallen buiten het budget; zet minder belangrijke items lager of uit.
            </span>
          )}
        </span>
      </div>

      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border border-green-200 bg-green-50 text-green-700'
              : 'border border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {dirty && (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="text-sm font-medium text-amber-800">Onopgeslagen wijzigingen</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                fetchItems()
                setDirty(false)
              }}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)]"
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-[var(--ink)] px-4 py-1.5 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:opacity-50"
            >
              {saving ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </div>
      )}

      {/* Live-regio: kondigt de bevestig-staat van verwijderen aan (blijft gemount) */}
      <p className="sr-only" aria-live="polite">
        {confirmDeleteId
          ? `Verwijderen van ${confirmingTitle} vragen om bevestiging. Klik nogmaals op verwijderen om te bevestigen, of annuleer.`
          : ''}
      </p>

      {/* Itemlijst */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] px-5 py-12 text-center">
          <BookOpen className="h-8 w-8 text-[var(--ink-4)]" aria-hidden="true" />
          <p className="max-w-md text-sm italic text-[var(--ink-3)]">
            Nog geen kennisitems — voeg begrippen toe die de lokale Will helpen je vragen te begrijpen.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={addItem}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)]"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Item toevoegen
            </button>
            <button
              type="button"
              onClick={loadStarterSet}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--ink-3)] hover:bg-[var(--subtle)]"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Startset laden ({KNOWLEDGE_STARTER_SET.length} begrippen)
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className={`rounded-xl border bg-[var(--paper)] px-5 py-4 ${
                item.actief ? 'border-[var(--border-ed)]' : 'border-[var(--border-md)] opacity-70'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-3">
                  {/* Titel */}
                  <div>
                    <span className="mb-0.5 block px-1 text-[10px] font-medium text-[var(--ink-4)]">
                      Titel — het begrip zoals een gebruiker het noemt
                    </span>
                    <input
                      type="text"
                      value={item.titel}
                      placeholder="Jaarruimte"
                      onChange={(e) => updateItem(item.id, 'titel', e.target.value)}
                      className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm font-medium text-[var(--ink)] focus:border-[var(--ink-3)] focus:outline-none"
                    />
                  </div>

                  {/* Uitleg */}
                  <div>
                    <span className="mb-0.5 block px-1 text-[10px] font-medium text-[var(--ink-4)]">
                      Uitleg — 2 tot 6 zinnen in je/jij-taal, geen cijfers
                    </span>
                    <textarea
                      value={item.tekst}
                      rows={3}
                      placeholder="Jaarruimte is de ruimte om fiscaal voordelig extra pensioen op te bouwen, bijvoorbeeld met een lijfrente..."
                      onChange={(e) => updateItem(item.id, 'tekst', e.target.value)}
                      className="w-full resize-y rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--ink-3)] focus:outline-none"
                    />
                  </div>

                  {/* Tags */}
                  <div>
                    <span className="mb-0.5 block px-1 text-[10px] font-medium text-[var(--ink-4)]">
                      Trefwoorden — zoekwoorden en synoniemen, komma-gescheiden
                    </span>
                    <input
                      type="text"
                      value={item.tags.join(', ')}
                      placeholder="pensioen, lijfrente, aftrek, jaarruimte"
                      onChange={(e) => updateTags(item.id, e.target.value)}
                      className="w-full rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-xs text-[var(--ink-2)] transition-colors hover:border-[var(--border-md)] focus:border-[var(--border-md)] focus:bg-[var(--paper)] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Bedieningen rechts */}
                <div className="flex shrink-0 flex-col items-end gap-3">
                  <span className="rounded-md bg-[var(--subtle)] px-1.5 py-0.5 text-[10px] text-[var(--ink-4)]">
                    #{idx + 1}
                  </span>

                  {/* Actief-toggle (role=switch, patroon uit local-categorization-settings) */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={item.actief}
                    aria-label={`${item.titel.trim() || 'Naamloos item'} — ${
                      item.actief ? 'actief, klik om uit te zetten' : 'uitgeschakeld, klik om aan te zetten'
                    }`}
                    onClick={() => updateItem(item.id, 'actief', !item.actief)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-kern-500 ${
                      item.actief ? 'bg-kern-500' : 'bg-[var(--border-md)]'
                    }`}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        item.actief ? 'translate-x-5' : ''
                      }`}
                    />
                  </button>

                  {/* Volgorde + verwijderen (twee-staps inline confirm) */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => move(item.id, 'up')}
                      disabled={idx === 0}
                      aria-label="Item omhoog"
                      className="rounded-lg p-1.5 text-[var(--ink-4)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-3)] disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(item.id, 'down')}
                      disabled={idx === items.length - 1}
                      aria-label="Item omlaag"
                      className="rounded-lg p-1.5 text-[var(--ink-4)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-3)] disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    {confirmDeleteId === item.id ? (
                      <div ref={confirmRef} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-negative transition-colors hover:bg-negative/5"
                        >
                          Verwijderen?
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          aria-label="Verwijderen annuleren"
                          className="rounded-lg p-1.5 text-[var(--ink-4)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-3)]"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(item.id)}
                        aria-label={`${item.titel.trim() || 'Naamloos item'} verwijderen`}
                        className="rounded-lg p-1.5 text-[var(--ink-4)] transition-colors hover:bg-negative/5 hover:text-negative"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toevoegen — alleen bij een gevulde lijst; de lege staat draagt de acties zelf */}
      {items.length > 0 && (
        <button
          type="button"
          onClick={addItem}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-md)] px-5 py-3 text-sm font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--ink-3)] hover:bg-[var(--subtle)]/40"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Item toevoegen
        </button>
      )}
    </div>
  )
}
