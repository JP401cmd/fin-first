'use client'

/**
 * CommandPalette — de ⌘K dialog.
 *
 * UX-patroon (eigen overlay-categorie, niet via ShellOverlay):
 *  - Top-anchored op desktop (top: 12vh), full-screen op mobile.
 *  - Eén input + meerdere secties (Recent / Pagina's / Items / Acties).
 *  - Keyboard-nav over alle visible items: ↑/↓ scrollt, ⏎ activeert, Esc sluit.
 *  - Server-side ilike-prefilter via /api/command-palette/search; client-side
 *    fuzzy-rank via lib/command-palette/fuzzy.ts voor pages + actions.
 *
 * Waarom geen ShellOverlay-wrapper? De driewegregel (pane/sheet/confirm) past
 * niet schoon bij een launcher-modal: de palette wil top-anchored, geen
 * sheet-bottom-detents, geen pane-headers. We hergebruiken wel de primitives
 * (`useFocusTrap`, `useScrollLock`, portal naar document.body) zodat a11y +
 * scroll-gedrag consistent blijft met de rest van het overlay-systeem.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Search, X, ArrowUp, ArrowDown, CornerDownLeft, type LucideIcon } from 'lucide-react'
import { useScrollLock } from '@/lib/hooks/use-scroll-lock'
import { useFocusTrap } from '@/lib/hooks/use-focus-trap'
import { useChatContext } from '@/components/app/chat/chat-provider'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { useGlobalSync } from '@/components/sync/global-sync-provider'
import { useModuleAccess } from '@/components/app/feature-access-provider'
import { usePerspective } from '@/components/app/perspective-provider'
import {
  getAllPageItems,
  getAdminPageItems,
  filterPagesByModules,
} from '@/lib/command-palette/navigation-index'
import { buildActionItems, type ActionRunContext } from '@/lib/command-palette/actions'
import { fuzzyScore } from '@/lib/command-palette/fuzzy'
import { readRecents, pushRecent, recentsToCommandItems } from '@/lib/command-palette/recents'
import type { CommandItem, EntitySearchResponse } from '@/lib/command-palette/types'

// ── Constants ────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 200
const PAGES_LIMIT_VISIBLE = 6
const ACTIONS_LIMIT_VISIBLE = 4
const MIN_QUERY_FOR_API = 2

// Module → kleur-var. Determineert het accent-kleurtje per result-row.
const MODULE_ACCENT: Record<string, string> = {
  kern: 'var(--color-kern-500)',
  wil: 'var(--color-wil-500)',
  horizon: 'var(--color-horizon-500)',
  beheer: 'var(--ink-3)',
  globaal: 'var(--ink-3)',
}

// ── Types ────────────────────────────────────────────────────────────────────

type Section = {
  key: 'recent' | 'pages' | 'items' | 'actions' | 'perspective'
  label: string
  items: CommandItem[]
}

type CommandPaletteProps = {
  open: boolean
  onClose: () => void
  /** profile.role uit (app)/layout.tsx — bepaalt zichtbaarheid van beheer-pages. */
  role?: string
}

// ── Component ────────────────────────────────────────────────────────────────

