'use client'

// Verplaatst uit components/app/horizon/horizon-client.tsx (ADR 0179 fase 1, stap 13).
//
// Meldingen: de SIGNALEN achter tekort-lening, AOW ontbreekt, eindsituatie en "huis
// nooit verkocht" — detectie, zichtbaarheid (view-gating) en de copy uit dezelfde run.
// Sinds fase 2 (ADR 0179 D6, stroom W2) hoort de minimaliseer-toestand hier NIET meer:
// die woont per katern-route in `components/toekomst/meldingen/toekomst-katern-meldingen.tsx`
// (`useKaternMeldingMinimize`), dat deze signalen via `wijsMeldingenToe` aan een katern
// toewijst. De drie losse notice-providers (Deficit/Aow/Eindsituatie) en hun punten in de
// paginakop zijn weg.
//
// De provider (`toekomst-state-provider.tsx`) roept deze hook aan en deelt het resultaat
// per concern via een eigen context.

import { useMemo } from 'react'
import type { HorizonPageData } from '@/lib/horizon-data-loader'
import { detectDeficitLoanFromRows } from '@/lib/horizon/deficit-loan-display'
import { detectReverseMortgageStartAge } from '@/lib/horizon/reverse-mortgage-start'
import type { DeficitLoanCopyInput } from '@/lib/horizon/deficit-loan-copy'
import { detectEindsituatie } from '@/lib/horizon/eindsituatie-duiding'
import { resolveFirePlanWithOverride } from '@/lib/fire-strategy'
import { useStabielObject } from './use-stabiel-object'
import type { ToekomstPerspectief } from './use-toekomst-perspectief'
import type { ToekomstSim } from './use-toekomst-sim'

