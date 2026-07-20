// Gecureerde Fin-procesflow (verdiepingslaag laag 2 voor de UAT-plaat).
//
// Bron: docs/uat/uat-plan.md Deel 1 — "Fin (AI-coach), berichten & krant
// (WF-WILL)" (WF-WILL-01..22) en de acceptatie in lib/uat/acceptance/will.ts.
// De knopen met `scenarioId` verwijzen naar de UAT-scenario-ID's uit
// lib/uat/catalog.ts (UAT-WILL-NN) en erven daarmee de rondestatus. Het label
// toont bewust het WF-nummer, spiegelt lib/uat/flows/budget.ts + start.ts.
//
// WILL is — net als SCHULD (WF-19 ontbreekt) en TOEK (WF-27/31 ontbreken) —
// NIET aaneengesloten op WF-nummer: WF-WILL-21/22 hebben geen eigen
// UAT-WILL-scenario (het UAT-plan wijst ze door naar UAT-OVZ-19/20/21) en
// bestaan dus niet in de catalogus voor zone WILL. Alle 20 WF-WILL-01..20
// hebben wél een eigen knoop hieronder — geen verwijsregel-gaten BINNEN de
// 20 die deze zone daadwerkelijk bezit.
//
// Het proces leest links→rechts: instap (bubbel/bel/krant overal zichtbaar) →
// chat-kern (vrije vraag, tip/actie-beslissing, pin, badge-heropak, contextuele
// starters, foutherstel) → meldingen (bel, berichtencentrum, opvolgen,
// voorkeuren, briefing) → krant (lezen, verversen, archief, bespreken,
// actie maken, minder-hierover) → uitkomst → cross-doorwerking.
//
// GRONDSLAG-REGEL (CLAUDE.md / zone-specifieke notitie): AI-output (chat-
// antwoorden, artikeltekst) is NIET deterministisch — die knopen zijn
// 'ui-only' in will.ts en worden in de live-run op PROCES getoetst (komt er
// een antwoord, gaat het over de vraag, geen datalek). Meldingen, de
// coach-regelselectie, notificatievoorkeuren-filtering, de briefing-
// weeksleutel en de krant-administratie zijn wél volledig deterministisch.
//
// GEEN React, GEEN data-fetching — pure curatie.

import type { UatFlow } from './types'

