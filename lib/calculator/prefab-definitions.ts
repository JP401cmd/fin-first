// ── Rekenhulp — prefab (TriFinity-curated) calculators ─────────────
//
// 12 kant-en-klare CalculatorDefinitions, geschreven "alsof ze in de app
// gebouwd zijn", gegroepeerd in drie tiers (starter / verdieping /
// specialist). Source of truth voor de seed-migratie die ze als publieke
// rows in de bibliotheek zet (zie scripts/generate-prefab-seed-sql.ts).
//
// Elke definitie:
//  - steunt uitsluitend op bestaande prefill-keys (geen nieuwe userdata),
//  - is statisch gevalideerd (validateFormulas → leeg) en evalueerbaar
//    zonder fouten op de default-inputs (zie prefab-definitions.test.ts),
//  - gebruikt de DNA-velden waar zinvol: derived (tussenwaarden),
//    applicability (groene/gele/rode dot), sections/style (breakdown),
//    narrative, en freedom-time via monthly_expenses.
//
// Vrijheid-in-jaren-formules guarden tegen monthly_expenses=0 met
// if(maandlasten > 0, ..., 0) zodat een gebruiker zonder uitgaven-data
// geen Infinity-fout krijgt.

import type { CalculatorDefinition } from './types'
import { resolveSchenkErfParams } from '@/lib/horizon-data'
import { BOX3_PARAMS, CURRENT_TAX_YEAR } from '@/lib/box3-data'

/**
 * Schenk-/erfbelastingvrijstellingen voor het lopende jaar — één bron
 * (SCHENK_ERF_PARAMS in horizon-data.ts). De schenkenVsErven-prefab vult
 * hiermee zijn default-velden i.p.v. losse literals, zodat de defaults
 * meebewegen met de jaargelaagde bron.
 */
const SCHENK_ERF_HUIDIG = resolveSchenkErfParams()

/**
 * Box 3-forfaits/vrijstelling voor het lopende belastingjaar — één bron
 * (BOX3_PARAMS in box3-data.ts). De box3ForfaitVsWerkelijk-prefab vult hiermee
 * zijn forfait-defaults i.p.v. losse 2025-literals (waren 5,88%/1,44%).
 */
const BOX3_HUIDIG = BOX3_PARAMS[CURRENT_TAX_YEAR]

export type PrefabTier = 'starter' | 'verdieping' | 'specialist'

export interface PrefabCalculator {
  /** Stabiele slug — basis voor de deterministische seed-UUID. */
  slug: string
  tier: PrefabTier
  /** 1 (basaal) – 5 (specialistisch). */
  complexity: 1 | 2 | 3 | 4 | 5
  definition: CalculatorDefinition
}

// ───────────────────────── TIER 1 — STARTERS ─────────────────────────

const aflossenVsBeleggen: CalculatorDefinition = {
  name: 'Aflossen vs. beleggen',
  description:
    'Leg je je maandelijkse overschot extra op de hypotheek, of beleg je het? Vergelijk de eindwaarde over de looptijd.',
  inputs: [
    { key: 'maandbedrag', label: 'Maandelijks bedrag', kind: 'euro', default: 300, min: 50, max: 2000, prefill: 'monthly_surplus', hint: 'Wat je elke maand extra inlegt' },
    { key: 'hypotheekrente', label: 'Hypotheekrente', kind: 'percent', default: 0.04, min: 0, max: 0.08, hint: 'Rente die je bespaart door af te lossen' },
    { key: 'jaren', label: 'Looptijd', kind: 'years', default: 15, min: 1, max: 30 },
    { key: 'schuld', label: 'Hypotheekschuld', kind: 'euro', default: 200000, min: 0, max: 1500000, prefill: 'mortgage_balance' },
    { key: 'maandlasten', label: 'Maandelijkse uitgaven', kind: 'euro', default: 2500, min: 0, max: 10000, prefill: 'monthly_expenses', hint: 'Voor de vertaling naar vrijheid' },
  ],
  scenarios: [
    { key: 'aflossen', label: 'Aflossen', description: 'Extra aflossen levert een gegarandeerd rendement op gelijk aan je hypotheekrente.', appliesWhen: 'if(schuld > 0, 1, 0)', notApplicableReason: 'Je hebt geen hypotheekschuld om op af te lossen.' },
    { key: 'beleggen_5', label: 'Beleggen (5%)', description: 'Voorzichtig beleggen tegen 5% gemiddeld rendement.' },
    { key: 'beleggen_8', label: 'Beleggen (8%)', description: 'Offensief beleggen tegen 8% — hoger verwacht rendement, maar meer risico.' },
  ],
  derived: [
    { key: 'totale_inleg', label: 'Totale inleg', formula: 'maandbedrag * 12 * jaren', format: 'euro' },
  ],
  outputs: [
    { key: 'eindwaarde', label: 'Eindwaarde', formula: 'if(scenario == "aflossen", fvAnnuity(maandbedrag, hypotheekrente, jaren), if(scenario == "beleggen_5", fvAnnuity(maandbedrag, 0.05, jaren), fvAnnuity(maandbedrag, 0.08, jaren)))', format: 'euro', style: 'total' },
    { key: 'rendement_winst', label: 'Waarvan groei', formula: 'eindwaarde - totale_inleg', format: 'euro', style: 'good', hint: 'Eindwaarde minus je eigen inleg' },
    { key: 'vrijheid_jaren', label: 'Vrijheid die dit oplevert', formula: 'if(maandlasten > 0, eindwaarde / (maandlasten * 12), 0)', format: 'years', style: 'good', hint: 'Hoeveel maanden/jaren leven dit kapitaal dekt' },
  ],
  compare: { outputKey: 'eindwaarde', betterDirection: 'higher' },
  narrative: '{winner_label} geeft de hoogste eindwaarde: {compare_output} — goed voor {output:vrijheid_jaren} vrijheid.',
  assumptions: [
    'Aflossen levert een gegarandeerd, risicovrij rendement gelijk aan je hypotheekrente; beleggingsrendement is onzeker.',
    'Geen rekening gehouden met belasting (box 3) of hypotheekrenteaftrek.',
    'Maandelijkse inleg, einde-maand, rendement constant over de looptijd.',
  ],
}