export function useToekomstMeldingen({ initialData, perspectief, sim }: { initialData: HorizonPageData; perspectief: ToekomstPerspectief; sim: ToekomstSim }) {
  const {
    usePartnerMainLine,
  } = perspectief
  const {
    input,
    fireStrategy,
    kernelRawProfile,
    userAowAge,
    simResult,
    unifiedRows,
    kernelHousingSale,
    aowOntbreekt,
    currentAge,
    homeExcludedFromProgress,
    isPensioenMode,
    displayEndAge,
  } = sim

  // ── V7 tekort-lening-zichtbaarheid ──────────────────────────────────────
  // De grafiek plot netWorth (tekort al gesaldeerd) en vloert op 0 — een
  // aangesproken tekort-lening is dan onzichtbaar. We detecteren 'm uit de rijen
  // (eerste leeftijd + piek) voor een expliciete stoplicht-melding + tijdlijn-
  // marker. Alleen de kernel-bridge levert debtBalances['tekort-lening'], dus dit
  // is per constructie kernel-only (v2-rijen → null). Vóór chartEventOverlay
  // gedeclareerd zodat de marker-builder 'm mag consumeren (geen TDZ).
  //
  // Besluit 4 juli 2026: de tekort-lening-staart op/na de eindleeftijd is
  // modelmarge en wordt niet gemeld → cutoff op `displayEndAge − 1`.
  // `simResult.displayEndAge` = `solve.eindleeftijd` = de eindleeftijd die de
  // kernel voor DÉZE run hanteerde: bij 'Vermogen opeten'/'Nalatenschap' de
  // plan-eindleeftijd (fire_end_age, bv. 93), bij perpetual/pensioen de
  // horizon-cap 100 (geen bewuste deplete-staart → een tekort vóór 100 is een
  // echt signaal, geen marge). Dat is precies de "eindleeftijd" uit het besluit.
  const deficitLoanNotice = useMemo(
    () => detectDeficitLoanFromRows(unifiedRows, { endAge: simResult?.displayEndAge }),
    [unifiedRows, simResult?.displayEndAge],
  )

  // Werkelijk startmoment van de opeethypotheek in DEZE run — bij "wanneer nodig"
  // volgt dat uit de projectie, niet uit de instelling.
  const reverseMortgageStartAge = useMemo(
    () =>
      initialData.housingStrategy?.mode === 'reverse_mortgage'
        ? detectReverseMortgageStartAge(unifiedRows)
        : null,
    [initialData.housingStrategy, unifiedRows],
  )

  // "Huis wordt nooit verkocht"-melding (Wft-veilig, beschrijvend). Verschijnt
  // wanneer downsize + on_depletion nooit triggert: het huis blijft staan en
  // domineert het getoonde eindvermogen. Alle bedragen consume-only uit de
  // laatste unifiedRow + de strategie-config — geen eigen scommen.
  const housingHeldNotice = useMemo(() => {
    // "Huis wordt nooit verkocht": alleen bij een downsize-strategie met de
    // "wanneer nodig"-trigger (on_depletion) waar de kernel binnen de horizon géén
    // verkoop deed (`kernelHousingSale === null`). Bij een verkoop levert de kernel
    // een verkoop-event; andere modi/triggers passen niet bij de melding-tekst.
    const hs = initialData.housingStrategy
    const housingHeldToEnd =
      hs?.mode === 'downsize' && hs.trigger === 'on_depletion' && kernelHousingSale === null
    if (!housingHeldToEnd) return null
    const rows = unifiedRows ?? []
    if (rows.length === 0) return null
    const lastRow = rows[rows.length - 1]
    const houseValue = Math.round(lastRow.assetBuckets.eigen_huis?.endValue ?? 0)
    const netWorth = Math.round(lastRow.netWorth)
    if (houseValue <= 0 || netWorth <= 0) return null
    const sharePct = Math.round((houseValue / netWorth) * 100)
    // Reëel erfenisdoel: het door de gebruiker ingestelde (niet-geïndexeerde)
    // bedrag indien legacy-strategie; anders het nominale eind-doel terug naar
    // "nu" gerekend via de inflatie-indexfactor op eindleeftijd.
    const realLegacyTarget =
      fireStrategy?.strategy === 'legacy' && (fireStrategy.legacyAmount ?? 0) > 0
        ? Math.round(fireStrategy.legacyAmount)
        // Dit bedrag is PER DEFINITIE het reële erfenisdoel ("je doel in geld van
        // vandaag"), ongeacht de gekozen weergave: geen omzetting, maar de
        // betekenis van de melding zelf. In 'real' nóg een keer delen zou het doel
        // stilletjes verkleinen — precies de dubbele deflatie die dit werk uitsluit.
        // euro-view: exempt — reëel by design, ongeacht de weergave.
        : lastRow.inflationFactor > 0
          // euro-view: exempt — zelfde reden als hierboven: dit is het doel-van-nu.
          ? Math.round((simResult?.targetEndPortfolio ?? 0) / lastRow.inflationFactor)
          : 0
    return {
      houseValue,
      sharePct,
      endAge: lastRow.age,
      realLegacyTarget,
    }
  }, [initialData.housingStrategy, kernelHousingSale, unifiedRows, fireStrategy, simResult])

  // ── Tekort-lening-melding: zichtbaarheid ─────────────────────────────────
  // View-gating spiegelt de tijdlijn-marker: in partner-weergave mét partner-pad
  // plot de grafiek de pártnerlijn — dan hoort het eigen tekort-verhaal er niet.
  // Minimaliseren gaat per katern (Plan), niet meer per melding.
  const deficitNoticeVisible = deficitLoanNotice != null && !usePartnerMainLine

  // ── "AOW ontbreekt"-melding (TPR-04) ───────────────────────────────────────
  // De adapter-notice (code `aow_ontbreekt`) komt via de run mee (`aowOntbreekt`);
  // zelfde view-gating als de tekort-melding: in partner-weergave mét partner-pad
  // hoort het eigen AOW-verhaal er niet. Woont in katern Instellingen.
  const aowNoticeVisible = Boolean(aowOntbreekt) && !usePartnerMainLine

  // ── Eindsituatie-duiding: "waarom blijft er aan het eind zoveel over?" ─────
  // Pure detector op DEZELFDE kernelrijen als de grafiek (`unifiedRows`); plan uit de
  // rauwe profielrij via dezelfde resolver als de kernel-adapter (incl. schaduwpad),
  // jaaruitgaven = de grondslag van deze run (`buildHorizonInput`: yearlyMustExpenses).
  // Bedragen blijven NOMINAAL; de euro-render-grens (`useMeldingBedragenInView`)
  // deflateert exact één keer.
  // View-gating als de tekort-melding; niet in pensioen-modus (vast stopmoment).
  const eindsituatiePlan = useMemo(
    () => (kernelRawProfile ? resolveFirePlanWithOverride(kernelRawProfile) : null),
    [kernelRawProfile],
  )
  const eindsituatieDuiding = useMemo(() => {
    if (!eindsituatiePlan || !unifiedRows || currentAge == null || isPensioenMode || usePartnerMainLine) return null
    return detectEindsituatie({
      rows: unifiedRows,
      endForm: eindsituatiePlan.endForm,
      endAge: simResult?.displayEndAge ?? eindsituatiePlan.endAge,
      legacyAmount: eindsituatiePlan.legacyAmount,
      legacyIncludeIlliquid: kernelRawProfile?.fire_legacy_include_illiquid === true,
      vastStopmoment: simResult?.stopAnker != null,
      fireAgeFractional: simResult?.fireAgeFractional ?? null,
      currentAge,
      geenTekortLeningAan: kernelRawProfile?.fire_no_deficit_loan !== false,
      jaarUitgavenNu: input?.yearlyMustExpenses ?? 0,
    })
  }, [eindsituatiePlan, unifiedRows, currentAge, isPensioenMode, usePartnerMainLine, simResult?.displayEndAge, simResult?.stopAnker, simResult?.fireAgeFractional, kernelRawProfile?.fire_legacy_include_illiquid, kernelRawProfile?.fire_no_deficit_loan, input?.yearlyMustExpenses])

  // Situatie-specifieke uitleg bij de melding. Alle getallen komen uit DEZELFDE
  // run (detector + `displayEndAge` + AOW-leeftijd + woonstrategie); de copy
  // zelf woont in een pure sibling-module met eigen toon-grendel.
  //
  // Hier alleen de NOMINALE basis (fixronde C1): de piek is een kernelbedrag op een
  // toekomstige leeftijd, dus bedrag én vrijheidstijd horen aan de euro-render-grens
  // (`useMeldingBedragenInView`). De meldingen-host vult `peakText`/`freedomText` daarna
  // en roept `buildDeficitLoanCopy`. Vroeger stond hier `formatWithFreedom(piek,
  // dagtarief)`: geen deflatie in de weergave, en een nominaal bedrag door een dagtarief
  // van vandaag gedeeld.
  const deficitLoanCopyBasis = useMemo<Omit<DeficitLoanCopyInput, 'peakText' | 'freedomText'> | null>(() => {
    if (!deficitLoanNotice || !deficitNoticeVisible) return null
    return {
      firstAge: deficitLoanNotice.firstAge,
      clearedAge: deficitLoanNotice.clearedAge,
      terugkeerAge: deficitLoanNotice.terugkeerAge,
      housing: initialData.housingContext.hasEigenHuis && initialData.housingStrategy
        ? {
            mode: initialData.housingStrategy.mode,
            saleAge: kernelHousingSale?.age ?? null,
            reverseMortgageStartAge,
          }
        : null,
      aowAge: userAowAge.fractional,
      displayEndAge,
      isPensioenMode,
      homeExcludedFromFire: homeExcludedFromProgress,
      geenTekortLeningAan: kernelRawProfile?.fire_no_deficit_loan !== false,
      vastStopmoment: simResult?.stopAnker != null,
    }
  }, [deficitLoanNotice, deficitNoticeVisible, userAowAge.fractional, displayEndAge, isPensioenMode, initialData.housingContext.hasEigenHuis, initialData.housingStrategy, kernelHousingSale, reverseMortgageStartAge, kernelRawProfile?.fire_no_deficit_loan, simResult?.stopAnker, homeExcludedFromProgress])

  // De leeftijd van het diepste punt, zodat de grens de kernelfactor van díé rij kan
  // nemen. De detector levert alleen het (afgeronde) bedrag; de rij met het hoogste
  // eindsaldo is de eerste waarvan het afgeronde saldo daaraan gelijk is. Een lookup,
  // geen tweede som.
  const deficitLoanPiekLeeftijd = useMemo(() => {
    if (!deficitLoanNotice || !unifiedRows) return null
    const rij = unifiedRows.find(
      (r) => Math.round(r.debtBalances['tekort-lening']?.endBalance ?? 0) === deficitLoanNotice.peak,
    )
    return rij?.age ?? null
  }, [deficitLoanNotice, unifiedRows])

  return useStabielObject({
    deficitLoanNotice,
    deficitLoanPiekLeeftijd,
    reverseMortgageStartAge,
    housingHeldNotice,
    aowNoticeVisible,
    eindsituatiePlan,
    eindsituatieDuiding,
    deficitLoanCopyBasis,
  })
}

export type ToekomstMeldingen = ReturnType<typeof useToekomstMeldingen>
