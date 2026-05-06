'use client'

/**
 * CommandPaletteProvider — context + globale ⌘K-binding + render van de dialog.
 *
 * Mount-locatie: binnen FeatureAccessProvider in `app/(app)/layout.tsx` zodat
 * de palette toegang heeft tot module-state, chat-context, privacy-context,
 * global-sync-context en router. De provider rendert NIET zelf chrome —
 * alleen de dialog (en alleen als deze open is).
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
  useState,
  type ReactNode,
} from 'react'
import { CommandPalette } from './command-palette'

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
      <CommandPalette open={isOpen} onClose={close} role={role} />
    </CommandPaletteContext.Provider>
  )
}