const spaarbufferOpbouwen: CalculatorDefinition = {
  name: 'Spaarbuffer opbouwen',
  description: 'Hoe lang duurt het tot je 6 maanden uitgaven aan buffer hebt — en versnelt extra inleg dat merkbaar?',
  inputs: [
    { key: 'huidige_buffer', label: 'Huidige buffer', kind: 'euro', default: 5000, min: 0, max: 200000, prefill: 'liquid_cash' },
    { key: 'maandinleg', label: 'Maandelijkse inleg', kind: 'euro', default: 300, min: 0, max: 3000, prefill: 'monthly_surplus' },
    { key: 'maandlasten', label: 'Maandelijkse uitgaven', kind: 'euro', default: 2500, min: 500, max: 10000, prefill: 'monthly_expenses' },
  ],
  scenarios: [
    { key: 'huidig', label: 'Huidige inleg' },
    { key: 'plus_100', label: 'Inleg +€100' },
    { key: 'plus_250', label: 'Inleg +€250' },
  ],
  derived: [
    { key: 'buffer_doel', label: 'Buffer-doel (6 mnd)', formula: 'maandlasten * 6', format: 'euro', hint: '6 maanden uitgaven' },
    { key: 'te_overbruggen', label: 'Nog te sparen', formula: 'max(0, maandlasten * 6 - huidige_buffer)', format: 'euro' },
    { key: 'inleg_effectief', label: 'Inleg in dit scenario', formula: 'if(scenario == "huidig", maandinleg, if(scenario == "plus_100", maandinleg + 100, maandinleg + 250))', format: 'euro' },
  ],
  outputs: [
    { key: 'maanden_tot_doel', label: 'Maanden tot buffer compleet', formula: 'if(inleg_effectief > 0, te_overbruggen / inleg_effectief, 0)', format: 'number', unit: 'mnd', style: 'total' },
    { key: 'jaren_tot_doel', label: 'Oftewel', formula: 'if(inleg_effectief > 0, te_overbruggen / inleg_effectief / 12, 0)', format: 'years' },
  ],
  compare: { outputKey: 'maanden_tot_doel', betterDirection: 'lower' },
  narrative: 'Met {winner_label} heb je je buffer van {derived:buffer_doel} compleet in {output:maanden_tot_doel} maanden.',
  assumptions: [
    'Buffer-doel = 6× je maandelijkse uitgaven (gangbare vuistregel).',
    'Geen rente over de buffer meegerekend (spaarrente verwaarloosd).',
  ],
}

const eerderMetPensioen: CalculatorDefinition = {
  name: 'Eerder met pensioen',
  description: 'Hoeveel jaar tot financiële vrijheid bij jouw inleg? Vergelijk drie FIRE-vuistregels (25×, 30×, 33× je jaaruitgaven).',
  inputs: [
    { key: 'vermogen', label: 'Huidig vermogen', kind: 'euro', default: 50000, min: 0, max: 5000000, prefill: 'net_worth' },
    { key: 'maandinleg', label: 'Maandelijkse inleg', kind: 'euro', default: 500, min: 0, max: 10000, prefill: 'monthly_surplus' },
    { key: 'maandlasten', label: 'Maandelijkse uitgaven', kind: 'euro', default: 2500, min: 500, max: 15000, prefill: 'monthly_expenses' },
    { key: 'rendement', label: 'Verwacht rendement', kind: 'percent', default: 0.06, min: 0.01, max: 0.12, prefill: 'gross_return' },
    { key: 'leeftijd', label: 'Huidige leeftijd', kind: 'years', default: 40, min: 18, max: 70, prefill: 'current_age' },
  ],
  scenarios: [
    { key: 'regel_25', label: '25× (4% regel)', description: 'Stoppen bij 25× je jaaruitgaven — onttrek 4% per jaar.' },
    { key: 'regel_30', label: '30× (3,3% regel)', description: 'Voorzichtiger: 30× je jaaruitgaven, lagere onttrekking.' },
    { key: 'regel_33', label: '33× (3% regel)', description: 'Zeer behoudend: 33× je jaaruitgaven voor maximale zekerheid.' },
  ],
  derived: [
    { key: 'jaaruitgaven', label: 'Jaaruitgaven', formula: 'maandlasten * 12', format: 'euro' },
    { key: 'fire_doel', label: 'FIRE-doel', formula: 'maandlasten * 12 * if(scenario == "regel_25", 25, if(scenario == "regel_30", 30, 33))', format: 'euro', hint: 'Vermogen nodig voor volledige vrijheid' },
  ],
  outputs: [
    { key: 'jaren_tot_fire', label: 'Jaar tot vrijheid', formula: 'max(0, log((fire_doel * (rendement/12) + maandinleg) / (vermogen * (rendement/12) + maandinleg)) / log(1 + rendement/12) / 12)', format: 'years', style: 'total' },
    { key: 'leeftijd_bij_stoppen', label: 'Leeftijd bij stoppen', formula: 'leeftijd + jaren_tot_fire', format: 'number', unit: 'jaar' },
    { key: 'vrijheid_voor_aow', label: 'Vrijheid vóór AOW (67)', formula: 'max(0, 67 - (leeftijd + jaren_tot_fire))', format: 'years', style: 'good', hint: 'Jaren eerder vrij dan de AOW-leeftijd' },
  ],
  compare: { outputKey: 'jaren_tot_fire', betterDirection: 'lower' },
  narrative: 'Met de {winner_label} bereik je vrijheid in {output:jaren_tot_fire}, op je {output:leeftijd_bij_stoppen}e — {output:vrijheid_voor_aow} vóór je AOW.',
  assumptions: [
    'FIRE-doel = je jaaruitgaven × de gekozen factor (25/30/33).',
    'Rendement constant; geen rekening met inflatie van uitgaven of belasting.',
    'AOW-leeftijd aangenomen op 67 jaar.',
  ],
}

