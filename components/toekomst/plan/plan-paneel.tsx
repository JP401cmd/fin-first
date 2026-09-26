// Verplaatst uit components/app/horizon/horizon-client.tsx r5632–5792, r5867–7990 @ c1b4849eb (fase 1, ADR 0179).
// euro-view: ontvangt view*-feeds van de render-grens, deflateert niet zelf
'use client'

/**
 * Het Plan-paneel van /toekomst (ADR 0179 D4, fase 1 stap 15): katern Plan, het kind
 * van de `(katern)`-layout op `/toekomst`. Het canvas en de katern-koppen staan erboven
 * in de layout; dit paneel toont en duidt het resultaat.
 *
 * Verplaatst uit de compositie van `horizon-client.tsx` (@ ec883d283, `HorizonCompositie`):
 * de KPI-strip met duiding, voortgang en gegevensmelding, de Plan-meldingen, de
 * verdieping en de kassabons, plus de Plan-lokale afleidingen die alleen deze blokken
 * lezen. Het lab woont sinds stap 16 in katern Doelen (`DoelenKaternLab`).
 *
 * Leest zijn data uit de provider, nooit uit de route (D8).
 */

import { useState } from 'react'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { SectionLabel } from '@/components/editorial'
import { isHeroAnswerInvalid } from '@/lib/horizon/hero-fire-age'
import { fireDoelPaarInLeesvolgorde, FIRE_DOEL_ONDERSCHRIFT } from '@/lib/horizon/fire-doel-weergave'
import {
  ANKER_KPI_LABEL,
  ANKER_VERMOGEN_TEGEL_ONDERSCHRIFT,
  ankerKpiCaption,
  haalbaarBijUitgaveRegel,
} from '@/lib/horizon/anker-copy'
import { guardFreedomMoment, guardRetirementExpense } from '@/lib/horizon/outcome-guard'
import { resolveFreedomFraming, isAtOrPastAow, stopAnchorFromKernel } from '@/lib/fire-strategy'
import { PlanKpiStrip } from '@/components/toekomst/plan/plan-kpi-strip'
import { PlanAnkerEnVoortgang } from '@/components/toekomst/plan/plan-hero-duiding'
import { PlanGegevensmelding } from '@/components/toekomst/plan/plan-gegevensmelding'
import { PlanVerdieping } from '@/components/toekomst/plan/plan-verdieping'
import { PLAN_JAARTABEL_LINK } from '@/lib/horizon/katern-copy'
import {
  PlanKassabonVrijheidsleeftijd,
  PlanKassabonDoelbedrag,
  PlanKassabonOpnamerate,
  PlanKassabonGezondheid,
} from '@/components/toekomst/plan/plan-kassabons'
import {
  useToekomstBron,
  useToekomstPerspectiefContext,
  useToekomstOverlayContext,
  useToekomstScenarioContext,
  useToekomstSimContext,
  useToekomstLagenContext,
  useToekomstEuroContext,
} from '@/components/toekomst/state/toekomst-state-provider'

