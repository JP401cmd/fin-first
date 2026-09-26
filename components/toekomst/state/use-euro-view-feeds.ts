'use client'

// Verplaatst uit components/app/horizon/horizon-client.tsx (ADR 0179 fase 1, stap 12).
//
// De euro-weergave-render-grens van /toekomst (ADR 0090/0093) als één hook. Het blok
// tussen de bakens is ongewijzigd uit horizon-client geknipt: dezelfde memo's in dezelfde
// volgorde, dezelfde dependency-arrays. De hook krijgt de NOMINALE feeds als één object
// en geeft de `view*`-feeds terug. Er is precies één grens: buiten dit bestand roept geen
// /toekomst-bestand `deflate*` aan (bewaakt door `use-euro-view-feeds.euro-view.test.ts`).

import { useCallback, useMemo } from 'react'
import type { SimResult, SimRow } from '@/lib/fire-simulation'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import type { StackedRow } from '@/lib/wealth-composition'
import type { AowAge } from '@/lib/aow-leeftijd'
import type { FinancialInput } from '@/lib/horizon-data'
import type { buildBreakdown } from '@/lib/income-expense-breakdown'
import type { ScenarioPresetResult } from '@/lib/horizon/scenario-presets'
import type { ScenarioOverlay, MonteCarloOverlay, HouseholdPartnerOverlay } from '@/components/app/horizon/sim-chart'
import { calculateFreedomTime, formatFreedomTimeString, formatCurrency, MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'
import {
  buildFactorByAge,
  buildFactorByOffset,
  deflate,
  deflatePoints,
  deflateRowsByAge,
  deflateSeriesByOffset,
  factorAtAge,
} from '@/lib/euro-display'
import { useEuroView } from '@/lib/hooks/use-euro-view'
import { fireAgeForDisplay } from '@/lib/fire-strategy'
import { formatAge } from '@/lib/horizon/fire-format'
import type { LabUitkomstRegel } from '@/components/app/horizon/lab-knoppen'
import {
  ankerKort,
  dekkingBadge,
  eindvermogenOpTegel,
  EINDVERMOGEN_DELTA_DREMPEL,
  eindvermogenOpgeslagenNoot,
  eindvermogenPreviewWaarde,
} from '@/lib/horizon/anker-copy'
import type { LabEindvermogen, LabPromotie, LabUitkomst, LabUitkomstDekking } from '@/lib/horizon/lab-uitkomst'
import type { DoelParameterPreview } from '@/components/app/horizon/doel-vastleg-sheet'
import { SIM_ROW_MONEY_FIELDS, STACKED_ROW_MONEY_FIELDS, factorMapByPosition } from '@/components/toekomst/state/euro-view-feeds'
import type { HouseholdHeroData, HouseholdMainLine, PartnerLine, ReadoutData } from '@/components/toekomst/state/types'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { useStabielObject } from './use-stabiel-object'
import type { ToekomstPerspectief } from './use-toekomst-perspectief'
import type { ToekomstSim } from './use-toekomst-sim'
import type { ToekomstScenario } from './use-toekomst-scenario'
import type { ToekomstLagen } from './use-toekomst-lagen'

export interface EuroViewFeedsInput {
  displayUnifiedRows: UnifiedProjectionRow[]
  displaySimRows: SimRow[]
  displayEffectiveSimRows: SimRow[]
  wealthCompositionRows: StackedRow[]
  partnerLine: PartnerLine | null
  householdMainLine: HouseholdMainLine | null
  liquidWealthPoints: [number, number][] | undefined
  combinedScenarioOverlays: ScenarioOverlay[]
  householdOverlays: HouseholdPartnerOverlay[] | null
  monteCarloOverlay: MonteCarloOverlay | undefined
  simResult: SimResult | null
  fireTargetInclHome: number | null
  chartEndAge: number | null
  targetInflationFactors: { age: number; factor: number }[]
  userAowAge: AowAge
  fireTargetExclHome: number | null
  balkVrijheidDoel: number
  effectiveFireTarget: number
  vermogenOpAnker: number | null
  monthlyWithdrawalAtAow: number | null
  labDekking: LabUitkomstDekking | null
  labUitkomst: LabUitkomst
  masked: boolean
  labPromotie: LabPromotie
  doelPreviews: DoelParameterPreview[]
  readoutData: ReadoutData | null
  canonicalDailyRate: number
  effectiveInput: FinancialInput | null
  ieBreakdownResult: ReturnType<typeof buildBreakdown> | null
  scenarioPresets: ScenarioPresetResult[] | null
  householdHero: HouseholdHeroData | null
  partnerHero: HouseholdHeroData | null
}

export function useEuroViewFeeds(nominaal: EuroViewFeedsInput) {
  const {
    displayUnifiedRows,
    displaySimRows,
    displayEffectiveSimRows,
    wealthCompositionRows,
    partnerLine,
    householdMainLine,
    liquidWealthPoints,
    combinedScenarioOverlays,
    householdOverlays,
    monteCarloOverlay,
    simResult,
    fireTargetInclHome,
    chartEndAge,
    targetInflationFactors,
    userAowAge,
    fireTargetExclHome,
    balkVrijheidDoel,
    effectiveFireTarget,
    vermogenOpAnker,
    monthlyWithdrawalAtAow,
    labDekking,
    labUitkomst,
    masked,
    labPromotie,
    doelPreviews,
    readoutData,
    canonicalDailyRate,
    effectiveInput,
    ieBreakdownResult,
    scenarioPresets,
    householdHero,
    partnerHero,
  } = nominaal

  // ── EURO-WEERGAVE: DE RENDER-GRENS ─────────────────────────────────────────
  //   Alles hierboven is NOMINAAL. Alles hieronder consumeert `view*`-waarden.
  //   Buiten dit blok staat in dit bestand géén deflate()/deflateRowsByAge()/
  //   deflatePoints()/deflateSeriesByOffset() en geen deling door inflationFactor.
  //
  //   WAAROM ÉÉN BLOK: dit bestand is >8000 regels. Verspreide deflatie is hier
  //   niet reviewbaar, en een bedrag dat twee keer gedeeld wordt ziet er op het
  //   scherm nog steeds plausibel uit. Eén grens + één factorbron + het merk
  //   `InEuroView<T>` (compile-fout bij een tweede omzetting) is de enige
  //   bescherming die schaalt. Bewaakt door `use-euro-view-feeds.euro-view.test.ts`.
  //
  //   NAAMCONVENTIE (hard): nominaal = ongesuffixt (`displaySimRows`,
  //   `targetInflationFactors`), gedeflateerd = `view`-prefix (`viewSimRows`).
  //   De JSX verwijst voor euro-bedragen uitsluitend naar `view*`.
  //
  //   TWEE KRUIS-REGIMES (D4): chart-feeds en puntbedragen kruisen de grens in
  //   VIEW-SPACE en gemerkt; rekenrijen (`UnifiedProjectionRow[]` naar de
  //   fase-modals, `PhaseDetailTable`, `HorizonYearDetailsSheet`,
  //   `WealthCompositionChart`) kruisen NOMINAAL en onveranderd — die
  //   componenten lezen `useEuroView()` zelf en deflateren per klasse. Zij
  //   dragen kruis-jaar-identiteiten (kassabons) die een blanket-deling breekt.
  const { view: euroView } = useEuroView()

  // Twee sleutelvormen van ÉÉN bron (`displayUnifiedRows`, dus automatisch de
  // wat-als-rijen zodra een wat-als actief is — de deflator volgt de what-if-
  // inflatie, nooit de basisinflatie uit het profiel):
  //   • op leeftijd  → de eigen lijn en alles wat op de eigen leeftijd-as loopt
  //   • op jaar-offset → feeds waarvan de x-as NIET de eigen leeftijd is
  //                      (partner, huishouden, Monte-Carlo-band)
  const factorByAge = useMemo(() => buildFactorByAge(displayUnifiedRows), [displayUnifiedRows])
  const factorByOffset = useMemo(() => buildFactorByOffset(displayUnifiedRows), [displayUnifiedRows])

  // ── Chart-feeds: rijen ────────────────────────────────────────────────────
  // In 'nominal' geven de helpers dezelfde array-REFERENTIE terug, zodat de
  // memo-/React.memo-keten van dit bestand niet in een re-render-cascade valt.
  const viewDisplaySimRows = useMemo(
    () => deflateRowsByAge(displaySimRows, factorByAge, SIM_ROW_MONEY_FIELDS, euroView),
    [displaySimRows, factorByAge, euroView],
  )
  const viewDisplayEffectiveSimRows = useMemo(
    () => deflateRowsByAge(displayEffectiveSimRows, factorByAge, SIM_ROW_MONEY_FIELDS, euroView),
    [displayEffectiveSimRows, factorByAge, euroView],
  )
  // Vermogensopbouw-staven (WealthCompositionChart): jaarstanden per groep op de
  // eigen leeftijd-as ⇒ leeftijd-sleutel. Deze feed draagt zelf geen deflate/
  // inflationFactor en was daardoor onzichtbaar voor grendel-regels 2 en 3 —
  // de bron-test pint 'm sindsdien expliciet op de callsite.
  const viewWealthCompositionRows = useMemo(
    () => deflateRowsByAge(wealthCompositionRows, factorByAge, STACKED_ROW_MONEY_FIELDS, euroView),
    [wealthCompositionRows, factorByAge, euroView],
  )
  // Partner-/huishoudlijn: eigen leeftijd-as ⇒ op POSITIE sleutelen (K4).
  const viewPartnerLineRows = useMemo(
    () =>
      partnerLine == null
        ? null
        : deflateRowsByAge(
            partnerLine.rows,
            factorMapByPosition(partnerLine.rows, factorByOffset),
            SIM_ROW_MONEY_FIELDS,
            euroView,
          ),
    [partnerLine, factorByOffset, euroView],
  )
  const viewHouseholdMainLineRows = useMemo(
    () =>
      householdMainLine == null
        ? null
        : deflateRowsByAge(
            householdMainLine.rows,
            factorMapByPosition(householdMainLine.rows, factorByOffset),
            SIM_ROW_MONEY_FIELDS,
            euroView,
          ),
    [householdMainLine, factorByOffset, euroView],
  )

  // ── Chart-feeds: puntenreeksen ────────────────────────────────────────────
  // Besteedbaar-reeks: `buildLiquidWealthPoints` seedt op de beginleeftijd met
  // het J(0)-anker en plot daarna de waarde van rij `age` op `age + 1` (zie
  // lib/horizon/liquid-wealth-line.ts). De factor hoort dus bij het BRONJAAR —
  // vandaar de expliciete `x - 1`-sleutel. Zonder die sleutel deflateert deze
  // reeks stil één jaar te ver. Het SEED-punt mapt naar startleeftijd − 1, die
  // bewust niet in `factorByAge` zit: `deflatePoints` laat dat bedrag dan
  // ongemoeid, en dat is exact goed — jaar 0 draagt factor 1.0 (ADR 0093).
  const viewLiquidWealthPoints = useMemo(
    () =>
      liquidWealthPoints == null
        ? undefined
        : deflatePoints(liquidWealthPoints, factorByAge, euroView, x => x - 1),
    [liquidWealthPoints, factorByAge, euroView],
  )
  // Scenario-overlays lopen op de EIGEN leeftijd-as (wat-als/stop-pad/ghosts van
  // dezelfde gebruiker) ⇒ leeftijd-sleutel, met BRONJAAR-sleutel (`x - 1`).
  // Waarom `x - 1`: `simRowsToChartPoints` plot de eindstand van rij `age` op
  // `age + 1` (zie lib/horizon/sim-chart-geometry.ts). De HOOFDLIJN deflateert
  // diezelfde eindstand met de factor van de RIJ (`deflateRowsByAge` op
  // `SIM_ROW_MONEY_FIELDS`, dus f(age)) en tekent hem daarna op `age + 1`. Een
  // overlay die op x=age+1 f(age+1) zou pakken, krijgt één jaar extra deflatie
  // en zakt ~π onder de lijn waar hij tegen afgezet wordt. Zelfde sleutel en
  // zelfde reden als de besteedbaar-lijn hierboven en de Monte-Carlo-band
  // hieronder. Het STAARTpunt (x = laatste leeftijd + 1) valt zonder deze
  // sleutel bovendien buiten `factorByAge` en zou nominaal blijven staan — een
  // zichtbare haak omhoog in 'real'. Het SEED-punt (x = startleeftijd) mapt naar
  // startleeftijd − 1, die bewust niet in de map zit: `deflatePoints` laat het
  // bedrag dan ongemoeid, en dat is exact goed — jaar 0 draagt factor 1.0.
  const viewCombinedScenarioOverlays = useMemo(
    () =>
      euroView === 'nominal'
        ? combinedScenarioOverlays
        : combinedScenarioOverlays.map(o => ({
            ...o,
            points: deflatePoints(o.points, factorByAge, euroView, x => x - 1),
          })),
    [combinedScenarioOverlays, factorByAge, euroView],
  )
  // Huishoud-/partner-overlays: vreemde leeftijd-as ⇒ positie-sleutel (K4).
  const viewHouseholdOverlays = useMemo(
    () =>
      householdOverlays == null || euroView === 'nominal'
        ? householdOverlays
        : householdOverlays.map(o => ({
            ...o,
            // `[1, ...factorByOffset]`: de puntenreeks draagt sinds
            // `simRowsToChartPoints` een SEED op de startleeftijd, gevolgd door
            // één punt per rij op `age + 1`. Positie j=0 is dus de stand van nu
            // (factor 1.0) en positie j=i+1 draagt de eindstand van rij i — die
            // op de hoofdlijn met de factor van díe rij (offset i) wordt
            // gedeflateerd. Het vooropgezette 1-element schuift de offsets één
            // plek op zodat elk punt de factor van zijn BRONrij krijgt; zonder
            // die shift pakt elk punt er één te ver en zakt de overlay ~π onder
            // de hoofdlijn. Leeftijd-as is hier vreemd (partner/huishouden), dus
            // positie draagt de tijd — niet de leeftijd (K4).
            points: deflatePoints(
              o.points,
              factorMapByPosition(
                o.points.map(([age]) => ({ age })),
                [1, ...factorByOffset],
              ),
              euroView,
            ),
          })),
    [householdOverlays, factorByOffset, euroView],
  )
  // Monte-Carlo-band: `number[]` geïndexeerd op jaar-offset vanaf `startAge`.
  // BRONJAAR-SLEUTEL (`i - 1`), om dezelfde reden als de `x - 1` van de
  // besteedbaar-lijn hierboven: band-index `i` staat op leeftijd `startAge + i`,
  // maar draagt de EINDstand van jaar-blok `i − 1` — precies de waarde die de
  // hoofdlijn daar tekent met `rows[i-1].inflationFactor = (1+π)^(i-1)`. Zonder
  // de sleutel krijgt de band één jaar extra deflatie en zakt hij ~π onder de
  // lijn die hij hoort te omvatten. Index 0 (de stand van vandaag) mapt naar
  // factor[0] = 1 en blijft dus ongemoeid.
  const mcBandSourceYear = useCallback((i: number) => Math.max(i - 1, 0), [])
  const viewMonteCarloOverlay = useMemo(
    () =>
      monteCarloOverlay == null || euroView === 'nominal'
        ? monteCarloOverlay
        : {
            ...monteCarloOverlay,
            p10: deflateSeriesByOffset(monteCarloOverlay.p10, factorByOffset, euroView, mcBandSourceYear),
            p25: deflateSeriesByOffset(monteCarloOverlay.p25, factorByOffset, euroView, mcBandSourceYear),
            p50: deflateSeriesByOffset(monteCarloOverlay.p50, factorByOffset, euroView, mcBandSourceYear),
            p75: deflateSeriesByOffset(monteCarloOverlay.p75, factorByOffset, euroView, mcBandSourceYear),
            p90: deflateSeriesByOffset(monteCarloOverlay.p90, factorByOffset, euroView, mcBandSourceYear),
          },
    [monteCarloOverlay, factorByOffset, euroView, mcBandSourceYear],
  )

  // ── Puntbedragen (klasse S — stock op één leeftijd) ───────────────────────
  // De factor hoort bij de leeftijd waar het bedrag bij hoort, niet bij "nu".
  //
  // ÉÉN leeftijdsbron voor élke FIRE-moment-factor, en die loopt door de
  // canonieke weergave-seam `fireAgeForDisplay` (= Math.round). Waarom: de
  // kernelrijen staan op HELE leeftijden, en `factorAtAge` pakt bij een
  // tussenliggende leeftijd de dichtstbijzijnde rij — waarbij een leeftijd exact
  // op .5 naar BENEDEN valt (eerste kleinste afstand wint, rijen oplopend).
  // /overzicht voedt zijn lookup met de al-afgeronde weergave-leeftijd uit
  // diezelfde seam en zou dan naar BOVEN vallen: twee oppervlakken, hetzelfde
  // bedrag, twee deflatoren. Normaliseren bij de bron houdt het rij-keuzegedrag
  // los van de vraag of de aanroeper fractioneel of afgerond aanlevert
  // (AC-F4 / UAT-KRUIS-27).
  const fireFactorAge = useMemo(
    () => fireAgeForDisplay(simResult?.fireAgeFractional ?? simResult?.fireAge ?? null),
    [simResult],
  )
  const viewFireTarget = useMemo(
    () =>
      simResult == null
        ? undefined
        : deflate(
            simResult.requiredFirePortfolio,
            factorAtAge(displayUnifiedRows, fireFactorAge),
            euroView,
          ),
    [simResult, displayUnifiedRows, fireFactorAge, euroView],
  )
  const viewFireTargetInclHome = useMemo(
    () =>
      fireTargetInclHome == null
        ? null
        : deflate(
            fireTargetInclHome,
            factorAtAge(displayUnifiedRows, fireFactorAge),
            euroView,
          ),
    [fireTargetInclHome, displayUnifiedRows, fireFactorAge, euroView],
  )
  const viewTargetEndPortfolio = useMemo(
    () =>
      simResult == null
        ? undefined
        : deflate(simResult.targetEndPortfolio, factorAtAge(displayUnifiedRows, chartEndAge), euroView),
    [simResult, displayUnifiedRows, chartEndAge, euroView],
  )
  // N2b — het geschreven contract met de grafiek (brok C). De geometrie tekent
  // ZONDER factorlijst géén doellijn (`sim-chart-geometry.ts`: geen factoren ⇒
  // `targetLine === null`), dus `undefined` doorgeven zou de erfenis-/koopkracht-
  // lijn in 'real' laten VERDWIJNEN i.p.v. vlak leggen. We leveren daarom een
  // UNIT-factorlijst: dezelfde leeftijdenreeks met factor 1 overal. Dan geldt in
  // de geometrie `endFactor = 1` ⇒ `realTargetNow = het gedeflateerde doel` ⇒ een
  // vlakke polyline op het reële doel-van-nu, met nul wijziging in de geometrie.
  const viewTargetInflationFactors = useMemo(
    () =>
      euroView === 'nominal'
        ? targetInflationFactors
        : targetInflationFactors.map(f => ({ age: f.age, factor: 1 })),
    [targetInflationFactors, euroView],
  )

  // ── Hero-KPI's: puntbedragen op een specifieke leeftijd ───────────────────
  // De FIRE-doelen horen bij de FIRE-leeftijd, het vermogen op het stopmoment bij
  // de ANKERLEEFTIJD en de maandonttrekking bij de AOW-leeftijd. Een generieke
  // "factor van nu" zou hier stelselmatig te weinig deflateren; de leeftijd is juist
  // wat het bedrag zijn koopkracht geeft — dus ook: de leeftijd die bij dít bedrag
  // hoort, niet die van de buurwaarde.
  // Zelfde genormaliseerde leeftijdsbron als `viewFireTarget` hierboven — anders
  // zouden twee FIRE-doelbedragen op dezelfde pagina op een andere rij landen.
  const fireFactor = useMemo(
    () => factorAtAge(displayUnifiedRows, fireFactorAge),
    [displayUnifiedRows, fireFactorAge],
  )
  const aowFactor = useMemo(
    () => factorAtAge(displayUnifiedRows, userAowAge.fractional),
    [displayUnifiedRows, userAowAge.fractional],
  )
  // `vermogenOpAnker` staat op de ANKERMAAND, niet op de AOW-leeftijd — dus de factor
  // van het STOPMOMENT van de run (`SimResult.vastStopLeeftijd`, fractioneel; bridge.ts).
  // Met `aowFactor` werd een `age`-anker van 46 bij een AOW van 68,5 ruim twintig jaar te
  // ver teruggerekend zodra de gebruiker "huidige euro's" aanzette. Onder het aow-anker is
  // `vastStopLeeftijd` gelijk aan de AOW-leeftijd, dus dát pad blijft numeriek identiek.
  // Onder `solved` is het veld `null` en geeft `factorAtAge` 1 — en dan is `vermogenOpAnker`
  // sowieso `null`. Eén deflatie per bedrag (ADR 0090/0093), geen eigen `Math.pow`.
  const ankerFactor = useMemo(
    () => factorAtAge(displayUnifiedRows, simResult?.vastStopLeeftijd ?? null),
    [displayUnifiedRows, simResult?.vastStopLeeftijd],
  )
  const viewFireTargetExclHome = fireTargetExclHome == null ? null : deflate(fireTargetExclHome, fireFactor, euroView)
  const viewBalkVrijheidDoel = deflate(balkVrijheidDoel, fireFactor, euroView)
  const viewEffectiveFireTarget = deflate(effectiveFireTarget, fireFactor, euroView)
  const viewVermogenOpAnker = vermogenOpAnker == null ? null : deflate(vermogenOpAnker, ankerFactor, euroView)
  const viewMonthlyWithdrawalAtAow =
    monthlyWithdrawalAtAow == null ? null : deflate(monthlyWithdrawalAtAow, aowFactor, euroView)

  // ── Lab-dekkingsas: eindvermogen als derde component (ADR 0145 D12) ───────
  // Klasse S — één bedrag op de EINDLEEFTIJD van het plan, dus de factor van díé leeftijd
  // (zelfde patroon als `viewTargetEndPortfolio`/`viewEffectiveFireTarget`). Basis en wat-als
  // delen die ene factor: `displayUnifiedRows` volgt de wat-als-rijen, en twee deflatoren
  // zouden de delta-badge een inflatie-artefact laten tonen i.p.v. het effect van de knoppen.
  // `labDekking.*Eindvermogen` blijft NOMINAAL (dat is ook het doelbedrag dat de sheet
  // schrijft); alleen de weergave hieronder is gedeflateerd.
  const eindvermogenFactor = useMemo(
    () => factorAtAge(displayUnifiedRows, labDekking?.eind ?? chartEndAge),
    [displayUnifiedRows, labDekking, chartEndAge],
  )
  // Eindreview I1 — alleen een `bedrag` (de run haalt de eindleeftijd) wordt omgezet; een
  // opgeraakte run (`op`) heeft geen bedrag en dus niets om te deflateren.
  const basisEindvermogenUitkomst = labDekking?.basisEindvermogen ?? null
  const scenarioEindvermogenUitkomst = labDekking?.scenarioEindvermogen ?? null
  const viewBasisEindvermogen =
    basisEindvermogenUitkomst?.kind === 'bedrag'
      ? deflate(basisEindvermogenUitkomst.nominaal, eindvermogenFactor, euroView)
      : null
  const viewScenarioEindvermogen =
    scenarioEindvermogenUitkomst?.kind === 'bedrag'
      ? deflate(scenarioEindvermogenUitkomst.nominaal, eindvermogenFactor, euroView)
      : null
  /**
   * De uitkomstregel boven de knoppen — AL GEFORMATTEERD (het component formatteert niets).
   * Onder een vast stopmoment de drie grootheden die de dekkingsbalk-tegels toonden
   * (reikt tot · gedekt · eindvermogen), onder `solved` de vrijheidsleeftijd en het verschil.
   * Consume-only: elk getal komt uit `labUitkomst` (ADR 0145) en de euro's uit het
   * euro-weergave-blok hierboven — hier wordt niets herrekend en niets gedeflateerd.
   */
  const labUitkomstRegel = useMemo<LabUitkomstRegel | null>(() => {
    const pijl = (a: string, b: string | null) => (b != null && b !== a ? `${a} → ${b}` : a)
    if (labDekking != null) {
      if (labDekking.basisPct == null) return null
      const euro = (v: number | null, uitkomst: LabEindvermogen | null): string | null => {
        if (uitkomst == null) return null
        if (uitkomst.kind === 'op') return eindvermogenOpTegel(labDekking.eind)
        if (masked || v == null) return MASKED_AMOUNT_PLACEHOLDER
        return formatCurrency(v)
      }
      const basisEuro = euro(viewBasisEindvermogen, basisEindvermogenUitkomst)
      return {
        kind: 'dekking',
        reikt: pijl(
          ankerKort(labDekking.basisReach),
          labDekking.scenarioReach != null ? ankerKort(labDekking.scenarioReach) : null,
        ),
        gedekt: pijl(
          dekkingBadge(labDekking.basisPct),
          labDekking.scenarioPct != null ? dekkingBadge(labDekking.scenarioPct) : null,
        ),
        eindvermogen:
          basisEuro == null
            ? null
            : pijl(basisEuro, euro(viewScenarioEindvermogen, scenarioEindvermogenUitkomst)),
      }
    }
    if (labUitkomst.kind !== 'vrijheidsleeftijd' || labUitkomst.basisFireAge == null) return null
    const { basisFireAge, scenarioFireAge, deltaMaanden } = labUitkomst
    return {
      kind: 'vrijheidsleeftijd',
      vrijOp: pijl(formatAge(basisFireAge), scenarioFireAge != null ? formatAge(scenarioFireAge) : null),
      verschil:
        deltaMaanden == null || Math.abs(deltaMaanden) < 1
          ? 'gelijk'
          : `${Math.abs(deltaMaanden)} mnd ${deltaMaanden < 0 ? 'eerder' : 'later'} vrij`,
    }
  }, [
    labDekking,
    labUitkomst,
    masked,
    viewBasisEindvermogen,
    viewScenarioEindvermogen,
    basisEindvermogenUitkomst,
    scenarioEindvermogenUitkomst,
  ])

  // De delta-badge naast `lab-dekking-badge`: alleen als basis ÉN wat-als allebei een bedrag
  // hebben (I1 — bij een (dreigend) tekort draagt de dekkings-badge de beweging al), weg bij
  // maskeren, en weg onder de drempel (M5: een paar euro verschil is ruis).
  const viewLabEindvermogenVerschil =
    !masked && viewBasisEindvermogen != null && viewScenarioEindvermogen != null
      ? Math.round(viewScenarioEindvermogen - viewBasisEindvermogen)
      : 0
  const viewLabEindvermogenDelta =
    Math.abs(viewLabEindvermogenVerschil) >= EINDVERMOGEN_DELTA_DREMPEL ? viewLabEindvermogenVerschil : 0
  // De vaste preview-rij "Eindvermogen" in het vastleg-venster (promotie `eindvermogen`):
  // toont de bedragen in de actieve weergave — de doelwaarde die de sheet schrijft blijft
  // nominaal (`handleDoelVastleggen`). Eindreview I4: staat de weergave op huidige euro's en
  // wijkt het opgeslagen (nominale) bedrag ≥ 1 % af, dan noemt de rij dat bedrag erbij, zodat
  // de doelkaart na de klik geen onverklaard ander getal toont. Aan de overige rijen
  // (`doelPreviews`) verandert niets.
  const viewDoelPreviews = useMemo<DoelParameterPreview[]>(() => {
    if (
      labPromotie.kind !== 'eindvermogen' ||
      viewBasisEindvermogen == null ||
      viewScenarioEindvermogen == null ||
      scenarioEindvermogenUitkomst?.kind !== 'bedrag'
    ) {
      return doelPreviews
    }
    const opgeslagen = scenarioEindvermogenUitkomst.nominaal
    const noot =
      euroView === 'real' && !masked && Math.abs(opgeslagen - viewScenarioEindvermogen) >= 0.01 * Math.abs(opgeslagen)
        ? ` ${eindvermogenOpgeslagenNoot(opgeslagen)}`
        : ''
    return [
      ...doelPreviews,
      {
        parameter: 'eindvermogen',
        label: 'Eindvermogen',
        waarde: `${eindvermogenPreviewWaarde(viewBasisEindvermogen, viewScenarioEindvermogen, labDekking?.eind ?? null, masked)}${noot}`,
        vast: true,
      },
    ]
  }, [doelPreviews, labPromotie, viewBasisEindvermogen, viewScenarioEindvermogen, scenarioEindvermogenUitkomst, euroView, labDekking, masked])

  // ── Cijferbar (LifelineReadout) ───────────────────────────────────────────
  // `netWorth` is klasse S op de gehoverde leeftijd, `monthlyAmount` klasse F in
  // datzelfde jaar — beide dus met de factor van díé rij. De vrijheidstijd volgt
  // het bedrag automatisch: het dagtarief is per definitie een grootheid van
  // VANDAAG en deflateert nooit (D15). Zou je de noemer "voor de consistentie"
  // ook aanpakken, dan pas je de deflatie twee keer toe.
  const viewReadoutData = useMemo(() => {
    if (readoutData == null) return null
    if (euroView === 'nominal') return readoutData
    const factor = factorAtAge(displayUnifiedRows, readoutData.age)
    const netWorth = deflate(readoutData.netWorth, factor, euroView)
    return {
      ...readoutData,
      netWorth,
      monthlyAmount: deflate(readoutData.monthlyAmount, factor, euroView),
      freedomTime: formatFreedomTimeString(
        calculateFreedomTime(Math.max(0, netWorth), canonicalDailyRate),
        'short',
      ),
    }
  }, [readoutData, displayUnifiedRows, euroView, effectiveInput])

  // ── Inkomsten & uitgaven-strook (bronnen-breakdown) ───────────────────────
  // Elke waarde is een jaarstroom in één projectiejaar (klasse F) ⇒ de factor van
  // díé rij. De `*BySource`-records lopen per sleutel door `deflate()` — geen
  // handgerolde deling, zodat de onbruikbare-factor-regel (0/NaN/∞ ⇒ ongemoeid)
  // óók hier geldt. Zonder dit zou wisselen tussen 'totalen' en 'bronnen' twee
  // verschillende grondslagen in dezelfde grafiek tonen.
  const viewIeBreakdownResult = useMemo(() => {
    if (ieBreakdownResult == null || euroView === 'nominal') return ieBreakdownResult
    const deflateRecord = (record: Record<string, number>, factor: number) =>
      Object.fromEntries(
        Object.entries(record).map(([key, value]) => [key, deflate(value, factor, euroView)]),
      )
    return {
      ...ieBreakdownResult,
      rows: ieBreakdownResult.rows.map(row => {
        const factor = factorByAge.get(row.age) ?? 1
        return {
          ...row,
          incomeBySource: deflateRecord(row.incomeBySource, factor),
          expenseBySource: deflateRecord(row.expenseBySource, factor),
          totalIncome: deflate(row.totalIncome, factor, euroView),
          totalExpenses: deflate(row.totalExpenses, factor, euroView),
          surplus: deflate(row.surplus, factor, euroView),
        }
      }),
    }
  }, [ieBreakdownResult, factorByAge, euroView])

  // ── Scenario-kaarten ──────────────────────────────────────────────────────
  // `laagsteBuffer` is klasse S: één bedrag op één leeftijd (de kaart toont die
  // leeftijd er letterlijk naast, "op 63") ⇒ de factor van díé leeftijd.
  // `maandruimteOfDelta` blijft ongemoeid: dat is de INSTELLING van de kaart
  // (−€300/mnd, +€250/mnd) — een bedrag van vandaag, geen projectiebedrag.
  // De status-flag (BASIS/GROEN/AMBER/ROOD) blijft op de nominale buffers staan:
  // die vergelijkt de PLANNEN onderling en is geen euro (klasse R).
  const viewScenarioPresets = useMemo(
    () =>
      scenarioPresets == null || euroView === 'nominal'
        ? scenarioPresets
        : scenarioPresets.map(kaart => ({
            ...kaart,
            laagsteBuffer:
              kaart.laagsteBuffer == null
                ? null
                : {
                    ...kaart.laagsteBuffer,
                    bedrag: deflate(
                      kaart.laagsteBuffer.bedrag,
                      factorAtAge(displayUnifiedRows, kaart.laagsteBuffer.age),
                      euroView,
                    ),
                  },
          })),
    [scenarioPresets, displayUnifiedRows, euroView],
  )

  // ── Huishoud-/partner-doel (5a, nazorg R2+R3) ─────────────────────────────
  // `householdHero`/`partnerHero` dragen `fireTarget` als puntbedrag op hun
  // FIRE-leeftijd, uitgedrukt op de leeftijd-as van de ingelogde gebruiker
  // (dezelfde as als de hero-KPI's die `Math.round(fireAge)` tonen). De
  // deflator hangt alleen af van het aantal jaren tot dat moment, dus dezelfde
  // genormaliseerde lookup als het solo-doel (`fireAgeForDisplay`, KRUIS-27).
  // Tot 3 sep 2026 gingen deze bedragen NOMINAAL de approx-naad in, onder
  // hetzelfde "ca."-voorbehoud als het (wél gedeflateerde) solo-doel — één
  // voorbehoud dat twee conventies verborg.
  const viewHouseholdHeroFireTarget = useMemo(
    () =>
      householdHero == null
        ? null
        : deflate(
            householdHero.fireTarget,
            factorAtAge(displayUnifiedRows, fireAgeForDisplay(householdHero.fireAge)),
            euroView,
          ),
    [householdHero, displayUnifiedRows, euroView],
  )
  const viewPartnerHeroFireTarget = useMemo(
    () =>
      partnerHero == null
        ? null
        : deflate(
            partnerHero.fireTarget,
            factorAtAge(displayUnifiedRows, fireAgeForDisplay(partnerHero.fireAge)),
            euroView,
          ),
    [partnerHero, displayUnifiedRows, euroView],
  )

  // ── EINDE EURO-WEERGAVE ────────────────────────────────────────────────────

  return {
    viewDisplaySimRows,
    viewWealthCompositionRows,
    viewPartnerLineRows,
    viewHouseholdMainLineRows,
    viewLiquidWealthPoints,
    viewCombinedScenarioOverlays,
    viewHouseholdOverlays,
    viewMonteCarloOverlay,
    viewFireTarget,
    viewFireTargetInclHome,
    viewTargetEndPortfolio,
    viewTargetInflationFactors,
    viewFireTargetExclHome,
    viewBalkVrijheidDoel,
    viewEffectiveFireTarget,
    viewVermogenOpAnker,
    viewMonthlyWithdrawalAtAow,
    labUitkomstRegel,
    viewDoelPreviews,
    viewReadoutData,
    viewIeBreakdownResult,
    viewScenarioPresets,
    viewHouseholdHeroFireTarget,
    viewPartnerHeroFireTarget,
  }
}

/**
 * De provider-kant van de grens (ADR 0179 fase 1 stap 14): zet de concern-waarden van de
 * state-provider om in de nominale invoer van `useEuroViewFeeds` en deelt het resultaat
 * gememoïseerd, zodat de euro-context alleen verandert als een feed verandert. Hier wordt
 * niets gedeeld of omgerekend — alleen doorgegeven.
 */
export function useToekomstEuro({
  perspectief,
  sim,
  scenario,
  lagen,
}: {
  perspectief: ToekomstPerspectief
  sim: ToekomstSim
  scenario: ToekomstScenario
  lagen: ToekomstLagen
}) {
  const { masked } = useMaskedAmounts()
  const feeds = useEuroViewFeeds({
    displayUnifiedRows: sim.displayUnifiedRows,
    displaySimRows: sim.displaySimRows,
    displayEffectiveSimRows: sim.displayEffectiveSimRows,
    wealthCompositionRows: lagen.wealthCompositionRows,
    partnerLine: perspectief.partnerLine,
    householdMainLine: perspectief.householdMainLine,
    liquidWealthPoints: sim.liquidWealthPoints,
    combinedScenarioOverlays: lagen.combinedScenarioOverlays,
    householdOverlays: perspectief.householdOverlays,
    monteCarloOverlay: lagen.monteCarloOverlay,
    simResult: sim.simResult,
    fireTargetInclHome: sim.fireTargetInclHome,
    chartEndAge: sim.chartEndAge,
    targetInflationFactors: sim.targetInflationFactors,
    userAowAge: sim.userAowAge,
    fireTargetExclHome: sim.fireTargetExclHome,
    balkVrijheidDoel: sim.balkVrijheidDoel,
    effectiveFireTarget: sim.effectiveFireTarget,
    vermogenOpAnker: sim.vermogenOpAnker,
    monthlyWithdrawalAtAow: sim.monthlyWithdrawalAtAow,
    labDekking: scenario.labDekking,
    labUitkomst: scenario.labUitkomst,
    masked,
    labPromotie: scenario.labPromotie,
    doelPreviews: scenario.doelPreviews,
    readoutData: lagen.readoutData,
    canonicalDailyRate: sim.canonicalDailyRate,
    effectiveInput: sim.effectiveInput,
    ieBreakdownResult: lagen.ieBreakdownResult,
    scenarioPresets: sim.scenarioPresets,
    householdHero: perspectief.householdHero,
    partnerHero: perspectief.partnerHero,
  })
  return useStabielObject(feeds)
}

export type ToekomstEuro = ReturnType<typeof useToekomstEuro>
