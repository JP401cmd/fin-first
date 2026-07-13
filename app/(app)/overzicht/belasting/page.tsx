import type { Metadata } from 'next'
import Link from 'next/link'
import { Sparkles, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import {
  BelastingBoxCards,
  type BelastingBoxCard,
} from '@/components/overview/belasting-box-cards'
import { computeJaarruimte, box1JaarruimteStatus, jaarruimteBesparing } from '@/lib/jaarruimte'
import { dailyExpenseRate } from '@/lib/format'
import { hasBox2Relevance } from '@/lib/box2-relevance'
import { computeBox3TaxableInput, box3TaxStatus } from '@/lib/box3-taxable-input'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PageStatusDot } from '@/components/app/page-status-dot'
import { PAGE_INFO } from '@/lib/page-info-content'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { loadPerspectiveBox3 } from '@/lib/household-tax'
import { PerspectiveContextLabel } from '@/components/app/perspective-context-label'
import { computeBox1Tax, deriveMarginaalTarief } from '@/lib/box1-tax'
import { buildTaxOverview } from '@/lib/tax-overview'
import { getTaxDeadlines } from '@/lib/tax-calendar'
import { HubTotaleDruk } from '@/components/overview/belasting/hub-totale-druk'
import { HubVerdeling } from '@/components/overview/belasting/hub-verdeling'
import { HubKansen } from '@/components/overview/belasting/hub-kansen'
import { HubKalender } from '@/components/overview/belasting/hub-kalender'
import { HubStroom } from '@/components/overview/belasting/hub-stroom'
import { HubStelselradar } from '@/components/overview/belasting/hub-stelselradar'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { Reveal } from '@/components/landing/reveal'
import {
  SectionLabel,
  ScenarioCallout,
  OrnamentColophon,
  PageOpening,
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

  // Huishoudtype voor de Box 3-statushelper: exact dezelfde bron (rauwe
  // profiles.household_type, vocabulaire 'solo'|'samen'|'gezin') die de sidebar-
  // layout aan computeLeverScores/box3TaxStatus voert, zodat de partner-detectie
  // — en dus de Box 3-status — 1-op-1 matcht met de sidebar-dot.
  const householdTypeRes = user
    ? await supabase.from('profiles').select('household_type').eq('id', user.id).maybeSingle()
    : null
  const householdType =
    (householdTypeRes?.data?.household_type as string | undefined) ?? undefined

  // Dag-uitgaven voor de vrijheidstijd-omrekening (canonieke jaar/365-dagbasis
  // via dailyExpenseRate). Fallback op €100/dag zodat de vrijheidstijd nooit
  // door nul deelt.
  const monthlyExpenses = horizonData.effectiveInput?.monthlyExpenses ?? 0
  const dailyExpenses = monthlyExpenses > 0 ? dailyExpenseRate(monthlyExpenses) : 100

  // Box 1-schatting: netto-maandinkomen ≈ bruto × (1 − marginaal_tarief),
  // dus bruto ≈ netto / (1 − marginaal). We leiden zo het bruto-jaarinkomen af
  // en voeden dat aan de pure Box 1-engine (`computeBox1Tax`) voor een
  // accuratere heffing dan een platte bruto × marginaal — voldoende voor de
  // KPI-tegel, niet voor aangifte.
  // Box 1-status + bruto jaarinkomen via de gedeelde helper (box1JaarruimteStatus)
  // — dezelfde bron die de sidebar-Box-1-dot in app/(app)/layout.tsx leest, zodat
  // kaart-status == sidebar-status. De helper leidt grossYearly af uit
  // netto-maandinkomen / (1 − marginaal); we hergebruiken die grossYearly voor de
  // KPI-heffing (computeBox1Tax) zodat er geen tweede afleiding ontstaat.
  const netMonthly = horizonData.effectiveInput?.monthlyIncome ?? 0
  const marg = horizonData.fireParams?.marginaalTarief ?? deriveMarginaalTarief()
  const { status: box1Status, grossYearly } = box1JaarruimteStatus({
    netMonthly,
    marginaalTarief: marg,
  })
  let box1Tax: number | null = null
  if (grossYearly > 0) {
    const box1 = computeBox1Tax({ grossYearlyIncome: grossYearly, year: 2026, dailyExpenses })
    box1Tax = Math.round(box1.tax)
  }

  // Jaarruimte-detail voor de hub-secties hieronder (besparing C4). Factor A
  // (werkgeverspensioen-aangroei) wordt afgetrokken via dezelfde canonieke bron
  // als de box1-deeppage en de aandachtspunten-tip: `horizonData.pensioenFactorA`
  // (resolvePensionFactorA → 0 bij onbekend, het echte UPO/geschatte getal bij
  // bekend), en de bespaar-FORMULE is de gedeelde `jaarruimteBesparing`-helper.
  // LET OP — de bruto-GRONDSLAG divergeert bewust: de hub deelt zijn grossYearly
  // met de sidebar-Box-1-dot (box1JaarruimteStatus: netto/(1−marg), sync, geen
  // DB-read), terwijl de box1-deeppage en de optimizer `resolveBox1GrossIncome`
  // gebruiken (grossFromNet-schijfinversie + handmatige override). Bekende,
  // gedocumenteerde divergentie (lib/uat/acceptance/belast.ts, WF-BELAST-01);
  // harmonisatie = open follow-up.
  const jaarruimte = computeJaarruimte(grossYearly, horizonData.pensioenFactorA)
  const box1StatusText = !jaarruimte.hasData
    ? 'Inkomen onbekend'
    : jaarruimte.jaarruimte > 0
      ? 'Onbenutte jaarruimte'
      : 'Ruimte benut'

  // Box 3-status uit de canonieke tax-lever-bron (box3-taxable-input.ts) —
  // dezelfde helper die de sidebar-Box-3-dot voedt, zodat kaart == sidebar.
  // De vorige bron (gezondheids-pillar 'tax_optimization') is verwijderd in
  // ADR 0010 → die find() gaf altijd undefined → status ALTIJD 'neutral'. Nu
  // toont de kaart een echt signaal: box3-belast vermogen boven de vrijstelling.
  const box3TaxableInput = computeBox3TaxableInput(
    horizonData.assets,
    horizonData.debts,
    householdType,
  )
  const box3Status = box3TaxStatus(box3TaxableInput)
  const box3StatusText =
    box3Status === 'good'
      ? 'Geen actie nodig'
      : box3Status === 'warn'
        ? 'Optimaliseer Box 3'
        : box3Status === 'bad'
          ? 'Box 3-actie nodig'
          : null

  // ── Hub-overzicht (C1/C2/C4/C7) ────────────────────────────────
  // Jaarruimte-besparing = marginaal-correct Box 1-belastingverschil van de
  // volledige inleg (schijfovergangen + heffingskorting-afbouw), via de gedeelde
  // `jaarruimteBesparing`-helper (ADR 0040/0041) — niet de vlakke ruimte × marginaal.
  const jaarruimteSavings = jaarruimte.hasData
    ? jaarruimteBesparing(grossYearly, jaarruimte.jaarruimte, 2026)
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

      {/* ── Editorial pagina-opening (standaard-aanhef) ────────────────
          Canonieke PageOpening: hairline-kicker → narratieve Playfair-H1 met
          één <em>-accent → deck. De belasting-layout mapt --module-active op
          ink (neutraal), dus de accenttokens renderen bewust neutraal. */}
      <div className="relative mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-8">
        <PageStatusDot className="absolute right-[52px] top-6 sm:right-[60px] sm:top-8" />
        <PageInfoButton
          description={PAGE_INFO['/overzicht/belasting'] ?? ''}
          className="absolute right-4 top-6 sm:right-6 sm:top-8"
        />
        <PageOpening
          className="pr-20 sm:pr-24"
          kicker={`De vierde hefboom · Belasting ${new Date().getFullYear()}`}
          titleBefore="Drie boxen, één rekening — betaald in "
          emphasis="vrijheid"
          titleAfter=""
          deck="Wat de fiscus jaarlijks afroomt is óók vrijheidstijd. Drie boxen, één som — hieronder zie je waar de hefboom het zwaarst weegt en waar ruimte ligt om vrijheid terug te kopen."
        />
      </div>

      {/* Drie box-kaarten — gedeelde viz, ongewijzigd gedrag. De kaart-header
          toont geen totaal meer; "excl. Box 2" staat in de Sectie I-callout. */}
      <div className="mx-auto max-w-6xl">
        <BelastingBoxCards cards={cards} />
      </div>

      {/* Vierde hub-kaart — de fiscale optimizer. Bewust GÉÉN "Box N": een
          doel-gedreven Compare-oppervlak bovenop de boxen. Box 3-teal tegel om
          de MVP-as te duiden. */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-3">
        <Link
          href="/overzicht/belasting/optimizer"
          className="group flex items-center gap-4 rounded-2xl border border-[var(--ink)] bg-[var(--paper)] p-4 sm:p-5 transition-colors hover:bg-[var(--subtle)]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-box3-50)]">
            <Sparkles className="h-5 w-5 text-[var(--color-box3-700)]" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-base font-semibold text-[var(--ink)]">Fiscale optimizer</span>
              <span className="rounded-full border border-[var(--rule-soft)] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] font-mono text-[var(--ink-3)]">
                nieuw
              </span>
            </span>
            <span className="mt-0.5 block text-sm leading-snug text-[var(--ink-2)]">
              Kies een fiscaal doel en vergelijk doorgerekende Box 3-scenario’s — in euro’s en vrijheidsdagen.
            </span>
          </span>
          <ArrowRight
            className="h-5 w-5 shrink-0 text-[var(--ink-3)] transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
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
          <HideInSimple>
            <Reveal className="pt-12 sm:pt-16">
              <SectionLabel num="III">De kalender</SectionLabel>
              <HubKalender deadlines={deadlines} />
            </Reveal>
          </HideInSimple>
        )}

        {/* IV · Bruto → netto (alleen wanneer Box 1 bekend is) */}
        {box1Tax != null && grossYearly > 0 && (
          <HideInSimple>
            <Reveal className="pt-12 sm:pt-16">
              <SectionLabel num="IV">Van bruto naar netto</SectionLabel>
              <HubStroom grossYearly={grossYearly} box1Tax={box1Tax} />
            </Reveal>
          </HideInSimple>
        )}

        {/* V · De vooruitblik (stelselradar, statisch educatief) */}
        <HideInSimple>
          <Reveal className="pt-12 sm:pt-16">
            <SectionLabel num="V">De vooruitblik</SectionLabel>
            <HubStelselradar />
          </Reveal>
        </HideInSimple>

        {/* Krant-stijl colophon als hub-afsluiter. */}
        <div className="pt-10 sm:pt-14">
          <OrnamentColophon text="Drie boxen, één rekening" module="Belasting" />
        </div>
      </div>
    </>
  )
}
