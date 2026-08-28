'use client'

/**
 * TapTarget — de gedeelde raakgebied-primitive (bevinding M19).
 *
 * ── Waarom ───────────────────────────────────────────────────────────────
 * Het UX-testpanel mat op mobiel zeven icoonknoppen ónder de raakdrempel, in
 * vier verschillende ad-hoc maten: 20×20 (swatches, gids-vinkjes), 24×24,
 * 32×32 (een lokale `IconButton` in spend-limits) en 36×36 (TopBar-cluster).
 * Er bestond wél een `.touch-target`-utility in `app/globals.css`, maar geen
 * component die 'm afdwingt — met als resultaat dat elke bouwer de maat
 * opnieuw zelf inschatte. Dit bestand is de enige bron; `scripts/check-tap-
 * targets.mjs` bewaakt dat er geen nieuwe ad-hoc maat bijkomt.
 *
 * ── De norm ──────────────────────────────────────────────────────────────
 * TriFinity houdt 44×44 CSS-px aan (Apple HIG / WCAG 2.5.5 AAA), met minimaal
 * 8px ertussen — zie `.claude/skills/ui-ux/quality-checklist.md`. Twee bewust
 * vastgelegde uitzonderingen staan daar ook: de 28×28 pagina-header-controls
 * en de 36-brede mobiele TopBar-utility-cluster.
 *
 * ── Drie hit-modi ────────────────────────────────────────────────────────
 * De aanbeveling uit het testrapport was: "houd het icoon klein maar vergroot
 * de hit-area". Dat kan op twee manieren, en welke je kiest hangt af van of
 * er layout-ruimte ís:
 *
 *  - `reserve` (default) — het element zélf wordt ≥44×44 (`.touch-target`).
 *    Kies dit waar ruimte is; het is de enige modus die óók de tussenruimte
 *    tussen buren garandeert. Kost layout-breedte.
 *
 *  - `extend` — het zichtbare vlak blijft exact zoals het is; het raakgebied
 *    groeit naar ≥44×44 via een transparante `::after` die buiten de doos
 *    steekt. Kost GEEN layout-ruimte, maar de vergrote gebieden van buren
 *    kunnen elkaar overlappen: zet de tussenruimte zó dat de steek (breedte +
 *    gap) ≥44px is, anders verplaats je het probleem alleen maar.
 *
 *  - `extend-block` — idem, maar alléén verticaal. Voor dichte horizontale
 *    balken waar 44px bréédte per knop niet past (de mobiele TopBar heeft
 *    zeven controls op een 360px-scherm). Het raakgebied wordt dan
 *    `eigen breedte × 44px`; horizontaal blijft de WCAG-2.5.8-ondergrens van
 *    24px met vrije ruimte de vangrail.
 *
 * Beide extend-modi gebruiken `h-full`/`w-full` + een `min-*`-vloer, zodat het
 * raakgebied nooit KLEINER wordt dan het zichtbare element zelf.
 *
 * ── Gebruik ──────────────────────────────────────────────────────────────
 * ```tsx
 * <TapTarget label="Bewerken" onClick={onEdit} hit="extend" className="h-8 w-8 rounded-full border">
 *   <Pencil className="h-4 w-4" />
 * </TapTarget>
 * ```
 * Zit de knop al vast in bestaande markup (of is het een `<Link>`/`<span>`),
 * gebruik dan de class-constanten: `tapTargetClass('extend')`.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type TapTargetHit = 'reserve' | 'extend' | 'extend-block'

/**
 * Reserveert een echt ≥44×44 vak in de layout. Gelijk aan de bestaande
 * `.touch-target`-utility in `app/globals.css` (min-w/min-h 44px + centreren).
 */
export const TAP_TARGET_RESERVE = 'touch-target'

/** Rekt het raakgebied op tot ≥44×44 zonder de layout te raken. */
export const TAP_TARGET_EXTEND =
  "relative after:absolute after:left-1/2 after:top-1/2 after:h-full after:w-full after:min-h-[44px] after:min-w-[44px] after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']"

/** Rekt het raakgebied alléén verticaal op tot ≥44px hoog. */
export const TAP_TARGET_EXTEND_BLOCK =
  "relative after:absolute after:left-1/2 after:top-1/2 after:h-full after:w-full after:min-h-[44px] after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']"

/** De class-string voor een hit-modus — voor markup die geen `<TapTarget>` kan zijn. */
export function tapTargetClass(hit: TapTargetHit = 'reserve'): string {
  if (hit === 'extend') return TAP_TARGET_EXTEND
  if (hit === 'extend-block') return TAP_TARGET_EXTEND_BLOCK
  return TAP_TARGET_RESERVE
}

export type TapTargetProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  /** Toegankelijke naam. Verplicht: een icoonknop heeft geen zichtbare tekst. */
  label: string
  /** Welke hit-modus — zie de kop van dit bestand. Default `reserve`. */
  hit?: TapTargetHit
  /** Zet `title` gelijk aan `label` (tooltip op desktop). Default true. */
  showTitle?: boolean
  children: ReactNode
}

export function TapTarget({
  label,
  hit = 'reserve',
  showTitle = true,
  className = '',
  type = 'button',
  children,
  ...rest
}: TapTargetProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={showTitle ? label : undefined}
      className={`inline-flex items-center justify-center ${tapTargetClass(hit)} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  )
}
