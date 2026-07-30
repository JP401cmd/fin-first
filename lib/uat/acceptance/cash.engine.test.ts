/**
 * Engine-niveau toets voor de UAT-Cash-acceptatiecriteria (`cash.ts`).
 *
 * De 'exact'-criteria worden NIET hier herimplementeerd — die rekenlogica leeft
 * in `cash-checks.ts` (`CASH_ENGINE_CHECKS`), gedeeld met de in-app
 * regressiesuite (`lib/regression-tests/suites/uat-cash.ts`). Deze test loopt
 * er alleen overheen en toetst `expect(actual).toBe(expected)` — één bron van
 * waarheid voor de rekenlogica, twee draaimomenten (CI + /beheer/regressietest).
 *
 * CASH is aaneengesloten 01..50 (50 catalogus-scenario's, geen verwijsregel-
 * gaten) — de grootste UAT-zone tot nu toe. WF-CASH-32 is een latere
 * dekkingscontrole-toevoeging (feature #881, "Vraag Fin"-wizard), net als
 * WF-CASH-31. WF-CASH-33..41 zijn de UAT-a-toevoeging (specs/bank-connect-
 * doelrekening/scenarios.md): regressiebescherming voor bestaand, nu werkend
 * bankkoppel-gedrag (SC-15/23/17/16/10 + vier vandaag gerepareerde randgevallen
 * — tegenpartij-meta-fallback, saldo bij eerste koppeling, rekening-gescoped
 * dedup, budgetteren-uitschakelen-behoudt-koppeling). Vier daarvan (35/36/38/40)
 * zijn 'exact' met een echte of gemirrorde rekenkern; de rest is 'ui-only'
 * (route-/DB-mutatiegedrag zonder pure functie). WF-CASH-42/43 zijn de UAT-b
 * fase-1-toevoeging (B8/B9, specs/bank-connect-doelrekening/plan.md §6): het
 * eerste-ophaal-startpuntcontract (`planInitialFetch`, 'exact') en de
 * bank-eigen-verzoeklimiet-afvang ('ui-only'). WF-CASH-44 is de UAT-b fase-4-
 * toevoeging (doelrekening kiezen tijdens onboarding, SC-25, 'ui-only') —
 * WF-CASH-30 zelf is in dezelfde fase uitgebreid met de rekeningkeuze
 * (transport + wizardstap 2), zonder nieuw scenario-id. WF-CASH-45..47 zijn de
 * UAT-b fase-5-toevoeging (callback: precedentieketen, rekeningtype, het
 * correctiemoment — plan.md §6): WF-CASH-45 (de precedentieketen inclusief
 * consume-once en "identiteit wint van de expliciete keuze is CORRECT gedrag")
 * en WF-CASH-47 (het correctiemoment op de success-pagina, nieuw
 * gebruikersoppervlak) zijn 'ui-only' (DB-mutatie over meerdere rondes, geen
 * pure functie); WF-CASH-46 (`mapAccountType`, B3) is 'exact'. WF-CASH-48 is
 * de UAT-b fase-6-toevoeging (FR5, plan.md §6, één ACTIEVE bankkoppeling per
 * rekening): de UI-/route-kant (bezet = zichtbaar-maar-uitgeschakeld, 409 op
 * auth-link/relink) is 'exact' via de échte `isSelectableTargetOption` +
 * `occupiedTargetAccountMessage` (lib/truelayer/target-account.ts) — de
 * DB-laag zelf (de partiële unieke index) heeft geen pure functie en wordt
 * hier alleen narratief vastgelegd (given/then), niet los getoetst. WF-CASH-49
 * is de UAT-b fase-7-toevoeging (herkoppelen vanaf de rekening, B6, plan.md
 * §6): de regelvolgorde-contract van `deriveBankLinkHealth`
 * (lib/bank-connection-status.ts, vier signalen → drie toestanden) is 'exact'
 * via de échte functie; het herstelpad (relink_connection_account_id,
 * server-afgeleide doelrekening/intentie/bank) en de SC-13-reactivatie zijn
 * DB-mutatie over meerdere Supabase-rondes en staan narratief in het
 * criterium, niet los getoetst. WF-CASH-50 is de UAT-b fase-8-toevoeging
 * (saldo via het herwaarderingspad, FR8, plan.md §6): de
 * ongewijzigd-saldo-poort (`isSameBalance`) en de notitie-rondtrip
 * (`formatBankSyncNote`/`parseBankSyncPrevious`/`formatBankSyncCorrectionNote`,
 * lib/truelayer/balance-valuation.ts) zijn 'exact' via de échte functies; de
 * DB-schrijfvolgorde en de success-pagina-melding staan narratief in het
 * criterium.
 */