const abonnementOfEenmalig: CalculatorDefinition = {
  name: 'Abonnement of eenmalig kopen',
  description: 'Maandelijks betalen, jaarlijks vooruit met korting, of eenmalig kopen — wat is over 5 jaar het goedkoopst?',
  inputs: [
    { key: 'maandprijs', label: 'Prijs per maand', kind: 'euro', default: 15, min: 1, max: 200 },
    { key: 'jaarprijs', label: 'Prijs per jaar (vooruit)', kind: 'euro', default: 150, min: 0, max: 2400, hint: 'Meestal met korting t.o.v. maandelijks' },
    { key: 'eenmalig', label: 'Eenmalige aankoopprijs', kind: 'euro', default: 400, min: 0, max: 5000 },
    { key: 'maandlasten', label: 'Maandelijkse uitgaven', kind: 'euro', default: 2500, min: 0, max: 10000, prefill: 'monthly_expenses' },
  ],
  scenarios: [
    { key: 'maandelijks', label: 'Maandelijks' },
    { key: 'jaarlijks', label: 'Jaarlijks vooruit' },
    { key: 'eenmalig', label: 'Eenmalig kopen' },
  ],
  outputs: [
    { key: 'kosten_5jaar', label: 'Totale kosten over 5 jaar', formula: 'if(scenario == "maandelijks", maandprijs * 60, if(scenario == "jaarlijks", jaarprijs * 5, eenmalig))', format: 'euro', style: 'total' },
    { key: 'kosten_per_maand', label: 'Gemiddeld per maand', formula: 'if(scenario == "maandelijks", maandprijs, if(scenario == "jaarlijks", jaarprijs / 12, eenmalig / 60))', format: 'euro' },
    { key: 'vrijheid_kosten', label: 'Kost je aan vrijheid (5 jr)', formula: 'if(maandlasten > 0, (if(scenario == "maandelijks", maandprijs * 60, if(scenario == "jaarlijks", jaarprijs * 5, eenmalig))) / (maandlasten * 12), 0)', format: 'years', style: 'warn' },
  ],
  compare: { outputKey: 'kosten_5jaar', betterDirection: 'lower' },
  narrative: 'Over 5 jaar is {winner_label} het goedkoopst: {compare_output}.',
  assumptions: [
    'Horizon vast op 5 jaar.',
    'Eenmalige aankoop gaat 5 jaar mee; geen onderhoud of restwaarde meegerekend.',
  ],
}

// ───────────────────────── TIER 2 — VERDIEPING ───────────────────────

const hypotheekOversluiten: CalculatorDefinition = {
  name: 'Hypotheek oversluiten',
  description: 'Loont het om je hypotheek over te sluiten naar een lagere rente, ondanks boeterente en kosten?',
  inputs: [
    { key: 'schuld', label: 'Hypotheekschuld', kind: 'euro', default: 250000, min: 10000, max: 1500000, prefill: 'mortgage_balance' },
    { key: 'huidige_rente', label: 'Huidige rente', kind: 'percent', default: 0.045, min: 0, max: 0.08 },
    { key: 'nieuwe_rente', label: 'Nieuwe rente', kind: 'percent', default: 0.035, min: 0, max: 0.08 },
    { key: 'kosten', label: 'Boeterente + kosten', kind: 'euro', default: 4000, min: 0, max: 40000, hint: 'Eenmalige kosten van oversluiten' },
    { key: 'resterend', label: 'Resterende rentevaste jaren', kind: 'years', default: 15, min: 1, max: 30 },
  ],
  scenarios: [
    { key: 'doorlopen', label: 'Huidige rente doorlopen' },
    { key: 'oversluiten', label: 'Oversluiten', description: 'Lagere maandlast, maar eerst boeterente + kosten terugverdienen.', appliesWhen: 'if(nieuwe_rente < huidige_rente, if(terugverdientijd_mnd < resterend * 12, 1, 0.5), 0)', notApplicableReason: 'De nieuwe rente is niet lager, of de kosten verdien je niet terug binnen de looptijd.' },
  ],
  derived: [
    { key: 'rente_nu_jaar', label: 'Rente nu per jaar', formula: 'schuld * huidige_rente', format: 'euro' },
    { key: 'rente_nieuw_jaar', label: 'Rente nieuw per jaar', formula: 'schuld * nieuwe_rente', format: 'euro' },
    { key: 'maandbesparing', label: 'Maandbesparing', formula: '(schuld * huidige_rente - schuld * nieuwe_rente) / 12', format: 'euro' },
    { key: 'terugverdientijd_mnd', label: 'Terugverdientijd', formula: 'if((schuld * huidige_rente - schuld * nieuwe_rente) > 0, kosten / ((schuld * huidige_rente - schuld * nieuwe_rente) / 12), 999)', format: 'number', hint: 'maanden tot de kosten terugverdiend zijn' },
  ],
  outputs: [
    { key: 'totale_rentekosten', label: 'Totale rentekosten', formula: 'if(scenario == "doorlopen", rente_nu_jaar * resterend, rente_nieuw_jaar * resterend + kosten)', format: 'euro', section: 'Kosten', style: 'total' },
    { key: 'voordeel', label: 'Besparing t.o.v. doorlopen', formula: 'if(scenario == "oversluiten", (rente_nu_jaar - rente_nieuw_jaar) * resterend - kosten, 0)', format: 'euro', section: 'Resultaat', style: 'good' },
  ],
  compare: { outputKey: 'totale_rentekosten', betterDirection: 'lower' },
  narrative: '{winner_label} kost {compare_output} aan rente over de resterende looptijd.',
  assumptions: [
    'Aflossingsvrije benadering: alleen rentekosten vergeleken, geen aflossing.',
    'Rente constant over de resterende rentevaste periode.',
    'Hypotheekrenteaftrek buiten beschouwing gelaten.',
  ],
}

