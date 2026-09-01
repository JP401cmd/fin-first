/**
 * Goal types, labels, and progress helpers for the Fin module.
 */

import {
  GOAL_PACE_DAYS_PER_MONTH,
  GOAL_PACE_GRACE_DAYS,
  GOAL_PACE_MIN_MEASURE_MONTHS,
  GOAL_PACE_TOLERANCE,
} from '@/lib/constants'

export type GoalType =
  | 'savings'
  | 'debt_payoff'
  | 'net_worth'
  | 'freedom_days'
  | 'savings_rate'
  | 'invested_assets'
  | 'passive_income'
  | 'emergency_fund'
  | 'salary'
  | 'expected_return'
  | 'fire_age'
  | 'end_balance'
  | 'debt_free_date'
  | 'tax_burden'
  | 'custom'

export type GoalOwnership = 'personal' | 'shared'

/**
 * Eén koppeling van een doel aan ÉÉN bezitting of ÉÉN schuld (tabel `goal_links`).
 * De DB-CHECK dwingt af dat precies één van beide velden gevuld is; dit type
 * spiegelt dat maar kan het niet afdwingen — lezers behandelen een rij met twee
 * (of nul) verwijzingen defensief als "niet bruikbaar".
 *
 * Vervangt de legacy-kolommen `goals.linked_asset_id`/`linked_debt_id`, die
 * blijven bestaan (gebackfilld) maar niet meer worden geschreven. De runtime-
 * routering staat in `lib/goal-current-value.ts#autolinkGoalCurrentValues`:
 * ≥1 link-rij ⇒ de nieuwe netto-semantiek, anders exact het legacy-gedrag.
 */
export type GoalLink = { id?: string; asset_id: string | null; debt_id: string | null }

export type Goal = {
  id: string
  user_id: string
  name: string
  description: string | null
  goal_type: GoalType
  target_value: number
  current_value: number
  target_date: string | null
  linked_asset_id: string | null
  linked_debt_id: string | null
  budget_id?: string | null
  custom_unit?: string | null
  icon: string
  color: string
  is_completed: boolean
  completed_at: string | null
  sort_order: number
  ownership: GoalOwnership
  household_id: string | null
  /**
   * Vrije JSONB-metadata (kolom `goals.metadata`, DEFAULT `{}`; ronde 4). Lab-
   * gegenereerde parameter-doelen dragen `metadata.bron === 'parameter'` plus
   * `oorsprong` (`'lab'|'backfill'`) en — voor het FIRE-doel — `margeDoelJaren`.
   * Optioneel: oude rijen of legacy-DB's zonder de kolom leveren geen veld (de
   * lezers behandelen ontbrekend/`null`/`{}` defensief als "geen parameter-doel").
   */
  metadata?: Record<string, unknown> | null
  /**
   * Koppelingen naar bezittingen én schulden (tabel `goal_links`). Optioneel:
   * niet elke lezing haalt ze op, en `undefined` betekent "niet geladen" —
   * iets anders dan `[]` ("geladen, geen koppelingen"). Alleen `[]`/gevuld mag
   * als bewijs gelden dat de legacy-kolommen niet meer gelden.
   */
  links?: GoalLink[]
  created_at: string
  updated_at: string
}

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  savings: 'Spaardoel',
  debt_payoff: 'Schuld aflossen',
  net_worth: 'Netto vermogen',
  freedom_days: 'Vrijheidsdagen',
  savings_rate: 'Spaarquote',
  invested_assets: 'Belegd vermogen',
  passive_income: 'Passief inkomen',
  emergency_fund: 'Noodfonds',
  salary: 'Salaris',
  expected_return: 'Verwacht rendement',
  fire_age: 'Vrijheidsleeftijd',
  end_balance: 'Eindsaldo',
  debt_free_date: 'Schuldenvrij',
  tax_burden: 'Belastingdruk',
  custom: 'Vrij doel',
}

