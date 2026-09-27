import type { Metadata } from 'next'
import Link from 'next/link'

/**
 * Offline-pagina — wat de service worker (`app/sw.ts`) toont als een navigatie
 * het netwerk niet haalt. Precached via `serwist.config.mjs`; de URL staat
 * canoniek in `lib/pwa/sw-caches.ts` (OFFLINE_URL).
 *
 * Bewust STATISCH en zonder gegevens: de worker serveert hem voor élke route,
 * aan elk account op dit toestel, en er staat geen enkel cijfer in. Besluit
 * eigenaar 27 sep 2026: geen offline "laatste stand" — een oude pagina met oude
 * cijfers zonder dat je het merkt is erger dan eerlijk zeggen dat er geen
 * verbinding is.
 *
 * Buiten de app-shell, dus mag hij zijn eigen <h1> dragen (ADR 0110). Opmaak
 * spiegelt de root-404 (`app/not-found.tsx`): kicker → Playfair-kop met één
 * italic-accent → serif-zin → één primaire ink-CTA.
 *
 * "Opnieuw proberen" is een kale link naar de huidige URL: de worker serveert
 * deze pagina ónder de URL die je probeerde te openen, dus herladen probeert
 * precies die pagina opnieuw — zonder JavaScript, dat offline mogelijk niet in
 * de cache staat.
 */

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'Geen verbinding — TriFinity',
  robots: { index: false, follow: false },
}

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-6">
      <div className="w-full max-w-md border border-[var(--border-ed)] bg-[var(--paper)] px-6 py-10 text-center sm:px-10">
        <p className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
          <span aria-hidden className="mr-2.5 inline-block h-px w-7 bg-[var(--ink-3)] align-middle" />
          Offline
        </p>
        <h1
          className="mt-4 text-[28px] leading-tight text-[var(--ink)] sm:text-[36px]"
          style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', fontWeight: 700 }}
        >
          Even <em className="font-normal italic">geen</em> verbinding.
        </h1>
        <p
          className="mx-auto mt-3 max-w-[38ch] text-sm leading-relaxed text-[var(--ink-2)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          Je cijfers halen we altijd vers op, zodat je nooit naar een oude stand
          kijkt. Zodra je weer online bent, ga je verder waar je was.
        </p>
        <div className="mt-8">
          {/* Lege href = de URL in de adresbalk, dus de pagina die je probeerde te openen. */}
          <a
            href=""
            className="inline-flex min-h-11 items-center justify-center bg-[var(--ink)] px-6 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            Opnieuw proberen
          </a>
        </div>
        <p className="mt-4 text-xs text-[var(--ink-3)]">
          of ga naar{' '}
          <Link href="/overzicht" className="underline decoration-[var(--ink-4)] underline-offset-2 hover:text-[var(--ink)]">
            Overzicht
          </Link>
        </p>
      </div>
      <p className="mt-6 cursor-default select-none text-[10px] text-[var(--ink-4)]">
        TriFinity ✦ offline
      </p>
    </div>
  )
}