const lijfrenteVsEtf: CalculatorDefinition = {
  name: 'Lijfrente vs. beleggen (ETF) voor pensioen',
  description: 'Jaarlijks storten in een lijfrente met IB-aftrek, of vrij beleggen in box 3? Vergelijk het netto eindkapitaal.',
  inputs: [
    { key: 'jaarinleg', label: 'Jaarlijkse inleg', kind: 'euro', default: 5000, min: 500, max: 30000 },
    { key: 'rendement', label: 'Verwacht rendement', kind: 'percent', default: 0.06, min: 0.01, max: 0.12, prefill: 'gross_return' },
    { key: 'jaren', label: 'Jaren tot pensioen', kind: 'years', default: 20, min: 1, max: 40 },
    { key: 'ib_nu', label: 'IB-tarief nu (aftrek)', kind: 'percent', default: 0.37, min: 0.3, max: 0.495 },
    { key: 'ib_pensioen', label: 'IB-tarief bij uitkering', kind: 'percent', default: 0.2, min: 0, max: 0.495 },
    { key: 'box3_druk', label: 'Box 3-druk per jaar', kind: 'percent', default: 0.015, min: 0, max: 0.05, hint: 'Effectieve jaarlijkse vermogensheffing' },
  ],
  scenarios: [
    { key: 'lijfrente', label: 'Lijfrente', description: 'Inleg aftrekbaar tegen je IB-tarief nu; uitkering belast bij pensioen. Geld zit vast tot pensioendatum.' },
    { key: 'etf_box3', label: 'Beleggen in box 3', description: 'Vrij belegbaar, geen lock-in, maar jaarlijks box 3-heffing en geen aftrek.' },
  ],
  derived: [
    { key: 'eindwaarde_bruto', label: 'Bruto eindwaarde lijfrente', formula: 'jaarinleg * ((pow(1 + rendement, jaren) - 1) / rendement)', format: 'euro' },
    { key: 'eindwaarde_etf', label: 'Eindwaarde ETF (na box 3)', formula: 'jaarinleg * ((pow(1 + max(rendement - box3_druk, 0.001), jaren) - 1) / max(rendement - box3_druk, 0.001))', format: 'euro' },
  ],
  outputs: [
    { key: 'belastingvoordeel_nu', label: 'IB-aftrek nu (totaal)', formula: 'if(scenario == "lijfrente", jaarinleg * ib_nu * jaren, 0)', format: 'euro', section: 'Belasting', style: 'good' },
    { key: 'belasting_uitkering', label: 'Belasting bij uitkering', formula: 'if(scenario == "lijfrente", eindwaarde_bruto * ib_pensioen, 0)', format: 'euro', section: 'Belasting', style: 'warn', hint: 'Lock-in: geld zit vast tot pensioen' },
    { key: 'eindkapitaal_netto', label: 'Netto eindkapitaal', formula: 'if(scenario == "lijfrente", eindwaarde_bruto * (1 - ib_pensioen), eindwaarde_etf)', format: 'euro', section: 'Resultaat', style: 'total' },
  ],
  compare: { outputKey: 'eindkapitaal_netto', betterDirection: 'higher' },
  narrative: '{winner_label} levert netto {compare_output} op aan pensioenkapitaal.',
  assumptions: [
    'Lijfrente: inleg aftrekbaar nu, hele uitkering belast tegen verwacht IB-tarief bij pensioen.',
    'Box 3: jaarlijkse heffing verlaagt het netto rendement; geen aftrek.',
    'Het herinvesteren van de IB-aftrek is buiten beschouwing gelaten (conservatief voor lijfrente).',
    'Jaarlijkse inleg, rendement constant.',
  ],
}

const autoKopenLeasen: CalculatorDefinition = {
  name: 'Auto: kopen, occasion of lease',
  description: 'Nieuw kopen, een occasion, private lease of operational lease — wat is over de looptijd het goedkoopst?',
  inputs: [
    { key: 'aanschaf', label: 'Aanschafprijs nieuw', kind: 'euro', default: 30000, min: 5000, max: 150000, relevantFor: ['nieuw_kopen'] },
    { key: 'occasion_prijs', label: 'Prijs occasion', kind: 'euro', default: 18000, min: 3000, max: 100000, relevantFor: ['occasion'] },
    { key: 'private_lease', label: 'Private lease p/m', kind: 'euro', default: 500, min: 100, max: 1500, relevantFor: ['private_lease'] },
    { key: 'oper_lease', label: 'Operational lease p/m', kind: 'euro', default: 700, min: 100, max: 2000, relevantFor: ['operational_lease'] },
    { key: 'jaren', label: 'Gebruiksduur', kind: 'years', default: 5, min: 1, max: 10 },
    { key: 'restwaarde_pct', label: 'Restwaarde (% aanschaf)', kind: 'percent', default: 0.4, min: 0, max: 0.9, relevantFor: ['nieuw_kopen', 'occasion'] },
    { key: 'rendement', label: 'Rendement gebonden geld', kind: 'percent', default: 0.06, min: 0, max: 0.12, prefill: 'gross_return', hint: 'Gemiste opbrengst van vastgezet kapitaal', relevantFor: ['nieuw_kopen', 'occasion'] },
    { key: 'maandlasten', label: 'Maandelijkse uitgaven', kind: 'euro', default: 2500, min: 0, max: 10000, prefill: 'monthly_expenses' },
  ],
  scenarios: [
    { key: 'nieuw_kopen', label: 'Nieuw kopen' },
    { key: 'occasion', label: 'Occasion' },
    { key: 'private_lease', label: 'Private lease' },
    { key: 'operational_lease', label: 'Operational lease' },
  ],
  derived: [
    { key: 'koop_basis', label: 'Aanschafwaarde (koop)', formula: 'if(scenario == "occasion", occasion_prijs, aanschaf)', format: 'euro' },
  ],
  outputs: [
    { key: 'totale_kosten', label: 'Totale kosten over looptijd', formula: 'if(scenario == "private_lease", private_lease * 12 * jaren, if(scenario == "operational_lease", oper_lease * 12 * jaren, koop_basis * (1 - restwaarde_pct) + koop_basis * rendement * jaren))', format: 'euro', style: 'total' },
    { key: 'kosten_per_maand', label: 'Gemiddeld per maand', formula: 'totale_kosten / (jaren * 12)', format: 'euro' },
    { key: 'vrijheid_kosten', label: 'Kost je aan vrijheid', formula: 'if(maandlasten > 0, totale_kosten / (maandlasten * 12), 0)', format: 'years', style: 'warn' },
  ],
  compare: { outputKey: 'totale_kosten', betterDirection: 'lower' },
  narrative: 'Over de looptijd is {winner_label} het goedkoopst: {compare_output}.',
  assumptions: [
    'Koop: kosten = waardeverlies (aanschaf − restwaarde) + gemiste opbrengst van vastgezet kapitaal.',
    'Lease all-in (onderhoud/verzekering inbegrepen); bij koop buiten beschouwing.',
    'Geen brandstof-/laadkosten meegerekend (gelijk verondersteld over scenario\'s).',
  ],
}