export const GOAL_TYPE_ICONS: Record<GoalType, string> = {
  savings: 'PiggyBank',
  debt_payoff: 'CreditCard',
  net_worth: 'TrendingUp',
  freedom_days: 'Sun',
  savings_rate: 'Activity',
  invested_assets: 'LineChart',
  passive_income: 'Banknote',
  emergency_fund: 'ShieldCheck',
  salary: 'Briefcase',
  expected_return: 'Coins',
  fire_age: 'Hourglass',
  // Alle drie bestaan in de gedeelde `iconMap` (components/app/budget-shared.tsx);
  // de regressietest in goal-data.test.ts pint dat vast (geen Circle-fallback).
  end_balance: 'Vault',
  debt_free_date: 'CalendarCheck',
  tax_burden: 'Receipt',
  custom: 'Target',
}

export type GoalTypeMeta = {
  unit: string
  group: 'Financieel' | 'Persoonlijk'
  step: string
  min?: number
  max?: number
  supportsAssetLink: boolean
  supportsDebtLink: boolean
  /**
   * Mag dit doel-type bezittingen ÉN schulden tegelijk koppelen (vrij mengen)?
   * Alleen waar op de GELDDOEL-types (savings/net_worth/invested_assets/
   * debt_payoff/custom), waar de gebruiker expliciet om vrij mengen vroeg. De
   * runtime-semantiek staat in `computeLinkedCurrentValue`
   * (lib/goal-current-value.ts): alleen bezittingen ⇒ Σ waarden; alleen schulden
   * ⇒ max(0, doel − Σ saldi); GEMENGD ⇒ Σ waarden − Σ saldi (netto, niet geklemd).
   */
  allowsMixedLinks?: boolean
  freedomTimeRelevant: boolean
  /**
   * Voortgangsrichting. 'up' (afwezig = default) = hoger-is-beter (spaargeld,
   * vermogen, spaarquote …). 'down' = lager-is-beter: de gewenste waarde ligt
   * ONDER de huidige (bv. `fire_age`: eerder vrij = beter). Alleen expliciet
   * gezet waar het van 'up' afwijkt — zie `computeGoalProgress`.
   */
  direction?: 'up' | 'down'
  /**
   * true = dit doel-type wordt via het /toekomst-lab ("verkennen wordt richten")
   * gegenereerd en is NIET vrij aanmaakbaar in GoalForm. Afwezig/false = normaal
   * handmatig aanmaakbaar (bestaand gedrag, incl. `savings_rate`/`salary`).
   */
  viaLab?: boolean
  /**
   * true = dit type mag in de DOELBASIS-keuzelijst staan: een doel op een
   * AFGELEID cijfer dat live meesynchroniseert uit een canonieke motor. Bewust
   * een APARTE vlag naast `viaLab` en niet het complement daarvan: `fire_age` is
   * allebei — niet vrij aanmaakbaar als gewoon doel (het lab genereert 'm), maar
   * wél kiesbaar als doelbasis (eigenaar-verzoek). Zonder deze scheiding zou de
   * kiezer óf `expected_return` er onterecht bij krijgen, óf `fire_age` missen.
   */
  metricBasis?: boolean
  /**
   * Sleutel van de CANONIEKE motor die de live waarde levert (leesbaar, voor
   * herkomst-labels en om te documenteren wát er gesynchroniseerd wordt). Alleen
   * gezet waar `metricBasis` waar is; de daadwerkelijke koppeling zit in
   * `lib/goals/metric-sources.ts` + `lib/goal-current-value.ts`.
   *
   * CONSUME, DON'T RECOMPUTE: elke sleutel hier wijst naar een BESTAANDE laag.
   * Een nieuwe sleutel toevoegen zonder de bijbehorende aanroep is een belofte
   * zonder dekking — precies de fout die de gespiegelde spaarquote maakte.
   */
  metricSource?:
    | 'cashflow-kpis'        // loadForecastSectionData().effectiveSavingsRatePct
    | 'horizon-kernel'       // computeHorizonFireSim (FIRE-leeftijd, eindsaldo)
    | 'netto-vermogen'       // dashboard-wealth-weighting (inclusion-gewogen)
    | 'fire-params'          // netto vermogen x computeEffectiveSwr / 12
    | 'noodfonds'            // resolveEmergencyFund().monthsCovered
    | 'schuld-looptijd'      // resolveDebtTermBasis over de actieve schulden
    | 'belastingdruk'        // buildTaxOverview(...).effectiveRate
}

