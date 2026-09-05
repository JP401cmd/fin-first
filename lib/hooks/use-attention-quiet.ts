'use client'

/**
 * useAttentionQuiet — "moet ik nu mijn mond houden?" (UR3-10, ADR 0134)
 *
 * Dit is de unie die tot nu toe lokaal in `FinHome` stond, gedeeld gemaakt.
 * Precies dezelfde vier termen, plus het benoemde aandachtsregister:
 *
 *  1. `use-scroll-lock` — alles wat de body vergrendelt (sheets, palette,
 *     share-dialog, sleepmodus).
 *  2. `overlay-signal` — alles wat zich als pill-verbergende overlay meldt.
 *     Die twee vallen meestal samen (BottomSheet doet allebei) maar niet
 *     altijd: de tips-laag op /toekomst claimt bewust géén scroll-lock. M15.
 *  3. De chat: staat die open, dan is elke proactieve laag overbodig.
 *  4. Immersieve routes (taakflows) — daar hoort niets doorheen te praten.
 *  5. Het aandachtsregister (`lib/attention-signal.ts`): rondleiding en Fins
 *     melding. `self` laat een laag die zélf claimt zichzelf overslaan; een
 *     laag die alleen leest (de euro-coachmark) laat `self` weg en staat
 *     daarmee onderaan de rangorde.
 *
 * WAAROM ÉÉN HOOK EN NIET DRIE KOPIEËN. De coachmark, de meldkaart en de
 * rondleiding hadden elk hun eigen zichtbaarheidslogica; dáárom stonden ze in
 * de eerste minuut over elkaar heen. Eén hook betekent dat een volgende laag
 * niet zelf hoeft te bedenken waar hij op moet letten.
 *
 * `useChatContextOptional` (niet de throwende variant): de hook moet ook buiten
 * een ChatProvider bruikbaar zijn — in unit-tests en in shell-fragmenten die
 * los renderen.
 */

import { usePathname } from 'next/navigation'
import { useChatContextOptional } from '@/components/app/chat/chat-provider'
import { useOverlayOpen as useScrollLockOpen } from '@/lib/hooks/use-scroll-lock'
import { useOverlayOpen as useOverlaySignalOpen } from '@/lib/overlay-signal'
import { isImmersiveRoute } from '@/lib/shell/immersive-routes'
import { useAttentionClaimed, type AttentionClaimId } from '@/lib/attention-signal'

export type UseAttentionQuietOptions = {
  /**
   * De eigen naam in het aandachtsregister. Een laag die zichzelf claimt zou
   * zonder dit zichzelf pauzeren zodra ze verschijnt.
   */
  self?: AttentionClaimId
}

/**
 * `true` zolang een proactieve laag beter kan zwijgen. SSR-veilig: alle
 * onderliggende signalen leveren server-side `false`.
 */
export function useAttentionQuiet({ self }: UseAttentionQuietOptions = {}): boolean {
  const pathname = usePathname()
  const chat = useChatContextOptional()
  const scrollLockOpen = useScrollLockOpen()
  const overlaySignalOpen = useOverlaySignalOpen()
  const attentionClaimed = useAttentionClaimed(self)

  return (
    scrollLockOpen ||
    overlaySignalOpen ||
    Boolean(chat?.isOpen) ||
    isImmersiveRoute(pathname) ||
    attentionClaimed
  )
}
