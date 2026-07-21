// ── Fiscale kerngetallen (gecureerd) ─────────────────────────────────────────
// De inventaris van "vaste" fiscale en financiële constanten die periodiek
// (meestal jaarlijks) tegen de officiële bron geverifieerd moeten worden:
// Box 1/2/3, jaarruimte, schenk- & erfbelasting, AOW, FIRE-aannames en de
// fiscale kalender. Zelfde principe als lib/architecture/calculations.ts:
// feiten (de waarden) worden LIVE uit de echte bronconstanten gelezen — nooit
// hier gedupliceerd — en de betekenis (bron-instantie, update-frequentie,
// 'laatst geverifieerd') is gecureerd. Geconsumeerd door
// /beheer/fiscale-kerngetallen; bewaakt door lib/fiscale-kerngetallen.test.ts
// (spiegel van validateCalculations).
//
// FASE 1 (deze module): read-only inventaris + jaar-checklist + drift-punten.
// FASE 2 (in uitvoering): bewerkbaar met historie via een DB-override-laag
// (resolver met TS-fallback). Eerste toepassing: de FIRE-marktaannames
// (rendement/inflatie/volatiliteit) zijn nu jaargelaagd beheerbaar via de tabel
// `fire_assumptions` + de pure resolver lib/fire-assumptions.ts#resolveFireAssumptions
// (fallback = de constanten in lib/constants.ts). De beheer-CRUD zit op
// /beheer/fiscale-kerngetallen. De overige (fiscale) kerngetallen blijven read-only
// inventaris tot ze op dezelfde manier worden gemigreerd.
//
// Onderhoudsregel: voeg je een jaarlaag toe aan een van de bronbestanden of
// verifieer je een waarde tegen de officiële bron, werk dan `lastVerified`
// (en eventueel de notes) hier bij in dezelfde PR.

import { BOX3_PARAMS, CURRENT_TAX_YEAR } from './box3-data'
import { BOX1_PARAMS, deriveMarginaalTarief, schijfGrensVoor, type Box1TaxYear } from './box1-tax'
import { BOX2_PARAMS, DGA_LENING_DREMPEL } from './box2-data'
import {
  JAARRUIMTE_PARAMS,
  JAARRUIMTE_OPBOUW_PCT,
  JAARRUIMTE_FACTOR_A_IMPUTATIE,
  JAARRUIMTE_MAX_PREMIE_INKOMEN,
  JAARRUIMTE_MIDDELLOON_OPBOUW_PCT,
} from './jaarruimte'
import {
  SCHENK_ERF_PARAMS,
  SCHENK_TARIEVEN_RATES,
  ERF_TARIEVEN_RATES,
  AUTO_MAANDKOSTEN,
} from './horizon-data'
import {
  SWR,
  DEFAULT_RETURN,
  DEFAULT_VOLATILITY,
  INFLATION,
  BOX3_DRAG,
  NL_SWR,
  NL_AOW_AGE,
  NL_AOW_MONTHLY,
  NL_AOW_MONTHLY_SAMENWONEND,
} from './constants'
import { TAX_DEADLINES } from './tax-calendar'

// ── Types ────────────────────────────────────────────────────────────────────

export type FiscaalDomein =
  | 'Box 1'
  | 'Box 2'
  | 'Box 3'
  | 'Pensioen'
  | 'Schenken & erven'
  | 'AOW'
  | 'FIRE-aannames'
  | 'Presets & kalender'

export type BronInstantie =
  | 'Belastingdienst'
  | 'SVB'
  | 'CBS'
  | 'NIBUD/ANWB'
  | 'Markt/aanname'

export type UpdateFrequentie = 'jaarlijks' | 'meerjaarlijks' | 'zelden'

export interface FiscaleWaarde {
  label: string
  value: string
}

/** Waarden voor één jaarlaag; `year: null` = jaaronafhankelijke waarden. */
export interface FiscaleWaardenPerJaar {
  year: number | null
  values: FiscaleWaarde[]
}

