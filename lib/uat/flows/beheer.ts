// Gecureerde Beheer-procesflow (verdiepingslaag laag 2 voor de UAT-plaat).
//
// Bron: docs/uat/uat-plan.md Deel 1 — "Beheer (admin) (WF-BEHEER)" en de
// acceptatie in lib/uat/acceptance/beheer.ts. De knopen met `scenarioId`
// verwijzen naar UAT-BEHEER-NN uit lib/uat/catalog.ts en erven de rondestatus.
//
// BEWUST GEEN domein-waardeketen: BEHEER is admin-tooling en staat bewust NIET in
// de ArchiMate-topologie (zie CLAUDE.md — meta/naslag). Dit model is daarom een
// TOOL-CATALOGUS: instap (toegangscontrole) → de vier beheer-secties als lanes
// (Technisch beheer / Functioneel beheer / Test & ontwikkeling / Ter info), met de
// tools als knopen daarbinnen (via `subOf` genest onder hun sectie). Er zijn
// bewust GEEN cross-knopen — BEHEER is een overlay, geen domein dat naar andere
// zones doorwerkt. Twee tools (horizon-strategiematrix WF-BEHEER-26 en
// horizon-kernel WF-BEHEER-27) zijn in de acceptatie als `oracle` gemarkeerd
// (verifieerbaar via hun eigen transparantie-UI), maar blijven hier gewone
// tool-knopen.
//
// GEEN React, GEEN data-fetching — pure curatie.

import type { UatFlow } from './types'

