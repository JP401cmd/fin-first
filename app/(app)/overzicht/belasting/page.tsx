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
import { computeBox1Tax } from '@/lib/box1-tax'
import { buildTaxOverview } from '@/lib/tax-overview'
import { getTaxDeadlines } from '@/lib/tax-calendar'
import { HubTotaleDruk } from '@/components/overview/belasting/hub-totale-druk'
import { HubVerdeling } from '@/components/overview/belasting/hub-verdeling'
import { HubKansen } from '@/components/overview/belasting/hub-kansen'
import { HubKalender } from '@/components/overview/belasting/hub-kalender'
import { HubStroom } from '@/components/overview/belasting/hub-stroom'
import { HubStelselradar } from '@/components/overview/belasting/hub-stelselradar'
import { Reveal } from '@/components/landing/reveal'
import {
  Kicker,
  EditorialHeadline,
  EditorialDeck,
  SectionLabel,
  ScenarioCallout,
} from '@/components/editorial'

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
  // Optimale partner-allocatie levert een Box 3-besparingssignaal voor C4 — in
  // household-view berekent loadPerspectiveBox3 dit als `savingsVsEqual`.
  let partnerAllocatieSavings = 0
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
      partnerAllocatieSavings = box3Data.optimalAllocation?.savingsVsEqual ?? 0
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

  // Dag-uitgaven voor de vrijheidstijd-omrekening (maandbudget / 30). Fallback
  // op €100/dag zodat de vrijheidstijd nooit door nul deelt.
  const monthlyExpenses = horizonData.effectiveInput?.monthlyExpenses ?? 0
  const dailyExpenses = monthlyExpenses > 0 ? monthlyExpenses / 30 : 100

  // Box 1-schatting: netto-maandinkomen ≈ bruto × (1 − marginaal_tarief),
  // dus bruto ≈ netto / (1 − marginaal). We leiden zo het bruto-jaarinkomen af
  // en voeden dat aan de pure Box 1-engine (`computeBox1Tax`) voor een
  // accuratere heffing dan een platte bruto × marginaal — voldoende voor de
  // KPI-tegel, niet voor aangifte.
  let box1Tax: number | null = null
  let grossYearly = 0
  const netMonthly = horizonData.effectiveInput?.monthlyIncome ?? 0
  const marg = horizonData.fireParams?.marginaalTarief ?? 0.3697
  if (netMonthly > 0 && marg > 0 && marg < 1) {
    grossYearly = (netMonthly * 12) / (1 - marg)
    const box1 = computeBox1Tax({ grossYearlyIncome: grossYearly, year: 2026, dailyExpenses })
    box1Tax = Math.round(box1.tax)
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

  // ── Hub-overzicht (C1/C2/C4/C7) ────────────────────────────────
  // Jaarruimte-besparing = onbenutte ruimte × marginaal tarief (lijfrente-
  // aftrek bespaart belasting tegen je marginale tarief).
  const jaarruimteSavings = jaarruimte.hasData && marg > 0
    ? Math.round(jaarruimte.jaarruimte * marg)
    : 0

  // Box 2 bewust BUITEN het totaal: we laden de echte Box 2-heffing niet op de
  // hub (per-persoon, vereist eigen berekening). Bij aanmerkelijk belang
  // annoteren we het totaal met "excl. Box 2".
  const overview = buildTaxOverview({
    box1Tax,
    box2Tax: null,
    box3Tax,
    grossYearlyIncome: grossYearly > 0 ? grossYearly : null,
    marginalRate: marg,
    dailyExpenses,
    jaarruimte:
      jaarruimte.hasData && jaarruimte.jaarruimte > 0
        ? { amount: jaarruimte.jaarruimte, savings: jaarruimteSavings }
        : null,
    partnerAllocatie:
      partnerAllocatieSavings > 0 ? { savings: partnerAllocatieSavings } : null,
  })

  // Fiscale kalender — runtime-klok als 'now' (server-component mag dat).
  const deadlines = getTaxDeadlines(new Date(), 2026)

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

      {/* ── Editorial masthead ─────────────────────────────────────────
          Kicker-eyebrow + redactionele deck zetten de toon: belasting als
          vierde hefboom, vertaald naar vrijheidstijd. */}
      <header className="relative mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-8">
        <PageInfoButton
          description={PAGE_INFO['/overzicht/belasting'] ?? ''}
          className="absolute right-4 top-6 sm:right-6 sm:top-8"
        />
        <Kicker size="large" className="pr-10">
          De vierde hefboom · Belasting {new Date().getFullYear()}
        </Kicker>
        <EditorialHeadline level="h1" size="lg" emphasis="vrijheid" className="mt-4 text-[var(--ink)]">
          Drie boxen, één rekening — betaald in vrijheid
        </EditorialHeadline>
        <div className="mt-4 max-w-[62ch]">
          <EditorialDeck>
            Wat de fiscus jaarlijks afroomt is óók vrijheidstijd. Drie boxen,
            één som — hieronder zie je waar de hefboom het zwaarst weegt en waar
            ruimte ligt om vrijheid terug te kopen.
          </EditorialDeck>
        </div>
      </header>

      {/* Drie box-kaarten — gedeelde viz, ongewijzigd gedrag. De kaart-header
          toont geen totaal meer; "excl. Box 2" staat in de Sectie I-callout. */}
      <div className="mx-auto max-w-6xl">
        <BelastingBoxCards cards={cards} />
      </div>

      {/* Hub-secties onder de box-kaarten: druk (C1) → verdeling (C2) →
          kansen (C4) → kalender (C5) → stroom (C7) → vooruitblik (C8).
          Royale verticale ritmiek; elke sectie reveal't bij binnenkomst. */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 pb-16 sm:pb-20">
        {/* I · De druk */}
        <Reveal className="pt-10 sm:pt-14">
          <SectionLabel num="I">De druk</SectionLabel>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-[var(--rule-soft)] border border-[var(--rule-soft)]">
            <HubTotaleDruk
              overview={overview}
              dailyExpenses={dailyExpenses}
              exclBox2={hasAanmerkelijkBelang}
              box3PerspectiveAware={box3PerspectiveAware}
            />
            <HubVerdeling overview={overview} />
          </div>
          {/* Perspectief-/eerlijkheidsannotatie als ScenarioCallout — vervangt
              de losse chip-strip + verzamelt de "indicatie, geen advies"-voetregel.
              De perspectief-chip (box3PerspectiveAware) blijft behouden: de chip
              zelf self-gate't in de eigen weergave, en deze callout-tekst legt uit
              wat het perspectief betekent. */}
          <div className="mt-5">
            {box3PerspectiveAware && (
              <div className="mb-3">
                <PerspectiveContextLabel />
              </div>
            )}
            <ScenarioCallout title="Indicatie, geen advies.">
              {box3PerspectiveAware
                ? ' Box 1 wordt per persoon berekend; Box 3 volgt je gekozen weergave. '
                : ' Een schatting op basis van je gegevens — geen aangifte. '}
              {hasAanmerkelijkBelang
                ? 'Box 2 (aanmerkelijk belang) staat buiten dit totaal.'
                : ''}
            </ScenarioCallout>
          </div>
        </Reveal>

        {/* II · De kansen */}
        {overview.opportunities.length > 0 && (
          <Reveal className="pt-12 sm:pt-16">
            <SectionLabel num="II">De kansen</SectionLabel>
            <HubKansen opportunities={overview.opportunities} />
          </Reveal>
        )}

        {/* III · De kalender */}
        {deadlines.length > 0 && (
          <Reveal className="pt-12 sm:pt-16">
            <SectionLabel num="III">De kalender</SectionLabel>
            <HubKalender deadlines={deadlines} />
          </Reveal>
        )}

        {/* IV · Bruto → netto (alleen wanneer Box 1 bekend is) */}
        {box1Tax != null && grossYearly > 0 && (
          <Reveal className="pt-12 sm:pt-16">
            <SectionLabel num="IV">Van bruto naar netto</SectionLabel>
            <HubStroom grossYearly={grossYearly} box1Tax={box1Tax} />
          </Reveal>
        )}

        {/* V · De vooruitblik (stelselradar, statisch educatief) */}
        <Reveal className="pt-12 sm:pt-16">
          <SectionLabel num="V">De vooruitblik</SectionLabel>
          <HubStelselradar />
        </Reveal>
      </div>
    </>
  )
}