import { describe, it, expect } from 'vitest'
import { CASH_ACCEPTANCE } from './cash'
import { CASH_ENGINE_CHECKS } from './cash-checks'
import { UAT_SCENARIOS } from '@/lib/uat/catalog'
import type { AcceptanceCriterion } from './types'

/** De CASH-scenario's zoals de catalogus ze kent (bron van waarheid voor
 *  WELKE workflows bestaan). Drie catalogus-rijen (UAT-CASH-25/26/28) hebben
 *  `wf: null` in de catalogus (de WF-code zit ingebed in `naam`, "(dekt
 *  WF-CASH-NN)") — genormaliseerd naar het kale WF-nummer. */
const catalogCashWorkflows = UAT_SCENARIOS.filter((s) => s.zone === 'CASH')
  .map((s) => s.wf ?? s.naam.match(/dekt (WF-CASH-\d+)/)?.[1] ?? s.wf)
  .sort()

function criterion(workflow: string): AcceptanceCriterion {
  const found = CASH_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — cash.ts is niet in sync met de test.`)
  return found
}

describe('UAT Cash — acceptatiecriteria dekking', () => {
  it('heeft precies één criterium per catalogus-CASH-scenario (01..51, geen gaten)', () => {
    const workflows = CASH_ACCEPTANCE.criteria.map((c) => c.workflow).sort()
    expect(workflows).toEqual(catalogCashWorkflows)
    expect(new Set(workflows).size).toBe(catalogCashWorkflows.length)
    // 32 → 41: UAT-a bank-connect-doelrekening-toevoeging (WF-CASH-33..41,
    // regressiebescherming voor bestaand/vandaag-gerepareerd koppelgedrag).
    // 41 → 43: UAT-b fase 1 (B8/B9, specs/bank-connect-doelrekening/plan.md
    // §6) — WF-CASH-42 (planInitialFetch: max. historie in blokken op een
    // lege rekening, D−3-startpunt op een rekening met historie) en
    // WF-CASH-43 (bank-eigen verzoeklimiet kapt de eerste ophaal netjes af).
    // 43 → 44: UAT-b fase 4 (wizard, plan.md §6) — WF-CASH-44 (doelrekening
    // kiezen tijdens onboarding, nul kandidaten, SC-25). WF-CASH-30 zelf is
    // in dezelfde fase uitgebreid (rekeningkeuze in stap 2 + auth-link-
    // transport), dat is geen nieuwe rij — de pin blijft dus met precies
    // één stap omhoog.
    // 44 → 47: UAT-b fase 5 (callback, plan.md §6) — WF-CASH-45
    // (precedentieketen: identiteit wint altijd, de voorkeur bindt hooguit
    // één rekening, N rekeningen blijven gekoppeld, consume-once),
    // WF-CASH-46 (rekeningtype van de bank overnemen, B3) en WF-CASH-47
    // (het correctiemoment op de success-pagina, nieuw gebruikersoppervlak).
    // 47 → 48: UAT-b fase 6 (FR5, plan.md §6) — WF-CASH-48 (één ACTIEVE
    // bankkoppeling per rekening: bezet is zichtbaar-maar-uitgeschakeld,
    // de routes geven 409).
    // 48 → 49: UAT-b fase 7 (B6, herkoppelen vanaf de rekening, plan.md §6)
    // — WF-CASH-49 (deriveBankLinkHealth-regelvolgorde, het herstelpad en de
    // SC-13-reactivatie in één criterium).
    // 49 → 50: UAT-b fase 8 (FR8, saldo via het herwaarderingspad, plan.md §6)
    // — WF-CASH-50 (isSameBalance-poort + notitie-rondtrip, de compensatie bij
    // een relink en de success-pagina-melding in één criterium).
    // 50 → 51: bugfix-toevoeging (docs/adr/0073-grondslag-in-de-veldnaam.md)
    // — WF-CASH-51 (cashflow-landingskaarten: Budget-KPI = resterend,
    // Transacties-KPI = gerealiseerde huidige maand).
    expect(workflows.length).toBe(51)
  })

  it('elk criterium heeft een geldige assertion.kind', () => {
    const valid = new Set(['exact', 'consistency', 'oracle', 'direction', 'ui-only'])
    for (const c of CASH_ACCEPTANCE.criteria) {
      expect(valid.has(c.assertion.kind), `${c.workflow} heeft ongeldige kind ${c.assertion.kind}`).toBe(true)
    }
  })

  it('vermeldt voor elk exact-criterium een expected + source', () => {
    for (const c of CASH_ACCEPTANCE.criteria) {
      if (c.assertion.kind === 'exact') {
        expect(c.assertion.expected, `${c.workflow} mist expected`).toBeTruthy()
        expect(c.assertion.source, `${c.workflow} mist source`).toBeTruthy()
      }
    }
  })

  it('heeft een CASH_ENGINE_CHECKS-rij voor elk exact-criterium, en niet meer', () => {
    const exactWorkflows = CASH_ACCEPTANCE.criteria
      .filter((c) => c.assertion.kind === 'exact')
      .map((c) => c.workflow)
      .sort()
    const checkWorkflows = CASH_ENGINE_CHECKS.map((c) => c.workflow).sort()
    expect(checkWorkflows).toEqual(exactWorkflows)
    // 21 → 25: UAT-a voegt vier 'exact'-criteria toe (WF-CASH-35/36/38/40 —
    // rate-limit-drempel, lege-sync-tellers, tegenpartij-meta-fallback via de
    // échte mapTransaction, en rekening-gescoped dedup), elk met een
    // bijbehorende CASH_ENGINE_CHECKS-rij.
    // 25 → 26: UAT-b fase 1 voegt WF-CASH-42 toe (planInitialFetch is een
    // pure functie — echte productiefunctie, geen mirror). WF-CASH-43 (de
    // provider-limiet-afvang) blijft 'ui-only': dat is route-/DB-mutatiegedrag
    // zonder eigen pure functie.
    // 26 blijft 26 na UAT-b fase 4: WF-CASH-44 (doelrekening kiezen tijdens
    // onboarding) is 'ui-only' (radiogroep-weergave, geen berekening) en de
    // uitbreiding van WF-CASH-30 zelf blijft ook 'ui-only' (route-/wizard-
    // gedrag) — geen van beide krijgt een CASH_ENGINE_CHECKS-rij.
    // 26 → 27 na UAT-b fase 5: WF-CASH-46 (mapAccountType, B3) is 'exact' en
    // krijgt een CASH_ENGINE_CHECKS-rij; WF-CASH-45 (precedentieketen) en
    // WF-CASH-47 (het correctiemoment) zijn 'ui-only' (DB-mutatie over
    // meerdere Supabase-rondes, geen pure functie) en krijgen er geen.
    // 27 → 28 na UAT-b fase 6: WF-CASH-48 (FR5 — isSelectableTargetOption +
    // occupiedTargetAccountMessage, beide échte functies uit
    // lib/truelayer/target-account.ts) is 'exact' en krijgt een
    // CASH_ENGINE_CHECKS-rij; de DB-laag (partiële unieke index) heeft geen
    // pure functie en blijft narratief in het criterium.
    // 28 → 29 na UAT-b fase 7: WF-CASH-49 (deriveBankLinkHealth, echte
    // productiefunctie uit lib/bank-connection-status.ts) is 'exact' en
    // krijgt een CASH_ENGINE_CHECKS-rij; het herstelpad en de
    // SC-13-reactivatie hebben geen eigen pure functie en blijven narratief
    // in hetzelfde criterium.
    // 29 → 30 na UAT-b fase 8: WF-CASH-50 (isSameBalance +
    // formatBankSyncNote/parseBankSyncPrevious/formatBankSyncCorrectionNote,
    // echte productiefuncties uit lib/truelayer/balance-valuation.ts) is
    // 'exact' en krijgt een CASH_ENGINE_CHECKS-rij; de DB-schrijfvolgorde en
    // de success-pagina-melding blijven narratief in hetzelfde criterium.
    // 30 → 31: bugfix-toevoeging (docs/adr/0073-grondslag-in-de-veldnaam.md,
    // nieuw oppervlak app/(app)/overzicht/cashflow/page.tsx) — WF-CASH-51
    // (buildCashflowCards, échte productiefunctie op literaire invoer) is
    // 'exact' en krijgt een CASH_ENGINE_CHECKS-rij.
    expect(exactWorkflows.length).toBe(31)
  })

  it('markeert de jitter-gebonden/AI/gebonden randgevallen met de juiste kind', () => {
    // consistency (jitter-basis, delta of A=B exact)
    for (const wf of ['WF-CASH-03', 'WF-CASH-11', 'WF-CASH-14']) {
      expect(criterion(wf).assertion.kind, `${wf} moet consistency zijn`).toBe('consistency')
    }
    // ui-only (AI, verwijsregels, DB-bulk-workflows, TrueLayer-sandbox)
    for (const wf of ['WF-CASH-06', 'WF-CASH-07', 'WF-CASH-12', 'WF-CASH-17', 'WF-CASH-19', 'WF-CASH-29', 'WF-CASH-30', 'WF-CASH-32', 'WF-CASH-45', 'WF-CASH-47']) {
      expect(criterion(wf).assertion.kind, `${wf} moet ui-only zijn`).toBe('ui-only')
    }
  })
})

describe('CASH_ENGINE_CHECKS — echte/gemirrorde rekenfuncties op deterministische/synthetische invoer', () => {
  for (const check of CASH_ENGINE_CHECKS) {
    it(`${check.workflow}: ${check.label}`, async () => {
      const { expected, actual } = await check.run()
      expect(actual).toBe(expected)
    })
  }
})
