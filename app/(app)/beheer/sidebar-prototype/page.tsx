/**
 * SANDBOX — sidebar-prototype op /beheer/sidebar-prototype.
 * Tijdelijke preview voor de evaluatie van een persistente verticale shell-navigatie.
 * VERWIJDERBAAR: deze hele directory + components/app/beheer/sidebar-prototype/
 * mag in een keer verwijderd worden zodra het ontwerp is goedgekeurd of
 * verworpen. Geen externe verwijzingen vanuit de echte app.
 */
'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  SidebarShell,
  type SidebarVariant,
} from '@/components/app/beheer/sidebar-prototype/sidebar-shell'
import { PreviewContent } from '@/components/app/beheer/sidebar-prototype/preview-content'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

// Keep variant-meta close to the page so the toggle row is data-driven.
const VARIANTS: Array<{ key: SidebarVariant; label: string }> = [
  { key: 'A', label: 'A · Editorial-zwaar' },
  { key: 'B', label: 'B · Stille bibliotheek' },
  { key: 'C', label: 'C · Hybride (aanbevolen)' },
]

export default function SidebarPrototypePage() {
  const [variant, setVariant] = useState<SidebarVariant>('C')
  const [mobile, setMobile] = useState(false)

  // Canvas is 1024×620 in desktop mode, 390×640 in mobile mode.
  // Sidebar collapses to 56px when mobile-mode is active so we can preview
  // the icon-rail behaviour without a real drawer implementation.
  const canvasWidth = mobile ? 390 : 1024
  const sidebarCollapsed = mobile

  // Page-level CSS-vars — same palette as the blueprints showcase, plus
  // Kern as the active module so the highlight-marker uses Kern-200.
  const pageStyle: React.CSSProperties = {
    '--bg': '#fbf2e7',
    '--paper': '#fef9ef',
    '--subtle': '#f3ead9',
    '--border-ed': '#e3dac8',
    '--border-md': '#ccc1aa',
    '--rule-soft': 'rgba(26, 25, 22, 0.18)',
    '--module-active-50': 'var(--color-kern-50)',
    '--module-active-100': 'var(--color-kern-100)',
    '--module-active-200': 'var(--color-kern-200)',
    '--module-active-300': 'var(--color-kern-300)',
    '--module-active-400': 'var(--color-kern-400)',
    '--module-active-500': 'var(--color-kern-500)',
    '--module-active-600': 'var(--color-kern-600)',
    '--module-active-700': 'var(--color-kern-700)',
    '--module-active-800': 'var(--color-kern-800)',
    '--module-active-900': 'var(--color-kern-900)',
    '--module-active-950': 'var(--color-kern-950)',
    background: 'var(--bg)',
    color: 'var(--ink)',
    minHeight: 'calc(100vh - var(--header-height))',
  } as React.CSSProperties

  return (
    <div
      className="-mx-4 sm:-mx-6 -my-5 sm:-my-12 px-4 sm:px-8 py-6 sm:py-10"
      style={pageStyle}
    >
      <main className="mx-auto max-w-6xl">
        {/* Back-link */}
        <Link
          href="/beheer/ai"
          className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)] hover:text-[var(--ink)] mb-6 font-mono"
        >
          ← Terug naar Beheer
        </Link>

        {/* Masthead — same DNA as blueprints hub: double top-rule + tf. + meta */}
        <header
          className="border-t-4 border-double border-b border-[var(--ink)] py-3 sm:py-4 flex items-baseline justify-between gap-4 flex-wrap"
        >
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-2)] font-mono">
            Editie · sidebar-review
          </div>
          <div
            className="text-[28px] sm:text-[34px] leading-none italic font-black tracking-[-0.02em]"
            style={{ fontFamily: PLAYFAIR }}
          >
            tf<span style={{ color: 'var(--color-horizon-500)' }}>.</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-2)] font-mono text-right">
            Drie varianten · een prototype
          </div>
        </header>

        {/* Headline-row — kicker + Playfair h1 with italic-em + editorial deck */}
        <section className="border-b border-[var(--ink)] py-7 sm:py-10 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 md:gap-10 items-end">
          <div>
            <div className="flex items-center gap-2.5 mb-4 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
              <span
                aria-hidden
                className="inline-block w-7 h-px"
                style={{ background: 'var(--module-active-500)' }}
              />
              Persistente shell-navigatie
            </div>
            <h1
              className="font-black leading-[0.95] tracking-[-0.025em] text-[40px] sm:text-[56px] md:text-[64px]"
              style={{ fontFamily: PLAYFAIR }}
            >
              Welke{' '}
              <em
                className="font-normal italic"
                style={{ color: 'var(--module-active-700)' }}
              >
                kant
              </em>
              <br />
              kiezen we?
            </h1>
          </div>
          <p
            className="italic text-base sm:text-[17px] leading-snug max-w-[380px] text-[var(--ink-2)] pl-4"
            style={{
              fontFamily: SOURCE_SERIF,
              borderLeft: '2px solid var(--color-horizon-500)',
            }}
          >
            Sandbox-preview voor een verticale Notion / Claude-Desktop-stijl shell.
            Drie modules krijgen primaat — alle andere bestemmingen wijken visueel
            terug. Geen rollout, alleen evaluatie.
          </p>
        </section>

        {/* Variant + mobile toggles */}
        <section className="py-6 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-[var(--rule-soft)]">
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] uppercase tracking-[0.20em] font-mono text-[var(--ink-3)] mr-1">
              Variant
            </span>
            {VARIANTS.map((v) => {
              const on = v.key === variant
              return (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setVariant(v.key)}
                  className={`inline-flex items-center px-3 h-8 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] border rounded-full transition-colors duration-150 ${
                    on
                      ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
                      : 'bg-transparent text-[var(--ink-3)] border-[var(--rule-soft)] hover:text-[var(--ink-2)] hover:border-[var(--border-md)]'
                  }`}
                  aria-pressed={on}
                >
                  {v.label}
                </button>
              )
            })}
          </div>

          {/* Mobile toggle — switch between 1024px and 390px canvas.
              Track + thumb are inline-style driven so we don't depend on
              Tailwind peer-modifiers reaching into nested children. */}
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={mobile}
              onChange={(e) => setMobile(e.target.checked)}
              className="sr-only"
              aria-label="Mobile preview"
            />
            <span
              aria-hidden
              className="relative inline-block w-9 h-5 border transition-colors duration-150"
              style={{
                background: mobile ? 'var(--ink)' : 'var(--subtle)',
                borderColor: mobile ? 'var(--ink)' : 'var(--border-md)',
              }}
            >
              <span
                className="absolute top-0.5 left-0.5 h-3.5 w-3.5 transition-transform duration-150"
                style={{
                  background: 'var(--paper)',
                  transform: mobile ? 'translateX(16px)' : 'translateX(0)',
                }}
              />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-2)]">
              Mobile · 390px
            </span>
          </label>
        </section>

        {/* Preview canvas — browser-frame look */}
        <section className="py-7 sm:py-10">
          <div className="overflow-x-auto">
            <div
              className="mx-auto bg-[var(--paper)] border border-[var(--ink)] shadow-[0_8px_32px_rgba(26,25,22,.10)] transition-[width] duration-200"
              style={{ width: canvasWidth, maxWidth: '100%' }}
            >
              {/* Browser-frame top bar — purely decorative */}
              <div className="flex items-center gap-1.5 px-3 h-7 border-b border-[var(--border-ed)] bg-[var(--subtle)]">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-[var(--ink-4)]" />
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-[var(--ink-4)]" />
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-[var(--ink-4)]" />
                <div className="flex-1 mx-3 h-4 bg-[var(--paper)] border border-[var(--border-ed)] flex items-center justify-center font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
                  trifinity.app/core
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
                  Variant {variant}
                </span>
              </div>
              {/* Two-column shell: sidebar | preview-content */}
              <div className="flex">
                <SidebarShell variant={variant} collapsed={sidebarCollapsed} />
                <div className="flex-1 min-w-0 bg-[var(--bg)]">
                  <PreviewContent />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Notes — UX-overwegingen */}
        <section className="py-6 sm:py-8 border-t border-[var(--rule-soft)]">
          <div className="flex items-center justify-between border-b border-[var(--rule-soft)] pb-2 mb-5">
            <span className="text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--ink-3)]">
              Open vragen
            </span>
            <span
              className="italic text-sm text-[var(--module-active-700)]"
              style={{ fontFamily: PLAYFAIR }}
            >
              notities
            </span>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 list-none pl-0">
            {NOTES.map((note) => (
              <li key={note.title} className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-2 inline-block w-3 h-px shrink-0"
                  style={{ background: 'var(--module-active-500)' }}
                />
                <div>
                  <strong
                    className="font-bold text-[13px] text-[var(--ink)]"
                    style={{ fontFamily: PLAYFAIR }}
                  >
                    {note.title}
                  </strong>
                  <p
                    className="text-[13px] leading-snug text-[var(--ink-2)] mt-0.5"
                    style={{ fontFamily: SOURCE_SERIF }}
                  >
                    {note.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Colophon */}
        <p className="text-center text-[10px] uppercase tracking-[0.25em] font-mono text-[var(--ink-3)] py-4">
          Trifinity{' '}
          <span style={{ color: 'var(--color-horizon-500)' }} className="mx-2">
            ✦
          </span>{' '}
          Sidebar-review{' '}
          <span style={{ color: 'var(--color-horizon-500)' }} className="mx-2">
            ✦
          </span>{' '}
          v0.1
        </p>
      </main>
    </div>
  )
}

const NOTES: Array<{ title: string; body: string }> = [
  {
    title: 'Wat als modules uit staan?',
    body:
      'Inactieve modules tonen we gedimd (ink-4) met een lock-icon en deeplink naar /identity/instellingen. Volgorde Kern → Wil → Horizon blijft staan zodat positie betekenis houdt.',
  },
  {
    title: 'Wat doet ⌘K?',
    body:
      'Variant B en C tonen een ⌘K-knop in de branding-rij. Idee: command-palette voor categorie- en feature-deeplinks. Niet voor module-switch — modules blijven persistent zichtbaar.',
  },
  {
    title: 'Hoe schaalt dit met sub-modules?',
    body:
      'Active-module krijgt inline sub-tags (Bezittingen · Schulden · …). Bij meer dan 5 sub-tags overwegen we een uitklap-disclosure of doorklik naar de categorie-pagina — niet een geneste boom.',
  },
  {
    title: 'Mobile fallback?',
    body:
      'Onder 768px verschijnt sidebar als hamburger-drawer; deze preview toont alleen de visuele collapse-rail (56px). Een echte drawer met focus-trap valt buiten scope van deze sandbox.',
  },
  {
    title: 'Conflict met AppHeader?',
    body:
      'In productie komt sidebar-shell in plaats van de horizontale tabs-rij in AppHeader. Bell, news en perspective-switcher blijven rechtsboven. Branding (tf.) verhuist naar de sidebar.',
  },
  {
    title: 'Footer-hiërarchie',
    body:
      'Profiel-pill + Identiteit/Instellingen/Uitloggen krijgen mono UPPERCASE 10px — duidelijk administratief. Geen icons, geen kleur — zo blijft de visuele aandacht bij de drie modules.',
  },
]