export function CommandPalette({ open, onClose, role }: CommandPaletteProps) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [entityResults, setEntityResults] = useState<CommandItem[]>([])
  const [entityLoading, setEntityLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const { activeModules } = useModuleAccess()
  const { open: openChat } = useChatContext()
  const { masked, toggle: togglePrivacy } = useMaskedAmounts()
  const { triggerGlobalSync } = useGlobalSync()
  const {
    perspective: currentPerspective,
    availablePerspectives,
    setPerspective,
  } = usePerspective()

  // ── Action-context bouwen ──────────────────────────────────────────────────
  const actionCtx = useMemo<ActionRunContext>(
    () => ({
      router,
      closePalette: onClose,
      openChat,
      togglePrivacy,
      privacyMasked: masked,
      triggerPricesSync: async () => {
        await triggerGlobalSync({ exchanges: [], wallets: [], pricesOnly: true })
      },
      currentPerspective,
      availablePerspectives,
      setPerspective,
    }),
    [
      router,
      onClose,
      openChat,
      togglePrivacy,
      masked,
      triggerGlobalSync,
      currentPerspective,
      availablePerspectives,
      setPerspective,
    ],
  )

  // ── Statische items (memoized) ─────────────────────────────────────────────
  const allPages = useMemo(() => {
    const pages = getAllPageItems()
    const filtered = filterPagesByModules(pages, activeModules)
    if (role === 'superadmin') {
      return [...filtered, ...getAdminPageItems()]
    }
    return filtered
  }, [activeModules, role])

  const allActions = useMemo(
    () => buildActionItems(actionCtx, activeModules),
    [actionCtx, activeModules],
  )

  // ── Reset state bij open ───────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setQuery('')
      setEntityResults([])
      setSelectedIndex(0)
    }
  }, [open])

  // ── Recents (alleen wanneer geen query) ────────────────────────────────────
  const [recents, setRecents] = useState<CommandItem[]>([])
  useEffect(() => {
    if (!open) return
    setRecents(recentsToCommandItems(readRecents()))
  }, [open])

  // ── Entity-search (debounced) ──────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_FOR_API) {
      setEntityResults([])
      setEntityLoading(false)
      return
    }
    setEntityLoading(true)
    const ctrl = new AbortController()
    const handle = setTimeout(async () => {
      try {
        const res = await fetch('/api/command-palette/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query: trimmed }),
          signal: ctrl.signal,
        })
        if (!res.ok) {
          setEntityResults([])
          return
        }
        const json = (await res.json()) as EntitySearchResponse
        setEntityResults(json.results ?? [])
      } catch {
        // abort of network error — stilte is hier ok, palette werkt nog op pages/actions
      } finally {
        setEntityLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(handle)
      ctrl.abort()
    }
  }, [open, query])

  // ── Secties berekenen ──────────────────────────────────────────────────────
  const sections = useMemo<Section[]>(() => {
    // Splits perspective-acties van algemene acties: ze leven in een eigen
    // sectie "Perspectief" zodat ze niet wegvallen achter de
    // ACTIONS_LIMIT_VISIBLE-cap én visueel gegroepeerd zijn met andere
    // perspective-opties wanneer er meerdere zijn (household-users).
    const perspectiveActions = allActions.filter((a) => a.id.startsWith('action:perspective-'))
    const generalActions = allActions.filter((a) => !a.id.startsWith('action:perspective-'))

    const trimmed = query.trim()
    if (!trimmed) {
      const out: Section[] = []
      if (recents.length > 0) {
        out.push({ key: 'recent', label: 'Recent', items: recents.slice(0, 6) })
      }
      out.push({ key: 'actions', label: 'Acties', items: generalActions.slice(0, ACTIONS_LIMIT_VISIBLE) })
      if (perspectiveActions.length > 0) {
        out.push({ key: 'perspective', label: 'Perspectief', items: perspectiveActions })
      }
      return out
    }

    // Pages: fuzzy-rank
    const rankedPages = allPages
      .map((p) => {
        const labelScore = fuzzyScore(p.label, trimmed)
        const sublabelScore = p.sublabel ? fuzzyScore(p.sublabel, trimmed) : null
        const best = Math.max(labelScore?.score ?? -Infinity, (sublabelScore?.score ?? -Infinity) - 5)
        return { item: p, score: best }
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, PAGES_LIMIT_VISIBLE)
      .map((r) => r.item)

    // Items: server retourneerde al ilike-gefilterd; client doet alleen sortering
    // op fuzzy-score zodat exact-startswith bovenaan staat.
    const rankedItems = entityResults
      .map((it) => ({ item: it, score: fuzzyScore(it.label, trimmed)?.score ?? 0 }))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item)

    // Actions: ook fuzzy-rank zodat "verberg" → "Bedragen verbergen" werkt
    const rankedActions = generalActions
      .map((a) => ({ item: a, score: fuzzyScore(a.label, trimmed)?.score ?? 0 }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, ACTIONS_LIMIT_VISIBLE)
      .map((r) => r.item)

    // Perspective-acties: óók fuzzy-rank (zodat zoeken op "huishouden"
    // ze meteen toont) maar in eigen sectie en zonder cap.
    const rankedPerspective = perspectiveActions
      .map((a) => ({ item: a, score: fuzzyScore(a.label, trimmed)?.score ?? 0 }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item)

    const out: Section[] = []
    if (rankedPages.length > 0) out.push({ key: 'pages', label: 'Pagina\'s', items: rankedPages })
    if (rankedItems.length > 0) out.push({ key: 'items', label: 'Mijn data', items: rankedItems })
    if (rankedActions.length > 0) out.push({ key: 'actions', label: 'Acties', items: rankedActions })
    if (rankedPerspective.length > 0) out.push({ key: 'perspective', label: 'Perspectief', items: rankedPerspective })
    return out
  }, [query, recents, allPages, allActions, entityResults])

  // ── Vlakke item-lijst voor keyboard-nav ────────────────────────────────────
  const flatItems = useMemo(() => sections.flatMap((s) => s.items), [sections])

  // Reset selectedIndex naar 0 bij elke nieuwe item-set; behoud anders
  useEffect(() => {
    setSelectedIndex((prev) => {
      if (flatItems.length === 0) return 0
      if (prev >= flatItems.length) return 0
      return prev
    })
  }, [flatItems])

  // ── Activeer item ──────────────────────────────────────────────────────────
  const activate = useCallback(
    (item: CommandItem) => {
      pushRecent(item)
      if (item.run) {
        void item.run()
        return
      }
      if (item.href) {
        onClose()
        router.push(item.href)
      }
    },
    [router, onClose],
  )

  // ── Keyboard-nav ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => (flatItems.length === 0 ? 0 : (i + 1) % flatItems.length))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => (flatItems.length === 0 ? 0 : (i - 1 + flatItems.length) % flatItems.length))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const item = flatItems[selectedIndex]
        if (item) activate(item)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, flatItems, selectedIndex, activate, onClose])

  // ── Auto-scroll selected row in view ───────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const el = containerRef.current?.querySelector<HTMLElement>('[data-cmd-selected="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [open, selectedIndex])

  // ── Body scroll-lock + focus-trap ──────────────────────────────────────────
  useScrollLock(open)
  useFocusTrap({ active: open, containerRef, initialFocusRef: inputRef })

  // ── Backdrop click ─────────────────────────────────────────────────────────
  const onBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose],
  )

  if (!open) return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      data-cmdk-overlay
      onClick={onBackdrop}
      className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px] flex items-end md:items-start md:pt-[12vh] justify-center"
      style={{ animation: 'cmdk-fade-in 120ms ease-out' }}
    >
      <div
        ref={containerRef}
        data-cmdk-panel
        role="dialog"
        aria-label="Zoeken in TriFinity"
        aria-modal="true"
        className="w-full md:max-w-2xl bg-[var(--paper)] border border-[var(--border-ed)] shadow-[var(--s2)] flex flex-col max-h-[88vh] md:max-h-[70vh]"
        style={{
          animation: 'cmdk-pop-in 180ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {/* ── Input ── */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-[var(--border-ed)] shrink-0">
          <Search className="w-4 h-4 text-[var(--ink-3)]" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="Zoek pagina's, items of acties…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-3)] outline-none"
            aria-label="Zoekopdracht"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            className="inline-flex items-center justify-center w-7 h-7 text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--subtle)]/50 rounded-sm focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto" data-scroll-container={false}>
          {flatItems.length === 0 ? (
            <EmptyState query={query} loading={entityLoading} />
          ) : (
            <div className="py-2">
              {sections.map((section) => (
                <SectionView
                  key={section.key}
                  section={section}
                  flatItems={flatItems}
                  selectedIndex={selectedIndex}
                  onSelect={(idx) => setSelectedIndex(idx)}
                  onActivate={activate}
                />
              ))}
              {entityLoading && query.trim().length >= MIN_QUERY_FOR_API && (
                <div className="px-4 py-2 text-[11px] uppercase tracking-[0.15em] text-[var(--ink-4)]">
                  Mijn data laden…
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between gap-3 px-4 h-9 border-t border-[var(--border-ed)] text-[11px] text-[var(--ink-3)] shrink-0">
          <div className="flex items-center gap-3">
            <KbdHint icon={ArrowUp} icon2={ArrowDown}>
              Navigeer
            </KbdHint>
            <KbdHint icon={CornerDownLeft}>Selecteer</KbdHint>
            <KbdHint label="Esc">Sluiten</KbdHint>
          </div>
          <div className="font-mono uppercase tracking-[0.15em] text-[var(--ink-4)]">
            ⌘K
          </div>
        </div>
      </div>

      {/* Component-scoped <style> i.p.v. styled-jsx — consistent met
          page-skeleton.tsx convention. Unieke keyframe-namen (`cmdk-*`)
          voorkomen botsingen met andere keyframes in globals.css. */}
      <style>{`
        @keyframes cmdk-fade-in {
          from { opacity: 0 }
          to   { opacity: 1 }
        }
        @keyframes cmdk-pop-in {
          from { opacity: 0; transform: translateY(6px) scale(0.985) }
          to   { opacity: 1; transform: translateY(0) scale(1) }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-cmdk-overlay], [data-cmdk-panel] { animation: none !important; }
        }
      `}</style>
    </div>,
    document.body,
  )
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function SectionView({
  section,
  flatItems,
  selectedIndex,
  onSelect,
  onActivate,
}: {
  section: Section
  flatItems: CommandItem[]
  selectedIndex: number
  onSelect: (idx: number) => void
  onActivate: (item: CommandItem) => void
}) {
  return (
    <div className="px-2 pb-2">
      <div className="px-3 pt-3 pb-1.5 text-[10px] uppercase tracking-[0.18em] text-[var(--ink-4)] font-medium">
        {section.label}
      </div>
      <ul role="listbox" aria-label={section.label}>
        {section.items.map((item) => {
          const idx = flatItems.indexOf(item)
          const isSelected = idx === selectedIndex
          return (
            <CommandRow
              key={item.id}
              item={item}
              selected={isSelected}
              onPointerEnter={() => onSelect(idx)}
              onClick={() => onActivate(item)}
            />
          )
        })}
      </ul>
    </div>
  )
}

function CommandRow({
  item,
  selected,
  onPointerEnter,
  onClick,
}: {
  item: CommandItem
  selected: boolean
  onPointerEnter: () => void
  onClick: () => void
}) {
  const accent = item.module ? MODULE_ACCENT[item.module] ?? 'var(--ink-3)' : 'var(--ink-3)'
  const Icon = item.icon
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        data-cmd-selected={selected ? 'true' : undefined}
        onPointerEnter={onPointerEnter}
        onClick={onClick}
        className={`group w-full flex items-center gap-3 px-3 py-2 text-left transition-colors duration-100 ${
          selected ? 'bg-[var(--subtle)]/70' : 'hover:bg-[var(--subtle)]/40'
        }`}
      >
        <span
          aria-hidden
          className="inline-block w-0.5 h-5 shrink-0 rounded-full"
          style={{ background: selected ? accent : 'transparent' }}
        />
        {Icon ? (
          <Icon className="w-4 h-4 shrink-0 text-[var(--ink-3)] group-hover:text-[var(--ink-2)]" aria-hidden />
        ) : (
          <span className="w-4 h-4 shrink-0" />
        )}
        <span className="flex-1 min-w-0 flex items-baseline gap-2">
          <span className="truncate text-[14px] text-[var(--ink)] font-medium">{item.label}</span>
          {item.sublabel && (
            <span className="truncate text-[12px] text-[var(--ink-3)]">{item.sublabel}</span>
          )}
        </span>
        {item.module && item.module !== 'globaal' && item.module !== 'beheer' && (
          <ModuleBadge module={item.module} accent={accent} />
        )}
        {selected && (
          <CornerDownLeft
            className="w-3.5 h-3.5 shrink-0 text-[var(--ink-4)]"
            aria-hidden
          />
        )}
      </button>
    </li>
  )
}

function ModuleBadge({ module: moduleId, accent }: { module: string; accent: string }) {
  const label =
    moduleId === 'kern' ? 'Kern' :
    moduleId === 'wil' ? 'Wil' :
    moduleId === 'horizon' ? 'Horizon' :
    moduleId.charAt(0).toUpperCase() + moduleId.slice(1)
  const style: CSSProperties = {
    color: accent,
    borderColor: accent,
    opacity: 0.65,
  }
  return (
    <span
      className="font-mono text-[9px] uppercase tracking-[0.18em] px-1.5 py-0.5 border rounded-sm shrink-0"
      style={style}
    >
      {label}
    </span>
  )
}

function EmptyState({ query, loading }: { query: string; loading: boolean }) {
  if (loading) {
    return (
      <div className="px-6 py-12 text-center text-[13px] text-[var(--ink-3)]">
        Laden…
      </div>
    )
  }
  if (!query.trim()) {
    return (
      <div className="px-6 py-12 text-center text-[13px] text-[var(--ink-3)]">
        Begin met typen om pagina&rsquo;s, items en acties te zoeken.
      </div>
    )
  }
  return (
    <div className="px-6 py-12 text-center">
      <div className="text-[14px] text-[var(--ink-2)] font-medium mb-1">Geen resultaten</div>
      <div className="text-[12px] text-[var(--ink-3)]">
        Niets gevonden voor &ldquo;{query}&rdquo;. Probeer een ander woord.
      </div>
    </div>
  )
}

function KbdHint({
  icon,
  icon2,
  label,
  children,
}: {
  icon?: LucideIcon
  icon2?: LucideIcon
  label?: string
  children: React.ReactNode
}) {
  const Icon = icon
  const Icon2 = icon2
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-0.5 font-mono">
        {Icon && (
          <kbd className="inline-flex items-center justify-center w-4 h-4 border border-[var(--border-ed)] text-[var(--ink-2)]">
            <Icon className="w-2.5 h-2.5" aria-hidden />
          </kbd>
        )}
        {Icon2 && (
          <kbd className="inline-flex items-center justify-center w-4 h-4 border border-[var(--border-ed)] text-[var(--ink-2)]">
            <Icon2 className="w-2.5 h-2.5" aria-hidden />
          </kbd>
        )}
        {label && (
          <kbd className="inline-flex items-center justify-center px-1 h-4 border border-[var(--border-ed)] text-[var(--ink-2)] text-[10px] uppercase">
            {label}
          </kbd>
        )}
      </span>
      <span>{children}</span>
    </span>
  )
}
