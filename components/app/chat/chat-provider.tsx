'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

type ChatContextType = {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
  openWithMessage: (message: string) => void
  pendingMessage: string | null
  clearPendingMessage: () => void
  isPinned: boolean
  togglePin: () => void
  setIsPinned: (pinned: boolean) => void
}

const ChatContext = createContext<ChatContextType | null>(null)

const PIN_STORAGE_KEY = 'trifinity-chat-pinned'

export function useChatContext() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChatContext must be used within ChatProvider')
  return ctx
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [isPinned, setIsPinnedState] = useState(false)

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
    // Unpin when closing
    setIsPinnedState(false)
    try { localStorage.setItem(PIN_STORAGE_KEY, 'false') } catch {}
  }, [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])

  const openWithMessage = useCallback((message: string) => {
    setPendingMessage(message)
    setIsOpen(true)
  }, [])

  const clearPendingMessage = useCallback(() => {
    setPendingMessage(null)
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

  return (
    <ChatContext.Provider value={{
      isOpen, open, close, toggle, openWithMessage,
      pendingMessage, clearPendingMessage,
      isPinned, togglePin, setIsPinned,
    }}>
      {children}
    </ChatContext.Provider>
  )
}
