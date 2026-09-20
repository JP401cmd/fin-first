import type { Metadata } from 'next'
import Link from 'next/link'
import { Building2, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { Box2Detail } from '@/components/overview/box2-detail'
import { BelastingBoxPageHeader } from '@/components/overview/belasting-box-page-header'
import { loadBox2Materiality } from '@/lib/box2-relevance'
// CURRENT_TAX_YEAR en niet een los 2026: de hub en de page-status-keten
// gebruiken die constante al, en een tweede geschreven jaartal drijft weg zodra
// het belastingjaar verspringt.
import { CURRENT_TAX_YEAR } from '@/lib/box3-data'
import type { LeverageStatus } from '@/lib/leverage-status'

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
  //
  // `loadBox2Materiality` i.p.v. `hasBox2Relevance`: dezelfde detectie-breedte
  // (`relevant`), maar hij draait óók de canonieke `calculateBox2` en zegt
  // daarmee of er dáádwerkelijk heffing is (`material`) — het oordeel dat de
  // paginatitel uitspreekt. Eén loader i.p.v. twee; het is dezelfde bron als de
  // Box 2-statusbanner (bevinding L8), dus banner en titel kunnen niet
  // uiteenlopen.
  const box2 = user
    ? await loadBox2Materiality(supabase, user.id, CURRENT_TAX_YEAR)
    : { relevant: false, material: false }
  const hasAanmerkelijkBelang = box2.relevant

  // BEWUST GEEN BEDRAG IN DE TITEL. `loadBox2Materiality` is user-scoped (eigen
  // rijen), terwijl `Box2Detail` hieronder in huishoud-weergave het
  // gecombineerde bedrag toont — een euro in de kop zou daar de grondslag van
  // het blok eronder tegenspreken. Het oordeel is daarom de materialiteit:
  // oranje zodra er heffing is, verder neutraal. Het bedrag (met
  // vrijheidsdagen) staat in `Box2Detail` zelf.
  const [box2Verdict, box2Tone]: [string, LeverageStatus] = !box2.relevant
    ? ['Niet van toepassing', 'neutral']
    : box2.material
      ? ['Heffing over je belang', 'warn']
      : ['Geen heffing dit jaar', 'neutral']

  return (
    <>
      <NavStackMeta title="Box 2" bottomBar={{ kind: 'tabs' }} />
      <BelastingBoxPageHeader
        route="/overzicht/belasting/box2"
        verdict={box2Verdict}
        tone={box2Tone}
        deck="Belasting over een aanmerkelijk belang van 5% of meer. Het oordeel volgt de heffing over dividend en DGA-leningen."
      />
      {hasAanmerkelijkBelang ? <Box2Detail year={2026} /> : <Box2EmptyState />}
    </>
  )
}

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'

/** Rustige empty-state voor gebruikers zonder deelneming-asset.
 *  Scherpe hoeken conform het editorial design-systeem (geen rounded-2xl/full). */
function Box2EmptyState() {
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-8">
      <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-6 sm:p-8 text-center">
        {/* Icoon-wrapper: scherp vierkant, box-accent via de actieve module-kleur (violet op de Box 2-pagina). */}
        <span
          className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center"
          style={{
            background: 'color-mix(in srgb, var(--module-active-500) 10%, transparent)',
            color: 'var(--module-active-700)',
          }}
        >
          <Building2 className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2
          className="text-lg font-black tracking-[-0.01em] text-[var(--ink)]"
          style={{ fontFamily: PLAYFAIR }}
        >
          Geen aanmerkelijk belang gevonden
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--ink-2)] leading-relaxed">
          Box 2 geldt voor directeur-grootaandeelhouders en houders van ≥ 5% van
          de aandelen in een vennootschap. Heb je een eigen BV of een
          deelneming? Voeg die toe als bezitting, dan rekent TriFinity je Box
          2-belasting automatisch uit.
        </p>
        <Link
          href="/overzicht/bezittingen"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold transition-colors"
          style={{ color: 'var(--module-active-700)' }}
        >
          Beheer je bezittingen
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}