/**
 * GELDDOEL-types: doelen waarvan de waarde een BEDRAG is en die daarom aan
 * bezittingen én schulden gekoppeld mogen worden (vrij mengen, netto-semantiek).
 * De metric-types eronder houden beide koppelvlaggen bewust false: hun waarde
 * komt uit een canonieke motor, niet uit een optelling van rijen.
 */
export const GOAL_TYPE_META: Record<GoalType, GoalTypeMeta> = {
  savings:         { unit: 'EUR', group: 'Financieel', step: '0.01', supportsAssetLink: true,  supportsDebtLink: true,  allowsMixedLinks: true, freedomTimeRelevant: true },
  debt_payoff:     { unit: 'EUR', group: 'Financieel', step: '0.01', supportsAssetLink: true,  supportsDebtLink: true,  allowsMixedLinks: true, freedomTimeRelevant: true },
  net_worth:       { unit: 'EUR', group: 'Financieel', step: '0.01', supportsAssetLink: true,  supportsDebtLink: true,  allowsMixedLinks: true, freedomTimeRelevant: true, metricBasis: true, metricSource: 'netto-vermogen' },
  freedom_days:    { unit: 'dagen', group: 'Financieel', step: '1',  supportsAssetLink: false, supportsDebtLink: false, freedomTimeRelevant: false },
  savings_rate:    { unit: '%',  group: 'Financieel', step: '0.1', min: 0, max: 100, supportsAssetLink: false, supportsDebtLink: false, freedomTimeRelevant: false, metricBasis: true, metricSource: 'cashflow-kpis' },
  invested_assets: { unit: 'EUR', group: 'Financieel', step: '0.01', supportsAssetLink: true,  supportsDebtLink: true,  allowsMixedLinks: true, freedomTimeRelevant: true },
  passive_income:  { unit: 'EUR/mnd', group: 'Financieel', step: '0.01', supportsAssetLink: false, supportsDebtLink: false, freedomTimeRelevant: false, metricBasis: true, metricSource: 'fire-params' },
  emergency_fund:  { unit: 'maanden', group: 'Financieel', step: '0.5', min: 0, supportsAssetLink: false, supportsDebtLink: false, freedomTimeRelevant: false, metricBasis: true, metricSource: 'noodfonds' },
  salary:          { unit: 'EUR', group: 'Financieel', step: '0.01', supportsAssetLink: false, supportsDebtLink: false, freedomTimeRelevant: true },
  expected_return: { unit: '%',   group: 'Financieel', step: '0.1', min: 0,  max: 20,  supportsAssetLink: false, supportsDebtLink: false, freedomTimeRelevant: false, viaLab: true },
  fire_age:        { unit: 'jaar', group: 'Financieel', step: '0.5', min: 18, max: 100, supportsAssetLink: false, supportsDebtLink: false, freedomTimeRelevant: false, direction: 'down', viaLab: true, metricBasis: true, metricSource: 'horizon-kernel' },
  // Eindsaldo bij levensverwachting (`profiles.fire_end_age`, default 90). Grondslag
  // = de LIQUIDE FIRE-portefeuille (`SimRow.endPortfolio`), NOMINAAL — zie
  // lib/goals/vrijheidsgetal-goal.ts#pickEndBalanceAtEndAge.
  end_balance:     { unit: 'EUR', group: 'Financieel', step: '0.01', supportsAssetLink: false, supportsDebtLink: false, freedomTimeRelevant: true, metricBasis: true, metricSource: 'horizon-kernel' },
  // Schuldenvrij-datum: opgeslagen als DECIMAAL JAAR (2031.5 = medio 2031), en
  // 'down' omdat eerder schuldenvrij beter is.
  debt_free_date:  { unit: 'datum', group: 'Financieel', step: '0.5', min: 1900, max: 2200, supportsAssetLink: false, supportsDebtLink: false, freedomTimeRelevant: false, direction: 'down', metricBasis: true, metricSource: 'schuld-looptijd' },
  // Belastingdruk in %: het EFFECTIEVE tarief over het inkomen uit
  // `buildTaxOverview(...).effectiveRate`. 'down' omdat lager beter is.
  tax_burden:      { unit: '%', group: 'Financieel', step: '0.1', min: 0, max: 100, supportsAssetLink: false, supportsDebtLink: false, freedomTimeRelevant: false, direction: 'down', metricBasis: true, metricSource: 'belastingdruk' },
  custom:          { unit: 'custom', group: 'Persoonlijk', step: '1',  supportsAssetLink: true, supportsDebtLink: true, allowsMixedLinks: true, freedomTimeRelevant: false },
}