const huurVsKoop: CalculatorDefinition = {
  name: 'Huren vs. kopen',
  description: 'Blijven huren en het verschil beleggen, of kopen en vermogen opbouwen in stenen — wat geeft na N jaar het hoogste netto vermogen?',
  inputs: [
    { key: 'huur_mnd', label: 'Huur per maand', kind: 'euro', default: 1400, min: 300, max: 4000 },
    { key: 'koopprijs', label: 'Koopprijs woning', kind: 'euro', default: 350000, min: 50000, max: 1500000 },
    { key: 'eigen_geld', label: 'Eigen geld / inbreng', kind: 'euro', default: 40000, min: 0, max: 500000, prefill: 'liquid_cash' },
    { key: 'hypotheekrente', label: 'Hypotheekrente', kind: 'percent', default: 0.04, min: 0, max: 0.08 },
    { key: 'woz_stijging', label: 'Waardestijging woning/jaar', kind: 'percent', default: 0.03, min: 0, max: 0.1 },
    { key: 'rendement', label: 'Beleggingsrendement', kind: 'percent', default: 0.06, min: 0.01, max: 0.12, prefill: 'gross_return' },
    { key: 'jaren', label: 'Horizon', kind: 'years', default: 10, min: 1, max: 30 },
  ],
  scenarios: [
    { key: 'huren', label: 'Huren + beleggen', description: 'Je huurt en belegt je eigen geld plus het maandelijkse verschil met kopen.' },
    { key: 'kopen', label: 'Kopen', description: 'Je koopt met eigen geld als inbreng; de woning stijgt in waarde.' },
  ],
  derived: [
    { key: 'hypotheek', label: 'Hypotheekbedrag', formula: 'max(0, koopprijs - eigen_geld)', format: 'euro' },
    { key: 'woonlast_koop_mnd', label: 'Woonlasten koop p/m', formula: 'max(0, koopprijs - eigen_geld) * hypotheekrente / 12 + koopprijs * 0.01 / 12', format: 'euro', hint: 'Rente + ~1% onderhoud/jaar' },
  ],
  outputs: [
    { key: 'netto_vermogen', label: 'Netto vermogen na looptijd', formula: 'if(scenario == "kopen", koopprijs * pow(1 + woz_stijging, jaren) - hypotheek, compound(eigen_geld, rendement, jaren) + fvAnnuity(max(woonlast_koop_mnd - huur_mnd, 0), rendement, jaren))', format: 'euro', style: 'total' },
  ],
  compare: { outputKey: 'netto_vermogen', betterDirection: 'higher' },
  narrative: 'Na de looptijd geeft {winner_label} het hoogste netto vermogen: {compare_output}.',
  assumptions: [
    'Kopen: aflossingsvrij; eindvermogen = woningwaarde − restschuld.',
    'Huren: eigen geld + maandelijks verschil (als koop duurder is) belegd tegen je rendement.',
    'Geen kosten koper, overdrachtsbelasting of verkoopkosten meegerekend.',
    'Onderhoud koop geschat op 1% van de woningwaarde per jaar.',
  ],
}

// ───────────────────────── TIER 3 — SPECIALIST ───────────────────────

const box3ForfaitVsWerkelijk: CalculatorDefinition = {
  name: 'Box 3: forfait vs. werkelijk rendement',
  description: 'Bij jouw vermogenssamenstelling: pak je beter het forfaitaire stelsel, of (vanaf 2028) het werkelijke rendement?',
  inputs: [
    { key: 'spaargeld', label: 'Spaargeld', kind: 'euro', default: 30000, min: 0, max: 2000000, prefill: 'liquid_cash' },
    { key: 'beleggingen', label: 'Beleggingen', kind: 'euro', default: 100000, min: 0, max: 5000000, prefill: 'investment_total' },
    { key: 'rendement', label: 'Werkelijk rendement beleggingen', kind: 'percent', default: 0.06, min: 0, max: 0.15, prefill: 'gross_return' },
    { key: 'forfait_beleggen', label: 'Forfait beleggen', kind: 'percent', default: BOX3_HUIDIG.forfaitBeleggingen, min: 0, max: 0.08 },
    { key: 'forfait_spaar', label: 'Forfait spaargeld', kind: 'percent', default: BOX3_HUIDIG.forfaitSpaargeld, min: 0, max: 0.04 },
    { key: 'tarief', label: 'Box 3-tarief', kind: 'percent', default: 0.36, min: 0.2, max: 0.5 },
    { key: 'jaar', label: 'Belastingjaar', kind: 'number', default: 2026, min: 2026, max: 2035 },
  ],
  scenarios: [
    { key: 'forfait', label: 'Forfaitair stelsel', description: 'Belasting over een fictief (forfaitair) rendement, ongeacht je werkelijke opbrengst.', appliesWhen: 'if(jaar < 2028, 1, 0.5)' },
    { key: 'werkelijk_laag', label: 'Werkelijk (laag jaar)', description: 'Werkelijk rendement in een mager beursjaar (helft van verwacht).', appliesWhen: 'if(jaar >= 2028, 1, 0)', notApplicableReason: 'Het werkelijk-rendement-stelsel geldt naar verwachting pas vanaf 2028.' },
    { key: 'werkelijk_hoog', label: 'Werkelijk (goed jaar)', description: 'Werkelijk rendement in een goed beursjaar.', appliesWhen: 'if(jaar >= 2028, 1, 0)', notApplicableReason: 'Het werkelijk-rendement-stelsel geldt naar verwachting pas vanaf 2028.' },
  ],
  derived: [
    { key: 'forfait_inkomen', label: 'Forfaitair inkomen', formula: 'spaargeld * forfait_spaar + beleggingen * forfait_beleggen', format: 'euro' },
  ],
  outputs: [
    { key: 'belasting', label: 'Box 3-heffing per jaar', formula: 'if(scenario == "forfait", forfait_inkomen * tarief, if(scenario == "werkelijk_laag", (beleggingen * rendement * 0.5 + spaargeld * 0.015) * tarief, (beleggingen * rendement + spaargeld * 0.015) * tarief))', format: 'euro', style: 'total' },
  ],
  compare: { outputKey: 'belasting', betterDirection: 'lower' },
  narrative: '{winner_label} geeft de laagste box 3-heffing: {compare_output} per jaar.',
  assumptions: [
    'Heffingsvrij vermogen buiten beschouwing gelaten.',
    'Forfaitaire percentages 2026 als richtwaarde; werkelijke percentages worden jaarlijks vastgesteld.',
    'Spaarrente bij werkelijk rendement aangenomen op 1,5%.',
    'Het werkelijk-rendement-stelsel is nog niet definitief en geldt naar verwachting vanaf 2028.',
  ],
}

