'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useChatContext } from './chat-provider'

// ChatPanel trekt de zware `ai` + `@ai-sdk/react` bundels mee. Die hoeven niet
// in de First-Load JS van élke (app)-pagina te zitten: vrijwel niemand opent de
// chat per pageview. `next/dynamic` met `ssr: false` splitst de chunk af zodat
// die pas wordt gefetcht wanneer hieronder `mounted` true wordt — d.w.z. bij de
// éérste keer dat de chat opent.
const ChatPanel = dynamic(
  () => import('./chat-panel').then((m) => m.ChatPanel),
  { ssr: false },
)

/**
 * Lazy mount-wrapper voor ChatPanel.
 *
 * Gedragsbehoud is hier leidend. In de vorige opzet stond `<ChatPanel />`
 * altijd gemount in de layout; ChatPanel zelf rendert `null` zolang
 * `isOpen` false is (zie `if (!isOpen) return null`), maar bleef gemount en
 * behield daardoor zijn interne `useChat`-state, berichten-historie,
 * Wft-acceptatie e.d. over open/dicht-cycli heen.
 *
 * Deze wrapper bewaart exact die semantiek:
 *  - Vóór de eerste open: niets renderen → de chat-chunk wordt niet geladen.
 *  - Zodra de chat voor het eerst opent: ChatPanel mounten en daarna PERMANENT
 *    gemount houden (we resetten `mounted` nooit). Sluiten laat ChatPanel weer
 *    `null` renderen zoals voorheen, maar de component blijft gemount → state en
 *    historie blijven behouden, identiek aan het oude gedrag.
 *
 * De open/dicht-triggers zelf zijn ongewijzigd: die lopen nog steeds via de
 * gedeelde ChatProvider-context (open/close/toggle/pin/pendingMessage), die
 * ChatPanel ongewijzigd consumeert.
 */
export function ChatPanelLazy() {
  const { isOpen } = useChatContext()
  // Eénmalige latch: false tot de chat voor het eerst opent, daarna voorgoed
  // true. Een ref houdt de waarde stabiel los van re-render-timing; de state
  // forceert de re-render die ChatPanel monteert.
  const everOpenedRef = useRef(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (isOpen && !everOpenedRef.current) {
      everOpenedRef.current = true
      setMounted(true)
    }
  }, [isOpen])

  if (!mounted) return null

  return <ChatPanel />
}