export interface FiscaalKerngetal {
  id: string
  title: string
  domain: FiscaalDomein
  summary: string
  /** true = de bron heeft een Record<jaar, …>-laag; false = losse constante(n). */
  jaargelaagd: boolean
  /** Jaren aanwezig in de bron (leeg bij niet-jaargelaagd). */
  years: number[]
  /** Live afgelezen waarden, per jaar (en/of één `year: null`-rij). */
  valuesByYear: FiscaleWaardenPerJaar[]
  /** Bronbestand (repo-relatief) waar de constante gedefinieerd is. */
  file: string
  /** Naam van de export in het bronbestand. */
  exportName: string
  source: BronInstantie
  /** Deeplink naar de officiële bron voor de jaarlijkse verificatie. */
  sourceUrl?: string
  updateFrequency: UpdateFrequentie
  /** ISO-datum (yyyy-mm-dd) van de laatste verificatie tegen de bron. */
  lastVerified: string
  note?: string
}

export type DriftStatus = 'open' | 'opgelost'

/** Een gevonden dubbeling/verspreiding van een fiscaal getal in de code. */
export interface DriftPunt {
  id: string
  title: string
  status: DriftStatus
  description: string
  files: string[]
}

export interface JaarChecklistItem {
  id: string
  title: string
  file: string
  /** true = de doeljaar-laag bestaat al in de bron. */
  hasTargetYear: boolean
  /** Toelichting, bv. "2027 nog te verifiëren" of "geen jaarlagen — handmatig". */
  note: string
}

export interface JaarChecklist {
  targetYear: number
  items: JaarChecklistItem[]
  /** Aantal items dat nog verificatie nodig heeft. */
  openCount: number
}

// ── Format-helpers (nl-NL, puur) ─────────────────────────────────────────────

function nlNum(n: number, maxFrac = 3): string {
  return n.toLocaleString('nl-NL', { maximumFractionDigits: maxFrac })
}

function eur(n: number): string {
  return `€ ${nlNum(n, 0)}`
}

function pct(n: number): string {
  return `${nlNum(n * 100, 3)}%`
}

function jarenVan(rec: Record<number | string, unknown>): number[] {
  return Object.keys(rec)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
}

// ── De catalogus ─────────────────────────────────────────────────────────────

export const FISCAL_DOMAINS: FiscaalDomein[] = [
  'Box 1',
  'Box 2',
  'Box 3',
  'Pensioen',
  'Schenken & erven',
  'AOW',
  'FIRE-aannames',
  'Presets & kalender',
]