export const WILL_FLOW: UatFlow = {
  zone: 'WILL',
  nodes: [
    // ── 0 · instap ────────────────────────────────────────────────────────
    { id: 'nav', label: 'Fin-bubbel/bel/krant-icoon zichtbaar op elke pagina', kind: 'entry', stage: 0 },
    { id: 'chatbeslis', label: 'Vrije vraag, tip/badge, of vanuit context elders?', kind: 'decision', stage: 0 },
    { id: 'coachmelding', scenarioId: 'UAT-WILL-05', label: 'WF-WILL-05 · Coach-melding ontvangen en opvolgen', kind: 'screen', stage: 0, lane: 'chat' },

    // ── 1 · chat-kern ─────────────────────────────────────────────────────
    { id: 'vraag', scenarioId: 'UAT-WILL-01', label: 'WF-WILL-01 · Vrije vraag stellen aan Fin', kind: 'screen', stage: 1, lane: 'chat' },
    { id: 'tip', scenarioId: 'UAT-WILL-02', label: 'WF-WILL-02 · Tip beslissen (accepteren/uitstellen/afwijzen)', kind: 'action', stage: 1, lane: 'chat', subOf: 'vraag' },
    { id: 'actie', scenarioId: 'UAT-WILL-03', label: 'WF-WILL-03 · Actievoorstel toevoegen', kind: 'action', stage: 1, lane: 'chat', subOf: 'vraag' },
    { id: 'pin', scenarioId: 'UAT-WILL-04', label: 'WF-WILL-04 · Chat vastzetten als zijpaneel', kind: 'action', stage: 1, lane: 'chat', subOf: 'vraag' },
    { id: 'fouth', scenarioId: 'UAT-WILL-09', label: 'WF-WILL-09 · Foutherstel in de chat', kind: 'action', stage: 1, lane: 'chat', subOf: 'vraag' },
    { id: 'badge', scenarioId: 'UAT-WILL-06', label: 'WF-WILL-06 · Uitgestelde tips heropakken via de badge', kind: 'action', stage: 1, lane: 'chat' },
    { id: 'bespreek', scenarioId: 'UAT-WILL-07', label: 'WF-WILL-07 · "Bespreek met Fin" vanaf een onderwerp', kind: 'action', stage: 1, lane: 'chat' },
    { id: 'deeplink', scenarioId: 'UAT-WILL-08', label: 'WF-WILL-08 · Chat starten via ?prompt=-deeplink', kind: 'action', stage: 1, lane: 'chat' },

    // ── 2 · meldingen ─────────────────────────────────────────────────────
    { id: 'bel', scenarioId: 'UAT-WILL-10', label: 'WF-WILL-10 · Meldingen checken via de bel', kind: 'screen', stage: 2, lane: 'meldingen' },
    { id: 'berichten', scenarioId: 'UAT-WILL-11', label: 'WF-WILL-11 · Berichtencentrum bekijken/opruimen (/berichten)', kind: 'screen', stage: 2, lane: 'meldingen' },
    { id: 'opvolgen', scenarioId: 'UAT-WILL-12', label: 'WF-WILL-12 · Melding opvolgen (doorklikken/Fin vragen)', kind: 'action', stage: 2, lane: 'meldingen', subOf: 'bel' },
    { id: 'voorkeuren', scenarioId: 'UAT-WILL-13', label: 'WF-WILL-13 · Notificatievoorkeuren laten doorwerken', kind: 'screen', stage: 2, lane: 'meldingen' },
    { id: 'briefingmelding', scenarioId: 'UAT-WILL-14', label: 'WF-WILL-14 · Wekelijkse briefing-melding', kind: 'screen', stage: 2, lane: 'meldingen' },

    // ── 3 · krant ─────────────────────────────────────────────────────────
    { id: 'krant', scenarioId: 'UAT-WILL-15', label: 'WF-WILL-15 · Persoonlijke krant openen en lezen (/nieuws)', kind: 'screen', stage: 3, lane: 'krant' },
    { id: 'ververs', scenarioId: 'UAT-WILL-16', label: 'WF-WILL-16 · Krant verversen binnen de weeklimiet', kind: 'action', stage: 3, lane: 'krant', subOf: 'krant' },
    { id: 'archief', scenarioId: 'UAT-WILL-17', label: 'WF-WILL-17 · Krantenarchief doorbladeren', kind: 'screen', stage: 3, lane: 'krant', subOf: 'krant' },
    { id: 'artikelbespreek', scenarioId: 'UAT-WILL-18', label: 'WF-WILL-18 · Nieuwsartikel met Fin bespreken', kind: 'action', stage: 3, lane: 'krant', subOf: 'krant' },
    { id: 'artikelactie', scenarioId: 'UAT-WILL-19', label: 'WF-WILL-19 · Actie maken vanuit een nieuwsartikel', kind: 'action', stage: 3, lane: 'krant', subOf: 'krant' },
    { id: 'minderhierover', scenarioId: 'UAT-WILL-20', label: 'WF-WILL-20 · "Minder hierover"-feedback geven', kind: 'action', stage: 3, lane: 'krant', subOf: 'krant' },

    // ── 4 · uitkomst ──────────────────────────────────────────────────────
    { id: 'uitkomst', label: 'Tips/acties/meldingen/krant bijgewerkt', kind: 'outcome', stage: 4 },

    // ── 5 · cross-doorwerking (OUTPUT) ───────────────────────────────────
    { id: 'x-ovz', label: 'Overzicht · Toptips & Open acties (/overzicht/tips), briefing (/overzicht#briefing)', kind: 'cross', stage: 5, crossZone: 'OVZ' },
    { id: 'x-mijn', label: 'Mijn · Notificatievoorkeuren (/mijn/notificaties)', kind: 'cross', stage: 5, crossZone: 'MIJN' },
    { id: 'x-bezit', label: 'Bezittingen · Koersalert-instelling (UAT-BEZIT-17) voedt de bel-melding', kind: 'cross', stage: 5, crossZone: 'BEZIT' },
    { id: 'x-toek', label: 'Toekomst · "Bespreek met Fin"-knoppen bij fase-analyses/tijdas', kind: 'cross', stage: 5, crossZone: 'TOEK' },
  ],
  edges: [
    // instap
    { from: 'nav', to: 'chatbeslis' },
    { from: 'nav', to: 'bel' },
    { from: 'nav', to: 'krant' },
    { from: 'nav', to: 'coachmelding' },
    { from: 'coachmelding', to: 'vraag', label: 'klik op de meldingstekst opent de chat' },

    // chat-kern (beslispunt: hoe de chat wordt geopend)
    { from: 'chatbeslis', to: 'vraag', kind: 'branch', label: 'vrije vraag' },
    { from: 'chatbeslis', to: 'bespreek', kind: 'branch', label: 'vanuit context elders' },
    { from: 'chatbeslis', to: 'deeplink', kind: 'branch', label: '?prompt=-deeplink' },
    { from: 'chatbeslis', to: 'badge', kind: 'branch', label: 'badge > 0 (uitgestelde tips)' },
    { from: 'vraag', to: 'tip' },
    { from: 'vraag', to: 'actie' },
    { from: 'vraag', to: 'pin' },
    { from: 'vraag', to: 'fouth' },
    { from: 'bespreek', to: 'tip' },
    { from: 'bespreek', to: 'x-toek', kind: 'cross' },
    { from: 'deeplink', to: 'tip' },
    { from: 'badge', to: 'tip' },

    // meldingen
    { from: 'bel', to: 'opvolgen' },
    { from: 'bel', to: 'berichten' },
    { from: 'berichten', to: 'opvolgen' },
    { from: 'bel', to: 'voorkeuren' },
    { from: 'voorkeuren', to: 'x-mijn', kind: 'cross' },
    { from: 'bel', to: 'x-bezit', kind: 'cross', label: 'koersalert-keten' },
    { from: 'bel', to: 'briefingmelding' },

    // krant
    { from: 'krant', to: 'ververs' },
    { from: 'krant', to: 'archief' },
    { from: 'krant', to: 'artikelbespreek' },
    { from: 'krant', to: 'artikelactie' },
    { from: 'krant', to: 'minderhierover' },
    { from: 'artikelbespreek', to: 'tip' },

    // samenvloeien → uitkomst
    { from: 'tip', to: 'uitkomst' },
    { from: 'actie', to: 'uitkomst' },
    { from: 'pin', to: 'uitkomst' },
    { from: 'fouth', to: 'uitkomst' },
    { from: 'opvolgen', to: 'uitkomst' },
    { from: 'voorkeuren', to: 'uitkomst' },
    { from: 'briefingmelding', to: 'uitkomst' },
    { from: 'ververs', to: 'uitkomst' },
    { from: 'archief', to: 'uitkomst' },
    { from: 'artikelactie', to: 'uitkomst' },
    { from: 'minderhierover', to: 'uitkomst' },

    // uitkomst → cross-doorwerking (OUTPUT)
    { from: 'uitkomst', to: 'x-ovz', kind: 'cross' },
  ],
}
