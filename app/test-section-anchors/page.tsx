'use client'

import { Bell, Newspaper } from 'lucide-react'

function SectionAnchors() {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <nav className="mb-6 flex items-center justify-center gap-1" aria-label="Sectie-navigatie">
      <button
        type="button"
        onClick={() => scrollTo('sectie-meldingen')}
        className="flex min-h-[44px] items-center gap-1.5 rounded-[var(--r)] px-3 py-1.5 font-inter text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] sm:min-h-0"
      >
        <Bell className="h-3.5 w-3.5" />
        Meldingen
      </button>
      <span className="text-[var(--ink-4)]" aria-hidden="true">&middot;</span>
      <button
        type="button"
        onClick={() => scrollTo('sectie-nieuws')}
        className="flex min-h-[44px] items-center gap-1.5 rounded-[var(--r)] px-3 py-1.5 font-inter text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] sm:min-h-0"
      >
        <Newspaper className="h-3.5 w-3.5" />
        Nieuws
      </button>
    </nav>
  )
}

export default function TestSectionAnchorsPage() {
  return (
    <div className="mx-auto max-w-[720px] px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">Test: Sectie-ankers</h1>

      <SectionAnchors />

      {/* Spacer to make scrolling noticeable */}
      <div className="h-[50vh] flex items-center justify-center border border-dashed border-gray-300 rounded-lg mb-6">
        <p className="text-gray-400">Scroll ruimte</p>
      </div>

      <section id="sectie-meldingen" className="scroll-mt-4">
        <h2 className="text-xl font-semibold mb-4 border-b pb-2">Meldingen</h2>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4 bg-white">
              <p className="font-medium">Melding {i + 1}</p>
              <p className="text-sm text-gray-500">Voorbeeld notificatie</p>
            </div>
          ))}
        </div>
      </section>

      {/* Another spacer */}
      <div className="h-[30vh] flex items-center justify-center border border-dashed border-gray-300 rounded-lg my-6">
        <p className="text-gray-400">Scroll ruimte</p>
      </div>

      <section id="sectie-nieuws" className="scroll-mt-4">
        <h2 className="text-xl font-semibold mb-4 border-b pb-2">Nieuws</h2>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4 bg-white">
              <p className="font-medium">Nieuwsartikel {i + 1}</p>
              <p className="text-sm text-gray-500">Voorbeeld nieuws item</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-8 rounded-lg border border-green-200 bg-green-50 p-4">
        <h3 className="font-bold text-green-800">Verificatie checklist</h3>
        <ul className="mt-2 space-y-1 text-sm text-green-700">
          <li>✓ SectionAnchors component renders with Meldingen and Nieuws buttons</li>
          <li>✓ Both buttons have Bell and Newspaper icons</li>
          <li>✓ Middot separator between buttons</li>
          <li>✓ aria-label on nav element</li>
          <li>✓ section elements have id=sectie-meldingen and id=sectie-nieuws</li>
          <li>✓ scroll-mt-4 class for offset</li>
          <li>✓ 44px min touch target on mobile</li>
          <li>Click buttons above to test smooth scroll</li>
        </ul>
      </div>
    </div>
  )
}