export const FISCALE_KERNGETALLEN: FiscaalKerngetal[] = [
  // ── Box 1 ──
  {
    id: 'box1-params',
    title: 'Box 1 — schijven & heffingskortingen',
    domain: 'Box 1',
    summary:
      'Belastingschijven, algemene heffingskorting, arbeidskorting, IACK, eigenwoningforfait, HRA-maxtarief en Wet Hillen — inclusief AOW-varianten.',
    jaargelaagd: true,
    years: jarenVan(BOX1_PARAMS),
    valuesByYear: jarenVan(BOX1_PARAMS).map((year) => {
      const p = BOX1_PARAMS[year as keyof typeof BOX1_PARAMS]
      return {
        year,
        values: [
          {
            label: 'Schijven',
            value: p.schijven
              .map((s) => (s.tot != null ? `t/m ${eur(s.tot)}: ${pct(s.tarief)}` : `daarboven: ${pct(s.tarief)}`))
              .join(' · '),
          },
          {
            label: 'Algemene heffingskorting',
            value: `max ${eur(p.algemeneHeffingskorting.max)}, afbouw ${pct(p.algemeneHeffingskorting.afbouwRate)} vanaf ${eur(p.algemeneHeffingskorting.afbouwStart)}`,
          },
          {
            label: 'Arbeidskorting',
            value: `max ${eur(p.arbeidskorting.max)}, afbouw ${pct(p.arbeidskorting.afbouwRate)} vanaf ${eur(p.arbeidskorting.afbouwStart)}`,
          },
          { label: 'IACK', value: `max ${eur(p.iack.max)}, drempel ${eur(p.iack.drempelInkomen)}` },
          { label: 'Eigenwoningforfait', value: pct(p.eigenwoningforfaitRate) },
          { label: 'HRA-maxtarief', value: pct(p.hypotheekAftrekMaxTarief) },
          { label: 'Wet Hillen', value: pct(p.hillenPct) },
        ],
      }
    }),
    file: 'lib/box1-tax.ts',
    exportName: 'BOX1_PARAMS',
    source: 'Belastingdienst',
    sourceUrl: 'https://www.belastingdienst.nl/wps/wcm/connect/nl/belastingaangifte/',
    updateFrequency: 'jaarlijks',
    lastVerified: '2026-06-15',
    note: 'Enkele afbouw-knikpunten zijn in de bron gemarkeerd als "indicatie — verifieer tegen Belastingdienst". AOW-varianten (schijvenAow, kortingen-AOW) zitten in dezelfde export.',
  },
  {
    id: 'marginale-ib-vuistregel',
    title: 'Marginale IB-vuistregel (FIRE)',
    domain: 'Box 1',
    summary:
      'De vuistregel waarmee FIRE-oppervlakken het marginale IB-tarief afleiden uit netto maandinkomen. Laag = schijf-1-tarief, hoog = topschijf-tarief; per belastingjaar afgeleid uit BOX1_PARAMS (geen losse hardcode meer).',
    jaargelaagd: true,
    years: jarenVan(BOX1_PARAMS),
    valuesByYear: jarenVan(BOX1_PARAMS).map((year) => {
      const schijven = BOX1_PARAMS[year as keyof typeof BOX1_PARAMS].schijven
      return {
        year,
        values: [
          { label: 'Marginaal laag (schijf 1)', value: pct(deriveMarginaalTarief({ year: year as Box1TaxYear })) },
          { label: 'Marginaal hoog (topschijf)', value: pct(schijven[schijven.length - 1].tarief) },
          { label: 'Topschijf-grens', value: eur(schijfGrensVoor(year as Box1TaxYear)) },
        ],
      }
    }),
    file: 'lib/box1-tax.ts',
    exportName: 'deriveMarginaalTarief',
    source: 'Belastingdienst',
    updateFrequency: 'jaarlijks',
    lastVerified: '2026-07-13',
    note: 'Afgeleid uit BOX1_PARAMS[jaar]: laag = schijven[0].tarief, hoog = topschijf, grens = bovengrens één-na-laatste schijf (schijfGrensVoor). fire-params.ts delegeert naar deze helper en IB_SCHIJFGRENS is nu een afgeleide re-export. De laag/hoog-keuze volgt een netto-maandinkomen-drempel (MARGINAAL_TARIEF_NETTO_DREMPEL) — bewust behouden heuristiek, alleen de tarieven zijn per jaar gecorrigeerd.',
  },

  // ── Box 2 ──
  {
    id: 'box2-params',
    title: 'Box 2 — aanmerkelijk belang',
    domain: 'Box 2',
    summary: 'Tarieven (staffel) en eerste-schijfgrens voor inkomen uit aanmerkelijk belang.',
    jaargelaagd: true,
    years: jarenVan(BOX2_PARAMS),
    valuesByYear: jarenVan(BOX2_PARAMS).map((year) => {
      const p = BOX2_PARAMS[year as keyof typeof BOX2_PARAMS]
      return {
        year,
        values: [
          { label: 'Tarief laag / hoog', value: `${pct(p.tariefLaag)} / ${pct(p.tariefHoog)}` },
          { label: 'Schijfgrens (alleen / partner)', value: `${eur(p.grens)} / ${eur(p.grensPartner)}` },
        ],
      }
    }),
    file: 'lib/box2-data.ts',
    exportName: 'BOX2_PARAMS',
    source: 'Belastingdienst',
    updateFrequency: 'jaarlijks',
    lastVerified: '2026-06-15',
  },
  {
    id: 'dga-leengrens',
    title: 'Wet excessief lenen (DGA-leengrens)',
    domain: 'Box 2',
    summary: 'Drempel waarboven leningen bij de eigen BV als fictief regulier voordeel in Box 2 worden belast.',
    jaargelaagd: false,
    years: [],
    valuesByYear: [
      { year: null, values: [{ label: 'Drempel', value: eur(DGA_LENING_DREMPEL) }] },
    ],
    file: 'lib/box2-data.ts',
    exportName: 'DGA_LENING_DREMPEL',
    source: 'Belastingdienst',
    updateFrequency: 'meerjaarlijks',
    lastVerified: '2026-06-15',
    note: 'Wettelijke drempel (€500.000), niet geïndexeerd sinds invoering. Ook genoemd in de kalender-deadline "dga-leengrens" (lib/tax-calendar.ts).',
  },

  // ── Box 3 ──
  {
    id: 'box3-params',
    title: 'Box 3 — vermogensrendementsheffing',
    domain: 'Box 3',
    summary:
      'Forfaits (spaargeld/beleggingen/schulden), tarief, heffingsvrij vermogen en schuldendrempel. CURRENT_TAX_YEAR bepaalt welk jaar app-breed actueel is.',
    jaargelaagd: true,
    years: jarenVan(BOX3_PARAMS),
    valuesByYear: jarenVan(BOX3_PARAMS).map((year) => {
      const p = BOX3_PARAMS[year as keyof typeof BOX3_PARAMS]
      return {
        year,
        values: [
          { label: 'Forfait spaargeld', value: pct(p.forfaitSpaargeld) },
          { label: 'Forfait beleggingen', value: pct(p.forfaitBeleggingen) },
          { label: 'Forfait schulden', value: pct(p.forfaitSchulden) },
          { label: 'Tarief', value: pct(p.tarief) },
          { label: 'Heffingsvrij (alleen / partner)', value: `${eur(p.heffingsvrijSingle)} / ${eur(p.heffingsvrijPartner)}` },
          { label: 'Schuldendrempel (alleen / partner)', value: `${eur(p.schuldendrempelSingle)} / ${eur(p.schuldendrempelPartner)}` },
        ],
      }
    }),
    file: 'lib/box3-data.ts',
    exportName: 'BOX3_PARAMS',
    source: 'Belastingdienst',
    sourceUrl: 'https://www.belastingdienst.nl/wps/wcm/connect/nl/box-3/',
    updateFrequency: 'jaarlijks',
    lastVerified: '2026-06-15',
    note: `Actief belastingjaar (CURRENT_TAX_YEAR): ${CURRENT_TAX_YEAR}. De FIRE-afgeleiden in lib/constants.ts (NL_FICTIEF_BELEGGINGEN, BOX3_TARIEF, BOX3_DRAG) lezen uit deze tabel — geen duplicaat meer.`,
  },

  // ── Pensioen ──
  {
    id: 'jaarruimte-params',
    title: 'Jaarruimte — franchise & maximum',
    domain: 'Pensioen',
    summary: 'AOW-franchise en maximale jaarruimte per jaar, plus de vaste WTP-factoren van de jaarruimteformule.',
    jaargelaagd: true,
    years: jarenVan(JAARRUIMTE_PARAMS),
    valuesByYear: [
      ...jarenVan(JAARRUIMTE_PARAMS).map((year) => {
        const p = JAARRUIMTE_PARAMS[year as keyof typeof JAARRUIMTE_PARAMS]
        return {
          year,
          values: [
            { label: 'Franchise', value: eur(p.franchise) },
            { label: 'Max jaarruimte (afgeleid)', value: eur(p.max) },
          ],
        }
      }),
      {
        year: null,
        values: [
          { label: 'Opbouwpercentage (WTP)', value: pct(JAARRUIMTE_OPBOUW_PCT) },
          { label: 'Factor A-imputatie', value: `× ${nlNum(JAARRUIMTE_FACTOR_A_IMPUTATIE)}` },
          { label: 'Max premie-inkomen', value: eur(JAARRUIMTE_MAX_PREMIE_INKOMEN) },
          { label: 'Middelloon-opbouw (schatter)', value: pct(JAARRUIMTE_MIDDELLOON_OPBOUW_PCT) },
        ],
      },
    ],
    file: 'lib/jaarruimte.ts',
    exportName: 'JAARRUIMTE_PARAMS',
    source: 'Belastingdienst',
    updateFrequency: 'jaarlijks',
    lastVerified: '2026-06-15',
    note: 'Max premie-inkomen (€137.800) is 2024–2026 ongewijzigd maar wordt wél periodiek geïndexeerd — jaarlijks meeverifiëren. ADR 0023.',
  },

  // ── Schenken & erven ──
  {
    id: 'schenk-erf-params',
    title: 'Schenk- & erfbelasting',
    domain: 'Schenken & erven',
    summary: 'Vrijstellingen en schijfgrens per jaar; tariefgroepen zijn jaaronafhankelijk. Fallback via resolveSchenkErfParams (onbekend jaar → dichtstbijzijnde eerdere laag).',
    jaargelaagd: true,
    years: jarenVan(SCHENK_ERF_PARAMS),
    valuesByYear: [
      ...jarenVan(SCHENK_ERF_PARAMS).map((year) => {
        const p = SCHENK_ERF_PARAMS[year]
        return {
          year,
          values: [
            { label: 'Schijfgrens', value: eur(p.grens) },
            { label: 'Schenk-vrijstelling (kind / overig)', value: `${eur(p.schenking.vrijstelling.kind)} / ${eur(p.schenking.vrijstelling.overig)}` },
            { label: 'Eenmalig verhoogd (kind 18–40)', value: eur(p.schenking.eenmaligVerhoogdKind) },
            { label: 'Erf-vrijstelling (partner / kind / overig)', value: `${eur(p.erfbelasting.vrijstelling.partner)} / ${eur(p.erfbelasting.vrijstelling.kind)} / ${eur(p.erfbelasting.vrijstelling.overig)}` },
          ],
        }
      }),
      {
        year: null,
        values: [
          {
            label: 'Tariefgroepen schenk',
            value: Object.entries(SCHENK_TARIEVEN_RATES)
              .map(([rel, r]) => `${rel} ${pct(r.laag)}/${pct(r.hoog)}`)
              .join(' · '),
          },
          {
            label: 'Tariefgroepen erf',
            value: Object.entries(ERF_TARIEVEN_RATES)
              .map(([rel, r]) => `${rel} ${pct(r.laag)}/${pct(r.hoog)}`)
              .join(' · '),
          },
        ],
      },
    ],
    file: 'lib/horizon-data.ts',
    exportName: 'SCHENK_ERF_PARAMS',
    source: 'Belastingdienst',
    updateFrequency: 'jaarlijks',
    lastVerified: '2026-06-15',
  },

  // ── AOW ──
  {
    id: 'aow-bedragen',
    title: 'AOW — bedragen & leeftijd (defaults)',
    domain: 'AOW',
    summary: 'Netto AOW-maandbedragen en de default AOW-leeftijd zoals de rekenmotoren die gebruiken. De leeftijd-per-geboortecohort leeft in de databasetabel aow_leeftijd (beheer via /beheer/aow-leeftijd).',
    jaargelaagd: false,
    years: [],
    valuesByYear: [
      {
        year: null,
        values: [
          { label: 'AOW netto p/m (alleenstaand)', value: eur(NL_AOW_MONTHLY) },
          { label: 'AOW netto p/m (per partner)', value: eur(NL_AOW_MONTHLY_SAMENWONEND) },
          { label: 'AOW-leeftijd (default)', value: `${NL_AOW_AGE} jaar` },
        ],
      },
    ],
    file: 'lib/constants.ts',
    exportName: 'NL_AOW_MONTHLY',
    source: 'SVB',
    sourceUrl: 'https://www.svb.nl/nl/aow/bedragen-aow/aow-bedragen',
    updateFrequency: 'jaarlijks',
    lastVerified: '2026-07-04',
    note: 'SVB indexeert de AOW-bedragen twee keer per jaar (januari/juli); dit zijn de bedragen per 1-7-2026. Niet jaargelaagd, maar de eerdere losse duplicaten in CASHFLOW_CATALOG en de AOW-prefab (defaultMonthlyIncome) zijn opgeheven — die importeren nu deze constante (zie drift-punt "aow-bedrag-dubbel"). De cohort-tabel aow_leeftijd (DB) is de bron voor de individuele AOW-leeftijd.',
  },

  // ── FIRE-aannames ──
  {
    id: 'fire-aannames',
    title: 'FIRE-marktaannames',
    domain: 'FIRE-aannames',
    summary:
      'De lange-termijn marktaannames onder de FIRE-projecties: verwacht rendement, inflatie en volatiliteit — jaargelaagd beheerbaar via de DB-override-laag (tabel fire_assumptions), met de constanten in lib/constants.ts als fallback. SWR = rendement − Box 3-drag − inflatie is puur afgeleid (nooit opgeslagen) en beweegt mee met alle drie. Profiel-instellingen van de gebruiker overschrijven rendement/inflatie per gebruiker.',
    jaargelaagd: true,
    years: [CURRENT_TAX_YEAR],
    valuesByYear: [
      {
        year: CURRENT_TAX_YEAR,
        values: [
          { label: 'Verwacht rendement (fallback-default)', value: pct(DEFAULT_RETURN) },
          { label: 'Inflatie (fallback-default)', value: pct(INFLATION) },
          { label: 'Volatiliteit — Monte Carlo (fallback-default)', value: pct(DEFAULT_VOLATILITY) },
          { label: 'SWR = rendement − Box 3-drag − inflatie (afgeleid)', value: pct(NL_SWR) },
          { label: 'Box 3-drag (afgeleid)', value: pct(BOX3_DRAG) },
          { label: 'Klassieke SWR (referentie, 4%-regel)', value: pct(SWR) },
        ],
      },
    ],
    file: 'lib/constants.ts',
    exportName: 'DEFAULT_RETURN',
    source: 'Markt/aanname',
    updateFrequency: 'jaarlijks',
    lastVerified: '2026-07-20',
    note: 'Geen wettelijke getallen maar modelaannames — wijzigingen raken álle projecties. FASE 2 (DB-override met TS-fallback): rendement/inflatie/volatiliteit zijn nu PER JAAR beheerbaar in de tabel fire_assumptions, geresolveerd door lib/fire-assumptions.ts#resolveFireAssumptions (val terug op DEFAULT_RETURN/INFLATION/DEFAULT_VOLATILITY bij een ontbrekende jaarrij). Deze catalogus toont de FALLBACK-laag (de TS-constanten); de live DB-jaarlagen worden bewerkt in de CRUD-tegel op /beheer/fiscale-kerngetallen. De jaar-default schuift alléén in wanneer de gebruiker zelf niets zette; rendement voedt de scalar/target-laag (freedomPct, FIRE-doel) — de kernel-accumulatiecurve blijft per-asset (asset.expected_return), bewust out of scope. SWR wordt NOOIT opgeslagen: rendement − Box 3-drag − inflatie via computeEffectiveSwr; Box 3-drag beweegt zelf mee met BOX3_PARAMS.',
  },

  // ── Presets & kalender ──
  {
    id: 'auto-maandkosten',
    title: 'Auto-maandkosten presets',
    domain: 'Presets & kalender',
    summary: 'Gemiddelde maandkosten per brandstoftype (verzekering, wegenbelasting, onderhoud, brandstof) als prefab voor toekomst-gebeurtenissen.',
    jaargelaagd: false,
    years: [],
    valuesByYear: [
      {
        year: null,
        values: Object.entries(AUTO_MAANDKOSTEN).map(([type, k]) => ({
          label: type,
          value: `${eur(k.verzekering + k.wegenbelasting + k.onderhoud + k.brandstof)} p/m (verz. ${eur(k.verzekering)} · wegenbel. ${eur(k.wegenbelasting)} · onderh. ${eur(k.onderhoud)} · brandstof ${eur(k.brandstof)})`,
        })),
      },
    ],
    file: 'lib/horizon-data.ts',
    exportName: 'AUTO_MAANDKOSTEN',
    source: 'NIBUD/ANWB',
    updateFrequency: 'jaarlijks',
    lastVerified: '2025-06-01',
  },
  {
    id: 'tax-deadlines',
    title: 'Fiscale kalender — vaste deadlines',
    domain: 'Presets & kalender',
    summary: 'Jaarlijks terugkerende fiscale deadlines (peildatum, aangifte, voorlopige aanslag, DGA-leengrens, jaarruimte-inleg, peildatum-planning).',
    jaargelaagd: false,
    years: [],
    valuesByYear: [
      {
        year: null,
        values: TAX_DEADLINES.map((d) => ({
          label: d.label,
          value: `${d.day}-${d.month} (jaarlijks)${d.box != null ? ` · Box ${d.box}` : ''}`,
        })),
      },
    ],
    file: 'lib/tax-calendar.ts',
    exportName: 'TAX_DEADLINES',
    source: 'Belastingdienst',
    updateFrequency: 'jaarlijks',
    lastVerified: '2026-06-15',
    note: 'Data zijn indicatief (bv. aangifte loopt 1 mrt–1 mei; we hanteren 1 mei). Jaarlijks tegen de actuele Belastingdienst-kalender leggen.',
  },
]

