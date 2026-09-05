import Link from 'next/link'

/**
 * Hero van de marketing-home. Draagt de merkbelofte als kop — "Ontdek
 * waar je staat, plan waar je heen gaat" — een tweeledige belofte die de
 * vier pijler-secties eronder (Inzicht, Grip, Nu, Toekomst) uitwerken.
 * Rechts de VrijheidsPadKaart: een illustratieve projectie die laat zien
 * dat jouw keuzes het vrijheidsmoment verschuiven.
 */

// ── Vrijheidspad — illustratieve projectie-grafiek ───────────────────

function VrijheidsPadKaart() {
  return (
    <div className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s1)]">
      {/* Card header — krantenrubriek */}
      <div className="flex items-center justify-between border-b-2 border-[var(--ink)] px-5 py-3">
        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]">
          Jouw pad naar vrijheid
        </p>
        <span className="font-mono text-[10px] text-[var(--ink-meta)]">illustratief</span>
      </div>

      {/* Projectie-grafiek */}
      <div className="px-5 pb-1 pt-4">
        <svg
          viewBox="0 0 320 200"
          className="w-full"
          role="img"
          aria-label="Voorbeeldprojectie: je vermogen groeit tot het doelvermogen en je bent vrij vanaf je 51e; zet je vijf procent van je inkomen extra opzij, dan verschuift dat moment naar je 48e."
        >
          {/* Doelvermogen-lijn: hier ben je vrij */}
          <line x1="16" y1="48" x2="304" y2="48" stroke="var(--border-md)" strokeDasharray="2 4" />
          <text x="16" y="38" fontSize="9" fill="var(--ink-meta)" className="font-sans uppercase" letterSpacing="0.08em">
            Doelvermogen — genoeg om vrij te zijn
          </text>

          {/* Vlak onder het basispad */}
          <path
            d="M 20 160 C 110 150, 190 112, 284 48 L 284 168 L 20 168 Z"
            fill="var(--color-kern-100)"
            opacity="0.45"
          />

          {/* Versneld pad — keuzes schuiven het moment naar voren */}
          <path
            d="M 20 160 C 96 146, 156 96, 232 48"
            fill="none"
            stroke="var(--color-horizon-600)"
            strokeWidth="2"
            strokeDasharray="5 4"
          />

          {/* Basispad */}
          <path
            d="M 20 160 C 110 150, 190 112, 284 48"
            fill="none"
            stroke="var(--ink)"
            strokeWidth="2.25"
          />

          {/* Moment-markers op de tijdas */}
          <line x1="232" y1="48" x2="232" y2="168" stroke="var(--color-horizon-300)" strokeDasharray="2 3" />
          <line x1="284" y1="48" x2="284" y2="168" stroke="var(--border-ed)" strokeDasharray="2 3" />
          <circle cx="232" cy="48" r="4.5" fill="var(--paper)" stroke="var(--color-horizon-600)" strokeWidth="2" />
          <circle cx="284" cy="48" r="4.5" fill="var(--ink)" />

          {/* Tijdas */}
          <line x1="16" y1="168" x2="304" y2="168" stroke="var(--border-md)" />
          <text x="20" y="184" fontSize="9" fill="var(--ink-3)" className="font-mono">nu</text>
          <text x="232" y="184" fontSize="9" fill="var(--color-horizon-700)" textAnchor="middle" className="font-mono">48e</text>
          <text x="284" y="184" fontSize="9" fill="var(--ink-2)" textAnchor="middle" className="font-mono">51e</text>
        </svg>
      </div>

      {/* Legenda */}
      <div className="space-y-1.5 px-5 pb-4">
        <p className="flex items-center gap-2 font-sans text-[11px] text-[var(--ink-2)]">
          <span aria-hidden="true" className="inline-block h-0.5 w-5 shrink-0 bg-[var(--ink)]" />
          Jouw pad — vrij vanaf je <strong className="font-semibold">51e</strong>
        </p>
        <p className="flex items-center gap-2 font-sans text-[11px] text-[var(--ink-2)]">
          <span aria-hidden="true" className="inline-block w-5 shrink-0 border-t-2 border-dashed border-horizon-600" />
          Met 5% van je inkomen extra opzij — vrij vanaf je <strong className="font-semibold text-horizon-700">48e</strong>
        </p>
      </div>

      {/* Card footer */}
      <div className="bg-[var(--subtle)] px-5 py-3">
        <p className="text-center font-sans text-[10px] italic text-[var(--ink-meta)]">
          Voorbeeldprojectie — jouw eigen pad staat er in ±5 minuten
        </p>
      </div>
    </div>
  )
}

