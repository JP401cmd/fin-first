'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useChatContext } from './chat-provider'

/**
 * ChatPromptDeeplink — luistert op `?prompt=…` op iedere route en opent
 * de Will-chat met een vooraf-bepaalde kick-off-vraag voor het MAKEN
 * van een nieuw voorstel. De chat is geen museum voor bestaande
 * recommendations — die zijn zichtbaar op /overzicht/tips.
 *
 * Ondersteunde prompt-keys:
 *   - `analyseer-mijn-financien`  — algemeen "doorlicht me"-startpunt
 *   - `herbekijk-uitgesteld`      — kick-off voor postponed-ready
 *                                   recommendations (FAB-badge route)
 *
 * Na trigger wordt de query-string opgeschoond zodat refresh / back niet
 * dezelfde prompt opnieuw afvuurt.
 */

/**
 * Kick-off-prompt voor "doorlicht mijn financiën". Eén bron van waarheid zodat
 * zowel deze deeplink als de in-pagina "Vraag Will"-knoppen (tips-lijst /
 * tips-teaser) exact dezelfde tekst gebruiken.
 */
export const ANALYSE_FINANCIEN_PROMPT =
  'Doorlicht mijn financiën voor optimalisaties. Begin met de belangrijkste tip die je nu ziet en stel die voor.'

const PROMPTS: Record<string, (params: URLSearchParams) => string> = {
  'analyseer-mijn-financien': () => ANALYSE_FINANCIEN_PROMPT,
  'herbekijk-uitgesteld': () =>
    'Ik wil opnieuw kijken naar tips die ik eerder heb uitgesteld en waarvan de wachttijd voorbij is. Begin met de belangrijkste.',
}

export function ChatPromptDeeplink() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { openWithMessage } = useChatContext()
  const firedRef = useRef<string | null>(null)

  useEffect(() => {
    const promptKey = searchParams.get('prompt')
    if (!promptKey) return

    // Dedupe — voorkom dat snelle re-renders dezelfde prompt 2× sturen.
    const signature = `${pathname}?${searchParams.toString()}`
    if (firedRef.current === signature) return
    firedRef.current = signature

    const builder = PROMPTS[promptKey]
    if (!builder) return

    const message = builder(searchParams)
    openWithMessage(message)

    // Schoon de query-string zonder de pagina te herladen.
    const cleaned = new URLSearchParams(searchParams)
    cleaned.delete('prompt')
    const qs = cleaned.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [searchParams, pathname, openWithMessage, router])

  return null
}
