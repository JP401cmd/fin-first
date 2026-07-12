// Gecureerde Belasting-procesflow (verdiepingslaag laag 2 voor de UAT-plaat).
//
// Bron: docs/uat/uat-plan.md Deel 1 — "Belasting (Box 1/2/3) (WF-BELAST)"
// (WF-BELAST-01..19, 21) en de acceptatie in lib/uat/acceptance/belast.ts.
// De knopen met `scenarioId` verwijzen naar de UAT-scenario-ID's uit
// lib/uat/catalog.ts (UAT-BELAST-NN) en erven daarmee de rondestatus. Het label
// toont bewust het WF-nummer, spiegelt lib/uat/flows/schuld.ts + bezit.ts.
//
// Het proces leest links→rechts: instap → belasting-hub (I · De druk, totale
// jaarheffing + vrijheidstijd) → hub-secties (kansen, kalender, vooruitblik) en
// de box-kaarten → beslispunt "welke box?" → drie sporen:
//   • Box 1 (werk + woning): druk-hero/waterfall/marginale curve → bruto-inkomen
//     aanpassen → eigen woning (forfait vs renteaftrek/Hillen) → jaarruimte &
//     lijfrente → jaarruimte per persoon (huishouden).
//   • Box 2 (aanmerkelijk belang): beslispunt "AB?" → lege staat (geen AB) óf
//     DGA-aanslag → leengrens (excessief lenen) → dividend-schijfsimulator →
//     gecombineerde druk Vpb + Box 2.
//   • Box 3 (sparen + beleggen): aanslag/rekenstappen/classificatie → beslispunt
//     "tegenbewijs?" → werkelijk vs forfaitair → partner-verdeling → peildatum &
//     2028-stelsel.
// Overkoepelend voedt elke besparingskans/simulator de knop "Toevoegen als actie"
// (WF-BELAST-04). Alles vloeit samen in de uitkomst (belastingbeeld + vrijheids-
// tijd) → cross-doorwerking.
//
// WF-BELAST-20 (perspectief wisselen → UAT-NAV-19) en WF-BELAST-22 (pagina-uitleg
// (i)/statuspunt → UAT-OVZ-12) zijn VERWIJSREGELS (afbakening uat-plan.md §1.4) en
// hebben bewust GEEN eigen BELAST-scenario — ze komen hier daarom niet als knoop
// voor, net zoals WF-SCHULD-19 in schuld.ts en WF-BEZIT-19/20 in bezit.ts. De
// doorwerking van het perspectief-wisselen is wél zichtbaar via de huishoud-/
// partnerknopen (WF-11, WF-19) die naar `x-mijn` lopen; de wisselmechaniek zelf
// hoort in NAV getoetst te worden.
//
// GRONDSLAG-REGEL (CLAUDE.md · "consume, don't recompute"): de flow herberekent
// niets zelf maar consumeert de canonieke motoren (computeBox1Tax, calculateBox2,
// calculateBox3, computeJaarruimte). Twee kanten van dezelfde relatie worden uit
// elkaar gehouden:
//   • INPUT/grondslag (stage 0): de heffing CONSUMEERT bezittingen (Box 3-vermogen,
//     WOZ eigen woning, deelnemingen → `x-bezit`) en schulden (hypotheekrenteaftrek
//     Box 1, Box 3-schuld/drempel, DGA-lening → `x-schuld`). `x-schuld` spiegelt de
//     `x-belast`-cross die schuld.ts al legt; `x-bezit` de `x-belast` uit bezit.ts.
//   • OUTPUT/doorwerking: de belastingdruk voedt de Overzicht-hero, gezondheids-
//     score en vrijheidstijd (`x-ovz`), en Box 3-forfait + jaarruimte/lijfrente
//     voeden de horizon-kernel (`x-toek`; spiegelt de `x-belast`-grondslag in
//     toek.ts). Partnerdata (jaarruimte/Box 3-verdeling) is privacy-gated
//     huishoud-fundament (`x-mijn`).
//
// GEEN React, GEEN data-fetching — pure curatie.

