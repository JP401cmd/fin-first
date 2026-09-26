'use client'

// Verplaatst uit components/app/horizon/horizon-client.tsx (ADR 0179 fase 1, stap 13).
//
// Perspectief (eigen/huishouden/partner): de huishoud- en partnerprojectie (E6) en de
// afleidingen die de lijnkeuze en de lab-zichtbaarheid dragen.
//
// Pure move: de statements staan in dezelfde onderlinge volgorde als in horizon-client,
// met dezelfde dependency-arrays. De provider (`toekomst-state-provider.tsx`) roept deze
// hook aan en deelt het resultaat per concern via een eigen context.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { FinancialInput } from '@/lib/horizon-data'
import { buildHouseholdProjectionInput, type HouseholdProjectionResult } from '@/lib/household-projection'
import { usePerspective } from '@/components/app/perspective-provider'
import type { HouseholdPartnerOverlay } from '@/components/app/horizon/sim-chart'
import { simRowsToChartPoints } from '@/lib/horizon/sim-chart-geometry'
import type { HouseholdHeroData, HouseholdMainLine, HouseholdRetireInfo, PartnerLine } from '@/components/toekomst/state/types'
import { useStabielObject } from './use-stabiel-object'

export function useToekomstPerspectief() {
  const { perspective, partnerName, perspectiveVersion, refreshData } = usePerspective()
  const isHouseholdView = perspective === 'household'
  const isPartnerView = perspective === 'partner'
  const [householdHero, setHouseholdHero] = useState<HouseholdHeroData | null>(null)
  const [partnerHero, setPartnerHero] = useState<HouseholdHeroData | null>(null)
  const [householdInput, setHouseholdInput] = useState<FinancialInput | null>(null)
  const [householdOverlays, setHouseholdOverlays] = useState<HouseholdPartnerOverlay[] | null>(null)
  // Gezamenlijke lijn als HOOFDLIJN in huishoudweergave (matcht de hero-FIRE),
  // zodat de prominente lijn + marker het huishouden tonen i.p.v. de eigen lijn.
  const [householdMainLine, setHouseholdMainLine] = useState<HouseholdMainLine | null>(null)
  // Partner-projectie-pad (voor het wisselen van de hoofdlijn in partner-view).
  // `rows` is leeg wanneer de partner alleen 'totals' deelt of z'n toekomst
  // verbergt — dan tonen we geen partner-lijn (graceful degrade).
  const [partnerLine, setPartnerLine] = useState<PartnerLine | null>(null)
  // Levensgebeurtenissen van de PARTNER (read-only markers op de grafiek in
  // huishouden- + partner-view). Alleen naam + leeftijd + icoon — nooit
  // bewerkbaar (geen sourceId), nooit de partner's natuurlijke mijlpalen.
  const [partnerLifeEvents, setPartnerLifeEvents] = useState<
    Array<{
      id: string
      name: string
      /** Leeftijd op de as van de PARTNER (zoals opgeslagen). */
      targetAge: number | null
      /** Dezelfde gebeurtenis op de as van de KIJKER (DOB-verschoven; TPR-07 fase 2a). */
      targetAgeOnOwnAxis: number | null
      icon?: string
    }>
  >([])
  const [householdRetireInfo, setHouseholdRetireInfo] = useState<HouseholdRetireInfo>(null)

  // Laad huishouden-/partner-FIRE-data bij perspectief-wissel.
  //
  // BRON VAN WAARHEID: buildHouseholdProjectionInput — DEZELFDE engine die de
  // HouseholdFireSection en de gecombineerde FIRE-leeftijd voedt. Hierdoor komt
  // de gecombineerde lijn in de grafiek EXACT overeen met de getoonde
  // gezamenlijke FIRE-leeftijd (de oude /api/household/fire-projections gebruikte
  // de lichtgewicht projectForward → inconsistente lijn).
  useEffect(() => {
    if (!isHouseholdView && !isPartnerView) {
      setHouseholdHero(null)
      setPartnerHero(null)
      setHouseholdInput(null)
      setHouseholdOverlays(null)
      setHouseholdMainLine(null)
      setPartnerLine(null)
      setPartnerLifeEvents([])
      setHouseholdRetireInfo(null)
      return
    }
    let cancelled = false
    async function loadHouseholdData() {
      try {
        const supabase = createClient()
        const result: HouseholdProjectionResult = await buildHouseholdProjectionInput(supabase)
        if (cancelled) return
        if (!result.hasHousehold) return

        // Niet-huidige partner-entry (voor partner-lijn + partner-events).
        const partnerEntry = result.partners.find(p => !p.isCurrentUser) ?? null

        if (isHouseholdView) {
          const cp = result.combined.projection
          setHouseholdHero({
            householdName: result.householdName,
            fireAge: cp.fireAge,
            fireTarget: cp.fireTarget,
            freedomPercentage: cp.freedomPercentage,
            countdownDays: cp.countdownDays,
            fireDate: cp.fireDate,
            freedomYears: cp.freedomYears,
            freedomMonths: cp.freedomMonths,
            savingsRate: cp.savingsRate,
            // Methode-afhankelijke gecombineerde uitgave na pensioen (auto/som/eigen).
            retirementExpense: result.comparison.combinedRetirementExpenses,
          })
          // Gecombineerde FinancialInput voor het backtesting-/Monte-Carlo-modal
          // (huishouden-perspectief). Afgeleid uit dezelfde combined-projectie
          // zodat het modal het gezamenlijke vermogen backtest i.p.v. eigen-data.
          // Head = de KIJKER (TPR-07 fase 2a): de gecombineerde projectie loopt op de
          // eigen as, dus het backtest-/MC-modal krijgt de eigen geboortedatum.
          const headDob = result.partners.find(p => p.isCurrentUser)?.financials.dateOfBirth ?? null
          setHouseholdInput({
            totalAssets: result.comparison.combinedNetWorth,
            totalDebts: 0,
            monthlyIncome: result.comparison.combinedMonthlyIncome,
            monthlyExpenses: result.comparison.combinedMonthlyExpenses,
            yearlyMustExpenses: result.comparison.combinedRetirementExpenses,
            monthlyContributions: cp.monthlySavings,
            dateOfBirth: headDob,
          })
          // Huishouden-view: de GECOMBINEERDE lijn is de HOOFDLIJN (matcht de
          // hero-FIRE-leeftijd), zodat de prominente lijn + marker het huishouden
          // tonen i.p.v. de eigen lijn (die anders een afwijkende FIRE-leeftijd
          // liet zien). Het pad komt 1-op-1 uit de unified combined-projectie.
          if (result.combined.rows.length > 0) {
            setHouseholdMainLine({
              rows: result.combined.rows,
              fireAge: cp.fireAge,
              fireAgeFractional: result.combined.fireAgeFractional,
              currentAge: cp.currentAge,
              partnerAowAge: result.combined.partnerAowAge,
            })
          } else {
            setHouseholdMainLine(null)
          }
          // Eigen lijn als overlay. Sinds TPR-07 fase 2a is de kijker altijd de head
          // (de gecombineerde lijn loopt op de eigen as), dus de overlay klopt voor
          // élke partner — de oude "alleen als je de oudste bent"-regel is vervallen.
          // Bron = household-projectie (matcht de partnerkaart), niet de losse pagina-sim.
          const me = result.partners.find(p => p.isCurrentUser)
          const ownOverlays: HouseholdPartnerOverlay[] = []
          if (me && me.rows.length > 0) {
            ownOverlays.push({
              name: 'Jouw projectie',
              color: '#b89968', // lichter horizon
              points: simRowsToChartPoints(me.rows),
              fireAge: me.projection.fireAge,
              fireAgeFractional: me.fireAgeFractional,
              isDashed: true,
            })
          }
          setHouseholdOverlays(ownOverlays.length > 0 ? ownOverlays : null)
          setHouseholdRetireInfo({
            candidates: result.comparison.householdRetirementCandidates,
            method: result.comparison.householdRetirementMethod,
          })
          setPartnerHero(null)
          setPartnerLine(null)
        } else if (isPartnerView && partnerEntry) {
          const pp = partnerEntry.projection
          setPartnerHero({
            householdName: partnerEntry.fullName ?? partnerName ?? 'Partner',
            fireAge: pp.fireAge,
            fireTarget: pp.fireTarget,
            freedomPercentage: pp.freedomPercentage,
            countdownDays: pp.countdownDays,
            fireDate: pp.fireDate,
            freedomYears: pp.freedomYears,
            freedomMonths: pp.freedomMonths,
            savingsRate: pp.savingsRate,
            // Eigen uitgave na pensioen van de partner.
            retirementExpense: partnerEntry.financials.yearlyMustExpenses ?? 0,
          })
          setHouseholdHero(null)
          setHouseholdOverlays(null)
          setHouseholdMainLine(null)
          setHouseholdInput(null)
          setHouseholdRetireInfo(null)
          // Partner-view: vervang de hoofdlijn door het partner-pad zodat de
          // as + FIRE-markers op de partner uitlijnen. Leeg pad ('totals' of
          // toekomst verborgen) → null → degradeer naar de eigen lijn.
          setPartnerLine(
            partnerEntry.rows.length > 0
              ? {
                  rows: partnerEntry.rows,
                  fireAge: pp.fireAge,
                  fireAgeFractional: partnerEntry.fireAgeFractional,
                  currentAge: partnerEntry.settings.currentAge,
                }
              : null,
          )
        }

        // Partner-levensgebeurtenissen (read-only markers) — in zowel
        // huishouden- als partner-view. Alleen de PERSOONLIJKE events van de
        // partner (gedeelde events tonen we al via de eigen overlay). De
        // `target_age` staat op de as van de PARTNER; voor de huishoudblik (eigen
        // as, TPR-07 fase 2a) schuiven we 'm met het leeftijdsverschil op. Zonder
        // beide leeftijden geen verschuiving mogelijk → geen marker op de eigen as.
        const myAge = result.partners.find(p => p.isCurrentUser)?.settings.currentAge ?? null
        const partnerAge = partnerEntry?.settings.currentAge ?? null
        const ageShift = myAge != null && partnerAge != null ? partnerAge - myAge : null
        setPartnerLifeEvents(
          partnerEntry
            ? partnerEntry.lifeEvents
                .filter(ev => ev.ownership !== 'shared')
                .map(ev => ({
                  id: ev.id,
                  name: ev.name,
                  targetAge: ev.targetAge,
                  targetAgeOnOwnAxis: ev.targetAge != null && ageShift != null ? ev.targetAge - ageShift : null,
                  icon: ev.icon,
                }))
            : [],
        )
      } catch {
        // Niet kritisch — val terug op persoonlijke data.
      }
    }
    loadHouseholdData()
    return () => { cancelled = true }
    // perspectiveVersion: herlaad ook na een data-wijziging (bv. aangepaste
    // huishoud-uitgave na pensioen) zodat hero + grafieklijn meteen bijwerken.
  }, [isHouseholdView, isPartnerView, partnerName, perspectiveVersion])
  // Partner-view: vervang de hoofdlijn door het PARTNER-pad (eigen as + FIRE-
  // markers op de partner). Alleen wanneer er een precies partner-pad is
  // (`partnerLine` niet-null); anders degraderen we naar de eigen lijn zodat de
  // grafiek nooit leeg/kapot is. In persoonlijk + huishouden-view blijft de
  // hoofdlijn de EIGEN lijn (huishouden voegt de gecombineerde overlay toe).
  const usePartnerMainLine = isPartnerView && partnerLine !== null
  // Huishouden-view: de gecombineerde lijn is de hoofdlijn (matcht de hero-FIRE).
  const useHouseholdMainLine = isHouseholdView && householdMainLine !== null

  // Rendert KATERN II ("Verken je aannames" / "Jouw doelsituatie")?
  //
  // ÉÉN afleiding, twee lezers: de sectie zelf en de meeklap-toets van KATERN III
  // ("doel dicht = alles dicht"). Die stonden tot melding B-031 als twee
  // handgetypte kopieën in het bestand — precies de constructie die stil uiteen
  // loopt zodra er een tak bijkomt.
  //
  // Perspectief-gate: alleen solo (géén partner/huishouden), spiegelt de
  // chart-overlay. Op een partner-/huishoudlijn slaan de knoppen nergens op —
  // die tekent andere rijen dan waar het lab op rekent.
  //
  // Verder GEEN gate meer op de weergavemodus (eigenaarskeuze 20 sep 2026): het
  // doelscenario staat óók in Eenvoudig. De oude voorwaarde ("alleen als er al
  // een doel is") paste bij het blok van vóór ADR 0170 — twee genummerde panelen
  // met duidingslagen. Wat er nu staat zijn vijf knoppen die zélf hun grens
  // dragen; dat is juist de eenvoudige vorm, en het achterhouden ervan verbergt
  // de manier waaróp je een doel maakt voor precies de lezer die de eenvoudige
  // weergave koos.
  const verkenSectieZichtbaar = !(usePartnerMainLine || useHouseholdMainLine)

  // Unified perspective hero: household or partner override.
  // Verhuisd uit de compositie (ADR 0179 fase 1 stap 15): canvas én Plan-paneel lezen
  // dezelfde keuze, dus één afleiding hier in plaats van een kopie per katern.
  const perspectiveHero = isHouseholdView ? householdHero : isPartnerView ? partnerHero : null
  const hasPerspectiveHero = perspectiveHero != null

  return useStabielObject({
    partnerName,
    refreshData,
    isHouseholdView,
    isPartnerView,
    householdHero,
    partnerHero,
    householdInput,
    householdOverlays,
    householdMainLine,
    partnerLine,
    partnerLifeEvents,
    householdRetireInfo,
    usePartnerMainLine,
    useHouseholdMainLine,
    verkenSectieZichtbaar,
    perspectiveHero,
    hasPerspectiveHero,
  })
}

export type ToekomstPerspectief = ReturnType<typeof useToekomstPerspectief>
