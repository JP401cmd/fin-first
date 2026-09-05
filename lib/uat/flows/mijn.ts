// Gecureerde Mijn-procesflow (verdiepingslaag laag 2 voor de UAT-plaat).
//
// Bron: docs/uat/uat-plan.md Deel 1 — "Mijn: profiel, huishouden, account &
// voorkeuren (WF-MIJN)" en de acceptatie in lib/uat/acceptance/mijn.ts. De knopen
// met `scenarioId` verwijzen naar de UAT-scenario-ID's uit lib/uat/catalog.ts
// (UAT-MIJN-NN) en erven daarmee de rondestatus. Spiegelt lib/uat/flows/schuld.ts.
//
// Het proces leest links→rechts: instap (Mijn-hub) → profiel (persoonlijk +
// huishoudprofiel) → huishouden (partner uitnodigen/accepteren/verlaten, privacy,
// gedeeld budget) → account (abonnement, credits, inloggegevens, AI, verwijderen)
// → voorkeuren (notificaties, uiterlijk, privacy-overzicht) → data (koppelingen,
// belastingimport, export, reset) → check-in → uitkomst → cross-doorwerking.
//
// MIJN is de HUISHOUD-/ACCOUNT-FUNDAMENT-zone: de configuratie hier werkt door in
// vrijwel elke andere zone (gedeeld budget → BUDGET, belastingaangifte-import →
// BEZIT/SCHULD, perspectief/gedeelde ownership → OVZ). De cross-knopen zijn daarom
// vooral OUTPUT-doorwerking.
//
// De verwijsregels WF-MIJN-10/17/23 (perspectief wisselen / bedragen maskeren /
// uitloggen) wijzen door naar UAT-NAV-19/11/10 en hebben bewust GEEN eigen
// MIJN-scenario/knoop (spiegelt WF-SCHULD-19 in schuld.ts).
//
// GEEN React, GEEN data-fetching — pure curatie.

import type { UatFlow } from './types'

