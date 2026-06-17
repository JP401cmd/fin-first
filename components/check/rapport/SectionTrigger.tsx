import type React from 'react'

/**
 * Sectie-trigger — een onopvallende CTA-band die direct ná een rapportsectie
 * staat en de lezer vertelt wat 'ie met dít stuk kán dóén in de app. Visueel
 * "hangt" 'ie aan de sectie erboven (dunne bovenregel + "In de app"-eyebrow),
 * niet als luide banner. Eén bron van waarheid: zelfde component + styling op
 * elke sectie. Links naar `href` (de signup-bestemming — de lezer heeft nog
 * geen account).
 *
 * Pure presentatie; alle stijl in `.section-trigger` (rapport.css). De hover-
 * pijl-animatie is CSS-only en wordt door de globale `prefers-reduced-motion`-
 * regel in rapport.css al uitgezet — geen JS nodig.
 */
export function SectionTrigger({
  label,
  href,
}: {
  label: React.ReactNode
  href: string
}) {
  return (
    <a className="section-trigger" href={href}>
      <span className="section-trigger-eyebrow">
        <span className="section-trigger-arr" aria-hidden="true">
          →
        </span>
        In de app
      </span>
      <span className="section-trigger-label">{label}</span>
    </a>
  )
}
