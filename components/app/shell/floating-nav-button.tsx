'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, LayoutGrid, X } from 'lucide-react'
import { useCommandPalette } from '@/components/command-palette/command-palette-provider'
import { NavMenuSheet } from './nav-menu-sheet'

/**
 * FloatingNavButton — Vercel-style mobile nav-control.
 *
 * Een floating pill onderaan het scherm met twee acties:
 *  - 🔍 Zoeken (vergrootglas) → opent command-palette voor fuzzy-zoek
 *    door pagina's, doelen, transacties en acties
 *  - ⊞ Waffle/grid (toggle) → opent NavMenuSheet met de complete nav-
 *    structuur. Wanneer menu open is, verandert het waffle-icoon in een
 *    kruisje (✕) en sluit een klik het menu — geen dubbele dismiss-area.
 *
 * Eén centrale knop = één mentale instap. Sub-routes en globale items
 * leven in het sheet-menu (Vercel-stijl).
 *
 * Visueel: ~33% schermbreed, midden-gecentreerd, 12px boven safe-area.
 * Altijd zichtbaar — óók wanneer het sheet open is, zodat de toggle-knop
 * blijft staan en het menu eenvoudig dicht kan. z-index boven de sheet's
 * portal-content om dat te garanderen.
 */
export function FloatingNavButton() {
  const [menuOpen, setMenuOpen] = useState(false)
  const cmd = useCommandPalette()
  const router = useRouter()

  const handleAction = (action: 'open-chat' | 'open-account' | 'open-search') => {
    if (action === 'open-search') {
      cmd.open()
      return
    }
    if (action === 'open-account') {
      setMenuOpen(false)
      router.push('/mijn/account')
      return
    }
    // open-chat wordt later gekoppeld aan de Will-coach-pane. Voor nu no-op
    // zodat de knop niet crasht.
  }

  return (
    <>
      <div
        // z-[60] zit tussen de NavMenuSheet (z-50, `belowFloatingNav`) en de
        // gewone content-modals (z-[70], standaard BOVEN de pill). Zo blijft de
        // toggle-knop tappbaar wanneer hét nav-menu open is, terwijl een gewone
        // modal de pill juist afdekt (volle hoogte voor content/knoppen onderin).
        // `lg:hidden` (niet md:hidden) zodat de pill zichtbaar blijft in de
        // band 768–1023px — daar is de Sidebar (`hidden lg:flex`) nog verborgen
        // én draait de mobiele tray-shell (`lg:hidden`), dus zonder de pill zou
        // er geen navigatie-affordance zijn. Houd de breakpoint in sync met de
        // `--mobile-nav-clearance`-media-query in globals.css.
        className="fixed left-1/2 -translate-x-1/2 z-[60] lg:hidden"
        style={{
          bottom: `calc(var(--safe-area-bottom, 0px) + 12px)`,
        }}
        data-mobile-floating-nav="true"
      >
        <div className="flex items-stretch gap-px rounded-full bg-stone-900 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.25),0_2px_8px_rgba(0,0,0,0.15)]">
          <button
            type="button"
            onClick={() => cmd.open()}
            aria-label="Zoeken"
            className="flex items-center justify-center rounded-full px-5 py-2.5 text-white/90 hover:bg-white/10 active:bg-white/15 transition-colors"
          >
            <Search size={18} strokeWidth={2.25} />
          </button>
          <div className="w-px self-stretch bg-white/15" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label={menuOpen ? 'Menu sluiten' : 'Menu openen'}
            aria-expanded={menuOpen}
            className="flex items-center justify-center rounded-full px-5 py-2.5 text-white/90 hover:bg-white/10 active:bg-white/15 transition-colors"
          >
            {menuOpen ? (
              <X size={18} strokeWidth={2.5} />
            ) : (
              <LayoutGrid size={18} strokeWidth={2.25} />
            )}
          </button>
        </div>
      </div>

      <NavMenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onAction={handleAction}
      />
    </>
  )
}
