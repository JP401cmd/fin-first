'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * FAQ — accordion-stijl, 6 vragen met antwoorden uit het landing-plan v2
 * (productowner-beslissingen 31 mei 2026 verwerkt: bankkoppeling in
 * ontwikkeling, freemium met Pro, geen seeded account).
 *
 * Bewust geen abstract icoon per vraag — alleen het ChevronDown-paneel
 * dat open/dicht klapt. Past bij de editorial krantenstijl.
 */

interface Vraag {
  q: string
  a: string
}

const VRAGEN: Vraag[] = [
  {
    q: 'Kan ik mijn bankrekeningen koppelen?',
    a:
      'Bankkoppeling (PSD2) is in ontwikkeling. Voorlopig kun je transacties handmatig invoeren of als CSV-bestand importeren — alle gangbare NL-banken (ING, Rabobank, ABN AMRO, bunq, ASN, SNS, RegioBank, Knab, Triodos) worden ondersteund.',
  },
  {
    q: 'Werkt het voor ondernemers / BV-houders?',
    a:
      'Ja. Specialist-rekenhulpen voor BV-vraagstukken (agio storten vs. privé beleggen, dividend-uitkeer-strategie, lijfrente vs. ETF) zitten in de Pro-tier. Box 2 / box 3 / VPB-tarieven zijn modulair instelbaar.',
  },
  {
    q: 'Wat als ik geen partner heb?',
    a:
      'De app werkt volledig single-user. Huishouden-modus (privé / samen / partner-perspectief) is een Pro-feature voor wie de financiën met een partner deelt. Solo-gebruikers missen niets essentieels.',
  },
  {
    q: 'Hoe veilig is mijn data?',
    a:
      'EU-hosted op Supabase Frankfurt, versleuteld in rust en transport. Geen verkoop aan derden, geen marketing-pixels, geen advertentienetwerken. Ons businessmodel is jouw abonnement — niet jouw data.',
  },
  {
    q: 'Is dit financieel advies?',
    a:
      'Nee. TriFinity is een educatief reken-instrument, geen advies in de zin van de Wft. Geen koop- of verkoopaanbevelingen, geen productpromotie. Voor product-keuzes of fiscale planning blijft een erkend adviseur de aangewezen route.',
  },
  {
    q: 'Kan ik opzeggen?',
    a:
      'Ja, op elk moment. Bij opzegging download je al je data als JSON of CSV — geen vendor-lock-in. Wie nu start met Gratis houdt zijn account ook ná introductie van Pro gratis behouden, zolang als hij wil.',
  },
]

function FaqItem({ q, a }: Vraag) {
  const [open, setOpen] = useState(false)
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      className={`w-full rounded-[var(--r-lg)] border bg-[var(--paper)] p-5 text-left transition-all duration-200 hover:border-[var(--border-md)] ${
        open ? 'border-[var(--border-md)] shadow-[var(--s0)]' : 'border-[var(--border-ed)]'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="font-display text-base font-semibold leading-snug text-[var(--ink)]">
          {q}
        </p>
        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-4)] transition-transform duration-300 ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </div>
      {open && (
        <p className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-3 font-serif text-sm leading-relaxed text-[var(--ink-2)]">
          {a}
        </p>
      )}
    </button>
  )
}

export function Faq() {
  return (
    <>
      {/* Sectie-scheidingsregel */}
      <div className="flex items-center gap-4 px-6 py-8 md:px-12">
        <div className="h-px flex-1 bg-[var(--border-ed)]" />
        <span className="font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
          Veelgestelde vragen
        </span>
        <div className="h-px flex-1 bg-[var(--border-ed)]" />
      </div>

      <section id="faq" className="bg-[var(--subtle)] px-6 py-20 md:px-12 md:py-24">
        <div className="mx-auto max-w-3xl">
          <div className="mb-10 text-center">
            <p className="mb-4 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
              Wat we vaak gevraagd krijgen
            </p>
            <h2 className="font-display text-[2rem] font-bold leading-tight tracking-[-0.02em] text-[var(--ink)] md:text-[2.6rem]">
              Vragen die er{' '}
              <em className="italic text-kern-600">toe doen</em>
            </h2>
          </div>

          <div className="space-y-3">
            {VRAGEN.map((v) => (
              <FaqItem key={v.q} q={v.q} a={v.a} />
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
