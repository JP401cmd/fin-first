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
 * ── Het canonieke patroon (nu via de `Button`-primitive — ADR 0038) ───────
 * - **Primary**: `<Button variant="primary">` — solid `bg-[var(--ink)]` met
 *   `text-[var(--paper)]`, `min-h-11` (44px touch-target), Inter-font,
 *   loading → label + " …".
 * - **Secondary**: `<Button variant="secondary">` — outline
 *   `border-2 border-[var(--ink)]` op `bg-[var(--paper)]`, zelfde maatvoering.
 * - Geen module-/accentkleur: bewust ink/paper (module-neutraal), gelijk
 *   aan de bestaande pane-/page-action-bar.
 *
 * ── Eén uitzondering: de onomkeerbare knop is rood ────────────────────────
 * `tone="destructive"` kleurt de primary semantisch rood
 * (`<Button variant="destructive">`); de secondary blijft outline, want
 * annuleren is nooit het gevaar. Dit is geen versiering: zonder deze tone ziet
 * "Verwijder 43 transacties" er identiek uit als "Opslaan", en dan draagt de
 * gevaarlijkste knop van de app de vriendelijkste stijl.
 *
 * De tone komt ook **overgeërfd** binnen: `<ShellOverlay destructive>` zet
 * `ModalFooterToneProvider` om zijn sheet heen, zodat elke footer in een
 * onomkeerbare bevestiging automatisch klopt — de consument hoeft het niet per
 * modal opnieuw af te wegen (en de `destructive`-prop van ShellOverlay is
 * daarmee geen dood attribuut meer). Een expliciete `tone`-prop wint altijd van
 * de context.
 *
 * Sinds ADR 0038 delegeert dit component de knop-markup aan `Button`; de
 * layout-logica (inline/stacked, uitlijning, `flex-1`, loading, volgorde)
 * blijft hier. Verschil met de oude hand-gerolde footer: `px-4 → px-5`
 * (canoniek recept), plus `active:scale-[0.98]` press-feedback en een
 * `focus-visible` outline — beide bewuste uniformeringen naar de primitive.
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

import { createContext, useContext, type ReactNode } from 'react'
import { Button } from '@/components/editorial/button'

/** `default` = ink-primary · `destructive` = rode primary (onomkeerbare actie). */
export type ModalFooterTone = 'default' | 'destructive'

const ModalFooterToneContext = createContext<ModalFooterTone>('default')

/**
 * Zet de tone voor élke `ModalFooter` in de subtree. Gebruikt door
 * `ShellOverlay` (`kind="confirm"`/`kind="sheet"` met `destructive`), zodat de
 * bevestigende knop rood is zonder dat elke bevestiging het zelf regelt.
 * Context loopt gewoon door een `createPortal` heen — de BottomSheet-portal
 * verandert alleen de DOM-positie, niet de React-boom.
 */
export function ModalFooterToneProvider({
  tone,
  children,
}: {
  tone: ModalFooterTone
  children: ReactNode
}) {
  return <ModalFooterToneContext.Provider value={tone}>{children}</ModalFooterToneContext.Provider>
}

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
  /**
   * `destructive` kleurt de primary rood (`bg-negative` + wit) — voor de
   * bevestigende knop van een onomkeerbare actie. Weggelaten = erf de tone van
   * een omliggende `ModalFooterToneProvider` (die `ShellOverlay destructive`
   * zet), anders `default`.
   */
  tone?: ModalFooterTone
}

export function ModalFooter({
  primary,
  secondary,
  layout = 'inline',
  align = 'start',
  tone,
}: ModalFooterProps) {
  const stacked = layout === 'stacked'
  const inheritedTone = useContext(ModalFooterToneContext)
  const effectiveTone = tone ?? inheritedTone

  // In stacked-modus vullen beide knoppen samen de volle breedte (`flex-1`);
  // de rest van de look (ink/outline, min-h-11, Inter, hover, disabled) komt
  // uit de `Button`-primitive.
  const growClass = stacked ? 'flex-1' : ''

  const rowClass = stacked
    ? 'flex items-center gap-2'
    : `flex items-center gap-3 ${align === 'end' ? 'justify-end' : 'justify-start'}`

  return (
    <div className={rowClass}>
      <Button
        variant={effectiveTone === 'destructive' ? 'destructive' : 'primary'}
        type={primary.type ?? 'button'}
        onClick={primary.onClick}
        disabled={primary.disabled || primary.loading}
        className={growClass}
      >
        {primary.loading ? `${primary.label} …` : primary.label}
      </Button>
      {secondary && (
        <Button
          variant="secondary"
          type="button"
          onClick={secondary.onClick}
          disabled={secondary.disabled}
          className={growClass}
        >
          {secondary.label}
        </Button>
      )}
    </div>
  )
}
