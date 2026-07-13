import Link from 'next/link'

/**
 * Root-404 — vangt onbekende URL's búiten de (app)-routegroep (de app-groep
 * heeft z'n eigen app/(app)/not-found.tsx). Zelfde krant-taal als die variant:
 * kicker → Playfair-kop met één italic-accent → serif-zin → één primaire
 * ink-CTA. Publiek bereikbaar (ook uitgelogd), dus de primaire knop wijst
 * naar Overzicht (ingelogd landt daar; uitgelogd redirect naar login) met
 * de startpagina als secundaire tekstlink.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-6">
      <div className="w-full max-w-md border border-[var(--border-ed)] bg-[var(--paper)] px-6 py-10 text-center sm:px-10">
        <p className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
          <span aria-hidden className="mr-2.5 inline-block h-px w-7 bg-[var(--ink-3)] align-middle" />
          404 — niet gevonden
        </p>
        <h1
          className="mt-4 text-[28px] leading-tight text-[var(--ink)] sm:text-[36px]"
          style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', fontWeight: 700 }}
        >
          Deze pagina bestaat niet{' '}
          <em className="font-normal italic">meer</em>.
        </h1>
        <p
          className="mx-auto mt-3 max-w-[38ch] text-sm leading-relaxed text-[var(--ink-2)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          De pagina die je zoekt is verplaatst of heeft nooit bestaan. Je
          gegevens staan er nog precies zo bij als je ze achterliet.
        </p>
        <div className="mt-8">
          <Link
            href="/overzicht"
            className="inline-flex min-h-11 items-center justify-center bg-[var(--ink)] px-6 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            Naar Overzicht
          </Link>
        </div>
        <p className="mt-4 text-xs text-[var(--ink-3)]">
          of ga naar{' '}
          <Link href="/" className="underline decoration-[var(--ink-4)] underline-offset-2 hover:text-[var(--ink)]">
            de startpagina
          </Link>
        </p>
      </div>
      <p className="mt-6 cursor-default select-none text-[10px] text-[var(--ink-4)]">
        TriFinity ✦ 404
      </p>
    </div>
  )
}
