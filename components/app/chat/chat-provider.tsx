'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'

type ChatContextType = {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
  /**
   * Opent de chat met een vooraf ingevulde vraag.
   *
   * `onAnswered` vuurt pas wanneer Fin daadwerkelijk een antwoord heeft
   * gerenderd — niet bij de klik (M25). De aanroeper hangt daar het gevolg aan
   * dat pas ná een antwoord mag gelden, zoals "markeer dit bericht als
   * gelezen". Faalt de aanvraag, of wordt hij nooit verstuurd (Wft-modal niet
   * geaccepteerd, chat gesloten), dan blijft de callback ongebruikt.
   */
  openWithMessage: (message: string, onAnswered?: () => void) => void
  pendingMessage: string | null
  clearPendingMessage: () => void
  /** ChatPanel: er staat een gerenderd antwoord — voer de wachtende callback uit. */
  resolvePendingAnswer: () => void
  /** ChatPanel: er komt geen antwoord (fout/afgebroken) — laat de callback vallen. */
  dropPendingAnswer: () => void
  isPinned: boolean
  togglePin: () => void
  setIsPinned: (pinned: boolean) => void
  /** Auto-message to send when chat is opened from a specific page context */
  autoOpenMessage: string | null
  setAutoOpenMessage: (msg: string | null) => void
  /**
   * Open de chat rechtstreeks in de MELDMODUS (megafoon) — de enige invoerweg
   * voor bugs, vragen en aanbevelingen sinds ADR 0096. Gebruikt door de
   * verwijspagina `/mijn/feedback`.
   *
   * De modus zelf is state van ChatPanel (het gesprek moet blijven staan terwijl
   * je meldt), dus dit is een intent-vlag die ChatPanel oppikt en direct wist.
   */
  openMelding: () => void
  /** True zolang ChatPanel de meldmodus-intent nog moet oppakken. */
  meldingRequested: boolean
  clearMeldingRequest: () => void
}

const ChatContext = createContext<ChatContextType | null>(null)

const PIN_STORAGE_KEY = 'trifinity-chat-pinned'

export function useChatContext() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChatContext must be used within ChatProvider')
  return ctx
}

/**
 * Niet-throwende variant: retourneert null buiten een ChatProvider (bv. in
 * unit-tests of SSR-fragmenten). Voor leaf-componenten die de chat optioneel
 * aansturen en hun parent-tree niet mogen laten crashen.
 */
export function useChatContextOptional() {
  return useContext(ChatContext)
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [isPinned, setIsPinnedState] = useState(false)
  const [autoOpenMessage, setAutoOpenMessageState] = useState<string | null>(null)
  const [meldingRequested, setMeldingRequested] = useState(false)

  // Restore pin state from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PIN_STORAGE_KEY)
      if (stored === 'true') {
        setIsPinnedState(true)
        setIsOpen(true) // auto-open when pinned
      }
    } catch {
      // localStorage not available
    }
  }, [])

  // Sync CSS custom property on <html> so all fixed-positioned elements
  // (header, modals, toasts, FAB) can respect the sidebar width
  useEffect(() => {
    const width = isPinned && isOpen ? '420px' : '0px'
    document.documentElement.style.setProperty('--chat-sidebar-width', width)
    return () => {
      document.documentElement.style.setProperty('--chat-sidebar-width', '0px')
    }
  }, [isPinned, isOpen])

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => {
    setIsOpen(false)
    // Meldmodus-intent altijd laten vallen bij sluiten. ChatPanel wist 'm
    // normaal zelf, maar komt via next/dynamic binnen: faalt die chunk-fetch,
    // dan blijft de vlag anders de hele sessie staan en landt de gebruiker
    // later ongevraagd in de meldmodus bij een gewone chat-opening.
    setMeldingRequested(false)
    // Unpin when closing
    setIsPinnedState(false)
    try { localStorage.setItem(PIN_STORAGE_KEY, 'false') } catch {}
  }, [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])

  // De "pas gelezen bij een écht antwoord"-koppeling (M25). Bewust een ref en
  // geen state: dit is geen renderbare waarde, en een state-update zou elke
  // consument van de chatcontext opnieuw laten renderen bij iedere klik op
  // "Vraag Fin". Eén wachtende callback tegelijk — een nieuwe vraag vervangt de
  // vorige, want dat is ook wat de gebruiker doet.
  const pendingAnsweredRef = useRef<(() => void) | null>(null)

  const openWithMessage = useCallback((message: string, onAnswered?: () => void) => {
    pendingAnsweredRef.current = onAnswered ?? null
    setPendingMessage(message)
    setIsOpen(true)
  }, [])

  const clearPendingMessage = useCallback(() => {
    setPendingMessage(null)
  }, [])

  const resolvePendingAnswer = useCallback(() => {
    const cb = pendingAnsweredRef.current
    pendingAnsweredRef.current = null
    cb?.()
  }, [])

  const dropPendingAnswer = useCallback(() => {
    pendingAnsweredRef.current = null
  }, [])

  const setIsPinned = useCallback((pinned: boolean) => {
    setIsPinnedState(pinned)
    try { localStorage.setItem(PIN_STORAGE_KEY, String(pinned)) } catch {}
    if (pinned) setIsOpen(true)
  }, [])

  const togglePin = useCallback(() => {
    setIsPinnedState((prev) => {
      const next = !prev
      try { localStorage.setItem(PIN_STORAGE_KEY, String(next)) } catch {}
      if (next) setIsOpen(true)
      return next
    })
  }, [])

  const setAutoOpenMessage = useCallback((msg: string | null) => {
    setAutoOpenMessageState(msg)
  }, [])

  const openMelding = useCallback(() => {
    setMeldingRequested(true)
    setIsOpen(true)
  }, [])

  const clearMeldingRequest = useCallback(() => {
    setMeldingRequested(false)
  }, [])

  return (
    <ChatContext.Provider value={{
      isOpen, open, close, toggle, openWithMessage,
      pendingMessage, clearPendingMessage,
      resolvePendingAnswer, dropPendingAnswer,
      isPinned, togglePin, setIsPinned,
      autoOpenMessage, setAutoOpenMessage,
      openMelding, meldingRequested, clearMeldingRequest,
    }}>
      {children}
    </ChatContext.Provider>
  )
}
