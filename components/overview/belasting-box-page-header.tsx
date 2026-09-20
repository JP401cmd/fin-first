import type { ReactNode } from 'react'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PageStatusDot } from '@/components/app/page-status-dot'
import { PageVerdictOpening } from '@/components/editorial'
import { getPageInfo } from '@/lib/page-info-content'
import { resolveRouteTitle } from '@/lib/nav-config'
import type { LeverageStatus } from '@/lib/leverage-status'

/** De drie box-subroutes die deze header bedient. */
export type BelastingBoxRoute =
  | '/overzicht/belasting/box1'
  | '/overzicht/belasting/box2'
  | '/overzicht/belasting/box3'

/**
 * Gedeelde editorial-header voor de box-subpagina's onder
 * /overzicht/belasting — sinds de kop-herziening (sep 2026) gebouwd op
 * `PageVerdictOpening`: de aanhef spreekt het OORDEEL uit in plaats van een
 * narratieve vraag met een italic accentwoord.
 *
 * WAT ER VERANDERDE T.O.V. DE VORIGE SIGNATUUR
 *  · De `title`-string + `emphasis`-splitsing is weg. Die bouwde
 *    `titleBefore`/`emphasis`/`titleAfter` met een `indexOf`/`lastIndexOf` op
 *    een woord uit de titel; in het nieuwe patroon bestaat de titel uit twee
 *    vaste delen (paginanaam + oordeel) en is er niets te splitsen.
 *  · De hairline-kicker ("Box N") vervalt — onderdeel van het patroon.
 *  · De paginanaam komt niet meer als losse string binnen maar uit
 *    `resolveRouteTitle(route)`: dezelfde bron als de sr-only shell-`<h1>`, de
 *    mobiele TopBar en het kruimelpad. Daarom is `route` de enige sleutel die
 *    binnenkomt — ook `getPageInfo` leest 'm (de vroegere `infoKey` was op alle
 *    drie de call-sites al letterlijk gelijk aan de route).
 *  · `subtitle: string` heet nu `deck: ReactNode` en is KORT: twee zinnen,
 *    samen ~20 woorden — wat de pagina is, en wat het oordeel betekent.
 *
 * Eén component voor drie routes, bewust GEEN tweede variant ernaast: box1/2/3
 * moeten onder elkaar als één familie openen.
 *
 * KLEUR — het oordeelswoord draagt de stoplichtkleur (semantiek, via
 * `PageVerdictOpening`), niet het box-accent. Het per-box accent
 * (`--module-active-*`, gezet door box{1,2,3}/layout.tsx) blijft de rest van de
 * pagina kleuren; die scheiding is de kleurconventie uit CLAUDE.md.
 *
 * Géén in-content terug-link — de shell levert de back-navigatie.
 */
export function BelastingBoxPageHeader({
  route,
  verdict,
  tone = 'neutral',
  deck,
}: {
  /** De eigen route; voedt zowel de paginanaam als de `i`-inhoud. */
  route: BelastingBoxRoute
  /** Het oordeel achter de paginanaam. `null` ⇒ kale paginanaam. */
  verdict: string | null
  /** Stoplichtstand van het oordeel; bepaalt uitsluitend de kleur. */
  tone?: LeverageStatus
  /** Twee korte zinnen: wat de pagina is, en wat het oordeel betekent. */
  deck: ReactNode
}) {
  return (
    <div className="relative mx-auto max-w-6xl px-4 pt-6 pb-3 sm:px-6 sm:pt-8">
      <PageStatusDot className="absolute right-[52px] top-6 sm:right-[60px] sm:top-8" />
      <PageInfoButton
        content={getPageInfo(route)}
        className="absolute right-4 top-6 sm:right-6 sm:top-8"
      />
      <PageVerdictOpening
        gutterClassName="pr-20 sm:pr-24"
        pageName={resolveRouteTitle(route) ?? 'Belasting'}
        verdict={verdict}
        tone={tone}
        deck={deck}
      />
    </div>
  )
}
