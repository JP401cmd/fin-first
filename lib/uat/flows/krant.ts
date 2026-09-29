// Gecureerde Krant-procesflow (verdiepingslaag laag 2 voor de UAT-plaat).
//
// Bron: de acceptatie in lib/uat/acceptance/krant.ts (Krant 2B + 2A fase 2,
// ADR 0184). De knopen met `scenarioId` verwijzen naar UAT-KRANT-NN uit
// lib/uat/catalog.ts en erven de rondestatus.
//
// Opbouw: instap (inloggen als Krant-account) → landing op /nieuws → de
// beslissing "ligt dit pad binnen de grens?" met de twee handhavingsmomenten
// (server-redirect bij een harde laadbeurt, client-wacht bij een in-app link)
// en de grensroutes zelf; daarnaast drie lanes — wat de navigatie toont, wat
// er zonder Fin/AI níét is, en de productkeuze — en tot slot de regressie voor
// elk ander account. Cross-knopen wijzen naar de zones die het Geheel-gedrag
// en de Krant-inhoud dragen.
//
// GEEN React, GEEN data-fetching — pure curatie.

import type { UatFlow } from './types'

export const KRANT_FLOW: UatFlow = {
  zone: 'KRANT',
  nodes: [
    // ── 0 · instap ────────────────────────────────────────────────────────
    { id: 'entry', label: 'Inloggen als Krant-account (active_modules = [\'nieuws\'])', kind: 'entry', stage: 0 },

    // ── 1 · landing ───────────────────────────────────────────────────────
    { id: 'landing', scenarioId: 'UAT-KRANT-01', label: 'WF-KRANT-01 · Landing op /nieuws (ook vanaf / en /dashboard)', kind: 'screen', stage: 1, lane: 'grens' },

    // ── 2 · de grens ──────────────────────────────────────────────────────
    { id: 'binnen-grens', label: 'Pad binnen de Krant-grens?', kind: 'decision', stage: 2, lane: 'grens' },

    // ── 3 · handhaving + grensroutes ──────────────────────────────────────
    { id: 'server-redirect', scenarioId: 'UAT-KRANT-02', label: 'WF-KRANT-02 · Harde laadbeurt buiten de grens → server-redirect naar /nieuws', kind: 'action', stage: 3, lane: 'grens' },
    { id: 'client-wacht', scenarioId: 'UAT-KRANT-03', label: 'WF-KRANT-03 · In-app link buiten de grens → KrantRouteGuard vervangt door /nieuws', kind: 'action', stage: 3, lane: 'grens' },
    { id: 'grensroutes', scenarioId: 'UAT-KRANT-04', label: 'WF-KRANT-04 · /nieuws, /mijn/account, /mijn/notificaties laden zonder redirect of lus', kind: 'screen', stage: 3, lane: 'grens' },
    { id: 'beheer', scenarioId: 'UAT-KRANT-05', label: 'WF-KRANT-05 · Superadmin houdt /beheer, gewone gebruiker niet', kind: 'screen', stage: 3, lane: 'grens' },

    // ── 2-3 · navigatie ───────────────────────────────────────────────────
    { id: 'zijbalk', scenarioId: 'UAT-KRANT-06', label: 'WF-KRANT-06 · Desktop-zijbalk: alleen Krant en Mijn', kind: 'screen', stage: 2, lane: 'navigatie' },
    { id: 'nav-overig', scenarioId: 'UAT-KRANT-07', label: 'WF-KRANT-07 · Nav-sheet, TopBar-menu, /mijn-tabbalk en ⌘K binnen de grens', kind: 'screen', stage: 3, lane: 'navigatie' },

    // ── 2-3 · zonder Fin en AI ────────────────────────────────────────────
    { id: 'geen-fin', scenarioId: 'UAT-KRANT-08', label: 'WF-KRANT-08 · Geen Fin, chat, vragenlijst of AI-keuze', kind: 'screen', stage: 2, lane: 'zonder-fin' },
    { id: 'geen-briefing', scenarioId: 'UAT-KRANT-09', label: 'WF-KRANT-09 · Geen maandagmail, geen horizon-meldingen', kind: 'outcome', stage: 3, lane: 'zonder-fin' },
    { id: 'ai-poort', scenarioId: 'UAT-KRANT-10', label: 'WF-KRANT-10 · AI-routes 403; add-on aanzetten 403, uitzetten mag', kind: 'action', stage: 3, lane: 'zonder-fin' },

    // ── 1-2 · productkeuze ────────────────────────────────────────────────
    { id: 'productkeuze', scenarioId: 'UAT-KRANT-11', label: 'WF-KRANT-11 · PUT /api/modules krant ⇄ geheel (niets gewist)', kind: 'action', stage: 1, lane: 'product' },
    { id: 'regressie', scenarioId: 'UAT-KRANT-12', label: 'WF-KRANT-12 · REGRESSIE: null / alle zes zien alles zoals vroeger', kind: 'outcome', stage: 2, lane: 'product' },

    // ── 4 · cross-zone ────────────────────────────────────────────────────
    { id: 'x-will', label: 'Fin, berichten & krant · de inhoud van /nieuws (UAT-WILL-15..19)', kind: 'cross', stage: 4, crossZone: 'WILL' },
    { id: 'x-nav', label: 'Navigatie & shell · de volledige navigatie van een Geheel-account (UAT-NAV-01..)', kind: 'cross', stage: 4, crossZone: 'NAV' },
    { id: 'x-mijn', label: 'Mijn · homescherm-picker zonder "Nieuws" (UAT-MIJN-22)', kind: 'cross', stage: 4, crossZone: 'MIJN' },
    { id: 'x-start', label: 'Start · routebescherming en login-landing (UAT-START-16)', kind: 'cross', stage: 4, crossZone: 'START' },
  ],
  edges: [
    { from: 'entry', to: 'landing' },
    { from: 'landing', to: 'binnen-grens' },
    { from: 'binnen-grens', to: 'grensroutes', label: 'ja', kind: 'branch' },
    { from: 'binnen-grens', to: 'server-redirect', label: 'nee, harde laadbeurt', kind: 'branch' },
    { from: 'binnen-grens', to: 'client-wacht', label: 'nee, in-app link', kind: 'branch' },
    { from: 'binnen-grens', to: 'beheer', label: '/beheer', kind: 'branch' },
    { from: 'server-redirect', to: 'landing' },
    { from: 'client-wacht', to: 'landing' },
    { from: 'landing', to: 'zijbalk' },
    { from: 'zijbalk', to: 'nav-overig' },
    { from: 'landing', to: 'geen-fin' },
    { from: 'geen-fin', to: 'geen-briefing' },
    { from: 'geen-fin', to: 'ai-poort' },
    { from: 'entry', to: 'productkeuze' },
    { from: 'productkeuze', to: 'landing', label: 'krant' },
    { from: 'productkeuze', to: 'regressie', label: 'geheel' },
    { from: 'grensroutes', to: 'x-will', kind: 'cross' },
    { from: 'regressie', to: 'x-nav', kind: 'cross' },
    { from: 'productkeuze', to: 'x-mijn', kind: 'cross' },
    { from: 'landing', to: 'x-start', kind: 'cross' },
  ],
}