export function PlanPaneel() {
  const { initialData } = useToekomstBron()
  const {
    isHouseholdView,
    isPartnerView,
    usePartnerMainLine,
    useHouseholdMainLine,
    perspectiveHero,
    hasPerspectiveHero,
  } = useToekomstPerspectiefContext()
  const {
    setActiveModal,
    openRetirementExpensePane,
    setSimModalOpen,
  } = useToekomstOverlayContext()
  const {
    hasScenario,
    hasStopKeuze,
    doelActief,
    scenarioVerwachtFireAge,
    coverageNodes,
    duidingStopAge,
    radarAssen,
  } = useToekomstScenarioContext()
  const {
    input,
    fireParams,
    fireStrategy,
    userAowAge,
    actions,
    resilienceSnapshots,
    retirementMethod,
    fireSwr,
    fire,
    range,
    healthScore,
    solvedRun,
    haalbareUitgave,
    scenarioPresets,
    scenarioPresetsLoading,
    markeerDuidingInView,
    simResult,
    simCashflows,
    simError,
    aowOntbreekt,
    stopPad,
    effectiveInput,
    currentAge,
    isFixedAnchorMode,
    effectiveFireTarget,
    effectiveFreedomPct,
    isPensioenMode,
    isNuStoppenMode,
    ankerReach,
    ankerStop,
    fireDoel,
    showDualFireTarget,
    showLiquidWealthLine,
    fireTargetGuard,
    showFireTargetNotice,
    aowAgeFormatted,
    heroFireAge,
    heroFireAgePending,
    heroFireAgeText,
    heroFireAgeReceiptText,
    isKernelDepleteRate,
    personalHeroProjection,
    handleActionStatusChange,
  } = useToekomstSimContext()
  const { lifelineAge } = useToekomstLagenContext()
  const {
    viewFireTargetInclHome,
    viewFireTargetExclHome,
    viewBalkVrijheidDoel,
    viewEffectiveFireTarget,
    viewVermogenOpAnker,
    viewMonthlyWithdrawalAtAow,
    viewScenarioPresets,
    viewHouseholdHeroFireTarget,
    viewPartnerHeroFireTarget,
  } = useToekomstEuroContext()
  const { masked } = useMaskedAmounts()

  const [healthChartOpen, setHealthChartOpen] = useState(false)
  const [fireAgeChartOpen, setFireAgeChartOpen] = useState(false)
  const [showFireAgeReceipt, setShowFireAgeReceipt] = useState(false)
  const [showFireTargetReceipt, setShowFireTargetReceipt] = useState(false)
  const [showResilienceReceipt, setShowResilienceReceipt] = useState(false)
  const [showSwrReceipt, setShowSwrReceipt] = useState(false)

  // De foutstaat (`!fire || !range || !healthScore`) rendert `ToekomstRekenGrens` in de
  // layout voor het hele katern; hier alleen de type-vernauwing, ná alle hooks (V2).
  if (!fire || !range || !healthScore) return null

  // Het bijbehorende doelbedrag in de gekozen euro-weergave (omzetting in het
  // render-grensblok hierboven; hier alleen de perspectief-keuze).
  const viewPerspectiveHeroFireTarget = isHouseholdView
    ? viewHouseholdHeroFireTarget
    : isPartnerView
      ? viewPartnerHeroFireTarget
      : null

  // ── Onderschrift bij het ENKELVOUDIGE doelbedrag (UR2-17) ─────────────────
  // De dual-tak (showDualFireTarget) noemt zijn grondslag al bij naam ("met je
  // huis" / "zonder je huis"); de single-tak — de standaardstrategie, en dus de
  // meeste gebruikers — zei alleen "benodigd". Daardoor leest hetzelfde
  // kerngetal op /toekomst en op /toekomst/doelen als een tegenspraak van
  // honderdduizenden euro's, terwijl het twee bewuste grondslagen zijn.
  // Consume-only: de kwalificatie komt uit `fireDoel.grondslag` — de uitkomst
  // die het getoonde bedrag zélf koos, niet uit een tweede afleiding op
  // `homeExcludedFromProgress`. Dat is het verzwarende deel van UR3-07 defect 3:
  // bij downsize/opeethypotheek stond het J-bedrag van de eerste paint ónder het
  // bijschrift "benodigd — met je huis" — het label sprak het getal tegen. Nu
  // kán dat niet meer: wisselt de grondslag, dan wisselt het onderschrift mee.
  // Geen kwalificatie waar ze niet klopt of niets betekent: in pensioen-modus is
  // het getal een projectie (geen doel), onder 'nu stoppen' bestaat er geen
  // doelbedrag (ADR 0127 D4) en bij een huishoud-/partnerweergave komt het
  // bedrag uit een andere bron dan deze keuze.
  // Onder een vast anker is dat bedrag `vermogenOpAnker` = de kernel-stand van
  // Prognose!J op de ankermaand, dus altijd de LIQUIDE grondslag — die kwalificatie
  // ontbrak en liet het getal als een (te laag) doelbedrag lezen. De woorden staan
  // náást die grondslag in `anker-copy.ts`, net zoals FIRE_DOEL_ONDERSCHRIFT dat
  // doet voor de solved-tak; de tegel schrijft ze niet zelf uit.
  const fireTargetCaption = isFixedAnchorMode
    ? ANKER_VERMOGEN_TEGEL_ONDERSCHRIFT
    : hasPerspectiveHero
      ? 'benodigd'
      : FIRE_DOEL_ONDERSCHRIFT[fireDoel.grondslag]

  // ── Leesvolgorde van het DUBBELE doelbedrag ────────────────────────────────
  // Het grote getal is een bewering over wat het antwoord IS. De tak hieronder
  // zette daar onvoorwaardelijk het incl.-huis-doel neer — ook bij 'Uitsluiten',
  // waar de grondslag juist het liquide doel is. Op één scherm stond dan
  // "ca. € 1.900.000 met je huis" bóven een balk die "ca. € 530.000 — volledige
  // vrijheid" zei en een kassabon die € 530.000 onderbouwde. De volgorde volgt
  // nu dezelfde ene grondslagkeuze als het bedrag, het onderschrift en de balk;
  // beide doelen blijven staan, alleen de nadruk verhuist. Consume-only: de
  // bedragen zijn de al gedeflateerde weergavewaarden, hier alleen geordend.
  const dualDoelRegels =
    showDualFireTarget && viewFireTargetInclHome != null && viewFireTargetExclHome != null
      ? fireDoelPaarInLeesvolgorde(fireDoel.grondslag, {
          'incl-huis': viewFireTargetInclHome,
          'excl-huis': viewFireTargetExclHome,
        })
      : null

  // ── Reeds-vrij / met-pensioen framing voor de hero-leeftijdsstat ───────────
  // Consume-only (ADR 0009): leest de reeds-berekende vrijheidsvoortgang +
  // leeftijden, herberekent niets. Zodra de gebruiker financieel vrij is toont
  // de "vrijheidsleeftijd"-stat anders het feitelijk huidige (FIRE≈huidige)
  // leeftijd-getal — verwarrend. Dan tonen we i.p.v. een getal "Je bent vrij" /
  // "Je bent met pensioen". Alleen voor de eigen view (niet huishouden/partner).
  const heroFreedomState = {
    freedomPct: effectiveFreedomPct,
    currentAge,
    // Consume-only: exact hetzelfde kernantwoord als de KPI eronder — nooit
    // een eigen precedentieketen (dat was juist de drift-bron van C1).
    fireAge: heroFireAge.age,
    strategy: fireStrategy?.strategy,
    // ADR 0129 D8 — het anker van de run is de sleutel voor de gate (anker bereikt ∧
    // dekking ≥ 100); vóór de run het plan-anker uit de bundel.
    anchor: simResult ? stopAnchorFromKernel(simResult.stopAnker) : (initialData.firePlan?.anchor ?? null),
    aowAge: userAowAge.fractional,
  }
  const heroFreedomFraming = resolveFreedomFraming(heroFreedomState)
  // ADR 0129 — het nu-anker uitgezonderd: bij volledige dekking staat de gate open,
  // maar de zin "Je bent vrij" in de plaats van het getal is dan juist mis. Onder dat
  // anker ís het getal het antwoord (tot welke leeftijd het reikt) — alleen het LABEL
  // verandert. 'anchored' (vast anker, nog niet vrij) toont evenmin de vrij-hero.
  const showFreeHero =
    !hasPerspectiveHero && heroFreedomFraming === 'free' && simResult?.stopAnker?.soort !== 'nu'
  const heroFreeAsPensioen = heroFreedomFraming === 'free' && isAtOrPastAow(heroFreedomState)
  const freeHeroPhrase = heroFreeAsPensioen ? 'Je bent met pensioen' : 'Je bent vrij'
  const freeHeroLabel = heroFreeAsPensioen ? 'Pensioen' : 'Vrijheid'

  // ── KPI-koppen van de leeftijds-tegel (ADR 0127) ───────────────────────
  // Één plek voor de varianten, zodat de tegel en zijn kassabon niet uiteen kunnen lopen.
  // ADR 0129 — onder ÉLK vast anker (aow/now/age) is het kopgetal de leeftijd tot waar
  // het liquide vermogen reikt; de drieslag eronder draagt stopmoment en "vrij mogelijk
  // vanaf". Geen "Pensioenleeftijd" meer als kop: de AOW is een stopmoment, geen antwoord.
  const heroAgeLabel = isFixedAnchorMode ? ANKER_KPI_LABEL : 'Vrijheidsleeftijd'
  const heroAgeCaptionBase = isFixedAnchorMode
    ? (ankerReach != null ? ankerKpiCaption(ankerReach) : 'jaar')
    : 'jaar'

  // ── Gelijke behandeling van ontbrekende brondata op de hele KPI-rij (UR2-05) ─
  // De Doelbedrag-tegel had als enige een gegevensmelding (`showFireTargetNotice`,
  // M6). Op een leeg profiel stond die melding dus naast een "Vrijheidsleeftijd"
  // van 83 en een "Na pensioen" met een exact jaarbedrag — drie tegels, één
  // ontbrekende grondslag, drie verschillende beloftes. Elke tegel toetst nu zijn
  // EIGEN bron met dezelfde guard-familie; de vorm van de melding is één
  // helper (`heroKpiNoticeDelen`).
  //
  // Vrijheidsleeftijd volgt bewust het DOELBEDRAG en niet een eigen toets: het
  // moment en het doel zijn twee helften van hetzelfde kernantwoord (zie
  // horizon-client.hero-fire-age.test.ts) — kunnen we het doel niet noemen, dan
  // is het moment ernaartoe evenmin een antwoord. `berekenen` wordt uitgezonderd:
  // zolang de kernel nog rekent is er geen gegevensprobleem maar een lege hand,
  // en dáár heeft de tegel al zijn eigen "···".
  const fireAgeNoticeGuard = guardFreedomMoment({
    ageIsInvalid: isHeroAnswerInvalid(heroFireAge),
    fireTarget: fireTargetGuard,
  })
  //
  // ADR 0129 D4 — een VAST anker is uitgezonderd: de doelbedrag-guard is daar
  // bewust NIET ok ('geen-doelvermogen'). Dat is geen ontbrekend gegeven maar
  // een eigenschap van het plan; het bereik (tot waar het vermogen reikt) is er
  // wél en hoort te blijven staan. Zonder die uitzondering zou de tegel op elke
  // run onder een vast anker de gegevensmelding tonen.
  const showFireAgeNotice =
    !hasPerspectiveHero &&
    !isFixedAnchorMode &&
    heroFireAge.status !== 'berekenen' &&
    !fireAgeNoticeGuard.ok
  // De uitgave ná pensioen toetst zijn eigen grondslag: de methode-uitkomst uit
  // `computeRetirementExpenses` valt stil terug op de profielschatting en dan op
  // 0 — een terugval die op het scherm niet van een meting te onderscheiden was.
  // Net als de doelbedrag-guard alléén in de EIGEN weergave: huishoud-/
  // partnercijfers komen uit de perspectief-loader en hebben hun eigen keten;
  // ze hier half meeguarden zou de rij juist opnieuw uit de pas laten lopen.
  const retirementExpenseGuard = guardRetirementExpense(input?.yearlyMustExpenses ?? null)
  const showRetirementExpenseNotice = !hasPerspectiveHero && !retirementExpenseGuard.ok

  /**
   * De regel onder het bedrag in de KPI-tegel "Na pensioen"; null = niets te melden.
   * F2b (eindreview 19 sep) — onder 'nu stoppen' zet `labAntwoordenPerKnop` het
   * antwoord onder de vierde knop al op `[]` (bestaande ADR 0145-regel); zonder
   * dezelfde uitzondering hier zou de tegelregel wél verschijnen terwijl het antwoord
   * eronder verdwijnt — de twee helften van AC-6 (mede-aanwezigheid) die uit elkaar
   * vallen. Of deze hefboom onder 'nu stoppen' juist wél relevant is, ligt apart bij
   * de eigenaar — dit is alleen de symmetrie-fix.
   */
  const haalbareUitgaveRegel =
    !isNuStoppenMode && haalbareUitgave ? haalbaarBijUitgaveRegel(haalbareUitgave, masked) : null
  /** Donkerrood = minder moeten uitgeven, donkergroen = meer mogen. Semantische tokens. */
  const haalbareUitgaveToon =
    haalbareUitgave?.richting === 'minder' ? 'text-negative' : 'text-positive'
  /**
   * De grondslag voor de vierde draaiknop, ONAFHANKELIJK van of er een opgelost
   * antwoord is (F3, eindreview 19 sep). Onder een `solved`-anker bestaat
   * `haalbareUitgave` niet (geen vast stopmoment om tegen te solven), maar de spec
   * ("Uit scope → plannen zonder vast stopmoment") eist dat de knop dan als
   * VERKENNING bruikbaar blijft — alleen de tegelregel en het antwoord eronder
   * blijven weg. Bij een vast anker is `haalbareUitgave.huidigPerJaar` de precieze
   * grondslag (herleid via de nice-fractie-aware profielrij); zonder anker valt hij
   * terug op dezelfde ruwe grondslag als `retirementExpenseGuard` hierboven.
   */
  // (`uitgaveNaPensioenBasis` staat bij de knop-afleidingen hierboven — één declaratie.)

  return (
    <div className="mt-6">
      {/* === KATERN I — Waar je staat === */}
      <HideInSimple>
        <SectionLabel num="I">Waar je staat</SectionLabel>
      </HideInSimple>

      <section className="card-editorial overflow-hidden">
        <div className="p-4 sm:p-6 md:p-8">
          {/* Fase 2 (ADR 0179 D2/D4, spec §4.3/§4.9): één KPI-strip voor alle breedtes.
              De vrijheidsleeftijd staat twee keer per scherm: in de ankerregel van de
              kop en hier als KPI 1 (met de kassabon). Het grote mobiele kerngetal, de
              aparte mobiele strip en de duidingszin zijn vervallen. */}
          <PlanKpiStrip
            isFixedAnchorMode={isFixedAnchorMode}
            hasPerspectiveHero={hasPerspectiveHero}
            setShowFireAgeReceipt={setShowFireAgeReceipt}
            heroFireAge={heroFireAge}
            heroFireAgePending={heroFireAgePending}
            isPartnerView={isPartnerView}
            perspectiveHero={perspectiveHero}
            showFireAgeNotice={showFireAgeNotice}
            showFreeHero={showFreeHero}
            freeHeroLabel={freeHeroLabel}
            heroAgeLabel={heroAgeLabel}
            fireAgeNoticeGuard={fireAgeNoticeGuard}
            freeHeroPhrase={freeHeroPhrase}
            heroFireAgeText={heroFireAgeText}
            heroAgeCaptionBase={heroAgeCaptionBase}
            setShowFireTargetReceipt={setShowFireTargetReceipt}
            showFireTargetNotice={showFireTargetNotice}
            fireTargetGuard={fireTargetGuard}
            isNuStoppenMode={isNuStoppenMode}
            dualDoelRegels={dualDoelRegels}
            viewPerspectiveHeroFireTarget={viewPerspectiveHeroFireTarget}
            viewVermogenOpAnker={viewVermogenOpAnker}
            viewBalkVrijheidDoel={viewBalkVrijheidDoel}
            fireTargetCaption={fireTargetCaption}
            setShowSwrReceipt={setShowSwrReceipt}
            isPensioenMode={isPensioenMode}
            isKernelDepleteRate={isKernelDepleteRate}
            viewMonthlyWithdrawalAtAow={viewMonthlyWithdrawalAtAow}
            simResult={simResult}
            fireSwr={fireSwr}
            openRetirementExpensePane={openRetirementExpensePane}
            retirementMethod={retirementMethod}
            showRetirementExpenseNotice={showRetirementExpenseNotice}
            retirementExpenseGuard={retirementExpenseGuard}
            input={input}
            haalbareUitgaveRegel={haalbareUitgaveRegel}
            haalbareUitgaveToon={haalbareUitgaveToon}
          />

          <PlanAnkerEnVoortgang
            hasPerspectiveHero={hasPerspectiveHero}
            heroFireAge={heroFireAge}
            currentAge={currentAge}
            solvedRun={solvedRun}
            simResult={simResult}
            isFixedAnchorMode={isFixedAnchorMode}
            perspectiveHero={perspectiveHero}
            effectiveFreedomPct={effectiveFreedomPct}
            showFireTargetNotice={showFireTargetNotice}
          />

          <PlanGegevensmelding simError={simError} />

          {/* De meldingen (niet haalbaar, tekort, nu al gedekt, tekort-lening, eindsituatie)
              staan sinds fase 2 in het meldingenslot bovenaan het katern (ADR 0179 D6);
              AOW en "huis nooit verkocht" wonen in katern Instellingen. */}
        </div>
      </section>

      <PlanVerdieping
        coverageNodes={coverageNodes}
        radarAssen={radarAssen}
        scenarioPresets={scenarioPresets}
        scenarioPresetsLoading={scenarioPresetsLoading}
        hasScenario={hasScenario}
        hasStopKeuze={hasStopKeuze}
        usePartnerMainLine={usePartnerMainLine}
        useHouseholdMainLine={useHouseholdMainLine}
        doelActief={doelActief}
        stopPad={stopPad}
        duidingStopAge={duidingStopAge}
        simResult={simResult}
        userAowAge={userAowAge}
        lifelineAge={lifelineAge}
        isFixedAnchorMode={isFixedAnchorMode}
        ankerStop={ankerStop}
        scenarioVerwachtFireAge={scenarioVerwachtFireAge}
        viewScenarioPresets={viewScenarioPresets}
        personalHeroProjection={personalHeroProjection}
        resilienceSnapshots={resilienceSnapshots}
        healthScore={healthScore}
        healthChartOpen={healthChartOpen}
        setHealthChartOpen={setHealthChartOpen}
        fireAgeChartOpen={fireAgeChartOpen}
        setFireAgeChartOpen={setFireAgeChartOpen}
        setShowResilienceReceipt={setShowResilienceReceipt}
        actions={actions}
        handleActionStatusChange={handleActionStatusChange}
        onDuidingInView={markeerDuidingInView}
      />

      {/* Links-rij van Plan (spec §4.3/§4.9): alleen de jaar-op-jaar-tabel. "Zo werkt je
          grafiek" heeft één ingang, de i op het canvas. In beide weergavemodi (§4.7). */}
      {simResult && (
        <p className="mt-6 sm:mt-8">
          <button
            type="button"
            onClick={() => setSimModalOpen(true)}
            data-testid="plan-jaar-op-jaar"
            className="inline-flex min-h-[44px] items-center font-sans text-[13px] text-[var(--ink-2)] underline decoration-[var(--border-ed)] underline-offset-4 transition-colors hover:text-[var(--module-active-700)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            {PLAN_JAARTABEL_LINK}
          </button>
        </p>
      )}

      <PlanKassabonVrijheidsleeftijd
        showFireAgeReceipt={showFireAgeReceipt}
        setShowFireAgeReceipt={setShowFireAgeReceipt}
        heroAgeLabel={heroAgeLabel}
        showFireAgeNotice={showFireAgeNotice}
        fireAgeNoticeGuard={fireAgeNoticeGuard}
        isFixedAnchorMode={isFixedAnchorMode}
        simResult={simResult}
        ankerReach={ankerReach}
        ankerStop={ankerStop}
        effectiveInput={effectiveInput}
        showLiquidWealthLine={showLiquidWealthLine}
        initialData={initialData}
        fire={fire}
        fireParams={fireParams}
        aowOntbreekt={aowOntbreekt}
        heroFireAge={heroFireAge}
        isPensioenMode={isPensioenMode}
        aowAgeFormatted={aowAgeFormatted}
        viewVermogenOpAnker={viewVermogenOpAnker}
        viewMonthlyWithdrawalAtAow={viewMonthlyWithdrawalAtAow}
        fireSwr={fireSwr}
        heroFireAgeReceiptText={heroFireAgeReceiptText}
        range={range}
      />

      <PlanKassabonDoelbedrag
        showFireTargetReceipt={showFireTargetReceipt}
        setShowFireTargetReceipt={setShowFireTargetReceipt}
        isFixedAnchorMode={isFixedAnchorMode}
        showFireTargetNotice={showFireTargetNotice}
        fireTargetGuard={fireTargetGuard}
        simResult={simResult}
        fireSwr={fireSwr}
        effectiveInput={effectiveInput}
        isPensioenMode={isPensioenMode}
        aowAgeFormatted={aowAgeFormatted}
        fireParams={fireParams}
        viewMonthlyWithdrawalAtAow={viewMonthlyWithdrawalAtAow}
        viewVermogenOpAnker={viewVermogenOpAnker}
        viewEffectiveFireTarget={viewEffectiveFireTarget}
        fireStrategy={fireStrategy}
        masked={masked}
      />

      <PlanKassabonOpnamerate
        showSwrReceipt={showSwrReceipt}
        setShowSwrReceipt={setShowSwrReceipt}
        simResult={simResult}
        effectiveInput={effectiveInput}
        fireSwr={fireSwr}
        simCashflows={simCashflows}
        userAowAge={userAowAge}
        effectiveFireTarget={effectiveFireTarget}
      />

      <PlanKassabonGezondheid
        showResilienceReceipt={showResilienceReceipt}
        setShowResilienceReceipt={setShowResilienceReceipt}
        healthScore={healthScore}
        setActiveModal={setActiveModal}
      />
    </div>
  )
}
