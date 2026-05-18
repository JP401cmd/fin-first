'use client'

import { useState } from 'react'
import { Search, LayoutGrid } from 'lucide-react'
import { useCommandPalette } from '@/components/command-palette/command-palette-provider'
import { NavMenuSheet } from './nav-menu-sheet'

/**
 * FloatingNavButton — Vercel-style mobile nav-control.
 *
 * Een floating pill onderaan het scherm met twee acties:
 *  - 🔍 Zoeken (vergrootglas) → opent command-palette voor fuzzy-zoek
 *    door pagina's, doelen, transacties en acties
 *  - ⊞ Waffle/grid → opent NavMenuSheet met de complete nav-structuur
 *
 * Vervangt op termijn de drie-tab BottomNav. Eén centrale knop = één
 * mentale instap. Sub-routes en globale items leven in het sheet-menu,
 * net als in Vercel's mobile dashboard.
 *
 * Visueel: ~33% schermbreed, midden-gecentreerd, 16px boven safe-area.
 * Altijd zichtbaar — gebruiker kan vanaf elke pagina menu/zoek bereiken
 * zonder eerst naar een ankerpagina te navigeren.
 */
export function FloatingNavButton() {
  const [menuOpen, setMenuOpen] = useState(false)
  const cmd = useCommandPalette()

  const handleAction = (action: 'open-chat' | 'open-account' | 'open-search') => {
    if (action === 'open-search') cmd.open()
    // open-chat / open-account worden later gekoppeld aan de juiste handlers
    // (Will-coach-pane, account-sheet). Voor nu no-op zodat de knop niet crasht.
  }

  return (
    <>
      <div
        className="fixed left-1/2 -translate-x-1/2 z-40 md:hidden"
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
            onClick={() => setMenuOpen(true)}
            aria-label="Menu openen"
            aria-expanded={menuOpen}
            className="flex items-center justify-center rounded-full px-5 py-2.5 text-white/90 hover:bg-white/10 active:bg-white/15 transition-colors"
          >
            <LayoutGrid size={18} strokeWidth={2.25} />
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