const schenkenVsErven: CalculatorDefinition = {
  name: 'Schenken nu vs. erven later',
  description: 'Jaarlijkse schenkvrijstelling benutten of alles laten erven? Zie hoeveel erfbelasting je je kinderen kunt besparen.',
  inputs: [
    { key: 'vermogen', label: 'Vermogen', kind: 'euro', default: 400000, min: 0, max: 10000000, prefill: 'net_worth' },
    { key: 'kinderen', label: 'Aantal kinderen', kind: 'number', default: 2, min: 1, max: 6 },
    { key: 'horizon', label: 'Jaren (schatting)', kind: 'years', default: 15, min: 1, max: 40, hint: 'Periode waarover je kunt schenken' },
    { key: 'jaarvrijstelling', label: 'Schenkvrijstelling/kind/jaar', kind: 'euro', default: SCHENK_ERF_HUIDIG.schenking.vrijstelling.kind, min: 0, max: 12000 },
    { key: 'erf_vrijstelling', label: 'Erfvrijstelling per kind', kind: 'euro', default: SCHENK_ERF_HUIDIG.erfbelasting.vrijstelling.kind, min: 0, max: 50000 },
    { key: 'erf_tarief', label: 'Erfbelastingtarief', kind: 'percent', default: 0.1, min: 0, max: 0.4, hint: 'Schijf 1 voor kinderen: 10%' },
    { key: 'maandlasten', label: 'Maandelijkse uitgaven', kind: 'euro', default: 2500, min: 0, max: 15000, prefill: 'monthly_expenses' },
  ],
  scenarios: [
    { key: 'niets_doen', label: 'Niets doen', description: 'Het volledige vermogen wordt geërfd; erfbelasting over alles boven de vrijstelling.' },
    { key: 'jaarlijks', label: 'Jaarlijks schenken', description: 'Elk jaar de vrijstelling per kind benutten — belastingvrij.' },
    { key: 'op_papier', label: 'Schenken op papier', description: 'Schenken op papier (schuldigerkenning) laat grotere bedragen toe terwijl je het geld houdt.', appliesWhen: 'if(vermogen > 200000, 1, 0.5)' },
    { key: 'jubelton', label: 'Jubelton', description: 'De eenmalige hoge schenkingsvrijstelling voor de eigen woning.', appliesWhen: '0', notApplicableReason: 'De jubelton is per 1 januari 2024 afgeschaft en niet meer beschikbaar.' },
  ],
  derived: [
    { key: 'geschonken_vrij', label: 'Belastingvrij geschonken', formula: 'if(scenario == "jaarlijks", jaarvrijstelling * kinderen * horizon, if(scenario == "op_papier", jaarvrijstelling * 1.5 * kinderen * horizon, 0))', format: 'euro' },
  ],
  outputs: [
    { key: 'erfbelasting', label: 'Erfbelasting (totaal)', formula: 'max(0, (vermogen - geschonken_vrij) / kinderen - erf_vrijstelling) * erf_tarief * kinderen', format: 'euro', style: 'total' },
    { key: 'vrijheid_kinderen', label: 'Vrijheid die je nu al geeft', formula: 'if(maandlasten > 0, geschonken_vrij / (maandlasten * 12), 0)', format: 'years', style: 'good', hint: 'Levensjaren die je kinderen nu al ontvangen' },
  ],
  compare: { outputKey: 'erfbelasting', betterDirection: 'lower' },
  narrative: '{winner_label} laat de laagste erfbelasting achter: {compare_output}.',
  assumptions: [
    'Vereenvoudigd: één erfbelastingtarief (schijf 1, kinderen 10%) over het hele bedrag boven de vrijstelling.',
    'Vermogen verdeeld over gelijke kindsdelen.',
    'Schenken op papier modelleert ~1,5× de jaarvrijstelling; werkelijke ruimte hangt af van je situatie.',
    'Geen rendement of inflatie op het vermogen meegerekend.',
  ],
}