/**
 * Nederlandse maandnamen, index 0 = januari. Bewust een vaste lijst en geen
 * `toLocaleDateString`: die zou een `Date` vergen (en dus een dag-keuze) terwijl
 * de opgeslagen waarde per constructie maand-precisie heeft.
 */
const NL_MAANDEN = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
] as const

/**
 * DECIMAAL JAAR → (jaar, maand-index). De ENE conversie voor de `'datum'`-unit.
 *
 * Conventie: `jaar + maandIndex / 12`, dus 2031.0 = januari 2031 en 2031.5 =
 * juli 2031 ("medio 2031"). Maand-precisie is bewust: de bron is de LAATSTE
 * `debts.end_date` en een schuldenvrij-doel wordt in maanden gedacht, niet in
 * dagen. `decimalYearFromIso` (lib/goals/metric-sources.ts) is de exacte inverse
 * hiervan, zodat heen-en-terug niet van maand verschuift.
 *
 * De maandindex wordt geklemd op 0..11: een afrondings-artefact (bv. 2031.99999)
 * mag geen "maand 12" opleveren.
 */
export function splitDecimalYear(value: number): { year: number; monthIndex: number } {
  const year = Math.floor(value)
  const raw = Math.floor((value - year) * 12)
  const monthIndex = Math.min(11, Math.max(0, Number.isFinite(raw) ? raw : 0))
  return { year, monthIndex }
}

/**
 * Format a goal value with the appropriate unit suffix/prefix.
 */