// ── Drift-punten ─────────────────────────────────────────────────────────────
// De dubbelingen/verspreidingen van fiscale getallen die het kaart-onderzoek
// vond. Status weerspiegelt de HUIDIGE code — een opgelost punt blijft staan
// als bewijs + regressie-anker tot Fase 2 de structurele oplossing brengt.

export const FISCALE_DRIFT_PUNTEN: DriftPunt[] = [
  {
    id: 'box3-dubbel',
    title: 'Box 3-forfait dubbel gedefinieerd',
    status: 'opgelost',
    description:
      'constants.ts definieerde het Box 3-forfait (5,88%) en tarief (36%) los naast de jaartabel in box3-data.ts (6,00% voor 2026). Opgelost: NL_FICTIEF_BELEGGINGEN en BOX3_TARIEF worden nu afgeleid uit BOX3_PARAMS[CURRENT_TAX_YEAR] — één bron, jaarwissel op één plek.',
    files: ['lib/constants.ts', 'lib/box3-data.ts'],
  },
  {
    id: 'aow-bedrag-dubbel',
    title: 'AOW-maandbedrag dubbel hardcoded',
    status: 'opgelost',
    description:
      'De AOW-bedragen stonden als NL_AOW_MONTHLY(_SAMENWONEND) in constants.ts én los hardcoded in CASHFLOW_CATALOG en de AOW-prefab (defaultMonthlyIncome) in horizon-data.ts (plus in onboarding-horizon.tsx). Opgelost: alle plekken importeren nu de constante en de labels/tips zijn afgeleid; constants.ts is bijgewerkt naar de SVB-bedragen per 1-7-2026 (€1.581,55 / €1.084,13). Bewaakt door lib/fiscale-duplicaten-guard.test.ts.',
    files: ['lib/constants.ts', 'lib/horizon-data.ts'],
  },
  {
    id: 'marginale-tarieven-verspreid',
    title: 'Marginale IB-tarieven & schijfgrens buiten BOX1_PARAMS',
    status: 'opgelost',
    description:
      'De tarieven 36,97%/49,50% en de schijfgrens €75.518 waren 2024-hardcodes in fire-params.ts (deriveMarginaalTarief, IB_SCHIJFGRENS) met losse 0,3697-fallbacks en whitelist-checks door de hele app. Opgelost (Arch F1): het marginale tarief wordt nu per belastingjaar afgeleid uit BOX1_PARAMS via deriveMarginaalTarief/schijfGrensVoor (lib/box1-tax.ts). fire-params.ts delegeert, IB_SCHIJFGRENS is een afgeleide re-export, de /api/parameters-whitelist is vervangen door range-validatie en alle fallbacks/UI-hardcodes (belasting-pagina\'s, horizon-client side-hustle, hypotheek-vs-beleggen, debt/hypotheekplanner) consumeren de helper. Jaarwissel schuift automatisch mee met de beheerpagina (fiscale-kerngetallen ← BOX1_PARAMS).',
    files: ['lib/box1-tax.ts', 'lib/fire-params.ts', 'app/api/parameters/route.ts', 'lib/aandachtspunten-loader.ts', 'lib/dashboard-data-loader.ts'],
  },
]