const bvAgioVsPrive: CalculatorDefinition = {
  name: 'BV: agio storten vs. privé beleggen (box 3)',
  description: 'Bruto in de BV beleggen (agio) of eerst uitkeren via box 2 en privé beleggen in box 3 — wat levert na N jaar netto het meeste op?',
  inputs: [
    { key: 'bedrag', label: 'Te investeren bedrag', kind: 'euro', default: 100000, min: 10000, max: 5000000, prefill: 'liquid_cash', hint: 'Beschikbaar in de BV' },
    { key: 'rendement', label: 'Bruto rendement', kind: 'percent', default: 0.07, min: 0.01, max: 0.15, prefill: 'gross_return' },
    { key: 'jaren', label: 'Beleggingshorizon', kind: 'years', default: 15, min: 1, max: 30 },
    { key: 'vpb', label: 'VpB-tarief', kind: 'percent', default: 0.196, min: 0.15, max: 0.3, hint: '19,6% tot €200k winst, 25,8% daarboven' },
    { key: 'div_belasting', label: 'Box 2 / dividendbelasting', kind: 'percent', default: 0.245, min: 0.15, max: 0.4 },
    { key: 'box3_druk', label: 'Box 3-druk per jaar', kind: 'percent', default: 0.02, min: 0, max: 0.05 },
    { key: 'maandlasten', label: 'Maandelijkse uitgaven', kind: 'euro', default: 3000, min: 0, max: 20000, prefill: 'monthly_expenses' },
  ],
  scenarios: [
    { key: 'agio_bruto', label: 'Agio in BV (bruto)', description: 'Volledige bedrag blijft in de BV en groeit bruto; bij exit VpB over de winst + box 2 bij uitkeren.' },
    { key: 'prive_box3', label: 'Privé in box 3', description: 'Eerst uitkeren (box 2), dan privé beleggen met jaarlijkse box 3-heffing.' },
    { key: 'hybride', label: 'Hybride (50/50)', description: 'De helft via de BV, de helft privé — spreiding over beide regimes.' },
  ],
  derived: [
    { key: 'netto_na_uitkeer', label: 'Privé na box 2', formula: 'bedrag * (1 - div_belasting)', format: 'euro', hint: 'Wat overblijft na uitkeren uit de BV' },
    { key: 'eind_agio', label: 'Eindwaarde via BV', formula: '(bedrag + (compound(bedrag, rendement, jaren) - bedrag) * (1 - vpb)) * (1 - div_belasting)', format: 'euro' },
    { key: 'eind_prive', label: 'Eindwaarde via privé', formula: 'compound(bedrag * (1 - div_belasting), max(rendement - box3_druk, 0), jaren)', format: 'euro' },
  ],
  outputs: [
    { key: 'startkapitaal', label: 'Werkkapitaal bij start', formula: 'if(scenario == "agio_bruto", bedrag, if(scenario == "hybride", (bedrag + netto_na_uitkeer) / 2, netto_na_uitkeer))', format: 'euro', section: 'Bij start' },
    { key: 'belasting_totaal', label: 'Belasting + heffingsdruk', formula: 'compound(bedrag, rendement, jaren) - if(scenario == "agio_bruto", eind_agio, if(scenario == "prive_box3", eind_prive, (eind_agio + eind_prive) / 2))', format: 'euro', section: 'Belasting', style: 'warn', hint: 'Versus onbelaste groei' },
    { key: 'eindwaarde', label: 'Netto eindwaarde', formula: 'if(scenario == "agio_bruto", eind_agio, if(scenario == "prive_box3", eind_prive, (eind_agio + eind_prive) / 2))', format: 'euro', section: 'Eindwaarde', style: 'total' },
    { key: 'vrijheid_jaren', label: 'Vrijheid die dit oplevert', formula: 'if(maandlasten > 0, (if(scenario == "agio_bruto", eind_agio, if(scenario == "prive_box3", eind_prive, (eind_agio + eind_prive) / 2))) / (maandlasten * 12), 0)', format: 'years', section: 'Eindwaarde', style: 'good' },
  ],
  compare: { outputKey: 'eindwaarde', betterDirection: 'higher' },
  narrative: '{winner_label} levert het meeste op: {compare_output} netto — goed voor {output:vrijheid_jaren} vrijheid.',
  assumptions: [
    'BV-route: bruto groei in de BV, VpB over de koerswinst bij exit, daarna box 2 bij uitkeren naar privé.',
    'Privé-route: na box 2 uitkeren, jaarlijkse box 3-heffing verlaagt het netto rendement.',
    'Hybride is het gemiddelde van beide routes (50/50-verdeling).',
    'Dividendlek binnen de BV en jaarlijkse VpB over uitgekeerd dividend zijn vereenvoudigd weggelaten.',
    'Tarieven als richtwaarde; raadpleeg je adviseur voor je eigen situatie.',
  ],
}