export function formatGoalValue(value: number, goalType: GoalType, customUnit?: string | null): string {
  const meta = GOAL_TYPE_META[goalType]
  switch (meta.unit) {
    case 'EUR':
      return `€${value.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    case 'EUR/mnd':
      return `€${value.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/mnd`
    case '%':
      return `${value.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
    case 'dagen':
      return `${Math.round(value)} dagen`
    case 'maanden':
      return `${value.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} maanden`
    case 'jaar':
      // Halve jaren mogelijk (step 0.5) → 1 decimaal, maar trailing .0 weglaten
      // ("58 jaar" / "58,5 jaar").
      return `${value.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} jaar`
    case 'datum': {
      // Decimaal jaar → "juli 2031". Een onbruikbare waarde (0, NaN, negatief)
      // levert een streepje i.p.v. "januari 0" — liever niets dan een verzonnen
      // datum (zelfde regel als de tolerante degradatie in de sync-laag).
      if (!Number.isFinite(value) || value <= 0) return '—'
      const { year, monthIndex } = splitDecimalYear(value)
      return `${NL_MAANDEN[monthIndex]} ${year}`
    }
    case 'custom':
      return customUnit ? `${value.toLocaleString('nl-NL')} ${customUnit}` : value.toLocaleString('nl-NL')
    default:
      return value.toLocaleString('nl-NL')
  }
}

/**
 * Get form labels for target/current fields based on goal type.
 */
export function goalValueLabels(goalType: GoalType): { target: string; current: string } {
  switch (goalType) {
    case 'savings':
    case 'net_worth':
    case 'invested_assets':
    case 'salary':
      return { target: 'Doelbedrag (€)', current: 'Huidige waarde (€)' }
    case 'debt_payoff':
      return { target: 'Totale schuld (€)', current: 'Afgelost (€)' }
    case 'passive_income':
      return { target: 'Doel (€/mnd)', current: 'Huidig (€/mnd)' }
    case 'freedom_days':
      return { target: 'Doeldagen', current: 'Huidige dagen' }
    case 'savings_rate':
      return { target: 'Doelpercentage (%)', current: 'Huidige spaarquote (%)' }
    case 'emergency_fund':
      return { target: 'Doelmaanden', current: 'Huidige maanden' }
    case 'expected_return':
      return { target: 'Doelrendement (%)', current: 'Huidig rendement (%)' }
    case 'fire_age':
      return { target: 'Doel-vrijheidsleeftijd', current: 'Huidige vrijheidsleeftijd' }
    case 'end_balance':
      return { target: 'Doel-eindsaldo (€)', current: 'Verwacht eindsaldo (€)' }
    case 'debt_free_date':
      return { target: 'Schuldenvrij uiterlijk', current: 'Nu verwacht schuldenvrij' }
    case 'tax_burden':
      return { target: 'Doel-belastingdruk (%)', current: 'Huidige belastingdruk (%)' }
    case 'custom':
      return { target: 'Doelwaarde', current: 'Huidige waarde' }
    default:
      return { target: 'Doelwaarde', current: 'Huidige waarde' }
  }
}

export const GOAL_COLORS = [
  { value: 'teal', label: 'Teal', class: 'bg-wil-500' },
  { value: 'amber', label: 'Amber', class: 'bg-kern-500' },
  { value: 'purple', label: 'Paars', class: 'bg-horizon-500' },
  { value: 'emerald', label: 'Groen', class: 'bg-emerald-500' },
  { value: 'red', label: 'Rood', class: 'bg-red-500' },
  { value: 'blue', label: 'Blauw', class: 'bg-blue-500' },
]

/**
 * Absolute speling (in de eenheid van het doel) waarbinnen een `down`-doel nog
 * als "op koers" geldt. Bewust ABSOLUUT, niet relatief: een relatieve marge op
 * een leeftijd (bv. 1% van 58 ≈ 0,6 jr) zou meebewegen met de leeftijd, en dat
 * is hier onlogisch.
 *
 * Sinds ADR 0125 bedient deze ene constante drie `down`-types in twee eenheden,
 * en 0,25 is in beide toevallig verdedigbaar: bij `fire_age` en
 * `debt_free_date` (allebei decimale jaren) is het ~3 maanden, bij `tax_burden`
 * 0,25 procentpunt. "Toevallig verdedigbaar" is geen ontwerp — komt er een vierde
 * eenheid bij, dan hoort de marge per type in `GOAL_TYPE_META` te staan en niet
 * hier gedeeld te worden.
 */
const DOWN_GOAL_ONTRACK_TOLERANCE = 0.25

/**
 * Is dit doel BEREIKT? De ene richting-bewuste toets die elk oppervlak
 * consumeert — de bewerk-sheet die `is_completed` schrijft, het server-pad dat
 * auto-syncende doelen afsluit, en elke viering die daarop volgt.
 *
 * Bestaat omdat een kale `current >= target` sinds ADR 0125 aantoonbaar fout is.
 * Zolang elk behaalbaar doel omhoog liep viel dat niet op; met een doel op je
 * vrijheidsleeftijd, je schuldenvrij-datum of je belastingdruk keert de toets om
 * en levert de kale vergelijking twee tegengestelde fouten tegelijk: een
 * vrijheidsleeftijd van 46 tegen een doel van 55 zou NOOIT als behaald gelden
 * (46 >= 55 is onwaar terwijl het doel ruim gehaald is), en een belastingdruk van
 * 35% tegen een doel van 30% zou juist METEEN als behaald gelden — met een
 * viering en een onomkeerbare regel in het mijlpalen-logboek voor een doel dat
 * mislukt. `is_completed` is in de praktijk moeilijk terug te draaien, dus deze
 * toets hoort op één plek te staan.
 *
 * Een doelwaarde van 0 of lager telt als "geen doel gesteld" en is dus nooit
 * bereikt — dat is het bestaande gedrag van `computeGoalProgress`.
 */
export function isGoalReached(goalType: GoalType, current: number, target: number): boolean {
  const c = Number(current)
  const t = Number(target)
  if (!Number.isFinite(c) || !Number.isFinite(t) || t <= 0) return false
  if ((GOAL_TYPE_META[goalType]?.direction ?? 'up') === 'down') {
    // `current <= 0` is bij een omlaag-doel GEEN nul-meting maar "de bron kon
    // niets zeggen" — precies zoals `computeGoalProgress` hieronder het leest
    // (`current <= 0` → pct 0, measured: false). Zonder deze guard is een vers
    // aangemaakt doel meteen "bereikt": de rij staat op current_value 0 tot de
    // eerste synchronisatie, en elke bron degradeert tolerant naar null wanneer
    // hij niets weet (geen geboortedatum, geen bekend inkomen, schulden zonder
    // einddatum) — waarna die 0 blijft staan. Het gevolg zou onomkeerbaar zijn:
    // het doel sluit zichzelf af, met een viering en een regel in een
    // append-only mijlpalenlogboek, voor iets wat nooit gehaald is.
    return c > 0 && c <= t
  }
  return c >= t
}

/**
 * "Is dit doel binnen?" op een reeds berekende voortgang — de vorm die de
 * oppervlakken nodig hebben, want die hebben doorgaans een `GoalProgress` bij de
 * hand en niet de rauwe doelrij.
 *
 * Gebruik dit overal waar tot nu toe `pct >= 100` stond. Dat percentage is voor
 * een omlaag-doel geen bruikbaar oordeel: de down-tak rekent `target / current`,
 * en bij een schuldenvrij-datum liggen teller en noemer allebei rond het jaar
 * 2030 — een doel dat vier jaar uitloopt komt dan afgerond nog steeds op 100%
 * uit. Oppervlakken die op dat getal afgaan zeggen "Behaald" tegen een doel dat
 * de canonieke toets afwijst, en vieren het zelfs.
 */
export function goalReachedFromProgress(
  goalType: GoalType,
  progress: Pick<GoalProgress, 'current' | 'target'>,
): boolean {
  return isGoalReached(goalType, progress.current, progress.target)
}

/**
 * Minimale velden die `computeGoalProgress` daadwerkelijk leest. Een volledig
 * `Goal` voldoet hieraan, maar ook lichtere projecties (bv. `TopGoal` in de
 * dashboard-widget) kunnen zo de CANONIEKE voortgangsberekening consumeren
 * i.p.v. lokaal te herrekenen. `created_at` is optioneel: alleen de 'up'-tak
 * gebruikt het voor de ETA/on-track-schatting en gaat er defensief mee om.
 */
export type GoalProgressInput = Pick<
  Goal,
  'goal_type' | 'current_value' | 'target_value' | 'target_date'
> & { created_at?: string }

export type GoalProgressOptions = {
  /**
   * Vervangt de uit `target_date` afgeleide `eta` door een door een canonieke
   * motor GEPROJECTEERDE datum (bevinding C10). Alleen gezet voor doelen die een
   * live tracker zijn — vandaag uitsluitend het vrijheidsgetal-doel, waar de
   * datum uit de FIRE-countdown komt (`lib/goals/vrijheidsgetal-goal.ts`).
   *
   * Bewust een OPTIE en geen veld op het doel-object: `GoalProgressInput`
   * spiegelt DB-kolommen, en dit is een afgeleide weergavewaarde. `onTrack`
   * blijft ongemoeid op `target_date` staan — dat is de ambitie die de gebruiker
   * zelf invoerde, en die blijft de meetlat voor "op koers".
   */
  etaOverride?: string | null
}

/**
 * Canonieke uitkomst van `computeGoalProgress` — de ENE vorm waarin elk
 * oppervlak (doelenpagina, dashboard-widget, /overzicht-hero, acties-lijst,
 * nav-kaarten, briefing) doelvoortgang consumeert. Importeer dit type i.p.v.
 * de vorm lokaal over te tikken: een oppervlak dat een veld mist, mist een
 * oordeel.
 */
export type GoalProgress = {
  current: number
  target: number
  /** 0–100, richting-bewust afgerond. */
  pct: number
  /**
   * "Haal je het tempo?" — bij een 'up'-doel MET streefdatum de pace-toets
   * (benodigde inleg/maand vs. feitelijke inleg/maand), anders het bestaande
   * richting-/tolerantie-oordeel. `true` betekent altijd "geen probleem
   * gesignaleerd": ook wanneer er (nog) niets te meten valt (`measured: false`),
   * zodat geen enkel oppervlak vals alarm slaat op een vers doel.
   */
  onTrack: boolean
  /**
   * Valt er iets te oordelen? `false` uitsluitend bij een VERS doel met
   * streefdatum waarop nog geen bijdrage staat (bevinding M31): binnen
   * `GOAL_PACE_GRACE_DAYS` na aanmaak én `current === 0`. Een oppervlak hoort
   * dan "net begonnen" te tonen i.p.v. een stoplicht — niet zelf iets afleiden
   * uit `pct === 0`.
   */
  measured: boolean
  /**
   * Wat er vanaf NU per maand bij moet om de streefdatum te halen, in de
   * EENHEID VAN HET DOEL (euro's voor de EUR-types, procenten voor
   * `savings_rate`, …). `null` zonder streefdatum, bij een verstreken
   * streefdatum en bij een 'down'-doel (een leeftijdsdoel heeft geen maandinleg).
   * Bevinding M32 vraagt dit expliciet op het scherm, zodat het stoplicht
   * navolgbaar wordt.
   */
  requiredMonthly: number | null
  eta: string | null
}

/**
 * Compute goal progress.
 * For debt_payoff, progress = how much has been paid off.
 * For freedom_days, current value is free days per year.
 *
 * Richting-bewust: bij `direction: 'down'` (lager-is-beter, bv. `fire_age`) is
 * het doel een LAGERE waarde dan de huidige; voortgang = target / current. Alle
 * bestaande types zijn 'up' (default) en behouden exact hun gedrag.
 *
 * ON-TRACK = PACE-TOETS (bevindingen M31 + M32, 26 aug 2026). Voorheen mat de
 * 'up'-tak een lineaire TIJD-FRACTIE sinds `created_at`; `target_value` kwam in
 * die verwachting niet voor (alleen in `pct`), waardoor een doel zwaarder maken
 * de status ongewijzigd kon laten en een vers doel per constructie meteen rood
 * stond. Nu: benodigde inleg per maand tot de streefdatum versus de feitelijk
 * gerealiseerde inleg per maand.
 */
export function computeGoalProgress(goal: GoalProgressInput, options?: GoalProgressOptions): GoalProgress {
  const current = Number(goal.current_value)
  const target = Number(goal.target_value)

  const direction = GOAL_TYPE_META[goal.goal_type]?.direction ?? 'up'
  const etaOverride = options?.etaOverride ?? null

  if (direction === 'down') {
    // Lager-is-beter. Ongeldig doel of nog geen (positieve) huidige waarde →
    // 0% en niet op koers (geen stale/misleidende voortgang). `measured: false`
    // markeert die tweede tak als "nog geen meting" — exact de lezing die
    // ParameterGoalCard al hanteerde; `onTrack` blijft bewust ongewijzigd.
    if (target <= 0 || !Number.isFinite(current) || current <= 0) {
      return { current, target, pct: 0, onTrack: false, measured: false, requiredMonthly: null, eta: null }
    }
    const pct = Math.max(0, Math.min(Math.round((target / current) * 100), 100))
    const onTrack = current <= target + DOWN_GOAL_ONTRACK_TOLERANCE
    // target_date-tijdlijnlogica (en dus ook `etaOverride`) is alleen zinvol voor
    // 'up'-doelen; een `down`-doel is zelf al een leeftijd, geen datum — en dus
    // ook geen benodigde maandinleg.
    return { current, target, pct, onTrack, measured: true, requiredMonthly: null, eta: null }
  }

  if (target <= 0) {
    return { current, target, pct: 0, onTrack: false, measured: false, requiredMonthly: null, eta: etaOverride }
  }

  // Ondergrens op 0 — `current` zelf blijft ongemoeid en mag negatief zijn.
  // Sinds ADR 0125 kan een doel netto gekoppeld zijn (bezittingen min schulden),
  // en die som kan onder nul duiken; dat is een eerlijke stand, maar een
  // NEGATIEF PERCENTAGE is dat nergens: het rendert als een balk met een
  // ongeldige breedte, als een ongeldige `aria-valuenow`, en het valt door
  // ondergrens-filters heen die "0" als 'niet gemeten' lezen. Eén klem bij de
  // bron scheelt dezelfde klem in elke consument (en die waren het oneens).
  const pct = Math.max(0, Math.min(Math.round((current / target) * 100), 100))

  // Zonder streefdatum is er geen planning om tegen af te zetten: het doel is
  // per definitie "op koers" (bestaand gedrag) en er is geen maandinleg te
  // berekenen. Dat is een geldig oordeel, dus `measured` blijft true.
  let onTrack = true
  let measured = true
  let requiredMonthly: number | null = null
  // Een canonieke projectie wint van de opgeslagen streefdatum: dát is het
  // antwoord op "wanneer haal ik dit", terwijl `target_date` de ambitie is.
  let eta: string | null = etaOverride

  if (goal.target_date) {
    const targetDate = new Date(goal.target_date)
    const now = new Date()
    const daysLeft = Math.max(0, (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    const monthsLeft = daysLeft / GOAL_PACE_DAYS_PER_MONTH
    const createdMs = goal.created_at ? new Date(goal.created_at).getTime() : NaN
    const elapsedDays = (now.getTime() - createdMs) / (1000 * 60 * 60 * 24)

    if (monthsLeft > 0) {
      // Benodigd tempo vanaf nu — hier komt `target_value` de toets binnen, en
      // precies dát ontbrak in de oude tijd-fractie-heuristiek (M32).
      requiredMonthly = Math.max(0, target - current) / monthsLeft

      // Feitelijk tempo sinds aanmaak (eigenaarsbesluit 26-08-2026, optie A:
      // bestaande data, geen nieuw veld/historie). Dat mag omdat `current_value`
      // bij aanmaken op 0 staat — alles wat er nu in zit, is er sindsdien in
      // gekomen. Zonder `created_at` (lichte projecties zoals TopGoal) is er
      // geen meetperiode: dan geen pace-oordeel, en `onTrack` blijft true.
      if (Number.isFinite(elapsedDays)) {
        measured = current > 0 || elapsedDays >= GOAL_PACE_GRACE_DAYS
        if (measured) {
          const monthsElapsed = Math.max(
            elapsedDays / GOAL_PACE_DAYS_PER_MONTH,
            GOAL_PACE_MIN_MEASURE_MONTHS,
          )
          const actualMonthly = current / monthsElapsed
          onTrack = actualMonthly >= requiredMonthly * (1 - GOAL_PACE_TOLERANCE)
        }
      }
    } else if (current < target) {
      // Streefdatum verstreken en het doel niet gehaald. Er is geen maandinleg
      // meer die dit nog redt; "op koers" zou hier onwaar zijn.
      onTrack = false
    }

    if (etaOverride == null) {
      eta = targetDate.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
    }
  }

  return { current, target, pct, onTrack, measured, requiredMonthly, eta }
}

/**
 * Get the color classes for a goal color string.
 */
export function getGoalColorClasses(color: string): {
  bg: string
  bgLight: string
  text: string
  border: string
  bar: string
} {
  switch (color) {
    case 'amber':
      return { bg: 'bg-kern-500', bgLight: 'bg-kern-50', text: 'text-kern-600', border: 'border-kern-200', bar: 'bg-kern-500' }
    case 'purple':
      return { bg: 'bg-horizon-500', bgLight: 'bg-horizon-50', text: 'text-horizon-600', border: 'border-horizon-200', bar: 'bg-horizon-500' }
    case 'emerald':
      return { bg: 'bg-emerald-500', bgLight: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', bar: 'bg-emerald-500' }
    case 'red':
      return { bg: 'bg-red-500', bgLight: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', bar: 'bg-red-500' }
    case 'blue':
      return { bg: 'bg-blue-500', bgLight: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', bar: 'bg-blue-500' }
    case 'teal':
    default:
      return { bg: 'bg-wil-500', bgLight: 'bg-wil-50', text: 'text-wil-600', border: 'border-wil-200', bar: 'bg-wil-500' }
  }
}