export const BEHEER_FLOW: UatFlow = {
  zone: 'BEHEER',
  nodes: [
    // ── 0 · instap ────────────────────────────────────────────────────────
    { id: 'entry', label: 'Navigatie naar Beheer (/beheer)', kind: 'entry', stage: 0 },
    { id: 'toegang', scenarioId: 'UAT-BEHEER-01', label: 'WF-BEHEER-01 · Beheeromgeving betreden + toegangscontrole (superadmin-gate)', kind: 'screen', stage: 1 },

    // ── 2 · secties (sub-hubs) ────────────────────────────────────────────
    { id: 'sectie-tech', label: 'Technisch beheer', kind: 'screen', stage: 2, lane: 'technisch' },
    { id: 'sectie-func', label: 'Functioneel beheer', kind: 'screen', stage: 2, lane: 'functioneel' },
    { id: 'sectie-test', label: 'Test & ontwikkeling', kind: 'screen', stage: 2, lane: 'test' },
    { id: 'sectie-info', label: 'Ter info', kind: 'screen', stage: 2, lane: 'info' },

    // ── 3 · Technisch beheer ──────────────────────────────────────────────
    { id: 'ai-config', scenarioId: 'UAT-BEHEER-02', label: 'WF-BEHEER-02 · AI-provider, model en systeemprompt', kind: 'screen', stage: 3, lane: 'technisch', subOf: 'sectie-tech' },
    { id: 'ai-limieten', scenarioId: 'UAT-BEHEER-03', label: 'WF-BEHEER-03 · AI-feature-limieten en creditbudgetten', kind: 'screen', stage: 3, lane: 'technisch', subOf: 'sectie-tech' },
    { id: 'truelayer', scenarioId: 'UAT-BEHEER-05', label: 'WF-BEHEER-05 · TrueLayer-bankkoppeling configureren en testen', kind: 'screen', stage: 3, lane: 'technisch', subOf: 'sectie-tech' },
    { id: 'platform-status', scenarioId: 'UAT-BEHEER-06', label: 'WF-BEHEER-06 · Platform-status: onderhoud/aankondiging/AI-kill-switch', kind: 'action', stage: 3, lane: 'technisch', subOf: 'sectie-tech' },
    { id: 'gebruikers', scenarioId: 'UAT-BEHEER-07', label: 'WF-BEHEER-07 · Gebruiker zoeken + account/blokkade beheren', kind: 'screen', stage: 3, lane: 'technisch', subOf: 'sectie-tech' },
    { id: 'supportview', scenarioId: 'UAT-BEHEER-08', label: 'WF-BEHEER-08 · Supportview-diagnose + account definitief verwijderen', kind: 'action', stage: 3, lane: 'technisch', subOf: 'sectie-tech' },
    { id: 'logboeken', scenarioId: 'UAT-BEHEER-31', label: 'WF-BEHEER-31 · Logboeken (audit, fouten, e-mail, achtergrondtaken)', kind: 'screen', stage: 3, lane: 'technisch', subOf: 'sectie-tech' },
    { id: 'integraties', scenarioId: 'UAT-BEHEER-32', label: 'WF-BEHEER-32 · Integraties: inventaris, liveness-probe, contractbewaking', kind: 'screen', stage: 3, lane: 'technisch', subOf: 'sectie-tech' },

    // ── 3 · Functioneel beheer ────────────────────────────────────────────
    { id: 'coach', scenarioId: 'UAT-BEHEER-09', label: 'WF-BEHEER-09 · Coach-suggestieregels/timing/kopregel van Fin', kind: 'screen', stage: 3, lane: 'functioneel', subOf: 'sectie-func' },
    { id: 'welkomstgids', scenarioId: 'UAT-BEHEER-10', label: 'WF-BEHEER-10 · Welkomstgids samenstellen (live-preview)', kind: 'screen', stage: 3, lane: 'functioneel', subOf: 'sectie-func' },
    { id: 'briefing', scenarioId: 'UAT-BEHEER-11', label: 'WF-BEHEER-11 · Briefing-directieven beheren', kind: 'screen', stage: 3, lane: 'functioneel', subOf: 'sectie-func' },
    { id: 'doelgids', scenarioId: 'UAT-BEHEER-12', label: 'WF-BEHEER-12 · Doelgids-stappen per doel beheren', kind: 'screen', stage: 3, lane: 'functioneel', subOf: 'sectie-func' },
    { id: 'nieuws', scenarioId: 'UAT-BEHEER-13', label: 'WF-BEHEER-13 · Nieuwsbronnen beheren, ingest, moderatie', kind: 'screen', stage: 3, lane: 'functioneel', subOf: 'sectie-func' },
    { id: 'vragenlijst', scenarioId: 'UAT-BEHEER-14', label: 'WF-BEHEER-14 · Vragenlijst opstellen, activeren, respons', kind: 'screen', stage: 3, lane: 'functioneel', subOf: 'sectie-func' },
    { id: 'aow', scenarioId: 'UAT-BEHEER-15', label: 'WF-BEHEER-15 · AOW-leeftijdstabel bijhouden', kind: 'screen', stage: 3, lane: 'functioneel', subOf: 'sectie-func' },
    { id: 'fiscale-kerngetallen', scenarioId: 'UAT-BEHEER-16', label: 'WF-BEHEER-16 · Fiscale kerngetallen + jaar-checklist', kind: 'screen', stage: 3, lane: 'functioneel', subOf: 'sectie-func' },
    { id: 'widget-presets', scenarioId: 'UAT-BEHEER-17', label: 'WF-BEHEER-17 · Widget-presets samenstellen en ordenen', kind: 'screen', stage: 3, lane: 'functioneel', subOf: 'sectie-func' },
    { id: 'rekenhulp-mod', scenarioId: 'UAT-BEHEER-18', label: 'WF-BEHEER-18 · Rekenhulp-meldingen modereren', kind: 'screen', stage: 3, lane: 'functioneel', subOf: 'sectie-func' },
    { id: 'feedback-afhandelen', scenarioId: 'UAT-BEHEER-19', label: 'WF-BEHEER-19 · Gebruikersfeedback afhandelen', kind: 'screen', stage: 3, lane: 'functioneel', subOf: 'sectie-func' },

    // ── 3 · Test & ontwikkeling ───────────────────────────────────────────
    { id: 'testdata', scenarioId: 'UAT-BEHEER-20', label: 'WF-BEHEER-20 · Persona-testdata laden (seeden)', kind: 'action', stage: 3, lane: 'test', subOf: 'sectie-test' },
    { id: 'budget-template', scenarioId: 'UAT-BEHEER-21', label: 'WF-BEHEER-21 · Budget-template laden', kind: 'action', stage: 3, lane: 'test', subOf: 'sectie-test' },
    { id: 'onboarding-reset', scenarioId: 'UAT-BEHEER-22', label: 'WF-BEHEER-22 · Onboarding opnieuw doorlopen (reset eigen account)', kind: 'action', stage: 3, lane: 'test', subOf: 'sectie-test' },
    { id: 'landing-users', scenarioId: 'UAT-BEHEER-23', label: 'WF-BEHEER-23 · Landing-page-testgebruikers beheren', kind: 'screen', stage: 3, lane: 'test', subOf: 'sectie-test' },
    { id: 'checkin-snapshots', scenarioId: 'UAT-BEHEER-24', label: 'WF-BEHEER-24 · Check-in-snapshots wissen + mobile preview', kind: 'action', stage: 3, lane: 'test', subOf: 'sectie-test' },
    { id: 'regressietest', scenarioId: 'UAT-BEHEER-25', label: 'WF-BEHEER-25 · Regressietest-suite draaien', kind: 'action', stage: 3, lane: 'test', subOf: 'sectie-test' },
    { id: 'horizon-strategie', scenarioId: 'UAT-BEHEER-26', label: 'WF-BEHEER-26 · Horizon-strategiematrix draaien (oracle)', kind: 'action', stage: 3, lane: 'test', subOf: 'sectie-test' },
    { id: 'horizon-kernel', scenarioId: 'UAT-BEHEER-27', label: 'WF-BEHEER-27 · Horizon-kernel transparantie verifiëren (oracle)', kind: 'screen', stage: 3, lane: 'test', subOf: 'sectie-test' },
    { id: 'ai-extractie', scenarioId: 'UAT-BEHEER-28', label: 'WF-BEHEER-28 · AI-extractie van vrije tekst testen', kind: 'action', stage: 3, lane: 'test', subOf: 'sectie-test' },
    { id: 'widget-galerij', scenarioId: 'UAT-BEHEER-29', label: 'WF-BEHEER-29 · Widget-galerij bekijken', kind: 'screen', stage: 3, lane: 'test', subOf: 'sectie-test' },

    // ── 3 · Ter info ──────────────────────────────────────────────────────
    { id: 'kpi', scenarioId: 'UAT-BEHEER-04', label: 'WF-BEHEER-04 · AI-tokenverbruik + platform-kerngetallen', kind: 'screen', stage: 3, lane: 'info', subOf: 'sectie-info' },
    { id: 'architectuur', scenarioId: 'UAT-BEHEER-30', label: 'WF-BEHEER-30 · Architectuurdocumentatie raadplegen', kind: 'screen', stage: 3, lane: 'info', subOf: 'sectie-info' },
    { id: 'naslag', scenarioId: 'UAT-BEHEER-33', label: 'WF-BEHEER-33 · Statische naslag bekijken', kind: 'screen', stage: 3, lane: 'info', subOf: 'sectie-info' },
    { id: 'webprestaties', scenarioId: 'UAT-BEHEER-34', label: 'WF-BEHEER-34 · Webprestaties (Core Web Vitals p75) raadplegen', kind: 'screen', stage: 3, lane: 'info', subOf: 'sectie-info' },

    // ── 4 · uitkomst ──────────────────────────────────────────────────────
    { id: 'beheerd', label: 'Platform geconfigureerd, bewaakt & getest', kind: 'outcome', stage: 4 },
  ],
  edges: [
    // instap → toegang → secties
    { from: 'entry', to: 'toegang' },
    { from: 'toegang', to: 'sectie-tech' },
    { from: 'toegang', to: 'sectie-func' },
    { from: 'toegang', to: 'sectie-test' },
    { from: 'toegang', to: 'sectie-info' },

    // Technisch beheer
    { from: 'sectie-tech', to: 'ai-config' },
    { from: 'sectie-tech', to: 'ai-limieten' },
    { from: 'sectie-tech', to: 'truelayer' },
    { from: 'sectie-tech', to: 'platform-status' },
    { from: 'sectie-tech', to: 'gebruikers' },
    { from: 'gebruikers', to: 'supportview' },
    { from: 'sectie-tech', to: 'logboeken' },
    { from: 'sectie-tech', to: 'integraties' },

    // Functioneel beheer
    { from: 'sectie-func', to: 'coach' },
    { from: 'sectie-func', to: 'welkomstgids' },
    { from: 'sectie-func', to: 'briefing' },
    { from: 'sectie-func', to: 'doelgids' },
    { from: 'sectie-func', to: 'nieuws' },
    { from: 'sectie-func', to: 'vragenlijst' },
    { from: 'sectie-func', to: 'aow' },
    { from: 'sectie-func', to: 'fiscale-kerngetallen' },
    { from: 'sectie-func', to: 'widget-presets' },
    { from: 'sectie-func', to: 'rekenhulp-mod' },
    { from: 'sectie-func', to: 'feedback-afhandelen' },

    // Test & ontwikkeling
    { from: 'sectie-test', to: 'testdata' },
    { from: 'sectie-test', to: 'budget-template' },
    { from: 'sectie-test', to: 'onboarding-reset' },
    { from: 'sectie-test', to: 'landing-users' },
    { from: 'sectie-test', to: 'checkin-snapshots' },
    { from: 'sectie-test', to: 'regressietest' },
    { from: 'sectie-test', to: 'horizon-strategie' },
    { from: 'sectie-test', to: 'horizon-kernel' },
    { from: 'sectie-test', to: 'ai-extractie' },
    { from: 'sectie-test', to: 'widget-galerij' },

    // Ter info
    { from: 'sectie-info', to: 'kpi' },
    { from: 'sectie-info', to: 'architectuur' },
    { from: 'sectie-info', to: 'naslag' },
    { from: 'sectie-info', to: 'webprestaties' },

    // secties → uitkomst
    { from: 'sectie-tech', to: 'beheerd' },
    { from: 'sectie-func', to: 'beheerd' },
    { from: 'sectie-test', to: 'beheerd' },
    { from: 'sectie-info', to: 'beheerd' },
  ],
}
