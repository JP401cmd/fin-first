import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import {
  BelastingBoxCards,
  type BelastingBoxCard,
  type BelastingBoxStatus,
} from '@/components/overview/belasting-box-cards'
import { computeJaarruimte } from '@/lib/jaarruimte'
import { hasBox2Relevance } from '@/lib/box2-relevance'
import { pillarStatus } from '@/lib/leverage-status'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PAGE_INFO } from '@/lib/page-info-content'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { loadPerspectiveBox3 } from '@/lib/household-tax'
import { PerspectiveContextLabel } from '@/components/app/perspective-context-label'

export const metadata: Metadata = {
  title: 'Belasting — TriFinity',
  description: 'Box 1, Box 2 en Box 3 — de hefboom belasting.',
}

/**
 * /overzicht/belasting — vierde hefboom-verdieping, nu als **landing/hub**.
 *
 * De pagina toont drie klikbare box-kaarten in hefbomen-stijl (icoon +
 * status + KPI), elk doorlinkend naar de eigen box-subpagina:
 *  - /overzicht/belasting/box1 — Werk + woning (jaarruimte-actie)
 *  - /overzicht/belasting/box2 — Aanmerkelijk belang (DGA)
 *  - /overzicht/belasting/box3 — Sparen + beleggen (forfaitair rendement)
 *
 * Status per kaart wordt server-side bepaald:
 *  - Box 1: onbenutte jaarruimte = kans (amber) / benut (groen) / onbekend
 *  - Box 2: aanwezigheid van een deelneming-asset
 *  - Box 3: de tax_optimization-pillar uit de gezondheidsscore
 *
 * Box-data bronnen (KPI's):
 *  - Box 3: horizonData.healthScoreInput.taxData.box3Tax (forfaitaire berekening)
 *  - Box 1: schatting via netto-inkomen × marginaal-tarief
 *  - Box 2: KPI leeg (geen deelnemingen-berekening op de landing) — de
 *    box2-subpagina rekent het echte bedrag uit via /api/household/box2
 */
