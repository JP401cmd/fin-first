import type { ReactNode } from 'react'
import { EditorialDeck } from './index'

/**
 * PageOpening — de canonieke editorial pagina-aanhef (standaard-aanhef) van
 * TriFinity-app-pagina's. Zie de ui-ux-skill: `pattern-cards.md` → kaart
 * "Editorial pagina-opening (standaard-aanhef)".
 *
 * Opbouw (in deze volgorde, container `<header className="relative space-y-3">`):
 *   1. Hairline-kicker-rij (mono 10px, module-accent, streep ervoor).
 *   2. Narratieve Playfair-kop (semantisch `<h2>`) met precies één italic
 *      `<em>`-accent in `--module-active-700` — bewust de líchtere maatvoering
 *      (28/36/44px), niet `EditorialHeadline` (font-black/leading-0.95).
 *      Semantisch `<h2>` omdat de shell-chrome de enige `<h1>` draagt; zie het
 *      koppencontract in `.claude/skills/ui-ux/quality-checklist.md`.
 *   3. Optionele redactionele deck (`<EditorialDeck>`).
 *   4. Optioneel `children`-slot ONDER de deck voor het hairline-cijferblok of
 *      extra rijen — de consumer vult dat blok zelf (kaart-spec:
 *      `border-t border-[var(--border-ed)] pt-4`). Voor de veelvoorkomende vorm
 *      sub-kicker + hoofdcijfer + sub-meta is er `<PageOpeningFigure>`.
 *
 * Pure presentatie, geen state/side-effects. Module-identiteit uitsluitend via
 * `--module-active-*`-tokens (per module instelbaar) — nooit vaste kleuren.
 * Server-component-vriendelijk: geen hooks; een server-page mag 'm renderen.
 */
export function PageOpening({
  kicker,
  titleBefore,
  emphasis,
  titleAfter,
  deck,
  children,
  className = '',
}: {
  /** Kicker-inhoud (tekst of nodes, bv. periode + perspectief-label). */
  kicker: ReactNode
  /** Kop-tekst vóór het accent-woord (incl. eventuele spatie). */
  titleBefore: string
  /** Het italic-em-woord in module-accentkleur (precies één accent). */
  emphasis: string
  /** Kop-tekst ná het accent-woord (incl. eventuele spatie). */
  titleAfter: string
  /** Optionele redactionele intro onder de kop. */
  deck?: ReactNode
  /** Optioneel blok ONDER de deck (hairline-cijferblok / extra rijen). */
  children?: ReactNode
  className?: string
}) {
  return (
    <header className={`relative space-y-3 ${className}`}>
      {/* Kicker met hairline — module-accent via --module-active-* */}
      <div className="flex flex-wrap items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--module-active-700)]">
        <span
          aria-hidden
          className="inline-block h-px w-7 shrink-0"
          style={{ background: 'var(--module-active-500)' }}
        />
        {kicker}
      </div>

      {/* Narratieve Playfair-headline — líchtere maatvoering (28/36/44px).
          Semantisch een <h2>, geen <h1>: binnen de app-shell is de route-titel
          in de shell-chrome de enige <h1> (koppencontract, bevinding M28). De
          visuele maatvoering verandert daar niet door. */}
      <h2
        className="font-bold leading-tight tracking-[-0.02em] text-[28px] sm:text-[36px] md:text-[44px]"
        style={{ fontFamily: 'var(--font-playfair, serif)' }}
      >
        {titleBefore}
        <em
          className="font-normal italic"
          style={{ color: 'var(--module-active-700)' }}
        >
          {emphasis}
        </em>
        {titleAfter}
      </h2>

      {deck && <EditorialDeck>{deck}</EditorialDeck>}

      {children}
    </header>
  )
}

/**
 * PageOpeningFigure — sub-composiet voor de veelvoorkomende cijferblok-vorm
 * binnen het `children`-slot van `<PageOpening>`: sub-kicker (mono, module-
 * accent) + hoofdcijfer + optionele eenheid + italic Source Serif sub-meta
 * (doorgaans het vrijheidstijd-equivalent).
 *
 * Het `amount`-slot verwacht een al-gestyled node (bv. een `<MaskedAmount>` met
 * z'n eigen size/kleur), zodat consumers vrij blijven in maatvoering en tint —
 * de kaart-spec noemt `text-[32px] sm:text-[40px] font-bold text-[var(--ink)]`
 * als canonieke maat, maar sommige blokken (budget-plan/werkelijk) wijken
 * bewust af en vullen dan het `children`-slot rechtstreeks.
 */
export function PageOpeningFigure({
  kicker,
  amount,
  unit,
  sub,
  className = '',
}: {
  /** Sub-kicker boven het hoofdcijfer (mono, UPPERCASE, module-accent). */
  kicker: ReactNode
  /** Al-gestyled hoofdcijfer-node (bv. `<MaskedAmount>` met size/kleur). */
  amount: ReactNode
  /** Optionele eenheid rechts van het cijfer (bv. "/mnd"). */
  unit?: ReactNode
  /** Optionele italic Source Serif sub-meta (vrijheidstijd-equivalent). */
  sub?: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--module-active-700)]">
        {kicker}
      </p>
      <p className="mt-1.5 flex items-baseline gap-1.5">
        {amount}
        {unit && <span className="text-sm text-[var(--ink-3)]">{unit}</span>}
      </p>
      {sub && (
        <p
          className="mt-2 text-[12px] italic text-[var(--ink-3)] sm:text-[13px]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          {sub}
        </p>
      )}
    </div>
  )
}
