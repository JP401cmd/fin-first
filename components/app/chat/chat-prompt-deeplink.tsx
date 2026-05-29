'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useChatContext } from './chat-provider'

/**
 * ChatPromptDeeplink — luistert op `?prompt=…` op iedere route en opent
 * de Will-chat met een vooraf-bepaalde kick-off-vraag.
 *
 * Ondersteunde prompt-keys:
 *   - `analyseer-mijn-financien`  — algemeen "doorlicht me"-startpunt
 *   - `toon-voorstel`             — combineer met `rec=<id>`; toont een
 *                                   specifieke recommendation in de chat
 *
 * Na trigger wordt de query-string opgeschoond zodat refresh / back niet
 * dezelfde prompt opnieuw afvuurt.
 */

const PROMPTS: Record<string, (params: URLSearchParams) => string> = {
  'analyseer-mijn-financien': () =>
    'Doorlicht mijn financiën voor optimalisaties. Begin met het belangrijkste voorstel dat je nu ziet en stel het voor.',
  'toon-voorstel': (params) => {
    const rec = params.get('rec')
    if (!rec) return 'Stel je beste voorstel voor op basis van mijn huidige situatie.'
    return `Toon mij het voorstel met id ${rec} uit mijn pending recommendations en leg uit waarom het relevant is.`
  },
  'herbekijk-uitgesteld': () =>
    'Ik wil opnieuw kijken naar voorstellen die ik eerder heb uitgesteld en waarvan de wachttijd voorbij is. Begin met het belangrijkste.',
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
    cleaned.delete('rec')
    const qs = cleaned.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [searchParams, pathname, openWithMessage, router])

  return null
}
