// lib/page-status/freedom.ts
//
// De informatieve vrijheids-/pensioenbanner op /overzicht. Consume-only: leest
// `isFinanciallyFree` (ADR 0129 D8: anker bereikt ∧ dekking ≥ 100) en het
// plan-anker; rekent niets zelf.
//
// ADR 0129 F3b — onder een VAST stopmoment (aow/now/age) dat nog niet 'free' is,
// volgt de banner de Vrijheid-strip: kop "Je rekent met stoppen op {stop}" en de
// bereik-zin uit anker-copy (gedekt ⇒ neutraal, tekort ⇒ aandacht). Het bereik komt
// uit de plan-runway van hetzelfde request (`computeHorizonRunway`), aangeleverd
// door `computePageStatusInfo` — geen tweede kernel-run hier.

import {
  isAtOrPastAow,
  isFinanciallyFree,
  isFixedAnchor,
  resolveFreedomAnchor,
  type FreedomStateInput,
} from '@/lib/fire-strategy'
import type { AnkerReach, AnkerStop } from '@/lib/horizon/anker-copy'
import { FREEDOM_BANNER_COPY, anchoredBannerCopy } from '@/lib/page-status/copy'
import type { PageStatusInfo } from '@/lib/page-status/types'

/** Het bereik + stopmoment onder een vast anker (uit de plan-runway). */
export interface FreedomBannerAnker {
  reach: AnkerReach
  stop: AnkerStop
}

export function resolveFreedomBanner(
  input: FreedomStateInput,
  anker?: FreedomBannerAnker | null,
): PageStatusInfo | null {
  if (!isFinanciallyFree(input)) {
    // Vast anker, nog niet vrij: de banner volgt de strip (ADR 0129, bijlage /overzicht).
    const planAnchor = resolveFreedomAnchor(input)
    if (anker && isFixedAnchor({ anchor: planAnchor })) {
      const copy = anchoredBannerCopy(anker.reach, anker.stop)
      if (!copy) return null
      return {
        route: '/overzicht',
        kind: 'freedom',
        status: anker.reach.kind === 'gedekt' ? 'neutral' : 'warn',
        title: copy.title,
        reason: copy.reason,
        remedy: copy.remedy,
        will: copy.will,
      }
    }
    return null
  }

  const anchor = resolveFreedomAnchor(input)
  const copy =
    anchor.kind === 'now'
      ? FREEDOM_BANNER_COPY['nu-stoppen']
      : isAtOrPastAow(input)
        ? FREEDOM_BANNER_COPY.pensioen
        : FREEDOM_BANNER_COPY.free

  return {
    route: '/overzicht',
    kind: 'freedom',
    status: 'neutral',
    title: copy.title,
    reason: copy.reason,
    remedy: copy.remedy,
    will: copy.will,
  }
}
