/**
 * SANDBOX — sidebar-prototype op /beheer/sidebar-prototype.
 * Tijdelijke preview voor de evaluatie van een persistente verticale shell-navigatie.
 * VERWIJDERBAAR: deze hele directory + components/app/beheer/sidebar-prototype/
 * mag in een keer verwijderd worden zodra het ontwerp is goedgekeurd of
 * verworpen. Geen externe verwijzingen vanuit de echte app.
 */
'use client'

import { Wallet, ArrowUpRight } from 'lucide-react'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

/**
 * Mock content rendered alongside the sidebar inside the preview canvas.
 * Editorial-light: kicker + headline + deck + 4-col figures-strip + 1 dummy card.
 *
 * Static — purely contextual filler so the sidebar doesn't sit next to a blank
 * panel. CSS-vars `--module-active-*` are inherited from the page wrapper,
 * which mirrors what /core would set in production.
 */
export function PreviewContent() {
  return (
    <div className="p-6 sm:p-8">
      {/* Editorial header — kicker + h1 with italic-em + deck */}
      <header className="border-b border-[var(--ink)] pb-5 mb-6">
        <div className="flex items-center gap-2.5 mb-3 text-[10px] uppercase tracking-[0.20em] font-mono text-[var(--module-active-700)]">
          <span
            aria-hidden
            className="inline-block w-7 h-px"
            style={{ background: 'var(--module-active-500)' }}
          />
          De Kern · overzicht
        </div>
        <h1
          className="font-black leading-[0.95] tracking-[-0.025em] text-[28px] sm:text-[34px]"
          style={{ fontFamily: PLAYFAIR }}
        >
          Wat is jouw{' '}
          <em
            className="font-normal italic"
            style={{ color: 'var(--module-active-700)' }}
          >
            kern
          </em>
          ?
        </h1>
        <p
          className="mt-3 italic text-[15px] leading-snug max-w-[60ch] text-[var(--ink-2)] pl-3 border-l-2"
          style={{
            fontFamily: SOURCE_SERIF,
            borderColor: 'var(--module-active-500)',
          }}
        >
          Bezittingen en schulden in een oogopslag — de basis waarop alles rust.
        </p>
      </header>

      {/* Figures-strip — 4 cols, mock data */}
      <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-b border-[var(--ink)] mb-6">
        <FigureCell
          kicker="Bezittingen"
          amount="€ 168k"
          isWinner
        />
        <FigureCell
          kicker="Schulden"
          amount="€ 26k"
        />
        <FigureCell
          kicker="Netto"
          amount="€ 142k"
        />
        <FigureCell
          kicker="Mutatie · 30d"
          amount="+ € 1.420"
          sub="vs. vorige maand"
        />
      </div>

      {/* One dummy categorie-card — mini-artikel-blueprint */}
      <div
        className="bg-[var(--paper)] border border-[var(--border-ed)]"
      >
        <div
          aria-hidden
          className="h-[3px] w-full"
          style={{ background: 'var(--module-active-500)' }}
        />
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-2">
            <Wallet className="w-3 h-3" aria-hidden />
            <span>Categorie · cash</span>
          </div>
          <h2
            className="font-bold text-lg leading-tight"
            style={{ fontFamily: PLAYFAIR }}
          >
            Spaar
            <em
              className="font-normal italic"
              style={{ color: 'var(--module-active-700)' }}
            >
              pot
            </em>
          </h2>
          <p
            className="leading-none mt-2"
            style={{ fontFamily: PLAYFAIR }}
          >
            <span
              className="font-black text-[24px] tracking-[-0.02em] italic px-1 tabular-nums"
              style={{
                backgroundImage:
                  'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
              }}
            >
              € 18.420
            </span>
          </p>
          <p
            className="mt-2 italic text-[12px] text-[var(--ink-3)]"
            style={{ fontFamily: SOURCE_SERIF }}
          >
            Drie rekeningen · laatst bijgewerkt 2 dagen geleden
          </p>
          <span className="mt-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)]">
            Open detail <ArrowUpRight className="w-3 h-3" aria-hidden />
          </span>
        </div>
      </div>
    </div>
  )
}

interface FigureCellProps {
  kicker: string
  amount: string
  sub?: string
  isWinner?: boolean
}

function FigureCell({ kicker, amount, sub, isWinner }: FigureCellProps) {
  return (
    <div className="p-3 sm:p-4 border-r border-[var(--rule-soft)] last:border-r-0 [&:nth-child(-n+2)]:border-b sm:[&:nth-child(-n+2)]:border-b-0 last:border-b-0">
      <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] mb-1.5">
        {kicker}
      </div>
      <div
        className="text-[20px] sm:text-[26px] font-black leading-none tracking-[-0.02em] tabular-nums text-[var(--ink)]"
        style={{ fontFamily: PLAYFAIR }}
      >
        {isWinner ? (
          <span
            className="inline px-1"
            style={{
              backgroundImage:
                'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
            }}
          >
            {amount}
          </span>
        ) : (
          amount
        )}
      </div>
      {sub && (
        <div
          className="italic text-[11px] text-[var(--ink-3)] mt-1.5"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          {sub}
        </div>
      )}
    </div>
  )
}
