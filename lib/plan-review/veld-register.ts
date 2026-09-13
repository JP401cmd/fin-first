/**
 * Veld-register per schrijfroute — meebeweeg-check laag c (TPR-15, ontwerp-eis 7, ADR 0142).
 *
 * `register.ts` bewaakt de plan-review op `KernelInput`-blokniveau: elk kernelblok heeft een
 * plek. Dat vangt niet een NIEUW VELD op een bestaande schrijfroute — een extra kolom die
 * `/api/fire-settings` gaat schrijven, raakt geen nieuw blok maar kan wel een instelling zijn
 * die de wizard dan stil mist. Dit register sluit dat gat: élk veld dat een route uit de
 * body leest of wegschrijft, staat hier met zijn plek in de wizard (stap of laag 2 + de body
 * die het toont), of met `buitenWizard` en de reden.
 *
 * `veld-register.test.ts` scant de bronbestanden van elke route (`body.<veld>`,
 * `updatePayload.<veld>`, `.update({ … })`, zod-sleutels, …) en wordt rood bij een veld dat
 * hier ontbreekt, én bij een registratie die de bron niet meer noemt. Een nieuwe instelling
 * dwingt zo een keuze af: in de wizard opnemen, of expliciet en met reden erbuiten laten.
 *
 * Afbouwregel: een `buitenWizard` zonder inhoudelijke reden is niet toegestaan; de lijst mag
 * alleen krimpen doordat velden de wizard in komen.
 */

import type { PlanReviewStap } from './types'

export type VeldPlek =
  | {
      /** Waar de gebruiker het veld in de wizard instelt. */
      wizard: PlanReviewStap | 'laag2'
      /** De editor-body die het toont — dezelfde als op het bestaande scherm. */
      editor: string
    }
  | {
      /** Waarom dit veld bewust niet in de wizard staat. */
      buitenWizard: string
    }

export interface SchrijfrouteRegistratie {
  /** Bronbestanden die de body lezen of de rij schrijven (route + gedelegeerde validators). */
  bronnen: readonly string[]
  velden: Readonly<Record<string, VeldPlek>>
}

const EINDSTRATEGIE: VeldPlek = { wizard: 'plan', editor: 'EindstrategieBody' }
const UITGAVEN: VeldPlek = { wizard: 'uitgaven', editor: 'UitgavenMethodeKeuze + UitgavenEigenBedrag (UitgavenEditor)' }
const ONTTREKKING: VeldPlek = { wizard: 'potten', editor: 'OnttrekkingsstrategieBody (PottenEditor)' }
const POTREGELS: VeldPlek = { wizard: 'potten', editor: 'pot-regel-bodies (PottenEditor)' }
const WOONSTRATEGIE: VeldPlek = { wizard: 'woning', editor: 'HousingStrategySection (WoningEditor)' }
const VERKOOP: VeldPlek = { wizard: 'woning', editor: 'SaleConfigFields (WoningEditor)' }
const AOW: VeldPlek = { wizard: 'inkomsten', editor: 'AowStrategieBody (InkomstenEditor)' }
const WERK: VeldPlek = { wizard: 'inkomsten', editor: 'WerkStrategieBody (InkomstenEditor)' }
const POT: VeldPlek = { wizard: 'inkomsten', editor: 'PensioenPotBody (InkomstenEditor)' }
const MARKT: VeldPlek = { wizard: 'laag2', editor: 'VoorkeurBewerkenBody' }
const BOX3: VeldPlek = { wizard: 'laag2', editor: 'Box3MethodeBody' }
const TECHNISCH: VeldPlek = { buitenWizard: 'Technisch veld van de rij (id/eigenaar/tijdstempel), geen instelling.' }

