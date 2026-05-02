import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { BLUEPRINTS, moduleStyle } from './_data'

export const metadata = {
  title: 'Blueprints — TriFinity',
}

/**
 * Hub-pagina voor de tijdelijke page-type-blueprints showcase.
 * Toont de 10 archetypes als mini-artikel-cards met deeplinks naar de
 * dynamic-route preview per type.
 */
export default function BlueprintsHubPage() {
  return (
    <main className="mx-auto max-w-5xl">
      {/* Back-link */}
      <Link
        href="/beheer/ai"
        className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)] hover:text-[var(--ink)] mb-6 font-mono"
      >
        ← Terug naar Beheer
      </Link>

      {/* Masthead — Type 10 stijl, want dit is zelf een editorial showcase */}
      <header
        className="border-t-4 border-double border-b border-[var(--ink)] py-3 sm:py-4 flex items-baseline justify-between gap-4 flex-wrap"
        style={{ borderColor: 'var(--ink)' }}
      >
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-2)] font-mono">
          Editie · plan-review
        </div>
        <div
          className="text-[28px] sm:text-[34px] leading-none italic font-black tracking-[-0.02em]"
          style={{ fontFamily: 'var(--font-playfair, serif)' }}
        >
          tf<span style={{ color: 'var(--color-horizon-500)' }}>.</span>
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-2)] font-mono text-right">
          Tien blueprints · één review
        </div>
      </header>

      {/* Headline-row */}
      <section className="border-b border-[var(--ink)] py-7 sm:py-10 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 md:gap-10 items-end">
        <div>
          {/* Kicker met streepje */}
          <div className="flex items-center gap-2.5 mb-4 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
            <span
              aria-hidden
              className="inline-block w-7 h-px"
              style={{ background: 'var(--module-active-500)' }}
            />
            Tien page-type-blueprints
          </div>
          {/* Headline met italic-em in module-kleur */}
          <h1
            className="font-black leading-[0.95] tracking-[-0.025em] text-[40px] sm:text-[56px] md:text-[64px]"
            style={{ fontFamily: 'var(--font-playfair, serif)' }}
          >
            Welke pagina&apos;s
            <br />
            <em
              className="font-normal italic"
              style={{ color: 'var(--module-active-700)' }}
            >
              herzien
            </em>{' '}
            we?
          </h1>
        </div>
        {/* Deck */}
        <p
          className="italic text-base sm:text-[17px] leading-snug max-w-[380px] text-[var(--ink-2)] pl-4"
          style={{
            fontFamily: 'var(--font-source-serif, Georgia, serif)',
            borderLeft: '2px solid var(--color-horizon-500)',
          }}
        >
          Tijdelijke showcase — elke kaart is een blueprint uit het plan.
          Stijl-positie: tussen FD.nl en FT.com in. Minder bruin, meer
          warm-zalm. Klik door om de top-down structuur te zien.
        </p>
      </section>

      {/* Page-type-blueprints */}
      <section className="py-6 sm:py-8">
        <div className="flex items-center justify-between border-b border-[var(--rule-soft)] pb-2 mb-5">
          <span className="text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--ink-3)]">
            Page-type-blueprints
          </span>
          <span
            className="italic text-sm text-[var(--module-active-700)]"
            style={{ fontFamily: 'var(--font-playfair, serif)' }}
          >
            i — x
          </span>
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 list-none">
          {BLUEPRINTS.filter((b) => b.group === 'page-type').map((b) => (
            <li
              key={b.type}
              style={{
                ...moduleStyle(b.module),
                background: 'var(--paper)',
                border: '1px solid var(--border-ed)',
              }}
              className="group transition-all hover:-translate-y-px hover:shadow-[0_2px_10px_rgba(26,25,22,.07)]"
            >
              <Link
                href={`/beheer/blueprints/${b.type}`}
                className="flex flex-col h-full text-left no-underline"
              >
                {/* Module-accent-strip */}
                <div
                  aria-hidden
                  className="h-[3px] w-full"
                  style={{ background: 'var(--module-active-500)' }}
                />
                <div className="flex-1 p-4 sm:p-5 flex flex-col gap-2.5">
                  {/* Kicker met streepje */}
                  <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)]">
                    <span
                      aria-hidden
                      className="inline-block w-7 h-px"
                      style={{ background: 'var(--module-active-500)' }}
                    />
                    {b.kicker}
                  </div>
                  {/* Headline met italic-em */}
                  <h2
                    className="font-bold text-lg sm:text-xl leading-tight"
                    style={{ fontFamily: 'var(--font-playfair, serif)' }}
                  >
                    {b.title.split(b.italicEm).reduce<React.ReactNode[]>(
                      (acc, part, idx) => {
                        if (idx === 0) return [part]
                        return [
                          ...acc,
                          <em
                            key={idx}
                            className="font-normal italic"
                            style={{ color: 'var(--module-active-700)' }}
                          >
                            {b.italicEm}
                          </em>,
                          part,
                        ]
                      },
                      []
                    )}
                  </h2>
                  {/* Hoofd-"bedrag" als romeins cijfer met highlight-marker — toont DNA */}
                  <p
                    className="leading-none mt-1 mb-1"
                    style={{ fontFamily: 'var(--font-playfair, serif)' }}
                  >
                    <span
                      className="font-black text-[28px] sm:text-[32px] tracking-[-0.02em] italic px-1"
                      style={{
                        backgroundImage:
                          'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
                      }}
                    >
                      {b.number}
                    </span>
                  </p>
                  {/* Description */}
                  <p
                    className="text-[13.5px] leading-snug text-[var(--ink-2)]"
                    style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                  >
                    {b.description}
                  </p>
                  {/* Meta italic */}
                  <p
                    className="mt-auto pt-2 italic text-[11.5px] text-[var(--ink-3)]"
                    style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                  >
                    bv. {b.routeExample}
                  </p>
                  {/* Open-link */}
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mt-1 group-hover:gap-2 transition-all">
                    Bekijk preview <ArrowUpRight className="w-3 h-3" />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* App-previews — aparte sectie voor app-specifieke blueprints */}
      <section className="py-2 sm:py-4">
        <div className="flex items-center justify-between border-b border-[var(--rule-soft)] pb-2 mb-5">
          <span className="text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--ink-3)]">
            App-previews
          </span>
          <span
            className="italic text-sm text-[var(--module-active-700)]"
            style={{ fontFamily: 'var(--font-playfair, serif)' }}
          >
            apps
          </span>
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 list-none">
          {BLUEPRINTS.filter((b) => b.group === 'app').map((b) => (
            <li
              key={b.type}
              style={{
                ...moduleStyle(b.module),
                background: 'var(--paper)',
                border: '1px solid var(--border-ed)',
              }}
              className="group transition-all hover:-translate-y-px hover:shadow-[0_2px_10px_rgba(26,25,22,.07)]"
            >
              <Link
                href={`/beheer/blueprints/${b.type}`}
                className="flex flex-col h-full text-left no-underline"
              >
                <div
                  aria-hidden
                  className="h-[3px] w-full"
                  style={{ background: 'var(--module-active-500)' }}
                />
                <div className="flex-1 p-4 sm:p-5 flex flex-col gap-2.5">
                  <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)]">
                    <span
                      aria-hidden
                      className="inline-block w-7 h-px"
                      style={{ background: 'var(--module-active-500)' }}
                    />
                    {b.kicker}
                  </div>
                  <h2
                    className="font-bold text-lg sm:text-xl leading-tight"
                    style={{ fontFamily: 'var(--font-playfair, serif)' }}
                  >
                    {b.title.split(b.italicEm).reduce<React.ReactNode[]>(
                      (acc, part, idx) => {
                        if (idx === 0) return [part]
                        return [
                          ...acc,
                          <em
                            key={idx}
                            className="font-normal italic"
                            style={{ color: 'var(--module-active-700)' }}
                          >
                            {b.italicEm}
                          </em>,
                          part,
                        ]
                      },
                      []
                    )}
                  </h2>
                  <p
                    className="leading-none mt-1 mb-1"
                    style={{ fontFamily: 'var(--font-playfair, serif)' }}
                  >
                    <span
                      className="font-black text-[22px] sm:text-[26px] tracking-[-0.02em] italic px-1"
                      style={{
                        backgroundImage:
                          'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
                      }}
                    >
                      {b.number}
                    </span>
                  </p>
                  <p
                    className="text-[13.5px] leading-snug text-[var(--ink-2)]"
                    style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                  >
                    {b.description}
                  </p>
                  <p
                    className="mt-auto pt-2 italic text-[11.5px] text-[var(--ink-3)]"
                    style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                  >
                    bv. {b.routeExample}
                  </p>
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mt-1 group-hover:gap-2 transition-all">
                    Bekijk preview <ArrowUpRight className="w-3 h-3" />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Double-rule divider */}
      <hr
        className="border-0 my-7"
        style={{
          borderTop: '4px double var(--ink)',
          borderBottom: '1px solid var(--ink)',
          height: '6px',
        }}
      />

      {/* Footer-notes — 4 kolommen */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-7 pb-6">
        <FooterNote
          title="Palet"
          body="FT-geïnspireerde tussenstap (#fbf2e7 / #fef9ef) — minder bruin dan FD-cream, niet zo roze als FT-pink. Alleen actief op deze showcase tot rollout."
        />
        <FooterNote
          title="Module-actief"
          body="Elke blueprint krijgt een eigen module-overide. Kicker-streep en italic-em volgen automatisch."
        />
        <FooterNote
          title="Highlight-marker"
          body="Halve gele streep (Horizon-200) markeert hoofduitkomst. Module-onafhankelijk — semantiek 'eindresultaat'."
        />
        <FooterNote
          title="Verwijderbaar"
          body="Hele /beheer/blueprints/ directory mag in één rm na goedkeuring. Geen externe verwijzingen."
        />
      </section>

      {/* Colophon */}
      <p className="text-center text-[10px] uppercase tracking-[0.25em] font-mono text-[var(--ink-3)] py-4">
        Trifinity{' '}
        <span style={{ color: 'var(--color-horizon-500)' }} className="mx-2">
          ✦
        </span>{' '}
        Plan-review{' '}
        <span style={{ color: 'var(--color-horizon-500)' }} className="mx-2">
          ✦
        </span>{' '}
        v0.1
      </p>
    </main>
  )
}

function FooterNote({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h4 className="text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)] font-semibold mb-2">
        {title}
      </h4>
      <p
        className="text-xs leading-relaxed text-[var(--ink-2)]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        {body}
      </p>
    </div>
  )
}