// ── Jaar-checklist ───────────────────────────────────────────────────────────

/**
 * Bouwt de verificatie-checklist voor een doeljaar (default: het jaar ná het
 * actieve belastingjaar). Jaargelaagde bronnen zonder die jaarlaag én alle
 * jaarlijks-te-verifiëren losse constanten staan "open".
 */
export function buildJaarChecklist(targetYear: number = CURRENT_TAX_YEAR + 1): JaarChecklist {
  const items: JaarChecklistItem[] = FISCALE_KERNGETALLEN
    .filter((k) => k.updateFrequency === 'jaarlijks')
    .map((k) => {
      if (k.jaargelaagd) {
        const hasTargetYear = k.years.includes(targetYear)
        return {
          id: k.id,
          title: k.title,
          file: k.file,
          hasTargetYear,
          note: hasTargetYear
            ? `${targetYear}-laag aanwezig`
            : `${targetYear} nog te verifiëren — jaarlaag toevoegen in ${k.file}`,
        }
      }
      return {
        id: k.id,
        title: k.title,
        file: k.file,
        hasTargetYear: false,
        note: `geen jaarlagen — handmatig verifiëren voor ${targetYear} (laatst: ${k.lastVerified})`,
      }
    })
  return {
    targetYear,
    items,
    openCount: items.filter((i) => !i.hasTargetYear).length,
  }
}

