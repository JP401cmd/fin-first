// Gecureerde Overzicht-hub-procesflow (verdiepingslaag laag 2 voor de UAT-plaat).
//
// Bron: docs/uat/uat-plan.md Deel 1 — "Overzicht-hub & dashboard (WF-OVZ)"
// (WF-OVZ-01..21) en de acceptatie in lib/uat/acceptance/ovz.ts. De knopen met
// `scenarioId` verwijzen naar de UAT-scenario-ID's uit lib/uat/catalog.ts
// (UAT-OVZ-NN) en erven daarmee de rondestatus. Het label toont bewust het
// WF-nummer, spiegelt lib/uat/flows/budget.ts + start.ts + will.ts + cash.ts.
//
// OVZ is — net als SCHULD/TOEK/WILL — NIET aaneengesloten op WF-nummer:
// WF-OVZ-17/18 hebben geen eigen UAT-OVZ-scenario (het UAT-plan wijst ze door
// naar UAT-NAV-19 resp. UAT-NAV-10 — "steekproef-oppervlak, géén eigen
// scenario") en bestaan dus niet in de catalogus voor zone OVZ. Alle 19
// overige WF-OVZ-01..16/19..21 hebben wél een eigen knoop hieronder.
//
// Het proces leest links→rechts: instap (vier hefboomkaarten) → verkennen
// (drill-down, gezondheidsscore, vermogensverloop, toekomstprojectie) →
// doelen & vrijheid (doelen-kaart, vrijheidsstrip, hero-widgets) → briefing
// (vrijheidsweek, briefing-kaartjes, delen) → status & onboarding
// (statusmelding, check-in-banner, welkomstgids) → inzichten & print
// (samengestelde rente, afdrukken) → tips & acties (Will-tips beslissen,
// handmatige actie, actiebeheer) → uitkomst → cross-doorwerking.
//
// OMGEKEERDE VERWIJZING: WF-WILL-21/22 wezen door naar UAT-OVZ-19/20/21 — de
// 'tipsbeslissen'/'actietoevoegen'/'actiesbeheren'-knopen hieronder zijn dus
// tegelijk de "echte" plek waar die WILL-workflows landen (Will levert alleen
// de AI-context, geen eigen scenario/knoop).
//
// GRONDSLAG-REGEL (CLAUDE.md / zone-specifieke notitie): de hub is vooral een
// CONSISTENTIE-oppervlak (dezelfde cijfers als hero/widget/sidebar/deelpagina's,
// overlap met KRUIS) — een klein aantal criteria is 'exact' (Box 3, gezond-
// heidspijlers, doel-%, vrijheidsdagen-formule, samengestelde rente, tips-/
// actiebeheer-mechaniek), twee zijn 'oracle' (freedomPct/simNetWorthRows —
// horizon-kernel-solver, verifieerbaar via /beheer/horizon-tabellen-mij).
//
// GEEN React, GEEN data-fetching — pure curatie.

import type { UatFlow } from './types'

