'use client'

import { useState, useEffect, useCallback, useRef, type RefObject } from 'react'
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  Gauge,
  Sparkles,
  X,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock,
  Search,
  CheckCircle2,
} from 'lucide-react'
import {
  buildKnowledgeContext,
  LOCAL_KNOWLEDGE_TOKEN_BUDGET,
  type LocalKnowledgeItem,
} from '@/lib/ai/local/knowledge-context'
import {
  KNOWLEDGE_STARTER_SET,
  KNOWLEDGE_CATEGORIES,
  buildStarterItems,
} from '@/lib/ai/local/knowledge-starter-set'
import {
  groupItemsByCategory,
  summarizeFreshness,
  freshnessMeta,
  formatReviewDate,
} from '@/lib/ai/local/knowledge-grouping'

/**
 * /beheer/kennisbank — beheer van de kennisbank lokale AI (fase K1 / K1.1).
 *
 * Een gecureerde uitleg-laag die later (C1b) binnen een token-budget in de
 * systeemprompt van de lokale Fin-chat wordt geïnjecteerd. Deze pagina is puur
 * beheer: toevoegen, bewerken, aan/uit, categoriseren, verloop bijhouden,
 * verwijderen en volgorde. Er is nog geen consument aan gebruikerskant.
 *
 * K1.1-uitbreiding: de lijst wordt per `categorie` gegroepeerd (puur visueel —
 * de onderliggende flat volgorde blijft leidend voor `volgorde` bij opslaan),
 * items dragen een verloop-stoplicht (freshness), en de startset laadt
 * categorie-bewust.
 */

type EditableField = 'titel' | 'tekst' | 'actief' | 'categorie'

/** Aantal startset-begrippen per categorie, voor de "per categorie laden"-UI. */
const STARTER_CATEGORY_COUNTS: { categorie: string; count: number }[] = KNOWLEDGE_CATEGORIES.map(
  (categorie) => ({
    categorie,
    count: KNOWLEDGE_STARTER_SET.filter((t) => t.categorie === categorie).length,
  }),
).filter((c) => c.count > 0)

function nowIso(): string {
  return new Date().toISOString()
}

/** `<input type="date">` verwacht YYYY-MM-DD; onze opslag kan een volle ISO zijn. */
function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ''
}