// ── Validatie (spiegel van validateCalculations) ─────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Consistentie-check op de curatie; de vitest-suite dwingt een lege lijst af. */
export function validateFiscaleKerngetallen(): string[] {
  const errors: string[] = []
  const seen = new Set<string>()

  for (const k of FISCALE_KERNGETALLEN) {
    if (seen.has(k.id)) errors.push(`dubbel kerngetal-id: ${k.id}`)
    seen.add(k.id)

    if (!k.title) errors.push(`kerngetal ${k.id} heeft geen titel`)
    if (!k.summary) errors.push(`kerngetal ${k.id} heeft geen samenvatting`)
    if (!/^(lib|app|supabase)\//.test(k.file)) errors.push(`kerngetal ${k.id} heeft geen geldig bronbestand: "${k.file}"`)
    if (!k.exportName) errors.push(`kerngetal ${k.id} heeft geen exportnaam`)
    if (!FISCAL_DOMAINS.includes(k.domain)) errors.push(`kerngetal ${k.id} heeft onbekend domein: ${k.domain}`)

    if (!ISO_DATE.test(k.lastVerified) || Number.isNaN(Date.parse(k.lastVerified))) {
      errors.push(`kerngetal ${k.id} heeft ongeldige lastVerified-datum: "${k.lastVerified}"`)
    }

    if (k.jaargelaagd) {
      if (k.years.length === 0) errors.push(`kerngetal ${k.id} is jaargelaagd maar heeft geen jaren`)
      if (!k.years.includes(CURRENT_TAX_YEAR)) {
        errors.push(`kerngetal ${k.id} mist het actieve belastingjaar ${CURRENT_TAX_YEAR}`)
      }
    } else if (k.years.length > 0) {
      errors.push(`kerngetal ${k.id} is niet jaargelaagd maar heeft wel jaren`)
    }

    if (k.valuesByYear.length === 0) errors.push(`kerngetal ${k.id} heeft geen waarden`)
    const valueYears = k.valuesByYear.map((v) => v.year).filter((y): y is number => y != null)
    for (const y of valueYears) {
      if (!k.years.includes(y)) errors.push(`kerngetal ${k.id} heeft waarden voor jaar ${y} dat niet in years staat`)
    }
    for (const y of k.years) {
      if (!valueYears.includes(y)) errors.push(`kerngetal ${k.id} mist waarden voor jaar ${y}`)
    }
    for (const row of k.valuesByYear) {
      if (row.values.length === 0) errors.push(`kerngetal ${k.id} heeft een lege waardenrij (jaar ${row.year ?? 'vast'})`)
      for (const v of row.values) {
        if (!v.label || !v.value) errors.push(`kerngetal ${k.id} heeft een waarde zonder label of value`)
      }
    }
  }

  const driftSeen = new Set<string>()
  for (const d of FISCALE_DRIFT_PUNTEN) {
    if (driftSeen.has(d.id)) errors.push(`dubbel drift-id: ${d.id}`)
    driftSeen.add(d.id)
    if (!d.title || !d.description) errors.push(`drift-punt ${d.id} mist titel of beschrijving`)
    if (d.files.length === 0) errors.push(`drift-punt ${d.id} heeft geen bestanden`)
    for (const f of d.files) {
      if (!/^(lib|app|supabase)\//.test(f)) errors.push(`drift-punt ${d.id} heeft ongeldig bestandspad: "${f}"`)
    }
  }

  return errors
}
