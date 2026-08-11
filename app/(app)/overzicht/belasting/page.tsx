import type { Metadata } from 'next'
import Link from 'next/link'
import { Sparkles, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import {
  BelastingBoxCards,
  type BelastingBoxCard,
} from '@/components/overview/belasting-box-cards'
import { buildBelastingBoxCards } from './box-cards'
import { hasBox2Relevance } from '@/lib/box2-relevance'
import { computeBox3TaxableInput, box3TaxStatus } from '@/lib/box3-taxable-input'
import { CURRENT_TAX_YEAR } from '@/lib/box3-data'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PageStatusDot } from '@/components/app/page-status-dot'
import { PAGE_INFO } from '@/lib/page-info-content'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { PerspectiveContextLabel } from '@/components/app/perspective-context-label'
import { deriveMarginaalTarief } from '@/lib/box1-tax'
import { buildTaxOverview } from '@/lib/tax-overview'
import { loadFiscaleKansen, type FiscaleKansen } from '@/lib/tax-opportunities-loader'
import type { LeverageStatus } from '@/lib/leverage-status'
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
 * De pagina toont klikbare box-kaarten in hefbomen-stijl (icoon + status +
 * KPI), elk doorlinkend naar de eigen box-subpagina:
 *  - /overzicht/belasting/box1 — Werk + woning (jaarruimte-actie)
 *  - /overzicht/belasting/box2 — Aanmerkelijk belang (DGA), ALLEEN bij
 *    aanmerkelijk belang (BEL-1); de route blijft altijd bereikbaar
 *  - /overzicht/belasting/box3 — Sparen + beleggen (forfaitair rendement)
 *
 * Welke kaarten er staan bepaalt `buildBelastingBoxCards` (./box-cards.ts) —
 * een pure functie, zodat die regel testbaar is zonder deze loader-pagina.
 *
 * Status per kaart wordt server-side bepaald:
 *  - Box 1: onbenutte jaarruimte = kans (amber) / benut (groen) / onbekend
 *  - Box 2: neutraal (de hub rekent Box 2 bewust niet door)
 *  - Box 3: de tax_optimization-pillar uit de gezondheidsscore
 *
 * Box-data bronnen (KPI's):
 *  - Box 3: horizonData.box3Tax (canonieke calculateBox3, personal) — household/
 *    partner via loadPerspectiveBox3 (combined/partner)
 *  - Box 1: schatting via netto-inkomen × marginaal-tarief
 *  - Box 2: KPI leeg (geen deelnemingen-berekening op de landing) — de
 *    box2-subpagina rekent het echte bedrag uit via /api/household/box2
 */
export default async function OverzichtBelastingPage() {
  const supabase = await createClient()
  const perspective = await getServerPerspective()

  // ── Fiscale kansen + Box 1/Box 3-grondslag (ÉÉN loader) ────────
  // `loadFiscaleKansen` is de enige samensteller van fiscale kansen (ADR 0086):
  // dezelfde uitkomst voedt de optimizer-pagina, deze hub en de aandachtspunten.
  // Hij levert hier drie dingen: de kansenlijst (sectie II), de canonieke Box 1-
  // grondslag (bruto → heffing + jaarruimte) en de perspectief-correcte Box 3-
  // heffing.
  //
  // LET OP — deze catch dekt MEER dan de vroegere try/catch rond
  // `loadPerspectiveBox3`. Box 1 kwam voorheen uit de sync `box1JaarruimteStatus`
  // en kon niet falen; nu hangt die tak aan dezelfde bron. Faalt de loader, dan
  // verdwijnt niet alleen de kansen-sectie: `box1Tax` wordt null, waardoor de
  // "totale druk" alléén Box 3 telt, en de Box 1-kaart valt terug op
  // "Inkomen onbekend". Daarom loggen we de fout server-side met een grep-bare
  // tag i.p.v. 'm stil te slikken — een te laag totaal zonder spoor is erger dan
  // een ontbrekende sectie.
  //
  // De drie onafhankelijke bronnen draaien PARALLEL. Dat is hier geen
  // micro-optimalisatie: de kansen-loader trekt de canonieke Box 1-bron
  // (resolveBox1GrossIncome → loadCashflowSettingsData → loadCoreData) die deze
  // hub voorheen niet raakte. Serieel zou dat een tweede zware wachtblok
  // achter de horizon-bundel plakken; parallel valt het grotendeels in
  // dezelfde tijdsloot (de gedeelde fetchers in lib/server-data/base.ts en
  // loadCoreData zijn `cache()`-gewrapt, dus overlappende tabellen worden
  // binnen deze render sowieso één keer gehaald).
  const [horizonData, kansen, user] = await Promise.all([
    loadHorizonData(supabase),
    loadFiscaleKansen(supabase, perspective, CURRENT_TAX_YEAR).catch(
      (err): FiscaleKansen | null => {
        console.error('belasting-hub:kansen', err)
        return null
      },
    ),
    // Gedeelde, request-gecachte auth-roundtrip (dezelfde die de kansen-loader
    // en de overige loaders gebruiken) i.p.v. een eigen `auth.getUser()`.
    getCachedUser(supabase),
  ])

  // Box 3 is de ÉNIGE box die we op de hub perspectief-bewust kunnen tonen:
  // NL-belasting is per-persoon, maar fiscaal partners verdelen Box 3-vermogen,
  // dus een huishoud-/partner-totaal is fiscaal zinvol. Box 1 (jaarruimte) en
  // Box 2 blijven per-persoon — de deep box1-pagina toont zelf al een 2-koloms
  // huishoudbeeld.
  // Personal: de CANONIEKE calculateBox3-heffing uit de loader-bundel
  // (horizonData.box3Tax) — dezelfde motor als de Box 3-subpagina. NIET de
  // healthScoreInput.taxData-proxy (buildTaxData), die schulden negeerde (incl. de
  // eigenwoninghypotheek → Box 1) en zo een positieve KPI toonde náást een "geen
  // belasting"-kaartstatus. Household/partner overschrijft met de perspectief-
  // heffing uit de kansen-loader (dezelfde `loadPerspectiveBox3` als voorheen);
  // bij graceful degradation (partner deelt geen vermogen) is die null → val
  // terug op het eigen Box 3-bedrag.
  const perspectiveTax = perspective !== 'personal' ? kansen?.box3PerspectiveTax ?? null : null
  const box3Tax: number | null = perspectiveTax ?? horizonData.box3Tax
  const box3PerspectiveAware = perspectiveTax != null

  // Twee user-gebonden vervolgvragen, óók parallel:
  //  · Aanmerkelijk belang (Box 2): relevant zodra de gebruiker een deelneming,
  //    DGA-vordering óf DGA-schuld heeft — dezelfde detectie-breedte als de
  //    Box 2-engine (lib/box2-relevance.ts), zodat de status klopt voor de ~99%
  //    niet-DGA's én een DGA met excessief-lenen-positie niet ten onrechte als
  //    "geen aanmerkelijk belang" verschijnt.
  //  · Huishoudtype voor de Box 3-statushelper: exact dezelfde bron (rauwe
  //    profiles.household_type, vocabulaire 'solo'|'samen'|'gezin') die de
  //    sidebar-layout aan computeLeverScores/box3TaxStatus voert, zodat de
  //    partner-detectie — en dus de Box 3-status — 1-op-1 matcht met de dot.
  const [hasAanmerkelijkBelang, householdTypeRes] = await Promise.all([
    user ? hasBox2Relevance(supabase, user.id) : Promise.resolve(false),
    user
      ? supabase.from('profiles').select('household_type').eq('id', user.id).maybeSingle()
      : Promise.resolve(null),
  ])
  const householdType =
    (householdTypeRes?.data?.household_type as string | undefined) ?? undefined

  // Dag-uitgaven voor de vrijheidstijd-omrekening — CONSUMEER het canonieke
  // 12-mnd rolling dagtarief uit de bundel; reken hier niets zelf uit. Was:
  // `dailyExpenseRate(effectiveInput.monthlyExpenses)` — de EFFECTIVE grondslag
  // (losse kalendermaand / profielschatting), waardoor dezelfde heffing hier een
  // ander aantal vrijheidsdagen gaf dan de widgets ernaast (vervolg KRUIS-20).
  // De verzonnen `: 100`/dag-terugval is weg: `recentDailyExpenseRateFromRows`
  // draagt de profielschatting al als terugval, en 0 betekent "geen eerlijke
  // dagbasis" — dan toont het oppervlak het bedrag zónder tijdregel.
  const dailyExpenses = horizonData.dailyExpenseRate

  // Marginaal tarief voor de effectieve-druk-annotatie (C1/C2).
  const marg = horizonData.fireParams?.marginaalTarief ?? deriveMarginaalTarief()

  // ── Box 1: bruto, heffing, jaarruimte en KAART-STATUS uit ÉÉN bron ────
  // Alles komt uit `loadFiscaleKansen` → `resolveBox1GrossIncome` +
  // `computeJaarruimte` + `computeBox1Tax`. Dat is de CANONIEKE Box 1-grondslag,
  // dezelfde die de box1-deeppage en de optimizer gebruiken (grossFromNet-
  // schijfinversie + handmatige `profiles.box1_gross_income`-override).
  //
  // BEWUST NIET LANGER `box1JaarruimteStatus`. Die helper is een SYNC
  // status-heuristiek (netto/(1−marginaal), geen DB-read) die in het shell-pad
  // van élke route hangt en daarom de sidebar-dot blijft voeden — maar hij kent
  // de handmatige bruto-override niet. Twee gevolgen die deze hub daarmee
  // erfde: wie zijn bruto op /box1 corrigeerde zag dat hier niet terug, en de
  // kaart-status kwam uit een factor-A-loze aanroep terwijl de kaart-TEKST
  // factor A wél meenam — dezelfde kaart kon "Ruimte benut" tonen naast een
  // oranje statuspunt. Restverschil met de sidebar-dot is nu bewust en
  // gedocumenteerd (lib/jaarruimte.ts#box1JaarruimteStatus).
  const grossYearly = kansen?.grossYearly ?? 0
  const box1Tax = kansen?.box1Tax ?? null
  const jaarruimte = kansen?.jaarruimte ?? null
  // Status EN statustekst uit één afleiding: de dot en het bijschrift op
  // dezelfde kaart mogen elkaar nooit tegenspreken (precies de fout die deze
  // wijziging opheft).
  const [box1Status, box1StatusText]: [LeverageStatus, string] = !jaarruimte?.hasData
    ? ['neutral', 'Inkomen onbekend']
    : jaarruimte.jaarruimte > 0
      ? ['warn', 'Onbenutte jaarruimte']
      : ['good', 'Ruimte benut']

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

  // ── Hub-overzicht (C1/C2/C7) — alleen de DRUK ──────────────────
  // `buildTaxOverview` aggregeert nog uitsluitend de belastingdruk; de kansen
  // komen uit `loadFiscaleKansen` (ADR 0086), niet meer uit losse signalen hier.
  //
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
  })

  // Fiscale kalender — runtime-klok als 'now' (server-component mag dat).
  const deadlines = getTaxDeadlines(new Date(), 2026)

  // Kaart-samenstelling in één pure functie (app/(app)/overzicht/belasting/
  // box-cards.ts) zodat de BEL-1-regel — Box 2 alleen bij aanmerkelijk belang —
  // testbaar is zonder deze hele loader-pagina na te bootsen. Alle cijfers en
  // statussen zijn hierboven al afgeleid; de builder rekent niets.
  const cards: BelastingBoxCard[] = buildBelastingBoxCards({
    box1Tax,
    box1Status,
    box1StatusText,
    box3Tax,
    box3Status,
    box3StatusText,
    hasAanmerkelijkBelang,
  })

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
            {/* BEL-2: de "nieuw"-badge is vervallen — de optimizer is geen
                introductie meer maar een vast onderdeel van de hub. */}
            <span className="flex items-center gap-2">
              <span className="text-base font-semibold text-[var(--ink)]">Fiscale optimizer</span>
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

        {/* II · De kansen — uit de gedeelde kansen-loader (ADR 0086). Alleen
            kansen met een POSITIEF netto effect halen deze lijst; een scenario
            dat per saldo meer rendement kost dan het aan belasting bespaart
            hoort hier niet als "besparingskans" te staan. */}
        {kansen && kansen.taxOpportunities.length > 0 && (
          <Reveal className="pt-12 sm:pt-16">
            <SectionLabel num="II">De kansen</SectionLabel>
            <HubKansen opportunities={kansen.taxOpportunities} />
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
