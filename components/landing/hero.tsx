import Link from 'next/link'

export function Hero() {
  return (
    <section className="relative min-h-screen bg-[var(--bg)] px-6 pt-32 pb-28 md:px-12 md:pt-40">

      {/* Dateline — krantenkoptegel */}
      <div className="mx-auto mb-10 max-w-6xl flex items-center justify-between border-b border-[var(--border-ed)] pb-3">
        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.11em] text-[var(--ink-3)]">
          Persoonlijk Financieel Dagblad
        </p>
        <p className="font-mono text-[10px] text-[var(--ink-4)]">
          Editie 2026 · Nederland
        </p>
      </div>

      {/* Hoofdgrid: tekst (3/5) + metrics card (2/5) */}
      <div className="mx-auto max-w-6xl grid grid-cols-1 items-start gap-14 md:grid-cols-5 md:gap-10">

        {/* Linkerkolom — redactionele tekst */}
        <div className="md:col-span-3">
          <p className="mb-5 font-serif italic text-base text-kern-600 leading-relaxed">
            "Geld is opgeslagen tijd"
          </p>

          <h1 className="mb-6 font-display text-[2.6rem] font-bold leading-[1.05] tracking-[-0.03em] text-[var(--ink)] sm:text-[3.2rem] md:text-[3.8rem] lg:text-[4.2rem]">
            Financiële vrijheid
            <br />
            is geen droom.
            <br />
            <span className="text-kern-600">Het is een berekening.</span>
          </h1>

          <p className="mb-8 max-w-[500px] font-serif text-lg leading-relaxed text-[var(--ink-2)]">
            TriFinity brengt je financiële leven samen op één plek en begeleidt
            je bij elke stap — van financieel inzicht naar gepersonaliseerde
            acties tot{' '}
            <strong className="font-semibold text-[var(--ink)]">
              financiële onafhankelijkheid
            </strong>.
          </p>

          <div className="mb-12 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-[var(--r)] bg-[var(--ink)] px-6 py-3.5 font-sans text-sm font-medium text-[var(--bg)] transition-all hover:bg-[var(--ink-2)] hover:shadow-[var(--s1)]"
            >
              Bereken je vrijheid
            </Link>
            <a
              href="#domeinen"
              className="inline-flex items-center justify-center gap-2 rounded-[var(--r)] border border-[var(--border-md)] px-6 py-3.5 font-sans text-sm font-medium text-[var(--ink-2)] transition-all hover:border-[var(--ink-3)] hover:shadow-[var(--s0)]"
            >
              Ontdek hoe het werkt
              <span className="text-[var(--ink-4)]">↓</span>
            </a>
          </div>

          {/* Feature tags */}
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-kern-200 bg-kern-50 px-3 py-1 font-sans text-[11px] font-medium text-kern-700">
              Box 3 optimalisatie
            </span>
            <span className="rounded-full border border-wil-200 bg-wil-50 px-3 py-1 font-sans text-[11px] font-medium text-wil-700">
              AI-coaching (Will)
            </span>
            <span className="rounded-full border border-horizon-200 bg-horizon-50 px-3 py-1 font-sans text-[11px] font-medium text-horizon-700">
              FIRE-tracking
            </span>
            <span className="rounded-full border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-1 font-sans text-[11px] font-medium text-[var(--ink-3)]">
              Gebouwd voor NL
            </span>
          </div>
        </div>

        {/* Rechterkolom — mock vrijheidsprofiel card */}
        <div className="md:col-span-2">
          <div className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s1)]">

            {/* Card header — krantenrubriek */}
            <div className="flex items-center justify-between border-b-2 border-[var(--ink)] px-5 py-3">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]">
                Jouw vrijheidsprofiel
              </p>
              <span className="font-mono text-[10px] text-[var(--ink-4)]">vandaag</span>
            </div>

            {/* Hoofdmetric */}
            <div className="border-b border-dashed border-[var(--border-ed)] px-5 py-6">
              <p className="mb-1 font-sans text-[10px] uppercase tracking-[0.1em] text-[var(--ink-3)]">
                Netto vrijheidskapitaal
              </p>
              <p className="font-display text-[2.8rem] font-bold leading-none tabular-nums text-[var(--ink)]">
                14{' '}
                <span className="text-[1.3rem] font-normal text-[var(--ink-3)]">jr</span>{' '}
                3{' '}
                <span className="text-[1.3rem] font-normal text-[var(--ink-3)]">mnd</span>
              </p>
              <p className="mt-1 font-serif italic text-sm text-[var(--ink-3)]">
                als je morgen stopt met werken
              </p>
            </div>

            {/* Sub-metrics grid */}
            <div className="grid grid-cols-2 divide-x divide-[var(--border-ed)]">
              <div className="border-b border-dashed border-[var(--border-ed)] px-4 py-4">
                <p className="mb-1 font-sans text-[9px] uppercase tracking-[0.1em] text-[var(--ink-4)]">
                  Maandelijkse vrijheid
                </p>
                <p className="font-mono text-lg font-bold text-kern-600 tabular-nums">
                  23{' '}
                  <span className="text-sm font-normal text-[var(--ink-3)]">dgn</span>
                </p>
              </div>
              <div className="border-b border-dashed border-[var(--border-ed)] px-4 py-4">
                <p className="mb-1 font-sans text-[9px] uppercase tracking-[0.1em] text-[var(--ink-4)]">
                  FIRE-datum
                </p>
                <p className="font-mono text-lg font-bold tabular-nums text-horizon-600">
                  51e{' '}
                  <span className="text-sm font-normal text-[var(--ink-3)]">jaar</span>
                </p>
              </div>
              <div className="px-4 py-4">
                <p className="mb-1 font-sans text-[9px] uppercase tracking-[0.1em] text-[var(--ink-4)]">
                  Spaarquote
                </p>
                <p className="font-mono text-lg font-bold tabular-nums text-[var(--ink)]">
                  34<span className="text-sm font-normal text-[var(--ink-3)]">%</span>
                </p>
              </div>
              <div className="px-4 py-4">
                <p className="mb-1 font-sans text-[9px] uppercase tracking-[0.1em] text-[var(--ink-4)]">
                  Vrijheidsgroei
                </p>
                <p className="font-mono text-lg font-bold tabular-nums text-[var(--ink)]">
                  +8{' '}
                  <span className="text-sm font-normal text-[var(--ink-3)]">dgn/mnd</span>
                </p>
              </div>
            </div>

            {/* Card footer */}
            <div className="bg-[var(--subtle)] px-5 py-3">
              <p className="text-center font-sans text-[10px] italic text-[var(--ink-4)]">
                Zo ziet jouw profiel eruit na de eerste setup
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll-indicator */}
      <div className="absolute bottom-9 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        <span className="font-sans text-[10px] uppercase tracking-[0.11em] text-[var(--ink-4)]">
          Scroll
        </span>
        <div className="h-9 w-px bg-gradient-to-b from-[var(--border-md)] to-transparent" />
      </div>
    </section>
  )
}