const verhuurkamerRegimes: CalculatorDefinition = {
  name: 'Kamerverhuur: welk fiscaal regime?',
  description: 'Kamer(s) verhuren — kamerverhuurvrijstelling, box 3, box 1 (ROW met diensten) of splitsing? Zie per regime wat van toepassing is en wat het netto oplevert.',
  inputs: [
    { key: 'woz', label: 'WOZ-waarde woning', kind: 'euro', default: 400000, min: 50000, max: 2000000, prefill: 'home_value' },
    { key: 'hypotheek', label: 'Hypotheekschuld', kind: 'euro', default: 200000, min: 0, max: 1500000, prefill: 'mortgage_balance' },
    { key: 'kamers', label: 'Aantal kamers', kind: 'number', default: 2, min: 1, max: 6 },
    { key: 'huur_kamer', label: 'Huur per kamer/maand', kind: 'euro', default: 600, min: 100, max: 2000 },
    { key: 'ib_tarief', label: 'IB-tarief box 1', kind: 'percent', default: 0.37, min: 0.3, max: 0.495 },
    { key: 'diensten', label: 'Lever je diensten?', kind: 'boolean', default: 0, hint: 'Schoonmaak, ontbijt, linnen → opent box 1 ROW' },
    { key: 'verhuurvorm', label: 'Verhuurvorm', kind: 'enum', default: 1, options: [ { value: 1, label: 'Permanent', hint: 'structureel, student' }, { value: 2, label: 'Tijdelijk', hint: 'vakantie, Airbnb' } ] },
    { key: 'maandlasten', label: 'Maandelijkse uitgaven', kind: 'euro', default: 2500, min: 0, max: 15000, prefill: 'monthly_expenses' },
  ],
  scenarios: [
    { key: 'niet_verhuren', label: 'Niet verhuren', description: 'Baseline: geen huurinkomsten.' },
    { key: 'kamervrijstelling', label: 'Kamerverhuurvrijstelling', description: 'Huur onbelast tot de vrijstellingsgrens (€6.633 in 2026), mits permanent verhuurd.', appliesWhen: 'if(verhuurvorm == 1, if(jaarhuur <= 6633, 1, 0.5), 0)', notApplicableReason: 'De kamerverhuurvrijstelling geldt alleen voor structurele (permanente) verhuur.' },
    { key: 'box3', label: 'Box 3', description: 'Verhuurd woningdeel valt in box 3 — heffing over forfaitair rendement.', appliesWhen: 'if(verhuurvorm == 1, if(jaarhuur > 6633, 1, 0.5), 0)' },
    { key: 'box1_row', label: 'Box 1 (ROW)', description: 'Resultaat uit overige werkzaamheden: huur belast in box 1, maar kosten aftrekbaar — vereist diensten.', appliesWhen: 'if(diensten > 0, 1, 0)', notApplicableReason: 'Box 1 ROW vereist dat je aanvullende diensten levert (schoonmaak, ontbijt, linnen).' },
    { key: 'splitsing', label: 'Splitsing', description: 'Eén kamer onder de vrijstelling, overige als kostganger (ROW) — fiscaal vaak het gunstigst.', appliesWhen: 'if(kamers >= 2, if(diensten > 0, 1, 0.5), 0)', notApplicableReason: 'Splitsing vereist minimaal 2 kamers.' },
  ],
  derived: [
    { key: 'jaarhuur', label: 'Jaarhuur totaal', formula: 'huur_kamer * kamers * 12', format: 'euro' },
    { key: 'boven_vrijstelling', label: 'Boven vrijstelling', formula: 'max(0, huur_kamer * kamers * 12 - 6633)', format: 'euro', hint: 'Grens 2026: €6.633' },
    { key: 'hra_voordeel', label: 'HRA-voordeel (jaar)', formula: 'hypotheek * 0.04 * ib_tarief', format: 'euro', hint: 'Aftrek bij ~4% rente' },
  ],
  outputs: [
    { key: 'belasting_jaar', label: 'Belasting per jaar', formula: 'if(scenario == "niet_verhuren", 0, if(scenario == "kamervrijstelling", if(jaarhuur <= 6633, 0, boven_vrijstelling * ib_tarief), if(scenario == "box3", woz * 0.25 * 0.06 * 0.36, if(scenario == "box1_row", max(0, jaarhuur * 0.7) * ib_tarief, boven_vrijstelling * ib_tarief * 0.5))))', format: 'euro', section: 'Belasting', style: 'warn' },
    { key: 'netto_cashflow', label: 'Netto opbrengst per jaar', formula: 'if(scenario == "niet_verhuren", 0, jaarhuur - belasting_jaar)', format: 'euro', section: 'Opbrengst', style: 'total' },
    { key: 'vrijheid_per_jaar', label: 'Vrijheid per jaar', formula: 'if(maandlasten > 0, (if(scenario == "niet_verhuren", 0, jaarhuur - belasting_jaar)) / (maandlasten * 12), 0)', format: 'years', section: 'Opbrengst', style: 'good', hint: 'Extra vrijheid die verhuur jaarlijks oplevert' },
  ],
  compare: { outputKey: 'netto_cashflow', betterDirection: 'higher' },
  narrative: '{winner_label} geeft de hoogste netto-opbrengst: {compare_output} per jaar.',
  assumptions: [
    'Kamerverhuurvrijstelling 2026: €6.633 per jaar; bij overschrijding vervalt de vrijstelling voor het meerdere.',
    'Box 3: vereenvoudigd, forfaitair rendement over ~25% van de WOZ-waarde.',
    'Box 1 ROW: 30% kostenaftrek aangenomen; vereist aantoonbare diensten.',
    'Splitsing modelleert ongeveer de helft van de box 1-heffing — werkelijke uitkomst hangt af van de verdeling.',
    'Dit is een educatieve indicatie; kamerverhuur-fiscaliteit is complex — raadpleeg een adviseur.',
  ],
}

// ───────────────────────── Registry ──────────────────────────────────

export const PREFAB_CALCULATORS: PrefabCalculator[] = [
  { slug: 'aflossen-vs-beleggen', tier: 'starter', complexity: 1, definition: aflossenVsBeleggen },
  { slug: 'spaarbuffer-opbouwen', tier: 'starter', complexity: 1, definition: spaarbufferOpbouwen },
  { slug: 'eerder-met-pensioen', tier: 'starter', complexity: 2, definition: eerderMetPensioen },
  { slug: 'abonnement-of-eenmalig', tier: 'starter', complexity: 1, definition: abonnementOfEenmalig },
  { slug: 'hypotheek-oversluiten', tier: 'verdieping', complexity: 3, definition: hypotheekOversluiten },
  { slug: 'lijfrente-vs-etf', tier: 'verdieping', complexity: 3, definition: lijfrenteVsEtf },
  { slug: 'auto-kopen-leasen', tier: 'verdieping', complexity: 3, definition: autoKopenLeasen },
  { slug: 'huur-vs-koop', tier: 'verdieping', complexity: 3, definition: huurVsKoop },
  { slug: 'box3-forfait-vs-werkelijk', tier: 'specialist', complexity: 4, definition: box3ForfaitVsWerkelijk },
  { slug: 'schenken-vs-erven', tier: 'specialist', complexity: 4, definition: schenkenVsErven },
  { slug: 'bv-agio-vs-prive', tier: 'specialist', complexity: 5, definition: bvAgioVsPrive },
  { slug: 'verhuurkamer-regimes', tier: 'specialist', complexity: 5, definition: verhuurkamerRegimes },
]

export const PREFAB_TIER_LABELS: Record<PrefabTier, string> = {
  starter: 'Starters',
  verdieping: 'Verdieping',
  specialist: 'Specialist',
}

/** Volgorde waarin de tiers in de bibliotheek getoond worden. */
export const PREFAB_TIER_ORDER: PrefabTier[] = ['starter', 'verdieping', 'specialist']

// Naam → tier lookup. De bibliotheek werkt met DB-rijen (geen tier-kolom);
// curated prefabs herkennen we op hun exacte naam. User-gemaakte calcs
// matchen niet en vallen in de "community"-groep.
const TIER_BY_NAME = new Map<string, PrefabTier>(
  PREFAB_CALCULATORS.map((p) => [p.definition.name, p.tier]),
)

/** Tier voor een calculator-naam, of null als het geen curated prefab is. */
export function prefabTierForName(name: string): PrefabTier | null {
  return TIER_BY_NAME.get(name) ?? null
}