export const SCHRIJFROUTE_VELD_REGISTER = {
  '/api/fire-settings': {
    bronnen: ['app/api/fire-settings/route.ts'],
    velden: {
      fire_stop_anchor: EINDSTRATEGIE,
      fire_stop_age: EINDSTRATEGIE,
      fire_end_strategy: EINDSTRATEGIE,
      fire_end_age: EINDSTRATEGIE,
      fire_legacy_amount: EINDSTRATEGIE,
      fire_legacy_include_illiquid: EINDSTRATEGIE,
      deficit_loan_rate: EINDSTRATEGIE,
      retirement_expense_method: UITGAVEN,
      retirement_expense_custom_amount: UITGAVEN,
      feature_preferences: {
        buitenWizard:
          'Alleen de legacy-echo fire_strategy_override (ADR 0129; F4 ruimt op) — geen keuze van de gebruiker.',
      },
    },
  },
  '/api/withdrawal-strategy': {
    bronnen: ['app/api/withdrawal-strategy/route.ts'],
    velden: {
      withdrawal_strategy: ONTTREKKING,
      guardrail_floor: ONTTREKKING,
      guardrail_ceiling: ONTTREKKING,
      guardrail_cut_step: ONTTREKKING,
      withdrawal_profile_config: ONTTREKKING,
      profiel: ONTTREKKING,
      gogo_tot_leeftijd: ONTTREKKING,
      gogo_pct: ONTTREKKING,
      slowgo_tot_leeftijd: ONTTREKKING,
      slowgo_pct: ONTTREKKING,
      nogo_pct: ONTTREKKING,
      flex_nice_only: ONTTREKKING,
      flex_nice_fractie: ONTTREKKING,
      flex_cut_step: ONTTREKKING,
    },
  },
  '/api/pot-rules': {
    bronnen: ['app/api/pot-rules/route.ts'],
    velden: {
      withdrawalOrderGroups: POTREGELS,
      surplusGroup: POTREGELS,
      deficitOrderGroups: POTREGELS,
      categoriePrios: POTREGELS,
      pot_rules: POTREGELS,
      id: TECHNISCH,
      updated_at: TECHNISCH,
    },
  },
  '/api/housing-strategy': {
    bronnen: ['app/api/housing-strategy/route.ts'],
    velden: {
      config: WOONSTRATEGIE,
      choice: WOONSTRATEGIE,
      housing_strategy_config: WOONSTRATEGIE,
      mark_dismissed: {
        buitenWizard: 'Wegklikken van de woonvraag-kaart op /toekomst — een weergavekeuze, geen rekeninstelling.',
      },
      housing_strategy_dismissed_at: {
        buitenWizard: 'Tijdstip van dat wegklikken — een weergavekeuze, geen rekeninstelling.',
      },
    },
  },
  '/api/parameters': {
    bronnen: ['app/api/parameters/route.ts', 'lib/cashflow-settings.ts'],
    velden: {
      inflation_rate: MARKT,
      expected_return: MARKT,
      box3_method: BOX3,
      box3_heffingvrij_inkomen: BOX3,
      net_monthly_income: {
        buitenWizard: 'Inkomen nu is brondata (cashflow-instellingen), geen plan-keuze — register: inkomenUitgaven.',
      },
      estimated_monthly_expenses: {
        buitenWizard: 'Uitgaven nu zijn brondata (cashflow-instellingen), geen plan-keuze — register: inkomenUitgaven.',
      },
      income_source: {
        buitenWizard: 'Grondslag van het inkomen nu (ADR 0103) — brondata-keuze op het cashflow-scherm.',
      },
      expenses_source: {
        buitenWizard: 'Grondslag van de uitgaven nu (ADR 0103) — brondata-keuze op het cashflow-scherm.',
      },
      cashflow_basis_prefs: {
        buitenWizard: 'Selectie binnen de budgetgrondslag (ADR 0103) — brondata-keuze op het cashflow-scherm.',
      },
      pension_factor_a: {
        buitenWizard:
          'De route accepteert het, maar het pensioenscherm schrijft factor A client-direct (grandfathered, ADR 0058); jaarruimte blijft bewust buiten de wizard (TPR-15 stap 3).',
      },
      pension_factor_a_source: {
        buitenWizard: 'Bron van factor A — zelfde situatie als factor A: route accepteert het, geen scherm stuurt het hier.',
      },
      retirement_expense_method: {
        buitenWizard:
          'De route accepteert het (gedeelde cashflow-validator), maar geen scherm stuurt het hier; wizard en uitgavenscherm schrijven via /api/fire-settings (stap 2).',
      },
      retirement_expense_custom_amount: {
        buitenWizard:
          'De route accepteert het (gedeelde cashflow-validator), maar geen scherm stuurt het hier; wizard en uitgavenscherm schrijven via /api/fire-settings (stap 2).',
      },
    },
  },
  '/api/retirement-aspirations': {
    bronnen: ['app/api/retirement-aspirations/route.ts'],
    velden: {
      aspirations: { wizard: 'uitgaven', editor: 'UitgavenEigenBedrag (UitgavenEditor, zelf samenstellen)' },
      feature_preferences: {
        wizard: 'uitgaven',
        editor: 'UitgavenEigenBedrag — de aspiraties staan onder feature_preferences.retirement_aspirations',
      },
    },
  },
  '/api/assets/[id]/sale-config': {
    bronnen: ['app/api/assets/[id]/sale-config/route.ts'],
    velden: {
      sale_config: VERKOOP,
      stand: VERKOOP,
      triggerAge: VERKOOP,
      triggerDate: VERKOOP,
      salesCostsPct: VERKOOP,
      payoffDebtIds: VERKOOP,
    },
  },
  '/api/assets/[id]/expected-return': {
    bronnen: ['app/api/assets/[id]/expected-return/route.ts'],
    velden: {
      expected_return: { wizard: 'laag2', editor: 'BezittingRendementBody (laag2-editors)' },
    },
  },
  '/api/life-events/strategie': {
    bronnen: ['app/api/life-events/strategie/route.ts', 'lib/life-events/strategie-write.ts'],
    velden: {
      event_type: { wizard: 'inkomsten', editor: 'InkomstenEditor (kiest AOW, Werk of pot)' },
      target_age: WERK,
      leefsituatie: AOW,
      jarenBuitenNL: AOW,
      metadata: WERK,
      huidigNettoMaand: WERK,
      reeleGroeiPct: WERK,
      groeiTotLeeftijd: WERK,
      plafondNettoMaand: WERK,
      faseStappen: WERK,
      fromAge: WERK,
      pct: WERK,
      sprongen: WERK,
      atAge: WERK,
      deltaNettoMaand: WERK,
      user_id: TECHNISCH,
      sort_order: { buitenWizard: 'Volgorde van de pensioenpotten (server bepaalt die bij een nieuwe pot) — geen instelling.' },
      id: POT,
      pot: POT,
      name: POT,
      pensioenType: POT,
      ingangLeeftijd: POT,
      invoermodus: POT,
      brutoBedrag: POT,
      inlegBedrag: POT,
      uitkeringsduur: POT,
      isGeindexeerd: POT,
      partnerUitkeringPct: POT,
    },
  },
} as const satisfies Record<string, SchrijfrouteRegistratie>

export type PlanReviewSchrijfroute = keyof typeof SCHRIJFROUTE_VELD_REGISTER
