import type { Metadata } from 'next'
import Link from 'next/link'
import { Building2, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { Box2Detail } from '@/components/overview/box2-detail'
import { BelastingBoxPageHeader } from '@/components/overview/belasting-box-page-header'
import { hasBox2Relevance } from '@/lib/box2-relevance'

export const metadata: Metadata = {
  title: 'Box 2 · Aanmerkelijk belang — TriFinity',
  description: 'Belasting over aanmerkelijk belang (DGA / grootaandeelhouder ≥ 5%).',
}

/**
 * /overzicht/belasting/box2 — Box 2-subpagina (aanmerkelijk belang).
 *
 * Box 2 is alleen relevant voor wie ≥5% van de aandelen in een
 * vennootschap bezit. We detecteren server-side of er een deelneming-asset
 * is: zo ja → de volledige Box2Detail-berekening; zo nee → een rustige
 * empty-state die uitlegt wanneer Box 2 speelt (geen lege rekenkaart voor
 * de ~99% niet-DGA's).
 */
export default async function BelastingBox2Page() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Detecteer Box 2-relevantie met dezelfde breedte als de Box 2-engine
  // (deelneming / DGA-vordering / DGA-schuld) zodat een DGA met excessief-
  // lenen-positie de échte berekening krijgt i.p.v. de empty-state.
  const hasAanmerkelijkBelang = user ? await hasBox2Relevance(supabase, user.id) : false

  return (
    <>
      <NavStackMeta title="Box 2" bottomBar={{ kind: 'tabs' }} />
      <BelastingBoxPageHeader
        number="2"
        title="Aanmerkelijk belang"
        subtitle="Bezit je 5% of meer van de aandelen in een vennootschap (bijvoorbeeld een eigen BV)? Dan worden dividend en vervreemdingswinst in Box 2 belast."
        infoKey="/overzicht/belasting/box2"
      />
      {hasAanmerkelijkBelang ? <Box2Detail year={2026} /> : <Box2EmptyState />}
    </>
  )
}

/** Rustige empty-state voor gebruikers zonder deelneming-asset. */
function Box2EmptyState() {
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-8">
      <div className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-6 sm:p-8 text-center">
        <span className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-violet-50 text-violet-700">
          <Building2 className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 className="font-serif text-lg text-[var(--ink)]">Geen aanmerkelijk belang gevonden</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--ink-2)] leading-relaxed">
          Box 2 geldt voor directeur-grootaandeelhouders en houders van ≥ 5% van
          de aandelen in een vennootschap. Heb je een eigen BV of een
          deelneming? Voeg die toe als bezitting, dan rekent TriFinity je Box
          2-belasting automatisch uit.
        </p>
        <Link
          href="/overzicht/bezittingen"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-violet-700 hover:text-violet-800 transition-colors"
        >
          Beheer je bezittingen
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}