export const MIJN_FLOW: UatFlow = {
  zone: 'MIJN',
  nodes: [
    // ── 0 · instap ────────────────────────────────────────────────────────
    { id: 'nav', label: 'Navigatie naar Mijn (/mijn)', kind: 'entry', stage: 0 },
    { id: 'hub', scenarioId: 'UAT-MIJN-01', label: 'WF-MIJN-01 · Mijn-hub verkennen en navigeren', kind: 'screen', stage: 1 },

    // ── 2 · profiel ───────────────────────────────────────────────────────
    { id: 'profiel', scenarioId: 'UAT-MIJN-02', label: 'WF-MIJN-02 · Persoonlijke gegevens bewerken', kind: 'screen', stage: 2, lane: 'profiel' },
    { id: 'huishoudprofiel', scenarioId: 'UAT-MIJN-03', label: 'WF-MIJN-03 · Huishoudprofiel (NIBUD) invullen', kind: 'screen', stage: 2, lane: 'profiel' },

    // ── 2 · huishouden ────────────────────────────────────────────────────
    { id: 'partner-uitnodigen', scenarioId: 'UAT-MIJN-04', label: 'WF-MIJN-04 · Huishouden starten: partner uitnodigen', kind: 'action', stage: 2, lane: 'huishouden' },
    { id: 'uitnodigingbeslis', label: 'Uitnodiging: accepteren of weigeren?', kind: 'decision', stage: 2, lane: 'huishouden' },
    { id: 'uitnodiging-ontvangen', scenarioId: 'UAT-MIJN-05', label: 'WF-MIJN-05 · Uitnodiging ontvangen: accepteren/weigeren', kind: 'screen', stage: 2, lane: 'huishouden', subOf: 'uitnodigingbeslis' },
    { id: 'uitnodiging-intrekken', scenarioId: 'UAT-MIJN-29', label: 'WF-MIJN-29 · Openstaande uitnodiging intrekken', kind: 'action', stage: 2, lane: 'huishouden', subOf: 'partner-uitnodigen' },
    { id: 'hh-privacy', scenarioId: 'UAT-MIJN-07', label: 'WF-MIJN-07 · Privacy binnen het huishouden per categorie', kind: 'screen', stage: 2, lane: 'huishouden' },
    { id: 'huishouden-verlaten', scenarioId: 'UAT-MIJN-06', label: 'WF-MIJN-06 · Huishouden verlaten', kind: 'action', stage: 2, lane: 'huishouden' },

    // ── 3 · gedeeld budget (merge-wizard) ─────────────────────────────────
    { id: 'merge-wizard', scenarioId: 'UAT-MIJN-08', label: 'WF-MIJN-08 · Gezamenlijk huishoudbudget voorstellen (merge-wizard)', kind: 'action', stage: 3, lane: 'huishouden' },
    { id: 'voorstel-afhandelen', scenarioId: 'UAT-MIJN-09', label: 'WF-MIJN-09 · Voorstel afhandelen (review/afwijzen/intrekken/terugdraaien)', kind: 'screen', stage: 3, lane: 'huishouden', subOf: 'merge-wizard' },

    // ── 2 · account ───────────────────────────────────────────────────────
    { id: 'abonnement', scenarioId: 'UAT-MIJN-11', label: 'WF-MIJN-11 · Abonnement bekijken en upgraden ("Binnenkort")', kind: 'screen', stage: 2, lane: 'account' },
    { id: 'ai-credits', scenarioId: 'UAT-MIJN-12', label: 'WF-MIJN-12 · AI-creditsverbruik inzien', kind: 'screen', stage: 2, lane: 'account' },
    { id: 'inloggegevens', scenarioId: 'UAT-MIJN-13', label: 'WF-MIJN-13 · Inloggegevens beheren (e-mail/wachtwoord/overal uitloggen)', kind: 'screen', stage: 2, lane: 'account' },
    { id: 'ai-instellingen', scenarioId: 'UAT-MIJN-16', label: 'WF-MIJN-16 · AI-instellingen (toelichting + AI aan/uit)', kind: 'screen', stage: 2, lane: 'account' },
    { id: 'mijlpalen', scenarioId: 'UAT-MIJN-32', label: 'WF-MIJN-32 · Mijlpalen-tijdlijn: dit heb je bereikt', kind: 'screen', stage: 2, lane: 'account' },
    { id: 'jaaroverzicht', scenarioId: 'UAT-MIJN-31', label: 'WF-MIJN-31 · Jaaroverzicht: jouw jaar in vrijheid', kind: 'screen', stage: 2, lane: 'account' },
    { id: 'ai-uitvoerkeuze', scenarioId: 'UAT-MIJN-30', label: 'WF-MIJN-30 · Per functionaliteit kiezen waar de AI draait (lokaal/cloud)', kind: 'screen', stage: 2, lane: 'account', subOf: 'ai-instellingen' },
    { id: 'account-verwijderen', scenarioId: 'UAT-MIJN-14', label: 'WF-MIJN-14 · Account permanent verwijderen (getypte bevestiging)', kind: 'action', stage: 2, lane: 'account' },

    // ── 2 · voorkeuren ────────────────────────────────────────────────────
    { id: 'notificaties', scenarioId: 'UAT-MIJN-20', label: 'WF-MIJN-20 · Notificatievoorkeuren (push + maandcheck-in)', kind: 'screen', stage: 2, lane: 'voorkeuren' },
    { id: 'partner-meldingen', scenarioId: 'UAT-MIJN-21', label: 'WF-MIJN-21 · Partner-transactiemeldingen configureren', kind: 'screen', stage: 2, lane: 'voorkeuren' },
    { id: 'uiterlijk', scenarioId: 'UAT-MIJN-22', label: 'WF-MIJN-22 · Weergave en uiterlijk (palet, typografie, geavanceerde kleuren)', kind: 'screen', stage: 2, lane: 'voorkeuren' },
    { id: 'privacy-overzicht', scenarioId: 'UAT-MIJN-15', label: 'WF-MIJN-15 · Privacy- en transparantie-overzicht', kind: 'screen', stage: 2, lane: 'voorkeuren' },

    // ── 2 · data & koppelingen ────────────────────────────────────────────
    { id: 'koppelingen', scenarioId: 'UAT-MIJN-18', label: 'WF-MIJN-18 · Koppelingen inzien, testen en handmatig syncen', kind: 'screen', stage: 2, lane: 'data' },
    { id: 'belastingimport', scenarioId: 'UAT-MIJN-19', label: 'WF-MIJN-19 · Belastingaangifte importeren / import verwijderen', kind: 'action', stage: 2, lane: 'data' },
    { id: 'csv-export', scenarioId: 'UAT-MIJN-24', label: 'WF-MIJN-24 · Data exporteren als CSV', kind: 'action', stage: 2, lane: 'data' },
    { id: 'reset', scenarioId: 'UAT-MIJN-25', label: 'WF-MIJN-25 · Alle gegevens resetten en opnieuw beginnen', kind: 'action', stage: 2, lane: 'data' },

    // ── 2 · check-in ──────────────────────────────────────────────────────
    { id: 'checkin', scenarioId: 'UAT-MIJN-26', label: 'WF-MIJN-26 · Maandelijkse geldcheck-in (7 stappen)', kind: 'screen', stage: 2, lane: 'checkin' },
    { id: 'checkin-historie', scenarioId: 'UAT-MIJN-27', label: 'WF-MIJN-27 · Check-in-historie bekijken', kind: 'screen', stage: 2, lane: 'checkin', subOf: 'checkin' },
    { id: 'feedback', scenarioId: 'UAT-MIJN-28', label: 'WF-MIJN-28 · Feedback-verwijspagina → meldvenster', kind: 'action', stage: 2, lane: 'checkin' },

    // ── 4 · uitkomst ──────────────────────────────────────────────────────
    { id: 'klaar', label: 'Profiel, huishouden, account & voorkeuren ingericht', kind: 'outcome', stage: 4 },

    // ── 5 · cross-doorwerking (OUTPUT) ────────────────────────────────────
    { id: 'x-budget', label: 'Budget · gedeeld huishoudbudget na merge', kind: 'cross', stage: 5, crossZone: 'BUDGET' },
    { id: 'x-bezit', label: 'Bezit · belastingaangifte-import vult bezittingen', kind: 'cross', stage: 5, crossZone: 'BEZIT' },
    { id: 'x-schuld', label: 'Schuld · import + gedeelde schuld (ownership)', kind: 'cross', stage: 5, crossZone: 'SCHULD' },
    { id: 'x-ovz', label: 'Overzicht · perspectief (eigen/huishouden/partner) werkt overal door', kind: 'cross', stage: 5, crossZone: 'OVZ' },
  ],
  edges: [
    // instap → hub
    { from: 'nav', to: 'hub' },

    // hub → profiel
    { from: 'hub', to: 'profiel' },
    { from: 'hub', to: 'huishoudprofiel' },

    // hub → huishouden
    { from: 'hub', to: 'partner-uitnodigen' },
    { from: 'partner-uitnodigen', to: 'uitnodigingbeslis' },
    { from: 'uitnodigingbeslis', to: 'uitnodiging-ontvangen', kind: 'branch', label: 'accepteren/weigeren' },
    { from: 'partner-uitnodigen', to: 'uitnodiging-intrekken', kind: 'branch', label: 'intrekken' },
    { from: 'uitnodiging-ontvangen', to: 'hh-privacy' },
    { from: 'hh-privacy', to: 'merge-wizard' },
    { from: 'merge-wizard', to: 'voorstel-afhandelen' },
    { from: 'hub', to: 'huishouden-verlaten' },

    // hub → account
    { from: 'hub', to: 'abonnement' },
    { from: 'hub', to: 'ai-credits' },
    { from: 'hub', to: 'inloggegevens' },
    { from: 'hub', to: 'ai-instellingen' },
    { from: 'ai-instellingen', to: 'ai-uitvoerkeuze' },
    { from: 'hub', to: 'account-verwijderen' },

    // hub → voorkeuren
    { from: 'hub', to: 'notificaties' },
    { from: 'notificaties', to: 'partner-meldingen' },
    { from: 'hub', to: 'uiterlijk' },
    { from: 'hub', to: 'privacy-overzicht' },

    // hub → data
    { from: 'hub', to: 'koppelingen' },
    { from: 'hub', to: 'belastingimport' },
    { from: 'hub', to: 'csv-export' },
    { from: 'hub', to: 'reset' },

    // hub → check-in
    { from: 'hub', to: 'checkin' },
    { from: 'checkin', to: 'checkin-historie' },
    { from: 'hub', to: 'feedback' },

    // samenvloeien → uitkomst
    { from: 'profiel', to: 'klaar' },
    { from: 'huishoudprofiel', to: 'klaar' },
    { from: 'voorstel-afhandelen', to: 'klaar' },
    { from: 'hh-privacy', to: 'klaar' },
    { from: 'abonnement', to: 'klaar' },
    { from: 'inloggegevens', to: 'klaar' },
    { from: 'ai-instellingen', to: 'klaar' },
    { from: 'notificaties', to: 'klaar' },
    { from: 'uiterlijk', to: 'klaar' },
    { from: 'koppelingen', to: 'klaar' },
    { from: 'belastingimport', to: 'klaar' },
    { from: 'checkin', to: 'klaar' },

    // uitkomst → cross-doorwerking (OUTPUT)
    { from: 'voorstel-afhandelen', to: 'x-budget', kind: 'cross', label: 'gedeeld budget' },
    { from: 'belastingimport', to: 'x-bezit', kind: 'cross', label: 'import → bezittingen' },
    { from: 'belastingimport', to: 'x-schuld', kind: 'cross', label: 'import → schulden' },
    { from: 'klaar', to: 'x-ovz', kind: 'cross' },
  ],
}
