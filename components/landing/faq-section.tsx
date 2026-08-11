'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Vraag } from './faq-data'

/**
 * FaqSection — generieke FAQ-accordeon voor de marketing-pagina's.
 * Krijgt per pagina haar eigen vragen-array (zie faq-data.ts) en bouwt
 * daar het JSON-LD FAQPage-schema uit, zodat elke pagina uitsluitend
 * haar eigen vragen in structured data voert.
 *
 * Bewust geen abstract icoon per vraag — alleen het ChevronDown-paneel
 * dat open/dicht klapt. Past bij de editorial krantenstijl.
 */

function FaqItem({ q, a, index }: Vraag & { index: number }) {
  const [open, setOpen] = useState(false)
  const answerId = `faq-answer-${index}`
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      aria-controls={answerId}
      className={`w-full rounded-[var(--r-lg)] border bg-[var(--paper)] p-5 text-left transition-all duration-200 hover:border-[var(--border-md)] ${
        open ? 'border-[var(--border-md)] shadow-[var(--s0)]' : 'border-[var(--border-ed)]'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="font-display text-base font-semibold leading-snug text-[var(--ink)]">
          {q}
        </p>
        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-meta)] transition-transform duration-300 ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </div>
      {/* Antwoord blijft altijd in de DOM (SEO); visueel verborgen via grid-rows-transitie
          en voor AT verborgen via aria-hidden wanneer dicht */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
        aria-hidden={!open}
      >
        <div className="overflow-hidden">
          <p
            id={answerId}
            className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-3 font-serif text-sm leading-relaxed text-[var(--ink-2)]"
          >
            {a}
          </p>
        </div>
      </div>
    </button>
  )
}

export function FaqSection({
  vragen,
  kicker = 'Wat we vaak gevraagd krijgen',
  titel = 'Vragen die er',
  italics = 'toe doen',
}: {
  vragen: Vraag[]
  kicker?: string
  titel?: string
  italics?: string
}) {
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: vragen.map((v) => ({
      '@type': 'Question',
      name: v.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: v.a,
      },
    })),
  }

  return (
    <>
      {/* Sectie-scheidingsregel */}
      <div className="flex items-center gap-4 px-6 py-8 md:px-12">
        <div className="h-px flex-1 bg-[var(--border-ed)]" />
        <span className="font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]">
          Veelgestelde vragen
        </span>
        <div className="h-px flex-1 bg-[var(--border-ed)]" />
      </div>

      <section id="faq" className="bg-[var(--subtle)] px-6 py-20 md:px-12 md:py-24">
        <div className="mx-auto max-w-3xl">
          <div className="mb-10 text-center">
            <p className="mb-4 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]">
              {kicker}
            </p>
            <h2 className="font-display text-[2rem] font-bold leading-tight tracking-[-0.02em] text-[var(--ink)] md:text-[2.6rem]">
              {titel}{' '}
              <em className="italic text-kern-600">{italics}</em>
            </h2>
          </div>

          <div className="space-y-3">
            {vragen.map((v, i) => (
              <FaqItem key={v.q} q={v.q} a={v.a} index={i} />
            ))}
          </div>
        </div>

        {/* FAQPage structured data (SEO) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      </section>
    </>
  )
}