export function KennisbankClient() {
  const [items, setItems] = useState<LocalKnowledgeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  // Rij die op "Zeker weten?" staat bij verwijderen (twee-staps, inline).
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const confirmRef = useRef<HTMLDivElement | null>(null)
  // Ingeklapte categorie-groepen (leeg = alles open; groepen staan standaard open).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  // Uitklap-paneel voor de categorie-bewuste startset.
  const [showStarterPanel, setShowStarterPanel] = useState(false)
  // Tekstfilter op titel/trefwoorden — relevant zodra de bank groeit voorbij een paar tientallen items.
  const [filterText, setFilterText] = useState('')

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
    // Categorie gewijzigd? Klap de doelgroep open, anders "verdwijnt" het item
    // stilzwijgend in een ingeklapte sectie zonder enige feedback.
    if (field === 'categorie' && typeof value === 'string') {
      setCollapsed((prev) => {
        if (!prev.has(value)) return prev
        const next = new Set(prev)
        next.delete(value)
        return next
      })
    }
    setDirty(true)
  }

  function updateControleerVoor(id: string, raw: string) {
    // Leeg datumveld → evergreen (null); anders de YYYY-MM-DD-waarde bewaren.
    const value = raw.trim() ? raw : null
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, controleerVoor: value, bijgewerkt: nowIso() } : it)),
    )
    setDirty(true)
  }

  /**
   * Markeer een item als vandaag inhoudelijk gecontroleerd — het sluitstuk van
   * de verloop-tracking (anders wordt `laatstGecontroleerd` alleen bij aanmaak
   * gezet en nooit meer bijgewerkt). Raakt bewust niet `controleerVoor` of de
   * teksten zelf: dit is een aparte, expliciete curator-actie ("ik heb dit
   * bekeken en het klopt nog"), geen bijwerking van een tekstwijziging.
   */
  function markReviewed(id: string) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, laatstGecontroleerd: nowIso() } : it)),
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
      categorie: KNOWLEDGE_CATEGORIES[0],
      laatstGecontroleerd: nowIso(),
      controleerVoor: null,
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
   * Laad de gecureerde startset in de editor — optioneel gefilterd op één
   * categorie (`undefined` = alle categorieën). Overschrijft niets stilzwijgend:
   * bij bestaande items eerst bevestigen, en items met een titel die er al is
   * worden overgeslagen. De beheerder reviewt en slaat zelf op.
   */
  function loadStarter(categorie?: string) {
    if (items.length > 0) {
      const doorgaan = window.confirm(
        'Er staan al kennisitems. De startset wordt eronder toegevoegd (bestaande items blijven staan). Doorgaan?',
      )
      if (!doorgaan) return
    }
    const bestaandeTitels = new Set(items.map((it) => it.titel.trim().toLowerCase()))
    const nieuw = buildStarterItems(items.length)
      .filter((it) => !categorie || it.categorie === categorie)
      .filter((it) => !bestaandeTitels.has(it.titel.trim().toLowerCase()))
    if (nieuw.length === 0) {
      setMessage({
        type: 'success',
        text: categorie
          ? `Alle begrippen uit ${categorie} staan er al.`
          : 'Alle startset-begrippen staan er al.',
      })
      return
    }
    setItems((prev) => [...prev, ...nieuw])
    // Klap de betrokken categorieën open zodat de zojuist toegevoegde items
    // niet stilzwijgend in een ingeklapte sectie belanden.
    const nieuweCategorieen = new Set(nieuw.map((it) => it.categorie))
    setCollapsed((prev) => {
      if (![...nieuweCategorieen].some((c) => prev.has(c))) return prev
      const next = new Set(prev)
      nieuweCategorieen.forEach((c) => next.delete(c))
      return next
    })
    setDirty(true)
    setShowStarterPanel(false)
    setMessage({
      type: 'success',
      text: `${nieuw.length} ${nieuw.length === 1 ? 'begrip' : 'begrippen'} toegevoegd. Bekijk ze en sla op.`,
    })
  }

  function toggleGroup(categorie: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(categorie)) next.delete(categorie)
      else next.add(categorie)
      return next
    })
  }

  /** Klap alle zichtbare categorieën tegelijk in of uit. */
  function toggleAllGroups(categorieen: string[]) {
    setCollapsed((prev) => (prev.size >= categorieen.length ? new Set() : new Set(categorieen)))
  }

  /**
   * Verplaats een item binnen zijn EIGEN categorie-groep: zoekt de eerstvolgende
   * (of vorige) buur met dezelfde `categorie` in de flat array en verwisselt
   * daarmee — niet de louter flat-aangrenzende buur. De gegroepeerde weergave
   * toont per sectie alleen items van díe categorie; een swap met een
   * andere-categorie-buur zou daardoor onzichtbaar zijn (geen beweging binnen
   * de groep) terwijl de state wél muteert. De globale `volgorde` (en dus de
   * budget-prioriteit) blijft het onderliggende mechanisme; deze functie kiest
   * alleen een ander buur-paar om te verwisselen, zodat de knop altijd
   * zichtbaar effect heeft binnen de groep waar de gebruiker naar kijkt.
   */
  function move(id: string, dir: 'up' | 'down') {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.id === id)
      if (idx < 0) return prev
      const categorie = prev[idx].categorie
      const step = dir === 'up' ? -1 : 1
      let target = idx + step
      while (target >= 0 && target < prev.length && prev[target].categorie !== categorie) {
        target += step
      }
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
      // Volgorde canoniek uit de arrayvolgorde; velden getrimd. De visuele
      // groepering verandert deze array-volgorde NIET.
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

  const now = new Date()
  const groups = groupItemsByCategory(items, KNOWLEDGE_CATEGORIES)
  const { verlopen, binnenkort } = summarizeFreshness(items, now)
  const hasFreshnessAttention = verlopen > 0 || binnenkort > 0
  const freshnessTone = verlopen > 0 ? 'red' : 'amber'
  const allCollapsed = collapsed.size >= groups.length && groups.length > 0

  // Tekstfilter (titel/trefwoorden) — puur een zichtbaarheidslaag: de
  // #nummer/omhoog-omlaag-grenzen blijven gebaseerd op de VOLLEDIGE groep
  // (zie isFirstInGroup/isLastInGroup hieronder), niet op de gefilterde subset.
  const normalizedFilter = filterText.trim().toLowerCase()
  function matchesFilter(item: LocalKnowledgeItem): boolean {
    if (!normalizedFilter) return true
    return (
      item.titel.toLowerCase().includes(normalizedFilter) ||
      item.tags.some((t) => t.toLowerCase().includes(normalizedFilter))
    )
  }

  const confirmingItem = confirmDeleteId ? items.find((it) => it.id === confirmDeleteId) : null
  const confirmingTitle = confirmingItem?.titel.trim() || 'Naamloos item'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-inter)] text-lg font-bold text-[var(--ink)]">
          Kennisbank lokale AI
        </h2>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Beheer de uitleg-items die de lokale Fin straks meekrijgt in haar systeemprompt. Je voegt
          begrippen toe, ordent ze per categorie, zet ze aan of uit en houdt bij wanneer ze
          gecontroleerd moeten worden. De items worden binnen een token-budget in volgorde opgenomen
          — wat niet past, valt af.
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
            bedragen en percentages komen altijd uit de rekenmotoren. Zo blijft de lokale Fin
            correct en Wft-veilig.
          </p>
        </div>
      </div>

      {/* Item-template + startset (categorie-bewust) */}
      <div className="space-y-3 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[var(--ink)]">Zo maak je een vindbaar item</h3>
          <button
            type="button"
            onClick={() => setShowStarterPanel((v) => !v)}
            aria-expanded={showStarterPanel}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-md)] px-3 py-1.5 text-sm font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--ink-3)] hover:bg-[var(--subtle)]"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Startset laden ({KNOWLEDGE_STARTER_SET.length} begrippen)
            <ChevronDown
              className={`h-4 w-4 transition-transform ${showStarterPanel ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>

        {showStarterPanel && (
          <div className="space-y-2 rounded-lg border border-[var(--border-md)] bg-[var(--subtle)]/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-[var(--ink-2)]">
                Laad de gecureerde begrippen — alles in één keer of per categorie. Bestaande titels
                worden overgeslagen; je reviewt en slaat zelf op.
              </span>
              <button
                type="button"
                onClick={() => loadStarter()}
                className="shrink-0 rounded-lg bg-[var(--ink)] px-3 py-1.5 text-xs font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)]"
              >
                Alles laden ({KNOWLEDGE_STARTER_SET.length})
              </button>
            </div>
            <ul className="divide-y divide-[var(--border-md)]/60">
              {STARTER_CATEGORY_COUNTS.map(({ categorie, count }) => (
                <li key={categorie} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="text-sm text-[var(--ink-2)]">
                    {categorie}{' '}
                    <span className="text-[var(--ink-4)]">
                      ({count} {count === 1 ? 'begrip' : 'begrippen'})
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => loadStarter(categorie)}
                    className="shrink-0 rounded-lg border border-[var(--border-md)] px-2.5 py-1 text-xs font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--ink-3)] hover:bg-[var(--paper)]"
                  >
                    Laden
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ul className="space-y-1.5 text-sm text-[var(--ink-2)]">
          <li>
            <strong>Titel</strong> — het begrip zoals een gebruiker het noemt, bijvoorbeeld{' '}
            <em>Jaarruimte</em>.
          </li>
          <li>
            <strong>Categorie</strong> — waar dit begrip bij hoort. Bepaalt onder welke groep het
            item in dit scherm staat.
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
          <li>
            <strong>Controledatum</strong> — optioneel. Zet een datum op begrippen die aan
            wetgeving hangen die kan wijzigen (bijvoorbeeld Box 3); laat leeg voor tijdloze uitleg.
          </li>
        </ul>
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

      {/* Verloop-samenvatting — alleen tonen als er iets openstaat */}
      {hasFreshnessAttention && (
        <div
          className={`flex items-center gap-3 rounded-xl border px-5 py-3 text-sm ${
            freshnessTone === 'red'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-amber-300 bg-amber-50 text-amber-900'
          }`}
        >
          <Clock
            className={`h-4 w-4 shrink-0 ${freshnessTone === 'red' ? 'text-red-600' : 'text-amber-600'}`}
            aria-hidden="true"
          />
          <span>
            {[
              verlopen > 0 && `${verlopen} ${verlopen === 1 ? 'item verlopen' : 'items verlopen'}`,
              binnenkort > 0 && `${binnenkort} binnenkort te controleren`,
            ]
              .filter(Boolean)
              .join(', ')}
            . Controleer of de uitleg nog klopt met de huidige regels.
          </span>
        </div>
      )}

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

      {/* Filter + alles in-/uitklappen — pas relevant zodra de bank groeit */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[14rem] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-4)]"
              aria-hidden="true"
            />
            <label htmlFor="kennisbank-filter" className="sr-only">
              Filter op titel of trefwoord
            </label>
            <input
              id="kennisbank-filter"
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter op titel of trefwoord..."
              className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--paper)] py-2 pl-9 pr-3 text-sm text-[var(--ink)] focus:border-[var(--ink-3)] focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => toggleAllGroups(groups.map((g) => g.categorie))}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[var(--border-md)] px-3 py-1.5 text-sm font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--ink-3)] hover:bg-[var(--subtle)]"
          >
            {allCollapsed ? (
              <ChevronsUpDown className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronsDownUp className="h-4 w-4" aria-hidden="true" />
            )}
            {allCollapsed ? 'Alles uitklappen' : 'Alles inklappen'}
          </button>
        </div>
      )}

      {/* Itemlijst — gegroepeerd per categorie (puur visueel) */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] px-5 py-12 text-center">
          <BookOpen className="h-8 w-8 text-[var(--ink-4)]" aria-hidden="true" />
          <p className="max-w-md text-sm italic text-[var(--ink-3)]">
            Nog geen kennisitems — voeg begrippen toe die de lokale Fin helpen je vragen te begrijpen.
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
              onClick={() => loadStarter()}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--ink-3)] hover:bg-[var(--subtle)]"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Startset laden ({KNOWLEDGE_STARTER_SET.length} begrippen)
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => {
            // Filteren op tekst dwingt de groep open (anders zie je je eigen
            // zoekresultaat niet); de #nummer/omhoog-omlaag-grenzen blijven
            // hieronder gebaseerd op de VOLLEDIGE group.entries, niet op de
            // gefilterde subset.
            const visibleEntries = group.entries.filter(({ item }) => matchesFilter(item))
            if (normalizedFilter && visibleEntries.length === 0) return null
            const isCollapsed = !normalizedFilter && collapsed.has(group.categorie)
            return (
              <section key={group.categorie} className="space-y-3">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.categorie)}
                  aria-expanded={!isCollapsed}
                  className="flex w-full items-center gap-2 border-b border-[var(--border-md)] pb-1.5 text-left"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
                  )}
                  <span className="text-sm font-semibold text-[var(--ink)]">{group.categorie}</span>
                  <span className="text-xs text-[var(--ink-4)]">
                    {normalizedFilter && visibleEntries.length !== group.total
                      ? `${visibleEntries.length} van ${group.total} items`
                      : `${group.total} ${group.total === 1 ? 'item' : 'items'}, ${group.active} actief`}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="space-y-3">
                    {visibleEntries.map(({ item, index }) => {
                      const posInGroup = group.entries.findIndex((e) => e.item.id === item.id)
                      return (
                        <KnowledgeItemRow
                          key={item.id}
                          item={item}
                          index={index}
                          isFirstInGroup={posInGroup === 0}
                          isLastInGroup={posInGroup === group.entries.length - 1}
                          now={now}
                          confirmDeleteId={confirmDeleteId}
                          confirmRef={confirmRef}
                          onUpdate={updateItem}
                          onUpdateTags={updateTags}
                          onUpdateControleerVoor={updateControleerVoor}
                          onMove={move}
                          onMarkReviewed={markReviewed}
                          onRequestDelete={setConfirmDeleteId}
                          onCancelDelete={() => setConfirmDeleteId(null)}
                          onConfirmDelete={removeItem}
                        />
                      )
                    })}
                  </div>
                )}
              </section>
            )
          })}
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

interface KnowledgeItemRowProps {
  item: LocalKnowledgeItem
  /** Originele positie in de flat `items`-array (voor het #nummer). */
  index: number
  /** Positie binnen de EIGEN categorie-groep — bepaalt de omhoog/omlaag-grenzen. */
  isFirstInGroup: boolean
  isLastInGroup: boolean
  now: Date
  confirmDeleteId: string | null
  confirmRef: RefObject<HTMLDivElement | null>
  onUpdate: (id: string, field: EditableField, value: string | boolean) => void
  onUpdateTags: (id: string, raw: string) => void
  onUpdateControleerVoor: (id: string, raw: string) => void
  onMove: (id: string, dir: 'up' | 'down') => void
  onMarkReviewed: (id: string) => void
  onRequestDelete: (id: string) => void
  onCancelDelete: () => void
  onConfirmDelete: (id: string) => void
}

function KnowledgeItemRow({
  item,
  index,
  isFirstInGroup,
  isLastInGroup,
  now,
  confirmDeleteId,
  confirmRef,
  onUpdate,
  onUpdateTags,
  onUpdateControleerVoor,
  onMove,
  onMarkReviewed,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: KnowledgeItemRowProps) {
  const freshness = freshnessMeta(item, now)
  const laatstGecontroleerdLabel = item.laatstGecontroleerd
    ? formatReviewDate(item.laatstGecontroleerd)
    : null
  // Categorie-opties: de curatie-set, plus de huidige waarde als die (legacy)
  // niet in de set staat, zodat een oud item z'n categorie niet verliest.
  const categoryOptions: string[] = KNOWLEDGE_CATEGORIES.includes(
    item.categorie as (typeof KNOWLEDGE_CATEGORIES)[number],
  )
    ? [...KNOWLEDGE_CATEGORIES]
    : [item.categorie, ...KNOWLEDGE_CATEGORIES]

  const titelId = `titel-${item.id}`
  const categorieId = `categorie-${item.id}`
  const controleerVoorId = `controleer-voor-${item.id}`
  const tekstId = `tekst-${item.id}`
  const tagsId = `tags-${item.id}`

  return (
    <div
      className={`rounded-xl border bg-[var(--paper)] px-5 py-4 ${
        item.actief ? 'border-[var(--border-ed)]' : 'border-[var(--border-md)] opacity-70'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          {/* Titel */}
          <div>
            <label
              htmlFor={titelId}
              className="mb-0.5 block px-1 text-[10px] font-medium text-[var(--ink-4)]"
            >
              Titel — het begrip zoals een gebruiker het noemt
            </label>
            <input
              id={titelId}
              type="text"
              value={item.titel}
              placeholder="Jaarruimte"
              onChange={(e) => onUpdate(item.id, 'titel', e.target.value)}
              className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm font-medium text-[var(--ink)] focus:border-[var(--ink-3)] focus:outline-none"
            />
          </div>

          {/* Categorie + controledatum */}
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[10rem] flex-1">
              <label
                htmlFor={categorieId}
                className="mb-0.5 block px-1 text-[10px] font-medium text-[var(--ink-4)]"
              >
                Categorie — bepaalt de groep in dit scherm
              </label>
              <select
                id={categorieId}
                value={item.categorie}
                onChange={(e) => onUpdate(item.id, 'categorie', e.target.value)}
                className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--ink-3)] focus:outline-none"
              >
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[10rem] flex-1">
              <label
                htmlFor={controleerVoorId}
                className="mb-0.5 block px-1 text-[10px] font-medium text-[var(--ink-4)]"
              >
                Controleer vóór — leeg = tijdloos (evergreen)
              </label>
              <input
                id={controleerVoorId}
                type="date"
                value={toDateInputValue(item.controleerVoor)}
                onChange={(e) => onUpdateControleerVoor(item.id, e.target.value)}
                className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--ink-3)] focus:outline-none"
              />
            </div>
          </div>

          {/* Uitleg */}
          <div>
            <label
              htmlFor={tekstId}
              className="mb-0.5 block px-1 text-[10px] font-medium text-[var(--ink-4)]"
            >
              Uitleg — 2 tot 6 zinnen in je/jij-taal, geen cijfers
            </label>
            <textarea
              id={tekstId}
              value={item.tekst}
              rows={3}
              placeholder="Jaarruimte is de ruimte om fiscaal voordelig extra pensioen op te bouwen, bijvoorbeeld met een lijfrente..."
              onChange={(e) => onUpdate(item.id, 'tekst', e.target.value)}
              className="w-full resize-y rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--ink-3)] focus:outline-none"
            />
          </div>

          {/* Tags */}
          <div>
            <label
              htmlFor={tagsId}
              className="mb-0.5 block px-1 text-[10px] font-medium text-[var(--ink-4)]"
            >
              Trefwoorden — zoekwoorden en synoniemen, komma-gescheiden
            </label>
            <input
              id={tagsId}
              type="text"
              value={item.tags.join(', ')}
              placeholder="pensioen, lijfrente, aftrek, jaarruimte"
              onChange={(e) => onUpdateTags(item.id, e.target.value)}
              className="w-full rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-xs text-[var(--ink-2)] transition-colors hover:border-[var(--border-md)] focus:border-[var(--border-md)] focus:bg-[var(--paper)] focus:outline-none"
            />
          </div>
        </div>

        {/* Bedieningen rechts */}
        <div className="flex shrink-0 flex-col items-end gap-3">
          <div className="flex items-center gap-2">
            {/* Verloop-stoplicht (status-semantiek, geen module-accent) */}
            <span
              role="img"
              aria-label={freshness.label}
              title={freshness.label}
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${freshness.dotClass}`}
            />
            <button
              type="button"
              onClick={() => onMarkReviewed(item.id)}
              aria-label={`${item.titel.trim() || 'Naamloos item'} markeren als vandaag gecontroleerd`}
              title={
                laatstGecontroleerdLabel
                  ? `Laatst gecontroleerd: ${laatstGecontroleerdLabel} — klik om nu te markeren`
                  : 'Nog niet gecontroleerd — klik om nu te markeren'
              }
              className="rounded-md p-0.5 text-[var(--ink-4)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <span className="rounded-md bg-[var(--subtle)] px-1.5 py-0.5 text-[10px] text-[var(--ink-4)]">
              #{index + 1}
            </span>
          </div>

          {/* Actief-toggle (role=switch, patroon uit local-categorization-settings) */}
          <button
            type="button"
            role="switch"
            aria-checked={item.actief}
            aria-label={`${item.titel.trim() || 'Naamloos item'} — ${
              item.actief ? 'actief, klik om uit te zetten' : 'uitgeschakeld, klik om aan te zetten'
            }`}
            onClick={() => onUpdate(item.id, 'actief', !item.actief)}
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
              onClick={() => onMove(item.id, 'up')}
              disabled={isFirstInGroup}
              aria-label="Item omhoog binnen deze categorie"
              className="rounded-lg p-1.5 text-[var(--ink-4)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-3)] disabled:opacity-30"
            >
              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onMove(item.id, 'down')}
              disabled={isLastInGroup}
              aria-label="Item omlaag binnen deze categorie"
              className="rounded-lg p-1.5 text-[var(--ink-4)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-3)] disabled:opacity-30"
            >
              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {confirmDeleteId === item.id ? (
              <div ref={confirmRef} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onConfirmDelete(item.id)}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-negative transition-colors hover:bg-negative/5"
                >
                  Verwijderen?
                </button>
                <button
                  type="button"
                  onClick={onCancelDelete}
                  aria-label="Verwijderen annuleren"
                  className="rounded-lg p-1.5 text-[var(--ink-4)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-3)]"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onRequestDelete(item.id)}
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
  )
}
