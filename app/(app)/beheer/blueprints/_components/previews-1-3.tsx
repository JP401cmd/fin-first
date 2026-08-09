'use client'

import { ArrowUpRight, Wallet, PiggyBank, TrendingUp, Vault, Plus, Search, ArrowRight, Edit3, Trash2 } from 'lucide-react'
import {
  Kicker,
  EditorialHeadline,
  EditorialDeck,
  HighlightMark,
  SectionLabel,
  CardEditorial,
  FiguresStrip,
  Colophon,
} from './editorial'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

// ─────────────────────────────────────────────────────────────────
// Type 1 — Module-landing
// ─────────────────────────────────────────────────────────────────

export function LandingPreview() {
  return (
    <div className="space-y-6">
      {/* Module-accent-bar */}
      <div
        aria-hidden
        className="h-[3px] w-full -mt-6"
        style={{ background: 'var(--module-active-500)' }}
      />

      {/* Hero */}
      <header className="space-y-3">
        <Kicker>Netto vermogen</Kicker>
        <p
          className="font-mono tabular-nums text-[40px] sm:text-[56px] md:text-[64px] leading-none font-bold"
        >
          <HighlightMark>€ 287.450</HighlightMark>
        </p>
        <p
          className="italic text-[14px] sm:text-base text-[var(--ink-2)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          Nog 7 jaar, 3 maanden tot vrijheid · bijgewerkt om 14:23
        </p>
      </header>

      <EditorialDeck>
        Het vermogen is opgeslagen tijd. Hieronder zie je de categorieën waarin
        je tijd is geparkeerd — en wat ervan terugverdient.
      </EditorialDeck>

      <hr className="border-t border-[var(--border-ed)] my-6" />

      {/* Sectie A: Categorie-grid (mini-artikel-blueprint) */}
      <section>
        <SectionLabel num="i.">Bezittingen</SectionLabel>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 list-none">
          {[
            { icon: Wallet, label: 'Cash & spaargeld', amount: '€ 42.300', meta: '4 rekeningen' },
            { icon: PiggyBank, label: 'Pensioen', amount: '€ 89.150', meta: '2 polissen' },
            { icon: TrendingUp, label: 'Beleggingen', amount: '€ 156.000', meta: '12 holdings' },
            { icon: Vault, label: 'Eigen huis', amount: '€ 410.000', meta: '1 huis' },
          ].map((c) => {
            const Icon = c.icon
            return (
              <li key={c.label}>
                <CardEditorial accent>
                  <div className="p-4 sm:p-5 flex flex-col gap-2.5">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 shrink-0 text-[var(--module-active-700)]" aria-hidden />
                      <h3
                        className="font-bold text-base sm:text-lg leading-tight truncate"
                        style={{ fontFamily: PLAYFAIR }}
                      >
                        {c.label}
                      </h3>
                    </div>
                    <p className="font-mono tabular-nums text-[20px] sm:text-[22px] font-bold leading-none">
                      <HighlightMark>{c.amount}</HighlightMark>
                    </p>
                    <p
                      className="italic text-[11.5px] text-[var(--ink-3)] mt-auto"
                      style={{ fontFamily: SOURCE_SERIF }}
                    >
                      {c.meta}
                    </p>
                  </div>
                </CardEditorial>
              </li>
            )
          })}
        </ul>
      </section>

      <hr className="border-t border-[var(--border-ed)] my-6" />

      <Colophon text="Module Kern" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Type 2 — Categorie / list-pagina
// ─────────────────────────────────────────────────────────────────

export function ListPreview() {
  return (
    <div className="space-y-6">
      {/* Back-link */}
      <a
        href="#"
        onClick={(e) => e.preventDefault()}
        className="inline-block text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] hover:text-[var(--ink)]"
      >
        ← Terug naar Bezittingen
      </a>

      {/* Mini-hero */}
      <header className="space-y-3">
        <Kicker>Categorie · Cash &amp; spaargeld</Kicker>
        <h1
          className="font-bold text-[28px] sm:text-[36px] leading-tight tracking-[-0.02em]"
          style={{ fontFamily: PLAYFAIR }}
        >
          Cash &amp;{' '}
          <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
            spaargeld
          </em>
        </h1>
        {/* APP-7-opt-out: blueprint-preview — toont de primitive bewust in zijn
            volle vorm, ongeacht de weergavemodus van de beheerder. */}
        <FiguresStrip
          alwaysFull
          cols={2}
          figures={[
            { kicker: 'Totaal', amount: '€ 42.300', sub: 'incl. spaarrekening', variant: 'winner' },
            { kicker: 'Rekeningen', amount: '4', sub: 'waaronder 1 BIG-zaakaccount' },
          ]}
        />
      </header>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap py-3 border-b border-[var(--border-ed)]">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-[var(--ink-3)]" aria-hidden />
          <span className="text-[13px] italic text-[var(--ink-3)]" style={{ fontFamily: SOURCE_SERIF }}>
            Zoeken (verschijnt bij &gt;25 items)
          </span>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium uppercase tracking-[0.1em] font-mono"
          style={{
            background: 'var(--module-active-500)',
            color: 'var(--paper)',
          }}
        >
          <Plus className="w-3.5 h-3.5" aria-hidden /> Toevoegen
        </button>
      </div>

      {/* Cards-grid */}
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 list-none">
        {[
          { name: 'Spaarrekening', subtype: 'ASN Bank', amount: '€ 18.450', meta: '2,1% rente · maandelijks' },
          { name: 'Lopende rekening', subtype: 'Bunq', amount: '€ 4.230', meta: 'dagelijks gebruikt' },
          { name: 'Buffer-spaarpot', subtype: 'Bunq', amount: '€ 12.000', meta: '6 maanden lasten' },
          { name: 'Zakelijk', subtype: 'KNAB', amount: '€ 7.620', meta: 'BTW-reservering' },
        ].map((c) => (
          <li key={c.name}>
            <CardEditorial accent>
              <div className="p-4 sm:p-5 flex flex-col gap-2">
                <Kicker className="!mb-0">{c.subtype}</Kicker>
                <h3
                  className="font-bold text-lg leading-tight"
                  style={{ fontFamily: PLAYFAIR }}
                >
                  {c.name}
                </h3>
                <p className="font-mono tabular-nums text-[20px] font-bold leading-none">
                  <HighlightMark>{c.amount}</HighlightMark>
                </p>
                <p
                  className="italic text-[11.5px] text-[var(--ink-3)]"
                  style={{ fontFamily: SOURCE_SERIF }}
                >
                  {c.meta}
                </p>
              </div>
            </CardEditorial>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Type 3 — Detail-pagina
// ─────────────────────────────────────────────────────────────────

export function DetailPreview() {
  return (
    <div className="space-y-6">
      {/* Back-link */}
      <a
        href="#"
        onClick={(e) => e.preventDefault()}
        className="inline-block text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] hover:text-[var(--ink)]"
      >
        ← Terug naar Cash &amp; spaargeld
      </a>

      {/* Editorial header */}
      <header className="space-y-2">
        <Kicker>Spaarrekening · ASN Bank</Kicker>
        <h1
          className="font-bold text-[28px] sm:text-[40px] leading-tight tracking-[-0.02em]"
          style={{ fontFamily: PLAYFAIR }}
        >
          Spaarrekening{' '}
          <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
            ASN
          </em>
        </h1>
        <p className="font-mono tabular-nums text-[32px] sm:text-[40px] font-bold leading-none mt-2">
          <HighlightMark>€ 18.450,32</HighlightMark>
        </p>
        <p
          className="italic text-[12.5px] text-[var(--ink-3)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          IBAN NL12 ASNB 0123 4567 89 · Bijgewerkt om 09:14
        </p>
      </header>

      {/* Action-bar */}
      <div className="flex items-center gap-2 py-3 border-y border-[var(--border-ed)]">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium uppercase tracking-[0.1em] font-mono"
          style={{ background: 'var(--module-active-500)', color: 'var(--paper)' }}
        >
          <Edit3 className="w-3.5 h-3.5" aria-hidden /> Bewerken
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium uppercase tracking-[0.1em] font-mono border border-[var(--ink)] text-[var(--ink)]"
        >
          Herwaarderen
        </button>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] font-mono text-[var(--ink-3)]">
          <Trash2 className="w-3.5 h-3.5" aria-hidden /> Type-to-confirm
        </span>
      </div>

      {/* FiguresStrip met afgeleide KPI's */}
      {/* APP-7-opt-out: blueprint-preview (zie hierboven). */}
      <FiguresStrip
        alwaysFull
        figures={[
          { kicker: 'Rente', amount: '2,10%', sub: 'jaarlijks variabel' },
          { kicker: 'Dit jaar', amount: '+€ 387', sub: 'rente bijgeschreven', variant: 'positive' },
          { kicker: 'Maandelijks', amount: '€ 32', sub: 'gem. groei' },
          { kicker: 'Bestaat', amount: '4,2 jr', sub: 'sinds aug. 2022' },
        ]}
      />

      {/* Section: Eigendoms-info */}
      <section>
        <SectionLabel num="i.">Rekeninginformatie</SectionLabel>
        <dl className="border-t border-[var(--border-ed)]">
          {[
            ['Provider', 'ASN Bank N.V.'],
            ['Type', 'Spaarrekening — ASN Ideaalsparen'],
            ['Geopend', '12 augustus 2022'],
            ['Tenaamstelling', 'J. Smit'],
          ].map(([k, v]) => (
            <div
              key={k}
              className="flex justify-between items-baseline py-2 px-1 border-b border-dotted border-[var(--rule-soft)]"
            >
              <dt
                className="text-[13px] text-[var(--ink-2)]"
                style={{ fontFamily: SOURCE_SERIF }}
              >
                {k}
              </dt>
              <dd className="font-mono text-[13px] tabular-nums text-[var(--ink)]">
                {v}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Section: Transacties */}
      <section>
        <SectionLabel num="ii.">Recente transacties</SectionLabel>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.12em] font-mono text-[var(--ink-3)] border-b border-[var(--ink)]">
              <th className="text-left py-2 font-semibold">Datum</th>
              <th className="text-left py-2 font-semibold">Omschrijving</th>
              <th className="text-right py-2 font-semibold">Bedrag</th>
            </tr>
          </thead>
          <tbody style={{ fontFamily: SOURCE_SERIF }}>
            {[
              ['28 apr', 'Rente bijschrijving', '+€ 32,18', 'positive'],
              ['15 apr', 'Spaarstorting', '+€ 500,00', 'positive'],
              ['01 apr', 'Buffer-overboeking', '−€ 200,00', 'negative'],
              ['28 mrt', 'Rente bijschrijving', '+€ 31,84', 'positive'],
            ].map((r, idx) => (
              <tr key={idx} className="border-b border-dotted border-[var(--rule-soft)] hover:bg-[var(--subtle)]/50">
                <td className="py-2 text-[var(--ink-2)]">{r[0]}</td>
                <td className="py-2">{r[1]}</td>
                <td
                  className="py-2 text-right font-mono tabular-nums font-medium"
                  style={{ color: r[3] === 'positive' ? 'var(--positive)' : 'var(--negative)' }}
                >
                  {r[2]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
