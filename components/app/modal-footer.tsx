'use client'

/**
 * ModalFooter — gedeelde primary/secondary action-bar voor modal- en
 * pane-footers (Track B2: één bron tegen footer-knop-fragmentatie).
 *
 * ── Waarom ───────────────────────────────────────────────────────────────
 * 120+ modals delen `BottomSheet` (z-[70], safe-area), maar elke modal
 * herimplementeert de knoppenrij in de `footerSlot`. Dit component
 * encapsuleert het canonieke patroon dat de design-system zelf als één
 * visuele taal declareert (zie de identieke knop-markup in
 * `slide-in-pane.tsx`, `shell-overlay.tsx` en `page-action-bar.tsx`:
 * "zodat alle drie de varianten dezelfde visuele taal spreken").
 *
 * ── Het canonieke patroon (verbatim overgenomen, niet opnieuw bedacht) ────
 * - **Primary**: solid `bg-[var(--ink)]` met `text-[var(--paper)]`,
 *   `min-h-11` (44px touch-target), Inter-font, loading → label + " …".
 * - **Secondary**: outline `border-2 border-[var(--ink)]` op
 *   `bg-[var(--paper)]`, zelfde maatvoering.
 * - Geen module-/accentkleur: bewust ink/paper (module-neutraal), gelijk
 *   aan de bestaande pane-/page-action-bar.
 *
 * ── Twee layouts (één props-API) ──────────────────────────────────────────
 * - `layout="inline"` (default): knoppen naast elkaar. Volgorde primary
 *   EERST (links), secondary erna — identiek aan de desktop pane-footer
 *   en `PageActionBar`-desktopstrip. Default-uitlijning `justify-start`
 *   (links) volgt diezelfde conventie (overlap-vermijding met de zwevende
 *   chat-FAB rechtsonderin). Geef `align="end"` voor klassieke
 *   rechts-uitlijning binnen een centered modal.
 * - `layout="stacked"`: beide knoppen `flex-1` full-width naast elkaar —
 *   het mobiele BottomSheet-footerSlot-patroon uit `shell-overlay.tsx`.
 *   Op smalle viewports vullen de twee knoppen samen de volle breedte.
 *
 * De class-strings zijn byte-identiek aan de bestaande hand-gerolde
 * footers, zodat adoptie gedrag- en pixel-behoudend is.
 */

type ModalFooterAction = {
  label: string
  onClick: () => void
  /** Disabled → opacity 50, geen cursor-pointer. */
  disabled?: boolean
}

type ModalFooterPrimaryAction = ModalFooterAction & {
  /** Loading (alleen primary): vervang label door "<label> …" en blokkeer click. */
  loading?: boolean
  /** Optioneel knop-type (default 'button'). Zet op 'submit' voor form-modals. */
  type?: 'button' | 'submit'
}

export type ModalFooterProps = {
  /** Primaire CTA — solid ink-bg. */
  primary: ModalFooterPrimaryAction
  /** Optionele secundaire CTA — outline. */
  secondary?: ModalFooterAction
  /**
   * - `inline` (default): knoppen naast elkaar.
   * - `stacked`: beide `flex-1` full-width (mobiel BottomSheet-footerSlot).
   */
  layout?: 'inline' | 'stacked'
  /**
   * Horizontale uitlijning voor `layout="inline"`. Default `start` (links,
   * gelijk aan pane-/page-action-bar). `end` voor rechts-uitlijning in een
   * centered modal. Genegeerd bij `layout="stacked"` (knoppen zijn dan
   * full-width). */
  align?: 'start' | 'end'
}

// Inter voor UI-chrome, identiek aan slide-in-pane / page-action-bar.
const FONT_STYLE = { fontFamily: 'var(--font-inter, system-ui, sans-serif)' } as const

export function ModalFooter({
  primary,
  secondary,
  layout = 'inline',
  align = 'start',
}: ModalFooterProps) {
  const stacked = layout === 'stacked'

  // Class-strings verbatim uit de canonieke footers. `flex-1` wordt alleen
  // in stacked-modus toegevoegd, op exact de positie die shell-overlay.tsx
  // gebruikt (`inline-flex flex-1 min-h-11 …`).
  const primaryClass = stacked
    ? 'inline-flex flex-1 min-h-11 items-center justify-center bg-[var(--ink)] px-4 text-sm font-medium leading-none text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-50'
    : 'inline-flex min-h-11 items-center justify-center bg-[var(--ink)] px-4 text-sm font-medium leading-none text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-50'

  const secondaryClass = stacked
    ? 'inline-flex flex-1 min-h-11 items-center justify-center border-2 border-[var(--ink)] bg-[var(--paper)] px-4 text-sm font-medium leading-none text-[var(--ink)] transition-colors hover:bg-[var(--subtle)] disabled:cursor-not-allowed disabled:opacity-50'
    : 'inline-flex min-h-11 items-center justify-center border-2 border-[var(--ink)] bg-[var(--paper)] px-4 text-sm font-medium leading-none text-[var(--ink)] transition-colors hover:bg-[var(--subtle)] disabled:cursor-not-allowed disabled:opacity-50'

  const rowClass = stacked
    ? 'flex items-center gap-2'
    : `flex items-center gap-3 ${align === 'end' ? 'justify-end' : 'justify-start'}`

  return (
    <div className={rowClass}>
      <button
        type={primary.type ?? 'button'}
        onClick={primary.onClick}
        disabled={primary.disabled || primary.loading}
        className={primaryClass}
        style={FONT_STYLE}
      >
        {primary.loading ? `${primary.label} …` : primary.label}
      </button>
      {secondary && (
        <button
          type="button"
          onClick={secondary.onClick}
          disabled={secondary.disabled}
          className={secondaryClass}
          style={FONT_STYLE}
        >
          {secondary.label}
        </button>
      )}
    </div>
  )
}
