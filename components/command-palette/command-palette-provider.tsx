'use client'

/**
 * CommandPaletteProvider — context + globale ⌘K-binding + render van de dialog.
 *
 * Mount-locatie: binnen FeatureAccessProvider in `app/(app)/layout.tsx` zodat
 * de palette toegang heeft tot module-state, chat-context, privacy-context,
 * global-sync-context en router. De provider rendert NIET zelf chrome — de
 * dialog wordt lazy gemount (next/dynamic + mount-latch) bij de eerste open en
 * blijft daarna gemount; de ⌘K-binding zelf zit altijd in deze provider.
 *
 * Public API:
 *   useCommandPalette() → { isOpen, open, close, toggle }
 *
 * De ⌘K-binding wordt op `document` aangehaakt en respecteert active text-
 * inputs niet-globaal genoeg om in de weg te zitten: in editable elementen
 * onderscheppen we Ctrl/⌘+K niet, omdat browsers de combo daar zelden
 * gebruiken voor iets anders dan link-toevoeging in rich-text editors. Bij
 * conflict komt deze later terug als feature-toggle.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import dynamic from 'next/dynamic'

// De ⌘K-dialog trekt command-palette.tsx + de navigation-index/actions/fuzzy/
// recents-libs, lib/nav-config en tientallen lucide-iconen mee. Die hoeven niet
// in de gedeelde layout-chunk van élke (app)-pagina te zitten: de palette opent
// per pageview zelden. `next/dynamic` met `ssr: false` splitst die chunk af
// zodat hij pas wordt gefetcht wanneer de dialog voor het eerst mount (bij de
// eerste ⌘K/trigger — zie de mount-latch hieronder). Zelfde patroon als
// components/app/chat/chat-panel-lazy.tsx.
const CommandPalette = dynamic(
  () => import('./command-palette').then((m) => m.CommandPalette),
  { ssr: false },
)

interface CommandPaletteContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null)

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext)
  if (!ctx) {
    // Fallback voor tests / sandboxes — palette-trigger doet niets buiten een provider.
    return { isOpen: false, open: () => {}, close: () => {}, toggle: () => {} }
  }
  return ctx
}

export function CommandPaletteProvider({
  role,
  children,
}: {
  /** Rol uit profiles.role — bepaalt of beheer-pages getoond worden. */
  role?: string
  children: ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])

  // Mount-latch: de CommandPalette-dialog wordt pas gemount zodra de palette
  // voor het eerst opent, en daarna PERMANENT gemount gehouden (net als
  // ChatPanelLazy). Gedragsbehoud: de dialog rendert `null` zolang `open` false
  // is (zie `if (!open) return null`) en al zijn effects zijn `if (!open)`-
  // geguard, dus vóór de eerste open deed hij observeerbaar niets. Nadat hij
  // een keer gemount is, blijft interne state (query-reset/recents/selectie)
  // exact identiek aan de oude, altijd-gemounte opzet.
  const everOpenedRef = useRef(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    if (isOpen && !everOpenedRef.current) {
      everOpenedRef.current = true
      setMounted(true)
    }
  }, [isOpen])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // ⌘K (Mac) of Ctrl+K (Windows/Linux) — toggle palette.
      const isMod = e.metaKey || e.ctrlKey
      if (isMod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setIsOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const value = useMemo<CommandPaletteContextValue>(
    () => ({ isOpen, open, close, toggle }),
    [isOpen, open, close, toggle],
  )

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      {mounted && <CommandPalette open={isOpen} onClose={close} role={role} />}
    </CommandPaletteContext.Provider>
  )
}