export function Hero() {
  return (
    <section className="relative min-h-screen bg-[var(--bg)] px-6 pt-32 pb-28 md:px-12 md:pt-40">

      {/* Dateline — krantenkoptegel */}
      <div className="mx-auto mb-10 max-w-6xl flex items-center justify-between border-b border-[var(--border-ed)] pb-3">
        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.11em] text-[var(--ink-3)]">
          Persoonlijk Financieel Dagblad
        </p>
        <p className="font-mono text-[10px] text-[var(--ink-meta)]">
          Editie 2026 · Nederland
        </p>
      </div>

      {/* Hoofdgrid: tekst (3/5) + vrijheidspad (2/5) */}
      <div className="mx-auto max-w-6xl grid grid-cols-1 items-start gap-14 md:grid-cols-5 md:gap-10">

        {/* Linkerkolom — de belofte */}
        <div className="md:col-span-3">
          <p className="mb-5 font-serif italic text-base text-kern-600 leading-relaxed">
            &ldquo;Geld is opgeslagen tijd&rdquo;
          </p>

          <h1 className="mb-6 font-display text-[2rem] font-bold leading-[1.15] tracking-[-0.02em] text-[var(--ink)] sm:text-[2.4rem] md:text-[2.7rem] lg:text-[3.1rem]">
            Ontdek waar je staat, plan{' '}
            <em className="italic text-kern-600">waar je heen gaat</em>.
          </h1>

          <p className="mb-8 max-w-[520px] font-serif text-lg leading-relaxed text-[var(--ink-2)]">
            TriFinity vertaalt je geld naar vrijheid in jaren, maanden en
            dagen — en laat zien hoe jouw keuzes het moment van financiële
            vrijheid dichterbij brengen.
          </p>

          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-[var(--r)] bg-[var(--ink)] px-6 py-3.5 font-sans text-sm font-medium text-[var(--bg)] transition-all hover:bg-[var(--ink-2)] hover:shadow-[var(--s1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              Begin gratis
            </Link>
            <Link
              href="/functies"
              className="inline-flex items-center justify-center gap-2 rounded-[var(--r)] border border-[var(--border-md)] px-6 py-3.5 font-sans text-sm font-medium text-[var(--ink-2)] transition-all hover:border-[var(--ink-3)] hover:shadow-[var(--s0)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              Ontdek hoe het werkt
              <span className="text-[var(--ink-meta)]">→</span>
            </Link>
            <Link
              href="/check"
              className="inline-flex items-center justify-center gap-2 rounded-[var(--r)] border border-kern-300 px-6 py-3.5 font-sans text-sm font-medium text-kern-700 transition-all hover:border-kern-400 hover:bg-kern-50 hover:shadow-[var(--s0)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kern-500"
            >
              Maak je eerste Vrijheidsrapport in 5 minuten
              <span className="text-kern-500" aria-hidden="true">→</span>
            </Link>
          </div>

          <p className="mb-12 font-sans text-xs text-[var(--ink-3)]">Geen creditcard nodig</p>

          {/* Rol-tags — wie heeft hier wat aan? */}
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-1 font-sans text-[11px] font-medium text-[var(--ink-3)]">
              Privé-gebruik
            </span>
            <span className="rounded-full border border-kern-200 bg-kern-50 px-3 py-1 font-sans text-[11px] font-medium text-kern-700">
              Eigen vermogen
            </span>
            <span className="rounded-full border border-wil-200 bg-wil-50 px-3 py-1 font-sans text-[11px] font-medium text-wil-700">
              Met huishouden
            </span>
            <span className="rounded-full border border-horizon-200 bg-horizon-50 px-3 py-1 font-sans text-[11px] font-medium text-horizon-700">
              FIRE-traject
            </span>
            <span className="rounded-full border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-1 font-sans text-[11px] font-medium text-[var(--ink-3)]">
              Nederlandse fiscaliteit
            </span>
          </div>
        </div>

        {/* Rechterkolom — vrijheidspad-projectie */}
        <div className="md:col-span-2">
          <VrijheidsPadKaart />
        </div>
      </div>

      {/* Scroll-indicator */}
      <div className="absolute bottom-9 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        <span className="font-sans text-[10px] uppercase tracking-[0.11em] text-[var(--ink-meta)]">
          Scroll
        </span>
        <div className="h-9 w-px bg-gradient-to-b from-[var(--border-md)] to-transparent" />
      </div>
    </section>
  )
}