import type { UatFlow } from './types'

export const BELAST_FLOW: UatFlow = {
  zone: 'BELAST',
  nodes: [
    // ── 0 · instap ────────────────────────────────────────────────────────
    { id: 'nav', label: 'Navigatie naar Belasting (/overzicht/belasting)', kind: 'entry', stage: 0 },

    // ── 0 · grondslag (INPUT — de heffing consumeert vermogen & schulden) ──
    { id: 'x-bezit', label: 'Bezittingen · Box 3-vermogen, WOZ eigen woning, deelnemingen', kind: 'cross', stage: 0, lane: 'grondslag', crossZone: 'BEZIT' },
    { id: 'x-schuld', label: 'Schulden · hypotheekrenteaftrek, Box 3-schuld, DGA-lening', kind: 'cross', stage: 0, lane: 'grondslag', crossZone: 'SCHULD' },

    // ── 1 · hub ───────────────────────────────────────────────────────────
    { id: 'hub', scenarioId: 'UAT-BELAST-01', label: 'WF-BELAST-01 · Totale belastingdruk (I · De druk, verdeling, bruto→netto)', kind: 'screen', stage: 1 },

    // ── 2 · box-kaarten & beslispunt ──────────────────────────────────────
    { id: 'boxkaarten', scenarioId: 'UAT-BELAST-02', label: 'WF-BELAST-02 · Box-kaarten (status + KPI + drilldown)', kind: 'screen', stage: 2, lane: 'kiezen' },
    { id: 'boxbeslis', label: 'Welke box? (Box 1 / Box 2 / Box 3)', kind: 'decision', stage: 2, lane: 'kiezen' },

    // ── 2 · hub-secties (overkoepelend) ───────────────────────────────────
    { id: 'kansen', scenarioId: 'UAT-BELAST-03', label: 'WF-BELAST-03 · Besparingskansen (II · De kansen)', kind: 'screen', stage: 2, lane: 'hub' },
    { id: 'kalender', scenarioId: 'UAT-BELAST-05', label: 'WF-BELAST-05 · Fiscale kalender (III)', kind: 'screen', stage: 2, lane: 'hub' },
    { id: 'vooruitblik', scenarioId: 'UAT-BELAST-06', label: 'WF-BELAST-06 · Vooruitblik stelselwijzigingen (V)', kind: 'screen', stage: 2, lane: 'hub' },

    // ── 3 · Box 1-spoor (werk + woning) ───────────────────────────────────
    { id: 'box1', scenarioId: 'UAT-BELAST-07', label: 'WF-BELAST-07 · Box 1-druk (hero, waterfall, heffingskortingen, marginale curve)', kind: 'screen', stage: 3, lane: 'box1' },
    { id: 'bruto', scenarioId: 'UAT-BELAST-08', label: 'WF-BELAST-08 · Bruto-jaarinkomen aanpassen', kind: 'action', stage: 3, lane: 'box1', subOf: 'box1' },
    { id: 'woning', scenarioId: 'UAT-BELAST-09', label: 'WF-BELAST-09 · Eigen woning (forfait vs renteaftrek, Hillen)', kind: 'screen', stage: 3, lane: 'box1', subOf: 'box1' },
    { id: 'jaarruimte', scenarioId: 'UAT-BELAST-10', label: 'WF-BELAST-10 · Jaarruimte & lijfrente-inleg simuleren', kind: 'screen', stage: 3, lane: 'box1', subOf: 'box1' },
    { id: 'jaarruimte-partner', scenarioId: 'UAT-BELAST-11', label: 'WF-BELAST-11 · Jaarruimte per persoon (huishouden)', kind: 'screen', stage: 3, lane: 'box1', subOf: 'box1' },

    // ── 3 · Box 2-spoor (aanmerkelijk belang) ─────────────────────────────
    { id: 'abbeslis', label: 'Aanmerkelijk belang (≥ 5%)?', kind: 'decision', stage: 3, lane: 'box2' },
    { id: 'box2-leeg', scenarioId: 'UAT-BELAST-12', label: 'WF-BELAST-12 · Box 2 eerste gebruik: relevantie-detectie & lege staat', kind: 'screen', stage: 3, lane: 'box2' },
    { id: 'box2', scenarioId: 'UAT-BELAST-13', label: 'WF-BELAST-13 · Box 2-aanslag als DGA', kind: 'screen', stage: 3, lane: 'box2' },
    { id: 'leengrens', scenarioId: 'UAT-BELAST-14', label: 'WF-BELAST-14 · DGA-leengrens (Wet excessief lenen)', kind: 'screen', stage: 3, lane: 'box2', subOf: 'box2' },
    { id: 'dividendsim', scenarioId: 'UAT-BELAST-15', label: 'WF-BELAST-15 · Dividend-schijfsimulator', kind: 'action', stage: 3, lane: 'box2', subOf: 'box2' },
    { id: 'vpbbox2', scenarioId: 'UAT-BELAST-16', label: 'WF-BELAST-16 · Gecombineerde druk Vpb + Box 2', kind: 'screen', stage: 3, lane: 'box2', subOf: 'box2' },

    // ── 3 · Box 3-spoor (sparen + beleggen) ───────────────────────────────
    { id: 'box3', scenarioId: 'UAT-BELAST-17', label: 'WF-BELAST-17 · Box 3-aanslag (rekenstappen, classificatie, opbouw, mix)', kind: 'screen', stage: 3, lane: 'box3' },
    { id: 'tegenbeslis', label: 'Tegenbewijs voordelig?', kind: 'decision', stage: 3, lane: 'box3', subOf: 'box3' },
    { id: 'tegenbewijs', scenarioId: 'UAT-BELAST-18', label: 'WF-BELAST-18 · Tegenbewijs simuleren (werkelijk vs forfaitair)', kind: 'action', stage: 3, lane: 'box3', subOf: 'box3' },
    { id: 'box3-partner', scenarioId: 'UAT-BELAST-19', label: 'WF-BELAST-19 · Box 3-vermogen verdelen met fiscale partner', kind: 'screen', stage: 3, lane: 'box3', subOf: 'box3' },
    { id: 'peildatum', scenarioId: 'UAT-BELAST-21', label: 'WF-BELAST-21 · Peildatum, arbitragevenster & 2028-stelsel', kind: 'screen', stage: 3, lane: 'box3', subOf: 'box3' },

    // ── 4 · actie & partnerdata ───────────────────────────────────────────
    { id: 'actie', scenarioId: 'UAT-BELAST-04', label: 'WF-BELAST-04 · Belastingkans toevoegen als actie', kind: 'action', stage: 4, lane: 'doorwerking' },
    { id: 'x-mijn', label: 'Huishoudlid · partner-jaarruimte & Box 3-verdeling (privacy-gated)', kind: 'cross', stage: 4, lane: 'partner', crossZone: 'MIJN' },

    // ── 5 · uitkomst ──────────────────────────────────────────────────────
    { id: 'uitkomst', label: 'Belastingbeeld bijgewerkt · totale druk, per box & vrijheidstijd', kind: 'outcome', stage: 5 },

    // ── 6 · cross-doorwerking (OUTPUT) ────────────────────────────────────
    { id: 'x-ovz', label: 'Overzicht-hero · belastingdruk, gezondheidsscore & vrijheidstijd', kind: 'cross', stage: 6, crossZone: 'OVZ' },
    { id: 'x-toek', label: 'FIRE-projectie · Box 3-forfait & jaarruimte/lijfrente', kind: 'cross', stage: 6, crossZone: 'TOEK' },
  ],
  edges: [
    // instap + grondslag → hub
    { from: 'nav', to: 'hub' },
    { from: 'x-bezit', to: 'hub', kind: 'cross', label: 'grondslag: Box 3-vermogen & WOZ' },
    { from: 'x-schuld', to: 'hub', kind: 'cross', label: 'grondslag: renteaftrek & schulden' },

    // hub → box-kaarten + hub-secties
    { from: 'hub', to: 'boxkaarten' },
    { from: 'hub', to: 'kansen' },
    { from: 'hub', to: 'kalender' },
    { from: 'hub', to: 'vooruitblik' },

    // box-kaarten → beslispunt (welke box?) → drie sporen
    { from: 'boxkaarten', to: 'boxbeslis' },
    { from: 'boxbeslis', to: 'box1', kind: 'branch', label: 'Box 1 · werk + woning' },
    { from: 'boxbeslis', to: 'abbeslis', kind: 'branch', label: 'Box 2 · aanmerkelijk belang' },
    { from: 'boxbeslis', to: 'box3', kind: 'branch', label: 'Box 3 · sparen + beleggen' },

    // kansen deeplinkt naar de box-subpagina (jaarruimte-kans → Box 1)
    { from: 'kansen', to: 'box1', kind: 'branch', label: 'jaarruimte-kans → Box 1' },
    { from: 'kansen', to: 'actie' },

    // Box 1-spoor (rail onder de sub-hub)
    { from: 'box1', to: 'bruto' },
    { from: 'box1', to: 'woning' },
    { from: 'box1', to: 'jaarruimte' },
    { from: 'box1', to: 'jaarruimte-partner' },
    { from: 'jaarruimte', to: 'actie' },
    { from: 'jaarruimte', to: 'x-toek', kind: 'cross', label: 'lijfrente-inleg → pensioen-strategie/FIRE' },
    { from: 'jaarruimte-partner', to: 'x-mijn', kind: 'cross', label: 'partner deelt (geen) inkomen' },

    // Box 2-spoor (beslispunt: AB? → lege staat óf DGA-aanslag)
    { from: 'abbeslis', to: 'box2-leeg', kind: 'branch', label: 'nee: geen AB' },
    { from: 'abbeslis', to: 'box2', kind: 'branch', label: 'ja: DGA' },
    { from: 'box2', to: 'leengrens' },
    { from: 'box2', to: 'dividendsim' },
    { from: 'box2', to: 'vpbbox2' },
    { from: 'leengrens', to: 'actie' },

    // Box 3-spoor (beslispunt: tegenbewijs?)
    { from: 'box3', to: 'tegenbeslis' },
    { from: 'tegenbeslis', to: 'tegenbewijs', kind: 'branch', label: 'ja: rendement onder omslagpunt' },
    { from: 'box3', to: 'box3-partner' },
    { from: 'box3', to: 'peildatum' },
    { from: 'tegenbewijs', to: 'actie' },
    { from: 'box3-partner', to: 'actie' },
    { from: 'box3-partner', to: 'x-mijn', kind: 'cross', label: 'partnerverdeling (privacy-gated)' },

    // samenvloeien → uitkomst
    { from: 'box1', to: 'uitkomst' },
    { from: 'box2', to: 'uitkomst' },
    { from: 'box3', to: 'uitkomst' },
    { from: 'bruto', to: 'uitkomst' },

    // actie → doorwerking (kans → actie op Overzicht/Will)
    { from: 'actie', to: 'x-ovz', kind: 'cross', label: 'kans → actie (Will/acties op Overzicht)' },

    // uitkomst → cross-doorwerking (OUTPUT)
    { from: 'uitkomst', to: 'x-ovz', kind: 'cross' },
    { from: 'uitkomst', to: 'x-toek', kind: 'cross' },
  ],
}