export default async function OverzichtBelastingPage() {
  const supabase = await createClient()
  const perspective = await getServerPerspective()
  const horizonData = await loadHorizonData(supabase)

  // Box 3 is de ÉNIGE box die we op de hub perspectief-bewust kunnen tonen:
  // NL-belasting is per-persoon, maar fiscaal partners verdelen Box 3-vermogen,
  // dus een huishoud-/partner-totaal is fiscaal zinvol. We hergebruiken exact de
  // loader van de Box 3-subpagina (`loadPerspectiveBox3` → `loadPerspectiveData`
  // → ONGEWIJZIGDE `calculateBox3`). Box 1 (jaarruimte) en Box 2 blijven
  // per-persoon — de deep box1-pagina toont zelf al een 2-koloms huishoudbeeld.
  let box3Tax = horizonData.healthScoreInput.taxData?.box3Tax ?? null
  let box3PerspectiveAware = false
  if (perspective !== 'personal') {
    try {
      const box3Data = await loadPerspectiveBox3(supabase, perspective, 2026)
      // household → gecombineerd huishoud-totaal; partner → partner-resultaat
      // (loadPerspectiveBox3 zet `personal` in partner-view op het partner-
      // resultaat). Bij graceful degradation (partner deelt geen vermogen) is
      // `combined` undefined → val terug op het eigen Box 3-bedrag.
      const perspectiveTax =
        perspective === 'household'
          ? box3Data.combined?.tax ?? null
          : box3Data.personal.tax
      if (perspectiveTax != null) {
        box3Tax = perspectiveTax
        box3PerspectiveAware = !(perspective === 'household' && box3Data.combined == null)
      }
    } catch {
      // Perspectief-laden faalt (geen huishouden / RLS) → behoud eigen Box 3.
    }
  }

  // Aanmerkelijk belang (Box 2): relevant zodra de gebruiker een deelneming,
  // DGA-vordering óf DGA-schuld heeft — dezelfde detectie-breedte als de Box 2-
  // engine (lib/box2-relevance.ts), zodat de status klopt voor de ~99%
  // niet-DGA's én een DGA met excessief-lenen-positie niet ten onrechte als
  // "geen aanmerkelijk belang" verschijnt.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const hasAanmerkelijkBelang = user ? await hasBox2Relevance(supabase, user.id) : false

  // Box 1-schatting: netto-maandinkomen ≈ bruto × (1 − marginaal_tarief),
  // dus bruto ≈ netto / (1 − marginaal). Box 1-druk ≈ bruto × marginaal.
  // Versimpelde benadering — voldoende voor de KPI-tegel, niet voor aangifte.
  let box1Tax: number | null = null
  let grossYearly = 0
  const netMonthly = horizonData.effectiveInput?.monthlyIncome ?? 0
  const marg = horizonData.fireParams?.marginaalTarief ?? 0.3697
  if (netMonthly > 0 && marg > 0 && marg < 1) {
    grossYearly = (netMonthly * 12) / (1 - marg)
    box1Tax = Math.round(grossYearly * marg)
  }

  // Box 1-status uit onbenutte jaarruimte: een onbenutte ruimte is een
  // belastingbesparingskans → amber ("aandacht"); volledig benut → groen.
  const jaarruimte = computeJaarruimte(grossYearly, 0)
  const box1Status: BelastingBoxStatus = !jaarruimte.hasData
    ? 'neutral'
    : jaarruimte.jaarruimte > 0
      ? 'warn'
      : 'good'
  const box1StatusText = !jaarruimte.hasData
    ? 'Inkomen onbekend'
    : jaarruimte.jaarruimte > 0
      ? 'Onbenutte jaarruimte'
      : 'Ruimte benut'

  // Box 3-status uit de tax_optimization-pillar (gedeeld met de hefbomen-rij).
  const taxPillar = horizonData.healthScore?.pillars.find((p) => p.id === 'tax_optimization')
  const box3Status = pillarStatus(taxPillar?.score)
  const box3StatusText =
    box3Status === 'good'
      ? 'Geen actie nodig'
      : box3Status === 'warn'
        ? 'Optimaliseer Box 3'
        : box3Status === 'bad'
          ? 'Box 3-actie nodig'
          : null

  const cards: BelastingBoxCard[] = [
    {
      number: '1',
      label: 'Werk + woning',
      href: '/overzicht/belasting/box1',
      tax: box1Tax,
      status: box1Status,
      statusText: box1StatusText,
      subtitle: 'Loon, ondernemerswinst en eigen huis.',
    },
    {
      number: '2',
      label: 'Aanmerkelijk belang',
      href: '/overzicht/belasting/box2',
      tax: null,
      status: 'neutral',
      statusText: hasAanmerkelijkBelang ? 'Aanmerkelijk belang' : 'Geen aanmerkelijk belang',
      subtitle: 'DGA / aandeelhouder ≥ 5%.',
    },
    {
      number: '3',
      label: 'Sparen + beleggen',
      href: '/overzicht/belasting/box3',
      tax: box3Tax,
      status: box3Status,
      statusText: box3StatusText,
      subtitle: 'Cash, beleggingen en crypto — forfaitair.',
    },
  ]

  return (
    <>
      <NavStackMeta title="Belasting" bottomBar={{ kind: 'tabs' }} />
      <div className="relative mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        {/* Perspectief-chip ALLEEN tonen wanneer minstens de Box 3-tegel het
            perspectief weerspiegelt — anders zou de chip suggereren dat ook de
            per-persoon-boxen (1 & 2) huishoud-cijfers tonen, wat misleidend is. */}
        {box3PerspectiveAware && (
          <div className="mb-2">
            <PerspectiveContextLabel />
          </div>
        )}
        <PageInfoButton
          description={PAGE_INFO['/overzicht/belasting'] ?? ''}
          className="absolute right-4 top-4 sm:right-6"
        />
      </div>
      <BelastingBoxCards
        cards={cards}
        totalNote={hasAanmerkelijkBelang ? 'excl. Box 2' : undefined}
      />
    </>
  )
}
