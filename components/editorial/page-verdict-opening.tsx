import type { ReactNode } from 'react'
import { EditorialDeck } from './index'
import { leverageStatusTextClass, type LeverageStatus } from '@/lib/leverage-status'

/**
 * PageVerdictOpening — pagina-aanhef die het OORDEEL uitspreekt in plaats van een
 * narratieve vraag. Staat bewust náást `PageOpening` (de bestaande standaard-
 * aanhef met kicker + één italic accentwoord); zie de kaart "Editorial
 * pagina-opening" in `.claude/skills/ui-ux/pattern-cards.md`.
 *
 * ── DE TITEL BESTAAT UIT TWEE DELEN ──────────────────────────────────────────
 * Paginanaam + oordeel. Wie de naam toont, verschilt per breakpoint:
 *   - mobiel (<lg): de TopBar van de shell draagt de naam al (mét terugknop), dus
 *     de titel toont alléén het oordeel — anders staat het woord twee keer op een
 *     scherm van 390px.
 *   - desktop (≥lg): er ís geen TopBar (`lg:hidden`), dus de titel draagt de naam
 *     zelf en is op zichzelf leesbaar.
 *
 * Dat verschil is CSS-only (`hidden lg:inline`) en NOOIT een JS-branch: de shell
 * eist identieke, breakpoint-onafhankelijke HTML uit server- en client-render
 * (zie de kop van `components/app/shell/mobile-stack-shell.tsx`). De verborgen
 * span valt op mobiel ook uit de a11y-boom — geen dubbele naam voor een
 * schermlezer, want de sr-only `<h1>` van de shell draagt 'm daar al (ADR 0110).
 *
 * ── KLEUR: IDENTITEIT VS. SEMANTIEK ──────────────────────────────────────────
 * Het oordeelswoord draagt de STOPLICHT-kleur (`leverageStatusTextClass`), niet
 * het module-accent: status is semantiek en volgt de instelbare accentkeuze
 * nooit (zie de kleurconventie in CLAUDE.md). De paginanaam blijft neutrale inkt.
 * Zelfde scheiding als `OordeelDeck` in `components/overview/vaste-lasten-client.tsx`.
 *
 * ── ZONDER OORDEEL ───────────────────────────────────────────────────────────
 * Is er geen oordeel (leeg account, geen score), dan is de titel de kale
 * paginanaam — op BEIDE breakpoints zichtbaar, anders zou de titel op mobiel leeg
 * zijn. Dat is een data-branch, geen breakpoint-branch.
 *
 * Pure presentatie: geen state, geen fetch, geen eigen som. Server-component-
 * vriendelijk.
 */
export function PageVerdictOpening({
  pageName,
  verdict,
  verdictSlot,
  tone = 'neutral',
  deck,
  children,
  className = '',
  gutterClassName = '',
}: {
  /** Canonieke routenaam — uit `resolveRouteTitle()`, dezelfde bron als shell en TopBar. */
  pageName: string
  /** Het oordeel of kerncijfer. `null` ⇒ de titel is alleen `pageName`. */
  verdict: string | null
  /**
   * STROMEND oordeel — voor pagina's waar de kop bewust zonder data rendert
   * (LCP), zoals /overzicht/budget/vaste-lasten en /forecast: die mogen hun
   * loaders niet eens importeren. Geef hier een `<Suspense>` mee die het oordeel
   * nalevert.
   *
   * Wint van `verdict` als beide meekomen. De paginanaam blijft dan op BEIDE
   * breakpoints staan: hij is het enige dat bij de eerste paint bekend is, en
   * een titel die uit het niets verschijnt is erger dan een naam die blijft
   * staan. De titel groeit dus van "Vaste lasten" naar "Vaste lasten | 43% van
   * je inkomen" in plaats van te verspringen.
   */
  verdictSlot?: ReactNode
  /** Stoplichtstand van het oordeel. Bepaalt uitsluitend de kleur. */
  tone?: LeverageStatus
  /** Optionele redactionele intro onder de kop. */
  deck?: ReactNode
  /** Optioneel blok ONDER de deck. */
  children?: ReactNode
  className?: string
  /** Rechter-gutter voor de zone waar het absolute i-cluster zweeft. */
  gutterClassName?: string
}) {
  const headingClass = `font-bold leading-tight tracking-[-0.02em] text-[28px] sm:text-[36px] md:text-[44px] ${gutterClassName}`
  const headingStyle = { fontFamily: 'var(--font-playfair, serif)' }

  return (
    <header className={`relative space-y-3 ${className}`}>
      {verdictSlot ? (
        <h2 className={headingClass} style={headingStyle}>
          {pageName}
          {verdictSlot}
        </h2>
      ) : verdict === null ? (
        <h2 className={headingClass} style={headingStyle}>
          {pageName}
        </h2>
      ) : (
        <h2 className={headingClass} style={headingStyle}>
          {/* Alleen op desktop: daar is er geen TopBar die de naam draagt. */}
          <span className="hidden lg:inline">
            {pageName}
            <span aria-hidden="true" className="mx-2 font-normal text-[var(--ink-4)]">
              |
            </span>
          </span>
          <span className={leverageStatusTextClass(tone)}>{verdict}</span>
        </h2>
      )}

      {deck && <EditorialDeck>{deck}</EditorialDeck>}

      {children}
    </header>
  )
}

/**
 * Het tweede deel van een stromende titel: de scheider plus het oordeel, bedoeld
 * om ín `verdictSlot` te renderen zodra de data binnen is.
 *
 * Staat hier en niet in de pagina's, zodat scheider, marge en statuskleur op
 * élke stromende kop gelijk zijn aan de directe variant hierboven.
 */
export function PageVerdictSuffix({
  verdict,
  tone = 'neutral',
}: {
  verdict: string
  tone?: LeverageStatus
}) {
  return (
    <>
      <span aria-hidden="true" className="mx-2 font-normal text-[var(--ink-4)]">
        |
      </span>
      <span className={leverageStatusTextClass(tone)}>{verdict}</span>
    </>
  )
}
