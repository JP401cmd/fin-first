import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PageStatusDot } from '@/components/app/page-status-dot'
import { PageOpening } from '@/components/editorial'
import { getPageInfo } from '@/lib/page-info-content'

/**
 * Gedeelde editorial-header voor de box-subpagina's onder
 * /overzicht/belasting. Gebouwd op de canonieke `PageOpening`-primitive:
 * hairline-kicker ("Box N") → narratieve Playfair-H1 met één italic-em →
 * redactionele deck.
 *
 * De accentkleur volgt automatisch de actieve box via `--module-active-*`
 * (gezet door `box{1,2,3}/layout.tsx` — de per-box triade box1/2/3): amber /
 * violet / teal. `PageOpening` gebruikt uitsluitend die tokens, dus het
 * per-box kleursysteem stroomt ongewijzigd door.
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
  // Splits de titel rondom het accent-woord voor PageOpening's
  // titleBefore/emphasis/titleAfter. Zonder expliciete `emphasis` valt het
  // accent op het laatste woord (via lastIndexOf, zodat een herhaald woord de
  // juiste — laatste — treffer pakt); met expliciete `emphasis` op de eerste
  // treffer. Niet gevonden → hele titel vóór, geen accent.
  const lastWord = title.includes(' ') ? title.split(' ').pop()! : title
  const emphasisWord = emphasis ?? lastWord
  const pos = emphasis ? title.indexOf(emphasisWord) : title.lastIndexOf(emphasisWord)
  const titleBefore = pos >= 0 ? title.slice(0, pos) : title
  const emphasisText = pos >= 0 ? title.slice(pos, pos + emphasisWord.length) : ''
  const titleAfter = pos >= 0 ? title.slice(pos + emphasisWord.length) : ''

  return (
    <div className="relative mx-auto max-w-6xl px-4 pt-6 pb-3 sm:px-6 sm:pt-8">
      <PageStatusDot className="absolute right-[52px] top-6 sm:right-[60px] sm:top-8" />
      <PageInfoButton
        content={getPageInfo(infoKey)}
        className="absolute right-4 top-6 sm:right-6 sm:top-8"
      />
      <PageOpening
        className="pr-20 sm:pr-24"
        kicker={`Box ${number}`}
        titleBefore={titleBefore}
        emphasis={emphasisText}
        titleAfter={titleAfter}
        deck={subtitle}
      />
    </div>
  )
}
