'use client'

/**
 * SANDBOX / Fase 0 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §5 (overlay-strategie)
 * Achter feature-flag in productie. Voor nu: alleen sandbox-test.
 *
 * Demonstreert de drie kinds van ShellOverlay (pane | sheet | confirm)
 * met simpele content. Bedoeld om visueel te valideren dat:
 *  - Pane van rechts inglijdt op desktop (lg:) zonder dim-overlay.
 *  - Pane onder lg: (mobile) terugvalt op full-screen BottomSheet.
 *  - Sheet correct als BottomSheet rendert (responsive in zichzelf).
 *  - Confirm centered & smal verschijnt met destructieve CTA-styling.
 *
 * Geen Supabase, geen module-data, geen routing — pure UI-test.
 */

import { useState } from 'react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'

type DemoKind = 'pane' | 'pane-deep' | 'sheet' | 'confirm' | null

export function OverlayDemo() {
  const [active, setActive] = useState<DemoKind>(null)

  // Pane "verdiept" simulatie: wanneer pane-deep actief is, toont de pane
  // een back-knop. Dit demonstreert de §6.1 transactie-detail-flow waarbij
  // pane-content vervangt zonder een tweede pane te openen.
  const isPane = active === 'pane' || active === 'pane-deep'
  const isPaneDeep = active === 'pane-deep'

  const close = () => setActive(null)

  return (
    <div className="space-y-6">
      {/* Trigger-knoppen — krant-stijl, scherpe hoeken, touch-target 44px */}
      <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-5">
        <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.18em] font-mono font-semibold text-[var(--ink-2)]">
          <span aria-hidden className="inline-block h-px w-7 shrink-0" style={{ background: 'var(--module-active-500)' }} />
          ShellOverlay-demo
        </div>
        <h2
          className="mt-2 text-[22px] leading-tight font-bold text-[var(--ink)] tracking-[-0.02em]"
          style={{ fontFamily: 'var(--font-playfair, serif)' }}
        >
          Driewegregel — pane / sheet / confirm
        </h2>
        <p className="mt-2 font-serif text-base leading-relaxed text-[var(--ink-2)]">
          Klik op een knop om de overlay te openen. Pane is desktop-only
          (≥1024px); onder die breedte valt hij terug op een full-screen sheet.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => setActive('pane')}
            className="touch-target border border-[var(--border-md)] bg-[var(--paper)] px-4 py-3 text-sm font-medium text-[var(--ink)] hover:bg-[var(--subtle)]"
          >
            Open pane
          </button>
          <button
            type="button"
            onClick={() => setActive('pane-deep')}
            className="touch-target border border-[var(--border-md)] bg-[var(--paper)] px-4 py-3 text-sm font-medium text-[var(--ink)] hover:bg-[var(--subtle)]"
          >
            Open pane (verdiept)
          </button>
          <button
            type="button"
            onClick={() => setActive('sheet')}
            className="touch-target border border-[var(--border-md)] bg-[var(--paper)] px-4 py-3 text-sm font-medium text-[var(--ink)] hover:bg-[var(--subtle)]"
          >
            Open sheet
          </button>
          <button
            type="button"
            onClick={() => setActive('confirm')}
            className="touch-target border border-[var(--border-md)] bg-[var(--paper)] px-4 py-3 text-sm font-medium text-[var(--ink)] hover:bg-[var(--subtle)]"
          >
            Open confirm
          </button>
        </div>
      </div>

      {/* Pane-overlay — desktop slide-in. Back-knop alleen bij "verdiept". */}
      <ShellOverlay
        open={isPane}
        onClose={close}
        kind="pane"
        title={isPaneDeep ? 'Transactie · 12 mei' : 'Boodschappen — mei 2026'}
        onBack={isPaneDeep ? () => setActive('pane') : undefined}
      >
        <div className="space-y-5 p-5">
          {isPaneDeep ? (
            <>
              <PaneSection
                kicker="Detail"
                title="Albert Heijn — € 67,42"
                body="Boodschappen, betaald met betaalpas. Categorie: Dagelijkse boodschappen. Notitie: weekend-inkoop."
              />
              <PaneSection
                kicker="Acties"
                title="Splitsen of herclassificeren"
                body="Vanuit deze pane kun je de transactie splitsen, een nieuwe categorie toewijzen of een notitie toevoegen. Sluiten via ✕ rechtsboven of Esc."
              />
            </>
          ) : (
            <>
              <PaneSection
                kicker="Maand-saldo"
                title="€ 412 van € 600 besteed"
                body="68% van het budget verbruikt halverwege de maand. Op koers richting de bovengrens — controleer de transactie-historie hieronder."
              />
              <PaneSection
                kicker="Recente transacties"
                title="3 uitgaven deze week"
                body="Klik op een transactie om in dezelfde pane te verdiepen (vervangt de inhoud, met back-knop in de pane-header)."
              />
              <PaneSection
                kicker="Trend"
                title="13% lager dan april"
                body="Maandelijkse uitgaven dalen consistent sinds februari. Goede koers."
              />
            </>
          )}
        </div>
      </ShellOverlay>

      {/* Sheet-overlay — responsive BottomSheet. */}
      <ShellOverlay
        open={active === 'sheet'}
        onClose={close}
        kind="sheet"
        title="Snelle bewerking"
        size="md"
      >
        <div className="space-y-4 p-5">
          <p className="font-serif text-base leading-relaxed text-[var(--ink-2)]">
            Sheet is voor &ldquo;even iets snel doen&rdquo; — terugkeer-context blijft
            zichtbaar (mobile peek, desktop centered modal).
          </p>
          <label className="block">
            <span className="block text-sm text-[var(--ink-2)]">Bedrag aanpassen</span>
            <input
              type="text"
              defaultValue="€ 600,00"
              className="mt-2 w-full border border-[var(--border-md)] bg-[var(--paper)] px-3 py-3 font-mono text-[15px] text-[var(--ink)] outline-none focus:border-[var(--ink-2)] focus:ring-2 focus:ring-[var(--ink-2)]/20"
              style={{ minHeight: 44 }}
            />
          </label>
          <div className="flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={close}
              className="border border-[var(--border-md)] bg-[var(--paper)] px-4 py-3 text-sm font-medium text-[var(--ink)] hover:bg-[var(--subtle)]"
              style={{ minHeight: 44 }}
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={close}
              className="border border-[var(--ink)] bg-[var(--ink)] px-4 py-3 text-sm font-semibold text-[var(--paper)] hover:opacity-90"
              style={{ minHeight: 44 }}
            >
              Opslaan
            </button>
          </div>
        </div>
      </ShellOverlay>

      {/* Confirm-overlay — smal centered modal met destructieve CTA. */}
      <ShellOverlay
        open={active === 'confirm'}
        onClose={close}
        kind="confirm"
        title="Budget verwijderen?"
        destructive
      >
        <div className="space-y-4 p-5">
          <p className="font-serif text-base leading-relaxed text-[var(--ink-2)]">
            Het budget en alle bijbehorende koppelingen worden definitief verwijderd.
            Deze actie kan niet ongedaan worden gemaakt.
          </p>
          <div className="flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={close}
              className="border border-[var(--border-md)] bg-[var(--paper)] px-4 py-3 text-sm font-medium text-[var(--ink)] hover:bg-[var(--subtle)]"
              style={{ minHeight: 44 }}
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={close}
              className="border border-[var(--negative,#a32d2d)] bg-[var(--negative,#a32d2d)] px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
              style={{ minHeight: 44 }}
            >
              Definitief verwijderen
            </button>
          </div>
        </div>
      </ShellOverlay>
    </div>
  )
}

// Kleine helper-component voor pane-secties — kicker-streep + Playfair titel + body.
function PaneSection({ kicker, title, body }: { kicker: string; title: string; body: string }) {
  return (
    <section className="border-b border-[var(--border-ed)] pb-4 last:border-b-0 last:pb-0">
      <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.18em] font-mono font-semibold text-[var(--ink-2)]">
        <span aria-hidden className="inline-block h-px w-7 shrink-0" style={{ background: 'var(--module-active-500)' }} />
        {kicker}
      </div>
      <h4
        className="mt-2 text-[18px] leading-tight font-bold text-[var(--ink)] tracking-[-0.01em]"
        style={{ fontFamily: 'var(--font-playfair, serif)' }}
      >
        {title}
      </h4>
      <p className="mt-1.5 font-serif text-[15px] leading-relaxed text-[var(--ink-2)]">
        {body}
      </p>
    </section>
  )
}