export const OVZ_FLOW: UatFlow = {
  zone: 'OVZ',
  nodes: [
    // ── 0 · instap ────────────────────────────────────────────────────────
    { id: 'nav', label: 'Navigatie naar /overzicht (canonieke landing)', kind: 'entry', stage: 0 },
    { id: 'hefboom', scenarioId: 'UAT-OVZ-01', label: 'WF-OVZ-01 · Dagelijkse stand (vier hefboomkaarten)', kind: 'screen', stage: 0, lane: 'instap' },

    // ── 1 · verkennen ─────────────────────────────────────────────────────
    { id: 'drilldown', scenarioId: 'UAT-OVZ-02', label: 'WF-OVZ-02 · Hefboomkaart doorklikken / drill-down', kind: 'screen', stage: 1, lane: 'verkennen', subOf: 'hefboom' },
    { id: 'gezondheidsscore', scenarioId: 'UAT-OVZ-03', label: 'WF-OVZ-03 · Gezondheidsscore + kassabon', kind: 'screen', stage: 1, lane: 'verkennen' },
    { id: 'vermogensverloop', scenarioId: 'UAT-OVZ-04', label: 'WF-OVZ-04 · Vermogensverloop + historie invoeren', kind: 'screen', stage: 1, lane: 'verkennen' },
    { id: 'toekomstprojectie', scenarioId: 'UAT-OVZ-05', label: 'WF-OVZ-05 · Toekomstprojectie vanaf de hub', kind: 'screen', stage: 1, lane: 'verkennen' },

    // ── 2 · doelen & vrijheid ─────────────────────────────────────────────
    { id: 'widgetbeslis', label: 'Default-blok (doelen+vrijheidsstrip) of eigen widgets?', kind: 'decision', stage: 2 },
    { id: 'doelen', scenarioId: 'UAT-OVZ-06', label: 'WF-OVZ-06 · Voortgang van doelen volgen', kind: 'screen', stage: 2, lane: 'doelen' },
    { id: 'vrijheidsstrip', scenarioId: 'UAT-OVZ-07', label: 'WF-OVZ-07 · Vrijheidsstrip: voortgang naar vrijheid', kind: 'screen', stage: 2, lane: 'doelen' },
    { id: 'widgets', scenarioId: 'UAT-OVZ-08', label: 'WF-OVZ-08 · Hero-widgets samenstellen', kind: 'action', stage: 2, lane: 'doelen' },

    // ── 3 · briefing ──────────────────────────────────────────────────────
    { id: 'vrijheidweek', scenarioId: 'UAT-OVZ-09', label: 'WF-OVZ-09 · "Jouw vrijheid deze week"', kind: 'screen', stage: 3, lane: 'briefing' },
    { id: 'briefing', scenarioId: 'UAT-OVZ-10', label: 'WF-OVZ-10 · Wekelijkse briefing lezen/verversen', kind: 'screen', stage: 3, lane: 'briefing', subOf: 'vrijheidweek' },
    { id: 'delen', scenarioId: 'UAT-OVZ-11', label: 'WF-OVZ-11 · Vrijheidsweek delen', kind: 'action', stage: 3, lane: 'briefing', subOf: 'briefing' },

    // ── 4 · status & onboarding ───────────────────────────────────────────
    { id: 'statusmelding', scenarioId: 'UAT-OVZ-12', label: 'WF-OVZ-12 · Status-/vrijheidsmelding minimaliseren', kind: 'action', stage: 4, lane: 'status' },
    { id: 'checkin', scenarioId: 'UAT-OVZ-13', label: 'WF-OVZ-13 · Maand-check-in starten', kind: 'action', stage: 4, lane: 'status' },
    { id: 'welkomstgids', scenarioId: 'UAT-OVZ-14', label: 'WF-OVZ-14 · Welkomstgids doorlopen', kind: 'action', stage: 4, lane: 'status' },

    // ── 5 · inzichten & print ─────────────────────────────────────────────
    { id: 'samengesteldrente', scenarioId: 'UAT-OVZ-15', label: 'WF-OVZ-15 · Samengestelde-rente-inzicht', kind: 'screen', stage: 5, lane: 'inzichten' },
    { id: 'print', scenarioId: 'UAT-OVZ-16', label: 'WF-OVZ-16 · Afdrukken / PDF opslaan', kind: 'action', stage: 5, lane: 'inzichten' },

    // ── 6 · tips & acties ─────────────────────────────────────────────────
    { id: 'tipsbeslissen', scenarioId: 'UAT-OVZ-19', label: 'WF-OVZ-19 · Tips van Will beoordelen (Doe nu/Later/Negeren)', kind: 'screen', stage: 6, lane: 'tips' },
    { id: 'actietoevoegen', scenarioId: 'UAT-OVZ-20', label: 'WF-OVZ-20 · Handmatig een actie toevoegen', kind: 'action', stage: 6, lane: 'tips', subOf: 'tipsbeslissen' },
    { id: 'actiesbeheren', scenarioId: 'UAT-OVZ-21', label: 'WF-OVZ-21 · Open acties beheren', kind: 'screen', stage: 6, lane: 'tips', subOf: 'tipsbeslissen' },

    // ── 7 · uitkomst ──────────────────────────────────────────────────────
    { id: 'uitkomst', label: 'Hub-cijfers, doelen, briefing en actielijst bijgewerkt', kind: 'outcome', stage: 7 },

    // ── 8 · cross-doorwerking (OUTPUT) ────────────────────────────────────
    { id: 'x-will', label: 'Will · aanbevelingen-generatie (AI-context voor tips)', kind: 'cross', stage: 8, crossZone: 'WILL' },
    { id: 'x-toek', label: 'Toekomst · doelbeheer, projectie, FIRE-parameters', kind: 'cross', stage: 8, crossZone: 'TOEK' },
    { id: 'x-mijn', label: 'Mijn · profiel-/huishoudinstellingen, check-in-historie', kind: 'cross', stage: 8, crossZone: 'MIJN' },
    { id: 'x-nav', label: 'Navigatie · perspectiefwissel (WF-OVZ-17) + weergavemodus (WF-OVZ-18)', kind: 'cross', stage: 8, crossZone: 'NAV' },
    { id: 'x-bezit', label: 'Bezittingen · cash-asset herwaarderen, "Start met beleggen"-CTA', kind: 'cross', stage: 8, crossZone: 'BEZIT' },
  ],
  edges: [
    // instap → verkennen
    { from: 'nav', to: 'hefboom' },
    { from: 'hefboom', to: 'drilldown' },
    { from: 'hefboom', to: 'gezondheidsscore' },
    { from: 'hefboom', to: 'vermogensverloop' },
    { from: 'hefboom', to: 'toekomstprojectie' },
    { from: 'toekomstprojectie', to: 'x-toek', kind: 'cross' },

    // doelen & vrijheid (beslispunt: default-blok of widgets)
    { from: 'hefboom', to: 'widgetbeslis' },
    { from: 'widgetbeslis', to: 'doelen', kind: 'branch', label: 'default-blok' },
    { from: 'widgetbeslis', to: 'widgets', kind: 'branch', label: 'eigen widgets' },
    { from: 'doelen', to: 'vrijheidsstrip' },
    { from: 'doelen', to: 'x-toek', kind: 'cross' },

    // briefing
    { from: 'hefboom', to: 'vrijheidweek' },
    { from: 'vrijheidweek', to: 'briefing' },
    { from: 'briefing', to: 'delen' },

    // status & onboarding
    { from: 'hefboom', to: 'statusmelding' },
    { from: 'hefboom', to: 'checkin' },
    { from: 'checkin', to: 'x-mijn', kind: 'cross' },
    { from: 'hefboom', to: 'welkomstgids' },

    // inzichten & print
    { from: 'hefboom', to: 'samengesteldrente' },
    { from: 'samengesteldrente', to: 'x-bezit', kind: 'cross' },
    { from: 'hefboom', to: 'print' },

    // tips & acties
    { from: 'hefboom', to: 'tipsbeslissen' },
    { from: 'tipsbeslissen', to: 'x-will', kind: 'cross' },
    { from: 'tipsbeslissen', to: 'actietoevoegen' },
    { from: 'tipsbeslissen', to: 'actiesbeheren' },

    // samenvloeien → uitkomst
    { from: 'drilldown', to: 'uitkomst' },
    { from: 'gezondheidsscore', to: 'uitkomst' },
    { from: 'vermogensverloop', to: 'uitkomst' },
    { from: 'vrijheidsstrip', to: 'uitkomst' },
    { from: 'widgets', to: 'uitkomst' },
    { from: 'delen', to: 'uitkomst' },
    { from: 'statusmelding', to: 'uitkomst' },
    { from: 'welkomstgids', to: 'uitkomst' },
    { from: 'print', to: 'uitkomst' },
    { from: 'actietoevoegen', to: 'uitkomst' },
    { from: 'actiesbeheren', to: 'uitkomst' },

    // uitkomst → cross-doorwerking (OUTPUT)
    { from: 'uitkomst', to: 'x-nav', kind: 'cross' },
  ],
}
