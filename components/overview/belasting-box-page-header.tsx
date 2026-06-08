import { PageInfoButton } from '@/components/editorial/page-info-button'
import { Kicker, EditorialHeadline, EditorialDeck } from '@/components/editorial'
import { PAGE_INFO } from '@/lib/page-info-content'

/**
 * Gedeelde editorial-header voor de box-subpagina's onder
 * /overzicht/belasting. Gebouwd op de canonieke editorial-primitives:
 *  - `Kicker` ("Box N") met module-streep,
 *  - `EditorialHeadline` met italic-em op één woord,
 *  - `EditorialDeck` met linker module-border.
 *
 * De accentkleur volgt automatisch de actieve box via `--module-active-*`
 * (gezet door `box{1,2,3}/layout.tsx`): amber / violet / teal.
 *
 * Géén in-content terug-link meer — de shell levert de back-navigatie
 * (mobile TopBar / desktop pane-header / browser-back).
 */
export function BelastingBoxPageHeader({
  number,
  title,
  subtitle,
  infoKey,
  emphasis,
}: {
  /** '1' | '2' | '3'. */
  number: string
  title: string
  subtitle: string
  /** Sleutel in PAGE_INFO, bv. '/overzicht/belasting/box1'. */
  infoKey: string
  /** Woord in `title` dat italic-em krijgt. Default: laatste woord. */
  emphasis?: string
}) {
  const lastWord = title.includes(' ') ? title.split(' ').pop() : undefined
  const emphasisWord = emphasis ?? lastWord

  return (
    <section className="relative mx-auto max-w-6xl px-4 pt-6 pb-3 sm:px-6 sm:pt-8">
      <PageInfoButton
        description={PAGE_INFO[infoKey] ?? ''}
        className="absolute right-4 top-6 sm:right-6 sm:top-8"
      />
      <Kicker className="pr-10">Box {number}</Kicker>
      <EditorialHeadline
        level="h1"
        size="lg"
        emphasis={emphasisWord}
        className="mt-3 text-[var(--ink)]"
      >
        {title}
      </EditorialHeadline>
      <div className="mt-3 max-w-2xl">
        <EditorialDeck>{subtitle}</EditorialDeck>
      </div>
    </section>
  )
}
